// Appels à l'API Claude, directement depuis le navigateur avec la clé de l'utilisateur.
const SDK_URL = "./vendor/anthropic-sdk.js"; // SDK officiel @anthropic-ai/sdk, embarqué
const MODEL = "claude-opus-5-5";

let sdkPromise = null;
async function getClient(apiKey) {
  if (!apiKey) throw new Error("Ajoutez votre clé API Claude dans l'onglet Réglages.");
  sdkPromise ??= import(SDK_URL);
  const { default: Anthropic } = await sdkPromise;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

// Requête avec repli automatique côté serveur si le modèle décline la demande.
async function ask(client, params) {
  let messages = params.messages;
  let response;
  // Les outils serveur (recherche web) peuvent mettre le tour en pause : on relance.
  for (let i = 0; i < 5; i++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...params,
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }
  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Réponse illisible de l'IA.");
  return JSON.parse(text.slice(start, end + 1));
}

function friendlyError(err) {
  const status = err?.status;
  if (status === 401) return "Clé API invalide.";
  if (status === 429) return "Trop de requêtes, réessayez dans un instant.";
  if (status >= 500) return "Service IA momentanément indisponible.";
  if (err instanceof TypeError) return "Connexion impossible (êtes-vous hors ligne ?).";
  return err?.message || String(err);
}

const FICHE_FIELDS = `{
  "category": une des catégories proposées (ou "" si aucune ne convient),
  "cuvee": nom de la cuvée (string, "" si absent),
  "domaine": nom du domaine / château / producteur (string),
  "appellation": appellation ou région (string),
  "cepages": cépages, séparés par des virgules (string, déduits de l'appellation si non indiqués),
  "millesime": année de vendanges (nombre) ou null,
  "boireDe": année à partir de laquelle le vin est à boire (nombre) ou null,
  "boireJusqua": année limite de l'apogée (nombre) ou null
}`;

export async function recognizeLabel(apiKey, { base64, mediaType }, categories) {
  try {
    const client = await getClient(apiKey);
    const text = await ask(client, {
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                `Voici la photo d'une étiquette de bouteille (vin ou spiritueux). ` +
                `Catégories possibles : ${categories.join(", ")}.\n` +
                `Réponds uniquement avec un objet JSON de la forme :\n${FICHE_FIELDS}\n` +
                `Pour la fenêtre de dégustation, donne ton estimation d'expert selon l'appellation, le producteur et le millésime ` +
                `(null pour un spiritueux).`,
            },
          ],
        },
      ],
    });
    return extractJson(text);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function estimateWindow(apiKey, wine) {
  try {
    const client = await getClient(apiKey);
    const text = await ask(client, {
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content:
            `Estime la fenêtre de dégustation (apogée) de cette bouteille :\n${describe(wine)}\n` +
            `Réponds uniquement en JSON : {"boireDe": année ou null, "boireJusqua": année ou null}`,
        },
      ],
    });
    return extractJson(text);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

function describe(w) {
  return [
    `Catégorie : ${w.category}`,
    w.cuvee && `Cuvée : ${w.cuvee}`,
    w.domaine && `Domaine : ${w.domaine}`,
    w.appellation && `Appellation : ${w.appellation}`,
    w.cepages && `Cépages : ${w.cepages}`,
    w.millesime && `Millésime : ${w.millesime}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function pairWines(apiKey, meal, cellar, useWeb) {
  try {
    const client = await getClient(apiKey);
    const year = new Date().getFullYear();
    const inventory = cellar
      .map(
        (w) =>
          `- [${w.id}] ${describe(w).replace(/\n/g, " | ")} | Quantité : ${w.quantity}` +
          ` | Maturité (${year}) : ${w.maturityLabel}` +
          (w.boireDe || w.boireJusqua ? ` (à boire ${w.boireDe ?? "?"}–${w.boireJusqua ?? "?"})` : "") +
          (w.commentaire ? ` | Commentaire : ${w.commentaire}` : ""),
      )
      .join("\n");

    const params = {
      output_config: { effort: "medium" },
      system:
        "Tu es un sommelier expert. Tu recommandes uniquement des bouteilles présentes dans la cave de l'utilisateur. " +
        "Réponds en français, en Markdown concis et lisible sur téléphone.",
      messages: [
        {
          role: "user",
          content:
            `Repas prévu : ${meal}\n\nMa cave (année ${year}) :\n${inventory}\n\n` +
            `Analyse chaque fiche et ses commentaires, puis recommande les meilleurs accords pour ce repas (plat par plat si utile). ` +
            `Priorité aux vins dont la maturité est atteinte, et surtout à ceux à boire rapidement ou dont l'apogée est dépassée, ` +
            `tant que l'accord reste bon. Évite les vins trop jeunes sauf s'il n'y a pas d'alternative (et dis-le).\n` +
            `Pour chaque recommandation : rang, nom de la bouteille, pourquoi l'accord fonctionne, état de maturité, ` +
            `température de service et éventuel carafage. Termine par un plan B si la cave manque d'un accord idéal.`,
        },
      ],
    };
    if (useWeb) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
    return await ask(client, params);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

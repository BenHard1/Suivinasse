// Appels IA directement depuis le navigateur, avec la clé de l'utilisateur.
// Deux moteurs au choix : Google Gemini (offre gratuite) ou Claude (payant à l'usage).

export const PROVIDERS = {
  gemini: { label: "Google Gemini", keyHint: "AIza… ou AQ.…" },
  claude: { label: "Claude", keyHint: "sk-ant-…" },
};

// ---------- Claude ----------
const CLAUDE_SDK_URL = "./vendor/anthropic-sdk.js"; // SDK officiel @anthropic-ai/sdk, embarqué
const CLAUDE_MODEL = "claude-opus-5-5";
let sdkPromise = null;

async function claudeComplete(key, { system, text, image, web, effort }) {
  sdkPromise ??= import(CLAUDE_SDK_URL);
  const { default: Anthropic } = await sdkPromise;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }, { type: "text", text }]
    : text;
  let messages = [{ role: "user", content }];
  const params = { output_config: { effort } };
  if (system) params.system = system;
  if (web) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];

  let response;
  // Les outils serveur (recherche web) peuvent mettre le tour en pause : on relance.
  for (let i = 0; i < 5; i++) {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...params,
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }
  if (response.stop_reason === "refusal") throw new Error("La demande a été refusée par le modèle.");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ---------- Gemini ----------
// « gemini-flash-latest » suit automatiquement le dernier modèle Flash (offre gratuite).
// Si un modèle est surchargé (5xx) ou que son quota gratuit est épuisé (429), on essaie le suivant :
// les quotas gratuits sont comptés séparément pour chaque modèle.
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"];
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiCall(key, model, body) {
  const res = await fetch(`${GEMINI_URL}${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Erreur ${res.status}`);
    err.status = res.status;
    err.reason = data.error?.status || data.error?.details?.[0]?.reason;
    throw err;
  }
  return data;
}

async function geminiComplete(key, { system, text, image, json, web }) {
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
  parts.push({ text });
  const body = { contents: [{ role: "user", parts }] };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig = { responseMimeType: "application/json" };
  if (web) body.tools = [{ google_search: {} }];

  let lastErr;
  for (const model of GEMINI_MODELS) {
    let data;
    try {
      data = await geminiCall(key, model, body);
    } catch (err) {
      lastErr = err;
      if (err.status >= 500) {
        // Surcharge passagère : un nouvel essai après une courte pause, puis modèle suivant.
        await sleep(1500);
        try { data = await geminiCall(key, model, body); } catch (err2) { lastErr = err2; }
      }
      if (!data) {
        if (err.status === 404 || err.status === 429 || lastErr.status >= 500) continue;
        throw lastErr;
      }
    }
    const cand = data.candidates?.[0];
    const out = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
    if (!out) {
      if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new Error("La demande a été refusée par le modèle.");
      throw new Error("Réponse vide de l'IA, réessayez.");
    }
    return out;
  }
  throw lastErr || new Error("Modèle Gemini indisponible.");
}

// ---------- Commun ----------
async function complete(ai, req) {
  const name = PROVIDERS[ai?.provider]?.label;
  if (!name) throw new Error("Choisissez un moteur IA dans l'onglet Réglages.");
  if (!ai.key) throw new Error(`Ajoutez votre clé API ${name} dans l'onglet Réglages.`);
  try {
    return ai.provider === "gemini" ? await geminiComplete(ai.key, req) : await claudeComplete(ai.key, req);
  } catch (err) {
    throw new Error(friendlyError(err, name));
  }
}

function friendlyError(err, name) {
  const status = err?.status;
  const msg = err?.message || String(err);
  if (status === 401 || status === 403 || /API_KEY_INVALID|api key not valid/i.test(`${err?.reason} ${msg}`)) {
    return `Clé API ${name} invalide.`;
  }
  if (status === 429) {
    return name === "Google Gemini"
      ? "Quota gratuit Gemini atteint, réessayez dans une minute (ou demain si la limite du jour est atteinte)."
      : "Trop de requêtes, réessayez dans un instant.";
  }
  if (status >= 500) return `Service ${name} surchargé ou indisponible, réessayez dans quelques minutes. (Détail : ${msg})`;
  if (err instanceof TypeError) return "Connexion impossible (êtes-vous hors ligne ?).";
  return msg;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  throw new Error(`Réponse illisible de l'IA : « ${text.slice(0, 120)} »`);
}

// Année plausible depuis un nombre, une chaîne (« 2025 », « vers 2030 ») ou null.
function toYear(v) {
  const m = String(v ?? "").match(/\b(1[89]\d\d|2[01]\d\d)\b/);
  return m ? Number(m[1]) : null;
}

const FICHE_FIELDS = `{
  "category": une des catégories proposées (ou "" si aucune ne convient),
  "cuvee": nom de la cuvée (string, "" si absent),
  "domaine": nom du domaine / château / producteur (string),
  "region": grande région viticole ou d'origine (ex : Bourgogne, Bordeaux, Vallée du Rhône, Loire, Champagne, Douro, Écosse) (string),
  "appellation": appellation (string, "" si absente),
  "cepages": cépages, séparés par des virgules (string, déduits de l'appellation si non indiqués),
  "millesime": année de vendanges (nombre) ou null,
  "boireDe": année à partir de laquelle le vin est à boire (nombre) ou null,
  "boireJusqua": année limite de l'apogée (nombre) ou null
}`;

export async function recognizeLabel(ai, image, categories) {
  const text = await complete(ai, {
    image,
    json: true,
    effort: "low",
    text:
      `Voici la photo d'une étiquette de bouteille (vin ou spiritueux). ` +
      `Catégories possibles : ${categories.join(", ")}.\n` +
      `Réponds uniquement avec un objet JSON de la forme :\n${FICHE_FIELDS}\n` +
      `Pour la fenêtre de dégustation, donne ton estimation d'expert selon l'appellation, le producteur et le millésime ` +
      `(null pour un spiritueux).`,
  });
  return extractJson(text);
}

export async function estimateWindow(ai, wine) {
  const text = await complete(ai, {
    json: true,
    effort: "low",
    text:
      `Estime la fenêtre de dégustation (apogée) de cette bouteille :\n${describe(wine)}\n` +
      `Réponds uniquement avec un objet JSON de la forme {"boireDe": 2025, "boireJusqua": 2035} ` +
      `(années sur 4 chiffres, null si impossible à estimer).`,
  });
  let r;
  try {
    r = extractJson(text);
  } catch (err) {
    // Réponse hors format : on récupère les deux premières années citées.
    const years = text.match(/\b(1[89]\d\d|2[01]\d\d)\b/g);
    if (!years) throw err;
    r = { boireDe: years[0], boireJusqua: years[1] };
  }
  if (Array.isArray(r)) r = r[0] || {};
  const from = r.boireDe ?? r.boire_de ?? r.from ?? r.debut;
  const to = r.boireJusqua ?? r.boire_jusqua ?? r.to ?? r.fin;
  return { boireDe: toYear(from), boireJusqua: toYear(to) };
}

function describe(w) {
  return [
    `Catégorie : ${w.category}`,
    w.cuvee && `Cuvée : ${w.cuvee}`,
    w.domaine && `Domaine : ${w.domaine}`,
    w.region && `Région : ${w.region}`,
    w.appellation && `Appellation : ${w.appellation}`,
    w.cepages && `Cépages : ${w.cepages}`,
    w.millesime && `Millésime : ${w.millesime}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function pairWines(ai, meal, cellar, useWeb) {
  const year = new Date().getFullYear();
  const inventory = cellar
    .map(
      (w) =>
        `- [${w.id}] ${describe(w).replace(/\n/g, " | ")} | Quantité : ${w.quantity}` +
        ` | Maturité (${year}) : ${w.maturityLabel}` +
        ` | Rangement : ${w.auFrais ? "au frais (prête à servir)" : "en carton"}` +
        (w.boireDe || w.boireJusqua ? ` (à boire ${w.boireDe ?? "?"}–${w.boireJusqua ?? "?"})` : "") +
        (w.commentaire ? ` | Commentaire : ${w.commentaire}` : ""),
    )
    .join("\n");

  return complete(ai, {
    effort: "medium",
    web: useWeb,
    system:
      "Tu es un sommelier expert. Tu recommandes uniquement des bouteilles présentes dans la cave de l'utilisateur. " +
      "Réponds en français, en Markdown concis et lisible sur téléphone.",
    text:
      `Repas prévu : ${meal}\n\nMa cave (année ${year}) :\n${inventory}\n\n` +
      `Analyse chaque fiche et ses commentaires, puis recommande les meilleurs accords pour ce repas (plat par plat si utile). ` +
      `Priorité aux vins dont la maturité est atteinte, et surtout à ceux à boire rapidement ou dont l'apogée est dépassée, ` +
      `tant que l'accord reste bon. Évite les vins trop jeunes sauf s'il n'y a pas d'alternative (et dis-le).\n` +
      `Pour chaque recommandation : rang, nom de la bouteille, pourquoi l'accord fonctionne, état de maturité, ` +
      `température de service et éventuel carafage. Termine par un plan B si la cave manque d'un accord idéal.`,
  });
}

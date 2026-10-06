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

async function claudeComplete(key, { system, text, image, web, effort, timeout = 120000 }) {
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
    }, { timeout, maxRetries: 1 });
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }
  if (response.stop_reason === "refusal") throw new Error("La demande a été refusée par le modèle.");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ---------- Gemini ----------
// Modèles essayés dans l'ordre. Google retire régulièrement d'anciens modèles (« no longer available
// to new users ») : un modèle indisponible, surchargé (5xx) ou dont le quota gratuit est épuisé (429,
// compté par modèle) fait passer au suivant. Le dernier modèle qui a fonctionné est essayé en premier,
// et si tous échouent, la liste des modèles réellement proposés à la clé est consultée.
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_LAST = "macave.gemini.model";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiCall(key, model, body, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name !== "AbortError") throw err;
    const e = new Error("L'IA met trop de temps à répondre.");
    e.status = 408;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Erreur ${res.status}`);
    err.status = res.status;
    err.reason = data.error?.status || data.error?.details?.[0]?.reason;
    throw err;
  }
  return data;
}

const isKeyError = (err) =>
  err.status === 401 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED.*key/i.test(`${err.reason} ${err.message}`);

// Modèles « flash » de génération de texte proposés à cette clé, du plus récent au plus ancien.
async function discoverModels(key) {
  try {
    const res = await fetch(`${GEMINI_URL}?pageSize=200`, { headers: { "x-goog-api-key": key } });
    const data = await res.json();
    const version = (n) => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || "0");
    return (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embedding|thinking-exp/.test(n))
      .sort((a, b) => version(b) - version(a) || /lite/.test(a) - /lite/.test(b));
  } catch {
    return [];
  }
}

function readLast() {
  try { return localStorage.getItem(GEMINI_LAST); } catch { return null; }
}

// Réflexion réduite pour les modèles Gemini 3 (réponse plus rapide) quand la tâche est simple.
const thinkingFor = (model, effort) =>
  /^gemini-3/.test(model) && effort !== "high" ? { thinkingConfig: { thinkingLevel: "low" } } : null;

async function geminiComplete(key, { system, text, image, json, web, effort, timeout = 90000 }) {
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
  parts.push({ text });
  const body = { contents: [{ role: "user", parts }] };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  // Le format JSON forcé n'est pas compatible avec la recherche Google sur tous les modèles.
  const baseConfig = json && !web ? { responseMimeType: "application/json" } : {};
  if (web) body.tools = [{ google_search: {} }];
  const deadline = Date.now() + timeout;
  const bodyFor = (model, withThinking = true) => {
    const generationConfig = { ...baseConfig, ...(withThinking ? thinkingFor(model, effort) : null) };
    return Object.keys(generationConfig).length ? { ...body, generationConfig } : body;
  };
  const call = async (model) => {
    const left = deadline - Date.now();
    if (left < 3000) {
      const e = new Error("L'IA met trop de temps à répondre.");
      e.status = 408;
      throw e;
    }
    try {
      return await geminiCall(key, model, bodyFor(model), Math.min(left, 45000));
    } catch (err) {
      // Paramètre de réflexion refusé par ce modèle : nouvel essai sans.
      if (err.status === 400 && /thinking/i.test(err.message)) return geminiCall(key, model, bodyFor(model, false), Math.min(deadline - Date.now(), 45000));
      throw err;
    }
  };

  const tried = new Set();
  const errors = [];
  let queue = [...new Set([readLast(), ...GEMINI_MODELS].filter(Boolean))];
  let discovered = false;

  while ((queue.length || !discovered) && deadline - Date.now() > 3000) {
    if (!queue.length) {
      discovered = true;
      queue = (await discoverModels(key)).filter((m) => !tried.has(m)).slice(0, 4);
      continue;
    }
    const model = queue.shift();
    tried.add(model);
    let data;
    try {
      data = await call(model);
    } catch (err) {
      if (isKeyError(err)) throw err;
      if (err.status === 408) throw err; // délai dépassé : inutile d'enchaîner d'autres modèles
      let last = err;
      if (err.status >= 500) {
        // Surcharge passagère : un nouvel essai après une courte pause.
        await sleep(1500);
        try { data = await call(model); } catch (err2) { last = err2; }
      }
      if (!data) {
        errors.push({ model, err: last });
        continue;
      }
    }
    const cand = data.candidates?.[0];
    const out = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
    if (!out) {
      if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new Error("La demande a été refusée par le modèle.");
      throw new Error("Réponse vide de l'IA, réessayez.");
    }
    try { localStorage.setItem(GEMINI_LAST, model); } catch {}
    return out;
  }

  // Aucun modèle n'a répondu : on remonte l'erreur la plus parlante.
  if (readLast() && tried.has(readLast())) { try { localStorage.removeItem(GEMINI_LAST); } catch {} }
  const pick = errors.find((e) => e.err.status === 429) || errors.find((e) => e.err.status >= 500) || errors[0];
  if (!pick) throw new Error("Aucun modèle Gemini disponible pour cette clé.");
  const err = new Error(`${pick.err.message} (modèles essayés : ${[...tried].join(", ")})`);
  err.status = pick.err.status;
  err.reason = pick.err.reason;
  throw err;
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
  if (status === 408) return "L'IA met trop de temps à répondre. Réessayez, idéalement sans la recherche internet.";
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

// Accord mets-vins : réponse courte et structurée (3 bouteilles maximum) pour aller vite.
// `cellar` est déjà présélectionné par l'application ; chaque vin est désigné par son numéro.
export async function pairWines(ai, meal, cellar, useWeb) {
  const year = new Date().getFullYear();
  const inventory = cellar
    .map(
      (w, i) =>
        `#${i + 1} ${describe(w).replace(/\n/g, " | ")} | ${w.maturityLabel}` +
        (w.auFrais ? " | au frais" : "") +
        (w.commentaire ? ` | Note : ${w.commentaire.slice(0, 160)}` : ""),
    )
    .join("\n");

  const req = {
    effort: "low",
    json: true,
    timeout: useWeb ? 60000 : 50000,
    system: "Tu es un sommelier expert, concis. Tu choisis uniquement parmi les bouteilles listées.",
    text:
      `Repas : ${meal}\nAnnée : ${year}\n\nBouteilles disponibles :\n${inventory}\n\n` +
      `Choisis les 3 meilleurs accords au maximum (moins si la cave ne s'y prête pas). À accord comparable, ` +
      `privilégie les vins à boire rapidement ou à maturité plutôt que les vins trop jeunes.\n` +
      `Réponds uniquement avec ce JSON :\n` +
      `{"recommandations":[{"n":numéro de la bouteille,"plat":"plat concerné si plusieurs plats, sinon \"\"",` +
      `"pourquoi":"une ou deux phrases","service":"température et carafage, très court"}],` +
      `"conseil":"une phrase : remarque ou plan B si l'accord idéal manque dans la cave"}`,
  };

  let text;
  let note = "";
  if (!useWeb) {
    text = await complete(ai, req);
  } else {
    try {
      text = await complete(ai, { ...req, web: true });
    } catch (err) {
      // Recherche internet refusée ou trop lente : nouvelle demande sans elle.
      if (/invalide|hors ligne/i.test(err.message)) throw err;
      text = await complete(ai, { ...req, web: false, timeout: 40000 });
      note = `Recherche internet indisponible (${err.message}) : recommandations établies sans elle.`;
    }
  }

  let data;
  try {
    data = extractJson(text);
  } catch {
    return { recommandations: [], conseil: "", texte: text, note };
  }
  const recommandations = (Array.isArray(data.recommandations) ? data.recommandations : [])
    .map((r) => ({ ...r, wine: cellar[Number(r.n) - 1] }))
    .filter((r) => r.wine)
    .slice(0, 3);
  return { recommandations, conseil: String(data.conseil || ""), note };
}

// Accords rapides sans IA : le repas est analysé par mots-clés, chaque vin reçoit un profil
// (rouge léger / corsé, blanc vif / ample / aromatique, liquoreux…) et le classement tient
// compte de la maturité. Sert de réponse immédiate et de présélection pour l'IA.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const has = (text, words) => words.some((w) => text.includes(w));

export const PROFILE_LABELS = {
  rougeLeger: "Rouge léger", rougeMoyen: "Rouge", rougeCorse: "Rouge corsé",
  blancVif: "Blanc vif", blancAmple: "Blanc ample", blancAromatique: "Blanc aromatique",
  liquoreux: "Liquoreux", rose: "Rosé", bulles: "Effervescent", porto: "Porto / muté", spiritueux: "Spiritueux",
};

// Profils d'un vin, déduits de la catégorie, des cépages, de la région et de l'appellation.
export function profilesOf(w, kind) {
  const t = norm([w.cepages, w.region, w.appellation, w.cuvee, w.domaine, w.commentaire].join(" "));
  const cat = norm(w.category);
  if (kind === "spiritueux") return ["spiritueux"];
  if (cat.includes("champagne") || has(t, ["cremant", "petillant", "mousseux", "brut", "blanquette"])) return ["bulles"];
  if (cat.includes("porto") || has(t, ["porto", "banyuls", "maury", "rivesaltes", "vin doux naturel", "pineau"])) return ["porto"];
  if (cat.includes("rose")) return ["rose"];
  if (has(t, ["sauternes", "barsac", "monbazillac", "loupiac", "layon", "bonnezeaux", "quarts de chaume", "vendanges tardives", "grains nobles", "liquoreux", "moelleux", "vin de paille", "tokaj"])) return ["liquoreux"];
  if (cat.includes("blanc")) {
    const p = [];
    if (has(t, ["gewurz", "muscat", "riesling", "viognier", "condrieu", "pinot gris", "torrontes", "alsace"])) p.push("blancAromatique");
    if (has(t, ["sauvignon", "chablis", "muscadet", "melon", "picpoul", "sancerre", "pouilly-fume", "jacquere", "chenin", "aligote", "entre-deux-mers", "albarino", "vermentin"])) p.push("blancVif");
    if (has(t, ["chardonnay", "meursault", "montrachet", "marsanne", "roussanne", "semillon", "hermitage", "chateauneuf", "savagnin", "jura", "pessac", "graves", "bourgogne"])) p.push("blancAmple");
    return p.length ? p : ["blancVif", "blancAmple"];
  }
  if (cat.includes("rouge")) {
    const p = [];
    if (has(t, ["pinot noir", "gamay", "beaujolais", "morgon", "fleurie", "brouilly", "poulsard", "trousseau", "cabernet franc", "chinon", "bourgueil", "saumur", "bourgogne", "volnay", "beaune", "grolleau", "mondeuse"])) p.push("rougeLeger");
    if (has(t, ["cabernet sauvignon", "syrah", "malbec", "cahors", "tannat", "madiran", "mourvedre", "bandol", "pauillac", "saint-estephe", "medoc", "hermitage", "cornas", "cote-rotie", "chateauneuf", "bordeaux", "rhone", "languedoc", "roussillon", "priorat", "barolo"])) p.push("rougeCorse");
    if (has(t, ["merlot", "grenache", "pomerol", "saint-emilion", "cotes du rhone", "carignan", "cinsault", "sangiovese", "tempranillo"])) p.push("rougeMoyen");
    return p.length ? p : ["rougeMoyen"];
  }
  return ["rougeMoyen", "blancAmple"];
}

// Mots-clés du repas → profils recherchés (poids 1 à 3).
const RULES = [
  [["boeuf", "entrecote", "cote de boeuf", "steak", "agneau", "gigot", "gibier", "chevreuil", "sanglier", "biche", "daube", "bourguignon", "civet", "magret", "barbecue", "grillade", "cassoulet", "confit"],
    { rougeCorse: 3, rougeMoyen: 2, rougeLeger: 1 }],
  [["volaille", "poulet", "dinde", "pintade", "chapon", "caille", "veau", "porc", "lapin", "charcuterie", "pate", "terrine", "jambon", "saucisse", "quiche", "tourte"],
    { rougeLeger: 3, rougeMoyen: 2, blancAmple: 2, rose: 1 }],
  [["canard"], { rougeMoyen: 3, rougeCorse: 2, rougeLeger: 2 }],
  [["poisson", "saumon", "cabillaud", "bar ", "loup", "dorade", "sole", "truite", "thon", "lotte", "turbot", "colin", "merlu", "bouillabaisse"],
    { blancVif: 3, blancAmple: 2, bulles: 1, rose: 1 }],
  [["saumon", "thon"], { rougeLeger: 1 }],
  [["huitre", "fruits de mer", "crustace", "coquillage", "moule", "crevette", "bulot", "palourde", "sushi", "ceviche"],
    { blancVif: 3, bulles: 3, blancAmple: 1 }],
  [["homard", "langouste", "saint-jacques", "st jacques", "langoustine", "beurre blanc", "creme"],
    { blancAmple: 3, bulles: 2, blancVif: 1 }],
  [["fromage"], { rougeLeger: 2, blancAmple: 2, blancVif: 1 }],
  [["chevre", "crottin", "sainte-maure"], { blancVif: 3 }],
  [["comte", "beaufort", "gruyere", "mont d'or", "raclette", "fondue", "tartiflette"], { blancAmple: 3, blancVif: 2 }],
  [["roquefort", "bleu", "fourme", "gorgonzola", "stilton"], { liquoreux: 3, porto: 3 }],
  [["epice", "curry", "asiatique", "thai", "indien", "tajine", "couscous", "wok", "chinois", "japonais", "mexicain"],
    { blancAromatique: 3, rose: 2, rougeMoyen: 1 }],
  [["pizza", "pates", "lasagne", "tomate", "italien", "ratatouille", "mediterraneen", "provencal", "paella", "tapas"],
    { rougeMoyen: 2, rose: 2, rougeLeger: 1 }],
  [["salade", "apero", "aperitif", "entree", "amuse", "toast", "brunch", "ete", "barbecue de legumes"],
    { bulles: 3, rose: 2, blancVif: 2 }],
  [["champignon", "truffe", "cepe", "morille", "risotto"], { rougeLeger: 2, blancAmple: 2 }],
  [["foie gras"], { liquoreux: 3, blancAromatique: 2, bulles: 1 }],
  [["chocolat", "fondant", "brownie", "tiramisu"], { porto: 3, liquoreux: 1, spiritueux: 1 }],
  [["dessert", "tarte", "fruit", "gateau", "creme brulee", "patisserie", "crumble", "sorbet"], { liquoreux: 3, bulles: 2, porto: 1 }],
  [["digestif", "cafe", "cigare", "fin de soiree"], { spiritueux: 3, porto: 2 }],
];
const DEFAULT_WANT = { rougeMoyen: 1, blancAmple: 1, bulles: 1 };

export function wantedProfiles(meal) {
  const m = ` ${norm(meal)} `;
  const want = {};
  for (const [words, weights] of RULES) {
    if (!has(m, words)) continue;
    for (const [p, w] of Object.entries(weights)) want[p] = Math.max(want[p] || 0, w);
  }
  return Object.keys(want).length ? want : DEFAULT_WANT;
}

// Un vin trop jeune passe derrière un vin à maturité un cran moins adapté (écart de 10 par cran).
const MATURITY_BONUS = { past: 4, urgent: 3, ready: 2, unknown: 1, spirit: 1, young: -12 };

// Classe toutes les bouteilles disponibles pour le repas, de la plus pertinente à la moins pertinente.
export function rankForMeal(meal, wines, { maturity, kindOf }) {
  const want = wantedProfiles(meal);
  return wines
    .map((w) => {
      const profiles = profilesOf(w, kindOf(w));
      const best = profiles.reduce((b, p) => ((want[p] || 0) > (want[b] || 0) ? p : b), profiles[0]);
      const fit = want[best] || 0;
      const m = maturity(w);
      const score = fit * 10 + (MATURITY_BONUS[m.status] ?? 0) + (w.auFrais ? 0.5 : 0);
      return { wine: w, fit, profile: best, maturity: m, score };
    })
    .sort((a, b) => b.score - a.score);
}

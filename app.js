import { recognizeLabel, estimateWindow, pairWines, tastingSheet, findProducerSite, PROVIDERS } from "./ai.js";
import * as store from "./storage.js";
import { putPhoto, photoUrl, deletePhotos, syncPhotos, onPhotoError } from "./photos.js";
import { rankForMeal, PROFILE_LABELS } from "./pairing.js";
import { findReference, referenceWindow, APPELLATIONS, COLOR_LABELS } from "./vins.js";

// ---------- Stockage ----------
const PROVIDER_KEY = "macave.provider";
const KEY_STORE = { claude: "macave.apikey", gemini: "macave.key.gemini" };

const DEFAULT_CATEGORIES = [
  { name: "Rouge", kind: "vin", color: "#8e1b2f" },
  { name: "Blanc", kind: "vin", color: "#e3c565" },
  { name: "Rosé", kind: "vin", color: "#f19bb0" },
  { name: "Champagne", kind: "vin", color: "#d8b45a" },
  { name: "Porto", kind: "vin", color: "#5e1f2e" },
  { name: "Whiskey", kind: "spiritueux", color: "#b0702a" },
  { name: "Rhum", kind: "spiritueux", color: "#7a4a1f" },
  { name: "Absinthe", kind: "spiritueux", color: "#6fae4a" },
];
const EXTRA_COLORS = ["#4f6d8f", "#8b6bb3", "#3f8f7f", "#a0522d", "#708090", "#c06c84"];

// Fenêtre par défaut (années après le millésime) si non renseignée.
const DEFAULT_WINDOWS = {
  Rouge: [3, 12],
  Blanc: [1, 6],
  "Rosé": [0, 2],
  Champagne: [2, 10],
  Porto: [5, 40],
};

const defaultState = () => ({ wines: [], categories: structuredClone(DEFAULT_CATEGORIES) });
let state = defaultState();
const save = () => {
  try { store.save(state); } catch (err) { toast(err.message); }
};
// Réglages IA : dans le compte si connecté, sinon sur ce téléphone.
function localAi() {
  return {
    provider: localStorage.getItem(PROVIDER_KEY) || "",
    keys: { gemini: localStorage.getItem(KEY_STORE.gemini) || "", claude: localStorage.getItem(KEY_STORE.claude) || "" },
  };
}
function aiSettings() {
  const s = store.currentUser() ? store.accountAi() : localAi();
  return { provider: s?.provider || "", keys: { gemini: "", claude: "", ...s?.keys } };
}
const keyFor = (p) => aiSettings().keys[p] || "";
// Gemini par défaut, sauf si seule une clé Claude est enregistrée.
const provider = () => aiSettings().provider || (keyFor("claude") && !keyFor("gemini") ? "claude" : "gemini");
const aiConfig = () => ({ provider: provider(), key: keyFor(provider()) });

async function saveAi(ai) {
  if (store.currentUser()) return store.saveAccountAi(ai);
  localStorage.setItem(PROVIDER_KEY, ai.provider);
  for (const p of Object.keys(KEY_STORE)) localStorage.setItem(KEY_STORE[p], ai.keys[p] || "");
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const catOf = (name) => state.categories.find((c) => c.name === name);
const isSpirit = (w) => catOf(w.category)?.kind === "spiritueux";

// ---------- Maturité ----------
// Ordre : dates saisies sur la fiche, puis référentiel des appellations (vins.js), puis règle par
// catégorie à partir du millésime.
const entryYear = (w) => (w.createdAt ? new Date(w.createdAt).getFullYear() : new Date().getFullYear());
function windowOf(w) {
  if (w.boireDe || w.boireJusqua) {
    return [w.boireDe || w.millesime || null, w.boireJusqua || null];
  }
  const ref = referenceWindow(w, entryYear(w));
  if (ref) return [ref.de, ref.ja];
  if (!w.millesime) return [null, null];
  const [a, b] = DEFAULT_WINDOWS[w.category] || [2, 8];
  return [w.millesime + a, w.millesime + b];
}

// status : spirit | unknown | young | ready | urgent | past
function maturity(w) {
  const year = new Date().getFullYear();
  if (isSpirit(w)) return { status: "spirit", label: "Prêt à déguster", cls: "b-spirit" };
  const [from, to] = windowOf(w);
  if (!from && !to) return { status: "unknown", label: "Maturité inconnue", cls: "b-young" };
  if (from && year < from) return { status: "young", label: `Trop jeune · à partir de ${from}`, cls: "b-young", to };
  if (to && year > to) return { status: "past", label: `Apogée dépassée (${to}) · à boire au plus vite`, cls: "b-past", to };
  if (to && to - year <= 1) return { status: "urgent", label: `À boire rapidement · jusqu'à ${to}`, cls: "b-urgent", to };
  return { status: "ready", label: to ? `À maturité · jusqu'à ${to}` : "À maturité", cls: "b-ready", to };
}

// ---------- Utilitaires UI ----------
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let toastTimer;
function toast(msg, action) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.hidden = true; };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

function wineTitle(w) {
  return [w.cuvee, w.domaine].filter(Boolean).join(" — ") || w.appellation || "Sans nom";
}

// ---------- Durée des appels IA ----------
// Estimation du temps restant : durée moyenne des derniers appels du même type sur cet appareil
// (par moteur), ou valeur par défaut tant qu'il n'y en a pas eu.
const AI_TIMES_KEY = "macave.aiTimes";
const AI_DEFAULT_S = { label: 12, window: 8, tasting: 45, pairing: 20, pairingWeb: 35, site: 15 };

function aiTimes() {
  try { return JSON.parse(localStorage.getItem(AI_TIMES_KEY)) || {}; } catch { return {}; }
}
const aiTimeKey = (task) => `${aiConfig().provider || "?"}:${task}`;
function aiEstimate(task) {
  return aiTimes()[aiTimeKey(task)] || AI_DEFAULT_S[task] * 1000;
}

// Démarre le chronomètre d'un appel ; done() enregistre sa durée (appels réussis seulement).
function aiTimer(task) {
  const start = Date.now();
  return {
    task,
    start,
    est: aiEstimate(task),
    done() {
      const t = aiTimes();
      const k = aiTimeKey(task);
      const ms = Date.now() - start;
      t[k] = t[k] ? Math.round(t[k] * 0.6 + ms * 0.4) : ms; // moyenne glissante
      try { localStorage.setItem(AI_TIMES_KEY, JSON.stringify(t)); } catch {}
    },
  };
}

function formatSeconds(s) {
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

// Mise à jour de toutes les barres de progression affichées.
function tickProgress() {
  document.querySelectorAll(".ai-progress").forEach((el) => {
    const t = Date.now() - +el.dataset.start;
    const est = +el.dataset.est;
    // Avance régulière jusqu'à 90 % à l'heure prévue, puis ralentit sans jamais atteindre 100 %.
    const p = t < est ? 0.9 * (t / est) : 0.9 + 0.09 * (1 - Math.exp(-(t - est) / est));
    el.querySelector(".ai-bar span").style.width = `${(p * 100).toFixed(1)}%`;
    el.querySelector(".ai-eta").textContent = t < est
      ? `Environ ${formatSeconds(Math.ceil((est - t) / 1000))} restantes`
      : `Plus long que prévu… encore quelques instants (${formatSeconds(Math.round(t / 1000))} écoulées)`;
  });
}
setInterval(tickProgress, 250);

// Verre de vin qui se remplit, affiché pendant les appels à l'IA (avec barre et temps restant si timer).
function wineLoader(text, timer) {
  const bowl = "M15 6h34c1 12 1 24-4 32-3 5-8 8-13 8s-10-3-13-8C14 30 14 18 15 6Z";
  return `<div class="wine-loader" role="status">
    <svg viewBox="0 0 64 96" aria-hidden="true">
      <defs><clipPath id="wl-bowl"><path d="${bowl}"/></clipPath></defs>
      <g clip-path="url(#wl-bowl)">
        <g class="wl-level">
          <path class="wl-wave" d="M-64 4q8-4 16 0t16 0 16 0 16 0 16 0 16 0 16 0 16 0V80H-64Z"/>
        </g>
      </g>
      <path class="wl-glass" d="${bowl}M32 46v34M20 82h24"/>
      <path class="wl-shine" d="M21 12c-1 8-1 15 1 21"/>
    </svg>
    <p>${esc(text)}</p>
    ${timer ? `<div class="ai-progress" data-start="${timer.start}" data-est="${timer.est}">
      <div class="ai-bar" role="progressbar" aria-label="Progression estimée"><span></span></div>
      <p class="ai-eta"></p>
    </div>` : ""}
  </div>`;
}

// Affiche le chargement avec progression dans `el` et lance le chronomètre.
function showAiLoader(el, text, task) {
  const timer = aiTimer(task);
  el.innerHTML = wineLoader(text, timer);
  tickProgress();
  return timer;
}

// Pas de zoom par pincement de la page (Safari iOS ignore user-scalable=no) : l'interface reste figée.
// La visionneuse de photos a son propre zoom (appui sur la photo).
for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

// Clavier : pendant la saisie, la barre du bas et le bouton + sont masqués (le clavier les couvre),
// et à la fermeture la page est remise en place. Sur iPhone, Safari fait défiler toute la page pour
// montrer un champ situé bas à l'écran et ne la ramène pas toujours : la barre restait décalée.
const isTextField = (el) => el?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select");
const resetPageScroll = () => {
  if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
};
document.addEventListener("focusin", (e) => {
  if (isTextField(e.target)) document.documentElement.classList.add("kbd-open");
});
document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (isTextField(document.activeElement)) return; // passage direct à un autre champ
    document.documentElement.classList.remove("kbd-open");
    resetPageScroll();
  }, 60);
});
window.visualViewport?.addEventListener("resize", () => {
  if (!document.documentElement.classList.contains("kbd-open")) resetPageScroll();
});
window.addEventListener("scroll", () => {
  if (!document.documentElement.classList.contains("kbd-open")) resetPageScroll();
});

// iPhone, appli installée : réglages propres à ce mode (voir styles.css, ios-standalone).
if (navigator.standalone === true) document.documentElement.classList.add("ios-standalone");

// En-tête réduit (icône seule) dès que l'on fait défiler la page.
const topbar = document.querySelector(".topbar");
let compact = false;
const scroller = document.getElementById("scroller");
scroller.addEventListener("scroll", () => {
  const y = scroller.scrollTop;
  // Seuils différents à l'aller et au retour pour éviter le clignotement.
  if (!compact && y > 40) topbar.classList.add("compact"), (compact = true);
  else if (compact && y < 8) topbar.classList.remove("compact"), (compact = false);
}, { passive: true });

// ---------- Navigation ----------
const TITLES = { cave: "Ma cave", add: "Ajouter", maturity: "À maturité", pairing: "Accords mets & vins", terroir: "Cépages & terroirs", settings: "Réglages", producers: "Vignerons" };
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  // La fiche d'ajout / modification dépend de la cave : l'onglet Cave reste mis en avant.
  const tab = view === "add" ? "cave" : view;
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === tab));
  $("#btn-settings").classList.toggle("active", view === "settings");
  $("#total-count").hidden = tab !== "cave";
  $("#fab-add").hidden = view !== "cave";
  $("#btn-back").hidden = view !== "add";
  $("#view-title").textContent = view === "add" && $("#wine-form").id.value ? "Modifier la fiche" : TITLES[view];
  if (view === "add" && !$("#wine-form").id.value) resetForm();
  render();
  scroller.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => show(b.dataset.view)));
$("#btn-settings").onclick = () => show("settings");
$("#fab-add").onclick = () => {
  $("#wine-form").id.value = "";
  show("add");
};

// ---------- Cave ----------
let activeCat = "Toutes";
let activeStore = "all"; // all | frais | carton
let activePlace = "all"; // all | none | id d'un lieu de rangement

const REGIONS = [
  "Alsace", "Beaujolais", "Bordeaux", "Bourgogne", "Champagne", "Corse", "Jura", "Languedoc", "Loire",
  "Provence", "Roussillon", "Savoie", "Sud-Ouest", "Vallée du Rhône", "Cognac", "Armagnac",
  "Douro", "Espagne", "Italie", "Allemagne", "Écosse", "Irlande", "Japon", "États-Unis", "Caraïbes",
];
const NO_REGION = "Région non précisée";
const regionOf = (w) => (w.region || "").trim() || NO_REGION;
const bottles = (list) => list.reduce((n, w) => n + (w.quantity || 0), 0);

function chipsHtml(items, active, attr) {
  return items
    .map(([key, label, n]) => `<button class="chip ${key === active ? "active" : ""}" data-${attr}="${esc(key)}">${esc(label)}${n ? ` · ${n}` : ""}</button>`)
    .join("");
}

function renderCave() {
  const showEmpty = $("#show-empty").checked;
  const total = bottles(state.wines);
  const countEl = $("#total-count");
  countEl.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4v4.5c0 .8.4 1.5 1 2 1.3 1 2 2.4 2 4V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7.5c0-1.6.7-3 2-4 .6-.5 1-1.2 1-2Z"/></svg>${total}`;
  countEl.title = countEl.ariaLabel = `${total} bouteille${total > 1 ? "s" : ""} en cave`;

  const byCat = (c) => bottles(state.wines.filter((w) => w.category === c));
  $("#cat-filter").innerHTML = chipsHtml(
    [["Toutes", "Toutes", 0], ...state.categories.map((c) => [c.name, c.name, byCat(c.name)])], activeCat, "cat");
  $("#cat-filter").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { activeCat = c.dataset.cat; renderCave(); }));

  const inCat = state.wines.filter((w) => activeCat === "Toutes" || w.category === activeCat);
  $("#store-filter").innerHTML = chipsHtml([
    ["all", "Tout", 0],
    ["frais", "Au frais", bottles(inCat.filter((w) => w.auFrais))],
    ["carton", "En carton", bottles(inCat.filter((w) => !w.auFrais))],
  ], activeStore, "store");
  $("#store-filter").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { activeStore = c.dataset.store; renderCave(); }));

  // Lieux de rangement (définis dans Réglages) : un filtre de plus s'il y en a.
  const places = state.locations || [];
  if (activePlace !== "all" && activePlace !== "none" && !placeOf(activePlace)) activePlace = "all";
  $("#place-filter").innerHTML = places.length ? chipsHtml([
    ["all", "Tous les lieux", 0],
    ...places.map((p) => [p.id, p.name, bottles(inCat.filter((w) => w.lieu === p.id))]),
    ["none", "Lieu non précisé", bottles(inCat.filter((w) => !placeOf(w.lieu)))],
  ], activePlace, "place") : "";
  $("#place-filter").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { activePlace = c.dataset.place; renderCave(); }));

  const terms = norm($("#cave-search").value).split(/\s+/).filter(Boolean);
  const list = inCat.filter((w) => {
    if (terms.length) {
      const text = norm([w.cuvee, w.domaine, w.region, w.appellation, w.cepages, w.millesime, w.category, w.commentaire, placeOf(w.lieu)?.name].join(" "));
      if (!terms.every((t) => text.includes(t))) return false;
    }
    if (!showEmpty && !w.quantity) return false;
    if (activeStore === "frais" && !w.auFrais) return false;
    if (activeStore === "carton" && w.auFrais) return false;
    if (activePlace === "none" && placeOf(w.lieu)) return false;
    if (activePlace !== "all" && activePlace !== "none" && w.lieu !== activePlace) return false;
    return true;
  });

  updateFiltersBadge();
  const el = $("#cave-list");
  if (!list.length) {
    el.innerHTML = state.wines.length
      ? `<p class="empty-state">Aucune bouteille ne correspond.</p>`
      : `<p class="empty-state">Votre cave est vide.<br>Touchez le bouton <b>+</b> pour rentrer vos premières bouteilles.</p>`;
    return;
  }

  // Tri par couleur (catégorie), puis par région, puis par nom.
  const order = state.categories.map((c) => c.name);
  const groups = {};
  list.forEach((w) => (groups[w.category] ??= []).push(w));
  const byRegion = (a, b) => (a === NO_REGION) - (b === NO_REGION) || a.localeCompare(b, "fr");
  el.innerHTML = Object.keys(groups)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((cat) => {
      const regions = {};
      groups[cat].forEach((w) => (regions[regionOf(w)] ??= []).push(w));
      const body = Object.keys(regions).sort(byRegion).map((r) => {
        const items = regions[r].sort((a, b) => wineTitle(a).localeCompare(wineTitle(b), "fr"));
        return `<h4 class="region"><span>${esc(r)}</span><span>${bottles(items)}</span></h4>${items.map(cardHtml).join("")}`;
      }).join("");
      return `<div class="cat-group"><h3><span><span class="dot" style="background:${esc(catOf(cat)?.color || "#999")}"></span>${esc(cat)}</span><span>${bottles(groups[cat])}</span></h3>${body}</div>`;
    })
    .join("");
  bindCards(el);
}

const ICON_PIN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const ICON_SNOW = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>';
const ICON_BOX = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>';

function cardHtml(w) {
  const m = maturity(w);
  const sub = [w.appellation, w.millesime, w.cepages].filter(Boolean).join(" · ");
  return `<div class="card ${w.quantity ? "" : "empty"}" data-id="${w.id}">
    ${photosOf(w).length ? `<button class="thumb-btn" data-photos aria-label="Voir les photos"><img class="thumb" src="${photosOf(w)[0].thumb}" alt="">${photosOf(w).length > 1 ? `<span class="thumb-count">${photosOf(w).length}</span>` : ""}</button>` : ""}
    <div class="info" data-edit>
      <div class="title">${esc(wineTitle(w))}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
      <span class="badge ${m.cls}">${esc(m.label)}</span>
      <button class="store-pill ${w.auFrais ? "frais" : ""}" data-store-toggle title="Changer le rangement">${w.auFrais ? ICON_SNOW + "Au frais" : ICON_BOX + "En carton"}</button>
      ${placeOf(w.lieu) ? `<span class="place-pill" title="Lieu de rangement">${ICON_PIN}${esc(placeOf(w.lieu).name)}</span>` : ""}
      ${w.commentaire ? `<div class="comment">${esc(w.commentaire)}</div>` : ""}
    </div>
    <div class="qty">
      <button class="plus" aria-label="Ajouter une bouteille">+</button>
      <span class="n">${w.quantity || 0}</span>
      <button class="minus" aria-label="Retirer une bouteille" ${w.quantity ? "" : "disabled"}>−</button>
    </div>
  </div>`;
}

function bindCards(root) {
  root.querySelectorAll(".card").forEach((card) => {
    const w = state.wines.find((x) => x.id === card.dataset.id);
    card.querySelector("[data-edit]").onclick = (e) => {
      if (e.target.closest("[data-store-toggle]")) return;
      editWine(w.id);
    };
    card.querySelector("[data-store-toggle]").onclick = () => {
      w.auFrais = !w.auFrais;
      save();
      render();
      toast(`${wineTitle(w)} : ${w.auFrais ? "au frais" : "en carton"}`);
    };
    const photosBtn = card.querySelector("[data-photos]");
    if (photosBtn) photosBtn.onclick = () => openViewer(photosOf(w), 0);
    card.querySelector(".plus").onclick = () => changeQty(w, +1);
    card.querySelector(".minus").onclick = () => {
      changeQty(w, -1);
      toast(`1 bouteille retirée : ${wineTitle(w)}`, { label: "Annuler", fn: () => changeQty(w, +1, true) });
    };
  });
}

function changeQty(w, delta, undo = false) {
  w.quantity = Math.max(0, (w.quantity || 0) + delta);
  w.history ??= [];
  if (undo) w.history.pop();
  else w.history.push({ date: new Date().toISOString(), delta });
  save();
  render();
}

$("#show-empty").onchange = renderCave;

// Filtres repliables, masqués par défaut (choix mémorisé) ; une pastille indique les filtres actifs quand ils sont masqués.
const FILTERS_KEY = "macave.filtersHidden";
function setFiltersHidden(hidden) {
  $("#cave-filters").hidden = hidden;
  $("#filters-toggle").setAttribute("aria-expanded", String(!hidden));
  try { localStorage.setItem(FILTERS_KEY, hidden ? "1" : "0"); } catch {}
  updateFiltersBadge();
}
function updateFiltersBadge() {
  const n = (activeCat !== "Toutes") + (activeStore !== "all") + (activePlace !== "all") + $("#show-empty").checked;
  const badge = $("#filters-badge");
  badge.textContent = n;
  badge.hidden = !n || !$("#cave-filters").hidden;
  $("#filters-toggle").title = $("#cave-filters").hidden
    ? `Afficher les filtres${n ? ` (${n} actif${n > 1 ? "s" : ""})` : ""}` : "Masquer les filtres";
}
$("#filters-toggle").onclick = () => setFiltersHidden(!$("#cave-filters").hidden);
let filtersShown = false;
try { filtersShown = localStorage.getItem(FILTERS_KEY) === "0"; } catch {}
setFiltersHidden(!filtersShown);

// Recherche : tous les mots doivent apparaître (sans tenir compte des accents ni des majuscules).
function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
const searchInput = $("#cave-search");
searchInput.oninput = () => {
  $("#cave-search-clear").hidden = !searchInput.value;
  renderCave();
};
$("#cave-search-clear").onclick = () => {
  searchInput.value = "";
  $("#cave-search-clear").hidden = true;
  renderCave();
  searchInput.focus();
};

// ---------- Formulaire ----------
const form = $("#wine-form");
let pendingPhotos = []; // photos de la fiche en cours d'édition
let pendingTasting = null; // fiche de dégustation de la fiche en cours d'édition
let formDirty = false; // modifications non enregistrées (avant de changer d'onglet millésime)
form.addEventListener("input", () => (formDirty = true));

// ---------- Lieux de rangement ----------
const placeOf = (id) => (id ? (state.locations || []).find((p) => p.id === id) : null);
const placeByName = (name) => (state.locations || []).find((p) => norm(p.name) === norm(name));
const NEW_PLACE = "__new__";

function fillPlaceSelect(selected) {
  const places = [...(state.locations || [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  form.lieu.innerHTML = `<option value="">— Non précisé —</option>` +
    places.map((p) => `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}</option>`).join("") +
    `<option value="${NEW_PLACE}">+ Nouveau lieu…</option>`;
  form.lieu.dataset.prev = form.lieu.value;
}

// « + Nouveau lieu… » dans la liste : création à la volée, sans quitter la fiche.
$("#lieu-select").onchange = (e) => {
  const sel = e.target;
  if (sel.value !== NEW_PLACE) {
    sel.dataset.prev = sel.value;
    return;
  }
  const name = prompt("Nom du nouveau lieu de rangement :")?.trim();
  const p = name ? addPlace(name) : null;
  fillPlaceSelect(p ? p.id : sel.dataset.prev);
  if (p) formDirty = true;
};

// ---------- Référentiel (valeurs cohérentes à la saisie) ----------
// L'appellation (ou la cuvée, la région, les cépages) est comparée au référentiel : la fenêtre de
// dégustation et les cépages sont proposés automatiquement dans les champs vides, sans appel à l'IA.
// Une valeur saisie à la main n'est jamais remplacée.
$("#appellation-list").innerHTML = APPELLATIONS.map((a) => `<option value="${esc(a)}">`).join("");

function setAuto(field, value) {
  const el = form[field];
  if (el.value && !el.dataset.auto) return false; // saisi par l'utilisateur
  el.value = value ?? "";
  if (value != null && value !== "") el.dataset.auto = "1";
  else delete el.dataset.auto;
  return true;
}

function updateReference() {
  const data = readForm();
  const hint = $("#ref-hint");
  const r = findReference(data);
  if (!r) {
    hint.hidden = true;
    // Plus de correspondance : on retire ce qui avait été proposé automatiquement.
    for (const f of ["boireDe", "boireJusqua", "cepages", "region"]) if (form[f].dataset.auto) setAuto(f, "");
    return null;
  }
  const win = isSpirit(data) ? null : referenceWindow(data, new Date().getFullYear());
  if (win) {
    setAuto("boireDe", win.de);
    setAuto("boireJusqua", win.ja);
  }
  setAuto("cepages", r.cepages);
  setAuto("region", r.region);
  hint.innerHTML = `<b>${esc(r.name)}</b> · ${esc(COLOR_LABELS[r.color])} (${esc(r.region)})
    <span class="muted">Cépages : ${esc(r.cepages)}</span>
    <span class="muted">Arômes : ${esc(r.aromes)}</span>
    <span class="muted">${win ? `Garde habituelle : à boire de ${win.de} à ${win.ja}` : r.nv ? "Indiquez le millésime s'il y en a un pour la garde." : "Indiquez le millésime pour calculer la garde."}</span>`;
  hint.hidden = false;
  return win;
}

for (const f of ["category", "appellation", "region", "cuvee", "cepages", "millesime"]) {
  form[f].addEventListener("input", updateReference);
  form[f].addEventListener("change", updateReference);
}
// Saisie manuelle de la fenêtre ou des cépages : la valeur n'est plus remplacée automatiquement.
for (const f of ["boireDe", "boireJusqua", "cepages", "region"]) form[f].addEventListener("input", () => delete form[f].dataset.auto);

function clearReference() {
  for (const f of ["boireDe", "boireJusqua", "cepages", "region"]) delete form[f].dataset.auto;
  $("#ref-hint").hidden = true;
}

function fillCategorySelect(selected) {
  form.category.innerHTML = state.categories
    .map((c) => `<option ${c.name === selected ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
}

function setQty(n) {
  form.quantity.value = n;
  document.querySelectorAll(".qty-picker button").forEach((b) => b.classList.toggle("sel", +b.dataset.qty === +n));
}
document.querySelectorAll(".qty-picker button").forEach((b) => (b.onclick = () => setQty(b.dataset.qty)));
form.quantity.oninput = () => setQty(form.quantity.value);

function resetForm() {
  form.reset();
  form.id.value = "";
  clearReference();
  fillCategorySelect(activeCat !== "Toutes" ? activeCat : "Rouge");
  fillPlaceSelect(activePlace !== "all" && activePlace !== "none" ? activePlace : "");
  const used = state.wines.map((w) => (w.region || "").trim()).filter(Boolean);
  $("#region-list").innerHTML = [...new Set([...used, ...REGIONS])]
    .sort((a, b) => a.localeCompare(b, "fr")).map((r) => `<option value="${esc(r)}">`).join("");
  setQty(6);
  // Photos ajoutées à une fiche finalement non enregistrée.
  addedPhotoIds.forEach((id) => dropPhotos.add(id));
  addedPhotoIds.clear();
  flushPhotoDeletes();
  pendingPhotos = [];
  renderPhotos();
  pendingTasting = null;
  renderTasting();
  $("#tasting-status").textContent = "";
  formDirty = false;
  vintageBase = null;
  renderVintageTabs();
  $("#photo-status").textContent = "";
  $("#estimate-status").textContent = "";
  $("#qty-label").firstChild.textContent = "Nombre de bouteilles rentrées";
  $("#btn-cancel").hidden = true;
  $("#btn-delete").hidden = true;
  $("#btn-save").textContent = "Enregistrer";
}

function editWine(id) {
  const w = state.wines.find((x) => x.id === id);
  if (!w) return;
  resetForm();
  form.id.value = w.id;
  fillCategorySelect(w.category);
  for (const k of ["cuvee", "domaine", "region", "appellation", "cepages", "millesime", "boireDe", "boireJusqua", "commentaire"]) {
    form[k].value = w[k] ?? "";
  }
  form.auFrais.checked = Boolean(w.auFrais);
  fillPlaceSelect(w.lieu);
  updateReference();
  setQty(w.quantity || 0);
  $("#qty-label").firstChild.textContent = "Bouteilles en cave";
  pendingPhotos = [...photosOf(w)];
  renderPhotos();
  pendingTasting = w.degustation ?? null;
  renderTasting();
  vintageBase = w;
  renderVintageTabs(w.id);
  $("#btn-cancel").hidden = false;
  $("#btn-delete").hidden = false;
  $("#btn-save").textContent = "Mettre à jour";
  show("add");
}

// ---------- Onglets millésimes ----------
// Une fiche par millésime ; les fiches d'une même cuvée (même cuvée + domaine) sont réunies en onglets.
let vintageBase = null; // fiche dont on affiche les millésimes
const cuveeKey = (w) => `${(w.cuvee || "").trim().toLowerCase()}|${(w.domaine || "").trim().toLowerCase()}`;

function vintagesOf(w) {
  const key = cuveeKey(w);
  return state.wines
    .filter((x) => cuveeKey(x) === key)
    .sort((a, b) => (a.millesime == null) - (b.millesime == null) || (a.millesime ?? 0) - (b.millesime ?? 0));
}

function renderVintageTabs(activeId, isNew = false) {
  const box = $("#vintage-box");
  box.hidden = !vintageBase || (!vintageBase.cuvee && !vintageBase.domaine);
  if (box.hidden) return;
  const tabs = vintagesOf(vintageBase).map((w) =>
    `<button type="button" class="chip ${w.id === activeId ? "active" : ""}" data-vintage="${w.id}">` +
    `${esc(w.millesime ?? "Sans millésime")} <span class="vintage-n">${w.quantity || 0}</span></button>`);
  if (isNew) tabs.push(`<button type="button" class="chip active">Nouveau</button>`);
  else tabs.push(`<button type="button" class="chip chip-add" data-vintage-new>+ Millésime</button>`);
  const el = $("#vintage-tabs");
  el.innerHTML = tabs.join("");
  el.querySelectorAll("[data-vintage]").forEach((b) => (b.onclick = () => {
    if (b.dataset.vintage === activeId || !confirmLeave()) return;
    editWine(b.dataset.vintage);
  }));
  const add = el.querySelector("[data-vintage-new]");
  if (add) add.onclick = () => confirmLeave() && newVintage();
  el.querySelector(".chip.active")?.scrollIntoView({ block: "nearest", inline: "center" });
}

function confirmLeave() {
  return !formDirty || confirm("Abandonner les modifications non enregistrées de cette fiche ?");
}

// Nouvel onglet : nouvelle fiche pré-remplie avec la cuvée, à compléter avec le millésime.
function newVintage() {
  const base = vintageBase;
  resetForm();
  fillCategorySelect(base.category);
  for (const k of ["cuvee", "domaine", "region", "appellation", "cepages"]) form[k].value = base[k] ?? "";
  form.auFrais.checked = Boolean(base.auFrais);
  fillPlaceSelect(base.lieu);
  vintageBase = base;
  updateReference();
  renderVintageTabs(null, true);
  $("#btn-cancel").hidden = false;
  $("#view-title").textContent = "Nouveau millésime";
  form.millesime.focus();
}

function readForm() {
  const num = (v) => (v === "" || v == null ? null : parseInt(v, 10));
  return {
    category: form.category.value,
    cuvee: form.cuvee.value.trim(),
    domaine: form.domaine.value.trim(),
    region: form.region.value.trim(),
    appellation: form.appellation.value.trim(),
    auFrais: form.auFrais.checked,
    lieu: placeOf(form.lieu.value) ? form.lieu.value : "",
    cepages: form.cepages.value.trim(),
    millesime: num(form.millesime.value),
    boireDe: num(form.boireDe.value),
    boireJusqua: num(form.boireJusqua.value),
    commentaire: form.commentaire.value.trim(),
    quantity: Math.max(0, num(form.quantity.value) || 0),
  };
}

form.onsubmit = (e) => {
  e.preventDefault();
  const data = readForm();
  if (!data.cuvee && !data.domaine && !data.appellation) {
    toast("Indiquez au moins la cuvée ou le domaine.");
    return;
  }
  const id = form.id.value;
  if (id) {
    const w = state.wines.find((x) => x.id === id);
    const delta = data.quantity - (w.quantity || 0);
    Object.assign(w, data);
    const keep = new Set(photoIds(pendingPhotos));
    photoIds(photosOf(w)).forEach((id) => keep.has(id) || dropPhotos.add(id));
    setPhotos(w, pendingPhotos);
    setTasting(w, pendingTasting);
    if (delta) (w.history ??= []).push({ date: new Date().toISOString(), delta });
    toast("Fiche mise à jour");
  } else {
    // Même vin déjà en cave : on ajoute les bouteilles à la fiche existante.
    const same = state.wines.find(
      (w) => w.category === data.category && w.cuvee.toLowerCase() === data.cuvee.toLowerCase() &&
        w.domaine.toLowerCase() === data.domaine.toLowerCase() && w.millesime === data.millesime,
    );
    if (same) {
      same.quantity = (same.quantity || 0) + data.quantity;
      (same.history ??= []).push({ date: new Date().toISOString(), delta: data.quantity });
      if (data.commentaire && !same.commentaire.includes(data.commentaire)) {
        same.commentaire = [same.commentaire, data.commentaire].filter(Boolean).join("\n");
      }
      setPhotos(same, [...photosOf(same), ...pendingPhotos]);
      if (data.lieu) same.lieu = data.lieu;
      if (pendingTasting) setTasting(same, pendingTasting);
      toast(`+${data.quantity} ajoutée(s) à la fiche existante`);
    } else {
      const w = {
        id: uid(), ...data, createdAt: new Date().toISOString(),
        history: [{ date: new Date().toISOString(), delta: data.quantity }],
      };
      setPhotos(w, pendingPhotos);
      setTasting(w, pendingTasting);
      state.wines.push(w);
      toast(`${data.quantity} bouteille(s) ajoutée(s)`);
    }
  }
  save();
  flushPhotoDeletes();
  form.id.value = "";
  activeCat = "Toutes";
  show("cave");
};

$("#btn-cancel").onclick = () => { form.id.value = ""; show("cave"); };
$("#btn-back").onclick = () => {
  if (!confirmLeave()) return;
  form.id.value = "";
  show("cave");
};
$("#btn-delete").onclick = () => {
  const id = form.id.value;
  const w = state.wines.find((x) => x.id === id);
  if (!w || !confirm(`Supprimer définitivement « ${wineTitle(w)} » ?`)) return;
  state.wines = state.wines.filter((x) => x.id !== id);
  photoIds(photosOf(w)).forEach((id) => dropPhotos.add(id));
  save();
  form.id.value = "";
  show("cave");
  toast("Fiche supprimée");
};

// ---------- Photos ----------
// La cave ne garde qu'une miniature par photo ; la photo en haute définition est rangée à part
// (photos.js : sur l'appareil, et dans le compte Supabase si connecté).
// Format : { id, thumb } ; les anciennes fiches ont des images directement dans `photos` ou `photo`.
const MAX_PHOTOS = 6;
const PHOTO_SIZE = 2560; // px, côté le plus long : l'étiquette reste lisible une fois agrandie
const THUMB_SIZE = 200;

function photosOf(w) {
  const list = w.photos?.length ? w.photos : w.photo ? [w.photo] : [];
  return list.map((p) => (typeof p === "string" ? { thumb: p, inline: p } : p));
}

function setPhotos(w, photos) {
  delete w.photo;
  const kept = photos.slice(0, MAX_PHOTOS);
  if (kept.length) w.photos = kept.map((p) => (p.id ? { id: p.id, thumb: p.thumb } : p.inline));
  else delete w.photos;
  // Photos ajoutées pendant la saisie puis retirées (ou au-delà du maximum) : supprimées du stockage.
  const used = new Set(kept.map((p) => p.id).filter(Boolean));
  addedPhotoIds.forEach((id) => used.has(id) || dropPhotos.add(id));
  addedPhotoIds.clear();
}

const photoIds = (list) => list.map((p) => p.id).filter(Boolean);
const addedPhotoIds = new Set(); // ajoutées depuis l'ouverture de la fiche
const dropPhotos = new Set(); // à supprimer du stockage
function flushPhotoDeletes() {
  if (dropPhotos.size) deletePhotos([...dropPhotos]);
  dropPhotos.clear();
}

function renderPhotos() {
  const grid = $("#photo-grid");
  grid.innerHTML = pendingPhotos
    .map((p, i) => `<div class="ph"><button type="button" class="ph-img" data-view="${i}"><img src="${p.thumb}" alt="Photo ${i + 1}"></button>` +
      `<button type="button" class="ph-del" data-del="${i}" aria-label="Supprimer la photo">×</button></div>`)
    .join("");
  grid.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => openViewer(pendingPhotos, +b.dataset.view)));
  grid.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    // Fiche existante : suppression immédiate et définitive, d'où la confirmation.
    if (form.id.value && !confirm("Supprimer cette photo ?")) return;
    pendingPhotos.splice(+b.dataset.del, 1);
    renderPhotos();
    if (savePhotosNow()) toast("Photo supprimée");
    else formDirty = true;
  }));
  $("#add-photos").hidden = pendingPhotos.length >= MAX_PHOTOS;
  $("#photos-count").textContent = pendingPhotos.length ? `${pendingPhotos.length}/${MAX_PHOTOS}` : "";
}

async function addPhoto(file) {
  if (pendingPhotos.length >= MAX_PHOTOS) return false;
  const img = await loadImage(file);
  const id = `${uid()}${Math.random().toString(36).slice(2, 6)}`;
  const thumb = scaled(img, THUMB_SIZE).toDataURL("image/jpeg", 0.75);
  const full = await new Promise((r) => scaled(img, PHOTO_SIZE).toBlob(r, "image/jpeg", 0.88));
  await putPhoto(id, full);
  addedPhotoIds.add(id);
  pendingPhotos.push({ id, thumb });
  renderPhotos();
  if (!savePhotosNow()) formDirty = true;
  return true;
}

// Fiche déjà enregistrée : les ajouts et suppressions de photos sont pris en compte tout de suite,
// sans passer par « Mettre à jour » (pour une nouvelle fiche, ils le sont à l'enregistrement).
function savePhotosNow() {
  const w = form.id.value && state.wines.find((x) => x.id === form.id.value);
  if (!w) return false;
  const keep = new Set(photoIds(pendingPhotos));
  photoIds(photosOf(w)).forEach((id) => keep.has(id) || dropPhotos.add(id));
  setPhotos(w, pendingPhotos);
  save();
  flushPhotoDeletes();
  renderCave();
  return true;
}

$("#bottle-photos-input").onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  let skipped = 0;
  for (const file of files) {
    try {
      if (!(await addPhoto(file))) skipped++;
    } catch (err) {
      toast(err.message);
    }
  }
  if (skipped) toast(`${MAX_PHOTOS} photos maximum par bouteille.`);
};

onPhotoError((msg) => toast(msg));

// Visionneuse plein écran (appui pour fermer, flèches pour naviguer).
// La miniature s'affiche aussitôt, remplacée par la photo en haute définition dès qu'elle est chargée.
let viewer = { photos: [], i: 0, url: null, token: 0 };
function openViewer(photos, i) {
  viewer.photos = photos;
  viewer.i = i;
  showViewerPhoto();
  $("#photo-viewer").hidden = false;
}
async function showViewerPhoto() {
  const { photos, i } = viewer;
  const p = photos[i];
  const img = $("#viewer-img");
  const token = ++viewer.token;
  img.src = p.inline || p.thumb;
  $("#viewer-pos").textContent = photos.length > 1 ? `${i + 1} / ${photos.length}` : "";
  $("#viewer-prev").hidden = $("#viewer-next").hidden = photos.length < 2;
  $("#viewer-loading").hidden = !p.id;
  if (!p.id) return;
  try {
    const url = await photoUrl(p.id);
    if (token !== viewer.token) return url && URL.revokeObjectURL(url);
    if (url) {
      if (viewer.url) URL.revokeObjectURL(viewer.url);
      viewer.url = url;
      img.src = url;
    }
  } catch (err) {
    if (token === viewer.token) toast(err.message);
  } finally {
    if (token === viewer.token) $("#viewer-loading").hidden = true;
  }
}
function stepViewer(d) {
  $("#photo-viewer").classList.remove("zoomed");
  viewer.i = (viewer.i + d + viewer.photos.length) % viewer.photos.length;
  showViewerPhoto();
}
const closeViewer = () => {
  $("#photo-viewer").hidden = true;
  $("#photo-viewer").classList.remove("zoomed");
  viewer.token++;
};
$("#photo-viewer").onclick = closeViewer;
// Appui sur la photo : taille réelle (on fait défiler pour lire l'étiquette), nouvel appui pour revenir.
$("#viewer-img").onclick = (e) => {
  e.stopPropagation();
  const v = $("#photo-viewer");
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  v.classList.toggle("zoomed");
  // Zoom centré sur l'endroit touché.
  if (v.classList.contains("zoomed")) v.scrollTo(fx * img.offsetWidth - v.clientWidth / 2, fy * img.offsetHeight - v.clientHeight / 2);
};
document.addEventListener("keydown", (e) => {
  if ($("#photo-viewer").hidden) return;
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft" && viewer.photos.length > 1) stepViewer(-1);
  else if (e.key === "ArrowRight" && viewer.photos.length > 1) stepViewer(+1);
});
$("#viewer-prev").onclick = (e) => { e.stopPropagation(); stepViewer(-1); };
$("#viewer-next").onclick = (e) => { e.stopPropagation(); stepViewer(+1); };
let touchX = null;
$("#photo-viewer").addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
$("#photo-viewer").addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - (touchX ?? 0);
  if (Math.abs(dx) > 50 && viewer.photos.length > 1 && !$("#photo-viewer").classList.contains("zoomed")) {
    stepViewer(dx < 0 ? 1 : -1);
    e.preventDefault(); // pas de fermeture après un glissement
  }
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = URL.createObjectURL(file);
  });
}

function scaled(img, max) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function resizeImage(file, max, quality = 0.85) {
  return scaled(await loadImage(file), max).toDataURL("image/jpeg", quality);
}

async function onLabelPhoto(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const status = $("#photo-status");
  try {
    const big = await resizeImage(file, 1280);
    // La photo de l'étiquette rejoint les photos de la bouteille.
    await addPhoto(file);
    const timer = showAiLoader(status, "Analyse de l'étiquette en cours…", "label");
    const result = await recognizeLabel(
      aiConfig(),
      { base64: big.split(",")[1], mediaType: "image/jpeg" },
      state.categories.map((c) => c.name),
    );
    timer.done();
    if (result.category && catOf(result.category)) fillCategorySelect(result.category);
    for (const k of ["cuvee", "domaine", "region", "appellation", "cepages", "millesime", "boireDe", "boireJusqua"]) {
      if (result[k] != null && result[k] !== "") form[k].value = result[k];
    }
    // Appellation connue du référentiel : sa fenêtre remplace l'estimation de l'IA, pour des valeurs
    // cohérentes d'une bouteille à l'autre.
    if (findReference(readForm())) {
      for (const f of ["boireDe", "boireJusqua"]) form[f].dataset.auto = "1";
      if (!form.cepages.value) form.cepages.dataset.auto = "1";
    }
    updateReference();
    status.textContent = "Fiche pré-remplie — vérifiez, choisissez le nombre de bouteilles puis enregistrez.";
  } catch (err) {
    status.textContent = err.message;
  }
}
$("#photo-input").onchange = onLabelPhoto;
$("#gallery-input").onchange = onLabelPhoto;

// ---------- Fiche de dégustation (IA + recherche en ligne) ----------
function setTasting(w, t) {
  if (t) w.degustation = t;
  else delete w.degustation;
}

function tastingHtml(t) {
  const row = (label, v) => (v ? `<div class="tasting-row"><span class="md-key">${label}</span> ${esc(v)}</div>` : "");
  const date = new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${t.resume ? `<p class="tasting-resume">${esc(t.resume)}</p>` : ""}
    ${row("Robe", t.robe)}${row("Nez", t.nez)}${row("Bouche", t.bouche)}${row("Finale", t.finale)}
    ${row("Accords", t.accords?.join(", "))}${row("Service", t.service)}${row("Garde", t.garde)}${row("Critiques", t.notes)}
    ${t.sources?.length ? `<div class="tasting-row"><span class="md-key">Sources</span> ${t.sources
      .map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre || x.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])}</a>`).join(" · ")}</div>` : ""}
    <p class="muted small">Générée le ${esc(date)}${t.fiabilite ? ` — ${esc(t.fiabilite)}` : ""}. À vérifier : l'IA peut se tromper.</p>`;
}

function renderTasting() {
  const t = pendingTasting;
  $("#tasting-sheet").innerHTML = t ? tastingHtml(t) : "";
  $("#tasting-sheet").hidden = !t;
  $("#btn-tasting-clear").hidden = !t;
  $("#btn-tasting").querySelector("span").textContent = t ? "Régénérer la fiche" : "Générer avec recherche en ligne";
}

$("#btn-tasting").onclick = async (e) => {
  const btn = e.currentTarget;
  const data = readForm();
  if (!data.cuvee && !data.domaine && !data.appellation) return toast("Renseignez d'abord la cuvée ou le domaine.");
  const status = $("#tasting-status");
  btn.disabled = true;
  status.className = "small";
  const timer = showAiLoader(status, "Recherche en ligne et rédaction de la fiche…", "tasting");
  try {
    pendingTasting = await tastingSheet(aiConfig(), data);
    if (pendingTasting.web) timer.done(); // repli sans recherche : durée non représentative
    formDirty = true;
    renderTasting();
    status.textContent = pendingTasting.web
      ? "Fiche générée — enregistrez la fiche bouteille pour la conserver."
      : "Recherche en ligne indisponible : fiche rédigée sans elle. Enregistrez pour la conserver.";
    status.classList.add("msg-ok");
  } catch (err) {
    status.textContent = err.message;
    status.classList.add("msg-err");
  } finally {
    btn.disabled = false;
  }
};

$("#btn-tasting-clear").onclick = () => {
  pendingTasting = null;
  formDirty = true;
  renderTasting();
  $("#tasting-status").textContent = "";
};

$("#btn-estimate").onclick = async (e) => {
  const btn = e.currentTarget;
  const data = readForm();
  if (!data.cuvee && !data.domaine && !data.appellation) return toast("Renseignez d'abord la cuvée ou le domaine.");
  const status = $("#estimate-status");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Estimation…";
  status.className = "small";
  const timer = showAiLoader(status, "Estimation de la fenêtre de dégustation…", "window");
  try {
    const r = await estimateWindow(aiConfig(), data);
    timer.done();
    if (r.boireDe) form.boireDe.value = r.boireDe;
    if (r.boireJusqua) form.boireJusqua.value = r.boireJusqua;
    // Estimation demandée explicitement : elle n'est plus remplacée par le référentiel.
    if (r.boireDe) delete form.boireDe.dataset.auto;
    if (r.boireJusqua) delete form.boireJusqua.dataset.auto;
    status.textContent = r.boireDe || r.boireJusqua
      ? `Fenêtre estimée : ${r.boireDe ?? "?"} – ${r.boireJusqua ?? "?"}`
      : "L'IA n'a pas pu estimer la fenêtre pour ce vin.";
    status.classList.add("msg-ok");
  } catch (err) {
    status.textContent = err.message;
    status.classList.add("msg-err");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Estimer avec l'IA";
  }
};

// ---------- Maturité ----------
const URGENCY = { past: 0, urgent: 1, ready: 2 };
function renderMaturity() {
  const items = state.wines
    .filter((w) => w.quantity > 0)
    .map((w) => ({ w, m: maturity(w) }))
    .filter(({ m }) => m.status in URGENCY)
    .sort((a, b) => URGENCY[a.m.status] - URGENCY[b.m.status] || (a.m.to ?? 9999) - (b.m.to ?? 9999));
  const el = $("#maturity-list");
  if (!items.length) {
    el.innerHTML = `<p class="empty-state">Aucun vin à maturité pour le moment.<br><span class="small">Renseignez le millésime ou la fenêtre de dégustation de vos vins.</span></p>`;
    return;
  }
  el.innerHTML = items.map(({ w }) => cardHtml(w)).join("");
  bindCards(el);
}

// ---------- Accords ----------
// 1) Suggestions immédiates calculées sur le téléphone (sans IA, toujours disponibles).
// 2) Avis du sommelier IA sur une présélection de la cave, affiché dès qu'il arrive.
const recoHtml = (wine, why) =>
  `<div class="reco">${why ? `<div class="reco-why">${why}</div>` : ""}${cardHtml(wine)}</div>`;

$("#btn-pair").onclick = async () => {
  const meal = $("#meal").value.trim();
  const out = $("#pairing-result");
  if (!meal) return toast("Décrivez le repas à servir.");
  const available = state.wines.filter((w) => w.quantity > 0);
  if (!available.length) return toast("Votre cave est vide.");

  const ranked = rankForMeal(meal, available, { maturity, kindOf: (w) => catOf(w.category)?.kind });
  const quick = ranked.filter((r) => r.fit > 0).slice(0, 3);
  out.innerHTML = `<section class="res-block">
      <h3 class="res-title">Suggestions immédiates</h3>
      ${quick.length
        ? quick.map((r) => recoHtml(r.wine, esc(`${PROFILE_LABELS[r.profile]} : adapté à ce plat`))).join("")
        : `<p class="muted small">Aucune bouteille de la cave ne correspond clairement à ce repas.</p>`}
    </section>
    <section class="res-block" id="ai-part"></section>`;
  bindCards(out);

  const ai = aiConfig();
  const aiPart = $("#ai-part");
  if (!ai.key) {
    aiPart.innerHTML = `<p class="muted small">Ajoutez une clé IA dans Réglages pour obtenir l'avis détaillé du sommelier.</p>`;
    return;
  }
  const btn = $("#btn-pair");
  btn.disabled = true;
  const useWeb = $("#use-web").checked;
  const timer = showAiLoader(aiPart, useWeb ? "Le sommelier cherche en ligne et affine la sélection…" : "Le sommelier affine la sélection…",
    useWeb ? "pairingWeb" : "pairing");
  // Présélection : les 25 bouteilles les plus pertinentes suffisent et accélèrent la réponse.
  const candidates = ranked.slice(0, 25).map((r) => ({ ...r.wine, photo: undefined, photos: undefined, degustation: undefined, history: undefined, maturityLabel: r.maturity.label }));
  try {
    const res = await pairWines(ai, meal, candidates, useWeb);
    if (!res.note) timer.done(); // repli sans recherche : durée non représentative
    const byId = (id) => state.wines.find((w) => w.id === id);
    aiPart.innerHTML = `<h3 class="res-title">L'avis du sommelier</h3>
      ${res.recommandations.map((r) => {
        const wine = byId(r.wine.id) || r.wine;
        const why = [r.plat && `<b>${esc(r.plat)}</b>`, esc(r.pourquoi || ""), r.service && `<span class="reco-service">${esc(r.service)}</span>`]
          .filter(Boolean).join("<br>");
        return recoHtml(wine, why);
      }).join("")}
      ${res.texte ? `<div class="md">${markdown(res.texte)}</div>` : ""}
      ${res.conseil ? `<p class="reco-tip">${esc(res.conseil)}</p>` : ""}
      ${!res.recommandations.length && !res.texte ? `<p class="muted small">Le sommelier n'a pas trouvé d'accord adapté dans votre cave.</p>` : ""}
      ${res.note ? `<p class="muted small">${esc(res.note)}</p>` : ""}`;
    bindCards(aiPart);
  } catch (err) {
    aiPart.innerHTML = `<p class="b-past badge">${esc(err.message)}</p>
      <p class="muted small">Les suggestions immédiates ci-dessus restent valables.</p>`;
  } finally {
    btn.disabled = false;
  }
};

// Rendu Markdown minimal (texte échappé avant mise en forme).
function markdown(src) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = "";
  let list = null;
  let table = null; // { head: [], rows: [] }
  const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  // Tableaux affichés en fiches empilées (« Colonne : valeur »), lisibles sur téléphone.
  const flushTable = () => {
    if (!table) return;
    html += table.rows.map((r) => `<div class="md-row">${r.map((c, i) =>
      c ? `<div>${table.head[i] ? `<span class="md-key">${inline(table.head[i])}</span> ` : ""}${inline(c)}</div>` : "").join("")}</div>`).join("");
    table = null;
  };
  const close = () => {
    if (list) { html += `</${list}>`; list = null; }
    flushTable();
  };
  for (const line of src.split("\n")) {
    let m;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (list) { html += `</${list}>`; list = null; }
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-")) continue; // ligne de séparation
      if (!table) table = { head: cells(line), rows: [] };
      else table.rows.push(cells(line));
      continue;
    }
    if (table) flushTable();
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { close(); html += `<h3>${inline(m[2])}</h3>`; }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { close(); html += "<hr>"; }
    else if (!line.trim()) { close(); }
    else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return html;
}

// ---------- Cépages & terroirs ----------
let terroirData = null;
let activeRegion = null;

$("#map-mine").onchange = () => renderTerroir();

async function renderTerroir() {
  if (!terroirData) {
    const [{ VIEWBOX, DEPARTEMENTS }, { REGIONS_VITICOLES, deptToRegion }] =
      await Promise.all([import("./france-map.js"), import("./terroir.js")]);
    terroirData = { REGIONS_VITICOLES, deptToRegion };
    buildMap(VIEWBOX, DEPARTEMENTS);
  }
  const { REGIONS_VITICOLES } = terroirData;
  // Option « Dans ma cave » : seules les régions dont j'ai des bouteilles restent en couleur.
  const onlyMine = $("#map-mine").checked;
  const count = Object.fromEntries(REGIONS_VITICOLES.map((r) => [r.id, bottles(winesOfRegion(r))]));
  const svg = $("#france-map");
  svg.classList.toggle("only-mine", onlyMine);
  svg.querySelectorAll("[data-region]").forEach((el) => el.classList.toggle("mine", count[el.dataset.region] > 0));
  svg.querySelectorAll(".map-label").forEach((t) => {
    const n = count[t.dataset.region];
    t.textContent = t.dataset.name + (onlyMine && n ? ` · ${n}` : "");
  });
  const shown = onlyMine ? REGIONS_VITICOLES.filter((r) => count[r.id]) : REGIONS_VITICOLES;
  $("#region-chips").innerHTML = shown.length
    ? shown.map((r) =>
      `<button class="chip ${r.id === activeRegion ? "active" : ""}" data-region="${r.id}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}${onlyMine ? ` · ${count[r.id]}` : ""}</button>`).join("")
    : `<p class="muted small">Aucune bouteille rattachée à une région : renseignez le champ Région de vos fiches.</p>`;
  $("#region-chips").querySelectorAll(".chip").forEach((c) => (c.onclick = () => selectRegion(c.dataset.region, true)));
  $("#france-map").classList.toggle("has-selection", Boolean(activeRegion));
  $("#france-map").querySelectorAll("[data-region]").forEach((el) => el.classList.toggle("sel", el.dataset.region === activeRegion));
  renderRegionDetail();
}

function buildMap(viewBox, deps) {
  const svg = $("#france-map");
  const NS = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", viewBox);
  const g = document.createElementNS(NS, "g");
  for (const d of deps) {
    const region = terroirData.deptToRegion.get(d.id);
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d.d);
    p.setAttribute("class", region ? "dep wine" : "dep");
    if (region) {
      p.dataset.region = region.id;
      p.style.fill = region.color;
    }
    const t = document.createElementNS(NS, "title");
    t.textContent = region ? `${region.name} — ${d.name}` : d.name;
    p.appendChild(t);
    g.appendChild(p);
  }
  svg.appendChild(g);
  // Étiquette au centre de chaque région (décalée là où deux régions voisines se chevauchent).
  const LABEL_OFFSET = { beaujolais: [-16, -2], savoie: [12, 10], jura: [4, 0] };
  for (const r of terroirData.REGIONS_VITICOLES) {
    const boxes = [...svg.querySelectorAll(`path[data-region="${r.id}"]`)].map((p) => p.getBBox());
    if (!boxes.length) continue;
    const x1 = Math.min(...boxes.map((b) => b.x)), x2 = Math.max(...boxes.map((b) => b.x + b.width));
    const y1 = Math.min(...boxes.map((b) => b.y)), y2 = Math.max(...boxes.map((b) => b.y + b.height));
    const t = document.createElementNS(NS, "text");
    const [dx, dy] = LABEL_OFFSET[r.id] || [0, 0];
    t.setAttribute("x", (x1 + x2) / 2 + dx);
    t.setAttribute("y", (y1 + y2) / 2 + dy);
    t.setAttribute("class", "map-label");
    t.dataset.region = r.id;
    t.dataset.name = r.name.replace(" (Cognac)", "").replace("Vallée du ", "").replace("Val de ", "");
    t.textContent = t.dataset.name;
    svg.appendChild(t);
  }
  svg.addEventListener("click", (e) => {
    const el = e.target.closest("[data-region]");
    selectRegion(el ? el.dataset.region : null);
  });
}

function selectRegion(id, scroll = false) {
  activeRegion = id === activeRegion ? null : id;
  renderTerroir();
  if (activeRegion && scroll) $("#region-detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function winesOfRegion(r) {
  return state.wines.filter((w) => {
    if (!w.quantity) return false;
    if (r.id === "champagne" && w.category === "Champagne") return true;
    const text = `${w.region || ""} ${w.appellation || ""}`.toLowerCase();
    return r.aliases.some((a) => text.includes(a));
  });
}

function renderRegionDetail() {
  const el = $("#region-detail");
  const r = terroirData.REGIONS_VITICOLES.find((x) => x.id === activeRegion);
  if (!r) {
    el.innerHTML = "";
    return;
  }
  const chips = (list, cls) => list.map((c) => `<span class="grape ${cls}">${esc(c)}</span>`).join("");
  const mine = winesOfRegion(r);
  el.innerHTML = `<div class="region-card">
    <h2><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</h2>
    <h3>Cépages rouges</h3><div class="grapes">${chips(r.rouges, "red")}</div>
    <h3>Cépages blancs</h3><div class="grapes">${chips(r.blancs, "white")}</div>
    <h3>Terroir</h3><p>${esc(r.terroir)}</p>
    <h3>Appellations phares</h3><p>${r.appellations.map(esc).join(" · ")}</p>
    <h3>Styles</h3><p>${esc(r.styles)}</p>
    <h3>Dans ma cave</h3>
    ${mine.length ? regionCellarHtml(mine) : `<p class="muted small">Aucune bouteille de cette région pour le moment.</p>`}
  </div>`;
  el.querySelectorAll("[data-region-tab]").forEach((t) => (t.onclick = () => {
    regionTab = t.dataset.regionTab;
    renderRegionDetail();
  }));
  el.querySelectorAll("[data-goto-producer]").forEach((b) => (b.onclick = () => openProducer(b.dataset.gotoProducer)));
  el.querySelectorAll("[data-region-producer]").forEach((h) => (h.onclick = () => {
    const k = h.dataset.regionProducer;
    openRegionProducers.has(k) ? openRegionProducers.delete(k) : openRegionProducers.add(k);
    renderRegionDetail();
  }));
  bindCards(el);
}

// « Dans ma cave » d'une région : onglet Bouteilles (liste des fiches) ou Vignerons (domaines de la région).
let regionTab = "bottles";
const openRegionProducers = new Set();

function regionCellarHtml(mine) {
  const n = bottles(mine);
  const groups = new Map();
  for (const w of mine) {
    const key = producerKey(w.domaine);
    if (!groups.has(key)) groups.set(key, { key, name: (w.domaine || "").trim() || NO_PRODUCER, wines: [] });
    groups.get(key).wines.push(w);
  }
  const producers = [...groups.values()].sort((a, b) => (a.key === "") - (b.key === "") || a.name.localeCompare(b.name, "fr"));
  const named = producers.filter((g) => g.key).length;
  const tab = (id, label) => `<button type="button" class="chip ${regionTab === id ? "active" : ""}" data-region-tab="${id}">${label}</button>`;
  const tabs = `<div class="chips region-tabs">${tab("bottles", `Bouteilles · ${n}`)}${tab("vignerons", `Vignerons · ${named}`)}</div>`;
  if (regionTab === "bottles") return `${tabs}<div class="region-wines">${mine.map(cardHtml).join("")}</div>`;
  return tabs + producers.map((g) => {
    const site = g.key && state.producers?.[g.key]?.site;
    const open = openRegionProducers.has(g.key);
    return `<div class="producer ${open ? "open" : ""}">
      <button type="button" class="producer-head" data-region-producer="${esc(g.key)}" aria-expanded="${open}">
        <span class="p-name">${esc(g.name)}</span>
        <span class="p-count">${bottles(g.wines)}</span>
        <svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      ${open ? `<div class="producer-body">
        <div class="producer-site">
          ${g.key ? `<button type="button" class="btn btn-ghost btn-small" data-goto-producer="${esc(g.key)}"><svg class="ico ico-inline" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg><span>Fiche du vigneron</span></button>` : ""}
          ${site ? `<a class="site-link" href="${esc(site)}" target="_blank" rel="noopener">${ICON_GLOBE}${esc(siteLabel(site))}</a>` : ""}
        </div>
        ${g.wines.map(cardHtml).join("")}
      </div>` : ""}
    </div>`;
  }).join("");
}

// ---------- Réglages ----------
function renderSettings() {
  const user = store.currentUser();
  $("#account-box").hidden = !user;
  $("#local-box").hidden = Boolean(user);
  if (user) $("#account-email").textContent = `Connecté : ${user.email}`;
  $("#ai-key-where").textContent = user
    ? "La clé est enregistrée dans votre compte : vous la retrouvez sur tous vos appareils."
    : "La clé reste stockée uniquement sur ce téléphone.";
  $("#ai-provider").value = provider();
  showProviderKey(provider());
  renderPlaces();
  $("#cat-list").innerHTML = state.categories
    .map((c, i) => {
      const n = state.wines.filter((w) => w.category === c.name).length;
      return `<li><span><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)} <span class="muted small">· ${c.kind}${n ? ` · ${n} fiche(s)` : ""}</span></span>
        ${n ? "" : `<button data-i="${i}" aria-label="Supprimer">✕</button>`}</li>`;
    })
    .join("");
  $("#cat-list").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.categories.splice(+b.dataset.i, 1);
    save();
    renderSettings();
  }));
}

function renderPlaces() {
  const places = state.locations || [];
  $("#place-list").innerHTML = places.length ? places.map((p) => {
    const n = bottles(state.wines.filter((w) => w.lieu === p.id));
    return `<li><button type="button" class="place-name" data-rename="${p.id}">${ICON_PIN} ${esc(p.name)} <span class="muted small">· ${n} bouteille${n > 1 ? "s" : ""}</span></button>
      <button data-del-place="${p.id}" aria-label="Supprimer le lieu ${esc(p.name)}">✕</button></li>`;
  }).join("") : `<li class="muted small">Aucun lieu pour l'instant.</li>`;
  $("#place-list").querySelectorAll("[data-rename]").forEach((b) => (b.onclick = () => {
    const p = placeOf(b.dataset.rename);
    const name = prompt("Nouveau nom du lieu :", p.name)?.trim();
    if (!name || name === p.name) return;
    if (placeByName(name)) return toast("Ce lieu existe déjà.");
    p.name = name;
    save();
    render();
  }));
  $("#place-list").querySelectorAll("[data-del-place]").forEach((b) => (b.onclick = () => {
    const p = placeOf(b.dataset.delPlace);
    const inside = state.wines.filter((w) => w.lieu === p.id);
    if (!confirm(inside.length
      ? `Supprimer « ${p.name} » ? Ses ${inside.length} fiche(s) passeront en « lieu non précisé ».`
      : `Supprimer le lieu « ${p.name} » ?`)) return;
    inside.forEach((w) => delete w.lieu);
    state.locations = state.locations.filter((x) => x.id !== p.id);
    save();
    render();
    toast(`Lieu « ${p.name} » supprimé`);
  }));
}

function addPlace(name) {
  name = name.trim();
  if (!name) return null;
  const existing = placeByName(name);
  if (existing) return existing;
  const p = { id: uid(), name };
  (state.locations ??= []).push(p);
  save();
  return p;
}

$("#btn-add-place").onclick = () => {
  const name = $("#new-place").value.trim();
  if (!name) return;
  if (placeByName(name)) return toast("Ce lieu existe déjà.");
  addPlace(name);
  $("#new-place").value = "";
  render();
  toast(`Lieu « ${name} » ajouté`);
};
$("#new-place").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-add-place").click();
});

function showProviderKey(p) {
  $("#api-key").value = keyFor(p);
  $("#api-key").placeholder = `Clé API ${PROVIDERS[p].label} (${PROVIDERS[p].keyHint})`;
  $("#key-help-gemini").hidden = p !== "gemini";
  $("#key-help-claude").hidden = p !== "claude";
}

$("#ai-provider").onchange = async (e) => {
  showProviderKey(e.target.value);
  try { await saveAi({ ...aiSettings(), provider: e.target.value }); } catch (err) { toast(err.message); }
};

$("#btn-save-key").onclick = async (e) => {
  const btn = e.currentTarget;
  const p = $("#ai-provider").value;
  const s = aiSettings();
  btn.disabled = true;
  try {
    await saveAi({ provider: p, keys: { ...s.keys, [p]: $("#api-key").value.trim() } });
    toast(store.currentUser() ? `Clé ${PROVIDERS[p].label} enregistrée dans votre compte` : `Clé ${PROVIDERS[p].label} enregistrée`);
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
};

$("#btn-add-cat").onclick = () => {
  const name = $("#new-cat").value.trim();
  if (!name) return;
  if (catOf(name)) return toast("Cette catégorie existe déjà.");
  state.categories.push({ name, kind: $("#new-cat-kind").value, color: EXTRA_COLORS[state.categories.length % EXTRA_COLORS.length] });
  save();
  $("#new-cat").value = "";
  renderSettings();
  toast(`Catégorie « ${name} » ajoutée`);
};

$("#btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ma-cave-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.wines) || !Array.isArray(data.categories)) throw new Error();
    if (!confirm(`Remplacer la cave actuelle par cette sauvegarde (${data.wines.length} fiches) ?`)) return;
    state = data;
    save();
    render();
    toast("Sauvegarde importée");
  } catch {
    toast("Fichier de sauvegarde invalide.");
  }
};

// ---------- Rendu global ----------
function render() {
  renderCave();
  if ($("#view-maturity").classList.contains("active")) renderMaturity();
  if ($("#view-settings").classList.contains("active")) renderSettings();
  if ($("#view-terroir").classList.contains("active")) renderTerroir();
  if ($("#view-producers").classList.contains("active")) renderProducers();
}

// ---------- Producteurs ----------
// Regroupement par domaine (sans tenir compte des accents ni des majuscules) ; les sites internet
// sont gardés dans la cave (state.producers[clé].site), donc synchronisés avec le compte.
const NO_PRODUCER = "Producteur non renseigné";
const producerKey = (name) => norm(name).replace(/\s+/g, " ").trim();
const openProducers = new Set();
const ICON_GLOBE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/></svg>';

function producerGroups() {
  const groups = new Map();
  for (const w of state.wines) {
    const key = producerKey(w.domaine) || "";
    if (!groups.has(key)) groups.set(key, { key, names: {}, wines: [] });
    const g = groups.get(key);
    const n = (w.domaine || "").trim();
    if (n) g.names[n] = (g.names[n] || 0) + 1;
    g.wines.push(w);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, name: Object.entries(g.names).sort((a, b) => b[1] - a[1])[0]?.[0] || NO_PRODUCER }))
    .sort((a, b) => (a.key === "") - (b.key === "") || a.name.localeCompare(b.name, "fr"));
}

const siteLabel = (url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function renderProducers() {
  const el = $("#producer-list");
  const groups = producerGroups();
  if (!groups.length) {
    el.innerHTML = `<p class="empty-state">Aucun producteur pour l'instant.<br>Ajoutez des bouteilles avec leur domaine.</p>`;
    return;
  }
  el.innerHTML = groups.map((g) => {
    const site = state.producers?.[g.key]?.site || "";
    const regions = [...new Set(g.wines.map((w) => (w.region || "").trim()).filter(Boolean))].join(", ");
    const open = openProducers.has(g.key);
    const wines = [...g.wines].sort((a, b) => wineTitle(a).localeCompare(wineTitle(b), "fr") || (a.millesime ?? 0) - (b.millesime ?? 0));
    return `<div class="producer ${open ? "open" : ""}" data-key="${esc(g.key)}">
      <button type="button" class="producer-head" aria-expanded="${open}">
        <span class="p-name">${esc(g.name)}${regions ? `<span class="p-sub">${esc(regions)}</span>` : ""}</span>
        ${site ? `<span class="muted" title="Site internet connu">${ICON_GLOBE}</span>` : ""}
        <span class="p-count">${bottles(g.wines)}</span>
        <svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      ${open ? `<div class="producer-body">
        ${g.key ? `<div class="producer-site">
          ${site ? `<a class="site-link" href="${esc(site)}" target="_blank" rel="noopener">${ICON_GLOBE}${esc(siteLabel(site))}</a>` : `<span class="muted small">Pas de site internet enregistré.</span>`}
          <div class="site-edit">
            <input type="url" inputmode="url" placeholder="https://… (site du producteur)" value="${esc(site)}" data-site-input aria-label="Site internet de ${esc(g.name)}">
            <button type="button" class="btn btn-ghost btn-small" data-site-ai title="Rechercher le site avec l'IA">${ICON_GLOBE}<span>Trouver</span></button>
          </div>
          <div class="small site-status" style="width:100%"></div>
        </div>` : ""}
        ${wines.map(cardHtml).join("")}
      </div>` : ""}
    </div>`;
  }).join("");

  el.querySelectorAll(".producer").forEach((box) => {
    const key = box.dataset.key;
    box.querySelector(".producer-head").onclick = () => {
      openProducers.has(key) ? openProducers.delete(key) : openProducers.add(key);
      renderProducers();
    };
    const input = box.querySelector("[data-site-input]");
    if (input) input.onchange = () => setProducerSite(key, input.value);
    const ai = box.querySelector("[data-site-ai]");
    if (ai) ai.onclick = async () => {
      const g = producerGroups().find((x) => x.key === key);
      const status = box.querySelector(".site-status");
      ai.disabled = true;
      const timer = showAiLoader(status, `Recherche du site de ${g.name}…`, "site");
      try {
        const site = await findProducerSite(aiConfig(), g.name, g.wines.find((w) => w.region)?.region);
        timer.done();
        if (site) {
          setProducerSite(key, site);
          toast(`Site trouvé : ${siteLabel(site)}`);
        } else {
          status.textContent = "Aucun site officiel trouvé pour ce producteur.";
        }
      } catch (err) {
        status.textContent = err.message;
      } finally {
        ai.disabled = false;
      }
    };
    bindCards(box);
  });
}

// Ouvre l'onglet Vignerons sur la fiche dépliée de ce producteur.
function openProducer(key) {
  openProducers.add(key);
  show("producers");
  const box = [...document.querySelectorAll("#producer-list .producer")].find((b) => b.dataset.key === key);
  box?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setProducerSite(key, value) {
  let site = value.trim();
  if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`;
  state.producers ??= {};
  if (site) state.producers[key] = { ...state.producers[key], site };
  else delete state.producers[key];
  save();
  renderProducers();
}

// ---------- Comptes ----------
const authForm = $("#auth-form");
let authMode = "login"; // login | signup | forgot | newpass

function setAuthMode(mode) {
  authMode = mode;
  const t = {
    login: ["Connexion", "Se connecter", "Créer un compte"],
    signup: ["Créer un compte", "Créer mon compte", "J'ai déjà un compte"],
    forgot: ["Mot de passe oublié", "Recevoir un lien", "Retour à la connexion"],
    newpass: ["Nouveau mot de passe", "Enregistrer", "Retour à la connexion"],
  }[mode];
  $("#auth-title").textContent = t[0];
  $("#auth-submit").textContent = t[1];
  $("#auth-switch").textContent = t[2];
  $("#auth-forgot").hidden = mode !== "login";
  authForm.email.closest("label").hidden = mode === "newpass";
  authForm.email.required = mode !== "newpass";
  $("#auth-pass-label").hidden = mode === "forgot";
  authForm.password.required = mode !== "forgot";
  authForm.password.autocomplete = mode === "login" ? "current-password" : "new-password";
  authMsg("");
}

function authMsg(text, ok = false) {
  const el = $("#auth-msg");
  el.textContent = text;
  el.className = `small ${ok ? "msg-ok" : "msg-err"}`;
}

$("#auth-switch").onclick = () => setAuthMode(authMode === "login" ? "signup" : "login");
$("#auth-forgot").onclick = () => setAuthMode("forgot");

authForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = authForm.email.value.trim();
  const password = authForm.password.value;
  const btn = $("#auth-submit");
  btn.disabled = true;
  try {
    if (authMode === "login") {
      await store.signIn(email, password);
      await enterApp();
    } else if (authMode === "signup") {
      const connected = await store.signUp(email, password);
      if (connected) await enterApp();
      else { setAuthMode("login"); authMsg("Compte créé ! Validez votre adresse via l'e-mail reçu, puis connectez-vous.", true); }
    } else if (authMode === "forgot") {
      await store.resetPassword(email);
      authMsg("Si un compte existe, un lien de réinitialisation vient d'être envoyé.", true);
    } else if (authMode === "newpass") {
      await store.updatePassword(password);
      await enterApp();
      toast("Mot de passe modifié");
    }
  } catch (err) {
    authMsg(err.message);
  } finally {
    btn.disabled = false;
  }
};

$("#btn-logout").onclick = async () => {
  if (!confirm("Se déconnecter de ce téléphone ?")) return;
  await store.signOut();
  state = defaultState();
  authForm.reset();
  setAuthMode("login");
  $("#auth").hidden = false;
};

const CLOUD = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
const CLOUD_OFF = '<path d="m2 2 20 20"/><path d="M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.19"/><path d="M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07"/>';
const SYNC_ICONS = {
  syncing: [CLOUD, "Synchronisation…"],
  ok: [CLOUD, "Synchronisé"],
  offline: [CLOUD_OFF, "Hors ligne : les modifications seront envoyées plus tard"],
};
function syncStatus(s) {
  const el = $("#sync-status");
  const [icon, title] = SYNC_ICONS[s] || ["", ""];
  el.innerHTML = icon && `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  el.title = title;
  el.dataset.state = s;
}

async function enterApp() {
  const user = store.currentUser();
  state = await store.load(defaultState);
  // Première connexion : proposer de reprendre la cave déjà saisie sans compte sur ce téléphone.
  if (user && store.hasLegacyData() && !state.wines.length &&
      confirm("Des bouteilles sont déjà enregistrées sur ce téléphone. Les ajouter à votre compte ?")) {
    state = store.takeLegacyData();
    save();
  }
  // Clés IA saisies sur ce téléphone avant les comptes : on les rattache au compte.
  const local = localAi();
  if (user && !store.accountAi() && (local.keys.gemini || local.keys.claude)) {
    try {
      await store.saveAccountAi(local);
      [PROVIDER_KEY, ...Object.values(KEY_STORE)].forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
  $("#auth").hidden = true;
  syncPhotos().catch(() => {});
  activeCat = "Toutes";
  resetForm();
  show("cave");
}

async function boot() {
  store.watch({
    remoteChange: (data) => { state = data; render(); },
    syncStatus,
  });
  if (!store.cloudEnabled) return enterApp();
  store.onPasswordRecovery(() => { $("#auth").hidden = false; setAuthMode("newpass"); });
  let user = null;
  try { user = await store.restoreSession(); } catch {}
  if (user) return enterApp();
  setAuthMode("login");
  $("#auth").hidden = false;
}

boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

import { recognizeLabel, estimateWindow, pairWines, PROVIDERS } from "./ai.js";
import * as store from "./storage.js";

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
const save = () => store.save(state);
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
function windowOf(w) {
  if (w.boireDe || w.boireJusqua) {
    return [w.boireDe || w.millesime || null, w.boireJusqua || null];
  }
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

// ---------- Navigation ----------
const TITLES = { cave: "Ma cave", add: "Ajouter", maturity: "À maturité", pairing: "Accords mets & vins", settings: "Réglages" };
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#view-title").textContent = view === "add" && $("#wine-form").id.value ? "Modifier la fiche" : TITLES[view];
  if (view === "add" && !$("#wine-form").id.value) resetForm();
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => {
  if (b.dataset.view === "add") $("#wine-form").id.value = "";
  show(b.dataset.view);
}));

// ---------- Cave ----------
let activeCat = "Toutes";

function renderCave() {
  const q = $("#search").value.trim().toLowerCase();
  const showEmpty = $("#show-empty").checked;

  const total = state.wines.reduce((n, w) => n + (w.quantity || 0), 0);
  $("#total-count").textContent = `${total} bouteille${total > 1 ? "s" : ""}`;

  const chips = $("#cat-filter");
  const counts = {};
  state.wines.forEach((w) => (counts[w.category] = (counts[w.category] || 0) + (w.quantity || 0)));
  chips.innerHTML = ["Toutes", ...state.categories.map((c) => c.name)]
    .map((n) => `<button class="chip ${n === activeCat ? "active" : ""}" data-cat="${esc(n)}">${esc(n)}${n !== "Toutes" && counts[n] ? ` · ${counts[n]}` : ""}</button>`)
    .join("");
  chips.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { activeCat = c.dataset.cat; renderCave(); }));

  const list = state.wines.filter((w) => {
    if (!showEmpty && !w.quantity) return false;
    if (activeCat !== "Toutes" && w.category !== activeCat) return false;
    if (!q) return true;
    return [w.cuvee, w.domaine, w.appellation, w.cepages, w.millesime, w.commentaire, w.category]
      .join(" ").toLowerCase().includes(q);
  });

  const el = $("#cave-list");
  if (!list.length) {
    el.innerHTML = state.wines.length
      ? `<p class="empty-state">Aucune bouteille ne correspond.</p>`
      : `<p class="empty-state">Votre cave est vide.<br>Touchez <b>Ajouter</b> pour rentrer vos premières bouteilles.</p>`;
    return;
  }

  const order = state.categories.map((c) => c.name);
  const groups = {};
  list.forEach((w) => (groups[w.category] ??= []).push(w));
  el.innerHTML = Object.keys(groups)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((cat) => {
      const items = groups[cat].sort((a, b) => wineTitle(a).localeCompare(wineTitle(b), "fr"));
      const n = items.reduce((s, w) => s + (w.quantity || 0), 0);
      return `<div class="cat-group"><h3><span><span class="dot" style="background:${esc(catOf(cat)?.color || "#999")}"></span>${esc(cat)}</span><span>${n}</span></h3>${items.map(cardHtml).join("")}</div>`;
    })
    .join("");
  bindCards(el);
}

function cardHtml(w) {
  const m = maturity(w);
  const sub = [w.appellation, w.millesime, w.cepages].filter(Boolean).join(" · ");
  return `<div class="card ${w.quantity ? "" : "empty"}" data-id="${w.id}">
    ${w.photo ? `<img class="thumb" src="${w.photo}" alt="">` : ""}
    <div class="info" data-edit>
      <div class="title">${esc(wineTitle(w))}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
      <span class="badge ${m.cls}">${esc(m.label)}</span>
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
    card.querySelector("[data-edit]").onclick = () => editWine(w.id);
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

$("#search").oninput = renderCave;
$("#show-empty").onchange = renderCave;

// ---------- Formulaire ----------
const form = $("#wine-form");
let pendingPhoto = null;

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
  fillCategorySelect(activeCat !== "Toutes" ? activeCat : "Rouge");
  setQty(6);
  pendingPhoto = null;
  $("#photo-preview").hidden = true;
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
  for (const k of ["cuvee", "domaine", "appellation", "cepages", "millesime", "boireDe", "boireJusqua", "commentaire"]) {
    form[k].value = w[k] ?? "";
  }
  setQty(w.quantity || 0);
  $("#qty-label").firstChild.textContent = "Bouteilles en cave";
  if (w.photo) { $("#photo-preview").src = w.photo; $("#photo-preview").hidden = false; }
  $("#btn-cancel").hidden = false;
  $("#btn-delete").hidden = false;
  $("#btn-save").textContent = "Mettre à jour";
  show("add");
}

function readForm() {
  const num = (v) => (v === "" || v == null ? null : parseInt(v, 10));
  return {
    category: form.category.value,
    cuvee: form.cuvee.value.trim(),
    domaine: form.domaine.value.trim(),
    appellation: form.appellation.value.trim(),
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
    if (pendingPhoto) w.photo = pendingPhoto;
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
      if (pendingPhoto && !same.photo) same.photo = pendingPhoto;
      toast(`+${data.quantity} ajoutée(s) à la fiche existante`);
    } else {
      state.wines.push({
        id: uid(), ...data, photo: pendingPhoto, createdAt: new Date().toISOString(),
        history: [{ date: new Date().toISOString(), delta: data.quantity }],
      });
      toast(`${data.quantity} bouteille(s) ajoutée(s)`);
    }
  }
  save();
  form.id.value = "";
  activeCat = "Toutes";
  show("cave");
};

$("#btn-cancel").onclick = () => { form.id.value = ""; show("cave"); };
$("#btn-delete").onclick = () => {
  const id = form.id.value;
  const w = state.wines.find((x) => x.id === id);
  if (!w || !confirm(`Supprimer définitivement « ${wineTitle(w)} » ?`)) return;
  state.wines = state.wines.filter((x) => x.id !== id);
  save();
  form.id.value = "";
  show("cave");
  toast("Fiche supprimée");
};

// ---------- Photo ----------
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = URL.createObjectURL(file);
  });
}

async function onLabelPhoto(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const status = $("#photo-status");
  try {
    const big = await resizeImage(file, 1280);
    pendingPhoto = await resizeImage(file, 160);
    $("#photo-preview").src = big;
    $("#photo-preview").hidden = false;
    status.textContent = "Analyse de l'étiquette en cours…";
    const result = await recognizeLabel(
      aiConfig(),
      { base64: big.split(",")[1], mediaType: "image/jpeg" },
      state.categories.map((c) => c.name),
    );
    if (result.category && catOf(result.category)) fillCategorySelect(result.category);
    for (const k of ["cuvee", "domaine", "appellation", "cepages", "millesime", "boireDe", "boireJusqua"]) {
      if (result[k] != null && result[k] !== "") form[k].value = result[k];
    }
    status.textContent = "Fiche pré-remplie — vérifiez, choisissez le nombre de bouteilles puis enregistrez.";
  } catch (err) {
    status.textContent = err.message;
  }
}
$("#photo-input").onchange = onLabelPhoto;
$("#gallery-input").onchange = onLabelPhoto;

$("#btn-estimate").onclick = async (e) => {
  const btn = e.currentTarget;
  const data = readForm();
  if (!data.cuvee && !data.domaine && !data.appellation) return toast("Renseignez d'abord la cuvée ou le domaine.");
  const status = $("#estimate-status");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Estimation…";
  status.textContent = "";
  status.className = "small";
  try {
    const r = await estimateWindow(aiConfig(), data);
    if (r.boireDe) form.boireDe.value = r.boireDe;
    if (r.boireJusqua) form.boireJusqua.value = r.boireJusqua;
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
$("#btn-pair").onclick = async () => {
  const meal = $("#meal").value.trim();
  const out = $("#pairing-result");
  if (!meal) return toast("Décrivez le repas à servir.");
  const cellar = state.wines
    .filter((w) => w.quantity > 0)
    .map((w) => ({ ...w, photo: undefined, history: undefined, maturityLabel: maturity(w).label }));
  if (!cellar.length) return toast("Votre cave est vide.");
  const btn = $("#btn-pair");
  btn.disabled = true;
  out.innerHTML = `<div class="spinner"></div><p class="muted small" style="text-align:center">Le sommelier étudie votre cave…</p>`;
  try {
    const md = await pairWines(aiConfig(), meal, cellar, $("#use-web").checked);
    out.innerHTML = `<div class="md">${markdown(md)}</div>`;
  } catch (err) {
    out.innerHTML = `<p class="b-past badge">${esc(err.message)}</p>`;
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
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const line of src.split("\n")) {
    let m;
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

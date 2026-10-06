// Stockage de la cave : en ligne par compte (Supabase) si configuré, sinon local au téléphone.
// Une copie locale est toujours conservée pour fonctionner hors ligne.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const LEGACY_KEY = "macave.v1"; // données de la version sans compte
export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb = null;
let user = null;
let lastSynced = null; // updated_at de la dernière version connue du serveur
let dirty = false;
let pushTimer = null;
let onRemoteChange = () => {};
let onSyncStatus = () => {};

const cacheKey = () => (user ? `macave.cache.${user.id}` : LEGACY_KEY);

async function client() {
  if (!sb) {
    const { createClient } = await import("./vendor/supabase.js");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return sb;
}

function readCache(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s && Array.isArray(s.wines)) return s;
  } catch {}
  return null;
}

function writeCache(state) {
  localStorage.setItem(cacheKey(), JSON.stringify(state));
  if (user) localStorage.setItem(`${cacheKey()}.meta`, JSON.stringify({ dirty, lastSynced }));
}

// ---------- Authentification ----------
export function currentUser() {
  return user;
}

export async function restoreSession() {
  if (!cloudEnabled) return null;
  const c = await client();
  const { data } = await c.auth.getSession();
  user = data.session?.user ?? null;
  return user;
}

function authError(error) {
  const m = error?.message || "";
  if (/invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Confirmez d'abord votre adresse via l'e-mail reçu.";
  if (/already registered|already exists/i.test(m)) return "Un compte existe déjà avec cet e-mail.";
  if (/password/i.test(m) && /at least/i.test(m)) return "Mot de passe trop court (6 caractères minimum).";
  if (/fetch|network/i.test(m)) return "Connexion impossible (êtes-vous hors ligne ?).";
  return m || "Erreur inconnue.";
}

export async function signIn(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authError(error));
  user = data.user;
  return user;
}

// Retourne true si le compte est créé et connecté, false si un e-mail de confirmation a été envoyé.
export async function signUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(authError(error));
  if (data.user && data.user.identities?.length === 0) throw new Error("Un compte existe déjà avec cet e-mail.");
  user = data.session ? data.user : null;
  return Boolean(data.session);
}

export async function resetPassword(email) {
  const c = await client();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(authError(error));
}

export async function updatePassword(password) {
  const c = await client();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(authError(error));
}

export async function onPasswordRecovery(cb) {
  if (!cloudEnabled) return;
  const c = await client();
  c.auth.onAuthStateChange((event) => event === "PASSWORD_RECOVERY" && cb());
}

export async function signOut() {
  await flush();
  const c = await client();
  await c.auth.signOut();
  user = null;
  lastSynced = null;
  dirty = false;
}

// ---------- Réglages IA du compte ----------
// Stockés dans les métadonnées du compte (lisibles uniquement par l'utilisateur connecté),
// jamais dans la cave : ils ne partent donc pas dans les exports.
export function accountAi() {
  return user?.user_metadata?.ai ?? null;
}

export async function saveAccountAi(ai) {
  const c = await client();
  const { data, error } = await c.auth.updateUser({ data: { ai } });
  if (error) throw new Error(authError(error));
  user = data.user;
}

// ---------- Données ----------
export function hasLegacyData() {
  return Boolean(readCache(LEGACY_KEY)?.wines.length);
}

export function takeLegacyData() {
  const s = readCache(LEGACY_KEY);
  localStorage.removeItem(LEGACY_KEY);
  return s;
}

// Charge la cave de l'utilisateur courant (ou la cave locale sans compte).
export async function load(defaults) {
  if (!user) return readCache(LEGACY_KEY) ?? defaults();

  const cached = readCache(cacheKey());
  try {
    const meta = JSON.parse(localStorage.getItem(`${cacheKey()}.meta`)) || {};
    dirty = Boolean(meta.dirty);
    lastSynced = meta.lastSynced ?? null;
  } catch {}

  // Modifications locales pas encore envoyées : elles priment.
  if (cached && dirty) {
    schedulePush(cached);
    return cached;
  }
  try {
    const remote = await fetchRemote();
    if (remote) {
      lastSynced = remote.updated_at;
      writeCache(remote.data);
      return remote.data;
    }
    // Nouveau compte : création de la cave.
    const fresh = cached ?? defaults();
    dirty = true;
    await push(fresh);
    return fresh;
  } catch {
    onSyncStatus("offline");
    return cached ?? defaults();
  }
}

async function fetchRemote() {
  const c = await client();
  const { data, error } = await c.from("cellars").select("data, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

let latest = null;
function schedulePush(state) {
  latest = state;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(latest).catch(() => {}), 800);
}

async function push(state) {
  if (!user) return;
  onSyncStatus("syncing");
  try {
    const c = await client();
    const updated_at = new Date().toISOString();
    const { error } = await c.from("cellars").upsert({ user_id: user.id, data: state, updated_at });
    if (error) throw error;
    if (latest === null || latest === state) dirty = false;
    lastSynced = updated_at;
    writeCache(state);
    onSyncStatus("ok");
  } catch (err) {
    onSyncStatus("offline");
    throw err;
  }
}

export function save(state) {
  if (user) dirty = true;
  writeCache(state);
  if (user) schedulePush(state);
}

export async function flush() {
  if (user && dirty && latest) {
    clearTimeout(pushTimer);
    await push(latest).catch(() => {});
  }
}

// Récupère les changements faits depuis un autre appareil.
export async function refresh() {
  if (!user || dirty) return;
  try {
    const remote = await fetchRemote();
    if (remote && remote.updated_at !== lastSynced) {
      lastSynced = remote.updated_at;
      writeCache(remote.data);
      onRemoteChange(remote.data);
    }
  } catch {}
}

export function watch({ remoteChange, syncStatus }) {
  onRemoteChange = remoteChange;
  onSyncStatus = syncStatus;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") (dirty ? flush() : refresh());
    else flush();
  });
  window.addEventListener("online", () => (dirty ? flush() : refresh()));
}

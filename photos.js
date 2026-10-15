// Photos en haute définition, rangées hors de la cave (qui ne garde qu'une miniature par photo) :
// - sur ce navigateur dans IndexedDB (cache, et seul stockage sans compte) ;
// - avec un compte, dans Supabase Storage (seau privé « photos », un dossier par compte).
// Les envois en attente (hors ligne, seau pas encore créé…) sont réessayés plus tard.
import { cloudEnabled, currentUser, supabase } from "./storage.js";

const BUCKET = "photos";
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("macave-photos", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("blobs");
      req.result.createObjectStore("pending"); // id → compte propriétaire (null : saisie sans compte)
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const path = (uid, id) => `${uid}/${id}.jpg`;

let onError = () => {};
export function onPhotoError(cb) {
  onError = cb;
}

// Enregistre une photo et la programme pour l'envoi dans le compte.
export async function putPhoto(id, blob) {
  await idb("blobs", "readwrite", (s) => s.put(blob, id));
  if (cloudEnabled) {
    await idb("pending", "readwrite", (s) => s.put(currentUser()?.id ?? null, id));
    syncPhotos();
  }
}

// URL affichable de la photo : copie locale, sinon téléchargement depuis le compte.
export async function photoUrl(id) {
  let blob = await idb("blobs", "readonly", (s) => s.get(id)).catch(() => null);
  const user = currentUser();
  if (!blob && user) {
    const c = await supabase();
    const { data, error } = await c.storage.from(BUCKET).download(path(user.id, id));
    if (error) throw new Error("Photo introuvable dans le compte (hors ligne ?).");
    blob = data;
    idb("blobs", "readwrite", (s) => s.put(blob, id)).catch(() => {});
  }
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deletePhotos(ids) {
  if (!ids.length) return;
  await idb("blobs", "readwrite", (s) => ids.forEach((id) => s.delete(id))).catch(() => {});
  await idb("pending", "readwrite", (s) => ids.forEach((id) => s.delete(id))).catch(() => {});
  const user = currentUser();
  if (!user) return;
  try {
    const c = await supabase();
    await c.storage.from(BUCKET).remove(ids.map((id) => path(user.id, id)));
  } catch {}
}

// Un seul envoi à la fois ; une demande pendant un envoi en relance un autre ensuite
// (pour les photos ajoutées entre-temps).
let syncing = null;
let again = false;
export function syncPhotos() {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = doSync().finally(() => {
    syncing = null;
    if (again) {
      again = false;
      syncPhotos();
    }
  });
  return syncing;
}

async function doSync() {
  const user = currentUser();
  if (!user || !navigator.onLine) return;
  const d = await db();
  const entries = await new Promise((resolve, reject) => {
    const out = [];
    const req = d.transaction("pending").objectStore("pending").openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push([cur.key, cur.value]);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const c = await supabase();
  for (const [id, owner] of entries) {
    if (owner && owner !== user.id) continue; // photo d'un autre compte sur ce navigateur
    const blob = await idb("blobs", "readonly", (s) => s.get(id));
    if (!blob) {
      await idb("pending", "readwrite", (s) => s.delete(id));
      continue;
    }
    const { error } = await c.storage.from(BUCKET).upload(path(user.id, id), blob, { contentType: "image/jpeg", upsert: true });
    if (error) {
      onError(/bucket not found/i.test(error.message)
        ? "Photos gardées sur cet appareil : l'espace « photos » n'existe pas encore dans Supabase (voir README)."
        : `Envoi des photos impossible pour l'instant (${error.message}).`);
      return;
    }
    await idb("pending", "readwrite", (s) => s.delete(id));
  }
}

addEventListener("online", () => syncPhotos());

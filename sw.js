// Cache hors ligne de l'application (les appels IA nécessitent une connexion).
const CACHE = "macave-v18";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "ai.js", "storage.js", "config.js", "terroir.js", "france-map.js", "pairing.js", "manifest.webmanifest",
  "vendor/anthropic-sdk.js", "vendor/supabase.js", "assets/logo-on-dark.jpg", "assets/logo-on-light.jpg", "assets/logo-icon-on-dark.jpg",
  "icons/favicon.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord pour avoir les mises à jour, cache en secours hors ligne.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});

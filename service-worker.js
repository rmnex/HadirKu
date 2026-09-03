const CACHE_NAME = "hadirku-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./style.css",
  "./app.js",
  "./admin.js",
  "./supabase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first untuk request ke Supabase (data harus selalu real-time),
// cache-first untuk file statis aplikasi (shell UI agar tetap tampil offline).
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (url.includes("supabase.co")) {
    event.respondWith(fetch(event.request).catch(() => new Response(null, { status: 503 })));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

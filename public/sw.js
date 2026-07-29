const PRECACHE_NAME = "sja-pwa-precache-v2";
const RUNTIME_CACHE_NAME = "sja-pwa-runtime-v2";
const MAX_RUNTIME_ENTRIES = 80;
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/pwa-maskable-512x512.png",
  "/apple-touch-icon.png",
  "/favicon-32x32.png",
  "/images/brand/sja-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("sja-pwa-") && key !== PRECACHE_NAME && key !== RUNTIME_CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (!["font", "image", "script", "style"].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(RUNTIME_CACHE_NAME).then(async (cache) => {
            await cache.put(request, responseToCache);

            const keys = await cache.keys();
            const excessEntries = keys.length - MAX_RUNTIME_ENTRIES;
            if (excessEntries > 0) {
              await Promise.all(keys.slice(0, excessEntries).map((key) => cache.delete(key)));
            }
          });
        }

        return networkResponse;
      });
    }),
  );
});

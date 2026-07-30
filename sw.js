const CACHE_NAME = "recette-touch-v5.19.0-post-crop-confidence";
const ASSETS = [
  "./",
  "./index.html",
  "./recipe-ocr-engine.js?v=5.19.0",
  "./manifest.webmanifest",
  "./sw.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./logo.png",
  "./wordmark.png",
  "./kiewit-header.png",
  "./vendor/ocr/tesseract.min.js",
  "./vendor/ocr/worker.min.js",
  "./vendor/ocr/tesseract-core-lstm.wasm.js",
  "./vendor/ocr/lang/eng.traineddata.gz"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
        return response;
      }).catch(() => event.request.mode === "navigate" ? caches.match("./index.html") : Response.error());
    })
  );
});

const CACHE_NAME = "novelty-world-v1";

// Network-first strategy: always try the network, fall back to cache
self.addEventListener("fetch", (event) => {
  // Audio and video stream in byte ranges, which are never cached, so relaying them gains nothing. And a phone that
  // stops the worker while its screen is locked would stop the stream with it.
  const destination = event.request.destination;
  if (destination === "audio" || destination === "video") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache.put() rejects POST requests, partial (206) responses from
        // Range requests (e.g. <audio> seeking), and dynamic API routes
        // shouldn't be persisted at all.
        const cacheable =
          event.request.method === "GET" &&
          response.status === 200 &&
          !new URL(event.request.url).pathname.startsWith("/api/");
        if (cacheable) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Clean up old caches on activation
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

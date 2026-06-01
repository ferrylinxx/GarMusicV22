const CACHE_NAME = "gar-music-v22-cache-v2";
const CORE_ASSETS = ["/", "/admin", "/artwork/cover.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/tracks/") || url.pathname.startsWith("/artwork/")) {
    event.respondWith(mediaCache(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok || response.status === 206) {
    cache.put(request, response.clone());
  }
  return response;
}

async function mediaCache(request) {
  if (request.headers.has("range")) {
    return rangeFromCache(request);
  }

  return cacheFirst(request);
}

async function rangeFromCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = request.url;
  let response = await cache.match(url);

  if (!response) {
    response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response.clone());
    }
  }

  const range = request.headers.get("range");
  const bytesPrefix = "bytes=";
  if (!range || !range.startsWith(bytesPrefix)) {
    return response;
  }

  const [startText, endText] = range.slice(bytesPrefix.length).split("-");
  const start = Number(startText);
  const blob = await response.blob();
  const end = endText ? Number(endText) : blob.size - 1;
  const chunk = blob.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.size),
      "Content-Type": response.headers.get("Content-Type") || "audio/wav"
    }
  });
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || cache.match(fallbackUrl);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

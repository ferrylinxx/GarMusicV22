const CACHE_VERSION = "v9";
const CACHE_NAME = `gar-music-v22-cache-${CACHE_VERSION}`;
const MEDIA_CACHE = `gar-music-media-${CACHE_VERSION}`;
const CORE_ASSETS = ["/", "/admin", "/artwork/cover.png", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          CORE_ASSETS.map((asset) =>
            cache.add(asset).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== MEDIA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/tracks/")) {
    event.respondWith(handleMedia(request));
    return;
  }

  if (url.pathname.startsWith("/artwork/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function handleMedia(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cacheKey = new Request(request.url, { method: "GET" });

  let fullResponse = await cache.match(cacheKey);

  if (!fullResponse) {
    const fetchRequest = new Request(request.url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    try {
      const network = await fetch(fetchRequest);
      if (network && network.ok) {
        await cache.put(cacheKey, network.clone());
        fullResponse = network;
      } else {
        return network;
      }
    } catch (error) {
      return new Response("Network error", { status: 504 });
    }
  }

  const range = request.headers.get("range");
  if (!range) {
    return fullResponse.clone();
  }

  return serveRange(fullResponse, range);
}

async function serveRange(fullResponse, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return fullResponse.clone();
  }

  const blob = await fullResponse.clone().blob();
  const total = blob.size;
  const startText = match[1];
  const endText = match[2];

  const start = startText === "" ? Math.max(total - Number(endText || 0), 0) : Number(startText);
  const end = endText === "" ? total - 1 : Math.min(Number(endText), total - 1);

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`
      }
    });
  }

  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.size),
      "Content-Type": fullResponse.headers.get("Content-Type") || "audio/wav"
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
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const fallback = await cache.match(fallbackUrl);
    return fallback || new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

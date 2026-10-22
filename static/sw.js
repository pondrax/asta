// Tapak Astà service worker.
//
// The rules here are deliberately conservative: anything that carries live data
// (remote functions, client-side navigation data, the version manifest) is
// always fetched from the network, so a redeploy can never leave the app
// showing stale numbers. Only content-hashed build output and static media are
// cached.
//
// __ASTA_BUILD_VERSION__ is replaced with a per-build value by fix.sh, so every
// deployment produces a different worker script. The browser only reinstalls a
// service worker when its bytes change, so without this the old worker (and
// its cache) would survive every deployment.
const BUILD_VERSION = "__ASTA_BUILD_VERSION__";

// Content-hashed build output and static media. Deliberately not purged: the
// file names change whenever the content changes, so an entry can never be
// stale, and keeping them lets a tab that is still running the previous
// release finish loading its lazy chunks after a redeploy.
const ASSET_CACHE = "asta-assets-v1";

// The offline fallback document. Pinned to the build so a redeploy drops the
// previous shell instead of serving an outdated page.
const SHELL_CACHE = `asta-shell-${BUILD_VERSION}`;

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const IMAGE_OR_FONT = /\.(?:png|jpe?g|svg|webp|avif|gif|ico|woff2?)$/i;

const isLiveData = (pathname) =>
  // remote function calls — the data path for every `*.remote.ts` query
  pathname.startsWith("/_app/remote/") ||
  // the version manifest used to detect a new deployment
  pathname === "/_app/version.json" ||
  // client-side navigation data (`/main/__data.json`, `/x.html__data.json`)
  pathname.endsWith("/__data.json") ||
  pathname.endsWith(".html__data.json") ||
  // route resolution endpoint
  pathname.endsWith("/__route.js") ||
  // the app's own API routes
  pathname.startsWith("/api/");

const isStaticAsset = (pathname) =>
  pathname.startsWith("/icons/") ||
  pathname === "/manifest.webmanifest" ||
  // The lottie animations are static files with a stable name.
  pathname.endsWith(".json") ||
  IMAGE_OR_FONT.test(pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  // Take over as soon as the new worker is ready; the page keeps running the
  // old code until it is reloaded, which the update prompt takes care of.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== ASSET_CACHE && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Live data never comes from the cache.
  if (isLiveData(url.pathname)) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/")
          .then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Content-hashed build output: cache first, it can never go stale.
  if (url.pathname.startsWith("/_app/immutable/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Any other `/_app/` endpoint is unknown to us — go to the network.
  if (url.pathname.startsWith("/_app/")) return;

  // Static media: serve the cached copy, refresh it in the background.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/**
 * Cache the app shell so the app still opens without a network.
 * @returns {Promise<void>}
 */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);

  await Promise.all(
    APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (response.ok && response.type === "basic") {
          await cache.put(path, response);
        }
      } catch {
        // A missing icon must not fail the install.
      }
    }),
  );
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    network.catch(() => {});
    return cached;
  }

  return (await network) ?? new Response("", { status: 504, statusText: "Offline" });
}

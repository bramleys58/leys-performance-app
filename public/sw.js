// Leys Performance service worker.
// Goal: the app still opens in a gym without signal. Pages you opened before
// are kept on the phone and shown when the network does not answer. Nothing is
// ever served from the phone while the network works, so data stays fresh.
const VERSION = "v1";
const PAGES = `lp-pages-${VERSION}`;
const ASSETS = `lp-assets-${VERSION}`;
const MAX_PAGES = 40;
const NEVER = [/^\/login/, /^\/auth\//, /^\/setup/];

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No connection | Leys Performance</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0d10;color:#e8eaed;font-family:system-ui,sans-serif;text-align:center;padding:24px}p{color:#9aa3ad;max-width:22rem;line-height:1.5}a,button{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:12px;border:1px solid #2a3038;background:#161a20;color:#e8eaed;font-size:16px;text-decoration:none}</style></head>
<body><div><h1>No connection</h1><p>This screen was not opened on this phone before, so it cannot be shown without a connection. Sets you already ticked are safe on this phone.</p><button onclick="location.reload()">Try again</button><br><a href="/">Go to Today</a></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("lp-") && key !== PAGES && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// Logging out (or landing on the login screen) wipes the kept pages, so nothing personal stays behind.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear-pages") event.waitUntil(caches.delete(PAGES));
  // The app moves between screens without full page loads, so it asks to keep the important ones.
  if (data.type === "keep-page" && typeof data.url === "string") event.waitUntil(keep(data.url));
  if (data.type === "keep-assets" && Array.isArray(data.urls)) event.waitUntil(keepAssets(data.urls));
});

async function keep(href) {
  try {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin || NEVER.some((r) => r.test(url.pathname))) return;
    const response = await fetch(url.href, { credentials: "same-origin", headers: { accept: "text/html" } });
    if (response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html")) {
      const cache = await caches.open(PAGES);
      await cache.put(url.href, response);
      trim(cache);
    }
  } catch {
    // No connection right now: the earlier copy, if any, stays.
  }
}

async function keepAssets(urls) {
  const cache = await caches.open(ASSETS);
  for (const href of urls.slice(0, 200)) {
    try {
      const url = new URL(href, self.location.origin);
      if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
      if (!(await cache.match(url.href))) {
        const response = await fetch(url.href);
        if (response.ok) await cache.put(url.href, response);
      }
    } catch {
      // Skip what cannot be fetched.
    }
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    const landed = new URL(response.url || request.url);
    if (NEVER.some((r) => r.test(landed.pathname))) {
      // Sent to the login screen: the session is over, forget the kept pages.
      await caches.delete(PAGES);
    } else if (response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html")) {
      await cache.put(request.url, response.clone());
      trim(cache);
    }
    return response;
  } catch {
    const kept = await cache.match(request.url);
    if (kept) return kept;
    return new Response(OFFLINE_PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Built files have a unique name per version, so a kept copy is always right.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(asset(request));
    return;
  }
  // Full page loads only. In-app data requests are left alone.
  if (request.mode === "navigate" && !NEVER.some((r) => r.test(url.pathname))) event.respondWith(page(request));
});

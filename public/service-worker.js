// Brenda service worker.
//
// BUILD is stamped by server.js at serve time (git SHA on Render, restart
// timestamp locally), so every deploy ships byte-different SW source. The
// browser -- and the Google Play TWA WebView, which has no hard-refresh --
// then re-installs this SW, which:
//   * deletes every old cache (activate)
//   * takes control of open pages immediately (skipWaiting + clients.claim)
//   * serves same-origin requests network-first, bypassing a stale HTTP cache
// so a stale index.html / app.js / taskManager.js can never get stuck.

const BUILD = '__BUILD__';
const CACHE = 'brenda-' + BUILD;

// Cross-origin hosts we're allowed to cache (fonts + CDN libs). Anything else
// cross-origin (analytics, third-party APIs) is left entirely to the browser.
const THIRD_PARTY = ['fonts.gstatic.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  const sameOrigin = url.origin === self.location.origin;

  // Never intercept the API or the SW file itself -- always straight to network.
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname === '/service-worker.js')) {
    return;
  }

  if (sameOrigin) {
    // Network-first: fetch revalidating (unchanged files still come back 304),
    // fall back to cache only when the network fails.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });
        if (fresh && fresh.ok && fresh.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = (await caches.match('/index.html')) || (await caches.match('/'));
          if (shell) return shell;
        }
        throw err;
      }
    })());
    return;
  }

  if (THIRD_PARTY.includes(url.hostname)) {
    // Stale-while-revalidate for fonts / CDN.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      return cached || (await network) || fetch(req);
    })());
  }
  // else: cross-origin and not whitelisted -> leave it to the browser.
});

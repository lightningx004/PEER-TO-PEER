/* ─────────────────────────────────────────
   NEXUS LINK — Service Worker
   Caches all static assets so the app
   loads fully offline after first visit.
   ───────────────────────────────────────── */

const CACHE_NAME = 'nexus-link-v1';

// Everything needed to run the app UI offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon.png',
  // Google Fonts — cached on first load
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap'
];

// ── Install: cache all static assets ──────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache same-origin assets reliably
      const localAssets = STATIC_ASSETS.filter(url => !url.startsWith('http'));
      await cache.addAll(localAssets);

      // Cache external fonts with no-cors (opaque response — still works offline)
      const fontAssets = STATIC_ASSETS.filter(url => url.startsWith('http'));
      await Promise.allSettled(
        fontAssets.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(res => cache.put(url, res))
            .catch(() => {}) // fine if fonts miss — fallback font works
        )
      );

      console.log('[SW] All assets cached');
    })
  );
  // Activate immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: clear old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => { console.log('[SW] Deleting old cache:', key); return caches.delete(key); })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache-first for static, network-first for API/socket ───
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Socket.io or API calls — they need live network
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/upload') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return; // Let browser handle normally
  }

  // For navigation requests (page load) and static assets: Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache instantly, then update cache in background
        const networkUpdate = fetch(event.request)
          .then(res => {
            if (res && res.status === 200 && res.type !== 'opaque') {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
            }
            return res;
          })
          .catch(() => {}); // Ignore network errors when offline

        return cached; // Return cache immediately (fast!)
      }

      // Not in cache — try network, then cache it
      return fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => {
          // Network failed and not cached — return offline fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

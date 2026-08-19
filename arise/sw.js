/* Discipline service worker — offline-first app shell. */
/* Bump on every shipped change to styles.css or js/ — the fetch handler is
   cache-first, so without a new VERSION an existing install keeps serving the
   old shell until a second load. */
const VERSION = 'discipline-v60';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  /* The typeface ships with the app. It is precached with everything else so a
     cold offline start renders in Archivo rather than falling back mid-session. */
  './fonts/archivo-latin.woff2',
  './fonts/archivo-latin-ext.woff2',
  './fonts/archivo-vietnamese.woff2',
  './js/data.js',
  './js/program.js',
  './js/goals.js',
  './js/run.js',
  './js/photos.js',
  './js/store.js',
  './js/ui.js',
  './js/app.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // addAll is all-or-nothing; tolerate a single missing asset instead of failing install.
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The page asks what build is serving it. Without this the only way to tell a
   stale shell from a fresh one is to read the cache name in devtools, and
   "it didn't update" is indistinguishable from "it's broken". */
self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.source) event.source.postMessage({ version: VERSION });
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Navigations: network first so updates land, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

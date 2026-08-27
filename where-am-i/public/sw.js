/**
 * The service worker.
 *
 * Copied verbatim from public/, so it is a plain classic script with no
 * imports and no build step behind it.
 *
 * There is no precache manifest. Vite hashes its asset filenames, so a
 * generated list would have to be regenerated on every build and would be
 * wrong the moment it was not. Instead: the shell is precached by hand, and
 * everything else is cached the first time the page asks for it. A hashed
 * filename can never be stale, so cache-first is safe for assets and wrong for
 * navigation — which is why navigation is handled separately.
 */

const VERSION = 'v1';
const CACHE = `where-am-i-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one missing icon cannot fail the whole install and
      // leave the app with no worker at all.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network first, so a deployed update is picked up on the next
  // online visit rather than being pinned by the cache. The cached shell is
  // what makes the app open at all on a train.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      // Opaque and error responses are not worth keeping; a cached 404 is a
      // 404 forever.
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

// Offline support: precaches the whole app on install and serves it cache-first.
// VERSION is stamped by Tools/build_web.py from the content of these files, so any change ships
// as a new cache; the page reloads itself onto it (see registerServiceWorker in js/app.js).
const VERSION = 'c947e78f044e';
const CACHE = `deutschmeister-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'vocab-bundle.json',
  'js/app.js',
  'js/domain.js',
  'js/model.js',
  'js/sessions.js',
  'js/speech.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('deutschmeister-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true })
        ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
      return cached ?? fetch(request);
    }),
  );
});

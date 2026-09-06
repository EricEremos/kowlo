// Bump this release whenever a listed asset changes. Updates wait for old tabs to close.
const CACHE_PREFIX = 'hk-photo-diagnostic-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v12`;
const ASSETS = [
  '/experiments/photo-import/index.html',
  '/experiments/photo-import/style.css',
  '/experiments/photo-import/diagnostic.mjs',
  '/experiments/photo-import/offline.mjs',
  '/experiments/photo-import/journal-panel.mjs',
  '/experiments/photo-import/worker.mjs',
  '/experiments/photo-import/metadata.mjs',
  '/experiments/photo-import/palette.mjs',
  '/experiments/photo-import/districts.mjs',
  '/src/journal/local-journal.mjs',
  '/src/journal/geojson-export.mjs',
  '/src/geography/place-catalog.mjs',
  '/src/geography/nearby-places.mjs',
  '/src/geography/memory-print.mjs',
  '/data/reference/hk-place-points.geojson',
  '/data/reference/hk-place-names.json',
  '/node_modules/exifr/dist/full.esm.mjs',
  '/node_modules/point-in-polygon-hao/dist/pointInPolygon.js',
  '/data/reference/hk-districts.geojson',
];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.location.origin).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(ASSETS.map(path => new Request(new URL(path, self.location.origin), {
        cache: 'reload', credentials: 'omit', redirect: 'error',
      })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  // Never cache photos, private data, API responses, query strings or authenticated requests.
  if (request.method !== 'GET' || request.headers.has('authorization') || !assetURLs.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request) ?? fetch(request);
  })());
});

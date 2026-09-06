// Bump the release when any listed asset changes. Updates wait for open tabs to close.
const CACHE_PREFIX = 'kowlo-atlas-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const ASSETS = [
  '/app/index.html',
  '/app/styles.css',
  '/app/atlas.mjs',
  '/app/offline.mjs',
  '/app/fonts/dmsans.ttf',
  '/app/fonts/newsreader.ttf',
  '/app/fonts/spacegrotesk.ttf',
  '/docs/design-assets/kowlo-symbol.svg',
  '/docs/design-assets/memory-print-empty.svg',
  '/src/journal/local-journal.mjs',
  '/src/geography/memory-print.mjs',
  '/experiments/photo-import/districts.mjs',
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
  const url = new URL(request.url);
  url.hash = '';
  // No runtime caching of photographs, journals, APIs, query strings or authenticated requests.
  if (request.method !== 'GET' || request.headers.has('authorization') || !assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(url.href) ?? fetch(request);
  })());
});

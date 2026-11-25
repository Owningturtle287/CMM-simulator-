/* The build supplies the version and the files needed for an offline startup. */
const CACHE_NAME = 'accura-__BUILD_ID__';
const APP_FILES = __BUILD_FILES__;
const entry = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('accura-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE_NAME)).match(entry)));
  } else {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(event.request)) ?? fetch(event.request)));
  }
});

// Only the public consultation shell is cached. Authenticated API responses never enter Cache Storage.
const CACHE = 'stockpro-offline-shell-v3';
const FILES = ['/offline.html', '/offline-ui.mjs', '/offline-data.mjs', '/offline-queue.mjs', '/offline-autosync.mjs'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stockpro-offline-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  } else if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
  }
});

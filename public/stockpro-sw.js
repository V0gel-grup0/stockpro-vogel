// Only the public consultation shell is cached. Authenticated API responses never enter Cache Storage.
const CACHE = 'stockpro-offline-shell-v10';
const FILES = ['/offline.html', '/offline-ui.mjs', '/offline-data.mjs', '/offline-queue.mjs', '/offline-autosync.mjs', '/offline-policy.mjs', '/offline-files.mjs', '/offline-stock-ui.mjs'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { payload = null; }
  const acknowledge = async state => {
    if (typeof payload?.testId !== 'string') return;
    try { await fetch('/api/push/receipt', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({testId:payload.testId,state}) }); } catch {}
  };
  event.waitUntil((async () => {
    // Display promptly, even if the receipt endpoint is slow or unavailable.
    const received = acknowledge('received');
    try { await self.registration.showNotification('StockPro Vogel', {
    body: typeof payload?.body === 'string' ? payload.body.slice(0, 400) : 'Você tem novos avisos. Abra o StockPro para conferir.',
    icon: '/api/app-icon?v=3&size=192', tag: typeof payload?.tag === 'string' ? payload.tag.slice(0, 100) : 'stockpro-reminder',
    data: { url: '/notificacoes' },
    }); await received; await acknowledge('displayed'); }
    catch { await received; await acknowledge('failed'); }
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type === 'stockpro-push-ping') event.ports?.[0]?.postMessage({type:'stockpro-push-ready'});
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate('/notificacoes'); return existing.focus(); }
    return self.clients.openWindow('/notificacoes');
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stockpro-offline-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      try { const response = await fetch(event.request, { cache: 'no-store' }); if (response.ok) { await cache.put(url.pathname, response.clone()); return response; } } catch {}
      return (await cache.match(url.pathname)) || new Response('Conecte-se para atualizar o modo offline.', { status: 503 });
    }));
  } else if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
  }
});

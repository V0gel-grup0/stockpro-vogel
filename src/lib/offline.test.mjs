import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { KEY, TTL, clear, prepare, read, validate, identity } from '../../public/offline-data.mjs';
const account = { id: 'alice', name: 'Alice', role: 'representante', status: 'approved', permissions: {} };
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
function fetcher(profile = account) { return async url => url === '/api/auth/profile' ? Response.json(profile) : url === '/api/clients' ? Response.json({ sucesso: true, clients: [{ name: '<script>untrusted</script>', document: '123', created_by: 'secret-id' }] }) : new Response('{}', { status: 403 }); }
test('cópia salva apenas áreas autorizadas e campos de consulta; expira em oito horas', async () => {
  const store = storage(); const now = Date.now();
  const snapshot = await prepare(store, fetcher(), now);
  assert.deepEqual(snapshot.sections.map(section => section.name), ['Clientes']);
  assert.deepEqual(snapshot.sections[0].rows, [{ name: '<script>untrusted</script>', document: '123' }]);
  assert.equal(read(store, now + TTL - 1).name, 'Alice');
  assert.equal(read(store, now + TTL), null);
  assert.equal(store.getItem(KEY), null);
});
test('erro de API ou sessão não salva cópia incompleta', async () => {
  for (const status of [401, 500]) {
    const store = storage();
    await assert.rejects(prepare(store, async url => url === '/api/auth/profile' ? Response.json(account) : new Response('{}', { status })));
    assert.equal(read(store), null);
  }
});
test('sair durante preparação impede gravação tardia de dados da conta anterior', async () => {
  const store = storage(); let profiles = 0;
  await assert.rejects(prepare(store, async url => {
    if (url === '/api/auth/profile' && ++profiles === 2) clear(store);
    return fetcher()(url);
  }), /conta ou o acesso mudou/);
  assert.equal(read(store), null);
});
test('troca de usuário ou permissão elimina consulta salva; internet ausente permite cópia válida', async () => {
  const store = storage(); await prepare(store, fetcher());
  assert.equal((await validate(store, async () => { throw Error('offline'); })).name, 'Alice');
  assert.equal(await validate(store, fetcher({ ...account, role: 'administrador' })), null);
  assert.equal(read(store), null);
  await prepare(store, fetcher());
  assert.equal(await validate(store, async () => new Response('{}', { status: 401 })), null);
  assert.equal(identity({ b: 2, a: 1 }), identity({ a: 1, b: 2 }));
});
test('logout durante revalidação não restaura dados em memória', async () => {
  const store = storage(); await prepare(store, fetcher());
  assert.equal(await validate(store, async () => { clear(store); return Response.json(account); }), null);
});
test('service worker deixa APIs e gravações fora do cache e oferece consulta em navegação sem rede', async () => {
  const handlers = {}; let calls = 0;
  vm.runInNewContext(readFileSync(new URL('../../public/stockpro-sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://stock.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } }, URL,
    fetch: async () => { throw Error('offline'); },
    caches: { open: async () => ({ match: async path => { assert.equal(path, '/offline.html'); return new Response('offline consultation'); } }) },
  });
  for (const [method, path] of [['GET', '/api/clients'], ['POST', '/api/orders'], ['GET', 'https://other.test/']]) {
    handlers.fetch({ request: { method, url: path.startsWith('https:') ? path : `https://stock.test${path}`, mode: 'navigate' }, respondWith: () => { calls++; } });
  }
  assert.equal(calls, 0);
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://stock.test/', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'offline consultation');
});

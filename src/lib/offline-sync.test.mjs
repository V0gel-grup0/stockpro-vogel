import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { enqueue, listQueue, syncQueue, revise } from '../../public/offline-queue.mjs';
import * as offlinePolicy from '../../public/offline-policy.mjs';
const require = createRequire(import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const op1 = '33333333-3333-4333-8333-333333333333';
const op2 = '44444444-4444-4444-8444-444444444444';
const actor = { id: owner, role: 'representante', status: 'approved' };
const snapshot = { owner_id: owner, role: actor.role, expiresAt: Date.now() + 60000 };
function storage() { const map = new Map(); return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
function compile(path, overrides = {}) {
  overrides={
    '@/lib/offline-stock-server':{recordOfflineAssembly(){throw Error('Unexpected assembly');},recordOfflineExit(){throw Error('Unexpected exit');},OfflineStockError:class extends Error{}},
    '@/lib/offline-policy':offlinePolicy,
    '@/lib/assembly-work-server':{ensureAssemblyWorkTable:async()=>{}},
    '@/lib/movement-invoice-server':{ensureMovementInvoices:async()=>{}},
    '@/lib/movement-invoice-policy':{},
    '@/lib/prisma-json':{toJsonSafe:value=>value},
    ...overrides,
  };
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', js)(name => name in overrides ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
function service(failWorkflow = false) {
  const state = { receipts: new Map(), clients: [], orders: [], workflow: 0 };
  const tx = {
    $queryRaw: async (strings, ...args) => { const receipt = state.receipts.get(args[1]); return receipt ? [receipt] : []; },
    $executeRaw: async (strings, ...args) => { state.receipts.set(args[1], { payload_hash: args[2], result: JSON.parse(args[3]) }); },
    clients: { create: async ({ data }) => { const row = { id: clientId, ...data }; state.clients.push(row); return row; }, findFirst: async ({ where }) => where.id === clientId ? { id: clientId } : null },
    products: { findUnique: async () => ({ id: op2 }) },
    orders: { create: async ({ data }) => { const row = { id: op2, order_number: 123n, ...data }; state.orders.push(row); return row; } },
  };
  const lib = compile('src/lib/offline-sync-server.ts', {
    '@/lib/prisma': { prisma: {} },
    '@/lib/validacao-cadastro': compile('src/lib/validacao-cadastro.ts'),
    '@/lib/order-pricing': compile('src/lib/order-pricing.ts'),
    '@/lib/equipment-catalog': compile('src/lib/equipment-catalog.ts'),
    '@/lib/client-visibility': { buildAccessibleClientWhere: (account, id) => ({ id, created_by: account.id }) },
    '@/lib/order-workflow-server': { syncOrderWorkflow: async () => { if (failWorkflow) throw Error('workflow failed'); state.workflow++; } },
  });
  return { ...lib, tx, state };
}
const clientPayload = { name: 'Maria Silva', phone: '45999887766', city: '', document: '' };
const clientOp = { owner_id: owner, operation_id: op1, type: 'client', payload: clientPayload };
test('cliente offline tem recibo durável: repetir após perda de resposta não duplica', async () => {
  const s = service();
  const first = await s.applyOfflineOperation(s.tx, actor, clientOp);
  assert.deepEqual(await s.applyOfflineOperation(s.tx, actor, { ...clientOp, payload: { document: '', city: '', phone: '45999887766', name: 'Maria Silva' } }), first);
  assert.equal(s.state.clients.length, 1);
  await assert.rejects(s.applyOfflineOperation(s.tx, actor, { ...clientOp, payload: { ...clientPayload, name: 'Outra Pessoa' } }), /outros dados/);
});
test('pedido resolve cliente local, calcula valores e executa CRM apenas uma vez', async () => {
  const s = service(); await s.applyOfflineOperation(s.tx, actor, clientOp);
  const op = { owner_id: owner, operation_id: op2, type: 'order', payload: { client_operation_id: op1, item_type: 'equipamento', equipment_name: 'Celt5000 Plus - 380V 3 turbinas + Mínima', quantity: 2, unit_price: 5000, shipping_value: 150, status: 'entregue', created_by: op2 } };
  const result = await s.applyOfflineOperation(s.tx, actor, op);
  assert.equal(result.order.order_number, '123');
  await s.applyOfflineOperation(s.tx, actor, op);
  assert.equal(s.state.orders.length, 1); assert.equal(s.state.workflow, 1);
  assert.equal(s.state.orders[0].client_id, clientId);
  assert.equal(s.state.orders[0].created_by, owner);
  assert.equal(s.state.orders[0].status, 'pendente');
  assert.equal(s.state.orders[0].total_value, 10000);
  assert.equal(s.state.orders[0].shipping_value, 150);
});
test('sem cliente autorizado, com conta diferente ou quantidade inválida não cria pedido', async () => {
  const s = service();
  await assert.rejects(s.applyOfflineOperation(s.tx, actor, { ...clientOp, owner_id: op2 }), /conta/);
  const op = { owner_id: owner, operation_id: op2, type: 'order', payload: { client_id: op1, item_type: 'produto', item_id: op2, quantity: 1, unit_price: 10 } };
  await assert.rejects(s.applyOfflineOperation(s.tx, actor, op), /sem permissão/);
  await assert.rejects(s.applyOfflineOperation(s.tx, actor, { ...op, payload: { ...op.payload, client_id: clientId, quantity: -1 } }), /quantidade/);
  assert.equal(s.state.orders.length, 0); assert.equal(s.state.receipts.size, 0);
});
test('falha no workflow não produz recibo de sucesso', async () => {
  const s = service(true);
  await assert.rejects(s.applyOfflineOperation(s.tx, actor, { owner_id: owner, operation_id: op2, type: 'order', payload: { client_id: clientId, item_type: 'produto', item_id: op2, quantity: 1, unit_price: 10 } }), /workflow failed/);
  assert.equal(s.state.receipts.size, 0);
});
test('fila isola contas e envia cadastro antes do pedido, preservando confirmação', async () => {
  const store = storage();
  enqueue(store, snapshot, 'client', clientPayload, 'Maria', op1);
  enqueue(store, snapshot, 'order', { client_operation_id: op1 }, 'Pedido', op2);
  assert.equal(listQueue(store, 'other-account').length, 0);
  const calls = [];
  const fetcher = async (url, options) => {
    if (url === '/api/auth/profile') return Response.json(actor);
    const body = JSON.parse(options.body); calls.push(body.type);
    return Response.json({ sucesso: true, type: body.type, ...(body.type === 'client' ? { client: { id: clientId } } : { order: { id: op2, order_number: '123' } }) });
  };
  await syncQueue(store, owner, fetcher); await syncQueue(store, owner, fetcher);
  assert.deepEqual(calls, ['client', 'order']);
  assert.ok(listQueue(store, owner).every(row => row.state === 'sent'));
});
test('perda de conexão, sessão expirada e conta trocada não apagam pendentes', async () => {
  const store = storage(); enqueue(store, snapshot, 'client', clientPayload, 'Maria', op1);
  await assert.rejects(syncQueue(store, owner, async url => { if (url === '/api/auth/profile') return Response.json(actor); throw Error('lost response'); }), /interrompida/);
  await assert.rejects(syncQueue(store, owner, async () => new Response('{}', { status: 401 })), /Entre novamente/);
  await assert.rejects(syncQueue(store, owner, async () => Response.json({ ...actor, id: clientId })), /conta/);
  assert.equal(listQueue(store, owner).length, 1); assert.equal(listQueue(store, owner)[0].operation_id, op1);
});
test('cliente rejeitado mantém erro e impede envio do pedido dependente', async () => {
  const store = storage(); enqueue(store, snapshot, 'client', clientPayload, 'Maria', op1); enqueue(store, snapshot, 'order', { client_operation_id: op1 }, 'Pedido', op2);
  let posts = 0;
  await syncQueue(store, owner, async url => { if (url === '/api/auth/profile') return Response.json(actor); posts++; return Response.json({ sucesso: false, erro: 'Telefone inválido' }, { status: 400 }); });
  assert.equal(posts, 1); assert.match(listQueue(store, owner)[0].error, /Telefone/); assert.equal(listQueue(store, owner)[1].state, 'pending');
  const corrected = revise(store, snapshot, op1, { ...clientPayload, phone: '45991234567' }, 'Maria corrigida');
  assert.equal(corrected.operation_id, op1); assert.equal(corrected.error, '');
  assert.throws(() => revise(store, snapshot, op2, {}, 'Pedido alterado'), /confirmação/);
});
test('endpoint exige função comercial antes do banco e mantém pedido/CRM/recibo na mesma transação', async () => {
  const s = service(true); let authorized = false; let ddl = 0;
  const { POST } = compile('app/api/offline-sync/route.ts', {
    '@/lib/api-auth': { authorizeApi: async roles => { assert.ok(roles.includes('representante')); assert.ok(roles.includes('tecnico')); return authorized ? { profile: actor } : { response: new Response('{}', { status: 403 }) }; } },
    '@/lib/permissions': { ORDER_ROLES: ['administrador', 'gerente', 'vendedor', 'funcionario', 'representante'] },
    '@/lib/equipment-catalog': { EQUIPMENT_CATALOG: [] },
    '@/lib/prisma': { prisma: { $transaction: async callback => {
      const original = s.tx.$queryRaw;
      s.tx.$queryRaw = async (strings, ...args) => strings.join('').includes('FROM profiles') ? [{ id: owner }] : original(strings, ...args);
      try { return await callback(s.tx); }
      catch (error) { s.state.clients.length = 0; s.state.orders.length = 0; s.state.receipts.clear(); throw error; }
    } } },
    '@/lib/order-workflow-server': { ensureOrderWorkflowTables: async () => { ddl++; }, OrderWorkflowError: class extends Error {} },
    '@/lib/offline-sync-server': { ...s, ensureOfflineReceipts: async () => { ddl++; } },
  });
  const request = () => new Request('https://test/api/offline-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_id: owner, operation_id: op2, type: 'order', payload: { client_id: clientId, item_type: 'produto', item_id: op2, quantity: 1, unit_price: 10 } }) });
  assert.equal((await POST(request())).status, 403); assert.equal(ddl, 0);
  authorized = true;
  const response = await POST(request()); assert.equal(response.status, 500);
  assert.equal(s.state.orders.length, 0); assert.equal(s.state.receipts.size, 0);
});

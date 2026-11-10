import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { enqueue, listQueue, syncQueue } from '../../public/offline-queue.mjs';
import { validarCadastroPessoa } from './validacao-cadastro.ts';
import { calculateOrderValues } from './order-pricing.ts';
import { EQUIPMENT_CATALOG } from './equipment-catalog.ts';
import { canQueueOperation } from '../../public/offline-policy.mjs';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const clientOp = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderOp = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function storage() { const map = new Map(); return { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; }
const snapshot = () => ({ owner_id: owner, role: 'representante', expiresAt: Date.now() + 3600000 });
test('fila mantém cliente e pedido dependente; envia cliente primeiro e não reenvia confirmados', async () => {
  const store = storage();
  enqueue(store, snapshot(), 'order', { client_operation_id: clientOp }, 'Pedido', orderOp);
  enqueue(store, snapshot(), 'client', { name: 'Maria Silva' }, 'Cliente', clientOp);
  const calls = [];
  const fetcher = async (url, options) => {
    if (url === '/api/auth/profile') return Response.json({ id: owner, role: 'representante' });
    const body = JSON.parse(options.body); calls.push(body.type);
    return Response.json({ sucesso: true, type: body.type, ...(body.type === 'client' ? { client: { id: 'server-client' } } : { order: { id: 'server-order', order_number: '100' } }) });
  };
  await syncQueue(store, owner, fetcher);
  await syncQueue(store, owner, fetcher);
  assert.deepEqual(calls, ['client','order']);
  assert.ok(listQueue(store, owner).every(row => row.state === 'sent'));
  assert.deepEqual(listQueue(store, 'other-account'), []);
});
test('perda de conexão preserva operação e identificador para reenvio; outra conta não envia', async () => {
  const store = storage(); enqueue(store, snapshot(), 'client', { name: 'Maria Silva' }, 'Cliente', clientOp);
  await assert.rejects(syncQueue(store, owner, async url => url === '/api/auth/profile' ? Response.json({ id: owner, role: 'representante' }) : Promise.reject(Error('offline'))));
  assert.equal(listQueue(store, owner)[0].operation_id, clientOp);
  assert.equal(listQueue(store, owner)[0].state, 'pending');
  let posts = 0;
  await assert.rejects(syncQueue(store, owner, async url => { if (url !== '/api/auth/profile') posts++; return Response.json({ id: 'another', role: 'administrador' }); }));
  assert.equal(posts, 0);
  assert.throws(() => enqueue(store, { ...snapshot(), role: 'tecnico' }, 'client', {}, 'Invalid', orderOp));
});
function serverFixture({ failWorkflow = false } = {}) {
  const source = readFileSync(new URL('./offline-sync-server.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const code = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const receipts = new Map(), clients = [], orders = [], workflows = [];
  const tx = {
    $queryRaw: async (parts, ...values) => {
      const receipt = receipts.get(values[1]); return receipt ? [receipt] : [];
    },
    $executeRaw: async (parts, actor, id, hash, result) => receipts.set(id, { payload_hash: hash, result: JSON.parse(result) }),
    clients: { create: async ({data}) => { const row = { ...data, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }; clients.push(row); return row; }, findFirst: async () => clients[0] },
    products: { findUnique: async () => ({id:'product'}) },
    orders: { create: async ({data}) => { const row = { ...data, id: 'order', order_number: 100n }; orders.push(row); return row; } },
  };
  const module = { exports: {} };
  new Function('module','exports','createHash','prisma','validarCadastroPessoa','calculateOrderValues','EQUIPMENT_CATALOG','buildAccessibleClientWhere','syncOrderWorkflow','canQueueOperation', output)(module,module.exports,createHash,{},validarCadastroPessoa,calculateOrderValues,EQUIPMENT_CATALOG,(actor,id)=>({id}),async (transaction,order)=>{ assert.equal(transaction,tx); workflows.push(order); if(failWorkflow)throw Error('workflow'); },canQueueOperation);
  return { ...module.exports, tx, receipts, clients, orders, workflows };
}
const clientBody = { owner_id: owner, operation_id: clientOp, type: 'client', payload: { name: 'Maria Silva', phone: '45999123456', document: '', city: '', cep: '', street: '', number: '', neighborhood: '' } };
const orderBody = { owner_id: owner, operation_id: orderOp, type: 'order', payload: { client_operation_id: clientOp, item_type: 'equipamento', equipment_name: 'CeltPlus - 220V', quantity: 2, unit_price: 100.1, shipping_value: 10, total_value: 999999 } };
test('servidor reutiliza recibo em reenvio, resolve cliente offline, recalcula valores e aciona CRM uma vez', async () => {
  const f = serverFixture(); const actor = { id: owner, role: 'representante' };
  const client = await f.applyOfflineOperation(f.tx, actor, clientBody);
  assert.deepEqual(await f.applyOfflineOperation(f.tx, actor, clientBody), client);
  const order = await f.applyOfflineOperation(f.tx, actor, orderBody);
  assert.deepEqual(await f.applyOfflineOperation(f.tx, actor, orderBody), order);
  assert.equal(f.clients.length, 1); assert.equal(f.orders.length, 1); assert.equal(f.workflows.length, 1);
  assert.equal(f.orders[0].created_by, owner); assert.equal(f.orders[0].client_id, client.client.id);
  assert.equal(f.orders[0].total_value, 200.2); assert.equal(f.orders[0].shipping_value, 10);
  await assert.rejects(f.applyOfflineOperation(f.tx, actor, { ...orderBody, payload: { ...orderBody.payload, quantity: 3 } }), /outros dados/);
});
test('servidor rejeita autor adulterado, cliente não enviado e equipamento inexistente', async () => {
  const f = serverFixture(); const actor = { id: owner, role: 'representante' };
  await assert.rejects(f.applyOfflineOperation(f.tx, actor, { ...clientBody, owner_id: 'another' }), /conta/);
  await assert.rejects(f.applyOfflineOperation(f.tx, actor, orderBody), /primeiro/);
  await f.applyOfflineOperation(f.tx, actor, clientBody);
  await assert.rejects(f.applyOfflineOperation(f.tx, actor, { ...orderBody, payload: { ...orderBody.payload, equipment_name: 'invalid' } }), /Equipamento inválido/);
  assert.equal(f.orders.length, 0);
});
test('cliente offline preserva a proposta selecionada e o cadastrador continua sendo o autor',async()=>{
  const f=serverFixture();
  await f.applyOfflineOperation(f.tx,{id:owner,role:'vendedor'},{...clientBody,payload:{...clientBody.payload,proposal_status:'Lead Morno',created_by:'another'}});
  assert.equal(f.clients[0].proposal_status,'Lead Morno');assert.equal(f.clients[0].created_by,owner);
});

test('pedido offline aplica desconto e mantém o valor líquido no CRM', async () => {
  const f = serverFixture(), actor = { id: owner, role: 'representante' };
  await f.applyOfflineOperation(f.tx, actor, clientBody);
  const request = { ...orderBody, payload: { ...orderBody.payload, discount_value: 20 } };
  await f.applyOfflineOperation(f.tx, actor, request);
  await f.applyOfflineOperation(f.tx, actor, request);
  assert.equal(f.orders.length, 1);
  assert.equal(f.orders[0].total_value, 180.2);
  assert.equal(f.workflows[0].discount_value, 20);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { calculateOrderValues } from './order-pricing.ts';
import { EQUIPMENT_CATALOG } from './equipment-catalog.ts';
const source = readFileSync(new URL('../../app/api/orders/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['GET', 'PUT', 'dataFrom', 'text']);
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const row = { id: 'order-a', client_id: 'client-a', item_type: 'equipamento', equipment_name: 'CeltPlus - 220V', quantity: 3, total_value: 275.2, shipping_value: 10 };
  const discounts = new Map([[row.id, 25.1]]);
  const dependencies = {
    NextResponse: { json: Response.json }, authorizeApi: async () => ({ profile: { id: 'seller-a', role: 'vendedor' } }), ORDER_ROLES: ['vendedor'],
    orderScope: () => ({}), ensureOrderWorkflowTables: async () => {},
    Prisma: { sql: (parts, ...values) => ({ parts, values }), join: values => values },
    prisma: {
      orders: { findMany: async () => [row], findFirst: async () => ({ id: row.id }) },
      clients: { findFirst: async () => ({ id: 'client-a' }) },
      $queryRaw: async () => [...discounts].map(([order_id, discount_value]) => ({ order_id, discount_value })),
      $transaction: async callback => callback({ orders: { update: async ({ data }) => { Object.assign(row, data); return row; } } }),
    },
    loadOrderItems: async () => [], toJsonSafe: value => value,
    buildAccessibleClientWhere: () => ({}), calculateOrderValues, EQUIPMENT_CATALOG,
    syncOrderWorkflow: async (tx, order) => discounts.set(order.id, order.discount_value),
    OrderWorkflowError: class extends Error { status = 409; },
  };
  const module = { exports: {} };
  new Function('module', 'exports', ...Object.keys(dependencies), output)(module, module.exports, ...Object.values(dependencies));
  return { ...module.exports, row, discounts };
}
test('reabrir pedido recupera desconto e unitário bruto; editar e remover desconto recalcula o líquido', async () => {
  const f = fixture();
  let order = (await (await f.GET()).json()).orders[0];
  assert.equal(order.discount_value, 25.1);
  assert.equal(order.unit_price, 100.1);
  assert.equal(order.grand_total, 285.2);
  for (const discount of [50, 0]) {
    const response = await f.PUT(new Request('https://test/api/orders', { method: 'PUT', body: JSON.stringify({ ...f.row, unit_price: 100.1, discount_value: discount }) }));
    assert.equal(response.status, 200);
    order = (await (await f.GET()).json()).orders[0];
    assert.equal(order.discount_value, discount);
    assert.equal(order.unit_price, 100.1);
    assert.equal(order.total_value, calculateOrderValues(3, 100.1, 10, discount).total_value);
  }
});
test('pedido histórico sem desconto mantém preço e total', async () => {
  const f = fixture(); f.discounts.clear();
  const order = (await (await f.GET()).json()).orders[0];
  assert.equal(order.discount_value, 0);
  assert.equal(order.total_value, f.row.total_value);
  assert.equal(order.grand_total, 285.2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { calculateOrderValues } from "./order-pricing.ts";
import { EQUIPMENT_CATALOG } from "./equipment-catalog.ts";

const source = readFileSync(new URL("../../app/api/orders/route.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
const names = new Set(["POST", "dataFrom", "text", "number"]);
const code = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join("\n");
const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
class WorkflowError extends Error { status = 409; }

function fixture({ failWorkflow = false, deny = false, inaccessible = false, duplicate = false } = {}) {
  const state = { committed: [], workflows: [], transactions: 0, locks: 0 };
  const profile = { id: "authenticated-author", role: "representante" };
  const prisma = {
    orders: { findFirst: async () => null },
    $transaction: async (callback) => {
      assert.equal(typeof callback, "function", "creation must use an interactive transaction");
      state.transactions++;
      const pending = [];
      const tx = {
        $queryRaw: async () => { state.locks++; return []; },
        orders: {
          findFirst: async () => duplicate ? { id: "duplicate-a", order_number: 1 } : null,
          create: async ({ data }) => { const order = { id: "new-" + pending.length, order_number: 2n, ...data }; pending.push(order); return order; },
        },
      };
      const result = await callback(tx);
      state.committed.push(...pending);
      return result;
    },
  };
  const module = { exports: {} };
  const dependencies = { prisma,
    authorizeApi: async () => deny ? { response: Response.json({ sucesso: false }, { status: 403 }) } : { profile },
    ORDER_ROLES: ["representante"], NextResponse: { json: Response.json },
    canAccessEveryClient: async () => !inaccessible,
    ensureOrderWorkflowTables: async () => {},
    syncOrderWorkflow: async (tx, order) => { assert.ok(tx.orders); state.workflows.push(order); if (failWorkflow) throw new Error("Falha de CRM simulada"); },
    toJsonSafe: (rows) => rows.map(({ order_number, ...row }) => ({ ...row, order_number: String(order_number) })),
    calculateOrderValues, EQUIPMENT_CATALOG, OrderWorkflowError: WorkflowError,
  };
  new Function("module", "exports", ...Object.keys(dependencies), output)(module, module.exports, ...Object.values(dependencies));
  return { state, post: module.exports.POST };
}
const body = { client_id: "client-a", item_type: "equipamento", equipment_name: "CeltPlus - 220V", quantity: 3, unit_price: 100.10, shipping_value: 10, total_value: 999999, created_by: "spoofed-author" };
const request = (data = body) => new Request("https://example.test/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

test("API calcula total no servidor e não confia no total/autor enviados pelo navegador", async () => {
  const f = fixture();
  assert.equal((await f.post(request())).status, 201);
  assert.equal(f.state.committed[0].total_value, 300.3);
  assert.equal(f.state.committed[0].created_by, "authenticated-author");
  assert.equal(f.state.workflows.length, 1);
  assert.equal(f.state.locks, 1);
});
test("falha do encaminhamento CRM não salva um pedido parcial", async () => {
  const f = fixture({ failWorkflow: true });
  assert.equal((await f.post(request())).status, 500);
  assert.equal(f.state.committed.length, 0);
});
test("lote encaminha todos os pedidos na mesma transação", async () => {
  const f = fixture();
  assert.equal((await f.post(request({ orders: [body, { ...body, equipment_name: "CeltPlus - 380V" }] }))).status, 201);
  assert.equal(f.state.transactions, 1);
  assert.equal(f.state.workflows.length, 2);
});
test("API preserva autorização e escopo de clientes sem criar registros", async () => {
  for (const [options, status] of [[{ deny: true }, 403], [{ inaccessible: true }, 404]]) {
    const f = fixture(options);
    assert.equal((await f.post(request())).status, status);
    assert.equal(f.state.transactions, 0);
  }
});
test("API bloqueia valores negativos, quantidades fracionadas e falta de cliente", async () => {
  for (const change of [{ unit_price: -1 }, { quantity: 1.2 }, { client_id: "" }, { shipping_value: -5 }, { equipment_name: "Não existe" }]) {
    const f = fixture();
    assert.equal((await f.post(request({ ...body, ...change }))).status, 400);
    assert.equal(f.state.transactions, 0);
  }
});
test("reenvio concorrente detectado dentro da transação não duplica pedido", async () => {
  const f = fixture({ duplicate: true });
  assert.equal((await f.post(request())).status, 409);
  assert.equal(f.state.committed.length, 0);
  assert.equal(f.state.workflows.length, 0);
});
test("chamadas legadas sem unitário preservam o total histórico informado", async () => {
  const f = fixture();
  assert.equal((await f.post(request({ ...body, unit_price: undefined, total_value: 100 }))).status, 201);
  assert.equal(f.state.committed[0].total_value, 100);
});

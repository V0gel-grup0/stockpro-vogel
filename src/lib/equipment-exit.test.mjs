import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { companionEquipment, exitMountedEquipment } from "./equipment-exit-server.ts";
import { EQUIPMENT_CATALOG } from "./equipment-catalog.ts";

// Execute the real route with an isolated transactional store; never write real stock.
const source = readFileSync(new URL("../../app/api/movements/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(items, stock, legacy = false) {
  let state = { stock: { ...stock }, movements: [], status: "pendente", invoices: [] };
  const tx = {
    $queryRaw: async (strings) => strings.join("").includes("FOR UPDATE") ? [] : legacy ? [] : items,
    orders: {
      findUnique: async () => ({ id: "order-a", order_number: 42, status: state.status, item_type: "equipamento", equipment_name: items[0].item_name, quantity: items[0].quantity }),
      update: async ({ data }) => { state.status = data.status; },
    },
    mounted_equipments: { updateMany: async ({ where, data }) => {
      const available = state.stock[where.equipment_name];
      if (available === undefined || available < where.quantity.gte) return { count: 0 };
      state.stock[where.equipment_name] -= data.quantity.decrement;
      return { count: 1 };
    } },
    movements: { create: async ({ data }) => { const row = { id: `movement-${state.movements.length}`, ...data }; state.movements.push(row); return row; } },
  };
  const prisma = { $transaction: async (callback) => {
    const snapshot = structuredClone(state);
    try { return await callback(tx); } catch (error) { state = snapshot; throw error; }
  } };
  const module = { exports: {} };
  const dependencies = {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/api-auth": { authorizeApi: async () => ({ profile: { id: "author-a" } }) },
    "@/lib/prisma": { prisma },
    "@/lib/prisma-json": { toJsonSafe: (value) => value },
    "@/lib/equipment-exit-server": { exitMountedEquipment },
    "@/lib/movement-invoice-policy": {},
    "@/lib/movement-invoice-server": { saveMovementInvoice: async (_tx, _invoice, _author, rows) => { state.invoices.push(rows.map((row) => row.id)); } },
  };
  new Function("require", "module", "exports", code)((name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports);
  return { state: () => state, exit: () => module.exports.POST(new Request("https://example.test/api/movements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "order_exit", order_id: "order-a", notes: "NF teste" }) })) };
}
const item = (name, quantity = 2) => ({ id: name, item_type: "equipment", item_name: name, quantity, product_id: null });

for (const equipment of EQUIPMENT_CATALOG.filter((name) => name.startsWith("Celt5000 Plus"))) {
  for (const legacy of [true, false]) test(`${equipment}: baixa proporcional com a mesma voltagem (${legacy ? "pedido direto" : "orçamento"})`, async () => {
    const companion = companionEquipment(equipment);
    const opposite = companion.includes("220") ? "CeltPlus - 380V" : "CeltPlus - 220V";
    const h = setup([item(equipment, 3)], { [equipment]: 5, [companion]: 6, [opposite]: 9 }, legacy);
    const response = await h.exit();
    assert.equal(response.status, 201, JSON.stringify(await response.json()));
    assert.deepEqual(h.state().stock, { [equipment]: 2, [companion]: 3, [opposite]: 9 });
    assert.equal(h.state().status, "enviado");
    assert.deepEqual(h.state().movements.map((row) => [row.item_name, row.quantity, row.order_id]), [[equipment, 3, "order-a"], [companion, 3, "order-a"]]);
    assert.equal(h.state().invoices[0].length, 2);
    assert.notEqual((await h.exit()).status, 201);
    assert.equal(h.state().movements.length, 2);
  });
}

test("sem CeltPlus da voltagem correta desfaz equipamento, movimentações e status", async () => {
  for (const legacy of [true, false]) {
    const equipment = "Celt5000 Plus - 220V 1 turbina + Mínima";
    const stock = { [equipment]: 4, "CeltPlus - 220V": 1, "CeltPlus - 380V": 20 };
    const h = setup([item(equipment, 2)], stock, legacy);
    const response = await h.exit();
    assert.match((await response.json()).erro, /CeltPlus - 220V/);
    assert.deepEqual(h.state(), { stock, movements: [], status: "pendente", invoices: [] });
  }
});

test("itens de turbinas diferentes somam o consumo e voltam todos se faltar estoque", async () => {
  const a = "Celt5000 Plus - 380V 1 turbina + Mínima";
  const b = "Celt5000 Plus - 380V 3 turbinas + Mínima";
  const stock = { [a]: 5, [b]: 5, "CeltPlus - 380V": 4 };
  const h = setup([item(a, 2), item(b, 3)], stock);
  assert.notEqual((await h.exit()).status, 201);
  assert.deepEqual(h.state().stock, stock);
  assert.equal(h.state().movements.length, 0);
  const success = setup([item(a, 2), item(b, 2)], stock);
  assert.equal((await success.exit()).status, 201);
  assert.equal(success.state().stock["CeltPlus - 380V"], 0);
});

test("Celt5000 comum e CeltPlus avulso baixam somente o próprio modelo", async () => {
  for (const equipment of ["Celt5000 - 220V 2 turbinas", "CeltPlus - 380V"]) {
    const h = setup([item(equipment)], { [equipment]: 4 });
    assert.equal((await h.exit()).status, 201);
    assert.equal(h.state().movements.length, 1);
    assert.equal(h.state().stock[equipment], 2);
  }
});

test("voltagem ausente, desconhecida e quantidade inválida bloqueiam a saída", async () => {
  assert.throws(() => companionEquipment("Celt5000 Plus - 110V 1 turbina"), /Voltagem/);
  assert.throws(() => companionEquipment("Celt5000 Plus - 1 turbina"), /Voltagem/);
  for (const quantity of [0, -1, 1.5, NaN]) {
    const equipment = "Celt5000 Plus - 220V 1 turbina + Mínima";
    const h = setup([item(equipment, quantity)], { [equipment]: 4, "CeltPlus - 220V": 4 }, true);
    assert.notEqual((await h.exit()).status, 201);
    assert.equal(h.state().movements.length, 0);
  }
});

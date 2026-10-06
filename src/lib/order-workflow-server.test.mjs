import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { isCeltEquipment } from "./order-pricing.ts";

const source = readFileSync(new URL("./order-workflow-server.ts", import.meta.url), "utf8");
const compiled = { exports: {} };
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const nativeRequire = createRequire(import.meta.url);
new Function("require", "module", "exports", output)((name) => {
  if (name === "@/lib/prisma") return { prisma: {} };
  if (name === "@/lib/assembly-work-server") return { ensureAssemblyWorkTable: async () => {} };
  if (name === "@/lib/order-pricing") return { isCeltEquipment };
  return nativeRequire(name);
}, compiled, compiled.exports);
const { syncOrderWorkflow } = compiled.exports;

function fixture(options = {}) {
  const order = { id: "order-a", order_number: 5n, client_id: "client-a", created_by: "rep-a", item_type: "equipamento", item_id: null, equipment_name: "CeltPlus - 220V", quantity: 2, total_value: 100, shipping_value: 10, notes: "Entrega combinada", ...options.order };
  const state = { link: options.link, opportunity: options.opportunity, work: options.work || [], creates: 0, updates: [], inserts: [], deleted: [] };
  const tx = {
    products: { findUnique: async () => ({ name: "Lâmpada" }) },
    crm_opportunities: {
      create: async ({ data }) => { state.creates++; state.opportunity = { id: "op-a", ...data }; return state.opportunity; },
      findUnique: async () => state.opportunity,
      update: async ({ data }) => { state.updates.push(data); Object.assign(state.opportunity, data); return state.opportunity; },
    },
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM order_crm_links WHERE")) return state.link ? [state.link] : [];
      if (sql.includes("SUM(o.total_value")) return [{ value: Number(order.total_value) + Number(order.shipping_value) }];
      if (sql.includes("FROM crm_assembly_work")) return state.work;
      return [];
    },
    $executeRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes("INSERT INTO order_crm_links")) state.link = { opportunity_id: values[1], owns_opportunity: values[2] };
      if (sql.includes("INSERT INTO crm_assembly_work")) {
        state.inserts.push({ sql, values });
        const old = state.work.find((work) => work.source_item_key === values[5]);
        if (old) Object.assign(old, { equipment_name: values[0], quantity: values[1] });
        else state.work.push({ id: "work-" + values[5], source_item_key: values[5], equipment_name: values[0], quantity: values[1], stage: "todo" });
      }
      if (sql.includes("DELETE FROM crm_assembly_work")) { state.deleted.push(values[0]); state.work = state.work.filter((work) => work.id !== values[0]); }
      return 1;
    },
  };
  return { order, state, tx };
}

test("pedido CELT cria oportunidade Pedido feito com autor e montagem A fazer sem montador", async () => {
  const f = fixture();
  await syncOrderWorkflow(f.tx, f.order);
  assert.equal(f.state.creates, 1);
  assert.equal(f.state.opportunity.stage, "order_created");
  assert.equal(f.state.opportunity.created_by, "rep-a");
  assert.equal(f.state.opportunity.responsible_id, "rep-a");
  assert.equal(f.state.opportunity.estimated_value, 110);
  assert.match(f.state.opportunity.title, /PV-000005/);
  assert.match(f.state.inserts[0].sql, /NULL, 'todo'/);
  assert.equal(f.state.work.length, 1);
});
test("editar/repetir sincronização não duplica oportunidade nem montagem nem reinicia etapa", async () => {
  const f = fixture();
  await syncOrderWorkflow(f.tx, f.order);
  f.state.work[0].stage = "assembling";
  f.state.opportunity.stage = "billing";
  await syncOrderWorkflow(f.tx, { ...f.order, total_value: 200 });
  assert.equal(f.state.creates, 1);
  assert.equal(f.state.work.length, 1);
  assert.equal(f.state.work[0].stage, "assembling");
  assert.equal(f.state.opportunity.stage, "billing");
  assert.equal(f.state.opportunity.estimated_value, 110); // Fixture aggregate supplied by query, not arbitrary client totals.
});
test("produtos entram no CRM comercial sem gerar montagem", async () => {
  const f = fixture({ order: { item_type: "produto", item_id: "product-a", equipment_name: "" } });
  await syncOrderWorkflow(f.tx, f.order);
  assert.equal(f.state.creates, 1);
  assert.match(f.state.opportunity.title, /Lâmpada/);
  assert.equal(f.state.work.length, 0);
});
test("orçamento reutiliza sua oportunidade e cria uma montagem por linha CELT", async () => {
  const f = fixture({ opportunity: { id: "quote-op", client_id: "client-a", stage: "negotiation", title: "Título original", notes: "Histórico original" } });
  await syncOrderWorkflow(f.tx, f.order, { opportunityId: "quote-op", items: [
    { key: "line1", item_type: "equipment", item_name: "Celt5000 - 220V 1 turbina", quantity: 3 },
    { key: "line2", item_type: "product", item_name: "CeltPlus - 220V", quantity: 5 },
    { key: "line3", item_type: "equipment", item_name: "CeltPlus - 380V", quantity: 1 },
  ] });
  assert.equal(f.state.creates, 0);
  assert.equal(f.state.opportunity.stage, "order_created");
  assert.equal(f.state.opportunity.title, "Título original");
  assert.equal(f.state.opportunity.notes, "Histórico original");
  assert.equal(f.state.work.length, 2);
  assert.deepEqual(f.state.work.map((work) => work.quantity), [3, 1]);
});
test("montagem iniciada bloqueia alteração da quantidade e remoção do equipamento", async () => {
  for (const change of [{ quantity: 3 }, { item_type: "produto", equipment_name: "", item_id: "product-a" }]) {
    const f = fixture({ work: [{ id: "work-a", source_item_key: "order", equipment_name: "CeltPlus - 220V", quantity: 2, stage: "assembling" }] });
    await assert.rejects(syncOrderWorkflow(f.tx, { ...f.order, ...change }), /montagem iniciada/);
  }
});
test("montagem pendente acompanha equipamento/quantidade; converter em produto remove só pendente", async () => {
  const f = fixture();
  await syncOrderWorkflow(f.tx, f.order);
  await syncOrderWorkflow(f.tx, { ...f.order, equipment_name: "CeltPlus - 380V", quantity: 4 });
  assert.equal(f.state.work[0].quantity, 4);
  assert.equal(f.state.work[0].equipment_name, "CeltPlus - 380V");
  await syncOrderWorkflow(f.tx, { ...f.order, item_type: "produto", equipment_name: "", item_id: "product-a" });
  assert.equal(f.state.work.length, 0);
});
test("oportunidade de orçamento de outro cliente é rejeitada", async () => {
  const f = fixture({ opportunity: { id: "quote-op", client_id: "client-other", stage: "lead" } });
  await assert.rejects(syncOrderWorkflow(f.tx, f.order, { opportunityId: "quote-op" }), /cliente.*não corresponde/);
});

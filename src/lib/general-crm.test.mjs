import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as policy from "./general-crm-policy.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const demandId = "33333333-3333-4333-8333-333333333333";
const actor = { id: actorId, role: "vendedor" };
const record = { id: demandId, title: "Conferir entrega", description: "Observação", status: "new", priority: "normal", assigned_to: actorId, created_by: actorId, due_at: "2026-10-20T15:00:00.000Z", completed_at: null, created_at: "2026-10-19T15:00:00.000Z", updated_at: "2026-10-19T15:00:00.000Z" };
const source = readFileSync(new URL("../../app/api/crm/general-demands/route.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ profile = actor, rows = [], unavailable = false } = {}) {
  const state = { rows: structuredClone(rows), queries: [], prepared: 0, profilesWhere: null };
  const canRead = (row, manager, id) => manager || row.created_by === id || row.assigned_to === id;
  const prisma = {
    profiles: {
      findUnique: async () => unavailable ? { role: "vendedor", status: "pending" } : { role: "vendedor", status: "approved" },
      findMany: async ({ where }) => { state.profilesWhere = where; return [{ id: actorId, name: "Nicole", role: "vendedor" }]; },
    },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      state.queries.push({ sql, values });
      assert.match(sql, /crm_general_demands/);
      assert.doesNotMatch(sql, /crm_opportunities|crm_assembly_work|crm_tasks/);
      if (sql.includes("INSERT")) {
        const [title, description, status, priority, assigned_to, created_by, due_at] = values;
        const row = { ...record, title, description, status, priority, assigned_to, created_by, due_at, completed_at: status === "completed" ? new Date() : null };
        state.rows.push(row); return [row];
      }
      if (sql.includes("UPDATE")) {
        const [title, description, status, priority, assigned_to, due_at, , id, manager, actor] = values;
        const row = state.rows.find((row) => row.id === id && canRead(row, manager, actor));
        if (!row) return [];
        Object.assign(row, { title, description, status, priority, assigned_to, due_at, completed_at: status === "completed" ? row.completed_at || new Date() : null });
        return [row];
      }
      if (sql.includes("WHERE id =")) {
        const [id, manager, actor] = values;
        return state.rows.filter((row) => row.id === id && canRead(row, manager, actor));
      }
      const [manager, actor] = values;
      assert.match(sql, /WHERE.*created_by.*assigned_to/s);
      return state.rows.filter((row) => canRead(row, manager, actor));
    },
  };
  const dependencies = {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/api-auth": { authorizeApi: async (roles) => !profile ? { response: Response.json({}, { status: 401 }) } : !roles.includes(profile.role) ? { response: Response.json({}, { status: 403 }) } : { profile } },
    "@/lib/prisma": { prisma }, "@/lib/prisma-json": { toJsonSafe: (value) => value },
    "@/lib/general-crm-server": { ensureGeneralCrmTable: async () => { state.prepared++; } },
    "@/lib/general-crm-policy": policy,
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports);
  return { ...module.exports, state };
}
const request = (method, body) => new Request("https://example.test/api/crm/general-demands", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("CRM geral exige título e valida todas as etapas, prioridades, responsável e prazo", () => {
  for (const stage of policy.GENERAL_CRM_STAGES) assert.equal(policy.validateGeneralDemand({ title: " Teste ", status: stage.value }).status, stage.value);
  for (const input of [null, [], {}, { title: " " }, { title: "x".repeat(201) }, { title: "Ok", description: 45 }, { title: "Ok", status: "lead" }, { title: "Ok", priority: "bad" }, { title: "Ok", assigned_to: "bad" }, { title: "Ok", due_at: "invalid" }]) assert.throws(() => policy.validateGeneralDemand(input), policy.GeneralCrmInputError);
});
test("etapas encerradas não aparecem como atrasadas; conclusão pode ser reaberta", () => {
  for (const status of ["new", "in_progress", "waiting"]) assert.equal(policy.isGeneralDemandOverdue({ status, due_at: "2020-01-01" }), true);
  for (const status of ["completed", "cancelled"]) assert.equal(policy.isGeneralDemandOverdue({ status, due_at: "2020-01-01" }), false);
  assert.equal(policy.isGeneralDemandOverdue({ status: "new", due_at: null }), false);
});
test("API bloqueia acesso anônimo ou perfil inválido antes de preparar ou consultar banco", async () => {
  for (const [profile, status] of [[null, 401], [{ ...actor, role: "invalid" }, 403]]) {
    const f = fixture({ profile });
    assert.equal((await f.GET()).status, status);
    assert.equal((await f.POST(request("POST", { title: "Ok" }))).status, status);
    assert.equal((await f.PATCH(request("PATCH", { id: demandId, status: "waiting" }))).status, status);
    assert.equal(f.state.prepared, 0); assert.equal(f.state.queries.length, 0);
  }
});
test("GET preserva escopo de autor/responsável e somente gestores recebem visão completa", async () => {
  const rows = [record, { ...record, id: "other", created_by: otherId, assigned_to: otherId }];
  for (const role of policy.GENERAL_CRM_ROLES) {
    const f = fixture({ profile: { ...actor, role }, rows });
    const response = await f.GET(); const data = await response.json();
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    assert.equal(data.demands.length, ["administrador", "gerente"].includes(role) ? 2 : 1);
    assert.equal(f.state.profilesWhere.id, ["administrador", "gerente"].includes(role) ? undefined : actorId);
  }
});
test("criação persiste dados, prazo e prioridade sem confiar no autor enviado", async () => {
  const f = fixture(); const title = "Entrega '; DROP TABLE clients; --";
  const response = await f.POST(request("POST", { ...record, title, created_by: otherId }));
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.demand.created_by, actorId);
  assert.equal(data.demand.due_at, record.due_at);
  assert.equal(data.demand.title, title);
  assert.ok(!f.state.queries[0].sql.includes(title), "valores são parâmetros, nunca interpolação de SQL");
});
test("responsável alheio exige gestor e usuário aprovado", async () => {
  const ordinary = fixture();
  assert.equal((await ordinary.POST(request("POST", { title: "Ok", assigned_to: otherId }))).status, 403);
  assert.equal(ordinary.state.rows.length, 0);
  const manager = fixture({ profile: { ...actor, role: "gerente" } });
  assert.equal((await manager.POST(request("POST", { title: "Ok", assigned_to: otherId }))).status, 201);
  const inactive = fixture({ profile: { ...actor, role: "administrador" }, unavailable: true });
  assert.equal((await inactive.POST(request("POST", { title: "Ok", assigned_to: otherId }))).status, 400);
});
test("PATCH altera etapas, conclui, reabre e preserva informações e autoria", async () => {
  const f = fixture({ rows: [record] });
  for (const status of ["in_progress", "waiting", "completed", "new", "cancelled"]) {
    const response = await f.PATCH(request("PATCH", { id: demandId, status, created_by: otherId }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(f.state.rows[0].status, status);
    assert.equal(Boolean(f.state.rows[0].completed_at), status === "completed");
    assert.equal(f.state.rows[0].created_by, actorId);
    assert.equal(f.state.rows[0].description, record.description);
  }
});
test("PATCH não altera demanda de outro usuário ou de outro funil", async () => {
  const f = fixture({ rows: [{ ...record, created_by: otherId, assigned_to: otherId }] });
  assert.equal((await f.PATCH(request("PATCH", { id: demandId, status: "completed" }))).status, 404);
  assert.equal(f.state.queries.length, 1);
  assert.equal(f.state.rows[0].status, "new");
  const invalid = fixture({ rows: [record] });
  assert.equal((await invalid.PATCH(request("PATCH", { id: demandId, status: "invalid" }))).status, 400);
  assert.equal(invalid.state.rows[0].status, "new");
});
test("colaborador atribuído pode editar sem reatribuir a demanda para outra pessoa", async () => {
  const f = fixture({ profile: { ...actor, role: "tecnico" }, rows: [{ ...record, created_by: otherId }] });
  assert.equal((await f.PATCH(request("PATCH", { id: demandId, description: "Resolvido" }))).status, 200);
  assert.equal((await f.PATCH(request("PATCH", { id: demandId, assigned_to: otherId }))).status, 403);
});

test("estrutura nova é isolada e permite repetir inicialização sem apagar dados", async () => {
  const source = readFileSync(new URL("./general-crm-server.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const queries = []; let fail = false;
  const module = { exports: {} };
  const prisma = { $executeRaw: async (strings) => { const sql = strings.join(""); queries.push(sql); if (fail) { fail = false; throw Error("Transient"); } } };
  new Function("require", "module", "exports", compiled)(() => ({ prisma }), module, module.exports);
  await Promise.all([module.exports.ensureGeneralCrmTable(), module.exports.ensureGeneralCrmTable()]);
  assert.equal(queries.length, 3);
  assert.ok(queries.every((sql) => /IF NOT EXISTS/.test(sql)));
  assert.ok(queries.every((sql) => !/DROP|DELETE|TRUNCATE|ALTER TABLE|crm_tasks|crm_opportunities/i.test(sql.replace(/ON DELETE SET NULL/g, ""))));
  assert.match(queries[0], /CREATE TABLE IF NOT EXISTS crm_general_demands/);
});

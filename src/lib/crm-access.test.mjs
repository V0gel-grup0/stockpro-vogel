import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as access from "./crm-access.ts";
import * as generalPolicy from "./general-crm-policy.ts";
import * as visibilityPolicy from "./client-visibility-policy.ts";

const visibilityModule = { exports: {} };
const visibilityCode = ts.transpileModule(readFileSync(new URL("./client-visibility.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
new Function("require", "module", "exports", visibilityCode)(() => visibilityPolicy, visibilityModule, visibilityModule.exports);

const actorId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
function compile(path, profile, db = {}) {
  const code = ts.transpileModule(readFileSync(new URL("../../" + path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const forbidden = () => { throw Error("Database must not be accessed before permission check"); };
  const prisma = new Proxy(db, { get: (target, key) => key in target ? target[key] : forbidden });
  const ownWhere = ({ id, role }) => ["administrador", "gerente"].includes(role) ? undefined : { OR: [{ created_by: id }, { responsible_id: id }] };
  const dependencies = {
    "@/lib/crm-access": access,
    "@/lib/general-crm-policy": generalPolicy,
    "@/lib/auth": { getAuthenticatedProfile: async () => profile },
    "@/lib/api-auth": { authorizeApi: async (roles) => profile && roles.includes(profile.role) ? { profile } : { response: Response.json({}, { status: profile ? 403 : 401 }) } },
    "@/lib/prisma": { prisma }, "@/lib/prisma-json": { toJsonSafe: (data) => data },
    "next/server": { NextResponse: { json: Response.json } },
    "@/generated/prisma/client": { Prisma: {} },
    "@/lib/client-visibility": visibilityModule.exports,
    "@/lib/equipment-catalog": { EQUIPMENT_CATALOG: [] },
    "@/lib/assembly-work-server": { ensureAssemblyWorkTable: forbidden },
    "@/lib/general-crm-server": { ensureGeneralCrmTable: forbidden },
    "@/lib/installation-forecast-server": {},
    "@/lib/crm-importance-server": { CRM_IMPORTANCE_UUID: /^[0-9a-f-]{36}$/i, parseCrmImportance: () => "high" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports);
  return module.exports;
}
const request = (method, body = {}) => new Request("https://example.test/api/test", method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("matriz de CRMs corresponde ao montador, funcionário, administrador e representante", () => {
  const matrix = { administrador: [true, true, true, true], gerente: [true, true, true, true], tecnico: [false, true, true, false], funcionario: [true, false, true, false], vendedor: [true, false, true, false], representante: [true, false, false, false], invalid: [false, false, false, false] };
  for (const [role, expected] of Object.entries(matrix)) assert.deepEqual(["commercial", "assembly", "internal", "service"].map((module) => access.canAccessCrm(role, module)), expected, role);
  assert.deepEqual([...generalPolicy.GENERAL_CRM_ROLES].sort(), [...access.CRM_INTERNAL_ROLES].sort());
});

const cases = [
  ["app/api/crm/opportunities/route.ts", ["GET", "POST"], ["tecnico"]],
  ["app/api/crm/opportunities/[id]/route.ts", ["PATCH", "DELETE"], ["tecnico"]],
  ["app/api/crm/activities/route.ts", ["GET", "POST"], ["tecnico"]],
  ["app/api/crm/notifications/route.ts", ["GET"], ["tecnico"]],
  ["app/api/crm/clients/[clientId]/summary/route.ts", ["GET"], ["tecnico"]],
  ["app/api/installation-forecast/route.ts", ["GET", "PUT"], ["tecnico"]],
  ["app/api/crm/assembly-work/route.ts", ["GET", "POST", "PATCH", "PUT", "DELETE"], ["funcionario", "vendedor", "representante"]],
  ["app/api/crm/service-orders/route.ts", ["GET", "POST", "PATCH", "PUT", "DELETE"], ["funcionario", "vendedor", "representante", "tecnico"]],
  ["app/api/crm/general-tasks/route.ts", ["GET", "POST", "PATCH", "DELETE"], ["representante"]],
  ["app/api/crm/general-tasks/edit/route.ts", ["PATCH"], ["representante"]],
  ["app/api/crm/general-demands/route.ts", ["GET", "POST", "PATCH"], ["representante"]],
];
for (const [path, methods, roles] of cases) test("acesso direto bloqueado antes do banco: " + path, async () => {
  for (const role of roles) {
    const route = compile(path, { id: actorId, role });
    for (const method of methods) assert.equal((await route[method](request(method), { params: Promise.resolve({ id: otherId, clientId: otherId }) })).status, 403, role + " " + method);
  }
});

test("importância respeita o tipo de registro e não contorna a separação dos CRMs", async () => {
  const technician = compile("app/api/crm/importance/route.ts", { id: actorId, role: "tecnico" });
  assert.equal((await technician.PUT(request("PUT", { opportunity_id: otherId, importance: "high" }))).status, 403);
  const representative = compile("app/api/crm/importance/route.ts", { id: actorId, role: "representante" });
  assert.equal((await representative.PUT(request("PUT", { task_id: otherId, importance: "high" }))).status, 403);
});

test("funcionário entra no Comercial e representante consulta somente oportunidades próprias", async () => {
  for (const role of ["funcionario", "representante", "vendedor"]) {
    let where;
    const route = compile("app/api/crm/opportunities/route.ts", { id: actorId, role }, { crm_opportunities: { findMany: async (query) => { where = query.where; return []; } } });
    assert.equal((await route.GET()).status, 200);
    assert.deepEqual(where, { OR: [{ created_by: actorId }, { responsible_id: actorId }] });
  }
});

test("navegação e complementos não expõem o Geral a representante nem o Comercial a montador", () => {
  const app = readFileSync(new URL("../components/StockProApp.tsx", import.meta.url), "utf8");
  const representativeMenu = app.split("\n").find((line) => line.trim().startsWith("representante: ["));
  assert.ok(!representativeMenu.includes("CRM geral"));
  assert.ok(app.includes('canAccessCrm(profile.role, "commercial") ? <CRM'));
  assert.ok(app.includes('canAccessCrm(profile.role, "assembly") ? <>'));
  assert.ok(app.includes('page === "CRM geral" && canAccessCrm(profile.role, "internal")'));
  for (const name of ["CrmOtherTasksEnhancer", "CrmOtherClientSelectionGuard", "CrmOtherSaveGuard"]) assert.ok(readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), "utf8").includes('[data-crm-internal="true"]'));
});

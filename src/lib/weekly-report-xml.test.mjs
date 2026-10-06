import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildWeeklyReportsXml, escapeWeeklyReportXml } from "./weekly-report-xml.ts";
import { weeklyReportPeriod, weeklyReportScope, WEEKLY_REPORT_READ_ROLES } from "./weekly-report-policy.ts";

const author = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const report = { id: "33333333-3333-4333-8333-333333333333", author_id: author, author_name: "João & Nicole", author_role: "vendedor", week_start: "2026-10-05", week_end: "2026-10-11", content: "Visita à granja <Vogel> & reunião.\nPróximos passos: \"venda\" 'CELT' 😀\n</texto><fake/>", status: "submitted", submitted_at: "2026-10-06T18:00:00Z", updated_at: "2026-10-06T18:00:00Z" };

function parse(xml) {
  const result = spawnSync("python3", ["-c", "import sys,json,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); print(json.dumps({'root':r.tag,'count':len(r),'text':[x.findtext('texto') for x in r],'names':[x.findtext('autor/nome') for x in r],'fake':len(r.findall('.//fake'))},ensure_ascii=False))"], { input: xml, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
test("XML válido preserva acentos, emojis, quebras de linha e texto sem injeção", () => {
  const xml = buildWeeklyReportsXml([report]);
  const parsed = parse(xml);
  assert.equal(parsed.root, "relatorios_semanais");
  assert.equal(parsed.count, 1);
  assert.equal(parsed.text[0], report.content);
  assert.equal(parsed.names[0], report.author_name);
  assert.equal(parsed.fake, 0);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<situacao>enviado</situacao>'));
});
test("XML remove apenas caracteres proibidos e suporta lista vazia, rascunhos e datas Date", () => {
  assert.equal(escapeWeeklyReportXml("a\0\u0001b\uD800c😀"), "abc😀");
  assert.equal(parse(buildWeeklyReportsXml([])).count, 0);
  const xml = buildWeeklyReportsXml([{ ...report, content: "", status: "draft", submitted_at: null, week_start: new Date("2026-10-05T00:00:00Z") }]);
  assert.ok(xml.includes("<inicio>2026-10-05</inicio>"));
  assert.ok(xml.includes("<situacao>rascunho</situacao>"));
  assert.equal(parse(xml).count, 1);
});

const source = readFileSync(new URL("../../app/api/weekly-reports/route.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
const get = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "GET").getText(ast);
const output = ts.transpileModule(get, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(role = "vendedor", denied = 0) {
  let queried = false;
  const rows = [report, { ...report, id: "44444444-4444-4444-8444-444444444444", author_id: other }, { ...report, id: "55555555-5555-4555-8555-555555555555", author_id: other, status: "draft" }];
  const module = { exports: {} };
  const dependencies = {
    authorizeApi: async () => denied ? { response: Response.json({ sucesso: false }, { status: denied }) } : { profile: { id: author, role } },
    WEEKLY_REPORT_READ_ROLES, weeklyReportScope, weeklyReportPeriod, buildWeeklyReportsXml,
    ensureTable: async () => {}, NextResponse: { json: Response.json }, toJsonSafe: (value) => value,
    prisma: { $queryRawUnsafe: async (sql, scopeAuthor, submittedOnly, id, selectedAuthor, week) => {
      queried = true;
      assert.ok(sql.includes("r.author_id = $1::uuid"));
      assert.ok(sql.includes("r.status = 'submitted'"));
      assert.ok(sql.includes("r.id = $3::uuid"));
      return rows.filter((row) => (!scopeAuthor || row.author_id === scopeAuthor) && (!submittedOnly || row.status === "submitted") && (!id || row.id === id) && (!selectedAuthor || row.author_id === selectedAuthor) && (!week || row.week_start === week));
    } },
  };
  new Function("module", "exports", ...Object.keys(dependencies), output)(module, module.exports, ...Object.values(dependencies));
  return { get: (query) => module.exports.GET(new Request("https://example.test/api/weekly-reports" + query)), queried: () => queried };
}
test("download inclui cabeçalhos corretos e mantém o escopo do autor", async () => {
  const f = fixture(); const response = await f.get("?format=xml");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/xml; charset=utf-8");
  assert.match(response.headers.get("Content-Disposition"), /attachment; filename="relatorios-semanais.xml"/);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(parse(await response.text()).count, 1);
});
test("ADM exporta apenas relatórios enviados e filtros são aplicados", async () => {
  const f = fixture("administrador");
  assert.equal(parse(await (await f.get("?format=xml")).text()).count, 2);
  assert.equal(parse(await (await f.get(`?format=xml&author=${other}&week=2026-10-05`)).text()).count, 1);
  assert.equal(parse(await (await f.get("?format=xml&week=2026-09-28")).text()).count, 0);
});
test("alterar ID ou filtro de autor não permite baixar relatório alheio", async () => {
  const f = fixture();
  assert.equal((await f.get("?format=xml&id=44444444-4444-4444-8444-444444444444")).status, 404);
  assert.equal(parse(await (await f.get(`?format=xml&author=${other}`)).text()).count, 0);
});
test("sem autenticação ou permissão não consulta o banco nem exporta", async () => {
  for (const status of [401, 403]) { const f = fixture("vendedor", status); assert.equal((await f.get("?format=xml")).status, status); assert.equal(f.queried(), false); }
});
test("filtros inválidos são rejeitados e GET JSON continua compatível", async () => {
  for (const query of ["?format=xml&id=", "?format=xml&author=invalid", "?format=xml&week=2026-02-30", "?format=xml&week=2026-10-06"]) {
    const f = fixture(); assert.equal((await f.get(query)).status, 400); assert.equal(f.queried(), false);
  }
  const response = await fixture().get("");
  assert.equal((await response.json()).reports.length, 1);
});

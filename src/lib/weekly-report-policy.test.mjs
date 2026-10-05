import assert from "node:assert/strict";
import test from "node:test";
import { canWriteWeeklyReport, weeklyReportScope, weeklyReportPeriod, currentWeeklyReportPeriod, validateWeeklyReport } from "./weekly-report-policy.ts";

test("somente vendedor, gerente/supervisor e representante escrevem relatórios", () => {
  for (const role of ["vendedor", "gerente", "representante"]) assert.equal(canWriteWeeklyReport(role), true);
  for (const role of ["administrador", "funcionario", "tecnico", "invalido"]) assert.equal(canWriteWeeklyReport(role), false);
});
test("ADM recebe apenas enviados; autores consultam somente seus relatos", () => {
  assert.deepEqual(weeklyReportScope({ id: "adm", role: "administrador" }), { submittedOnly: true, authorId: null });
  for (const role of ["vendedor", "gerente", "representante"]) {
    assert.deepEqual(weeklyReportScope({ id: "autor-a", role }), { submittedOnly: false, authorId: "autor-a" });
  }
  assert.equal(weeklyReportScope({ id: "outro", role: "tecnico" }), null);
});
test("semana vai de segunda a domingo inclusive na virada de ano", () => {
  assert.deepEqual(weeklyReportPeriod("2026-10-11"), { weekStart: "2026-10-05", weekEnd: "2026-10-11" });
  assert.deepEqual(weeklyReportPeriod("2026-01-01"), { weekStart: "2025-12-29", weekEnd: "2026-01-04" });
});
test("semana atual respeita horário brasileiro na virada de domingo", () => {
  assert.deepEqual(currentWeeklyReportPeriod(new Date("2026-10-05T01:00:00Z")), { weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  assert.deepEqual(currentWeeklyReportPeriod(new Date("2026-10-05T03:00:00Z")), { weekStart: "2026-10-05", weekEnd: "2026-10-11" });
});
test("rejeita datas inexistentes e início fora de segunda-feira", () => {
  for (const date of ["2026-02-30", "2026-13-01", "erro", ""]) assert.throws(() => weeklyReportPeriod(date));
  assert.throws(() => validateWeeklyReport({ week_start: "2026-10-06", status: "draft", content: "texto" }));
});
test("permite rascunho vazio e exige texto para enviar", () => {
  assert.equal(validateWeeklyReport({ week_start: "2026-10-05", status: "draft", content: "" }).content, "");
  assert.throws(() => validateWeeklyReport({ week_start: "2026-10-05", status: "submitted", content: " \n " }));
  const report = validateWeeklyReport({ week_start: "2026-10-05", status: "submitted", content: "Visitas\nNegociações", author_id: "forjado", week_end: "2099-01-01" });
  assert.deepEqual(report, { weekStart: "2026-10-05", weekEnd: "2026-10-11", content: "Visitas\nNegociações", status: "submitted" });
});
test("limita texto e rejeita status e corpos inválidos", () => {
  assert.throws(() => validateWeeklyReport({ week_start: "2026-10-05", status: "submitted", content: "a".repeat(20001) }));
  assert.throws(() => validateWeeklyReport({ week_start: "2026-10-05", status: "approved", content: "texto" }));
  assert.throws(() => validateWeeklyReport(null));
  assert.throws(() => validateWeeklyReport([]));
});


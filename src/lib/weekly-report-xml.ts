type Report = {
  id: string; author_id: string; author_name: string; author_role: string;
  week_start: string | Date; week_end: string | Date; content: string; status: string;
  submitted_at: string | Date | null; created_at?: string | Date; updated_at: string | Date;
};

// XML 1.0 cannot contain control characters or unpaired UTF-16 surrogates.
export function escapeWeeklyReportXml(value: unknown) {
  return String(value ?? "")
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function date(value: string | Date | null | undefined, dateOnly = false) {
  if (!value) return "";
  const iso = value instanceof Date ? value.toISOString() : String(value);
  return dateOnly ? iso.slice(0, 10) : iso;
}

export function buildWeeklyReportsXml(reports: Report[]) {
  const tag = (name: string, value: unknown) => `<${name}>${escapeWeeklyReportXml(value)}</${name}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<relatorios_semanais versao="1.0" quantidade="${reports.length}">\n` +
    reports.map((report) => `  <relatorio>\n` + [
      tag("id", report.id),
      `<autor>${tag("id", report.author_id)}${tag("nome", report.author_name)}${tag("cargo", report.author_role)}</autor>`,
      `<periodo>${tag("inicio", date(report.week_start, true))}${tag("fim", date(report.week_end, true))}</periodo>`,
      tag("situacao", report.status === "submitted" ? "enviado" : "rascunho"),
      tag("enviado_em", date(report.submitted_at)),
      tag("criado_em", date(report.created_at)),
      tag("atualizado_em", date(report.updated_at)),
      `<texto xml:space="preserve">${escapeWeeklyReportXml(report.content)}</texto>`,
    ].map((line) => "    " + line).join("\n") + `\n  </relatorio>`).join("\n") + "\n</relatorios_semanais>\n";
}

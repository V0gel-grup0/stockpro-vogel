export const WEEKLY_REPORT_READ_ROLES = ["administrador", "gerente", "vendedor", "representante"] as const;
export const MAX_WEEKLY_REPORT_LENGTH = 20000;
export type WeeklyReportStatus = "draft" | "submitted";

export function canWriteWeeklyReport(role: string) {
  return ["gerente", "vendedor", "representante"].includes(role);
}

export function weeklyReportScope(actor: { id: string; role: string }) {
  if (actor.role === "administrador") return { submittedOnly: true, authorId: null };
  if (canWriteWeeklyReport(actor.role)) return { submittedOnly: false, authorId: actor.id };
  return null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Selecione uma semana válida.");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Selecione uma semana válida.");
  }
  return date;
}

export function weeklyReportPeriod(value: string) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const weekStart = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { weekStart, weekEnd: date.toISOString().slice(0, 10) };
}

export function currentWeeklyReportPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return weeklyReportPeriod(part("year") + "-" + part("month") + "-" + part("day"));
}

export function validateWeeklyReport(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Relatório inválido.");
  }
  const body = input as Record<string, unknown>;
  const period = weeklyReportPeriod(String(body.week_start || ""));
  if (body.week_start !== period.weekStart) {
    throw new Error("A semana deve começar na segunda-feira.");
  }
  if (body.status !== "draft" && body.status !== "submitted") {
    throw new Error("Status do relatório inválido.");
  }
  if (typeof body.content !== "string" || body.content.length > MAX_WEEKLY_REPORT_LENGTH) {
    throw new Error("O relatório deve ter até 20.000 caracteres.");
  }
  const content = body.content.trim();
  if (body.status === "submitted" && !content) {
    throw new Error("Escreva o relatório antes de enviar ao ADM.");
  }
  return { ...period, content, status: body.status as WeeklyReportStatus };
}


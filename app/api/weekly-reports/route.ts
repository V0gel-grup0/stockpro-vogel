import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import {
  canWriteWeeklyReport, validateWeeklyReport, weeklyReportScope, WEEKLY_REPORT_READ_ROLES,
  weeklyReportPeriod,
} from "@/lib/weekly-report-policy";
import { buildWeeklyReportsXml } from "@/lib/weekly-report-xml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (author_id, week_start),
      CHECK (week_end = week_start + 6),
      CHECK (EXTRACT(ISODOW FROM week_start) = 1),
      CHECK (char_length(content) <= 20000),
      CHECK (status <> 'submitted' OR (btrim(content) <> '' AND submitted_at IS NOT NULL))
    )
  `);
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeApi(WEEKLY_REPORT_READ_ROLES);
    if ("response" in authorization) return authorization.response;
    const scope = weeklyReportScope(authorization.profile)!;
    const params = new URL(request.url).searchParams;
    const xml = params.get("format") === "xml";
    const id = xml ? params.get("id") : null;
    const author = xml ? params.get("author") : null;
    const week = xml ? params.get("week") : null;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (id !== null && !uuid.test(id) || author !== null && !uuid.test(author)) {
      return NextResponse.json({ sucesso: false, erro: "Filtro de relatório inválido." }, { status: 400 });
    }
    if (week !== null) {
      try { if (weeklyReportPeriod(week).weekStart !== week) throw new Error(); }
      catch { return NextResponse.json({ sucesso: false, erro: "Semana inválida." }, { status: 400 }); }
    }
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id, r.author_id, r.week_start, r.week_end, r.content, r.status,
              r.submitted_at, r.created_at, r.updated_at,
              p.name AS author_name, p.role AS author_role
         FROM weekly_reports r
         JOIN profiles p ON p.id = r.author_id
        WHERE ($1::uuid IS NULL OR r.author_id = $1::uuid)
          AND ($2::boolean = false OR r.status = 'submitted')
          AND ($3::uuid IS NULL OR r.id = $3::uuid)
          AND ($4::uuid IS NULL OR r.author_id = $4::uuid)
          AND ($5::date IS NULL OR r.week_start = $5::date)
        ORDER BY r.week_start DESC, r.updated_at DESC
        LIMIT 200`,
      scope.authorId, scope.submittedOnly, id, author, week
    );
    if (xml) {
      if (id && !rows.length) return NextResponse.json({ sucesso: false, erro: "Relatório não encontrado ou sem permissão." }, { status: 404 });
      const filename = id ? `relatorio-semanal-${id}.xml` : `relatorios-semanais${week ? "-" + week : ""}.xml`;
      return new Response(buildWeeklyReportsXml(rows), { headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    return NextResponse.json({ sucesso: true, reports: toJsonSafe(rows) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao carregar relatórios semanais:", error);
    return NextResponse.json({ sucesso: false, erro: "Não foi possível carregar os relatórios semanais." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(WEEKLY_REPORT_READ_ROLES);
    if ("response" in authorization) return authorization.response;
    if (!canWriteWeeklyReport(authorization.profile.role)) {
      return NextResponse.json({ sucesso: false, erro: "Seu perfil possui acesso de consulta aos relatórios." }, { status: 403 });
    }
    let report: ReturnType<typeof validateWeeklyReport>;
    try {
      report = validateWeeklyReport(await request.json());
    } catch (error) {
      return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Relatório inválido." }, { status: 400 });
    }
    await ensureTable();
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO weekly_reports (author_id, week_start, week_end, content, status, submitted_at)
       VALUES ($1::uuid, $2::date, $3::date, $4, $5,
               CASE WHEN $5 = 'submitted' THEN now() ELSE NULL END)
       ON CONFLICT (author_id, week_start) DO UPDATE
         SET content = EXCLUDED.content,
             status = EXCLUDED.status,
             submitted_at = EXCLUDED.submitted_at,
             updated_at = now()
       WHERE weekly_reports.status = 'draft'
       RETURNING *`,
      authorization.profile.id, report.weekStart, report.weekEnd, report.content, report.status
    );
    if (!rows.length) {
      return NextResponse.json({ sucesso: false, erro: "O relatório desta semana já foi enviado e está disponível no histórico." }, { status: 409 });
    }
    return NextResponse.json({ sucesso: true, report: toJsonSafe({
      ...rows[0], author_name: authorization.profile.name, author_role: authorization.profile.role,
    }) });
  } catch (error) {
    console.error("Erro ao salvar relatório semanal:", error);
    return NextResponse.json({ sucesso: false, erro: "Não foi possível salvar o relatório semanal." }, { status: 500 });
  }
}

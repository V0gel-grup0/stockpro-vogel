import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAGES = [
  "open",
  "scheduled",
  "in_service",
  "waiting_part",
  "completed",
  "cancelled",
] as const;

type Stage = (typeof STAGES)[number];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

function parseStage(value: unknown): Stage | null {
  const stage = text(value) as Stage;
  return STAGES.includes(stage) ? stage : null;
}

function canAdministrate(role: string) {
  return role === "administrador" || role === "gerente";
}

function canCreate(role: string) {
  return ["administrador", "gerente", "vendedor", "representante"].includes(role);
}

function canUse(role: string) {
  return ["administrador", "gerente", "vendedor", "representante", "tecnico"].includes(role);
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_service_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
      stage TEXT NOT NULL DEFAULT 'open',
      scheduled_date DATE,
      notes TEXT NOT NULL DEFAULT '',
      created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_service_orders_stage_check CHECK (
        stage IN ('open','scheduled','in_service','waiting_part','completed','cancelled')
      )
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS crm_service_orders_responsible_idx
      ON crm_service_orders(responsible_id, stage, scheduled_date)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS crm_service_orders_client_idx
      ON crm_service_orders(client_id)
  `);
}

async function validClient(id: string) {
  if (!UUID_RE.test(id)) return false;
  const row = await prisma.clients.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(row);
}

async function validResponsible(id: string) {
  if (!id) return true;
  if (!UUID_RE.test(id)) return false;
  const row = await prisma.profiles.findFirst({
    where: {
      id,
      status: "approved",
      role: { in: ["administrador", "gerente", "tecnico"] },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canUse(profile.role)) {
      return NextResponse.json({ sucesso: true, items: [] });
    }

    await ensureTable();

    let where = "";
    const params: unknown[] = [];

    if (profile.role === "tecnico") {
      where = "WHERE s.responsible_id = $1::uuid";
      params.push(profile.id);
    } else if (profile.role === "vendedor" || profile.role === "representante") {
      where = "WHERE s.created_by = $1::uuid";
      params.push(profile.id);
    }

    const items = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        s.*,
        c.name AS client_name,
        c.city AS client_city,
        r.name AS responsible_name,
        cr.name AS created_by_name
      FROM crm_service_orders s
      JOIN clients c ON c.id = s.client_id
      LEFT JOIN profiles r ON r.id = s.responsible_id
      LEFT JOIN profiles cr ON cr.id = s.created_by
      ${where}
      ORDER BY
        CASE s.stage
          WHEN 'open' THEN 1
          WHEN 'scheduled' THEN 2
          WHEN 'in_service' THEN 3
          WHEN 'waiting_part' THEN 4
          WHEN 'completed' THEN 5
          WHEN 'cancelled' THEN 6
          ELSE 7
        END,
        s.scheduled_date ASC NULLS LAST,
        s.created_at ASC
      `,
      ...params
    );

    return NextResponse.json({ sucesso: true, items: toJsonSafe(items) });
  } catch (error) {
    console.error("Erro ao carregar ordens de serviço:", error);
    return errorResponse("Erro ao carregar ordens de serviço.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canCreate(profile.role)) {
      return errorResponse("Sem permissão para criar ordem de serviço.", 403);
    }

    await ensureTable();

    const body = await request.json();
    const clientId = text(body?.client_id);
    const title = text(body?.title);
    const description = text(body?.description);
    const responsibleId = text(body?.responsible_id);
    const scheduledDate = text(body?.scheduled_date);
    const notes = text(body?.notes);

    if (!(await validClient(clientId))) {
      return errorResponse("Cliente inválido.", 400);
    }
    if (!title) return errorResponse("Informe o título da ordem de serviço.", 400);
    if (!(await validResponsible(responsibleId))) {
      return errorResponse("Responsável inválido.", 400);
    }
    if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return errorResponse("Data agendada inválida.", 400);
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      INSERT INTO crm_service_orders
        (client_id, title, description, responsible_id, stage, scheduled_date, notes, created_by)
      VALUES
        ($1::uuid, $2, $3, NULLIF($4, '')::uuid, $5, NULLIF($6, '')::date, $7, $8::uuid)
      RETURNING *
      `,
      clientId,
      title.slice(0, 200),
      description.slice(0, 5000),
      responsibleId,
      scheduledDate ? "scheduled" : "open",
      scheduledDate,
      notes.slice(0, 5000),
      profile.id
    );

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar ordem de serviço:", error);
    return errorResponse("Erro ao criar ordem de serviço.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canUse(profile.role)) return errorResponse("Sem permissão.", 403);

    await ensureTable();

    const body = await request.json();
    const id = text(body?.id);
    const stage = parseStage(body?.stage);

    if (!UUID_RE.test(id) || !stage) {
      return errorResponse("Ordem de serviço ou etapa inválida.", 400);
    }

    const ownershipWhere =
      profile.role === "tecnico"
        ? "AND responsible_id = $3::uuid"
        : profile.role === "vendedor" || profile.role === "representante"
          ? "AND created_by = $3::uuid"
          : "";

    const params =
      ownershipWhere
        ? [id, stage, profile.id]
        : [id, stage];

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      UPDATE crm_service_orders
         SET stage = $2,
             updated_at = now()
       WHERE id = $1::uuid
         ${ownershipWhere}
      RETURNING *
      `,
      ...params
    );

    if (!rows.length) {
      return errorResponse("Ordem de serviço não encontrada ou sem permissão.", 404);
    }

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) });
  } catch (error) {
    console.error("Erro ao mover ordem de serviço:", error);
    return errorResponse("Erro ao mover ordem de serviço.", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canCreate(profile.role)) {
      return errorResponse("Sem permissão para editar ordem de serviço.", 403);
    }

    await ensureTable();

    const body = await request.json();
    const id = text(body?.id);
    const clientId = text(body?.client_id);
    const title = text(body?.title);
    const description = text(body?.description);
    const responsibleId = text(body?.responsible_id);
    const scheduledDate = text(body?.scheduled_date);
    const notes = text(body?.notes);

    if (!UUID_RE.test(id)) return errorResponse("Ordem de serviço inválida.", 400);
    if (!(await validClient(clientId))) return errorResponse("Cliente inválido.", 400);
    if (!title) return errorResponse("Informe o título.", 400);
    if (!(await validResponsible(responsibleId))) return errorResponse("Responsável inválido.", 400);
    if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return errorResponse("Data agendada inválida.", 400);
    }

    const ownerClause =
      profile.role === "vendedor" || profile.role === "representante"
        ? "AND created_by = $8::uuid"
        : "";

    const params = [
      id,
      clientId,
      title.slice(0, 200),
      description.slice(0, 5000),
      responsibleId,
      scheduledDate,
      notes.slice(0, 5000),
      ...(ownerClause ? [profile.id] : []),
    ];

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      UPDATE crm_service_orders
         SET client_id = $2::uuid,
             title = $3,
             description = $4,
             responsible_id = NULLIF($5, '')::uuid,
             scheduled_date = NULLIF($6, '')::date,
             notes = $7,
             updated_at = now()
       WHERE id = $1::uuid
         ${ownerClause}
      RETURNING *
      `,
      ...params
    );

    if (!rows.length) {
      return errorResponse("Ordem de serviço não encontrada ou sem permissão.", 404);
    }

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) });
  } catch (error) {
    console.error("Erro ao editar ordem de serviço:", error);
    return errorResponse("Erro ao editar ordem de serviço.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canAdministrate(profile.role)) {
      return errorResponse("Somente administrador ou gerente pode excluir ordens de serviço.", 403);
    }

    await ensureTable();

    const id = new URL(request.url).searchParams.get("id") || "";
    if (!UUID_RE.test(id)) return errorResponse("Ordem de serviço inválida.", 400);

    const count = await prisma.$executeRawUnsafe(
      `DELETE FROM crm_service_orders WHERE id = $1::uuid`,
      id
    );

    if (!count) return errorResponse("Ordem de serviço não encontrada.", 404);
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("Erro ao excluir ordem de serviço:", error);
    return errorResponse("Erro ao excluir ordem de serviço.", 500);
  }
}

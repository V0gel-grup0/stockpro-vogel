import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAGES = ["todo", "assembling", "waiting_parts", "done"] as const;
type Stage = (typeof STAGES)[number];

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseStage(value: unknown): Stage | null {
  const stage = text(value) as Stage;
  return STAGES.includes(stage) ? stage : null;
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_assembly_work (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      equipment_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      stage TEXT NOT NULL DEFAULT 'todo',
      due_date DATE,
      notes TEXT NOT NULL DEFAULT '',
      created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_assembly_work_stage_check
        CHECK (stage IN ('todo','assembling','waiting_parts','done'))
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS crm_assembly_work_technician_idx
      ON crm_assembly_work(technician_id, stage, due_date)
  `);
}

async function technicianExists(id: string) {
  if (!UUID_RE.test(id)) return false;
  const profile = await prisma.profiles.findFirst({
    where: { id, role: "tecnico", status: "approved" },
    select: { id: true },
  });
  return Boolean(profile);
}

function canAdministrate(role: string) {
  return role === "administrador" || role === "gerente";
}

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);

    if (!["administrador", "gerente", "tecnico"].includes(profile.role)) {
      return NextResponse.json({ sucesso: true, items: [] });
    }

    await ensureTable();

    const items = canAdministrate(profile.role)
      ? await prisma.$queryRawUnsafe<any[]>(`
          SELECT w.*,
                 p.name AS technician_name,
                 c.name AS created_by_name
            FROM crm_assembly_work w
            JOIN profiles p ON p.id = w.technician_id
       LEFT JOIN profiles c ON c.id = w.created_by
        ORDER BY
          CASE w.stage
            WHEN 'todo' THEN 1
            WHEN 'assembling' THEN 2
            WHEN 'waiting_parts' THEN 3
            WHEN 'done' THEN 4
            ELSE 5
          END,
          w.due_date ASC NULLS LAST,
          w.created_at ASC
        `)
      : await prisma.$queryRawUnsafe<any[]>(
          `
          SELECT w.*,
                 p.name AS technician_name,
                 c.name AS created_by_name
            FROM crm_assembly_work w
            JOIN profiles p ON p.id = w.technician_id
       LEFT JOIN profiles c ON c.id = w.created_by
           WHERE w.technician_id = $1::uuid
        ORDER BY
          CASE w.stage
            WHEN 'todo' THEN 1
            WHEN 'assembling' THEN 2
            WHEN 'waiting_parts' THEN 3
            WHEN 'done' THEN 4
            ELSE 5
          END,
          w.due_date ASC NULLS LAST,
          w.created_at ASC
          `,
          profile.id
        );

    return NextResponse.json({ sucesso: true, items: toJsonSafe(items) });
  } catch (error) {
    console.error("Erro ao carregar funil de montagens:", error);
    return errorResponse("Erro ao carregar funil de montagens.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canAdministrate(profile.role)) {
      return errorResponse("Somente administrador ou gerente pode criar montagens a fazer.", 403);
    }

    await ensureTable();

    const body = await request.json();
    const equipmentName = text(body?.equipment_name);
    const technicianId = text(body?.technician_id);
    const quantity = Number(body?.quantity || 1);
    const dueDate = text(body?.due_date);
    const notes = text(body?.notes);

    if (!EQUIPMENT_CATALOG.includes(equipmentName as (typeof EQUIPMENT_CATALOG)[number])) {
      return errorResponse("Equipamento inválido.", 400);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return errorResponse("Quantidade inválida.", 400);
    }
    if (!(await technicianExists(technicianId))) {
      return errorResponse("Montador inválido ou inativo.", 400);
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return errorResponse("Data prevista inválida.", 400);
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      INSERT INTO crm_assembly_work
        (equipment_name, quantity, technician_id, stage, due_date, notes, created_by)
      VALUES
        ($1, $2, $3::uuid, 'todo', NULLIF($4, '')::date, $5, $6::uuid)
      RETURNING *
      `,
      equipmentName,
      quantity,
      technicianId,
      dueDate,
      notes.slice(0, 5000),
      profile.id
    );

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar montagem a fazer:", error);
    return errorResponse("Erro ao criar montagem a fazer.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!["administrador", "gerente", "tecnico"].includes(profile.role)) {
      return errorResponse("Sem permissão.", 403);
    }

    await ensureTable();

    const body = await request.json();
    const id = text(body?.id);
    const stage = parseStage(body?.stage);

    if (!UUID_RE.test(id) || !stage) {
      return errorResponse("Montagem ou etapa inválida.", 400);
    }

    const rows = canAdministrate(profile.role)
      ? await prisma.$queryRawUnsafe<any[]>(
          `
          UPDATE crm_assembly_work
             SET stage = $2,
                 updated_at = now()
           WHERE id = $1::uuid
       RETURNING *
          `,
          id,
          stage
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `
          UPDATE crm_assembly_work
             SET stage = $2,
                 updated_at = now()
           WHERE id = $1::uuid
             AND technician_id = $3::uuid
       RETURNING *
          `,
          id,
          stage,
          profile.id
        );

    if (!rows.length) {
      return errorResponse("Montagem não encontrada ou sem permissão.", 404);
    }

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) });
  } catch (error) {
    console.error("Erro ao mover montagem no funil:", error);
    return errorResponse("Erro ao mover montagem no funil.", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canAdministrate(profile.role)) {
      return errorResponse("Somente administrador ou gerente pode editar a montagem.", 403);
    }

    await ensureTable();

    const body = await request.json();
    const id = text(body?.id);
    const equipmentName = text(body?.equipment_name);
    const technicianId = text(body?.technician_id);
    const quantity = Number(body?.quantity || 1);
    const dueDate = text(body?.due_date);
    const notes = text(body?.notes);

    if (!UUID_RE.test(id)) return errorResponse("Montagem inválida.", 400);
    if (!EQUIPMENT_CATALOG.includes(equipmentName as (typeof EQUIPMENT_CATALOG)[number])) {
      return errorResponse("Equipamento inválido.", 400);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return errorResponse("Quantidade inválida.", 400);
    }
    if (!(await technicianExists(technicianId))) {
      return errorResponse("Montador inválido ou inativo.", 400);
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return errorResponse("Data prevista inválida.", 400);
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      UPDATE crm_assembly_work
         SET equipment_name = $2,
             quantity = $3,
             technician_id = $4::uuid,
             due_date = NULLIF($5, '')::date,
             notes = $6,
             updated_at = now()
       WHERE id = $1::uuid
   RETURNING *
      `,
      id,
      equipmentName,
      quantity,
      technicianId,
      dueDate,
      notes.slice(0, 5000)
    );

    if (!rows.length) return errorResponse("Montagem não encontrada.", 404);
    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) });
  } catch (error) {
    console.error("Erro ao editar montagem a fazer:", error);
    return errorResponse("Erro ao editar montagem a fazer.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!canAdministrate(profile.role)) {
      return errorResponse("Somente administrador ou gerente pode excluir a montagem.", 403);
    }

    await ensureTable();

    const id = new URL(request.url).searchParams.get("id") || "";
    if (!UUID_RE.test(id)) return errorResponse("Montagem inválida.", 400);

    const count = await prisma.$executeRawUnsafe(
      `DELETE FROM crm_assembly_work WHERE id = $1::uuid`,
      id
    );

    if (!count) return errorResponse("Montagem não encontrada.", 404);
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("Erro ao excluir montagem a fazer:", error);
    return errorResponse("Erro ao excluir montagem a fazer.", 500);
  }
}

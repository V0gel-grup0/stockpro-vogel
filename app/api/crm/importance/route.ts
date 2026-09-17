import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import {
  CRM_IMPORTANCE_UUID,
  accessibleImportanceOpportunityIds,
  accessibleImportanceTaskIds,
  canManageImportanceOpportunity,
  canManageImportanceTask,
  ensureCrmImportanceTable,
  parseCrmImportance,
} from "@/lib/crm-importance-server";
import type { AppRole } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<AppRole>([
  "administrador",
  "gerente",
  "vendedor",
  "funcionario",
  "tecnico",
  "representante",
]);

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role as AppRole)) {
      return errorResponse("Sem permissão para acessar importância do CRM.", 403);
    }

    await ensureCrmImportanceTable();

    const [opportunityIds, taskIds] = await Promise.all([
      accessibleImportanceOpportunityIds({ id: profile.id, role: profile.role as AppRole }),
      accessibleImportanceTaskIds({ id: profile.id, role: profile.role as AppRole }),
    ]);

    if (!opportunityIds.length && !taskIds.length) {
      return NextResponse.json({ sucesso: true, items: [] });
    }

    const items = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT id, opportunity_id, task_id, importance, updated_by, created_at, updated_at
          FROM crm_importance
         WHERE (opportunity_id = ANY($1::uuid[]))
            OR (task_id = ANY($2::uuid[]))
         ORDER BY updated_at DESC
      `,
      opportunityIds,
      taskIds
    );

    return NextResponse.json({ sucesso: true, items: toJsonSafe(items) });
  } catch (error) {
    console.error("Erro ao carregar importância do CRM:", error);
    return errorResponse("Erro ao carregar importância do CRM.", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role as AppRole)) {
      return errorResponse("Sem permissão para alterar importância do CRM.", 403);
    }

    const body = await request.json();
    const opportunityId = typeof body?.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const taskId = typeof body?.task_id === "string" ? body.task_id.trim() : "";
    const importance = parseCrmImportance(body?.importance);

    if ((!opportunityId && !taskId) || (opportunityId && taskId)) {
      return errorResponse("Informe oportunidade ou tarefa, mas não ambas.", 400);
    }

    const recordId = opportunityId || taskId;
    if (!CRM_IMPORTANCE_UUID.test(recordId)) {
      return errorResponse("Registro inválido.", 400);
    }

    if (!importance) {
      return errorResponse("Importância inválida.", 400);
    }

    const canManage = opportunityId
      ? await canManageImportanceOpportunity(
          { id: profile.id, role: profile.role as AppRole },
          opportunityId
        )
      : await canManageImportanceTask(
          { id: profile.id, role: profile.role as AppRole },
          taskId
        );

    if (!canManage) {
      return errorResponse("Sem permissão para alterar este registro.", 403);
    }

    await ensureCrmImportanceTable();

    const rows = opportunityId
      ? await prisma.$queryRawUnsafe<any[]>(
          `
            INSERT INTO crm_importance (opportunity_id, importance, updated_by)
            VALUES ($1::uuid, $2, $3::uuid)
            ON CONFLICT (opportunity_id)
            DO UPDATE SET importance = EXCLUDED.importance,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = now()
            RETURNING id, opportunity_id, task_id, importance, updated_by, created_at, updated_at
          `,
          opportunityId,
          importance,
          profile.id
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `
            INSERT INTO crm_importance (task_id, importance, updated_by)
            VALUES ($1::uuid, $2, $3::uuid)
            ON CONFLICT (task_id)
            DO UPDATE SET importance = EXCLUDED.importance,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = now()
            RETURNING id, opportunity_id, task_id, importance, updated_by, created_at, updated_at
          `,
          taskId,
          importance,
          profile.id
        );

    return NextResponse.json({ sucesso: true, item: toJsonSafe(rows[0]) });
  } catch (error) {
    console.error("Erro ao salvar importância do CRM:", error);
    return errorResponse("Erro ao salvar importância do CRM.", 500);
  }
}

import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_PREFIX = "__CRM_GENERAL_TASK__";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedRoles = new Set(["administrador", "gerente", "vendedor", "representante"]);

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

function decodeDescription(value: string | null | undefined) {
  const raw = String(value || "");
  if (!raw.startsWith(META_PREFIX)) {
    return { notes: raw, next_action: "" };
  }

  try {
    const parsed = JSON.parse(raw.slice(META_PREFIX.length));
    return {
      notes: typeof parsed?.notes === "string" ? parsed.notes : "",
      next_action: typeof parsed?.next_action === "string" ? parsed.next_action : "",
    };
  } catch {
    return { notes: raw, next_action: "" };
  }
}

function encodeDescription(notes: string, nextAction: string) {
  return `${META_PREFIX}${JSON.stringify({ notes, next_action: nextAction })}`;
}

export async function PATCH(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role)) {
      return errorResponse("Sem permissão para editar tarefas do CRM.", 403);
    }

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    if (!uuidPattern.test(id)) return errorResponse("Tarefa inválida.", 400);
    if (!title) return errorResponse("Informe o título.", 400);

    const task = await prisma.crm_tasks.findUnique({
      where: { id },
      select: {
        id: true,
        created_by: true,
        assigned_to: true,
        opportunity_id: true,
        description: true,
      },
    });

    if (!task || task.opportunity_id) {
      return errorResponse("Tarefa não encontrada.", 404);
    }

    const canManage =
      profile.role === "administrador" ||
      task.created_by === profile.id ||
      task.assigned_to === profile.id;

    if (!canManage) {
      return errorResponse("Sem permissão para editar esta tarefa.", 403);
    }

    const metadata = decodeDescription(task.description);

    const updated = await prisma.crm_tasks.update({
      where: { id },
      data: {
        title: title.slice(0, 200),
        description: encodeDescription(notes.slice(0, 5000), metadata.next_action),
        updated_at: new Date(),
      },
      select: {
        id: true,
        title: true,
        description: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      task: toJsonSafe({
        id: updated.id,
        title: updated.title,
        notes: decodeDescription(updated.description).notes,
        updated_at: updated.updated_at,
      }),
    });
  } catch (error) {
    console.error("Erro ao editar tarefa geral do CRM:", error);
    return errorResponse("Erro ao editar tarefa geral do CRM.", 500);
  }
}

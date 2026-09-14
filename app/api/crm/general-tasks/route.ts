import { NextResponse } from "next/server";
import { buildAccessibleClientWhere } from "@/lib/client-visibility";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTHER_CLIENT_TOKEN = "__crm_other__";
const OTHER_CLIENT_MARKER = "__CRM_OUTROS__";
const META_PREFIX = "__CRM_GENERAL_TASK__";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedRoles = new Set(["administrador", "gerente", "vendedor", "representante"]);

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

async function ensureOtherClient() {
  const existing = await prisma.clients.findFirst({
    where: { document: OTHER_CLIENT_MARKER },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.clients.create({
    data: {
      name: OTHER_CLIENT_MARKER,
      document: OTHER_CLIENT_MARKER,
      phone: "",
      cep: "",
      city: "Sistema",
      street: "",
      number: "",
      no_number: true,
      neighborhood: "",
      proposal_status: "Outros",
      created_by: null,
    },
    select: { id: true },
  });

  return created.id;
}

function encodeDescription(notes: string, nextAction: string) {
  return `${META_PREFIX}${JSON.stringify({ notes, next_action: nextAction })}`;
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

function shapeTask(task: any) {
  const metadata = decodeDescription(task.description);
  const isOtherClient = task.clients?.document === OTHER_CLIENT_MARKER;

  return {
    id: task.id,
    client_id: isOtherClient ? OTHER_CLIENT_TOKEN : task.client_id,
    real_client_id: task.client_id,
    stage: "other",
    status: task.status,
    title: task.title,
    estimated_value: 0,
    probability: 0,
    responsible_id: task.assigned_to,
    next_action: metadata.next_action,
    next_action_at: task.due_at,
    notes: metadata.notes,
    created_by: task.created_by,
    created_at: task.created_at,
    updated_at: task.updated_at,
    completed_at: task.completed_at,
    clients: {
      id: isOtherClient ? OTHER_CLIENT_TOKEN : task.clients?.id,
      name: isOtherClient ? "Outros" : task.clients?.name || "Outros",
    },
    profiles_responsible: task.profiles_assigned_to
      ? {
          id: task.profiles_assigned_to.id,
          name: task.profiles_assigned_to.name,
          email: task.profiles_assigned_to.email,
          role: task.profiles_assigned_to.role,
          status: task.profiles_assigned_to.status,
        }
      : null,
    is_general_task: true,
  };
}

const taskInclude = {
  clients: {
    select: { id: true, name: true, document: true },
  },
  profiles_assigned_to: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
} as const;

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role)) return errorResponse("Sem permissão para acessar tarefas do CRM.", 403);

    const where = profile.role === "administrador"
      ? undefined
      : {
          OR: [
            { created_by: profile.id },
            { assigned_to: profile.id },
          ],
        };

    const tasks = await prisma.crm_tasks.findMany({
      where: where ? { AND: [where, { opportunity_id: null }] } : { opportunity_id: null },
      orderBy: { created_at: "desc" },
      include: taskInclude,
    });

    return NextResponse.json({
      sucesso: true,
      tasks: toJsonSafe(tasks.map(shapeTask)),
    });
  } catch (error) {
    console.error("Erro ao carregar tarefas gerais do CRM:", error);
    return errorResponse("Erro ao carregar tarefas gerais do CRM.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role)) return errorResponse("Sem permissão para criar tarefas no CRM.", 403);

    const body = await request.json();
    const rawClientId = typeof body?.client_id === "string" ? body.client_id.trim() : "";
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "Tarefa";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    const nextAction = typeof body?.next_action === "string" ? body.next_action.trim() : "";
    const responsibleId = typeof body?.responsible_id === "string" && body.responsible_id.trim()
      ? body.responsible_id.trim()
      : null;

    let clientId: string;
    if (!rawClientId || rawClientId === OTHER_CLIENT_TOKEN) {
      clientId = await ensureOtherClient();
    } else {
      if (!uuidPattern.test(rawClientId)) return errorResponse("Cliente inválido.", 400);
      const client = await prisma.clients.findFirst({
        where: buildAccessibleClientWhere({ id: profile.id, role: profile.role }, rawClientId),
        select: { id: true },
      });
      if (!client) return errorResponse("Cliente não encontrado ou sem permissão.", 404);
      clientId = client.id;
    }

    if (responsibleId) {
      if (!uuidPattern.test(responsibleId)) return errorResponse("Responsável inválido.", 400);
      const responsible = await prisma.profiles.findUnique({
        where: { id: responsibleId },
        select: { id: true, role: true, status: true, responsible_seller_id: true },
      });
      if (!responsible || responsible.status !== "approved" || !allowedRoles.has(responsible.role)) {
        return errorResponse("Responsável não encontrado ou indisponível.", 400);
      }

      const canAssign =
        ["administrador", "gerente"].includes(profile.role) ||
        responsibleId === profile.id ||
        (profile.role === "vendedor" &&
          responsible.role === "representante" &&
          responsible.responsible_seller_id === profile.id);

      if (!canAssign) return errorResponse("Você não pode atribuir esta tarefa a esse responsável.", 403);
    }

    let dueAt: Date | null = null;
    if (body?.next_action_at) {
      dueAt = new Date(String(body.next_action_at));
      if (Number.isNaN(dueAt.getTime())) return errorResponse("Data da tarefa inválida.", 400);
    }

    const task = await prisma.crm_tasks.create({
      data: {
        client_id: clientId,
        opportunity_id: null,
        assigned_to: responsibleId,
        created_by: profile.id,
        title: title.slice(0, 200),
        description: encodeDescription(notes.slice(0, 5000), nextAction.slice(0, 100)),
        due_at: dueAt,
        status: "pending",
      },
      include: taskInclude,
    });

    const shaped = shapeTask(task);
    return NextResponse.json({ sucesso: true, task: toJsonSafe(shaped), opportunity: toJsonSafe(shaped) }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar tarefa geral do CRM:", error);
    return errorResponse("Erro ao criar tarefa geral do CRM.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role)) return errorResponse("Sem permissão para alterar tarefas do CRM.", 403);

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!uuidPattern.test(id)) return errorResponse("Tarefa inválida.", 400);

    const task = await prisma.crm_tasks.findUnique({
      where: { id },
      select: { id: true, created_by: true, assigned_to: true, opportunity_id: true },
    });
    if (!task || task.opportunity_id) return errorResponse("Tarefa não encontrada.", 404);

    const canManage = profile.role === "administrador" || task.created_by === profile.id || task.assigned_to === profile.id;
    if (!canManage) return errorResponse("Sem permissão para alterar esta tarefa.", 403);

    const action = String(body?.action || "");
    if (!new Set(["complete", "reopen"]).has(action)) return errorResponse("Ação inválida.", 400);

    const updated = await prisma.crm_tasks.update({
      where: { id },
      data: action === "complete"
        ? { status: "completed", completed_at: new Date(), updated_at: new Date() }
        : { status: "pending", completed_at: null, updated_at: new Date() },
      include: taskInclude,
    });

    return NextResponse.json({ sucesso: true, task: toJsonSafe(shapeTask(updated)) });
  } catch (error) {
    console.error("Erro ao alterar tarefa geral do CRM:", error);
    return errorResponse("Erro ao alterar tarefa geral do CRM.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return errorResponse("Não autenticado.", 401);
    if (!allowedRoles.has(profile.role)) return errorResponse("Sem permissão para excluir tarefas do CRM.", 403);

    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!uuidPattern.test(id)) return errorResponse("Tarefa inválida.", 400);

    const task = await prisma.crm_tasks.findUnique({
      where: { id },
      select: { id: true, created_by: true, assigned_to: true, opportunity_id: true },
    });
    if (!task || task.opportunity_id) return errorResponse("Tarefa não encontrada.", 404);

    const canManage = profile.role === "administrador" || task.created_by === profile.id || task.assigned_to === profile.id;
    if (!canManage) return errorResponse("Sem permissão para excluir esta tarefa.", 403);

    await prisma.crm_tasks.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("Erro ao excluir tarefa geral do CRM:", error);
    return errorResponse("Erro ao excluir tarefa geral do CRM.", 500);
  }
}

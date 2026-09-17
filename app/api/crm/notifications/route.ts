import { NextResponse } from "next/server";
import { buildOpportunityVisibilityWhere } from "@/lib/client-visibility";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRM_TIME_ZONE = "America/Sao_Paulo";
const META_PREFIX = "__CRM_GENERAL_TASK__";
const OTHER_CLIENT_MARKER = "__CRM_OUTROS__";
const visibleForAllRoles = new Set(["administrador"]);
const visibleForOwnRoles = new Set([
  "gerente",
  "vendedor",
  "funcionario",
  "tecnico",
  "representante",
]);

const actionLabels: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  meeting: "Reunião",
  proposal_sent: "Enviar proposta",
  billing: "Cobrança",
  follow_up: "Retorno",
  other: "Outro",
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getDateParts(date: Date) {
  return Object.fromEntries(
    datePartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as DateParts & { hour: number; minute: number; second: number };
}

function startOfZonedDay(parts: DateParts) {
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = getDateParts(new Date(candidate));
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second
    );
    candidate += targetAsUtc - currentAsUtc;
  }

  return new Date(candidate);
}

function addCalendarDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function decodeTaskDescription(value: string | null | undefined) {
  const raw = String(value || "");

  if (!raw.startsWith(META_PREFIX)) {
    return { next_action: "other" };
  }

  try {
    const parsed = JSON.parse(raw.slice(META_PREFIX.length));
    return {
      next_action:
        typeof parsed?.next_action === "string" && parsed.next_action.trim()
          ? parsed.next_action.trim()
          : "other",
    };
  } catch {
    return { next_action: "other" };
  }
}

function lateDays(date: Date, todayStart: Date) {
  if (date >= todayStart) return 0;
  return Math.max(1, Math.ceil((todayStart.getTime() - date.getTime()) / 86_400_000));
}

function adminOverdueTitle(title: string, date: Date, todayStart: Date, isAdmin: boolean) {
  if (!isAdmin || date >= todayStart) return title;

  const days = lateDays(date, todayStart);
  return `ATRASADA HÁ ${days} ${days === 1 ? "DIA" : "DIAS"} — ${title || "Atividade"}`;
}

function emptyResponse() {
  return {
    sucesso: true,
    resumo: {
      atrasadas: 0,
      hoje: 0,
      proximas: 0,
      total_atencao: 0,
    },
    atrasadas: [],
    hoje: [],
    proximas: [],
  };
}

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

export async function GET() {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    const canSeeAll = visibleForAllRoles.has(authenticatedProfile.role);
    const canSeeOwn = visibleForOwnRoles.has(authenticatedProfile.role);

    if (!canSeeAll && !canSeeOwn) {
      return NextResponse.json(emptyResponse());
    }

    const todayParts = getDateParts(new Date());
    const todayStart = startOfZonedDay(todayParts);
    const tomorrowStart = startOfZonedDay(addCalendarDays(todayParts, 1));
    const upcomingEnd = startOfZonedDay(addCalendarDays(todayParts, 8));

    const visibilityWhere = canSeeOwn
      ? buildOpportunityVisibilityWhere({
          id: authenticatedProfile.id,
          role: authenticatedProfile.role,
        })
      : undefined;

    const taskVisibilityWhere = canSeeOwn
      ? {
          OR: [
            { created_by: authenticatedProfile.id },
            { assigned_to: authenticatedProfile.id },
          ],
        }
      : undefined;

    const [opportunities, tasks] = await Promise.all([
      prisma.crm_opportunities.findMany({
        where: {
          status: "open",
          stage: { not: "completed" },
          next_action: { not: "" },
          next_action_at: {
            not: null,
            lt: upcomingEnd,
          },
          ...(visibilityWhere || {}),
        },
        orderBy: { next_action_at: "asc" },
        select: {
          id: true,
          title: true,
          stage: true,
          next_action: true,
          next_action_at: true,
          estimated_value: true,
          clients: {
            select: {
              id: true,
              name: true,
            },
          },
          profiles_responsible: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.crm_tasks.findMany({
        where: {
          opportunity_id: null,
          status: { not: "completed" },
          due_at: {
            not: null,
            lt: upcomingEnd,
          },
          ...(taskVisibilityWhere || {}),
        },
        orderBy: { due_at: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          due_at: true,
          clients: {
            select: {
              id: true,
              name: true,
              document: true,
            },
          },
          profiles_assigned_to: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const atrasadas: any[] = [];
    const hoje: any[] = [];
    const proximas: any[] = [];

    const addItem = (item: any, date: Date) => {
      if (date < todayStart) {
        atrasadas.push(item);
      } else if (date < tomorrowStart) {
        hoje.push(item);
      } else {
        proximas.push(item);
      }
    };

    for (const opportunity of opportunities) {
      if (!opportunity.next_action.trim() || !opportunity.next_action_at) continue;

      const date = opportunity.next_action_at;
      addItem(
        {
          opportunity_id: opportunity.id,
          source: "opportunity",
          title: adminOverdueTitle(
            opportunity.title || "Atividade",
            date,
            todayStart,
            canSeeAll
          ),
          stage: opportunity.stage,
          next_action: opportunity.next_action,
          next_action_at: date,
          overdue_days: lateDays(date, todayStart),
          estimated_value: opportunity.estimated_value,
          client: opportunity.clients,
          responsible: opportunity.profiles_responsible,
        },
        date
      );
    }

    for (const task of tasks) {
      if (!task.due_at) continue;

      const metadata = decodeTaskDescription(task.description);
      const date = task.due_at;
      const isOtherClient = task.clients?.document === OTHER_CLIENT_MARKER;
      const nextAction = metadata.next_action || "other";

      addItem(
        {
          opportunity_id: task.id,
          task_id: task.id,
          source: "task",
          title: adminOverdueTitle(
            task.title || "Tarefa",
            date,
            todayStart,
            canSeeAll
          ),
          stage: "Outros",
          next_action: actionLabels[nextAction] || nextAction,
          next_action_at: date,
          overdue_days: lateDays(date, todayStart),
          estimated_value: 0,
          client: {
            id: task.clients?.id || "",
            name: isOtherClient ? "Outros" : task.clients?.name || "Outros",
          },
          responsible: task.profiles_assigned_to,
        },
        date
      );
    }

    atrasadas.sort(
      (a, b) => new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime()
    );
    hoje.sort(
      (a, b) => new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime()
    );
    proximas.sort(
      (a, b) => new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime()
    );

    return NextResponse.json(
      toJsonSafe({
        sucesso: true,
        resumo: {
          atrasadas: atrasadas.length,
          hoje: hoje.length,
          proximas: proximas.length,
          total_atencao: atrasadas.length + hoje.length,
        },
        atrasadas,
        hoje,
        proximas,
      })
    );
  } catch (error) {
    console.error("Erro ao carregar notificações do CRM:", error);
    return errorResponse("Erro ao carregar notificações do CRM.", 500);
  }
}

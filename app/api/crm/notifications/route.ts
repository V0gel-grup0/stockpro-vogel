import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRM_TIME_ZONE = "America/Sao_Paulo";
const visibleForAllRoles = new Set(["administrador", "gerente"]);
const visibleForOwnRoles = new Set(["vendedor", "representante"]);

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

    const opportunities = await prisma.crm_opportunities.findMany({
      where: {
        next_action: {
          not: "",
        },
        next_action_at: {
          not: null,
          lt: upcomingEnd,
        },
        ...(canSeeOwn
          ? {
              OR: [
                { responsible_id: authenticatedProfile.id },
                { created_by: authenticatedProfile.id },
              ],
            }
          : {}),
      },
      orderBy: {
        next_action_at: "asc",
      },
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
    });

    const atrasadas: unknown[] = [];
    const hoje: unknown[] = [];
    const proximas: unknown[] = [];

    for (const opportunity of opportunities) {
      if (!opportunity.next_action.trim() || !opportunity.next_action_at) {
        continue;
      }

      const item = {
        opportunity_id: opportunity.id,
        title: opportunity.title,
        stage: opportunity.stage,
        next_action: opportunity.next_action,
        next_action_at: opportunity.next_action_at,
        estimated_value: opportunity.estimated_value,
        client: opportunity.clients,
        responsible: opportunity.profiles_responsible,
      };

      if (opportunity.next_action_at < todayStart) {
        atrasadas.push(item);
      } else if (opportunity.next_action_at < tomorrowStart) {
        hoje.push(item);
      } else {
        proximas.push(item);
      }
    }

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

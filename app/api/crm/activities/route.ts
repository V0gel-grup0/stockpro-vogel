import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const activityRoles = new Set([
  "administrador",
  "gerente",
  "vendedor",
  "representante",
]);

const activityTypes = new Set([
  "call",
  "whatsapp",
  "email",
  "visit",
  "meeting",
  "proposal_sent",
  "billing",
  "follow_up",
  "other",
]);

const activityInclude = {
  clients: {
    select: {
      id: true,
      name: true,
    },
  },
  crm_opportunities: {
    select: {
      id: true,
      title: true,
      stage: true,
      client_id: true,
    },
  },
  profiles: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

export async function GET(request: Request) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get("opportunity_id")?.trim() || "";
    const clientId = searchParams.get("client_id")?.trim() || "";

    if (opportunityId && !uuidPattern.test(opportunityId)) {
      return errorResponse("opportunity_id deve ser um UUID válido.", 400);
    }

    if (clientId && !uuidPattern.test(clientId)) {
      return errorResponse("client_id deve ser um UUID válido.", 400);
    }

    const activities = await prisma.crm_activities.findMany({
      where: {
        ...(opportunityId ? { opportunity_id: opportunityId } : {}),
        ...(clientId ? { client_id: clientId } : {}),
      },
      orderBy: {
        happened_at: "desc",
      },
      include: activityInclude,
    });

    return NextResponse.json({
      sucesso: true,
      activities: toJsonSafe(activities),
    });
  } catch (error) {
    console.error("Erro ao carregar atividades do CRM:", error);

    return errorResponse("Erro ao carregar atividades do CRM.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    if (!activityRoles.has(authenticatedProfile.role)) {
      return errorResponse(
        "Seu perfil não tem permissão para registrar atividades comerciais.",
        403
      );
    }

    const parsedBody = await request.json();

    if (
      parsedBody === null ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      return errorResponse("O corpo da requisição deve ser um objeto JSON.", 400);
    }

    const body = parsedBody as Record<string, unknown>;

    if ("created_by" in body) {
      return errorResponse(
        "created_by não pode ser informado pelo frontend.",
        400
      );
    }

    const clientId =
      typeof body.client_id === "string" ? body.client_id.trim() : "";

    if (!clientId) {
      return errorResponse("client_id é obrigatório.", 400);
    }

    if (!uuidPattern.test(clientId)) {
      return errorResponse("client_id deve ser um UUID válido.", 400);
    }

    let opportunityId: string | null = null;

    if (body.opportunity_id !== undefined && body.opportunity_id !== null && body.opportunity_id !== "") {
      if (
        typeof body.opportunity_id !== "string" ||
        !uuidPattern.test(body.opportunity_id.trim())
      ) {
        return errorResponse("opportunity_id deve ser um UUID válido.", 400);
      }

      opportunityId = body.opportunity_id.trim();
    }

    const type = typeof body.type === "string" ? body.type.trim() : "";

    if (!type || !activityTypes.has(type)) {
      return errorResponse("Tipo de atividade inválido.", 400);
    }

    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    if (!description) {
      return errorResponse("description é obrigatória.", 400);
    }

    let happenedAt: Date | undefined;

    if (body.happened_at !== undefined && body.happened_at !== null && body.happened_at !== "") {
      if (typeof body.happened_at !== "string") {
        return errorResponse("happened_at deve ser uma data válida.", 400);
      }

      happenedAt = new Date(body.happened_at);

      if (Number.isNaN(happenedAt.getTime())) {
        return errorResponse("happened_at deve ser uma data válida.", 400);
      }
    }

    const [client, opportunity] = await Promise.all([
      prisma.clients.findUnique({
        where: { id: clientId },
        select: { id: true },
      }),
      opportunityId
        ? prisma.crm_opportunities.findUnique({
            where: { id: opportunityId },
            select: {
              id: true,
              client_id: true,
              created_by: true,
              responsible_id: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!client) {
      return errorResponse("Cliente não encontrado.", 404);
    }

    if (opportunityId && !opportunity) {
      return errorResponse("Oportunidade não encontrada.", 404);
    }

    if (opportunity && opportunity.client_id !== clientId) {
      return errorResponse(
        "A oportunidade informada não pertence ao cliente.",
        400
      );
    }

    const hasFullAccess =
      authenticatedProfile.role === "administrador" ||
      authenticatedProfile.role === "gerente";

    if (!hasFullAccess) {
      if (opportunity) {
        const canRegister =
          opportunity.created_by === authenticatedProfile.id ||
          opportunity.responsible_id === authenticatedProfile.id;

        if (!canRegister) {
          return errorResponse(
            "Você não tem permissão para registrar atividades nesta oportunidade.",
            403
          );
        }
      } else {
        const activeOpportunity = await prisma.crm_opportunities.findFirst({
          where: {
            client_id: clientId,
            status: "open",
            OR: [
              { created_by: authenticatedProfile.id },
              { responsible_id: authenticatedProfile.id },
            ],
          },
          select: { id: true },
        });

        if (!activeOpportunity) {
          return errorResponse(
            "Você não tem uma oportunidade ativa vinculada a este cliente.",
            403
          );
        }
      }
    }

    const data: Prisma.crm_activitiesUncheckedCreateInput = {
      client_id: clientId,
      opportunity_id: opportunityId,
      created_by: authenticatedProfile.id,
      type,
      description,
      ...(happenedAt ? { happened_at: happenedAt } : {}),
    };

    const activity = await prisma.crm_activities.create({
      data,
      include: activityInclude,
    });

    return NextResponse.json(
      {
        sucesso: true,
        activity: toJsonSafe(activity),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao registrar atividade do CRM:", error);

    return errorResponse("Erro ao registrar atividade do CRM.", 500);
  }
}

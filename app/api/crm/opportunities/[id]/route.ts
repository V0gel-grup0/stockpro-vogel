import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const opportunityRoles = new Set([
  "administrador",
  "gerente",
  "vendedor",
  "representante",
]);

const opportunityStages = new Set([
  "lead",
  "proposal",
  "negotiation",
  "order_created",
  "billing",
  "completed",
  "post_sale",
]);

const editableFields = new Set([
  "stage",
  "title",
  "estimated_value",
  "probability",
  "responsible_id",
  "next_action",
  "next_action_at",
  "lost_reason",
  "notes",
]);

const opportunityInclude = {
  clients: {
    select: {
      id: true,
      name: true,
      document: true,
      phone: true,
      city: true,
      proposal_status: true,
    },
  },
  profiles_responsible: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
  },
} as const;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type OpportunityOwner = {
  created_by: string | null;
  responsible_id: string | null;
};

function errorResponse(erro: string, status: number) {
  return NextResponse.json(
    {
      sucesso: false,
      erro,
    },
    {
      status,
    }
  );
}

function canManageOpportunity(
  profile: { id: string; role: string },
  opportunity: OpportunityOwner
) {
  if (profile.role === "administrador" || profile.role === "gerente") {
    return true;
  }

  return (
    opportunity.created_by === profile.id ||
    opportunity.responsible_id === profile.id
  );
}

async function getOpportunityId(context: RouteContext) {
  const { id: rawId } = await context.params;
  return rawId.trim();
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    if (!opportunityRoles.has(authenticatedProfile.role)) {
      return errorResponse(
        "Seu perfil não tem permissão para editar oportunidades.",
        403
      );
    }

    const opportunityId = await getOpportunityId(context);

    if (!uuidPattern.test(opportunityId)) {
      return errorResponse("id deve ser um UUID válido.", 400);
    }

    const existingOpportunity = await prisma.crm_opportunities.findUnique({
      where: {
        id: opportunityId,
      },
      select: {
        id: true,
        created_by: true,
        responsible_id: true,
      },
    });

    if (!existingOpportunity) {
      return errorResponse("Oportunidade não encontrada.", 404);
    }

    if (!canManageOpportunity(authenticatedProfile, existingOpportunity)) {
      return errorResponse(
        "Você não tem permissão para editar esta oportunidade.",
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
    const unknownField = Object.keys(body).find(
      (field) => !editableFields.has(field)
    );

    if (unknownField) {
      return errorResponse(
        `O campo ${unknownField} não pode ser alterado nesta operação.`,
        400
      );
    }

    if (Object.keys(body).length === 0) {
      return errorResponse("Informe ao menos um campo para atualizar.", 400);
    }

    const data: Prisma.crm_opportunitiesUncheckedUpdateInput = {};
    const textFields = [
      "title",
      "next_action",
      "lost_reason",
      "notes",
    ] as const;

    for (const field of textFields) {
      if (!(field in body)) {
        continue;
      }

      if (typeof body[field] !== "string") {
        return errorResponse(`${field} deve ser uma string.`, 400);
      }

      data[field] = body[field].trim();
    }

    if ("stage" in body) {
      const stage = typeof body.stage === "string" ? body.stage.trim() : "";

      if (!opportunityStages.has(stage)) {
        return errorResponse(
          "stage deve ser lead, proposal, negotiation, order_created, billing, completed ou post_sale.",
          400
        );
      }

      data.stage = stage;
    }

    if ("estimated_value" in body) {
      const rawValue = body.estimated_value;
      const estimatedValue =
        (typeof rawValue === "number" || typeof rawValue === "string") &&
        String(rawValue).trim() !== ""
          ? Number(rawValue)
          : Number.NaN;

      if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
        return errorResponse(
          "estimated_value deve ser um número maior ou igual a zero.",
          400
        );
      }

      data.estimated_value = estimatedValue;
    }

    if ("probability" in body) {
      const rawValue = body.probability;
      const probability =
        (typeof rawValue === "number" || typeof rawValue === "string") &&
        String(rawValue).trim() !== ""
          ? Number(rawValue)
          : Number.NaN;

      if (
        !Number.isInteger(probability) ||
        probability < 0 ||
        probability > 100
      ) {
        return errorResponse(
          "probability deve ser um número inteiro entre 0 e 100.",
          400
        );
      }

      data.probability = probability;
    }

    if ("next_action_at" in body) {
      const rawValue = body.next_action_at;

      if (rawValue === null || rawValue === "") {
        data.next_action_at = null;
      } else if (typeof rawValue === "string") {
        const nextActionAt = new Date(rawValue);

        if (Number.isNaN(nextActionAt.getTime())) {
          return errorResponse("next_action_at deve ser uma data válida.", 400);
        }

        data.next_action_at = nextActionAt;
      } else {
        return errorResponse("next_action_at deve ser uma data válida.", 400);
      }
    }

    if ("responsible_id" in body) {
      const rawResponsibleId = body.responsible_id;
      let responsibleId: string | null;

      if (rawResponsibleId === null || rawResponsibleId === "") {
        responsibleId = null;
      } else if (
        typeof rawResponsibleId === "string" &&
        uuidPattern.test(rawResponsibleId.trim())
      ) {
        responsibleId = rawResponsibleId.trim();
      } else {
        return errorResponse("responsible_id deve ser um UUID válido.", 400);
      }

      if (responsibleId) {
        const responsibleProfile = await prisma.profiles.findUnique({
          where: {
            id: responsibleId,
          },
          select: {
            id: true,
            role: true,
            status: true,
          },
        });

        if (!responsibleProfile) {
          return errorResponse("Perfil responsável não encontrado.", 404);
        }

        if (responsibleProfile.status !== "approved") {
          return errorResponse("O perfil responsável não está aprovado.", 400);
        }

        if (!opportunityRoles.has(responsibleProfile.role)) {
          return errorResponse(
            "O perfil responsável não possui uma role permitida.",
            400
          );
        }
      }

      data.responsible_id = responsibleId;
    }

    const opportunity = await prisma.crm_opportunities.update({
      where: {
        id: opportunityId,
      },
      data,
      include: opportunityInclude,
    });

    return NextResponse.json({
      sucesso: true,
      opportunity: toJsonSafe(opportunity),
    });
  } catch (error) {
    console.error("Erro ao editar oportunidade do CRM:", error);

    if (error instanceof SyntaxError) {
      return errorResponse("JSON inválido.", 400);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("Oportunidade não encontrada.", 404);
    }

    return errorResponse("Erro ao editar oportunidade do CRM.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    if (!opportunityRoles.has(authenticatedProfile.role)) {
      return errorResponse(
        "Seu perfil não tem permissão para excluir oportunidades.",
        403
      );
    }

    const opportunityId = await getOpportunityId(context);

    if (!uuidPattern.test(opportunityId)) {
      return errorResponse("id deve ser um UUID válido.", 400);
    }

    const opportunity = await prisma.crm_opportunities.findUnique({
      where: {
        id: opportunityId,
      },
      select: {
        id: true,
        created_by: true,
        responsible_id: true,
        _count: {
          select: {
            crm_activities: true,
            crm_tasks: true,
          },
        },
      },
    });

    if (!opportunity) {
      return errorResponse("Oportunidade não encontrada.", 404);
    }

    if (!canManageOpportunity(authenticatedProfile, opportunity)) {
      return errorResponse(
        "Você não tem permissão para excluir esta oportunidade.",
        403
      );
    }

    if (
      opportunity._count.crm_activities > 0 ||
      opportunity._count.crm_tasks > 0
    ) {
      return errorResponse(
        "Esta oportunidade possui histórico ou tarefas vinculadas e não pode ser excluída diretamente.",
        409
      );
    }

    await prisma.crm_opportunities.delete({
      where: {
        id: opportunityId,
      },
    });

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error("Erro ao excluir oportunidade do CRM:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return errorResponse("Oportunidade não encontrada.", 404);
      }

      if (error.code === "P2003") {
        return errorResponse(
          "Esta oportunidade possui histórico ou tarefas vinculadas e não pode ser excluída diretamente.",
          409
        );
      }
    }

    return errorResponse("Erro ao excluir oportunidade do CRM.", 500);
  }
}

import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
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

function optionalUuid(
  body: Record<string, unknown>,
  field: "responsible_id"
) {
  if (!(field in body)) {
    return {
      valido: true as const,
      informado: false as const,
    };
  }

  const rawValue = body[field];

  if (rawValue === null || rawValue === "") {
    return {
      valido: true as const,
      informado: true as const,
      valor: null,
    };
  }

  if (typeof rawValue !== "string" || !uuidPattern.test(rawValue.trim())) {
    return {
      valido: false as const,
      erro: `${field} deve ser um UUID válido.`,
    };
  }

  return {
    valido: true as const,
    informado: true as const,
    valor: rawValue.trim(),
  };
}

export async function GET() {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    const requiresOwnership = ["vendedor", "representante"].includes(
      authenticatedProfile.role
    );
    const opportunities = await prisma.crm_opportunities.findMany({
      where: requiresOwnership
        ? {
            OR: [
              { created_by: authenticatedProfile.id },
              { responsible_id: authenticatedProfile.id },
            ],
          }
        : undefined,
      orderBy: {
        created_at: "desc",
      },
      include: opportunityInclude,
    });

    return NextResponse.json({
      sucesso: true,
      opportunities: toJsonSafe(opportunities),
    });
  } catch (error) {
    console.error("Erro ao carregar oportunidades do CRM:", error);

    return errorResponse("Erro ao carregar oportunidades do CRM.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    if (!opportunityRoles.has(authenticatedProfile.role)) {
      return errorResponse(
        "Seu perfil não tem permissão para criar oportunidades.",
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

    const responsibleId = optionalUuid(body, "responsible_id");

    if (!responsibleId.valido) {
      return errorResponse(responsibleId.erro, 400);
    }

    const data: Prisma.crm_opportunitiesUncheckedCreateInput = {
      client_id: clientId,
      created_by: authenticatedProfile.id,
    };

    const textFields = [
      "title",
      "next_action",
      "lost_reason",
      "notes",
    ] as const;
    const textLimits = {
      title: 200,
      next_action: 100,
      lost_reason: 1000,
      notes: 5000,
    } as const;

    for (const field of textFields) {
      if (!(field in body)) {
        continue;
      }

      if (typeof body[field] !== "string") {
        return errorResponse(`${field} deve ser uma string.`, 400);
      }

      const value = body[field].trim();
      if (value.length > textLimits[field]) {
        return errorResponse(
          `${field} excede o limite de ${textLimits[field]} caracteres.`,
          400
        );
      }

      (data as Record<string, unknown>)[field] = value;
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

    if ("status" in body) {
      if (typeof body.status !== "string" || body.status.trim() !== "open") {
        return errorResponse('status deve ser "open".', 400);
      }

      data.status = "open";
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

    if (responsibleId.informado) {
      data.responsible_id = responsibleId.valor;
    }

    const [client, responsibleProfile] = await Promise.all([
      prisma.clients.findUnique({
        where: {
          id: clientId,
        },
        select: {
          id: true,
        },
      }),
      responsibleId.valor
        ? prisma.profiles.findUnique({
            where: {
              id: responsibleId.valor,
            },
            select: {
              id: true,
              role: true,
              status: true,
              responsible_seller_id: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!client) {
      return errorResponse("Cliente não encontrado.", 404);
    }

    if (responsibleId.valor && !responsibleProfile) {
      return errorResponse("Perfil responsável não encontrado.", 404);
    }

    if (
      responsibleProfile &&
      responsibleProfile.status !== "approved"
    ) {
      return errorResponse("O perfil responsável não está aprovado.", 400);
    }

    if (
      responsibleProfile &&
      !opportunityRoles.has(responsibleProfile.role)
    ) {
      return errorResponse(
        "O perfil responsável não possui uma role permitida.",
        400
      );
    }

    const canAssignResponsible =
      !responsibleId.valor ||
      ["administrador", "gerente"].includes(authenticatedProfile.role) ||
      responsibleId.valor === authenticatedProfile.id ||
      (authenticatedProfile.role === "vendedor" &&
        responsibleProfile?.role === "representante" &&
        responsibleProfile.responsible_seller_id === authenticatedProfile.id);

    if (!canAssignResponsible) {
      return errorResponse(
        "Você só pode atribuir a oportunidade a si mesmo ou a um representante vinculado.",
        403
      );
    }

    const opportunity = await prisma.crm_opportunities.create({
      data,
      include: opportunityInclude,
    });

    return NextResponse.json(
      {
        sucesso: true,
        opportunity: toJsonSafe(opportunity),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao criar oportunidade do CRM:", error);

    if (error instanceof SyntaxError) {
      return errorResponse("JSON inválido.", 400);
    }

    return errorResponse("Erro ao criar oportunidade do CRM.", 500);
  }
}

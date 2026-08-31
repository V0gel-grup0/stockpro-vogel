import type { Prisma } from "@/generated/prisma/client";
import { buildAccessibleClientWhere, buildOpportunityVisibilityWhere } from "@/lib/client-visibility";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import type { AppRole } from "@/lib/permissions";
import {
  calculateQuoteValues,
  canAssignQuoteResponsible,
  canCreateQuoteForClient,
  isOpportunityCompatible,
  unexpectedQuoteInputField,
  type QuoteProfile,
} from "@/lib/quote-policy";
import { prisma } from "@/lib/prisma";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const QUOTE_INCLUDE = {
  clients: {
    select: {
      id: true,
      name: true,
      document: true,
      phone: true,
      city: true,
      street: true,
      number: true,
      neighborhood: true,
    },
  },
  crm_opportunities: {
    select: { id: true, client_id: true, title: true, stage: true },
  },
  profiles_created_by: {
    select: { id: true, name: true, email: true, role: true },
  },
  profiles_responsible: {
    select: { id: true, name: true, email: true, role: true, responsible_seller_id: true },
  },
  quote_items: { orderBy: { created_at: "asc" as const } },
  quote_events: {
    orderBy: { created_at: "desc" as const },
    include: { profiles: { select: { id: true, name: true, role: true } } },
  },
  orders: { select: { id: true, order_number: true, status: true } },
} as const;

export class QuoteRequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function buildQuoteVisibilityWhere(profile: QuoteProfile): Prisma.quotesWhereInput | undefined {
  if (profile.role === "administrador" || profile.role === "gerente") return undefined;
  if (profile.role === "representante") {
    return { OR: [{ created_by: profile.id }, { responsible_id: profile.id }] };
  }
  if (profile.role === "vendedor") {
    return {
      OR: [
        { created_by: profile.id },
        { responsible_id: profile.id },
        {
          profiles_created_by: {
            is: { role: "representante", responsible_seller_id: profile.id },
          },
        },
        {
          profiles_responsible: {
            is: { role: "representante", responsible_seller_id: profile.id },
          },
        },
      ],
    };
  }
  return { id: "00000000-0000-0000-0000-000000000000" };
}

export function buildQuoteManagementWhere(profile: QuoteProfile): Prisma.quotesWhereInput | undefined {
  if (profile.role === "administrador" || profile.role === "gerente") return undefined;
  return { OR: [{ created_by: profile.id }, { responsible_id: profile.id }] };
}

function requiredUuid(value: unknown, field: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(id)) throw new QuoteRequestError(`${field} deve ser um UUID válido.`);
  return id;
}

function optionalUuid(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  return requiredUuid(value, field);
}

function limitedText(value: unknown, field: string, limit: number) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new QuoteRequestError(`${field} deve ser uma string.`);
  const normalized = value.trim();
  if (normalized.length > limit) {
    throw new QuoteRequestError(`${field} excede o limite de ${limit} caracteres.`);
  }
  return normalized;
}

function validUntilDate(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new QuoteRequestError("valid_until deve usar o formato YYYY-MM-DD.");
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new QuoteRequestError("valid_until deve ser uma data válida.");
  }
  return date;
}

export async function validateQuoteInput(
  rawBody: unknown,
  profile: { id: string; role: AppRole }
) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new QuoteRequestError("O corpo da requisição deve ser um objeto JSON.");
  }
  const body = rawBody as Record<string, unknown>;
  const forbidden = unexpectedQuoteInputField(body);
  if (forbidden) {
    throw new QuoteRequestError(`O campo ${forbidden} não pode ser informado nesta operação.`);
  }

  const clientId = requiredUuid(body.client_id, "client_id");
  const responsibleId = requiredUuid(body.responsible_id, "responsible_id");
  const opportunityId = optionalUuid(body.opportunity_id, "opportunity_id");

  const [client, responsible] = await Promise.all([
    prisma.clients.findFirst({
      where: buildAccessibleClientWhere(profile, clientId),
      select: { id: true },
    }),
    prisma.profiles.findUnique({
      where: { id: responsibleId },
      select: { id: true, role: true, status: true, responsible_seller_id: true },
    }),
  ]);
  if (!canCreateQuoteForClient(Boolean(client))) {
    throw new QuoteRequestError("Cliente não encontrado ou sem permissão.", 404);
  }
  if (!responsible) throw new QuoteRequestError("Responsável não encontrado.", 404);
  if (!canAssignQuoteResponsible(profile, responsible)) {
    throw new QuoteRequestError("Você não pode atribuir este responsável ao orçamento.", 403);
  }

  if (opportunityId) {
    const opportunityVisibility = buildOpportunityVisibilityWhere(profile);
    const opportunity = await prisma.crm_opportunities.findFirst({
      where: {
        AND: [
          { id: opportunityId, client_id: clientId },
          ...(opportunityVisibility ? [opportunityVisibility] : []),
        ],
      },
      select: { id: true, client_id: true },
    });
    if (!isOpportunityCompatible(opportunity, clientId, Boolean(opportunity))) {
      throw new QuoteRequestError(
        "Oportunidade não encontrada, sem permissão ou vinculada a outro cliente.",
        404
      );
    }
  }

  if (!Array.isArray(body.items)) {
    throw new QuoteRequestError("items deve ser uma lista.");
  }
  const sourceItems = body.items as Array<Record<string, unknown>>;
  const productIds = sourceItems
    .filter((item) => item?.item_type === "product")
    .map((item) => requiredUuid(item.product_id, "product_id"));
  const products = productIds.length
    ? await prisma.products.findMany({
        where: { id: { in: [...new Set(productIds)] } },
        select: { id: true, name: true, description: true },
      })
    : [];
  if (products.length !== new Set(productIds).size) {
    throw new QuoteRequestError("Um ou mais produtos não foram encontrados.", 404);
  }
  const productMap = new Map(products.map((product) => [product.id, product]));

  const normalizedItems = sourceItems.map((item, index) => {
    const itemType = item?.item_type;
    if (itemType === "product") {
      const productId = requiredUuid(item.product_id, `product_id do item ${index + 1}`);
      const product = productMap.get(productId);
      if (!product) throw new QuoteRequestError(`Produto do item ${index + 1} não encontrado.`, 404);
      return {
        ...item,
        product_id: product.id,
        item_name: product.name,
        description: limitedText(item.description ?? product.description, `Descrição do item ${index + 1}`, 2000),
      };
    }
    if (itemType === "equipment") {
      const name = limitedText(item.item_name, `Nome do item ${index + 1}`, 200);
      if (!EQUIPMENT_CATALOG.includes(name as (typeof EQUIPMENT_CATALOG)[number])) {
        throw new QuoteRequestError(`Equipamento inválido no item ${index + 1}.`);
      }
      return { ...item, product_id: null, item_name: name };
    }
    return { ...item, product_id: null };
  });

  let calculated;
  try {
    calculated = calculateQuoteValues(
      normalizedItems as Parameters<typeof calculateQuoteValues>[0],
      body.discount_value ?? 0,
      body.shipping_value ?? 0
    );
  } catch (error) {
    throw new QuoteRequestError(error instanceof Error ? error.message : "Valores do orçamento inválidos.");
  }

  return {
    quote: {
      client_id: clientId,
      opportunity_id: opportunityId,
      responsible_id: responsibleId,
      valid_until: validUntilDate(body.valid_until),
      payment_terms: limitedText(body.payment_terms, "payment_terms", 500),
      notes: limitedText(body.notes, "notes", 5000),
      discount_value: calculated.discount_value,
      shipping_value: calculated.shipping_value,
      subtotal: calculated.subtotal,
      total_value: calculated.total_value,
    },
    items: calculated.items,
  };
}

export function quoteIdWhere(profile: QuoteProfile, id: string, management = false) {
  const scope = management
    ? buildQuoteManagementWhere(profile)
    : buildQuoteVisibilityWhere(profile);
  return scope ? { AND: [{ id }, scope] } : { id };
}

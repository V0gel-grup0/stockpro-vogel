import type { AppRole } from "@/lib/permissions";

export const QUOTE_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
  "representante",
] as const satisfies readonly AppRole[];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
] as const;

export const QUOTE_ITEM_TYPES = ["product", "equipment", "custom"] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type QuoteItemType = (typeof QUOTE_ITEM_TYPES)[number];

export const QUOTE_INPUT_FIELDS = [
  "client_id",
  "opportunity_id",
  "responsible_id",
  "valid_until",
  "payment_terms",
  "notes",
  "discount_value",
  "shipping_value",
  "items",
] as const;

export type QuoteProfile = { id: string; role: string };
export type QuoteOwnerSnapshot = {
  created_by: string;
  responsible_id: string | null;
  creator?: { role: string; responsible_seller_id: string | null } | null;
  responsible?: { role: string; responsible_seller_id: string | null } | null;
};

const STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent", "rejected"],
  sent: ["approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

export function canUseQuotes(role: string) {
  return (QUOTE_ROLES as readonly string[]).includes(role);
}

export function canViewQuote(profile: QuoteProfile, quote: QuoteOwnerSnapshot) {
  if (profile.role === "administrador" || profile.role === "gerente") return true;
  if (!canUseQuotes(profile.role)) return false;
  if (quote.created_by === profile.id || quote.responsible_id === profile.id) return true;

  return Boolean(
    profile.role === "vendedor" &&
      ((quote.creator?.role === "representante" &&
        quote.creator.responsible_seller_id === profile.id) ||
        (quote.responsible?.role === "representante" &&
          quote.responsible.responsible_seller_id === profile.id))
  );
}

export function canManageQuote(profile: QuoteProfile, quote: QuoteOwnerSnapshot) {
  if (profile.role === "administrador" || profile.role === "gerente") return true;

  return (
    (profile.role === "vendedor" || profile.role === "representante") &&
    (quote.created_by === profile.id || quote.responsible_id === profile.id)
  );
}

export function canAssignQuoteResponsible(
  actor: QuoteProfile,
  responsible: {
    id: string;
    role: string;
    status: string;
    responsible_seller_id: string | null;
  }
) {
  if (responsible.status !== "approved" || !canUseQuotes(responsible.role)) return false;
  if (actor.role === "administrador" || actor.role === "gerente") return true;
  return responsible.id === actor.id;
}

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && QUOTE_STATUSES.includes(value as QuoteStatus);
}

export function canTransitionQuoteStatus(from: QuoteStatus, to: QuoteStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function isQuoteExpired(
  validUntil: Date | string | null | undefined,
  now = new Date()
) {
  if (!validUntil) return false;

  const datePart =
    validUntil instanceof Date
      ? validUntil.toISOString().slice(0, 10)
      : String(validUntil).slice(0, 10);

  const endOfValidity = new Date(`${datePart}T23:59:59.999Z`);

  return (
    !Number.isNaN(endOfValidity.getTime()) &&
    endOfValidity.getTime() < now.getTime()
  );
}

export function canEditQuoteStructure(status: QuoteStatus) {
  return status === "draft";
}

export function canDeleteQuote(status: QuoteStatus, generatedOrderId: string | null) {
  return status === "draft" && !generatedOrderId;
}

export function canGenerateOrder(status: QuoteStatus, generatedOrderId: string | null) {
  return status === "approved" && !generatedOrderId;
}

export function unexpectedQuoteInputField(body: Record<string, unknown>) {
  return (
    Object.keys(body).find(
      (field) => !(QUOTE_INPUT_FIELDS as readonly string[]).includes(field)
    ) || null
  );
}

export function canCreateQuoteForClient(clientIsAccessible: boolean) {
  return clientIsAccessible;
}

export function isOpportunityCompatible(
  opportunity: { client_id: string } | null,
  clientId: string,
  opportunityIsAccessible: boolean
) {
  return Boolean(
    opportunity &&
      opportunity.client_id === clientId &&
      opportunityIsAccessible
  );
}

export function buildQuoteStatusEvent(
  previousStatus: QuoteStatus,
  newStatus: Exclude<QuoteStatus, "draft">
) {
  const descriptions = {
    sent: "Orçamento enviado.",
    approved: "Orçamento aprovado.",
    rejected: "Orçamento recusado.",
    expired: "Orçamento vencido.",
  } as const;

  return {
    type: `status_${newStatus}`,
    description: descriptions[newStatus],
    previous_status: previousStatus,
    new_status: newStatus,
  };
}

export function validateOrderConversion(
  status: QuoteStatus,
  generatedOrderId: string | null,
  items: Array<{
    item_type: string;
    product_id: string | null;
    quantity: unknown;
  }>
) {
  if (!canGenerateOrder(status, generatedOrderId)) {
    return {
      allowed: false as const,
      reason: generatedOrderId
        ? "Este orçamento já gerou um pedido."
        : "Somente orçamento aprovado pode gerar pedido.",
    };
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return {
      allowed: false as const,
      reason: "O orçamento precisa possuir entre 1 e 100 itens para gerar pedido.",
    };
  }

  for (const item of items) {
    if (!["product", "equipment", "custom"].includes(item.item_type)) {
      return {
        allowed: false as const,
        reason: "O orçamento possui um tipo de item incompatível com pedidos.",
      };
    }

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        allowed: false as const,
        reason: "O orçamento possui quantidade inválida para gerar pedido.",
      };
    }

    if (["product", "equipment"].includes(item.item_type) && !Number.isInteger(quantity)) {
      return {
        allowed: false as const,
        reason: "Produtos e equipamentos precisam ter quantidade inteira para gerar pedido.",
      };
    }

    if (item.item_type === "product" && !item.product_id) {
      return {
        allowed: false as const,
        reason: "Existe produto sem vínculo com o cadastro de produtos.",
      };
    }
  }

  return { allowed: true as const, itemCount: items.length };
}

function decimalParts(
  value: unknown,
  scale: number,
  field: string,
  maxIntegerDigits = 12
) {
  const raw = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`${field} deve ser um número válido.`);
  }

  const [integer, fraction = ""] = raw.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  if (normalizedInteger.length > maxIntegerDigits) {
    throw new Error(`${field} excede o valor máximo permitido.`);
  }
  if (fraction.length > scale) {
    throw new Error(`${field} deve possuir no máximo ${scale} casas decimais.`);
  }

  return (
    BigInt(normalizedInteger) * BigInt(10) ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0")
  );
}

function cents(value: unknown, field: string) {
  return decimalParts(value, 2, field);
}

function decimalString(value: bigint, scale = 2) {
  const divisor = BigInt(10) ** BigInt(scale);
  const integer = value / divisor;
  const fraction = (value % divisor).toString().padStart(scale, "0");
  return `${integer}.${fraction}`;
}

export type QuoteItemInput = {
  item_type: unknown;
  product_id?: unknown;
  item_name: unknown;
  description?: unknown;
  quantity: unknown;
  unit_price: unknown;
  discount_value?: unknown;
};

export function calculateQuoteValues(
  rawItems: QuoteItemInput[],
  rawDiscount: unknown,
  rawShipping: unknown
) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new Error("O orçamento deve possuir entre 1 e 100 itens.");
  }

  const items = rawItems.map((rawItem, index) => {
    if (!QUOTE_ITEM_TYPES.includes(rawItem.item_type as QuoteItemType)) {
      throw new Error(`Tipo inválido no item ${index + 1}.`);
    }

    const itemName = typeof rawItem.item_name === "string" ? rawItem.item_name.trim() : "";
    const description = typeof rawItem.description === "string" ? rawItem.description.trim() : "";
    if (!itemName || itemName.length > 200) {
      throw new Error(`Nome inválido no item ${index + 1}.`);
    }
    if (description.length > 2000) {
      throw new Error(`Descrição excede 2000 caracteres no item ${index + 1}.`);
    }

    const quantity = decimalParts(
      rawItem.quantity,
      2,
      `Quantidade do item ${index + 1}`,
      10
    );
    const unitPrice = cents(rawItem.unit_price, `Valor unitário do item ${index + 1}`);
    const itemDiscount = cents(rawItem.discount_value ?? 0, `Desconto do item ${index + 1}`);
    if (quantity <= BigInt(0)) throw new Error(`Quantidade do item ${index + 1} deve ser maior que zero.`);

    const gross = (quantity * unitPrice + BigInt(50)) / BigInt(100);
    if (itemDiscount > gross) {
      throw new Error(`Desconto do item ${index + 1} não pode superar seu valor bruto.`);
    }

    return {
      item_type: rawItem.item_type as QuoteItemType,
      product_id:
        typeof rawItem.product_id === "string" && rawItem.product_id.trim()
          ? rawItem.product_id.trim()
          : null,
      item_name: itemName,
      description,
      quantity: decimalString(quantity),
      unit_price: decimalString(unitPrice),
      discount_value: decimalString(itemDiscount),
      total_value: decimalString(gross - itemDiscount),
      totalCents: gross - itemDiscount,
    };
  });

  const subtotal = items.reduce(
    (total, item) => total + item.totalCents,
    BigInt(0)
  );
  const discount = cents(rawDiscount ?? 0, "Desconto geral");
  const shipping = cents(rawShipping ?? 0, "Frete");
  if (discount > subtotal) throw new Error("Desconto geral não pode superar o subtotal.");

  const total = subtotal - discount + shipping;
  return {
    items: items.map(({ totalCents: _totalCents, ...item }) => item),
    subtotal: decimalString(subtotal),
    discount_value: decimalString(discount),
    shipping_value: decimalString(shipping),
    total_value: decimalString(total),
  };
}

export function effectiveQuoteStatus(status: QuoteStatus, validUntil: string | Date, now = new Date()) {
  if (status !== "sent") return status;
  const validity = new Date(validUntil);
  validity.setUTCHours(23, 59, 59, 999);
  return validity.getTime() < now.getTime() ? "expired" : status;
}

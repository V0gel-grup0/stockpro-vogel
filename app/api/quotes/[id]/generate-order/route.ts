import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import type { AppRole } from "@/lib/permissions";
import { QUOTE_ROLES, canGenerateOrder, isQuoteStatus } from "@/lib/quote-policy";
import { QuoteRequestError, UUID_PATTERN, quoteIdWhere } from "@/lib/quote-server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const errorResponse = (erro: string, status: number) => NextResponse.json({ sucesso: false, erro }, { status, headers: { "Cache-Control": "no-store" } });

function isMissingOrderItemsTable(error: unknown) {
  const candidate = error as { code?: string; meta?: { code?: string }; message?: string };
  return (
    (candidate?.code === "P2010" && candidate?.meta?.code === "42P01") ||
    String(candidate?.message || "").includes('relation "order_items" does not exist')
  );
}

function validateItems(items: Array<{ item_type: string; product_id: string | null; quantity: unknown }>) {
  if (!items.length) {
    throw new QuoteRequestError("O orçamento não possui itens para gerar o pedido.", 409);
  }

  for (const item of items) {
    if (!["product", "equipment", "custom"].includes(item.item_type)) {
      throw new QuoteRequestError("O orçamento possui um tipo de item incompatível com pedidos.", 409);
    }

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new QuoteRequestError("O orçamento possui quantidade inválida para gerar o pedido.", 409);
    }

    if (["product", "equipment"].includes(item.item_type) && !Number.isInteger(quantity)) {
      throw new QuoteRequestError("Produtos e equipamentos precisam ter quantidade inteira para gerar o pedido.", 409);
    }

    if (item.item_type === "product" && !item.product_id) {
      throw new QuoteRequestError("Existe produto sem vínculo com o cadastro de produtos.", 409);
    }
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const id = (await context.params).id.trim();
    if (!UUID_PATTERN.test(id)) return errorResponse("id deve ser um UUID válido.", 400);

    const quote = await prisma.quotes.findFirst({
      where: quoteIdWhere(profile, id, true),
      include: { quote_items: { orderBy: { created_at: "asc" } } },
    });
    if (!quote) return errorResponse("Orçamento não encontrado ou sem permissão.", 404);
    if (!isQuoteStatus(quote.status)) return errorResponse("Status do orçamento inválido.", 409);
    if (!canGenerateOrder(quote.status, quote.generated_order_id)) {
      return errorResponse(
        quote.generated_order_id
          ? "Este orçamento já gerou um pedido."
          : "Somente orçamento aprovado pode gerar pedido.",
        409
      );
    }

    validateItems(quote.quote_items);

    try {
      await prisma.$queryRaw`SELECT 1 FROM order_items LIMIT 1`;
    } catch (error) {
      if (isMissingOrderItemsTable(error)) {
        return errorResponse("A estrutura de pedidos com vários itens ainda não foi ativada neste ambiente.", 409);
      }
      throw error;
    }

    const firstItem = quote.quote_items[0];
    const singleItem = quote.quote_items.length === 1;
    const firstQuantity = Number(firstItem.quantity);
    const legacyItemType = singleItem
      ? firstItem.item_type === "product"
        ? "produto"
        : firstItem.item_type === "equipment"
          ? "equipamento"
          : "custom"
      : "multi";
    const legacyEquipmentName = singleItem
      ? firstItem.item_type === "product"
        ? ""
        : firstItem.item_name
      : `${quote.quote_items.length} itens`;
    const legacyQuantity = singleItem && Number.isInteger(firstQuantity) ? firstQuantity : 1;

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.orders.create({
        data: {
          created_by: quote.responsible_id || quote.created_by,
          client_id: quote.client_id,
          status: "pendente",
          item_type: legacyItemType,
          item_id: singleItem && firstItem.item_type === "product" ? firstItem.product_id : null,
          equipment_name: legacyEquipmentName,
          quantity: legacyQuantity,
          total_value: new Prisma.Decimal(quote.total_value).minus(quote.shipping_value),
          shipping_value: quote.shipping_value,
          notes: `Gerado pelo orçamento ORC-${String(quote.quote_number).padStart(6, "0")}. ${quote.notes}`.trim().slice(0, 5000),
          updated_at: new Date(),
        },
      });

      for (const item of quote.quote_items) {
        await tx.$executeRaw`
          INSERT INTO order_items (
            order_id,
            source_quote_item_id,
            item_type,
            product_id,
            item_name,
            description,
            quantity,
            unit_price,
            discount_value,
            total_value
          ) VALUES (
            ${created.id}::uuid,
            ${item.id}::uuid,
            ${item.item_type},
            ${item.product_id}::uuid,
            ${item.item_name},
            ${item.description},
            ${item.quantity},
            ${item.unit_price},
            ${item.discount_value},
            ${item.total_value}
          )
        `;
      }

      const linked = await tx.quotes.updateMany({
        where: { id, status: "approved", generated_order_id: null },
        data: { generated_order_id: created.id, updated_at: new Date() },
      });
      if (linked.count !== 1) throw new QuoteRequestError("O orçamento já foi convertido por outra operação.", 409);

      await tx.quote_events.create({
        data: {
          quote_id: id,
          created_by: profile.id,
          type: "order_generated",
          description: `Pedido gerado a partir do orçamento com ${quote.quote_items.length} item(ns).`,
          metadata: { order_id: created.id, order_number: String(created.order_number), item_count: quote.quote_items.length },
        },
      });
      return created;
    });

    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) }, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao gerar pedido pelo orçamento:", error);
    return errorResponse("Erro ao gerar pedido pelo orçamento.", 500);
  }
}

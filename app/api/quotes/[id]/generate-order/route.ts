import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import type { AppRole } from "@/lib/permissions";
import { QUOTE_ROLES, isQuoteStatus, validateOrderConversion } from "@/lib/quote-policy";
import { QuoteRequestError, UUID_PATTERN, quoteIdWhere } from "@/lib/quote-server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const errorResponse = (erro: string, status: number) => NextResponse.json({ sucesso: false, erro }, { status, headers: { "Cache-Control": "no-store" } });

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
    const conversion = validateOrderConversion(quote.status, quote.generated_order_id, quote.quote_items);
    if (!conversion.allowed) return errorResponse(conversion.reason, 409);
    const item = quote.quote_items[0];
    const quantity = conversion.quantity;
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.orders.create({
        data: {
          created_by: quote.responsible_id || quote.created_by,
          client_id: quote.client_id,
          status: "pendente",
          item_type: item.item_type === "product" ? "produto" : "equipamento",
          item_id: item.item_type === "product" ? item.product_id : null,
          equipment_name: item.item_type === "equipment" ? item.item_name : "",
          quantity,
          total_value: new Prisma.Decimal(quote.total_value).minus(quote.shipping_value),
          shipping_value: quote.shipping_value,
          notes: `Gerado pelo orçamento ORC-${String(quote.quote_number).padStart(6, "0")}. ${quote.notes}`.trim().slice(0, 5000),
          updated_at: new Date(),
        },
      });
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
          description: "Pedido gerado a partir do orçamento.",
          metadata: { order_id: created.id, order_number: String(created.order_number) },
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

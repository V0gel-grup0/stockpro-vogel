import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import type { AppRole } from "@/lib/permissions";
import { QUOTE_ROLES, canDeleteQuote, canEditQuoteStructure, isQuoteStatus } from "@/lib/quote-policy";
import { QUOTE_INCLUDE, QuoteRequestError, UUID_PATTERN, quoteIdWhere, validateQuoteInput } from "@/lib/quote-server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const errorResponse = (erro: string, status: number) => NextResponse.json({ sucesso: false, erro }, { status, headers: { "Cache-Control": "no-store" } });

async function idFrom(context: Context) {
  const id = (await context.params).id.trim();
  if (!UUID_PATTERN.test(id)) throw new QuoteRequestError("id deve ser um UUID válido.");
  return id;
}

export async function GET(_request: Request, context: Context) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const id = await idFrom(context);
    const quote = await prisma.quotes.findFirst({
      where: quoteIdWhere({ id: authorization.profile.id, role: authorization.profile.role }, id),
      include: QUOTE_INCLUDE,
    });
    if (!quote) return errorResponse("Orçamento não encontrado ou sem permissão.", 404);
    return NextResponse.json({ sucesso: true, quote: toJsonSafe(quote) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao abrir orçamento:", error);
    return errorResponse("Erro ao abrir orçamento.", 500);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const id = await idFrom(context);
    const existing = await prisma.quotes.findFirst({
      where: quoteIdWhere(profile, id, true),
      select: { id: true, status: true, generated_order_id: true },
    });
    if (!existing) return errorResponse("Orçamento não encontrado ou sem permissão para editar.", 404);
    if (!isQuoteStatus(existing.status) || !canEditQuoteStructure(existing.status)) {
      return errorResponse("Somente orçamentos em rascunho podem ter estrutura e valores editados.", 409);
    }
    const input = await validateQuoteInput(await request.json(), profile);
    const quote = await prisma.$transaction(async (tx) => {
      const updated = await tx.quotes.update({
        where: { id },
        data: { ...input.quote, updated_at: new Date() },
      });
      await tx.quote_items.deleteMany({ where: { quote_id: id } });
      await tx.quote_items.createMany({
        data: input.items.map((item) => ({ ...item, quote_id: id })),
      });
      await tx.quote_events.create({
        data: { quote_id: id, created_by: profile.id, type: "edited", description: "Orçamento editado." },
      });
      return tx.quotes.findUniqueOrThrow({ where: { id: updated.id }, include: QUOTE_INCLUDE });
    });
    return NextResponse.json({ sucesso: true, quote: toJsonSafe(quote) });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse("JSON inválido.", 400);
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao editar orçamento:", error);
    return errorResponse("Erro ao editar orçamento.", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const id = await idFrom(context);
    const existing = await prisma.quotes.findFirst({
      where: quoteIdWhere(profile, id, true),
      select: { id: true, status: true, generated_order_id: true },
    });
    if (!existing) return errorResponse("Orçamento não encontrado ou sem permissão para excluir.", 404);
    if (!isQuoteStatus(existing.status) || !canDeleteQuote(existing.status, existing.generated_order_id)) {
      return errorResponse("Somente rascunhos sem pedido gerado podem ser excluídos.", 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.quote_events.deleteMany({ where: { quote_id: id } });
      await tx.quote_items.deleteMany({ where: { quote_id: id } });
      await tx.quotes.delete({ where: { id } });
    });
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return errorResponse("O orçamento possui histórico vinculado e não pode ser excluído.", 409);
    }
    console.error("Erro ao excluir orçamento:", error);
    return errorResponse("Erro ao excluir orçamento.", 500);
  }
}

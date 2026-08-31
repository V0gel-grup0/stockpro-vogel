import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import type { AppRole } from "@/lib/permissions";
import { QUOTE_ROLES, buildQuoteStatusEvent, canTransitionQuoteStatus, isQuoteStatus } from "@/lib/quote-policy";
import { QUOTE_INCLUDE, QuoteRequestError, UUID_PATTERN, quoteIdWhere } from "@/lib/quote-server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const errorResponse = (erro: string, status: number) => NextResponse.json({ sucesso: false, erro }, { status, headers: { "Cache-Control": "no-store" } });

export async function PATCH(request: Request, context: Context) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const id = (await context.params).id.trim();
    if (!UUID_PATTERN.test(id)) return errorResponse("id deve ser um UUID válido.", 400);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "status")) {
      return errorResponse("Informe somente o novo status.", 400);
    }
    if (!isQuoteStatus(body.status) || body.status === "draft") return errorResponse("Novo status inválido.", 400);
    const existing = await prisma.quotes.findFirst({
      where: quoteIdWhere(profile, id, true),
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Orçamento não encontrado ou sem permissão.", 404);
    if (!isQuoteStatus(existing.status) || !canTransitionQuoteStatus(existing.status, body.status)) {
      return errorResponse(`Transição de ${existing.status} para ${body.status} não permitida.`, 409);
    }
    const now = new Date();
    const statusEvent = buildQuoteStatusEvent(existing.status, body.status);
    const timestampData = body.status === "sent" ? { sent_at: now } : body.status === "approved" ? { approved_at: now } : body.status === "rejected" ? { rejected_at: now } : {};
    const quote = await prisma.$transaction(async (tx) => {
      const changed = await tx.quotes.updateMany({
        where: { id, status: existing.status },
        data: { status: body.status, updated_at: now, ...timestampData },
      });
      if (changed.count !== 1) throw new QuoteRequestError("O orçamento foi alterado por outra operação. Atualize e tente novamente.", 409);
      await tx.quote_events.create({
        data: {
          quote_id: id,
          created_by: profile.id,
          ...statusEvent,
        },
      });
      return tx.quotes.findUniqueOrThrow({ where: { id }, include: QUOTE_INCLUDE });
    });
    return NextResponse.json({ sucesso: true, quote: toJsonSafe(quote) });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse("JSON inválido.", 400);
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao alterar status do orçamento:", error);
    return errorResponse("Erro ao alterar status do orçamento.", 500);
  }
}

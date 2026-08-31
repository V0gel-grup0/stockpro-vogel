import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import type { AppRole } from "@/lib/permissions";
import { QUOTE_ROLES, isQuoteStatus } from "@/lib/quote-policy";
import {
  QUOTE_INCLUDE,
  QuoteRequestError,
  UUID_PATTERN,
  buildQuoteVisibilityWhere,
  validateQuoteInput,
} from "@/lib/quote-server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseDateFilter(value: string | null, field: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new QuoteRequestError(`${field} deve usar YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new QuoteRequestError(`${field} deve ser uma data válida.`);
  return date;
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const params = new URL(request.url).searchParams;
    const conditions: Prisma.quotesWhereInput[] = [];
    const scope = buildQuoteVisibilityWhere(profile);
    if (scope) conditions.push(scope);

    const status = params.get("status");
    if (status) {
      if (!isQuoteStatus(status)) throw new QuoteRequestError("status inválido.");
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (status === "expired") {
        conditions.push({ OR: [{ status: "expired" }, { status: "sent", valid_until: { lt: today } }] });
      } else if (status === "sent") {
        conditions.push({ status: "sent", valid_until: { gte: today } });
      } else {
        conditions.push({ status });
      }
    }
    for (const field of ["client_id", "responsible_id"] as const) {
      const value = params.get(field);
      if (value) {
        if (!UUID_PATTERN.test(value)) throw new QuoteRequestError(`${field} deve ser um UUID válido.`);
        conditions.push({ [field]: value });
      }
    }
    const from = parseDateFilter(params.get("from"), "from");
    const to = parseDateFilter(params.get("to"), "to");
    if (from) conditions.push({ created_at: { gte: from } });
    if (to) {
      const end = new Date(to);
      end.setUTCDate(end.getUTCDate() + 1);
      conditions.push({ created_at: { lt: end } });
    }
    const search = (params.get("q") || "").trim().slice(0, 100);
    if (search) {
      const numberMatch = search.match(/(?:ORC-)?0*(\d+)$/i);
      conditions.push({
        OR: [
          ...(numberMatch ? [{ quote_number: Number(numberMatch[1]) }] : []),
          { clients: { is: { name: { contains: search, mode: "insensitive" } } } },
          { profiles_responsible: { is: { name: { contains: search, mode: "insensitive" } } } },
          { payment_terms: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const quotes = await prisma.quotes.findMany({
      where: conditions.length ? { AND: conditions } : undefined,
      orderBy: { created_at: "desc" },
      include: QUOTE_INCLUDE,
      take: 500,
    });
    return NextResponse.json({ sucesso: true, quotes: toJsonSafe(quotes) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao listar orçamentos:", error);
    return errorResponse("Erro ao listar orçamentos.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(QUOTE_ROLES);
    if ("response" in authorization) return authorization.response;
    const profile = { id: authorization.profile.id, role: authorization.profile.role as AppRole };
    const input = await validateQuoteInput(await request.json(), profile);
    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.quotes.create({
        data: {
          ...input.quote,
          created_by: profile.id,
          status: "draft",
          quote_items: { create: input.items },
        },
      });
      await tx.quote_events.create({
        data: {
          quote_id: created.id,
          created_by: profile.id,
          type: "created",
          description: "Orçamento criado.",
          new_status: "draft",
        },
      });
      return tx.quotes.findUniqueOrThrow({ where: { id: created.id }, include: QUOTE_INCLUDE });
    });
    return NextResponse.json({ sucesso: true, quote: toJsonSafe(quote) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse("JSON inválido.", 400);
    if (error instanceof QuoteRequestError) return errorResponse(error.message, error.status);
    console.error("Erro ao criar orçamento:", error);
    return errorResponse("Erro ao criar orçamento.", 500);
  }
}

import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/permissions";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INSTALLATION_FORECAST_UUID,
  accessibleOpportunityIds,
  accessibleOrderIds,
  canManageInstallationOpportunity,
  canManageInstallationOrder,
  ensureInstallationForecastTable,
  parseProbableInstallationDate,
} from "@/lib/installation-forecast-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(erro: string, status: number) {
  return NextResponse.json({ sucesso: false, erro }, { status });
}

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return fail("Não autenticado.", 401);

    await ensureInstallationForecastTable();

    const appProfile = { id: profile.id, role: profile.role as AppRole };
    const [opportunityIds, orderIds] = await Promise.all([
      accessibleOpportunityIds(appProfile),
      accessibleOrderIds(appProfile),
    ]);

    if (!opportunityIds.length && !orderIds.length) {
      return NextResponse.json({ sucesso: true, forecasts: [] });
    }

    const opportunityWhere = opportunityIds.length
      ? `opportunity_id IN (${opportunityIds.map((id) => `'${id}'::uuid`).join(",")})`
      : "FALSE";
    const orderWhere = orderIds.length
      ? `order_id IN (${orderIds.map((id) => `'${id}'::uuid`).join(",")})`
      : "FALSE";

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT id, opportunity_id, order_id, probable_date, created_by, updated_by, created_at, updated_at
        FROM installation_forecasts
       WHERE ${opportunityWhere} OR ${orderWhere}
       ORDER BY probable_date ASC, updated_at DESC
    `);

    return NextResponse.json({ sucesso: true, forecasts: rows });
  } catch (error) {
    console.error("Erro ao carregar previsão de instalação:", error);
    return fail("Erro ao carregar previsão de instalação.", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) return fail("Não autenticado.", 401);

    const body = await request.json();
    const opportunityId = typeof body?.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const probableDate = parseProbableInstallationDate(body?.probable_date);

    if (!opportunityId && !orderId) {
      return fail("Informe opportunity_id ou order_id.", 400);
    }
    if (opportunityId && !INSTALLATION_FORECAST_UUID.test(opportunityId)) {
      return fail("opportunity_id inválido.", 400);
    }
    if (orderId && !INSTALLATION_FORECAST_UUID.test(orderId)) {
      return fail("order_id inválido.", 400);
    }
    if (probableDate === undefined) {
      return fail("A data provável deve estar no formato AAAA-MM-DD.", 400);
    }

    const appProfile = { id: profile.id, role: profile.role as AppRole };
    if (
      opportunityId &&
      !(await canManageInstallationOpportunity(appProfile, opportunityId))
    ) {
      return fail("Oportunidade não encontrada ou sem permissão.", 404);
    }
    if (orderId && !(await canManageInstallationOrder(appProfile, orderId))) {
      return fail("Pedido não encontrado ou sem permissão.", 404);
    }

    await ensureInstallationForecastTable();

    if (probableDate === null) {
      if (opportunityId) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM installation_forecasts WHERE opportunity_id = '${opportunityId}'::uuid`
        );
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM installation_forecasts WHERE order_id = '${orderId}'::uuid`
        );
      }
      return NextResponse.json({ sucesso: true, forecast: null });
    }

    if (opportunityId) {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        INSERT INTO installation_forecasts (
          opportunity_id, order_id, probable_date, created_by, updated_by
        ) VALUES (
          '${opportunityId}'::uuid,
          ${orderId ? `'${orderId}'::uuid` : "NULL"},
          '${probableDate}'::date,
          '${profile.id}'::uuid,
          '${profile.id}'::uuid
        )
        ON CONFLICT (opportunity_id)
        DO UPDATE SET
          probable_date = EXCLUDED.probable_date,
          order_id = COALESCE(EXCLUDED.order_id, installation_forecasts.order_id),
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        RETURNING *
      `);
      return NextResponse.json({ sucesso: true, forecast: rows[0] || null });
    }

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      INSERT INTO installation_forecasts (
        order_id, probable_date, created_by, updated_by
      ) VALUES (
        '${orderId}'::uuid,
        '${probableDate}'::date,
        '${profile.id}'::uuid,
        '${profile.id}'::uuid
      )
      ON CONFLICT (order_id)
      DO UPDATE SET
        probable_date = EXCLUDED.probable_date,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING *
    `);

    return NextResponse.json({ sucesso: true, forecast: rows[0] || null });
  } catch (error) {
    console.error("Erro ao salvar previsão de instalação:", error);
    return fail("Erro ao salvar previsão de instalação.", 500);
  }
}

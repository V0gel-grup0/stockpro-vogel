import { Prisma } from "@/generated/prisma/client";
import { buildOpportunityManagementWhere, buildOpportunityVisibilityWhere } from "@/lib/client-visibility";
import { ORDER_ROLES, type AppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const INSTALLATION_FORECAST_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InstallationForecastRow = {
  id: string;
  opportunity_id: string | null;
  order_id: string | null;
  probable_date: Date | string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function ensureInstallationForecastTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS installation_forecasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id UUID UNIQUE REFERENCES crm_opportunities(id) ON DELETE CASCADE,
      order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      probable_date DATE NOT NULL,
      created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT installation_forecasts_has_reference CHECK (
        opportunity_id IS NOT NULL OR order_id IS NOT NULL
      )
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS installation_forecasts_probable_date_idx
      ON installation_forecasts(probable_date)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE installation_forecasts AS forecast
       SET order_id = quote.generated_order_id,
           updated_at = now()
      FROM quotes AS quote
     WHERE quote.opportunity_id = forecast.opportunity_id
       AND quote.generated_order_id IS NOT NULL
       AND forecast.order_id IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM installation_forecasts AS existing
          WHERE existing.order_id = quote.generated_order_id
            AND existing.id <> forecast.id
       )
  `);
}

export function buildInstallationOrderScope(profile: { id: string; role: AppRole }): Prisma.ordersWhereInput | null {
  if (!ORDER_ROLES.includes(profile.role as (typeof ORDER_ROLES)[number])) return null;

  if (profile.role === "representante") {
    return { created_by: profile.id };
  }

  if (profile.role === "vendedor") {
    return {
      OR: [
        { created_by: profile.id },
        {
          profiles: {
            is: { responsible_seller_id: profile.id },
          },
        },
      ],
    };
  }

  return {};
}

export async function accessibleOpportunityIds(profile: { id: string; role: AppRole }) {
  const where = buildOpportunityVisibilityWhere(profile);
  const rows = await prisma.crm_opportunities.findMany({
    where,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function accessibleOrderIds(profile: { id: string; role: AppRole }) {
  const where = buildInstallationOrderScope(profile);
  if (where === null) return [];

  const rows = await prisma.orders.findMany({
    where,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function canManageInstallationOpportunity(
  profile: { id: string; role: AppRole },
  opportunityId: string
) {
  const visibility = buildOpportunityManagementWhere(profile);
  const row = await prisma.crm_opportunities.findFirst({
    where: visibility
      ? { AND: [{ id: opportunityId }, visibility] }
      : { id: opportunityId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function canManageInstallationOrder(
  profile: { id: string; role: AppRole },
  orderId: string
) {
  const scope = buildInstallationOrderScope(profile);
  if (scope === null) return false;

  const row = await prisma.orders.findFirst({
    where: { id: orderId, ...scope },
    select: { id: true },
  });
  return Boolean(row);
}

export function parseProbableInstallationDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;

  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const [year, month, day] = normalized.split("-").map(Number);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return normalized;
}

export async function linkOpportunityForecastToOrder(
  opportunityId: string | null | undefined,
  orderId: string
) {
  if (!opportunityId) return;

  await ensureInstallationForecastTable();
  await prisma.$executeRaw`
    UPDATE installation_forecasts
       SET order_id = ${orderId}::uuid,
           updated_at = now()
     WHERE opportunity_id = ${opportunityId}::uuid
       AND (order_id IS NULL OR order_id = ${orderId}::uuid)
  `;
}

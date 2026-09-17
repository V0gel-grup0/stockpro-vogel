import { buildOpportunityManagementWhere, buildOpportunityVisibilityWhere } from "@/lib/client-visibility";
import type { AppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const CRM_IMPORTANCE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CRM_IMPORTANCE_VALUES = ["low", "medium", "high", "urgent"] as const;
export type CrmImportanceValue = (typeof CRM_IMPORTANCE_VALUES)[number];

export type CrmImportanceRow = {
  id: string;
  opportunity_id: string | null;
  task_id: string | null;
  importance: CrmImportanceValue;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function ensureCrmImportanceTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_importance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id UUID UNIQUE REFERENCES crm_opportunities(id) ON DELETE CASCADE,
      task_id UUID UNIQUE REFERENCES crm_tasks(id) ON DELETE CASCADE,
      importance TEXT NOT NULL DEFAULT 'medium',
      updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_importance_valid_value CHECK (
        importance IN ('low', 'medium', 'high', 'urgent')
      ),
      CONSTRAINT crm_importance_single_reference CHECK (
        (opportunity_id IS NOT NULL AND task_id IS NULL)
        OR
        (opportunity_id IS NULL AND task_id IS NOT NULL)
      )
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS crm_importance_importance_idx
      ON crm_importance(importance)
  `);
}

export function parseCrmImportance(value: unknown): CrmImportanceValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CRM_IMPORTANCE_VALUES.includes(normalized as CrmImportanceValue)
    ? (normalized as CrmImportanceValue)
    : null;
}

export async function accessibleImportanceOpportunityIds(profile: {
  id: string;
  role: AppRole;
}) {
  const where = buildOpportunityVisibilityWhere(profile);
  const rows = await prisma.crm_opportunities.findMany({
    where,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function accessibleImportanceTaskIds(profile: {
  id: string;
  role: AppRole;
}) {
  const rows = await prisma.crm_tasks.findMany({
    where:
      profile.role === "administrador"
        ? { opportunity_id: null }
        : {
            opportunity_id: null,
            OR: [
              { created_by: profile.id },
              { assigned_to: profile.id },
            ],
          },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function canManageImportanceOpportunity(
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

export async function canManageImportanceTask(
  profile: { id: string; role: AppRole },
  taskId: string
) {
  const row = await prisma.crm_tasks.findFirst({
    where:
      profile.role === "administrador"
        ? { id: taskId, opportunity_id: null }
        : {
            id: taskId,
            opportunity_id: null,
            OR: [
              { created_by: profile.id },
              { assigned_to: profile.id },
            ],
          },
    select: { id: true },
  });
  return Boolean(row);
}

import { prisma } from "@/lib/prisma";

let structure: Promise<void> | undefined;
export function ensureGeneralCrmTable() {
  if (!structure) structure = prepare().catch((error) => { structure = undefined; throw error; });
  return structure;
}

async function prepare() {
  // Dedicated storage: no migration or reclassification of existing CRM records.
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS crm_general_demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting','completed','cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS crm_general_demands_assignee_idx ON crm_general_demands(assigned_to, status, due_at)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS crm_general_demands_creator_idx ON crm_general_demands(created_by)`;
}

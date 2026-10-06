import { prisma } from "@/lib/prisma";

let structure: Promise<void> | undefined;
export function ensureAssemblyWorkTable() {
  if (!structure) structure = prepare().catch((error) => { structure = undefined; throw error; });
  return structure;
}

async function prepare() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_assembly_work (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      equipment_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      technician_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
      stage TEXT NOT NULL DEFAULT 'todo',
      due_date DATE,
      notes TEXT NOT NULL DEFAULT '',
      created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_assembly_work_stage_check CHECK (stage IN ('todo','assembling','waiting_parts','done'))
    )`);
  // Existing manual assignments remain intact; only new automatic work may be unassigned.
  await prisma.$executeRawUnsafe(`ALTER TABLE crm_assembly_work ALTER COLUMN technician_id DROP NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE crm_assembly_work ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES orders(id) ON DELETE CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER TABLE crm_assembly_work ADD COLUMN IF NOT EXISTS source_item_key TEXT NOT NULL DEFAULT 'order'`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS crm_assembly_work_order_item_idx ON crm_assembly_work(source_order_id, source_item_key)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS crm_assembly_work_technician_idx ON crm_assembly_work(technician_id, stage, due_date)`);
}

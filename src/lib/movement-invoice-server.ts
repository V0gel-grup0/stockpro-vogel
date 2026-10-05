import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type MovementInvoice = { fileName: string; mime: string; size: number; bytes: Buffer };
let structure: Promise<void> | undefined;
export function ensureMovementInvoices() {
  if (!structure) structure = (async () => {
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS movement_invoice_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL, file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 3000000),
      file_data BYTEA NOT NULL, uploaded_by UUID NOT NULL REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS movement_invoice_links (
      movement_id UUID PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES movement_invoice_files(id) ON DELETE CASCADE
    )`;
  })().catch((error) => { structure = undefined; throw error; });
  return structure;
}

export async function saveMovementInvoice(tx: Prisma.TransactionClient, invoice: MovementInvoice | null, profileId: string, movements: { id: string }[]) {
  if (!invoice) return;
  if (!movements.length) throw new Error("O pedido não gerou saída de equipamentos ou produtos para vincular a NF.");
  const [file] = await tx.$queryRaw<{ id: string }[]>`INSERT INTO movement_invoice_files (file_name, mime_type, file_size, file_data, uploaded_by)
    VALUES (${invoice.fileName}, ${invoice.mime}, ${invoice.size}, ${invoice.bytes}, ${profileId}::uuid) RETURNING id`;
  for (const movement of movements) {
    await tx.$executeRaw`INSERT INTO movement_invoice_links (movement_id, invoice_id) VALUES (${movement.id}::uuid, ${file.id}::uuid)`;
  }
}

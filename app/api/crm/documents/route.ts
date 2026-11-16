import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import { buildOpportunityManagementWhere } from "@/lib/client-visibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["administrador", "gerente", "vendedor", "funcionario", "representante"] as const;

async function ensureTable() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS crm_opportunity_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
    document_type text NOT NULL CHECK (document_type IN ('orcamento','contrato')),
    filename text NOT NULL,
    mime_type text NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
async function permitted(opportunityId: string, actor: { id: string; role: string }) {
  const where = buildOpportunityManagementWhere(actor as Parameters<typeof buildOpportunityManagementWhere>[0]);
  return prisma.crm_opportunities.findFirst({
    where: where ? { AND: [{ id: opportunityId }, where] } : { id: opportunityId },
    select: { id: true },
  });
}
const error = (erro: string, status: number) => NextResponse.json({ sucesso: false, erro }, { status });

export async function GET(request: Request) {
  try {
    const auth = await authorizeApi([...ROLES]); if ("response" in auth) return auth.response;
    const url = new URL(request.url);
    const opportunityId = url.searchParams.get("opportunity_id") || "";
    const documentId = url.searchParams.get("id") || "";
    if (!UUID.test(opportunityId)) return error("Oportunidade inválida.", 400);
    if (!(await permitted(opportunityId, auth.profile))) return error("Oportunidade não encontrada ou sem permissão.", 404);
    await ensureTable();
    if (documentId) {
      if (!UUID.test(documentId)) return error("Documento inválido.", 400);
      const files = await prisma.$queryRaw<Array<{ filename: string; mime_type: string; data: Uint8Array }>>(Prisma.sql`SELECT filename, mime_type, data FROM crm_opportunity_documents WHERE id = ${documentId}::uuid AND opportunity_id = ${opportunityId}::uuid`);
      if (!files.length) return error("Documento não encontrado.", 404);
      const file = files[0];
      return new Response(Buffer.from(file.data), { headers: {
        "Content-Type": file.mime_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    const rows = await prisma.$queryRaw<Array<{ id: string; document_type: string; filename: string; created_at: Date }>>(Prisma.sql`SELECT id, document_type, filename, created_at FROM crm_opportunity_documents WHERE opportunity_id = ${opportunityId}::uuid ORDER BY created_at DESC`);
    return NextResponse.json({ sucesso: true, documents: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { console.error(e); return error("Não foi possível carregar documentos.", 500); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeApi([...ROLES]); if ("response" in auth) return auth.response;
    const form = await request.formData();
    const opportunityId = String(form.get("opportunity_id") || "");
    const type = String(form.get("document_type") || "");
    const file = form.get("document");
    if (!UUID.test(opportunityId) || !["orcamento", "contrato"].includes(type)) return error("Selecione oportunidade e tipo de documento válidos.", 400);
    if (!(await permitted(opportunityId, auth.profile))) return error("Oportunidade não encontrada ou sem permissão.", 404);
    if (!(file instanceof File) || file.size < 1 || file.size > 5_000_000) return error("Anexe um arquivo de até 5 MB.", 400);
    const name = file.name.replace(/[\\/\r\n]/g, "_").slice(0, 180);
    const ext = name.split(".").pop()?.toLowerCase();
    const allowed = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>;
    if (!ext || !allowed[ext]) return error("Somente arquivos PDF ou DOCX são aceitos.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (ext === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") return error("Arquivo PDF inválido.", 400);
    if (ext === "docx" && bytes.subarray(0, 2).toString() !== "PK") return error("Arquivo DOCX inválido.", 400);
    await ensureTable();
    await prisma.$executeRaw(Prisma.sql`INSERT INTO crm_opportunity_documents (opportunity_id, created_by, document_type, filename, mime_type, data)
    VALUES (${opportunityId}::uuid, ${auth.profile.id}::uuid, ${type}, ${name}, ${allowed[ext]}, ${bytes})`);
    return NextResponse.json({ sucesso: true }, { status: 201 });
  } catch (e) { console.error(e); return error("Não foi possível anexar documento.", 500); }
}

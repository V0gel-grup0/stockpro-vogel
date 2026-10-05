import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureMovementInvoices } from "@/lib/movement-invoice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeApi(["administrador", "gerente", "funcionario"]);
    if ("response" in authorization) return authorization.response;
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ sucesso: false, erro: "Movimentação inválida." }, { status: 400 });
    await ensureMovementInvoices();
    const [file] = await prisma.$queryRaw<{ file_name: string; mime_type: string; file_data: Uint8Array }[]>`
      SELECT f.file_name, f.mime_type, f.file_data FROM movement_invoice_files f
      JOIN movement_invoice_links l ON l.invoice_id = f.id
      JOIN movements m ON m.id = l.movement_id WHERE m.id = ${id}::uuid AND m.type = 'saida'`;
    if (!file) return NextResponse.json({ sucesso: false, erro: "Esta saída não tem NF anexada." }, { status: 404 });
    return new NextResponse(Buffer.from(file.file_data), { headers: {
      "Content-Type": file.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao baixar NF." }, { status: 500 });
  }
}

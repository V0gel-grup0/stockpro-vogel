import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  REPRESENTATIVE_MANAGEMENT_ROLES,
  canManageRepresentativeFinancials,
  isUuid,
} from "@/lib/representative-management-policy";
import {
  accessibleRepresentative,
  representativeStructureMissing,
} from "@/lib/representative-management-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4_000_000;
type RouteContext = { params: Promise<{ id: string; invoiceId: string }> };

function attachmentError(error: unknown) {
  return NextResponse.json(
    {
      sucesso: false,
      erro: representativeStructureMissing(error)
        ? "A estrutura de Gestão do Representante ainda não foi instalada neste ambiente."
        : error instanceof Error ? error.message : "Erro ao processar anexo fiscal.",
    },
    { status: representativeStructureMissing(error) ? 503 : 500 }
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;
    const { id, invoiceId } = await context.params;
    if (!isUuid(id) || !isUuid(invoiceId)) {
      return NextResponse.json({ sucesso: false, erro: "Nota fiscal inválida." }, { status: 400 });
    }
    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    if (!(await accessibleRepresentative(actor, id))) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }
    const kind = new URL(request.url).searchParams.get("kind") === "xml" ? "xml" : "pdf";
    const invoice = await prisma.representative_invoices.findFirst({
      where: { id: invoiceId, representative_id: id },
      select: { pdf_file_name: true, pdf_file_data: true, xml_file_name: true, xml_file_data: true },
    });
    const fileName = kind === "xml" ? invoice?.xml_file_name : invoice?.pdf_file_name;
    const fileData = kind === "xml" ? invoice?.xml_file_data : invoice?.pdf_file_data;
    if (!fileName || !fileData) {
      return NextResponse.json({ sucesso: false, erro: `NF sem ${kind.toUpperCase()} anexado.` }, { status: 404 });
    }
    return new NextResponse(Buffer.from(fileData), {
      headers: {
        "Content-Type": kind === "xml" ? "application/xml" : "application/pdf",
        "Content-Disposition": `${kind === "xml" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return attachmentError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;
    if (!canManageRepresentativeFinancials(authorization.profile.role)) {
      return NextResponse.json({ sucesso: false, erro: "Seu perfil não pode alterar notas fiscais." }, { status: 403 });
    }
    const { id, invoiceId } = await context.params;
    if (!isUuid(id) || !isUuid(invoiceId)) {
      return NextResponse.json({ sucesso: false, erro: "Nota fiscal inválida." }, { status: 400 });
    }
    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    if (!(await accessibleRepresentative(actor, id))) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind") === "xml" ? "xml" : "pdf";
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ sucesso: false, erro: "Selecione um anexo de até 4 MB." }, { status: 400 });
    }
    const lowerName = file.name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    const validPdf =
      kind === "pdf" &&
      lowerName.endsWith(".pdf") &&
      (file.type === "" || file.type === "application/pdf") &&
      bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    const validXml =
      kind === "xml" &&
      lowerName.endsWith(".xml") &&
      (file.type === "" || ["application/xml", "text/xml"].includes(file.type)) &&
      bytes.toString("utf8", 0, Math.min(bytes.length, 200)).trimStart().startsWith("<");
    if (!validPdf && !validXml) {
      return NextResponse.json({ sucesso: false, erro: `O arquivo enviado não é um ${kind.toUpperCase()} válido.` }, { status: 400 });
    }
    const data = kind === "xml"
      ? { xml_file_name: file.name.slice(0, 240), xml_file_data: bytes, xml_file_size: file.size, uploaded_by: actor.id, updated_at: new Date() }
      : { pdf_file_name: file.name.slice(0, 240), pdf_file_data: bytes, pdf_file_size: file.size, uploaded_by: actor.id, updated_at: new Date() };
    const updated = await prisma.representative_invoices.updateMany({
      where: { id: invoiceId, representative_id: id },
      data,
    });
    if (!updated.count) {
      return NextResponse.json({ sucesso: false, erro: "Nota fiscal não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ sucesso: true, kind, file_name: file.name.slice(0, 240), file_size: file.size });
  } catch (error) {
    return attachmentError(error);
  }
}

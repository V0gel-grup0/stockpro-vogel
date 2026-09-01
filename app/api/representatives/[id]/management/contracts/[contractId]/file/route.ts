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
type RouteContext = { params: Promise<{ id: string; contractId: string }> };

function pdfSignature(bytes: Buffer) {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      sucesso: false,
      erro: representativeStructureMissing(error)
        ? "A estrutura de Gestão do Representante ainda não foi instalada neste ambiente."
        : error instanceof Error ? error.message : "Erro ao processar contrato.",
    },
    { status: representativeStructureMissing(error) ? 503 : 500 }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;
    const { id, contractId } = await context.params;
    if (!isUuid(id) || !isUuid(contractId)) {
      return NextResponse.json({ sucesso: false, erro: "Contrato inválido." }, { status: 400 });
    }
    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    if (!(await accessibleRepresentative(actor, id))) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }
    const contract = await prisma.representative_contracts.findFirst({
      where: { id: contractId, representative_id: id },
      select: { file_name: true, file_data: true },
    });
    if (!contract?.file_data || !contract.file_name) {
      return NextResponse.json({ sucesso: false, erro: "Contrato sem PDF anexado." }, { status: 404 });
    }
    return new NextResponse(Buffer.from(contract.file_data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(contract.file_name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;
    if (!canManageRepresentativeFinancials(authorization.profile.role)) {
      return NextResponse.json({ sucesso: false, erro: "Seu perfil não pode alterar contratos." }, { status: 403 });
    }
    const { id, contractId } = await context.params;
    if (!isUuid(id) || !isUuid(contractId)) {
      return NextResponse.json({ sucesso: false, erro: "Contrato inválido." }, { status: 400 });
    }
    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    if (!(await accessibleRepresentative(actor, id))) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ sucesso: false, erro: "Selecione o PDF do contrato." }, { status: 400 });
    }
    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      (file.type !== "" && file.type !== "application/pdf") ||
      file.size <= 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      return NextResponse.json({ sucesso: false, erro: "O contrato deve ser um PDF de até 4 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!pdfSignature(bytes)) {
      return NextResponse.json({ sucesso: false, erro: "O arquivo enviado não é um PDF válido." }, { status: 400 });
    }
    const updated = await prisma.representative_contracts.updateMany({
      where: { id: contractId, representative_id: id },
      data: {
        file_name: file.name.slice(0, 240),
        file_data: bytes,
        file_size: file.size,
        mime_type: "application/pdf",
        uploaded_by: actor.id,
        updated_at: new Date(),
      },
    });
    if (!updated.count) {
      return NextResponse.json({ sucesso: false, erro: "Contrato não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ sucesso: true, file_name: file.name.slice(0, 240), file_size: file.size });
  } catch (error) {
    return errorResponse(error);
  }
}

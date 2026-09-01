import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import { ORDER_ROLES, type AppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4_000_000;

function orderScope(profile: { id: string; role: AppRole }): Prisma.ordersWhereInput {
  if (profile.role === "representante") return { created_by: profile.id };

  if (profile.role === "vendedor") {
    return {
      OR: [
        { created_by: profile.id },
        { profiles: { is: { responsible_seller_id: profile.id } } },
      ],
    };
  }

  return {};
}

async function accessibleOrder(id: string, profile: { id: string; role: AppRole }) {
  return prisma.orders.findFirst({
    where: { id, ...orderScope(profile) },
    select: { id: true },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await authorizeApi(ORDER_ROLES);
    if ("response" in authorization) return authorization.response;

    const { id } = await context.params;
    const profile = {
      id: authorization.profile.id,
      role: authorization.profile.role as AppRole,
    };

    if (!(await accessibleOrder(id, profile))) {
      return NextResponse.json({ sucesso: false, erro: "Pedido não encontrado ou sem permissão." }, { status: 404 });
    }

    const rows = await prisma.$queryRaw<Array<{
      file_name: string;
      mime_type: string;
      file_data: Uint8Array;
    }>>(Prisma.sql`
      SELECT file_name, mime_type, file_data
      FROM order_nf_attachments
      WHERE order_id = ${id}::uuid
      LIMIT 1
    `);

    const attachment = rows[0];
    if (!attachment) {
      return NextResponse.json({ sucesso: false, erro: "Nenhuma NF anexada a este pedido." }, { status: 404 });
    }

    return new NextResponse(Buffer.from(attachment.file_data), {
      status: 200,
      headers: {
        "Content-Type": attachment.mime_type || "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao abrir NF." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await authorizeApi(ORDER_ROLES);
    if ("response" in authorization) return authorization.response;

    const { id } = await context.params;
    const profile = {
      id: authorization.profile.id,
      role: authorization.profile.role as AppRole,
    };

    if (!(await accessibleOrder(id, profile))) {
      return NextResponse.json({ sucesso: false, erro: "Pedido não encontrado ou sem permissão." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ sucesso: false, erro: "Selecione o PDF da NF." }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ sucesso: false, erro: "O anexo deve ser um arquivo PDF." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ sucesso: false, erro: "O PDF deve ter no máximo 4 MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.slice(0, 240);
    const mimeType = file.type || "application/pdf";

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO order_nf_attachments (
        order_id, file_name, mime_type, file_data, file_size, uploaded_by, created_at, updated_at
      ) VALUES (
        ${id}::uuid,
        ${fileName},
        ${mimeType},
        ${bytes},
        ${file.size},
        ${authorization.profile.id}::uuid,
        now(),
        now()
      )
      ON CONFLICT (order_id)
      DO UPDATE SET
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        file_data = EXCLUDED.file_data,
        file_size = EXCLUDED.file_size,
        uploaded_by = EXCLUDED.uploaded_by,
        updated_at = now()
    `);

    return NextResponse.json({
      sucesso: true,
      attachment: {
        file_name: fileName,
        file_size: file.size,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao anexar NF." },
      { status: 500 }
    );
  }
}

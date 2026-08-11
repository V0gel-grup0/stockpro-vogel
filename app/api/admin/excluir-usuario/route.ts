import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório." },
        { status: 400 }
      );
    }

    const profile = await prisma.profiles.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Remove apenas o vínculo que aponta para o usuário excluído, sem
      // apagar outros responsáveis válidos do mesmo perfil.
      await tx.profiles.updateMany({
        where: { responsible_seller_id: id },
        data: { responsible_seller_id: null },
      });
      await tx.profiles.updateMany({
        where: { responsible_manager_id: id },
        data: { responsible_manager_id: null },
      });
      await tx.profiles.updateMany({
        where: { created_by: id },
        data: { created_by: null },
      });

      // Preserva o histórico operacional e apenas remove a FK do usuário.
      await tx.assemblies.updateMany({
        where: { created_by: id },
        data: { created_by: null },
      });
      await tx.assemblies.updateMany({
        where: { technician_id: id },
        data: { technician_id: null },
      });
      await tx.clients.updateMany({
        where: { created_by: id },
        data: { created_by: null },
      });
      await tx.movements.updateMany({
        where: { created_by: id },
        data: { created_by: null },
      });
      await tx.orders.updateMany({
        where: { created_by: id },
        data: { created_by: null },
      });

      await tx.profiles.delete({ where: { id } });
    });

    return NextResponse.json({
      ok: true,
      message: "Usuário excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir o usuário.",
      },
      { status: 500 }
    );
  }
}

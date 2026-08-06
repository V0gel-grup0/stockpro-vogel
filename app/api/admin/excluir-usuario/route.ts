import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        {
          error: "ID do usuário é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    const profile = await prisma.profiles.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        {
          error: "Usuário não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.profiles.updateMany({
        where: {
          OR: [
            {
              responsible_seller_id: id,
            },
            {
              responsible_manager_id: id,
            },
            {
              created_by: id,
            },
          ],
        },
        data: {
          responsible_seller_id: null,
          responsible_manager_id: null,
          created_by: null,
        },
      });

      await transaction.profiles.delete({
        where: {
          id,
        },
      });
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
          "Não foi possível excluir o usuário. Verifique se existem pedidos ou outros registros vinculados a ele.",
      },
      {
        status: 500,
      }
    );
  }
}

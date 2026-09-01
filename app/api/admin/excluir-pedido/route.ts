import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador"]);
    if ("response" in authorization) return authorization.response;

    const { order_id } = await request.json();
    if (!order_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    const id = String(order_id);
    await prisma.$transaction(async (tx) => {
      await tx.movements.updateMany({ where: { order_id: id }, data: { order_id: null } });
      await tx.conta_azul_logs.deleteMany({ where: { order_id: id } });
      await tx.orders.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true, message: "Pedido excluído com sucesso.", deleted: [order_id] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado ao excluir pedido." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { order_id } = await request.json();
    if (!order_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    const order = await prisma.orders.findUnique({ where: { id: String(order_id) } });
    if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    const configured = Boolean(process.env.CONTA_AZUL_CLIENT_ID && process.env.CONTA_AZUL_CLIENT_SECRET && process.env.CONTA_AZUL_REFRESH_TOKEN);
    if (!configured) {
      await prisma.orders.update({ where: { id: order.id }, data: { conta_azul_status: "pendente_configuracao", updated_at: new Date() } });
      return NextResponse.json({ ok: false, error: "Conta Azul ainda não configurado. Configure CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REFRESH_TOKEN na Vercel." }, { status: 400 });
    }

    await prisma.orders.update({ where: { id: order.id }, data: { conta_azul_status: "solicitada", updated_at: new Date() } });
    return NextResponse.json({ ok: true, message: "Solicitação de NF enviada para rotina Conta Azul." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao emitir NF." }, { status: 500 });
  }
}

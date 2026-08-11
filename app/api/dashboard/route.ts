import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [products, clients, orders, pending] = await Promise.all([
      prisma.products.findMany({ select: { quantity: true, min_stock: true } }),
      prisma.clients.count(), prisma.orders.count(), prisma.profiles.count({ where: { status: "pending" } }),
    ]);
    const low = products.filter((p) => Number(p.quantity) <= Number(p.min_stock)).length;
    const pendingNf = await prisma.orders.count({
      where: { conta_azul_status: { in: ["", "pendente", "erro", "pendente_configuracao"] } },
    });
    return NextResponse.json({ sucesso: true, counts: { products: products.length, clients, orders, pending, low, pendingNf } });
  } catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar dashboard." }, { status: 500 }); }
}

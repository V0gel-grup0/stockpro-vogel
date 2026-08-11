import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function dataFrom(body: Record<string, any>, includeState = false) {
  const itemType = text(body.item_type) || "produto";
  const data: Record<string, any> = {
    created_by: text(body.created_by) || null,
    client_id: text(body.client_id) || null,
    item_type: itemType,
    item_id: itemType === "produto" ? text(body.item_id) || null : null,
    equipment_name: itemType === "equipamento" ? text(body.equipment_name) : "",
    quantity: Math.max(1, Math.trunc(number(body.quantity, 1))),
    total_value: number(body.total_value),
    shipping_value: number(body.shipping_value),
    notes: text(body.notes),
    updated_at: new Date(),
  };
  if (includeState) {
    data.status = text(body.status) || "pendente";
  }
  return data;
}

export async function GET() {
  try {
    const orders = await prisma.orders.findMany({ orderBy: { created_at: "desc" } });
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(orders) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar pedidos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawOrders = Array.isArray(body?.orders) ? body.orders : [body];
    if (!rawOrders.length) return NextResponse.json({ sucesso: false, erro: "Nenhum pedido informado." }, { status: 400 });
    const created = await prisma.$transaction(rawOrders.map((raw: Record<string, any>) => prisma.orders.create({ data: dataFrom(raw, true) })));
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao criar pedido." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = text(body.id);
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    const order = await prisma.orders.update({ where: { id }, data: dataFrom(body) });
    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = text(body.id);
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    const data: Record<string, any> = { updated_at: new Date() };
    if (body.status !== undefined) data.status = text(body.status);
    if (body.conta_azul_status !== undefined) data.conta_azul_status = text(body.conta_azul_status);
    const order = await prisma.orders.update({ where: { id }, data });
    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.movements.updateMany({ where: { order_id: id }, data: { order_id: null } });
      await tx.conta_azul_logs.deleteMany({ where: { order_id: id } });
      await tx.orders.delete({ where: { id } });
    });
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao excluir pedido." }, { status: 500 });
  }
}

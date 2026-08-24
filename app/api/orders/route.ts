import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { AppRole } from "@/lib/api-auth";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

const orderRoles = [
  "administrador",
  "gerente",
  "vendedor",
  "funcionario",
  "representante",
] as const;

function orderScope(profile: { id: string; role: AppRole }): Prisma.ordersWhereInput {
  if (profile.role === "representante") {
    return { created_by: profile.id };
  }

  if (profile.role === "vendedor") {
    return {
      OR: [
        { created_by: profile.id },
        {
          profiles: {
            is: { responsible_seller_id: profile.id },
          },
        },
      ],
    };
  }

  return {};
}

function dataFrom(
  body: Record<string, any>,
  includeState = false,
  createdBy?: string
) {
  const itemType = text(body.item_type) || "produto";
  const data: Record<string, any> = {
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
  if (createdBy) data.created_by = createdBy;
  if (includeState) {
    data.status = "pendente";
  }
  return data;
}

export async function GET() {
  try {
    const authorization = await authorizeApi(orderRoles);
    if ("response" in authorization) return authorization.response;

    const orders = await prisma.orders.findMany({
      where: orderScope({
        id: authorization.profile.id,
        role: authorization.profile.role as AppRole,
      }),
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(orders) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar pedidos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(orderRoles);
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const rawOrders = Array.isArray(body?.orders) ? body.orders : [body];
    if (!rawOrders.length) return NextResponse.json({ sucesso: false, erro: "Nenhum pedido informado." }, { status: 400 });
    const created = await prisma.$transaction(rawOrders.map((raw: Record<string, any>) => prisma.orders.create({ data: dataFrom(raw, true, authorization.profile.id) })));
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao criar pedido." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await authorizeApi(orderRoles);
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const id = text(body.id);
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    const accessibleOrder = await prisma.orders.findFirst({
      where: {
        id,
        ...orderScope({
          id: authorization.profile.id,
          role: authorization.profile.role as AppRole,
        }),
      },
      select: { id: true },
    });
    if (!accessibleOrder) return NextResponse.json({ sucesso: false, erro: "Pedido não encontrado ou sem permissão." }, { status: 404 });
    const order = await prisma.orders.update({ where: { id }, data: dataFrom(body) });
    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeApi(orderRoles);
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const id = text(body.id);
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    const accessibleOrder = await prisma.orders.findFirst({
      where: {
        id,
        ...orderScope({
          id: authorization.profile.id,
          role: authorization.profile.role as AppRole,
        }),
      },
      select: { id: true },
    });
    if (!accessibleOrder) return NextResponse.json({ sucesso: false, erro: "Pedido não encontrado ou sem permissão." }, { status: 404 });
    const data: Record<string, any> = { updated_at: new Date() };
    if (body.status !== undefined) {
      const status = text(body.status);
      const allowedStatuses = ["pendente", "confirmado", "processando", "enviado", "recebido"];
      if (!allowedStatuses.includes(status)) {
        return NextResponse.json(
          { sucesso: false, erro: "Status do pedido inválido." },
          { status: 400 }
        );
      }
      data.status = status;
    }
    if (body.conta_azul_status !== undefined) {
      if (!["administrador", "gerente"].includes(authorization.profile.role)) {
        return NextResponse.json(
          { sucesso: false, erro: "Seu perfil não pode alterar o status da integração fiscal." },
          { status: 403 }
        );
      }
      data.conta_azul_status = text(body.conta_azul_status);
    }
    const order = await prisma.orders.update({ where: { id }, data });
    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador"]);
    if ("response" in authorization) return authorization.response;

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

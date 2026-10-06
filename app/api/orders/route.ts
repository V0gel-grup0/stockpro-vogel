import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import {
  buildAccessibleClientWhere,
  buildClientVisibilityWhere,
} from "@/lib/client-visibility";
import {
  ORDER_DELETE_ROLES,
  ORDER_ROLES,
  canUpdateOrderStatus,
  type AppRole,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import { calculateOrderValues } from "@/lib/order-pricing";
import { ensureOrderWorkflowTables, syncOrderWorkflow, OrderWorkflowError } from "@/lib/order-workflow-server";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

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

function isMissingOrderItemsTable(error: unknown) {
  const candidate = error as { code?: string; meta?: { code?: string }; message?: string };
  return (
    (candidate?.code === "P2010" && candidate?.meta?.code === "42P01") ||
    String(candidate?.message || "").includes('relation "order_items" does not exist')
  );
}

async function loadOrderItems(orderIds: string[]) {
  if (!orderIds.length) return [];

  try {
    return await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        id,
        order_id,
        source_quote_item_id,
        item_type,
        product_id,
        item_name,
        description,
        quantity,
        unit_price,
        discount_value,
        total_value,
        created_at
      FROM order_items
      WHERE order_id IN (${Prisma.join(orderIds)})
      ORDER BY created_at ASC, id ASC
    `);
  } catch (error) {
    if (isMissingOrderItemsTable(error)) return [];
    throw error;
  }
}

async function canAccessEveryClient(
  profile: { id: string; role: AppRole },
  clientIds: string[]
) {
  const uniqueClientIds = [...new Set(clientIds.filter(Boolean))];
  if (!uniqueClientIds.length) return true;

  const visibilityWhere = buildClientVisibilityWhere(profile);
  const accessibleClients = await prisma.clients.count({
    where: visibilityWhere
      ? { AND: [{ id: { in: uniqueClientIds } }, visibilityWhere] }
      : { id: { in: uniqueClientIds } },
  });

  return accessibleClients === uniqueClientIds.length;
}

function dataFrom(
  body: Record<string, any>,
  includeState = false,
  createdBy?: string
) {
  const itemType = text(body.item_type) || "produto";
  if (!["produto", "equipamento"].includes(itemType)) throw new Error("Tipo de item inválido.");
  if (!text(body.client_id)) throw new Error("Selecione o cliente do pedido.");
  if (itemType === "produto" && !text(body.item_id)) throw new Error("Selecione o produto.");
  if (itemType === "equipamento" && !(EQUIPMENT_CATALOG as readonly string[]).includes(text(body.equipment_name))) throw new Error("Equipamento inválido.");
  const values = calculateOrderValues(body.quantity ?? 1, body.unit_price ?? (Number(body.total_value || 0) / Number(body.quantity || 1)), body.shipping_value);
  const data: Record<string, any> = {
    client_id: text(body.client_id) || null,
    item_type: itemType,
    item_id: itemType === "produto" ? text(body.item_id) || null : null,
    equipment_name: itemType === "equipamento" ? text(body.equipment_name) : "",
    quantity: values.quantity,
    total_value: body.unit_price == null ? Math.round(Number(body.total_value || 0) * 100) / 100 : values.total_value,
    shipping_value: values.shipping_value,
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
    const authorization = await authorizeApi(ORDER_ROLES);
    if ("response" in authorization) return authorization.response;

    const orders = await prisma.orders.findMany({
      where: orderScope({
        id: authorization.profile.id,
        role: authorization.profile.role as AppRole,
      }),
      orderBy: { created_at: "desc" },
      include: {
        clients: {
          select: { id: true, name: true, city: true },
        },
        profiles: {
          select: { id: true, name: true, role: true },
        },
      },
    });
    const orderItems = await loadOrderItems(orders.map((order) => order.id));
    const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const item of orderItems) {
      const orderId = String(item.order_id || "");
      if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, []);
      itemsByOrder.get(orderId)?.push(item);
    }
    const enrichedOrders = orders.map((order) => ({
      ...order,
      unit_price: Number(order.total_value) / order.quantity,
      grand_total: Number(order.total_value) + Number(order.shipping_value),
      order_items: itemsByOrder.get(order.id) || [],
    }));
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(enrichedOrders) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar pedidos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(ORDER_ROLES);
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const rawOrders = Array.isArray(body?.orders) ? body.orders : [body];
    if (!rawOrders.length) return NextResponse.json({ sucesso: false, erro: "Nenhum pedido informado." }, { status: 400 });
    if (rawOrders.length > 50) return NextResponse.json({ sucesso: false, erro: "Limite de 50 pedidos por operação." }, { status: 400 });
    let preparedOrders: ReturnType<typeof dataFrom>[];
    try { preparedOrders = rawOrders.map((raw: Record<string, any>) => dataFrom(raw, true, authorization.profile.id)); }
    catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 }); }
    const profile = {
      id: authorization.profile.id,
      role: authorization.profile.role as AppRole,
    };

    const duplicateWindowStart = new Date(Date.now() - 15_000);
    for (const raw of preparedOrders) {
      const itemType = text(raw.item_type) || "produto";
      const duplicate = await prisma.orders.findFirst({
        where: {
          created_by: authorization.profile.id,
          client_id: text(raw.client_id) || null,
          item_type: itemType,
          item_id: itemType === "produto" ? text(raw.item_id) || null : null,
          equipment_name: itemType === "equipamento" ? text(raw.equipment_name) : "",
          quantity: Math.max(1, Math.trunc(number(raw.quantity, 1))),
          total_value: number(raw.total_value),
          shipping_value: number(raw.shipping_value),
          notes: text(raw.notes),
          created_at: { gte: duplicateWindowStart },
        },
        select: { id: true, order_number: true },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            sucesso: false,
            erro: `Este pedido já foi cadastrado há poucos segundos (Pedido #${duplicate.order_number}).`,
            duplicate_order_id: duplicate.id,
          },
          { status: 409 }
        );
      }
    }
    const canAccessClients = await canAccessEveryClient(
      profile,
      rawOrders.map((raw: Record<string, any>) => text(raw.client_id))
    );
    if (!canAccessClients) return NextResponse.json({ sucesso: false, erro: "Cliente não encontrado ou sem permissão." }, { status: 404 });
    await ensureOrderWorkflowTables();
    const created = await prisma.$transaction(async (tx) => {
      // Serialize submissions by author, including retries sent before the first request finishes.
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${profile.id}::uuid FOR UPDATE`;
      const result = [];
      for (const data of preparedOrders) {
        const duplicate = await tx.orders.findFirst({ where: {
          created_by: profile.id, client_id: data.client_id, item_type: data.item_type,
          item_id: data.item_id, equipment_name: data.equipment_name, quantity: data.quantity,
          total_value: data.total_value, shipping_value: data.shipping_value, notes: data.notes,
          created_at: { gte: new Date(Date.now() - 15_000) },
        }, select: { id: true, order_number: true } });
        if (duplicate) throw new OrderWorkflowError(`Este pedido já foi cadastrado há poucos segundos (Pedido #${duplicate.order_number}).`);
        const order = await tx.orders.create({ data });
        await syncOrderWorkflow(tx, order);
        result.push(order);
      }
      return result;
    }, { timeout: 30_000 });
    return NextResponse.json({ sucesso: true, orders: toJsonSafe(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao criar pedido." }, { status: error instanceof OrderWorkflowError ? error.status : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await authorizeApi(ORDER_ROLES);
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const id = text(body.id);
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    const requestedClientId = text(body.client_id);
    if (
      requestedClientId &&
      !(await prisma.clients.findFirst({
        where: buildAccessibleClientWhere(
          {
            id: authorization.profile.id,
            role: authorization.profile.role as AppRole,
          },
          requestedClientId
        ),
        select: { id: true },
      }))
    ) {
      return NextResponse.json({ sucesso: false, erro: "Cliente não encontrado ou sem permissão." }, { status: 404 });
    }
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
    let data: ReturnType<typeof dataFrom>;
    try { data = dataFrom(body); }
    catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 }); }
    const orderItems = await loadOrderItems([id]);
    if (orderItems.length) return NextResponse.json({ sucesso: false, erro: "Este pedido foi gerado por orçamento. Seus itens e valores são preservados; altere somente o status do pedido." }, { status: 409 });
    await ensureOrderWorkflowTables();
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.orders.update({ where: { id }, data });
      await syncOrderWorkflow(tx, updated);
      return updated;
    }, { timeout: 30_000 });
    return NextResponse.json({ sucesso: true, order: toJsonSafe(order) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar pedido." }, { status: error instanceof OrderWorkflowError ? error.status : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeApi(ORDER_ROLES);
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
      if (!canUpdateOrderStatus(authorization.profile.role)) {
        return NextResponse.json(
          { sucesso: false, erro: "Seu perfil não pode alterar o status do pedido." },
          { status: 403 }
        );
      }
      const status = text(body.status);
      const allowedStatuses = ["pendente", "confirmado", "processando", "enviado", "recebido", "instalado", "finalizado"];
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
    const authorization = await authorizeApi(ORDER_DELETE_ROLES);
    if ("response" in authorization) return authorization.response;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 });
    await ensureOrderWorkflowTables();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const started = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_assembly_work WHERE source_order_id = ${id}::uuid AND stage <> 'todo' FOR UPDATE`;
      if (started.length) throw new OrderWorkflowError("Este pedido possui montagem iniciada. Revise a montagem antes de excluir o pedido.");
      await tx.movements.updateMany({ where: { order_id: id }, data: { order_id: null } });
      await tx.conta_azul_logs.deleteMany({ where: { order_id: id } });
      try {
        await tx.$executeRaw`DELETE FROM order_items WHERE order_id = ${id}::uuid`;
      } catch (error) {
        if (!isMissingOrderItemsTable(error)) throw error;
      }
      await tx.orders.delete({ where: { id } });
    });
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao excluir pedido." }, { status: error instanceof OrderWorkflowError ? error.status : 500 });
  }
}

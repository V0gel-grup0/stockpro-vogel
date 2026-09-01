import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : NaN; };

function isMissingOrderItemsTable(error: unknown) {
  const candidate = error as { code?: string; meta?: { code?: string }; message?: string };
  return (
    (candidate?.code === "P2010" && candidate?.meta?.code === "42P01") ||
    String(candidate?.message || "").includes('relation "order_items" does not exist')
  );
}

export async function GET() {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "funcionario",
    ]);
    if ("response" in authorization) return authorization.response;

    const movements = await prisma.movements.findMany({ orderBy: { created_at: "desc" } });
    return NextResponse.json({ sucesso: true, movements: toJsonSafe(movements) });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar movimentações." }, { status: 500 });
  }
}

async function manual(body: Record<string, any>, profileId: string) {
  const type = text(body.type); const itemType = text(body.item_type); const itemId = text(body.item_id); const quantity = num(body.quantity);
  if (!itemId || !["entrada", "saida"].includes(type) || !["produto", "componente"].includes(itemType) || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Dados da movimentação manual são inválidos.");

  return prisma.$transaction(async (tx) => {
    let itemName = "";
    if (itemType === "produto") {
      if (!Number.isInteger(quantity)) throw new Error("A quantidade de produto deve ser inteira.");
      const item = await tx.products.findUnique({ where: { id: itemId } }); if (!item) throw new Error("Produto não encontrado."); itemName = item.name;
      const current = Number(item.quantity); const next = type === "entrada" ? current + quantity : current - quantity; if (next < 0) throw new Error(`Estoque insuficiente. Disponível: ${current}.`);
      await tx.products.update({ where: { id: itemId }, data: { quantity: next, updated_at: new Date() } });
      return tx.movements.create({ data: { type, item_type: "produto", item_kind: "produto", item_id: itemId, product_id: itemId, item_name: itemName, quantity, notes: text(body.notes) || `Movimentação manual de produto: ${itemName}`, created_by: profileId || null } });
    }
    const item = await tx.components.findUnique({ where: { id: itemId } }); if (!item) throw new Error("Componente não encontrado."); itemName = item.name;
    const current = Number(item.quantity); const next = type === "entrada" ? current + quantity : current - quantity; if (next < 0) throw new Error(`Estoque insuficiente. Disponível: ${current}.`);
    await tx.components.update({ where: { id: itemId }, data: { quantity: next, updated_at: new Date() } });
    return tx.movements.create({ data: { type, item_type: "componente", item_kind: "componente", item_id: itemId, component_id: itemId, item_name: itemName, quantity, notes: text(body.notes) || `Movimentação manual de componente: ${itemName}`, created_by: profileId || null } });
  });
}

async function nfEntry(body: Record<string, any>, profileId: string) {
  const nf = body.nf || {}; const quantity = num(nf.quantity); const unitCost = num(nf.unit_cost); const kind = text(nf.item_kind) || "produto";
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error("Quantidade ou custo da NF inválido.");
  const supplierName = text(nf.fornecedor_nome); if (!supplierName) throw new Error("Informe o fornecedor da NF.");
  const document = text(nf.fornecedor_document).replace(/\D/g, "");

  return prisma.$transaction(async (tx) => {
    let supplier = document ? await tx.suppliers.findFirst({ where: { document } }) : null;
    if (supplier) {
      supplier = await tx.suppliers.update({ where: { id: supplier.id }, data: { name: supplierName, phone: text(nf.fornecedor_phone).replace(/\D/g, ""), email: text(nf.fornecedor_email) } });
    } else {
      supplier = await tx.suppliers.create({ data: { name: supplierName, document, phone: text(nf.fornecedor_phone).replace(/\D/g, ""), email: text(nf.fornecedor_email), cep: "", city: "", street: "", number: "", no_number: false, neighborhood: "", products: [] } });
    }

    let itemId: string; let itemName: string;
    if (kind === "produto") {
      itemName = text(nf.produto_nome); if (!itemName) throw new Error("Informe o produto da NF."); if (!Number.isInteger(quantity)) throw new Error("A quantidade de produto deve ser inteira.");
      let product = await tx.products.findFirst({ where: { name: { equals: itemName, mode: "insensitive" } } });
      if (product) {
        product = await tx.products.update({ where: { id: product.id }, data: { quantity: Number(product.quantity) + quantity, cost_price: unitCost, supplier_id: supplier.id, category: text(nf.produto_categoria), subcategory: text(nf.produto_subcategoria), updated_at: new Date() } });
      } else {
        product = await tx.products.create({ data: { name: itemName, sku: "", category: text(nf.produto_categoria), subcategory: text(nf.produto_subcategoria), cost_price: unitCost, sale_price: 0, quantity, min_stock: 0, supplier_id: supplier.id, description: `Produto cadastrado automaticamente pela NF ${text(nf.nf_number) || text(nf.nf_key)}` } });
      }
      itemId = product.id;
      const movement = await tx.movements.create({ data: { type: "entrada", item_type: "produto", item_kind: "produto", nf_item_kind: "produto", item_id: itemId, product_id: itemId, item_name: itemName, quantity, notes: text(nf.notes) || `Entrada automática pela NF ${text(nf.nf_number) || text(nf.nf_key)}`, created_by: profileId || null, supplier_id: supplier.id, nf_number: text(nf.nf_number), receita_federal_nf: text(nf.receita_federal_nf), nf_key: text(nf.nf_key), unit_cost: unitCost, total_cost: quantity * unitCost } });
      return { movement, supplier, item: product };
    }

    itemId = text(nf.component_id); if (!itemId) throw new Error("Selecione um componente já cadastrado no estoque geral.");
    let component = await tx.components.findUnique({ where: { id: itemId } }); if (!component) throw new Error("Componente não encontrado."); itemName = component.name;
    component = await tx.components.update({ where: { id: itemId }, data: { quantity: Number(component.quantity) + quantity, cost_price: unitCost, supplier_id: supplier.id, category: component.category || text(nf.component_category), equipment: "Estoque geral", nf_number: text(nf.nf_number), receita_federal_nf: text(nf.receita_federal_nf), updated_at: new Date() } });
    const movement = await tx.movements.create({ data: { type: "entrada", item_type: "componente", item_kind: "componente", nf_item_kind: "componente", item_id: itemId, component_id: itemId, item_name: itemName, quantity, notes: text(nf.notes) || `Entrada automática pela NF ${text(nf.nf_number) || text(nf.nf_key)}`, created_by: profileId || null, supplier_id: supplier.id, nf_number: text(nf.nf_number), receita_federal_nf: text(nf.receita_federal_nf), nf_key: text(nf.nf_key), unit_cost: unitCost, total_cost: quantity * unitCost } });
    return { movement, supplier, item: component };
  });
}

async function orderExit(body: Record<string, any>, profileId: string) {
  const orderId = text(body.order_id); if (!orderId) throw new Error("Selecione o pedido para gerar a saída.");
  return prisma.$transaction(async (tx) => {
    const order = await tx.orders.findUnique({ where: { id: orderId } }); if (!order) throw new Error("Pedido não encontrado.");
    if (["enviado", "recebido", "finalizado", "cancelado"].includes(String(order.status || "").toLowerCase())) {
      throw new Error("Este pedido não está disponível para uma nova saída de estoque.");
    }

    let orderItems: Array<{
      id: string;
      item_type: string;
      product_id: string | null;
      item_name: string;
      quantity: unknown;
    }> = [];

    try {
      orderItems = await tx.$queryRaw`
        SELECT id, item_type, product_id, item_name, quantity
        FROM order_items
        WHERE order_id = ${orderId}::uuid
        ORDER BY created_at ASC, id ASC
      `;
    } catch (error) {
      if (!isMissingOrderItemsTable(error)) throw error;
    }

    if (orderItems.length) {
      const movements = [];
      for (const item of orderItems) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Quantidade inválida no item ${item.item_name}.`);

        if (item.item_type === "product") {
          if (!Number.isInteger(quantity)) throw new Error(`A quantidade do produto ${item.item_name} deve ser inteira.`);
          if (!item.product_id) throw new Error(`Produto ${item.item_name} não está vinculado ao estoque.`);
          const product = await tx.products.findUnique({ where: { id: item.product_id } });
          if (!product) throw new Error(`Produto do pedido não encontrado no estoque: ${item.item_name}.`);
          if (Number(product.quantity) < quantity) throw new Error(`Estoque insuficiente de ${product.name}. Disponível: ${product.quantity}. Pedido: ${quantity}.`);
          await tx.products.update({ where: { id: product.id }, data: { quantity: Number(product.quantity) - quantity, updated_at: new Date() } });
          movements.push(await tx.movements.create({ data: { type: "saida", item_type: "produto", item_kind: "produto", item_id: product.id, product_id: product.id, item_name: product.name, quantity, notes: text(body.notes) || `Saída automática pelo pedido #${order.order_number} - ${product.name}`, created_by: profileId || null, order_id: order.id } }));
          continue;
        }

        if (item.item_type === "equipment") {
          if (!Number.isInteger(quantity)) throw new Error(`A quantidade do equipamento ${item.item_name} deve ser inteira.`);
          const mounted = await tx.mounted_equipments.findUnique({ where: { equipment_name: item.item_name } });
          const available = Number(mounted?.quantity || 0);
          if (!mounted || available < quantity) throw new Error(`Estoque insuficiente de equipamento montado: ${item.item_name}. Disponível: ${available}. Necessário: ${quantity}.`);
          await tx.mounted_equipments.update({ where: { id: mounted.id }, data: { quantity: available - quantity, updated_at: new Date() } });
          movements.push(await tx.movements.create({ data: { type: "saida", item_type: "equipamento", item_kind: "equipamento", item_id: null, product_id: null, item_name: item.item_name, quantity, notes: text(body.notes) || `Saída automática pelo pedido #${order.order_number} - ${item.item_name}`, created_by: profileId || null, order_id: order.id } }));
        }
      }

      await tx.orders.update({ where: { id: order.id }, data: { status: "enviado", updated_at: new Date() } });
      return { movements, ignored_custom_items: orderItems.filter((item) => item.item_type === "custom").length };
    }

    const quantity = Number(order.quantity); const itemType = order.item_type || "produto"; let itemName = order.equipment_name || "Equipamento";
    if (itemType === "produto") {
      if (!order.item_id) throw new Error("Produto do pedido não informado.");
      const product = await tx.products.findUnique({ where: { id: order.item_id } }); if (!product) throw new Error("Produto do pedido não encontrado no estoque."); itemName = product.name;
      if (Number(product.quantity) < quantity) throw new Error(`Estoque insuficiente. Disponível: ${product.quantity}. Pedido: ${quantity}.`);
      await tx.products.update({ where: { id: product.id }, data: { quantity: Number(product.quantity) - quantity, updated_at: new Date() } });
    } else {
      const mounted = await tx.mounted_equipments.findUnique({ where: { equipment_name: order.equipment_name } });
      const available = Number(mounted?.quantity || 0); if (!mounted || available < quantity) throw new Error(`Estoque insuficiente de equipamento montado: ${order.equipment_name}. Disponível: ${available}. Necessário: ${quantity}.`);
      await tx.mounted_equipments.update({ where: { id: mounted.id }, data: { quantity: available - quantity, updated_at: new Date() } });
    }
    const movement = await tx.movements.create({ data: { type: "saida", item_type: itemType === "produto" ? "produto" : "equipamento", item_kind: itemType, item_id: itemType === "produto" ? order.item_id : null, product_id: itemType === "produto" ? order.item_id : null, item_name: itemName, quantity, notes: text(body.notes) || `Saída automática pelo pedido #${order.order_number} - ${itemName}`, created_by: profileId || null, order_id: order.id } });
    await tx.orders.update({ where: { id: order.id }, data: { status: "enviado", updated_at: new Date() } });
    return movement;
  });
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "funcionario",
    ]);
    if ("response" in authorization) return authorization.response;

    const body = await request.json(); const action = text(body.action) || "manual";
    const profileId = authorization.profile.id;
    const result = action === "manual" ? await manual(body, profileId) : action === "nf_entry" ? await nfEntry(body, profileId) : action === "order_exit" ? await orderExit(body, profileId) : null;
    if (!result) return NextResponse.json({ sucesso: false, erro: "Ação de movimentação não reconhecida." }, { status: 400 });
    return NextResponse.json({ sucesso: true, result: toJsonSafe(result) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao salvar movimentação." }, { status: 500 });
  }
}

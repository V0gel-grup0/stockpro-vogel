import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureAssemblyWorkTable } from "@/lib/assembly-work-server";
import { isCeltEquipment } from "@/lib/order-pricing";

export class OrderWorkflowError extends Error {
  status = 409;
}

let structure: Promise<void> | undefined;
export function ensureOrderWorkflowTables() {
  if (!structure) structure = (async () => {
    await ensureAssemblyWorkTable();
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS order_crm_links (
      order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
      owns_opportunity BOOLEAN NOT NULL DEFAULT true
    )`);
  })().catch((error) => { structure = undefined; throw error; });
  return structure;
}

type OrderSnapshot = {
  id: string; order_number: bigint; client_id: string | null; created_by: string | null;
  item_type: string; item_id: string | null; equipment_name: string; quantity: number;
  total_value: unknown; shipping_value: unknown; notes: string;
};
type WorkflowItem = { key: string; item_type: string; item_name: string; quantity: number };

// Called inside the same transaction as the order. Never report success on partial CRM writes.
export async function syncOrderWorkflow(tx: Prisma.TransactionClient, order: OrderSnapshot, options: { opportunityId?: string | null; items?: WorkflowItem[] } = {}) {
  if (!order.client_id) throw new OrderWorkflowError("Selecione um cliente para encaminhar o pedido ao CRM.");
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
  const links = await tx.$queryRaw<Array<{ opportunity_id: string | null; owns_opportunity: boolean }>>`SELECT opportunity_id, owns_opportunity FROM order_crm_links WHERE order_id = ${order.id}::uuid`;
  const existingLink = links[0];
  let opportunityId = existingLink?.opportunity_id || options.opportunityId;
  const ownsOpportunity = existingLink ? existingLink.owns_opportunity : !options.opportunityId;
  const saleCode = `PV-${String(order.order_number).padStart(6, "0")}`;
  const product = order.item_type === "produto" && order.item_id ? await tx.products.findUnique({ where: { id: order.item_id }, select: { name: true } }) : null;
  const itemName = order.equipment_name || product?.name || "Pedido";
  const title = `${saleCode} — ${itemName}`.slice(0, 200);
  const notes = [`Pedido #${order.order_number} (${saleCode})`, `${order.quantity} × ${itemName}`, order.notes].filter(Boolean).join("\n").slice(0, 5000);
  if (!opportunityId) {
    const opportunity = await tx.crm_opportunities.create({ data: {
      client_id: order.client_id, created_by: order.created_by, responsible_id: order.created_by,
      title, stage: "order_created", status: "open", probability: 100,
      estimated_value: Number(order.total_value) + Number(order.shipping_value), notes,
    } });
    opportunityId = opportunity.id;
  }
  await tx.$executeRaw`INSERT INTO order_crm_links (order_id, opportunity_id, owns_opportunity)
    VALUES (${order.id}::uuid, ${opportunityId}::uuid, ${ownsOpportunity})
    ON CONFLICT (order_id) DO UPDATE SET opportunity_id = EXCLUDED.opportunity_id`;
  await tx.$queryRaw`SELECT id FROM crm_opportunities WHERE id = ${opportunityId}::uuid FOR UPDATE`;
  const opportunity = await tx.crm_opportunities.findUnique({ where: { id: opportunityId } });
  if (!opportunity || opportunity.client_id !== order.client_id && !ownsOpportunity) throw new OrderWorkflowError("O cliente do pedido não corresponde à oportunidade vinculada.");
  const totals = await tx.$queryRaw<Array<{ value: unknown }>>`SELECT COALESCE(SUM(o.total_value + o.shipping_value), 0) AS value
    FROM orders o JOIN order_crm_links l ON l.order_id = o.id WHERE l.opportunity_id = ${opportunityId}::uuid`;
  await tx.crm_opportunities.update({ where: { id: opportunityId }, data: {
    ...(ownsOpportunity ? { client_id: order.client_id, title, notes } : {}),
    estimated_value: Number(totals[0]?.value || 0),
    ...(["lead", "proposal", "negotiation"].includes(opportunity.stage) ? { stage: "order_created", status: "open", probability: 100 } : {}),
    updated_at: new Date(),
  } });

  const items = options.items || [{ key: "order", item_type: order.item_type, item_name: order.equipment_name, quantity: order.quantity }];
  const celtItems = items.filter((item) => isCeltEquipment(item.item_type, item.item_name));
  const existingWork = await tx.$queryRaw<Array<{ id: string; source_item_key: string; equipment_name: string; quantity: number; stage: string }>>`SELECT id, source_item_key, equipment_name, quantity, stage FROM crm_assembly_work WHERE source_order_id = ${order.id}::uuid FOR UPDATE`;
  for (const work of existingWork) {
    const desired = celtItems.find((item) => item.key === work.source_item_key);
    if (work.stage !== "todo" && (!desired || desired.item_name !== work.equipment_name || desired.quantity !== work.quantity)) {
      throw new OrderWorkflowError("Este pedido tem montagem iniciada. Ajuste a montagem antes de alterar o equipamento ou a quantidade.");
    }
    if (!desired) await tx.$executeRaw`DELETE FROM crm_assembly_work WHERE id = ${work.id}::uuid`;
  }
  for (const item of celtItems) {
    await tx.$executeRaw`INSERT INTO crm_assembly_work (equipment_name, quantity, technician_id, stage, notes, created_by, source_order_id, source_item_key)
      VALUES (${item.item_name}, ${item.quantity}, NULL, 'todo', ${notes}, ${order.created_by}::uuid, ${order.id}::uuid, ${item.key})
      ON CONFLICT (source_order_id, source_item_key) DO UPDATE SET
        equipment_name = EXCLUDED.equipment_name, quantity = EXCLUDED.quantity, updated_at = now()`;
  }
}

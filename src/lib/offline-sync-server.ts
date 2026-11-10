import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validarCadastroPessoa } from "@/lib/validacao-cadastro";
import { calculateOrderValues } from "@/lib/order-pricing";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import { buildAccessibleClientWhere } from "@/lib/client-visibility";
import { syncOrderWorkflow } from "@/lib/order-workflow-server";
import { canQueueOperation } from "../../public/offline-policy.mjs";
import { recordOfflineAssembly, recordOfflineExit } from "@/lib/offline-stock-server";
import type { MovementInvoice } from "@/lib/movement-invoice-server";

export class OfflineSyncError extends Error { constructor(message: string, public status = 400) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function assertOfflineEnvelope(body: any, actorId: string) {
  if (!body || !uuid.test(body.operation_id) || !["client", "order", "assembly", "order_exit", "product_exit"].includes(body.type) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw new OfflineSyncError("Operação offline inválida.");
  if (body.owner_id !== actorId) throw new OfflineSyncError("Entre na conta que criou este registro offline.", 403);
}
let structure: Promise<unknown> | undefined;
export function ensureOfflineReceipts() {
  if (!structure) structure = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS offline_operation_receipts (
    actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL, payload_hash TEXT NOT NULL, result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(actor_id, operation_id)
  )`).catch(error => { structure = undefined; throw error; });
  return structure;
}
export async function applyOfflineOperation(tx: any, actor: { id: string; role: any }, body: any, invoice:MovementInvoice|null=null) {
  assertOfflineEnvelope(body, actor.id);
  if(!canQueueOperation(actor.role,body.type))throw new OfflineSyncError('Seu perfil não tem permissão para esta operação.',403);
  if(body.payload.invoice_file&&!invoice)throw new OfflineSyncError('A NF salva no aparelho não foi encontrada. Confira o anexo antes de enviar.');
  if(invoice){if(!['order_exit','product_exit'].includes(body.type))throw new OfflineSyncError('A NF só pode ser anexada a uma saída.');body={...body,payload:{...body.payload,invoice_sha256:createHash('sha256').update(invoice.bytes).digest('hex'),invoice_name:invoice.fileName}};}
  // Stable serialization means a retry's property order does not change its identity.
  const canonical = (value: any): any => value && typeof value === "object" ? (Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
  const hash = createHash("sha256").update(JSON.stringify(canonical({ type: body.type, payload: body.payload }))).digest("hex");
  // The caller holds the actor row lock for this entire transaction.
  const receipts = await tx.$queryRaw`SELECT payload_hash, result FROM offline_operation_receipts WHERE actor_id = ${actor.id}::uuid AND operation_id = ${body.operation_id}::uuid`;
  if (receipts[0]) {
    if (receipts[0].payload_hash !== hash) throw new OfflineSyncError("Este registro já foi enviado com outros dados. Atualize a lista de pedidos.", 409);
    return receipts[0].result;
  }
  const input = body.payload;
  let result: any;
  if (body.type === "client") {
    const validation = validarCadastroPessoa(input);
    if (!validation.valido) throw new OfflineSyncError("erro" in validation ? validation.erro : "Cadastro inválido.");
    const client = await tx.clients.create({ data: { ...validation.dados, proposal_status: text(input.proposal_status) || "Lead Frio", created_by: actor.id } });
    result = { type: "client", client: { id: client.id, name: client.name } };
  } else if(body.type==='assembly'){
    result=await recordOfflineAssembly(tx,actor,input);
  } else if(['order_exit','product_exit'].includes(body.type)){
    const resolved={...input};
    if(input.order_operation_id){
      if(!uuid.test(input.order_operation_id))throw new OfflineSyncError('Pedido offline inválido.');
      const dependency=await tx.$queryRaw`SELECT result FROM offline_operation_receipts WHERE actor_id=${actor.id}::uuid AND operation_id=${input.order_operation_id}::uuid`;
      if(dependency[0]?.result?.type!=='order')throw new OfflineSyncError('Envie primeiro o pedido desta saída.',409);
      resolved.order_id=dependency[0].result.order.id;
      resolved.expected_updated_at=dependency[0].result.order.updated_at;
    }
    result=await recordOfflineExit(tx,actor,body.type,resolved,invoice);
  } else {
    let clientId = text(input.client_id);
    if (input.client_operation_id) {
      if (!uuid.test(input.client_operation_id)) throw new OfflineSyncError("Cliente offline inválido.");
      const dependency = await tx.$queryRaw`SELECT result FROM offline_operation_receipts WHERE actor_id = ${actor.id}::uuid AND operation_id = ${input.client_operation_id}::uuid`;
      if (dependency[0]?.result?.type !== "client") throw new OfflineSyncError("Envie primeiro o cadastro do cliente deste pedido.", 409);
      clientId = dependency[0].result.client.id;
    }
    if (!uuid.test(clientId)) throw new OfflineSyncError("Selecione um cliente válido.");
    const client = await tx.clients.findFirst({ where: buildAccessibleClientWhere(actor, clientId) });
    if (!client) throw new OfflineSyncError("Cliente indisponível ou sem permissão para esta conta.", 403);
    const values = calculateOrderValues(input.quantity, input.unit_price, input.shipping_value, input.discount_value);
    if (!["produto", "equipamento"].includes(input.item_type)) throw new OfflineSyncError("Tipo de item inválido.");
    if (input.item_type === "equipamento" && !(EQUIPMENT_CATALOG as readonly string[]).includes(input.equipment_name)) throw new OfflineSyncError("Equipamento inválido. Prepare os dados novamente.");
    if (input.item_type === "produto") {
      if (!uuid.test(input.item_id) || !(await tx.products.findUnique({ where: { id: input.item_id } }))) throw new OfflineSyncError("Produto indisponível. Prepare os dados novamente.", 409);
    }
    const order = await tx.orders.create({ data: {
      created_by: actor.id, client_id: clientId, status: "pendente", item_type: input.item_type,
      item_id: input.item_type === "produto" ? input.item_id : null,
      equipment_name: input.item_type === "equipamento" ? input.equipment_name : "",
      quantity: values.quantity, total_value: values.total_value, shipping_value: values.shipping_value,
      notes: text(input.notes).slice(0, 5000), updated_at: new Date(),
    } });
    await syncOrderWorkflow(tx, { ...order, discount_value: values.discount_value });
    result = { type: "order", order: { id: order.id, order_number: String(order.order_number), updated_at:order.updated_at?new Date(order.updated_at).toISOString():null } };
  }
  await tx.$executeRaw`INSERT INTO offline_operation_receipts(actor_id, operation_id, payload_hash, result)
    VALUES (${actor.id}::uuid, ${body.operation_id}::uuid, ${hash}, ${JSON.stringify(result)}::jsonb)`;
  return result;
}

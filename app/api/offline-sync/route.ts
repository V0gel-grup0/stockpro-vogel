import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { ORDER_ROLES } from "@/lib/permissions";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import { prisma } from "@/lib/prisma";
import { ensureOrderWorkflowTables, OrderWorkflowError } from "@/lib/order-workflow-server";
import { applyOfflineOperation, assertOfflineEnvelope, ensureOfflineReceipts, OfflineSyncError } from "@/lib/offline-sync-server";
import { canQueueOperation, ASSEMBLY_ROLES, EXIT_ROLES } from "@/lib/offline-policy";
import { OfflineStockError } from "@/lib/offline-stock-server";
import { ensureAssemblyWorkTable } from "@/lib/assembly-work-server";
import { ensureMovementInvoices, type MovementInvoice } from "@/lib/movement-invoice-server";
import { validateMovementInvoice } from "@/lib/movement-invoice-policy";
import { toJsonSafe } from "@/lib/prisma-json";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await authorizeApi([...ORDER_ROLES, 'tecnico']);
  if ("response" in auth) return auth.response;
  const actor=auth.profile,assembly=ASSEMBLY_ROLES.includes(actor.role),exit=EXIT_ROLES.includes(actor.role);
  const inventory:any={tasks:[],orders:[],components:[],mounted:[],technicians:[]};
  if(assembly){
    await ensureAssemblyWorkTable();const manager=actor.role!=='tecnico';
    inventory.tasks=await prisma.$queryRaw`SELECT id,equipment_name,quantity,stage,updated_at,technician_id FROM crm_assembly_work WHERE stage<>'done' AND (${manager}::boolean OR technician_id=${actor.id}::uuid) ORDER BY created_at`;
    inventory.components=await prisma.components.findMany({select:{id:true,name:true,quantity:true},orderBy:{name:'asc'}});
    inventory.technicians=await prisma.profiles.findMany({where:{role:'tecnico',status:'approved',...(actor.role==='tecnico'?{id:actor.id}:{})},select:{id:true,name:true},orderBy:{name:'asc'}});
  }
  if(assembly||exit)inventory.mounted=await prisma.mounted_equipments.findMany({select:{equipment_name:true,quantity:true},orderBy:{equipment_name:'asc'}});
  if(exit)inventory.orders=await prisma.orders.findMany({where:{status:{notIn:['enviado','entregue','recebido','finalizado','cancelado']}},select:{id:true,order_number:true,equipment_name:true,quantity:true,item_type:true,updated_at:true,clients:{select:{name:true}}},orderBy:{created_at:'desc'}});
  return NextResponse.json(toJsonSafe({ equipments: EQUIPMENT_CATALOG, inventory }), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeApi([...ORDER_ROLES, 'tecnico']);
    if ("response" in auth) return auth.response;
    let body:any,invoice:MovementInvoice|null=null;
    if(request.headers.get('content-type')?.includes('multipart/form-data')){
      const form=await request.formData();body=JSON.parse(String(form.get('payload')||'{}'));
      const file=form.get('invoice');
      if(file instanceof File){
        if(file.size>3000000)throw new OfflineSyncError('Selecione uma NF de até 3 MB.');
        const bytes=Buffer.from(await file.arrayBuffer());
        try{invoice={...validateMovementInvoice(file.name,bytes),bytes};}catch(error){throw new OfflineSyncError((error as Error).message);}
      }
    }else body = await request.json();
    assertOfflineEnvelope(body, auth.profile.id);
    if(!canQueueOperation(auth.profile.role,body.type))throw new OfflineSyncError('Seu perfil não tem permissão para esta operação.',403);
    await ensureOfflineReceipts();
    if (body.type === "order") await ensureOrderWorkflowTables();
    if(body.type==='assembly')await ensureAssemblyWorkTable();
    if(invoice)await ensureMovementInvoices();
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${auth.profile.id}::uuid FOR UPDATE`;
      return applyOfflineOperation(tx, auth.profile, body,invoice);
    }, { timeout: 30_000 });
    return NextResponse.json({ sucesso: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof OfflineSyncError || error instanceof OrderWorkflowError || error instanceof OfflineStockError;
    const invalid = error instanceof SyntaxError || error instanceof Error && /Informe (uma quantidade|valores)|Valor do pedido|Desconto não pode/.test(error.message);
    if (!known && !invalid) console.error("Falha na sincronização offline:", error);
    return NextResponse.json({ sucesso: false, erro: known || invalid ? error.message : "Não foi possível enviar agora. O registro continua pendente; tente novamente." }, { status: known ? error.status : invalid ? 400 : 500 });
  }
}

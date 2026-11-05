import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import { exitMountedEquipment } from "@/lib/equipment-exit-server";
import { saveMovementInvoice, type MovementInvoice } from "@/lib/movement-invoice-server";
export class OfflineStockError extends Error { constructor(message:string,public status=400){super(message);} }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function quantity(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0||n>2147483647)throw new OfflineStockError('Informe uma quantidade inteira válida.');return n;}
export async function recordOfflineAssembly(tx:any,actor:{id:string;role:string},input:any){
  const equipment=text(input.equipment),qty=quantity(input.quantity);
  if(!(EQUIPMENT_CATALOG as readonly string[]).includes(equipment))throw new OfflineStockError('Selecione um equipamento válido, incluindo a voltagem.');
  const technician=actor.role==='tecnico'?actor.id:text(input.technician_id)||null;
  if(technician&&(!uuid.test(technician)||!await tx.profiles.findFirst({where:{id:technician,role:'tecnico',status:'approved'},select:{id:true}})))throw new OfflineStockError('Montador indisponível. Atualize os dados.');
  let work:any=null;
  if(input.work_id){
    if(!uuid.test(input.work_id))throw new OfflineStockError('Tarefa de montagem inválida.');
    [work]=await tx.$queryRaw`SELECT * FROM crm_assembly_work WHERE id=${input.work_id}::uuid FOR UPDATE`;
    if(!work||(actor.role==='tecnico'&&work.technician_id!==actor.id))throw new OfflineStockError('Montagem não encontrada ou sem permissão.',403);
    if(work.stage==='done')throw new OfflineStockError('Esta tarefa já foi concluída. Confira o estoque antes de registrar outra montagem.',409);
    if(!input.expected_updated_at||new Date(work.updated_at).getTime()!==new Date(input.expected_updated_at).getTime())throw new OfflineStockError('A tarefa foi alterada depois da preparação offline. Atualize os dados e confira antes de reenviar.',409);
    if(work.equipment_name!==equipment||Number(work.quantity)!==qty)throw new OfflineStockError('Para concluir a tarefa, use o mesmo equipamento e a quantidade total prevista.');
  }
  const divisions=await tx.equipment_components.findMany({where:{equipment_name:equipment},include:{components:true},orderBy:{component_id:'asc'}});
  if(!divisions.length)throw new OfflineStockError(`Nenhuma composição cadastrada para ${equipment}. Configure os componentes antes do envio.`,409);
  for(const part of divisions){
    const need=Number(part.qty_per_equipment)*qty;
    if(!Number.isFinite(need)||need<=0)throw new OfflineStockError('Composição de equipamento inválida. Confira as quantidades dos componentes.',409);
    const updated=await tx.components.updateMany({where:{id:part.component_id,quantity:{gte:need}},data:{quantity:{decrement:need},updated_at:new Date()}});
    if(updated.count!==1)throw new OfflineStockError(`Estoque insuficiente para montar ${equipment}: ${part.components.name} precisa de ${need}. Nenhuma montagem parcial foi salva.`,409);
    await tx.movements.create({data:{type:'saida',item_type:'componente',item_kind:'componente',item_id:part.component_id,component_id:part.component_id,item_name:part.components.name,quantity:need,notes:`Baixa automática de componente: montagem de ${equipment}`,created_by:actor.id}});
  }
  const assembly=await tx.assemblies.create({data:{equipment,quantity:qty,technician_id:technician,created_by:actor.id}});
  await tx.mounted_equipments.upsert({where:{equipment_name:equipment},update:{quantity:{increment:qty},updated_at:new Date()},create:{equipment_name:equipment,quantity:qty,min_stock:0,notes:''}});
  if(work)await tx.$executeRaw`UPDATE crm_assembly_work SET stage='done',updated_at=now() WHERE id=${work.id}::uuid`;
  return {type:'assembly',assembly:{...assembly,equipment,quantity:qty}};
}
async function takeProduct(tx:any,id:string,qty:number,actorId:string,notes:string,orderId?:string){
  if(!uuid.test(id))throw new OfflineStockError('Produto inválido.');
  const product=await tx.products.findUnique({where:{id}});
  if(!product)throw new OfflineStockError('Produto indisponível. Atualize os dados.',409);
  const updated=await tx.products.updateMany({where:{id,quantity:{gte:qty}},data:{quantity:{decrement:qty},updated_at:new Date()}});
  if(updated.count!==1)throw new OfflineStockError(`Estoque insuficiente de ${product.name}. Nenhuma saída parcial foi salva.`,409);
  return tx.movements.create({data:{type:'saida',item_type:'produto',item_kind:'produto',item_id:id,product_id:id,item_name:product.name,quantity:qty,notes,created_by:actorId,...(orderId?{order_id:orderId}:{})}});
}
export async function recordOfflineExit(tx:any,actor:{id:string;role:string},type:string,input:any,invoice:MovementInvoice|null){
  const movements:any[]=[];
  if(type==='product_exit'){
    movements.push(await takeProduct(tx,text(input.product_id),quantity(input.quantity),actor.id,text(input.notes)||'Saída avulsa de produto registrada offline'));
  }else{
    const id=text(input.order_id);if(!uuid.test(id))throw new OfflineStockError('Pedido inválido.');
    await tx.$queryRaw`SELECT id FROM orders WHERE id=${id}::uuid FOR UPDATE`;
    const order=await tx.orders.findUnique({where:{id}});
    if(!order)throw new OfflineStockError('Pedido não encontrado.',404);
    if(['enviado','entregue','recebido','finalizado','cancelado'].includes(String(order.status).toLowerCase()))throw new OfflineStockError('Este pedido já teve saída ou não está disponível para envio. Confira a situação no sistema.',409);
    if(!input.expected_updated_at||new Date(order.updated_at).getTime()!==new Date(input.expected_updated_at).getTime())throw new OfflineStockError('O pedido mudou depois da preparação offline. Atualize os dados e confira antes de enviar a saída.',409);
    const table=await tx.$queryRaw`SELECT to_regclass('public.order_items')::text AS name`;
    let items=table[0]?.name?await tx.$queryRaw`SELECT item_type,product_id,item_name,quantity FROM order_items WHERE order_id=${id}::uuid ORDER BY id`:[];
    if(!items.length)items=[{item_type:order.item_type==='equipamento'?'equipment':'product',product_id:order.item_id,item_name:order.equipment_name,quantity:order.quantity}];
    for(const item of items){
      if(!['product','equipment'].includes(item.item_type))continue;
      const qty=quantity(item.quantity),notes=text(input.notes)||`Saída pelo pedido #${order.order_number}`;
      if(item.item_type==='product')movements.push(await takeProduct(tx,item.product_id,qty,actor.id,notes,id));
      else {
        try{movements.push(...await exitMountedEquipment(tx,item.item_name,qty,{orderId:id,orderNumber:String(order.order_number),profileId:actor.id,notes}));}
        catch(error){throw new OfflineStockError(error instanceof Error?error.message:'Não foi possível baixar o equipamento.',409);}
      }
    }
    if(!movements.length)throw new OfflineStockError('Este pedido não contém produtos ou equipamentos vinculados ao estoque.',409);
    await tx.orders.update({where:{id},data:{status:'enviado',updated_at:new Date()}});
  }
  await saveMovementInvoice(tx,invoice,actor.id,movements);
  return {type,exit:{order_id:input.order_id||null,movement_ids:movements.map(row=>row.id),invoice_attached:Boolean(invoice)}};
}

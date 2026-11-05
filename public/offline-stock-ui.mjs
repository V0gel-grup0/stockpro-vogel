import { read } from './offline-data.mjs';
import { ASSEMBLY_ROLES, EXIT_ROLES, canQueueOperation } from './offline-policy.mjs';
import { listQueue, enqueue, revise } from './offline-queue.mjs';
import { putInvoice, deleteInvoice } from './offline-files.mjs';
const $=id=>document.getElementById(id);
let context,editing=null,saving=false;
let lastOwner=null;
function option(value,label){const node=document.createElement('option');node.value=value;node.textContent=label;return node;}
function fill(id,items,label,value){const select=$(id),old=select.value;select.replaceChildren(option('','Selecione'),...items.map(item=>option(value(item),label(item))));if([...select.options].some(item=>item.value===old))select.value=old;}
export function renderStockForms(snapshot){
  if(lastOwner!==snapshot?.owner_id){$('assembly-form').reset();$('exit-form').reset();editing=null;lastOwner=snapshot?.owner_id;}
  const inventory=snapshot?.catalog?.inventory,role=snapshot?.role;
  $('commercial-forms').hidden=!canQueueOperation(role,'client');
  $('assembly-area').hidden=!inventory||!ASSEMBLY_ROLES.includes(role);$('exit-area').hidden=!inventory||!EXIT_ROLES.includes(role);
  $('new-client').hidden=Boolean(snapshot)&&!canQueueOperation(role,'client');$('new-order').hidden=$('new-client').hidden;
  $('new-assembly').hidden=Boolean(snapshot)&&!ASSEMBLY_ROLES.includes(role);$('new-exit').hidden=Boolean(snapshot)&&!EXIT_ROLES.includes(role);
  $('stock-reference').hidden=!inventory||(!ASSEMBLY_ROLES.includes(role)&&!EXIT_ROLES.includes(role));
  if(!inventory)return;
  $('stock-reference').textContent=`Saldos de referência preparados em ${new Date(snapshot.savedAt).toLocaleString('pt-BR')}. ${inventory.mounted.map(item=>`${item.equipment_name}: ${item.quantity}`).join(' · ')||'Nenhum equipamento montado registrado.'} Os saldos serão conferidos novamente no envio.`;
  fill('assembly-work',inventory.tasks,item=>`${item.equipment_name} · ${item.quantity} un.`,item=>item.id);
  $('assembly-work').options[0].textContent='Sem tarefa vinculada';
  fill('assembly-equipment',snapshot.catalog.equipments,item=>item,item=>item);
  fill('assembly-technician',inventory.technicians,item=>item.name,item=>item.id);
  if(role==='tecnico'){$('assembly-technician').value=snapshot.owner_id;$('assembly-technician').disabled=true;}else $('assembly-technician').disabled=false;
  fill('exit-product',snapshot.catalog.products,item=>`${item.name} · saldo de referência: ${item.quantity??'—'}`,item=>item.id);
  const queued=listQueue(localStorage,snapshot.owner_id).filter(item=>item.type==='order');
  fill('exit-order',[...inventory.orders.map(item=>({value:item.id,label:`Pedido #${item.order_number} · ${item.clients?.name||''} · ${item.equipment_name||'Produtos'}`})),...queued.map(item=>({value:`local:${item.operation_id}`,label:`Pedido offline · ${item.label}`}))],item=>item.label,item=>item.value);
}
export function editStockDraft(row){
  if(!['assembly','order_exit','product_exit'].includes(row.type))return false;
  editing=row;const form=$(row.type==='assembly'?'assembly-form':'exit-form');form.reset();
  if(row.type==='assembly'){
    for(const key of ['equipment','quantity','work_id','technician_id'])form.elements[key].value=row.payload[key]||'';
  }else{
    $('exit-mode').value=row.type;toggleExit();
    $('exit-order').value=row.payload.order_operation_id?`local:${row.payload.order_operation_id}`:row.payload.order_id||'';
    $('exit-product').value=row.payload.product_id||'';form.elements.quantity.value=row.payload.quantity||1;form.elements.notes.value=row.payload.notes||'';
  }
  $('queue-status').textContent=`Corrigindo registro pendente. ${row.payload.invoice_file?'A NF existente será mantida se você não escolher outro arquivo.':''}`;
  form.scrollIntoView({behavior:'smooth',block:'start'});return true;
}
function toggleExit(){const order=$('exit-mode').value==='order_exit';$('exit-order-field').hidden=!order;$('exit-product-field').hidden=order;$('exit-quantity-field').hidden=order;}
async function save(type,payload,label,file){
  if(saving)return;saving=true;let fileId=null,fileOwner=null;const previous=editing?.type===type?editing:null;
  try{
    if(editing&&editing.type!==type)throw Error('Ao corrigir uma pendência, mantenha o mesmo tipo de operação.');
    const current=read(localStorage);
    if(!current||current.owner_id!==context.getSnapshot()?.owner_id||!canQueueOperation(current.role,type))throw Error('Confira a conta, a permissão e a preparação antes de salvar.');
    const id=previous?.operation_id||crypto.randomUUID();
    if(file?.size){fileId=crypto.randomUUID();fileOwner=current.owner_id;await putInvoice(current.owner_id,fileId,file);payload.invoice_file=fileId;payload.invoice_name=file.name;}
    else if(previous?.payload.invoice_file){payload.invoice_file=previous.payload.invoice_file;payload.invoice_name=previous.payload.invoice_name;}
    const fresh=read(localStorage);if(fresh?.owner_id!==current.owner_id)throw Error('A conta mudou durante o preenchimento. Reabra o formulário.');
    if(previous)revise(localStorage,fresh,id,payload,label);else enqueue(localStorage,fresh,type,payload,label,id);
    if(fileId&&previous?.payload.invoice_file)try{await deleteInvoice(current.owner_id,previous.payload.invoice_file);}catch{}
    fileId=null;editing=null;$(type==='assembly'?'assembly-form':'exit-form').reset();toggleExit();context.drawQueue();
    $('queue-status').textContent='Registro salvo no aparelho e pendente de envio. O estoque ainda não foi alterado.';
    if(navigator.onLine)void context.sendPending();
  }catch(error){if(fileId)try{await deleteInvoice(fileOwner,fileId);}catch{}$('queue-status').textContent=error.message||'Não foi possível salvar neste aparelho.';}
  finally{saving=false;}
}
export function setupStockUI(value){
  context=value;
  $('exit-mode').addEventListener('change',toggleExit);
  $('assembly-work').addEventListener('change',()=>{
    const work=context.getSnapshot()?.catalog.inventory.tasks.find(item=>item.id===$('assembly-work').value);
    if(work){$('assembly-equipment').value=work.equipment_name;$('assembly-form').elements.quantity.value=work.quantity;$('assembly-technician').value=work.technician_id||'';}
  });
  $('assembly-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget,qty=Number(form.elements.quantity.value),equipment=form.elements.equipment.value,work=context.getSnapshot()?.catalog.inventory.tasks.find(item=>item.id===$('assembly-work').value);
    if(!equipment||!Number.isSafeInteger(qty)||qty<=0){$('queue-status').textContent='Selecione o equipamento e uma quantidade inteira positiva.';return;}
    void save('assembly',{equipment,quantity:qty,technician_id:$('assembly-technician').value,...(work?{work_id:work.id,expected_updated_at:work.updated_at}:{})},`Montagem: ${qty} × ${equipment}`);
  });
  $('exit-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget,type=$('exit-mode').value,inventory=context.getSnapshot()?.catalog.inventory,payload={notes:form.elements.notes.value};let label;
    if(type==='order_exit'){
      const selected=$('exit-order').value;if(!selected){$('queue-status').textContent='Selecione o pedido da saída.';return;}
      if(selected.startsWith('local:'))payload.order_operation_id=selected.slice(6);else{const order=inventory.orders.find(item=>item.id===selected);payload.order_id=selected;payload.expected_updated_at=order?.updated_at;}
      label=`Saída: ${$('exit-order').selectedOptions[0].textContent}`;
    }else{
      payload.product_id=$('exit-product').value;payload.quantity=Number(form.elements.quantity.value);
      if(!payload.product_id||!Number.isSafeInteger(payload.quantity)||payload.quantity<=0){$('queue-status').textContent='Selecione o produto e uma quantidade inteira positiva.';return;}
      label=`Saída avulsa: ${payload.quantity} × ${$('exit-product').selectedOptions[0].textContent}`;
    }
    void save(type,payload,label,form.elements.invoice.files[0]);
  });
}

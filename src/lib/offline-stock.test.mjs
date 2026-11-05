import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {exitMountedEquipment} from './equipment-exit-server.ts';
import {EQUIPMENT_CATALOG} from './equipment-catalog.ts';
import {canQueueOperation} from '../../public/offline-policy.mjs';
import {enqueue,listQueue,syncQueue} from '../../public/offline-queue.mjs';
import {putInvoice,getInvoice,deleteInvoice} from '../../public/offline-files.mjs';
const require=createRequire(import.meta.url);
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const actor={id:id(1),role:'tecnico'},admin={id:id(2),role:'administrador'},equipment='Celt5000 Plus - 380V 3 turbinas + Mínima',stamp='2026-11-05T15:00:00.000Z';
function compile(path,dependencies){const m={exports:{}};const js=ts.transpileModule(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>name in dependencies?dependencies[name]:require(name),m,m.exports);return m.exports;}
function fixture(){
  let state={components:{[id(10)]:10,[id(11)]:10},product:10,mounted:{[equipment]:4,'CeltPlus - 380V':4,'CeltPlus - 220V':20},movements:[],assemblies:[],invoices:[],receipts:{},work:{id:id(20),equipment_name:equipment,quantity:2,technician_id:actor.id,stage:'assembling',updated_at:stamp},order:{id:id(30),order_number:100n,status:'pendente',item_type:'equipamento',equipment_name:equipment,quantity:2,updated_at:stamp},conditional:[]};
  const tx={
    $queryRaw:async(parts,...values)=>{
      const sql=parts.join('?');
      if(sql.includes('payload_hash'))return state.receipts[values[1]]?[state.receipts[values[1]]]:[];
      if(sql.includes('SELECT result'))return state.receipts[values[1]]?[state.receipts[values[1]]]:[];
      if(sql.includes('crm_assembly_work'))return [state.work];
      if(sql.includes('to_regclass'))return [{name:state.items?'order_items':null}];
      if(sql.includes('FROM order_items'))return state.items;
      if(sql.includes('FROM orders'))return [{id:state.order.id}];
      throw Error('Unexpected query '+sql);
    },
    $executeRaw:async(parts,...values)=>{
      const sql=parts.join('?');if(sql.includes('INSERT INTO offline_operation_receipts'))state.receipts[values[1]]={payload_hash:values[2],result:JSON.parse(values[3])};
      else if(sql.includes('UPDATE crm_assembly_work'))state.work.stage='done';else throw Error('Unexpected mutation '+sql);
    },
    profiles:{findFirst:async()=>({id:actor.id})},
    equipment_components:{findMany:async()=>[{component_id:id(10),qty_per_equipment:2,components:{name:'Motor 380V'}},{component_id:id(11),qty_per_equipment:1,components:{name:'Painel 380V'}}]},
    components:{updateMany:async({where,data})=>{state.conditional.push(where);if(state.components[where.id]<where.quantity.gte)return {count:0};state.components[where.id]-=data.quantity.decrement;return {count:1};}},
    movements:{create:async({data})=>{const row={id:id(100+state.movements.length),...data};state.movements.push(row);return row;}},
    assemblies:{create:async({data})=>{const row={id:id(50+state.assemblies.length),...data};state.assemblies.push(row);return row;}},
    mounted_equipments:{upsert:async({where,update})=>{state.mounted[where.equipment_name]=(state.mounted[where.equipment_name]||0)+update.quantity.increment;},updateMany:async({where,data})=>{if((state.mounted[where.equipment_name]||0)<where.quantity.gte)return {count:0};state.mounted[where.equipment_name]-=data.quantity.decrement;return {count:1};}},
    products:{findUnique:async()=>({id:id(40),name:'Produto Vogel',quantity:state.product}),updateMany:async({where,data})=>{state.conditional.push(where);if(state.product<where.quantity.gte)return {count:0};state.product-=data.quantity.decrement;return {count:1};}},
    orders:{findUnique:async()=>state.order,update:async({data})=>Object.assign(state.order,data)},
  };
  const stock=compile('src/lib/offline-stock-server.ts',{'@/lib/equipment-catalog':{EQUIPMENT_CATALOG},'@/lib/equipment-exit-server':{exitMountedEquipment},'@/lib/movement-invoice-server':{saveMovementInvoice:async(transaction,invoice,owner,rows)=>{assert.equal(transaction,tx);if(invoice)state.invoices.push({owner,ids:rows.map(row=>row.id),name:invoice.fileName});}}});
  const apply=compile('src/lib/offline-sync-server.ts',{'@/lib/prisma':{},'@/lib/validacao-cadastro':{},'@/lib/order-pricing':{},'@/lib/equipment-catalog':{EQUIPMENT_CATALOG},'@/lib/client-visibility':{},'@/lib/order-workflow-server':{},'@/lib/offline-stock-server':stock});
  const run=async(who,type,payload,op=id(60),invoice=null)=>{const before=structuredClone(state);try{return await apply.applyOfflineOperation(tx,who,{operation_id:op,owner_id:who.id,type,payload},invoice);}catch(error){state=before;throw error;}};
  return {state:()=>state,run};
}
test('montagem baixa componentes condicionalmente, aumenta montados e conclui apenas a tarefa do montador',async()=>{
  const f=fixture(),payload={equipment,quantity:2,work_id:id(20),expected_updated_at:stamp,technician_id:admin.id};
  await f.run(actor,'assembly',payload);await f.run(actor,'assembly',payload);
  assert.equal(f.state().components[id(10)],6);assert.equal(f.state().mounted[equipment],6);assert.equal(f.state().assemblies.length,1);assert.equal(f.state().assemblies[0].technician_id,actor.id);assert.equal(f.state().work.stage,'done');assert.equal(f.state().movements.length,2);
  assert.equal(f.state().conditional[0].quantity.gte,4);
});
test('falta no segundo componente desfaz baixa, movimentos, montagem e recibo',async()=>{
  const f=fixture();f.state().components[id(11)]=0;const before=structuredClone(f.state());
  await assert.rejects(f.run(actor,'assembly',{equipment,quantity:2}),/Estoque insuficiente/);assert.deepEqual(f.state(),before);
});
test('montador não conclui tarefa alheia ou alterada e representante não baixa estoque',async()=>{
  const f=fixture();f.state().work.technician_id=admin.id;
  await assert.rejects(f.run(actor,'assembly',{equipment,quantity:2,work_id:id(20),expected_updated_at:stamp}),/sem permissão/);
  f.state().work.technician_id=actor.id;
  await assert.rejects(f.run(actor,'assembly',{equipment,quantity:2,work_id:id(20),expected_updated_at:'2026-01-01'}),/alterada/);
  await assert.rejects(f.run({id:actor.id,role:'representante'},'product_exit',{product_id:id(40),quantity:2}),/permissão/);
  assert.equal(f.state().movements.length,0);
});
test('saída Plus leva CeltPlus da mesma voltagem, anexa NF e não repete após perda de resposta',async()=>{
  const f=fixture(),payload={order_id:id(30),expected_updated_at:stamp,invoice_file:id(90)},invoice={fileName:'nf.xml',bytes:Buffer.from('<nfe/>'),size:6,mime:'application/xml'};
  const first=await f.run(admin,'order_exit',payload,id(60),invoice);await f.run(admin,'order_exit',payload,id(60),invoice);
  assert.equal(first.exit.invoice_attached,true);assert.equal(f.state().mounted[equipment],2);assert.equal(f.state().mounted['CeltPlus - 380V'],2);assert.equal(f.state().mounted['CeltPlus - 220V'],20);assert.equal(f.state().order.status,'enviado');assert.equal(f.state().movements.length,2);assert.equal(f.state().invoices.length,1);assert.equal(f.state().invoices[0].ids.length,2);
  await assert.rejects(f.run(admin,'order_exit',payload,id(61),invoice),/já teve saída/);
});
test('NF diferente não reutiliza recibo e arquivo ausente não gera saída',async()=>{
  const f=fixture(),payload={product_id:id(40),quantity:2,invoice_file:id(90)},invoice={fileName:'nf.xml',bytes:Buffer.from('<nfe/>')};
  await assert.rejects(f.run(admin,'product_exit',payload),/NF.*não foi encontrada/);
  await f.run(admin,'product_exit',payload,id(60),invoice);
  await assert.rejects(f.run(admin,'product_exit',payload,id(60),{...invoice,bytes:Buffer.from('<different/>')}),/outros dados/);
  assert.equal(f.state().product,8);
});
test('falta do CeltPlus ou alteração do pedido mantém estoque e status sem gravação parcial',async()=>{
  const f=fixture();f.state().mounted['CeltPlus - 380V']=1;const before=structuredClone(f.state());
  await assert.rejects(f.run(admin,'order_exit',{order_id:id(30),expected_updated_at:stamp}),/Estoque insuficiente/);assert.deepEqual(f.state(),before);
  await assert.rejects(f.run(admin,'order_exit',{order_id:id(30),expected_updated_at:'2026-01-01'}),/pedido mudou/);assert.deepEqual(f.state(),before);
});
test('pedido com itens de orçamento baixa produto e equipamentos e vincula a mesma NF',async()=>{
  const f=fixture();f.state().items=[{item_type:'product',product_id:id(40),item_name:'Produto Vogel',quantity:3},{item_type:'equipment',item_name:equipment,quantity:1},{item_type:'custom',item_name:'Instalação',quantity:1}];
  await f.run(admin,'order_exit',{order_id:id(30),expected_updated_at:stamp},id(60),{fileName:'nf.xml',bytes:Buffer.from('<nfe/>')});
  assert.equal(f.state().product,7);assert.equal(f.state().mounted[equipment],3);assert.equal(f.state().mounted['CeltPlus - 380V'],3);assert.equal(f.state().invoices[0].ids.length,3);assert.equal(f.state().movements.length,3);
});
function storage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
test('fila envia montagem antes da saída e conserva NF até a confirmação',async()=>{
  const store=storage(),snapshot={owner_id:admin.id,role:admin.role,expiresAt:Date.now()+10000},calls=[],files={getInvoice:async()=>({name:'nf.xml',blob:new Blob(['<nfe/>'])}),deleteInvoice:async()=>calls.push('delete-file')};
  enqueue(store,snapshot,'order_exit',{order_id:id(30),invoice_file:id(90)},'Saída',id(70));enqueue(store,snapshot,'assembly',{equipment,quantity:2},'Montagem',id(71));
  await syncQueue(store,admin.id,async(url,options)=>{
    if(url==='/api/auth/profile')return Response.json(admin);
    const form=options.body instanceof FormData,body=JSON.parse(form?options.body.get('payload'):options.body);calls.push(body.type);
    if(form)assert.equal(options.body.get('invoice').name,'nf.xml');
    return Response.json({sucesso:true});
  },()=>{},files);
  assert.deepEqual(calls,['assembly','order_exit','delete-file']);assert.ok(listQueue(store,admin.id).every(row=>row.state==='sent'));
});
test('NF local ausente impede envio e preserva pendência com erro corrigível',async()=>{
  const store=storage();enqueue(store,{owner_id:admin.id,role:admin.role,expiresAt:Date.now()+10000},'product_exit',{product_id:id(40),quantity:2,invoice_file:id(90)},'Produto',id(70));let posts=0;
  await syncQueue(store,admin.id,async url=>{if(url==='/api/auth/profile')return Response.json(admin);posts++;return Response.json({sucesso:true});},()=>{},{getInvoice:async()=>null});
  assert.equal(posts,0);assert.equal(listQueue(store,admin.id)[0].state,'pending');assert.match(listQueue(store,admin.id)[0].error,/NF não encontrada/);
});
test('política offline mantém montagens restritas a montadores e saídas restritas ao estoque',()=>{
  assert.equal(canQueueOperation('tecnico','assembly'),true);assert.equal(canQueueOperation('tecnico','order_exit'),false);assert.equal(canQueueOperation('funcionario','assembly'),false);assert.equal(canQueueOperation('funcionario','order_exit'),true);assert.equal(canQueueOperation('representante','assembly'),false);
});
test('arquivo de NF é guardado por conta e removido só por sua chave',async()=>{
  const previous=globalThis.indexedDB,map=new Map();
  const db={createObjectStore(){},close(){},transaction(){const tx={objectStore:()=>({
    put:row=>request(()=>{map.set(row.key,structuredClone(row));}),get:key=>request(()=>map.get(key)),delete:key=>request(()=>map.delete(key)),
  })};function request(action){const req={};queueMicrotask(()=>{try{req.result=action();req.onsuccess?.();tx.oncomplete?.();}catch{tx.onabort?.();}});return req;}return tx;}};
  globalThis.indexedDB={open(){const req={result:db};queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;}};
  try{
    const file=new File(['<nfe/>'],'nota.xml',{type:'application/xml'});
    await putInvoice(admin.id,id(90),file);assert.equal((await getInvoice(admin.id,id(90))).name,'nota.xml');assert.equal(await getInvoice(actor.id,id(90)),undefined);
    await deleteInvoice(actor.id,id(90));assert.ok(await getInvoice(admin.id,id(90)));
    await deleteInvoice(admin.id,id(90));assert.equal(await getInvoice(admin.id,id(90)),undefined);
  }finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
});

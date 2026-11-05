import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {ASSEMBLY_ROLES,EXIT_ROLES,canQueueOperation} from '../../public/offline-policy.mjs';
test('interface abre montagem do técnico, preenche tarefa e salva sem expor saídas',async()=>{
  const nodes=new Map(),saved=[];
  function node(id){
    if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,options:[],files:[],handlers:{},elements:{},textContent:'',
      get selectedOptions(){return this.options.filter(item=>item.value===this.value);},
      addEventListener(event,fn){this.handlers[event]=fn;},replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';},reset(){},scrollIntoView(){},
    });
    return nodes.get(id);
  }
  const equipment='CeltPlus - 380V',owner='11111111-1111-4111-8111-111111111111';
  const snapshot={owner_id:owner,role:'tecnico',expiresAt:Date.now()+10000,catalog:{products:[],equipments:[equipment],inventory:{tasks:[{id:'task',equipment_name:equipment,quantity:2,technician_id:owner,updated_at:'2026-11-05T12:00:00Z'}],mounted:[],orders:[],technicians:[{id:owner,name:'Montador'}]}}};
  node('assembly-form').elements={quantity:node('quantity'),equipment:node('assembly-equipment')};
  node('exit-form').elements={quantity:node('exit-quantity'),notes:node('exit-notes'),invoice:node('invoice')};
  const source=readFileSync(new URL('../../public/offline-stock-ui.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
  const context=vm.createContext({
    document:{getElementById:node,createElement:()=>({value:'',textContent:''})},
    ASSEMBLY_ROLES,EXIT_ROLES,canQueueOperation,read:()=>snapshot,localStorage:{},listQueue:()=>[],
    enqueue:(storage,current,type,payload,label)=>{saved.push({type,payload,label});},revise(){},putInvoice:async()=>{},deleteInvoice:async()=>{},crypto:{randomUUID},navigator:{onLine:false},Date,Number,Object,
  });
  vm.runInContext(source,context);context.setupStockUI({getSnapshot:()=>snapshot,drawQueue:()=>{},sendPending:async()=>{}});context.renderStockForms(snapshot);
  assert.equal(node('assembly-area').hidden,false);assert.equal(node('exit-area').hidden,true);assert.equal(node('commercial-forms').hidden,true);assert.equal(node('assembly-technician').disabled,true);
  node('assembly-work').value='task';node('assembly-work').handlers.change();
  assert.equal(node('assembly-equipment').value,equipment);assert.equal(node('quantity').value,2);
  node('assembly-form').handlers.submit({preventDefault(){},currentTarget:node('assembly-form')});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.length,1);assert.equal(saved[0].type,'assembly');assert.equal(saved[0].payload.work_id,'task');assert.equal(saved[0].payload.technician_id,owner);
});

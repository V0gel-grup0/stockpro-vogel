import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { saveClientOnDevice } from './offline-client.ts';
import { KEY, TTL, read } from '../../public/offline-data.mjs';
import { listQueue, syncQueue } from '../../public/offline-queue.mjs';
import { validarCadastroPessoa } from './validacao-cadastro.ts';

const actor = { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'vendedor',status:'approved' };
function storage() {
  const values = new Map();
  return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
}
function prepared(store) {
  const now=Date.now();
  store.setItem(KEY,JSON.stringify({identity:'identity',owner_id:actor.id,role:actor.role,savedAt:now,expiresAt:now+TTL,sections:[],catalog:{clients:[],products:[],equipments:[]}}));
}
test('cliente da tela normal persiste no aparelho, reaparece após releitura e sincroniza uma vez',async()=>{
  const store=storage();prepared(store);
  const row=saveClientOnDevice(store,actor,{name:'Maria Silva',phone:'45999123456',proposal_status:'Lead Morno'});
  assert.equal(read(store).owner_id,actor.id);
  assert.equal(listQueue(store,actor.id)[0].operation_id,row.operation_id);
  assert.equal(listQueue(store,actor.id)[0].payload.proposal_status,'Lead Morno');
  let posts=0;
  const fetcher=async url=>url==='/api/auth/profile'?Response.json(actor):(posts++,Response.json({sucesso:true,client:{id:'server'}}));
  await syncQueue(store,actor.id,fetcher);await syncQueue(store,actor.id,fetcher);
  assert.equal(posts,1);assert.equal(listQueue(store,actor.id)[0].state,'sent');
});
test('não salva em cópia expirada, de outra conta ou quando o armazenamento falha',()=>{
  const store=storage();
  assert.throws(()=>saveClientOnDevice(store,actor,{}),/Prepare o Modo offline/);
  prepared(store);
  assert.throws(()=>saveClientOnDevice(store,{...actor,id:'other'},{}),/conta atual/);
  assert.throws(()=>saveClientOnDevice(store,{...actor,role:'tecnico'},{}),/conta atual/);
  assert.throws(()=>saveClientOnDevice(store,{...actor,status:'pending'},{}),/conta atual/);
  const full={...store,setItem(){throw new DOMException('full','QuotaExceededError');}};
  assert.throws(()=>saveClientOnDevice(full,actor,{name:'Maria Silva'}),/campos foram mantidos/);
  assert.equal(listQueue(store,actor.id).length,0);
  const expired=JSON.parse(store.getItem(KEY));expired.savedAt-=TTL;expired.expiresAt-=TTL;store.setItem(KEY,JSON.stringify(expired));
  assert.throws(()=>saveClientOnDevice(store,actor,{}),/Prepare o Modo offline/);
});

// Invoke the real form's save button with isolated React state and no network.
function formFixture({embedded=false,preparedCopy=true,quota=false}={}) {
  const store=storage();if(preparedCopy)prepared(store);
  if(quota)store.setItem=()=>{throw new DOMException('full','QuotaExceededError');};
  const source=readFileSync(new URL('../components/StockProApp.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const form=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='Pessoas');
  const code=ts.transpileModule(form.getText(ast)+'\nmodule.exports=Pessoas;', {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let index=0,network=0,created=0;const states=[];
  const hook=(value,ref=false)=>{const i=index++;if(!(i in states))states[i]=ref?{current:value}:value;return ref?states[i]:[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];};
  const mod={exports:{}};
  const deps={useRef:v=>hook(v,true),useState:v=>hook(v),useEffect(){},validarCadastroPessoa,saveClientOnDevice,localStorage:store,navigator:{onLine:false},fetch:async()=>{network++;throw Error('offline');},PROPOSTA_STATUS:['Lead Frio'],Field:'field',Title:'title',Message:'message',textMatch:()=>true,maskCpfCnpj:x=>x,maskPhone:x=>x};
  new Function('require','module','exports',...Object.keys(deps),code)(createRequire(import.meta.url),mod,mod.exports,...Object.values(deps));
  const render=()=>{index=0;return mod.exports({title:'Clientes',table:'clients',kind:'cliente',profile:actor,search:'',...(embedded?{onCreated:()=>created++}:{})});};
  function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
  const field=label=>find(render(),node=>node.props?.label===label);
  field('Nome').props.onChange('Maria Silva');field('Telefone').props.onChange('45999123456');
  return {store,render,find,save:()=>find(render(),node=>node.type==='button'&&node.props.children==='Salvar cliente').props.onClick(),network:()=>network,created:()=>created,field};
}
for(const embedded of [false,true])test(`botão real salva offline ${embedded?'dentro do pedido':'na tela de clientes'} sem chamar API ou simular cliente confirmado`,async()=>{
  const f=formFixture({embedded});await f.save();
  assert.equal(f.network(),0);assert.equal(f.created(),0);
  assert.equal(listQueue(f.store,actor.id).length,1);
  assert.equal(f.field('Nome').props.value,'');
  assert.match(f.find(f.render(),node=>node.type==='message').props.text,/salvo no aparelho com sucesso/);
});
for(const options of [{preparedCopy:false},{quota:true}])test(`falha offline mantém dados digitados: ${JSON.stringify(options)}`,async()=>{
  const f=formFixture(options);await f.save();
  assert.equal(f.field('Nome').props.value,'Maria Silva');assert.equal(f.network(),0);
  assert.equal(listQueue(f.store,actor.id).length,0);
});

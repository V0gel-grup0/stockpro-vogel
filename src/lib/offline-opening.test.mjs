import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { prepare } from '../../public/offline-data.mjs';
import {canQueueOperation} from '../../public/offline-policy.mjs';
test('abrir cadastro prepara somente clientes, produtos e equipamentos, sem depender de CRM', async () => {
  const map = new Map(); const storage = { getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,value), removeItem: key => map.delete(key) };
  const requests = [];
  const result = await prepare(storage, async url => {
    requests.push(url);
    if (url === '/api/auth/profile') return Response.json({ id:'user', name:'Maria Silva', status:'approved', role:'vendedor' });
    if (url === '/api/clients') return Response.json({ clients:[] });
    if (url === '/api/products') return Response.json({ products:[] });
    if (url === '/api/offline-sync') return Response.json({ equipments:['CeltPlus - 220V'] });
    throw Error('CRM unavailable');
  }, Date.now(), 'write');
  assert.equal(result.owner_id, 'user');
  assert.equal(result.catalog.equipments[0], 'CeltPlus - 220V');
  assert.deepEqual(requests, ['/api/auth/profile','/api/clients','/api/products','/api/offline-sync','/api/auth/profile']);
});
test('botões de novo cliente e pedido preparam e abrem os formulários mesmo com cópia antiga', async () => {
  const elements = new Map(); let target = null; const scopes = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, { hidden:true, value:'', options:[], selectedOptions:[], disabled:false, elements:{unit_price:{value:''}}, handlers:{}, textContent:'',
      addEventListener(name, callback) { this.handlers[name] = callback; }, reset(){}, replaceChildren(...nodes) { this.options = nodes; }, append(){},
      scrollIntoView() { target = id; }, querySelector() { return {focus(){}}; },
    });
    return elements.get(id);
  }
  const snapshot = { owner_id:'user', role:'vendedor', name:'Maria', savedAt:Date.now(), expiresAt:Date.now()+10000, catalog:{clients:[],products:[],equipments:[]},sections:[] };
  const source = readFileSync(new URL('../../public/offline-ui.mjs', import.meta.url),'utf8').replace(/^import .*;$/gm,'');
  vm.runInNewContext(source, {
    KEY:'key', COLUMNS:{}, WRITE_ROLES:['vendedor'], listQueue:()=>[], enqueue(){}, syncQueue:async()=>{}, revise(){}, clear(){}, read:()=>null,
    canQueueOperation,setupStockUI(){},renderStockForms(){},editStockDraft(){return false;},
    validate:async()=>({name:'old snapshot',savedAt:Date.now(),expiresAt:Date.now()+1000,sections:[]}),
    prepare:async (...args)=>{ scopes.push(args[3]); return snapshot; },
    fetch(){},localStorage:{},navigator:{onLine:true,serviceWorker:{register:async()=>{},ready:Promise.resolve()}},
    document:{getElementById:element,createElement:()=>element('generated-'+elements.size)},
    window:{addEventListener(){}},setInterval(){},Date,Number,Object,FormData:class{},
  });
  await new Promise(resolve=>setImmediate(resolve));
  element('new-client').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('write').hidden,false); assert.equal(target,'client-form');
  assert.deepEqual(scopes,['write']);
  element('new-order').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(target,'order-form'); assert.equal(scopes.length,1);
});

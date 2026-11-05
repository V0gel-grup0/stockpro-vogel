import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID, createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parsePushSubscription, cronAuthorized, reminderDay, pushReminderBody, PushInputError } from './push-policy.ts';
import { canAccessCrm } from './crm-access.ts';
const ecdh=createECDH('prime256v1');ecdh.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-device',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
test('aceita provedores de push e rejeita endereços arbitrários e chaves inválidas',()=>{
  assert.deepEqual(parsePushSubscription(subscription),subscription);
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user@web.push.apple.com/a','https://web.push.apple.com:8443/a'])assert.throws(()=>parsePushSubscription({...subscription,endpoint}),PushInputError);
  assert.throws(()=>parsePushSubscription({...subscription,keys:{...subscription.keys,auth:'invalid'}}));
});
test('cron exige segredo correto e o resumo não revela clientes nem valores',()=>{
  assert.equal(cronAuthorized(null,'secret'),false);assert.equal(cronAuthorized('Bearer secret',undefined),false);
  assert.equal(cronAuthorized('Bearer wrong','secret'),false);assert.equal(cronAuthorized('Bearer secret','secret'),true);
  assert.equal(reminderDay(new Date('2026-11-06T02:30:00Z')).day,'2026-11-05');
  assert.equal(reminderDay(new Date('2026-11-06T02:30:00Z')).tomorrow.toISOString(),'2026-11-06T03:00:00.000Z');
  assert.equal(pushReminderBody({commercial:0,internal:0,assembly:0}),null);
  assert.match(pushReminderBody({commercial:2,internal:0,assembly:1}),/2 atividade.*1 montagem/);
});
function compile(path,dependencies){
  const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8');
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const code=ast.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(ast)).join('\n');
  const output=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('module','exports',...Object.keys(dependencies),output)(module,module.exports,...Object.values(dependencies));return module.exports;
}
function fixture(role='representante'){
  const state={active:true,lastDay:null,leased:false,tested:false,sends:[],commercial:[],legacy:[],raw:[],mutations:[],deletedCookie:false,profile:{id:'11111111-1111-4111-8111-111111111111',role,status:'approved',responsible_seller_id:null}};
  const device={endpoint_hash:'device-hash',actor_id:state.profile.id,device_id:'22222222-2222-4222-8222-222222222222',endpoint:subscription.endpoint,...subscription.keys};
  const prisma={
    $executeRawUnsafe:async()=>1,
    $queryRaw:async(parts,...values)=>{
      const sql=parts.join('?');state.raw.push({sql,values});
      if(sql.includes('count(*)'))return [{total:2n}];
      if(sql.includes('WHERE device_id'))return state.active?[device]:[];
      if(sql.includes('ORDER BY'))return state.active?[device]:[];
      if(sql.includes('SELECT endpoint_hash'))return state.active?[device]:[];
      throw Error('Unexpected query: '+sql);
    },
    $executeRaw:async(parts,...values)=>{
      const sql=parts.join('?');
      state.mutations.push({sql,values});
      if(sql.includes("lease_until=now()+interval")){if(!state.active||state.leased||state.lastDay===values[2])return 0;state.leased=true;return 1;}
      if(sql.includes('last_sent_day=')){state.lastDay=values[0];state.leased=false;return 1;}
      if(sql.includes('last_test_at=now()')){if(state.tested)return 0;state.tested=true;return 1;}
      if(sql.includes('DELETE')){state.active=false;return 1;}
      if(sql.includes('lease_until=NULL')){state.leased=false;return 1;}
      return 1;
    },
    profiles:{findUnique:async()=>state.profile},
    crm_opportunities:{count:async query=>{state.commercial.push(query);return 3;}},
    crm_tasks:{count:async query=>{state.legacy.push(query);return 1;}},
  };
  const api=compile('src/lib/push-server.ts',{
    createHash,randomUUID,prisma,canAccessCrm,parsePushSubscription,reminderDay,pushReminderBody,
    cookies:async()=>({get:()=>({value:device.device_id}),set(){},delete(){state.deletedCookie=true;}}),
    webpush:{sendNotification:async(sub,payload,options)=>{state.sends.push({sub,payload:JSON.parse(payload),options});}},
    buildOpportunityVisibilityWhere:actor=>['administrador','gerente'].includes(actor.role)?undefined:{OR:[{created_by:actor.id},{responsible_id:actor.id}]},
    canProfileUseSystem:async()=>true,ensureAssemblyWorkTable:async()=>{},ensureGeneralCrmTable:async()=>{},
  });
  return {api,state,device};
}
test('representante recebe apenas comercial e montador apenas montagens e geral interno',async()=>{
  const rep=fixture();const counts=await rep.api.reminderCounts(rep.state.profile,new Date('2026-11-05T12:00:00Z'));
  assert.deepEqual(counts,{commercial:3,internal:0,assembly:0});assert.equal(rep.state.legacy.length,0);assert.equal(rep.state.raw.length,0);
  assert.deepEqual(rep.state.commercial[0].where.OR,[{created_by:rep.device.actor_id},{responsible_id:rep.device.actor_id}]);
  const tech=fixture('tecnico');const own=await tech.api.reminderCounts(tech.state.profile);
  assert.deepEqual(own,{commercial:0,internal:3,assembly:2});assert.equal(tech.state.commercial.length,0);
  const assembly=tech.state.raw.find(row=>row.sql.includes('crm_assembly_work'));
  assert.deepEqual(assembly.values,[false,tech.device.actor_id]);
  const general=tech.state.raw.find(row=>row.sql.includes('crm_general_demands'));
  assert.equal(general.values[1],false);assert.equal(general.values[2],tech.device.actor_id);
});
test('resumo diário usa permissão atual e não repete envio na mesma data',async()=>{
  const f=fixture();const now=new Date('2026-11-05T12:00:00Z');
  assert.equal((await f.api.dispatchDailyPush(now)).sent,1);
  assert.equal((await f.api.dispatchDailyPush(now)).sent,0);
  assert.equal(f.state.sends.length,1);assert.equal(f.state.sends[0].payload.title,'StockPro Vogel');
  assert.ok(!('client' in f.state.sends[0].payload));
  const blocked=fixture();blocked.state.profile.status='rejected';
  assert.equal((await blocked.api.dispatchDailyPush(now)).sent,0);assert.equal(blocked.state.sends.length,0);
});
test('teste limitado por aparelho e logout remove a inscrição',async()=>{
  const f=fixture();const sent=await f.api.sendPushTest(f.device.actor_id);assert.equal(sent.status,200);
  assert.match(sent.testId,/^[0-9a-f-]{36}$/);assert.equal(f.state.sends[0].payload.testId,sent.testId);
  assert.equal((await f.api.sendPushTest(f.device.actor_id)).status,429);
  await f.api.detachPushDevice();assert.equal(f.state.active,false);assert.equal(f.state.deletedCookie,true);
  assert.equal((await f.api.sendPushTest(f.device.actor_id)).status,404);
});
test('recibo aceita somente token válido e estado conhecido, limitado ao teste recente',async()=>{
  const f=fixture();await f.api.acknowledgePushTest('invalid','displayed');await f.api.acknowledgePushTest(randomUUID(),'arbitrary');
  assert.equal(f.state.mutations.length,0);
  const id=randomUUID();await f.api.acknowledgePushTest(id,'displayed');
  assert.equal(f.state.mutations.length,1);assert.deepEqual(f.state.mutations[0].values,['displayed',id]);
  assert.match(f.state.mutations[0].sql,/5 minutes/);
});
test('worker confirma recebimento e exibição, e reporta bloqueio sem tratar como sucesso',async()=>{
  for(const blocked of [false,true]){
    const handlers={},states=[];let wait;
    vm.runInNewContext(readFileSync(new URL('../../public/stockpro-sw.js',import.meta.url),'utf8'),{
      self:{addEventListener:(name,callback)=>handlers[name]=callback,registration:{showNotification:async()=>{if(blocked)throw Error('blocked');}}},
      fetch:async(url,options)=>{assert.equal(url,'/api/push/receipt');states.push(JSON.parse(options.body).state);return new Response(null,{status:204});},
    });
    handlers.push({data:{json:()=>({body:'Test',testId:randomUUID()})},waitUntil:promise=>wait=promise});await wait;
    assert.deepEqual(states,['received',blocked?'failed':'displayed']);
  }
});
test('endpoint de cron rejeita solicitações sem autorização antes de acessar envio',async()=>{
  let calls=0;const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only';
  try{
    const route=compile('app/api/cron/push-reminders/route.ts',{NextResponse:{json:Response.json},cronAuthorized,pushConfigured:()=>true,dispatchDailyPush:async()=>{calls++;return{sent:0};}});
    assert.equal((await route.GET(new Request('https://test/api/cron/push-reminders'))).status,401);assert.equal(calls,0);
    assert.equal((await route.GET(new Request('https://test/api/cron/push-reminders',{headers:{authorization:'Bearer test-only'}}))).status,200);assert.equal(calls,1);
  }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
test('service worker mostra aviso e mantém destino interno mesmo com URL externa no payload',async()=>{
  const handlers={},shown=[];let wait;
  vm.runInNewContext(readFileSync(new URL('../../public/stockpro-sw.js',import.meta.url),'utf8'),{
    self:{addEventListener:(name,callback)=>handlers[name]=callback,location:{origin:'https://stock.test'},registration:{showNotification:async(title,options)=>shown.push({title,options})}},URL,
  });
  handlers.push({data:{json:()=>({body:'Teste',url:'https://evil.test'})},waitUntil:promise=>wait=promise});await wait;
  assert.equal(shown[0].options.body,'Teste');assert.equal(shown[0].options.data.url,'/notificacoes');
});

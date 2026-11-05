import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function client(navigator,MessageChannel,timer=setTimeout){
  const output=ts.transpileModule(readFileSync(new URL('./push-client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('module','exports','navigator','MessageChannel','setTimeout','clearTimeout',output)(module,module.exports,navigator,MessageChannel,timer,clearTimeout);
  return module.exports;
}
class Channel{
  constructor(){this.port1={close(){},onmessage:null};this.port2={close(){},send:value=>this.port1.onmessage?.({data:value})};}
}
test('aguarda atualização e confirmação do novo worker em vez de usar o antigo',async()=>{
  const handlers={};let activated=false;
  const installing={state:'installing',addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:()=>{}};
  const old={postMessage(){throw Error('Old worker must not be used');}};
  const fresh={postMessage(data,ports){assert.equal(activated,true);assert.equal(data.type,'stockpro-push-ping');ports[0].send({type:'stockpro-push-ready'});}};
  const registration={active:old,installing,update:async()=>{setImmediate(()=>{activated=true;registration.active=fresh;installing.state='activated';handlers.statechange?.();});}};
  const api=client({serviceWorker:{register:async(path,options)=>{assert.equal(path,'/stockpro-sw.js');assert.equal(options.updateViaCache,'none');return registration;}}},Channel);
  assert.equal(await api.ensurePushWorker(),registration);
});
test('worker sem suporte não é apresentado como pronto para testar',async()=>{
  const registration={active:{postMessage(){}},installing:null,waiting:null,update:async()=>{}};
  const api=client({serviceWorker:{register:async()=>registration}},Channel,fn=>setTimeout(fn,5));
  await assert.rejects(api.ensurePushWorker(),/versão antiga/);
});

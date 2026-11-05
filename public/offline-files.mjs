function database(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Este navegador não permite guardar NF offline.'));return;}
    const request=indexedDB.open('stockpro-offline-files-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('invoices',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Não foi possível abrir o armazenamento de NF neste aparelho.'));
  });
}
async function run(owner,id,mode,action){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('invoices',mode),store=tx.objectStore('invoices');let result;
    const request=action(store,`${owner}:${id}`);
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível guardar ou ler a NF. Confira o espaço disponível no aparelho.'));
  });}finally{db.close();}
}
export async function putInvoice(owner,id,file){
  if(!file||!file.size||file.size>3000000)throw new Error('Selecione uma NF de até 3 MB.');
  if(!/\.(pdf|xml|png|jpe?g)$/i.test(file.name))throw new Error('Envie NF em PDF, XML, JPG ou PNG.');
  await run(owner,id,'readwrite',(store,key)=>store.put({key,name:file.name,type:file.type,blob:file,size:file.size}));
}
export const getInvoice=(owner,id)=>run(owner,id,'readonly',(store,key)=>store.get(key));
export const deleteInvoice=(owner,id)=>run(owner,id,'readwrite',(store,key)=>store.delete(key));

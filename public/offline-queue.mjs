const PREFIX = 'stockpro-pending-v1:';
import { OFFLINE_ROLES, canQueueOperation } from './offline-policy.mjs';
import { getInvoice, deleteInvoice } from './offline-files.mjs';
export const WRITE_ROLES = OFFLINE_ROLES;
const key = (owner, id) => `${PREFIX}${owner}:${id}`;
export function listQueue(storage, owner) {
  if (!owner) return [];
  const rows = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (!name?.startsWith(`${PREFIX}${owner}:`)) continue;
    try { const row = JSON.parse(storage.getItem(name)); if (row.owner_id === owner) rows.push(row); } catch {}
  }
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export function enqueue(storage, snapshot, type, payload, label, id = crypto.randomUUID()) {
  if (!snapshot?.owner_id || !canQueueOperation(snapshot.role,type) || Date.now() >= snapshot.expiresAt) throw new Error('Prepare os dados com sua conta e confira a permissão antes de salvar offline.');
  const row = { operation_id: id, owner_id: snapshot.owner_id, type, payload, label, created_at: new Date().toISOString(), state: 'pending', error: '' };
  if (storage.getItem(key(row.owner_id, id))) throw new Error('Este rascunho já foi salvo.');
  storage.setItem(key(row.owner_id, id), JSON.stringify(row));
  return row;
}
export async function syncQueue(storage, owner, fetcher = fetch, changed = () => {}, files={getInvoice,deleteInvoice}) {
  if (globalThis.navigator?.locks) return navigator.locks.request(`stockpro-sync-${owner}`, () => syncUnlocked(storage, owner, fetcher, changed,files));
  return syncUnlocked(storage, owner, fetcher, changed,files);
}
async function syncUnlocked(storage, owner, fetcher, changed,files) {
  const profileResponse = await fetcher('/api/auth/profile', { cache: 'no-store' });
  if (!profileResponse.ok) throw new Error('Entre novamente na mesma conta para enviar os pendentes.');
  const actor = await profileResponse.json();
  if (actor.id !== owner || !WRITE_ROLES.includes(actor.role)) throw new Error('Use a conta que criou estes registros e confira sua permissão.');
  const rank={client:0,order:1,assembly:2,order_exit:3,product_exit:3};
  const rows = listQueue(storage, owner).sort((a, b) => (rank[a.type]??9) - (rank[b.type]??9));
  for (const row of rows) {
    if (row.state === 'sent') continue;
    if(!canQueueOperation(actor.role,row.type)){row.error='Sua conta não tem mais permissão para esta operação.';row.errorStatus=403;storage.setItem(key(owner,row.operation_id),JSON.stringify(row));changed();continue;}
    if (row.payload.client_operation_id) {
      const parent = listQueue(storage, owner).find(item => item.operation_id === row.payload.client_operation_id);
      if (parent?.state !== 'sent') continue;
    }
    if(row.payload.order_operation_id){const parent=listQueue(storage,owner).find(item=>item.operation_id===row.payload.order_operation_id);if(parent?.state!=='sent')continue;}
    let response;
    try {
      const payload=JSON.stringify({ operation_id: row.operation_id, owner_id: owner, type: row.type, payload: row.payload });
      let options={method:'POST',headers:{'Content-Type':'application/json'},body:payload};
      if(row.payload.invoice_file){
        const file=await files.getInvoice(owner,row.payload.invoice_file);
        if(!file){row.error='NF não encontrada neste aparelho. Confira o anexo antes de enviar.';row.errorStatus=400;storage.setItem(key(owner,row.operation_id),JSON.stringify(row));changed();continue;}
        const form=new FormData();form.append('payload',payload);form.append('invoice',file.blob,file.name);options={method:'POST',body:form};
      }
      response = await fetcher('/api/offline-sync', options);
    } catch { throw new Error('Conexão interrompida. Os pendentes foram preservados. Tente enviar novamente.'); }
    const result = await response.json();
    if (response.status === 401) throw new Error('Sua sessão expirou. Entre na mesma conta para continuar o envio.');
    if (!response.ok || !result.sucesso) {
      row.error = result.erro || 'Não foi possível enviar.';
      row.errorStatus = response.status;
      storage.setItem(key(owner, row.operation_id), JSON.stringify(row)); changed();
      if (response.status >= 500 || response.status === 403) throw new Error(row.error);
      continue;
    }
    row.state = 'sent'; row.error = ''; row.result = result;
    storage.setItem(key(owner, row.operation_id), JSON.stringify(row)); changed();
    if(row.payload.invoice_file)try{await files.deleteInvoice(owner,row.payload.invoice_file);}catch{}
  }
}
export function revise(storage, snapshot, id, payload, label) {
  if (!snapshot?.owner_id || Date.now() >= snapshot.expiresAt) throw new Error('Prepare os dados novamente.');
  const name = key(snapshot.owner_id, id);
  const row = JSON.parse(storage.getItem(name) || 'null');
  if (!row || row.state === 'sent' || ![400,409].includes(row.errorStatus) || !canQueueOperation(snapshot.role,row.type)) throw new Error('Este registro precisa de confirmação do envio antes de ser alterado.');
  Object.assign(row, { payload, label, error: '', errorStatus: null });
  storage.setItem(name, JSON.stringify(row));
  return row;
}

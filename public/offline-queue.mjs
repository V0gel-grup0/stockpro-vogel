const PREFIX = 'stockpro-pending-v1:';
export const WRITE_ROLES = ['administrador', 'gerente', 'vendedor', 'funcionario', 'representante'];
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
  if (!snapshot?.owner_id || !WRITE_ROLES.includes(snapshot.role) || Date.now() >= snapshot.expiresAt) throw new Error('Prepare os dados com sua conta antes de cadastrar offline.');
  const row = { operation_id: id, owner_id: snapshot.owner_id, type, payload, label, created_at: new Date().toISOString(), state: 'pending', error: '' };
  if (storage.getItem(key(row.owner_id, id))) throw new Error('Este rascunho já foi salvo.');
  storage.setItem(key(row.owner_id, id), JSON.stringify(row));
  return row;
}
export async function syncQueue(storage, owner, fetcher = fetch, changed = () => {}) {
  if (globalThis.navigator?.locks) return navigator.locks.request(`stockpro-sync-${owner}`, () => syncUnlocked(storage, owner, fetcher, changed));
  return syncUnlocked(storage, owner, fetcher, changed);
}
async function syncUnlocked(storage, owner, fetcher, changed) {
  const profileResponse = await fetcher('/api/auth/profile', { cache: 'no-store' });
  if (!profileResponse.ok) throw new Error('Entre novamente na mesma conta para enviar os pendentes.');
  const actor = await profileResponse.json();
  if (actor.id !== owner || !WRITE_ROLES.includes(actor.role)) throw new Error('Use a conta que criou estes registros e confira sua permissão.');
  const rows = listQueue(storage, owner).sort((a, b) => (a.type === 'client' ? 0 : 1) - (b.type === 'client' ? 0 : 1));
  for (const row of rows) {
    if (row.state === 'sent') continue;
    if (row.payload.client_operation_id) {
      const parent = listQueue(storage, owner).find(item => item.operation_id === row.payload.client_operation_id);
      if (parent?.state !== 'sent') continue;
    }
    let response;
    try {
      response = await fetcher('/api/offline-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation_id: row.operation_id, owner_id: owner, type: row.type, payload: row.payload }) });
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
  }
}
export function revise(storage, snapshot, id, payload, label) {
  if (!snapshot?.owner_id || Date.now() >= snapshot.expiresAt) throw new Error('Prepare os dados novamente.');
  const name = key(snapshot.owner_id, id);
  const row = JSON.parse(storage.getItem(name) || 'null');
  if (!row || row.state === 'sent' || row.errorStatus !== 400) throw new Error('Este registro precisa de confirmação do envio antes de ser alterado.');
  Object.assign(row, { payload, label, error: '', errorStatus: null });
  storage.setItem(name, JSON.stringify(row));
  return row;
}

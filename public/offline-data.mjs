export const KEY = 'stockpro-offline-v1';
export const EPOCH = 'stockpro-offline-epoch';
export const TTL = 8 * 60 * 60 * 1000;
export const MODULES = [
  ['Clientes', '/api/clients', 'clients'],
  ['Produtos', '/api/products', 'products'],
  ['Pedidos', '/api/orders', 'orders'],
  ['Montagens', '/api/crm/assembly-work', 'items'],
  ['CRM comercial', '/api/crm/opportunities', 'opportunities'],
  ['CRM geral', '/api/crm/general-demands', 'demands'],
];
export const COLUMNS = {
  name: 'Nome', title: 'Título', document: 'Documento', phone: 'Telefone', city: 'Cidade',
  equipment: 'Equipamento', product_name: 'Produto', client_name: 'Cliente', quantity: 'Quantidade',
  stock: 'Estoque', voltage: 'Voltagem', status: 'Situação', stage: 'Etapa', priority: 'Prioridade',
  responsible_name: 'Responsável', due_at: 'Prazo', created_at: 'Data', total_value: 'Valor total',
  unit_price: 'Valor unitário', notes: 'Observações', description: 'Descrição', order_number: 'Pedido',
  equipment_name: 'Equipamento', technician_name: 'Montador', due_date: 'Prazo', sku: 'Código', category: 'Categoria', sale_price: 'Preço de venda', min_stock: 'Estoque mínimo',
};
export function identity(profile) {
  const canonical = value => value && typeof value === 'object' ? (Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
  return JSON.stringify(canonical(profile));
}
export function clear(storage) {
  storage.removeItem(KEY);
  storage.setItem(EPOCH, `${Date.now()}-${Math.random()}`);
}
export function read(storage, now = Date.now()) {
  try {
    const snapshot = JSON.parse(storage.getItem(KEY) || 'null');
    if (!snapshot) return null;
    if (!snapshot.identity || !Array.isArray(snapshot.sections) || !Number.isFinite(snapshot.savedAt) || !Number.isFinite(snapshot.expiresAt) || now < snapshot.savedAt || now >= snapshot.expiresAt || snapshot.expiresAt - snapshot.savedAt !== TTL) { clear(storage); return null; }
    return snapshot;
  } catch { clear(storage); return null; }
}
async function profile(fetcher) {
  const response = await fetcher('/api/auth/profile', { cache: 'no-store' });
  if (!response.ok) throw new Error('Conecte-se e entre na sua conta para preparar a consulta offline.');
  const value = await response.json();
  if (!value.id || value.status !== 'approved') throw new Error('Acesso indisponível. Entre novamente.');
  return value;
}
export async function prepare(storage, fetcher = fetch, now = Date.now()) {
  clear(storage);
  const epoch = storage.getItem(EPOCH);
  const account = await profile(fetcher);
  const sections = [];
  const catalog = { clients: [], products: [], equipments: [] };
  for (const [name, url, key] of MODULES) {
    const response = await fetcher(url, { cache: 'no-store' });
    if (response.status === 403) continue;
    if (!response.ok) throw new Error(`Não foi possível preparar ${name}. Tente novamente com internet.`);
    const result = await response.json();
    if (result.sucesso === false || !Array.isArray(result[key])) throw new Error(`Resposta inválida em ${name}.`);
    if (key === 'clients') catalog.clients = result[key].map(row => ({ id: row.id, name: row.name, document: row.document }));
    if (key === 'products') catalog.products = result[key].map(row => ({ id: row.id, name: row.name, sale_price: row.sale_price }));
    const rows = result[key].map(row => {
      const source = { ...row, client_name: row.client_name || row.client?.name || row.clients?.name, product_name: row.product_name || row.product?.name || row.products?.name };
      return Object.fromEntries(Object.keys(COLUMNS).filter(field => source[field] !== null && source[field] !== undefined && typeof source[field] !== 'object').map(field => [field, String(source[field])]));
    });
    sections.push({ name, rows });
  }
  const metadata = await fetcher('/api/offline-sync', { cache: 'no-store' });
  if (metadata.ok) catalog.equipments = (await metadata.json()).equipments || [];
  else if (metadata.status !== 403) throw new Error('Não foi possível preparar os equipamentos.');
  const confirmed = await profile(fetcher);
  if (storage.getItem(EPOCH) !== epoch || identity(account) !== identity(confirmed)) throw new Error('A conta ou o acesso mudou durante a preparação. Tente novamente.');
  const snapshot = { identity: identity(account), owner_id: account.id, role: account.role, catalog, name: account.name, savedAt: now, expiresAt: now + TTL, sections };
  storage.setItem(KEY, JSON.stringify(snapshot));
  return snapshot;
}
export async function validate(storage, fetcher = fetch) {
  const snapshot = read(storage);
  if (!snapshot) return null;
  const epoch = storage.getItem(EPOCH);
  let response;
  try { response = await fetcher('/api/auth/profile', { cache: 'no-store' }); }
  catch { return storage.getItem(EPOCH) === epoch ? read(storage) : null; }
  if (storage.getItem(EPOCH) !== epoch) return null;
  if (!response.ok) { clear(storage); return null; }
  if (identity(await response.json()) !== snapshot.identity) { clear(storage); return null; }
  return snapshot;
}

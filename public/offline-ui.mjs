import { KEY, COLUMNS, clear, prepare, read, validate } from './offline-data.mjs';
import { WRITE_ROLES, listQueue, enqueue, syncQueue, revise } from './offline-queue.mjs';
import { canQueueOperation } from './offline-policy.mjs';
import { setupStockUI, renderStockForms, editStockDraft } from './offline-stock-ui.mjs';
const $ = id => document.getElementById(id);
let snapshot = null;
let busy = false;
let editing = null;
async function openForm(type) {
  if (busy) return;
  busy = true;
  $('new-client').disabled = true; $('new-order').disabled = true;
  try {
    const inventory=['assembly','order_exit'].includes(type);
    if (!snapshot?.catalog || !snapshot?.owner_id || (inventory&&!snapshot.catalog.inventory)) {
      if (!navigator.onLine) throw new Error('Conecte-se uma vez e entre na sua conta para liberar os formulários neste aparelho. Depois você poderá usar sem internet.');
      $('status').textContent = 'Abrindo formulário e preparando clientes e produtos…';
      await ready;
      show(await prepare(localStorage, fetch, Date.now(), inventory?'inventory':'write'));
    }
    if (!canQueueOperation(snapshot?.role,type)) throw new Error('Sua conta não tem permissão para esta operação.');
    const form = $(({client:'client-form',order:'order-form',assembly:'assembly-form',order_exit:'exit-form'})[type]);
    $('status').textContent = 'Formulário aberto. Preencha os campos abaixo para salvar no aparelho.';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('input, select')?.focus({ preventScroll: true });
  } catch (error) { $('status').textContent = error.message || 'Não foi possível abrir o formulário.'; $('login-link').hidden = false; }
  finally { busy = false; $('new-client').disabled = false; $('new-order').disabled = false; }
}
$('new-client').addEventListener('click', () => void openForm('client'));
$('new-order').addEventListener('click', () => void openForm('order'));
$('new-assembly').addEventListener('click',()=>void openForm('assembly'));
$('new-exit').addEventListener('click',()=>void openForm('order_exit'));
function cell(tag, value) { const el = document.createElement(tag); el.textContent = value; return el; }
function draw() {
  const section = snapshot?.sections[Number($('module').value) || 0];
  const term = $('search').value.toLocaleLowerCase('pt-BR');
  const rows = (section?.rows || []).filter(row => Object.values(row).some(value => value.toLocaleLowerCase('pt-BR').includes(term)));
  const columns = Object.keys(COLUMNS).filter(key => rows.some(row => key in row));
  const header = document.createElement('tr'); columns.forEach(key => header.append(cell('th', COLUMNS[key])));
  $('head').replaceChildren(header);
  $('rows').replaceChildren(...rows.map(row => { const tr = document.createElement('tr'); columns.forEach(key => tr.append(cell('td', row[key] || '—'))); return tr; }));
  $('count').textContent = `${rows.length} registro(s) · dados da última atualização`;
  $('empty').hidden = rows.length > 0;
}
function show(value) {
  if (snapshot?.owner_id !== value?.owner_id) {
    $('client-form').reset(); $('order-form').reset(); editing = null; $('queue-status').textContent = '';
  }
  snapshot = value;
  $('write-help').textContent = 'Use os botões acima para abrir as operações disponíveis para seu perfil. Os registros ficam pendentes no aparelho até a confirmação do envio.';
  $('login-link').hidden = !!value;
  $('content').hidden = !value;
  $('details').textContent = value ? `${value.name || 'Sua conta'} · Atualizado em ${new Date(value.savedAt).toLocaleString('pt-BR')} · Disponível até ${new Date(value.expiresAt).toLocaleTimeString('pt-BR')}` : 'Nenhuma cópia válida neste aparelho. Conecte-se, entre na sua conta e prepare os dados.';
  $('module').replaceChildren(...(value?.sections || []).map((section, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = section.name; return option; }));
  draw();
  drawQueue();
}
$('module').addEventListener('change', draw);
$('search').addEventListener('input', draw);
$('clear').addEventListener('click', () => { clear(localStorage); show(null); $('status').textContent = 'Cópia offline apagada deste aparelho.'; });
$('prepare').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('prepare').disabled = true; show(null); $('status').textContent = 'Preparando dados autorizados para sua conta…';
  try { await ready; show(await prepare(localStorage)); $('status').textContent = 'Modo offline preparado com as operações permitidas para sua conta.'; if (navigator.onLine) void sendPending(); }
  catch (error) { show(read(localStorage)); $('status').textContent = error.message || 'Não foi possível salvar neste aparelho.'; }
  finally { busy = false; $('prepare').disabled = !navigator.onLine; }
});
const ready = 'serviceWorker' in navigator ? navigator.serviceWorker.register('/stockpro-sw.js',{updateViaCache:'none'}).then(async registration => {
  if(navigator.onLine&&registration?.update)await registration.update();
  const worker=registration?.installing||registration?.waiting;
  if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('A preparação do app demorou. Reabra com internet e tente novamente.')),20000);
    const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
    const changed=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('O app está atualizando. Reabra esta tela para continuar.'));};
    worker.addEventListener('statechange',changed);changed();
  });
  return navigator.serviceWorker.ready;
}) : Promise.reject(new Error('Este navegador não oferece consulta offline.'));
ready.catch(error => { $('status').textContent = error.message; $('prepare').disabled = true; });
async function refresh() {
  try { show(await validate(localStorage)); $('status').textContent = navigator.onLine ? 'Conectado · consulte ou atualize sua cópia.' : 'Sem internet · mostrando somente dados salvos.'; }
  catch { show(null); $('status').textContent = 'Armazenamento indisponível neste navegador.'; }
  $('prepare').disabled = !navigator.onLine || busy;
  if (navigator.onLine && snapshot?.owner_id) void sendPending();
}
window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
window.addEventListener('storage', event => { if (event.key === KEY) { show(null); void refresh(); } else if (event.key?.startsWith('stockpro-pending-v1:') && snapshot) drawQueue(); });
setInterval(() => { if (snapshot && !read(localStorage)) { show(null); $('status').textContent = 'A cópia expirou. Conecte-se para atualizar.'; } }, 30000);
void refresh();
function option(value, label) { const el = cell('option', label); el.value = value; return el; }
function drawQueue() {
  renderStockForms(snapshot);
  const allowed = snapshot?.catalog && WRITE_ROLES.includes(snapshot.role);
  $('write').hidden = !allowed;
  if (!allowed) return;
  const rows = listQueue(localStorage, snapshot.owner_id);
  const chosen = $('order-client').value;
  $('order-client').replaceChildren(option('', 'Selecione o cliente'),
    ...snapshot.catalog.clients.map(row => option(row.id, `${row.name}${row.document ? ' · ' + row.document : ''}`)),
    ...rows.filter(row => row.type === 'client').map(row => option('local:' + row.operation_id, `${row.payload.name} · ${row.state === 'sent' ? 'enviado' : 'cliente offline'}`)));
  if ([...$('order-client').options].some(item => item.value === chosen)) $('order-client').value = chosen;
  $('queue').replaceChildren(...rows.map(row => {
    const li = document.createElement('li');
    const sent = row.result?.order?.order_number ? `Enviado · Pedido #${row.result.order.order_number}` : 'Enviado';
    li.textContent = `${row.label} — ${row.state === 'sent' ? sent : 'Pendente de envio'}${row.error ? ' · ' + row.error : ''}`;
    if (row.state !== 'sent' && [400,409].includes(row.errorStatus)) {
      const button = cell('button', 'Corrigir dados'); button.type = 'button';
      button.addEventListener('click', () => {
        if(editStockDraft(row))return;
        editing = row;
        const form = $(row.type === 'client' ? 'client-form' : 'order-form');
        for (const [name, value] of Object.entries(row.payload)) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
        if (row.type === 'order') {
          $('order-client').value = row.payload.client_operation_id ? 'local:' + row.payload.client_operation_id : row.payload.client_id;
          fillItems(false); $('order-item').value = row.payload.item_type === 'equipamento' ? row.payload.equipment_name : row.payload.item_id; updateTotal();
        }
        $('queue-status').textContent = 'Corrigindo o registro rejeitado. Ajuste os campos e salve novamente.';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.append(document.createTextNode(' '), button);
    }
    return li;
  }));
  if (!rows.length) $('queue').append(cell('li', 'Nenhum registro offline salvo nesta conta.'));
  fillItems(false);
}
function fillItems(resetPrice = true) {
  const type = $('order-type').value;
  const chosen = $('order-item').value;
  const items = type === 'equipamento' ? snapshot?.catalog?.equipments.map(name => option(name, name)) : snapshot?.catalog?.products.map(row => option(row.id, row.name));
  $('order-item').replaceChildren(option('', 'Selecione o item'), ...(items || []));
  if (!resetPrice && [...$('order-item').options].some(item => item.value === chosen)) $('order-item').value = chosen;
  if (resetPrice) $('order-form').elements.unit_price.value = '';
}
function saveDraft(type, payload, label) {
  const current = read(localStorage);
  if (!current || current.owner_id !== snapshot?.owner_id) throw new Error('A conta mudou. Prepare os dados novamente antes de salvar.');
  const row = editing?.type === type ? revise(localStorage, current, editing.operation_id, payload, label) : enqueue(localStorage, current, type, payload, label);
  if (editing?.type === type) editing = null;
  return row;
}
$('order-type').addEventListener('change', () => fillItems());
$('order-item').addEventListener('change', () => {
  if ($('order-type').value === 'produto') {
    const product = snapshot.catalog.products.find(row => row.id === $('order-item').value);
    $('order-form').elements.unit_price.value = product?.sale_price ?? '';
  }
  updateTotal();
});
function amounts(form) {
  const quantity = Number(form.quantity), price = Number(form.unit_price), freight = Number(form.shipping_value || 0), discount = Number(form.discount_value || 0);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2147483647 || !Number.isFinite(price) || price < 0 || !Number.isFinite(freight) || freight < 0 || !Number.isFinite(discount) || discount < 0 || form.unit_price === '') throw new Error('Informe quantidade e valores válidos.');
  const subtotal = quantity * Math.round((price + Number.EPSILON) * 100);
  const discountCents = Math.round((discount + Number.EPSILON) * 100);
  if (discountCents > subtotal) throw new Error('Desconto não pode superar o subtotal dos itens.');
  const total = subtotal - discountCents + Math.round((freight + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(total)) throw new Error('Valor acima do limite.');
  return { quantity, unit_price: price, discount_value: discountCents / 100, shipping_value: freight, total: total / 100 };
}
function updateTotal() {
  try { const value = amounts(Object.fromEntries(new FormData($('order-form')))); $('order-total').textContent = `Total com frete: ${value.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`; }
  catch (error) { $('order-total').textContent = error.message; }
}
$('order-form').addEventListener('input', updateTotal);
$('client-form').addEventListener('submit', event => {
  event.preventDefault();
  $('client-status').textContent = '';
  try {
    const data = Object.fromEntries(new FormData(event.target));
    data.phone = data.phone.replace(/\D/g, ''); data.document = data.document.replace(/\D/g, '');
    if (!/^.{3,}$/.test(data.name.trim()) || (data.document.length !== 14 && data.name.trim().split(/\s+/).length < 2)) throw new Error('Informe o nome completo ou a razão social.');
    if (!/^\d{10,11}$/.test(data.phone)) throw new Error('Informe telefone com DDD.');
    const row = saveDraft('client', data, `Cliente: ${data.name}`);
    event.target.reset(); drawQueue(); $('order-client').value = 'local:' + row.operation_id;
    $('queue-status').textContent = 'Cliente salvo no aparelho, pendente de envio. Já pode ser selecionado no pedido.';
    $('client-status').textContent = $('queue-status').textContent;
    if (navigator.onLine) void sendPending();
  } catch (error) { $('client-status').textContent = error.message; $('queue-status').textContent = error.message; }
});
$('order-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    if (!data.client || !data.item) throw new Error('Selecione cliente e item.');
    const values = amounts(data);
    const payload = { ...values, item_type: data.item_type, notes: data.notes,
      ...(data.client.startsWith('local:') ? { client_operation_id: data.client.slice(6) } : { client_id: data.client }),
      ...(data.item_type === 'equipamento' ? { equipment_name: data.item } : { item_id: data.item }) };
    const itemName = $('order-item').selectedOptions[0].textContent;
    saveDraft('order', payload, `Pedido: ${values.quantity} × ${itemName} · ${values.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    event.target.reset(); drawQueue(); updateTotal();
    $('queue-status').textContent = 'Pedido salvo no aparelho. Pendente de envio; ainda não foi registrado no CRM.';
    if (navigator.onLine) void sendPending();
  } catch (error) { $('queue-status').textContent = error.message; }
});
let sending = false;
async function sendPending() {
  if (sending || !snapshot?.owner_id) return;
  sending = true; $('sync').disabled = true;
  const owner = snapshot.owner_id;
  $('queue-status').textContent = 'Enviando pendentes…';
  try {
    await syncQueue(localStorage, owner, fetch, () => { if (snapshot?.owner_id === owner) drawQueue(); });
    if (snapshot?.owner_id === owner) {
      drawQueue();
      const pending = listQueue(localStorage, owner).filter(row => row.state !== 'sent').length;
      $('queue-status').textContent = pending ? `${pending} registro(s) continuam pendentes. Confira os avisos na lista.` : 'Envio concluído. Clientes e pedidos estão registrados no sistema.';
    }
  } catch (error) { if (snapshot?.owner_id === owner) $('queue-status').textContent = error.message; }
  finally { sending = false; $('sync').disabled = false; }
}
$('sync').addEventListener('click', () => void sendPending());
window.addEventListener('online', () => void sendPending());
window.addEventListener('stockpro-queue-updated', () => { if (snapshot) drawQueue(); });
setupStockUI({getSnapshot:()=>snapshot,drawQueue,sendPending});

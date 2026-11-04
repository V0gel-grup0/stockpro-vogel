import { KEY, COLUMNS, clear, prepare, read, validate } from './offline-data.mjs';
const $ = id => document.getElementById(id);
let snapshot = null;
let busy = false;
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
  snapshot = value;
  $('content').hidden = !value;
  $('details').textContent = value ? `${value.name || 'Sua conta'} · Atualizado em ${new Date(value.savedAt).toLocaleString('pt-BR')} · Disponível até ${new Date(value.expiresAt).toLocaleTimeString('pt-BR')}` : 'Nenhuma cópia válida neste aparelho. Conecte-se, entre na sua conta e prepare os dados.';
  $('module').replaceChildren(...(value?.sections || []).map((section, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = section.name; return option; }));
  draw();
}
$('module').addEventListener('change', draw);
$('search').addEventListener('input', draw);
$('clear').addEventListener('click', () => { clear(localStorage); show(null); $('status').textContent = 'Cópia offline apagada deste aparelho.'; });
$('prepare').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('prepare').disabled = true; show(null); $('status').textContent = 'Preparando dados autorizados para sua conta…';
  try { await ready; show(await prepare(localStorage)); $('status').textContent = 'Consulta offline pronta. Você pode buscar nos dados mesmo sem internet.'; }
  catch (error) { show(read(localStorage)); $('status').textContent = error.message || 'Não foi possível salvar neste aparelho.'; }
  finally { busy = false; $('prepare').disabled = !navigator.onLine; }
});
const ready = 'serviceWorker' in navigator ? navigator.serviceWorker.register('/stockpro-sw.js').then(() => navigator.serviceWorker.ready) : Promise.reject(new Error('Este navegador não oferece consulta offline.'));
ready.catch(error => { $('status').textContent = error.message; $('prepare').disabled = true; });
async function refresh() {
  try { show(await validate(localStorage)); $('status').textContent = navigator.onLine ? 'Conectado · consulte ou atualize sua cópia.' : 'Sem internet · mostrando somente dados salvos.'; }
  catch { show(null); $('status').textContent = 'Armazenamento indisponível neste navegador.'; }
  $('prepare').disabled = !navigator.onLine || busy;
}
window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
window.addEventListener('storage', event => { if (event.key === KEY) { show(null); void refresh(); } });
setInterval(() => { if (snapshot && !read(localStorage)) { show(null); $('status').textContent = 'A cópia expirou. Conecte-se para atualizar.'; } }, 30000);
void refresh();

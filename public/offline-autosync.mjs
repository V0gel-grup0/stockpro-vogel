import { KEY, read } from './offline-data.mjs';
import { syncQueue, listQueue } from './offline-queue.mjs';
let sending = false;
async function run() {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    const snapshot = read(localStorage);
    if (snapshot?.owner_id && listQueue(localStorage, snapshot.owner_id).some(row => row.state !== 'sent')) {
      await syncQueue(localStorage, snapshot.owner_id, fetch, () => window.dispatchEvent(new Event('stockpro-queue-updated')));
    }
  } catch { /* Preserve pending records; details appear in Modo offline. */ }
  finally { sending = false; }
}
window.addEventListener('online', run);
window.addEventListener('storage', event => { if (event.key === KEY) void run(); });
void run();

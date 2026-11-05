import { read } from '../../public/offline-data.mjs';
import { enqueue } from '../../public/offline-queue.mjs';

export function saveClientOnDevice(storage: Storage, actor: { id: string; role: string; status: string }, payload: Record<string, unknown>) {
  const snapshot = read(storage);
  if (!snapshot) throw new Error('Prepare o Modo offline com internet antes de cadastrar neste aparelho. Os campos preenchidos foram mantidos.');
  if (actor.status !== 'approved' || snapshot.owner_id !== actor.id || snapshot.role !== actor.role) {
    throw new Error('A cópia offline não pertence à conta atual. Prepare os dados novamente com internet.');
  }
  try {
    return enqueue(storage, snapshot, 'client', payload, `Cliente: ${payload.name}`);
  } catch (error) {
    if (error instanceof DOMException && ['QuotaExceededError', 'SecurityError'].includes(error.name)) {
      throw new Error('O aparelho não permitiu salvar o cliente. Libere espaço ou habilite o armazenamento deste site. Os campos foram mantidos.');
    }
    throw error;
  }
}

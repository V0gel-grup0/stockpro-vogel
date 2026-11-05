import { timingSafeEqual } from "node:crypto";

export class PushInputError extends Error {}
export function parsePushSubscription(value: any) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 4096) throw new PushInputError("Inscrição de notificações inválida.");
  let url: URL;
  try { url = new URL(value.endpoint); } catch { throw new PushInputError("Endereço de notificações inválido."); }
  const host = url.hostname;
  const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(host) || host.endsWith(".notify.windows.com");
  if (url.protocol !== "https:" || url.port || url.username || url.password || !allowed) throw new PushInputError("Serviço de notificações não suportado neste navegador.");
  const p256dh = value.keys?.p256dh, auth = value.keys?.auth;
  const encoded = (key: unknown, size: number) => typeof key === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(key) && Buffer.from(key, "base64url").length === size;
  if (!encoded(p256dh, 65) || Buffer.from(p256dh, "base64url")[0] !== 4 || !encoded(auth, 16)) throw new PushInputError("Chaves de notificações inválidas.");
  return { endpoint: url.href, keys: { p256dh: p256dh as string, auth: auth as string } };
}
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function reminderDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, tomorrow: new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 86400000) };
}
export function pushReminderBody(counts: { commercial: number; internal: number; assembly: number }) {
  const parts: string[] = [];
  if (counts.commercial) parts.push(`${counts.commercial} atividade(s) do CRM comercial`);
  if (counts.internal) parts.push(`${counts.internal} demanda(s) interna(s)`);
  if (counts.assembly) parts.push(`${counts.assembly} montagem(ns) pendente(s)`);
  return parts.length ? `${parts.join(" · ")}. Abra o StockPro para conferir.` : null;
}

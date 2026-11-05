import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { canAccessCrm } from "@/lib/crm-access";
import { buildOpportunityVisibilityWhere } from "@/lib/client-visibility";
import { canProfileUseSystem } from "@/lib/auth";
import { ensureAssemblyWorkTable } from "@/lib/assembly-work-server";
import { ensureGeneralCrmTable } from "@/lib/general-crm-server";
import { parsePushSubscription, reminderDay, pushReminderBody } from "@/lib/push-policy";

const DEVICE_COOKIE = "stockpro_push_device";
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Device = { endpoint_hash: string; actor_id: string; endpoint: string; p256dh: string; auth: string; last_test_token?: string; last_test_state?: string };
let structure: Promise<unknown> | undefined;
export function ensurePushTable() {
  if (!structure) structure = (async () => { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS app_push_devices (
    endpoint_hash TEXT PRIMARY KEY, actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id UUID NOT NULL, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    last_sent_day TEXT, lease_until TIMESTAMPTZ, last_test_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
    await prisma.$executeRawUnsafe('ALTER TABLE app_push_devices ADD COLUMN IF NOT EXISTS last_test_token UUID, ADD COLUMN IF NOT EXISTS last_test_state TEXT');
  })().catch(error => { structure = undefined; throw error; });
  return structure;
}
export function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY); }
export async function currentPushDevice(actorId: string) {
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!device || !DEVICE_ID.test(device)) return null;
  await ensurePushTable();
  const rows = await prisma.$queryRaw<Device[]>`SELECT endpoint_hash, actor_id, endpoint, p256dh, auth, last_test_token, last_test_state FROM app_push_devices WHERE device_id = ${device}::uuid AND actor_id = ${actorId}::uuid`;
  return rows[0] || null;
}
export async function detachPushDevice() {
  const jar = await cookies(); const device = jar.get(DEVICE_COOKIE)?.value;
  if (!device || !DEVICE_ID.test(device)) return;
  await ensurePushTable();
  await prisma.$executeRaw`DELETE FROM app_push_devices WHERE device_id = ${device}::uuid`;
  jar.delete(DEVICE_COOKIE);
}
export async function savePushDevice(actorId: string, input: unknown) {
  const subscription = parsePushSubscription(input);
  await ensurePushTable();
  const hash = createHash("sha256").update(subscription.endpoint).digest("hex");
  const device = randomUUID();
  await prisma.$executeRaw`INSERT INTO app_push_devices(endpoint_hash,actor_id,device_id,endpoint,p256dh,auth)
    VALUES (${hash},${actorId}::uuid,${device}::uuid,${subscription.endpoint},${subscription.keys.p256dh},${subscription.keys.auth})
    ON CONFLICT(endpoint_hash) DO UPDATE SET actor_id=EXCLUDED.actor_id,device_id=EXCLUDED.device_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now(),lease_until=NULL`;
  (await cookies()).set(DEVICE_COOKIE, device, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
}
export async function sendDevicePush(device: Device, body: string, tag: string, testId?: string) {
  // Validate stored endpoints as well; never send authenticated requests to arbitrary URLs.
  const subscription = parsePushSubscription({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } });
  await webpush.sendNotification(subscription, JSON.stringify({ title: "StockPro Vogel", body, tag, ...(testId ? { testId } : {}) }), {
    TTL: 3600, timeout: 10000,
    vapidDetails: { subject: "https://stockpro-vogel.vercel.app", publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
  });
}
export async function sendPushTest(actorId: string) {
  const device = await currentPushDevice(actorId);
  if (!device) return { status: 404, error: "Ative as notificações neste aparelho primeiro." };
  const testId = randomUUID();
  const claim = await prisma.$executeRaw`UPDATE app_push_devices SET last_test_at=now(),last_test_token=${testId}::uuid,last_test_state='sent' WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${actorId}::uuid AND (last_test_at IS NULL OR last_test_at < now() - interval '1 minute')`;
  if (!claim) return { status: 429, error: "Aguarde um minuto antes de testar novamente." };
  try { await sendDevicePush(device, "Notificações ativadas! Este é um aviso de teste do seu aparelho.", "stockpro-test", testId); return { status: 200, testId }; }
  catch (error) {
    if ([404, 410].includes(Number((error as any)?.statusCode))) { await prisma.$executeRaw`DELETE FROM app_push_devices WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${actorId}::uuid`; return { status: 410, error: "A inscrição expirou. Desative e ative novamente." }; }
    return { status: 502, error: "Não foi possível entregar o teste. Tente novamente mais tarde." };
  }
}
export async function acknowledgePushTest(testId: unknown, state: unknown) {
  if (typeof testId !== 'string' || !DEVICE_ID.test(testId) || !['received','displayed','failed'].includes(String(state))) return;
  await ensurePushTable();
  // The unguessable test token authorizes a receipt only, never a new notification.
  await prisma.$executeRaw`UPDATE app_push_devices SET last_test_state=CASE WHEN last_test_state='displayed' THEN last_test_state ELSE ${String(state)} END
    WHERE last_test_token=${testId}::uuid AND last_test_at > now()-interval '5 minutes'`;
}
export async function reminderCounts(actor: { id: string; role: any }, now = new Date()) {
  const { tomorrow } = reminderDay(now);
  const counts = { commercial: 0, internal: 0, assembly: 0 };
  if (canAccessCrm(actor.role, "commercial")) counts.commercial = await prisma.crm_opportunities.count({ where: {
    status: "open", stage: { not: "completed" }, next_action: { not: "" }, next_action_at: { not: null, lt: tomorrow }, ...(buildOpportunityVisibilityWhere(actor) || {}),
  } });
  if (canAccessCrm(actor.role, "internal")) {
    await ensureGeneralCrmTable(); const manager = ["administrador", "gerente"].includes(actor.role);
    const general = await prisma.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM crm_general_demands
      WHERE status NOT IN ('completed','cancelled') AND due_at < ${tomorrow} AND (${manager}::boolean OR created_by=${actor.id}::uuid OR assigned_to=${actor.id}::uuid)`;
    const legacy = await prisma.crm_tasks.count({ where: { opportunity_id: null, status: { not: "completed" }, due_at: { not: null, lt: tomorrow }, ...(actor.role === "administrador" ? {} : { OR: [{ created_by: actor.id }, { assigned_to: actor.id }] }) } });
    counts.internal = Number(general[0]?.total || 0) + legacy;
  }
  if (canAccessCrm(actor.role, "assembly")) {
    await ensureAssemblyWorkTable(); const manager = ["administrador", "gerente"].includes(actor.role);
    const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM crm_assembly_work
      WHERE stage <> 'done' AND (${manager}::boolean OR technician_id=${actor.id}::uuid)`;
    counts.assembly = Number(rows[0]?.total || 0);
  }
  return counts;
}
export async function dispatchDailyPush(now = new Date()) {
  await ensurePushTable(); const { day } = reminderDay(now);
  const devices = await prisma.$queryRaw<Device[]>`SELECT endpoint_hash,actor_id,endpoint,p256dh,auth FROM app_push_devices ORDER BY last_sent_day ASC NULLS FIRST, created_at`;
  const summaries = new Map<string, Promise<string | null>>();
  const stats = { sent: 0, skipped: 0, failed: 0 };
  async function processDevice(device: Device) {
    const claimed = await prisma.$executeRaw`UPDATE app_push_devices SET lease_until=now()+interval '2 minutes'
      WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${device.actor_id}::uuid AND last_sent_day IS DISTINCT FROM ${day} AND (lease_until IS NULL OR lease_until<now())`;
    if (!claimed) { stats.skipped++; return; }
    try {
      if (!summaries.has(device.actor_id)) summaries.set(device.actor_id, (async () => {
        const profile = await prisma.profiles.findUnique({ where: { id: device.actor_id }, select: { id: true, role: true, status: true, responsible_seller_id: true } });
        if (!profile || profile.status !== "approved" || !(await canProfileUseSystem(profile))) return null;
        return pushReminderBody(await reminderCounts(profile, now));
      })());
      const body = await summaries.get(device.actor_id);
      if (body) {
        // Logout/account switches may revoke the device while its summary is being prepared.
        const active = await prisma.$queryRaw<Array<{ endpoint_hash: string }>>`SELECT endpoint_hash FROM app_push_devices WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${device.actor_id}::uuid`;
        if (active.length) { await sendDevicePush(device, body, `stockpro-daily-${day}`); stats.sent++; } else stats.skipped++;
      } else stats.skipped++;
      await prisma.$executeRaw`UPDATE app_push_devices SET last_sent_day=${day},lease_until=NULL WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${device.actor_id}::uuid`;
    } catch (error) {
      if ([404,410].includes(Number((error as any)?.statusCode))) await prisma.$executeRaw`DELETE FROM app_push_devices WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${device.actor_id}::uuid`;
      else await prisma.$executeRaw`UPDATE app_push_devices SET lease_until=NULL WHERE endpoint_hash=${device.endpoint_hash} AND actor_id=${device.actor_id}::uuid`;
      stats.failed++;
    }
  }
  const deadline = Date.now() + 45000;
  let processed = 0;
  for (let i = 0; i < devices.length && Date.now() < deadline; i += 5) {
    const batch = devices.slice(i,i+5);
    await Promise.all(batch.map(processDevice)); processed += batch.length;
  }
  return { ...stats, remaining: devices.length - processed };
}

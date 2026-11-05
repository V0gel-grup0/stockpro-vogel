import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { currentPushDevice, detachPushDevice, pushConfigured, savePushDevice } from "@/lib/push-server";
import { PushInputError } from "@/lib/push-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status=200) => NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET() {
  const actor = await getAuthenticatedProfile(); if (!actor) return json({erro:"Entre na sua conta para configurar as notificações."},401);
  return json({ configured:pushConfigured(), publicKey:process.env.VAPID_PUBLIC_KEY || null, enabled:Boolean(await currentPushDevice(actor.id)) });
}
export async function POST(request: Request) {
  try {
    const actor=await getAuthenticatedProfile(); if (!actor) return json({erro:"Sua sessão expirou. Entre novamente."},401);
    if (!pushConfigured()) return json({erro:"Notificações em configuração. Tente novamente mais tarde."},503);
    const text=await request.text(); if (text.length>8192) return json({erro:"Inscrição inválida."},400);
    await savePushDevice(actor.id,JSON.parse(text)); return json({sucesso:true});
  } catch(error) { return json({erro:error instanceof PushInputError ? error.message : "Não foi possível ativar as notificações."},error instanceof PushInputError || error instanceof SyntaxError ? 400 : 500); }
}
export async function DELETE() {
  const actor=await getAuthenticatedProfile(); if (!actor) return json({erro:"Entre na sua conta novamente."},401);
  await detachPushDevice(); return json({sucesso:true});
}

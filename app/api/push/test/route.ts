import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { sendPushTest, pushConfigured, currentPushDevice } from "@/lib/push-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST() {
  const actor=await getAuthenticatedProfile(); if(!actor)return NextResponse.json({erro:"Entre novamente."},{status:401});
  if(!pushConfigured())return NextResponse.json({erro:"Notificações indisponíveis."},{status:503});
  const result=await sendPushTest(actor.id);
  return NextResponse.json({sucesso:result.status===200,erro:result.error,testId:result.testId},{status:result.status,headers:{"Cache-Control":"no-store"}});
}
export async function GET(request: Request) {
  const actor=await getAuthenticatedProfile();if(!actor)return NextResponse.json({erro:"Entre novamente."},{status:401});
  const device=await currentPushDevice(actor.id);
  const token=new URL(request.url).searchParams.get('id');
  if(!token||!device||device.last_test_token!==token)return NextResponse.json({erro:"Teste indisponível neste aparelho."},{status:404});
  return NextResponse.json({state:device.last_test_state||'sent'},{headers:{"Cache-Control":"private, no-store"}});
}

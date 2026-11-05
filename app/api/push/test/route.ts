import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";
import { sendPushTest, pushConfigured } from "@/lib/push-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST() {
  const actor=await getAuthenticatedProfile(); if(!actor)return NextResponse.json({erro:"Entre novamente."},{status:401});
  if(!pushConfigured())return NextResponse.json({erro:"Notificações indisponíveis."},{status:503});
  const result=await sendPushTest(actor.id);
  return NextResponse.json({sucesso:result.status===200,erro:result.error},{status:result.status,headers:{"Cache-Control":"no-store"}});
}

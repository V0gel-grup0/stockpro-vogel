import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/push-policy";
import { dispatchDailyPush, pushConfigured } from "@/lib/push-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request: Request) {
  if(!cronAuthorized(request.headers.get("authorization"),process.env.CRON_SECRET))return NextResponse.json({erro:"Não autorizado."},{status:401});
  if(!pushConfigured())return NextResponse.json({erro:"Notificações não configuradas."},{status:503});
  try {return NextResponse.json(await dispatchDailyPush(),{headers:{"Cache-Control":"no-store"}});}
  catch {return NextResponse.json({erro:"Não foi possível concluir o envio."},{status:500});}
}

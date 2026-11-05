import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { detachPushDevice } from "@/lib/push-server";

export const runtime = "nodejs";

export async function POST() {
  await detachPushDevice();
  await deleteSession();

  return NextResponse.json({ sucesso: true });
}


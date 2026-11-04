import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { ORDER_ROLES } from "@/lib/permissions";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import { prisma } from "@/lib/prisma";
import { ensureOrderWorkflowTables, OrderWorkflowError } from "@/lib/order-workflow-server";
import { applyOfflineOperation, assertOfflineEnvelope, ensureOfflineReceipts, OfflineSyncError } from "@/lib/offline-sync-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await authorizeApi(ORDER_ROLES);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ equipments: EQUIPMENT_CATALOG }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeApi(ORDER_ROLES);
    if ("response" in auth) return auth.response;
    const body = await request.json();
    assertOfflineEnvelope(body, auth.profile.id);
    await ensureOfflineReceipts();
    if (body.type === "order") await ensureOrderWorkflowTables();
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${auth.profile.id}::uuid FOR UPDATE`;
      return applyOfflineOperation(tx, auth.profile, body);
    }, { timeout: 30_000 });
    return NextResponse.json({ sucesso: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof OfflineSyncError || error instanceof OrderWorkflowError;
    const invalid = error instanceof SyntaxError || error instanceof Error && /Informe (uma quantidade|valores)|Valor do pedido/.test(error.message);
    if (!known && !invalid) console.error("Falha na sincronização offline:", error);
    return NextResponse.json({ sucesso: false, erro: known || invalid ? error.message : "Não foi possível enviar agora. O registro continua pendente; tente novamente." }, { status: known ? error.status : invalid ? 400 : 500 });
  }
}

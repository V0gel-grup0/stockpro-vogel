import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? n : null; };

export async function GET() {
  try { const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response; return NextResponse.json({ sucesso: true, items: toJsonSafe(await prisma.mounted_equipments.findMany({ orderBy: { equipment_name: "asc" } })) }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar equipamentos montados." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response;
    const body = await request.json(); const equipment_name = text(body.equipment_name); const quantity = num(body.quantity); const min_stock = num(body.min_stock);
    if (!equipment_name || quantity === null || min_stock === null) return NextResponse.json({ sucesso: false, erro: "Dados do equipamento inválidos." }, { status: 400 });
    const item = await prisma.mounted_equipments.create({ data: { equipment_name, quantity, min_stock, notes: text(body.notes), updated_at: new Date() } });
    return NextResponse.json({ sucesso: true, item: toJsonSafe(item) }, { status: 201 });
  } catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao criar equipamento montado." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response;
    const body = await request.json(); const id = text(body.id); const quantity = num(body.quantity); const min_stock = num(body.min_stock);
    if (!id || quantity === null || min_stock === null) return NextResponse.json({ sucesso: false, erro: "Dados inválidos." }, { status: 400 });
    const item = await prisma.mounted_equipments.update({ where: { id }, data: { equipment_name: text(body.equipment_name), quantity, min_stock, notes: text(body.notes), updated_at: new Date() } });
    return NextResponse.json({ sucesso: true, item: toJsonSafe(item) });
  } catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar equipamento montado." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response;
    const body = await request.json(); const names = Array.isArray(body.equipment_names) ? body.equipment_names.map(text).filter(Boolean) : [];
    let criados = 0, existentes = 0;
    for (const equipment_name of names) {
      const found = await prisma.mounted_equipments.findUnique({ where: { equipment_name } });
      if (found) { existentes++; continue; }
      await prisma.mounted_equipments.create({ data: { equipment_name, quantity: 0, min_stock: 0, notes: "" } }); criados++;
    }
    return NextResponse.json({ sucesso: true, criados, atualizados: existentes });
  } catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao criar lista padrão." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try { const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response; const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 }); await prisma.mounted_equipments.delete({ where: { id } }); return NextResponse.json({ sucesso: true }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao excluir equipamento montado." }, { status: 500 }); }
}

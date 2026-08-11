import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  try { const assemblies = await prisma.assemblies.findMany({ orderBy: { created_at: "desc" } }); return NextResponse.json({ sucesso: true, assemblies: toJsonSafe(assemblies) }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar montagens." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json(); const equipment = text(body.equipment); const quantity = Number(body.quantity || 0); const createdBy = text(body.created_by); const technicianId = text(body.technician_id) || null;
    if (!equipment || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ sucesso: false, erro: "Dados da montagem inválidos." }, { status: 400 });
    const assembly = await prisma.$transaction(async (tx) => {
      const divisions = await tx.equipment_components.findMany({ where: { equipment_name: equipment }, include: { components: true } });
      if (!divisions.length) throw new Error(`Nenhuma composição cadastrada para ${equipment}. Cadastre os componentes padrão ou configure a divisão por equipamento.`);
      const insufficient = divisions.filter((d) => Number(d.components.quantity) < Number(d.qty_per_equipment) * quantity);
      if (insufficient.length) throw new Error(`Estoque insuficiente para montar ${equipment}: ${insufficient.map((d) => `${d.components.name} precisa ${Number(d.qty_per_equipment) * quantity} e tem ${Number(d.components.quantity)}`).join("; ")}.`);
      for (const div of divisions) {
        const need = Number(div.qty_per_equipment) * quantity;
        await tx.components.update({ where: { id: div.component_id }, data: { quantity: Number(div.components.quantity) - need, updated_at: new Date() } });
        await tx.movements.create({ data: { type: "saida", item_type: "componente", item_kind: "componente", item_id: div.component_id, component_id: div.component_id, item_name: div.components.name, quantity: need, notes: `Baixa automática de componente: montagem de ${equipment}`, created_by: createdBy || null } });
      }
      const created = await tx.assemblies.create({ data: { equipment, quantity: Math.trunc(quantity), technician_id: technicianId, created_by: createdBy || null } });
      await tx.mounted_equipments.upsert({
        where: { equipment_name: equipment },
        update: { quantity: { increment: quantity }, updated_at: new Date() },
        create: { equipment_name: equipment, quantity, min_stock: 0, notes: "" },
      });
      return created;
    });
    return NextResponse.json({ sucesso: true, assembly: toJsonSafe(assembly) }, { status: 201 });
  } catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao registrar montagem." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try { const body = await request.json(); const id = text(body.id); const quantity = Number(body.quantity || 0); if (!id || !text(body.equipment) || quantity <= 0) return NextResponse.json({ sucesso: false, erro: "Dados inválidos." }, { status: 400 }); const assembly = await prisma.assemblies.update({ where: { id }, data: { equipment: text(body.equipment), quantity: Math.trunc(quantity), technician_id: text(body.technician_id) || null } }); return NextResponse.json({ sucesso: true, assembly: toJsonSafe(assembly) }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar montagem." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 }); await prisma.assemblies.delete({ where: { id } }); return NextResponse.json({ sucesso: true }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao excluir montagem." }, { status: 500 }); }
}

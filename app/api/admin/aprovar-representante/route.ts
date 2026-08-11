import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { representante_id, aprovador_id } = await request.json();
    if (!representante_id) return NextResponse.json({ error: "ID do representante é obrigatório." }, { status: 400 });
    if (!aprovador_id) return NextResponse.json({ error: "ID do aprovador é obrigatório." }, { status: 401 });

    const aprovador = await prisma.profiles.findUnique({ where: { id: String(aprovador_id) }, select: { id: true, role: true, name: true } });
    if (!aprovador) return NextResponse.json({ error: "Perfil do aprovador não encontrado." }, { status: 403 });
    if (!["administrador", "vendedor"].includes(aprovador.role)) return NextResponse.json({ error: "Você não tem permissão para aprovar representantes." }, { status: 403 });

    const representante = await prisma.profiles.findUnique({ where: { id: String(representante_id) }, select: { id: true, role: true, status: true, responsible_seller_id: true } });
    if (!representante) return NextResponse.json({ error: "Representante não encontrado." }, { status: 404 });
    if (representante.role !== "representante") return NextResponse.json({ error: "Este usuário não é um representante." }, { status: 400 });
    if (aprovador.role === "vendedor" && representante.responsible_seller_id !== aprovador.id) return NextResponse.json({ error: "Este representante não está vinculado a você." }, { status: 403 });

    await prisma.profiles.update({ where: { id: representante.id }, data: { status: "approved", updated_at: new Date() } });
    return NextResponse.json({ ok: true, message: "Representante aprovado com sucesso." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado ao aprovar representante." }, { status: 500 });
  }
}

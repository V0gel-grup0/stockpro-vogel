import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador", "vendedor"]);
    if ("response" in authorization) return authorization.response;

    const { representante_id } = await request.json();
    const representanteId =
      typeof representante_id === "string" ? representante_id.trim() : "";

    if (!uuidPattern.test(representanteId)) {
      return NextResponse.json(
        { error: "ID do representante deve ser um UUID válido." },
        { status: 400 }
      );
    }

    const aprovador = authorization.profile;

    const representante = await prisma.profiles.findUnique({ where: { id: representanteId }, select: { id: true, role: true, status: true, responsible_seller_id: true } });
    if (!representante) return NextResponse.json({ error: "Representante não encontrado." }, { status: 404 });
    if (representante.role !== "representante") return NextResponse.json({ error: "Este usuário não é um representante." }, { status: 400 });
    if (aprovador.role === "vendedor" && representante.responsible_seller_id !== aprovador.id) return NextResponse.json({ error: "Este representante não está vinculado a você." }, { status: 403 });

    await prisma.profiles.update({ where: { id: representante.id }, data: { status: "approved", updated_at: new Date() } });
    return NextResponse.json({ ok: true, message: "Representante aprovado com sucesso." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado ao aprovar representante." }, { status: 500 });
  }
}

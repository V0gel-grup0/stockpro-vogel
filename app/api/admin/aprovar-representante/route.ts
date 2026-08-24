import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import {
  REPRESENTATIVE_REVIEW_ROLES,
  canReviewRepresentative,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_REVIEW_ROLES);
    if ("response" in authorization) return authorization.response;

    const { representante_id, status } = await request.json();
    const representanteId =
      typeof representante_id === "string" ? representante_id.trim() : "";
    const targetStatus = status === undefined ? "approved" : status;

    if (!uuidPattern.test(representanteId)) {
      return NextResponse.json(
        { error: "ID do representante deve ser um UUID válido." },
        { status: 400 }
      );
    }

    if (targetStatus !== "approved" && targetStatus !== "rejected") {
      return NextResponse.json(
        { error: "Status de avaliação inválido." },
        { status: 400 }
      );
    }

    const aprovador = authorization.profile;

    const representante = await prisma.profiles.findUnique({ where: { id: representanteId }, select: { id: true, role: true, status: true, responsible_seller_id: true } });
    if (!representante) return NextResponse.json({ error: "Representante não encontrado." }, { status: 404 });
    if (representante.role !== "representante") return NextResponse.json({ error: "Este usuário não é um representante." }, { status: 400 });
    if (!canReviewRepresentative(aprovador, representante)) return NextResponse.json({ error: "Este representante não está vinculado a você." }, { status: 403 });

    await prisma.profiles.update({ where: { id: representante.id }, data: { status: targetStatus, updated_at: new Date() } });
    return NextResponse.json({
      ok: true,
      message:
        targetStatus === "approved"
          ? "Representante aprovado com sucesso."
          : "Representante reprovado.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado ao aprovar representante." }, { status: 500 });
  }
}

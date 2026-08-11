import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const profiles = await prisma.profiles.findMany({
      orderBy: {
        created_at: "desc",
      },
    });

    const safeProfiles = profiles.map(
      ({ password_hash, ...profile }) => profile
    );

    return NextResponse.json(safeProfiles);
  } catch (error) {
    console.error("Erro ao listar perfis:", error);

    return NextResponse.json(
      { error: "Não foi possível carregar os perfis." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, permissions } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "O ID do perfil é obrigatório." },
        { status: 400 }
      );
    }

    const allowed = ["name", "document", "phone", "cep", "city", "street", "number", "no_number", "neighborhood"] as const;
    const data: Record<string, any> = { updated_at: new Date() };
    if (status !== undefined) data.status = status;
    if (permissions !== undefined) data.permissions = permissions;
    for (const field of allowed) {
      if (field in body) data[field] = field === "no_number" ? Boolean(body[field]) : String(body[field] ?? "").trim();
    }

    if (Object.keys(data).length === 1) {
      return NextResponse.json(
        { error: "Nenhum campo válido foi informado para atualizar." },
        { status: 400 }
      );
    }

    const updatedProfile = await prisma.profiles.update({
      where: { id },
      data,
    });
    const { password_hash, ...safeProfile } = updatedProfile;

    return NextResponse.json(safeProfile);
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return NextResponse.json(
      { error: "Não foi possível atualizar o perfil." },
      { status: 500 }
    );
  }
}


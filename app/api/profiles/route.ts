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
    if (status === undefined && permissions === undefined) {
      return NextResponse.json(
        { error: "Informe status ou permissions para atualizar." },
        { status: 400 }
      );
    }

    const updatedProfile = await prisma.profiles.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
      },
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


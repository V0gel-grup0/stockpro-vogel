import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID obrigatório" },
        { status: 400 }
      );
    }

    const profile = await prisma.profiles.findUnique({
      where: { id },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado" },
        { status: 404 }
      );
    }

    const { password_hash: _passwordHash, ...safeProfile } = profile;

    return NextResponse.json(safeProfile);
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}

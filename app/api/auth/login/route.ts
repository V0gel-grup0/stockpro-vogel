import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { sucesso: false, erro: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const user = await prisma.profiles.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    if (!user || !user.password_hash) {
      return NextResponse.json(
        { sucesso: false, erro: "Usuário ou senha inválidos." },
        { status: 401 }
      );
    }

    const senhaCorreta = await bcrypt.compare(password, user.password_hash);

    if (!senhaCorreta) {
      return NextResponse.json(
        { sucesso: false, erro: "Usuário ou senha inválidos." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      usuario: {
        id: user.id,
        nome: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { sucesso: false, erro: "Erro interno." },
      { status: 500 }
    );
  }
}

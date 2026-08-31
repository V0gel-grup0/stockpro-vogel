import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canProfileUseSystem, createSession } from "@/lib/auth";
import { REPRESENTATIVE_LINK_REQUIRED_MESSAGE } from "@/lib/representative-access";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email =
      typeof body?.email === "string"
        ? body.email.toLowerCase().trim()
        : "";
    const password =
      typeof body?.password === "string" ? body.password : "";

    if (
      !email ||
      email.length > 254 ||
      !password ||
      password.length > 1024
    ) {
      return NextResponse.json(
        { sucesso: false, erro: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const user = await prisma.profiles.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        responsible_seller_id: true,
        password_hash: true,
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

    if (user.status !== "approved") {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Seu cadastro não está aprovado para acessar o sistema.",
        },
        { status: 403 }
      );
    }

    if (!(await canProfileUseSystem(user))) {
      return NextResponse.json(
        {
          sucesso: false,
          error: REPRESENTATIVE_LINK_REQUIRED_MESSAGE,
          erro: REPRESENTATIVE_LINK_REQUIRED_MESSAGE,
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    await createSession(user.id);

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
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { sucesso: false, erro: "JSON inválido." },
        { status: 400 }
      );
    }

    console.error(error);

    return NextResponse.json(
      { sucesso: false, erro: "Erro interno." },
      { status: 500 }
    );
  }
}

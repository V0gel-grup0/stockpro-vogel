import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function somenteNumeros(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      codigo,
      nome,
      email,
      senha,
      document,
      phone,
      cep,
      city,
      street,
      number,
      neighborhood,
    } = body;

    if (!process.env.ADMIN_SETUP_CODE) {
      return NextResponse.json(
        { error: "ADMIN_SETUP_CODE não configurado no .env.local." },
        { status: 500 }
      );
    }

    if (codigo !== process.env.ADMIN_SETUP_CODE) {
      return NextResponse.json(
        { error: "Código secreto incorreto." },
        { status: 401 }
      );
    }

    if (!nome || !email || !senha) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const emailNormalizado = String(email).toLowerCase().trim();

    const usuarioExistente = await prisma.profiles.findUnique({
      where: {
        email: emailNormalizado,
      },
    });

    if (usuarioExistente) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(String(senha), 12);

    const usuarioCriado = await prisma.profiles.create({
      data: {
        email: emailNormalizado,
        password_hash: passwordHash,
        role: "administrador",
        status: "approved",
        name: nome,
        document: somenteNumeros(document),
        phone: somenteNumeros(phone),
        cep: somenteNumeros(cep),
        city: city || "",
        street: street || "",
        number: number || "",
        no_number: false,
        neighborhood: neighborhood || "",
        access_code: "ADM000001",
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Administrador criado com sucesso.",
      usuario: {
        id: usuarioCriado.id,
        nome: usuarioCriado.name,
        email: usuarioCriado.email,
        role: usuarioCriado.role,
      },
    });
  } catch (error: any) {
    console.error("Erro ao criar administrador:", error);

    return NextResponse.json(
      { error: error.message || "Erro inesperado ao criar administrador." },
      { status: 500 }
    );
  }
}

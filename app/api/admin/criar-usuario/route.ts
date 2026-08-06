import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

type TipoUsuario =
  | "gerente"
  | "vendedor"
  | "funcionario"
  | "tecnico"
  | "representante";

function normalizarTipo(valor: unknown): TipoUsuario | null {
  const tipo = String(valor || "").trim().toLowerCase();

  switch (tipo) {
    case "gerente":
    case "vendedor":
    case "funcionario":
    case "tecnico":
    case "representante":
      return tipo;
    default:
      return null;
  }
}

function gerarCodigo(tipo: TipoUsuario) {
  const numero = Math.floor(100000 + Math.random() * 900000);

  if (tipo === "gerente") return `GER${numero}`;
  if (tipo === "vendedor") return `VEN${numero}`;
  if (tipo === "funcionario") return `FUN${numero}`;
  if (tipo === "tecnico") return `TEC${numero}`;
  if (tipo === "representante") return `REP${numero}`;

  return `USR${numero}`;
}

function somenteNumeros(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      nome,
      email,
      senha,
      tipo,
      document,
      phone,
      cep,
      city,
      street,
      number,
      no_number,
      neighborhood,
      seller_code,
    } = body;

    if (!nome || !email || !senha || !tipo) {
      return NextResponse.json(
        { error: "Preencha nome, e-mail, senha e tipo." },
        { status: 400 }
      );
    }

    const tipoNormalizado = normalizarTipo(tipo);

    if (!tipoNormalizado) {
      return NextResponse.json(
        { error: "Tipo de usuário inválido." },
        { status: 400 }
      );
    }

    const emailNormalizado = String(email).trim().toLowerCase();

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

    let responsibleSellerId: string | null = null;

    if (tipoNormalizado === "representante") {
      if (!seller_code) {
        return NextResponse.json(
          {
            error:
              "Código do vendedor responsável é obrigatório para representante.",
          },
          { status: 400 }
        );
      }

      const codigoVendedor = String(seller_code).trim().toUpperCase();

      const vendedor = await prisma.profiles.findFirst({
        where: {
          role: "vendedor",
          seller_code: codigoVendedor,
        },
        select: {
          id: true,
          name: true,
          seller_code: true,
        },
      });

      if (!vendedor) {
        return NextResponse.json(
          { error: "Nenhum vendedor encontrado com esse código." },
          { status: 404 }
        );
      }

      responsibleSellerId = vendedor.id;
    }

    const codigo = gerarCodigo(tipoNormalizado);
    const passwordHash = await bcrypt.hash(String(senha), 12);

    const status =
      tipoNormalizado === "representante" ||
      tipoNormalizado === "funcionario" ||
      tipoNormalizado === "tecnico"
        ? "pending"
        : "approved";

    const sellerCode =
      tipoNormalizado === "vendedor" ? codigo : null;

    const managerCode =
      tipoNormalizado === "gerente" ? codigo : null;

    const usuarioCriado = await prisma.profiles.create({
      data: {
        id: randomUUID(),
        email: emailNormalizado,
        password_hash: passwordHash,
        role: tipoNormalizado,
        status,
        name: String(nome).trim(),
        document: somenteNumeros(document),
        phone: somenteNumeros(phone),
        cep: somenteNumeros(cep),
        city: String(city || ""),
        street: String(street || ""),
        number: no_number ? "" : String(number || ""),
        no_number: Boolean(no_number),
        neighborhood: String(neighborhood || ""),
        access_code: codigo,
        seller_code: sellerCode,
        manager_code: managerCode,
        responsible_seller_id: responsibleSellerId,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Usuário criado com sucesso.",
      usuario: {
        id: usuarioCriado.id,
        nome: usuarioCriado.name,
        email: usuarioCriado.email,
        tipo: usuarioCriado.role,
        status: usuarioCriado.status,
        codigo,
        seller_code: usuarioCriado.seller_code,
        responsible_seller_id: usuarioCriado.responsible_seller_id,
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao criar usuário:");
    console.dir(error, { depth: null });

    if (error && typeof error === "object" && "cause" in error) {
      console.error("Causa interna:");
      console.dir(error.cause, { depth: null });
    }

    const prismaCode =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : null;

    if (prismaCode === "P2002") {
      return NextResponse.json(
        { error: "Já existe um usuário com esses dados." },
        { status: 400 }
      );
    }

    const mensagem =
      error instanceof Error
        ? error.message
        : "Erro inesperado ao salvar usuário.";

    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  somenteDigitos,
  validarCadastroPessoa,
} from "@/lib/validacao-cadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeProposalStatus(value: unknown) {
  const status = String(value ?? "").trim();

  return status || "Lead Frio";
}

export async function GET() {
  try {
    const clients = await prisma.clients.findMany({
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json({
      sucesso: true,
      clients,
    });
  } catch (error) {
    console.error("Erro ao carregar clientes:", error);

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao carregar clientes.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const validation = validarCadastroPessoa({
      name: body.name,
      document: body.document,
      phone: body.phone,
      cep: body.cep,
      city: body.city,
      street: body.street,
      number: body.number,
      no_number: body.no_number,
      neighborhood: body.neighborhood,
    });

    if (validation.valido === false) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: validation.erro,
        },
        {
          status: 400,
        }
      );
    }

    const existingClient =
      await prisma.clients.findFirst({
        where: {
          document: validation.dados.document,
        },
        select: {
          id: true,
        },
      });

    if (existingClient) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Já existe um cliente com este CPF ou CNPJ.",
        },
        {
          status: 409,
        }
      );
    }

    const client = await prisma.clients.create({
      data: {
        ...validation.dados,
        proposal_status:
          normalizeProposalStatus(
            body.proposal_status
          ),
      },
    });

    return NextResponse.json(
      {
        sucesso: true,
        client,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao criar cliente:", error);

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao criar cliente.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    const validation = validarCadastroPessoa({
      name: body.name,
      document: body.document,
      phone: body.phone,
      cep: body.cep,
      city: body.city,
      street: body.street,
      number: body.number,
      no_number: body.no_number,
      neighborhood: body.neighborhood,
    });

    if (validation.valido === false) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: validation.erro,
        },
        {
          status: 400,
        }
      );
    }

    const duplicateClient =
      await prisma.clients.findFirst({
        where: {
          document: validation.dados.document,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

    if (duplicateClient) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Já existe outro cliente com este CPF ou CNPJ.",
        },
        {
          status: 409,
        }
      );
    }

    const client = await prisma.clients.update({
      where: {
        id,
      },
      data: {
        ...validation.dados,
        proposal_status:
          normalizeProposalStatus(
            body.proposal_status
          ),
      },
    });

    return NextResponse.json({
      sucesso: true,
      client,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar cliente:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar cliente.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.$transaction(async (tx) => {
      // client_id e opcional em orders. Preservamos o pedido e removemos
      // apenas o vinculo antes de excluir o cadastro do cliente.
      await tx.orders.updateMany({
        where: { client_id: id },
        data: { client_id: null },
      });

      await tx.clients.delete({
        where: { id },
      });
    });

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao excluir cliente.",
      },
      {
        status: 500,
      }
    );
  }
}

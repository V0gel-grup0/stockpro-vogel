import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import {
  buildAccessibleClientWhere,
  buildClientVisibilityWhere,
} from "@/lib/client-visibility";
import { prisma } from "@/lib/prisma";
import {
  somenteDigitos,
  validarCadastroPessoa,
} from "@/lib/validacao-cadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeProposalStatus(value: unknown) {
  const status = String(value ?? "").trim();

  return status || "Lead Frio";
}

async function documentoJaCadastrado(
  document: string,
  currentClientId?: string
) {
  const clients = await prisma.clients.findMany({
    select: {
      id: true,
      document: true,
    },
  });

  const normalizedDocument = somenteDigitos(document);

  return clients.some(
    (client) =>
      client.id !== currentClientId &&
      somenteDigitos(client.document) === normalizedDocument
  );
}

export async function GET() {
  try {
    const authorization = await authorizeApi();
    if ("response" in authorization) return authorization.response;

    const visibilityWhere = buildClientVisibilityWhere({
      id: authorization.profile.id,
      role: authorization.profile.role,
    });
    const clients = await prisma.clients.findMany({
      where: visibilityWhere,
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
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "vendedor",
      "funcionario",
      "representante",
    ]);
    if ("response" in authorization) return authorization.response;

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

    const isCpf = validation.dados.document.length === 11;
    const existingClient = await documentoJaCadastrado(
      validation.dados.document
    );

    if (existingClient) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: isCpf
            ? "Já existe um cliente cadastrado com este CPF."
            : "Já existe um cliente com este CPF ou CNPJ.",
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
        created_by: authorization.profile.id,
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
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "vendedor",
      "funcionario",
      "representante",
    ]);
    if ("response" in authorization) return authorization.response;

    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const id = String(body.id ?? "").trim();

    if (!id || !uuidPattern.test(id)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID deve ser um UUID válido.",
        },
        {
          status: 400,
        }
      );
    }

    if (["vendedor", "representante"].includes(authorization.profile.role)) {
      const ownedClient = await prisma.clients.findFirst({
        where: buildAccessibleClientWhere(
          {
            id: authorization.profile.id,
            role: authorization.profile.role,
          },
          id
        ),
        select: { id: true },
      });

      if (!ownedClient) {
        return NextResponse.json(
          { sucesso: false, erro: "Cliente não encontrado ou sem permissão." },
          { status: 404 }
        );
      }
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

    const isCpf = validation.dados.document.length === 11;
    const duplicateClient = await documentoJaCadastrado(
      validation.dados.document,
      id
    );

    if (duplicateClient) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: isCpf
            ? "Já existe um cliente cadastrado com este CPF."
            : "Já existe outro cliente com este CPF ou CNPJ.",
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
    const authorization = await authorizeApi(["administrador"]);
    if ("response" in authorization) return authorization.response;

    const { searchParams } =
      new URL(request.url);

    const id = searchParams.get("id")?.trim();

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

    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID do cliente deve ser um UUID válido.",
        },
        {
          status: 400,
        }
      );
    }

    const [client, pedidos, oportunidades, atividades, tarefas] =
      await Promise.all([
        prisma.clients.findUnique({
          where: { id },
          select: { id: true },
        }),
        prisma.orders.count({ where: { client_id: id } }),
        prisma.crm_opportunities.count({ where: { client_id: id } }),
        prisma.crm_activities.count({ where: { client_id: id } }),
        prisma.crm_tasks.count({ where: { client_id: id } }),
      ]);

    if (!client) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Cliente não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const vinculos = {
      pedidos,
      oportunidades,
      atividades,
      tarefas,
    };

    if (Object.values(vinculos).some((count) => count > 0)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Este cliente possui histórico vinculado e não pode ser excluído.",
          vinculos,
        },
        {
          status: 409,
        }
      );
    }

    await prisma.clients.delete({
      where: { id },
    });

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json(
          {
            sucesso: false,
            erro: "Cliente não encontrado.",
          },
          {
            status: 404,
          }
        );
      }

      if (error.code === "P2003") {
        return NextResponse.json(
          {
            sucesso: false,
            erro: "Este cliente possui histórico vinculado e não pode ser excluído.",
          },
          {
            status: 409,
          }
        );
      }
    }

    return NextResponse.json(
      {
        sucesso: false,
        erro: "Erro ao excluir cliente.",
      },
      {
        status: 500,
      }
    );
  }
}

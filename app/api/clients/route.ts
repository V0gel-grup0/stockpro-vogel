import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import {
  buildAccessibleClientWhere,
  buildClientVisibilityWhere,
} from "@/lib/client-visibility";
import { prisma } from "@/lib/prisma";
import { validarCadastroPessoa } from "@/lib/validacao-cadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeProposalStatus(value: unknown) {
  const status = String(value ?? "").trim();
  return status || "Lead Frio";
}

async function validateRequestedCreator(value: unknown) {
  const requestedId = String(value ?? "").trim();

  if (!requestedId) {
    return { id: null as string | null, erro: null as string | null };
  }

  if (!uuidPattern.test(requestedId)) {
    return { id: null, erro: "O cadastrador selecionado é inválido." };
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: requestedId },
    select: { id: true, status: true },
  });

  if (!profile || profile.status !== "approved") {
    return { id: null, erro: "O cadastrador selecionado não está disponível." };
  }

  return { id: profile.id, erro: null };
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
      orderBy: { created_at: "desc" },
      include: {
        profiles: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    const safeClients = clients.map(({ profiles, ...client }) => ({
      ...client,
      creator: profiles
        ? { id: profiles.id, name: profiles.name, role: profiles.role }
        : null,
    }));

    return NextResponse.json({ sucesso: true, clients: safeClients });
  } catch (error) {
    console.error("Erro ao carregar clientes:", error);
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao carregar clientes.",
      },
      { status: 500 }
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

    const body = (await request.json()) as Record<string, unknown>;

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
        { sucesso: false, erro: validation.erro },
        { status: 400 }
      );
    }

    let createdBy = authorization.profile.id;

    if (authorization.profile.role === "administrador" && "created_by" in body) {
      const creator = await validateRequestedCreator(body.created_by);
      if (creator.erro) {
        return NextResponse.json(
          { sucesso: false, erro: creator.erro },
          { status: 400 }
        );
      }
      createdBy = creator.id || authorization.profile.id;
    }

    const client = await prisma.clients.create({
      data: {
        ...validation.dados,
        proposal_status: normalizeProposalStatus(body.proposal_status),
        created_by: createdBy,
      },
    });

    return NextResponse.json({ sucesso: true, client }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar cliente:", error);
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao criar cliente.",
      },
      { status: 500 }
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

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();

    if (!id || !uuidPattern.test(id)) {
      return NextResponse.json(
        { sucesso: false, erro: "ID deve ser um UUID válido." },
        { status: 400 }
      );
    }

    if (authorization.profile.role !== "administrador") {
      const ownedClient = await prisma.clients.findFirst({
        where: buildAccessibleClientWhere(
          { id: authorization.profile.id, role: authorization.profile.role },
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
        { sucesso: false, erro: validation.erro },
        { status: 400 }
      );
    }

    const updateData: Prisma.clientsUpdateInput = {
      ...validation.dados,
      proposal_status: normalizeProposalStatus(body.proposal_status),
    };

    if (authorization.profile.role === "administrador" && "created_by" in body) {
      const creator = await validateRequestedCreator(body.created_by);
      if (creator.erro) {
        return NextResponse.json(
          { sucesso: false, erro: creator.erro },
          { status: 400 }
        );
      }

      updateData.profiles = creator.id
        ? { connect: { id: creator.id } }
        : { disconnect: true };
    }

    const client = await prisma.clients.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ sucesso: true, client });
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao atualizar cliente.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorizeApi(["administrador"]);
    if ("response" in authorization) return authorization.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: "ID é obrigatório." },
        { status: 400 }
      );
    }

    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        { sucesso: false, erro: "ID do cliente deve ser um UUID válido." },
        { status: 400 }
      );
    }

    const [client, pedidos, orcamentos, oportunidades, atividades, tarefas] =
      await Promise.all([
        prisma.clients.findUnique({ where: { id }, select: { id: true } }),
        prisma.orders.count({ where: { client_id: id } }),
        prisma.quotes.count({ where: { client_id: id } }),
        prisma.crm_opportunities.count({ where: { client_id: id } }),
        prisma.crm_activities.count({ where: { client_id: id } }),
        prisma.crm_tasks.count({ where: { client_id: id } }),
      ]);

    if (!client) {
      return NextResponse.json(
        { sucesso: false, erro: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const vinculos = { pedidos, orcamentos, oportunidades, atividades, tarefas };

    if (Object.values(vinculos).some((count) => count > 0)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Este cliente possui histórico vinculado e não pode ser excluído.",
          vinculos,
        },
        { status: 409 }
      );
    }

    await prisma.clients.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { sucesso: false, erro: "Cliente não encontrado." },
          { status: 404 }
        );
      }

      if (error.code === "P2003") {
        return NextResponse.json(
          {
            sucesso: false,
            erro: "Este cliente possui histórico vinculado e não pode ser excluído.",
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { sucesso: false, erro: "Erro ao excluir cliente." },
      { status: 500 }
    );
  }
}

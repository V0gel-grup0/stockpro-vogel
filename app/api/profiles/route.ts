import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const authorization = await authorizeApi();
    if ("response" in authorization) return authorization.response;

    const isAdministrator = authorization.profile.role === "administrador";
    const canSeeTeam = ["administrador", "gerente"].includes(
      authorization.profile.role
    );
    const visibleProfileWhere = canSeeTeam
      ? undefined
      : authorization.profile.role === "vendedor"
        ? {
            OR: [
              { id: authorization.profile.id },
              { responsible_seller_id: authorization.profile.id },
            ],
          }
        : { id: authorization.profile.id };

    const profiles = await prisma.profiles.findMany({
      where: visibleProfileWhere,
      orderBy: {
        created_at: "desc",
      },
      select: isAdministrator
        ? {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            document: true,
            phone: true,
            cep: true,
            city: true,
            street: true,
            number: true,
            no_number: true,
            neighborhood: true,
            representative_company: true,
            representative_region: true,
            access_code: true,
            seller_code: true,
            manager_code: true,
            responsible_seller_id: true,
            responsible_manager_id: true,
            created_by: true,
            permissions: true,
            approval_notes: true,
            created_at: true,
            updated_at: true,
          }
        : {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            responsible_seller_id: true,
            responsible_manager_id: true,
          },
    });

    return NextResponse.json(profiles);
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
    const authorization = await authorizeApi();
    if ("response" in authorization) return authorization.response;

    const body = await request.json();
    const { id, status, permissions } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "O ID do perfil é obrigatório." },
        { status: 400 }
      );
    }

    const isSelf = id === authorization.profile.id;
    const isAdministrator = authorization.profile.role === "administrador";

    if (!isSelf && !isAdministrator) {
      return NextResponse.json(
        { error: "Seu perfil não tem permissão para alterar este usuário." },
        { status: 403 }
      );
    }

    if (isSelf && (status !== undefined || permissions !== undefined)) {
      return NextResponse.json(
        { error: "Status e permissões não podem ser alterados pelo próprio usuário." },
        { status: 403 }
      );
    }

    const allowed = ["name", "document", "phone", "cep", "city", "street", "number", "no_number", "neighborhood"] as const;
    const data: Record<string, any> = { updated_at: new Date() };
    if (isAdministrator && status !== undefined) {
      const allowedStatuses = ["pending", "approved", "rejected", "inactive"];
      if (!allowedStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Status de perfil inválido." },
          { status: 400 }
        );
      }
      data.status = status;
    }
    if (isAdministrator && permissions !== undefined) {
      if (
        permissions === null ||
        typeof permissions !== "object" ||
        Array.isArray(permissions)
      ) {
        return NextResponse.json(
          { error: "Permissões devem ser um objeto JSON." },
          { status: 400 }
        );
      }
      data.permissions = permissions;
    }
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

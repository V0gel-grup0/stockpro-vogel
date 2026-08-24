import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";

export type AppRole =
  | "administrador"
  | "gerente"
  | "vendedor"
  | "funcionario"
  | "tecnico"
  | "representante";

type AuthenticatedProfile = NonNullable<
  Awaited<ReturnType<typeof getAuthenticatedProfile>>
>;

type AuthorizationResult =
  | {
      authorized: true;
      profile: AuthenticatedProfile;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

function authorizationError(message: string, status: 401 | 403) {
  return NextResponse.json(
    {
      sucesso: false,
      error: message,
      erro: message,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function authorizeApi(
  allowedRoles?: readonly AppRole[]
): Promise<AuthorizationResult> {
  const profile = await getAuthenticatedProfile();

  if (!profile) {
    return {
      authorized: false,
      response: authorizationError("Não autenticado.", 401),
    };
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(profile.role as AppRole)
  ) {
    return {
      authorized: false,
      response: authorizationError(
        "Seu perfil não tem permissão para esta operação.",
        403
      ),
    };
  }

  return {
    authorized: true,
    profile,
  };
}

import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();

    if (!profile) {
      return NextResponse.json(
        { error: "Não autenticado" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { ASSEMBLY_DELETE_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import { recordOfflineAssembly, OfflineStockError } from "@/lib/offline-stock-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function assemblyErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro ao registrar montagem.";

  if (message.startsWith("Estoque insuficiente para montar")) {
    return NextResponse.json({ sucesso: false, erro: message }, { status: 400 });
  }

  if (message.startsWith("Nenhuma composição cadastrada para")) {
    return NextResponse.json({ sucesso: false, erro: message }, { status: 400 });
  }

  if (message.includes("expired transaction") || message.includes("Transaction API error")) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: "A montagem demorou mais que o esperado para ser processada. Nenhuma alteração parcial foi salva. Tente novamente em alguns segundos.",
      },
      { status: 503 }
    );
  }

  console.error("Erro inesperado ao registrar montagem:", error);
  return NextResponse.json(
    { sucesso: false, erro: "Não foi possível registrar a montagem. Tente novamente ou informe o suporte se o problema continuar." },
    { status: 500 }
  );
}

export async function GET() {
  try { const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response; const assemblies = await prisma.assemblies.findMany({ orderBy: { created_at: "desc" } }); return NextResponse.json({ sucesso: true, assemblies: toJsonSafe(assemblies) }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao carregar montagens." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const authorization=await authorizeApi(["administrador","gerente","tecnico"]);
    if("response" in authorization)return authorization.response;
    const body=await request.json();
    const result=await prisma.$transaction(tx=>recordOfflineAssembly(tx,authorization.profile,body),{maxWait:5000,timeout:30000});
    return NextResponse.json({sucesso:true,assembly:toJsonSafe(result.assembly)},{status:201});
  }catch(error){if(error instanceof OfflineStockError)return NextResponse.json({sucesso:false,erro:error.message},{status:error.status});return assemblyErrorResponse(error);}
}

export async function PUT(request: Request) {
  try { const authorization = await authorizeApi(["administrador", "gerente", "tecnico"]); if ("response" in authorization) return authorization.response; const body = await request.json(); const id = text(body.id); const quantity = Number(body.quantity || 0); if (!id || !text(body.equipment) || quantity <= 0) return NextResponse.json({ sucesso: false, erro: "Dados inválidos." }, { status: 400 }); const assembly = await prisma.assemblies.update({ where: { id }, data: { equipment: text(body.equipment), quantity: Math.trunc(quantity), technician_id: text(body.technician_id) || null } }); return NextResponse.json({ sucesso: true, assembly: toJsonSafe(assembly) }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao atualizar montagem." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try { const authorization = await authorizeApi(ASSEMBLY_DELETE_ROLES); if ("response" in authorization) return authorization.response; const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ sucesso: false, erro: "ID é obrigatório." }, { status: 400 }); await prisma.assemblies.delete({ where: { id } }); return NextResponse.json({ sucesso: true }); }
  catch (error) { return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao excluir montagem." }, { status: 500 }); }
}


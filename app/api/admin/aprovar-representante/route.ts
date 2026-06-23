import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { representante_id } = await request.json();
    if (!representante_id) return NextResponse.json({ error: "ID do representante é obrigatório." }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 500 });
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: aprovador } = await supabaseAdmin.from("profiles").select("id, role, name").eq("id", userData.user.id).maybeSingle();
    if (!aprovador) return NextResponse.json({ error: "Perfil do aprovador não encontrado." }, { status: 403 });
    if (!["administrador", "vendedor"].includes(aprovador.role)) return NextResponse.json({ error: "Você não tem permissão para aprovar representantes." }, { status: 403 });
    const { data: representante } = await supabaseAdmin.from("profiles").select("id, role, status, responsible_seller_id").eq("id", representante_id).maybeSingle();
    if (!representante) return NextResponse.json({ error: "Representante não encontrado." }, { status: 404 });
    if (representante.role !== "representante") return NextResponse.json({ error: "Este usuário não é um representante." }, { status: 400 });
    if (aprovador.role === "vendedor" && representante.responsible_seller_id !== aprovador.id) return NextResponse.json({ error: "Este representante não está vinculado a você." }, { status: 403 });
    const { error: updateError } = await supabaseAdmin.from("profiles").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", representante_id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Representante aprovado com sucesso." });
  } catch (error: any) { return NextResponse.json({ error: error.message || "Erro inesperado ao aprovar representante." }, { status: 500 }); }
}

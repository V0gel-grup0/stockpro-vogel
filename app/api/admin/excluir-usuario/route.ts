import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID do usuário é obrigatório." }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 500 });
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await supabaseAdmin.from("profiles").update({ responsible_seller_id: null, responsible_manager_id: null, created_by: null }).or(`responsible_seller_id.eq.${id},responsible_manager_id.eq.${id},created_by.eq.${id}`);
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", id);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Usuário excluído com sucesso." });
  } catch (error: any) { return NextResponse.json({ error: error.message || "Erro inesperado ao excluir usuário." }, { status: 500 }); }
}

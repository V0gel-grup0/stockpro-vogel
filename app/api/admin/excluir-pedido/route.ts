import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { order_id } = await request.json();
    if (!order_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 500 });
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabaseAdmin.from("orders").delete().eq("id", order_id).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Pedido excluído com sucesso.", deleted: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro inesperado ao excluir pedido." }, { status: 500 });
  }
}

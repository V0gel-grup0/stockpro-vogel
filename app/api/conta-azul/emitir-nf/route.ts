import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    const configured = Boolean(
      process.env.CONTA_AZUL_CLIENT_ID &&
      process.env.CONTA_AZUL_CLIENT_SECRET &&
      process.env.CONTA_AZUL_REFRESH_TOKEN
    );

    if (!configured) {
      await supabaseAdmin
        .from("orders")
        .update({
          conta_azul_status: "pendente_configuracao",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order_id);

      return NextResponse.json({
        ok: false,
        error: "Conta Azul ainda não configurado. Configure CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REFRESH_TOKEN na Vercel.",
      }, { status: 400 });
    }

    // Ponto preparado para integração real com a API/OAuth da Conta Azul.
    // Aqui o sistema já recebe o pedido, valida as credenciais e marca a solicitação.
    await supabaseAdmin
      .from("orders")
      .update({
        conta_azul_status: "solicitada",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    return NextResponse.json({
      ok: true,
      message: "Solicitação de NF enviada para rotina Conta Azul.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao emitir NF." }, { status: 500 });
  }
}

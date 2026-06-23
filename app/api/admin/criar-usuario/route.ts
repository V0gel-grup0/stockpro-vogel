import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function gerarCodigo(tipo: string) {
  const numero = Math.floor(100000 + Math.random() * 900000);
  if (tipo === "gerente") return `GER${numero}`;
  if (tipo === "vendedor") return `VEN${numero}`;
  if (tipo === "funcionario") return `FUN${numero}`;
  if (tipo === "tecnico") return `TEC${numero}`;
  if (tipo === "representante") return `REP${numero}`;
  return `USR${numero}`;
}
function somenteNumeros(valor: string) { return String(valor || "").replace(/\D/g, ""); }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, senha, tipo, document, phone, cep, city, street, number, no_number, neighborhood, seller_code } = body;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor." }, { status: 500 });
    if (!nome || !email || !senha || !tipo) return NextResponse.json({ error: "Preencha nome, e-mail, senha e tipo." }, { status: 400 });

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    let responsibleSellerId: string | null = null;
    if (tipo === "representante") {
      if (!seller_code) return NextResponse.json({ error: "Código do vendedor responsável é obrigatório para representante." }, { status: 400 });
      const codigoVendedor = String(seller_code).trim().toUpperCase();
      const { data: vendedor, error: vendedorError } = await supabaseAdmin.from("profiles").select("id, name, seller_code").eq("role", "vendedor").eq("seller_code", codigoVendedor).maybeSingle();
      if (vendedorError) return NextResponse.json({ error: vendedorError.message }, { status: 400 });
      if (!vendedor) return NextResponse.json({ error: "Nenhum vendedor encontrado com esse código." }, { status: 404 });
      responsibleSellerId = vendedor.id;
    }

    const { data: usuarioCriado, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, tipo } });
    if (erroAuth) return NextResponse.json({ error: erroAuth.message }, { status: 400 });
    const userId = usuarioCriado.user?.id;
    if (!userId) return NextResponse.json({ error: "Usuário criado, mas não retornou ID." }, { status: 500 });

    const codigo = gerarCodigo(tipo);
    const sellerCode = tipo === "vendedor" ? codigo : null;
    const managerCode = tipo === "gerente" ? codigo : null;
    const { error: erroPerfil } = await supabaseAdmin.from("profiles").insert({
      id: userId, email, role: tipo, status: ["representante", "funcionario", "tecnico"].includes(tipo) ? "pending" : "approved", name: nome,
      document: somenteNumeros(document), phone: somenteNumeros(phone), cep: somenteNumeros(cep), city: city || "", street: street || "", number: no_number ? "" : number || "", no_number: Boolean(no_number), neighborhood: neighborhood || "",
      access_code: codigo, seller_code: sellerCode, manager_code: managerCode, responsible_seller_id: responsibleSellerId, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    if (erroPerfil) { await supabaseAdmin.auth.admin.deleteUser(userId); return NextResponse.json({ error: erroPerfil.message }, { status: 400 }); }
    return NextResponse.json({ ok: true, message: "Usuário criado com sucesso.", usuario: { id: userId, nome, email, tipo, codigo, seller_code: sellerCode, responsible_seller_id: responsibleSellerId } });
  } catch (error: any) { return NextResponse.json({ error: error.message || "Erro inesperado." }, { status: 500 }); }
}

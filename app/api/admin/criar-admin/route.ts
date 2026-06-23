import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
function somenteNumeros(valor: string) { return String(valor || "").replace(/\D/g, ""); }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { codigo, nome, email, senha, document, phone, cep, city, street, number, neighborhood } = body;
    if (!process.env.ADMIN_SETUP_CODE) return NextResponse.json({ error: "ADMIN_SETUP_CODE não configurado no .env.local." }, { status: 500 });
    if (codigo !== process.env.ADMIN_SETUP_CODE) return NextResponse.json({ error: "Código secreto incorreto." }, { status: 401 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
    if (!nome || !email || !senha) return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios." }, { status: 400 });
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: usuarioCriado, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, tipo: "administrador" } });
    if (erroAuth) return NextResponse.json({ error: erroAuth.message }, { status: 400 });
    const userId = usuarioCriado.user?.id;
    if (!userId) return NextResponse.json({ error: "Usuário criado, mas o ID não foi retornado." }, { status: 500 });
    const { error: erroPerfil } = await supabaseAdmin.from("profiles").insert({ id: userId, email, role: "administrador", status: "approved", name: nome, document: somenteNumeros(document), phone: somenteNumeros(phone), cep: somenteNumeros(cep), city: city || "", street: street || "", number: number || "", no_number: false, neighborhood: neighborhood || "", access_code: "ADM000001", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (erroPerfil) { await supabaseAdmin.auth.admin.deleteUser(userId); return NextResponse.json({ error: erroPerfil.message }, { status: 400 }); }
    return NextResponse.json({ ok: true, message: "Administrador criado com sucesso.", usuario: { id: userId, nome, email, role: "administrador" } });
  } catch (error: any) { return NextResponse.json({ error: error.message || "Erro inesperado ao criar administrador." }, { status: 500 }); }
}

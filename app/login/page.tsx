"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function entrar() {
    setLoading(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: login.trim(), password: senha });
    setLoading(false);
    if (error) { setMsg(error.message || "Erro ao fazer login."); return; }
    router.replace("/");
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <img src="/logo-vogel.png" alt="Grupo Vogel" className="login-logo" />
        <h1>StockPro Vogel</h1>
        <p>Sistema profissional para estoque, pedidos, usuários, representantes, vendas, relatórios e NF.</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Entrar</h2>
          <p>Acesse o sistema com seu e-mail e senha cadastrada.</p>

          <div className="field"><label>E-mail</label><input className="input" value={login} onChange={(e) => setLogin(e.target.value)} /></div>
          <div className="field"><label>Senha</label><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} /></div>

          <button className="btn btn-blue" onClick={entrar} disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>

          <div style={{ display: "grid", gap: 10 }}>
            <button className="btn btn-gray" onClick={() => (window.location.href = "/cadastrar-usuario?tipo=representante")}>Quero ser representante</button>
          </div>

          {msg && <div style={{ color: "#f87171", fontWeight: 800 }}>{msg}</div>}
        </div>
      </section>
    </main>
  );
}

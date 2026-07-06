"use client";

import { useEffect, useState } from "react";

type FormState = {
  nome: string;
  email: string;
  senha: string;
  tipo: string;
  document: string;
  phone: string;
  cep: string;
  city: string;
  street: string;
  number: string;
  no_number: boolean;
  neighborhood: string;
  seller_code: string;
};

const empty: FormState = {
  nome: "",
  email: "",
  senha: "",
  tipo: "representante",
  document: "",
  phone: "",
  cep: "",
  city: "",
  street: "",
  number: "",
  no_number: false,
  neighborhood: "",
  seller_code: "",
};

function onlyNumbers(value: string) { return String(value || "").replace(/\D/g, ""); }
function maskCpfCnpj(value: string) {
  const n = onlyNumbers(value).slice(0, 14);
  if (n.length <= 11) return n.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return n.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
function maskPhone(value: string) {
  const n = onlyNumbers(value).slice(0, 11);
  if (n.length <= 10) return n.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return n.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function maskCep(value: string) { return onlyNumbers(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2"); }

export default function CadastrarUsuarioPage() {
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const tipo = urlParams.get("tipo");

  if (
    tipo === "representante" ||
    tipo === "funcionario" ||
    tipo === "tecnico" ||
    tipo === "vendedor" ||
    tipo === "gerente"
  ) {
    setForm((a) => ({ ...a, tipo }));
  }
}, []);

  function set(campo: keyof FormState, valor: string | boolean) { setForm((a) => ({ ...a, [campo]: valor })); }

  async function buscarCepPorValor(valorCep: string) {
    const cepLimpo = onlyNumbers(valorCep);
    if (cepLimpo.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) { setMsg("CEP não encontrado."); return; }
      setForm((a) => ({ ...a, cep: maskCep(cepLimpo), city: dados.localidade || "", street: dados.logradouro || "", neighborhood: dados.bairro || "" }));
    } catch { setMsg("Erro ao buscar CEP. Verifique sua internet."); }
  }

  async function salvar() {
    setLoading(true); setMsg("");
    const payload = { ...form, document: onlyNumbers(form.document), phone: onlyNumbers(form.phone), cep: onlyNumbers(form.cep), number: form.no_number ? "" : form.number, seller_code: form.seller_code.trim().toUpperCase() };
    try {
      const res = await fetch("/api/admin/criar-usuario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Erro ao criar usuário."); return; }
      setMsg(`Cadastro enviado/criado com sucesso. Código: ${data.usuario.codigo}. Se ficar pendente, aguarde análise do administrador.`);
      setForm(empty);
    } catch { setMsg("Erro inesperado ao salvar usuário."); }
    finally { setLoading(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "white", padding: "40px" }}>
      <section className="card">
        <h1 style={{ fontSize: 34, margin: "0 0 8px", fontWeight: 900 }}>Cadastrar usuário</h1>
        <p style={{ color: "#94a3b8", marginBottom: 30 }}>Solicite ou crie acesso como representante, vendedor, gerente, técnico/montador ou funcionário.</p>
        <div className="form-grid">
          <Campo label="Nome" value={form.nome} onChange={(v) => set("nome", v)} />
          <Campo label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Campo label="Senha" type="password" value={form.senha} onChange={(v) => set("senha", v)} />
          <div className="field"><label>Tipo de acesso</label><select className="input" value={form.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="representante">Representante</option><option value="vendedor">Vendedor</option><option value="gerente">Gerente</option><option value="tecnico">Técnico/Montador</option><option value="funcionario">Funcionário</option></select></div>
          {form.tipo === "representante" && <Campo label="Código do vendedor responsável" value={form.seller_code} onChange={(v) => set("seller_code", v.toUpperCase().trim())} />}
          <Campo label="CPF ou CNPJ" value={form.document} onChange={(v) => set("document", maskCpfCnpj(v))} />
          <Campo label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} />
          <Campo label="CEP" value={form.cep} onChange={(v) => { const c = maskCep(v); set("cep", c); if (onlyNumbers(c).length === 8) buscarCepPorValor(c); }} onBlur={() => buscarCepPorValor(form.cep)} />
          <Campo label="Cidade" value={form.city} onChange={(v) => set("city", v)} />
          <Campo label="Rua" value={form.street} onChange={(v) => set("street", v)} />
          <div className="field"><label>Número</label><input className="input" value={form.number} disabled={form.no_number} onChange={(e) => set("number", e.target.value)} /><button type="button" className={form.no_number ? "btn btn-blue" : "btn btn-gray"} style={{ marginTop: 10, minHeight: 38, padding: "8px 14px" }} onClick={() => { const n = !form.no_number; set("no_number", n); if (n) set("number", ""); }}>{form.no_number ? "Sem número marcado" : "Sem número"}</button></div>
          <Campo label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} />
        </div>
        <div className="form-actions"><button className="btn btn-blue" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : "Salvar usuário"}</button><button className="btn btn-gray" onClick={() => window.history.back()}>Voltar</button></div>
        {msg && <div style={{ marginTop: 26, padding: 16, borderRadius: 16, background: "#020617", color: msg.includes("sucesso") ? "#4ade80" : "#f87171", fontWeight: 800, border: "1px solid rgba(148,163,184,.25)" }}>{msg}</div>}
      </section>
    </main>
  );
}

function Campo({ label, value, onChange, type = "text", onBlur }: { label: string; value: string; type?: string; onChange: (v: string) => void; onBlur?: () => void; }) {
  return <div className="field"><label>{label}</label><input className="input" type={type} value={value} onBlur={onBlur} onChange={(e) => onChange(e.target.value)} /></div>;
}

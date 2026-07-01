"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

type Role = "administrador" | "gerente" | "vendedor" | "funcionario" | "tecnico" | "representante";
type Profile = {
  id: string;
  email: string;
  role: Role;
  status: string;
  name: string;
  document?: string;
  phone?: string;
  cep?: string;
  city?: string;
  street?: string;
  number?: string;
  no_number?: boolean;
  neighborhood?: string;
  access_code?: string;
  seller_code?: string;
  manager_code?: string;
  responsible_seller_id?: string | null;
  permissions?: Record<string, boolean>;
};
type AnyRow = Record<string, any>;

type SearchProps = { search: string };

function onlyNumbers(value: string) {
  return String(value || "").replace(/\D/g, "");
}
function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function maskCpfCnpj(value: string) {
  const n = onlyNumbers(value).slice(0, 14);
  if (n.length <= 11) {
    return n
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return n
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function maskPhone(value: string) {
  const n = onlyNumbers(value).slice(0, 11);
  if (n.length <= 10) return n.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return n.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function maskCep(value: string) {
  return onlyNumbers(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}
async function buscarCep(valorCep: string) {
  const cep = onlyNumbers(valorCep);
  if (cep.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const d = await r.json();
  if (d.erro) return null;
  return { cep: maskCep(cep), city: d.localidade || "", street: d.logradouro || "", neighborhood: d.bairro || "" };
}
function formatRole(role?: string) {
  return (
    {
      administrador: "Administrador",
      gerente: "Gerente",
      vendedor: "Vendedor",
      funcionario: "Funcionário",
      tecnico: "Técnico",
      representante: "Representante",
    } as Record<string, string>
  )[role || ""] || role || "";
}
function textMatch(item: AnyRow, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return JSON.stringify(item).toLowerCase().includes(q);
}

const EQUIPAMENTOS = [
  "Celt5000 - 220V 1 turbina",
  "Celt5000 - 220V 2 turbinas",
  "Celt5000 - 220V 3 turbinas",
  "Celt5000 - 380V 1 turbina",
  "Celt5000 - 380V 2 turbinas",
  "Celt5000 - 380V 3 turbinas",
  "Celt5000 Plus - 220V 1 turbina + Mínima",
  "Celt5000 Plus - 220V 2 turbinas + Mínima",
  "Celt5000 Plus - 220V 3 turbinas + Mínima",
  "Celt5000 Plus - 380V 1 turbina + Mínima",
  "Celt5000 Plus - 380V 2 turbinas + Mínima",
  "Celt5000 Plus - 380V 3 turbinas + Mínima",
  "CeltPlus - 220V",
  "CeltPlus - 380V",
];

type ComposicaoItem = { name: string; category: string; quantity: number };

function itemComposicao(name: string, quantity = 1, category = "Componente") {
  return { name, quantity, category };
}

function baseCelt5000(voltagem: "220V" | "380V", turbinas: 1 | 2 | 3, plus = false): ComposicaoItem[] {
  const sufixoInversor = voltagem === "380V" ? " - 380V" : "";
  const qtdInversor = voltagem === "220V" ? turbinas : 1;
  const rele = turbinas === 1 ? "Relê simples" : "Relê duplo";
  const quadro = turbinas === 3 ? "Quadro 60 X 60 X 20" : "Quadro 50 X 40 X 20";

  return [
    itemComposicao(`Inversor 5CV${sufixoInversor}`, qtdInversor, "Inversor"),
    itemComposicao(quadro, 1, "Quadro"),
    itemComposicao("Contator 32a", 1, "Elétrica"),
    itemComposicao("Chave seletora liga/desliga", 1, "Elétrica"),
    itemComposicao("Veneziana com filtro 106 X 106 X 13,5 mm", 1, "Ventilação"),
    itemComposicao("Veneziana com filtro 150 X 150 X 13,5 mm", 1, "Ventilação"),
    itemComposicao("Ventilador 120 X 120 X 38", 1, "Ventilação"),
    itemComposicao(rele, turbinas, "Elétrica"),
    itemComposicao("Prensa cabo", 1, "Acabamento"),
    itemComposicao("Borne 4mm", turbinas * 3, "Elétrica"),
    itemComposicao("Tampa borne", turbinas, "Elétrica"),
    itemComposicao("Poste borne", 2, "Elétrica"),
    itemComposicao("Trilho Din 0,2 m", 1, "Elétrica"),
    itemComposicao("Suporte trilho Din", 2, "Elétrica"),
    itemComposicao("Canaleta 30cm", 1, "Acabamento"),
    itemComposicao("Adesivo painel", 1, "Acabamento"),
    itemComposicao(`Adesivo tensão ${voltagem}`, 1, "Acabamento"),
    itemComposicao("Manual", 1, "Documentação"),
    itemComposicao("Fio 2,5", Number((2.15 * turbinas).toFixed(2)), "Fiação"),
    itemComposicao("Fio 0,50", Number((2.8 * turbinas).toFixed(2)), "Fiação"),
    itemComposicao("Caixa de papelão", 1, "Embalagem"),
  ];
}

const COMPOSICOES_EQUIPAMENTOS: Record<string, ComposicaoItem[]> = {
  "Celt5000 - 220V 1 turbina": baseCelt5000("220V", 1),
  "Celt5000 - 220V 2 turbinas": baseCelt5000("220V", 2),
  "Celt5000 - 220V 3 turbinas": baseCelt5000("220V", 3),
  "Celt5000 - 380V 1 turbina": baseCelt5000("380V", 1),
  "Celt5000 - 380V 2 turbinas": baseCelt5000("380V", 2),
  "Celt5000 - 380V 3 turbinas": baseCelt5000("380V", 3),
  "Celt5000 Plus - 220V 1 turbina + Mínima": baseCelt5000("220V", 1, true),
  "Celt5000 Plus - 220V 2 turbinas + Mínima": baseCelt5000("220V", 2, true),
  "Celt5000 Plus - 220V 3 turbinas + Mínima": baseCelt5000("220V", 3, true),
  "Celt5000 Plus - 380V 1 turbina + Mínima": baseCelt5000("380V", 1, true),
  "Celt5000 Plus - 380V 2 turbinas + Mínima": baseCelt5000("380V", 2, true),
  "Celt5000 Plus - 380V 3 turbinas + Mínima": baseCelt5000("380V", 3, true),
  "CeltPlus - 220V": [
    itemComposicao("Inversor 2CV 220V", 1, "Inversor"),
    itemComposicao("Botão liga/desliga", 1, "Elétrica"),
  ],
  "CeltPlus - 380V": [
    itemComposicao("Inversor 2CV 380V", 1, "Inversor"),
    itemComposicao("Botão liga/desliga", 1, "Elétrica"),
  ],
};

function composicaoDoEquipamento(equipment: string) {
  return COMPOSICOES_EQUIPAMENTOS[equipment] || [];
}

function normalizarComponente(nome: string) {
  return String(nome || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function quantidadeFormatada(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

async function cadastrarComponentesPadrao(equipamentoSelecionado?: string) {
  const equipamentos = equipamentoSelecionado ? [equipamentoSelecionado] : EQUIPAMENTOS;
  let criados = 0;
  let atualizados = 0;

  for (const equipamento of equipamentos) {
    for (const item of composicaoDoEquipamento(equipamento)) {
      const { data: existente } = await supabase
        .from("components")
        .select("*")
        .eq("name", item.name)
        .eq("equipment", equipamento)
        .maybeSingle();

      if (existente) {
        const { error } = await supabase
          .from("components")
          .update({ category: item.category, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
        if (error) throw new Error(error.message);
        atualizados += 1;
      } else {
        const { error } = await supabase.from("components").insert({
          name: item.name,
          category: item.category,
          equipment: equipamento,
          quantity: 0,
          min_stock: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        criados += 1;
      }
    }
  }

  return { criados, atualizados };
}

async function baixarComponentesDaComposicao(equipmentName: string, equipmentQty: number, profileId: string, origem: string) {
  const composicao = composicaoDoEquipamento(equipmentName);
  const qtdEquipamento = Number(equipmentQty || 0);

  if (!composicao.length || qtdEquipamento <= 0) return;

  const { data: componentes, error } = await supabase
    .from("components")
    .select("*")
    .eq("equipment", equipmentName);

  if (error) throw new Error(error.message);

  const porNome = new Map<string, AnyRow>();
  (componentes || []).forEach((item) => porNome.set(normalizarComponente(item.name), item));

  const faltando = composicao.filter((item) => !porNome.get(normalizarComponente(item.name)));
  if (faltando.length) {
    throw new Error(
      `Cadastre primeiro a lista padrão de componentes para ${equipmentName}. Faltando: ${faltando
        .map((item) => item.name)
        .join(", ")}.`
    );
  }

  const insuficientes = composicao
    .map((item) => {
      const componente = porNome.get(normalizarComponente(item.name));
      const necessario = Number((Number(item.quantity || 0) * qtdEquipamento).toFixed(4));
      const disponivel = Number(componente?.quantity || 0);
      return { item, componente, necessario, disponivel };
    })
    .filter((item) => item.disponivel < item.necessario);

  if (insuficientes.length) {
    throw new Error(
      `Estoque insuficiente para montar/baixar ${equipmentName}: ${insuficientes
        .map((i) => `${i.item.name} precisa ${quantidadeFormatada(i.necessario)} e tem ${quantidadeFormatada(i.disponivel)}`)
        .join("; ")}.`
    );
  }

  for (const item of composicao) {
    const componente = porNome.get(normalizarComponente(item.name));
    if (!componente) continue;

    const necessario = Number((Number(item.quantity || 0) * qtdEquipamento).toFixed(4));
    const novaQuantidade = Number((Number(componente.quantity || 0) - necessario).toFixed(4));

    const { error: erroAtualizacao } = await supabase
      .from("components")
      .update({ quantity: novaQuantidade, updated_at: new Date().toISOString() })
      .eq("id", componente.id);

    if (erroAtualizacao) throw new Error(erroAtualizacao.message);

    await supabase.from("movements").insert({
      type: "saida",
      item_type: "componente",
      item_id: componente.id,
      quantity: necessario,
      notes: `Baixa automática de componente: ${origem} - ${equipmentName}`,
      created_by: profileId,
    });
  }
}

const CATEGORIAS_REVENDA = [
  {
    category: "Lâmpadas dimerizáveis",
    subcategories: [
      "lampada branca 220V",
      "lampada amarela 220V",
      "lampada branca 127V",
      "lampada amarela 127V",
    ],
  },
  {
    category: "Dimmer Vogel",
    subcategories: ["Dimmer"],
  },
  {
    category: "Soquetes E-27",
    subcategories: ["EMBORRACHADO"],
  },
];


const PRODUTOS_PADRAO = [
  { name: "Lâmpada LED dimerizável E27", sku: "REV-LAMP-E27", category: "Lâmpadas dimerizáveis", subcategory: "E27" },
  { name: "Lâmpada LED dimerizável PAR20", sku: "REV-LAMP-PAR20", category: "Lâmpadas dimerizáveis", subcategory: "PAR20" },
  { name: "Dimmer rotativo", sku: "REV-DIM-ROT", category: "Dimmer", subcategory: "Dimmer rotativo" },
  { name: "Dimmer Wi-Fi", sku: "REV-DIM-WIFI", category: "Dimmer", subcategory: "Dimmer Wi-Fi" },
  { name: "Soquete E-27 porcelana", sku: "REV-SOQ-E27-POR", category: "Soquetes E-27", subcategory: "Porcelana" },
];

const menuByRole: Record<Role, string[]> = {
  administrador: ["Dashboard", "Produtos", "Movimentações", "Clientes", "Fornecedores", "Montagens", "Funcionários", "Gerentes", "Vendedores", "Técnicos", "Representantes", "Análise de Cadastros", "Pedidos", "Componentes", "Conta Azul", "Relatórios", "Meu Perfil"],
  gerente: ["Dashboard", "Produtos", "Movimentações", "Clientes", "Fornecedores", "Montagens", "Funcionários", "Vendedores", "Representantes", "Pedidos", "Relatórios", "Meu Perfil"],
  vendedor: ["Dashboard", "Produtos", "Clientes", "Representantes", "Pedidos", "Meu Perfil"],
  funcionario: ["Dashboard", "Produtos", "Movimentações", "Clientes", "Pedidos", "Meu Perfil"],
  tecnico: ["Dashboard", "Montagens", "Componentes", "Meu Perfil"],
  representante: ["Dashboard", "Clientes", "Pedidos", "Meu Perfil"],
};

export default function StockProApp() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [page, setPage] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<string[]>([]);

  useEffect(() => {
    carregarSessao();
  }, []);

  useEffect(() => {
    if (profile) carregarNotificacoes();
  }, [profile]);

  async function carregarSessao() {
    setSessionLoading(true);
    const { data: s } = await supabase.auth.getSession();
    const user = s.session?.user;
    if (!user) {
      router.replace("/login");
      return;
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) console.error("Erro ao carregar perfil:", error);
    if (!data || data.status !== "approved") {
      setProfile(null);
      setSessionLoading(false);
      return;
    }
    setProfile(data as Profile);
    setSessionLoading(false);
  }

  async function carregarNotificacoes() {
    const items: string[] = [];
    const { data: pending } = await supabase.from("profiles").select("id, role, name").eq("status", "pending").limit(20);
    if (pending?.length) items.push(`${pending.length} cadastro(s) aguardando análise`);
    const { data: lowProducts } = await supabase.from("products").select("id, name, quantity, min_stock").lte("quantity", 5).limit(20);
    const baixos = (lowProducts || []).filter((p) => Number(p.quantity || 0) <= Number(p.min_stock || 0));
    if (baixos.length) items.push(`${baixos.length} produto(s) abaixo do estoque mínimo`);
    const { data: pendingNf } = await supabase.from("orders").select("id").in("invoice_status", ["error", "pending", "not_issued"]).limit(20);
    if (pendingNf?.length) items.push(`${pendingNf.length} pedido(s) com NF pendente ou não emitida`);
    setNotificationItems(items);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (sessionLoading) return <FullScreenMessage title="Carregando..." desc="Abrindo o sistema StockPro." />;
  if (!profile) return <FullScreenMessage title="Perfil não encontrado" desc="Seu login existe, mas seu cadastro não foi encontrado ou ainda não foi aprovado na tabela profiles."><button className="btn btn-blue" onClick={logout}>Sair e voltar para o login</button></FullScreenMessage>;

  const menus = menuByRole[profile.role] || ["Meu Perfil"];

  return (
    <div className={`app-shell ${!menuOpen ? "sidebar-closed" : ""}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="menu-toggle" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? "×" : "☰"}</button>
          <div className="search-wrap">
            <input className="input search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar no módulo atual..." />
          </div>
          <div style={{ position: "relative" }}>
            <button className="icon-button" onClick={() => setNotificationsOpen((v) => !v)}>🔔{notificationItems.length > 0 ? ` ${notificationItems.length}` : ""}</button>
            {notificationsOpen && <div className="notifications-panel"><strong>Notificações</strong>{notificationItems.length === 0 ? <p>Nenhuma notificação.</p> : notificationItems.map((n) => <p key={n}>{n}</p>)}<button className="btn btn-gray" onClick={carregarNotificacoes}>Atualizar</button></div>}
          </div>
        </div>
      </header>
      <div className={`layout-grid ${!menuOpen ? "menu-collapsed" : ""}`}>
        {menuOpen && <aside className="sidebar">
          <div className="brand"><img src="/logo-vogel.png" alt="Grupo Vogel" className="brand-logo" /><div className="brand-text"><strong>StockPro</strong><small>Grupo Vogel Brasil</small></div></div>
          <nav className="menu-list">{menus.map((item) => <button key={item} className={`menu-button ${page === item ? "active" : ""}`} onClick={() => setPage(item)}>{item}</button>)}</nav>
          <div className="sidebar-footer"><strong>{profile.name || "Usuário"}</strong><small>{formatRole(profile.role)}</small>{profile.access_code && <small>Código: {profile.access_code}</small>}<button className="btn btn-gray" onClick={logout}>Sair</button></div>
        </aside>}
        <main className="main-content">
          {page === "Dashboard" && <Dashboard profile={profile} />}
          {page === "Produtos" && <Produtos search={search} />}
          {page === "Movimentações" && <Movimentacoes profile={profile} />}
          {page === "Clientes" && <Pessoas title="Clientes" table="clients" kind="cliente" search={search} profile={profile} />}
          {page === "Fornecedores" && <Pessoas title="Fornecedores" table="suppliers" kind="fornecedor" search={search} profile={profile} />}
          {page === "Montagens" && <Montagens profile={profile} search={search} />}
          {page === "Funcionários" && <Usuarios role="funcionario" title="Funcionários" currentUser={profile} search={search} />}
          {page === "Gerentes" && <Usuarios role="gerente" title="Gerentes" currentUser={profile} search={search} />}
          {page === "Vendedores" && <Usuarios role="vendedor" title="Vendedores" currentUser={profile} search={search} />}
          {page === "Técnicos" && <Usuarios role="tecnico" title="Técnicos" currentUser={profile} search={search} />}
          {page === "Representantes" && <Usuarios role="representante" title="Representantes" currentUser={profile} search={search} />}
          {page === "Análise de Cadastros" && <AnaliseCadastros currentUser={profile} search={search} />}
          {page === "Pedidos" && <Pedidos profile={profile} search={search} />}
          {page === "Componentes" && <Componentes search={search} />}
          {page === "Conta Azul" && <ContaAzul />}
          {page === "Relatórios" && <Relatorios profile={profile} />}
          {page === "Meu Perfil" && <MeuPerfil profile={profile} onUpdated={carregarSessao} />}
        </main>
      </div>
    </div>
  );
}

function FullScreenMessage({ title, desc, children }: { title: string; desc: string; children?: ReactNode }) { return <main style={{ minHeight: "100vh", background: "#020617", color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}><section className="card" style={{ maxWidth: 560 }}><h1 style={{ fontSize: 30, marginBottom: 12 }}>{title}</h1><p style={{ color: "#94a3b8", marginBottom: 24 }}>{desc}</p>{children}</section></main>; }
function Title({ title, desc }: { title: string; desc?: string }) { return <div className="page-title"><h1>{title}</h1>{desc && <p>{desc}</p>}</div>; }
function Field({ label, value, onChange, type = "text", onBlur, disabled = false }: { label: string; value: string | number; type?: string; disabled?: boolean; onBlur?: () => void; onChange: (value: string) => void }) { return <div className="field"><label>{label}</label><input className="input" type={type} value={value} disabled={disabled} onBlur={onBlur} onChange={(e) => onChange(e.target.value)} /></div>; }
function SelectField({ label, value, onChange, children }: { label: string; value: string; children?: ReactNode; onChange: (value: string) => void }) { return <div className="field"><label>{label}</label><select className="input" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></div>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="field full-field"><label>{label}</label><textarea className="input" value={value} onChange={(e) => onChange(e.target.value)} /></div>; }
function Message({ text }: { text: string }) { const success = text.toLowerCase().includes("sucesso") || text.toLowerCase().includes("excluído") || text.toLowerCase().includes("atualizado"); return <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: "#020617", color: success ? "#4ade80" : "#f87171", fontWeight: 800, border: "1px solid rgba(148,163,184,.25)" }}>{text}</div>; }
function StatCard({ label, value, color }: { label: string; value: string; color?: string; key?: any }) { return <div className="stat-card"><span>{label}</span><strong style={{ color }}>{value}</strong></div>; }

function Dashboard({ profile }: { profile: Profile }) {
  const [counts, setCounts] = useState({ products: 0, clients: 0, orders: 0, pending: 0, low: 0 });
  useEffect(() => { (async () => {
    const [p, c, o, pend] = await Promise.all([
      supabase.from("products").select("id, quantity, min_stock"),
      supabase.from("clients").select("id"),
      supabase.from("orders").select("id"),
      supabase.from("profiles").select("id").eq("status", "pending"),
    ]);
    const low = (p.data || []).filter((x) => Number(x.quantity || 0) <= Number(x.min_stock || 0)).length;
    setCounts({ products: p.data?.length || 0, clients: c.data?.length || 0, orders: o.data?.length || 0, pending: pend.data?.length || 0, low });
  })(); }, []);
  return <><Title title="Dashboard" desc={`Resumo geral do sistema. Bem-vindo, ${profile.name || "usuário"}.`} /><div className="reports-grid"><StatCard label="Produtos" value={String(counts.products)} /><StatCard label="Clientes" value={String(counts.clients)} /><StatCard label="Pedidos" value={String(counts.orders)} /><StatCard label="Cadastros pendentes" value={String(counts.pending)} color="#facc15" /><StatCard label="Estoque baixo" value={String(counts.low)} color="#f87171" /><StatCard label="Acesso" value={formatRole(profile.role)} /></div></>;
}

function Produtos({ search }: SearchProps) {
  const empty = { name: "", sku: "", category: "Lâmpadas dimerizáveis", subcategory: "E27", cost_price: "", sale_price: "", quantity: "", min_stock: "", supplier_id: "", description: "" };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [suppliers, setSuppliers] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { carregar(); }, []);
  async function carregar() { const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false }); setItems(data || []); const { data: sup } = await supabase.from("suppliers").select("*").order("name"); setSuppliers(sup || []); }
  function set(c: string, v: string) { setForm((a) => ({ ...a, [c]: v })); }
  async function carregarPadrao() { for (const p of PRODUTOS_PADRAO) await supabase.from("products").upsert({ ...p, cost_price: 0, sale_price: 0, quantity: 0, min_stock: 0, description: "Produto padrão de revenda" }, { onConflict: "sku" }); setMsg("Produtos padrão carregados com sucesso."); carregar(); }
  async function salvar() {
    setMsg(""); if (!form.name) return setMsg("Informe o nome do produto.");
    const payload = { name: form.name, sku: form.sku, category: form.category, subcategory: form.subcategory, cost_price: Number(form.cost_price || 0), sale_price: Number(form.sale_price || 0), quantity: Number(form.quantity || 0), min_stock: Number(form.min_stock || 0), supplier_id: form.supplier_id || null, description: form.description, updated_at: new Date().toISOString() };
    const res = editing ? await supabase.from("products").update(payload).eq("id", editing) : await supabase.from("products").insert(payload);
    if (res.error) return setMsg(res.error.message);
    setMsg(editing ? "Produto atualizado com sucesso." : "Produto salvo com sucesso."); setForm(empty); setEditing(null); carregar();
  }
  function editar(item: AnyRow) { setEditing(item.id); setForm({ name: item.name || "", sku: item.sku || "", category: item.category || "Lâmpadas dimerizáveis", subcategory: item.subcategory || "", cost_price: String(item.cost_price || ""), sale_price: String(item.sale_price || ""), quantity: String(item.quantity || ""), min_stock: String(item.min_stock || ""), supplier_id: item.supplier_id || "", description: item.description || "" }); }
  async function excluir(id: string) { if (!confirm("Excluir este produto?")) return; const { error } = await supabase.from("products").delete().eq("id", id); if (error) return setMsg(error.message); setItems((a) => a.filter((x) => x.id !== id)); setMsg("Produto excluído com sucesso."); }
  const subcats = CATEGORIAS_REVENDA.find((c) => c.category === form.category)?.subcategories || [];
  const filtered = items.filter((i) => textMatch(i, search));
  return <><Title title="Produtos" desc="Revenda: lâmpadas dimerizáveis, dimmer e soquetes E-27." /><section className="card"><h2 className="card-title">{editing ? "Editar produto" : "Novo produto"}</h2><div className="form-actions" style={{ marginTop: 0, marginBottom: 20 }}><button className="btn btn-blue" onClick={carregarPadrao}>Criar produtos padrão</button></div><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="SKU" value={form.sku} onChange={(v) => set("sku", v)} /><SelectField label="Categoria" value={form.category} onChange={(v) => { set("category", v); set("subcategory", CATEGORIAS_REVENDA.find((c) => c.category === v)?.subcategories[0] || ""); }}>{CATEGORIAS_REVENDA.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}</SelectField><SelectField label="Subcategoria" value={form.subcategory} onChange={(v) => set("subcategory", v)}>{subcats.map((s) => <option key={s} value={s}>{s}</option>)}</SelectField><Field label="Preço de custo" type="number" value={form.cost_price} onChange={(v) => set("cost_price", v)} /><Field label="Preço de venda" type="number" value={form.sale_price} onChange={(v) => set("sale_price", v)} /><Field label="Quantidade" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} /><Field label="Estoque mínimo" type="number" value={form.min_stock} onChange={(v) => set("min_stock", v)} /><SelectField label="Fornecedor" value={form.supplier_id} onChange={(v) => set("supplier_id", v)}><option value="">Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><TextArea label="Descrição" value={form.description} onChange={(v) => set("description", v)} /></div><div className="form-actions"><button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar produto"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button></div>{msg && <Message text={msg} />}</section><section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Produtos cadastrados</h2><div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{item.category} / {item.subcategory}</small><small>SKU: {item.sku || "-"}</small><small>Qtd: {item.quantity || 0}</small><small>Venda: {money(item.sale_price)}</small><div className="form-actions"><button className="btn btn-blue" onClick={() => editar(item)}>Editar</button><button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button></div></div>)}</div></section></>;
}

function Pessoas({ title, table, kind, search, profile }: { title: string; table: "clients" | "suppliers"; kind: "cliente" | "fornecedor"; profile: Profile } & SearchProps) {
  const empty = { name: "", document: "", phone: "", email: "", cep: "", city: "", street: "", number: "", no_number: false, neighborhood: "", products: [] as string[], invoice_number: "", federal_invoice_number: "" };
  const [form, setForm] = useState(empty); const [items, setItems] = useState<AnyRow[]>([]); const [editing, setEditing] = useState<string | null>(null); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { carregar(); }, []);
  function set(c: string, v: any) { setForm((a) => ({ ...a, [c]: v })); }
  async function carregar() { const { data } = await supabase.from(table).select("*").order("created_at", { ascending: false }); setItems(data || []); }
  async function buscarCepPorValor(v: string) { const end = await buscarCep(v); if (!end) return setMsg("CEP não encontrado."); setForm((a) => ({ ...a, ...end })); }
  function editar(item: AnyRow) { setEditing(item.id); setForm({ name: item.name || "", document: maskCpfCnpj(item.document || ""), phone: maskPhone(item.phone || ""), email: item.email || "", cep: maskCep(item.cep || ""), city: item.city || "", street: item.street || "", number: item.number || "", no_number: Boolean(item.no_number), neighborhood: item.neighborhood || "", products: item.products || [], invoice_number: item.invoice_number || "", federal_invoice_number: item.federal_invoice_number || "" }); }
  async function excluir(id: string) { if (!confirm(`Excluir este ${kind}?`)) return; const { error } = await supabase.from(table).delete().eq("id", id); if (error) return setMsg(error.message); setItems((a) => a.filter((x) => x.id !== id)); setMsg(`${kind === "cliente" ? "Cliente" : "Fornecedor"} excluído com sucesso.`); }
  async function salvar() { setLoading(true); setMsg(""); if (!form.name || !form.document || !form.phone || !form.cep || !form.city || !form.street || !form.neighborhood) { setLoading(false); return setMsg("Preencha todos os campos obrigatórios."); } if (!form.no_number && !form.number) { setLoading(false); return setMsg("Informe o número ou marque Sem número."); } const payload: AnyRow = { name: form.name, document: onlyNumbers(form.document), phone: onlyNumbers(form.phone), cep: onlyNumbers(form.cep), city: form.city, street: form.street, number: form.no_number ? "" : form.number, no_number: form.no_number, neighborhood: form.neighborhood }; if (table === "suppliers") { payload.email = form.email; payload.products = form.products; payload.invoice_number = form.invoice_number; payload.federal_invoice_number = form.federal_invoice_number; } const res = editing ? await supabase.from(table).update(payload).eq("id", editing) : await supabase.from(table).insert(payload); setLoading(false); if (res.error) return setMsg(res.error.message); setMsg(editing ? "Cadastro atualizado com sucesso." : "Cadastro salvo com sucesso."); setEditing(null); setForm(empty); carregar(); }
  function toggleProduct(p: string) { set("products", form.products.includes(p) ? form.products.filter((x) => x !== p) : [...form.products, p]); }
  const filtered = items.filter((i) => textMatch(i, search));
  return <><Title title={title} desc={kind === "cliente" ? "Clientes com endereço automático por CEP." : "Fornecedores com CNPJ, produtos padrão fornecidos e número/NF da Receita Federal."} /><section className="card"><h2 className="card-title">{editing ? "Editar cadastro" : "Novo cadastro"}</h2><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="CPF ou CNPJ" value={form.document} onChange={(v) => set("document", maskCpfCnpj(v))} /><Field label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} />{kind === "fornecedor" && <><Field label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} /><Field label="Número/NF fornecedor" value={form.invoice_number} onChange={(v) => set("invoice_number", v)} /><Field label="NF Receita Federal" value={form.federal_invoice_number} onChange={(v) => set("federal_invoice_number", v)} /></>}<Field label="CEP" value={form.cep} onChange={(v) => { const c = maskCep(v); set("cep", c); if (onlyNumbers(c).length === 8) buscarCepPorValor(c); }} onBlur={() => buscarCepPorValor(form.cep)} /><Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} /><Field label="Rua" value={form.street} onChange={(v) => set("street", v)} /><div className="field"><label>Número</label><input className="input" value={form.number} disabled={form.no_number} onChange={(e) => set("number", e.target.value)} /><button type="button" className={form.no_number ? "btn btn-blue" : "btn btn-gray"} style={{ marginTop: 10, minHeight: 38, padding: "8px 14px" }} onClick={() => { const nv = !form.no_number; set("no_number", nv); if (nv) set("number", ""); }}>{form.no_number ? "Sem número marcado" : "Sem número"}</button></div><Field label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} />{kind === "fornecedor" && <div className="field full-field"><label>Produtos/componentes padrão fornecidos</label><div className="mini-grid">{[...PRODUTOS_PADRAO.map((p) => p.name), ...EQUIPAMENTOS].map((p) => <label key={p} className="check-row"><input type="checkbox" checked={form.products.includes(p)} onChange={() => toggleProduct(p)} /> {p}</label>)}</div></div>}</div><div className="form-actions"><button className="btn btn-green" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : editing ? "Salvar alterações" : kind === "cliente" ? "Salvar cliente" : "Salvar fornecedor"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button></div>{msg && <Message text={msg} />}</section><section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Cadastros lançados</h2>{filtered.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum cadastro lançado.</p> : <div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{maskCpfCnpj(item.document || "")}</small><small>{maskPhone(item.phone || "")}</small><small>{item.city} - {item.neighborhood}</small>{item.invoice_number && <small>Número/NF: {item.invoice_number}</small>}{item.federal_invoice_number && <small>NF Receita Federal: {item.federal_invoice_number}</small>}<div className="form-actions"><button className="btn btn-blue" onClick={() => editar(item)}>Editar</button>{(kind !== "cliente" || profile.role === "administrador") && <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>}</div></div>)}</div>}</section></>;
}

function Usuarios({ role, title, currentUser, search }: { role: Role; title: string; currentUser?: Profile } & SearchProps) {
  const [items, setItems] = useState<Profile[]>([]); const [msg, setMsg] = useState(""); const [loadingId, setLoadingId] = useState<string | null>(null);
  useEffect(() => { carregar(); }, [role]);
  async function carregar() { let q = supabase.from("profiles").select("*").eq("role", role).order("created_at", { ascending: false }); if (role === "representante" && currentUser?.role === "vendedor") q = q.eq("responsible_seller_id", currentUser.id); const { data, error } = await q; if (error) return setMsg(error.message); setItems((data || []) as Profile[]); }
  async function avaliar(id: string, status: "approved" | "rejected") { if (!confirm(status === "approved" ? "Aprovar cadastro?" : "Reprovar cadastro?")) return; setLoadingId(id); const { error } = await supabase.from("profiles").update({ status, updated_at: new Date().toISOString() }).eq("id", id); setLoadingId(null); if (error) return setMsg(error.message); setMsg(status === "approved" ? "Cadastro aprovado com sucesso." : "Cadastro reprovado."); carregar(); }
  async function excluir(id: string) { if (!confirm("Excluir este usuário?")) return; const r = await fetch("/api/admin/excluir-usuario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const d = await r.json(); if (!r.ok) return setMsg(d.error || "Erro ao excluir usuário."); setItems((a) => a.filter((x) => x.id !== id)); setMsg("Usuário excluído com sucesso."); }
  const podeAvaliar = role === "representante" && currentUser && ["administrador", "vendedor"].includes(currentUser.role);
  const filtered = items.filter((i) => textMatch(i, search));
  return <><Title title={title} desc={`Lista de usuários com perfil ${formatRole(role)}.`} /><section className="card"><h2 className="card-title">Cadastrar novo acesso</h2><p style={{ color: "#94a3b8", marginBottom: 20 }}>Use a página de cadastro para criar funcionário, vendedor, gerente, técnico ou representante.</p><button className="btn btn-blue" onClick={() => (window.location.href = `/cadastrar-usuario?tipo=${role}`)}>Abrir cadastro de usuário</button>{msg && <Message text={msg} />}</section><section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Usuários cadastrados</h2>{filtered.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum usuário cadastrado.</p> : <div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{item.email}</small><small>Status: <b style={{ color: item.status === "approved" ? "#4ade80" : item.status === "pending" ? "#facc15" : "#f87171" }}>{item.status}</b></small>{item.access_code && <small>Código: {item.access_code}</small>}{item.seller_code && <small>Código vendedor: {item.seller_code}</small>}{item.responsible_seller_id && <small>Vendedor vinculado: {item.responsible_seller_id}</small>}<div className="form-actions">{podeAvaliar && item.status !== "approved" && <button className="btn btn-green" disabled={loadingId === item.id} onClick={() => avaliar(item.id, "approved")}>{loadingId === item.id ? "Avaliando..." : "Aprovar"}</button>}{podeAvaliar && item.status !== "rejected" && <button className="btn btn-red" disabled={loadingId === item.id} onClick={() => avaliar(item.id, "rejected")}>Reprovar</button>}{currentUser?.role === "administrador" && <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>}</div></div>)}</div>}</section></>;
}

function AnaliseCadastros({ currentUser, search }: { currentUser: Profile } & SearchProps) {
  const [items, setItems] = useState<Profile[]>([]); const [msg, setMsg] = useState("");
  const permissoes = [{ key: "products", label: "Produtos" }, { key: "orders", label: "Pedidos" }, { key: "clients", label: "Clientes" }, { key: "reports", label: "Relatórios" }, { key: "assemblies", label: "Montagens" }];
  useEffect(() => { carregar(); }, []);
  async function carregar() { const { data, error } = await supabase.from("profiles").select("*").in("status", ["pending", "rejected"]).order("created_at", { ascending: false }); if (error) setMsg(error.message); else setItems((data || []) as Profile[]); }
  async function mudarStatus(id: string, status: "approved" | "rejected") { const { error } = await supabase.from("profiles").update({ status, updated_at: new Date().toISOString() }).eq("id", id); setMsg(error ? error.message : status === "approved" ? "Cadastro aprovado." : "Cadastro reprovado."); carregar(); }
  async function salvarPermissao(item: Profile, key: string, checked: boolean) { const permissions = { ...(item.permissions || {}), [key]: checked }; const { error } = await supabase.from("profiles").update({ permissions, updated_at: new Date().toISOString() }).eq("id", item.id); if (error) setMsg(error.message); else carregar(); }
  if (currentUser.role !== "administrador") return <FullScreenMessage title="Sem permissão" desc="Apenas administradores acessam a análise de cadastros." />;
  const filtered = items.filter((i) => textMatch(i, search));
  return <><Title title="Análise de Cadastros" desc="Aprovação/reprovação e quadro de permissões por cadastro." />{msg && <Message text={msg} />}<section className="card"><h2 className="card-title">Cadastros aguardando análise</h2>{filtered.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum cadastro pendente.</p> : <div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{item.email}</small><small>{formatRole(item.role)} - {item.status}</small>{item.seller_code && <small>Código vendedor: {item.seller_code}</small>}{item.responsible_seller_id && <small>Vendedor vinculado: {item.responsible_seller_id}</small>}<div className="mini-grid">{permissoes.map((p) => <label key={p.key} className="check-row"><input type="checkbox" checked={Boolean(item.permissions?.[p.key])} onChange={(e) => salvarPermissao(item, p.key, e.target.checked)} /> {p.label}</label>)}</div><div className="form-actions"><button className="btn btn-green" onClick={() => mudarStatus(item.id, "approved")}>Aprovar</button><button className="btn btn-red" onClick={() => mudarStatus(item.id, "rejected")}>Reprovar</button></div></div>)}</div>}</section></>;
}

function Pedidos({ profile, search }: { profile: Profile } & SearchProps) {
  const empty = { item_type: "produto", item_id: "", equipment_name: EQUIPAMENTOS[0], quantity: "1", total_value: "", shipping_value: "", client_id: "", notes: "" };
  const statuses = ["pendente", "confirmado", "processando", "enviado", "recebido"];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [clients, setClients] = useState<AnyRow[]>([]);
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [statusView, setStatusView] = useState("todos");

  useEffect(() => { carregar(); }, []);

  function set(c: string, v: string) { setForm((a) => ({ ...a, [c]: v })); }

  async function carregar() {
    const { data: o } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders(o || []);
    const { data: c } = await supabase.from("clients").select("*").order("name");
    setClients(c || []);
    const { data: p } = await supabase.from("products").select("*").order("name");
    setProducts(p || []);
  }

  function toggleEquipment(nome: string) {
    setSelectedEquipments((atual) => atual.includes(nome) ? atual.filter((i) => i !== nome) : [...atual, nome]);
  }

  function editar(o: AnyRow) {
    setEditing(o.id);
    setShowForm(true);
    setSelectedEquipments(o.equipment_name ? [o.equipment_name] : []);
    setForm({
      item_type: o.item_type || o.item_kind || "produto",
      item_id: o.item_id || "",
      equipment_name: o.equipment_name || EQUIPAMENTOS[0],
      quantity: String(o.quantity || 1),
      total_value: String(o.total_value || ""),
      shipping_value: String(o.shipping_value || ""),
      client_id: o.client_id || "",
      notes: o.notes || "",
    });
  }

  async function salvar() {
    setMsg("");
    const qtd = Number(form.quantity || 1);
    if (!form.client_id) return setMsg("Selecione o cliente do pedido.");
    if (qtd <= 0) return setMsg("Informe uma quantidade válida.");
    if (form.item_type === "produto" && !form.item_id) return setMsg("Selecione o produto.");
    if (form.item_type === "equipamento" && selectedEquipments.length === 0) return setMsg("Selecione ao menos um equipamento.");

    const basePayload = {
      created_by: profile.id,
      client_id: form.client_id || null,
      item_type: form.item_type,
      item_kind: form.item_type,
      quantity: qtd,
      total_value: Number(form.total_value || 0),
      shipping_value: Number(form.shipping_value || 0),
      notes: form.notes,
      updated_at: new Date().toISOString(),
    } as AnyRow;

    if (editing) {
      const payload = {
        ...basePayload,
        item_id: form.item_type === "produto" ? form.item_id || null : null,
        equipment_name: form.item_type === "equipamento" ? (selectedEquipments[0] || form.equipment_name) : "",
      };
      const res = await supabase.from("orders").update(payload).eq("id", editing);
      if (res.error) return setMsg(res.error.message);
      setMsg("Pedido atualizado com sucesso.");
    } else {
      const pedidosParaCriar = form.item_type === "equipamento"
        ? selectedEquipments.map((equipmentName) => ({ ...basePayload, status: "pendente", invoice_status: "not_issued", item_id: null, equipment_name: equipmentName }))
        : [{ ...basePayload, status: "pendente", invoice_status: "not_issued", item_id: form.item_id || null, equipment_name: "" }];

      const res = await supabase.from("orders").insert(pedidosParaCriar);
      if (res.error) return setMsg(res.error.message);
      setMsg(pedidosParaCriar.length > 1 ? `${pedidosParaCriar.length} pedidos criados com sucesso.` : "Pedido criado com sucesso.");
    }

    setForm(empty);
    setSelectedEquipments([]);
    setEditing(null);
    setShowForm(false);
    carregar();
  }

  async function mudarStatus(id: string, status: string) {
    const { error } = await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return setMsg(error.message);
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este pedido?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return setMsg(error.message);
    setOrders((a) => a.filter((x) => x.id !== id));
    setMsg("Pedido excluído com sucesso.");
  }

  async function emitirNf(orderId: string) {
    const r = await fetch("/api/conta-azul/emitir-nf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
    const d = await r.json();
    setMsg(d.message || d.error || "Solicitação enviada.");
    carregar();
  }

  const canManage = ["administrador", "gerente", "vendedor"].includes(profile.role);
  const canEmitNf = ["administrador", "gerente"].includes(profile.role);
  const filtered = orders.filter((o) => textMatch({ ...o, client: clients.find((c) => c.id === o.client_id)?.name, product: products.find((p) => p.id === o.item_id)?.name }, search));
  const countByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    statuses.forEach((s) => (map[s] = 0));
    filtered.forEach((o) => (map[o.status] = (map[o.status] || 0) + 1));
    return map;
  }, [filtered]);
  const visibleOrders = statusView === "todos" ? filtered : filtered.filter((o) => o.status === statusView);

  return <>
    <Title title="Pedidos" desc="Cadastro, edição, exclusão e gerenciamento da posição do pedido." />
    <div className="orders-summary-grid">{statuses.map((s) => <StatCard key={s} label={s.toUpperCase()} value={String(countByStatus[s] || 0)} />)}</div>

    <section className="card">
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-blue" onClick={() => { setShowForm((v) => !v); if (showForm) { setEditing(null); setForm(empty); setSelectedEquipments([]); } }}>{showForm ? "Fechar pedido" : "Cadastrar pedido"}</button>
      </div>

      {showForm && <>
        <h2 className="card-title" style={{ marginTop: 26 }}>{editing ? "Editar pedido" : "Novo pedido"}</h2>
        <div className="form-grid">
          <SelectField label="Cliente" value={form.client_id} onChange={(v) => set("client_id", v)}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
          <SelectField label="Tipo" value={form.item_type} onChange={(v) => { set("item_type", v); setSelectedEquipments([]); }}><option value="produto">Produto</option><option value="equipamento">Equipamento</option></SelectField>
          {form.item_type === "produto" ? <SelectField label="Produto" value={form.item_id} onChange={(v) => set("item_id", v)}><option value="">Selecione</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField> : <div className="field full-field"><label>Equipamentos selecionáveis</label><div className="mini-grid">{EQUIPAMENTOS.map((e) => <label key={e} className="check-row"><input type="checkbox" checked={selectedEquipments.includes(e)} onChange={() => toggleEquipment(e)} />{e}</label>)}</div></div>}
          <Field label="Quantidade" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} />
          <Field label="Valor total (R$)" type="number" value={form.total_value} onChange={(v) => set("total_value", v)} />
          <Field label="Frete (R$)" type="number" value={form.shipping_value} onChange={(v) => set("shipping_value", v)} />
          <div className="field"><label>Prévia</label><div className="input" style={{ display: "flex", alignItems: "center" }}>{money(form.total_value)} + frete {money(form.shipping_value)}</div></div>
          <TextArea label="Observações" value={form.notes} onChange={(v) => set("notes", v)} />
        </div>
        {form.item_type === "equipamento" && selectedEquipments.length > 0 && <p style={{ color: "#94a3b8", marginTop: 16 }}>{selectedEquipments.length} equipamento(s) selecionado(s). Ao salvar, será criado um pedido para cada equipamento.</p>}
        <div className="form-actions"><button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar pedido"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setSelectedEquipments([]); setEditing(null); setShowForm(false); }}>Cancelar</button></div>
      </>}
      {msg && <Message text={msg} />}
    </section>

    <section className="card" style={{ marginTop: 24 }}>
      <div className="form-grid" style={{ alignItems: "end" }}>
        <SelectField label="Ver lista de pedidos" value={statusView} onChange={setStatusView}><option value="todos">Todos</option>{statuses.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}</SelectField>
      </div>
      <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
        {visibleOrders.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum pedido nesta lista.</p> : visibleOrders.map((o) => {
          const cliente = clients.find((c) => c.id === o.client_id);
          const produto = products.find((p) => p.id === o.item_id);
          return <div key={o.id} className="stat-card user-card order-list-card">
            <strong>Pedido #{o.order_number || o.id.slice(0, 6)}</strong>
            <small>Cliente: {cliente?.name || "-"}</small>
            <small>Item: {o.equipment_name || produto?.name || o.item_type}</small>
            <small>Qtd: {o.quantity}</small>
            <small>Total: {money(o.total_value)} | Frete: {money(o.shipping_value)}</small>
            <small>Status: <b>{String(o.status || "pendente").toUpperCase()}</b></small>
            <small>NF: {o.invoice_status === "not_issued" ? "Não emitida" : o.invoice_status || "Não emitida"}</small>
            {canManage && <select className="input" value={o.status} onChange={(e) => mudarStatus(o.id, e.target.value)}>{statuses.map((st) => <option key={st} value={st}>{st}</option>)}</select>}
            <div className="form-actions"><button className="btn btn-blue" onClick={() => editar(o)}>Editar</button>{canEmitNf && <button className="btn btn-blue" onClick={() => emitirNf(o.id)}>Emitir NF</button>}{canManage && <button className="btn btn-red" onClick={() => excluir(o.id)}>Excluir</button>}</div>
          </div>;
        })}
      </div>
    </section>
  </>;
}

function Movimentacoes({ profile }: { profile: Profile }) {
  const emptyManual = {
    type: "entrada",
    item_type: "produto",
    item_id: "",
    quantity: "",
    notes: "",
  };

  const emptyNf = {
    nf_key: "",
    nf_number: "",
    receita_federal_nf: "",
    fornecedor_nome: "",
    fornecedor_document: "",
    fornecedor_email: "",
    fornecedor_phone: "",
    item_kind: "produto",
    produto_nome: "",
    produto_categoria: "LAMPADAS",
    produto_subcategoria: "Lâmpada LED dimerizável E27",
    component_name: "",
    component_category: "",
    component_equipment: EQUIPAMENTOS[0],
    quantity: "",
    unit_cost: "",
    notes: "",
    approved: false,
    pdf_name: "",
  };

  const emptySaida = {
    order_id: "",
    approved: false,
    notes: "",
  };

  const [manual, setManual] = useState(emptyManual);
  const [nfForm, setNfForm] = useState(emptyNf);
  const [saidaForm, setSaidaForm] = useState(emptySaida);
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [movements, setMovements] = useState<AnyRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loadingNf, setLoadingNf] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  function setManualField(campo: string, valor: string) {
    setManual((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function setNfField(campo: string, valor: any) {
    setNfForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function setSaidaField(campo: string, valor: any) {
    setSaidaForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function carregar() {
    const { data: produtos } = await supabase
      .from("products")
      .select("*")
      .order("name");

    setProducts(produtos || []);

    const { data: pedidos } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    setOrders(pedidos || []);

    const { data: movs, error } = await supabase
      .from("movements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMovements(movs || []);
  }

  async function buscarDadosNf() {
    setMsg("");
    setLoadingNf(true);

    try {
      const resposta = await fetch("/api/nfe/consultar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nf_key: nfForm.nf_key,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMsg(dados.error || "Não foi possível buscar a NF.");
        return;
      }

      setNfForm((atual) => ({
        ...atual,
        nf_key: dados.nf?.chave || atual.nf_key,
        nf_number: dados.nf?.numero || atual.nf_number,
        receita_federal_nf: dados.nf?.chave || atual.receita_federal_nf,
        fornecedor_nome: dados.nf?.fornecedor?.nome || atual.fornecedor_nome,
        fornecedor_document: dados.nf?.fornecedor?.cnpj || atual.fornecedor_document,
        fornecedor_email: dados.nf?.fornecedor?.email || atual.fornecedor_email,
        fornecedor_phone: dados.nf?.fornecedor?.telefone || atual.fornecedor_phone,
      }));

      setMsg("Dados da NF carregados. Confira e aprove a NF.");
    } catch (error: any) {
      setMsg(error.message || "Erro ao buscar NF.");
    } finally {
      setLoadingNf(false);
    }
  }

  async function criarOuAtualizarFornecedor() {
    const documentoFornecedor = onlyNumbers(nfForm.fornecedor_document);

    if (!nfForm.fornecedor_nome) {
      throw new Error("Informe o fornecedor da NF.");
    }

    if (documentoFornecedor) {
      const { data: fornecedorExistente } = await supabase
        .from("suppliers")
        .select("*")
        .eq("document", documentoFornecedor)
        .maybeSingle();

      if (fornecedorExistente) {
        await supabase
          .from("suppliers")
          .update({
            name: nfForm.fornecedor_nome,
            phone: onlyNumbers(nfForm.fornecedor_phone),
            email: nfForm.fornecedor_email,
            nf_number: nfForm.nf_number,
            receita_federal_nf: nfForm.receita_federal_nf,
          })
          .eq("id", fornecedorExistente.id);

        return fornecedorExistente.id as string;
      }
    }

    const { data: novoFornecedor, error } = await supabase
      .from("suppliers")
      .insert({
        name: nfForm.fornecedor_nome,
        document: documentoFornecedor,
        phone: onlyNumbers(nfForm.fornecedor_phone),
        email: nfForm.fornecedor_email,
        nf_number: nfForm.nf_number,
        receita_federal_nf: nfForm.receita_federal_nf,
        products: [],
        default_items: [],
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return novoFornecedor.id as string;
  }

  async function criarOuAtualizarProduto(
    supplierId: string,
    quantidade: number,
    custoUnitario: number
  ) {
    const nomeProduto = nfForm.produto_nome.trim();

    if (!nomeProduto) {
      throw new Error("Informe o produto da NF.");
    }

    const { data: produtoExistente } = await supabase
      .from("products")
      .select("*")
      .eq("name", nomeProduto)
      .maybeSingle();

    if (produtoExistente) {
      const { error } = await supabase
        .from("products")
        .update({
          quantity: Number(produtoExistente.quantity || 0) + quantidade,
          cost_price: custoUnitario,
          supplier_id: supplierId,
          category: nfForm.produto_categoria,
          subcategory: nfForm.produto_subcategoria,
          updated_at: new Date().toISOString(),
        })
        .eq("id", produtoExistente.id);

      if (error) throw new Error(error.message);

      return produtoExistente.id as string;
    }

    const { data: novoProduto, error } = await supabase
      .from("products")
      .insert({
        name: nomeProduto,
        sku: "",
        category: nfForm.produto_categoria,
        subcategory: nfForm.produto_subcategoria,
        cost_price: custoUnitario,
        sale_price: 0,
        quantity: quantidade,
        min_stock: 0,
        supplier_id: supplierId,
        description: `Produto cadastrado automaticamente pela NF ${
          nfForm.nf_number || nfForm.nf_key
        }`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return novoProduto.id as string;
  }

  async function criarOuAtualizarComponente(
    supplierId: string,
    quantidade: number,
    custoUnitario: number
  ) {
    const nomeComponente = nfForm.component_name.trim();

    if (!nomeComponente) {
      throw new Error("Informe o componente da NF.");
    }

    const { data: componenteExistente } = await supabase
      .from("components")
      .select("*")
      .eq("name", nomeComponente)
      .eq("equipment", nfForm.component_equipment)
      .maybeSingle();

    if (componenteExistente) {
      const { error } = await supabase
        .from("components")
        .update({
          quantity: Number(componenteExistente.quantity || 0) + quantidade,
          cost_price: custoUnitario,
          supplier_id: supplierId,
          category: nfForm.component_category,
          nf_number: nfForm.nf_number,
          receita_federal_nf: nfForm.receita_federal_nf,
          updated_at: new Date().toISOString(),
        })
        .eq("id", componenteExistente.id);

      if (error) throw new Error(error.message);

      return componenteExistente.id as string;
    }

    const { data: novoComponente, error } = await supabase
      .from("components")
      .insert({
        name: nomeComponente,
        category: nfForm.component_category,
        equipment: nfForm.component_equipment,
        quantity: quantidade,
        min_stock: 0,
        cost_price: custoUnitario,
        supplier_id: supplierId,
        nf_number: nfForm.nf_number,
        receita_federal_nf: nfForm.receita_federal_nf,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return novoComponente.id as string;
  }

  async function cadastrarEntradaNf() {
    setMsg("");

    try {
      if (!nfForm.approved) {
        setMsg("Aprove a NF antes de cadastrar a entrada.");
        return;
      }

      if (!nfForm.nf_key && !nfForm.nf_number) {
        setMsg("Informe a chave ou número da NF.");
        return;
      }

      const quantidade = Number(nfForm.quantity || 0);
      const custoUnitario = Number(nfForm.unit_cost || 0);

      if (quantidade <= 0) {
        setMsg("Informe a quantidade da NF.");
        return;
      }

      const supplierId = await criarOuAtualizarFornecedor();

      let itemId: string | null = null;

      if (nfForm.item_kind === "produto") {
        itemId = await criarOuAtualizarProduto(
          supplierId,
          quantidade,
          custoUnitario
        );
      } else {
        itemId = await criarOuAtualizarComponente(
          supplierId,
          quantidade,
          custoUnitario
        );
      }

      const { error } = await supabase.from("movements").insert({
        type: "entrada",
        item_type: nfForm.item_kind === "produto" ? "produto" : "componente",
        nf_item_kind: nfForm.item_kind,
        item_id: itemId,
        quantity: quantidade,
        notes:
          nfForm.notes ||
          `Entrada automática pela NF ${nfForm.nf_number || nfForm.nf_key}`,
        created_by: profile.id,
        supplier_id: supplierId,
        nf_number: nfForm.nf_number,
        receita_federal_nf: nfForm.receita_federal_nf,
        nf_key: nfForm.nf_key,
        unit_cost: custoUnitario,
        total_cost: quantidade * custoUnitario,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("Entrada por NF cadastrada com sucesso.");
      setNfForm(emptyNf);
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar entrada por NF.");
    }
  }

  const pedidosParaSaida = orders.filter((pedido) => {
    const status = String(pedido.status || "").toLowerCase();
    return !["cancelado", "recebido", "finalizado"].includes(status);
  });

  const pedidoSelecionado = orders.find((pedido) => pedido.id === saidaForm.order_id);
  const produtoPedidoSelecionado = pedidoSelecionado?.item_id ? products.find((produto) => produto.id === pedidoSelecionado.item_id) : null;

  async function cadastrarSaidaPedido() {
    setMsg("");

    try {
      if (!saidaForm.order_id) {
        setMsg("Selecione o pedido para gerar a saída.");
        return;
      }

      if (!saidaForm.approved) {
        setMsg("Aprove a saída antes de cadastrar a movimentação.");
        return;
      }

      const pedido = orders.find((item) => item.id === saidaForm.order_id);

      if (!pedido) {
        setMsg("Pedido não encontrado.");
        return;
      }

      const quantidade = Number(pedido.quantity || 0);

      if (quantidade <= 0) {
        setMsg("O pedido não possui quantidade válida.");
        return;
      }

      const tipoItem = pedido.item_type || pedido.item_kind || "produto";
      const produto = pedido.item_id ? products.find((item) => item.id === pedido.item_id) : null;

      if (tipoItem === "produto") {
        if (!produto) {
          setMsg("Produto do pedido não encontrado no estoque.");
          return;
        }

        const estoqueAtual = Number(produto.quantity || 0);

        if (estoqueAtual < quantidade) {
          setMsg(`Estoque insuficiente. Disponível: ${estoqueAtual}. Pedido: ${quantidade}.`);
          return;
        }

        const { error: erroProduto } = await supabase
          .from("products")
          .update({
            quantity: estoqueAtual - quantidade,
            updated_at: new Date().toISOString(),
          })
          .eq("id", produto.id);

        if (erroProduto) throw new Error(erroProduto.message);
      }

      if (tipoItem === "equipamento") {
        await baixarComponentesDaComposicao(
          pedido.equipment_name,
          quantidade,
          profile.id,
          `pedido #${pedido.order_number || String(pedido.id || "").slice(0, 6)}`
        );
      }

      const numeroPedido = pedido.order_number || String(pedido.id || "").slice(0, 6);
      const descricaoItem = tipoItem === "produto" ? produto?.name || "Produto" : pedido.equipment_name || "Equipamento";

      const movimento: AnyRow = {
        type: "saida",
        item_type: tipoItem === "produto" ? "produto" : "equipamento",
        item_id: tipoItem === "produto" ? pedido.item_id || null : null,
        quantity: quantidade,
        notes: saidaForm.notes || `Saída automática pelo pedido #${numeroPedido} - ${descricaoItem}`,
        created_by: profile.id,
        order_id: pedido.id,
      };

      const { error: erroMovimento } = await supabase.from("movements").insert(movimento);

      if (erroMovimento) {
        const movimentoSemPedido = { ...movimento };
        delete movimentoSemPedido.order_id;
        const { error: erroMovimentoSemPedido } = await supabase.from("movements").insert(movimentoSemPedido);
        if (erroMovimentoSemPedido) throw new Error(erroMovimentoSemPedido.message);
      }

      await supabase
        .from("orders")
        .update({
          status: "enviado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);

      setMsg("Saída automática cadastrada com sucesso.");
      setSaidaForm(emptySaida);
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar saída automática.");
    }
  }

  async function salvarManual() {
    setMsg("");

    const qtd = Number(manual.quantity || 0);

    if (!manual.item_id) {
      setMsg("Selecione o produto.");
      return;
    }

    if (qtd <= 0) {
      setMsg("Informe a quantidade.");
      return;
    }

    const { error } = await supabase.from("movements").insert({
      type: manual.type,
      item_type: manual.item_type,
      item_id: manual.item_id || null,
      quantity: qtd,
      notes: manual.notes,
      created_by: profile.id,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    const produto = products.find((i) => i.id === manual.item_id);

    if (produto) {
      const novaQtd =
        manual.type === "entrada"
          ? Number(produto.quantity || 0) + qtd
          : Number(produto.quantity || 0) - qtd;

      await supabase
        .from("products")
        .update({
          quantity: novaQtd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", manual.item_id);
    }

    setMsg("Movimentação manual salva com sucesso.");
    setManual(emptyManual);
    carregar();
  }
  function pegarTextoDentroNo(no: Element, tag: string) {
    return no.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
  }

  async function importarXmlNf(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];

    if (!arquivo) return;

    if (!arquivo.name.toLowerCase().endsWith(".xml")) {
      setMsg("Selecione um arquivo XML válido.");
      return;
    }

    try {
      const texto = await arquivo.text();

      const parser = new DOMParser();
      const xml = parser.parseFromString(texto, "text/xml");

      const erroXml = xml.getElementsByTagName("parsererror")[0];

      if (erroXml) {
        setMsg("XML inválido. Verifique o arquivo da NF.");
        return;
      }

      const infNFe = xml.getElementsByTagName("infNFe")[0];
      const emit = xml.getElementsByTagName("emit")[0];
      const ide = xml.getElementsByTagName("ide")[0];
      const det = xml.getElementsByTagName("det")[0];

      if (!infNFe || !emit || !ide || !det) {
        setMsg("Não consegui encontrar os dados principais da NF no XML.");
        return;
      }

      const chaveComPrefixo = infNFe.getAttribute("Id") || "";
      const chave = chaveComPrefixo.replace("NFe", "");

      const numeroNf = pegarTextoDentroNo(ide, "nNF");

      const fornecedorNome = pegarTextoDentroNo(emit, "xNome");
      const fornecedorCnpj = pegarTextoDentroNo(emit, "CNPJ");
      const fornecedorCpf = pegarTextoDentroNo(emit, "CPF");
      const fornecedorTelefone = pegarTextoDentroNo(emit, "fone");

      const prod = det.getElementsByTagName("prod")[0];

      if (!prod) {
        setMsg("Não encontrei produtos dentro da NF.");
        return;
      }

      const nomeProduto = pegarTextoDentroNo(prod, "xProd");
      const codigoProduto = pegarTextoDentroNo(prod, "cProd");
      const quantidade = pegarTextoDentroNo(prod, "qCom");
      const valorUnitario = pegarTextoDentroNo(prod, "vUnCom");
      const valorTotal = pegarTextoDentroNo(prod, "vProd");

      setNfForm((atual) => ({
        ...atual,
        nf_key: chave,
        nf_number: numeroNf,
        receita_federal_nf: chave,

        fornecedor_nome: fornecedorNome,
        fornecedor_document: fornecedorCnpj || fornecedorCpf,
        fornecedor_phone: fornecedorTelefone,
        fornecedor_email: atual.fornecedor_email,

        item_kind: atual.item_kind || "produto",

        produto_nome: nomeProduto || codigoProduto,
        produto_categoria: atual.produto_categoria || "LAMPADAS",
        produto_subcategoria:
          atual.produto_subcategoria || "Lâmpada LED dimerizável E27",

        component_name: nomeProduto || codigoProduto,
        component_category: atual.component_category || "",
        component_equipment: atual.component_equipment || EQUIPAMENTOS[0],

        quantity: quantidade ? String(Number(quantidade)) : atual.quantity,
        unit_cost: valorUnitario ? String(Number(valorUnitario)) : atual.unit_cost,

        notes: `Importado do XML da NF ${numeroNf}. Valor total: ${
          valorTotal || "0"
        }`,
        approved: false,
      }));

      setMsg(
        "XML importado com sucesso. Confira os dados, escolha Produto ou Componente e aprove a NF."
      );
    } catch (error: any) {
      setMsg(error.message || "Erro ao importar XML da NF.");
    } finally {
      event.target.value = "";
    }
  }

  async function importarPdfNf(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];

    if (!arquivo) return;

    if (!arquivo.name.toLowerCase().endsWith(".pdf")) {
      setMsg("Selecione um arquivo PDF válido.");
      return;
    }

    setNfForm((atual) => ({
      ...atual,
      pdf_name: arquivo.name,
      notes: `PDF/DANFE anexado: ${arquivo.name}. Preencha os dados da NF manualmente.`,
      approved: false,
    }));

    setMsg("PDF/DANFE anexado. Preencha os dados da NF manualmente antes de aprovar.");
    event.target.value = "";
  }

  return (
    <>
      <Title
        title="Movimentações"
        desc="Controle entradas por NF/PDF e saídas automáticas por pedido."
      />

      <section className="card">
        <h2 className="card-title">Entrada por PDF/DANFE da NF</h2>

        <div className="form-grid">
          <Field
            label="Chave ou número da NF"
            value={nfForm.nf_key}
            onChange={(v) => setNfField("nf_key", v)}
          />

          <Field
            label="Número da NF"
            value={nfForm.nf_number}
            onChange={(v) => setNfField("nf_number", v)}
          />

          <Field
            label="NF Receita Federal / Chave"
            value={nfForm.receita_federal_nf}
            onChange={(v) => setNfField("receita_federal_nf", v)}
          />
        </div>

        <div className="form-actions">
          <label className="btn btn-blue" style={{ cursor: "pointer" }}>
            {loadingNf ? "Lendo PDF..." : "Importar PDF/DANFE da NF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={importarPdfNf}
              style={{ display: "none" }}
            />
          </label>

          <button
            className={nfForm.approved ? "btn btn-green" : "btn btn-gray"}
            onClick={() => setNfField("approved", !nfForm.approved)}
          >
            {nfForm.approved ? "NF aprovada" : "Aprovar NF"}
          </button>
        </div>

        {nfForm.pdf_name && (
          <p style={{ color: "#94a3b8", marginTop: 12 }}>
            PDF/DANFE importado: <strong>{nfForm.pdf_name}</strong>
          </p>
        )}

        <h3 style={{ marginTop: 26 }}>Item da NF</h3>

        <div className="form-grid">
          <SelectField
            label="Tipo do item"
            value={nfForm.item_kind}
            onChange={(v) => setNfField("item_kind", v)}
          >
            <option value="produto">Produto de revenda</option>
            <option value="componente">Componente</option>
          </SelectField>

          {nfForm.item_kind === "produto" && (
            <>
              <Field
                label="Produto"
                value={nfForm.produto_nome}
                onChange={(v) => setNfField("produto_nome", v)}
              />

              <SelectField
                label="Categoria"
                value={nfForm.produto_categoria}
                onChange={(v) => setNfField("produto_categoria", v)}
              >
                <option value="LAMPADAS">Lâmpadas dimerizáveis</option>
                <option value="DIMMER">Dimmer</option>
                <option value="SOQUETES">Soquetes E-27</option>
              </SelectField>

              <Field
                label="Subcategoria"
                value={nfForm.produto_subcategoria}
                onChange={(v) => setNfField("produto_subcategoria", v)}
              />
            </>
          )}

          {nfForm.item_kind === "componente" && (
            <>
              <Field
                label="Componente"
                value={nfForm.component_name}
                onChange={(v) => setNfField("component_name", v)}
              />

              <Field
                label="Categoria do componente"
                value={nfForm.component_category}
                onChange={(v) => setNfField("component_category", v)}
              />

              <SelectField
                label="Equipamento relacionado"
                value={nfForm.component_equipment}
                onChange={(v) => setNfField("component_equipment", v)}
              >
                {EQUIPAMENTOS.map((equipamento) => (
                  <option key={equipamento} value={equipamento}>
                    {equipamento}
                  </option>
                ))}
              </SelectField>
            </>
          )}

          <Field
            label="Quantidade"
            type="number"
            value={nfForm.quantity}
            onChange={(v) => setNfField("quantity", v)}
          />

          <Field
            label="Custo unitário"
            type="number"
            value={nfForm.unit_cost}
            onChange={(v) => setNfField("unit_cost", v)}
          />

          <TextArea
            label="Observações"
            value={nfForm.notes}
            onChange={(v) => setNfField("notes", v)}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-green" onClick={cadastrarEntradaNf}>
            Cadastrar entrada da NF
          </button>
        </div>

        {msg && <Message text={msg} />}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Saída automática por pedido</h2>
        <p style={{ color: "#94a3b8", marginTop: -8 }}>
          Selecione um pedido para puxar item e quantidade automaticamente, baixar estoque e registrar a saída.
        </p>

        <div className="form-grid">
          <SelectField
            label="Pedido"
            value={saidaForm.order_id}
            onChange={(v) => setSaidaField("order_id", v)}
          >
            <option value="">Selecione</option>
            {pedidosParaSaida.map((pedido) => {
              const produto = pedido.item_id ? products.find((item) => item.id === pedido.item_id) : null;
              const itemNome = pedido.equipment_name || produto?.name || pedido.item_type || "Item";
              return (
                <option key={pedido.id} value={pedido.id}>
                  Pedido #{pedido.order_number || String(pedido.id).slice(0, 6)} - {itemNome} - Qtd {pedido.quantity}
                </option>
              );
            })}
          </SelectField>

          <div className="field">
            <label>Item</label>
            <div className="input" style={{ display: "flex", alignItems: "center" }}>
              {pedidoSelecionado ? pedidoSelecionado.equipment_name || produtoPedidoSelecionado?.name || "Item do pedido" : "Selecione um pedido"}
            </div>
          </div>

          <div className="field">
            <label>Quantidade</label>
            <div className="input" style={{ display: "flex", alignItems: "center" }}>
              {pedidoSelecionado ? pedidoSelecionado.quantity : "-"}
            </div>
          </div>

          <div className="field">
            <label>Valor do pedido</label>
            <div className="input" style={{ display: "flex", alignItems: "center" }}>
              {pedidoSelecionado ? money(pedidoSelecionado.total_value) : "-"}
            </div>
          </div>

          <TextArea
            label="Observações da saída"
            value={saidaForm.notes}
            onChange={(v) => setSaidaField("notes", v)}
          />
        </div>

        <div className="form-actions">
          <button
            className={saidaForm.approved ? "btn btn-green" : "btn btn-gray"}
            onClick={() => setSaidaField("approved", !saidaForm.approved)}
          >
            {saidaForm.approved ? "Saída aprovada" : "Aprovar saída"}
          </button>
          <button className="btn btn-green" onClick={cadastrarSaidaPedido}>
            Cadastrar saída do pedido
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Nova movimentação manual</h2>

        <div className="form-grid">
          <SelectField
            label="Tipo"
            value={manual.type}
            onChange={(v) => setManualField("type", v)}
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </SelectField>

          <SelectField
            label="Produto"
            value={manual.item_id}
            onChange={(v) => setManualField("item_id", v)}
          >
            <option value="">Selecione</option>
            {products.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>

          <Field
            label="Quantidade"
            type="number"
            value={manual.quantity}
            onChange={(v) => setManualField("quantity", v)}
          />

          <TextArea
            label="Observações"
            value={manual.notes}
            onChange={(v) => setManualField("notes", v)}
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-green" onClick={salvarManual}>
            Salvar movimentação
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Movimentações lançadas</h2>

        <div className="product-list-grid">
          {movements.map((m) => (
            <div key={m.id} className="stat-card">
              <strong>{m.type}</strong>
              <small>Tipo: {m.nf_item_kind || m.item_type}</small>
              <small>Qtd: {m.quantity}</small>
              {m.nf_number && <small>NF: {m.nf_number}</small>}
              {m.receita_federal_nf && (
                <small>Receita Federal: {m.receita_federal_nf}</small>
              )}
              {m.unit_cost > 0 && (
                <small>Custo unitário: {money(m.unit_cost)}</small>
              )}
              {m.total_cost > 0 && (
                <small>Total: {money(m.total_cost)}</small>
              )}
              <small>{m.notes}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Componentes({ search }: SearchProps) {
  const empty = { name: "", category: "", equipment: EQUIPAMENTOS[0], supplier_id: "", quantity: "", min_stock: "" };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [suppliers, setSuppliers] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [equipmentView, setEquipmentView] = useState(EQUIPAMENTOS[0]);
  const [loadingPadrao, setLoadingPadrao] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data } = await supabase.from("components").select("*").order("equipment").order("name");
    setItems(data || []);
    const { data: sup } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(sup || []);
  }

  function set(c: string, v: string) { setForm((a) => ({ ...a, [c]: v })); }

  function editar(i: AnyRow) {
    setEditing(i.id);
    setForm({
      name: i.name || "",
      category: i.category || "",
      equipment: i.equipment || EQUIPAMENTOS[0],
      supplier_id: i.supplier_id || "",
      quantity: String(i.quantity || ""),
      min_stock: String(i.min_stock || ""),
    });
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este componente?")) return;
    const { error } = await supabase.from("components").delete().eq("id", id);
    if (error) return setMsg(error.message);
    setItems((a) => a.filter((x) => x.id !== id));
    setMsg("Componente excluído com sucesso.");
  }

  async function salvar() {
    const payload = {
      name: form.name,
      category: form.category,
      equipment: form.equipment,
      supplier_id: form.supplier_id || null,
      quantity: Number(form.quantity || 0),
      min_stock: Number(form.min_stock || 0),
      updated_at: new Date().toISOString(),
    };

    const res = editing
      ? await supabase.from("components").update(payload).eq("id", editing)
      : await supabase.from("components").insert({ ...payload, created_at: new Date().toISOString() });

    if (res.error) return setMsg(res.error.message);

    setMsg(editing ? "Componente atualizado com sucesso." : "Componente salvo com sucesso.");
    setForm(empty);
    setEditing(null);
    carregar();
  }

  async function cadastrarPadrao(equipamento?: string) {
    setMsg("");
    setLoadingPadrao(true);
    try {
      const resultado = await cadastrarComponentesPadrao(equipamento);
      setMsg(`Lista padrão atualizada. Criados: ${resultado.criados}. Atualizados: ${resultado.atualizados}.`);
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar componentes padrão.");
    } finally {
      setLoadingPadrao(false);
    }
  }

  const composicaoSelecionada = composicaoDoEquipamento(equipmentView);
  const filtered = items.filter((i) => textMatch(i, search));
  const filteredByEquipment = filtered.filter((i) => String(i.equipment || "") === equipmentView);

  return (
    <>
      <Title title="Componentes" desc="Controle de componentes por equipamento e baixa automática na saída do pedido." />

      <section className="card">
        <h2 className="card-title">Lista padrão por equipamento</h2>
        <div className="form-grid">
          <SelectField label="Equipamento" value={equipmentView} onChange={setEquipmentView}>
            {EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectField>
        </div>

        <div className="form-actions">
          <button className="btn btn-blue" onClick={() => cadastrarPadrao(equipmentView)} disabled={loadingPadrao}>
            {loadingPadrao ? "Cadastrando..." : "Cadastrar lista deste equipamento"}
          </button>
          <button className="btn btn-gray" onClick={() => cadastrarPadrao()} disabled={loadingPadrao}>
            Cadastrar listas de todos
          </button>
        </div>

        <div className="product-list-grid" style={{ marginTop: 18 }}>
          {composicaoSelecionada.map((item) => {
            const cadastrado = items.find((i) => normalizarComponente(i.name) === normalizarComponente(item.name) && i.equipment === equipmentView);
            return (
              <div key={`${equipmentView}-${item.name}`} className="stat-card user-card">
                <strong>{item.name}</strong>
                <small>Categoria: {item.category}</small>
                <small>Consumo por equipamento: {quantidadeFormatada(item.quantity)}</small>
                <small>Estoque atual: {quantidadeFormatada(Number(cadastrado?.quantity || 0))}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">{editing ? "Editar componente" : "Novo componente"}</h2>
        <div className="form-grid">
          <Field label="Nome" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Categoria" value={form.category} onChange={(v) => set("category", v)} />
          <SelectField label="Equipamento" value={form.equipment} onChange={(v) => set("equipment", v)}>
            {EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectField>
          <SelectField label="Fornecedor" value={form.supplier_id} onChange={(v) => set("supplier_id", v)}>
            <option value="">Selecione</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <Field label="Quantidade em estoque" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} />
          <Field label="Estoque mínimo" type="number" value={form.min_stock} onChange={(v) => set("min_stock", v)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar componente"}</button>
          <button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button>
        </div>
        {msg && <Message text={msg} />}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Componentes cadastrados de {equipmentView}</h2>
        <div className="product-list-grid">
          {filteredByEquipment.map((i) => (
            <div key={i.id} className="stat-card user-card">
              <strong>{i.name}</strong>
              <small>{i.equipment}</small>
              <small>Categoria: {i.category || "-"}</small>
              <small>Fornecedor: {suppliers.find((s) => s.id === i.supplier_id)?.name || "-"}</small>
              <small>Qtd: {quantidadeFormatada(Number(i.quantity || 0))}</small>
              <small>Mínimo: {quantidadeFormatada(Number(i.min_stock || 0))}</small>
              <div className="form-actions">
                <button className="btn btn-blue" onClick={() => editar(i)}>Editar</button>
                <button className="btn btn-red" onClick={() => excluir(i.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Montagens({ profile, search }: { profile: Profile } & SearchProps) { const empty = { equipment: EQUIPAMENTOS[0], quantity: "1", technician_id: "" }; const [form, setForm] = useState(empty); const [technicians, setTechnicians] = useState<Profile[]>([]); const [items, setItems] = useState<AnyRow[]>([]); const [editing, setEditing] = useState<string | null>(null); const [msg, setMsg] = useState(""); useEffect(() => { carregar(); }, []); async function carregar() { const { data: tech } = await supabase.from("profiles").select("*").eq("role", "tecnico"); setTechnicians((tech || []) as Profile[]); const { data: a } = await supabase.from("assemblies").select("*").order("created_at", { ascending: false }); setItems(a || []); } function set(c: string, v: string) { setForm((a) => ({ ...a, [c]: v })); } function editar(i: AnyRow) { setEditing(i.id); setForm({ equipment: i.equipment || EQUIPAMENTOS[0], quantity: String(i.quantity || 1), technician_id: i.technician_id || "" }); } async function excluir(id: string) { if (!confirm("Excluir esta montagem?")) return; const { error } = await supabase.from("assemblies").delete().eq("id", id); if (error) return setMsg(error.message); setItems((a) => a.filter((x) => x.id !== id)); setMsg("Montagem excluída com sucesso."); } async function salvar() { const payload = { equipment: form.equipment, quantity: Number(form.quantity || 1), technician_id: form.technician_id || null, created_by: profile.id }; const res = editing ? await supabase.from("assemblies").update(payload).eq("id", editing) : await supabase.from("assemblies").insert(payload); if (res.error) return setMsg(res.error.message); setMsg(editing ? "Montagem atualizada com sucesso." : "Montagem registrada com sucesso."); setForm(empty); setEditing(null); carregar(); } const filtered = items.filter((i) => textMatch(i, search)); return <><Title title="Montagens" desc="Registro, edição e exclusão de montagem de equipamentos." /><section className="card"><h2 className="card-title">{editing ? "Editar montagem" : "Registrar montagem"}</h2><div className="form-grid"><SelectField label="Equipamento" value={form.equipment} onChange={(v) => set("equipment", v)}>{EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}</SelectField><Field label="Quantidade" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} /><SelectField label="Técnico" value={form.technician_id} onChange={(v) => set("technician_id", v)}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></div><div className="form-actions"><button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Registrar montagem"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button></div>{msg && <Message text={msg} />}</section><section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Montagens lançadas</h2><div className="product-list-grid">{filtered.map((i) => <div key={i.id} className="stat-card user-card"><strong>{i.equipment}</strong><small>Qtd: {i.quantity}</small><div className="form-actions"><button className="btn btn-blue" onClick={() => editar(i)}>Editar</button><button className="btn btn-red" onClick={() => excluir(i.id)}>Excluir</button></div></div>)}</div></section></>; }

function ContaAzul() { return <><Title title="Conta Azul" desc="Configuração para criação automática de Nota Fiscal." /><section className="card"><h2 className="card-title">Integração Conta Azul</h2><p style={{ color: "#94a3b8" }}>Configure na Vercel as variáveis CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REFRESH_TOKEN. O botão de NF nos pedidos chama a API /api/conta-azul/emitir-nf.</p><div className="reports-grid" style={{ marginTop: 24 }}><StatCard label="Status" value="Preparado" /><StatCard label="NF automática" value="Botão nos pedidos" /><StatCard label="Ambiente" value="Produção/Vercel" /></div></section></>; }
function Relatorios({ profile }: { profile: Profile }) {
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [movements, setMovements] = useState<AnyRow[]>([]);
  const [components, setComponents] = useState<AnyRow[]>([]);
  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data: p } = await supabase.from("products").select("*");
    const { data: m } = await supabase.from("movements").select("*");
    const { data: c } = await supabase.from("components").select("*");
    const { data: o } = await supabase.from("orders").select("*");
    setProducts(p || []);
    setMovements(m || []);
    setComponents(c || []);
    setOrders(o || []);
  }

  function inDateRange(row: AnyRow) {
    const created = row.created_at ? new Date(row.created_at) : null;
    if (!created || Number.isNaN(created.getTime())) return true;
    if (dateStart && created < new Date(`${dateStart}T00:00:00`)) return false;
    if (dateEnd && created > new Date(`${dateEnd}T23:59:59`)) return false;
    return true;
  }

  const filteredMovements = movements.filter(inDateRange);
  const filteredOrders = orders.filter(inDateRange);

  const entradas = filteredMovements.filter((m) => m.type === "entrada").reduce((s, m) => s + Number(m.quantity || 0), 0);
  const saidas = filteredMovements.filter((m) => m.type === "saida").reduce((s, m) => s + Number(m.quantity || 0), 0);
  const produtosVendidos = filteredOrders.reduce((s, o) => s + Number(o.quantity || 0), 0) + saidas;
  const pedidosNoPeriodo = filteredOrders.length;

  const valorVenda = products.reduce((s, p) => s + Number(p.sale_price || 0) * Number(p.quantity || 0), 0);
  const valorCustoProdutos = products.reduce((s, p) => s + Number(p.cost_price || 0) * Number(p.quantity || 0), 0);
  const valorCustoComponentes = components.reduce((s, c) => s + Number(c.cost_price || 0) * Number(c.quantity || 0), 0);
  const valorCusto = valorCustoProdutos + valorCustoComponentes;
  const lucro = valorVenda - valorCusto;
  const totalProdutos = products.reduce((s, p) => s + Number(p.quantity || 0), 0);
  const totalComponentes = components.reduce((s, c) => s + Number(c.quantity || 0), 0);

  function exportarPdf() {
    const periodo = dateStart || dateEnd ? `${dateStart || "início"} até ${dateEnd || "hoje"}` : "Todos os períodos";
    const html = `
      <html>
        <head>
          <title>Relatório StockPro</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 26px; color: #0f172a; }
            h1 { margin-bottom: 4px; font-size: 23px; }
            p { color: #475569; font-size: 12px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
            .card { background: #f1f5f9; padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1; min-height: 58px; }
            .card span { display: block; color: #475569; font-size: 10px; }
            .card strong { font-size: 16px; display: block; margin-top: 4px; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 22px; }
            th, td { border-bottom: 1px solid #cbd5e1; padding: 7px; text-align: left; font-size: 11px; }
            th { background: #e2e8f0; }
          </style>
        </head>
        <body>
          <h1>Relatório StockPro - Grupo Vogel</h1>
          <p>Período: ${periodo}</p>
          <div class="grid">
            <div class="card"><span>Total de entradas</span><strong>+${entradas}</strong></div>
            <div class="card"><span>Total de saídas</span><strong>-${saidas}</strong></div>
            <div class="card"><span>Produtos vendidos</span><strong>${produtosVendidos}</strong></div>
            <div class="card"><span>Pedidos no período</span><strong>${pedidosNoPeriodo}</strong></div>
            <div class="card"><span>Valor estoque venda</span><strong>${money(valorVenda)}</strong></div>
            <div class="card"><span>Valor estoque custo</span><strong>${money(valorCusto)}</strong></div>
            <div class="card"><span>Lucro estimado</span><strong>${money(lucro)}</strong></div>
            <div class="card"><span>Produtos cadastrados</span><strong>${products.length}</strong></div>
            <div class="card"><span>Componentes cadastrados</span><strong>${components.length}</strong></div>
          </div>
          <table>
            <thead><tr><th>Categoria</th><th>Itens cadastrados</th><th>Unidades em estoque</th></tr></thead>
            <tbody>
              <tr><td>Produtos</td><td>${products.length}</td><td>${totalProdutos}</td></tr>
              <tr><td>Componentes</td><td>${components.length}</td><td>${totalComponentes}</td></tr>
              <tr><td>Produtos vendidos</td><td>${pedidosNoPeriodo} pedido(s)</td><td>${produtosVendidos}</td></tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const janela = window.open("", "_blank");
    if (!janela) { alert("O navegador bloqueou a abertura do relatório. Permita pop-ups para este site."); return; }
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    janela.print();
  }

  return <>
    <Title title="Relatórios" desc="Resumo geral do estoque, movimentações, produtos e componentes." />

    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="card-title">Filtros do relatório</h2>
      <div className="form-grid">
        <Field label="Data inicial" type="date" value={dateStart} onChange={setDateStart} />
        <Field label="Data final" type="date" value={dateEnd} onChange={setDateEnd} />
        <div className="field"><label>&nbsp;</label><button className="btn btn-gray" onClick={() => { setDateStart(""); setDateEnd(""); }}>Limpar filtro</button></div>
      </div>
    </section>

    <div className="reports-grid">
      <StatCard label="Total entradas" value={`+${entradas}`} color="#4ade80" />
      <StatCard label="Total saídas" value={`-${saidas}`} color="#f87171" />
      {profile.role === "administrador" && <StatCard label="Produtos vendidos" value={String(produtosVendidos)} color="#60a5fa" />}
      <StatCard label="Pedidos no período" value={String(pedidosNoPeriodo)} />
      <StatCard label="Valor estoque venda" value={money(valorVenda)} />
      <StatCard label="Valor estoque custo" value={money(valorCusto)} />
      <StatCard label="Lucro estimado" value={money(lucro)} />
      <StatCard label="Produtos cadastrados" value={String(products.length)} />
      <StatCard label="Componentes cadastrados" value={String(components.length)} />
      <StatCard label="Movimentações" value={String(filteredMovements.length)} />
    </div>

    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="card-title">Gerar relatório</h2>
      <p style={{ color: "#94a3b8", marginBottom: 20 }}>Gere um relatório em PDF com o resumo do período selecionado.</p>
      <button className="btn btn-blue" onClick={exportarPdf}>Gerar relatório PDF</button>
    </section>
  </>;
}

function MeuPerfil({ profile, onUpdated }: { profile: Profile; onUpdated: () => void }) { const [form, setForm] = useState({ name: profile.name || "", document: maskCpfCnpj(profile.document || ""), phone: maskPhone(profile.phone || ""), cep: maskCep(profile.cep || ""), city: profile.city || "", street: profile.street || "", number: profile.number || "", no_number: Boolean(profile.no_number), neighborhood: profile.neighborhood || "" }); const [msg, setMsg] = useState(""); function set(c: string, v: any) { setForm((a) => ({ ...a, [c]: v })); } async function buscarCepPerfil(v: string) { const end = await buscarCep(v); if (end) setForm((a) => ({ ...a, ...end })); } async function salvar() { const { error } = await supabase.from("profiles").update({ name: form.name, document: onlyNumbers(form.document), phone: onlyNumbers(form.phone), cep: onlyNumbers(form.cep), city: form.city, street: form.street, number: form.no_number ? "" : form.number, no_number: form.no_number, neighborhood: form.neighborhood, updated_at: new Date().toISOString() }).eq("id", profile.id); if (error) return setMsg(error.message); setMsg("Perfil atualizado com sucesso."); onUpdated(); } return <><Title title="Meu Perfil" desc="Detalhes editáveis do seu cadastro." /><section className="card"><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="CPF ou CNPJ" value={form.document} onChange={(v) => set("document", maskCpfCnpj(v))} /><Field label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} /><Field label="CEP" value={form.cep} onChange={(v) => { const c = maskCep(v); set("cep", c); if (onlyNumbers(c).length === 8) buscarCepPerfil(c); }} onBlur={() => buscarCepPerfil(form.cep)} /><Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} /><Field label="Rua" value={form.street} onChange={(v) => set("street", v)} /><Field label="Número" value={form.number} disabled={form.no_number} onChange={(v) => set("number", v)} /><Field label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} /></div><div className="form-actions"><button className="btn btn-green" onClick={salvar}>Salvar perfil</button></div>{msg && <Message text={msg} />}</section></>; }

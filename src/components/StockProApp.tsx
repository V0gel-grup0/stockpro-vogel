"use client";

import { validarCadastroPessoa } from "@/lib/validacao-cadastro";
import QuotesModule from "@/components/QuotesModule";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";
import {
  canDeleteAssembly,
  canDeleteComponent,
  canDeleteOrder,
  canDeleteProducts,
  canManageOpportunityRecord,
  canReviewRepresentative,
  canUnifyComponents,
  canUpdateOrderStatus,
  canWriteProducts,
  type AppRole,
} from "@/lib/permissions";

function getSaleCode(order: any) {
  if (order?.order_number !== undefined && order?.order_number !== null) {
    return `PV-${String(order.order_number).padStart(6, "0")}`;
  }
  return order?.id ? `PV-${String(order.id).slice(0, 6).toUpperCase()}` : "Pedido";
}


import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Role = AppRole;
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
type CrmNotificationItem = {
  opportunity_id: string;
  title: string;
  stage: string;
  next_action: string;
  next_action_at: string;
  estimated_value: number | string;
  client: {
    id: string;
    name: string;
  };
  responsible: {
    id: string;
    name: string;
  } | null;
};
type CrmNotifications = {
  resumo: {
    atrasadas: number;
    hoje: number;
    proximas: number;
    total_atencao: number;
  };
  atrasadas: CrmNotificationItem[];
  hoje: CrmNotificationItem[];
  proximas: CrmNotificationItem[];
};
type CrmNavigationTarget = {
  clientId: string;
  opportunityId: string;
  requestId: number;
};

type SearchProps = { search: string };

function onlyNumbers(value: string) {
  return String(value || "").replace(/\D/g, "");
}
function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const PROPOSTA_STATUS = ["Lead Frio", "Lead Morno", "Venda", "Pós-Venda"];
const COLABORADOR_ROLES: Role[] = ["gerente", "vendedor", "tecnico", "funcionario"];
const CRM_CREATOR_ROLES: Role[] = ["administrador", "gerente", "vendedor", "representante"];
const CRM_STAGES = [
  { value: "lead", label: "Lead", color: "#60a5fa" },
  { value: "proposal", label: "Proposta", color: "#a78bfa" },
  { value: "negotiation", label: "Negociação", color: "#f59e0b" },
  { value: "order_created", label: "Pedido feito", color: "#22d3ee" },
  { value: "billing", label: "Cobrança", color: "#f97316" },
  { value: "completed", label: "Finalizado", color: "#4ade80" },
  { value: "post_sale", label: "Pós-venda", color: "#f472b6" },
] as const;
const CRM_ACTIVITY_TYPES = [
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "visit", label: "Visita" },
  { value: "meeting", label: "Reunião" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "billing", label: "Cobrança" },
  { value: "follow_up", label: "Retorno" },
  { value: "other", label: "Outro" },
] as const;
const CRM_NEXT_ACTION_TYPES = [
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "visit", label: "Visita" },
  { value: "meeting", label: "Reunião" },
  { value: "proposal_sent", label: "Enviar proposta" },
  { value: "billing", label: "Cobrança" },
  { value: "follow_up", label: "Retorno" },
  { value: "other", label: "Outro" },
] as const;
const EMPTY_CRM_NOTIFICATIONS: CrmNotifications = {
  resumo: {
    atrasadas: 0,
    hoje: 0,
    proximas: 0,
    total_atencao: 0,
  },
  atrasadas: [],
  hoje: [],
  proximas: [],
};

function crmStageLabel(stage: string) {
  return CRM_STAGES.find((item) => item.value === stage)?.label || stage;
}

function crmActivityTypeLabel(type: string) {
  return CRM_ACTIVITY_TYPES.find((item) => item.value === type)?.label || type;
}

function crmNextActionLabel(action: string) {
  return CRM_NEXT_ACTION_TYPES.find((item) => item.value === action)?.label || action;
}

function currentActivityDateTime() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    type: "call",
    description: "",
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

function formatCrmNotificationDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function formatCrmActivityDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return `${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function CrmNotificationSection({
  title,
  items,
  tone,
  onView,
}: {
  title: string;
  items: CrmNotificationItem[];
  tone: "overdue" | "today" | "upcoming";
  onView: (item: CrmNotificationItem) => void;
}) {
  const colors = {
    overdue: {
      border: "rgba(248,113,113,.55)",
      background: "rgba(127,29,29,.3)",
      title: "#fca5a5",
    },
    today: {
      border: "rgba(250,204,21,.45)",
      background: "rgba(113,63,18,.25)",
      title: "#fde047",
    },
    upcoming: {
      border: "rgba(96,165,250,.32)",
      background: "rgba(15,23,42,.72)",
      title: "#93c5fd",
    },
  }[tone];

  return <section style={{ marginTop: 16 }}>
    <strong style={{ color: colors.title, fontSize: 12, letterSpacing: ".08em" }}>{title}</strong>
    {items.length === 0 ? <p style={{ color: "#64748b", margin: "8px 0 0" }}>Nenhuma atividade.</p> : <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      {items.map((item) => <div key={item.opportunity_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.background, padding: 12 }}>
        <strong style={{ marginBottom: 4 }}>{item.client.name}</strong>
        <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>{item.title || "Sem título"}</div>
        <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 5 }}>{crmNextActionLabel(item.next_action)}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 5 }}>{formatCrmNotificationDate(item.next_action_at)}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 3 }}>Responsável: {item.responsible?.name || "Não definido"}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 3 }}>Etapa: {crmStageLabel(item.stage)}</div>
        <button type="button" className="btn btn-blue" style={{ marginTop: 10, minHeight: 34, padding: "7px 11px" }} onClick={() => onView(item)}>Ver no CRM</button>
      </div>)}
    </div>}
  </section>;
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

const EQUIPAMENTOS: string[] = [...EQUIPMENT_CATALOG];

type ComposiçãoItem = { name: string; category: string; quantity: number };

function itemComposição(name: string, quantity = 1, category = "Componente") {
  return { name, quantity, category };
}

function baseCelt5000(voltagem: "220V" | "380V", turbinas: 1 | 2 | 3, plus = false): ComposiçãoItem[] {
  const sufixoInversor = voltagem === "380V" ? " - 380V" : "";
  const qtdInversor = voltagem === "220V" ? turbinas : 1;
  const rele = turbinas === 1 ? "Relê simples" : "Relê duplo";
  const quadro = turbinas === 3 ? "Quadro 60 X 60 X 20" : "Quadro 50 X 40 X 20";

  return [
    itemComposição(`Inversor 5CV${sufixoInversor}`, qtdInversor, "Inversor"),
    itemComposição(quadro, 1, "Quadro"),
    itemComposição("Contator 32a", 1, "Elétrica"),
    itemComposição("Chave seletora liga/desliga", 1, "Elétrica"),
    itemComposição("Veneziana com filtro 106 X 106 X 13,5 mm", 1, "Ventilação"),
    itemComposição("Veneziana com filtro 150 X 150 X 13,5 mm", 1, "Ventilação"),
    itemComposição("Ventilador 120 X 120 X 38", 1, "Ventilação"),
    itemComposição(rele, turbinas, "Elétrica"),
    itemComposição("Prensa cabo", 1, "Acabamento"),
    itemComposição("Borne 6mm", turbinas * 3, "Elétrica"),
    itemComposição("Tampa borne", turbinas, "Elétrica"),
    itemComposição("Poste borne", 2, "Elétrica"),
    itemComposição("Trilho Din 0,2 m", 1, "Elétrica"),
    itemComposição("Suporte trilho Din", 2, "Elétrica"),
    itemComposição("Canaleta 30cm", 1, "Acabamento"),
    itemComposição("Adesivo painel", 1, "Acabamento"),
    itemComposição("Adesivo testado", 1, "Acabamento"),
    itemComposição(`Adesivo tensão ${voltagem}`, 1, "Acabamento"),
    itemComposição("Manual", 1, "Documentação"),
    itemComposição("Fio 2,5", Number((2.15 * turbinas).toFixed(2)), "Fiação"),
    itemComposição("Fio 0,50", Number((2.8 * turbinas).toFixed(2)), "Fiação"),
    itemComposição("Caixa de papelão", 1, "Embalagem"),
  ];
}

const COMPOSICOES_EQUIPAMENTOS: Record<string, ComposiçãoItem[]> = {
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
    itemComposição("Inversor 2CV 220V", 1, "Inversor"),
    itemComposição("Botão liga/desliga", 1, "Elétrica"),
  ],
  "CeltPlus - 380V": [
    itemComposição("Inversor 2CV 380V", 1, "Inversor"),
    itemComposição("Botão liga/desliga", 1, "Elétrica"),
  ],
};

function composiçãoDoEquipamento(equipment: string) {
  return COMPOSICOES_EQUIPAMENTOS[equipment] || [];
}

function equipamentosQueUsamComponente(nomeComponente: string) {
  const chaveComponente = normalizarComponente(nomeComponente);

  return EQUIPAMENTOS
    .map((equipamento) => {
      const total = composiçãoDoEquipamento(equipamento)
        .filter((item) => normalizarComponente(item.name) === chaveComponente)
        .reduce((soma, item) => soma + Number(item.quantity || 0), 0);

      return { equipamento, quantity: Number(total.toFixed(4)) };
    })
    .filter((item) => item.quantity > 0);
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
  const componentes = new Map<string, { name: string; category: string; equipment_division: { equipment_name: string; qty_per_equipment: number }[] }>();

  for (const equipamento of equipamentos) {
    for (const item of composiçãoDoEquipamento(equipamento)) {
      const chave = normalizarComponente(item.name);
      const atual = componentes.get(chave) || { name: item.name, category: item.category, equipment_division: [] };
      atual.equipment_division.push({ equipment_name: equipamento, qty_per_equipment: Number(item.quantity || 0) });
      componentes.set(chave, atual);
    }
  }

  const response = await fetch("/api/components", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert_defaults", items: Array.from(componentes.values()) }),
  });
  const data = await response.json();
  if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao cadastrar componentes padrão.");
  return { criados: Number(data.criados || 0), atualizados: Number(data.atualizados || 0) };
}

async function unificarComponentesDuplicados() {
  const response = await fetch("/api/components", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unify_duplicates" }),
  });
  const data = await response.json();
  if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao unificar componentes.");
  return Number(data.unificados || 0);
}

async function cadastrarEquipamentosMontadosPadrao() {
  const response = await fetch("/api/mounted-equipments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipment_names: EQUIPAMENTOS }),
  });
  const data = await response.json();
  if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao cadastrar equipamentos montados padrão.");
  return { criados: Number(data.criados || 0), atualizados: Number(data.atualizados || 0) };
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
  administrador: ["Dashboard", "Produtos", "Movimentações", "Clientes", "CRM", "Orçamentos", "Pedidos", "Fornecedores", "Montagens", "Equipamentos Montados", "Colaboradores", "Representantes", "Análise de Cadastros", "Componentes", "Conta Azul", "Relatórios", "Meu Perfil"],
  gerente: ["Dashboard", "Produtos", "Movimentações", "Clientes", "CRM", "Orçamentos", "Pedidos", "Fornecedores", "Montagens", "Equipamentos Montados", "Colaboradores", "Representantes", "Relatórios", "Meu Perfil"],
  vendedor: ["Dashboard", "Produtos", "Clientes", "CRM", "Orçamentos", "Pedidos", "Representantes", "Meu Perfil"],
  funcionario: ["Dashboard", "Produtos", "Movimentações", "Clientes", "CRM", "Pedidos", "Meu Perfil"],
  tecnico: ["Dashboard", "CRM", "Montagens", "Equipamentos Montados", "Componentes", "Meu Perfil"],
  representante: ["Dashboard", "Clientes", "CRM", "Orçamentos", "Pedidos", "Meu Perfil"],
};

export default function StockProApp() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [page, setPage] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [crmNotifications, setCrmNotifications] = useState<CrmNotifications>(EMPTY_CRM_NOTIFICATIONS);
  const [crmNavigationTarget, setCrmNavigationTarget] = useState<CrmNavigationTarget | null>(null);
  const [quoteNavigationTarget, setQuoteNavigationTarget] = useState<{ clientId: string; opportunityId: string; requestId: number } | null>(null);

  useEffect(() => {
    carregarSessao();
  }, []);

  useEffect(() => {
    if (profile) carregarNotificacoes();
  }, [profile]);

  async function carregarSessao() {
    setSessionLoading(true);

    try {
      const respostaPerfil = await fetch("/api/auth/profile", {
        cache: "no-store",
      });

      if (respostaPerfil.status === 401) {
        setProfile(null);
        router.replace("/login");
        return;
      }

      if (!respostaPerfil.ok) {
        setProfile(null);
        router.replace("/login");
        return;
      }

      const perfilCompleto = await respostaPerfil.json();

      const roleNormalizada = String(perfilCompleto.role || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

      const rolesPermitidas: Role[] = [
        "administrador",
        "gerente",
        "vendedor",
        "funcionario",
        "tecnico",
        "representante",
      ];

      if (!rolesPermitidas.includes(roleNormalizada as Role)) {
        console.error("Perfil com função inválida:", perfilCompleto.role);
        setProfile(null);
        router.replace("/login");
        return;
      }

      const perfilFinal = {
        ...perfilCompleto,
        role: roleNormalizada as Role,
      } as Profile;

      setProfile(perfilFinal);
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
      setProfile(null);
      router.replace("/login");
    } finally {
      setSessionLoading(false);
    }
  }

  async function carregarNotificacoes() {
    try {
      const response = await fetch("/api/crm/notifications", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao carregar notificações do CRM.");
      }

      setCrmNotifications({
        resumo: data.resumo,
        atrasadas: data.atrasadas || [],
        hoje: data.hoje || [],
        proximas: data.proximas || [],
      });
    } catch (error) {
      console.error("Erro ao carregar notificações do CRM:", error);
    }
  }

  function viewCrmNotification(item: CrmNotificationItem) {
    setCrmNavigationTarget({
      clientId: item.client.id,
      opportunityId: item.opportunity_id,
      requestId: Date.now(),
    });
    setPage("CRM");
    setNotificationsOpen(false);
  }

  function createQuoteFromCrm(opportunity: AnyRow) {
    setQuoteNavigationTarget({
      clientId: opportunity.client_id,
      opportunityId: opportunity.id,
      requestId: Date.now(),
    });
    setPage("Orçamentos");
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Nao foi possivel encerrar a sessao.");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Erro ao sair:", error);
      alert("Nao foi possivel encerrar sua sessao. Tente novamente.");
    }
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
            <button className="icon-button" style={{ width: "auto", minWidth: 52, padding: "0 13px" }} aria-label="Abrir atividades do CRM" onClick={() => setNotificationsOpen((v) => !v)}>🔔{crmNotifications.resumo.total_atencao > 0 ? ` ${crmNotifications.resumo.total_atencao}` : ""}</button>
            {notificationsOpen && <div className="notifications-panel" style={{ width: "min(430px, 92vw)", maxHeight: "min(680px, calc(100vh - 90px))", overflowY: "auto" }}>
              <strong style={{ fontSize: 17 }}>CRM — Atividades</strong>
              <CrmNotificationSection title="ATRASADAS" items={crmNotifications.atrasadas} tone="overdue" onView={viewCrmNotification} />
              <CrmNotificationSection title="HOJE" items={crmNotifications.hoje} tone="today" onView={viewCrmNotification} />
              <CrmNotificationSection title="PRÓXIMOS 7 DIAS" items={crmNotifications.proximas} tone="upcoming" onView={viewCrmNotification} />
              <button className="btn btn-gray" style={{ marginTop: 16 }} onClick={carregarNotificacoes}>Atualizar</button>
            </div>}
          </div>
        </div>
      </header>
      <div className={`layout-grid ${!menuOpen ? "menu-collapsed" : ""}`}>
        {menuOpen && <aside className="sidebar">
          <div className="brand"><img src="/logo-vogel.png" alt="Grupo Vogel" className="brand-logo" /><div className="brand-text"><strong>StockPro</strong><small>Grupo Vogel Brasil</small></div></div>
          <nav className="menu-list">{menus.map((item) => <button key={item} className={`menu-button ${page === item ? "active" : ""}`} onClick={() => setPage(item)}>{item}</button>)}</nav>
          <div className="sidebar-footer">
            <div className="account-details">
              <strong className="account-name">{profile.name || "Colaborador"}</strong>
              <span className="account-email">{profile.email}</span>
              <small className="account-role">{formatRole(profile.role)}</small>
              {profile.access_code && <small className="account-code">Código: {profile.access_code}</small>}
            </div>
            <button className="btn btn-gray account-logout" onClick={logout}>Sair</button>
          </div>
        </aside>}
        <main className="main-content">
          {page === "Dashboard" && <Dashboard profile={profile} />}
          {page === "Produtos" && <Produtos search={search} profile={profile} />}
          {page === "Movimentações" && <Movimentações profile={profile} />}
          {page === "Clientes" && <Pessoas title="Clientes" table="clients" kind="cliente" search={search} profile={profile} />}
          {page === "CRM" && <CRM profile={profile} search={search} notifications={crmNotifications} onRefreshNotifications={carregarNotificacoes} navigationTarget={crmNavigationTarget} onCreateQuote={createQuoteFromCrm} />}
          {page === "Orçamentos" && <QuotesModule profile={profile} search={search} initialContext={quoteNavigationTarget} onContextConsumed={() => setQuoteNavigationTarget(null)} />}
          {page === "Fornecedores" && <Pessoas title="Fornecedores" table="suppliers" kind="fornecedor" search={search} profile={profile} />}
          {page === "Montagens" && <Montagens profile={profile} search={search} />}
          {page === "Equipamentos Montados" && <EquipamentosMontados search={search} />}
          {page === "Colaboradores" && <Colaboradores roles={COLABORADOR_ROLES} title="Colaboradores" currentUser={profile} search={search} />}
          {page === "Representantes" && <Colaboradores role="representante" title="Representantes" currentUser={profile} search={search} />}
          {page === "Análise de Cadastros" && <AnáliseCadastros currentUser={profile} search={search} />}
          {page === "Pedidos" && <Pedidos profile={profile} search={search} />}
          {page === "Componentes" && <Componentes search={search} profile={profile} />}
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
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.sucesso) setCounts(data.counts);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    }
  })(); }, []);
  return <><Title title="Dashboard" desc={`Resumo geral do sistema. Bem-vindo, ${profile.name || "usuário"}.`} /><div className="reports-grid"><StatCard label="Produtos" value={String(counts.products)} /><StatCard label="Clientes" value={String(counts.clients)} /><StatCard label="Pedidos" value={String(counts.orders)} /><StatCard label="Cadastros pendentes" value={String(counts.pending)} color="#facc15" /><StatCard label="Estoque baixo" value={String(counts.low)} color="#f87171" /><StatCard label="Acesso" value={formatRole(profile.role)} /></div></>;
}

function CRM({
  profile,
  search,
  notifications,
  onRefreshNotifications,
  navigationTarget,
  onCreateQuote,
}: {
  profile: Profile;
  notifications: CrmNotifications;
  onRefreshNotifications: () => Promise<void>;
  navigationTarget: CrmNavigationTarget | null;
  onCreateQuote: (opportunity: AnyRow) => void;
} & SearchProps) {
  const empty = {
    client_id: "",
    stage: "lead",
    title: "",
    estimated_value: "",
    probability: "",
    responsible_id: "",
    next_action: "",
    next_action_at: "",
    notes: "",
  };
  const [opportunities, setOpportunities] = useState<AnyRow[]>([]);
  const [crmQuotes, setCrmQuotes] = useState<AnyRow[]>([]);
  const canUseQuotes = ["administrador", "gerente", "vendedor", "representante"].includes(profile.role);
  const [clients, setClients] = useState<AnyRow[]>([]);
  const [responsibleProfiles, setResponsibleProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<AnyRow | null>(null);
  const [deletingOpportunityId, setDeletingOpportunityId] = useState<string | null>(null);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientListOpen, setClientListOpen] = useState(false);
  const [clientSummary, setClientSummary] = useState<AnyRow | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [highlightedOpportunityId, setHighlightedOpportunityId] = useState("");
  const [activitiesByOpportunity, setActivitiesByOpportunity] = useState<Record<string, AnyRow[]>>({});
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);
  const [activityFormOpportunityId, setActivityFormOpportunityId] = useState<string | null>(null);
  const [activityForm, setActivityForm] = useState(currentActivityDateTime);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityLoadingId, setActivityLoadingId] = useState<string | null>(null);
  const [activityErrors, setActivityErrors] = useState<Record<string, string>>({});
  const [draggedOpportunityId, setDraggedOpportunityId] = useState<string | null>(null);
  const [dragOriginStage, setDragOriginStage] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragStartBlockedRef = useRef(false);
  const canCreate = CRM_CREATOR_ROLES.includes(profile.role);

  useEffect(() => {
    carregar();
    onRefreshNotifications();
  }, []);

  useEffect(() => {
    if (!navigationTarget || clients.length === 0 || opportunities.length === 0) {
      return;
    }

    const client = clients.find((item) => item.id === navigationTarget.clientId);

    if (client) {
      setSelectedClientId(client.id);
      setClientQuery(client.name || "");
      setClientListOpen(false);
    }

    setHighlightedOpportunityId(navigationTarget.opportunityId);

    const scrollTimer = window.setTimeout(() => {
      document
        .getElementById(`crm-opportunity-${navigationTarget.opportunityId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 100);
    const highlightTimer = window.setTimeout(() => {
      setHighlightedOpportunityId("");
    }, 5000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [navigationTarget?.requestId, clients.length, opportunities.length]);

  useEffect(() => {
    if (!selectedClientId) {
      setClientSummary(null);
      setSummaryError("");
      setSummaryLoading(false);
      return;
    }

    const controller = new AbortController();

    async function carregarResumo() {
      setClientSummary(null);
      setSummaryError("");
      setSummaryLoading(true);

      try {
        const response = await fetch(
          `/api/crm/clients/${encodeURIComponent(selectedClientId)}/summary`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const data = await response.json();

        if (!response.ok || !data.sucesso) {
          throw new Error(
            data.erro || "Erro ao carregar o resumo do cliente."
          );
        }

        setClientSummary(data);
      } catch (error) {
        if (controller.signal.aborted) return;

        setSummaryError(
          error instanceof Error
            ? error.message
            : "Erro ao carregar o resumo do cliente."
        );
      } finally {
        if (!controller.signal.aborted) {
          setSummaryLoading(false);
        }
      }
    }

    carregarResumo();

    return () => controller.abort();
  }, [selectedClientId]);

  function set(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetOpportunityForm() {
    setForm(empty);
    setEditingOpportunity(null);
    setShowForm(false);
  }

  function openNewOpportunityForm() {
    setMsg("");
    setEditingOpportunity(null);
    setForm({
      ...empty,
      client_id: selectedClientId,
    });
    setShowForm(true);
  }

  function toDateTimeLocal(value: unknown) {
    if (!value) return "";

    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) return "";

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  }

  function openEditOpportunityForm(opportunity: AnyRow) {
    setMsg("");
    setEditingOpportunity(opportunity);
    setForm({
      client_id: String(opportunity.client_id || ""),
      stage: String(opportunity.stage || "lead"),
      title: String(opportunity.title || ""),
      estimated_value: String(opportunity.estimated_value ?? ""),
      probability: String(opportunity.probability ?? ""),
      responsible_id: String(opportunity.responsible_id || ""),
      next_action: String(opportunity.next_action || ""),
      next_action_at: toDateTimeLocal(opportunity.next_action_at),
      notes: String(opportunity.notes || ""),
    });
    setShowForm(true);

    window.setTimeout(() => {
      document
        .getElementById("crm-opportunity-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function canManageOpportunity(opportunity: AnyRow) {
    return canManageOpportunityRecord(profile, {
      created_by: opportunity.created_by || null,
      responsible_id: opportunity.responsible_id || null,
    });
  }

  async function loadOpportunityActivities(opportunityId: string, force = false) {
    if (!force && activitiesByOpportunity[opportunityId] !== undefined) {
      return;
    }

    setActivityLoadingId(opportunityId);
    setActivityErrors((current) => ({ ...current, [opportunityId]: "" }));

    try {
      const response = await fetch(
        `/api/crm/activities?opportunity_id=${encodeURIComponent(opportunityId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao carregar o histórico de atividades.");
      }

      setActivitiesByOpportunity((current) => ({
        ...current,
        [opportunityId]: data.activities || [],
      }));
    } catch (error) {
      setActivityErrors((current) => ({
        ...current,
        [opportunityId]:
          error instanceof Error
            ? error.message
            : "Erro ao carregar o histórico de atividades.",
      }));
    } finally {
      setActivityLoadingId((current) =>
        current === opportunityId ? null : current
      );
    }
  }

  async function toggleOpportunityHistory(opportunityId: string) {
    const isExpanded = expandedActivityIds.includes(opportunityId);

    setExpandedActivityIds((current) =>
      isExpanded
        ? current.filter((id) => id !== opportunityId)
        : [...current, opportunityId]
    );

    if (!isExpanded) {
      await loadOpportunityActivities(opportunityId);
    }
  }

  async function openActivityForm(opportunity: AnyRow) {
    setActivityFormOpportunityId(opportunity.id);
    setActivityForm(currentActivityDateTime());
    setActivityErrors((current) => ({ ...current, [opportunity.id]: "" }));
    setExpandedActivityIds((current) =>
      current.includes(opportunity.id) ? current : [...current, opportunity.id]
    );
    await loadOpportunityActivities(opportunity.id);
  }

  function closeActivityForm() {
    setActivityFormOpportunityId(null);
    setActivityForm(currentActivityDateTime());
  }

  async function saveActivity(opportunity: AnyRow) {
    const description = activityForm.description.trim();

    if (!description) {
      setActivityErrors((current) => ({
        ...current,
        [opportunity.id]: "Informe a observação da atividade.",
      }));
      return;
    }

    const happenedAt = new Date(`${activityForm.date}T${activityForm.time}`);

    if (Number.isNaN(happenedAt.getTime())) {
      setActivityErrors((current) => ({
        ...current,
        [opportunity.id]: "Informe uma data e hora válidas.",
      }));
      return;
    }

    setActivitySaving(true);
    setActivityErrors((current) => ({ ...current, [opportunity.id]: "" }));

    try {
      const response = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: opportunity.client_id,
          opportunity_id: opportunity.id,
          type: activityForm.type,
          description,
          happened_at: happenedAt.toISOString(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao registrar atividade.");
      }

      setActivitiesByOpportunity((current) => ({
        ...current,
        [opportunity.id]: [
          data.activity,
          ...(current[opportunity.id] || []),
        ],
      }));
      closeActivityForm();
      setMsg("Atividade registrada com sucesso.");
    } catch (error) {
      setActivityErrors((current) => ({
        ...current,
        [opportunity.id]:
          error instanceof Error
            ? error.message
            : "Erro ao registrar atividade.",
      }));
    } finally {
      setActivitySaving(false);
    }
  }

  async function carregar() {
    setLoading(true);

    try {
      const [opportunitiesResponse, clientsResponse, profilesResponse, quotesResponse] =
        await Promise.all([
          fetch("/api/crm/opportunities", { cache: "no-store" }),
          fetch("/api/clients", { cache: "no-store" }),
          fetch("/api/profiles", { cache: "no-store" }),
          canUseQuotes ? fetch("/api/quotes", { cache: "no-store" }) : Promise.resolve(null),
        ]);
      const [opportunitiesData, clientsData, profilesData, quotesData] =
        await Promise.all([
          opportunitiesResponse.json(),
          clientsResponse.json(),
          profilesResponse.json(),
          quotesResponse ? quotesResponse.json() : Promise.resolve({ sucesso: true, quotes: [] }),
        ]);

      if (!opportunitiesResponse.ok || !opportunitiesData.sucesso) {
        throw new Error(
          opportunitiesData.erro || "Erro ao carregar oportunidades."
        );
      }

      if (!clientsResponse.ok || !clientsData.sucesso) {
        throw new Error(clientsData.erro || "Erro ao carregar clientes.");
      }

      if (!profilesResponse.ok || !Array.isArray(profilesData)) {
        throw new Error(
          profilesData.error || "Erro ao carregar responsáveis."
        );
      }

      if (quotesResponse && (!quotesResponse.ok || !quotesData.sucesso)) {
        throw new Error(quotesData.erro || "Erro ao carregar orçamentos vinculados.");
      }

      setOpportunities(opportunitiesData.opportunities || []);
      setCrmQuotes(quotesData.quotes || []);
      setClients(
        (clientsData.clients || []).sort((a: AnyRow, b: AnyRow) =>
          String(a.name).localeCompare(String(b.name))
        )
      );
      setResponsibleProfiles(
        profilesData
          .filter(
            (item: Profile) =>
              item.status === "approved" &&
              CRM_CREATOR_ROLES.includes(item.role)
          )
          .sort((a: Profile, b: Profile) =>
            String(a.name).localeCompare(String(b.name))
          )
      );
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao carregar o CRM."
      );
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    setMsg("");

    if (!form.client_id) {
      return setMsg("Selecione um cliente.");
    }

    setSaving(true);

    try {
      const payload: AnyRow = editingOpportunity
        ? {
            stage: form.stage,
            title: form.title.trim(),
            estimated_value: form.estimated_value,
            probability: form.probability,
            responsible_id: form.responsible_id || null,
            next_action: form.next_action.trim(),
            next_action_at: form.next_action_at
              ? new Date(form.next_action_at).toISOString()
              : null,
            notes: form.notes.trim(),
          }
        : {
            client_id: form.client_id,
            stage: form.stage,
          };

      if (!editingOpportunity) {
        if (form.title.trim()) payload.title = form.title.trim();
        if (form.estimated_value !== "") {
          payload.estimated_value = form.estimated_value;
        }
        if (form.probability !== "") payload.probability = form.probability;
        if (form.responsible_id) {
          payload.responsible_id = form.responsible_id;
        }
        if (form.next_action.trim()) {
          payload.next_action = form.next_action.trim();
        }
        if (form.next_action_at) {
          payload.next_action_at = new Date(form.next_action_at).toISOString();
        }
        if (form.notes.trim()) payload.notes = form.notes.trim();
      }

      const response = await fetch(
        editingOpportunity
          ? `/api/crm/opportunities/${encodeURIComponent(editingOpportunity.id)}`
          : "/api/crm/opportunities",
        {
        method: editingOpportunity ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(
          data.erro ||
            (editingOpportunity
              ? "Erro ao editar oportunidade."
              : "Erro ao criar oportunidade.")
        );
      }

      setOpportunities((current) =>
        editingOpportunity
          ? current.map((opportunity) =>
              opportunity.id === data.opportunity.id
                ? data.opportunity
                : opportunity
            )
          : [data.opportunity, ...current]
      );
      const successMessage = editingOpportunity
        ? "Oportunidade atualizada com sucesso."
        : "Oportunidade criada com sucesso.";
      await onRefreshNotifications();
      resetOpportunityForm();
      setMsg(successMessage);
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : editingOpportunity
            ? "Erro ao editar oportunidade."
            : "Erro ao criar oportunidade."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOpportunity(opportunity: AnyRow) {
    const title = opportunity.title || "Sem título";
    const clientName = opportunity.clients?.name || "Cliente não informado";
    const confirmed = window.confirm(
      `Excluir a oportunidade "${title}" do cliente "${clientName}"?\n\nEsta ação excluirá somente a oportunidade e não poderá ser desfeita.`
    );

    if (!confirmed) return;

    setMsg("");
    setDeletingOpportunityId(opportunity.id);

    try {
      const response = await fetch(
        `/api/crm/opportunities/${encodeURIComponent(opportunity.id)}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao excluir oportunidade.");
      }

      setOpportunities((current) =>
        current.filter((item) => item.id !== opportunity.id)
      );

      if (editingOpportunity?.id === opportunity.id) {
        resetOpportunityForm();
      }

      await onRefreshNotifications();
      setMsg("Oportunidade excluída com sucesso.");
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao excluir oportunidade."
      );
    } finally {
      setDeletingOpportunityId(null);
    }
  }

  async function updateOpportunityStage(
    opportunity: AnyRow,
    stage: string,
    optimistic = false,
    previousStageOverride?: string
  ) {
    if (updatingStageId || stage === opportunity.stage) return;

    const previousStage = previousStageOverride || opportunity.stage;
    setMsg("");
    setUpdatingStageId(opportunity.id);

    if (optimistic) {
      setOpportunities((current) =>
        current.map((item) =>
          item.id === opportunity.id ? { ...item, stage } : item
        )
      );
    }

    try {
      const response = await fetch(
        `/api/crm/opportunities/${encodeURIComponent(opportunity.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao alterar etapa da oportunidade.");
      }

      setOpportunities((current) =>
        current.map((item) =>
          item.id === data.opportunity.id ? data.opportunity : item
        )
      );

      if (editingOpportunity?.id === data.opportunity.id) {
        setEditingOpportunity(data.opportunity);
        setForm((current) => ({
          ...current,
          stage: data.opportunity.stage,
        }));
      }

      await onRefreshNotifications();
      const stageLabel = CRM_STAGES.find((item) => item.value === stage)?.label;
      setMsg(`Etapa alterada para ${stageLabel || stage}.`);
    } catch (error) {
      if (optimistic) {
        setOpportunities((current) =>
          current.map((item) =>
            item.id === opportunity.id
              ? { ...item, stage: previousStage }
              : item
          )
        );
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erro ao alterar etapa da oportunidade.";

      setMsg(
        optimistic
          ? `Não foi possível mover a oportunidade: ${errorMessage} A etapa anterior foi restaurada.`
          : errorMessage
      );
    } finally {
      setUpdatingStageId(null);
    }
  }

  function handleOpportunityDragStart(
    event: DragEvent<HTMLDivElement>,
    opportunity: AnyRow
  ) {
    if (
      updatingStageId ||
      !canManageOpportunity(opportunity) ||
      dragStartBlockedRef.current
    ) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", opportunity.id);
    setDraggedOpportunityId(opportunity.id);
    setDragOriginStage(opportunity.stage);
    setDragOverStage(null);
  }

  function clearOpportunityDrag() {
    setDraggedOpportunityId(null);
    setDragOriginStage(null);
    setDragOverStage(null);
    dragStartBlockedRef.current = false;
  }

  function handleStageDragOver(event: DragEvent<HTMLElement>, stage: string) {
    if (!draggedOpportunityId) return;

    if (dragOriginStage === stage) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  }

  function handleStageDrop(event: DragEvent<HTMLElement>, stage: string) {
    event.preventDefault();

    const opportunityId =
      draggedOpportunityId || event.dataTransfer.getData("text/plain");
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    const previousStage = dragOriginStage || opportunity?.stage;

    clearOpportunityDrag();

    if (
      !opportunity ||
      previousStage === stage ||
      updatingStageId ||
      !canManageOpportunity(opportunity)
    ) {
      return;
    }

    void updateOpportunityStage(opportunity, stage, true, previousStage);
  }

  const filtered = opportunities.filter((opportunity) =>
    (!selectedClientId || opportunity.client_id === selectedClientId) &&
    textMatch(
        {
          ...opportunity,
          client: opportunity.clients?.name,
          responsible: opportunity.profiles_responsible?.name,
        },
        search
      )
  );

  const normalizedClientQuery = clientQuery
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const filteredClients = clients.filter((client) =>
    [client.name, client.document, client.city]
      .filter(Boolean)
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(normalizedClientQuery)
  );

  function selectClient(client: AnyRow) {
    setSelectedClientId(client.id);
    setClientQuery(client.name || "");
    setClientListOpen(false);
  }

  function clearSelectedClient() {
    setSelectedClientId("");
    setClientQuery("");
    setClientListOpen(true);
  }

  function focusNotificationInCrm(item: CrmNotificationItem) {
    const client = clients.find((current) => current.id === item.client.id);

    if (client) {
      selectClient(client);
    }

    setHighlightedOpportunityId(item.opportunity_id);
    window.setTimeout(() => {
      document
        .getElementById(`crm-opportunity-${item.opportunity_id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 100);
  }

  function formatCrmDate(value: unknown) {
    if (!value) return "-";

    const date = new Date(String(value));

    return Number.isNaN(date.getTime())
      ? "-"
      : date.toLocaleString("pt-BR");
  }

  return <>
    <Title title="CRM" desc="Oportunidades comerciais do StockPro." />

    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="card-title">Agenda CRM</h2>
      <p style={{ color: "#94a3b8", margin: "-4px 0 20px" }}>Retornos e atividades comerciais. Esta agenda não representa vencimentos ou pagamentos financeiros.</p>
      <div className="reports-grid">
        <StatCard label="Atrasadas" value={String(notifications.resumo.atrasadas)} color="#f87171" />
        <StatCard label="Hoje" value={String(notifications.resumo.hoje)} color="#facc15" />
        <StatCard label="Próximos 7 dias" value={String(notifications.resumo.proximas)} color="#60a5fa" />
      </div>
      <div style={{ marginTop: 22 }}>
        <strong style={{ color: "#fde047", fontSize: 13, letterSpacing: ".06em" }}>ATIVIDADES DE HOJE</strong>
        {notifications.hoje.length === 0 ? <p style={{ color: "#94a3b8", marginTop: 12 }}>Você não possui atividades programadas para hoje.</p> : <div className="product-list-grid" style={{ marginTop: 12 }}>
          {notifications.hoje.map((item) => <div key={item.opportunity_id} className="stat-card user-card" style={{ border: "1px solid rgba(250,204,21,.38)", background: "rgba(113,63,18,.18)" }}>
            <strong>{item.client.name}</strong>
            <small>Oportunidade: {item.title || "Sem título"}</small>
            <small>Próxima ação: {crmNextActionLabel(item.next_action)}</small>
            <small>Data: {formatCrmNotificationDate(item.next_action_at)}</small>
            <small>Responsável: {item.responsible?.name || "Não definido"}</small>
            <small>Etapa: {crmStageLabel(item.stage)}</small>
            <button type="button" className="btn btn-blue" onClick={() => focusNotificationInCrm(item)}>Ver no funil</button>
          </div>)}
        </div>}
      </div>
    </section>

    <section className="card">
      <div
        className="field"
        style={{ position: "relative", maxWidth: 680 }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setClientListOpen(false);
          }
        }}
      >
        <label htmlFor="crm-client-search">Selecionar cliente</label>
        <div style={{ position: "relative" }}>
          <input
            id="crm-client-search"
            className="input"
            type="text"
            value={clientQuery}
            placeholder="Digite o nome do cliente..."
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={clientListOpen}
            aria-controls="crm-client-results"
            style={{ height: 52, paddingRight: selectedClientId ? 100 : 15 }}
            onFocus={() => setClientListOpen(true)}
            onChange={(event) => {
              setClientQuery(event.target.value);
              setSelectedClientId("");
              setClientListOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setClientListOpen(false);
            }}
          />
          {selectedClientId && (
            <button
              type="button"
              onClick={clearSelectedClient}
              aria-label="Limpar cliente selecionado"
              style={{
                position: "absolute",
                top: "50%",
                right: 8,
                transform: "translateY(-50%)",
                border: "1px solid rgba(148,163,184,.25)",
                borderRadius: 9,
                background: "#334155",
                color: "#e2e8f0",
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Limpar
            </button>
          )}
        </div>

        {clientListOpen && (
          <div
            id="crm-client-results"
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              zIndex: 30,
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid rgba(148,163,184,.3)",
              borderRadius: 14,
              background: "#0f172a",
              boxShadow: "0 18px 40px rgba(0,0,0,.38)",
              padding: 6,
            }}
          >
            {filteredClients.length === 0 ? (
              <div style={{ padding: "14px 12px", color: "#94a3b8" }}>
                Nenhum cliente encontrado
              </div>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={client.id === selectedClientId}
                  onClick={() => selectClient(client)}
                  style={{
                    display: "flex",
                    width: "100%",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 4,
                    border: 0,
                    borderRadius: 10,
                    background:
                      client.id === selectedClientId ? "#1e3a8a" : "transparent",
                    color: "#f8fafc",
                    padding: "11px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <strong>{client.name}</strong>
                  {(client.document || client.city) && (
                    <small style={{ color: "#94a3b8" }}>
                      {[client.document ? maskCpfCnpj(client.document) : "", client.city]
                        .filter(Boolean)
                        .join(" • ")}
                    </small>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </section>

    {!selectedClientId && <section className="card" style={{ marginTop: 24 }}><p style={{ color: "#94a3b8" }}>Selecione um cliente para visualizar o resumo e os pedidos. A listagem geral de oportunidades continua disponível abaixo.</p></section>}

    {summaryLoading && <section className="card" style={{ marginTop: 24 }}><p style={{ color: "#94a3b8" }}>Carregando resumo do cliente...</p></section>}

    {summaryError && <Message text={summaryError} />}

    {clientSummary && <>
      <div className="reports-grid" style={{ marginTop: 24 }}>
        <StatCard label="Quantidade de pedidos" value={String(clientSummary.resumo.quantidade_pedidos || 0)} />
        <StatCard label="Valor dos pedidos" value={money(clientSummary.resumo.valor_pedidos)} />
        <StatCard label="Frete" value={money(clientSummary.resumo.valor_frete)} />
        <StatCard label="Total nominal com frete" value={money(clientSummary.resumo.total_nominal)} />
        <StatCard label="Ticket médio" value={money(clientSummary.resumo.ticket_medio)} />
        <StatCard label="Último pedido" value={formatCrmDate(clientSummary.resumo.ultimo_pedido)} />
        <StatCard label="Pedidos em andamento" value={String(clientSummary.resumo.pedidos_em_andamento || 0)} />
        <StatCard label="Valor nominal em andamento" value={money(clientSummary.resumo.valor_nominal_em_andamento)} />
      </div>

      <p style={{ color: "#94a3b8", marginTop: 16 }}>O valor nominal dos pedidos em andamento é apenas a soma dos pedidos ainda não marcados como recebidos no fluxo operacional. Ele não representa valor a receber.</p>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Resumo do cliente</h2>
        <div className="product-list-grid">
          <div className="stat-card user-card">
            <strong>{clientSummary.cliente.name}</strong>
            <small>Documento: {maskCpfCnpj(clientSummary.cliente.document || "")}</small>
            <small>Telefone: {maskPhone(clientSummary.cliente.phone || "")}</small>
            <small>Cidade: {clientSummary.cliente.city || "-"}</small>
            <small>Status comercial atual: {clientSummary.cliente.proposal_status || "-"}</small>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Pedidos</h2>
        {clientSummary.pedidos.length === 0 ? <p style={{ color: "#94a3b8" }}>Este cliente ainda não possui pedidos.</p> : <div className="product-list-grid">{clientSummary.pedidos.map((order: AnyRow) => {
          const totalNominal = Number(order.total_value || 0) + Number(order.shipping_value || 0);
          const tracking = [order.tracking_code, order.tracking_location].filter(Boolean).join(" — ");

          return <div key={order.id} className="stat-card user-card order-list-card">
            <strong>{getSaleCode(order)}</strong>
            <small>Data: {formatCrmDate(order.created_at)}</small>
            <small>Equipamento/item: {order.equipment_name || order.item_type || "-"}</small>
            <small>Quantidade: {order.quantity}</small>
            <small>Status operacional do pedido: {String(order.status || "-").toUpperCase()}</small>
            <small>Valor: {money(order.total_value)}</small>
            <small>Frete: {money(order.shipping_value)}</small>
            <small>Total nominal: {money(totalNominal)}</small>
            {tracking && <small>Rastreio: {tracking}</small>}
            {order.conta_azul_status && <small>Status de solicitação de NF: {String(order.conta_azul_status).replaceAll("_", " ")}</small>}
          </div>;
        })}</div>}
      </section>
    </>}

    {canCreate && <section id="crm-opportunity-form" className="card" style={{ marginTop: 24 }}>
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-blue" onClick={() => showForm ? resetOpportunityForm() : openNewOpportunityForm()}>{showForm ? (editingOpportunity ? "Cancelar edição" : "Fechar formulário") : "Nova oportunidade"}</button>
      </div>

      {showForm && <>
        <h2 className="card-title" style={{ marginTop: 26 }}>{editingOpportunity ? "Editar oportunidade" : "Nova oportunidade"}</h2>
        {editingOpportunity && <p style={{ color: "#94a3b8", margin: "-4px 0 22px" }}>O cliente desta oportunidade é mantido somente para visualização e não pode ser alterado nesta edição.</p>}
        <div className="form-grid">
          {editingOpportunity
            ? <Field label="Cliente" value={editingOpportunity.clients?.name || "Cliente não informado"} disabled onChange={() => {}} />
            : <SelectField label="Cliente" value={form.client_id} onChange={(value) => set("client_id", value)}><option value="">Selecione</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</SelectField>}
          <SelectField label={editingOpportunity ? "Etapa" : "Etapa inicial"} value={form.stage} onChange={(value) => set("stage", value)}>{CRM_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</SelectField>
          <Field label="Título" value={form.title} onChange={(value) => set("title", value)} />
          <div className="field"><label>Valor estimado (R$)</label><input className="input" type="number" min="0" step="0.01" value={form.estimated_value} onChange={(event) => set("estimated_value", event.target.value)} /></div>
          <div className="field"><label>Probabilidade (%)</label><input className="input" type="number" min="0" max="100" step="1" value={form.probability} onChange={(event) => set("probability", event.target.value)} /></div>
          <SelectField label="Responsável (opcional)" value={form.responsible_id} onChange={(value) => set("responsible_id", value)}><option value="">Sem responsável</option>{responsibleProfiles.map((responsible) => <option key={responsible.id} value={responsible.id}>{responsible.name} — {formatRole(responsible.role)}</option>)}</SelectField>
          <SelectField label="Próxima ação" value={form.next_action} onChange={(value) => set("next_action", value)}>
            <option value="">Sem próxima ação</option>
            {form.next_action && !CRM_NEXT_ACTION_TYPES.some((action) => action.value === form.next_action) && <option value={form.next_action}>{form.next_action}</option>}
            {CRM_NEXT_ACTION_TYPES.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
          </SelectField>
          <Field label="Data da próxima ação" type="datetime-local" value={form.next_action_at} onChange={(value) => set("next_action_at", value)} />
          <TextArea label="Observações" value={form.notes} onChange={(value) => set("notes", value)} />
        </div>
        <div className="form-actions"><button className="btn btn-green" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editingOpportunity ? "Salvar alterações" : "Salvar oportunidade"}</button><button className="btn btn-gray" onClick={resetOpportunityForm}>{editingOpportunity ? "Cancelar edição" : "Cancelar"}</button></div>
      </>}
    </section>}

    {msg && <Message text={msg} />}

    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="card-title">Funil comercial</h2>
      <p style={{ color: "#94a3b8", margin: "-4px 0 22px" }}>
        Cobrança é somente acompanhamento manual. Finalizado não significa pagamento confirmado, e Pós-venda mantém o acompanhamento do cliente após a conclusão comercial.
      </p>
      {loading ? <p style={{ color: "#94a3b8" }}>Carregando oportunidades...</p> : <div style={{ overflowX: "auto", paddingBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(270px, 1fr))", gap: 16, minWidth: 1980, alignItems: "start" }}>
          {CRM_STAGES.map((stage) => {
            const stageOpportunities = filtered.filter(
              (opportunity) => opportunity.stage === stage.value
            );
            const stageTotal = stageOpportunities.reduce(
              (total, opportunity) => total + Number(opportunity.estimated_value || 0),
              0
            );
            const isBillingStage = stage.value === "billing";
            const isPostSaleStage = stage.value === "post_sale";
            const validDropColumn = Boolean(
              draggedOpportunityId &&
                dragOriginStage &&
                dragOriginStage !== stage.value
            );
            const activeDropColumn =
              validDropColumn && dragOverStage === stage.value;
            const sideBorderWidth = activeDropColumn ? 2 : 1;
            const sideBorderStyle = validDropColumn ? "dashed" : "solid";
            const sideBorderColor = activeDropColumn
              ? stage.color
              : validDropColumn
                ? `${stage.color}aa`
                : `${stage.color}55`;

            return <section
              key={stage.value}
              onDragOver={(event) => handleStageDragOver(event, stage.value)}
              onDrop={(event) => handleStageDrop(event, stage.value)}
              style={{
                minHeight: 260,
                borderTopWidth: activeDropColumn ? 5 : 3,
                borderTopStyle: "solid",
                borderTopColor: stage.color,
                borderRightWidth: sideBorderWidth,
                borderRightStyle: sideBorderStyle,
                borderRightColor: sideBorderColor,
                borderBottomWidth: sideBorderWidth,
                borderBottomStyle: sideBorderStyle,
                borderBottomColor: sideBorderColor,
                borderLeftWidth: sideBorderWidth,
                borderLeftStyle: sideBorderStyle,
                borderLeftColor: sideBorderColor,
                borderRadius: 18,
                background: activeDropColumn
                  ? `${stage.color}20`
                  : validDropColumn
                    ? `${stage.color}0c`
                    : "rgba(2,6,23,.48)",
                padding: activeDropColumn ? 13 : 14,
                transition: "border-color .16s ease, background .16s ease, box-shadow .16s ease",
                boxShadow: activeDropColumn
                  ? `0 0 0 4px ${stage.color}18`
                  : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <strong style={{ color: stage.color, fontSize: 17 }}>{stage.label}</strong>
                <span style={{ minWidth: 28, borderRadius: 999, background: `${stage.color}22`, color: stage.color, padding: "4px 8px", textAlign: "center", fontSize: 12, fontWeight: 800 }}>{stageOpportunities.length}</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>Total estimado: {money(stageTotal)}</div>
              {activeDropColumn && <div style={{ marginBottom: 12, borderRadius: 10, background: `${stage.color}22`, color: stage.color, padding: "8px 10px", textAlign: "center", fontSize: 13, fontWeight: 900 }}>Solte aqui</div>}

              {stageOpportunities.length === 0 ? <p style={{ color: "#64748b", fontSize: 13 }}>Nenhuma oportunidade nesta etapa.</p> : <div style={{ display: "grid", gap: 12 }}>
                {stageOpportunities.map((opportunity) => {
                  const nextActionAt = opportunity.next_action_at
                    ? new Date(opportunity.next_action_at)
                    : null;
                  const formattedNextActionAt =
                    nextActionAt && !Number.isNaN(nextActionAt.getTime())
                      ? nextActionAt.toLocaleString("pt-BR")
                      : "";
                  const nextActionOverdue = Boolean(
                    isBillingStage &&
                      nextActionAt &&
                      !Number.isNaN(nextActionAt.getTime()) &&
                      nextActionAt.getTime() < Date.now()
                  );
                  const canManage = canManageOpportunity(opportunity);
                  const changingStage = updatingStageId === opportunity.id;
                  const highlighted = highlightedOpportunityId === opportunity.id;
                  const historyExpanded = expandedActivityIds.includes(opportunity.id);
                  const activityFormOpen = activityFormOpportunityId === opportunity.id;
                  const activities = activitiesByOpportunity[opportunity.id] || [];
                  const activityLoading = activityLoadingId === opportunity.id;
                  const isDragging = draggedOpportunityId === opportunity.id;
                  const opportunityQuotes = crmQuotes.filter((quote) => quote.opportunity_id === opportunity.id);

                  return <div
                    id={`crm-opportunity-${opportunity.id}`}
                    key={opportunity.id}
                    className="stat-card user-card"
                    draggable={canManage && updatingStageId === null}
                    aria-grabbed={isDragging}
                    onPointerDownCapture={(event) => {
                      dragStartBlockedRef.current = Boolean(
                        (event.target as HTMLElement).closest(
                          "button, input, select, textarea, a"
                        )
                      );
                    }}
                    onPointerUpCapture={() => {
                      dragStartBlockedRef.current = false;
                    }}
                    onPointerCancelCapture={() => {
                      dragStartBlockedRef.current = false;
                    }}
                    onDragStart={(event) => handleOpportunityDragStart(event, opportunity)}
                    onDragEnd={clearOpportunityDrag}
                    style={{
                      minHeight: 0,
                      padding: 16,
                      borderRadius: 15,
                      border: highlighted ? "2px solid #facc15" : undefined,
                      boxShadow: highlighted ? "0 0 0 4px rgba(250,204,21,.16)" : undefined,
                      cursor: canManage
                        ? isDragging
                          ? "grabbing"
                          : updatingStageId
                            ? "wait"
                            : "grab"
                        : "default",
                      opacity: isDragging ? 0.58 : 1,
                      transform: isDragging ? "scale(.985)" : undefined,
                      transition: "opacity .16s ease, transform .16s ease, box-shadow .16s ease",
                    }}
                  >
                    <strong>{opportunity.title || "Sem título"}</strong>
                    <small>Cliente: {opportunity.clients?.name || "-"}</small>
                    <small>Valor estimado: {money(opportunity.estimated_value)}</small>
                    <small>Probabilidade: {Number(opportunity.probability || 0)}%</small>
                    <small style={isBillingStage ? { color: "#fdba74", fontWeight: 800 } : undefined}>Responsável: {opportunity.profiles_responsible?.name || "-"}</small>
                    <small style={(isBillingStage || isPostSaleStage) && opportunity.next_action ? { color: isBillingStage ? "#fdba74" : "#f9a8d4", fontWeight: 800 } : undefined}>Próxima ação: {opportunity.next_action ? crmNextActionLabel(opportunity.next_action) : "-"}</small>
                    {(formattedNextActionAt || isBillingStage) && <small style={nextActionOverdue ? { width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid rgba(248,113,113,.55)", background: "rgba(127,29,29,.28)", color: "#fca5a5", fontWeight: 900 } : isBillingStage ? { color: "#fdba74", fontWeight: 800 } : undefined}>{nextActionOverdue ? "Retorno atrasado" : "Data da próxima ação"}: {formattedNextActionAt || "Não informada"}</small>}

                    {canUseQuotes && <div className="crm-quote-context">
                      <div><strong>Orçamentos</strong><small>{opportunityQuotes.length ? opportunityQuotes.map((quote) => `ORC-${String(quote.quote_number).padStart(6, "0")}`).join(", ") : "Nenhum orçamento vinculado."}</small></div>
                      <button className="btn btn-gray" type="button" onClick={() => onCreateQuote(opportunity)}>Criar orçamento</button>
                    </div>}

                    {canManage && <div className="field" style={{ width: "100%", marginTop: 8 }}>
                      <label>Mudar etapa</label>
                      <select className="input" value={opportunity.stage} disabled={updatingStageId !== null} onChange={(event) => updateOpportunityStage(opportunity, event.target.value)}>
                        {CRM_STAGES.map((stageOption) => <option key={stageOption.value} value={stageOption.value}>{stageOption.label}</option>)}
                      </select>
                      {changingStage && <small style={{ color: "#60a5fa", marginTop: 6 }}>Salvando etapa...</small>}
                    </div>}

                    {canManage && <div className="form-actions" style={{ marginTop: 12, gap: 8 }}>
                      <button className="btn btn-green" type="button" disabled={activitySaving} onClick={() => activityFormOpen ? closeActivityForm() : openActivityForm(opportunity)}>{activityFormOpen ? "Fechar atividade" : "Registrar atividade"}</button>
                      <button className="btn btn-blue" type="button" disabled={updatingStageId !== null} onClick={() => openEditOpportunityForm(opportunity)}>Editar</button>
                      <button className="btn btn-red" type="button" disabled={deletingOpportunityId === opportunity.id || updatingStageId !== null} onClick={() => deleteOpportunity(opportunity)}>{deletingOpportunityId === opportunity.id ? "Excluindo..." : "Excluir"}</button>
                    </div>}

                    {activityFormOpen && <div style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(74,222,128,.3)", background: "rgba(20,83,45,.16)" }}>
                      <strong style={{ color: "#86efac", fontSize: 14 }}>Registrar atividade realizada</strong>
                      <div className="field" style={{ marginTop: 12 }}>
                        <label>Ação</label>
                        <select className="input" value={activityForm.type} onChange={(event) => setActivityForm((current) => ({ ...current, type: event.target.value }))}>
                          {CRM_ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{ marginTop: 10 }}>
                        <label>Observação</label>
                        <textarea className="input" placeholder="Digite o assunto ou detalhes da atividade..." value={activityForm.description} onChange={(event) => setActivityForm((current) => ({ ...current, description: event.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                        <div className="field"><label>Data</label><input className="input" type="date" value={activityForm.date} onChange={(event) => setActivityForm((current) => ({ ...current, date: event.target.value }))} /></div>
                        <div className="field"><label>Hora</label><input className="input" type="time" value={activityForm.time} onChange={(event) => setActivityForm((current) => ({ ...current, time: event.target.value }))} /></div>
                      </div>
                      <div className="form-actions" style={{ marginTop: 12, gap: 8 }}>
                        <button type="button" className="btn btn-green" disabled={activitySaving} onClick={() => saveActivity(opportunity)}>{activitySaving ? "Salvando..." : "Salvar atividade"}</button>
                        <button type="button" className="btn btn-gray" disabled={activitySaving} onClick={closeActivityForm}>Cancelar</button>
                      </div>
                    </div>}

                    {activityErrors[opportunity.id] && <div style={{ width: "100%", marginTop: 10, color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>{activityErrors[opportunity.id]}</div>}

                    <button type="button" className="btn btn-gray" style={{ width: "100%", marginTop: 10 }} onClick={() => toggleOpportunityHistory(opportunity.id)}>{historyExpanded ? "Ocultar histórico de atividades" : "Histórico de atividades"}</button>

                    {historyExpanded && <div style={{ width: "100%", marginTop: 10 }}>
                      <strong style={{ color: "#cbd5e1", fontSize: 14 }}>Histórico de atividades</strong>
                      {activityLoading ? <p style={{ color: "#94a3b8", fontSize: 13 }}>Carregando histórico...</p> : activities.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 13 }}>Nenhuma atividade registrada ainda.</p> : <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        {activities.map((activity) => <div key={activity.id} style={{ borderLeft: "3px solid #60a5fa", borderRadius: "0 10px 10px 0", background: "rgba(15,23,42,.68)", padding: "9px 10px" }}>
                          <strong style={{ marginBottom: 3, color: "#f8fafc", fontSize: 14 }}>{crmActivityTypeLabel(activity.type)}</strong>
                          <div style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "pre-wrap" }}>{activity.description}</div>
                          <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 800, marginTop: 6 }}>{formatCrmActivityDate(activity.happened_at)}</div>
                          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>Registrado por: {activity.profiles?.name || "Usuário não identificado"}</div>
                        </div>)}
                      </div>}
                    </div>}
                  </div>;
                })}
              </div>}
            </section>;
          })}
        </div>
      </div>}
    </section>
  </>;
}

function Produtos({ search, profile }: SearchProps & { profile: Profile }) {
  const empty = { name: "", sku: "", category: "Lâmpadas dimerizáveis", subcategory: "E27", cost_price: "", sale_price: "", quantity: "", min_stock: "", supplier_id: "", description: "" };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [suppliers, setSuppliers] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const canWrite = canWriteProducts(profile.role);
  const canDelete = canDeleteProducts(profile.role);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setMsg("");

      const [productsResponse, suppliersResponse] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        canWrite
          ? fetch("/api/suppliers", { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      const productsResult = await productsResponse.json();

      if (!productsResponse.ok) {
        throw new Error(
          productsResult.erro ||
            "Erro ao carregar produtos."
        );
      }

      setItems(productsResult.products || []);
      if (suppliersResponse) {
        const suppliersResult = await suppliersResponse.json();
        if (!suppliersResponse.ok) {
          throw new Error(
            suppliersResult.erro || "Erro ao carregar fornecedores."
          );
        }
        setSuppliers(suppliersResult.suppliers || []);
      }
    } catch (error) {
      console.error(
        "Erro ao carregar produtos e fornecedores:",
        error
      );

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao carregar produtos."
      );
    }
  }
  function set(c: string, v: string) { setForm((a) => ({ ...a, [c]: v })); }
  async function carregarPadrao() {
    const resposta = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        produtos: PRODUTOS_PADRAO.map((p) => ({
          ...p,
          cost_price: 0,
          sale_price: 0,
          quantity: 0,
          min_stock: 0,
          description: "Produto padrão de revenda",
        })),
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      return setMsg(resultado.erro || "Erro ao criar produtos padrão.");
    }

    setMsg("Produtos padrão carregados com sucesso.");
    carregar();
  }
  async function salvar() {
    setMsg(""); if (!form.name) return setMsg("Informe o nome do produto.");
    const payload = { name: form.name, sku: form.sku, category: form.category, subcategory: form.subcategory, cost_price: Number(form.cost_price || 0), sale_price: Number(form.sale_price || 0), quantity: Number(form.quantity || 0), min_stock: Number(form.min_stock || 0), supplier_id: form.supplier_id || null, description: form.description, updated_at: new Date().toISOString() };
    const resposta = await fetch("/api/products", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { id: editing, ...payload } : payload),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      return setMsg(resultado.erro || "Erro ao salvar produto.");
    }
    setMsg(editing ? "Produto atualizado com sucesso." : "Produto salvo com sucesso."); setForm(empty); setEditing(null); carregar();
  }
  function editar(item: AnyRow) { setEditing(item.id); setForm({ name: item.name || "", sku: item.sku || "", category: item.category || "Lâmpadas dimerizáveis", subcategory: item.subcategory || "", cost_price: String(item.cost_price || ""), sale_price: String(item.sale_price || ""), quantity: String(item.quantity || ""), min_stock: String(item.min_stock || ""), supplier_id: item.supplier_id || "", description: item.description || "" }); }
  async function excluir(id: string) {
    if (!confirm("Excluir este produto?")) return;

    const resposta = await fetch(
      `/api/products?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    const resultado = await resposta.json();

    if (!resposta.ok) {
      return setMsg(resultado.erro || "Erro ao excluir produto.");
    }

    setItems((a) => a.filter((x) => x.id !== id));
    setMsg("Produto excluído com sucesso.");
  }
  const subcats = CATEGORIAS_REVENDA.find((c) => c.category === form.category)?.subcategories || [];
  const filtered = items.filter((i) => textMatch(i, search));
 
 return <><Title title="Produtos" desc="Revenda: lâmpadas dimerizáveis, dimmer e soquetes E-27." />{canWrite && <section className="card"><h2 className="card-title">{editing ? "Editar produto" : "Novo produto"}</h2><div className="form-actions" style={{ marginTop: 0, marginBottom: 20 }}>{["administrador", "gerente"].includes(profile.role) && <button className="btn btn-blue" onClick={carregarPadrao}>Criar produtos padrão</button>}</div><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="SKU" value={form.sku} onChange={(v) => set("sku", v)} /><SelectField label="Categoria" value={form.category} onChange={(v) => { set("category", v); set("subcategory", CATEGORIAS_REVENDA.find((c) => c.category === v)?.subcategories[0] || ""); }}>{CATEGORIAS_REVENDA.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}</SelectField><SelectField label="Subcategoria" value={form.subcategory} onChange={(v) => set("subcategory", v)}>{subcats.map((s) => <option key={s} value={s}>{s}</option>)}</SelectField><Field label="Preço de custo" type="number" value={form.cost_price} onChange={(v) => set("cost_price", v)} /><Field label="Preço de venda" type="number" value={form.sale_price} onChange={(v) => set("sale_price", v)} /><Field label="Quantidade" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} /><Field label="Estoque mínimo" type="number" value={form.min_stock} onChange={(v) => set("min_stock", v)} /><SelectField label="Fornecedor" value={form.supplier_id} onChange={(v) => set("supplier_id", v)}><option value="">Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><TextArea label="Descrição" value={form.description} onChange={(v) => set("description", v)} /></div><div className="form-actions"><button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar produto"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button></div>{msg && <Message text={msg} />}</section>}<section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Produtos cadastrados</h2><div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{item.category} / {item.subcategory}</small><small>SKU: {item.sku || "-"}</small><small>Qtd: {item.quantity || 0}</small><small>Venda: {money(item.sale_price)}</small>{canWrite && <div className="form-actions"><button className="btn btn-blue" onClick={() => editar(item)}>Editar</button>{canDelete && <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>}</div>}</div>)}</div></section></>;
}

function Pessoas({ title, table, kind, search, profile }: { title: string; table: "clients" | "suppliers"; kind: "cliente" | "fornecedor"; profile: Profile } & SearchProps) {
  const empty = { name: "", document: "", phone: "", email: "", cep: "", city: "", street: "", number: "", no_number: false, neighborhood: "", proposal_status: "Lead Frio", products: [] as string[], invoice_number: "", federal_invoice_number: "" };
  const [form, setForm] = useState(empty); const [items, setItems] = useState<AnyRow[]>([]); const [editing, setEditing] = useState<string | null>(null); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => { carregar(); }, []);
  function set(c: string, v: any) { setForm((a) => ({ ...a, [c]: v })); }
  async function carregar() {
    try {
      setMsg("");
      setDeleteError(null);

      if (table === "clients") {
        const resposta = await fetch("/api/clients", {
          cache: "no-store",
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
          throw new Error(
            resultado.erro ||
              "Erro ao carregar clientes."
          );
        }

        setItems(resultado.clients || []);
        return;
      }

      const resposta = await fetch("/api/suppliers", {
        cache: "no-store",
      });

      const resultado = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          resultado.erro ||
            "Erro ao carregar fornecedores."
        );
      }

      setItems(resultado.suppliers || []);
    } catch (error) {
      console.error("Erro ao carregar cadastros:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao carregar os cadastros."
      );
    }
  }
  async function buscarCepPorValor(v: string) { const end = await buscarCep(v); if (!end) return setMsg("CEP não encontrado."); setForm((a) => ({ ...a, ...end })); }
  function editar(item: AnyRow) { setEditing(item.id); setForm({ name: item.name || "", document: maskCpfCnpj(item.document || ""), phone: maskPhone(item.phone || ""), email: item.email || "", cep: maskCep(item.cep || ""), city: item.city || "", street: item.street || "", number: item.number || "", no_number: Boolean(item.no_number), neighborhood: item.neighborhood || "", products: item.products || [], invoice_number: item.invoice_number || "", federal_invoice_number: item.federal_invoice_number || "", proposal_status: item.proposal_status || "Lead Frio" }); }
  async function excluir(id: string) {
    if (!confirm(`Excluir este ${kind}?`)) return;

    try {
      setMsg("");
      setDeleteError(null);

      if (table === "clients") {
        const response = await fetch(
          `/api/clients?id=${encodeURIComponent(id)}`,
          {
            method: "DELETE",
          }
        );

        const result = await response.json();

        if (response.status === 409) {
          const vinculos = result.vinculos as Record<string, unknown> | undefined;
          const details = vinculos
            ? [
                `Pedidos: ${Number(vinculos.pedidos || 0)}`,
                `Orçamentos: ${Number(vinculos.orcamentos || 0)}`,
                `Oportunidades: ${Number(vinculos.oportunidades || 0)}`,
                `Atividades: ${Number(vinculos.atividades || 0)}`,
                `Tarefas: ${Number(vinculos.tarefas || 0)}`,
              ]
            : [];

          setDeleteError({
            id,
            text: [
              "Não é possível excluir este cliente.",
              result.erro || "Este cliente possui histórico vinculado.",
              ...details,
            ].join("\n"),
          });
          return;
        }

        if (!response.ok || !result.sucesso) {
          throw new Error(
            result.erro ||
              "Erro ao excluir cliente."
          );
        }

        await carregar();
        setMsg("Cliente excluído com sucesso.");
        return;
      } else {
        const resposta = await fetch(
          `/api/suppliers?id=${encodeURIComponent(id)}`,
          {
            method: "DELETE",
          }
        );

        const resultado = await resposta.json();

        if (!resposta.ok) {
          throw new Error(
            resultado.erro ||
              "Erro ao excluir fornecedor."
          );
        }
      }

      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== id)
      );

      setMsg("Fornecedor excluído com sucesso.");
    } catch (error) {
      console.error("Erro ao excluir cadastro:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao excluir cadastro."
      );
    }
  }
  async function salvar() {
    setLoading(true);
    setMsg("");

    try {
      const validation = validarCadastroPessoa({
        name: form.name,
        document: form.document,
        phone: form.phone,
        cep: form.cep,
        city: form.city,
        street: form.street,
        number: form.number,
        no_number: form.no_number,
        neighborhood: form.neighborhood,
      });

      if (validation.valido === false) {
        throw new Error(validation.erro);
      }

      const basePayload: AnyRow = validation.dados;

      if (table === "clients") {
        const clientPayload = {
          ...basePayload,
          proposal_status:
            form.proposal_status || "Lead Frio",
        };

        const response = await fetch("/api/clients", {
          method: editing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            editing
              ? {
                  id: editing,
                  ...clientPayload,
                }
              : clientPayload
          ),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.erro ||
              "Erro ao salvar cliente."
          );
        }
      } else {
        const supplierPayload = {
          ...basePayload,
          email: form.email.trim(),
          products: form.products,
        };

        const resposta = await fetch("/api/suppliers", {
          method: editing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            editing
              ? {
                  id: editing,
                  ...supplierPayload,
                }
              : supplierPayload
          ),
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
          throw new Error(
            resultado.erro ||
              "Erro ao salvar fornecedor."
          );
        }
      }

      setMsg(
        editing
          ? "Cadastro atualizado com sucesso."
          : "Cadastro salvo com sucesso."
      );

      setEditing(null);
      setForm(empty);

      await carregar();
    } catch (error) {
      console.error("Erro ao salvar cadastro:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao salvar cadastro."
      );
    } finally {
      setLoading(false);
    }
  }
  function toggleProduct(p: string) { set("products", form.products.includes(p) ? form.products.filter((x) => x !== p) : [...form.products, p]); }
  const filtered = items.filter((i) => textMatch(i, search));
  return <><Title title={title} desc={kind === "cliente" ? "Clientes com endereço automático por CEP." : "Fornecedores com CNPJ e produtos/componentes padrão fornecidos."} /><section className="card"><h2 className="card-title">{editing ? "Editar cadastro" : "Novo cadastro"}</h2><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="CPF ou CNPJ" value={form.document} onChange={(v) => set("document", maskCpfCnpj(v))} /><Field label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} />{kind === "fornecedor" && <><Field label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} /></>}<Field label="CEP" value={form.cep} onChange={(v) => { const c = maskCep(v); set("cep", c); if (onlyNumbers(c).length === 8) buscarCepPorValor(c); }} onBlur={() => buscarCepPorValor(form.cep)} /><Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} /><Field label="Rua" value={form.street} onChange={(v) => set("street", v)} /><div className="field"><label>Número</label><input className="input" value={form.number} disabled={form.no_number} onChange={(e) => set("number", e.target.value)} /><button type="button" className={form.no_number ? "btn btn-blue" : "btn btn-gray"} style={{ marginTop: 10, minHeight: 38, padding: "8px 14px" }} onClick={() => { const nv = !form.no_number; set("no_number", nv); if (nv) set("number", ""); }}>{form.no_number ? "Sem número marcado" : "Sem número"}</button></div><Field label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} />{kind === "cliente" && <div className="field"><label>Proposta</label><select className="input" value={form.proposal_status} onChange={(e) => set("proposal_status", e.target.value)}>{PROPOSTA_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>}{kind === "fornecedor" && <div className="field full-field"><label>Produtos/componentes padrão fornecidos</label><div className="mini-grid">{[...PRODUTOS_PADRAO.map((p) => p.name), ...EQUIPAMENTOS].map((p) => <label key={p} className="check-row"><input type="checkbox" checked={form.products.includes(p)} onChange={() => toggleProduct(p)} /> {p}</label>)}</div></div>}</div><div className="form-actions"><button className="btn btn-green" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : editing ? "Salvar alterações" : kind === "cliente" ? "Salvar cliente" : "Salvar fornecedor"}</button><button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button></div>{msg && <Message text={msg} />}</section><section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Cadastros lançados</h2>{filtered.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum cadastro lançado.</p> : <div className="product-list-grid">{filtered.map((item) => <div key={item.id} className="stat-card user-card"><strong>{item.name}</strong><small>{maskCpfCnpj(item.document || "")}</small><small>{maskPhone(item.phone || "")}</small><small>{item.city} - {item.neighborhood}</small>{kind === "cliente" && <small>Proposta: {item.proposal_status || "Lead Frio"}</small>}<div className="form-actions"><button className="btn btn-blue" onClick={() => editar(item)}>Editar</button>{(kind !== "cliente" || profile.role === "administrador") && <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>}</div>{deleteError?.id === item.id && <div style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", background: "rgba(127,29,29,.22)", color: "#fca5a5", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-line" }}>{deleteError.text}</div>}</div>)}</div>}</section></>;
}

function Colaboradores({ role, roles, title, currentUser, search }: { role?: Role; roles?: Role[]; title: string; currentUser?: Profile } & SearchProps) {
  const [items, setItems] = useState<Profile[]>([]);
  const [msg, setMsg] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const roleList = roles || (role ? [role] : []);
  const isRepresentante = roleList.length === 1 && roleList[0] === "representante";

  useEffect(() => {
    carregar();
  }, [
    role,
    JSON.stringify(roles),
    currentUser?.id,
    currentUser?.role,
  ]);

  async function carregar() {
    try {
      setMsg("");

      const response = await fetch("/api/profiles", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao carregar os colaboradores."
        );
      }

      let profiles = data as Profile[];

      if (roleList.length === 1) {
        profiles = profiles.filter(
          (profile) => profile.role === roleList[0]
        );
      }

      if (roleList.length > 1) {
        profiles = profiles.filter((profile) =>
          roleList.includes(profile.role)
        );
      }

      if (
        isRepresentante &&
        currentUser?.role === "vendedor"
      ) {
        profiles = profiles.filter(
          (profile) =>
            profile.responsible_seller_id === currentUser.id
        );
      }

      setItems(profiles);
    } catch (error) {
      console.error("Erro ao carregar colaboradores:", error);

      setItems([]);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao carregar os colaboradores."
      );
    }
  }

  async function avaliar(
    id: string,
    status: "approved" | "rejected"
  ) {
    const confirmado = confirm(
      status === "approved"
        ? "Aprovar cadastro?"
        : "Reprovar cadastro?"
    );

    if (!confirmado) return;

    try {
      setLoadingId(id);
      setMsg("");

      const response = await fetch("/api/admin/aprovar-representante", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          representante_id: id,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao atualizar o cadastro."
        );
      }

      setMsg(
        status === "approved"
          ? "Cadastro aprovado com sucesso."
          : "Cadastro reprovado."
      );

      await carregar();
    } catch (error) {
      console.error("Erro ao avaliar cadastro:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar o cadastro."
      );
    } finally {
      setLoadingId(null);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este cadastro?")) return;

    try {
      setLoadingId(id);
      setMsg("");

      const response = await fetch(
        "/api/admin/excluir-usuario",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao excluir cadastro."
        );
      }

      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== id)
      );

      setMsg("Cadastro excluído com sucesso.");
    } catch (error) {
      console.error("Erro ao excluir cadastro:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao excluir cadastro."
      );
    } finally {
      setLoadingId(null);
    }
  }

  const podeAvaliar = (item: Profile) =>
    Boolean(
      isRepresentante &&
        currentUser &&
        canReviewRepresentative(currentUser, {
          role: item.role,
          responsible_seller_id: item.responsible_seller_id || null,
        })
    );
  const filtered = items.filter((i) => textMatch(i, search));
  const desc = isRepresentante ? "Representantes cadastrados." : "Gerentes, vendedores, técnicos/montadores e funcionários em uma única lista.";
  const cadastroUrl = role === "representante" ? "/cadastrar-usuario?tipo=representante" : "/cadastrar-usuario";

  return <>
    <Title title={title} desc={desc} />
    <section className="card">
      <h2 className="card-title">Cadastrar novo acesso</h2>
      <p style={{ color: "#94a3b8", marginBottom: 20 }}>
        {isRepresentante ? "Use a página de cadastro para criar representante." : "Use a página de cadastro para criar colaborador: gerente, vendedor, técnico/montador ou funcionário."}
      </p>
      <button className="btn btn-blue" onClick={() => (window.location.href = cadastroUrl)}>Abrir cadastro</button>
      {msg && <Message text={msg} />}
    </section>
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="card-title">{isRepresentante ? "Representantes cadastrados" : "Colaboradores cadastrados"}</h2>
      {filtered.length === 0 ? <p style={{ color: "#94a3b8" }}>Nenhum cadastro encontrado.</p> : <div className="product-list-grid">
        {filtered.map((item) => <div key={item.id} className="stat-card user-card">
          <strong>{item.name}</strong>
          <small>{item.email}</small>
          <small>Tipo: {formatRole(item.role)}</small>
          <small>Status: <b style={{ color: item.status === "approved" ? "#4ade80" : item.status === "pending" ? "#facc15" : "#f87171" }}>{item.status}</b></small>
          {item.access_code && <small>Código: {item.access_code}</small>}
          {item.seller_code && <small>Código vendedor: {item.seller_code}</small>}
          {item.responsible_seller_id && <small>Vendedor vinculado: {item.responsible_seller_id}</small>}
          <div className="form-actions">
            {podeAvaliar(item) && item.status !== "approved" && <button className="btn btn-green" disabled={loadingId === item.id} onClick={() => avaliar(item.id, "approved")}>{loadingId === item.id ? "Avaliando..." : "Aprovar"}</button>}
            {podeAvaliar(item) && item.status !== "rejected" && <button className="btn btn-red" disabled={loadingId === item.id} onClick={() => avaliar(item.id, "rejected")}>Reprovar</button>}
            {currentUser?.role === "administrador" && <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>}
          </div>
        </div>)}
      </div>}
    </section>
  </>;
}

function AnáliseCadastros({ currentUser, search }: { currentUser: Profile } & SearchProps) {
  const [items, setItems] = useState<Profile[]>([]); const [msg, setMsg] = useState("");
  const permissoes = [{ key: "products", label: "Produtos" }, { key: "orders", label: "Pedidos" }, { key: "clients", label: "Clientes" }, { key: "reports", label: "Relatórios" }, { key: "assemblies", label: "Montagens" }];
  useEffect(() => { carregar(); }, []);
  async function carregar() {
    try {
      const response = await fetch("/api/profiles", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar cadastros.");
      }

const pendentes = (data as Profile[]).filter(
  (profile) =>
    profile.status === "pending" ||
    profile.status === "rejected"
);

      setItems(pendentes);
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao carregar cadastros."
      );
    }
  }

   async function mudarStatus(
    id: string,
    status: "approved" | "rejected"
  ) {
    try {
      const response = await fetch("/api/profiles", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao atualizar cadastro.");
      }

      setMsg(
        status === "approved"
          ? "Cadastro aprovado."
          : "Cadastro reprovado."
      );

      await carregar();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar cadastro."
      );
    }
  }

  async function salvarPermissao(
    item: Profile,
    key: string,
    checked: boolean
  ) {
    try {
      const permissions = {
        ...(item.permissions || {}),
        [key]: checked,
      };

      const response = await fetch("/api/profiles", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          permissions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar permissão.");
      }

      await carregar();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Erro ao salvar permissão."
      );
    }
  }

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
    try {
      const [ordersResponse, clientsResponse, productsResponse] = await Promise.all([
        fetch("/api/orders", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
      ]);
      const [ordersData, clientsData, productsData] = await Promise.all([
        ordersResponse.json(), clientsResponse.json(), productsResponse.json(),
      ]);
      if (!ordersResponse.ok || !ordersData.sucesso) throw new Error(ordersData.erro || "Erro ao carregar pedidos.");
      if (!clientsResponse.ok || !clientsData.sucesso) throw new Error(clientsData.erro || "Erro ao carregar clientes.");
      if (!productsResponse.ok || !productsData.sucesso) throw new Error(productsData.erro || "Erro ao carregar produtos.");
      setOrders(ordersData.orders || []);
      setClients((clientsData.clients || []).sort((a: AnyRow, b: AnyRow) => String(a.name).localeCompare(String(b.name))));
      setProducts((productsData.products || []).sort((a: AnyRow, b: AnyRow) => String(a.name).localeCompare(String(b.name))));
    } catch (error: any) {
      setMsg(error.message || "Erro ao carregar pedidos.");
    }
  }

  function toggleEquipment(nome: string) {
    setSelectedEquipments((atual) => atual.includes(nome) ? atual.filter((i) => i !== nome) : [...atual, nome]);
  }

  function editar(o: AnyRow) {
    setEditing(o.id);
    setShowForm(true);
    setSelectedEquipments(o.equipment_name ? [o.equipment_name] : []);
    setForm({
      item_type: o.item_type || "produto",
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
      quantity: qtd,
      total_value: Number(form.total_value || 0),
      shipping_value: Number(form.shipping_value || 0),
      notes: form.notes,
    } as AnyRow;

    try {
      if (editing) {
        const payload = { ...basePayload, id: editing, item_id: form.item_type === "produto" ? form.item_id || null : null, equipment_name: form.item_type === "equipamento" ? (selectedEquipments[0] || form.equipment_name) : "" };
        const response = await fetch("/api/orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao atualizar pedido.");
        setMsg("Pedido atualizado com sucesso.");
      } else {
        const pedidosParaCriar = form.item_type === "equipamento"
          ? selectedEquipments.map((equipmentName) => ({ ...basePayload, status: "pendente", item_id: null, equipment_name: equipmentName }))
          : [{ ...basePayload, status: "pendente", item_id: form.item_id || null, equipment_name: "" }];
        const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders: pedidosParaCriar }) });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao criar pedido.");
        setMsg(pedidosParaCriar.length > 1 ? `${pedidosParaCriar.length} pedidos criados com sucesso.` : "Pedido criado com sucesso.");
      }
      setForm(empty); setSelectedEquipments([]); setEditing(null); setShowForm(false); await carregar();
    } catch (error: any) { setMsg(error.message || "Erro ao salvar pedido."); }
  }

  async function mudarStatus(id: string, status: string) {
    const response = await fetch("/api/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const data = await response.json();
    if (!response.ok || !data.sucesso) return setMsg(data.erro || "Erro ao atualizar status.");
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este pedido?")) return;
    const response = await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.sucesso) return setMsg(data.erro || "Erro ao excluir pedido.");
    setOrders((a) => a.filter((x) => x.id !== id));
    setMsg("Pedido excluído com sucesso.");
  }

  async function emitirNf(orderId: string) {
    const r = await fetch("/api/conta-azul/emitir-nf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
    const d = await r.json();
    setMsg(d.message || d.error || "Solicitação enviada.");
    carregar();
  }

  const canManage = canUpdateOrderStatus(profile.role);
  const canDelete = canDeleteOrder(profile.role);
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
          <SelectField label="Tipo de item" value={form.item_type} onChange={(v) => { set("item_type", v); setSelectedEquipments([]); }}><option value="produto">Produto</option><option value="equipamento">Equipamento</option></SelectField>
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
            <strong>{getSaleCode(o)} - Pedido #{o.order_number || o.id.slice(0, 6)}</strong>
            <small>Código da venda: {getSaleCode(o)}</small>
            <small>Cliente: {cliente?.name || "-"}</small>
            <small>Item: {o.equipment_name || produto?.name || o.item_type}</small>
            <small>Qtd: {o.quantity}</small>
            <small>Total: {money(o.total_value)} | Frete: {money(o.shipping_value)}</small>
            <small>Status: <b>{String(o.status || "pendente").toUpperCase()}</b></small>
            <small>NF/Conta Azul: {o.conta_azul_status ? String(o.conta_azul_status).replaceAll("_", " ") : "Não solicitada"}</small>
            {canManage && <select className="input" value={o.status} onChange={(e) => mudarStatus(o.id, e.target.value)}>{statuses.map((st) => <option key={st} value={st}>{st}</option>)}</select>}
            <div className="form-actions"><button className="btn btn-blue" onClick={() => editar(o)}>Editar</button>{canEmitNf && <button className="btn btn-blue" onClick={() => emitirNf(o.id)}>Emitir NF</button>}{canDelete && <button className="btn btn-red" onClick={() => excluir(o.id)}>Excluir</button>}</div>
          </div>;
        })}
      </div>
    </section>
  </>;
}

function Movimentações({ profile }: { profile: Profile }) {
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
    component_id: "",
    component_name: "",
    component_category: "",
    quantity: "",
    unit_cost: "",
    notes: "",
    approved: false,
    pdf_name: "",
  };

  const emptySaída = {
    order_id: "",
    approved: false,
    notes: "",
  };

  const [manual, setManual] = useState(emptyManual);
  const [nfForm, setNfForm] = useState(emptyNf);
  const [saídaForm, setSaídaForm] = useState(emptySaída);
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [components, setComponents] = useState<AnyRow[]>([]);
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

  function selecionarComponenteNf(componentId: string) {
    const componente = components.find((item) => item.id === componentId);
    setNfForm((atual) => ({
      ...atual,
      component_id: componentId,
      component_name: componente?.name || "",
      component_category: componente?.category || "",
    }));
  }

  function selecionarItemManual(tipo: string, itemId: string) {
    setManual((atual) => ({
      ...atual,
      item_type: tipo,
      item_id: itemId,
    }));
  }

  function setSaídaField(campo: string, valor: any) {
    setSaídaForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function carregar() {
    try {
      const [productsResponse, componentsResponse, ordersResponse, movementsResponse] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/components", { cache: "no-store" }),
        fetch("/api/orders", { cache: "no-store" }),
        fetch("/api/movements", { cache: "no-store" }),
      ]);
      const [productsData, componentsData, ordersData, movementsData] = await Promise.all([
        productsResponse.json(), componentsResponse.json(), ordersResponse.json(), movementsResponse.json(),
      ]);
      if (!productsResponse.ok || !productsData.sucesso) throw new Error(productsData.erro || "Erro ao carregar produtos.");
      if (!componentsResponse.ok || !componentsData.sucesso) throw new Error(componentsData.erro || "Erro ao carregar componentes.");
      if (!ordersResponse.ok || !ordersData.sucesso) throw new Error(ordersData.erro || "Erro ao carregar pedidos.");
      if (!movementsResponse.ok || !movementsData.sucesso) throw new Error(movementsData.erro || "Erro ao carregar movimentações.");
      setProducts((productsData.products || []).sort((a: AnyRow, b: AnyRow) => String(a.name).localeCompare(String(b.name))));
      setComponents((componentsData.components || []).sort((a: AnyRow, b: AnyRow) => String(a.name).localeCompare(String(b.name))));
      setOrders(ordersData.orders || []);
      setMovements(movementsData.movements || []);
    } catch (error: any) {
      setMsg(error.message || "Erro ao carregar movimentações.");
    }
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

  async function cadastrarEntradaNf() {
    setMsg("");
    try {
      if (!nfForm.approved) return setMsg("Aprove a NF antes de cadastrar a entrada.");
      if (!nfForm.nf_key && !nfForm.nf_number) return setMsg("Informe a chave ou número da NF.");
      const quantidade = Number(nfForm.quantity || 0);
      if (quantidade <= 0) return setMsg("Informe a quantidade da NF.");

      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nf_entry", created_by: profile.id, nf: nfForm }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao cadastrar entrada por NF.");
      setMsg("Entrada por NF cadastrada com sucesso.");
      setNfForm(emptyNf);
      await carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar entrada por NF.");
    }
  }

  const pedidosParaSaída = orders.filter((pedido) => {
    const status = String(pedido.status || "").toLowerCase();
    return !["cancelado", "recebido", "finalizado"].includes(status);
  });

  const pedidoSelecionado = orders.find((pedido) => pedido.id === saídaForm.order_id);
  const produtoPedidoSelecionado = pedidoSelecionado?.item_id ? products.find((produto) => produto.id === pedidoSelecionado.item_id) : null;

  async function cadastrarSaídaPedido() {
    setMsg("");
    if (!saídaForm.order_id) return setMsg("Selecione o pedido para gerar a saída.");
    if (!saídaForm.approved) return setMsg("Aprove a saída antes de cadastrar a movimentação.");
    try {
      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "order_exit", order_id: saídaForm.order_id, created_by: profile.id, notes: saídaForm.notes }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao cadastrar saída automática.");
      setMsg("Saída automática cadastrada com sucesso.");
      setSaídaForm(emptySaída);
      await carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar saída automática.");
    }
  }

  async function salvarManual() {
    setMsg("");
    const qtd = Number(manual.quantity || 0);
    if (!manual.item_id) return setMsg(manual.item_type === "componente" ? "Selecione o componente." : "Selecione o produto.");
    if (qtd <= 0) return setMsg("Informe a quantidade.");
    try {
      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", ...manual, quantity: qtd, created_by: profile.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao salvar movimentação.");
      setMsg("Movimentação manual salva com sucesso.");
      setManual(emptyManual);
      await carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao salvar movimentação.");
    }
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

        component_id: components.find((item) => normalizarComponente(item.name) === normalizarComponente(nomeProduto || codigoProduto))?.id || atual.component_id,
        component_name: components.find((item) => normalizarComponente(item.name) === normalizarComponente(nomeProduto || codigoProduto))?.name || atual.component_name,
        component_category: components.find((item) => normalizarComponente(item.name) === normalizarComponente(nomeProduto || codigoProduto))?.category || atual.component_category,

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
              <SelectField
                label="Componente"
                value={nfForm.component_id}
                onChange={selecionarComponenteNf}
              >
                <option value="">Selecione</option>
                {components.map((componente) => (
                  <option key={componente.id} value={componente.id}>
                    {componente.name}
                  </option>
                ))}
              </SelectField>

              <div className="field">
                <label>Categoria do componente</label>
                <div className="input" style={{ display: "flex", alignItems: "center" }}>
                  {nfForm.component_category || "Escolha um componente"}
                </div>
              </div>
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
            value={saídaForm.order_id}
            onChange={(v) => setSaídaField("order_id", v)}
          >
            <option value="">Selecione</option>
            {pedidosParaSaída.map((pedido) => {
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
            value={saídaForm.notes}
            onChange={(v) => setSaídaField("notes", v)}
          />
        </div>

        <div className="form-actions">
          <button
            className={saídaForm.approved ? "btn btn-green" : "btn btn-gray"}
            onClick={() => setSaídaField("approved", !saídaForm.approved)}
          >
            {saídaForm.approved ? "Saída aprovada" : "Aprovar saída"}
          </button>
          <button className="btn btn-green" onClick={cadastrarSaídaPedido}>
            Cadastrar saída do pedido
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Nova movimentação manual</h2>

        <div className="form-grid">
          <SelectField
            label="Tipo de colaborador"
            value={manual.type}
            onChange={(v) => setManualField("type", v)}
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </SelectField>

          <SelectField
            label="Tipo de item"
            value={manual.item_type}
            onChange={(v) => selecionarItemManual(v, "")}
          >
            <option value="produto">Produto</option>
            <option value="componente">Componente</option>
          </SelectField>

          <SelectField
            label={manual.item_type === "componente" ? "Componente" : "Produto"}
            value={manual.item_id}
            onChange={(v) => setManualField("item_id", v)}
          >
            <option value="">Selecione</option>
            {(manual.item_type === "componente" ? components : products).map((i) => (
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

function Componentes({ search, profile }: SearchProps & { profile: Profile }) {
  const empty = {
    name: "",
    category: "",
    supplier_id: "",
    quantity: "",
    min_stock: "",
    equipment_names: [] as string[],
    equipment_division: {} as Record<string, string>,
  };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [suppliers, setSuppliers] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [equipmentView, setEquipmentView] = useState(EQUIPAMENTOS[0]);
  const [loadingPadrao, setLoadingPadrao] = useState(false);
  const [loadingUnificar, setLoadingUnificar] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const [componentsResponse, suppliersResponse] = await Promise.all([
        fetch("/api/components", { cache: "no-store" }),
        fetch("/api/suppliers", { cache: "no-store" }),
      ]);

      const componentsData = await componentsResponse.json();
      const suppliersData = await suppliersResponse.json();

      if (!componentsResponse.ok || !componentsData.sucesso) {
        throw new Error(
          componentsData.erro || "Erro ao carregar componentes."
        );
      }

      if (!suppliersResponse.ok || !suppliersData.sucesso) {
        throw new Error(
          suppliersData.erro || "Erro ao carregar fornecedores."
        );
      }

      setItems(componentsData.components || []);
      setSuppliers(suppliersData.suppliers || []);
    } catch (error: any) {
      setMsg(
        error.message || "Erro ao carregar componentes."
      );
    }
  }

  function set(c: string, v: any) {
    setForm((a) => ({
      ...a,
      [c]: v,
    }));
  }

  function toggleEquipment(equipmentName: string) {
    setForm((current) => {
      const isSelected =
        current.equipment_names.includes(equipmentName);

      const equipmentDivision = {
        ...current.equipment_division,
      };

      if (isSelected) {
        delete equipmentDivision[equipmentName];
      } else if (!equipmentDivision[equipmentName]) {
        equipmentDivision[equipmentName] = "1";
      }

      return {
        ...current,
        equipment_names: isSelected
          ? current.equipment_names.filter(
              (item) => item !== equipmentName
            )
          : [
              ...current.equipment_names,
              equipmentName,
            ],
        equipment_division: equipmentDivision,
      };
    });
  }

  function setEquipmentQuantity(
    equipmentName: string,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      equipment_division: {
        ...current.equipment_division,
        [equipmentName]: value,
      },
    }));
  }

  function editar(i: AnyRow) {
    const savedDivision =
      Array.isArray(i.equipment_components)
        ? i.equipment_components
        : [];

    const fallbackDivision =
      equipamentosQueUsamComponente(i.name).map(
        (uso) => ({
          equipment_name: uso.equipamento,
          qty_per_equipment: uso.quantity,
        })
      );

    const divisionItems =
      savedDivision.length
        ? savedDivision
        : fallbackDivision;

    setEditing(i.id);
    setForm({
      name: i.name || "",
      category: i.category || "",
      supplier_id: i.supplier_id || "",
      quantity: String(i.quantity || ""),
      min_stock: String(i.min_stock || ""),
      equipment_names: divisionItems.map(
        (item: AnyRow) => item.equipment_name
      ),
      equipment_division: Object.fromEntries(
        divisionItems.map((item: AnyRow) => [
          item.equipment_name,
          String(item.qty_per_equipment ?? 1),
        ])
      ),
    });
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este componente do estoque geral?")) return;

    try {
      const response = await fetch(
        `/api/components?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        return setMsg(
          data.erro || "Erro ao excluir componente."
        );
      }

      setItems((a) => a.filter((x) => x.id !== id));
      setMsg("Componente excluído com sucesso.");
    } catch (error: any) {
      setMsg(
        error.message || "Erro ao excluir componente."
      );
    }
  }

  async function salvar() {
    setMsg("");

    if (!form.name.trim()) {
      return setMsg(
        "Informe o nome do componente."
      );
    }

    const invalidEquipment =
      form.equipment_names.find(
        (equipmentName) => {
          const quantity = Number(
            form.equipment_division[equipmentName] || 0
          );

          return (
            !Number.isFinite(quantity) ||
            quantity <= 0
          );
        }
      );

    if (invalidEquipment) {
      return setMsg(
        `Informe uma quantidade válida para ${invalidEquipment}.`
      );
    }

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      equipment: "Estoque geral",
      supplier_id: form.supplier_id || null,
      quantity: Number(form.quantity || 0),
      min_stock: Number(form.min_stock || 0),
      equipment_names: form.equipment_names,
      equipment_division:
        form.equipment_names.map(
          (equipmentName) => ({
            equipment_name: equipmentName,
            qty_per_equipment: Number(
              form.equipment_division[equipmentName]
            ),
          })
        ),
    };

    try {
      const response = await fetch("/api/components", {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          editing
            ? {
                id: editing,
                ...payload,
              }
            : payload
        ),
      });

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        return setMsg(
          data.erro || "Erro ao salvar componente."
        );
      }

      setMsg(
        editing
          ? "Componente atualizado com sucesso."
          : "Componente salvo no estoque geral."
      );
      setForm(empty);
      setEditing(null);
      await carregar();
    } catch (error: any) {
      setMsg(
        error.message || "Erro ao salvar componente."
      );
    }
  }

  async function cadastrarPadrao(equipamento?: string) {
    setMsg("");
    setLoadingPadrao(true);
    try {
      const resultado = await cadastrarComponentesPadrao(equipamento);
      setMsg(`Estoque geral atualizado. Criados: ${resultado.criados}. Atualizados: ${resultado.atualizados}.`);
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar componentes padrão.");
    } finally {
      setLoadingPadrao(false);
    }
  }

  async function unificarDuplicados() {
    if (!confirm("Unificar componentes duplicados? O sistema vai manter uma linha por componente e somar as quantidades.")) return;
    setMsg("");
    setLoadingUnificar(true);
    try {
      const total = await unificarComponentesDuplicados();
      setMsg(total ? `Componentes duplicados unificados: ${total}.` : "Não encontrei componentes duplicados para unificar.");
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao unificar componentes duplicados.");
    } finally {
      setLoadingUnificar(false);
    }
  }

  const composiçãoSelecionada = composiçãoDoEquipamento(equipmentView);
  const filtered = items.filter((i) => textMatch(i, search));
  const estoquePorNome = new Map<string, number>();
  items.forEach((item) => {
    const chave = normalizarComponente(item.name);
    estoquePorNome.set(chave, Number((estoquePorNome.get(chave) || 0) + Number(item.quantity || 0)));
  });

  return (
    <>
      <Title title="Componentes" desc="Estoque geral de componentes e receita de montagem por equipamento." />

      <section className="card">
        <h2 className="card-title">Composição por equipamento</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Esta lista mostra a receita de montagem por equipamento. O componente NÃO é cadastrado várias vezes: ele fica uma única vez no estoque geral, e aqui aparece somente quanto cada equipamento usa.
        </p>
        <div className="form-grid">
          <SelectField label="Equipamento" value={equipmentView} onChange={setEquipmentView}>
            {EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectField>
        </div>

        <div className="form-actions">
          <button className="btn btn-blue" onClick={() => cadastrarPadrao(equipmentView)} disabled={loadingPadrao}>
            {loadingPadrao ? "Cadastrando..." : "Cadastrar no estoque geral os componentes desta receita"}
          </button>
          <button className="btn btn-gray" onClick={() => cadastrarPadrao()} disabled={loadingPadrao}>
            Cadastrar todos os componentes únicos no estoque geral
          </button>
          {canUnifyComponents(profile.role) && <button className="btn btn-gray" onClick={unificarDuplicados} disabled={loadingUnificar}>
            {loadingUnificar ? "Unificando..." : "Unificar duplicados"}
          </button>}
        </div>

        <div className="notice" style={{ marginTop: 16 }}>
          Exemplo: se o Borne 6mm aparece em vários equipamentos, ele continua sendo um único item no estoque. A quantidade abaixo é apenas a quantidade usada na receita do equipamento selecionado.
        </div>

        <div className="product-list-grid" style={{ marginTop: 18 }}>
          {composiçãoSelecionada.map((item) => {
            const estoqueAtual = estoquePorNome.get(normalizarComponente(item.name)) || 0;
            return (
              <div key={`${equipmentView}-${item.name}`} className="stat-card user-card">
                <strong>{item.name}</strong>
                <small>Categoria: {item.category}</small>
                <small>Quantidade usada neste equipamento: {quantidadeFormatada(item.quantity)}</small>
                <small>Estoque geral disponível: {quantidadeFormatada(estoqueAtual)}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">{editing ? "Editar componente do estoque geral" : "Novo componente no estoque geral"}</h2>
        <div className="form-grid">
          <Field label="Nome" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Categoria" value={form.category} onChange={(v) => set("category", v)} />
          <SelectField label="Fornecedor" value={form.supplier_id} onChange={(v) => set("supplier_id", v)}>
            <option value="">Selecione</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <Field label="Quantidade em estoque" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} />
          <Field label="Estoque mínimo" type="number" value={form.min_stock} onChange={(v) => set("min_stock", v)} />

          <div className="field full-field">
            <label>Equipamentos compatíveis</label>

            <div className="mini-grid">
              {EQUIPAMENTOS.map((equipmentName) => {
                const selected =
                  form.equipment_names.includes(
                    equipmentName
                  );

                return (
                  <div
                    key={equipmentName}
                    className="stat-card"
                    style={{
                      padding: 12,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleEquipment(equipmentName)
                        }
                      />
                      {" "}
                      {equipmentName}
                    </label>

                    {selected && (
                      <div className="field">
                        <label>
                          Quantidade usada por equipamento
                        </label>
                        <input
                          className="input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={
                            form.equipment_division[
                              equipmentName
                            ] || "1"
                          }
                          onChange={(event) =>
                            setEquipmentQuantity(
                              equipmentName,
                              event.target.value
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <small className="muted">
              Marque todos os equipamentos nos quais este
              componente pode ser utilizado.
            </small>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar componente"}</button>
          <button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button>
        </div>
        {msg && <Message text={msg} />}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Como fica organizado</h2>
        <div className="reports-grid">
          <StatCard label="Cadastro" value="1 por componente" />
          <StatCard label="Receita" value="Por equipamento" />
          <StatCard label="Baixa" value="Automática" />
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          O estoque não é separado por equipamento. A separação acontece na composição: o mesmo componente pode aparecer no Celt5000, Celt5000 Plus e CeltPlus com quantidades diferentes.
        </p>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Estoque geral de componentes</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Aqui aparece o estoque real. A baixa automática procura estes componentes pelo nome e desconta conforme a composição do equipamento vendido.
        </p>
        <div className="product-list-grid">
          {filtered.map((i) => (
            <div key={i.id} className="stat-card user-card">
              <strong>{i.name}</strong>
              <small>Categoria: {i.category || "-"}</small>
              <small>Fornecedor: {suppliers.find((s) => s.id === i.supplier_id)?.name || "-"}</small>
              <small>Qtd: {quantidadeFormatada(Number(i.quantity || 0))}</small>
              <small>Mínimo: {quantidadeFormatada(Number(i.min_stock || 0))}</small>
              <small>
                Equipamentos compatíveis:{" "}
                {Array.isArray(i.equipment_names) &&
                i.equipment_names.length
                  ? i.equipment_names.join(", ")
                  : equipamentosQueUsamComponente(i.name)
                      .map((uso) => uso.equipamento)
                      .join(", ") || "-"}
              </small>
              {i.equipment && i.equipment !== "Estoque geral" && <small>Origem antiga: {i.equipment}</small>}
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gap: 6,
                }}
              >
                <small>
                  <b>Divisão por equipamento:</b>
                </small>

                {Array.isArray(
                  i.equipment_components
                ) &&
                i.equipment_components.length ? (
                  i.equipment_components.map(
                    (division: AnyRow) => (
                      <small
                        key={`${i.id}-${division.equipment_name}`}
                      >
                        • {division.equipment_name}: usa{" "}
                        {quantidadeFormatada(
                          Number(
                            division.qty_per_equipment ||
                              0
                          )
                        )}
                      </small>
                    )
                  )
                ) : equipamentosQueUsamComponente(
                    i.name
                  ).length ? (
                  equipamentosQueUsamComponente(
                    i.name
                  ).map((uso) => (
                    <small
                      key={`${i.id}-${uso.equipamento}`}
                    >
                      • {uso.equipamento}: usa{" "}
                      {quantidadeFormatada(
                        uso.quantity
                      )}
                      {" "}
                      (receita padrão)
                    </small>
                  ))
                ) : (
                  <small>
                    Nenhuma divisão por equipamento
                    cadastrada.
                  </small>
                )}
              </div>
              <div className="form-actions">
                <button className="btn btn-blue" onClick={() => editar(i)}>Editar</button>
                {canDeleteComponent(profile.role) && <button className="btn btn-red" onClick={() => excluir(i.id)}>Excluir</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Montagens({ profile, search }: { profile: Profile } & SearchProps) {
  const empty = { equipment: EQUIPAMENTOS[0], quantity: "1", technician_id: "" };
  const [form, setForm] = useState(empty);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const [profilesResponse, assembliesResponse] = await Promise.all([
        fetch("/api/profiles", { cache: "no-store" }),
        fetch("/api/assemblies", { cache: "no-store" }),
      ]);
      const [profilesData, assembliesData] = await Promise.all([profilesResponse.json(), assembliesResponse.json()]);
      if (!profilesResponse.ok) throw new Error(profilesData.error || "Erro ao carregar técnicos.");
      if (!assembliesResponse.ok || !assembliesData.sucesso) throw new Error(assembliesData.erro || "Erro ao carregar montagens.");
      setTechnicians((profilesData || []).filter((item: Profile) => item.role === "tecnico") as Profile[]);
      setItems(assembliesData.assemblies || []);
    } catch (error: any) { setMsg(error.message || "Erro ao carregar montagens."); }
  }

  function set(c: string, v: string) {
    setForm((a) => ({ ...a, [c]: v }));
  }

  function editar(i: AnyRow) {
    setEditing(i.id);
    setForm({
      equipment: i.equipment || i.equipment_name || i.product_name || EQUIPAMENTOS[0],
      quantity: String(i.quantity || 1),
      technician_id: i.technician_id || "",
    });
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta montagem?")) return;
    const response = await fetch(`/api/assemblies?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.sucesso) return setMsg(data.erro || "Erro ao excluir montagem.");
    setItems((a) => a.filter((x) => x.id !== id));
    setMsg("Montagem excluída com sucesso.");
  }

  async function salvar() {
    const quantidade = Number(form.quantity || 1);
    if (!form.equipment) return setMsg("Selecione o equipamento montado.");
    if (quantidade <= 0) return setMsg("Informe uma quantidade válida.");
    try {
      const response = await fetch("/api/assemblies", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing || undefined, equipment: form.equipment, quantity: quantidade, technician_id: form.technician_id || null, created_by: profile.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao salvar montagem.");
      setMsg(editing ? "Montagem atualizada com sucesso." : "Montagem registrada com sucesso. Componentes baixados e equipamento adicionado ao estoque de montados.");
      setForm(empty); setEditing(null); await carregar();
    } catch (error: any) { setMsg(error.message || "Erro ao salvar montagem."); }
  }

  const filtered = items.filter((i) => textMatch(i, search));

  return (
    <>
      <Title title="Montagens" desc="Registro, edição e exclusão de montagem de equipamentos." />
      <section className="card">
        <h2 className="card-title">{editing ? "Editar montagem" : "Registrar montagem"}</h2>
        <div className="form-grid">
          <SelectField label="Equipamento montado" value={form.equipment} onChange={(v) => set("equipment", v)}>
            {EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectField>
          <Field label="Quantidade" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} />
          <SelectField label="Técnico/Montador" value={form.technician_id} onChange={(v) => set("technician_id", v)}>
            <option value="">Selecione</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
        </div>
        <div className="form-actions">
          <button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Registrar montagem"}</button>
          <button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button>
        </div>
        {msg && <Message text={msg} />}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Montagens lançadas</h2>
        <div className="product-list-grid">
          {filtered.map((i) => (
            <div key={i.id} className="stat-card user-card">
              <strong>{i.equipment || i.equipment_name || i.product_name}</strong>
              <small>Qtd: {i.quantity}</small>
              <div className="form-actions">
                <button className="btn btn-blue" onClick={() => editar(i)}>Editar</button>
                {canDeleteAssembly(profile.role) && <button className="btn btn-red" onClick={() => excluir(i.id)}>Excluir</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}


function EquipamentosMontados({ search }: SearchProps) {
  const empty = { equipment_name: EQUIPAMENTOS[0], quantity: "0", min_stock: "0", notes: "" };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loadingPadrao, setLoadingPadrao] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const response = await fetch("/api/mounted-equipments", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao carregar equipamentos montados.");
      setItems(data.items || []);
    } catch (error: any) { setMsg(error.message || "Erro ao carregar equipamentos montados."); }
  }

  function set(campo: string, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function editar(item: AnyRow) {
    setEditing(item.id);
    setForm({
      equipment_name: item.equipment_name || EQUIPAMENTOS[0],
      quantity: String(item.quantity || 0),
      min_stock: String(item.min_stock || 0),
      notes: item.notes || "",
    });
  }

  async function salvar() {
    setMsg("");
    const payload = { id: editing || undefined, equipment_name: form.equipment_name, quantity: Number(form.quantity || 0), min_stock: Number(form.min_stock || 0), notes: form.notes || "" };
    try {
      const response = await fetch("/api/mounted-equipments", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao salvar equipamento montado.");
      setMsg(editing ? "Equipamento montado atualizado com sucesso." : "Equipamento montado cadastrado com sucesso.");
      setForm(empty); setEditing(null); await carregar();
    } catch (error: any) { setMsg(error.message || "Erro ao salvar equipamento montado."); }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este controle de equipamento montado?")) return;
    const response = await fetch(`/api/mounted-equipments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.sucesso) return setMsg(data.erro || "Erro ao excluir equipamento montado.");
    setItems((atuais) => atuais.filter((item) => item.id !== id));
    setMsg("Equipamento montado excluído com sucesso.");
  }

  async function cadastrarPadrao() {
    setMsg("");
    setLoadingPadrao(true);
    try {
      const resultado = await cadastrarEquipamentosMontadosPadrao();
      setMsg(`Lista padrão criada. Criados: ${resultado.criados}. Já existentes: ${resultado.atualizados}.`);
      carregar();
    } catch (error: any) {
      setMsg(error.message || "Erro ao cadastrar equipamentos montados padrão.");
    } finally {
      setLoadingPadrao(false);
    }
  }

  const filtered = items.filter((item) => textMatch(item, search));
  const totalMontados = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const baixoEstoque = items.filter((item) => Number(item.quantity || 0) <= Number(item.min_stock || 0));

  return (
    <>
      <Title title="Equipamentos Montados" desc="Controle de equipamentos prontos para venda ou entrega." />

      <section className="card">
        <h2 className="card-title">Resumo dos equipamentos prontos</h2>
        <div className="reports-grid">
          <StatCard label="Modelos controlados" value={String(items.length)} />
          <StatCard label="Quantidade pronta" value={quantidadeFormatada(totalMontados)} color="#4ade80" />
          <StatCard label="Abaixo do mínimo" value={String(baixoEstoque.length)} color="#f87171" />
        </div>
        <div className="form-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-blue" onClick={cadastrarPadrao} disabled={loadingPadrao}>
            {loadingPadrao ? "Cadastrando..." : "Cadastrar modelos padrão"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Quando uma montagem é registrada, o sistema baixa os componentes e soma o equipamento aqui. Na saída por pedido, o sistema baixa deste estoque de equipamentos montados.
        </p>
        {msg && <Message text={msg} />}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">{editing ? "Editar equipamento montado" : "Ajustar estoque de equipamento montado"}</h2>
        <div className="form-grid">
          <SelectField label="Equipamento" value={form.equipment_name} onChange={(v) => set("equipment_name", v)}>
            {EQUIPAMENTOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectField>
          <Field label="Quantidade pronta" type="number" value={form.quantity} onChange={(v) => set("quantity", v)} />
          <Field label="Estoque mínimo" type="number" value={form.min_stock} onChange={(v) => set("min_stock", v)} />
          <TextArea label="Observações" value={form.notes} onChange={(v) => set("notes", v)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-green" onClick={salvar}>{editing ? "Salvar alterações" : "Salvar estoque"}</button>
          <button className="btn btn-gray" onClick={() => { setForm(empty); setEditing(null); }}>Cancelar</button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Estoque de equipamentos montados</h2>
        {filtered.length === 0 ? <p className="muted">Nenhum equipamento montado cadastrado.</p> : <div className="product-list-grid">
          {filtered.map((item) => {
            const qtd = Number(item.quantity || 0);
            const minimo = Number(item.min_stock || 0);
            const baixo = qtd <= minimo;
            return (
              <div key={item.id} className="stat-card user-card">
                <strong>{item.equipment_name}</strong>
                <small>Quantidade pronta: {quantidadeFormatada(qtd)}</small>
                <small>Estoque mínimo: {quantidadeFormatada(minimo)}</small>
                {baixo && <small style={{ color: "#f87171", fontWeight: 800 }}>Atenção: estoque baixo</small>}
                {item.notes && <small>Obs: {item.notes}</small>}
                <div className="form-actions">
                  <button className="btn btn-blue" onClick={() => editar(item)}>Editar</button>
                  <button className="btn btn-red" onClick={() => excluir(item.id)}>Excluir</button>
                </div>
              </div>
            );
          })}
        </div>}
      </section>
    </>
  );
}


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
    try {
      const [pRes, mRes, cRes, oRes] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }), fetch("/api/movements", { cache: "no-store" }),
        fetch("/api/components", { cache: "no-store" }), fetch("/api/orders", { cache: "no-store" }),
      ]);
      const [p, m, c, o] = await Promise.all([pRes.json(), mRes.json(), cRes.json(), oRes.json()]);
      if (!pRes.ok || !p.sucesso) throw new Error(p.erro || "Erro ao carregar produtos.");
      if (!mRes.ok || !m.sucesso) throw new Error(m.erro || "Erro ao carregar movimentações.");
      if (!cRes.ok || !c.sucesso) throw new Error(c.erro || "Erro ao carregar componentes.");
      if (!oRes.ok || !o.sucesso) throw new Error(o.erro || "Erro ao carregar pedidos.");
      setProducts(p.products || []); setMovements(m.movements || []); setComponents(c.components || []); setOrders(o.orders || []);
    } catch (error) { console.error("Erro ao carregar relatórios:", error); }
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
  const saídas = filteredMovements.filter((m) => m.type === "saída").reduce((s, m) => s + Number(m.quantity || 0), 0);
  const produtosVendidos = filteredOrders.reduce((s, o) => s + Number(o.quantity || 0), 0) + saídas;
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
            <div class="card"><span>Total de saídas</span><strong>-${saídas}</strong></div>
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
      <StatCard label="Total saídas" value={`-${saídas}`} color="#f87171" />
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

function MeuPerfil({ profile, onUpdated }: { profile: Profile; onUpdated: () => void }) {
  const [form, setForm] = useState({ name: profile.name || "", document: maskCpfCnpj(profile.document || ""), phone: maskPhone(profile.phone || ""), cep: maskCep(profile.cep || ""), city: profile.city || "", street: profile.street || "", number: profile.number || "", no_number: Boolean(profile.no_number), neighborhood: profile.neighborhood || "", proposal_status: "Lead Frio" });
  const [msg, setMsg] = useState("");
  function set(c: string, v: any) { setForm((a) => ({ ...a, [c]: v })); }
  async function buscarCepPerfil(v: string) { const end = await buscarCep(v); if (end) setForm((a) => ({ ...a, ...end })); }
  async function salvar() {
    try {
      const response = await fetch("/api/profiles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: profile.id, name: form.name, document: onlyNumbers(form.document), phone: onlyNumbers(form.phone), cep: onlyNumbers(form.cep), city: form.city, street: form.street, number: form.no_number ? "" : form.number, no_number: form.no_number, neighborhood: form.neighborhood }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao atualizar perfil.");
      setMsg("Perfil atualizado com sucesso."); onUpdated();
    } catch (error: any) { setMsg(error.message || "Erro ao atualizar perfil."); }
  }
  return <><Title title="Meu Perfil" desc="Detalhes editáveis do seu cadastro." /><section className="card"><div className="form-grid"><Field label="Nome" value={form.name} onChange={(v) => set("name", v)} /><Field label="CPF ou CNPJ" value={form.document} onChange={(v) => set("document", maskCpfCnpj(v))} /><Field label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} /><Field label="CEP" value={form.cep} onChange={(v) => { const c = maskCep(v); set("cep", c); if (onlyNumbers(c).length === 8) buscarCepPerfil(c); }} onBlur={() => buscarCepPerfil(form.cep)} /><Field label="Cidade" value={form.city} onChange={(v) => set("city", v)} /><Field label="Rua" value={form.street} onChange={(v) => set("street", v)} /><Field label="Número" value={form.number} disabled={form.no_number} onChange={(v) => set("number", v)} /><Field label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} /></div><div className="form-actions"><button className="btn btn-green" onClick={salvar}>Salvar perfil</button></div>{msg && <Message text={msg} />}</section></>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Opportunity = {
  id: string;
  stage: string;
  estimated_value: number | string;
  client_id: string;
  responsible_id?: string | null;
  clients?: {
    id: string;
    name: string;
    proposal_status?: string | null;
  } | null;
  profiles_responsible?: {
    id: string;
    name: string;
  } | null;
};

type Profile = {
  role?: string;
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  proposal: "Proposta",
  negotiation: "Negociação",
  order_created: "Pedido feito",
  billing: "Cobrança",
  completed: "Finalizado",
  post_sale: "Pós-venda",
};

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function findFunnelCard() {
  const heading = Array.from(document.querySelectorAll("h2.card-title")).find(
    (item) => item.textContent?.trim() === "Funil comercial"
  );

  return heading?.closest("section.card") as HTMLElement | null;
}

function ensureFilterHost() {
  const card = findFunnelCard();
  if (!card) return null;

  let host = card.querySelector<HTMLDivElement>("#crm-admin-filters-host");

  if (!host) {
    host = document.createElement("div");
    host.id = "crm-admin-filters-host";

    const heading = Array.from(card.querySelectorAll("h2.card-title")).find(
      (item) => item.textContent?.trim() === "Funil comercial"
    );
    const description = heading?.nextElementSibling;

    if (description) {
      description.insertAdjacentElement("afterend", host);
    } else if (heading) {
      heading.insertAdjacentElement("afterend", host);
    } else {
      card.prepend(host);
    }
  }

  return host;
}

export default function CrmAdminFiltersEnhancer() {
  const [profileRole, setProfileRole] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [responsibleId, setResponsibleId] = useState("");
  const [clientId, setClientId] = useState("");
  const [proposalType, setProposalType] = useState("");
  const refreshTimer = useRef<number | null>(null);

  const isAdmin = profileRole === "administrador";

  async function loadOpportunities() {
    if (!isAdmin) return;

    try {
      const response = await fetch("/api/crm/opportunities", {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.ok && data.sucesso) {
        setOpportunities(data.opportunities || []);
      }
    } catch (error) {
      console.error("Erro ao atualizar filtros administrativos do CRM:", error);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/auth/profile", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Profile;
        if (!cancelled) setProfileRole(String(data.role || "").toLowerCase());
      } catch (error) {
        console.error("Erro ao identificar perfil para filtros do CRM:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const syncHost = () => {
      const nextHost = ensureFilterHost();
      setHost((current) => (current === nextHost ? current : nextHost));

      if (nextHost) {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => {
          void loadOpportunities();
        }, 250);
      }
    };

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [isAdmin]);

  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();
    opportunities.forEach((item) => {
      if (item.profiles_responsible?.id && item.profiles_responsible.name) {
        map.set(item.profiles_responsible.id, item.profiles_responsible.name);
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [opportunities]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    opportunities.forEach((item) => {
      if (item.clients?.id && item.clients.name) {
        map.set(item.clients.id, item.clients.name);
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [opportunities]);

  const proposalOptions = useMemo(() => {
    return Array.from(
      new Set(
        opportunities
          .map((item) => String(item.clients?.proposal_status || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [opportunities]);

  const filtered = useMemo(
    () =>
      opportunities.filter((item) => {
        if (responsibleId === "__none__" && item.responsible_id) return false;
        if (
          responsibleId &&
          responsibleId !== "__none__" &&
          item.responsible_id !== responsibleId
        ) {
          return false;
        }
        if (clientId && item.client_id !== clientId) return false;
        if (
          proposalType &&
          String(item.clients?.proposal_status || "") !== proposalType
        ) {
          return false;
        }
        return true;
      }),
    [opportunities, responsibleId, clientId, proposalType]
  );

  useEffect(() => {
    if (!isAdmin || !host?.isConnected) return;

    const visibleIds = new Set(filtered.map((item) => item.id));
    const hasActiveFilter = Boolean(responsibleId || clientId || proposalType);

    opportunities.forEach((item) => {
      const card = document.getElementById(`crm-opportunity-${item.id}`);
      if (card) {
        card.style.display = !hasActiveFilter || visibleIds.has(item.id) ? "" : "none";
      }
    });

    const funnelCard = findFunnelCard();
    if (!funnelCard) return;

    const stageSections = Array.from(funnelCard.querySelectorAll("section")).filter(
      (section) => {
        const firstStrong = section.querySelector(":scope > div > strong");
        return Object.values(STAGE_LABELS).includes(firstStrong?.textContent?.trim() || "");
      }
    );

    stageSections.forEach((section) => {
      const label = section.querySelector(":scope > div > strong")?.textContent?.trim();
      const stage = Object.entries(STAGE_LABELS).find(([, value]) => value === label)?.[0];
      if (!stage) return;

      const stageItems = filtered.filter((item) => item.stage === stage);
      const header = section.firstElementChild;
      const badge = header?.querySelector("span");
      if (badge) badge.textContent = String(stageItems.length);

      const totalElement = section.children.item(1) as HTMLElement | null;
      if (totalElement?.textContent?.trim().startsWith("Total estimado:")) {
        const total = stageItems.reduce(
          (sum, item) => sum + Number(item.estimated_value || 0),
          0
        );
        totalElement.textContent = `Total estimado: ${money(total)}`;
      }
    });

    return () => {
      opportunities.forEach((item) => {
        const card = document.getElementById(`crm-opportunity-${item.id}`);
        if (card) card.style.display = "";
      });
    };
  }, [isAdmin, host, opportunities, filtered, responsibleId, clientId, proposalType]);

  if (!isAdmin || !host) return null;

  return createPortal(
    <div
      style={{
        margin: "0 0 22px",
        padding: 16,
        border: "1px solid rgba(96,165,250,.28)",
        borderRadius: 16,
        background: "rgba(15,23,42,.72)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <strong style={{ color: "#dbeafe" }}>Filtros administrativos</strong>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Exibindo {filtered.length} de {opportunities.length} oportunidades
          </div>
        </div>
        <button
          type="button"
          className="btn btn-gray"
          style={{ minHeight: 38, padding: "7px 12px" }}
          onClick={() => {
            setResponsibleId("");
            setClientId("");
            setProposalType("");
          }}
        >
          Limpar filtros
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <label className="field">
          <span>Responsável</span>
          <select className="input" value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>
            <option value="">Todos os responsáveis</option>
            <option value="__none__">Sem responsável</option>
            {responsibleOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Cliente</span>
          <select className="input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Todos os clientes</option>
            {clientOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Tipo de proposta</span>
          <select className="input" value={proposalType} onChange={(event) => setProposalType(event.target.value)}>
            <option value="">Todos os tipos</option>
            {proposalOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
    </div>,
    host
  );
}

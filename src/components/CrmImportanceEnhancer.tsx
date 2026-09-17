"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ImportanceValue = "low" | "medium" | "high" | "urgent";

type ImportanceItem = {
  id: string;
  opportunity_id?: string | null;
  task_id?: string | null;
  importance: ImportanceValue;
};

type Opportunity = {
  id: string;
};

type FormHost = HTMLElement;
type CardHost = { id: string; element: HTMLElement };

const OPTIONS: Array<{ value: ImportanceValue; label: string }> = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

function labelFor(value: ImportanceValue) {
  return OPTIONS.find((item) => item.value === value)?.label || "Média";
}

function badgeStyle(value: ImportanceValue) {
  if (value === "urgent") return { background: "rgba(127,29,29,.42)", border: "#ef4444", color: "#fecaca" };
  if (value === "high") return { background: "rgba(120,53,15,.35)", border: "#f59e0b", color: "#fde68a" };
  if (value === "low") return { background: "rgba(30,64,175,.22)", border: "#60a5fa", color: "#bfdbfe" };
  return { background: "rgba(51,65,85,.42)", border: "#64748b", color: "#cbd5e1" };
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function findCrmForm() {
  return document.getElementById("crm-opportunity-form") as HTMLElement | null;
}

function ensureFormHost() {
  const form = findCrmForm();
  if (!form) return null;
  const grid = form.querySelector<HTMLElement>(".form-grid");
  if (!grid) return null;

  let host = grid.querySelector<HTMLElement>("[data-crm-importance-form-host]");
  if (host) return host;

  host = document.createElement("div");
  host.dataset.crmImportanceFormHost = "true";
  host.className = "field";

  const labels = Array.from(grid.querySelectorAll("label"));
  const anchorLabel = labels.find((label) => label.textContent?.trim() === "Responsável (opcional)");
  const anchor = anchorLabel?.closest(".field") as HTMLElement | null;

  if (anchor?.parentElement === grid) anchor.insertAdjacentElement("afterend", host);
  else grid.appendChild(host);

  return host;
}

async function saveImportance(
  nativeFetch: typeof window.fetch,
  reference: { opportunity_id?: string; task_id?: string },
  importance: ImportanceValue
) {
  const response = await nativeFetch("/api/crm/importance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...reference, importance }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.erro || "Não foi possível salvar a importância.");
  }
}

function ImportanceField({
  value,
  onChange,
}: {
  value: ImportanceValue;
  onChange: (value: ImportanceValue) => void;
}) {
  return (
    <>
      <label>Importância</label>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value as ImportanceValue)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

function ImportanceBadge({ value }: { value: ImportanceValue }) {
  const style = badgeStyle(value);
  return (
    <div
      style={{
        display: "inline-flex",
        width: "fit-content",
        marginTop: 8,
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      Importância: {labelFor(value)}
    </div>
  );
}

export default function CrmImportanceEnhancer() {
  const [items, setItems] = useState<ImportanceItem[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [formHost, setFormHost] = useState<FormHost | null>(null);
  const [cardHosts, setCardHosts] = useState<CardHost[]>([]);
  const [formImportance, setFormImportance] = useState<ImportanceValue>("medium");

  const itemsRef = useRef<ImportanceItem[]>([]);
  const formImportanceRef = useRef<ImportanceValue>("medium");

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    formImportanceRef.current = formImportance;
  }, [formImportance]);

  const load = useCallback(async () => {
    try {
      const [importanceResponse, opportunitiesResponse] = await Promise.all([
        fetch("/api/crm/importance", { cache: "no-store" }),
        fetch("/api/crm/opportunities", { cache: "no-store" }),
      ]);

      if (importanceResponse.ok) {
        const data = await importanceResponse.json();
        if (data.sucesso) setItems(data.items || []);
      }

      if (opportunitiesResponse.ok) {
        const data = await opportunitiesResponse.json();
        if (data.sucesso) setOpportunities(data.opportunities || []);
      }
    } catch (error) {
      console.error("Erro ao carregar importância do CRM:", error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setFormHost(ensureFormHost());

        const hosts: CardHost[] = [];
        opportunities.forEach((opportunity) => {
          const card = document.getElementById(`crm-opportunity-${opportunity.id}`);
          if (!card) return;

          let host = card.querySelector<HTMLElement>("[data-crm-importance-card-host]");
          if (!host) {
            host = document.createElement("div");
            host.dataset.crmImportanceCardHost = opportunity.id;
            const actions = card.querySelector(".form-actions");
            if (actions) card.insertBefore(host, actions);
            else card.appendChild(host);
          }

          hosts.push({ id: opportunity.id, element: host });
        });
        setCardHosts(hosts);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [opportunities]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";

      if (text === "Nova oportunidade") {
        setFormImportance("medium");
        return;
      }

      if (text === "Editar") {
        const card = button.closest<HTMLElement>("[id^='crm-opportunity-']");
        if (!card?.id) return;
        const opportunityId = card.id.replace("crm-opportunity-", "");
        const item = itemsRef.current.find((row) => row.opportunity_id === opportunityId);
        setFormImportance(item?.importance || "medium");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    const enhancedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      const importanceAtRequest = formImportanceRef.current;
      const response = await nativeFetch(input, init);

      try {
        if (!response.ok) return response;
        const pathname = new URL(url, window.location.origin).pathname;

        const isOpportunitySave =
          (method === "POST" && pathname === "/api/crm/opportunities") ||
          (method === "PATCH" && /^\/api\/crm\/opportunities\/[0-9a-f-]+$/i.test(pathname));

        if (isOpportunitySave) {
          const data = await response.clone().json();
          const opportunityId = String(data?.opportunity?.id || "");
          if (opportunityId) {
            await saveImportance(nativeFetch, { opportunity_id: opportunityId }, importanceAtRequest);
            await load();
          }
        }

        if (method === "POST" && pathname === "/api/crm/general-tasks") {
          const data = await response.clone().json();
          const taskId = String(data?.task?.id || data?.opportunity?.id || "");
          if (taskId) {
            await saveImportance(nativeFetch, { task_id: taskId }, importanceAtRequest);
            await load();
          }
        }
      } catch (error) {
        console.error("Erro ao sincronizar importância do CRM:", error);
      }

      return response;
    };

    window.fetch = enhancedFetch;
    return () => {
      if (window.fetch === enhancedFetch) window.fetch = nativeFetch;
    };
  }, [load]);

  return (
    <>
      {formHost && createPortal(
        <ImportanceField value={formImportance} onChange={setFormImportance} />,
        formHost
      )}

      {cardHosts.map((host) => {
        const item = items.find((row) => row.opportunity_id === host.id);
        return createPortal(
          <ImportanceBadge value={item?.importance || "medium"} />,
          host.element,
          host.id
        );
      })}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Forecast = {
  id: string;
  opportunity_id?: string | null;
  order_id?: string | null;
  probable_date: string;
};

type Opportunity = {
  id: string;
};

type Order = {
  id: string;
  order_number?: string | number | null;
};

type CardHost = {
  key: string;
  type: "opportunity" | "order";
  recordId: string;
  element: HTMLDivElement;
};

type FormHost = {
  type: "crm" | "order";
  element: HTMLDivElement;
};

function dateOnly(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

function saleCode(order: Order) {
  if (order.order_number !== undefined && order.order_number !== null) {
    return `PV-${String(order.order_number).padStart(6, "0")}`;
  }
  return order.id ? `PV-${String(order.id).slice(0, 6).toUpperCase()}` : "";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function ensureHost(parent: HTMLElement, key: string) {
  let element = parent.querySelector<HTMLDivElement>(`[data-installation-host="${key}"]`);
  if (!element) {
    element = document.createElement("div");
    element.dataset.installationHost = key;
    element.style.width = "100%";
    element.style.marginTop = "10px";
    parent.appendChild(element);
  }
  return element;
}

function findHeading(text: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("h2.card-title")).find(
    (item) => item.textContent?.trim() === text
  );
}

function ensureFormHost(
  headingTexts: string[],
  key: string,
  afterLabel: string
): HTMLDivElement | null {
  const heading = headingTexts.map(findHeading).find(Boolean);
  const section = heading?.closest("section.card") as HTMLElement | null;
  const grid = section?.querySelector<HTMLElement>(".form-grid");
  if (!grid) return null;

  let host = grid.querySelector<HTMLDivElement>(`[data-installation-form-host="${key}"]`);
  if (host) return host;

  host = document.createElement("div");
  host.dataset.installationFormHost = key;
  host.className = "field";
  host.style.minWidth = "0";

  const labels = Array.from(grid.querySelectorAll("label"));
  const anchorLabel = labels.find((label) => label.textContent?.trim() === afterLabel);
  const anchorField = anchorLabel?.closest(".field") as HTMLElement | null;

  if (anchorField?.parentElement === grid) {
    anchorField.insertAdjacentElement("afterend", host);
  } else {
    grid.appendChild(host);
  }

  return host;
}

async function persistForecast(
  nativeFetch: typeof window.fetch,
  type: "opportunity" | "order",
  recordId: string,
  probableDate: string | null
) {
  const response = await nativeFetch("/api/installation-forecast", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [type === "opportunity" ? "opportunity_id" : "order_id"]: recordId,
      probable_date: probableDate,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.erro || "Não foi possível salvar a previsão de instalação.");
  }
}

function ForecastField({
  type,
  recordId,
  value,
  onSaved,
}: {
  type: "opportunity" | "order";
  recordId: string;
  value: string;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setDate(value), [value]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/installation-forecast", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [type === "opportunity" ? "opportunity_id" : "order_id"]: recordId,
          probable_date: date || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Não foi possível salvar a previsão.");
      }
      await onSaved();
      setMessage(date ? "Previsão salva" : "Previsão removida");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 7,
        padding: "10px 11px",
        borderRadius: 11,
        border: "1px solid rgba(96,165,250,.28)",
        background: "rgba(15,23,42,.7)",
      }}
    >
      <label style={{ color: "#bfdbfe", fontSize: 12, fontWeight: 800 }}>
        Data provável de instalação
      </label>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{ flex: "1 1 150px", minWidth: 0, height: 40, minHeight: 40 }}
        />
        <button
          type="button"
          className="btn btn-blue"
          onClick={save}
          disabled={saving || date === value}
          style={{ minHeight: 40, padding: "8px 12px" }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {message && (
        <small style={{ color: message.includes("Erro") || message.includes("possível") ? "#fca5a5" : "#86efac" }}>
          {message}
        </small>
      )}
    </div>
  );
}

function FormForecastField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label>Data provável de instalação</label>
      <input
        className="input"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <small style={{ color: "#94a3b8", marginTop: 4 }}>
        Previsão inicial; poderá ser alterada depois.
      </small>
    </>
  );
}

export default function InstallationForecastEnhancer() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cardHosts, setCardHosts] = useState<CardHost[]>([]);
  const [formHosts, setFormHosts] = useState<FormHost[]>([]);
  const [crmFormDate, setCrmFormDate] = useState("");
  const [orderFormDate, setOrderFormDate] = useState("");

  const forecastsRef = useRef<Forecast[]>([]);
  const ordersRef = useRef<Order[]>([]);
  const crmFormDateRef = useRef("");
  const orderFormDateRef = useRef("");
  const editingOpportunityIdRef = useRef<string | null>(null);
  const editingOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    forecastsRef.current = forecasts;
  }, [forecasts]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    crmFormDateRef.current = crmFormDate;
  }, [crmFormDate]);

  useEffect(() => {
    orderFormDateRef.current = orderFormDate;
  }, [orderFormDate]);

  const load = useCallback(async () => {
    try {
      const [forecastResponse, opportunitiesResponse, ordersResponse] = await Promise.all([
        fetch("/api/installation-forecast", { cache: "no-store" }),
        fetch("/api/crm/opportunities", { cache: "no-store" }),
        fetch("/api/orders", { cache: "no-store" }),
      ]);

      if (forecastResponse.ok) {
        const data = await forecastResponse.json();
        if (data.sucesso) setForecasts(data.forecasts || []);
      }
      if (opportunitiesResponse.ok) {
        const data = await opportunitiesResponse.json();
        if (data.sucesso) setOpportunities(data.opportunities || []);
      }
      if (ordersResponse.ok) {
        const data = await ordersResponse.json();
        if (data.sucesso) setOrders(data.orders || []);
      }
    } catch (error) {
      console.error("Erro ao carregar previsão de instalação:", error);
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
        const nextCardHosts: CardHost[] = [];

        opportunities.forEach((opportunity) => {
          const card = document.getElementById(`crm-opportunity-${opportunity.id}`);
          if (!card) return;
          const key = `opportunity-${opportunity.id}`;
          nextCardHosts.push({
            key,
            type: "opportunity",
            recordId: opportunity.id,
            element: ensureHost(card, key),
          });
        });

        orders.forEach((order) => {
          const code = saleCode(order);
          if (!code) return;

          const cards = Array.from(
            document.querySelectorAll<HTMLElement>(".order-list-card, .user-card")
          ).filter((card) => card.textContent?.includes(code));

          cards.forEach((card, index) => {
            const key = `order-${order.id}-${index}`;
            nextCardHosts.push({
              key,
              type: "order",
              recordId: order.id,
              element: ensureHost(card, key),
            });
          });
        });

        const nextFormHosts: FormHost[] = [];
        const crmHost = ensureFormHost(
          ["Nova oportunidade", "Editar oportunidade"],
          "crm",
          "Data da próxima ação"
        );
        if (crmHost) nextFormHosts.push({ type: "crm", element: crmHost });

        const orderHost = ensureFormHost(
          ["Novo pedido", "Editar pedido"],
          "order",
          "Frete (R$)"
        );
        if (orderHost) nextFormHosts.push({ type: "order", element: orderHost });

        setCardHosts(nextCardHosts);
        setFormHosts(nextFormHosts);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [opportunities, orders]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";

      const crmCard = button.closest<HTMLElement>("[id^='crm-opportunity-']");
      if (text === "Editar" && crmCard?.id) {
        const opportunityId = crmCard.id.replace("crm-opportunity-", "");
        editingOpportunityIdRef.current = opportunityId;
        const forecast = forecastsRef.current.find(
          (item) => item.opportunity_id === opportunityId
        );
        setCrmFormDate(dateOnly(forecast?.probable_date));
        return;
      }

      if (text === "Nova oportunidade") {
        editingOpportunityIdRef.current = null;
        setCrmFormDate("");
        return;
      }

      if (text === "Editar") {
        const orderCard = button.closest<HTMLElement>(".user-card");
        if (orderCard) {
          const order = ordersRef.current.find((item) =>
            orderCard.textContent?.includes(saleCode(item))
          );
          if (order) {
            editingOrderIdRef.current = order.id;
            const forecast = forecastsRef.current.find(
              (item) => item.order_id === order.id
            );
            setOrderFormDate(dateOnly(forecast?.probable_date));
            return;
          }
        }
      }

      if (text === "Cadastrar pedido") {
        editingOrderIdRef.current = null;
        setOrderFormDate("");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      const crmDateAtRequest = crmFormDateRef.current;
      const orderDateAtRequest = orderFormDateRef.current;
      const response = await nativeFetch(input, init);

      try {
        const pathname = new URL(url, window.location.origin).pathname;

        const isCrmSave =
          (method === "POST" && pathname === "/api/crm/opportunities") ||
          (method === "PATCH" && /^\/api\/crm\/opportunities\/[0-9a-f-]+$/i.test(pathname));

        if (response.ok && isCrmSave) {
          const data = await response.clone().json();
          const opportunityId = String(data?.opportunity?.id || "");
          if (opportunityId && (crmDateAtRequest || method === "PATCH")) {
            await persistForecast(
              nativeFetch,
              "opportunity",
              opportunityId,
              crmDateAtRequest || null
            );
            await load();
          }
          if (method === "POST") {
            editingOpportunityIdRef.current = null;
            setCrmFormDate("");
          }
        }

        const isOrderSave =
          pathname === "/api/orders" && (method === "POST" || method === "PUT");

        if (response.ok && isOrderSave) {
          const data = await response.clone().json();
          const savedOrders: Order[] = Array.isArray(data?.orders)
            ? data.orders
            : data?.order
              ? [data.order]
              : [];

          if (savedOrders.length && (orderDateAtRequest || method === "PUT")) {
            await Promise.all(
              savedOrders.map((order) =>
                persistForecast(
                  nativeFetch,
                  "order",
                  order.id,
                  orderDateAtRequest || null
                )
              )
            );
            await load();
          }
          if (method === "POST") {
            editingOrderIdRef.current = null;
            setOrderFormDate("");
          }
        }
      } catch (error) {
        console.error("Erro ao vincular previsão de instalação ao formulário:", error);
      }

      return response;
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, [load]);

  const forecastByOpportunity = useMemo(() => {
    const map = new Map<string, string>();
    forecasts.forEach((forecast) => {
      if (forecast.opportunity_id) {
        map.set(forecast.opportunity_id, dateOnly(forecast.probable_date));
      }
    });
    return map;
  }, [forecasts]);

  const forecastByOrder = useMemo(() => {
    const map = new Map<string, string>();
    forecasts.forEach((forecast) => {
      if (forecast.order_id) {
        map.set(forecast.order_id, dateOnly(forecast.probable_date));
      }
    });
    return map;
  }, [forecasts]);

  return (
    <>
      {formHosts.map((host) =>
        createPortal(
          <FormForecastField
            value={host.type === "crm" ? crmFormDate : orderFormDate}
            onChange={host.type === "crm" ? setCrmFormDate : setOrderFormDate}
          />,
          host.element,
          `form-${host.type}`
        )
      )}

      {cardHosts.map((host) =>
        createPortal(
          <ForecastField
            type={host.type}
            recordId={host.recordId}
            value={
              host.type === "opportunity"
                ? forecastByOpportunity.get(host.recordId) || ""
                : forecastByOrder.get(host.recordId) || ""
            }
            onSaved={load}
          />,
          host.element,
          host.key
        )
      )}
    </>
  );
}

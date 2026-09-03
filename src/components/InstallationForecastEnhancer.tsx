"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type Host = {
  key: string;
  type: "opportunity" | "order";
  recordId: string;
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

export default function InstallationForecastEnhancer() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);

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
        const nextHosts: Host[] = [];

        opportunities.forEach((opportunity) => {
          const card = document.getElementById(`crm-opportunity-${opportunity.id}`);
          if (!card) return;
          const key = `opportunity-${opportunity.id}`;
          nextHosts.push({
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
            nextHosts.push({
              key,
              type: "order",
              recordId: order.id,
              element: ensureHost(card, key),
            });
          });
        });

        setHosts(nextHosts);
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

  const forecastByOpportunity = useMemo(() => {
    const map = new Map<string, string>();
    forecasts.forEach((forecast) => {
      if (forecast.opportunity_id) map.set(forecast.opportunity_id, dateOnly(forecast.probable_date));
    });
    return map;
  }, [forecasts]);

  const forecastByOrder = useMemo(() => {
    const map = new Map<string, string>();
    forecasts.forEach((forecast) => {
      if (forecast.order_id) map.set(forecast.order_id, dateOnly(forecast.probable_date));
    });
    return map;
  }, [forecasts]);

  return (
    <>
      {hosts.map((host) =>
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

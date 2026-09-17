"use client";

import { useEffect, useMemo, useState } from "react";

const EDIT_ROLES = new Set(["administrador", "gerente", "vendedor", "representante"]);

type Opportunity = {
  id: string;
  title?: string | null;
  estimated_value?: number | string | null;
  notes?: string | null;
};

type Profile = {
  role?: string;
};

function moneyInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "0";
  return String(value).replace(",", ".");
}

function findCrmMenuButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button.menu-button")).find(
    (button) => button.textContent?.trim() === label
  );
}

function refreshCrmView() {
  const dashboard = findCrmMenuButton("Dashboard");
  const crm = findCrmMenuButton("CRM");

  if (dashboard && crm) {
    dashboard.click();
    window.setTimeout(() => crm.click(), 60);
  }
}

export default function CrmFunnelQuickEditEnhancer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = useMemo(() => Boolean(profile?.role && EDIT_ROLES.has(profile.role)), [profile]);

  async function load() {
    try {
      const [profileResponse, opportunitiesResponse] = await Promise.all([
        fetch("/api/auth/profile", { cache: "no-store" }),
        fetch("/api/crm/opportunities", { cache: "no-store" }),
      ]);

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setProfile(profileData.profile || profileData || null);
      }

      if (opportunitiesResponse.ok) {
        const data = await opportunitiesResponse.json();
        if (data.sucesso) setOpportunities(data.opportunities || []);
      }
    } catch (error) {
      console.error("Erro ao carregar edição rápida do CRM:", error);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!canEdit) return;

    let frame = 0;

    const syncButtons = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        opportunities.forEach((opportunity) => {
          const card = document.getElementById(`crm-opportunity-${opportunity.id}`);
          if (!card || card.querySelector("[data-crm-quick-edit-button]")) return;

          const actions = card.querySelector<HTMLElement>(".form-actions") || card;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn btn-gray";
          button.dataset.crmQuickEditButton = "true";
          button.textContent = "Editar";
          button.style.marginTop = actions === card ? "10px" : "0";
          button.style.minHeight = "34px";
          button.style.padding = "7px 11px";
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(opportunity);
            setTitle(String(opportunity.title || ""));
            setValue(moneyInput(opportunity.estimated_value));
            setNotes(String(opportunity.notes || ""));
            setMessage("");
          });
          actions.appendChild(button);
        });
      });
    };

    syncButtons();
    const observer = new MutationObserver(syncButtons);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [canEdit, opportunities]);

  async function save() {
    if (!editing) return;

    const numericValue = Number(String(value || "0").replace(",", "."));
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setMessage("Informe um valor válido.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/crm/opportunities/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          estimated_value: numericValue,
          notes: notes.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro || "Não foi possível atualizar a oportunidade.");
      }

      setOpportunities((current) =>
        current.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                title: data.opportunity?.title ?? title.trim(),
                estimated_value: data.opportunity?.estimated_value ?? numericValue,
                notes: data.opportunity?.notes ?? notes.trim(),
              }
            : item
        )
      );

      setMessage("Alterações salvas.");
      window.setTimeout(() => {
        setEditing(null);
        refreshCrmView();
      }, 350);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar oportunidade"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2,6,23,.78)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !saving) setEditing(null);
      }}
    >
      <div
        className="card"
        style={{
          width: "min(520px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <h2 className="card-title">Editar oportunidade</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Neste atalho podem ser alterados somente título, valor e observações.
        </p>

        <div className="form-grid" style={{ marginTop: 18 }}>
          <div className="field full-field">
            <label>Título</label>
            <input
              className="input"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="field full-field">
            <label>Valor estimado (R$)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          <div className="field full-field">
            <label>Observações</label>
            <textarea
              className="input"
              rows={5}
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        {message && (
          <div
            className="notice"
            style={{
              marginTop: 14,
              color: message === "Alterações salvas." ? "#86efac" : "#fca5a5",
            }}
          >
            {message}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-blue" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
          <button
            type="button"
            className="btn btn-gray"
            onClick={() => setEditing(null)}
            disabled={saving}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type GeneralTask = {
  id: string;
  status: string;
  title: string;
  notes?: string | null;
};

type Profile = {
  role?: string;
};

const EDIT_ROLES = new Set(["administrador", "gerente", "vendedor", "representante"]);

export default function CrmOtherTaskQuickEditEnhancer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<GeneralTask[]>([]);
  const [editing, setEditing] = useState<GeneralTask | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [profileResponse, tasksResponse] = await Promise.all([
        fetch("/api/auth/profile", { cache: "no-store" }),
        fetch("/api/crm/general-tasks", { cache: "no-store" }),
      ]);

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setProfile(profileData.profile || profileData || null);
      }

      if (tasksResponse.ok) {
        const data = await tasksResponse.json();
        if (data.sucesso) setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error("Erro ao carregar edição de tarefas Outros:", error);
    }
  }, []);

  useEffect(() => {
    void load();

    const onChanged = () => void load();
    window.addEventListener("crm-general-tasks-changed", onChanged);
    return () => window.removeEventListener("crm-general-tasks-changed", onChanged);
  }, [load]);

  useEffect(() => {
    if (!profile?.role || !EDIT_ROLES.has(profile.role)) return;

    let frame = 0;

    const syncButtons = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const host = document.getElementById("crm-other-funnel-host");
        if (!host) return;

        const pending = tasks.filter((task) => task.status !== "completed");
        const cards = Array.from(host.querySelectorAll<HTMLElement>(".stat-card.user-card"));

        cards.slice(0, pending.length).forEach((card, index) => {
          const task = pending[index];
          if (!task) return;

          const actions = card.querySelector<HTMLElement>(".form-actions");
          if (!actions) return;

          let button = actions.querySelector<HTMLButtonElement>("[data-crm-other-edit]");
          if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-blue";
            button.dataset.crmOtherEdit = "true";
            button.textContent = "Editar";
            actions.insertBefore(button, actions.firstChild);
          }

          button.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(task);
            setTitle(task.title || "");
            setNotes(task.notes || "");
            setMessage("");
          };
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
  }, [profile, tasks]);

  async function save() {
    if (!editing) return;
    if (!title.trim()) {
      setMessage("Informe o título.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/general-tasks/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: title.trim(),
          notes: notes.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro || "Não foi possível salvar as alterações.");
      }

      setMessage("Alterações salvas.");
      await load();
      window.dispatchEvent(new Event("crm-general-tasks-changed"));

      window.setTimeout(() => setEditing(null), 350);
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
      aria-label="Editar tarefa"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2,6,23,.82)",
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
        <h2 className="card-title">Editar tarefa</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Aqui podem ser alterados somente título e observações.
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
            <label>Observações</label>
            <textarea
              className="input"
              rows={6}
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop: 14,
              fontWeight: 800,
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

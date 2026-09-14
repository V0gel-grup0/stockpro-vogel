"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OTHER_CLIENT_TOKEN = "__crm_other__";
const INTERNAL_OTHER_CLIENT = "__CRM_OUTROS__";

type GeneralTask = {
  id: string;
  client_id: string;
  stage: "other";
  status: string;
  title: string;
  responsible_id?: string | null;
  next_action?: string;
  next_action_at?: string | null;
  notes?: string;
  completed_at?: string | null;
  clients?: { id?: string; name?: string } | null;
  profiles_responsible?: { id: string; name: string } | null;
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  meeting: "Reunião",
  proposal_sent: "Enviar proposta",
  billing: "Cobrança",
  follow_up: "Retorno",
  other: "Outro",
};

function findCrmOpportunityForm() {
  return document.getElementById("crm-opportunity-form") as HTMLElement | null;
}

function findSelectByLabel(root: HTMLElement, labels: string[]) {
  const fields = Array.from(root.querySelectorAll<HTMLElement>(".field"));
  const normalized = labels.map((item) => item.trim().toLowerCase());

  for (const field of fields) {
    const label = field.querySelector("label")?.textContent?.trim().toLowerCase() || "";
    if (!normalized.includes(label)) continue;
    const select = field.querySelector("select");
    if (select instanceof HTMLSelectElement) return select;
  }

  return null;
}

function ensureOption(select: HTMLSelectElement, value: string, label: string) {
  let option = Array.from(select.options).find((item) => item.value === value);
  if (!option) {
    option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  } else if (option.textContent !== label) {
    option.textContent = label;
  }
  return option;
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  if (setter) setter.call(select, value);
  else select.value = value;

  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function findFunnelGrid() {
  const heading = Array.from(document.querySelectorAll("h2.card-title")).find(
    (item) => item.textContent?.trim() === "Funil comercial"
  );
  const card = heading?.closest("section.card") as HTMLElement | null;
  if (!card) return null;

  const grids = Array.from(card.querySelectorAll<HTMLElement>("div")).filter(
    (item) => item.style.display === "grid"
  );

  return (
    grids.find((grid) => {
      const directSections = Array.from(grid.children).filter(
        (child) => child.tagName === "SECTION"
      );
      return directSections.length >= 7;
    }) || null
  );
}

function ensureFunnelHost() {
  const grid = findFunnelGrid();
  if (!grid) return null;

  grid.style.gridTemplateColumns = "repeat(8, minmax(270px, 1fr))";
  grid.style.minWidth = "2260px";

  let host = grid.querySelector<HTMLElement>("#crm-other-funnel-host");
  if (!host) {
    host = document.createElement("section");
    host.id = "crm-other-funnel-host";
    grid.appendChild(host);
  }

  return host;
}

function hideInternalOtherClient() {
  document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    Array.from(select.options).forEach((option) => {
      if (option.textContent?.trim() === INTERNAL_OTHER_CLIENT) {
        option.remove();
      }
    });
  });

  document.querySelectorAll<HTMLElement>(".user-card").forEach((card) => {
    const title = card.querySelector("strong")?.textContent?.trim();
    if (title === INTERNAL_OTHER_CLIENT) {
      card.style.display = "none";
    }
  });
}

function taskDate(value: string | null | undefined) {
  if (!value) return "Não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informada" : date.toLocaleString("pt-BR");
}

export default function CrmOtherTasksEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tasks, setTasks] = useState<GeneralTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const refreshTimer = useRef<number | null>(null);

  async function loadTasks() {
    if (!document.querySelector("h2.card-title")) return;
    setLoading(true);
    try {
      const response = await fetch("/api/crm/general-tasks", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setTasks([]);
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao carregar tarefas gerais.");
      }
      setTasks(data.tasks || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar tarefas gerais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const enhancedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const isCreateOpportunity =
        url.includes("/api/crm/opportunities") &&
        !url.match(/\/api\/crm\/opportunities\/[^/?]+/) &&
        String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST";

      if (isCreateOpportunity) {
        try {
          const rawBody = init?.body;
          if (typeof rawBody === "string") {
            const parsed = JSON.parse(rawBody);
            const shouldCreateTask =
              parsed?.client_id === OTHER_CLIENT_TOKEN || parsed?.stage === "other";

            if (shouldCreateTask) {
              const taskPayload = {
                client_id:
                  parsed?.client_id && parsed.client_id !== OTHER_CLIENT_TOKEN
                    ? parsed.client_id
                    : OTHER_CLIENT_TOKEN,
                title: parsed?.title || "Tarefa",
                responsible_id: parsed?.responsible_id || null,
                next_action: parsed?.next_action || "other",
                next_action_at: parsed?.next_action_at || null,
                notes: parsed?.notes || "",
              };

              const response = await originalFetch("/api/crm/general-tasks", {
                ...init,
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(init?.headers || {}),
                },
                body: JSON.stringify(taskPayload),
              });

              if (response.ok) {
                window.dispatchEvent(new Event("crm-general-tasks-changed"));
              }
              return response;
            }
          }
        } catch {
          // Mantém o fluxo original caso o payload não possa ser interpretado.
        }
      }

      return originalFetch(input, init);
    };

    window.fetch = enhancedFetch;
    return () => {
      if (window.fetch === enhancedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const syncDom = () => {
      const form = findCrmOpportunityForm();
      if (form) {
        const clientSelect = findSelectByLabel(form, ["Cliente"]);
        const stageSelect = findSelectByLabel(form, ["Etapa inicial", "Etapa"]);

        if (clientSelect) {
          ensureOption(clientSelect, OTHER_CLIENT_TOKEN, "Outros");
          Array.from(clientSelect.options).forEach((option) => {
            if (option.textContent?.trim() === INTERNAL_OTHER_CLIENT) option.remove();
          });

          if (!clientSelect.dataset.crmOtherBound) {
            clientSelect.dataset.crmOtherBound = "1";
            clientSelect.addEventListener("change", () => {
              const currentForm = findCrmOpportunityForm();
              if (!currentForm) return;
              const currentStage = findSelectByLabel(currentForm, ["Etapa inicial", "Etapa"]);
              if (clientSelect.value === OTHER_CLIENT_TOKEN && currentStage) {
                ensureOption(currentStage, "other", "Outros");
                setSelectValue(currentStage, "other");
              }
            });
          }
        }

        if (stageSelect) {
          ensureOption(stageSelect, "other", "Outros");
          if (!stageSelect.dataset.crmOtherBound) {
            stageSelect.dataset.crmOtherBound = "1";
            stageSelect.addEventListener("change", () => {
              if (stageSelect.value !== "other") return;
              const currentForm = findCrmOpportunityForm();
              if (!currentForm) return;
              const currentClient = findSelectByLabel(currentForm, ["Cliente"]);
              if (currentClient && !currentClient.value) {
                ensureOption(currentClient, OTHER_CLIENT_TOKEN, "Outros");
                setSelectValue(currentClient, OTHER_CLIENT_TOKEN);
              }
            });
          }
        }
      }

      hideInternalOtherClient();
      const nextHost = ensureFunnelHost();
      setHost((current) => (current === nextHost ? current : nextHost));

      if (nextHost) {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => void loadTasks(), 250);
      }
    };

    syncDom();
    const observer = new MutationObserver(syncDom);
    observer.observe(document.body, { childList: true, subtree: true });

    const onChanged = () => void loadTasks();
    const onFocus = () => void loadTasks();
    window.addEventListener("crm-general-tasks-changed", onChanged);
    window.addEventListener("focus", onFocus);

    return () => {
      observer.disconnect();
      window.removeEventListener("crm-general-tasks-changed", onChanged);
      window.removeEventListener("focus", onFocus);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  const pending = useMemo(() => tasks.filter((task) => task.status !== "completed"), [tasks]);
  const completed = useMemo(() => tasks.filter((task) => task.status === "completed"), [tasks]);

  async function changeTask(task: GeneralTask, action: "complete" | "reopen") {
    setBusyId(task.id);
    setMessage("");
    try {
      const response = await fetch("/api/crm/general-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao alterar tarefa.");
      await loadTasks();
      setMessage(action === "complete" ? "Tarefa concluída." : "Tarefa reaberta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao alterar tarefa.");
    } finally {
      setBusyId("");
    }
  }

  async function deleteTask(task: GeneralTask) {
    if (!window.confirm(`Excluir a tarefa "${task.title || "Tarefa"}"?`)) return;
    setBusyId(task.id);
    setMessage("");
    try {
      const response = await fetch(`/api/crm/general-tasks?id=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao excluir tarefa.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setMessage("Tarefa excluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir tarefa.");
    } finally {
      setBusyId("");
    }
  }

  if (!host) return null;

  return createPortal(
    <div
      style={{
        minHeight: 260,
        borderTop: "3px solid #94a3b8",
        borderRight: "1px solid rgba(148,163,184,.35)",
        borderBottom: "1px solid rgba(148,163,184,.35)",
        borderLeft: "1px solid rgba(148,163,184,.35)",
        borderRadius: 18,
        background: "rgba(2,6,23,.48)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <strong style={{ color: "#cbd5e1", fontSize: 17 }}>Outros</strong>
        <span style={{ minWidth: 28, borderRadius: 999, background: "rgba(148,163,184,.15)", color: "#cbd5e1", padding: "4px 8px", textAlign: "center", fontSize: 12, fontWeight: 800 }}>
          {pending.length}
        </span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>Tarefas gerais do CRM</div>

      {loading && tasks.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Carregando tarefas...</p>
      ) : pending.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 13 }}>Nenhuma tarefa pendente.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {pending.map((task) => (
            <div key={task.id} className="stat-card user-card" style={{ minHeight: 0, padding: 16, borderRadius: 15 }}>
              <strong>{task.title || "Tarefa"}</strong>
              <small>Cliente: {task.clients?.name || "Outros"}</small>
              <small>Responsável: {task.profiles_responsible?.name || "-"}</small>
              <small>Próxima ação: {task.next_action ? NEXT_ACTION_LABELS[task.next_action] || task.next_action : "-"}</small>
              <small>Data: {taskDate(task.next_action_at)}</small>
              {task.notes && <small>Obs: {task.notes}</small>}
              <div className="form-actions" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn btn-green" type="button" disabled={busyId === task.id} onClick={() => changeTask(task, "complete")}>{busyId === task.id ? "Salvando..." : "Concluir"}</button>
                <button className="btn btn-red" type="button" disabled={busyId === task.id} onClick={() => deleteTask(task)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 13, fontWeight: 800 }}>Concluídas ({completed.length})</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {completed.map((task) => (
              <div key={task.id} className="stat-card user-card" style={{ minHeight: 0, padding: 12, opacity: .78 }}>
                <strong>{task.title || "Tarefa"}</strong>
                <small>Responsável: {task.profiles_responsible?.name || "-"}</small>
                <button className="btn btn-gray" type="button" disabled={busyId === task.id} onClick={() => changeTask(task, "reopen")}>Reabrir</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {message && <p style={{ color: "#93c5fd", fontSize: 13, margin: "12px 0 0" }}>{message}</p>}
    </div>,
    host
  );
}

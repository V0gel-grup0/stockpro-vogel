"use client";

import { useEffect, useMemo, useState } from "react";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";

type Role = "administrador" | "gerente" | "vendedor" | "funcionario" | "tecnico" | "representante";

type Profile = {
  id: string;
  name: string;
  role: Role;
  status?: string;
};

type Item = {
  id: string;
  equipment_name: string;
  quantity: number;
  technician_id: string;
  technician_name: string;
  stage: string;
  due_date?: string | null;
  notes?: string | null;
};

const STAGES = [
  { value: "todo", label: "A fazer", color: "#60a5fa" },
  { value: "assembling", label: "Em montagem", color: "#f59e0b" },
  { value: "waiting_parts", label: "Aguardando peças", color: "#f97316" },
  { value: "done", label: "Concluídas", color: "#4ade80" },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "Sem data prevista";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Sem data prevista" : date.toLocaleDateString("pt-BR");
}

function isOverdue(item: Item) {
  if (!item.due_date || item.stage === "done") return false;
  const due = new Date(`${String(item.due_date).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export default function AssemblyWorkFunnel({ profile }: { profile: Profile }) {
  const canSee = ["administrador", "gerente", "tecnico"].includes(profile.role);
  const canAdmin = profile.role === "administrador" || profile.role === "gerente";
  const [items, setItems] = useState<Item[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const emptyForm: {
    equipment_name: string;
    quantity: string;
    technician_id: string;
    due_date: string;
    notes: string;
  } = {
    equipment_name: EQUIPMENT_CATALOG[0],
    quantity: "1",
    technician_id: "",
    due_date: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!canSee) return;
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [
        fetch("/api/crm/assembly-work", { cache: "no-store" }),
      ];
      if (canAdmin) requests.push(fetch("/api/profiles", { cache: "no-store" }));

      const responses = await Promise.all(requests);
      const workData = await responses[0].json();
      if (!responses[0].ok || !workData.sucesso) {
        throw new Error(workData.erro || "Erro ao carregar montagens.");
      }
      setItems(workData.items || []);

      if (canAdmin && responses[1]) {
        const profileData = await responses[1].json();
        if (responses[1].ok && Array.isArray(profileData)) {
          setTechnicians(
            profileData.filter(
              (item: Profile) => item.role === "tecnico" && item.status === "approved"
            )
          );
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar montagens.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [profile.id, profile.role]);

  const grouped = useMemo(() => {
    const result: Record<string, Item[]> = {};
    STAGES.forEach((stage) => {
      result[stage.value] = items.filter((item) => item.stage === stage.value);
    });
    return result;
  }, [items]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId("");
    setShowForm(false);
  }

  function edit(item: Item) {
    setEditingId(item.id);
    setForm({
      equipment_name: item.equipment_name,
      quantity: String(item.quantity || 1),
      technician_id: item.technician_id,
      due_date: item.due_date ? String(item.due_date).slice(0, 10) : "",
      notes: item.notes || "",
    });
    setShowForm(true);
  }

  async function save() {
    if (!canAdmin || saving) return;
    if (!form.technician_id) return setMessage("Selecione o montador.");
    const quantity = Number(form.quantity || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return setMessage("Informe uma quantidade válida.");
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/crm/assembly-work", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          equipment_name: form.equipment_name,
          quantity,
          technician_id: form.technician_id,
          due_date: form.due_date,
          notes: form.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao salvar montagem.");
      }
      setMessage(editingId ? "Montagem atualizada." : "Montagem adicionada ao funil.");
      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar montagem.");
    } finally {
      setSaving(false);
    }
  }

  async function move(id: string, stage: string) {
    const current = items.find((item) => item.id === id);
    if (!current || current.stage === stage) return;

    setItems((rows) =>
      rows.map((item) => (item.id === id ? { ...item, stage } : item))
    );

    try {
      const response = await fetch("/api/crm/assembly-work", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao mover montagem.");
      }
    } catch (error) {
      setItems((rows) =>
        rows.map((item) =>
          item.id === id ? { ...item, stage: current.stage } : item
        )
      );
      setMessage(error instanceof Error ? error.message : "Erro ao mover montagem.");
    }
  }

  async function remove(id: string) {
    if (!canAdmin || !confirm("Excluir esta montagem do funil?")) return;
    const response = await fetch(`/api/crm/assembly-work?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok || !data.sucesso) {
      return setMessage(data.erro || "Erro ao excluir montagem.");
    }
    setItems((rows) => rows.filter((item) => item.id !== id));
  }

  if (!canSee) return null;

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 className="card-title">Montagens a fazer</h2>
          <p style={{ color: "#94a3b8", margin: "-4px 0 16px" }}>
            {profile.role === "tecnico"
              ? "Aqui aparecem somente as montagens designadas para você."
              : "Distribua as montagens entre os montadores e acompanhe o andamento."}
          </p>
        </div>
        {canAdmin && (
          <button
            className="btn btn-blue"
            type="button"
            onClick={() => {
              setShowForm((value) => !value);
              if (showForm) resetForm();
            }}
          >
            {showForm ? "Fechar" : "Nova montagem"}
          </button>
        )}
      </div>

      {canAdmin && showForm && (
        <div
          style={{
            marginBottom: 22,
            border: "1px solid rgba(96,165,250,.28)",
            background: "rgba(15,23,42,.6)",
            padding: 16,
            borderRadius: 14,
          }}
        >
          <div className="form-grid">
            <div className="field">
              <label>Equipamento</label>
              <select
                className="input"
                value={form.equipment_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    equipment_name: event.target.value,
                  }))
                }
              >
                {EQUIPMENT_CATALOG.map((equipment) => (
                  <option key={equipment} value={equipment}>
                    {equipment}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Quantidade</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            </div>

            <div className="field">
              <label>Montador</label>
              <select
                className="input"
                value={form.technician_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    technician_id: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Data prevista</label>
              <input
                className="input"
                type="date"
                value={form.due_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, due_date: event.target.value }))
                }
              />
            </div>

            <div className="field full-field">
              <label>Observações</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-green" type="button" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar ao funil"}
            </button>
            <button className="btn btn-gray" type="button" onClick={resetForm} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(15,23,42,.72)",
            color: "#cbd5e1",
          }}
        >
          {message}
        </div>
      )}

      {loading ? <p style={{ color: "#94a3b8" }}>Carregando montagens...</p> :
        <div className="crm-stage-list-grid">
          {STAGES.map((stage) => <details className="crm-stage-list-details" key={stage.value}>
            <summary className="crm-stage-list-summary">
              <strong style={{ color: stage.color }}>{stage.label}</strong>
              <span className="crm-list-count" style={{ color: stage.color }}>{grouped[stage.value]?.length || 0}</span>
            </summary>
            <div className="crm-stage-list-content">
              {(grouped[stage.value] || []).map((item) => {
                const overdue = isOverdue(item);
                return <details key={item.id} className="crm-record-list-item">
                  <summary className="crm-record-list-summary">
                    <strong>{item.equipment_name}</strong>
                    <small>Qtd: {item.quantity}</small>
                    <small>Montador: {item.technician_name}</small>
                    <small style={overdue ? { color: "#fca5a5", fontWeight: 800 } : undefined}>
                      {overdue ? "ATRASADA — " : ""}{formatDate(item.due_date)}
                    </small>
                  </summary>
                  <div className="crm-record-list-content">
                    <div className="field">
                      <label htmlFor={"assembly-stage-" + item.id}>Etapa da montagem</label>
                      <select id={"assembly-stage-" + item.id} className="input" value={item.stage}
                        onChange={(event) => void move(item.id, event.target.value)}>
                        {STAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    {item.notes && <p style={{ whiteSpace: "pre-wrap" }}>Observações: {item.notes}</p>}
                    {canAdmin && <div className="form-actions">
                      <button className="btn btn-blue" type="button" onClick={() => edit(item)}>Editar</button>
                      <button className="btn btn-red" type="button" onClick={() => void remove(item.id)}>Excluir</button>
                    </div>}
                  </div>
                </details>;
              })}
              {(grouped[stage.value] || []).length === 0 && <p className="muted">Nenhuma montagem nesta etapa.</p>}
            </div>
          </details>)}
        </div>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";

type Role =
  | "administrador"
  | "gerente"
  | "vendedor"
  | "funcionario"
  | "tecnico"
  | "representante";

type Profile = {
  id: string;
  name: string;
  role: Role;
  status?: string;
};

type Client = {
  id: string;
  name: string;
  city?: string;
};

type ServiceOrder = {
  id: string;
  client_id: string;
  client_name: string;
  client_city?: string | null;
  title: string;
  description?: string | null;
  responsible_id?: string | null;
  responsible_name?: string | null;
  stage: string;
  scheduled_date?: string | null;
  notes?: string | null;
  created_by_name?: string | null;
};

const STAGES = [
  { value: "open", label: "Aberta", color: "#60a5fa" },
  { value: "scheduled", label: "Agendada", color: "#a78bfa" },
  { value: "in_service", label: "Em atendimento", color: "#f59e0b" },
  { value: "waiting_part", label: "Aguardando peça", color: "#f97316" },
  { value: "completed", label: "Concluída", color: "#4ade80" },
  { value: "cancelled", label: "Cancelada", color: "#94a3b8" },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "Sem data agendada";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Sem data agendada" : date.toLocaleDateString("pt-BR");
}

export default function ServiceOrderFunnel({ profile }: { profile: Profile }) {
  const canSee = ["administrador", "gerente", "vendedor", "representante", "tecnico"].includes(profile.role);
  const canCreate = ["administrador", "gerente", "vendedor", "representante"].includes(profile.role);
  const canDelete = ["administrador", "gerente"].includes(profile.role);
  const [items, setItems] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [responsibles, setResponsibles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draggedId, setDraggedId] = useState("");

  const emptyForm = {
    client_id: "",
    title: "",
    description: "",
    responsible_id: "",
    scheduled_date: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);

  async function load() {
    if (!canSee) return;
    setLoading(true);

    try {
      const requests: Promise<Response>[] = [
        fetch("/api/crm/service-orders", { cache: "no-store" }),
      ];

      if (canCreate) {
        requests.push(fetch("/api/clients", { cache: "no-store" }));
        requests.push(fetch("/api/profiles", { cache: "no-store" }));
      }

      const responses = await Promise.all(requests);
      const ordersData = await responses[0].json();

      if (!responses[0].ok || !ordersData.sucesso) {
        throw new Error(ordersData.erro || "Erro ao carregar ordens de serviço.");
      }

      setItems(Array.isArray(ordersData.items) ? ordersData.items : []);

      if (canCreate && responses[1] && responses[2]) {
        const clientData = await responses[1].json();
        const profileData = await responses[2].json();

        if (responses[1].ok && clientData.sucesso) {
          setClients(
            (clientData.clients || []).filter(
              (client: Client) => client?.id && client?.name
            )
          );
        }

        if (responses[2].ok && Array.isArray(profileData)) {
          setResponsibles(
            profileData.filter(
              (candidate: Profile) =>
                candidate.status === "approved" &&
                ["administrador", "gerente", "tecnico"].includes(candidate.role)
            )
          );
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao carregar ordens de serviço."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [profile.id, profile.role]);

  const grouped = useMemo(() => {
    const result: Record<string, ServiceOrder[]> = {};
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

  function edit(item: ServiceOrder) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id,
      title: item.title || "",
      description: item.description || "",
      responsible_id: item.responsible_id || "",
      scheduled_date: item.scheduled_date
        ? String(item.scheduled_date).slice(0, 10)
        : "",
      notes: item.notes || "",
    });
    setShowForm(true);
  }

  async function save() {
    if (!canCreate || saving) return;
    if (!form.client_id) return setMessage("Selecione o cliente.");
    if (!form.title.trim()) return setMessage("Informe o título da ordem de serviço.");

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/service-orders", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          ...form,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao salvar ordem de serviço.");
      }

      setMessage(
        editingId
          ? "Ordem de serviço atualizada."
          : "Ordem de serviço adicionada ao funil."
      );
      resetForm();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao salvar ordem de serviço."
      );
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
      const response = await fetch("/api/crm/service-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) {
        throw new Error(data.erro || "Erro ao mover ordem de serviço.");
      }
    } catch (error) {
      setItems((rows) =>
        rows.map((item) =>
          item.id === id ? { ...item, stage: current.stage } : item
        )
      );
      setMessage(
        error instanceof Error
          ? error.message
          : "Erro ao mover ordem de serviço."
      );
    }
  }

  async function remove(id: string) {
    if (!canDelete || !confirm("Excluir esta ordem de serviço?")) return;

    const response = await fetch(
      `/api/crm/service-orders?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    const data = await response.json();
    if (!response.ok || !data.sucesso) {
      return setMessage(data.erro || "Erro ao excluir ordem de serviço.");
    }

    setItems((rows) => rows.filter((item) => item.id !== id));
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
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
          <h2 className="card-title">Ordens de Serviço</h2>
          <p style={{ color: "#94a3b8", margin: "-4px 0 16px" }}>
            {profile.role === "tecnico"
              ? "Acompanhe as ordens de serviço designadas para você."
              : "Acompanhe o atendimento do cliente do início à conclusão."}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            className="btn btn-blue"
            onClick={() => {
              setShowForm((value) => !value);
              if (showForm) resetForm();
            }}
          >
            {showForm ? "Fechar" : "Nova OS"}
          </button>
        )}
      </div>

      {canCreate && showForm && (
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
              <label>Cliente</label>
              <select
                className="input"
                value={form.client_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    client_id: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.city ? ` — ${client.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Título</label>
              <input
                className="input"
                maxLength={200}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>

            <div className="field">
              <label>Responsável</label>
              <select
                className="input"
                value={form.responsible_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    responsible_id: event.target.value,
                  }))
                }
              >
                <option value="">Sem responsável</option>
                {responsibles.map((responsible) => (
                  <option key={responsible.id} value={responsible.id}>
                    {responsible.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Data agendada</label>
              <input
                className="input"
                type="date"
                value={form.scheduled_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scheduled_date: event.target.value,
                  }))
                }
              />
            </div>

            <div className="field full-field">
              <label>Descrição do serviço</label>
              <textarea
                className="input"
                rows={3}
                maxLength={5000}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="field full-field">
              <label>Observações</label>
              <textarea
                className="input"
                rows={3}
                maxLength={5000}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-green"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "Salvando..."
                : editingId
                  ? "Salvar alterações"
                  : "Adicionar ao funil"}
            </button>

            <button
              type="button"
              className="btn btn-gray"
              onClick={resetForm}
              disabled={saving}
            >
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

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Carregando ordens de serviço...</p>
      ) : (
        <div style={{ overflowX: "auto", paddingBottom: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(270px, 1fr))",
              gap: 16,
              minWidth: 1700,
              alignItems: "start",
            }}
          >
            {STAGES.map((stage) => (
              <section
                key={stage.value}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id =
                    event.dataTransfer.getData("text/plain") || draggedId;
                  if (id) void move(id, stage.value);
                  setDraggedId("");
                }}
                style={{
                  minHeight: 260,
                  border: `1px solid ${stage.color}55`,
                  borderTop: `3px solid ${stage.color}`,
                  borderRadius: 18,
                  background: "rgba(2,6,23,.48)",
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <strong style={{ color: stage.color }}>{stage.label}</strong>
                  <span
                    style={{
                      borderRadius: 999,
                      background: `${stage.color}22`,
                      color: stage.color,
                      padding: "4px 8px",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {grouped[stage.value]?.length || 0}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {(grouped[stage.value] || []).map((item) => (
                    <div
                      key={item.id}
                      className="stat-card user-card"
                      draggable
                      onDragStart={(event) => onDragStart(event, item.id)}
                      onDragEnd={() => setDraggedId("")}
                      style={{ cursor: "grab" }}
                    >
                      <strong>{item.title}</strong>
                      <small>Cliente: {item.client_name}</small>
                      <small>Cidade: {item.client_city || "-"}</small>
                      <small>
                        Responsável: {item.responsible_name || "Não definido"}
                      </small>
                      <small>Data: {formatDate(item.scheduled_date)}</small>
                      {item.description && (
                        <small>Serviço: {item.description}</small>
                      )}
                      {item.notes && <small>Obs: {item.notes}</small>}

                      <div className="form-actions">
                        {canCreate && (
                          <button
                            type="button"
                            className="btn btn-blue"
                            onClick={() => edit(item)}
                          >
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="btn btn-red"
                            onClick={() => void remove(item.id)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {(grouped[stage.value] || []).length === 0 && (
                    <p style={{ color: "#64748b", fontSize: 13 }}>
                      Nenhuma OS nesta etapa.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

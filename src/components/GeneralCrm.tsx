"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  GENERAL_CRM_STAGES, GENERAL_CRM_PRIORITIES, canManageGeneralDemand, isGeneralDemandOverdue,
  type GeneralCrmActor, type GeneralCrmStage, type GeneralCrmPriority, type GeneralDemand, type GeneralCrmResponsible,
} from "@/lib/general-crm-policy";

const API = "/api/crm/general-demands";
const emptyForm = (id: string) => ({ title: "", description: "", status: "new" as GeneralCrmStage, priority: "normal" as GeneralCrmPriority, assigned_to: id, due_at: "" });
const displayDate = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem prazo";
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function GeneralCrm({ profile, search }: { profile: GeneralCrmActor; search: string }) {
  const [demands, setDemands] = useState<GeneralDemand[]>([]);
  const [responsibles, setResponsibles] = useState<GeneralCrmResponsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GeneralDemand | null>(null);
  const [form, setForm] = useState(() => emptyForm(profile.id));
  const [stageFilter, setStageFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const mutation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(API, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao carregar o CRM geral.");
      if (signal?.aborted) return;
      setDemands(Array.isArray(data.demands) ? data.demands : []);
      setResponsibles(Array.isArray(data.responsibles) ? data.responsibles : []);
    } catch (cause) {
      if (!signal?.aborted) setMessage(cause instanceof Error ? cause.message : "Erro ao carregar demandas.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return GENERAL_CRM_STAGES.map((stage) => ({ ...stage, items: demands.filter((demand) =>
      demand.status === stage.value && (!stageFilter || demand.status === stageFilter) &&
      (!responsibleFilter || demand.assigned_to === responsibleFilter || (responsibleFilter === "unassigned" && !demand.assigned_to)) &&
      (!onlyOverdue || isGeneralDemandOverdue(demand)) &&
      (!query || [demand.title, demand.description, demand.responsible_name, demand.creator_name].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)))) }));
  }, [demands, search, stageFilter, responsibleFilter, onlyOverdue]);
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  const overdueCount = demands.filter((item) => isGeneralDemandOverdue(item)).length;
  const filterResponsibles = useMemo(() => {
    const map = new Map(responsibles.map((item) => [item.id, item.name]));
    for (const demand of demands) if (demand.assigned_to && !map.has(demand.assigned_to)) map.set(demand.assigned_to, demand.responsible_name || "Responsável indisponível");
    return [...map].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [demands, responsibles]);

  function set(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function openForm(demand?: GeneralDemand) {
    if (mutation.current) return;
    setEditing(demand || null);
    setForm(demand ? { title: demand.title, description: demand.description, status: demand.status, priority: demand.priority, assigned_to: demand.assigned_to || "", due_at: localDate(demand.due_at) } : emptyForm(profile.id));
    setFormOpen(true);
    setMessage("");
    window.requestAnimationFrame(() => heading.current?.focus());
  }
  async function write(payload: Record<string, unknown>, id?: string) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(id || "form");
    setMessage("");
    try {
      const response = await fetch(API, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { ...payload, id } : payload) });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Não foi possível salvar a demanda.");
      if (formOpen) { setFormOpen(false); setEditing(null); }
      setMessage(id ? "Demanda atualizada." : "Demanda cadastrada.");
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Erro ao salvar demanda."); }
    finally { mutation.current = false; setBusy(""); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void write({ ...form, assigned_to: form.assigned_to || null, due_at: form.due_at ? new Date(form.due_at).toISOString() : null }, editing?.id);
  }

  return <div className="general-crm">
    <div className="page-title"><h1>CRM geral</h1><p>Funil independente para demandas gerais, sem misturar oportunidades comerciais ou montagens.</p></div>
    <section className="card" aria-label="Demandas gerais">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div><h2 className="card-title">Funil de demandas gerais</h2><p>{count} demanda(s) na lista · {overdueCount} atrasada(s) no total</p></div>
        <div className="form-actions" style={{ margin: 0 }}><button type="button" className="btn btn-blue" disabled={Boolean(busy) || formOpen} onClick={() => openForm()}>+ Nova demanda</button><button type="button" className="btn btn-gray" disabled={loading || Boolean(busy)} onClick={() => void load()}>Atualizar</button></div>
      </div>
      {message && <p role="status" style={{ color: "#93c5fd", whiteSpace: "pre-wrap" }}>{message}</p>}
      {formOpen && <form onSubmit={save} style={{ margin: "20px 0" }}>
        <h3 ref={heading} tabIndex={-1}>{editing ? "Editar demanda" : "Nova demanda"}</h3>
        <fieldset disabled={Boolean(busy)} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <div className="form-grid">
            <div className="field full-field"><label htmlFor="general-demand-title">Título *</label><input id="general-demand-title" className="input" required maxLength={200} value={form.title} onChange={(e) => set("title", e.currentTarget.value)} /></div>
            <div className="field full-field"><label htmlFor="general-demand-description">Descrição / observações</label><textarea id="general-demand-description" className="input" rows={4} maxLength={5000} value={form.description} onChange={(e) => set("description", e.currentTarget.value)} /></div>
            <div className="field"><label htmlFor="general-demand-assignee">Responsável</label><select id="general-demand-assignee" className="input" value={form.assigned_to} onChange={(e) => set("assigned_to", e.currentTarget.value)}><option value="">Sem responsável</option>{editing?.assigned_to && !responsibles.some((p) => p.id === editing.assigned_to) && <option value={editing.assigned_to}>{editing.responsible_name || "Responsável atual"}</option>}{responsibles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label htmlFor="general-demand-due">Prazo</label><input id="general-demand-due" className="input" type="datetime-local" value={form.due_at} onChange={(e) => set("due_at", e.currentTarget.value)} /></div>
            <div className="field"><label htmlFor="general-demand-priority">Prioridade</label><select id="general-demand-priority" className="input" value={form.priority} onChange={(e) => set("priority", e.currentTarget.value)}>{GENERAL_CRM_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="field"><label htmlFor="general-demand-stage">Etapa</label><select id="general-demand-stage" className="input" value={form.status} onChange={(e) => set("status", e.currentTarget.value)}>{GENERAL_CRM_STAGES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
          </div>
          <div className="form-actions"><button type="submit" className="btn btn-green">{busy ? "Salvando..." : "Salvar demanda"}</button><button type="button" className="btn btn-gray" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancelar edição</button></div>
        </fieldset>
      </form>}
      <div className="form-grid" style={{ margin: "20px 0" }}>
        <div className="field"><label htmlFor="general-filter-stage">Filtrar etapa</label><select id="general-filter-stage" className="input" value={stageFilter} onChange={(e) => setStageFilter(e.currentTarget.value)}><option value="">Todas as etapas</option>{GENERAL_CRM_STAGES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
        <div className="field"><label htmlFor="general-filter-assignee">Filtrar responsável</label><select id="general-filter-assignee" className="input" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.currentTarget.value)}><option value="">Todos os responsáveis</option><option value="unassigned">Sem responsável</option>{filterResponsibles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
        <label className="check-row"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.currentTarget.checked)} />Somente atrasadas</label>
      </div>
      {loading && <p role="status">Carregando demandas...</p>}
      {!loading && count === 0 && <p>Nenhuma demanda encontrada. Use “Nova demanda” para cadastrar ou ajuste os filtros.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        {groups.filter((group) => !stageFilter || group.value === stageFilter).map((group) => <details key={group.value} className="crm-stage-list-details" open={!["completed", "cancelled"].includes(group.value) || Boolean(stageFilter)}>
          <summary className="crm-stage-list-summary"><strong>{group.label}</strong><span>{group.items.length}</span></summary>
          <div className="crm-stage-list-content">
            {group.items.length === 0 && <p>Nenhuma demanda nesta etapa.</p>}
            {group.items.map((demand) => <details key={demand.id} className="crm-record-list-item" style={{ padding: 14, minWidth: 0, borderBottom: "1px solid rgba(148,163,184,.2)" }}>
              <summary className="crm-record-list-summary"><strong style={{ overflowWrap: "anywhere" }}>{demand.title}</strong><span>{GENERAL_CRM_PRIORITIES.find((p) => p.value === demand.priority)?.label}</span><small>Responsável: {demand.responsible_name || "Sem responsável"}</small><small style={{ color: isGeneralDemandOverdue(demand) ? "#fca5a5" : undefined }}>{isGeneralDemandOverdue(demand) ? "Atrasada · " : ""}{displayDate(demand.due_at)}</small></summary>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{demand.description || "Sem descrição."}</p><small>Criada por: {demand.creator_name || "Usuário indisponível"}</small>
              {canManageGeneralDemand(profile, demand) && <div className="form-actions"><label>Etapa de {demand.title}<select className="input" disabled={Boolean(busy) || formOpen} value={demand.status} onChange={(e) => void write({ status: e.currentTarget.value }, demand.id)}>{GENERAL_CRM_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label><button type="button" className="btn btn-blue" disabled={Boolean(busy) || formOpen} onClick={() => openForm(demand)}>Editar demanda</button></div>}
            </details>)}
          </div>
        </details>)}
      </div>
    </section>
  </div>;
}

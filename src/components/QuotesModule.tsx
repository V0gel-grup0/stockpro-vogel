"use client";

import { useEffect, useMemo, useState } from "react";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";

type Profile = { id: string; role: string; name?: string; email?: string };
type Row = Record<string, any>;
type QuoteContext = { clientId: string; opportunityId: string; requestId: number } | null;
type ItemForm = {
  item_type: "product" | "equipment" | "custom";
  product_id: string;
  item_name: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_value: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Vencido",
};

const ITEM_LABELS: Record<string, string> = {
  product: "Produto",
  equipment: "Equipamento",
  custom: "Outro item",
};

function dateInput(days = 15) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyItem(): ItemForm {
  return {
    item_type: "product",
    product_id: "",
    item_name: "",
    description: "",
    quantity: "1",
    unit_price: "0.00",
    discount_value: "0.00",
  };
}

function emptyForm(profileId: string) {
  return {
    client_id: "",
    opportunity_id: "",
    responsible_id: profileId,
    valid_until: dateInput(),
    payment_terms: "",
    notes: "",
    discount_value: "0.00",
    shipping_value: "0.00",
    items: [emptyItem()],
  };
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateBr(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function quoteCode(value: unknown) {
  return `ORC-${String(value || 0).padStart(6, "0")}`;
}

function effectiveStatus(quote: Row) {
  if (quote.status !== "sent" || !quote.valid_until) return quote.status;
  const end = new Date(`${String(quote.valid_until).slice(0, 10)}T23:59:59.999Z`);
  return end.getTime() < Date.now() ? "expired" : quote.status;
}

function previewTotals(form: ReturnType<typeof emptyForm>) {
  const subtotal = form.items.reduce((sum, item) => {
    const gross = Number(item.quantity || 0) * Number(item.unit_price || 0);
    return sum + Math.max(0, gross - Number(item.discount_value || 0));
  }, 0);
  return {
    subtotal,
    total: Math.max(0, subtotal - Number(form.discount_value || 0) + Number(form.shipping_value || 0)),
  };
}

export default function QuotesModule({
  profile,
  search,
  initialContext,
  onContextConsumed,
}: {
  profile: Profile;
  search: string;
  initialContext: QuoteContext;
  onContextConsumed: () => void;
}) {
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [opportunities, setOpportunities] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState(() => emptyForm(profile.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const responsibleOptions = useMemo(
    () =>
      profiles.filter((item) => {
        if (item.status !== "approved") return false;
        if (!["administrador", "gerente", "vendedor", "representante"].includes(item.role)) return false;
        return ["administrador", "gerente"].includes(profile.role) ? true : item.id === profile.id;
      }),
    [profiles, profile.id, profile.role]
  );

  const clientOptions = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return clients
      .filter((client) => !query || String(client.name || "").toLowerCase().includes(query) || String(client.document || "").includes(query))
      .slice(0, 50);
  }, [clients, clientSearch]);

  const clientOpportunities = opportunities.filter(
    (item) => !form.client_id || item.client_id === form.client_id
  );
  const totals = previewTotals(form);

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadQuotes();
  }, [search, statusFilter, responsibleFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!initialContext) return;
    setSelected(null);
    setEditingId(null);
    setForm({
      ...emptyForm(profile.id),
      client_id: initialContext.clientId,
      opportunity_id: initialContext.opportunityId,
    });
    setFormOpen(true);
    onContextConsumed();
  }, [initialContext?.requestId]);

  async function readJson(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || data.error || "Não foi possível concluir a operação.");
    return data;
  }

  async function loadReferenceData() {
    try {
      const [clientResponse, productResponse, profileResponse, opportunityResponse] = await Promise.all([
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/profiles", { cache: "no-store" }),
        fetch("/api/crm/opportunities", { cache: "no-store" }),
      ]);
      const [clientData, productData, profileData, opportunityData] = await Promise.all([
        readJson(clientResponse),
        readJson(productResponse),
        readJson(profileResponse),
        readJson(opportunityResponse),
      ]);
      setClients((clientData.clients || []).sort((a: Row, b: Row) => String(a.name).localeCompare(String(b.name))));
      setProducts(productData.products || []);
      setProfiles(Array.isArray(profileData) ? profileData : []);
      setOpportunities(opportunityData.opportunities || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar dados do orçamento.");
    }
  }

  async function loadQuotes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (responsibleFilter) params.set("responsible_id", responsibleFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const data = await readJson(await fetch(`/api/quotes?${params}`, { cache: "no-store" }));
      setQuotes(data.quotes || []);
      if (selected) {
        const refreshed = (data.quotes || []).find((item: Row) => item.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar orçamentos.");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setSelected(null);
    setEditingId(null);
    setForm(emptyForm(profile.id));
    setClientSearch("");
    setMessage("");
    setFormOpen(true);
  }

  function openEdit(quote: Row) {
    setEditingId(quote.id);
    setForm({
      client_id: quote.client_id || "",
      opportunity_id: quote.opportunity_id || "",
      responsible_id: quote.responsible_id || profile.id,
      valid_until: String(quote.valid_until || "").slice(0, 10),
      payment_terms: quote.payment_terms || "",
      notes: quote.notes || "",
      discount_value: String(quote.discount_value ?? "0.00"),
      shipping_value: String(quote.shipping_value ?? "0.00"),
      items: (quote.quote_items || []).map((item: Row) => ({
        item_type: item.item_type,
        product_id: item.product_id || "",
        item_name: item.item_name || "",
        description: item.description || "",
        quantity: String(item.quantity ?? "1"),
        unit_price: String(item.unit_price ?? "0.00"),
        discount_value: String(item.discount_value ?? "0.00"),
      })),
    });
    setFormOpen(true);
    setSelected(null);
    setMessage("");
  }

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const updated = { ...item, [field]: value } as ItemForm;
        if (field === "item_type") {
          updated.product_id = "";
          updated.item_name = value === "equipment" ? EQUIPMENT_CATALOG[0] : "";
          updated.description = "";
        }
        if (field === "product_id") {
          const product = products.find((candidate) => candidate.id === value);
          if (product) {
            updated.item_name = product.name || "";
            updated.description = product.description || "";
            updated.unit_price = String(product.sale_price ?? "0.00");
          }
        }
        return updated;
      }),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(editingId ? `/api/quotes/${editingId}` : "/api/quotes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readJson(response);
      setFormOpen(false);
      setEditingId(null);
      setSelected(data.quote);
      setMessage(editingId ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso.");
      await loadQuotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar orçamento.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(quote: Row, status: string) {
    try {
      const data = await readJson(
        await fetch(`/api/quotes/${quote.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
      );
      setSelected(data.quote);
      setMessage("Status do orçamento atualizado com sucesso.");
      await loadQuotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao alterar status.");
    }
  }

  async function deleteQuote(quote: Row) {
    if (!window.confirm(`Excluir ${quoteCode(quote.quote_number)}?`)) return;
    try {
      await readJson(await fetch(`/api/quotes/${quote.id}`, { method: "DELETE" }));
      setSelected(null);
      setMessage("Orçamento excluído com sucesso.");
      await loadQuotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir orçamento.");
    }
  }

  async function generateOrder(quote: Row) {
    try {
      const data = await readJson(await fetch(`/api/quotes/${quote.id}/generate-order`, { method: "POST" }));
      setMessage(`Pedido ${data.order?.order_number || ""} gerado com sucesso.`);
      await loadQuotes();
      const detail = await readJson(await fetch(`/api/quotes/${quote.id}`, { cache: "no-store" }));
      setSelected(detail.quote);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao gerar pedido.");
    }
  }

  function canManage(quote: Row) {
    return ["administrador", "gerente"].includes(profile.role) || quote.created_by === profile.id || quote.responsible_id === profile.id;
  }

  const counts = {
    draft: quotes.filter((item) => effectiveStatus(item) === "draft").length,
    sent: quotes.filter((item) => effectiveStatus(item) === "sent").length,
    approved: quotes.filter((item) => effectiveStatus(item) === "approved").length,
    expired: quotes.filter((item) => effectiveStatus(item) === "expired").length,
  };

  return (
    <div className="quotes-module">
      <div className="page-title quotes-heading">
        <div><h1>Orçamentos</h1><p>Propostas comerciais com itens, histórico, aprovação e conversão segura.</p></div>
        <button className="btn btn-blue no-print" onClick={openNew}>+ Novo orçamento</button>
      </div>

      {message && <div className="quote-message no-print">{message}</div>}

      {!formOpen && !selected && <>
        <div className="reports-grid quote-summary-grid">
          <div className="stat-card"><span>Rascunhos</span><strong>{counts.draft}</strong></div>
          <div className="stat-card"><span>Enviados</span><strong>{counts.sent}</strong></div>
          <div className="stat-card"><span>Aprovados</span><strong>{counts.approved}</strong></div>
          <div className="stat-card"><span>Vencidos</span><strong>{counts.expired}</strong></div>
        </div>
        <section className="card quote-filters no-print">
          <div className="form-grid">
            <div className="field"><label>Status</label><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>Responsável</label><select className="input" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="">Todos</option>{responsibleOptions.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select></div>
            <div className="field"><label>Data inicial</label><input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="field"><label>Data final</label><input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
          </div>
        </section>
        <section className="card quote-list-card">
          <h2 className="card-title">Orçamentos cadastrados</h2>
          {loading ? <p className="muted">Carregando...</p> : quotes.length === 0 ? <p className="muted">Nenhum orçamento encontrado.</p> : <div className="quote-list">
            {quotes.map((quote) => {
              const status = effectiveStatus(quote);
              return <article key={quote.id} className="quote-list-row">
                <strong>{quoteCode(quote.quote_number)}</strong>
                <span><small>Cliente</small>{quote.clients?.name || "-"}</span>
                <span><small>Responsável</small>{quote.profiles_responsible?.name || "-"}</span>
                <span><small>Data</small>{dateBr(quote.created_at)}</span>
                <span><small>Validade</small>{dateBr(quote.valid_until)}</span>
                <span><small>Status</small><b className={`quote-status status-${status}`}>{STATUS_LABELS[status]}</b></span>
                <span><small>Valor</small><b>{money(quote.total_value)}</b></span>
                <button className="btn btn-gray" onClick={() => setSelected(quote)}>Abrir</button>
              </article>;
            })}
          </div>}
        </section>
      </>}

      {formOpen && <section className="card quote-form no-print">
        <div className="quote-section-heading"><h2 className="card-title">{editingId ? "Editar orçamento" : "Novo orçamento"}</h2><button className="btn btn-gray" onClick={() => { setFormOpen(false); setEditingId(null); }}>Cancelar</button></div>
        <div className="form-grid">
          <div className="field full-field"><label>Pesquisar cliente</label><input className="input" placeholder="Nome ou documento" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} /></div>
          <div className="field"><label>Cliente *</label><select className="input" value={form.client_id} onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value, opportunity_id: "" }))}><option value="">Selecione</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
          <div className="field"><label>Oportunidade CRM</label><select className="input" value={form.opportunity_id} onChange={(event) => setForm((current) => ({ ...current, opportunity_id: event.target.value }))}><option value="">Sem oportunidade</option>{clientOpportunities.map((item) => <option key={item.id} value={item.id}>{item.title || "Sem título"}</option>)}</select></div>
          <div className="field"><label>Responsável *</label><select className="input" value={form.responsible_id} onChange={(event) => setForm((current) => ({ ...current, responsible_id: event.target.value }))}><option value="">Selecione</option>{responsibleOptions.map((item) => <option key={item.id} value={item.id}>{item.name || item.email} — {item.role}</option>)}</select></div>
          <div className="field"><label>Validade *</label><input className="input" type="date" value={form.valid_until} onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))} /></div>
          <div className="field"><label>Condição de pagamento</label><input className="input" maxLength={500} value={form.payment_terms} onChange={(event) => setForm((current) => ({ ...current, payment_terms: event.target.value }))} /></div>
          <div className="field full-field"><label>Observações</label><textarea className="input" maxLength={5000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        </div>
        <div className="quote-section-heading"><h3>Itens do orçamento</h3><button className="btn btn-blue" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}>+ Adicionar item</button></div>
        <div className="quote-items-editor">
          {form.items.map((item, index) => <article className="quote-item-editor" key={index}>
            <div className="field"><label>Tipo</label><select className="input" value={item.item_type} onChange={(event) => updateItem(index, "item_type", event.target.value)}>{Object.entries(ITEM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {item.item_type === "product" && <div className="field"><label>Produto</label><select className="input" value={item.product_id} onChange={(event) => updateItem(index, "product_id", event.target.value)}><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>}
            {item.item_type === "equipment" && <div className="field"><label>Equipamento</label><select className="input" value={item.item_name} onChange={(event) => updateItem(index, "item_name", event.target.value)}>{EQUIPMENT_CATALOG.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>}
            {item.item_type === "custom" && <div className="field"><label>Nome</label><input className="input" maxLength={200} value={item.item_name} onChange={(event) => updateItem(index, "item_name", event.target.value)} /></div>}
            <div className="field quote-description"><label>Descrição</label><input className="input" maxLength={2000} value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} /></div>
            <div className="field"><label>Quantidade</label><input className="input" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></div>
            <div className="field"><label>Valor unitário</label><input className="input" type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, "unit_price", event.target.value)} /></div>
            <div className="field"><label>Desconto</label><input className="input" type="number" min="0" step="0.01" value={item.discount_value} onChange={(event) => updateItem(index, "discount_value", event.target.value)} /></div>
            <div className="quote-item-total"><small>Total</small><strong>{money(Math.max(0, Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_value || 0)))}</strong></div>
            <button className="btn btn-red" type="button" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>Remover</button>
          </article>)}
        </div>
        <div className="quote-financial-editor">
          <div className="field"><label>Desconto geral</label><input className="input" type="number" min="0" step="0.01" value={form.discount_value} onChange={(event) => setForm((current) => ({ ...current, discount_value: event.target.value }))} /></div>
          <div className="field"><label>Frete</label><input className="input" type="number" min="0" step="0.01" value={form.shipping_value} onChange={(event) => setForm((current) => ({ ...current, shipping_value: event.target.value }))} /></div>
          <div><small>Subtotal estimado</small><strong>{money(totals.subtotal)}</strong></div>
          <div className="quote-grand-total"><small>TOTAL</small><strong>{money(totals.total)}</strong></div>
        </div>
        <div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar orçamento"}</button></div>
      </section>}

      {selected && <QuoteDetail quote={selected} profile={profile} manageable={canManage(selected)} onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} onStatus={(status) => changeStatus(selected, status)} onDelete={() => deleteQuote(selected)} onGenerateOrder={() => generateOrder(selected)} />}
    </div>
  );
}

function QuoteDetail({ quote, profile, manageable, onBack, onEdit, onStatus, onDelete, onGenerateOrder }: { quote: Row; profile: Profile; manageable: boolean; onBack: () => void; onEdit: () => void; onStatus: (status: string) => void; onDelete: () => void; onGenerateOrder: () => void }) {
  const status = effectiveStatus(quote);
  return <section className="card quote-document">
    <div className="quote-document-actions no-print">
      <button className="btn btn-gray" onClick={onBack}>Voltar</button>
      <button className="btn btn-gray" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
      {manageable && quote.status === "draft" && <><button className="btn btn-blue" onClick={onEdit}>Editar</button><button className="btn btn-green" onClick={() => onStatus("sent")}>Marcar como enviado</button><button className="btn btn-red" onClick={() => onStatus("rejected")}>Recusar</button><button className="btn btn-red" onClick={onDelete}>Excluir</button></>}
      {manageable && quote.status === "sent" && <><button className="btn btn-green" onClick={() => onStatus("approved")}>Aprovar</button><button className="btn btn-red" onClick={() => onStatus("rejected")}>Recusar</button>{status === "expired" && <button className="btn btn-gray" onClick={() => onStatus("expired")}>Registrar vencimento</button>}</>}
      {manageable && quote.status === "approved" && !quote.generated_order_id && <button className="btn btn-green" onClick={onGenerateOrder}>Gerar Pedido</button>}
    </div>
    <header className="quote-print-header"><img src="/logo-vogel.png" alt="Grupo Vogel" /><div><span>ORÇAMENTO</span><h1>{quoteCode(quote.quote_number)}</h1></div><b className={`quote-status status-${status}`}>{STATUS_LABELS[status]}</b></header>
    <div className="quote-document-meta">
      <div><small>Cliente</small><strong>{quote.clients?.name || "-"}</strong><span>{quote.clients?.document || ""}</span><span>{quote.clients?.phone || ""}</span><span>{[quote.clients?.street, quote.clients?.number, quote.clients?.neighborhood, quote.clients?.city].filter(Boolean).join(", ")}</span></div>
      <div><small>Data</small><strong>{dateBr(quote.created_at)}</strong><small>Validade</small><strong>{dateBr(quote.valid_until)}</strong></div>
      <div><small>Responsável</small><strong>{quote.profiles_responsible?.name || "-"}</strong><span>{quote.profiles_responsible?.email || ""}</span><small>Criado por</small><span>{quote.profiles_created_by?.name || "-"}</span></div>
    </div>
    {quote.crm_opportunities && <div className="quote-linked-opportunity"><small>Oportunidade CRM</small><strong>{quote.crm_opportunities.title || "Sem título"}</strong></div>}
    <div className="quote-items-table">
      <div className="quote-items-head"><span>Item</span><span>Qtd.</span><span>Unitário</span><span>Desconto</span><span>Total</span></div>
      {(quote.quote_items || []).map((item: Row) => <div className="quote-items-row" key={item.id}><span><strong>{item.item_name}</strong><small>{ITEM_LABELS[item.item_type]}{item.description ? ` — ${item.description}` : ""}</small></span><span>{Number(item.quantity).toLocaleString("pt-BR")}</span><span>{money(item.unit_price)}</span><span>{money(item.discount_value)}</span><span><strong>{money(item.total_value)}</strong></span></div>)}
    </div>
    <div className="quote-document-footer">
      <div><small>Condição de pagamento</small><p>{quote.payment_terms || "Não informada."}</p><small>Observações</small><p>{quote.notes || "Sem observações."}</p></div>
      <div className="quote-totals"><span>Subtotal <b>{money(quote.subtotal)}</b></span><span>Desconto <b>{money(quote.discount_value)}</b></span><span>Frete <b>{money(quote.shipping_value)}</b></span><strong>TOTAL <b>{money(quote.total_value)}</b></strong></div>
    </div>
    {quote.generated_order_id && <div className="quote-order-link">Pedido gerado: {quote.orders?.order_number || quote.generated_order_id}</div>}
    <section className="quote-history no-print"><h3>Histórico</h3>{(quote.quote_events || []).map((event: Row) => <article key={event.id}><span>{dateBr(event.created_at)} — {event.profiles?.name || "Usuário"}</span><strong>{event.description}</strong>{event.previous_status && <small>{STATUS_LABELS[event.previous_status]} → {STATUS_LABELS[event.new_status]}</small>}</article>)}</section>
  </section>;
}

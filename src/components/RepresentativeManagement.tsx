"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EQUIPMENT_CATALOG } from "@/lib/equipment-catalog";

type Row = Record<string, any>;
type ManagementData = {
  representative: Row;
  capabilities: { can_manage_financials: boolean; can_record_collection: boolean };
  summary: Row;
  alerts: Row[];
  goals: Row[];
  purchases: Row[];
  receivables: Row[];
  payments: Row[];
  collections: Row[];
  contracts: Row[];
  invoices: Row[];
};

const TABS = ["Resumo", "Metas", "Compras", "Financeiro", "Cobranças", "Contratos", "Notas Fiscais"] as const;
const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);
const nowLocal = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-";
const dateTimeLabel = (value: unknown) => value ? new Date(String(value)).toLocaleString("pt-BR") : "-";
const statusLabel = (value: unknown) => String(value || "-").replaceAll("_", " ").toUpperCase();

function FormField({ label, value, onChange, type = "text", min, step, disabled }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  disabled?: boolean;
}) {
  return <div className="field"><label>{label}</label><input className="input" type={type} min={min} step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function FormSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <div className="field"><label>{label}</label><select className="input" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></div>;
}

function FormArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="field full-field"><label>{label}</label><textarea className="input" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="stat-card"><span>{label}</span><strong style={{ color: tone }}>{value}</strong></div>;
}

function Progress({ value, color = "#2563eb" }: { value: number; color?: string }) {
  const width = Math.min(100, Math.max(0, Number(value || 0)));
  return <div className="representative-progress" aria-label={`${value}% atingido`}><div style={{ width: `${width}%`, background: color }} /></div>;
}

export default function RepresentativeManagement({ representativeId, onBack }: { representativeId: string; onBack?: () => void }) {
  const [data, setData] = useState<ManagementData | null>(null);
  const [products, setProducts] = useState<Row[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Resumo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profileForm, setProfileForm] = useState({ company: "", region: "" });
  const [goalForm, setGoalForm] = useState({ reference_month: month(), equipment_target: "0", revenue_target: "0", notes: "" });
  const [purchaseForm, setPurchaseForm] = useState({ purchase_date: today(), item_type: "equipamento", product_id: "", item_name: "", quantity: "1", unit_price: "0", shipping_value: "0", payment_terms: "", installment_count: "1", first_due_date: today(), status: "confirmada", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ receivable_id: "", payment_date: today(), amount: "", payment_method: "pix", notes: "" });
  const [collectionForm, setCollectionForm] = useState({ receivable_id: "", contact_date: nowLocal(), contact_type: "whatsapp", notes: "", payment_promise: "", promised_date: "", next_contact_at: "" });
  const [contractForm, setContractForm] = useState({ contract_number: "", contract_type: "representacao", start_date: today(), end_date: today(), region: "", exclusive: false, status: "ativo", notes: "" });
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: "", issued_at: today(), amount: "0", purchase_id: "", notes: "" });
  const [contractPdf, setContractPdf] = useState<File | null>(null);
  const [invoicePdf, setInvoicePdf] = useState<File | null>(null);

  const endpoint = `/api/representatives/${encodeURIComponent(representativeId)}/management`;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.sucesso) throw new Error(payload.erro || "Erro ao carregar a gestão do representante.");
      setData(payload);
      setProfileForm({ company: payload.representative.representative_company || "", region: payload.representative.representative_region || "" });
      setContractForm((current) => ({ ...current, region: current.region || payload.representative.representative_region || "" }));

      if (payload.capabilities?.can_manage_financials) {
        try {
          const productsResponse = await fetch("/api/products", { cache: "no-store" });
          const productsPayload = await productsResponse.json();
          setProducts(productsResponse.ok && productsPayload.sucesso ? productsPayload.products || [] : []);
        } catch {
          setProducts([]);
        }
      } else {
        setProducts([]);
      }
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : "Erro ao carregar a gestão do representante.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  async function submit(action: string, values: Row, successMessage: string) {
    try {
      setSaving(true);
      setMessage("");
      const normalizedValues = action === "collection"
        ? {
            ...values,
            contact_date: values.contact_date ? new Date(values.contact_date).toISOString() : "",
            next_contact_at: values.next_contact_at ? new Date(values.next_contact_at).toISOString() : "",
          }
        : values;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...normalizedValues }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.sucesso) throw new Error(payload.erro || "Erro ao salvar.");
      setMessage(successMessage);
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(kind: "contract" | "invoice", recordId: string, fileKind: "pdf" | "xml", file?: File) {
    if (!file) return false;
    if (file.size <= 0 || file.size > 4_000_000) {
      setMessage("O anexo deve ter no máximo 4 MB.");
      return false;
    }
    try {
      setSaving(true);
      setMessage("");
      const url = kind === "contract"
        ? `${endpoint}/contracts/${encodeURIComponent(recordId)}/file`
        : `${endpoint}/invoices/${encodeURIComponent(recordId)}/file`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", fileKind);
      const response = await fetch(url, { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.sucesso) throw new Error(payload.erro || "Erro ao anexar arquivo.");
      setMessage("Anexo salvo com sucesso.");
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao anexar arquivo.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function choosePdf(file: File | undefined, setter: (file: File | null) => void) {
    if (!file) {
      setter(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setMessage("Selecione um arquivo PDF válido.");
      setter(null);
      return;
    }
    if (file.size <= 0 || file.size > 4_000_000) {
      setMessage("O PDF deve ter no máximo 4 MB.");
      setter(null);
      return;
    }
    setMessage("");
    setter(file);
  }

  const openReceivables = useMemo(() => data?.receivables.filter((item) => item.effective_status !== "pago") || [], [data]);
  const purchasePreview = Number(purchaseForm.quantity || 0) * Number(String(purchaseForm.unit_price).replace(",", ".") || 0) + Number(String(purchaseForm.shipping_value).replace(",", ".") || 0);

  if (loading) return <section className="card"><h2 className="card-title">Carregando gestão...</h2></section>;
  if (!data) return <><div className="page-title"><h1>Gestão do Representante</h1></div><section className="card"><p style={{ color: "#f87171" }}>{message}</p>{onBack && <button className="btn btn-gray" onClick={onBack}>Voltar</button>}</section></>;

  const { representative, capabilities, summary } = data;
  const seller = representative.responsible_seller;

  return <>
    <div className="page-title representative-title">
      <div>
        <h1>Gestão do Representante</h1>
        <p>Relacionamento comercial, metas, compras, financeiro e documentos.</p>
      </div>
      {onBack && <button className="btn btn-gray" onClick={onBack}>Voltar aos representantes</button>}
    </div>

    <section className="card representative-identity">
      <div><span>Representante</span><strong>{representative.name}</strong></div>
      <div><span>Empresa</span><strong>{representative.representative_company || "Não informada"}</strong></div>
      <div><span>Vendedor responsável</span><strong>{seller?.name || "Não vinculado"}</strong></div>
      <div><span>Região</span><strong>{representative.representative_region || "Não informada"}</strong></div>
      <div><span>Status</span><strong>{statusLabel(representative.status)}</strong></div>
    </section>

    <nav className="representative-tabs" aria-label="Áreas da gestão do representante">
      {TABS.map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => { setActiveTab(tab); setMessage(""); }}>{tab}</button>)}
    </nav>

    {message && <div className={`representative-message ${message.toLowerCase().includes("sucesso") || message.toLowerCase().includes("salvo") ? "success" : "error"}`}>{message}</div>}

    {activeTab === "Resumo" && <>
      <div className="reports-grid representative-summary-grid">
        <SummaryCard label="Meta do mês" value={`${summary.month_goal?.equipment_target || 0} un. / ${money(summary.month_goal?.revenue_target)}`} />
        <SummaryCard label="Quantidade comprada no mês" value={String(summary.month_quantity || 0)} />
        <SummaryCard label="Faturamento do mês" value={money(summary.month_revenue)} />
        <SummaryCard label="Total a receber" value={money(summary.total_receivable)} tone="#facc15" />
        <SummaryCard label="Total vencido" value={money(summary.total_overdue)} tone="#f87171" />
        <SummaryCard label="Próximo vencimento" value={dateLabel(summary.next_due_date)} />
        <SummaryCard label="Situação do contrato" value={statusLabel(summary.contract_status)} />
      </div>
      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Alertas</h2>
        {data.alerts.length === 0 ? <p className="muted">Nenhum alerta ativo.</p> : <div className="representative-alerts">{data.alerts.map((alert, index) => <div key={`${alert.type}-${alert.record_id}-${index}`} className={`representative-alert ${alert.tone}`}>{alert.message}</div>)}</div>}
      </section>
      {capabilities.can_manage_financials && <section className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Dados comerciais</h2>
        <div className="form-grid"><FormField label="Empresa" value={profileForm.company} onChange={(company) => setProfileForm((current) => ({ ...current, company }))} /><FormField label="Região" value={profileForm.region} onChange={(region) => setProfileForm((current) => ({ ...current, region }))} /></div>
        <div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={() => submit("profile", profileForm, "Dados comerciais atualizados com sucesso.")}>Salvar dados</button></div>
      </section>}
    </>}

    {activeTab === "Metas" && <>
      {capabilities.can_manage_financials && <section className="card">
        <h2 className="card-title">Definir meta mensal</h2>
        <div className="form-grid">
          <FormField label="Mês/ano" type="month" value={goalForm.reference_month} onChange={(reference_month) => setGoalForm((current) => ({ ...current, reference_month }))} />
          <FormField label="Meta de equipamentos" type="number" min="0" step="1" value={goalForm.equipment_target} onChange={(equipment_target) => setGoalForm((current) => ({ ...current, equipment_target }))} />
          <FormField label="Meta de faturamento" type="number" min="0" step="0.01" value={goalForm.revenue_target} onChange={(revenue_target) => setGoalForm((current) => ({ ...current, revenue_target }))} />
          <FormArea label="Observações" value={goalForm.notes} onChange={(notes) => setGoalForm((current) => ({ ...current, notes }))} />
        </div>
        <div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={() => submit("goal", goalForm, "Meta mensal salva com sucesso.")}>Salvar meta</button></div>
      </section>}
      <section className="card" style={{ marginTop: capabilities.can_manage_financials ? 24 : 0 }}><h2 className="card-title">Histórico mensal</h2>
        {data.goals.length === 0 ? <p className="muted">Nenhuma meta cadastrada.</p> : <div className="product-list-grid">{data.goals.map((goal) => <article className="stat-card user-card" key={goal.id}>
          <strong>{String(goal.reference_month).slice(0, 7).split("-").reverse().join("/")}</strong>
          <small>Equipamentos: {goal.equipment_realized}/{goal.equipment_target} ({goal.progress.equipmentPercent}%)</small><Progress value={goal.progress.equipmentPercent} />
          <small>Faturamento: {money(goal.revenue_realized)} / {money(goal.revenue_target)} ({goal.progress.revenuePercent}%)</small><Progress value={goal.progress.revenuePercent} color="#16a34a" />
          <small>Percentual atingido: <b>{goal.progress.percent}%</b></small>{goal.notes && <small>{goal.notes}</small>}
        </article>)}</div>}
      </section>
    </>}

    {activeTab === "Compras" && <>
      {capabilities.can_manage_financials && <section className="card"><h2 className="card-title">Registrar compra</h2>
        <div className="form-grid">
          <FormField label="Data" type="date" value={purchaseForm.purchase_date} onChange={(purchase_date) => setPurchaseForm((current) => ({ ...current, purchase_date }))} />
          <FormSelect label="Tipo" value={purchaseForm.item_type} onChange={(item_type) => setPurchaseForm((current) => ({ ...current, item_type, product_id: "", item_name: "", unit_price: "0" }))}><option value="equipamento">Equipamento</option><option value="produto">Produto</option></FormSelect>
          {purchaseForm.item_type === "equipamento" ? (
            <FormSelect label="Equipamento" value={purchaseForm.item_name} onChange={(item_name) => setPurchaseForm((current) => ({ ...current, product_id: "", item_name }))}>
              <option value="">Selecione</option>
              {EQUIPMENT_CATALOG.map((equipment) => <option key={equipment} value={equipment}>{equipment}</option>)}
            </FormSelect>
          ) : (
            <FormSelect label="Produto" value={purchaseForm.product_id} onChange={(product_id) => {
              const product = products.find((item) => item.id === product_id);
              setPurchaseForm((current) => ({
                ...current,
                product_id,
                item_name: product?.name || "",
                unit_price: product ? String(product.sale_price ?? 0) : "0",
              }));
            }}>
              <option value="">Selecione</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` • ${product.sku}` : ""}</option>)}
            </FormSelect>
          )}
          <FormField label="Quantidade" type="number" min="1" step="1" value={purchaseForm.quantity} onChange={(quantity) => setPurchaseForm((current) => ({ ...current, quantity }))} />
          <FormField label="Valor unitário" type="number" min="0" step="0.01" value={purchaseForm.unit_price} onChange={(unit_price) => setPurchaseForm((current) => ({ ...current, unit_price }))} />
          <FormField label="Frete" type="number" min="0" step="0.01" value={purchaseForm.shipping_value} onChange={(shipping_value) => setPurchaseForm((current) => ({ ...current, shipping_value }))} />
          <FormField label="Quantidade de parcelas" type="number" min="1" step="1" value={purchaseForm.installment_count} onChange={(installment_count) => setPurchaseForm((current) => ({ ...current, installment_count }))} />
          <FormField label="Primeiro vencimento" type="date" value={purchaseForm.first_due_date} onChange={(first_due_date) => setPurchaseForm((current) => ({ ...current, first_due_date }))} />
          <FormSelect label="Status" value={purchaseForm.status} onChange={(status) => setPurchaseForm((current) => ({ ...current, status }))}><option value="pendente">Pendente</option><option value="confirmada">Confirmada</option><option value="concluida">Concluída</option></FormSelect>
          <FormSelect label="Forma de pagamento" value={purchaseForm.payment_terms} onChange={(payment_terms) => setPurchaseForm((current) => ({ ...current, payment_terms }))}>
            <option value="">Selecione</option>
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
            <option value="transferencia">Transferência</option>
            <option value="cartao">Cartão</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="a_combinar">A combinar</option>
          </FormSelect>
          <div className="field"><label>Valor total</label><div className="input representative-readonly">{money(purchasePreview)}</div></div>
          <FormArea label="Observações" value={purchaseForm.notes} onChange={(notes) => setPurchaseForm((current) => ({ ...current, notes }))} />
        </div>
        <div className="form-actions"><button className="btn btn-green" disabled={saving || !purchaseForm.item_name || !purchaseForm.payment_terms} onClick={async () => { if (await submit("purchase", purchaseForm, "Compra e parcelas registradas com sucesso.")) setPurchaseForm((current) => ({ ...current, product_id: "", item_name: "", quantity: "1", unit_price: "0", shipping_value: "0", payment_terms: "", notes: "" })); }}>Registrar compra</button></div>
      </section>}
      <section className="card" style={{ marginTop: capabilities.can_manage_financials ? 24 : 0 }}><h2 className="card-title">Histórico de compras</h2>
        {data.purchases.length === 0 ? <p className="muted">Nenhuma compra registrada.</p> : <div className="product-list-grid">{data.purchases.map((purchase) => <article className="stat-card user-card" key={purchase.id}><strong>{purchase.item_name}</strong><small>{dateLabel(purchase.purchase_date)} • {purchase.quantity} × {money(purchase.unit_price)}</small><small>Subtotal: {money(purchase.subtotal)} • Frete: {money(purchase.shipping_value)}</small><small>Total: <b>{money(purchase.total_value)}</b></small><small>Pagamento: {purchase.payment_terms ? statusLabel(purchase.payment_terms) : "-"}</small><small>Status: {statusLabel(purchase.status)}</small>{purchase.notes && <small>{purchase.notes}</small>}</article>)}</div>}
      </section>
    </>}

    {activeTab === "Financeiro" && <>
      <div className="reports-grid representative-summary-grid"><SummaryCard label="A receber" value={money(summary.total_receivable)} tone="#facc15" /><SummaryCard label="Vencido" value={money(summary.total_overdue)} tone="#f87171" /><SummaryCard label="Recebido no mês" value={money(summary.received_this_month)} tone="#4ade80" /><SummaryCard label="Total comprado" value={money(summary.total_purchased)} /><SummaryCard label="Total recebido" value={money(summary.total_received)} /></div>
      {capabilities.can_manage_financials && <section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Registrar recebimento</h2>
        <div className="form-grid">
          <FormSelect label="Parcela" value={paymentForm.receivable_id} onChange={(receivable_id) => setPaymentForm((current) => ({ ...current, receivable_id }))}><option value="">Selecione</option>{openReceivables.map((item) => <option key={item.id} value={item.id}>{item.purchase?.item_name} • Parcela {item.installment_number} • Saldo {money(item.remaining_amount)}</option>)}</FormSelect>
          <FormField label="Data do pagamento" type="date" value={paymentForm.payment_date} onChange={(payment_date) => setPaymentForm((current) => ({ ...current, payment_date }))} />
          <FormField label="Valor recebido" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(amount) => setPaymentForm((current) => ({ ...current, amount }))} />
          <FormSelect label="Forma de pagamento" value={paymentForm.payment_method} onChange={(payment_method) => setPaymentForm((current) => ({ ...current, payment_method }))}><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></FormSelect>
          <FormArea label="Observações" value={paymentForm.notes} onChange={(notes) => setPaymentForm((current) => ({ ...current, notes }))} />
        </div><div className="form-actions"><button className="btn btn-green" disabled={saving || !paymentForm.receivable_id} onClick={async () => { if (await submit("payment", paymentForm, "Recebimento registrado com sucesso.")) setPaymentForm((current) => ({ ...current, receivable_id: "", amount: "", notes: "" })); }}>Registrar recebimento</button></div>
      </section>}
      <section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Parcelas e vencimentos</h2>{data.receivables.length === 0 ? <p className="muted">Nenhuma parcela registrada.</p> : <div className="product-list-grid">{data.receivables.map((item) => <article className="stat-card user-card" key={item.id}><strong>{item.purchase?.item_name || "Compra"} • Parcela {item.installment_number}</strong><small>Vencimento: {dateLabel(item.due_date)}</small><small>Original: {money(item.original_amount)} • Recebido: {money(item.received_amount)}</small><small>Saldo: <b>{money(item.remaining_amount)}</b></small><small>Status: <b className={`status-${item.effective_status}`}>{statusLabel(item.effective_status)}</b></small></article>)}</div>}</section>
      <section className="card" style={{ marginTop: 24 }}><h2 className="card-title">Histórico de pagamentos</h2>{data.payments.length === 0 ? <p className="muted">Nenhum pagamento registrado.</p> : <div className="product-list-grid">{data.payments.map((payment) => <article className="stat-card user-card" key={payment.id}><strong>{money(payment.amount)}</strong><small>{dateLabel(payment.payment_date)} • {statusLabel(payment.payment_method)}</small>{payment.notes && <small>{payment.notes}</small>}</article>)}</div>}</section>
    </>}

    {activeTab === "Cobranças" && <>
      {capabilities.can_record_collection && <section className="card"><h2 className="card-title">Registrar cobrança ou acompanhamento</h2>
        <div className="form-grid">
          <FormSelect label="Parcela relacionada" value={collectionForm.receivable_id} onChange={(receivable_id) => setCollectionForm((current) => ({ ...current, receivable_id }))}><option value="">Sem parcela específica</option>{data.receivables.map((item) => <option key={item.id} value={item.id}>{item.purchase?.item_name} • Parcela {item.installment_number} • {statusLabel(item.effective_status)}</option>)}</FormSelect>
          <FormField label="Data do contato" type="datetime-local" value={collectionForm.contact_date} onChange={(contact_date) => setCollectionForm((current) => ({ ...current, contact_date }))} />
          <FormSelect label="Tipo" value={collectionForm.contact_type} onChange={(contact_type) => setCollectionForm((current) => ({ ...current, contact_type }))}><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="outro">Outro</option></FormSelect>
          <FormField label="Promessa de pagamento" value={collectionForm.payment_promise} onChange={(payment_promise) => setCollectionForm((current) => ({ ...current, payment_promise }))} />
          <FormField label="Data prometida" type="date" value={collectionForm.promised_date} onChange={(promised_date) => setCollectionForm((current) => ({ ...current, promised_date }))} />
          <FormField label="Próxima cobrança" type="datetime-local" value={collectionForm.next_contact_at} onChange={(next_contact_at) => setCollectionForm((current) => ({ ...current, next_contact_at }))} />
          <FormArea label="Observação" value={collectionForm.notes} onChange={(notes) => setCollectionForm((current) => ({ ...current, notes }))} />
        </div><div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={async () => { if (await submit("collection", collectionForm, "Cobrança registrada com sucesso.")) setCollectionForm((current) => ({ ...current, notes: "", payment_promise: "", promised_date: "", next_contact_at: "" })); }}>Registrar cobrança</button></div>
      </section>}
      <section className="card" style={{ marginTop: capabilities.can_record_collection ? 24 : 0 }}><h2 className="card-title">Histórico permanente</h2>{data.collections.length === 0 ? <p className="muted">Nenhuma cobrança registrada.</p> : <div className="product-list-grid">{data.collections.map((collection) => <article className="stat-card user-card" key={collection.id}><strong>{statusLabel(collection.contact_type)} • {dateTimeLabel(collection.contact_date)}</strong><small>{collection.notes}</small>{collection.payment_promise && <small>Promessa: {collection.payment_promise}</small>}{collection.promised_date && <small>Data prometida: {dateLabel(collection.promised_date)}</small>}{collection.next_contact_at && <small>Próximo retorno: {dateTimeLabel(collection.next_contact_at)}</small>}<small>Registrado por: {collection.creator?.name || "Usuário"}</small></article>)}</div>}</section>
    </>}

    {activeTab === "Contratos" && <>
      {capabilities.can_manage_financials && <section className="card"><h2 className="card-title">Cadastrar contrato</h2><div className="form-grid">
        <FormField label="Número" value={contractForm.contract_number} onChange={(contract_number) => setContractForm((current) => ({ ...current, contract_number }))} />
        <FormField label="Tipo" value={contractForm.contract_type} onChange={(contract_type) => setContractForm((current) => ({ ...current, contract_type }))} />
        <FormField label="Início" type="date" value={contractForm.start_date} onChange={(start_date) => setContractForm((current) => ({ ...current, start_date }))} />
        <FormField label="Vencimento" type="date" value={contractForm.end_date} onChange={(end_date) => setContractForm((current) => ({ ...current, end_date }))} />
        <FormField label="Região" value={contractForm.region} onChange={(region) => setContractForm((current) => ({ ...current, region }))} />
        <FormSelect label="Status" value={contractForm.status} onChange={(status) => setContractForm((current) => ({ ...current, status }))}><option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="vencido">Vencido</option><option value="encerrado">Encerrado</option></FormSelect>
        <label className="check-row"><input type="checkbox" checked={contractForm.exclusive} onChange={(event) => setContractForm((current) => ({ ...current, exclusive: event.target.checked }))} /> Exclusividade</label>
        <div className="field">
          <label>Contrato em PDF</label>
          <label className="btn btn-blue" style={{ width: "fit-content", cursor: "pointer" }}>
            {contractPdf ? "Trocar PDF selecionado" : "Selecionar PDF"}
            <input key={contractPdf ? `${contractPdf.name}-${contractPdf.size}` : "contract-empty"} hidden type="file" accept=".pdf,application/pdf" onChange={(event) => choosePdf(event.target.files?.[0], setContractPdf)} />
          </label>
          {contractPdf && <small>Selecionado: <b>{contractPdf.name}</b></small>}
        </div>
        <FormArea label="Observações" value={contractForm.notes} onChange={(notes) => setContractForm((current) => ({ ...current, notes }))} />
      </div><div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={async () => {
        const payload = await submit("contract", contractForm, contractPdf ? "Contrato cadastrado. Salvando PDF..." : "Contrato cadastrado com sucesso.");
        if (!payload?.contract?.id) return;
        if (contractPdf) {
          const attached = await uploadFile("contract", payload.contract.id, "pdf", contractPdf);
          if (!attached) return;
          setMessage("Contrato cadastrado e PDF anexado com sucesso.");
        }
        setContractForm((current) => ({ ...current, contract_number: "", notes: "" }));
        setContractPdf(null);
      }}>Cadastrar contrato</button></div></section>}
      <section className="card" style={{ marginTop: capabilities.can_manage_financials ? 24 : 0 }}><h2 className="card-title">Contratos</h2>{data.contracts.length === 0 ? <p className="muted">Nenhum contrato cadastrado.</p> : <div className="product-list-grid">{data.contracts.map((contract) => <article className="stat-card user-card" key={contract.id}><strong>{contract.contract_number} • {contract.contract_type}</strong><small>{dateLabel(contract.start_date)} a {dateLabel(contract.end_date)}</small><small>Região: {contract.region || "-"} • Exclusividade: {contract.exclusive ? "Sim" : "Não"}</small><small>Status: {statusLabel(contract.effective_status || contract.status)}</small>{contract.file_name && <small>PDF: <b>{contract.file_name}</b></small>}<div className="form-actions representative-inline-actions">{capabilities.can_manage_financials && <label className="btn btn-blue">{contract.file_name ? "Trocar contrato" : "Anexar contrato"}<input hidden type="file" accept=".pdf,application/pdf" onChange={(event) => uploadFile("contract", contract.id, "pdf", event.target.files?.[0])} /></label>}{contract.file_name && <button className="btn btn-gray" onClick={() => window.open(`${endpoint}/contracts/${contract.id}/file`, "_blank", "noopener,noreferrer")}>Visualizar contrato</button>}</div></article>)}</div>}</section>
    </>}

    {activeTab === "Notas Fiscais" && <>
      {capabilities.can_manage_financials && <section className="card"><h2 className="card-title">Cadastrar nota fiscal</h2><div className="form-grid">
        <FormField label="Número da NF" value={invoiceForm.invoice_number} onChange={(invoice_number) => setInvoiceForm((current) => ({ ...current, invoice_number }))} />
        <FormField label="Data de emissão" type="date" value={invoiceForm.issued_at} onChange={(issued_at) => setInvoiceForm((current) => ({ ...current, issued_at }))} />
        <FormField label="Valor" type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={(amount) => setInvoiceForm((current) => ({ ...current, amount }))} />
        <FormSelect label="Compra relacionada" value={invoiceForm.purchase_id} onChange={(purchase_id) => setInvoiceForm((current) => ({ ...current, purchase_id }))}><option value="">Sem compra vinculada</option>{data.purchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{dateLabel(purchase.purchase_date)} • {purchase.item_name} • {money(purchase.total_value)}</option>)}</FormSelect>
        <div className="field">
          <label>Nota fiscal em PDF</label>
          <label className="btn btn-blue" style={{ width: "fit-content", cursor: "pointer" }}>
            {invoicePdf ? "Trocar PDF selecionado" : "Selecionar PDF"}
            <input key={invoicePdf ? `${invoicePdf.name}-${invoicePdf.size}` : "invoice-empty"} hidden type="file" accept=".pdf,application/pdf" onChange={(event) => choosePdf(event.target.files?.[0], setInvoicePdf)} />
          </label>
          {invoicePdf && <small>Selecionado: <b>{invoicePdf.name}</b></small>}
        </div>
        <FormArea label="Observações" value={invoiceForm.notes} onChange={(notes) => setInvoiceForm((current) => ({ ...current, notes }))} />
      </div><div className="form-actions"><button className="btn btn-green" disabled={saving} onClick={async () => {
        const payload = await submit("invoice", invoiceForm, invoicePdf ? "Nota fiscal cadastrada. Salvando PDF..." : "Nota fiscal cadastrada com sucesso.");
        if (!payload?.invoice?.id) return;
        if (invoicePdf) {
          const attached = await uploadFile("invoice", payload.invoice.id, "pdf", invoicePdf);
          if (!attached) return;
          setMessage("Nota fiscal cadastrada e PDF anexado com sucesso.");
        }
        setInvoiceForm((current) => ({ ...current, invoice_number: "", amount: "0", notes: "" }));
        setInvoicePdf(null);
      }}>Cadastrar NF</button></div></section>}
      <section className="card" style={{ marginTop: capabilities.can_manage_financials ? 24 : 0 }}><h2 className="card-title">Histórico fiscal</h2>{data.invoices.length === 0 ? <p className="muted">Nenhuma nota fiscal cadastrada.</p> : <div className="product-list-grid">{data.invoices.map((invoice) => <article className="stat-card user-card" key={invoice.id}><strong>NF {invoice.invoice_number}</strong><small>Emissão: {dateLabel(invoice.issued_at)} • Valor: {money(invoice.amount)}</small>{invoice.notes && <small>{invoice.notes}</small>}{invoice.pdf_file_name && <small>PDF: <b>{invoice.pdf_file_name}</b></small>}{invoice.xml_file_name && <small>XML: <b>{invoice.xml_file_name}</b></small>}<div className="form-actions representative-inline-actions">{capabilities.can_manage_financials && <><label className="btn btn-blue">{invoice.pdf_file_name ? "Trocar PDF" : "Anexar PDF"}<input hidden type="file" accept=".pdf,application/pdf" onChange={(event) => uploadFile("invoice", invoice.id, "pdf", event.target.files?.[0])} /></label><label className="btn btn-blue">{invoice.xml_file_name ? "Trocar XML" : "Anexar XML"}<input hidden type="file" accept=".xml,application/xml,text/xml" onChange={(event) => uploadFile("invoice", invoice.id, "xml", event.target.files?.[0])} /></label></>}{invoice.pdf_file_name && <button className="btn btn-gray" onClick={() => window.open(`${endpoint}/invoices/${invoice.id}/file?kind=pdf`, "_blank", "noopener,noreferrer")}>Visualizar PDF</button>}{invoice.xml_file_name && <button className="btn btn-gray" onClick={() => window.open(`${endpoint}/invoices/${invoice.id}/file?kind=xml`, "_blank", "noopener,noreferrer")}>Baixar XML</button>}</div></article>)}</div>}</section>
    </>}
  </>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  canWriteWeeklyReport, currentWeeklyReportPeriod, MAX_WEEKLY_REPORT_LENGTH, weeklyReportPeriod,
} from "@/lib/weekly-report-policy";

type Profile = { id: string; name: string; role: string };
type Report = {
  id: string; author_id: string; author_name: string; author_role: string;
  week_start: string; week_end: string; content: string;
  status: "draft" | "submitted"; submitted_at: string | null; updated_at: string;
};
const roleLabel: Record<string, string> = {
  gerente: "Gerente / Supervisor", vendedor: "Vendedor", representante: "Representante",
};
const dateOnly = (value: string) => value.slice(0, 10);
const dateLabel = (value: string) => dateOnly(value).split("-").reverse().join("/");
const dateTimeLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function WeeklyReports({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "administrador";
  const canWrite = canWriteWeeklyReport(profile.role);
  const [reports, setReports] = useState<Report[]>([]);
  const [weekStart, setWeekStart] = useState(() => currentWeeklyReportPeriod().weekStart);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "submitted" | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [filterWeek, setFilterWeek] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const weekRef = useRef(weekStart);
  const period = weeklyReportPeriod(weekStart);
  const currentReport = reports.find((report) =>
    report.author_id === profile.id && dateOnly(report.week_start) === weekStart);
  const submitted = currentReport?.status === "submitted";

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/weekly-reports", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao carregar relatórios.");
      const rows: Report[] = Array.isArray(data.reports) ? data.reports : [];
      setReports(rows);
      if (!dirtyRef.current) {
        const draft = rows.find((report) =>
          report.author_id === profile.id && dateOnly(report.week_start) === weekRef.current);
        setContent(draft?.content || "");
      }
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Erro ao carregar relatórios.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [profile.id]);

  function selectWeek(value: string) {
    if (!value) return;
    const next = weeklyReportPeriod(value).weekStart;
    const existing = reports.find((report) =>
      report.author_id === profile.id && dateOnly(report.week_start) === next);
    weekRef.current = next;
    dirtyRef.current = false;
    setWeekStart(next);
    setContent(existing?.content || "");
    setMessage("");
  }

  async function save(status: "draft" | "submitted") {
    if (savingRef.current || submitted) return;
    if (status === "submitted" && !content.trim()) {
      setMessage("Escreva o relatório antes de enviar ao ADM.");
      return;
    }
    savingRef.current = true;
    setSaving(status);
    setMessage("");
    try {
      const response = await fetch("/api/weekly-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, content, status }),
      });
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao salvar relatório.");
      const saved: Report = data.report;
      setReports((current) =>
        [saved, ...current.filter((report) => report.id !== saved.id)]
          .sort((a, b) => b.week_start.localeCompare(a.week_start)));
      setContent(saved.content);
      dirtyRef.current = false;
      setMessage(status === "submitted" ? "Relatório enviado ao ADM." : "Rascunho salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar relatório.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  const authors = Array.from(new Map(reports.map((report) =>
    [report.author_id, report.author_name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const visibleReports = reports.filter((report) =>
    (!filterWeek || dateOnly(report.week_start) === filterWeek) &&
    (!filterAuthor || report.author_id === filterAuthor));

  return <>
    {canWrite && <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="card-title">Meu relatório semanal</h2>
      <p className="muted">Registre as atividades, resultados, dificuldades e próximos passos da semana.</p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="weekly-report-week">Semana</label>
          <input id="weekly-report-week" className="input" type="date" value={weekStart}
            disabled={loading || Boolean(saving)} onChange={(event) => selectWeek(event.target.value)} />
          <small style={{ color: "#94a3b8" }}>{dateLabel(period.weekStart)} a {dateLabel(period.weekEnd)}</small>
        </div>
        <div className="field">
          <label>Autor</label>
          <p style={{ margin: "10px 0" }}>{profile.name} • {roleLabel[profile.role] || profile.role}</p>
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="weekly-report-content">Relatório escrito</label>
        <textarea id="weekly-report-content" className="input" rows={10}
          style={{ resize: "vertical", minHeight: 220 }} maxLength={MAX_WEEKLY_REPORT_LENGTH}
          placeholder={"Conte como foi sua semana: atendimentos e visitas realizados, negociações, resultados, dificuldades e o que pretende fazer na próxima semana."}
          value={content} disabled={loading || Boolean(saving) || submitted}
          onChange={(event) => { dirtyRef.current = true; setContent(event.target.value); }} />
        <small style={{ color: "#94a3b8", marginTop: 6 }}>{content.length.toLocaleString("pt-BR")} / 20.000 caracteres</small>
      </div>
      {submitted ? <p style={{ color: "#4ade80" }}>Relatório enviado ao ADM. Você pode consultá-lo no histórico abaixo.</p> :
        <div className="form-actions">
          <button type="button" className="btn btn-gray" disabled={loading || Boolean(saving)}
            onClick={() => save("draft")}>{saving === "draft" ? "Salvando..." : "Salvar rascunho"}</button>
          <button type="button" className="btn btn-green" disabled={loading || Boolean(saving) || !content.trim()}
            onClick={() => save("submitted")}>{saving === "submitted" ? "Enviando..." : "Enviar relatório ao ADM"}</button>
        </div>}
      {message && <p role="status" style={{ marginTop: 16 }}>{message}</p>}
    </section>}

    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="card-title">{isAdmin ? "Relatórios semanais recebidos" : "Meus relatórios semanais"}</h2>
      <p className="muted">{isAdmin ? "Consulte os relatos enviados pela equipe, com autor, semana e data de envio." : "Consulte os relatórios enviados e continue os seus rascunhos."}</p>
      <div className="form-grid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label htmlFor="weekly-report-filter-week">Filtrar semana</label>
          <input id="weekly-report-filter-week" className="input" type="date" value={filterWeek}
            onChange={(event) => setFilterWeek(event.target.value ? weeklyReportPeriod(event.target.value).weekStart : "")} />
        </div>
        {isAdmin && <div className="field">
          <label htmlFor="weekly-report-filter-author">Responsável</label>
          <select id="weekly-report-filter-author" className="input" value={filterAuthor}
            onChange={(event) => setFilterAuthor(event.target.value)}>
            <option value="">Todos os responsáveis</option>
            {authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>}
        <div className="field">
          <label>&nbsp;</label>
          <button type="button" className="btn btn-gray"
            onClick={() => { setFilterWeek(""); setFilterAuthor(""); }}>Limpar filtros</button>
        </div>
      </div>
      {loading && <p role="status">Carregando relatórios...</p>}
      {loadError && <div role="alert"><p>{loadError}</p><button type="button" className="btn btn-gray" onClick={() => load()}>Tentar novamente</button></div>}
      {!loading && !loadError && visibleReports.length === 0 && <p className="muted">Nenhum relatório encontrado.</p>}
      <div style={{ display: "grid", gap: 14 }}>
        {visibleReports.map((report) => <details key={report.id} style={{ border: "1px solid #334155", borderRadius: 14, padding: 16 }}>
          <summary style={{ cursor: "pointer", lineHeight: 1.7 }}>
            <strong>{report.author_name}</strong> • {dateLabel(report.week_start)} a {dateLabel(report.week_end)}
            <span style={{ color: report.status === "submitted" ? "#4ade80" : "#facc15", marginLeft: 12 }}>
              {report.status === "submitted" ? "Enviado" : "Rascunho"}
            </span>
          </summary>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>
            {roleLabel[report.author_role] || report.author_role}
            {report.submitted_at ? " • Enviado em " + dateTimeLabel(report.submitted_at) : " • Atualizado em " + dateTimeLabel(report.updated_at)}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>
            {report.content || "Rascunho ainda sem texto."}
          </p>
          {report.status === "draft" && report.author_id === profile.id &&
            <button type="button" className="btn btn-blue" disabled={Boolean(saving)}
              onClick={() => selectWeek(dateOnly(report.week_start))}>Continuar rascunho</button>}
        </details>)}
      </div>
      <small style={{ display: "block", color: "#94a3b8", marginTop: 16 }}>Histórico dos últimos 200 relatórios.</small>
    </section>
  </>;
}


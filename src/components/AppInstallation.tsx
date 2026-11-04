"use client";

import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function AppInstallation() {
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    update();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const offered = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const completed = () => { setInstalled(true); setPrompt(null); dialog.current?.close(); };
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", completed);
    media.addEventListener("change", update);
    return () => { window.removeEventListener("beforeinstallprompt", offered); window.removeEventListener("appinstalled", completed); media.removeEventListener("change", update); };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    setBusy(true); setMessage("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      if (choice.outcome === "accepted") { setInstalled(true); dialog.current?.close(); }
    } catch { setPrompt(null); setMessage("Use o menu do navegador para adicionar o StockPro à tela inicial."); }
    finally { setBusy(false); }
  }

  if (installed) return null;
  return <div className="app-installation no-print">
    <button type="button" className="app-install-trigger" aria-haspopup="dialog" aria-controls="stockpro-installation" onClick={() => dialog.current?.showModal()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" /></svg>Instalar app
    </button>
    <dialog ref={dialog} id="stockpro-installation" className="app-install-dialog" aria-labelledby="stockpro-install-title">
      <div className="app-install-heading"><h2 id="stockpro-install-title">Instalar StockPro Vogel</h2><button type="button" aria-label="Fechar orientação de instalação" className="app-install-close" onClick={() => dialog.current?.close()}>×</button></div>
      <p>Tenha o StockPro na tela inicial do seu aparelho.</p>
      {prompt && <button type="button" className="btn btn-blue" disabled={busy} onClick={() => void install()}>{busy ? "Aguarde…" : "Instalar neste aparelho"}</button>}
      {ios ? <ol><li>Abra este site no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> no menu do navegador.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Se aparecer, mantenha <strong>Abrir como App da Web</strong> ativado e toque em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra este site no <strong>Chrome</strong> ou <strong>Edge</strong>.</li><li>No menu do navegador, procure <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação e abra pelo ícone do <strong>Grupo Vogel</strong>.</li></ol>}
      <p className="app-install-note">Use o mesmo login e senha do site. Para consultar sem internet, abra Consulta offline e prepare os dados neste aparelho enquanto estiver conectado. Alterações e notificações ainda precisam de internet.</p>
      {message && <p role="status">{message}</p>}
      <a className="app-install-preview" href="/abrir">Ver apresentação de abertura →</a>
    </dialog>
  </div>;
}

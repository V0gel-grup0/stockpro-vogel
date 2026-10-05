"use client";

import { useEffect, useRef, useState } from "react";
import { mobilePageLabel, mobileTabs } from "@/lib/mobile-navigation";

export function AppIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Dashboard: "M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9",
    CRM: "M4 4h16v12H9l-5 4V4M8 8h8M8 12h5",
    Pedidos: "M7 3h10v3H7V3M7 5H4v16h16V5h-3M8 11h8M8 15h6",
    Produtos: "m3 7 9-4 9 4v10l-9 4-9-4V7m0 0 9 4 9-4M12 11v10",
    Montagens: "m14 5 5-2 2 5-4 4-3-3-9 9-3-3 9-9-3-3 3-3",
    Clientes: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "Meu Perfil": "M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    Relatórios: "M5 3h14v18H5V3M9 8h6M9 12h6M9 16h4",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    close: "m6 6 12 12M6 18 18 6",
    menu: "M4 6h16M4 12h16M4 18h16",
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.Produtos} /></svg>;
}

export default function MobileNavigation({ menus, page, open, onOpen, onClose, onNavigate, name, role, onLogout }: {
  menus: string[]; page: string; open: boolean; onOpen: () => void; onClose: () => void;
  onNavigate: (page: string) => void; name: string; role: string; onLogout: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const tabs = mobileTabs(menus);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editing = document.activeElement?.matches("input, textarea, select");
      setKeyboardOpen(Boolean(editing && window.innerHeight - viewport.height > 150));
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => { viewport.removeEventListener("resize", update); document.removeEventListener("focusin", update); document.removeEventListener("focusout", update); };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = () => { if (!media.matches) onClose(); };
    media.addEventListener("change", resize);
    return () => { document.body.style.overflow = overflow; media.removeEventListener("change", resize); };
  }, [open, onClose]);

  return <>
    <nav className="mobile-tabbar no-print" data-keyboard-open={keyboardOpen ? "true" : "false"} aria-label="Navegação principal no celular">
      {tabs.map((item) => <button key={item} type="button" aria-current={page === item ? "page" : undefined} className={page === item && !open ? "active" : ""} onClick={() => onNavigate(item)}><AppIcon name={item} /><span>{mobilePageLabel(item)}</span></button>)}
      <button type="button" className={open || !tabs.includes(page) ? "active" : ""} aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-module-menu" onClick={onOpen}><AppIcon name="menu" /><span>Menu</span></button>
    </nav>
    <dialog ref={dialog} id="mobile-module-menu" className="mobile-module-menu no-print" aria-labelledby="mobile-menu-title" onCancel={onClose} onClose={() => { if (open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
      <div className="mobile-menu-heading"><div><small>STOCKPRO VOGEL</small><h2 id="mobile-menu-title">Seu espaço de trabalho</h2></div><button type="button" className="mobile-icon-control" aria-label="Fechar menu" onClick={onClose} autoFocus><AppIcon name="close" /></button></div>
      <div className="mobile-menu-account"><span className="mobile-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "V"}</span><div><strong>{name}</strong><small>{role}</small></div></div>
      <nav className="mobile-module-grid" aria-label="Todos os módulos">{menus.map((item) => <button key={item} type="button" aria-current={page === item ? "page" : undefined} className={page === item ? "active" : ""} onClick={() => onNavigate(item)}><AppIcon name={item} /><span>{item === "Dashboard" ? "Início" : item}</span></button>)}</nav>
      <button type="button" className="mobile-logout" onClick={onLogout}>Sair da conta</button>
    </dialog>
  </>;
}

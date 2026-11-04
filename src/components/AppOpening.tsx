"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppOpening() {
  const router = useRouter();
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => router.replace("/login"), reduced ? 600 : 2200);
    return () => window.clearTimeout(timer);
  }, [router]);
  return <main className="app-opening" aria-label="Boas-vindas ao StockPro Vogel">
    <div className="app-opening-glow" aria-hidden="true" />
    <div className="app-opening-content">
      <div className="app-opening-logo"><img src="/logo-vogel.png" alt="Grupo Vogel" width={280} height={280} fetchPriority="high" /></div>
      <p className="app-opening-eyebrow">GRUPO VOGEL</p>
      <h1>StockPro <span>Vogel</span></h1>
      <p className="app-opening-description">Sua operação, conectada.</p>
      <div className="app-opening-progress" aria-hidden="true"><span /></div>
      <p className="app-opening-status" role="status">Abrindo a tela de acesso…</p>
      <a href="/login" className="app-opening-skip">Entrar agora <span aria-hidden="true">→</span></a>
    </div>
  </main>;
}

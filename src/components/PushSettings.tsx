"use client";

import { useEffect, useState } from "react";

function applicationKey(value: string) {
  const bytes = atob(value.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-value.length%4)%4));
  return Uint8Array.from(bytes, char=>char.charCodeAt(0));
}
export default function PushSettings() {
  const [config,setConfig]=useState<{configured:boolean;publicKey:string;enabled:boolean}|null>(null);
  const [supported,setSupported]=useState(false);
  const [iosInstall,setIosInstall]=useState(false);
  const [permission,setPermission]=useState<NotificationPermission>("default");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Carregando configurações…");
  const [login,setLogin]=useState(false);
  useEffect(()=>{
    let active=true;
    const support="Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(support); if(support)setPermission(Notification.permission);
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    setIosInstall(ios&&!window.matchMedia("(display-mode: standalone)").matches&&!(navigator as Navigator&{standalone?:boolean}).standalone);
    fetch("/api/push",{cache:"no-store"}).then(async response=>{
      const data=await response.json(); if(!active)return;
      if(!response.ok){setLogin(response.status===401);setMessage(data.erro||"Não foi possível carregar as configurações.");return;}
      setConfig(data);setMessage(data.configured?"Escolha se deseja receber avisos neste aparelho.":"As notificações estão sendo configuradas. Tente novamente mais tarde.");
    }).catch(()=>{if(active)setMessage("Conecte-se à internet para configurar as notificações.");});
    return()=>{active=false;};
  },[]);
  async function enable() {
    if(busy||!config?.publicKey||!supported)return;
    setBusy(true);
    try {
      const result=await Notification.requestPermission();setPermission(result);
      if(result!=="granted"){setMessage("O navegador não autorizou os avisos. Você pode permitir nas configurações deste site.");return;}
      await navigator.serviceWorker.register("/stockpro-sw.js");
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(config.publicKey)});
      const response=await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription.toJSON())});
      const data=await response.json();if(!response.ok)throw Error(data.erro||"Não foi possível ativar.");
      setConfig({...config,enabled:true});setMessage("Notificações ativadas neste aparelho. Toque em Testar notificação para conferir.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível ativar as notificações.");}
    finally{setBusy(false);}
  }
  async function disable() {
    if(busy)return;setBusy(true);
    try {
      const registration=await navigator.serviceWorker.getRegistration("/");
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription&&!(await subscription.unsubscribe()))throw Error("O navegador não confirmou a desativação. Tente novamente.");
      await fetch("/api/push",{method:"DELETE"});
      if(config)setConfig({...config,enabled:false});setMessage("Notificações desativadas neste aparelho.");
    }catch{setMessage("Não foi possível concluir a desativação. Verifique a conexão e tente novamente.");}
    finally{setBusy(false);}
  }
  async function test() {
    if(busy)return;setBusy(true);
    try{const response=await fetch("/api/push/test",{method:"POST"});const data=await response.json();if(!response.ok)throw Error(data.erro||"Não foi possível testar.");setMessage("Teste enviado ao serviço de notificações. Confira se o aviso chegou neste aparelho.");}
    catch(error){setMessage(error instanceof Error?error.message:"Não foi possível testar.");}finally{setBusy(false);}
  }
  const enabled=config?.enabled&&permission==="granted";
  return <main className="push-page">
    <a href="/" className="push-back">← Voltar ao sistema</a>
    <div className="push-page-heading"><span className="push-eyebrow">STOCKPRO VOGEL</span><h1>Seus avisos, no seu aparelho.</h1><p>Acompanhe os prazos da operação mesmo quando o app estiver fechado.</p></div>
    <section className="push-card" aria-labelledby="push-settings-title">
      <div className="push-card-heading"><div><h2 id="push-settings-title">Notificações</h2><p>Ativação individual para cada celular ou computador.</p></div><span className={`push-state ${enabled?"enabled":""}`}>{enabled?"Ativadas":"Desativadas"}</span></div>
      <ul className="push-features"><li><strong>CRM comercial</strong><span>Atividades atrasadas ou previstas para hoje.</span></li><li><strong>Demandas internas</strong><span>Prazos do CRM geral e tarefas internas.</span></li><li><strong>Montagens</strong><span>Montagens pendentes que você pode acompanhar.</span></li></ul>
      <p className="push-note">Um resumo diário pela manhã, no horário de Brasília, quando houver pendências. Cada pessoa recebe apenas os avisos permitidos pelo seu perfil. Nomes de clientes e valores ficam dentro do sistema.</p>
      {iosInstall&&<p className="push-guidance">No iPhone ou iPad, abra no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone para ativar as notificações.</p>}
      {!supported&&!iosInstall&&<p className="push-guidance">Este navegador não oferece notificações do app. Abra em um navegador compatível ou pelo app instalado.</p>}
      {permission==="denied"&&<p className="push-guidance">As notificações estão bloqueadas. Permita os avisos nas configurações do navegador ou do aparelho e reabra esta tela.</p>}
      <div className="push-actions">
        {!enabled&&<button className="btn btn-blue" type="button" onClick={enable} disabled={busy||!supported||iosInstall||!config?.configured||permission==="denied"}>Ativar neste aparelho</button>}
        {enabled&&<button className="btn btn-blue" type="button" onClick={test} disabled={busy}>Testar notificação</button>}
        {config?.enabled&&<button className="btn btn-gray" type="button" onClick={disable} disabled={busy}>Desativar neste aparelho</button>}
        {login&&<a className="btn btn-blue" href="/login">Entrar na minha conta</a>}
      </div>
      <p className="push-message" role="status" aria-live="polite">{busy?"Aguarde…":message}</p>
    </section>
    <p className="push-footnote">A entrega depende da conexão, da permissão e das configurações do aparelho. Ao sair da conta, este aparelho deixa de receber novos avisos. Para outra conta, ative novamente.</p>
  </main>;
}

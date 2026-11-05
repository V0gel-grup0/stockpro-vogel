// serviceWorker.ready can resolve to an older active worker during an update.
// Confirm the current worker supports push before subscribing or testing.
export async function ensurePushWorker() {
  const registration = await navigator.serviceWorker.register("/stockpro-sw.js", { updateViaCache: "none" });
  await registration.update();
  const worker = registration.installing || registration.waiting;
  if (worker && worker.state !== "activated") await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new Error("A atualização dos avisos demorou. Reabra esta tela com internet e tente novamente.")), 20000);
    const done = (error?: Error) => { clearTimeout(timer); worker.removeEventListener("statechange", change); error ? reject(error) : resolve(); };
    const change = () => { if (worker.state === "activated") done(); else if (worker.state === "redundant") done(new Error("Não foi possível atualizar os avisos. Reabra o app e tente novamente.")); };
    worker.addEventListener("statechange", change); change();
  });
  if (!registration.active) throw new Error("O serviço de notificações ainda não está pronto. Reabra a tela e tente novamente.");
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(new Error("O app ainda está usando uma versão antiga dos avisos. Atualize a página e tente novamente.")), 5000);
    const finish = (error?: Error) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); error ? reject(error) : resolve(); };
    channel.port1.onmessage = event => { if (event.data?.type === "stockpro-push-ready") finish(); };
    registration.active!.postMessage({ type: "stockpro-push-ping" }, [channel.port2]);
  });
  return registration;
}

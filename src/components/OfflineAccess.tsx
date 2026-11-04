"use client";

import { useEffect, useState } from "react";

export default function OfflineAccess() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker.register("/stockpro-sw.js").then(() => navigator.serviceWorker.ready).then(() => { if (active) setReady(true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return ready ? <a className="offline-access no-print" href="/offline.html">Modo offline</a> : null;
}

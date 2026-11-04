export function clearOfflineCopy() {
  try {
    localStorage.removeItem("stockpro-offline-v1");
    localStorage.setItem("stockpro-offline-epoch", `${Date.now()}-${Math.random()}`);
  } catch { /* Storage may be disabled; authentication remains available. */ }
}

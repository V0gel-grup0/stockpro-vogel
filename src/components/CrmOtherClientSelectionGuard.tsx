"use client";

import { useEffect } from "react";

const OTHER_CLIENT_TOKEN = "__crm_other__";
const PROXY_ID = "crm-client-visible-select";

function findFieldByLabel(labelText: string) {
  const form = document.getElementById("crm-opportunity-form");
  if (!form) return null;

  return Array.from(form.querySelectorAll<HTMLElement>(".field")).find((field) => {
    const label = field.querySelector("label")?.textContent?.trim().toLowerCase();
    return label === labelText.trim().toLowerCase();
  }) || null;
}

function findClientField() {
  return findFieldByLabel("Cliente");
}

function findClientSelect() {
  const field = findClientField();
  if (!field) return null;
  return Array.from(field.querySelectorAll("select")).find(
    (select) => select.id !== PROXY_ID
  ) || null;
}

function findStageSelect() {
  const field = findFieldByLabel("Etapa inicial") || findFieldByLabel("Etapa");
  if (!field) return null;
  const select = field.querySelector("select");
  return select instanceof HTMLSelectElement ? select : null;
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
}

function copyClientOptions(source: HTMLSelectElement, proxy: HTMLSelectElement) {
  const current = proxy.value;
  proxy.replaceChildren();

  Array.from(source.options).forEach((option) => {
    if (option.value === OTHER_CLIENT_TOKEN) return;
    if (option.textContent?.trim() === "__CRM_OUTROS__") return;
    const clone = document.createElement("option");
    clone.value = option.value;
    clone.textContent = option.textContent;
    proxy.appendChild(clone);
  });

  const other = document.createElement("option");
  other.value = OTHER_CLIENT_TOKEN;
  other.textContent = "Outros";
  proxy.appendChild(other);

  if (Array.from(proxy.options).some((option) => option.value === current)) {
    proxy.value = current;
  }
}

export default function CrmOtherClientSelectionGuard() {
  useEffect(() => {
    let frame = 0;

    const ensureProxy = () => {
      const field = findClientField();
      const realSelect = findClientSelect();
      const stageSelect = findStageSelect();
      if (!field || !realSelect) return;

      let proxy = field.querySelector<HTMLSelectElement>(`#${PROXY_ID}`);
      if (!proxy) {
        proxy = document.createElement("select");
        proxy.id = PROXY_ID;
        proxy.className = realSelect.className || "input";
        proxy.style.width = "100%";
        realSelect.insertAdjacentElement("afterend", proxy);

        proxy.addEventListener("change", () => {
          const real = findClientSelect();
          const stage = findStageSelect();
          if (!real) return;

          if (proxy!.value === OTHER_CLIENT_TOKEN) {
            if (stage) {
              let otherStage = Array.from(stage.options).find((option) => option.value === "other");
              if (!otherStage) {
                otherStage = document.createElement("option");
                otherStage.value = "other";
                otherStage.textContent = "Outros";
                stage.appendChild(otherStage);
              }
              setNativeSelectValue(stage, "other");
              stage.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return;
          }

          setNativeSelectValue(real, proxy!.value);
          real.dispatchEvent(new Event("change", { bubbles: true }));

          if (stage?.value === "other") {
            setNativeSelectValue(stage, "lead");
            stage.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      }

      copyClientOptions(realSelect, proxy);
      realSelect.style.display = "none";

      if (stageSelect?.value === "other") {
        proxy.value = OTHER_CLIENT_TOKEN;
      } else {
        proxy.value = realSelect.value || "";
      }
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(ensureProxy);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    const onChange = (event: Event) => {
      if (event.target === findStageSelect()) schedule();
    };
    document.addEventListener("change", onChange, true);

    const interval = window.setInterval(ensureProxy, 150);
    ensureProxy();

    return () => {
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

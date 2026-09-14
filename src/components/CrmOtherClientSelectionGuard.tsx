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

function optionsSignature(select: HTMLSelectElement) {
  return Array.from(select.options)
    .filter((option) => option.value !== OTHER_CLIENT_TOKEN)
    .map((option) => `${option.value}:${option.textContent || ""}`)
    .join("|");
}

function syncProxyOptions(source: HTMLSelectElement, proxy: HTMLSelectElement) {
  const signature = optionsSignature(source);
  if (proxy.dataset.sourceSignature === signature) return;

  const desiredValue = proxy.value;
  proxy.replaceChildren();

  Array.from(source.options).forEach((option) => {
    if (option.value === OTHER_CLIENT_TOKEN) return;

    const clone = document.createElement("option");
    clone.value = option.value;
    clone.textContent = option.textContent;
    proxy.appendChild(clone);
  });

  const other = document.createElement("option");
  other.value = OTHER_CLIENT_TOKEN;
  other.textContent = "Outros";
  proxy.appendChild(other);
  proxy.dataset.sourceSignature = signature;

  if (Array.from(proxy.options).some((option) => option.value === desiredValue)) {
    proxy.value = desiredValue;
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

        proxy.addEventListener("change", () => {
          const real = findClientSelect();
          const stage = findStageSelect();
          const visible = document.getElementById(PROXY_ID) as HTMLSelectElement | null;
          if (!real || !visible) return;

          if (visible.value === OTHER_CLIENT_TOKEN) {
            if (stage) {
              if (!Array.from(stage.options).some((option) => option.value === "other")) {
                const option = document.createElement("option");
                option.value = "other";
                option.textContent = "Outros";
                stage.appendChild(option);
              }

              setNativeSelectValue(stage, "other");
              stage.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return;
          }

          setNativeSelectValue(real, visible.value);
          real.dispatchEvent(new Event("change", { bubbles: true }));

          if (stage?.value === "other") {
            setNativeSelectValue(stage, "lead");
            stage.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });

        realSelect.insertAdjacentElement("afterend", proxy);
      }

      syncProxyOptions(realSelect, proxy);

      if (realSelect.style.display !== "none") {
        realSelect.style.display = "none";
      }

      const desiredValue = stageSelect?.value === "other"
        ? OTHER_CLIENT_TOKEN
        : realSelect.value || "";

      if (proxy.value !== desiredValue) {
        proxy.value = desiredValue;
      }
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(ensureProxy);
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (target === findStageSelect() || target === findClientSelect()) {
        schedule();
      }
    };

    document.addEventListener("change", onChange, true);

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ensureProxy();

    return () => {
      document.removeEventListener("change", onChange, true);
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const OTHER_CLIENT_TOKEN = "__crm_other__";

function findSelectByLabel(labelText: string) {
  const form = document.getElementById("crm-opportunity-form");
  if (!form) return null;

  const fields = Array.from(form.querySelectorAll<HTMLElement>(".field"));
  for (const field of fields) {
    const label = field.querySelector("label")?.textContent?.trim().toLowerCase();
    if (label !== labelText.trim().toLowerCase()) continue;
    const select = field.querySelector("select");
    if (select instanceof HTMLSelectElement) return select;
  }

  return null;
}

function findClientSelect() {
  return findSelectByLabel("Cliente");
}

function findStageSelect() {
  return findSelectByLabel("Etapa inicial") || findSelectByLabel("Etapa");
}

function ensureOtherOption(select: HTMLSelectElement) {
  let option = Array.from(select.options).find(
    (item) => item.value === OTHER_CLIENT_TOKEN
  );

  if (!option) {
    option = document.createElement("option");
    option.value = OTHER_CLIENT_TOKEN;
    option.textContent = "Outros";
    select.appendChild(option);
  }

  return option;
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  if (setter) setter.call(select, value);
  else select.value = value;
}

function isClientSelect(element: EventTarget | null) {
  if (!(element instanceof HTMLSelectElement)) return false;
  return element === findClientSelect();
}

function isStageSelect(element: EventTarget | null) {
  if (!(element instanceof HTMLSelectElement)) return false;
  return element === findStageSelect();
}

export default function CrmOtherClientSelectionGuard() {
  useEffect(() => {
    let keepOtherSelected = false;
    let reactSynced = false;
    let frame = 0;
    let resetTimer = 0;

    const sync = () => {
      const clientSelect = findClientSelect();
      const stageSelect = findStageSelect();

      if (!clientSelect) {
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          if (!findClientSelect()) {
            keepOtherSelected = false;
            reactSynced = false;
          }
        }, 250);
        return;
      }

      window.clearTimeout(resetTimer);
      ensureOtherOption(clientSelect);

      if (stageSelect?.value === "other") {
        keepOtherSelected = true;
      }

      if (!keepOtherSelected) return;

      if (clientSelect.value !== OTHER_CLIENT_TOKEN) {
        setNativeSelectValue(clientSelect, OTHER_CLIENT_TOKEN);
      }

      if (!reactSynced) {
        reactSynced = true;
        clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    };

    const onChangeCapture = (event: Event) => {
      const target = event.target;

      if (isClientSelect(target)) {
        const clientSelect = target as HTMLSelectElement;
        keepOtherSelected = clientSelect.value === OTHER_CLIENT_TOKEN;
        reactSynced = true;
        scheduleSync();
        return;
      }

      if (isStageSelect(target)) {
        const stageSelect = target as HTMLSelectElement;
        if (stageSelect.value === "other") {
          keepOtherSelected = true;
          reactSynced = false;
          window.setTimeout(sync, 0);
          scheduleSync();
        }
      }
    };

    document.addEventListener("change", onChangeCapture, true);

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const interval = window.setInterval(sync, 120);
    sync();

    return () => {
      document.removeEventListener("change", onChangeCapture, true);
      observer.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(resetTimer);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

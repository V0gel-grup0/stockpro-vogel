"use client";

import { useEffect } from "react";

const OTHER_CLIENT_TOKEN = "__crm_other__";

function findClientSelect() {
  const form = document.getElementById("crm-opportunity-form");
  if (!form) return null;

  const fields = Array.from(form.querySelectorAll<HTMLElement>(".field"));
  for (const field of fields) {
    const label = field.querySelector("label")?.textContent?.trim().toLowerCase();
    if (label !== "cliente") continue;
    const select = field.querySelector("select");
    if (select instanceof HTMLSelectElement) return select;
  }

  return null;
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

export default function CrmOtherClientSelectionGuard() {
  useEffect(() => {
    let activeSelect: HTMLSelectElement | null = null;
    let keepOtherSelected = false;
    let frame = 0;

    const sync = () => {
      const select = findClientSelect();

      if (!select) {
        activeSelect = null;
        keepOtherSelected = false;
        return;
      }

      if (activeSelect !== select) {
        activeSelect = select;
        keepOtherSelected = select.value === OTHER_CLIENT_TOKEN;

        if (!select.dataset.crmOtherSelectionGuard) {
          select.dataset.crmOtherSelectionGuard = "1";
          select.addEventListener("change", () => {
            keepOtherSelected = select.value === OTHER_CLIENT_TOKEN;

            if (keepOtherSelected) {
              window.setTimeout(sync, 0);
              window.cancelAnimationFrame(frame);
              frame = window.requestAnimationFrame(sync);
            }
          });
        }
      }

      ensureOtherOption(select);

      if (keepOtherSelected && select.value !== OTHER_CLIENT_TOKEN) {
        setNativeSelectValue(select, OTHER_CLIENT_TOKEN);
      }
    };

    sync();

    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

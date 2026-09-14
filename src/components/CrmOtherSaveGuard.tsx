"use client";

import { useEffect } from "react";

const OTHER_CLIENT_TOKEN = "__crm_other__";
const PROXY_ID = "crm-client-visible-select";

function getForm() {
  return document.getElementById("crm-opportunity-form") as HTMLElement | null;
}

function getField(labelText: string) {
  const form = getForm();
  if (!form) return null;

  return Array.from(form.querySelectorAll<HTMLElement>(".field")).find((field) => {
    const label = field.querySelector("label")?.textContent?.trim().toLowerCase();
    return label === labelText.trim().toLowerCase();
  }) || null;
}

function getControlValue(labelText: string) {
  const field = getField(labelText);
  if (!field) return "";
  const control = field.querySelector("input, select, textarea") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return control?.value || "";
}

function getStageValue() {
  return getControlValue("Etapa inicial") || getControlValue("Etapa");
}

function getClientValue() {
  const proxy = document.getElementById(PROXY_ID) as HTMLSelectElement | null;
  if (proxy) return proxy.value;
  return getControlValue("Cliente");
}

function showMessage(text: string, ok = false) {
  const form = getForm();
  if (!form) return;

  let box = form.querySelector<HTMLElement>("#crm-other-save-message");
  if (!box) {
    box = document.createElement("div");
    box.id = "crm-other-save-message";
    box.style.marginTop = "14px";
    box.style.fontWeight = "800";
    form.appendChild(box);
  }

  box.textContent = text;
  box.style.color = ok ? "#4ade80" : "#f87171";
}

export default function CrmOtherSaveGuard() {
  useEffect(() => {
    let saving = false;

    const onClickCapture = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      const form = getForm();

      if (!button || !form || !form.contains(button)) return;
      if (!button.textContent?.trim().toLowerCase().includes("salvar oportunidade")) return;

      const stage = getStageValue();
      const client = getClientValue();
      const isGeneralTask = stage === "other" || client === OTHER_CLIENT_TOKEN;

      if (!isGeneralTask) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (saving) return;
      saving = true;

      const originalText = button.textContent || "Salvar oportunidade";
      button.disabled = true;
      button.textContent = "Salvando...";
      showMessage("");

      try {
        const payload = {
          client_id: client === OTHER_CLIENT_TOKEN ? OTHER_CLIENT_TOKEN : client || OTHER_CLIENT_TOKEN,
          title: getControlValue("Título") || "Tarefa",
          responsible_id: getControlValue("Responsável (opcional)") || null,
          next_action: getControlValue("Próxima ação") || "other",
          next_action_at: getControlValue("Data da próxima ação") || null,
          notes: getControlValue("Observações") || "",
        };

        const response = await fetch("/api/crm/general-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.sucesso) {
          throw new Error(data?.erro || "Não foi possível salvar a tarefa.");
        }

        showMessage("Tarefa salva com sucesso.", true);
        window.dispatchEvent(new Event("crm-general-tasks-changed"));

        const cancelButton = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
          (item) => item.textContent?.trim().toLowerCase() === "cancelar"
        );

        if (cancelButton) {
          window.setTimeout(() => cancelButton.click(), 250);
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "Erro ao salvar a tarefa.");
      } finally {
        saving = false;
        button.disabled = false;
        button.textContent = originalText;
      }
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export default function AssemblySubmitGuard() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    let assemblyPostInFlight = false;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(requestUrl(input), window.location.origin);
      const method = requestMethod(input, init);
      const isAssemblyPost = url.pathname === "/api/assemblies" && method === "POST";

      if (!isAssemblyPost) {
        return nativeFetch(input, init);
      }

      if (assemblyPostInFlight) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            erro: "A montagem já está sendo registrada. Aguarde a conclusão antes de tentar novamente.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      assemblyPostInFlight = true;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
        (button) => button.textContent?.trim() === "Registrar montagem"
      );
      const previousStates = buttons.map((button) => ({ button, disabled: button.disabled, text: button.textContent || "" }));

      previousStates.forEach(({ button }) => {
        button.disabled = true;
        button.textContent = "Registrando...";
      });

      try {
        return await nativeFetch(input, init);
      } finally {
        assemblyPostInFlight = false;
        previousStates.forEach(({ button, disabled, text }) => {
          if (document.contains(button)) {
            button.disabled = disabled;
            button.textContent = text;
          }
        });
      }
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}

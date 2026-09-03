"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Client = {
  id: string;
  name: string;
  document?: string | null;
  creator?: {
    id: string;
    name: string;
    role: string;
  } | null;
};

function digits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function findClientsSection() {
  const heading = Array.from(document.querySelectorAll("h2.card-title")).find(
    (item) => item.textContent?.trim() === "Cadastros lançados"
  );
  if (!heading) return null;

  const section = heading.closest("section.card") as HTMLElement | null;
  if (!section) return null;

  const pageText = document.body.textContent || "";
  if (!pageText.includes("Clientes com endereço automático por CEP.")) return null;

  return { heading, section };
}

function ensureHost() {
  const found = findClientsSection();
  if (!found) return null;

  let host = found.section.querySelector<HTMLDivElement>("#client-creator-filter-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "client-creator-filter-host";
    host.style.marginBottom = "16px";
    found.heading.insertAdjacentElement("afterend", host);
  }
  return host;
}

export default function ClientCreatorFilterEnhancer() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const profileResponse = await fetch("/api/auth/profile", { cache: "no-store" });
        if (!profileResponse.ok) return;
        const profile = await profileResponse.json();
        const admin = String(profile.role || "").toLowerCase() === "administrador";
        if (cancelled) return;
        setIsAdmin(admin);
        if (!admin) return;

        const clientsResponse = await fetch("/api/clients", { cache: "no-store" });
        if (!clientsResponse.ok) return;
        const data = await clientsResponse.json();
        if (!cancelled && data.sucesso) {
          setClients(data.clients || []);
        }
      } catch (error) {
        console.error("Erro ao carregar filtro de cadastrador:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const sync = () => {
      const nextHost = ensureHost();
      setHost((current) => (current === nextHost ? current : nextHost));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdmin]);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((client) => {
      if (client.creator?.id && client.creator.name) {
        map.set(client.creator.id, client.creator.name);
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [clients]);

  useEffect(() => {
    if (!isAdmin) return;
    const found = findClientsSection();
    if (!found) return;

    const cards = Array.from(found.section.querySelectorAll<HTMLElement>(".user-card"));

    cards.forEach((card) => {
      card.querySelector("[data-client-creator-label]")?.remove();

      const cardDigits = digits(card.textContent);
      const client = clients.find((item) => {
        const doc = digits(item.document);
        return doc.length >= 11 && cardDigits.includes(doc);
      });

      const matches =
        !creatorId ||
        (creatorId === "__none__" && !client?.creator?.id) ||
        client?.creator?.id === creatorId;

      card.style.display = matches ? "" : "none";

      if (client) {
        const label = document.createElement("small");
        label.dataset.clientCreatorLabel = "true";
        label.textContent = `Cadastrado por: ${client.creator?.name || "Não identificado"}`;
        label.style.color = "#93c5fd";
        label.style.fontWeight = "700";
        const actions = card.querySelector(".form-actions");
        if (actions) {
          card.insertBefore(label, actions);
        } else {
          card.appendChild(label);
        }
      }
    });

    return () => {
      cards.forEach((card) => {
        card.style.display = "";
        card.querySelector("[data-client-creator-label]")?.remove();
      });
    };
  }, [isAdmin, clients, creatorId, host]);

  if (!isAdmin || !host) return null;

  return createPortal(
    <div
      className="field"
      style={{
        maxWidth: 420,
        padding: 12,
        border: "1px solid rgba(96,165,250,.24)",
        borderRadius: 14,
        background: "rgba(15,23,42,.7)",
      }}
    >
      <label htmlFor="client-creator-filter">Cadastrado por</label>
      <select
        id="client-creator-filter"
        className="input"
        value={creatorId}
        onChange={(event) => setCreatorId(event.target.value)}
      >
        <option value="">Todos</option>
        <option value="__none__">Não identificado</option>
        {creators.map((creator) => (
          <option key={creator.id} value={creator.id}>
            {creator.name}
          </option>
        ))}
      </select>
    </div>,
    host
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Profile = {
  id: string;
  name: string;
  role: string;
  status: string;
};

function digits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findClientForCard(
  card: HTMLElement,
  clients: Client[],
  usedClientIds = new Set<string>()
) {
  const cardName = normalize(card.querySelector("strong")?.textContent || "");
  const nameMatches = clients.filter(
    (client) => normalize(client.name) === cardName && !usedClientIds.has(client.id)
  );

  if (nameMatches.length === 1) return nameMatches[0];

  const cardDigits = digits(card.textContent);
  const byDocument = clients.find((client) => {
    if (usedClientIds.has(client.id)) return false;
    const document = digits(client.document);
    return document.length >= 11 && cardDigits.includes(document);
  });

  if (byDocument) return byDocument;
  if (nameMatches.length > 0) return nameMatches[0];

  return clients.find((client) => normalize(client.name) === cardName);
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

function findClientFormSection() {
  const heading = Array.from(document.querySelectorAll("h2.card-title")).find(
    (item) => ["Novo cadastro", "Editar cadastro"].includes(item.textContent?.trim() || "")
  );
  const section = heading?.closest("section.card") as HTMLElement | null;
  if (!section) return null;

  const pageText = document.body.textContent || "";
  if (!pageText.includes("Clientes com endereço automático por CEP.")) return null;

  return section;
}

function ensureFilterHost() {
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

function ensureFormHost() {
  const section = findClientFormSection();
  if (!section) return null;

  let host = section.querySelector<HTMLDivElement>("#client-creator-form-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "client-creator-form-host";
    host.className = "field";
    host.style.maxWidth = "420px";
    host.style.marginTop = "18px";

    const actions = section.querySelector<HTMLElement>(".form-actions");
    if (actions) {
      section.insertBefore(host, actions);
    } else {
      section.appendChild(host);
    }
  }
  return host;
}

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

export default function ClientCreatorFilterEnhancer() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [formCreatorId, setFormCreatorId] = useState("");
  const [filterHost, setFilterHost] = useState<HTMLDivElement | null>(null);
  const [formHost, setFormHost] = useState<HTMLDivElement | null>(null);
  const formCreatorRef = useRef("");

  useEffect(() => {
    formCreatorRef.current = formCreatorId;
  }, [formCreatorId]);

  async function reloadClients() {
    const clientsResponse = await fetch("/api/clients", { cache: "no-store" });
    if (!clientsResponse.ok) return [] as Client[];
    const data = await clientsResponse.json();
    if (!data.sucesso) return [] as Client[];
    const nextClients = (data.clients || []) as Client[];
    setClients(nextClients);
    return nextClients;
  }

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

        const [clientsResponse, profilesResponse] = await Promise.all([
          fetch("/api/clients", { cache: "no-store" }),
          fetch("/api/profiles", { cache: "no-store" }),
        ]);

        if (clientsResponse.ok) {
          const data = await clientsResponse.json();
          if (!cancelled && data.sucesso) setClients(data.clients || []);
        }

        if (profilesResponse.ok) {
          const data = await profilesResponse.json();
          if (!cancelled && Array.isArray(data)) {
            setProfiles(
              data.filter((item: Profile) => item.status === "approved" && item.name)
            );
          }
        }
      } catch (error) {
        console.error("Erro ao carregar cadastradores:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const sync = () => {
      setFilterHost(ensureFilterHost());
      setFormHost(ensureFormHost());
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    let checking = false;

    const checkForNewClients = async () => {
      if (checking || document.visibilityState === "hidden") return;
      const found = findClientsSection();
      if (!found) return;

      checking = true;
      try {
        const response = await fetch("/api/clients", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.sucesso) return;

        const serverCount = Array.isArray(data.clients) ? data.clients.length : 0;
        const renderedCount = found.section.querySelectorAll(".user-card").length;

        if (serverCount !== renderedCount) {
          window.location.reload();
        }
      } catch (error) {
        console.error("Erro ao verificar novos clientes:", error);
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(checkForNewClients, 12000);
    const onFocus = () => void checkForNewClients();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForNewClients();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  const availableProfiles = useMemo(
    () => [...profiles].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [profiles]
  );

  useEffect(() => {
    if (!isAdmin) return;
    const found = findClientsSection();
    if (!found) return;

    const cards = Array.from(found.section.querySelectorAll<HTMLElement>(".user-card"));
    const usedClientIds = new Set<string>();

    cards.forEach((card) => {
      card.querySelector("[data-client-creator-label]")?.remove();

      const client = findClientForCard(card, clients, usedClientIds);
      if (client) usedClientIds.add(client.id);

      const matches =
        !creatorId ||
        (creatorId === "__none__" && !client?.creator?.id) ||
        client?.creator?.id === creatorId;

      card.style.display = matches ? "" : "none";

      if (client) {
        const label = document.createElement("div");
        label.dataset.clientCreatorLabel = "true";
        label.textContent = `Cadastrado por: ${client.creator?.name || "Não identificado"}`;
        label.style.color = "#93c5fd";
        label.style.fontWeight = "800";
        label.style.fontSize = "13px";
        label.style.marginTop = "8px";
        label.style.marginBottom = "2px";
        const actions = card.querySelector(".form-actions");
        if (actions) card.insertBefore(label, actions);
        else card.appendChild(label);
      }
    });

    return () => {
      cards.forEach((card) => {
        card.style.display = "";
        card.querySelector("[data-client-creator-label]")?.remove();
      });
    };
  }, [isAdmin, clients, creatorId, filterHost]);

  useEffect(() => {
    if (!isAdmin) return;

    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";

      if (text === "Editar") {
        const card = button.closest<HTMLElement>(".user-card");
        if (!card) return;
        const client = findClientForCard(card, clients);
        setFormCreatorId(client?.creator?.id || "");
      }

      if (text === "Cancelar") {
        setFormCreatorId("");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isAdmin, clients]);

  useEffect(() => {
    if (!isAdmin) return;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(requestUrl(input), window.location.origin);
      const method = requestMethod(input, init);
      let nextInit = init;

      if (url.pathname === "/api/clients" && ["POST", "PUT"].includes(method)) {
        try {
          const currentBody = init?.body ? JSON.parse(String(init.body)) : {};
          nextInit = {
            ...init,
            body: JSON.stringify({
              ...currentBody,
              created_by: formCreatorRef.current || undefined,
            }),
          };
        } catch (error) {
          console.error("Erro ao incluir cadastrador no cliente:", error);
        }
      }

      const response = await nativeFetch(input, nextInit);

      if (url.pathname === "/api/clients" && response.ok && ["POST", "PUT"].includes(method)) {
        window.setTimeout(() => {
          void reloadClients();
        }, 150);
        if (method === "POST") setFormCreatorId("");
      }

      return response;
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <>
      {formHost &&
        createPortal(
          <>
            <label htmlFor="client-creator-form">Cadastrado por</label>
            <select
              id="client-creator-form"
              className="input"
              value={formCreatorId}
              onChange={(event) => setFormCreatorId(event.target.value)}
            >
              <option value="">Usuário atual (administrador)</option>
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} — {profile.role}
                </option>
              ))}
            </select>
          </>,
          formHost
        )}

      {filterHost &&
        createPortal(
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "end",
              flexWrap: "wrap",
            }}
          >
            <div
              className="field"
              style={{
                flex: "1 1 280px",
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
            </div>
            <button
              type="button"
              className="btn btn-gray"
              style={{ minHeight: 46, marginBottom: 1 }}
              onClick={() => window.location.reload()}
            >
              Atualizar lista
            </button>
          </div>,
          filterHost
        )}
    </>
  );
}

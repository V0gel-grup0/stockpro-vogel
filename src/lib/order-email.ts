import { prisma } from "@/lib/prisma";

type NewOrder = {
  id: string;
  order_number: bigint | number | string;
  client_id: string | null;
  created_by: string | null;
  equipment_name: string;
  item_type: string;
  quantity: number;
  total_value: unknown;
  shipping_value: unknown;
};

function safeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

/**
 * Best-effort notification. Never roll back a confirmed order because the
 * mail provider is unavailable or not configured.
 * Configure RESEND_API_KEY and ORDER_EMAIL_FROM (verified sender) on Vercel.
 * Optionally set SALES_MANAGER_EMAIL to target a specific inbox;
 * otherwise mail all approved users with the manager role.
 */
export async function notifySalesManagersOfOrders(orders: NewOrder[]) {
  if (!orders.length) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    console.info("Avisos por e-mail de pedidos não configurados: RESEND_API_KEY/ORDER_EMAIL_FROM.");
    return;
  }

  const configuredAddress = (process.env.SALES_MANAGER_EMAIL || "").trim();
  const recipients = configuredAddress
    ? configuredAddress.split(",").map((mail) => mail.trim()).filter((mail) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
    : (await prisma.profiles.findMany({
      where: { role: "gerente", status: "approved" },
      select: { email: true },
    })).map((manager) => manager.email).filter((mail) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail));

  const to = [...new Set(recipients)];
  if (!to.length) {
    console.info("Nenhum e-mail de gerente de vendas configurado.");
    return;
  }

  const clientIds = [...new Set(orders.map((order) => order.client_id).filter((id): id is string => Boolean(id)))];
  const creatorIds = [...new Set(orders.map((order) => order.created_by).filter((id): id is string => Boolean(id)))];
  const [clients, creators] = await Promise.all([
    prisma.clients.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    prisma.profiles.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }),
  ]);
  const clientById = new Map(clients.map((client) => [client.id, client.name]));
  const creatorById = new Map(creators.map((creator) => [creator.id, creator.name]));
  const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const lines = orders.map((order) => {
    const number = "PV-" + String(order.order_number).padStart(6, "0");
    const client = clientById.get(order.client_id || "") || "Não informado";
    const seller = creatorById.get(order.created_by || "") || "Não informado";
    const total = formatBRL(Number(order.total_value || 0) + Number(order.shipping_value || 0));
    return { number, client, seller, item: order.equipment_name || order.item_type || "Produto", quantity: order.quantity, total };
  });
  const header = orders.length === 1 ? `Novo pedido ${lines[0].number}` : `${orders.length} novos pedidos cadastrados`;
  const bodyText = lines.map((line) => `${line.number} | Cliente: ${line.client} | Vendedor: ${line.seller} | Item: ${line.item} | Qtd: ${line.quantity} | Total: ${line.total}`).join("\n");
  const rows = lines.map((line) => `<tr><td>${safeHtml(line.number)}</td><td>${safeHtml(line.client)}</td><td>${safeHtml(line.seller)}</td><td>${safeHtml(line.item)}</td><td>${safeHtml(line.quantity)}</td><td>${safeHtml(line.total)}</td></tr>`).join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `StockPro Vogel | ${header}`,
      text: `${header}\n\n${bodyText}\n\nAcesse o StockPro Vogel para visualizar os pedidos.`,
      html: `<div style="font-family:Arial,sans-serif;color:#15243a"><h2>${safeHtml(header)}</h2><p>Um novo pedido foi registrado no StockPro Vogel.</p><table cellpadding="10" border="1" style="border-collapse:collapse"><thead><tr><th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Item</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Consulte os detalhes na área de Pedidos do StockPro Vogel.</p></div>`,
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    console.error("Falha ao notificar gerente de vendas por e-mail:", response.status);
  }
}

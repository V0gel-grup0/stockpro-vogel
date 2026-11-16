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
 * Notifications are scoped to the sales hierarchy:
 * - approved manager/admin accounts receive every new order;
 * - an approved seller receives ONLY orders entered by representatives
 *   whose responsible_seller_id matches that seller's profile id.
 *
 * A quote-generated order can have a seller as its created_by. In that case
 * we use the originating quote's author to identify the representative.
 * No failed email should invalidate a successfully created order.
 *
 * Requires RESEND_API_KEY and a verified ORDER_EMAIL_FROM.
 */
export async function notifySalesManagersOfOrders(orders: NewOrder[]) {
  if (!orders.length) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    console.info("E-mails de pedidos não configurados: RESEND_API_KEY/ORDER_EMAIL_FROM.");
    return;
  }

  const orderIds = orders.map((order) => order.id);
  const clientIds = [...new Set(orders.map((order) => order.client_id).filter((id): id is string => Boolean(id)))];
  const [team, clients, originQuotes] = await Promise.all([
    prisma.profiles.findMany({
      where: { role: { in: ["vendedor", "gerente", "administrador"] }, status: "approved" },
      select: { id: true, role: true, email: true },
    }),
    prisma.clients.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    prisma.quotes.findMany({
      where: { generated_order_id: { in: orderIds } },
      select: { generated_order_id: true, created_by: true },
    }),
  ]);

  const authorByOrder = new Map(originQuotes.map((quote) => [quote.generated_order_id, quote.created_by]));
  const authorIds = [...new Set([
    ...orders.map((order) => order.created_by),
    ...originQuotes.map((quote) => quote.created_by),
  ].filter((id): id is string => Boolean(id)))];
  const authors = await prisma.profiles.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, role: true, responsible_seller_id: true },
  });
  const authorById = new Map(authors.map((profile) => [profile.id, profile]));
  const clientById = new Map(clients.map((client) => [client.id, client.name]));
  const validEmail = (mail: string) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(mail);
  const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Group by address so even a batched submission sends each seller only
  // the representative orders that they are authorized to receive.
  const byRecipient = new Map<string, NewOrder[]>();
  for (const order of orders) {
    const originalAuthorId = authorByOrder.get(order.id) || order.created_by;
    const originalAuthor = authorById.get(originalAuthorId || "");
    for (const member of team) {
      const entitled = member.role === "administrador" || member.role === "gerente" ||
        (member.role === "vendedor" &&
         originalAuthor?.role === "representante" &&
         originalAuthor.responsible_seller_id === member.id);
      const mail = member.email.trim().toLowerCase();
      if (!entitled || !validEmail(mail)) continue;
      const selection = byRecipient.get(mail) || [];
      selection.push(order);
      byRecipient.set(mail, selection);
    }
  }

  await Promise.allSettled([...byRecipient.entries()].map(async ([recipient, selection]) => {
    const lines = selection.map((order) => {
      const number = "PV-" + String(order.order_number).padStart(6, "0");
      const authorId = authorByOrder.get(order.id) || order.created_by;
      const author = authorById.get(authorId || "");
      const total = formatBRL(Number(order.total_value || 0) + Number(order.shipping_value || 0));
      return {
        number,
        client: clientById.get(order.client_id || "") || "Não informado",
        seller: author?.name || "Não informado",
        item: order.equipment_name || order.item_type || "Produto",
        quantity: order.quantity,
        total,
      };
    });
    const header = selection.length === 1 ? `Novo pedido ${lines[0].number}` : `${selection.length} novos pedidos cadastrados`;
    const textBody = lines.map((line) =>
      `${line.number} | Cliente: ${line.client} | Responsável: ${line.seller} | Item: ${line.item} | Qtd: ${line.quantity} | Total: ${line.total}`
    ).join("\\n");
    const rows = lines.map((line) =>
      `<tr><td>${safeHtml(line.number)}</td><td>${safeHtml(line.client)}</td><td>${safeHtml(line.seller)}</td><td>${safeHtml(line.item)}</td><td>${safeHtml(line.quantity)}</td><td>${safeHtml(line.total)}</td></tr>`
    ).join("");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [recipient],
        subject: `StockPro Vogel | ${header}`,
        text: `${header}\\n\\n${textBody}\\n\\nConsulte os detalhes na área de Pedidos do StockPro Vogel.`,
        html: `<div style="font-family:Arial,sans-serif;color:#15243a"><h2>${safeHtml(header)}</h2><p>Pedido registrado no StockPro Vogel.</p><table cellpadding="10" border="1" style="border-collapse:collapse"><thead><tr><th>Pedido</th><th>Cliente</th><th>Responsável</th><th>Item</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Consulte os detalhes na área de Pedidos.</p></div>`,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) console.error("Falha no aviso de pedido por e-mail:", response.status);
  }));
}

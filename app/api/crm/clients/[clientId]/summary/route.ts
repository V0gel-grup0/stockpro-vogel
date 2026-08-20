import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getAuthenticatedProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

function errorResponse(erro: string, status: number) {
  return NextResponse.json(
    {
      sucesso: false,
      erro,
    },
    {
      status,
    }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authenticatedProfile = await getAuthenticatedProfile();

    if (!authenticatedProfile) {
      return errorResponse("Não autenticado.", 401);
    }

    const { clientId: rawClientId } = await context.params;
    const clientId = rawClientId.trim();

    if (!uuidPattern.test(clientId)) {
      return errorResponse("clientId deve ser um UUID válido.", 400);
    }

    const client = await prisma.clients.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
        name: true,
        document: true,
        phone: true,
        city: true,
        proposal_status: true,
        orders: {
          orderBy: {
            created_at: "desc",
          },
          select: {
            id: true,
            order_number: true,
            status: true,
            item_type: true,
            equipment_name: true,
            quantity: true,
            total_value: true,
            shipping_value: true,
            tracking_code: true,
            tracking_location: true,
            conta_azul_status: true,
            notes: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });

    if (!client) {
      return errorResponse("Cliente não encontrado.", 404);
    }

    const { orders, ...clientData } = client;
    let valorPedidos = new Prisma.Decimal(0);
    let valorFrete = new Prisma.Decimal(0);
    let valorNominalEmAndamento = new Prisma.Decimal(0);
    let pedidosEmAndamento = 0;
    let ultimoPedido: Date | null = null;

    for (const order of orders) {
      valorPedidos = valorPedidos.plus(order.total_value);
      valorFrete = valorFrete.plus(order.shipping_value);

      if (
        order.created_at &&
        (!ultimoPedido || order.created_at > ultimoPedido)
      ) {
        ultimoPedido = order.created_at;
      }

      if (order.status.trim().toLowerCase() !== "recebido") {
        pedidosEmAndamento += 1;
        valorNominalEmAndamento = valorNominalEmAndamento.plus(
          order.total_value.plus(order.shipping_value)
        );
      }
    }

    const quantidadePedidos = orders.length;
    const totalNominal = valorPedidos.plus(valorFrete);
    const ticketMedio = quantidadePedidos
      ? valorPedidos.dividedBy(quantidadePedidos)
      : new Prisma.Decimal(0);

    return NextResponse.json(
      toJsonSafe({
        sucesso: true,
        cliente: clientData,
        resumo: {
          quantidade_pedidos: quantidadePedidos,
          valor_pedidos: valorPedidos,
          valor_frete: valorFrete,
          total_nominal: totalNominal,
          ticket_medio: ticketMedio,
          ultimo_pedido: ultimoPedido,
          pedidos_em_andamento: pedidosEmAndamento,
          valor_nominal_em_andamento: valorNominalEmAndamento,
        },
        pedidos: orders,
        metadados: {
          conta_azul_status:
            "Status operacional de solicitação de NF; não confirma emissão nem pagamento.",
          valores_financeiros:
            "Valores nominais dos pedidos; não representam valores recebidos ou a receber.",
        },
      })
    );
  } catch (error) {
    console.error("Erro ao carregar resumo do cliente no CRM:", error);

    return errorResponse("Erro ao carregar resumo do cliente no CRM.", 500);
  }
}

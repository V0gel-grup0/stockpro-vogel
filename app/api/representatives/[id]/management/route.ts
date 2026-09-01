import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import {
  REPRESENTATIVE_MANAGEMENT_ROLES,
  applyPayment,
  buildInstallmentPlan,
  calculateGoalProgress,
  calculatePurchaseValues,
  canManageRepresentativeFinancials,
  canRecordRepresentativeCollection,
  effectiveReceivableStatus,
  isDateOnly,
  isUuid,
  moneyToCents,
  centsToMoney,
} from "@/lib/representative-management-policy";
import {
  accessibleRepresentative,
  representativeStructureMissing,
} from "@/lib/representative-management-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDateTime(value: unknown) {
  const raw = text(value, 40);
  const date = new Date(raw);
  return raw && !Number.isNaN(date.getTime()) ? date : null;
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, reference: start.toISOString().slice(0, 10) };
}

function amount(value: unknown) {
  return Number(value || 0);
}

function apiError(error: unknown, fallback: string) {
  if (representativeStructureMissing(error)) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: "A estrutura de Gestão do Representante ainda não foi instalada neste ambiente.",
      },
      { status: 503 }
    );
  }

  const candidate = error as { code?: string };
  if (candidate?.code === "P2002") {
    return NextResponse.json(
      { sucesso: false, erro: "Já existe um registro com estes identificadores." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { sucesso: false, erro: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ sucesso: false, erro: "Representante inválido." }, { status: 400 });
    }

    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    const representative = await accessibleRepresentative(actor, id);
    if (!representative) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }

    const now = new Date();
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const { start, end, reference } = monthBounds(now);
    const inSevenDays = new Date(now.getTime() + 7 * 86_400_000);
    const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000);

    const [goals, purchases, receivables, payments, collections, contracts, invoices] =
      await Promise.all([
        prisma.representative_goals.findMany({
          where: { representative_id: id },
          orderBy: { reference_month: "desc" },
        }),
        prisma.representative_purchases.findMany({
          where: { representative_id: id },
          orderBy: [{ purchase_date: "desc" }, { created_at: "desc" }],
        }),
        prisma.representative_receivables.findMany({
          where: { representative_id: id },
          include: {
            purchase: { select: { id: true, item_name: true, purchase_date: true } },
          },
          orderBy: [{ due_date: "asc" }, { installment_number: "asc" }],
        }),
        prisma.representative_payments.findMany({
          where: { representative_id: id },
          orderBy: [{ payment_date: "desc" }, { created_at: "desc" }],
        }),
        prisma.representative_collection_history.findMany({
          where: { representative_id: id },
          include: { creator: { select: { id: true, name: true } } },
          orderBy: [{ contact_date: "desc" }, { created_at: "desc" }],
        }),
        prisma.representative_contracts.findMany({
          where: { representative_id: id },
          select: {
            id: true,
            contract_number: true,
            contract_type: true,
            start_date: true,
            end_date: true,
            region: true,
            exclusive: true,
            status: true,
            notes: true,
            file_name: true,
            file_size: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: [{ end_date: "desc" }, { created_at: "desc" }],
        }),
        prisma.representative_invoices.findMany({
          where: { representative_id: id },
          select: {
            id: true,
            purchase_id: true,
            invoice_number: true,
            issued_at: true,
            amount: true,
            notes: true,
            pdf_file_name: true,
            pdf_file_size: true,
            xml_file_name: true,
            xml_file_size: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: [{ issued_at: "desc" }, { created_at: "desc" }],
        }),
      ]);

    const visiblePurchases = purchases.filter((purchase) => purchase.status !== "cancelada");
    const monthPurchases = visiblePurchases.filter(
      (purchase) => purchase.purchase_date >= start && purchase.purchase_date < end
    );
    const monthQuantity = monthPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
    const monthEquipmentQuantity = monthPurchases
      .filter((purchase) => purchase.item_type === "equipamento")
      .reduce((sum, purchase) => sum + purchase.quantity, 0);
    const monthRevenue = monthPurchases.reduce((sum, purchase) => sum + amount(purchase.total_value), 0);
    const currentGoal = goals.find((goal) => goal.reference_month.toISOString().slice(0, 10) === reference) || null;
    const goalProgress = calculateGoalProgress({
      equipmentTarget: currentGoal?.equipment_target || 0,
      revenueTarget: currentGoal?.revenue_target || 0,
      equipmentRealized: monthEquipmentQuantity,
      revenueRealized: monthRevenue,
    });

    const receivablesWithStatus = receivables.map((receivable) => {
      const remaining = Math.max(0, amount(receivable.original_amount) - amount(receivable.received_amount));
      return {
        ...receivable,
        remaining_amount: remaining.toFixed(2),
        effective_status: effectiveReceivableStatus(
          receivable.status,
          receivable.due_date,
          remaining.toFixed(2),
          now
        ),
      };
    });
    const openReceivables = receivablesWithStatus.filter((item) => item.effective_status !== "pago");
    const overdueReceivables = openReceivables.filter((item) => item.effective_status === "vencido");
    const upcomingReceivables = openReceivables.filter(
      (item) => item.due_date >= today && item.due_date <= inSevenDays
    );
    const nextReceivable = openReceivables
      .filter((item) => item.due_date >= today)
      .sort((a, b) => a.due_date.getTime() - b.due_date.getTime())[0] || null;
    const receivedThisMonth = payments
      .filter((payment) => payment.payment_date >= start && payment.payment_date < end)
      .reduce((sum, payment) => sum + amount(payment.amount), 0);
    const contractsWithStatus = contracts.map((contract) => ({
      ...contract,
      effective_status:
        contract.status === "ativo" && contract.end_date < today
          ? "vencido"
          : contract.status,
    }));
    const activeContract = contractsWithStatus.find((contract) => contract.effective_status === "ativo") || contractsWithStatus[0] || null;

    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const expectedProgress = (now.getUTCDate() / daysInMonth) * 100;
    const alerts = [
      ...overdueReceivables.map((item) => ({
        type: "overdue_receivable",
        tone: "danger",
        message: `Parcela ${item.installment_number} vencida em ${item.due_date.toISOString().slice(0, 10)}.`,
        record_id: item.id,
      })),
      ...upcomingReceivables.map((item) => ({
        type: "upcoming_receivable",
        tone: "warning",
        message: `Parcela ${item.installment_number} vence até os próximos 7 dias.`,
        record_id: item.id,
      })),
      ...contractsWithStatus
        .filter((contract) => contract.effective_status === "ativo" && contract.end_date >= today && contract.end_date <= inThirtyDays)
        .map((contract) => ({
          type: "contract_expiring",
          tone: "warning",
          message: `Contrato ${contract.contract_number} próximo do vencimento.`,
          record_id: contract.id,
        })),
      ...(currentGoal && goalProgress.percent + 0.01 < expectedProgress
        ? [{
            type: "goal_below_expected",
            tone: "warning",
            message: `Meta mensal em ${goalProgress.percent.toFixed(1)}%, abaixo do ritmo esperado de ${expectedProgress.toFixed(1)}%.`,
            record_id: currentGoal.id,
          }]
        : []),
      ...collections
        .filter((collection) =>
          collection.next_contact_at &&
          collection.next_contact_at <= now &&
          !collections.some((later) =>
            later.contact_date > collection.contact_date &&
            (!collection.receivable_id || later.receivable_id === collection.receivable_id)
          )
        )
        .map((collection) => ({
          type: "collection_pending",
          tone: "danger",
          message: "Cobrança com retorno pendente.",
          record_id: collection.id,
        })),
    ];

    return NextResponse.json({
      sucesso: true,
      representative: toJsonSafe({
        id: representative.id,
        name: representative.name,
        email: representative.email,
        role: representative.role,
        status: representative.status,
        representative_company: representative.representative_company,
        representative_region: representative.representative_region,
        responsible_seller_id: representative.responsible_seller_id,
        responsible_seller: representative.profiles_profiles_responsible_seller_idToprofiles,
      }),
      capabilities: {
        can_manage_financials: canManageRepresentativeFinancials(actor.role),
        can_record_collection: canRecordRepresentativeCollection(actor, representative),
      },
      summary: {
        month_goal: currentGoal
          ? { equipment_target: currentGoal.equipment_target, revenue_target: currentGoal.revenue_target }
          : null,
        month_quantity: monthQuantity,
        month_revenue: monthRevenue.toFixed(2),
        total_purchased: visiblePurchases.reduce((sum, purchase) => sum + amount(purchase.total_value), 0).toFixed(2),
        total_received: payments.reduce((sum, payment) => sum + amount(payment.amount), 0).toFixed(2),
        total_receivable: openReceivables.reduce((sum, item) => sum + amount(item.remaining_amount), 0).toFixed(2),
        total_overdue: overdueReceivables.reduce((sum, item) => sum + amount(item.remaining_amount), 0).toFixed(2),
        received_this_month: receivedThisMonth.toFixed(2),
        next_due_date: nextReceivable?.due_date || null,
        contract_status: activeContract?.effective_status || "sem contrato",
        goal_progress: goalProgress,
      },
      alerts,
      goals: toJsonSafe(goals.map((goal) => {
        const goalStart = goal.reference_month;
        const goalEnd = new Date(Date.UTC(goalStart.getUTCFullYear(), goalStart.getUTCMonth() + 1, 1));
        const realized = visiblePurchases.filter((purchase) => purchase.purchase_date >= goalStart && purchase.purchase_date < goalEnd);
        const equipmentRealized = realized
          .filter((purchase) => purchase.item_type === "equipamento")
          .reduce((sum, purchase) => sum + purchase.quantity, 0);
        const revenueRealized = realized.reduce((sum, purchase) => sum + amount(purchase.total_value), 0);
        return {
          ...goal,
          equipment_realized: equipmentRealized,
          revenue_realized: revenueRealized.toFixed(2),
          progress: calculateGoalProgress({
            equipmentTarget: goal.equipment_target,
            revenueTarget: goal.revenue_target,
            equipmentRealized,
            revenueRealized,
          }),
        };
      })),
      purchases: toJsonSafe(purchases),
      receivables: toJsonSafe(receivablesWithStatus),
      payments: toJsonSafe(payments),
      collections: toJsonSafe(collections),
      contracts: toJsonSafe(contractsWithStatus),
      invoices: toJsonSafe(invoices),
    });
  } catch (error) {
    return apiError(error, "Erro ao carregar a gestão do representante.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await authorizeApi(REPRESENTATIVE_MANAGEMENT_ROLES);
    if ("response" in authorization) return authorization.response;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ sucesso: false, erro: "Representante inválido." }, { status: 400 });
    }
    const actor = { id: authorization.profile.id, role: authorization.profile.role };
    const representative = await accessibleRepresentative(actor, id);
    if (!representative) {
      return NextResponse.json({ sucesso: false, erro: "Representante não encontrado ou sem permissão." }, { status: 404 });
    }

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 50);
    const canManage = canManageRepresentativeFinancials(actor.role);
    if (action !== "collection" && !canManage) {
      return NextResponse.json({ sucesso: false, erro: "Seu perfil possui acesso somente para consulta." }, { status: 403 });
    }

    if (action === "profile") {
      const updated = await prisma.profiles.update({
        where: { id },
        data: {
          representative_company: text(body.company, 200),
          representative_region: text(body.region, 200),
          updated_at: new Date(),
        },
        select: { id: true, representative_company: true, representative_region: true },
      });
      return NextResponse.json({ sucesso: true, profile: updated });
    }

    if (action === "goal") {
      const month = text(body.reference_month, 7);
      const referenceMonth = `${month}-01`;
      if (!/^\d{4}-\d{2}$/.test(month) || !isDateOnly(referenceMonth)) {
        return NextResponse.json({ sucesso: false, erro: "Mês de referência inválido." }, { status: 400 });
      }
      const equipmentTarget = Number(body.equipment_target);
      if (!Number.isSafeInteger(equipmentTarget) || equipmentTarget < 0) {
        return NextResponse.json({ sucesso: false, erro: "Meta de equipamentos inválida." }, { status: 400 });
      }
      const revenueTarget = centsToMoney(moneyToCents(body.revenue_target, "Meta de faturamento"));
      const goal = await prisma.representative_goals.upsert({
        where: {
          representative_id_reference_month: {
            representative_id: id,
            reference_month: new Date(`${referenceMonth}T00:00:00.000Z`),
          },
        },
        create: {
          representative_id: id,
          reference_month: new Date(`${referenceMonth}T00:00:00.000Z`),
          equipment_target: equipmentTarget,
          revenue_target: revenueTarget,
          notes: text(body.notes, 2000),
          created_by: actor.id,
        },
        update: {
          equipment_target: equipmentTarget,
          revenue_target: revenueTarget,
          notes: text(body.notes, 2000),
          updated_at: new Date(),
        },
      });
      return NextResponse.json({ sucesso: true, goal: toJsonSafe(goal) });
    }

    if (action === "purchase") {
      const purchaseDate = text(body.purchase_date, 10);
      const firstDueDate = text(body.first_due_date, 10);
      const itemType = text(body.item_type, 20);
      const itemName = text(body.item_name, 300);
      const status = text(body.status, 30) || "pendente";
      if (!isDateOnly(purchaseDate) || !isDateOnly(firstDueDate)) {
        return NextResponse.json({ sucesso: false, erro: "Datas da compra ou vencimento são inválidas." }, { status: 400 });
      }
      if (!['produto', 'equipamento'].includes(itemType) || !itemName) {
        return NextResponse.json({ sucesso: false, erro: "Informe um produto ou equipamento válido." }, { status: 400 });
      }
      if (!['pendente', 'confirmada', 'concluida'].includes(status)) {
        return NextResponse.json({ sucesso: false, erro: "Status da compra inválido." }, { status: 400 });
      }
      const productId = body.product_id ? text(body.product_id, 40) : null;
      if (productId && !isUuid(productId)) {
        return NextResponse.json({ sucesso: false, erro: "Produto vinculado inválido." }, { status: 400 });
      }
      const values = calculatePurchaseValues(body.quantity, body.unit_price, body.shipping_value ?? 0);
      const installments = buildInstallmentPlan(values.totalCents, body.installment_count, firstDueDate);

      const purchase = await prisma.$transaction(async (tx) => {
        const created = await tx.representative_purchases.create({
          data: {
            representative_id: id,
            purchase_date: new Date(`${purchaseDate}T00:00:00.000Z`),
            item_type: itemType,
            product_id: productId,
            item_name: itemName,
            quantity: values.quantity,
            unit_price: values.unit_price,
            subtotal: values.subtotal,
            shipping_value: values.shipping_value,
            total_value: values.total_value,
            payment_terms: text(body.payment_terms, 500),
            notes: text(body.notes, 2000),
            status,
            created_by: actor.id,
          },
        });
        await tx.representative_receivables.createMany({
          data: installments.map((installment) => ({
            representative_id: id,
            purchase_id: created.id,
            installment_number: installment.installment_number,
            due_date: new Date(`${installment.due_date}T00:00:00.000Z`),
            original_amount: installment.original_amount,
          })),
        });
        return created;
      });
      return NextResponse.json({ sucesso: true, purchase: toJsonSafe(purchase) }, { status: 201 });
    }

    if (action === "payment") {
      const receivableId = text(body.receivable_id, 40);
      const paymentDate = text(body.payment_date, 10);
      const method = text(body.payment_method, 100);
      if (!isUuid(receivableId) || !isDateOnly(paymentDate) || !method) {
        return NextResponse.json({ sucesso: false, erro: "Parcela, data ou forma de pagamento inválida." }, { status: 400 });
      }

      const payment = await prisma.$transaction(async (tx) => {
        const receivable = await tx.representative_receivables.findFirst({
          where: { id: receivableId, representative_id: id },
        });
        if (!receivable) throw new Error("Parcela não encontrada para este representante.");
        const result = applyPayment(receivable.original_amount, receivable.received_amount, body.amount);
        const created = await tx.representative_payments.create({
          data: {
            representative_id: id,
            receivable_id: receivable.id,
            payment_date: new Date(`${paymentDate}T00:00:00.000Z`),
            amount: result.payment_amount,
            payment_method: method,
            notes: text(body.notes, 2000),
            created_by: actor.id,
          },
        });
        await tx.representative_receivables.update({
          where: { id: receivable.id },
          data: {
            received_amount: result.received_amount,
            status: result.status,
            updated_at: new Date(),
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ sucesso: true, payment: toJsonSafe(payment) }, { status: 201 });
    }

    if (action === "collection") {
      if (!canRecordRepresentativeCollection(actor, representative)) {
        return NextResponse.json({ sucesso: false, erro: "Seu perfil não pode registrar cobranças para este representante." }, { status: 403 });
      }
      const contactDate = validDateTime(body.contact_date);
      const contactType = text(body.contact_type, 30);
      const notes = text(body.notes, 3000);
      const receivableId = body.receivable_id ? text(body.receivable_id, 40) : null;
      const promisedDate = body.promised_date ? text(body.promised_date, 10) : null;
      const nextContactAt = body.next_contact_at ? validDateTime(body.next_contact_at) : null;
      if (!contactDate || !['whatsapp', 'ligacao', 'email', 'outro'].includes(contactType) || !notes) {
        return NextResponse.json({ sucesso: false, erro: "Contato, tipo e observação da cobrança são obrigatórios." }, { status: 400 });
      }
      if (promisedDate && !isDateOnly(promisedDate)) {
        return NextResponse.json({ sucesso: false, erro: "Data prometida inválida." }, { status: 400 });
      }
      if (body.next_contact_at && !nextContactAt) {
        return NextResponse.json({ sucesso: false, erro: "Data da próxima cobrança inválida." }, { status: 400 });
      }
      if (receivableId) {
        if (!isUuid(receivableId)) {
          return NextResponse.json({ sucesso: false, erro: "Parcela relacionada inválida." }, { status: 400 });
        }
        const linked = await prisma.representative_receivables.findFirst({ where: { id: receivableId, representative_id: id }, select: { id: true } });
        if (!linked) return NextResponse.json({ sucesso: false, erro: "Parcela não pertence ao representante." }, { status: 400 });
      }
      const collection = await prisma.representative_collection_history.create({
        data: {
          representative_id: id,
          receivable_id: receivableId,
          contact_date: contactDate,
          contact_type: contactType,
          notes,
          payment_promise: text(body.payment_promise, 1000),
          promised_date: promisedDate ? new Date(`${promisedDate}T00:00:00.000Z`) : null,
          next_contact_at: nextContactAt,
          created_by: actor.id,
        },
      });
      return NextResponse.json({ sucesso: true, collection: toJsonSafe(collection) }, { status: 201 });
    }

    if (action === "contract") {
      const startDate = text(body.start_date, 10);
      const endDate = text(body.end_date, 10);
      const contractNumber = text(body.contract_number, 150);
      const contractType = text(body.contract_type, 150);
      const status = text(body.status, 30) || "ativo";
      if (!isDateOnly(startDate) || !isDateOnly(endDate) || endDate < startDate || !contractNumber || !contractType) {
        return NextResponse.json({ sucesso: false, erro: "Dados ou período do contrato são inválidos." }, { status: 400 });
      }
      if (!['rascunho', 'ativo', 'vencido', 'encerrado'].includes(status)) {
        return NextResponse.json({ sucesso: false, erro: "Status do contrato inválido." }, { status: 400 });
      }
      const contract = await prisma.representative_contracts.create({
        data: {
          representative_id: id,
          contract_number: contractNumber,
          contract_type: contractType,
          start_date: new Date(`${startDate}T00:00:00.000Z`),
          end_date: new Date(`${endDate}T00:00:00.000Z`),
          region: text(body.region, 200),
          exclusive: Boolean(body.exclusive),
          status,
          notes: text(body.notes, 2000),
        },
      });
      return NextResponse.json({ sucesso: true, contract: toJsonSafe(contract) }, { status: 201 });
    }

    if (action === "invoice") {
      const invoiceNumber = text(body.invoice_number, 150);
      const issuedAt = text(body.issued_at, 10);
      const purchaseId = body.purchase_id ? text(body.purchase_id, 40) : null;
      if (!invoiceNumber || !isDateOnly(issuedAt)) {
        return NextResponse.json({ sucesso: false, erro: "Número ou data da NF inválidos." }, { status: 400 });
      }
      const invoiceAmount = centsToMoney(moneyToCents(body.amount, "Valor da NF"));
      if (purchaseId) {
        if (!isUuid(purchaseId)) return NextResponse.json({ sucesso: false, erro: "Compra vinculada inválida." }, { status: 400 });
        const linked = await prisma.representative_purchases.findFirst({ where: { id: purchaseId, representative_id: id }, select: { id: true } });
        if (!linked) return NextResponse.json({ sucesso: false, erro: "Compra não pertence ao representante." }, { status: 400 });
      }
      const invoice = await prisma.representative_invoices.create({
        data: {
          representative_id: id,
          purchase_id: purchaseId,
          invoice_number: invoiceNumber,
          issued_at: new Date(`${issuedAt}T00:00:00.000Z`),
          amount: invoiceAmount,
          notes: text(body.notes, 2000),
        },
      });
      return NextResponse.json({ sucesso: true, invoice: toJsonSafe(invoice) }, { status: 201 });
    }

    return NextResponse.json({ sucesso: false, erro: "Operação não reconhecida." }, { status: 400 });
  } catch (error) {
    return apiError(error, "Erro ao salvar a gestão do representante.");
  }
}

import type { AppRole } from "@/lib/permissions";

export const REPRESENTATIVE_MANAGEMENT_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
  "representante",
] as const satisfies readonly AppRole[];

export type RepresentativeActor = { id: string; role: string };
export type RepresentativeTarget = {
  id: string;
  role: string;
  responsible_seller_id: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function canAccessRepresentativeManagement(
  actor: RepresentativeActor,
  representative: RepresentativeTarget
) {
  if (representative.role !== "representante") return false;
  if (actor.role === "administrador" || actor.role === "gerente") return true;
  if (actor.role === "representante") return actor.id === representative.id;
  return (
    actor.role === "vendedor" &&
    representative.responsible_seller_id === actor.id
  );
}

export function canManageRepresentativeFinancials(role: string) {
  return role === "administrador" || role === "gerente";
}

export function canRecordRepresentativeCollection(
  actor: RepresentativeActor,
  representative: RepresentativeTarget
) {
  return (
    canManageRepresentativeFinancials(actor.role) ||
    (actor.role === "vendedor" &&
      representative.responsible_seller_id === actor.id)
  );
}

export function moneyToCents(value: unknown, field = "Valor") {
  const raw =
    typeof value === "number" || typeof value === "string"
      ? String(value).trim().replace(",", ".")
      : value !== null &&
          typeof value === "object" &&
          typeof (value as { toString?: unknown }).toString === "function"
        ? String(value).trim().replace(",", ".")
      : "";

  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${field} deve ser um valor não negativo com até 2 casas decimais.`);
  }

  const [integerPart, decimalPart = ""] = raw.split(".");
  return Number(integerPart) * 100 + Number(decimalPart.padEnd(2, "0"));
}

export function centsToMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

export function calculatePurchaseValues(
  quantityInput: unknown,
  unitPriceInput: unknown,
  shippingInput: unknown
) {
  const quantity = Number(quantityInput);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new Error("Quantidade deve ser um número inteiro positivo.");
  }

  const unitPriceCents = moneyToCents(unitPriceInput, "Valor unitário");
  const shippingCents = moneyToCents(shippingInput ?? 0, "Frete");
  const subtotalCents = quantity * unitPriceCents;

  if (
    !Number.isSafeInteger(subtotalCents + shippingCents) ||
    subtotalCents + shippingCents > 99_999_999_999_999
  ) {
    throw new Error("Valor total excede o limite suportado.");
  }

  return {
    quantity,
    unit_price: centsToMoney(unitPriceCents),
    subtotal: centsToMoney(subtotalCents),
    shipping_value: centsToMoney(shippingCents),
    total_value: centsToMoney(subtotalCents + shippingCents),
    totalCents: subtotalCents + shippingCents,
  };
}

function addMonths(dateOnly: string, months: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

export function buildInstallmentPlan(
  totalCents: number,
  installmentCountInput: unknown,
  firstDueDate: unknown
) {
  const installmentCount = Number(installmentCountInput);
  if (
    !Number.isSafeInteger(installmentCount) ||
    installmentCount <= 0 ||
    installmentCount > 120
  ) {
    throw new Error("Quantidade de parcelas deve estar entre 1 e 120.");
  }
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error("Total da compra é inválido.");
  }
  if (!isDateOnly(firstDueDate)) {
    throw new Error("Primeiro vencimento deve ser uma data válida.");
  }

  const base = Math.floor(totalCents / installmentCount);
  const remainder = totalCents % installmentCount;

  return Array.from({ length: installmentCount }, (_, index) => ({
    installment_number: index + 1,
    due_date: addMonths(firstDueDate, index),
    original_amount: centsToMoney(base + (index < remainder ? 1 : 0)),
  }));
}

export function applyPayment(
  originalAmount: unknown,
  alreadyReceived: unknown,
  paymentAmount: unknown
) {
  const originalCents = moneyToCents(originalAmount, "Valor original");
  const receivedCents = moneyToCents(alreadyReceived, "Valor já recebido");
  const paymentCents = moneyToCents(paymentAmount, "Valor recebido");

  if (paymentCents <= 0) throw new Error("Pagamento deve ser maior que zero.");
  if (receivedCents > originalCents) throw new Error("Parcela possui saldo inconsistente.");

  const remainingCents = originalCents - receivedCents;
  if (paymentCents > remainingCents) {
    throw new Error("Pagamento não pode ultrapassar o saldo da parcela.");
  }

  const newReceivedCents = receivedCents + paymentCents;
  return {
    payment_amount: centsToMoney(paymentCents),
    received_amount: centsToMoney(newReceivedCents),
    remaining_amount: centsToMoney(originalCents - newReceivedCents),
    status: newReceivedCents === originalCents ? "pago" : "parcialmente_pago",
  } as const;
}

function boundedPercent(realized: number, target: number) {
  if (target <= 0) return realized > 0 ? 100 : 0;
  return Math.max(0, Math.round((realized / target) * 10000) / 100);
}

export function calculateGoalProgress(input: {
  equipmentTarget: unknown;
  revenueTarget: unknown;
  equipmentRealized: unknown;
  revenueRealized: unknown;
}) {
  const equipmentTarget = Math.max(0, Number(input.equipmentTarget) || 0);
  const equipmentRealized = Math.max(0, Number(input.equipmentRealized) || 0);
  const revenueTarget = Math.max(0, Number(input.revenueTarget) || 0);
  const revenueRealized = Math.max(0, Number(input.revenueRealized) || 0);
  const equipmentPercent = boundedPercent(equipmentRealized, equipmentTarget);
  const revenuePercent = boundedPercent(revenueRealized, revenueTarget);
  const active = [equipmentTarget > 0 ? equipmentPercent : null, revenueTarget > 0 ? revenuePercent : null]
    .filter((value): value is number => value !== null);

  return {
    equipmentPercent,
    revenuePercent,
    percent: active.length
      ? Math.round((active.reduce((sum, value) => sum + value, 0) / active.length) * 100) / 100
      : 0,
  };
}

export function effectiveReceivableStatus(
  status: string,
  dueDate: string | Date,
  remainingAmount: unknown,
  now = new Date()
) {
  const remainingCents = moneyToCents(remainingAmount, "Saldo");
  if (remainingCents === 0 || status === "pago") return "pago";
  const dateOnly = dueDate instanceof Date
    ? dueDate.toISOString().slice(0, 10)
    : String(dueDate).slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (dateOnly < today) return "vencido";
  return status === "parcialmente_pago" ? "parcialmente_pago" : "pendente";
}

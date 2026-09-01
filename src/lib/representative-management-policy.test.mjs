import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPayment,
  buildInstallmentPlan,
  calculateGoalProgress,
  calculatePurchaseValues,
  canAccessRepresentativeManagement,
  canManageRepresentativeFinancials,
  canRecordRepresentativeCollection,
  effectiveReceivableStatus,
} from "./representative-management-policy.ts";

const representative = {
  id: "rep-a",
  role: "representante",
  responsible_seller_id: "seller-a",
};

test("administrador e gerente possuem acesso operacional completo", () => {
  for (const role of ["administrador", "gerente"]) {
    assert.equal(canAccessRepresentativeManagement({ id: role, role }, representative), true);
    assert.equal(canManageRepresentativeFinancials(role), true);
  }
});

test("representante acessa somente a própria gestão e não altera financeiro", () => {
  assert.equal(canAccessRepresentativeManagement({ id: "rep-a", role: "representante" }, representative), true);
  assert.equal(canAccessRepresentativeManagement({ id: "rep-b", role: "representante" }, representative), false);
  assert.equal(canManageRepresentativeFinancials("representante"), false);
});

test("vendedor acessa somente representantes vinculados e registra cobrança", () => {
  const seller = { id: "seller-a", role: "vendedor" };
  assert.equal(canAccessRepresentativeManagement(seller, representative), true);
  assert.equal(canRecordRepresentativeCollection(seller, representative), true);
  assert.equal(canManageRepresentativeFinancials("vendedor"), false);
  assert.equal(
    canAccessRepresentativeManagement(seller, { ...representative, responsible_seller_id: "seller-b" }),
    false
  );
});

test("outros perfis não acessam a gestão financeira", () => {
  for (const role of ["funcionario", "tecnico"]) {
    assert.equal(canAccessRepresentativeManagement({ id: role, role }, representative), false);
    assert.equal(canRecordRepresentativeCollection({ id: role, role }, representative), false);
  }
});

test("calcula compra em centavos e rejeita valores negativos", () => {
  assert.deepEqual(calculatePurchaseValues(3, "100.25", "20.10"), {
    quantity: 3,
    unit_price: "100.25",
    subtotal: "300.75",
    shipping_value: "20.10",
    total_value: "320.85",
    totalCents: 32085,
  });
  assert.throws(() => calculatePurchaseValues(1, -1, 0), /não negativo/);
  assert.throws(() => calculatePurchaseValues(1.5, 10, 0), /inteiro positivo/);
  assert.throws(() => calculatePurchaseValues(1_000_000, "999999999999.99", 0), /excede/);
});

test("divide parcelas sem perder centavos e avança vencimentos mensalmente", () => {
  const plan = buildInstallmentPlan(10000, 3, "2026-01-31");
  assert.deepEqual(plan, [
    { installment_number: 1, due_date: "2026-01-31", original_amount: "33.34" },
    { installment_number: 2, due_date: "2026-02-28", original_amount: "33.33" },
    { installment_number: 3, due_date: "2026-03-31", original_amount: "33.33" },
  ]);
  assert.equal(plan.reduce((sum, item) => sum + Number(item.original_amount), 0), 100);
});

test("pagamento parcial preserva saldo e pagamento excedente é bloqueado", () => {
  assert.deepEqual(applyPayment("100.00", "20.00", "30.00"), {
    payment_amount: "30.00",
    received_amount: "50.00",
    remaining_amount: "50.00",
    status: "parcialmente_pago",
  });
  assert.equal(applyPayment("100.00", "50.00", "50.00").status, "pago");
  assert.equal(applyPayment({ toString: () => "100.00" }, { toString: () => "20.00" }, "10.00").remaining_amount, "70.00");
  assert.throws(() => applyPayment("100.00", "90.00", "10.01"), /ultrapassar/);
});

test("calcula progresso e identifica vencimento sem apagar histórico", () => {
  assert.deepEqual(
    calculateGoalProgress({ equipmentTarget: 10, revenueTarget: 1000, equipmentRealized: 5, revenueRealized: 750 }),
    { equipmentPercent: 50, revenuePercent: 75, percent: 62.5 }
  );
  assert.equal(effectiveReceivableStatus("pendente", "2026-08-01", "10.00", new Date("2026-09-01T12:00:00Z")), "vencido");
  assert.equal(effectiveReceivableStatus("pago", "2026-08-01", "0.00", new Date("2026-09-01T12:00:00Z")), "pago");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateQuoteValues,
  buildQuoteStatusEvent,
  canCreateQuoteForClient,
  canDeleteQuote,
  canEditQuoteStructure,
  canGenerateOrder,
  canManageQuote,
  canTransitionQuoteStatus,
  canUseQuotes,
  canViewQuote,
  isOpportunityCompatible,
  isQuoteExpired,
  unexpectedQuoteInputField,
  validateOrderConversion,
} from "./quote-policy.ts";
import { hasValidRepresentativeAccess } from "./representative-access.ts";

const ownQuote = { created_by: "seller-a", responsible_id: "seller-a" };
const linkedRepresentativeQuote = {
  created_by: "rep-a",
  responsible_id: "rep-a",
  creator: { role: "representante", responsible_seller_id: "seller-a" },
};

test("administrador e gerente veem todos os orçamentos", () => {
  for (const role of ["administrador", "gerente"]) {
    assert.equal(canViewQuote({ id: role, role }, ownQuote), true);
  }
});

test("vendedor vê e gerencia os próprios orçamentos", () => {
  const seller = { id: "seller-a", role: "vendedor" };
  assert.equal(canViewQuote(seller, ownQuote), true);
  assert.equal(canManageQuote(seller, ownQuote), true);
});

test("vendedor vê orçamento do representante vinculado sem ganhar edição", () => {
  const seller = { id: "seller-a", role: "vendedor" };
  assert.equal(canViewQuote(seller, linkedRepresentativeQuote), true);
  assert.equal(canManageQuote(seller, linkedRepresentativeQuote), false);
});

test("representante vê somente os próprios orçamentos", () => {
  const rep = { id: "rep-a", role: "representante" };
  assert.equal(canViewQuote(rep, linkedRepresentativeQuote), true);
  assert.equal(canViewQuote(rep, ownQuote), false);
});

test("funcionário e técnico são bloqueados do módulo", () => {
  assert.equal(canUseQuotes("funcionario"), false);
  assert.equal(canUseQuotes("tecnico"), false);
});

test("calcula múltiplos itens, descontos e frete em centavos", () => {
  const result = calculateQuoteValues(
    [
      { item_type: "product", item_name: "Produto", quantity: "2", unit_price: "100.25", discount_value: "0.50" },
      { item_type: "custom", item_name: "Serviço", quantity: "1.50", unit_price: "20.00", discount_value: "0" },
    ],
    "10.00",
    "15.00"
  );
  assert.equal(result.subtotal, "230.00");
  assert.equal(result.total_value, "235.00");
  assert.equal(result.items[0].total_value, "200.00");
});

test("bloqueia descontos inválidos, frete negativo, NaN e Infinity", () => {
  const item = [{ item_type: "custom", item_name: "Item", quantity: 1, unit_price: 10, discount_value: 11 }];
  assert.throws(() => calculateQuoteValues(item, 0, 0), /não pode superar/);
  assert.throws(() => calculateQuoteValues([{ ...item[0], discount_value: 0 }], 0, -1), /número válido/);
  assert.throws(() => calculateQuoteValues([{ ...item[0], discount_value: 0 }], 0, Number.NaN), /número válido/);
  assert.throws(() => calculateQuoteValues([{ ...item[0], discount_value: 0 }], 0, Number.POSITIVE_INFINITY), /número válido/);
});

test("bloqueia transições de status inválidas", () => {
  assert.equal(canTransitionQuoteStatus("draft", "sent"), true);
  assert.equal(canTransitionQuoteStatus("sent", "approved"), true);
  assert.equal(canTransitionQuoteStatus("approved", "draft"), false);
  assert.equal(canTransitionQuoteStatus("draft", "approved"), false);
});

test("identifica orçamento vencido sem considerar o dia atual como vencido", () => {
  const now = new Date("2026-08-31T18:00:00.000Z");

  assert.equal(isQuoteExpired("2026-08-30", now), true);
  assert.equal(isQuoteExpired("2026-08-31", now), false);
  assert.equal(isQuoteExpired("2026-09-01", now), false);
  assert.equal(isQuoteExpired(null, now), false);
});

test("preserva histórico ao bloquear hard delete fora de rascunho", () => {
  assert.equal(canDeleteQuote("draft", null), true);
  assert.equal(canDeleteQuote("sent", null), false);
  assert.equal(canDeleteQuote("approved", null), false);
  assert.equal(canDeleteQuote("draft", "order-a"), false);
});

test("geração de pedido exige aprovação e impede duplicidade", () => {
  assert.equal(canGenerateOrder("draft", null), false);
  assert.equal(canGenerateOrder("approved", null), true);
  assert.equal(canGenerateOrder("approved", "order-a"), false);
});

test("created_by e campos calculados não podem ser forjados", () => {
  assert.equal(unexpectedQuoteInputField({ client_id: "a", created_by: "forjado" }), "created_by");
  assert.equal(unexpectedQuoteInputField({ client_id: "a", subtotal: 999 }), "subtotal");
  assert.equal(unexpectedQuoteInputField({ client_id: "a", items: [] }), null);
});

test("orçamento só pode ser criado para cliente acessível", () => {
  assert.equal(canCreateQuoteForClient(true), true);
  assert.equal(canCreateQuoteForClient(false), false);
});

test("oportunidade precisa pertencer ao mesmo cliente e estar acessível", () => {
  assert.equal(isOpportunityCompatible({ client_id: "client-a" }, "client-a", true), true);
  assert.equal(isOpportunityCompatible({ client_id: "client-b" }, "client-a", true), false);
  assert.equal(isOpportunityCompatible({ client_id: "client-a" }, "client-a", false), false);
});

test("orçamento enviado bloqueia alteração estrutural dos itens", () => {
  assert.equal(canEditQuoteStructure("draft"), true);
  assert.equal(canEditQuoteStructure("sent"), false);
  assert.equal(canEditQuoteStructure("approved"), false);
});

test("orçamento aprovado e enviado não podem ser excluídos", () => {
  assert.equal(canDeleteQuote("approved", null), false);
  assert.equal(canDeleteQuote("sent", null), false);
});

test("histórico descreve e preserva a mudança de status", () => {
  assert.deepEqual(buildQuoteStatusEvent("sent", "approved"), {
    type: "status_approved",
    description: "Orçamento aprovado.",
    previous_status: "sent",
    new_status: "approved",
  });
});

test("conversão bloqueia orçamento antes da aprovação", () => {
  const result = validateOrderConversion("sent", null, [
    { item_type: "product", product_id: "product-a", quantity: 1 },
  ]);
  assert.equal(result.allowed, false);
});

test("conversão bloqueia segundo pedido", () => {
  const result = validateOrderConversion("approved", "order-a", [
    { item_type: "product", product_id: "product-a", quantity: 1 },
  ]);
  assert.equal(result.allowed, false);
});

test("conversão permite vários itens no mesmo pedido", () => {
  const result = validateOrderConversion("approved", null, [
    { item_type: "product", product_id: "product-a", quantity: 2 },
    { item_type: "equipment", product_id: null, quantity: 1 },
    { item_type: "custom", product_id: null, quantity: 1.5 },
  ]);
  assert.equal(result.allowed, true);
  assert.equal(result.itemCount, 3);
});

test("conversão exige quantidade inteira para produto e equipamento", () => {
  const product = validateOrderConversion("approved", null, [
    { item_type: "product", product_id: "product-a", quantity: 1.5 },
  ]);
  const equipment = validateOrderConversion("approved", null, [
    { item_type: "equipment", product_id: null, quantity: 2.25 },
  ]);
  assert.equal(product.allowed, false);
  assert.equal(equipment.allowed, false);
});

test("representante sem vendedor válido continua bloqueado", () => {
  assert.equal(
    hasValidRepresentativeAccess(
      { role: "representante", responsible_seller_id: null },
      null
    ),
    false
  );
});

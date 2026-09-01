import assert from "node:assert/strict";
import test from "node:test";
import {
  canAttachOrderNf,
  canDeleteAssembly,
  canDeleteComponent,
  canDeleteOrder,
  canDeleteProducts,
  canManageOpportunityRecord,
  canReadProducts,
  canReadSuppliers,
  canReviewRepresentative,
  canUnifyComponents,
  canUpdateOrderStatus,
  canWriteProducts,
  canWriteSuppliers,
} from "./permissions.ts";

test("somente administrador e gerente podem anexar NF ao pedido", () => {
  for (const role of ["administrador", "gerente"]) {
    assert.equal(canAttachOrderNf(role), true, role);
  }

  for (const role of ["vendedor", "funcionario", "tecnico", "representante"]) {
    assert.equal(canAttachOrderNf(role), false, role);
  }
});

test("representante lê produtos sem receber escrita ou exclusão", () => {
  assert.equal(canReadProducts("representante"), true);
  assert.equal(canWriteProducts("representante"), false);
  assert.equal(canDeleteProducts("representante"), false);
});

test("técnico lê fornecedores sem receber escrita", () => {
  assert.equal(canReadSuppliers("tecnico"), true);
  assert.equal(canWriteSuppliers("tecnico"), false);
});

test("somente administrador pode excluir pedido", () => {
  assert.equal(canDeleteOrder("administrador"), true);

  for (const role of [
    "gerente",
    "vendedor",
    "funcionario",
    "tecnico",
    "representante",
  ]) {
    assert.equal(canDeleteOrder(role), false, role);
  }
});

test("status do pedido corresponde às roles que recebem o controle", () => {
  for (const role of ["administrador", "gerente", "vendedor"]) {
    assert.equal(canUpdateOrderStatus(role), true, role);
  }

  for (const role of ["funcionario", "tecnico", "representante"]) {
    assert.equal(canUpdateOrderStatus(role), false, role);
  }
});

test("técnico não recebe ações administrativas ocultadas", () => {
  assert.equal(canDeleteComponent("tecnico"), false);
  assert.equal(canDeleteAssembly("tecnico"), false);
  assert.equal(canUnifyComponents("tecnico"), false);
});

test("visualização de subordinado não concede alteração direta da oportunidade", () => {
  assert.equal(
    canManageOpportunityRecord(
      { id: "seller-a", role: "vendedor" },
      { created_by: "rep-a", responsible_id: "rep-a" }
    ),
    false
  );
  assert.equal(
    canManageOpportunityRecord(
      { id: "seller-a", role: "vendedor" },
      { created_by: "rep-a", responsible_id: "seller-a" }
    ),
    true
  );
});

test("vendedor só avalia representante sob sua responsabilidade", () => {
  const reviewer = { id: "seller-a", role: "vendedor" };

  assert.equal(
    canReviewRepresentative(reviewer, {
      role: "representante",
      responsible_seller_id: "seller-a",
    }),
    true
  );
  assert.equal(
    canReviewRepresentative(reviewer, {
      role: "representante",
      responsible_seller_id: "seller-b",
    }),
    false
  );
  assert.equal(
    canReviewRepresentative(reviewer, {
      role: "funcionario",
      responsible_seller_id: "seller-a",
    }),
    false
  );
});

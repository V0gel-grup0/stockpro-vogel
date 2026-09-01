import assert from "node:assert/strict";
import test from "node:test";
import { hasValidRepresentativeAccess } from "./representative-access.ts";

const representative = {
  role: "representante",
  responsible_seller_id: "seller-a",
};

test("permite representante aprovado vinculado a vendedor aprovado", () => {
  assert.equal(
    hasValidRepresentativeAccess(representative, {
      id: "seller-a",
      role: "vendedor",
      status: "approved",
    }),
    true
  );
});

test("bloqueia representante sem responsible_seller_id", () => {
  assert.equal(
    hasValidRepresentativeAccess(
      { role: "representante", responsible_seller_id: null },
      null
    ),
    false
  );
});

test("bloqueia representante quando o vendedor não existe", () => {
  assert.equal(hasValidRepresentativeAccess(representative, null), false);
});

test("bloqueia representante vinculado a responsável que não é vendedor", () => {
  assert.equal(
    hasValidRepresentativeAccess(representative, {
      id: "seller-a",
      role: "gerente",
      status: "approved",
    }),
    false
  );
});

test("bloqueia representante vinculado a vendedor não aprovado", () => {
  assert.equal(
    hasValidRepresentativeAccess(representative, {
      id: "seller-a",
      role: "vendedor",
      status: "pending",
    }),
    false
  );
});

test("não exige vendedor responsável das demais roles", () => {
  for (const role of [
    "administrador",
    "gerente",
    "vendedor",
    "funcionario",
    "tecnico",
  ]) {
    assert.equal(
      hasValidRepresentativeAccess(
        { role, responsible_seller_id: null },
        null
      ),
      true,
      role
    );
  }
});

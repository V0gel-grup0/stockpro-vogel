import assert from "node:assert/strict";
import test from "node:test";
import { canViewClientSnapshot } from "./client-visibility-policy.ts";

const seller = { id: "seller-a", role: "vendedor" };
const representative = { id: "rep-a", role: "representante" };

test("vendedor vê cliente criado por representante vinculado", () => {
  assert.equal(
    canViewClientSnapshot(seller, {
      created_by: "rep-a",
      creator: {
        role: "representante",
        responsible_seller_id: "seller-a",
      },
      opportunities: [],
    }),
    true
  );
});

test("vendedor não vê cliente de representante não vinculado", () => {
  assert.equal(
    canViewClientSnapshot(seller, {
      created_by: "rep-b",
      creator: {
        role: "representante",
        responsible_seller_id: "seller-b",
      },
      opportunities: [],
    }),
    false
  );
});

test("cliente próprio continua visível sem oportunidade CRM", () => {
  assert.equal(
    canViewClientSnapshot(representative, {
      created_by: "rep-a",
      creator: {
        role: "representante",
        responsible_seller_id: "seller-a",
      },
      opportunities: [],
    }),
    true
  );
});

test("summary permanece bloqueado para cliente fora do ownership", () => {
  assert.equal(
    canViewClientSnapshot(representative, {
      created_by: "rep-b",
      creator: {
        role: "representante",
        responsible_seller_id: "seller-b",
      },
      opportunities: [],
    }),
    false
  );
});

test("oportunidade própria também concede visibilidade do cliente", () => {
  assert.equal(
    canViewClientSnapshot(seller, {
      created_by: null,
      opportunities: [
        { created_by: "seller-a", responsible_id: null },
      ],
    }),
    true
  );
});

test("vendedor vê cliente vinculado por oportunidade ou pedido do representante", () => {
  const representativeProfile = {
    role: "representante",
    responsible_seller_id: "seller-a",
  };

  assert.equal(
    canViewClientSnapshot(seller, {
      created_by: null,
      opportunities: [
        {
          created_by: "rep-a",
          responsible_id: "rep-a",
          creator: representativeProfile,
          responsible: representativeProfile,
        },
      ],
    }),
    true
  );
  assert.equal(
    canViewClientSnapshot(seller, {
      created_by: null,
      opportunities: [],
      orders: [
        { created_by: "rep-a", creator: representativeProfile },
      ],
    }),
    true
  );
});

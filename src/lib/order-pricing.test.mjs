import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrderValues, isCeltEquipment } from "./order-pricing.ts";

test("pedido soma quantidade × valor unitário mais frete em centavos", () => {
  assert.deepEqual(calculateOrderValues(3, 199.90, 25), { quantity: 3, unit_price: 199.9, total_value: 599.7, shipping_value: 25, grand_total: 624.7 });
  assert.equal(calculateOrderValues(3, 0.1, 0.2).grand_total, 0.5);
  assert.equal(calculateOrderValues(2, 1.005).total_value, 2.02);
});
test("pedido aceita valor zero e rejeita quantidade fracionada e valores inválidos", () => {
  assert.equal(calculateOrderValues(1, 0).grand_total, 0);
  for (const args of [[0, 10], [-1, 10], [1.5, 10], [NaN, 10], [2, -1], [2, Infinity], [1, 10, -1], [1, 10, NaN], [Number.MAX_SAFE_INTEGER, 100]]) assert.throws(() => calculateOrderValues(...args));
});
test("somente equipamentos CELT são encaminhados à montagem", () => {
  for (const name of ["Celt5000 - 220V 1 turbina", "Celt5000 Plus - 380V 2 turbinas + Mínima", "CeltPlus - 220V"]) {
    assert.equal(isCeltEquipment("equipamento", name), true);
    assert.equal(isCeltEquipment("equipment", name), true);
    assert.equal(isCeltEquipment("produto", name), false);
  }
  assert.equal(isCeltEquipment("equipamento", "Dimmer Vogel"), false);
});

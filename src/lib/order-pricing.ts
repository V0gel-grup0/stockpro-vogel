export function calculateOrderValues(quantity: unknown, unitPrice: unknown, shipping: unknown = 0) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const freight = Number(shipping === "" ? 0 : shipping ?? 0);
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 2_147_483_647) throw new Error("Informe uma quantidade inteira válida.");
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(freight) || freight < 0) {
    throw new Error("Informe valores válidos, sem números negativos.");
  }
  const priceCents = Math.round((price + Number.EPSILON) * 100);
  const freightCents = Math.round((freight + Number.EPSILON) * 100);
  const subtotalCents = priceCents * qty;
  if (!Number.isSafeInteger(subtotalCents + freightCents)) throw new Error("Valor do pedido acima do limite.");
  return { quantity: qty, unit_price: priceCents / 100, total_value: subtotalCents / 100, shipping_value: freightCents / 100, grand_total: (subtotalCents + freightCents) / 100 };
}

export function isCeltEquipment(itemType: string, equipmentName: string) {
  return ["equipamento", "equipment"].includes(itemType) && /^celt(?:5000|plus)(?:\b|\s)/i.test(equipmentName.trim());
}

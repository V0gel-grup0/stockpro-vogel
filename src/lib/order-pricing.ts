export function calculateOrderValues(quantity: unknown, unitPrice: unknown, shipping: unknown = 0, discount: unknown = 0) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const rebate = Number(discount === "" ? 0 : discount ?? 0);
  const freight = Number(shipping === "" ? 0 : shipping ?? 0);
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 2_147_483_647) throw new Error("Informe uma quantidade inteira válida.");
  if (!Number.isFinite(rebate) || rebate < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(freight) || freight < 0) {
    throw new Error("Informe valores válidos, sem números negativos.");
  }
  const priceCents = Math.round((price + Number.EPSILON) * 100);
  const freightCents = Math.round((freight + Number.EPSILON) * 100);
  const discountCents = Math.round((rebate + Number.EPSILON) * 100);
  const subtotalCents = priceCents * qty;
  if (!Number.isSafeInteger(subtotalCents + freightCents)) throw new Error("Valor do pedido acima do limite.");
  if (discountCents > subtotalCents) throw new Error("Desconto não pode superar o subtotal dos itens.");
  return { discount_value: discountCents / 100, subtotal: subtotalCents / 100, quantity: qty, unit_price: priceCents / 100, total_value: (subtotalCents - discountCents) / 100, shipping_value: freightCents / 100, grand_total: (subtotalCents - discountCents + freightCents) / 100 };
}

export function isCeltEquipment(itemType: string, equipmentName: string) {
  return ["equipamento", "equipment"].includes(itemType) && /^celt(?:5000|plus)(?:\b|\s)/i.test(equipmentName.trim());
}

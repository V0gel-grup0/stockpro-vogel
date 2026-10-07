import type { Prisma } from "@/generated/prisma/client";

export function companionEquipment(equipment: string): string | null {
  if (!/^celt5000\s+plus\b/i.test(equipment.trim())) return null;
  const voltage = equipment.match(/\b(220|380)\s*v\b/i)?.[1];
  if (!voltage) throw new Error(`Voltagem inválida ou não informada em ${equipment}. Selecione 220V ou 380V.`);
  return `CeltPlus - ${voltage}V`;
}

// Both equipment deductions and their audit records belong to the caller's transaction.
export async function exitMountedEquipment(tx: Prisma.TransactionClient, equipment: string, quantity: number, context: { orderId: string; orderNumber: unknown; profileId: string; notes: string }) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`Quantidade inválida para ${equipment}.`);
  const companion = companionEquipment(equipment);
  const movements = [];
  for (const name of [equipment, ...(companion ? [companion] : [])]) {
    const result = await tx.mounted_equipments.updateMany({
      where: { equipment_name: name, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity }, updated_at: new Date() },
    });
    if (result.count !== 1) throw new Error(`Estoque insuficiente de equipamento montado: ${name}. Necessário: ${quantity}. Nenhuma saída foi salva.`);
    const note = name === equipment
      ? context.notes || `Saída automática pelo pedido #${context.orderNumber} - ${equipment}`
      : `Baixa automática de ${name} junto com ${equipment}, pedido #${context.orderNumber}${context.notes ? ` - ${context.notes}` : ""}`;
    movements.push(await tx.movements.create({ data: {
      type: "saida", item_type: "equipamento", item_kind: "equipamento",
      item_id: null, product_id: null, item_name: name, quantity, notes: note,
      created_by: context.profileId || null, order_id: context.orderId,
    } }));
  }
  return movements;
}

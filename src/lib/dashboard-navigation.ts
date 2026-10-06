export function isLowStockProduct(product: { quantity?: unknown; min_stock?: unknown }) {
  return Number(product.quantity || 0) <= Number(product.min_stock || 0);
}

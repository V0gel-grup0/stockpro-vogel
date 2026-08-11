export function toJsonSafe(value: any): any {
  if (typeof value === "bigint") return Number(value);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      return value.toNumber();
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]));
  }
  return value;
}

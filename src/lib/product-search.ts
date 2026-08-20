import type { Product } from "./types";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function matchesProduct(product: Product, query: string): boolean {
  const normalized = normalize(query);
  if (!normalized) return true;
  const code = normalize(product.code);
  if (/^\d{6,}$/.test(normalized)) return code === normalized;
  return code.includes(normalized) || normalize(product.description).includes(normalized);
}

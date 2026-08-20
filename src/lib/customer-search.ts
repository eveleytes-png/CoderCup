import type { Customer } from "./types";

export function matchesCustomer(customer: Customer, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return [customer.legalName, customer.commercialName, customer.cuit].some((value) => normalize(value).includes(needle));
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

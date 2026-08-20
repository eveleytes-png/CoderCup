import type { Customer } from "./types";

export type CustomerAction = "whatsapp" | "phone" | "email";

export function customerActionUrl(customer: Customer, action: CustomerAction): string | null {
  if (action === "whatsapp") {
    const number = customer.whatsapp.replace(/\D/g, "");
    return number ? `https://wa.me/${number}` : null;
  }
  if (action === "phone") {
    const number = customer.phone.replace(/[^\d+]/g, "");
    return number ? `tel:${number}` : null;
  }
  const email = customer.email.trim();
  return email ? `mailto:${email}` : null;
}

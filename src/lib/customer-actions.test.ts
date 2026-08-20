import { describe, expect, it } from "vitest";
import { customerActionUrl } from "./customer-actions";
import type { Customer } from "./types";

const customer: Customer = { id: "1", legalName: "Cliente", commercialName: "", cuit: "", address: "", phone: "+54 11 4444-5555", whatsapp: "+54 9 11 6666-7777", email: "ventas@example.com", contactPerson: "Ana", notes: "" };

describe("acciones rápidas del cliente", () => {
  it("genera enlaces seguros para WhatsApp, llamada y mail", () => {
    expect(customerActionUrl(customer, "whatsapp")).toBe("https://wa.me/5491166667777");
    expect(customerActionUrl(customer, "phone")).toBe("tel:+541144445555");
    expect(customerActionUrl(customer, "email")).toBe("mailto:ventas@example.com");
  });
  it("deshabilita la acción si falta el dato", () => expect(customerActionUrl({ ...customer, whatsapp: "" }, "whatsapp")).toBeNull());
});

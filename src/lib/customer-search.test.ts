import { describe, expect, it } from "vitest";
import { matchesCustomer } from "./customer-search";
import type { Customer } from "./types";

const customer: Customer = { id: "1", legalName: "Ferretería López S.A.", commercialName: "El Tornillo", cuit: "30-12345678-9", address: "", phone: "", whatsapp: "", email: "", contactPerson: "", notes: "" };

describe("búsqueda de clientes", () => {
  it("busca por razón social sin distinguir acentos", () => expect(matchesCustomer(customer, "ferreteria lopez")).toBe(true));
  it("busca por nombre comercial parcial", () => expect(matchesCustomer(customer, "tornill")).toBe(true));
  it("busca por CUIT", () => expect(matchesCustomer(customer, "12345678")).toBe(true));
  it("no usa otros campos", () => expect(matchesCustomer({ ...customer, phone: "555123" }, "555123")).toBe(false));
});

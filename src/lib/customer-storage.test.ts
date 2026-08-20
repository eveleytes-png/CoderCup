import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCustomer, loadCustomers, saveCustomer } from "./storage";
import type { Customer } from "./types";

const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});

describe("persistencia de clientes", () => {
  it("crea, actualiza y elimina usando la capa local existente", async () => {
    const customer: Customer = { id: "cliente-1", legalName: "Cliente Uno S.A.", commercialName: "Cliente Uno", cuit: "30-11111111-1", address: "Calle 1", phone: "111", whatsapp: "222", email: "uno@example.com", contactPerson: "Ana", notes: "Preferente" };
    expect(await saveCustomer(customer)).toEqual([customer]);
    expect(await loadCustomers()).toEqual([customer]);
    expect((await saveCustomer({ ...customer, phone: "333" }))[0].phone).toBe("333");
    expect(await deleteCustomer(customer.id)).toEqual([]);
    expect(await loadCustomers()).toEqual([]);
  });
});

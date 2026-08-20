import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProducts, resolveMissingProducts, setProductStatus, upsertImportedProducts } from "./storage";
import type { Product } from "./types";

const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});

function product(code: string): Product {
  return { id: `proveedor::${code}`, providerId: "proveedor", providerName: "Proveedor", code, description: `Producto ${code}`, listPrice: 100, priceStatus: "priced", currency: "ARS", quantityDiscounts: [], paymentDiscounts: [], imageUrl: null, imageSource: null, status: "active", importedAt: "2026-08-19T00:00:00.000Z" };
}

describe("productos desaparecidos", () => {
  it("elimina, descontinúa y permite reactivar sin alterar los restantes", async () => {
    const [keep, remove, discontinue] = [product("1"), product("2"), product("3")];
    await upsertImportedProducts([keep, remove, discontinue]);

    const resolved = await resolveMissingProducts({ [remove.id]: "delete", [discontinue.id]: "discontinue" });
    expect(resolved.map((item) => item.id)).toEqual([keep.id, discontinue.id]);
    expect(resolved.find((item) => item.id === discontinue.id)?.status).toBe("discontinued");

    const reactivated = await setProductStatus(discontinue, "active");
    expect(reactivated.find((item) => item.id === discontinue.id)?.status).toBe("active");
    expect(await loadProducts()).toEqual(reactivated);
  });
});

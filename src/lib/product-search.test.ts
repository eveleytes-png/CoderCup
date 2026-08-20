import { describe, expect, it } from "vitest";
import { matchesProduct } from "./product-search";
import type { Product } from "./types";

const product = (code: string, description: string) => ({ code, description } as Product);

describe("búsqueda de productos", () => {
  it("usa coincidencia exacta cuando se escribe un código completo", () => {
    expect(matchesProduct(product("283025", "CLAVO P PARIS"), "283025")).toBe(true);
    expect(matchesProduct(product("591917", "ALAMBRE ALTA RESISTENCIA"), "283025")).toBe(false);
  });

  it("mantiene búsquedas parciales por código y descripción", () => {
    expect(matchesProduct(product("283025", "CLAVO P PARIS"), "283")).toBe(true);
    expect(matchesProduct(product("591917", "MALLA GALVANIZADA"), "galvani")).toBe(true);
  });
});

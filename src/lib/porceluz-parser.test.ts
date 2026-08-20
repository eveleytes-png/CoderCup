import { File } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PORCELUZ_PLASTIC_PROVIDER, parsePorceluzExcel } from "./porceluz-parser";

function source(name: string, rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Hoja1");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([bytes], name);
}

describe("importador Porceluz", () => {
  it("importa la lista de plástico en ARS", async () => {
    const file = source("LISTA DE PLASTICO AGOSTO 2026 PROVISORIA.xlsx", [
      ["CAÑOS", null, null],
      ["CRG58", "CAÑO RIGIDO GRIS 5/8", 131],
      ["CU58", "CURVA GRIS 5/8", 107],
    ]);
    const result = await parsePorceluzExcel(file);
    expect(result.products.length).toBe(2);
    expect(result.products.every((product) => product.providerId === "porceluz-plastico" && product.providerName === "Porceluz Plástico")).toBe(true);
    expect(result.products.every((product) => product.currency === "ARS" && product.priceStatus === "priced")).toBe(true);
    expect(result.products.find((product) => product.code === "CRG58")?.description).toMatch(/CAÑO RIGIDO GRIS.*5\/8/i);
  });

  it("distingue A cotizar y USD en porcelana", async () => {
    const file = source("LISTA DE PORCELANA AGOSTO 2026 PROVISORIA.xlsx", [
      ["INTERCEPTORES", null, null],
      ["TZ25H", "TAZA PORCELANA", "A COTIZAR"],
      ["BNH00I", "BASE NORMAL PRECIO EN DÓLAR", 5.73],
    ]);
    const result = await parsePorceluzExcel(file);
    expect(result.products.length).toBe(2);
    expect(result.products.every((product) => product.providerId === "porceluz-porcelana" && product.providerName === "Porceluz Porcelana")).toBe(true);
    expect(result.products.filter((product) => product.priceStatus === "quote")).toHaveLength(1);
    expect(result.products.filter((product) => product.currency === "USD")).toHaveLength(1);
    expect(result.products.find((product) => product.code === "TZ25H")?.priceStatus).toBe("quote");
    expect(result.products.find((product) => product.code === "BNH00I")?.currency).toBe("USD");
  });

  it("respeta el proveedor elegido aunque el nombre del archivo sugiera otro", async () => {
    const file = source("LISTA PORCELANA CAMBIADA.xlsx", [["PL1", "PRODUCTO PLÁSTICO", 100]]);
    const result = await parsePorceluzExcel(file, PORCELUZ_PLASTIC_PROVIDER);
    expect(result.products[0].providerId).toBe("porceluz-plastico");
    expect(result.products[0].providerName).toBe("Porceluz Plástico");
  });
});

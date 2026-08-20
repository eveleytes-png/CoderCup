import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as XLSX from "xlsx";
import type { Product } from "./types";
import { buildCatalogExcel, buildCatalogPdf, catalogExcelHeaders, catalogExcelRows, catalogFilename, catalogProducts, publicPaymentDiscounts } from "./catalog-export";

const products: Product[] = [
  product({
    id: "lanus-alambres-sa::A1", providerId: "lanus-alambres-sa", providerName: "Lanús Alambres S.A.", code: "A1",
    description: "MALLA DE PRUEBA", quantityDiscounts: [{ minimumQuantity: 10, resultingPrice: 45000 }],
    paymentDiscounts: [{ label: "Bonificación 48,39%", discountPercent: 48.39, resultingPrice: 25805 }, { label: "Pago contado", discountPercent: 10, resultingPrice: 45000 }],
  }),
  product({
    id: "porceluz-plastico::P1", providerId: "porceluz-plastico", providerName: "Porceluz Plástico", code: "P1",
    description: "CAÑO DE PRUEBA", currency: "USD", listPrice: 25.5,
    quantityDiscounts: [{ minimumQuantity: 5, resultingPrice: 22 }],
    paymentDiscounts: [{ label: "transferencia", discountPercent: 5, resultingPrice: 24.23 }],
  }),
  product({ id: "porceluz-plastico::P2", providerId: "porceluz-plastico", providerName: "Porceluz Plástico", code: "P2", description: "NO PUBLICAR", status: "discontinued" }),
];

describe("generador de catálogos", () => {
  it("genera un PDF de dos proveedores con descuentos y excluye descontinuados", async () => {
    const selected = new Set(["lanus-alambres-sa", "porceluz-plastico"]);
    const pdfProviders = [
      { id: "lanus-alambres-sa", name: "Lanús Alambres S.A.", legalName: "Lanús Alambres S.A.", fantasyName: "Alambres Demo" },
      { id: "porceluz-plastico", name: "Porceluz Plástico", legalName: "Porceluz Plástico" },
    ];
    const covers = new Map<string, { bytes: Uint8Array; width: number; height: number }>();
    const productImages = new Map<string, { bytes: Uint8Array; width: number; height: number }>();
    if (process.env.WRITE_CATALOG_QA === "1") {
      const { readFile } = await import("node:fs/promises");
      try { covers.set("lanus-alambres-sa", { bytes: new Uint8Array(await readFile("tmp/pdfs/cover-qa.jpg")), width: 1000, height: 1410 }); } catch { /* La QA puede ejecutarse sin una portada de muestra. */ }
      try { productImages.set("lanus-alambres-sa::A1", { bytes: new Uint8Array(await readFile("tmp/pdfs/product-qa.jpg")), width: 240, height: 240 }); } catch { /* La QA puede ejecutarse sin una imagen de producto. */ }
    }
    const bytes = buildCatalogPdf(products, selected, pdfProviders, covers, { name: "Corredora Demo", imageUrl: null, phone: "", whatsapp: "11 1234", email: "demo@example.com" }, productImages);
    if (process.env.WRITE_CATALOG_QA === "1") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir("output/pdf", { recursive: true });
      await writeFile("output/pdf/catalogo-qa.pdf", bytes);
    }
    const document = await getDocument({ data: bytes }).promise;
    let text = "";
    for (let index = 1; index <= document.numPages; index += 1) {
      const content = await (await document.getPage(index)).getTextContent();
      text += content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
    }
    expect(document.numPages).toBe(4);
    expect(text).toContain("Alambres Demo");
    expect(text).toContain("Porceluz Plástico");
    expect(text).not.toContain("Otros descuentos disponibles:");
    expect(text).not.toContain("Bonificación 48,39%");
    expect(text).toContain("$ 45.000,00");
    expect(text).toContain("USD 25,50");
    expect(text).not.toContain("NO PUBLICAR");
    expect(text).not.toContain("1 productos");
  });

  it("agrega dos columnas de cantidad cuando al menos un producto tiene ese descuento", async () => {
    const rows = catalogExcelRows(products, new Set(["lanus-alambres-sa", "porceluz-plastico"]));
    expect(rows).toHaveLength(2);
    expect(rows[0]["Precio neto"]).toBe(50000);
    expect(rows[0]["Cantidad mínima"]).toBe(10);
    expect(rows[0]["Precio con descuento"]).toBe(45000);
    expect(rows[0]).not.toHaveProperty("Descuento por forma de pago");
    expect(Object.keys(rows[0])).toHaveLength(7);
    expect(catalogExcelHeaders(products, new Set(["lanus-alambres-sa", "porceluz-plastico"]))).toEqual(["Proveedor", "Código", "Descripción", "Precio neto", "Moneda", "Cantidad mínima", "Precio con descuento"]);
    const bytes = await buildCatalogExcel(products, new Set(["lanus-alambres-sa", "porceluz-plastico"]));
    expect(bytes.byteLength).toBeGreaterThan(1000);
    if (process.env.WRITE_CATALOG_QA === "1") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir("output/spreadsheets", { recursive: true });
      await writeFile("output/spreadsheets/catalogo-qa.xlsx", bytes);
    }
  });

  it("deja solo las cinco columnas básicas cuando no hay descuentos por cantidad", async () => {
    const withoutQuantityDiscounts = products.map((item) => ({ ...item, quantityDiscounts: [] }));
    const selected = new Set(["porceluz-plastico"]);
    const rows = catalogExcelRows(withoutQuantityDiscounts, selected);
    expect(catalogExcelHeaders(withoutQuantityDiscounts, selected)).toEqual(["Proveedor", "Código", "Descripción", "Precio neto", "Moneda"]);
    expect(Object.keys(rows[0])).toEqual(["Proveedor", "Código", "Descripción", "Precio neto", "Moneda"]);
    expect(rows[0]).not.toHaveProperty("Descuento por forma de pago");
    const bytes = await buildCatalogExcel(withoutQuantityDiscounts, selected);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    if (process.env.WRITE_CATALOG_QA === "1") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir("output/spreadsheets", { recursive: true });
      await writeFile("output/spreadsheets/catalogo-qa-sin-descuentos.xlsx", bytes);
    }
  });

  it("agrega el encabezado del corredor en la primera fila del Excel", async () => {
    const generatedAt = new Date("2026-08-19T12:00:00.000Z");
    const bytes = await buildCatalogExcel(products, new Set(["lanus-alambres-sa"]), { name: "Corredora Demo", imageUrl: null, phone: "", whatsapp: "", email: "" }, generatedAt);
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets.Productos;
    expect(sheet.A1.v).toBe("Catálogo de precios — Corredora Demo — 19/8/2026");
    expect(sheet.A2.v).toBe("Proveedor");
    expect(sheet["!merges"]).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }]);
    expect(sheet["!autofilter"]?.ref).toBe("A2:G3");
  });

  it("muestra el perfil solo en el pie de las páginas de productos", async () => {
    const bytes = buildCatalogPdf(products, new Set(["lanus-alambres-sa"]), [{ id: "lanus-alambres-sa", name: "Lanús Alambres S.A." }], new Map(), { name: "Corredora Demo", imageUrl: null, phone: "", whatsapp: "11 1234", email: "demo@example.com" });
    const document = await getDocument({ data: bytes }).promise;
    for (let index = 1; index <= document.numPages; index += 1) {
      const content = await (await document.getPage(index)).getTextContent();
      const text = content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
      if (index === 1) {
        expect(text).not.toContain("Corredora Demo");
        expect(text).not.toContain("WhatsApp: 11 1234");
      } else {
        expect(text).toContain("Corredora Demo");
        expect(text).toContain("WhatsApp: 11 1234");
        expect(text).toContain("demo@example.com");
      }
    }
  });

  it("oculta las columnas de cantidad en el PDF cuando no hay descuentos por cantidad", async () => {
    const withoutQuantityDiscounts = products.map((item) => ({ ...item, quantityDiscounts: [] }));
    const bytes = buildCatalogPdf(withoutQuantityDiscounts, new Set(["lanus-alambres-sa"]), [{ id: "lanus-alambres-sa", name: "Lanús Alambres S.A." }]);
    const document = await getDocument({ data: bytes }).promise;
    const content = await (await document.getPage(2)).getTextContent();
    const text = content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
    expect(text).not.toContain("Cant. mínima");
    expect(text).not.toContain("Precio descuento");
  });

  it("ordena alfabéticamente las descripciones dentro de cada proveedor solo en el PDF", async () => {
    const unsorted = [
      product({ id: "lanus-alambres-sa::Z1", providerId: "lanus-alambres-sa", providerName: "Lanús Alambres S.A.", code: "Z1", description: "ZINC" }),
      product({ id: "lanus-alambres-sa::A1", providerId: "lanus-alambres-sa", providerName: "Lanús Alambres S.A.", code: "A1", description: "ALAMBRE" }),
    ];
    const bytes = buildCatalogPdf(unsorted, new Set(["lanus-alambres-sa"]), [{ id: "lanus-alambres-sa", name: "Lanús Alambres S.A." }]);
    const document = await getDocument({ data: bytes }).promise;
    let text = "";
    for (let pageNumber = 2; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      text += content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
    }
    expect(text.indexOf("ALAMBRE")).toBeLessThan(text.indexOf("ZINC"));
    expect(unsorted.map((product) => product.description)).toEqual(["ZINC", "ALAMBRE"]);
  });

  it("solo incluye proveedores seleccionados y productos activos", () => {
    expect(catalogProducts(products, new Set(["porceluz-plastico"])).map((item) => item.code)).toEqual(["P1"]);
  });

  it("excluye bonificaciones internas de los descuentos públicos", () => {
    expect(publicPaymentDiscounts(products[0].paymentDiscounts).map((discount) => discount.label)).toEqual(["Pago contado"]);
  });

  it("genera el nombre de archivo con proveedores y fecha en formato día-mes-año", () => {
    const date = new Date(2026, 7, 19);
    expect(catalogFilename("pdf", ["Lanús Alambres S.A."], date)).toBe("Catalogo de precios - Lanús Alambres S.A. - 19-08-2026.pdf");
    expect(catalogFilename("xlsx", ["Lanús Alambres S.A.", "Porceluz Plástico"], date)).toBe("Catalogo de precios - Lanús Alambres S.A. + Porceluz Plástico - 19-08-2026.xlsx");
    expect(catalogFilename("xlsx", [], date)).toBe("Catalogo de precios - 19-08-2026.xlsx");
  });

  it("mantiene el nombre del proveedor en la portada cuando tiene una imagen", async () => {
    const provider = { id: "lanus-alambres-sa", name: "Lanús Alambres S.A.", fantasyName: "Alambres Demo" };
    const covers = new Map([[provider.id, { bytes: new Uint8Array([255, 216, 255, 217]), width: 1, height: 1 }]]);
    const bytes = buildCatalogPdf(products, new Set([provider.id]), [provider], covers);
    const document = await getDocument({ data: bytes }).promise;
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
    expect(text).toContain("Alambres Demo");
  });
});

function product(overrides: Partial<Product>): Product {
  return {
    id: "test::1", providerId: "test", providerName: "Test", code: "1", description: "Producto", listPrice: 50000,
    priceStatus: "priced", currency: "ARS", quantityDiscounts: [], paymentDiscounts: [], imageUrl: null, imageSource: null,
    status: "active", importedAt: "2026-08-19T00:00:00.000Z", ...overrides,
  };
}

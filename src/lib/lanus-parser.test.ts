import { readFile } from "node:fs/promises";
import { File } from "node:buffer";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { enrichLanusClavoDescription, groupPdfItems, parseLanusLines } from "./lanus-parser";
import { parseLanusExcel } from "./lanus-excel-parser";

const source = "C:/Users/Evelin/Downloads/lanus alambre.pdf";
const lostHeadCodes = ["240612", "240616", "270716", "270720", "270820", "270825", "270830", "270835", "270920", "270925", "270930", "2701025", "2701030", "2701035", "2701040", "2701230", "2701235", "2701240", "2701245", "2701250", "2701440", "2701450", "2701550", "2701663", "2701775"];

describe("importador Lanús", () => {
  it("extrae productos reales y mantiene la identidad proveedor + código", async () => {
    const bytes = new Uint8Array(await readFile(source));
    const document = await getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(groupPdfItems(content.items.filter((item) => "str" in item).map((item) => ({
        text: "str" in item ? item.str : "",
        x: "transform" in item ? item.transform[4] : 0,
        y: "transform" in item ? item.transform[5] : 0,
      }))));
    }
    const result = parseLanusLines(pages, "2026-08-19T00:00:00.000Z");
    expect(result.sourceDate).toBe("20/5/2026");
    expect(result.products.length).toBeGreaterThan(300);
    expect(new Set(result.products.map((product) => product.id)).size).toBe(result.products.length);
    expect(result.products.every((product) => product.id === `lanus-alambres-sa::${product.code}`)).toBe(true);
    expect(result.products.every((product) => product.listPrice > 0 && product.paymentDiscounts.length === 2)).toBe(true);
    expect(result.products.find((product) => product.code === "9501010")?.description).toMatch(/MALLA SOLDADA GALVANIZADA/i);
    expect(result.products.find((product) => product.code === "241612")?.description).toMatch(/CLAVO CABEZA CHATA.*6 X 12.*1,20mm/i);
    expect(result.products.find((product) => product.code === "240612")?.description).toMatch(/CLAVO CABEZA PERDIDA.*6 X 12.*1,20mm/i);
    expect(result.products.filter((product) => /^(?:240|270)/.test(product.code)).map((product) => product.code)).toEqual(lostHeadCodes);
    expect(result.products.find((product) => product.code === "270835")?.description).toMatch(/CLAVO CABEZA PERDIDA.*8 X 35.*1,40mm/i);
    expect(result.products.some((product) => product.code === "2701020")).toBe(false);
    const repeated = parseLanusLines(pages, "2026-08-20T00:00:00.000Z");
    expect(repeated.products.map((product) => product.id)).toEqual(result.products.map((product) => product.id));
  }, 30_000);

  it("lee la planilla habitual de actualización con descripciones completas", async () => {
    const bytes = await readFile("C:/Users/Evelin/Downloads/lanus excel.xlsx");
    const result = await parseLanusExcel(new File([bytes], "lanus excel.xlsx"));
    expect(result.products.length).toBe(1575);
    expect(result.skippedRows).toBe(8);
    expect(new Set(result.products.map((product) => product.id)).size).toBe(result.products.length);
    expect(result.products.find((product) => product.code === "591917")?.description).toBe("ALAMB. ALTA RESIST. 17/15 ARCELOMITAL-1000MTS (43 KG)");
    expect(result.products.find((product) => product.code === "9501010")?.description).toBe("MALLA SOLDADA GALVANIZADA 10x10 1.00X1.00");
    expect(result.products.find((product) => product.code === "241612")?.description).toBe("CLAVO CABEZA CHATA 6 X 12 1,20mm");
    expect(result.products.find((product) => product.code === "240612")?.description).toBe("CLAVO CABEZA PERDIDA 6 X 12 1,20mm");
    expect(result.products.filter((product) => /^(?:240|270)/.test(product.code)).map((product) => product.code)).toEqual(lostHeadCodes);
    expect(result.products.find((product) => product.code === "270835")?.description).toBe("CLAVO CABEZA PERDIDA 8 X 35 1,40mm");
    expect(result.products.some((product) => product.code === "2701020")).toBe(false);
    expect(result.products.find((product) => product.code === "2601020")).toMatchObject({
      description: "CLAVO CABEZA CHATA 10x20 1,63mm",
      listPrice: 0,
      priceStatus: "quote",
      paymentDiscounts: [],
    });
  });

  it("separa la variante correcta cuando el archivo une los encabezados de clavos", () => {
    expect(enrichLanusClavoDescription("2601025", "CLAVO CABEZA CHATA Y PERDIDA 10 X 25")).toBe("CLAVO CABEZA CHATA 10 X 25 1,63mm");
    expect(enrichLanusClavoDescription("2701025", "CLAVO CABEZA CHATA Y PERDIDA 10 X 25")).toBe("CLAVO CABEZA PERDIDA 10 X 25 1,63mm");
  });
});

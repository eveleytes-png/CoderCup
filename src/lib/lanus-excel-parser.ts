import type { ImportResult, Product } from "./types";
import { enrichLanusClavoDescription, LANUS_PROVIDER } from "./lanus-parser";

type ExcelRow = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function codeOf(value: unknown): string {
  return text(value).replace(/\.0+$/, "").replace(/\.$/, "");
}

function numberOf(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(text(value).replaceAll(".", "").replace(",", "."));
}

export async function parseLanusExcel(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ImportResult> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const preview = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, range: 0, blankrows: false });
    return preview.some((row) => Array.isArray(row) && row.map(text).includes("CODIGO PRODUCTO"));
  });
  if (!sheetName) throw new Error("El Excel no contiene la tabla esperada de Lanús.");

  const rows = xlsx.utils.sheet_to_json<ExcelRow>(workbook.Sheets[sheetName], { defval: null, raw: true });
  const importedAt = new Date().toISOString();
  const products: Product[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const code = codeOf(row["CODIGO PRODUCTO"]);
    const description = enrichLanusClavoDescription(code, text(row.ARTICULO));
    const listPrice = numberOf(row.PRECIO);
    const discount = numberOf(row.BONIFICACION);
    const discountedPrice = numberOf(row["PRECIO CON BONIFICACION"]);
    if (!code || !description) {
      skippedRows += 1;
      continue;
    }
    const hasPrice = Number.isFinite(listPrice) && listPrice > 0;
    const isClavoWithoutPrice = !hasPrice && /^CLAVO CABEZA\b/i.test(description);
    if (!hasPrice && !isClavoWithoutPrice) {
      skippedRows += 1;
      continue;
    }
    const hasDiscountedPrice = hasPrice && Number.isFinite(discountedPrice) && discountedPrice > 0;
    const discountPercent = hasDiscountedPrice
      ? (Number.isFinite(discount)
          ? Number(((discount > 1 ? discount : discount * 100)).toFixed(2))
          : Number(((1 - discountedPrice / listPrice) * 100).toFixed(2)))
      : 0;
    products.push({
      id: `${LANUS_PROVIDER.id}::${code}`,
      providerId: LANUS_PROVIDER.id,
      providerName: LANUS_PROVIDER.name,
      code,
      description,
      listPrice: hasPrice ? listPrice : 0,
      priceStatus: hasPrice ? "priced" : "quote",
      currency: "ARS",
      quantityDiscounts: [],
      paymentDiscounts: hasDiscountedPrice ? [{
        label: `Bonificación ${discountPercent}%`,
        discountPercent,
        resultingPrice: discountedPrice,
      }] : [],
      imageUrl: null,
      imageSource: null,
      status: "active",
      importedAt,
    });
  }
  const unique = new Map<string, Product>();
  for (const product of products) {
    if (!unique.has(product.id)) unique.set(product.id, product);
    else skippedRows += 1;
  }
  return { products: [...unique.values()], skippedRows, sourceDate: null };
}

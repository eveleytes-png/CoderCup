import type { ImportResult, Product } from "./types";

export const PORCELUZ_PLASTIC_PROVIDER = { id: "porceluz-plastico", name: "Porceluz Plástico" } as const;
export const PORCELUZ_PORCELAIN_PROVIDER = { id: "porceluz-porcelana", name: "Porceluz Porcelana" } as const;

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function parsePorceluzExcel(
  file: { name?: string; arrayBuffer(): Promise<ArrayBuffer> },
  selectedProvider?: typeof PORCELUZ_PLASTIC_PROVIDER | typeof PORCELUZ_PORCELAIN_PROVIDER,
): Promise<ImportResult> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const importedAt = new Date().toISOString();
  const normalizedRows: Array<{ code: string; description: string; priceValue: unknown }> = [];
  let skippedRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    for (const row of rows) {
      const code = text(row[0]);
      const description = text(row[1]);
      const priceValue = row[2];
      const isQuote = /A\s*COTIZAR/i.test(text(priceValue));
      const numericPrice = typeof priceValue === "number" ? priceValue : Number.NaN;
      if (!code || !description || (!isQuote && (!Number.isFinite(numericPrice) || numericPrice <= 0))) {
        if (code || description || priceValue != null) skippedRows += 1;
        continue;
      }
      normalizedRows.push({ code, description, priceValue });
    }
  }
  const filename = file.name ?? "";
  const isPorcelain = /PORCELANA/i.test(filename) || (!/PLASTICO/i.test(filename) && normalizedRows.some((row) => /A\s*COTIZAR/i.test(text(row.priceValue)) || /d[oó]lar/i.test(row.description)));
  const provider = selectedProvider ?? (isPorcelain ? PORCELUZ_PORCELAIN_PROVIDER : PORCELUZ_PLASTIC_PROVIDER);
  const products = new Map<string, Product>();
  for (const row of normalizedRows) {
    const isQuote = /A\s*COTIZAR/i.test(text(row.priceValue));
    const numericPrice = typeof row.priceValue === "number" ? row.priceValue : Number.NaN;
    const product: Product = {
      id: `${provider.id}::${row.code}`,
      providerId: provider.id,
      providerName: provider.name,
      code: row.code,
      description: row.description,
      listPrice: isQuote ? 0 : numericPrice,
      priceStatus: isQuote ? "quote" : "priced",
      currency: /d[oó]lar/i.test(row.description) ? "USD" : "ARS",
      quantityDiscounts: [],
      paymentDiscounts: [],
      imageUrl: null,
      imageSource: null,
      status: "active",
      importedAt,
    };
    if (!products.has(product.id)) products.set(product.id, product); else skippedRows += 1;
  }
  if (products.size === 0) throw new Error("El Excel no contiene productos con la estructura esperada de Porceluz.");
  return { products: [...products.values()], skippedRows, sourceDate: null };
}

export async function isLanusExcel(file: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<boolean> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.some((name) => {
    const rows = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, range: 0, blankrows: false });
    return rows.slice(0, 12).some((row) => row.some((cell) => text(cell).toUpperCase() === "CODIGO PRODUCTO"));
  });
}

import type { ImportResult, PaymentDiscount, Product } from "./types";

export const LANUS_PROVIDER = { id: "lanus-alambres-sa", name: "Lanús Alambres S.A." } as const;

type PositionedText = { text: string; x: number; y: number };
type TextLine = { text: string; items: PositionedText[] };

const moneyPattern = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})/g;
const codePattern = /^(\d{6,8})\.?\s+/;

function moneyToNumber(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/�/g, "°").trim();
}

const clavoCalibers = new Map([
  ["6", "1,20mm"], ["7", "1,30mm"], ["8", "1,40mm"], ["9", "1,50mm"], ["10", "1,63mm"],
  ["12", "1,80mm"], ["14", "2,20mm"], ["15", "2,50mm"], ["16", "2,70mm"], ["17", "3,25mm"],
]);

function clavoVariantFromCode(code: string): "CHATA" | "PERDIDA" | null {
  if (/^(?:240|270)\d+$/.test(code)) return "PERDIDA";
  if (/^(?:241|260)\d+$/.test(code)) return "CHATA";
  return null;
}

export function enrichLanusClavoDescription(code: string, value: string): string {
  const variant = clavoVariantFromCode(code);
  let description = clean(value).replace(
    /CLAVO\s+CABEZA\s+CHATA\s+Y\s+PERDIDA/i,
    variant ? `CLAVO CABEZA ${variant}` : "CLAVO CABEZA CHATA Y PERDIDA",
  );
  if (variant && /^\d{1,2}\s*[xX]\s*\d{2}\b/.test(description)) {
    description = `CLAVO CABEZA ${variant} ${description}`;
  }
  if (!/^(?:240|241|260|270)\d+$/.test(code) || !/CLAVO CABEZA (?:CHATA|PERDIDA)/i.test(description) || /\d[,.]\d{2}\s*mm/i.test(description)) return description;
  const measure = description.match(/\b(\d{1,2})\s*[xX]\s*(\d{2})\b/);
  const caliber = measure ? clavoCalibers.get(measure[1]) : undefined;
  return caliber ? clean(`${description} ${caliber}`) : description;
}

function clavoDescriptionFromCode(code: string): string {
  const match = code.match(/^(240|270)(\d{1,2})(\d{2})$/);
  if (!match) return "";
  const variant = match[1] === "240" || match[1] === "270" ? "PERDIDA" : "CHATA";
  return enrichLanusClavoDescription(code, `CLAVO CABEZA ${variant} ${Number(match[2])} X ${Number(match[3])}`);
}

function familyTitle(lines: TextLine[], rowIndex: number, x: number, rawDescription: string): string {
  let title = "";
  for (let index = rowIndex - 1; index >= Math.max(0, rowIndex - 20); index -= 1) {
    const line = lines[index];
    if (/^\s*(?:COD(?:IGO)?[.,]?\s*)?\d{1,3}(?:\s*\/\s*\d{1,3})?\s+[A-ZÁÉÍÓÚÑ]/i.test(line.text) && !/DESCRIPCION|MEDIDA|PRECIO/i.test(line.text)) {
      title = clean(line.text
        .replace(/^\s*(?:COD(?:IGO)?[.,]?\s*)?\d{1,3}(?:\s*\/\s*\d{1,3})?\s*/i, "")
        .replace(/PAGO NETO.*$/i, ""));
      if (title) break;
    }
  }
  if (/CLAVO CABEZA CHATA Y PERDIDA/i.test(title)) {
    const nearby = lines.slice(Math.max(0, rowIndex - 8), rowIndex);
    const variants = nearby.flatMap((line) => line.items)
      .filter((item) => /^(CHATA|PERDIDA)$/i.test(item.text))
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    if (variants[0]) title = `CLAVO CABEZA ${variants[0].text.toUpperCase()}`;
  }
  if (!title) return rawDescription;
  const titleWords = title.toUpperCase().split(/\s+/).filter((word) => word.length >= 5);
  const rawUpper = rawDescription.toUpperCase();
  if (titleWords.some((word) => rawUpper.includes(word.slice(0, -1)))) return rawDescription;
  return clean(`${title} ${rawDescription}`);
}

export function groupPdfItems(items: PositionedText[]): TextLine[] {
  const lines: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2.2);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines
    .map((line) => {
      const sorted = line.sort((a, b) => a.x - b.x);
      return { items: sorted, text: clean(sorted.map((item) => item.text).join(" ")) };
    })
    .filter((line) => line.text);
}

function findPaymentLabels(lines: TextLine[], rowIndex: number): string[] {
  for (let index = rowIndex - 1; index >= Math.max(0, rowIndex - 18); index -= 1) {
    const text = lines[index].text.toUpperCase();
    if (text.includes("CODIGO") && (text.includes("PRECIO") || text.includes("NATURAL") || text.includes("GALVANIZADO"))) {
      const nearby = lines.slice(Math.max(0, index - 5), index + 2).map((line) => line.text.toUpperCase()).join(" ");
      const dayMatches = [...nearby.matchAll(/(?:A\s+)?(\d{2})\s+D[IÍ]AS/g)].map((match) => `Pago a ${match[1]} días`);
      const labels = dayMatches.slice(-1);
      if (nearby.includes("CONTADO")) labels.push("Pago contado");
      return labels.length ? labels : ["Precio bonificado", "Pago contado"];
    }
  }
  return ["Precio bonificado", "Pago contado"];
}

function findPercentages(lines: TextLine[], rowIndex: number): Array<number | null> {
  const nearby = lines.slice(Math.max(0, rowIndex - 7), rowIndex).map((line) => line.text).join(" ");
  const values = [...nearby.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value > 0 && value < 100);
  return values.slice(-2).map((value) => value);
}

export function parseLanusLines(pages: TextLine[][], importedAt = new Date().toISOString()): ImportResult {
  const products = new Map<string, Product>();
  let skippedRows = 0;
  let sourceDate: string | null = null;

  for (const lines of pages) {
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index].text;
      if (!sourceDate) sourceDate = text.match(/FECHA DE LA LISTA\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? null;
      const codeItems = lines[index].items.filter((item) => /^\d{6,8}\.?$/.test(item.text.trim()));
      const codeMatch = text.match(codePattern);
      if (!codeMatch && codeItems.length === 0) continue;
      if (/SIN STOCK/i.test(text)) {
        skippedRows += 1;
        continue;
      }
      const segments = codeItems.length > 0 ? codeItems.map((codeItem, itemIndex) => ({
        code: codeItem.text.replace(/\.$/, ""),
        x: codeItem.x,
        text: clean(lines[index].items
          .filter((item) => item.x >= codeItem.x && (itemIndex === codeItems.length - 1 || item.x < codeItems[itemIndex + 1].x))
          .map((item) => item.text).join(" ")),
      })) : [{ code: codeMatch?.[1] ?? codeItems[0].text.replace(/\.$/, ""), x: codeItems[0]?.x ?? 0, text }];

      let sharedRowDescription = "";
      for (const [segmentIndex, segment] of segments.entries()) {
        const segmentCodeMatch = segment.text.match(codePattern);
        const amounts = [...segment.text.matchAll(moneyPattern)];
        if (!segmentCodeMatch || amounts.length < 3) continue;
        const selected = amounts.slice(-3);
        const ownDescription = clean(segment.text.slice(segmentCodeMatch[0].length, selected[0].index));
        if (segmentIndex === 0 && ownDescription) sharedRowDescription = ownDescription;
        const rawDescription = ownDescription || sharedRowDescription || clavoDescriptionFromCode(segment.code);
        const description = enrichLanusClavoDescription(segment.code, familyTitle(lines, index, segment.x, rawDescription));
        if (!description || description.length < 2) continue;
        const [listPrice, alternatePrice, cashPrice] = selected.map((match) => moneyToNumber(match[0]));
        if (![listPrice, alternatePrice, cashPrice].every((price) => Number.isFinite(price) && price > 0)) continue;

      const labels = findPaymentLabels(lines, index);
      const percentages = findPercentages(lines, index);
      const paymentDiscounts: PaymentDiscount[] = [alternatePrice, cashPrice].map((resultingPrice, paymentIndex) => ({
        label: labels[paymentIndex] ?? (paymentIndex === 0 ? "Precio bonificado" : "Pago contado"),
        discountPercent: percentages[paymentIndex] ?? Number(((1 - resultingPrice / listPrice) * 100).toFixed(2)),
        resultingPrice,
      }));

        products.set(segment.code, {
        id: `${LANUS_PROVIDER.id}::${segment.code}`,
        providerId: LANUS_PROVIDER.id,
        providerName: LANUS_PROVIDER.name,
        code: segment.code,
        description,
        listPrice,
        priceStatus: "priced",
        currency: "ARS",
        quantityDiscounts: [],
        paymentDiscounts,
        imageUrl: null,
        imageSource: null,
        status: "active",
        importedAt,
        });
      }
    }
  }
  return { products: [...products.values()], skippedRows, sourceDate };
}

export async function parseLanusPdf(file: File): Promise<ImportResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: TextLine[][] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && "transform" in item)
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }));
    pages.push(groupPdfItems(items));
  }
  return parseLanusLines(pages);
}

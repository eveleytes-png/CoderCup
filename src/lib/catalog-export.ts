import type { BrokerProfile, PaymentDiscount, Product, Provider, QuantityDiscount } from "./types";

export const catalogProviders = [
  { id: "lanus-alambres-sa", name: "Lanús Alambres S.A." },
  { id: "porceluz-plastico", name: "Porceluz Plástico" },
  { id: "porceluz-porcelana", name: "Porceluz Porcelana" },
] as const;

export type CatalogProviderId = typeof catalogProviders[number]["id"];
export type CatalogFormat = "pdf" | "xlsx";
const descriptionCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function catalogProducts(products: Product[], providerIds: ReadonlySet<string>): Product[] {
  return products.filter((product) => providerIds.has(product.providerId) && product.status === "active" && !["sin_stock", "out_of_stock"].includes(String(product.status)));
}

export function formatCatalogPrice(product: Product): string {
  if (product.priceStatus === "quote") return "A cotizar";
  return `${product.currency === "USD" ? "USD" : "$"} ${formatNumber(product.listPrice)}`;
}

export function summarizeQuantityDiscounts(discounts: QuantityDiscount[], currency: Product["currency"]): string {
  return discounts.map((discount) => `desde ${discount.minimumQuantity}u -> ${currency === "USD" ? "USD" : "$"} ${formatNumber(discount.resultingPrice)}`).join("; ");
}

export function summarizePaymentDiscounts(discounts: PaymentDiscount[]): string {
  return discounts.map((discount) => discount.discountPercent == null
    ? publicPaymentLabel(discount.label)
    : `${formatPercent(discount.discountPercent)} ${publicPaymentLabel(discount.label)}`).join("; ");
}

export function publicPaymentDiscounts(discounts: PaymentDiscount[]): PaymentDiscount[] {
  return discounts.filter((discount) => !/(?:bonificaci[oó]n|precio bonificado)/i.test(discount.label));
}

export function catalogExcelHeaders(products: Product[], providerIds: ReadonlySet<string>): string[] {
  const hasQuantityDiscounts = catalogProducts(products, providerIds).some((product) => product.quantityDiscounts.length > 0);
  return ["Proveedor", "Código", "Descripción", "Precio neto", "Moneda", ...(hasQuantityDiscounts ? ["Cantidad mínima", "Precio con descuento"] : [])];
}

export function catalogExcelRows(products: Product[], providerIds: ReadonlySet<string>): Array<Record<string, string | number>> {
  const eligible = catalogProducts(products, providerIds);
  const hasQuantityDiscounts = eligible.some((product) => product.quantityDiscounts.length > 0);
  return eligible.flatMap((product) => {
    const base = {
      Proveedor: product.providerName,
      Código: product.code,
      Descripción: product.description,
      "Precio neto": product.priceStatus === "quote" ? "A cotizar" : product.listPrice,
      Moneda: product.currency,
    };
    if (!hasQuantityDiscounts) return [base];
    if (product.quantityDiscounts.length === 0) return [{ ...base, "Cantidad mínima": "", "Precio con descuento": "" }];
    return product.quantityDiscounts.map((discount) => ({ ...base, "Cantidad mínima": discount.minimumQuantity, "Precio con descuento": discount.resultingPrice }));
  });
}

export async function downloadCatalogExcel(products: Product[], providerIds: ReadonlySet<string>, providers: readonly Provider[] = catalogProviders, profile?: BrokerProfile): Promise<void> {
  const bytes = await buildCatalogExcel(products, providerIds, profile);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), catalogFilename("xlsx", selectedProviderNames(providerIds, providers)));
}

export async function buildCatalogExcel(products: Product[], providerIds: ReadonlySet<string>, profile?: BrokerProfile, generatedAt = new Date()): Promise<Uint8Array> {
  const xlsx = await import("xlsx");
  const rows = catalogExcelRows(products, providerIds);
  const headers = catalogExcelHeaders(products, providerIds);
  const formattedDate = new Intl.DateTimeFormat("es-AR").format(generatedAt);
  const title = `Catálogo de precios${profile?.name.trim() ? ` — ${profile.name.trim()}` : ""} — ${formattedDate}`;
  const sheet = xlsx.utils.aoa_to_sheet([[title]]);
  xlsx.utils.sheet_add_json(sheet, rows, { header: headers, origin: "A2" });
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  sheet.A1.s = { font: { bold: true, color: { rgb: "1A2535" } }, fill: { patternType: "solid", fgColor: { rgb: "F4F6F8" } }, alignment: { vertical: "center" } };
  sheet["!rows"] = [{ hpt: 24 }];
  sheet["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 58 }, { wch: 18 }, { wch: 10 }, ...(headers.length > 5 ? [{ wch: 18 }, { wch: 22 }] : [])];
  sheet["!autofilter"] = { ref: `A2:${headers.length > 5 ? "G" : "E"}2` };
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Productos");
  return new Uint8Array(xlsx.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true }));
}

type PdfFont = "regular" | "bold" | "mono" | "italic";
type PdfColor = [number, number, number];
type PdfLine = { text: string; x: number; y: number; size: number; font?: PdfFont; color?: PdfColor };
type PdfImage = { bytes: Uint8Array; width: number; height: number };
type PdfPlacedImage = PdfImage & { x: number; y: number; drawWidth: number; drawHeight: number };
type PdfRect = { x: number; y: number; width: number; height: number; color: PdfColor };
type PdfPage = { kind: "cover" | "products"; lines: PdfLine[]; rects: PdfRect[]; images: PdfPlacedImage[] };

export function buildCatalogPdf(products: Product[], providerIds: ReadonlySet<string>, providers: readonly Provider[] = catalogProviders, coverImages: ReadonlyMap<string, PdfImage> = new Map(), profile?: BrokerProfile, productImages: ReadonlyMap<string, PdfImage> = new Map()): Uint8Array {
  const eligible = catalogProducts(products, providerIds);
  const hasQuantityDiscounts = eligible.some((product) => product.quantityDiscounts.length > 0);
  const pages: PdfPage[] = [];
  for (const provider of providers) {
    if (!providerIds.has(provider.id)) continue;
    const providerProducts = eligible.filter((product) => product.providerId === provider.id).sort((a, b) => descriptionCollator.compare(a.description, b.description));
    if (providerProducts.length === 0) continue;
    const coverTitle = provider.fantasyName?.trim() || provider.legalName?.trim() || provider.name;
    const coverImage = coverImages.get(provider.id);
    pages.push(coverPage(coverTitle, coverImage));
    addProductPages(pages, coverTitle, providerProducts, hasQuantityDiscounts, productImages);
  }
  if (pages.length === 0) throw new Error("Los proveedores seleccionados no tienen productos activos para incluir.");
  pages.forEach((page, index) => {
    addPageNumber(page, index + 1, pages.length);
    if (page.kind === "products") addBrokerFooter(page, profile);
  });
  return encodePdf(pages);
}

export async function downloadCatalogPdf(products: Product[], providerIds: ReadonlySet<string>, providers: readonly Provider[] = catalogProviders, profile?: BrokerProfile): Promise<void> {
  const covers = new Map<string, PdfImage>();
  for (const providerId of providerIds) {
    const imageUrl = providers.find((provider) => provider.id === providerId)?.coverImageUrl;
    if (imageUrl) {
      try { covers.set(providerId, await jpegForPdf(imageUrl)); } catch { /* La portada sigue siendo válida sin imagen. */ }
    }
  }
  const productImages = new Map<string, PdfImage>();
  const imagesToLoad = catalogProducts(products, providerIds).filter((product) => product.imageSource === "manual" && product.imageUrl);
  await Promise.all(imagesToLoad.map(async (product) => {
    try { productImages.set(product.id, await jpegForPdf(product.imageUrl!)); } catch { /* El producto sigue siendo válido sin imagen. */ }
  }));
  const bytes = buildCatalogPdf(products, providerIds, providers, covers, profile, productImages);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), catalogFilename("pdf", selectedProviderNames(providerIds, providers)));
}

function coverPage(providerName: string, image?: PdfImage): PdfPage {
  const page: PdfPage = { kind: "cover", lines: [], rects: [], images: [] };
  if (image) page.images.push(placeContainedImage(image, 48, 350, 499, 420));
  const titleLines = wrap(providerName, 30);
  const firstY = image ? 285 : 435 + (titleLines.length - 1) * 17;
  titleLines.forEach((text, index) => page.lines.push({ text, x: centeredX(text, 28, "bold"), y: firstY - index * 34, size: 28, font: "bold", color: [0.118, 0.227, 0.373] }));
  return page;
}

function addProductPages(pages: PdfPage[], providerName: string, products: Product[], hasQuantityDiscounts: boolean, productImages: ReadonlyMap<string, PdfImage>) {
  let page = productPage(providerName, hasQuantityDiscounts);
  pages.push(page);
  let rowTop = 774;
  let rowIndex = 0;
  for (const product of products) {
    const descriptionLimit = hasQuantityDiscounts ? 25 : 47;
    const descriptionLines = wrap(product.description, descriptionLimit);
    const discountRows = hasQuantityDiscounts ? Math.max(1, product.quantityDiscounts.length) : 1;
    const textContentHeight = Math.max(13, descriptionLines.length * 13, discountRows * 15);
    const image = productImages.get(product.id);
    const height = Math.max(image ? 74 : 0, textContentHeight) + 10;
    if (rowTop - height < 55) {
      page = productPage(providerName, hasQuantityDiscounts);
      pages.push(page);
      rowTop = 774;
      rowIndex = 0;
    }
    const rowBottom = rowTop - height;
    if (rowIndex % 2 === 1) page.rects.push({ x: 30, y: rowBottom, width: 535, height, color: [0.973, 0.973, 0.973] });
    const baseline = rowTop - 18;
    if (image) page.images.push(placeContainedImage(image, 34, baseline - 61, 70, 70));
    page.lines.push({ text: product.code, x: 110, y: baseline, size: 9, font: "mono" });
    const descriptionX = 170;
    descriptionLines.forEach((text, index) => page.lines.push({ text, x: descriptionX, y: baseline - index * 13, size: 9 }));
    const price = formatCatalogPrice(product);
    const priceRight = hasQuantityDiscounts ? 400 : 552;
    page.lines.push({ text: price, x: rightAlignedX(price, priceRight, 9, product.priceStatus === "quote" ? "italic" : "bold"), y: baseline, size: 9, font: product.priceStatus === "quote" ? "italic" : "bold", color: product.priceStatus === "quote" ? [0.45, 0.45, 0.45] : undefined });
    if (hasQuantityDiscounts) product.quantityDiscounts.forEach((discount, index) => {
      const discountY = baseline - index * 15;
      page.lines.push({ text: String(discount.minimumQuantity), x: 430, y: discountY, size: 9 });
      const discountedPrice = `${product.currency === "USD" ? "USD" : "$"} ${formatNumber(discount.resultingPrice)}`;
      page.lines.push({ text: discountedPrice, x: rightAlignedX(discountedPrice, 558, 9, "regular"), y: discountY, size: 9 });
    });
    rowTop = rowBottom;
    rowIndex += 1;
  }
}

function addBrokerFooter(page: PdfPage, profile?: BrokerProfile) {
  if (!profile || ![profile.name, profile.whatsapp, profile.email].some((value) => value.trim())) return;
  const contact = [profile.whatsapp.trim() ? `WhatsApp: ${profile.whatsapp.trim()}` : "", profile.email.trim()].filter(Boolean).join("  ·  ");
  page.rects.push({ x: 36, y: 39, width: 523, height: 0.5, color: [0.75, 0.75, 0.75] });
  if (profile.name.trim()) page.lines.push({ text: profile.name.trim(), x: 36, y: 22, size: 8, color: [0.45, 0.45, 0.45] });
  if (contact) page.lines.push({ text: contact, x: Math.max(210, 474 - estimateTextWidth(contact, 8, "regular")), y: 22, size: 8, color: [0.45, 0.45, 0.45] });
}

function addPageNumber(page: PdfPage, current: number, total: number) {
  const text = `Página ${current} de ${total}`;
  page.lines.push({ text, x: rightAlignedX(text, 559, 8, "regular"), y: page.kind === "products" ? 10 : 22, size: 8, color: [0.45, 0.45, 0.45] });
}

function productPage(providerName: string, hasQuantityDiscounts: boolean): PdfPage {
  const page: PdfPage = { kind: "products", lines: [], rects: [], images: [] };
  page.lines.push({ text: providerName, x: 36, y: 813, size: 14, font: "bold", color: [0.102, 0.145, 0.208] });
  page.rects.push({ x: 30, y: 780, width: 535, height: 27, color: [0.118, 0.227, 0.373] });
  page.lines.push({ text: "Código", x: 110, y: 789, size: 10, font: "bold", color: [1, 1, 1] });
  page.lines.push({ text: "Descripción", x: 170, y: 789, size: 10, font: "bold", color: [1, 1, 1] });
  page.lines.push({ text: "Precio neto", x: hasQuantityDiscounts ? 330 : 469, y: 789, size: 10, font: "bold", color: [1, 1, 1] });
  if (hasQuantityDiscounts) {
    page.lines.push({ text: "Cant. mínima", x: 414, y: 789, size: 8, font: "bold", color: [1, 1, 1] });
    page.lines.push({ text: "Precio con descuento", x: 473, y: 789, size: 7, font: "bold", color: [1, 1, 1] });
  }
  return page;
}

function encodePdf(pages: PdfPage[]): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
  for (const page of pages) {
    const imageObjects = page.images.map((image, index) => {
      const objectNumber = objects.length + 1;
      const hex = [...image.bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("") + ">";
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`);
      return { name: `Im${index + 1}`, objectNumber, image };
    });
    const rectCommands = page.rects.map((rect) => `${pdfColor(rect.color)} rg ${rect.x} ${rect.y} ${rect.width} ${rect.height} re f`).join("\n");
    const imageCommands = imageObjects.map(({ name, image }) => `q ${image.drawWidth} 0 0 ${image.drawHeight} ${image.x} ${image.y} cm /${name} Do Q`).join("\n");
    const textCommands = page.lines.map((line) => `${pdfColor(line.color ?? [0, 0, 0])} rg BT /F${fontNumber(line.font)} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdf(line.text)}) Tj ET`).join("\n");
    const content = [rectCommands, imageCommands, textCommands].filter(Boolean).join("\n");
    const contentNumber = objects.length + 1;
    objects.push(`<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`);
    const pageNumber = objects.length + 1;
    pageObjectNumbers.push(pageNumber);
    const imageResource = imageObjects.length ? ` /XObject << ${imageObjects.map(({ name, objectNumber }) => `/${name} ${objectNumber} 0 R`).join(" ")} >>` : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>${imageResource} >> /Contents ${contentNumber} 0 R >>`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const chunks: Uint8Array[] = [latin1("%PDF-1.4\n%âãÏÓ\n")];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = latin1(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk); length += chunk.length;
  });
  const xrefOffset = length;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(latin1(xref));
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}

function fontNumber(font: PdfFont = "regular"): number { return font === "bold" ? 2 : font === "mono" ? 3 : font === "italic" ? 4 : 1; }
function pdfColor(color: PdfColor): string { return color.map((component) => component.toFixed(3)).join(" "); }
function estimateTextWidth(text: string, size: number, font: PdfFont): number { return text.length * size * (font === "mono" ? 0.6 : font === "bold" ? 0.54 : 0.5); }
function rightAlignedX(text: string, right: number, size: number, font: PdfFont): number { return Math.max(30, right - estimateTextWidth(text, size, font)); }
function centeredX(text: string, size: number, font: PdfFont): number { return Math.max(36, (595 - estimateTextWidth(text, size, font)) / 2); }
function placeContainedImage(image: PdfImage, x: number, y: number, maxWidth: number, maxHeight: number): PdfPlacedImage {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const drawWidth = image.width * scale; const drawHeight = image.height * scale;
  return { ...image, x: x + (maxWidth - drawWidth) / 2, y: y + (maxHeight - drawHeight) / 2, drawWidth, drawHeight };
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/→/g, "->");
}
function latin1(value: string): Uint8Array { return Uint8Array.from(value, (character) => character.charCodeAt(0) & 255); }
function wrap(value: string, limit: number): string[] {
  const lines: string[] = []; let current = "";
  for (const word of value.split(/\s+/)) {
    if (current && `${current} ${word}`.length > limit) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
function formatNumber(value: number): string { return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number): string { return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}%`; }
function publicPaymentLabel(value: string): string {
  const label = value.trim();
  if (/^(?:pago\s+)?contado$/i.test(label)) return "pagando de contado";
  if (/^pago\s+a\s+/i.test(label)) return label.replace(/^pago/i, "pagando").toLowerCase();
  if (/^transferencia$/i.test(label)) return "pagando por transferencia";
  return label;
}
function selectedProviderNames(providerIds: ReadonlySet<string>, providers: readonly Provider[]): string[] {
  return providers.filter((provider) => providerIds.has(provider.id)).map((provider) => provider.legalName?.trim() || provider.name);
}
export function catalogFilename(extension: "pdf" | "xlsx", providerNames: readonly string[], generatedAt = new Date()): string {
  const date = [String(generatedAt.getDate()).padStart(2, "0"), String(generatedAt.getMonth() + 1).padStart(2, "0"), generatedAt.getFullYear()].join("-");
  const safeNames = providerNames.map((name) => name.trim().replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ")).filter(Boolean);
  return `Catalogo de precios - ${safeNames.length ? `${safeNames.join(" + ")} - ` : ""}${date}.${extension}`;
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function jpegForPdf(source: string): Promise<PdfImage> {
  const response = await fetch(source); const blob = await response.blob(); const bitmap = await createImageBitmap(blob);
  const maxWidth = 1200; const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo preparar la imagen de portada.")), "image/jpeg", 0.82));
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
}

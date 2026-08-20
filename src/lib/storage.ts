import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrokerProfile, Customer, Product, Provider } from "./types";

const PRODUCTS_KEY = "codercup-products-v3";
const PROVIDERS_KEY = "codercup-providers-v1";
const CUSTOMERS_KEY = "codercup-customers-v1";
const BROKER_PROFILE_KEY = "codercup-broker-profile-v1";
const RETIRED_PRODUCT_KEYS = ["codercup-products-v1", "codercup-products-v2"];
const PLASTIC_IMPORT_TEST_RESET_KEY = "codercup-reset-porceluz-plastico-2026-08-19";

function removeRetiredLocalData(): void {
  for (const key of RETIRED_PRODUCT_KEYS) localStorage.removeItem(key);
}

function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

function hostedStorage(): boolean {
  return typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname) && !supabase();
}

async function apiLoad<T>(resource: string): Promise<T[]> {
  const response = await fetch(`/api/data?resource=${resource}`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudieron cargar los datos publicados.");
  return response.json() as Promise<T[]>;
}

async function apiUpsert(resource: string, records: Array<Record<string, unknown>>): Promise<void> {
  const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, action: "upsert", records }) });
  if (!response.ok) throw new Error("No se pudieron guardar los datos publicados.");
}

async function apiDelete(resource: string, ids: string[]): Promise<void> {
  const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, action: "delete", ids, records: [] }) });
  if (!response.ok) throw new Error("No se pudieron eliminar los datos publicados.");
}

async function uploadHostedImage(path: string, value: Blob): Promise<string> {
  const response = await fetch(`/api/images/${path}`, { method: "PUT", headers: { "Content-Type": value.type || "image/jpeg" }, body: value });
  if (!response.ok) throw new Error("No se pudo guardar la imagen publicada.");
  return (await response.json() as { url: string }).url;
}

const emptyBrokerProfile: BrokerProfile = { name: "", imageUrl: null, phone: "", whatsapp: "", email: "" };

type AppBackup = { version: 1; products: Product[]; providers: Provider[]; customers: Customer[]; profile: BrokerProfile };

export function downloadLocalBackup(): void {
  const backup: AppBackup = {
    version: 1,
    products: localProducts(),
    providers: JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? "[]") as Provider[],
    customers: JSON.parse(localStorage.getItem(CUSTOMERS_KEY) ?? "[]") as Customer[],
    profile: { ...emptyBrokerProfile, ...(JSON.parse(localStorage.getItem(BROKER_PROFILE_KEY) ?? "{}") as Partial<BrokerProfile>) },
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  link.download = `respaldo-codercup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function restoreBackup(file: File): Promise<void> {
  const backup = JSON.parse(await file.text()) as Partial<AppBackup>;
  if (backup.version !== 1 || !Array.isArray(backup.products) || !Array.isArray(backup.providers) || !Array.isArray(backup.customers) || !backup.profile) throw new Error("El archivo no es un respaldo válido de CoderCup.");
  if (hostedStorage()) {
    if (backup.providers.length) await apiUpsert("providers", backup.providers as unknown as Array<Record<string, unknown>>);
    if (backup.products.length) await apiUpsert("products", backup.products as unknown as Array<Record<string, unknown>>);
    if (backup.customers.length) await apiUpsert("customers", backup.customers as unknown as Array<Record<string, unknown>>);
    await apiUpsert("profile", [{ id: "main", ...backup.profile }]);
  } else {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(backup.products));
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify(backup.providers));
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(backup.customers));
    localStorage.setItem(BROKER_PROFILE_KEY, JSON.stringify(backup.profile));
  }
}

export async function loadBrokerProfile(): Promise<BrokerProfile> {
  if (hostedStorage()) return { ...emptyBrokerProfile, ...(await apiLoad<BrokerProfile>("profile"))[0] };
  const client = supabase();
  if (!client) {
    try { return { ...emptyBrokerProfile, ...(JSON.parse(localStorage.getItem(BROKER_PROFILE_KEY) ?? "{}") as Partial<BrokerProfile>) }; }
    catch { return { ...emptyBrokerProfile }; }
  }
  const { data, error } = await client.from("broker_profile").select("*").eq("id", "main").maybeSingle();
  if (error) throw error;
  return data ? fromBrokerProfileDatabase(data) : { ...emptyBrokerProfile };
}

export async function saveBrokerProfile(profile: BrokerProfile, imageFile?: File | null): Promise<BrokerProfile> {
  if (hostedStorage()) {
    const updated = { ...profile };
    if (imageFile) updated.imageUrl = await uploadHostedImage("broker-profile/profile.jpg", await (await fetch(await resizeProfileAsDataUrl(imageFile))).blob());
    await apiUpsert("profile", [{ id: "main", ...updated }]);
    return updated;
  }
  const client = supabase();
  const updated = { ...profile };
  if (imageFile) {
    const imageDataUrl = await resizeProfileAsDataUrl(imageFile);
    if (client) {
      const blob = await (await fetch(imageDataUrl)).blob();
      const path = "broker-profile/profile.jpg";
      const { error } = await client.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      updated.imageUrl = client.storage.from("product-images").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
    } else updated.imageUrl = imageDataUrl;
  }
  if (!client) localStorage.setItem(BROKER_PROFILE_KEY, JSON.stringify(updated));
  else {
    const { error } = await client.from("broker_profile").upsert(toBrokerProfileDatabase(updated));
    if (error) throw error;
  }
  return updated;
}

function localProducts(): Product[] {
  removeRetiredLocalData();
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCTS_KEY) ?? "[]") as Product[];
    const resetPlastic = localStorage.getItem(PLASTIC_IMPORT_TEST_RESET_KEY) !== "done";
    const unique = uniqueProducts(stored.filter((product) => product.providerId !== "porceluz" && (!resetPlastic || product.providerId !== "porceluz-plastico")));
    if (resetPlastic) localStorage.setItem(PLASTIC_IMPORT_TEST_RESET_KEY, "done");
    if (unique.length !== stored.length) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(unique));
    return unique;
  }
  catch { return []; }
}

function uniqueProducts(products: Product[]): Product[] {
  const unique = new Map<string, Product>();
  for (const product of products) {
    if (!unique.has(product.id)) unique.set(product.id, product);
  }
  return [...unique.values()];
}

export async function loadProducts(): Promise<Product[]> {
  if (hostedStorage()) return apiLoad<Product>("products");
  const client = supabase();
  if (!client) return localProducts();
  const { data, error } = await client.from("products").select("*").order("code");
  if (error) throw error;
  return (data ?? []).map(fromDatabase);
}

export async function loadCustomers(): Promise<Customer[]> {
  if (hostedStorage()) return (await apiLoad<Customer>("customers")).sort((a, b) => a.legalName.localeCompare(b.legalName, "es"));
  const client = supabase();
  if (!client) {
    try { return (JSON.parse(localStorage.getItem(CUSTOMERS_KEY) ?? "[]") as Customer[]).sort((a, b) => a.legalName.localeCompare(b.legalName, "es")); }
    catch { return []; }
  }
  const { data, error } = await client.from("customers").select("*").order("legal_name");
  if (error) throw error;
  return (data ?? []).map(fromCustomerDatabase);
}

export async function saveCustomer(customer: Customer): Promise<Customer[]> {
  if (hostedStorage()) { await apiUpsert("customers", [customer as unknown as Record<string, unknown>]); return loadCustomers(); }
  const client = supabase();
  if (!client) {
    const current = await loadCustomers();
    const updated = [...current.filter((item) => item.id !== customer.id), customer].sort((a, b) => a.legalName.localeCompare(b.legalName, "es"));
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(updated));
    return updated;
  }
  const { error } = await client.from("customers").upsert(toCustomerDatabase(customer));
  if (error) throw error;
  return loadCustomers();
}

export async function deleteCustomer(customerId: string): Promise<Customer[]> {
  if (hostedStorage()) { await apiDelete("customers", [customerId]); return loadCustomers(); }
  const client = supabase();
  if (!client) {
    const updated = (await loadCustomers()).filter((customer) => customer.id !== customerId);
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(updated));
    return updated;
  }
  const { error } = await client.from("customers").delete().eq("id", customerId);
  if (error) throw error;
  return loadCustomers();
}

export async function saveProvider(provider: Provider): Promise<void> {
  if (hostedStorage()) {
    const current = await apiLoad<Provider>("providers");
    const previous = current.find((item) => item.id === provider.id);
    const hasEditableDetails = [provider.legalName, provider.fantasyName, provider.contact, provider.latitude, provider.longitude, provider.description, provider.coverImageUrl].some((value) => value !== undefined);
    if (previous && !hasEditableDetails) return;
    await apiUpsert("providers", [{ ...previous, ...provider, legalName: provider.legalName ?? previous?.legalName ?? provider.name } as Record<string, unknown>]);
    return;
  }
  const client = supabase();
  const hasEditableDetails = [provider.legalName, provider.fantasyName, provider.contact, provider.latitude, provider.longitude, provider.description, provider.coverImageUrl].some((value) => value !== undefined);
  if (!client) {
    const current = JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? "[]") as Provider[];
    const previous = current.find((item) => item.id === provider.id);
    if (previous && !hasEditableDetails) return;
    const merged = { ...previous, ...provider, legalName: provider.legalName ?? previous?.legalName ?? provider.name };
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify([...current.filter((item) => item.id !== provider.id), merged]));
    return;
  }
  if (!hasEditableDetails) {
    const { data, error: readError } = await client.from("providers").select("id").eq("id", provider.id).maybeSingle();
    if (readError) throw readError;
    if (data) return;
  }
  const { error } = await client.from("providers").upsert(toProviderDatabase(provider));
  if (error) throw error;
}

export async function loadProviders(defaults: readonly Provider[] = []): Promise<Provider[]> {
  if (hostedStorage()) {
    const saved = await apiLoad<Provider>("providers");
    const byId = new Map(saved.map((provider) => [provider.id, provider]));
    return defaults.map((provider) => ({ ...provider, ...byId.get(provider.id), legalName: byId.get(provider.id)?.legalName || provider.name }));
  }
  const client = supabase();
  let saved: Provider[];
  if (!client) saved = JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? "[]") as Provider[];
  else {
    const { data, error } = await client.from("providers").select("*");
    if (error) throw error;
    saved = (data ?? []).map(fromProviderDatabase);
  }
  const byId = new Map(saved.map((provider) => [provider.id, provider]));
  return defaults.map((provider) => ({ ...provider, ...byId.get(provider.id), legalName: byId.get(provider.id)?.legalName || provider.name }));
}

export async function saveProviderCoverImage(provider: Provider, file: File): Promise<Provider> {
  const coverImageUrl = await resizeCoverAsDataUrl(file);
  const updated = { ...provider, coverImageUrl };
  if (hostedStorage()) {
    updated.coverImageUrl = await uploadHostedImage(`provider-covers/${provider.id}.jpg`, await (await fetch(coverImageUrl)).blob());
    await saveProvider(updated);
    return updated;
  }
  const client = supabase();
  if (client) {
    const blob = await (await fetch(coverImageUrl)).blob();
    const path = `provider-covers/${provider.id}.jpg`;
    const { error: uploadError } = await client.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (uploadError) throw uploadError;
    updated.coverImageUrl = client.storage.from("product-images").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
  }
  await saveProvider(updated);
  return updated;
}

export async function removeProviderCoverImage(provider: Provider): Promise<Provider> {
  const updated = { ...provider, coverImageUrl: null };
  if (hostedStorage()) {
    await fetch(`/api/images/provider-covers/${provider.id}.jpg`, { method: "DELETE" });
    await saveProvider(updated);
    return updated;
  }
  const client = supabase();
  if (client) {
    const { error: removeError } = await client.storage.from("product-images").remove([`provider-covers/${provider.id}.jpg`]);
    if (removeError) throw removeError;
  }
  await saveProvider(updated);
  return updated;
}

export async function upsertImportedProducts(incoming: Product[]): Promise<Product[]> {
  const current = await loadProducts();
  const existing = new Map(current.map((product) => [product.id, product]));
  const merged = uniqueProducts(incoming).map((product) => {
    const previous = existing.get(product.id);
    return previous?.imageSource === "manual"
      ? { ...product, imageUrl: previous.imageUrl, imageSource: "manual" as const }
      : product;
  });
  if (hostedStorage()) {
    await apiUpsert("products", merged as unknown as Array<Record<string, unknown>>);
    return loadProducts();
  }
  const client = supabase();
  if (!client) {
    const ids = new Set(merged.map((product) => product.id));
    const all = uniqueProducts([...current.filter((product) => !ids.has(product.id)), ...merged]);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return all;
  }
  const { error } = await client.from("products").upsert(merged.map(toDatabase), { onConflict: "provider_id,code" });
  if (error) throw error;
  return loadProducts();
}

export async function resolveMissingProducts(decisions: Record<string, "delete" | "discontinue">): Promise<Product[]> {
  const products = await loadProducts();
  if (hostedStorage()) {
    const removed = Object.entries(decisions).filter(([, decision]) => decision === "delete").map(([id]) => id);
    const discontinued = products.filter((product) => decisions[product.id] === "discontinue").map((product) => ({ ...product, status: "discontinued" as const }));
    if (removed.length) await apiDelete("products", removed);
    if (discontinued.length) await apiUpsert("products", discontinued as unknown as Array<Record<string, unknown>>);
    return loadProducts();
  }
  const client = supabase();
  if (!client) {
    const updated = products
      .filter((product) => decisions[product.id] !== "delete")
      .map((product) => decisions[product.id] === "discontinue" ? { ...product, status: "discontinued" as const } : product);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(updated));
    return updated;
  }
  await Promise.all(Object.entries(decisions).map(async ([id, decision]) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const query = client.from("products");
    const { error } = decision === "delete"
      ? await query.delete().eq("provider_id", product.providerId).eq("code", product.code)
      : await query.update({ status: "discontinued" }).eq("provider_id", product.providerId).eq("code", product.code);
    if (error) throw error;
  }));
  return loadProducts();
}

export async function setProductStatus(product: Product, status: Product["status"]): Promise<Product[]> {
  if (hostedStorage()) { await apiUpsert("products", [{ ...product, status }]); return loadProducts(); }
  const client = supabase();
  if (!client) {
    const updated = localProducts().map((item) => item.id === product.id ? { ...item, status } : item);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(updated));
    return updated;
  }
  const { error } = await client.from("products").update({ status }).eq("provider_id", product.providerId).eq("code", product.code);
  if (error) throw error;
  return loadProducts();
}

export async function saveManualImage(product: Product, file: File): Promise<Product> {
  const client = supabase();
  let imageUrl: string;
  if (hostedStorage()) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    imageUrl = await uploadHostedImage(`product-images/${product.providerId}/${product.code}.${extension}`, file);
    const updated = { ...product, imageUrl, imageSource: "manual" as const };
    await apiUpsert("products", [updated]);
    return updated;
  }
  if (client) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${product.providerId}/${product.code}.${extension}`;
    const { error } = await client.storage.from("product-images").upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    imageUrl = client.storage.from("product-images").getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
  } else {
    imageUrl = await resizeAsDataUrl(file);
  }
  const updated = { ...product, imageUrl, imageSource: "manual" as const };
  if (!client) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(localProducts().map((item) => item.id === product.id ? updated : item)));
  } else {
    const { error } = await client.from("products").update({ image_url: imageUrl, image_source: "manual" }).eq("provider_id", product.providerId).eq("code", product.code);
    if (error) throw error;
  }
  return updated;
}

export async function shareManualImage(source: Product, targetIds: string[]): Promise<Product[]> {
  if (!source.imageUrl || targetIds.length === 0) return loadProducts();
  const targetSet = new Set(targetIds);
  const current = await loadProducts();
  const updated = current.map((product) => targetSet.has(product.id)
    ? { ...product, imageUrl: source.imageUrl, imageSource: "manual" as const }
    : product);
  if (hostedStorage()) {
    await apiUpsert("products", updated.filter((product) => targetSet.has(product.id)) as unknown as Array<Record<string, unknown>>);
    return loadProducts();
  }
  const client = supabase();
  if (!client) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(updated));
    return updated;
  }
  const targets = updated.filter((product) => targetSet.has(product.id));
  const { error } = await client.from("products").upsert(targets.map(toDatabase), { onConflict: "provider_id,code" });
  if (error) throw error;
  return loadProducts();
}

export async function removeManualImage(product: Product): Promise<Product> {
  const updated = { ...product, imageUrl: null, imageSource: null };
  if (hostedStorage()) { await apiUpsert("products", [updated]); return updated; }
  const client = supabase();
  if (!client) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(localProducts().map((item) => item.id === product.id ? updated : item)));
    return updated;
  }
  const { error } = await client.from("products").update({ image_url: null, image_source: null }).eq("provider_id", product.providerId).eq("code", product.code);
  if (error) throw error;
  return updated;
}

function resizeAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function resizeCoverAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = 1000; const height = 1410;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const scale = Math.max(width / image.width, height / image.height);
      const drawWidth = image.width * scale; const drawHeight = image.height * scale;
      canvas.getContext("2d")?.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      resolve(canvas.toDataURL("image/jpeg", 0.84)); URL.revokeObjectURL(image.src);
    };
    image.onerror = reject; image.src = URL.createObjectURL(file);
  });
}

function resizeProfileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 500; const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
      const scale = Math.max(size / image.width, size / image.height);
      const drawWidth = image.width * scale; const drawHeight = image.height * scale;
      canvas.getContext("2d")?.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
      resolve(canvas.toDataURL("image/jpeg", 0.84)); URL.revokeObjectURL(image.src);
    };
    image.onerror = reject; image.src = URL.createObjectURL(file);
  });
}

function toBrokerProfileDatabase(profile: BrokerProfile) {
  return { id: "main", name: profile.name, image_url: profile.imageUrl, phone: profile.phone, whatsapp: profile.whatsapp, email: profile.email, updated_at: new Date().toISOString() };
}

function fromBrokerProfileDatabase(row: Record<string, unknown>): BrokerProfile {
  return { name: String(row.name ?? ""), imageUrl: row.image_url ? String(row.image_url) : null, phone: String(row.phone ?? ""), whatsapp: String(row.whatsapp ?? ""), email: String(row.email ?? "") };
}

function toProviderDatabase(provider: Provider) {
  return { id: provider.id, name: provider.name, legal_name: provider.legalName ?? provider.name, fantasy_name: provider.fantasyName ?? "", contact: provider.contact ?? "", latitude: provider.latitude || null, longitude: provider.longitude || null, description: provider.description ?? "", cover_image_url: provider.coverImageUrl ?? null };
}

function fromProviderDatabase(row: Record<string, unknown>): Provider {
  return { id: String(row.id), name: String(row.name), legalName: String(row.legal_name ?? row.name), fantasyName: String(row.fantasy_name ?? ""), contact: String(row.contact ?? ""), latitude: row.latitude == null ? "" : String(row.latitude), longitude: row.longitude == null ? "" : String(row.longitude), description: String(row.description ?? ""), coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : null };
}

function toCustomerDatabase(customer: Customer) {
  return { id: customer.id, legal_name: customer.legalName, commercial_name: customer.commercialName, cuit: customer.cuit, address: customer.address, phone: customer.phone, whatsapp: customer.whatsapp, email: customer.email, contact_person: customer.contactPerson, notes: customer.notes };
}

function fromCustomerDatabase(row: Record<string, unknown>): Customer {
  return { id: String(row.id), legalName: String(row.legal_name ?? ""), commercialName: String(row.commercial_name ?? ""), cuit: String(row.cuit ?? ""), address: String(row.address ?? ""), phone: String(row.phone ?? ""), whatsapp: String(row.whatsapp ?? ""), email: String(row.email ?? ""), contactPerson: String(row.contact_person ?? ""), notes: String(row.notes ?? "") };
}

function toDatabase(product: Product) {
  return {
    provider_id: product.providerId, code: product.code, description: product.description,
    list_price: product.listPrice, price_status: product.priceStatus, currency: product.currency,
    quantity_discounts: product.quantityDiscounts, payment_discounts: product.paymentDiscounts,
    image_url: product.imageUrl, image_source: product.imageSource, status: product.status, imported_at: product.importedAt,
  };
}

function fromDatabase(row: Record<string, unknown>): Product {
  return {
    id: `${row.provider_id}::${row.code}`, providerId: String(row.provider_id),
    providerName: row.provider_id === "lanus-alambres-sa" ? "Lanús Alambres S.A." : String(row.provider_id),
    code: String(row.code), description: String(row.description), listPrice: Number(row.list_price),
    priceStatus: row.price_status as Product["priceStatus"], currency: row.currency as Product["currency"],
    quantityDiscounts: (row.quantity_discounts ?? []) as Product["quantityDiscounts"],
    paymentDiscounts: (row.payment_discounts ?? []) as Product["paymentDiscounts"],
    imageUrl: row.image_url ? String(row.image_url) : null,
    imageSource: (row.image_source ?? null) as Product["imageSource"], status: row.status as Product["status"],
    importedAt: String(row.imported_at),
  };
}

export const dataResources = ["products", "providers", "customers", "profile"] as const;
export type DataResource = typeof dataResources[number];
export type DataAction = "upsert" | "delete";
export type DataMutation = { resource: DataResource; action: DataAction; records: Array<Record<string, unknown>>; ids: string[] };

const maxRecords = 2_000;
const validId = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const plainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function isDataResource(value: unknown): value is DataResource {
  return typeof value === "string" && dataResources.includes(value as DataResource);
}

export function validateDataMutation(value: unknown): { value: DataMutation } | { error: string } {
  if (!plainObject(value) || !isDataResource(value.resource)) return { error: "Recurso inválido." };
  if (value.action !== "upsert" && value.action !== "delete") return { error: "Acción inválida." };

  if (value.action === "delete") {
    if (!Array.isArray(value.ids) || value.ids.length === 0 || value.ids.length > maxRecords || !value.ids.every(validId)) return { error: "Los IDs a eliminar no son válidos." };
    return { value: { resource: value.resource, action: value.action, ids: value.ids, records: [] } };
  }

  if (!Array.isArray(value.records) || value.records.length === 0 || value.records.length > maxRecords || !value.records.every(plainObject)) return { error: "Los registros a guardar no son válidos." };
  for (const record of value.records) {
    if (!validId(record.id)) return { error: "Cada registro debe incluir un ID válido." };
    if (value.resource === "products" && !validId(record.providerId)) return { error: "Cada producto debe incluir un proveedor válido." };
  }
  return { value: { resource: value.resource, action: value.action, records: value.records, ids: [] } };
}

export function isSupportedImagePath(path: string[]): boolean {
  const [folder, owner, filename] = path;
  if (folder === "broker-profile") return path.length === 2 && owner === "profile.jpg";
  if (folder === "provider-covers") return path.length === 2 && /^[a-z0-9][a-z0-9-]*\.jpg$/i.test(owner ?? "");
  return folder === "product-images" && path.length === 3 && /^[a-z0-9][a-z0-9-]*$/i.test(owner ?? "") && /^[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i.test(filename ?? "");
}

export function isSupportedImageType(value: string | null): boolean {
  return value !== null && ["image/jpeg", "image/png", "image/webp"].includes(value.split(";", 1)[0].toLowerCase());
}

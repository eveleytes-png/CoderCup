import { describe, expect, it } from "vitest";
import { isSupportedImagePath, isSupportedImageType, validateDataMutation } from "./api-validation";

describe("validación de API", () => {
  it("acepta una actualización válida de producto", () => {
    expect(validateDataMutation({ resource: "products", action: "upsert", records: [{ id: "lanus::1", providerId: "lanus", code: "1" }] })).toHaveProperty("value");
  });

  it("rechaza recursos, acciones y payloads incompletos", () => {
    expect(validateDataMutation({ resource: "unknown", action: "upsert", records: [] })).toHaveProperty("error");
    expect(validateDataMutation({ resource: "products", action: "replace", records: [] })).toHaveProperty("error");
    expect(validateDataMutation({ resource: "products", action: "upsert", records: [{ id: "1" }] })).toHaveProperty("error");
    expect(validateDataMutation({ resource: "customers", action: "delete", ids: [] })).toHaveProperty("error");
  });

  it("limita las rutas y tipos de imágenes a los usados por la app", () => {
    expect(isSupportedImagePath(["broker-profile", "profile.jpg"])).toBe(true);
    expect(isSupportedImagePath(["product-images", "lanus-alambres-sa", "2601030.jpg"])).toBe(true);
    expect(isSupportedImagePath(["product-images", "..", "secret.txt"])).toBe(false);
    expect(isSupportedImageType("image/jpeg; charset=binary")).toBe(true);
    expect(isSupportedImageType("application/pdf")).toBe(false);
  });
});

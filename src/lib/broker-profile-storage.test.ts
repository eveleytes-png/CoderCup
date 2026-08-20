import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBrokerProfile, saveBrokerProfile } from "./storage";
import type { BrokerProfile } from "./types";

const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});

describe("persistencia del perfil del corredor", () => {
  it("guarda y recupera el perfil usando la capa local existente", async () => {
    const profile: BrokerProfile = { name: "Corredora Demo", imageUrl: null, phone: "111", whatsapp: "222", email: "demo@example.com" };
    expect(await loadBrokerProfile()).toEqual({ name: "", imageUrl: null, phone: "", whatsapp: "", email: "" });
    expect(await saveBrokerProfile(profile)).toEqual(profile);
    expect(await loadBrokerProfile()).toEqual(profile);
  });
});

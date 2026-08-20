import { neon } from "@neondatabase/serverless";
import { cache } from "react";
import type { BrokerProfile } from "@/lib/types";

export const emptyBrokerProfile: BrokerProfile = { name: "", imageUrl: null, phone: "", whatsapp: "", email: "" };

export const loadInitialBrokerProfile = cache(async (): Promise<BrokerProfile> => {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return emptyBrokerProfile;
    const rows = await neon(connectionString).query("SELECT data FROM profile WHERE id = $1", ["main"]) as Array<{ data: string }>;
    if (!rows[0]?.data) return emptyBrokerProfile;
    return { ...emptyBrokerProfile, ...(JSON.parse(rows[0].data) as Partial<BrokerProfile>) };
  } catch {
    return emptyBrokerProfile;
  }
});

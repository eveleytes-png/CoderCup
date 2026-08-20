import type { Metadata } from "next";
import { CatalogApp } from "@/components/CatalogApp";
import { loadInitialBrokerProfile } from "@/lib/server/broker-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await loadInitialBrokerProfile();
  const name = profile.name.trim() || "Catálogo del Corredor";
  const manifest = new URLSearchParams({ name });
  if (profile.imageUrl) manifest.set("icon", profile.imageUrl);

  return {
    title: name,
    applicationName: name,
    manifest: `/api/app-manifest?${manifest.toString()}`,
    icons: profile.imageUrl ? { icon: profile.imageUrl, apple: profile.imageUrl } : undefined,
  };
}

export default async function Home() {
  const initialProfile = await loadInitialBrokerProfile();
  return <CatalogApp key="catalogo-limpio-v3" initialProfile={initialProfile} />;
}

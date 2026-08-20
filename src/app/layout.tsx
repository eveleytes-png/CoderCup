import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./refinements.css";

export const metadata: Metadata = {
  title: "Catálogo del Corredor",
  description: "Productos normalizados de múltiples proveedores",
  manifest: "/api/app-manifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

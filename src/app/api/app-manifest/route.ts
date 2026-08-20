import { NextRequest, NextResponse } from "next/server";

const fallbackName = "Catálogo del Corredor";

export function GET(request: NextRequest) {
  const requestedName = request.nextUrl.searchParams.get("name")?.trim();
  const name = (requestedName || fallbackName).slice(0, 80);
  const icon = request.nextUrl.searchParams.get("icon");
  const isSafeIcon = icon?.startsWith("/") || icon?.startsWith("https://");

  return new NextResponse(JSON.stringify({
    name,
    short_name: name.slice(0, 32),
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#1e3a5f",
    icons: isSafeIcon ? [{ src: icon, sizes: "any", type: "image/jpeg", purpose: "any maskable" }] : [],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}

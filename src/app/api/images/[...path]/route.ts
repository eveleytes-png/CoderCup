import { del, get, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const object = await get(path.join("/"), { access: "public" });
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(object.stream, { headers: { "Content-Type": object.blob.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000" } });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!request.body) return NextResponse.json({ error: "No se recibió una imagen." }, { status: 400 });
  await put(path.join("/"), request.body, { access: "public", allowOverwrite: true, contentType: request.headers.get("content-type") ?? "image/jpeg" });
  return NextResponse.json({ url: `/api/images/${path.map(encodeURIComponent).join("/")}?v=${Date.now()}` });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  await del(path.join("/"));
  return NextResponse.json({ ok: true });
}

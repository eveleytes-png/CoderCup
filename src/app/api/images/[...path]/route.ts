import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const object = await env.STORAGE.get(path.join("/"));
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000" } });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  await env.STORAGE.put(path.join("/"), request.body, { httpMetadata: { contentType: request.headers.get("content-type") ?? "image/jpeg" } });
  return NextResponse.json({ url: `/api/images/${path.map(encodeURIComponent).join("/")}?v=${Date.now()}` });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  await env.STORAGE.delete(path.join("/"));
  return NextResponse.json({ ok: true });
}

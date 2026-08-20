import { del, get, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { isSupportedImagePath, isSupportedImageType } from "@/lib/api-validation";

const maxImageBytes = 4 * 1024 * 1024;

async function pathFrom(context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return isSupportedImagePath(path) ? path : null;
}

export async function GET(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathFrom(context);
  if (!path) return NextResponse.json({ error: "Ruta de imagen inválida." }, { status: 400 });
  try {
    const object = await get(path.join("/"), { access: "public" });
    if (!object) return new NextResponse(null, { status: 404 });
    return new NextResponse(object.stream, { headers: { "Content-Type": object.blob.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000" } });
  } catch (error) {
    console.error("No se pudo leer la imagen.", error);
    return NextResponse.json({ error: "No se pudo cargar la imagen." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathFrom(context);
  if (!path) return NextResponse.json({ error: "Ruta de imagen inválida." }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: "No se recibió una imagen." }, { status: 400 });
  const contentType = request.headers.get("content-type");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!isSupportedImageType(contentType)) return NextResponse.json({ error: "El archivo debe ser JPG, PNG o WebP." }, { status: 400 });
  if (Number.isFinite(contentLength) && contentLength > maxImageBytes) return NextResponse.json({ error: "La imagen supera el límite de 4 MB." }, { status: 413 });
  try {
    await put(path.join("/"), request.body, { access: "public", allowOverwrite: true, contentType: contentType!.split(";", 1)[0] });
    return NextResponse.json({ url: `/api/images/${path.map(encodeURIComponent).join("/")}?v=${Date.now()}` });
  } catch (error) {
    console.error("No se pudo guardar la imagen.", error);
    return NextResponse.json({ error: "No se pudo guardar la imagen. Intentá nuevamente." }, { status: 503 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = await pathFrom(context);
  if (!path) return NextResponse.json({ error: "Ruta de imagen inválida." }, { status: 400 });
  try {
    await del(path.join("/"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo eliminar la imagen.", error);
    return NextResponse.json({ error: "No se pudo eliminar la imagen. Intentá nuevamente." }, { status: 503 });
  }
}

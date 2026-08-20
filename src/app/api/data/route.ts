import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

type Resource = "products" | "providers" | "customers" | "profile";
type DbRow = { data: string };

async function prepare() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, data TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS products_provider_idx ON products(provider_id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, data TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, data TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, data TEXT NOT NULL)"),
  ]);
}

export async function GET(request: NextRequest) {
  await prepare();
  const resource = request.nextUrl.searchParams.get("resource") as Resource | null;
  if (!resource || !["products", "providers", "customers", "profile"].includes(resource)) return NextResponse.json({ error: "Recurso inválido" }, { status: 400 });
  const rows = await env.DB.prepare(`SELECT data FROM ${resource}`).all<DbRow>();
  return NextResponse.json(rows.results.map((row) => JSON.parse(row.data)));
}

export async function POST(request: NextRequest) {
  await prepare();
  const body = await request.json() as { resource: Resource; action: "upsert" | "delete"; records: Array<Record<string, unknown>>; ids?: string[] };
  const { resource } = body;
  if (!["products", "providers", "customers", "profile"].includes(resource)) return NextResponse.json({ error: "Recurso inválido" }, { status: 400 });
  if (body.action === "delete") {
    await env.DB.batch((body.ids ?? []).map((id) => env.DB.prepare(`DELETE FROM ${resource} WHERE id = ?`).bind(id)));
  } else {
    const statements = body.records.map((record) => resource === "products"
      ? env.DB.prepare("INSERT INTO products (id, provider_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id, data=excluded.data").bind(record.id, record.providerId, JSON.stringify(record))
      : env.DB.prepare(`INSERT INTO ${resource} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).bind(record.id ?? "main", JSON.stringify(record)));
    for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
  }
  return NextResponse.json({ ok: true });
}

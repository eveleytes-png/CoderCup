import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

type Resource = "products" | "providers" | "customers" | "profile";
type DbRow = { data: string };
const tables = { products: "products", providers: "providers", customers: "customers", profile: "profile" } as const;
let schemaPromise: Promise<void> | undefined;

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está configurada.");
  return neon(connectionString);
}

async function prepare(sql: NeonQueryFunction<false, false>) {
  schemaPromise ??= Promise.all([
    sql`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, data TEXT NOT NULL)`,
    sql`CREATE INDEX IF NOT EXISTS products_provider_idx ON products(provider_id)`,
    sql`CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    sql`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    sql`CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
  ]).then(() => undefined);
  await schemaPromise;
}

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource") as Resource | null;
  if (!resource || !["products", "providers", "customers", "profile"].includes(resource)) return NextResponse.json({ error: "Recurso inválido" }, { status: 400 });
  const sql = database();
  await prepare(sql);
  const rows = await sql.query(`SELECT data FROM ${tables[resource]}`) as DbRow[];
  return NextResponse.json(rows.map((row) => JSON.parse(row.data)));
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { resource: Resource; action: "upsert" | "delete"; records: Array<Record<string, unknown>>; ids?: string[] };
  const { resource } = body;
  if (!["products", "providers", "customers", "profile"].includes(resource)) return NextResponse.json({ error: "Recurso inválido" }, { status: 400 });
  const sql = database();
  await prepare(sql);
  const table = tables[resource];
  if (body.action === "delete") {
    await Promise.all((body.ids ?? []).map((id) => sql.query(`DELETE FROM ${table} WHERE id = $1`, [id])));
  } else {
    const statements = body.records.map((record) => resource === "products"
      ? sql.query("INSERT INTO products (id, provider_id, data) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET provider_id = EXCLUDED.provider_id, data = EXCLUDED.data", [String(record.id), String(record.providerId), JSON.stringify(record)])
      : sql.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data`, [String(record.id ?? "main"), JSON.stringify(record)]));
    for (let index = 0; index < statements.length; index += 80) await Promise.all(statements.slice(index, index + 80));
  }
  return NextResponse.json({ ok: true });
}

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { isDataResource, type DataMutation, type DataResource, validateDataMutation } from "@/lib/api-validation";

type DbRow = { data: string };
const tables: Record<DataResource, string> = { products: "products", providers: "providers", customers: "customers", profile: "profile" };
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
  try { await schemaPromise; }
  catch (error) { schemaPromise = undefined; throw error; }
}

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource");
  if (!isDataResource(resource)) return NextResponse.json({ error: "Recurso inválido." }, { status: 400 });
  try {
    const sql = database();
    await prepare(sql);
    const rows = await sql.query(`SELECT data FROM ${tables[resource]}`) as DbRow[];
    return NextResponse.json(rows.map((row) => JSON.parse(row.data)));
  } catch (error) {
    console.error("No se pudo leer la base de datos.", error);
    return NextResponse.json({ error: "No se pudieron cargar los datos. Intentá nuevamente." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "El cuerpo de la solicitud no es JSON válido." }, { status: 400 }); }
  const checked = validateDataMutation(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  try {
    await persistMutation(database(), checked.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo guardar en la base de datos.", error);
    return NextResponse.json({ error: "No se pudieron guardar los datos. Intentá nuevamente." }, { status: 503 });
  }
}

async function persistMutation(sql: NeonQueryFunction<false, false>, mutation: DataMutation) {
  await prepare(sql);
  const table = tables[mutation.resource];
  if (mutation.action === "delete") {
    for (let index = 0; index < mutation.ids.length; index += 80) {
      await Promise.all(mutation.ids.slice(index, index + 80).map((id) => sql.query(`DELETE FROM ${table} WHERE id = $1`, [id])));
    }
    return;
  }
  for (let index = 0; index < mutation.records.length; index += 80) {
    const batch = mutation.records.slice(index, index + 80);
    await Promise.all(batch.map((record) => mutation.resource === "products"
      ? sql.query("INSERT INTO products (id, provider_id, data) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET provider_id = EXCLUDED.provider_id, data = EXCLUDED.data", [String(record.id), String(record.providerId), JSON.stringify(record)])
      : sql.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data`, [String(record.id), JSON.stringify(record)])));
  }
}

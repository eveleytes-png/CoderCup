CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  data TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS products_provider_idx ON products(provider_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

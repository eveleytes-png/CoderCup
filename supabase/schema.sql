create table if not exists public.providers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.providers add column if not exists legal_name text;
alter table public.providers add column if not exists fantasy_name text;
alter table public.providers add column if not exists contact text;
alter table public.providers add column if not exists latitude numeric;
alter table public.providers add column if not exists longitude numeric;
alter table public.providers add column if not exists description text;
alter table public.providers add column if not exists cover_image_url text;

create table if not exists public.products (
  provider_id text not null references public.providers(id) on delete cascade,
  code text not null,
  description text not null,
  list_price numeric,
  price_status text not null check (price_status in ('priced', 'quote')),
  currency text not null check (currency in ('ARS', 'USD')),
  quantity_discounts jsonb not null default '[]'::jsonb,
  payment_discounts jsonb not null default '[]'::jsonb,
  image_url text,
  image_source text check (image_source in ('manual', 'supplier')),
  status text not null default 'active' check (status in ('active', 'discontinued')),
  imported_at timestamptz not null default now(),
  primary key (provider_id, code)
);

create table if not exists public.customers (
  id text primary key,
  legal_name text not null,
  commercial_name text not null default '',
  cuit text not null default '',
  address text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  contact_person text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broker_profile (
  id text primary key check (id = 'main'),
  name text not null default '',
  image_url text,
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.providers enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.broker_profile enable row level security;
create policy "demo providers access" on public.providers for all using (true) with check (true);
create policy "demo products access" on public.products for all using (true) with check (true);
create policy "demo customers access" on public.customers for all using (true) with check (true);
create policy "demo broker profile access" on public.broker_profile for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

create policy "demo product images access" on storage.objects
for all using (bucket_id = 'product-images') with check (bucket_id = 'product-images');

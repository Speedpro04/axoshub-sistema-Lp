-- PagBank / PIX support
-- Apply in Supabase SQL editor.

alter table public.clientes
  add column if not exists email text,
  add column if not exists tax_id text,
  add column if not exists clinica_nome text,
  add column if not exists clinica_cnpj text;

alter table public.cobrancas
  add column if not exists pagbank_order_id text,
  add column if not exists pagbank_reference_id text,
  add column if not exists pagbank_qr_code_text text,
  add column if not exists pagbank_qr_code_image_url text,
  add column if not exists pagbank_status text,
  add column if not exists pagbank_charge_id text,
  add column if not exists pagbank_payload jsonb,
  add column if not exists pagbank_updated_at timestamptz,
  add column if not exists pagbank_expires_at timestamptz,
  add column if not exists pagbank_fee numeric,
  add column if not exists pagbank_net_amount numeric;

create table if not exists public.pagbank_eventos (
  id uuid default gen_random_uuid() primary key,
  order_id text,
  reference_id text,
  charge_id text,
  status text,
  payload jsonb,
  tenant_id uuid,
  created_at timestamptz default now()
);

create index if not exists pagbank_eventos_reference_id_idx
  on public.pagbank_eventos (reference_id);

alter table public.pagbank_eventos
  add column if not exists source text;

create table if not exists public.pagbank_alertas (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  reference_id text,
  order_id text,
  charge_id text,
  status text,
  payload jsonb,
  tenant_id uuid,
  notified_at timestamptz,
  notify_channel text,
  created_at timestamptz default now()
);

create index if not exists pagbank_alertas_reference_id_idx
  on public.pagbank_alertas (reference_id);

create table if not exists public.pagbank_reprocess (
  id uuid default gen_random_uuid() primary key,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  payload jsonb,
  reference_id text,
  order_id text,
  charge_id text,
  tenant_id uuid,
  created_at timestamptz default now(),
  processed_at timestamptz
);

create index if not exists pagbank_reprocess_status_idx
  on public.pagbank_reprocess (status);

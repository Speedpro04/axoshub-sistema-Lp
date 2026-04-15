-- MIGRACAO: PLANOS + LIMITES + JWT/RLS + LGPD
-- Alvo: Supabase Postgres
-- Data: 2026-04-15

begin;

create extension if not exists pgcrypto;

create schema if not exists app;

-- =========================================================
-- 1) TABELAS BASE DE TENANT E PLANO
-- =========================================================

create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists app.plan_catalog (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  specialist_limit integer not null check (specialist_limit > 0),
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app.plan_catalog (code, name, specialist_limit, monthly_price)
values
  ('essential', 'Essencial', 2, 197.00),
  ('growth',    'Crescimento', 5, 347.00),
  ('scale',     'Escala', 10, 499.00)
on conflict (code) do update
set
  name = excluded.name,
  specialist_limit = excluded.specialist_limit,
  monthly_price = excluded.monthly_price,
  updated_at = now();

create table if not exists app.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  plan_id bigint not null references app.plan_catalog(id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_tenant_active_subscription
on app.tenant_subscriptions(tenant_id)
where status in ('trialing', 'active', 'past_due') and ends_at is null;

create table if not exists app.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'specialist', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- =========================================================
-- 2) TABELA DE ESPECIALISTAS (COM CUIDADOS LGPD)
-- =========================================================

create table if not exists app.specialists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  external_code text,
  display_name text not null,
  professional_title text,
  email text,
  phone text,
  -- LGPD: não armazenar documento bruto. Apenas hash irreversível.
  document_hash text,
  consent_privacy_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint email_format_check check (
    email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

create index if not exists idx_specialists_tenant_active
  on app.specialists(tenant_id, active)
  where deleted_at is null;

-- Solicitações LGPD por tenant.
create table if not exists app.lgpd_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'correction', 'anonymization', 'deletion')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- =========================================================
-- 3) FUNCOES AUXILIARES JWT + TENANT + PLANO
-- =========================================================

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.jwt_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  claims jsonb;
  tenant_value text;
begin
  claims := coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
  tenant_value := claims->>'tenant_id';

  if tenant_value is null or tenant_value = '' then
    return null;
  end if;

  return tenant_value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.is_active = true
  );
$$;

create or replace function app.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.is_active = true
      and tu.role in ('owner', 'admin')
  );
$$;

create or replace function app.current_plan_limit(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = app, public
as $$
  select pc.specialist_limit
  from app.tenant_subscriptions ts
  join app.plan_catalog pc on pc.id = ts.plan_id
  where ts.tenant_id = p_tenant_id
    and ts.status in ('trialing', 'active', 'past_due')
    and (ts.ends_at is null or ts.ends_at > now())
  order by
    case ts.status
      when 'active' then 1
      when 'trialing' then 2
      when 'past_due' then 3
      else 9
    end,
    ts.starts_at desc
  limit 1;
$$;

create or replace function app.hash_document(p_document text)
returns text
language sql
immutable
as $$
  select case
    when p_document is null or btrim(p_document) = '' then null
    else encode(digest(regexp_replace(p_document, '\D', '', 'g'), 'sha256'), 'hex')
  end;
$$;

-- =========================================================
-- 4) REGRA DE NEGOCIO: LIMITE DE ESPECIALISTAS POR PLANO
-- =========================================================

create or replace function app.enforce_specialist_limit()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- Só valida quando o especialista ficará ativo.
  if coalesce(new.active, true) = false then
    return new;
  end if;

  v_limit := app.current_plan_limit(new.tenant_id);

  if v_limit is null then
    raise exception 'Tenant sem plano ativo/trial para cadastrar especialistas.'
      using errcode = 'check_violation';
  end if;

  select count(*)
    into v_count
  from app.specialists s
  where s.tenant_id = new.tenant_id
    and s.active = true
    and s.deleted_at is null
    and (
      tg_op <> 'UPDATE'
      or s.id <> old.id
    );

  if (v_count + 1) > v_limit then
    raise exception 'Limite do plano excedido. Plano permite até % especialistas ativos.', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function app.anonymize_specialist(p_specialist_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  update app.specialists s
  set
    display_name = 'ANONIMIZADO',
    email = null,
    phone = null,
    document_hash = null,
    active = false,
    deleted_at = now(),
    updated_at = now()
  where s.id = p_specialist_id
    and app.is_tenant_admin(s.tenant_id);
end;
$$;

-- Triggers updated_at

drop trigger if exists trg_tenants_touch_updated_at on app.tenants;
create trigger trg_tenants_touch_updated_at
before update on app.tenants
for each row execute function app.touch_updated_at();

drop trigger if exists trg_plan_catalog_touch_updated_at on app.plan_catalog;
create trigger trg_plan_catalog_touch_updated_at
before update on app.plan_catalog
for each row execute function app.touch_updated_at();

drop trigger if exists trg_subscriptions_touch_updated_at on app.tenant_subscriptions;
create trigger trg_subscriptions_touch_updated_at
before update on app.tenant_subscriptions
for each row execute function app.touch_updated_at();

drop trigger if exists trg_tenant_users_touch_updated_at on app.tenant_users;
create trigger trg_tenant_users_touch_updated_at
before update on app.tenant_users
for each row execute function app.touch_updated_at();

drop trigger if exists trg_specialists_touch_updated_at on app.specialists;
create trigger trg_specialists_touch_updated_at
before update on app.specialists
for each row execute function app.touch_updated_at();

-- Trigger de limite do plano

drop trigger if exists trg_specialists_enforce_limit on app.specialists;
create trigger trg_specialists_enforce_limit
before insert or update of tenant_id, active on app.specialists
for each row execute function app.enforce_specialist_limit();

-- =========================================================
-- 5) RLS + POLICIES COM JWT/AUTH
-- =========================================================

alter table app.tenants enable row level security;
alter table app.plan_catalog enable row level security;
alter table app.tenant_subscriptions enable row level security;
alter table app.tenant_users enable row level security;
alter table app.specialists enable row level security;
alter table app.lgpd_requests enable row level security;

-- Limpa policies antigas (idempotente)
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'app'
      and tablename in ('tenants', 'plan_catalog', 'tenant_subscriptions', 'tenant_users', 'specialists', 'lgpd_requests')
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;

-- TENANTS
create policy tenants_select_member
on app.tenants
for select
using (app.is_tenant_member(id));

create policy tenants_insert_authenticated
on app.tenants
for insert
with check (auth.uid() is not null and created_by = auth.uid());

create policy tenants_update_admin
on app.tenants
for update
using (app.is_tenant_admin(id))
with check (app.is_tenant_admin(id));

-- PLAN CATALOG (somente leitura para autenticados)
create policy plan_catalog_read_authenticated
on app.plan_catalog
for select
using (auth.uid() is not null);

-- SUBSCRIPTIONS
create policy subscriptions_select_member
on app.tenant_subscriptions
for select
using (app.is_tenant_member(tenant_id));

create policy subscriptions_insert_admin
on app.tenant_subscriptions
for insert
with check (app.is_tenant_admin(tenant_id));

create policy subscriptions_update_admin
on app.tenant_subscriptions
for update
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

-- TENANT USERS
create policy tenant_users_select_member
on app.tenant_users
for select
using (app.is_tenant_member(tenant_id));

create policy tenant_users_insert_admin
on app.tenant_users
for insert
with check (app.is_tenant_admin(tenant_id));

create policy tenant_users_update_admin
on app.tenant_users
for update
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

create policy tenant_users_delete_admin
on app.tenant_users
for delete
using (app.is_tenant_admin(tenant_id));

-- SPECIALISTS
create policy specialists_select_member
on app.specialists
for select
using (
  app.is_tenant_member(tenant_id)
  and deleted_at is null
);

create policy specialists_insert_admin
on app.specialists
for insert
with check (
  app.is_tenant_admin(tenant_id)
  and (app.jwt_tenant_id() is null or tenant_id = app.jwt_tenant_id())
);

create policy specialists_update_admin
on app.specialists
for update
using (
  app.is_tenant_admin(tenant_id)
  and (app.jwt_tenant_id() is null or tenant_id = app.jwt_tenant_id())
)
with check (
  app.is_tenant_admin(tenant_id)
  and (app.jwt_tenant_id() is null or tenant_id = app.jwt_tenant_id())
);

create policy specialists_delete_admin
on app.specialists
for delete
using (
  app.is_tenant_admin(tenant_id)
  and (app.jwt_tenant_id() is null or tenant_id = app.jwt_tenant_id())
);

-- LGPD REQUESTS
create policy lgpd_requests_select_member
on app.lgpd_requests
for select
using (app.is_tenant_member(tenant_id));

create policy lgpd_requests_insert_member
on app.lgpd_requests
for insert
with check (
  app.is_tenant_member(tenant_id)
  and requester_user_id = auth.uid()
);

create policy lgpd_requests_update_admin
on app.lgpd_requests
for update
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

commit;

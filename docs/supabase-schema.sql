-- Central de Atendimento Axos - Supabase MVP Schema
-- Use no SQL Editor do Supabase

create extension if not exists "pgcrypto";

-- Clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text,
  tax_id text,
  clinica_nome text,
  clinica_cnpj text,
  status text not null default 'Novo',
  criado_em timestamptz not null default now()
);

-- Especialistas
create table if not exists public.especialistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  especialidade text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Atendimentos (Kanban)
create table if not exists public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  status text not null default 'Novo',
  canal text,
  responsavel text,
  criado_em timestamptz not null default now()
);

-- Agendamentos
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  especialista_id uuid references public.especialistas(id) on delete set null,
  data_hora timestamptz not null,
  status text not null default 'Pendente',
  criado_em timestamptz not null default now()
);

-- Cobrancas
create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  valor numeric(12,2) not null,
  status text not null default 'Pendente',
  vencimento date,
  criado_em timestamptz not null default now()
);

-- Indices basicos
create index if not exists idx_clientes_telefone on public.clientes (telefone);
create index if not exists idx_agendamentos_data on public.agendamentos (data_hora);
create index if not exists idx_cobrancas_status on public.cobrancas (status);
create index if not exists idx_atendimentos_status on public.atendimentos (status);

-- RLS (desativado para MVP local). Ative quando for para producao.
-- alter table public.clientes enable row level security;
-- alter table public.especialistas enable row level security;
-- alter table public.atendimentos enable row level security;
-- alter table public.agendamentos enable row level security;
-- alter table public.cobrancas enable row level security;


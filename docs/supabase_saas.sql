-- Core SaaS tables
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique,
  ativo boolean default true,
  billing_status text default 'ativo',
  criado_em timestamptz default now()
);

alter table if exists tenants add column if not exists billing_status text default 'ativo';

create table if not exists tenant_users (
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'admin',
  criado_em timestamptz default now(),
  primary key (tenant_id, user_id)
);

-- Evolution API tables
create table if not exists evolution_conexoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  nome text not null,
  telefone text not null,
  instance_id text not null,
  api_url text not null,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists evolution_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  event text,
  instance_id text,
  media_url text,
  media_mime text,
  media_type text,
  media_path text,
  payload jsonb not null,
  criado_em timestamptz default now()
);

alter table if exists evolution_eventos add column if not exists media_url text;
alter table if exists evolution_eventos add column if not exists media_mime text;
alter table if exists evolution_eventos add column if not exists media_type text;
alter table if exists evolution_eventos add column if not exists media_path text;

-- Supabase Storage bucket for media (private + signed URLs)
insert into storage.buckets (id, name, public)
values ('evolution-media', 'evolution-media', false)
on conflict (id) do update set public = false;

create table if not exists solara_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade unique,
  status text not null default 'ai',
  updated_at timestamptz default now()
);

create table if not exists solara_automation_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  auto_reply_enabled boolean default true,
  nps_enabled boolean default true,
  nps_message text,
  birthday_enabled boolean default true,
  birthday_message text,
  christmas_enabled boolean default true,
  christmas_message text,
  newyear_enabled boolean default true,
  newyear_message text,
  followup_7d_enabled boolean default true,
  followup_7d_message text,
  followup_11m_enabled boolean default true,
  followup_11m_message text,
  updated_at timestamptz default now()
);

alter table if exists solara_automation_settings add column if not exists auto_reply_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists nps_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists nps_message text;
alter table if exists solara_automation_settings add column if not exists birthday_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists birthday_message text;
alter table if exists solara_automation_settings add column if not exists christmas_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists christmas_message text;
alter table if exists solara_automation_settings add column if not exists newyear_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists newyear_message text;
alter table if exists solara_automation_settings add column if not exists followup_7d_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists followup_7d_message text;
alter table if exists solara_automation_settings add column if not exists followup_11m_enabled boolean default true;
alter table if exists solara_automation_settings add column if not exists followup_11m_message text;
alter table if exists solara_automation_settings add column if not exists updated_at timestamptz default now();

-- SaaS: add tenant_id to existing business tables
alter table if exists clientes add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table if exists clientes add column if not exists data_nascimento date;
alter table if exists clientes add column if not exists data_ultima_consulta date;
alter table if exists especialistas add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table if exists agendamentos add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table if exists cobrancas add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table if exists atendimentos add column if not exists tenant_id uuid references tenants(id) on delete cascade;

-- Solara chat tables
create table if not exists solara_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid,
  source text not null default 'ui',
  channel text,
  external_id text,
  status text not null default 'open',
  criado_em timestamptz default now()
);

create table if not exists solara_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references solara_threads(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb,
  criado_em timestamptz default now()
);

create table if not exists nps_respostas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  atendimento_id uuid references atendimentos(id) on delete set null,
  agendamento_id uuid references agendamentos(id) on delete set null,
  nota int,
  comentario text,
  criado_em timestamptz default now(),
  enviado_em timestamptz default now(),
  respondida_em timestamptz
);

create table if not exists solara_automation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  tipo text not null,
  referencia_data date,
  enviado_em timestamptz default now(),
  metadata jsonb
);

create unique index if not exists solara_automation_unique
  on solara_automation_logs (tenant_id, cliente_id, tipo, referencia_data);

alter table if exists solara_threads add column if not exists channel text;
alter table if exists solara_threads add column if not exists external_id text;
alter table if exists solara_threads alter column user_id drop not null;
alter table if exists nps_respostas add column if not exists agendamento_id uuid references agendamentos(id) on delete set null;
alter table if exists nps_respostas add column if not exists criado_em timestamptz default now();
alter table if exists nps_respostas add column if not exists enviado_em timestamptz default now();
alter table if exists nps_respostas add column if not exists respondida_em timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'nps_respostas' and column_name = 'respondido_em'
  ) then
    alter table nps_respostas rename column respondido_em to respondida_em;
  end if;
end $$;

-- Enable RLS
alter table if exists tenants enable row level security;
alter table if exists tenant_users enable row level security;
alter table if exists evolution_conexoes enable row level security;
alter table if exists evolution_eventos enable row level security;
alter table if exists solara_status enable row level security;
alter table if exists solara_automation_settings enable row level security;
alter table if exists solara_threads enable row level security;
alter table if exists solara_messages enable row level security;
alter table if exists nps_respostas enable row level security;
alter table if exists solara_automation_logs enable row level security;
alter table if exists clientes enable row level security;
alter table if exists especialistas enable row level security;
alter table if exists agendamentos enable row level security;
alter table if exists cobrancas enable row level security;
alter table if exists atendimentos enable row level security;

-- Basic policies (adjust to your auth model)
create policy "tenant_users_select" on tenant_users
  for select using (auth.uid() = user_id);

create policy "tenant_users_insert" on tenant_users
  for insert with check (auth.uid() = user_id);

create policy "tenants_select" on tenants
  for select using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = tenants.id and tu.user_id = auth.uid()
    )
  );

create policy "tenants_insert" on tenants
  for insert with check (true);

-- Scoped access by tenant for core tables
create policy "clientes_tenant" on clientes
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = clientes.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = clientes.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "especialistas_tenant" on especialistas
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = especialistas.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = especialistas.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "agendamentos_tenant" on agendamentos
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = agendamentos.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = agendamentos.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "cobrancas_tenant" on cobrancas
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = cobrancas.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = cobrancas.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "atendimentos_tenant" on atendimentos
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = atendimentos.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = atendimentos.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "evolution_conexoes_tenant" on evolution_conexoes
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = evolution_conexoes.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = evolution_conexoes.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "evolution_eventos_tenant" on evolution_eventos
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = evolution_eventos.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = evolution_eventos.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "solara_status_tenant" on solara_status
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_status.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_status.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "solara_threads_tenant" on solara_threads
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_threads.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_threads.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "solara_messages_tenant" on solara_messages
  for all using (
    exists (
      select 1 from solara_threads st
      join tenant_users tu on tu.tenant_id = st.tenant_id
      where st.id = solara_messages.thread_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from solara_threads st
      join tenant_users tu on tu.tenant_id = st.tenant_id
      where st.id = solara_messages.thread_id and tu.user_id = auth.uid()
    )
  );

create policy "nps_respostas_tenant" on nps_respostas
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = nps_respostas.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = nps_respostas.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "solara_automation_logs_tenant" on solara_automation_logs
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_automation_logs.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_automation_logs.tenant_id and tu.user_id = auth.uid()
    )
  );

create policy "solara_automation_settings_tenant" on solara_automation_settings
  for all using (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_automation_settings.tenant_id and tu.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tenant_users tu
      where tu.tenant_id = solara_automation_settings.tenant_id and tu.user_id = auth.uid()
    )
  );

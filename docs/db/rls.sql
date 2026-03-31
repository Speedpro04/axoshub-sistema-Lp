-- RLS for multi-tenancy (Supabase)
-- Apply with caution in the Supabase SQL editor.

-- Enable RLS
alter table public.clinicas enable row level security;
alter table public.tenant_users enable row level security;
alter table public.clientes enable row level security;
alter table public.especialistas enable row level security;
alter table public.agendamentos enable row level security;
alter table public.cobrancas enable row level security;
alter table public.atendimentos enable row level security;
alter table public.evolution_conexoes enable row level security;
alter table public.evolution_eventos enable row level security;
alter table public.nps_respostas enable row level security;
alter table public.solara_status enable row level security;
alter table public.solara_automation_settings enable row level security;
alter table public.pagbank_eventos enable row level security;
alter table public.pagbank_alertas enable row level security;
alter table public.pagbank_reprocess enable row level security;

-- tenant_users policies
create policy "tenant_users_select"
on public.tenant_users
for select
using (user_id = auth.uid());

create policy "tenant_users_insert"
on public.tenant_users
for insert
with check (user_id = auth.uid());

-- clinicas policies
create policy "clinicas_select"
on public.clinicas
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = clinicas.id
  )
);

-- Generic policy helper (tenant_id)
-- Use this block for every table with tenant_id.

create policy "clientes_select"
on public.clientes
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = clientes.tenant_id
  )
);
create policy "clientes_modify"
on public.clientes
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = clientes.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = clientes.tenant_id
  )
);

create policy "especialistas_select"
on public.especialistas
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = especialistas.tenant_id
  )
);
create policy "especialistas_modify"
on public.especialistas
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = especialistas.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = especialistas.tenant_id
  )
);

create policy "agendamentos_select"
on public.agendamentos
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = agendamentos.tenant_id
  )
);
create policy "agendamentos_modify"
on public.agendamentos
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = agendamentos.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = agendamentos.tenant_id
  )
);

create policy "cobrancas_select"
on public.cobrancas
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = cobrancas.tenant_id
  )
);
create policy "cobrancas_modify"
on public.cobrancas
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = cobrancas.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = cobrancas.tenant_id
  )
);

create policy "atendimentos_select"
on public.atendimentos
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = atendimentos.tenant_id
  )
);
create policy "atendimentos_modify"
on public.atendimentos
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = atendimentos.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = atendimentos.tenant_id
  )
);

create policy "evolution_conexoes_select"
on public.evolution_conexoes
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = evolution_conexoes.tenant_id
  )
);
create policy "evolution_conexoes_modify"
on public.evolution_conexoes
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = evolution_conexoes.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = evolution_conexoes.tenant_id
  )
);

create policy "evolution_eventos_select"
on public.evolution_eventos
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = evolution_eventos.tenant_id
  )
);

create policy "nps_respostas_select"
on public.nps_respostas
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = nps_respostas.tenant_id
  )
);
create policy "nps_respostas_modify"
on public.nps_respostas
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = nps_respostas.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = nps_respostas.tenant_id
  )
);

create policy "solara_status_select"
on public.solara_status
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_status.tenant_id
  )
);
create policy "solara_status_modify"
on public.solara_status
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_status.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_status.tenant_id
  )
);

create policy "solara_automation_settings_select"
on public.solara_automation_settings
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_automation_settings.tenant_id
  )
);
create policy "solara_automation_settings_modify"
on public.solara_automation_settings
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_automation_settings.tenant_id
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = solara_automation_settings.tenant_id
  )
);

create policy "pagbank_eventos_select"
on public.pagbank_eventos
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = pagbank_eventos.tenant_id
  )
);

create policy "pagbank_alertas_select"
on public.pagbank_alertas
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = pagbank_alertas.tenant_id
  )
);

create policy "pagbank_reprocess_select"
on public.pagbank_reprocess
for select
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = pagbank_reprocess.tenant_id
  )
);

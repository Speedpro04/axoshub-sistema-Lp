-- Central de Atendimento Axos - Supabase MVP Seed Data

insert into public.clientes (id, nome, telefone, status)
values
  (gen_random_uuid(), 'Maria Lemos', '(12) 99122-1001', 'Ativo'),
  (gen_random_uuid(), 'Joao Ribeiro', '(12) 98874-2201', 'Ativo'),
  (gen_random_uuid(), 'Clara Faria', '(12) 99211-4488', 'Novo');

insert into public.especialistas (id, nome, especialidade, ativo)
values
  (gen_random_uuid(), 'Dra. Veronica Vieira', 'Ortodontia', true),
  (gen_random_uuid(), 'Dra. Tania Fonseca', 'Proteses', true),
  (gen_random_uuid(), 'Dr. Pedro Vieira', 'Cirurgia', false);

-- Reuse ids for relationships
with c as (select id, nome from public.clientes),
     e as (select id, nome from public.especialistas)
insert into public.agendamentos (cliente_id, especialista_id, data_hora, status)
select
  (select id from c where nome = 'Maria Lemos'),
  (select id from e where nome = 'Dra. Veronica Vieira'),
  now() + interval '2 hours',
  'Confirmado'
union all
select
  (select id from c where nome = 'Clara Faria'),
  (select id from e where nome = 'Dra. Tania Fonseca'),
  now() + interval '6 hours',
  'Pendente'
union all
select
  (select id from c where nome = 'Joao Ribeiro'),
  (select id from e where nome = 'Dr. Pedro Vieira'),
  now() + interval '1 day',
  'Em atendimento';

with c as (select id, nome from public.clientes)
insert into public.cobrancas (cliente_id, valor, status, vencimento)
select
  (select id from c where nome = 'Maria Lemos'),
  220.00,
  'Pago',
  current_date - interval '2 days'
union all
select
  (select id from c where nome = 'Clara Faria'),
  180.00,
  'Pendente',
  current_date + interval '5 days'
union all
select
  (select id from c where nome = 'Joao Ribeiro'),
  450.00,
  'Atrasado',
  current_date - interval '4 days';

with c as (select id, nome from public.clientes)
insert into public.atendimentos (cliente_id, status, canal, responsavel)
select
  (select id from c where nome = 'Maria Lemos'),
  'Novo',
  'WhatsApp',
  'Recepcao'
union all
select
  (select id from c where nome = 'Joao Ribeiro'),
  'Em atendimento',
  'Telefone',
  'Recepcao'
union all
select
  (select id from c where nome = 'Clara Faria'),
  'Aguardando retorno',
  'WhatsApp',
  'Recepcao'
union all
select
  (select id from c where nome = 'Maria Lemos'),
  'Concluido',
  'WhatsApp',
  'Recepcao';

# Supabase Schema - Central de Atendimento Axos (MVP)

## Tabelas

### clientes
- id (uuid, pk)
- nome (text)
- telefone (text)
- status (text)
- criado_em (timestamp)

### especialistas
- id (uuid, pk)
- nome (text)
- especialidade (text)
- ativo (boolean)
- criado_em (timestamp)

### atendimentos
- id (uuid, pk)
- cliente_id (uuid, fk clientes)
- status (text)
- canal (text)
- responsavel (text)
- criado_em (timestamp)

### agendamentos
- id (uuid, pk)
- cliente_id (uuid, fk clientes)
- especialista_id (uuid, fk especialistas)
- data_hora (timestamp)
- status (text)
- criado_em (timestamp)

### cobrancas
- id (uuid, pk)
- cliente_id (uuid, fk clientes)
- valor (numeric)
- status (text)
- vencimento (date)
- criado_em (timestamp)

## Sugestao de status
- atendimentos: Novo, Em atendimento, Aguardando retorno, Concluido
- agendamentos: Pendente, Confirmado, Em atendimento, Finalizado, Cancelado
- cobrancas: Pendente, Pago, Atrasado

## Observacoes
- Use UUID default: gen_random_uuid().
- Use "criado_em" com default now().

-- =============================================================================
-- Migration 0200: núcleo multiempresa
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Planos comerciais (administrados pela RendaPrática)
-- -----------------------------------------------------------------------------
create table public.planos (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique check (codigo ~ '^[a-z0-9_-]{2,40}$'),
  nome                  text not null check (char_length(nome) between 2 and 80),
  descricao             text,
  preco_mensal_centavos integer not null default 0 check (preco_mensal_centavos >= 0),
  max_usuarios          integer not null check (max_usuarios > 0),
  armazenamento_mb      integer not null check (armazenamento_mb > 0),
  dias_avaliacao        integer not null default 0 check (dias_avaliacao between 0 and 365),
  publico               boolean not null default true,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
comment on table public.planos is 'Planos da RendaPrática. Valores comerciais definidos no painel administrativo (Etapa 8).';

-- Configuração operacional mínima: o plano usado no período de avaliação.
-- Não é dado fictício; os limites podem ser ajustados pela RendaPrática.
insert into public.planos (codigo, nome, descricao, preco_mensal_centavos, max_usuarios, armazenamento_mb, dias_avaliacao, publico)
values ('avaliacao', 'Avaliação', 'Plano atribuído automaticamente durante o período de avaliação.', 0, 3, 1024, 14, false);

-- -----------------------------------------------------------------------------
-- Perfis de usuário (dados públicos dentro da oficina; a senha fica no Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  nome          text not null default '' check (char_length(nome) <= 120),
  telefone      text check (telefone is null or char_length(telefone) <= 20),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Empresas (oficinas) = inquilinos do SaaS
-- -----------------------------------------------------------------------------
create table public.empresas (
  id                   uuid primary key default gen_random_uuid(),
  nome_fantasia        text not null check (char_length(nome_fantasia) between 2 and 120),
  razao_social         text check (razao_social is null or char_length(razao_social) <= 160),
  tipo_documento       text check (tipo_documento in ('cpf', 'cnpj')),
  documento            text,
  logo_path            text check (logo_path is null or char_length(logo_path) <= 300),
  cep                  text check (cep is null or cep ~ '^[0-9]{8}$'),
  logradouro           text check (logradouro is null or char_length(logradouro) <= 160),
  numero               text check (numero is null or char_length(numero) <= 20),
  complemento          text check (complemento is null or char_length(complemento) <= 80),
  bairro               text check (bairro is null or char_length(bairro) <= 80),
  cidade               text check (cidade is null or char_length(cidade) <= 80),
  uf                   text check (uf is null or uf ~ '^[A-Z]{2}$'),
  telefone             text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  whatsapp             text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  responsavel          text check (responsavel is null or char_length(responsavel) <= 120),
  dados_pagamento      text check (dados_pagamento is null or char_length(dados_pagamento) <= 500),
  cor_principal        text not null default '#F26B1D' check (cor_principal ~ '^#[0-9A-Fa-f]{6}$'),
  garantia_padrao_dias integer not null default 90 check (garantia_padrao_dias between 0 and 3650),
  texto_garantia       text check (texto_garantia is null or char_length(texto_garantia) <= 4000),
  mensagem_documentos  text check (mensagem_documentos is null or char_length(mensagem_documentos) <= 1000),
  status               public.status_empresa not null default 'em_avaliacao',
  avaliacao_termina_em timestamptz,
  suspensa_em          timestamptz,
  motivo_suspensao     text,
  criado_por           uuid references auth.users (id) on delete set null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint empresas_documento_coerente check (
    (tipo_documento is null and documento is null)
    or (tipo_documento is not null and documento is not null and app.documento_valido(tipo_documento, documento))
  ),
  constraint empresas_avaliacao_com_prazo check (
    status <> 'em_avaliacao' or avaliacao_termina_em is not null
  )
);
create index empresas_documento_idx on public.empresas (documento) where documento is not null;
create index empresas_status_idx on public.empresas (status);

-- Normalização de dados de entrada (dígitos, maiúsculas, vazios → null).
create or replace function app.normalizar_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome_fantasia   := trim(new.nome_fantasia);
  new.razao_social    := nullif(trim(new.razao_social), '');
  new.tipo_documento  := nullif(lower(trim(new.tipo_documento)), '');
  new.documento       := app.normalizar_documento(new.documento);
  new.cep             := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.logradouro      := nullif(trim(new.logradouro), '');
  new.numero          := nullif(trim(new.numero), '');
  new.complemento     := nullif(trim(new.complemento), '');
  new.bairro          := nullif(trim(new.bairro), '');
  new.cidade          := nullif(trim(new.cidade), '');
  new.uf              := nullif(upper(trim(new.uf)), '');
  new.telefone        := nullif(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), '');
  new.whatsapp        := nullif(regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g'), '');
  new.email           := nullif(lower(trim(new.email)), '');
  new.responsavel     := nullif(trim(new.responsavel), '');
  new.dados_pagamento := nullif(trim(new.dados_pagamento), '');
  new.texto_garantia  := nullif(trim(new.texto_garantia), '');
  new.mensagem_documentos := nullif(trim(new.mensagem_documentos), '');
  new.cor_principal   := upper(new.cor_principal);
  return new;
end;
$$;
grant execute on function app.normalizar_empresa() to authenticated, service_role;

create trigger empresas_normalizar
  before insert or update on public.empresas
  for each row execute function app.normalizar_empresa();

create trigger empresas_atualizado_em
  before update on public.empresas
  for each row execute function app.definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Vínculo usuário ↔ empresa (um usuário pode atuar em mais de uma oficina)
-- -----------------------------------------------------------------------------
create table public.membros_empresa (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  papel         public.papel_usuario not null,
  ativo         boolean not null default true,
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint membros_empresa_unico unique (empresa_id, usuario_id)
);
create index membros_empresa_usuario_idx on public.membros_empresa (usuario_id) where ativo;

create trigger membros_empresa_atualizado_em
  before update on public.membros_empresa
  for each row execute function app.definir_atualizado_em();

create trigger membros_empresa_mesma_empresa
  before update on public.membros_empresa
  for each row execute function app.impedir_troca_de_empresa();

-- -----------------------------------------------------------------------------
-- Convites de usuários (o token em si nunca é armazenado, só o hash SHA-256)
-- -----------------------------------------------------------------------------
create table public.convites (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  papel       public.papel_usuario not null check (papel <> 'proprietario'),
  token_hash  text not null unique,
  criado_por  uuid references auth.users (id) on delete set null,
  expira_em   timestamptz not null default now() + interval '7 days',
  aceito_em   timestamptz,
  aceito_por  uuid references auth.users (id) on delete set null,
  revogado_em timestamptz,
  criado_em   timestamptz not null default now()
);
create index convites_empresa_pendentes_idx on public.convites (empresa_id)
  where aceito_em is null and revogado_em is null;

create trigger convites_mesma_empresa
  before update on public.convites
  for each row execute function app.impedir_troca_de_empresa();

-- -----------------------------------------------------------------------------
-- Assinaturas (uma por empresa). Sem cobrança fictícia: a integração com
-- gateway de pagamento real será feita na Etapa 8.
-- -----------------------------------------------------------------------------
create table public.assinaturas (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null unique references public.empresas (id) on delete cascade,
  plano_id                 uuid not null references public.planos (id),
  status                   public.status_assinatura not null,
  inicio_em                timestamptz not null default now(),
  avaliacao_termina_em     timestamptz,
  periodo_atual_termina_em timestamptz,
  cancelada_em             timestamptz,
  referencia_externa       text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute function app.definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Administradores da plataforma RendaPrática.
-- Inseridos manualmente via SQL (service role); nenhum acesso pela API.
-- -----------------------------------------------------------------------------
create table public.admins_plataforma (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  ativo      boolean not null default true,
  observacao text,
  criado_em  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Matriz de permissões por papel, módulo e operação
-- -----------------------------------------------------------------------------
create table public.permissoes_papel (
  papel  public.papel_usuario not null,
  modulo text not null check (modulo ~ '^[a-z_]{3,40}$'),
  acao   text not null check (acao in ('ver', 'criar', 'editar', 'excluir', 'aprovar')),
  primary key (papel, modulo, acao)
);

-- Proprietário e administrador: todas as operações em todos os módulos.
insert into public.permissoes_papel (papel, modulo, acao)
select p::public.papel_usuario, m, a
from unnest(array['proprietario', 'administrador']) as p
cross join unnest(array[
  'empresa', 'usuarios', 'auditoria', 'clientes', 'equipamentos', 'ordens_servico',
  'diagnosticos', 'orcamentos', 'estoque', 'fornecedores', 'compras', 'financeiro',
  'garantias', 'documentos', 'relatorios', 'agenda'
]) as m
cross join unnest(array['ver', 'criar', 'editar', 'excluir', 'aprovar']) as a;

-- Demais papéis: permissões explícitas.
insert into public.permissoes_papel (papel, modulo, acao)
select papel::public.papel_usuario, modulo, unnest(acoes)
from (values
  ('tecnico',    'empresa',        array['ver']),
  ('tecnico',    'clientes',       array['ver']),
  ('tecnico',    'equipamentos',   array['ver', 'criar', 'editar']),
  ('tecnico',    'ordens_servico', array['ver', 'criar', 'editar']),
  ('tecnico',    'diagnosticos',   array['ver', 'criar', 'editar']),
  ('tecnico',    'orcamentos',     array['ver', 'criar', 'editar']),
  ('tecnico',    'estoque',        array['ver']),
  ('tecnico',    'garantias',      array['ver']),
  ('tecnico',    'documentos',     array['ver', 'criar']),
  ('tecnico',    'agenda',         array['ver', 'criar', 'editar']),

  ('atendente',  'empresa',        array['ver']),
  ('atendente',  'clientes',       array['ver', 'criar', 'editar']),
  ('atendente',  'equipamentos',   array['ver', 'criar', 'editar']),
  ('atendente',  'ordens_servico', array['ver', 'criar', 'editar']),
  ('atendente',  'orcamentos',     array['ver', 'criar', 'editar', 'aprovar']),
  ('atendente',  'estoque',        array['ver']),
  ('atendente',  'garantias',      array['ver', 'criar']),
  ('atendente',  'documentos',     array['ver', 'criar']),
  ('atendente',  'agenda',         array['ver', 'criar', 'editar', 'excluir']),

  ('financeiro', 'empresa',        array['ver']),
  ('financeiro', 'clientes',       array['ver']),
  ('financeiro', 'ordens_servico', array['ver']),
  ('financeiro', 'orcamentos',     array['ver']),
  ('financeiro', 'estoque',        array['ver']),
  ('financeiro', 'fornecedores',   array['ver', 'criar', 'editar']),
  ('financeiro', 'compras',        array['ver', 'criar', 'editar']),
  ('financeiro', 'financeiro',     array['ver', 'criar', 'editar', 'excluir', 'aprovar']),
  ('financeiro', 'garantias',      array['ver']),
  ('financeiro', 'documentos',     array['ver', 'criar']),
  ('financeiro', 'relatorios',     array['ver'])
) as t (papel, modulo, acoes);

-- -----------------------------------------------------------------------------
-- Numeração sequencial exclusiva por empresa (OS, orçamentos, compras, recibos…)
-- -----------------------------------------------------------------------------
create table public.numeradores (
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  tipo          text not null check (tipo ~ '^[a-z_]{2,40}$'),
  ultimo_numero bigint not null default 0 check (ultimo_numero >= 0),
  primary key (empresa_id, tipo)
);

-- -----------------------------------------------------------------------------
-- Auditoria (somente leitura para os clientes; gravada por gatilhos)
-- Sem chave estrangeira em empresa_id para que o histórico sobreviva a exclusões.
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  empresa_id   uuid,
  tabela       text not null,
  registro_id  text,
  acao         text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antes  jsonb,
  dados_depois jsonb,
  usuario_id   uuid,
  criado_em    timestamptz not null default now()
);
create index auditoria_empresa_data_idx on public.auditoria (empresa_id, criado_em desc);
create index auditoria_registro_idx on public.auditoria (tabela, registro_id);

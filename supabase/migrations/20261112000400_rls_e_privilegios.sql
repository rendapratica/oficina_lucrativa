-- =============================================================================
-- Migration 0400: Row Level Security e privilégios
--
-- Estratégia em três camadas:
--   1. RLS habilitado em todas as tabelas, com políticas por empresa.
--   2. Privilégios mínimos por tabela e por COLUNA (ex.: o proprietário pode
--      editar o nome da oficina, mas nunca o próprio status ou plano).
--   3. Operações sensíveis apenas via funções RPC que validam as regras.
-- O papel "anon" (visitante não autenticado) não tem acesso a nenhuma tabela.
-- =============================================================================

alter table public.planos            enable row level security;
alter table public.perfis            enable row level security;
alter table public.empresas          enable row level security;
alter table public.membros_empresa   enable row level security;
alter table public.convites          enable row level security;
alter table public.assinaturas       enable row level security;
alter table public.admins_plataforma enable row level security;
alter table public.permissoes_papel  enable row level security;
alter table public.numeradores       enable row level security;
alter table public.auditoria         enable row level security;

-- Remove os privilégios padrão concedidos pelo Supabase e concede só o necessário.
revoke all on table
  public.planos, public.perfis, public.empresas, public.membros_empresa,
  public.convites, public.assinaturas, public.admins_plataforma,
  public.permissoes_papel, public.numeradores, public.auditoria
from anon, authenticated;

revoke all on sequence public.auditoria_id_seq from anon, authenticated;

-- -----------------------------------------------------------------------------
-- planos: leitura dos planos ativos
-- -----------------------------------------------------------------------------
grant select on public.planos to authenticated;
create policy planos_ler on public.planos
  for select to authenticated
  using (ativo or (select app.eh_admin_plataforma()));

-- -----------------------------------------------------------------------------
-- perfis: o próprio usuário e colegas das mesmas oficinas
-- -----------------------------------------------------------------------------
grant select on public.perfis to authenticated;
grant update (nome, telefone) on public.perfis to authenticated;

create policy perfis_ler on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or app.compartilha_empresa(id));

create policy perfis_editar_proprio on public.perfis
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- empresas: membros leem; quem tem permissão edita os dados cadastrais.
-- Criação somente via public.criar_empresa(); exclusão não é permitida.
-- -----------------------------------------------------------------------------
grant select on public.empresas to authenticated;
grant update (
  nome_fantasia, razao_social, tipo_documento, documento, logo_path,
  cep, logradouro, numero, complemento, bairro, cidade, uf,
  telefone, whatsapp, email, responsavel, dados_pagamento, cor_principal,
  garantia_padrao_dias, texto_garantia, mensagem_documentos
) on public.empresas to authenticated;

create policy empresas_ler on public.empresas
  for select to authenticated
  using (
    id in (select app.empresas_do_usuario())
    or (select app.eh_admin_plataforma())
  );

create policy empresas_editar on public.empresas
  for update to authenticated
  using (app.tem_permissao(id, 'empresa', 'editar'))
  with check (app.tem_permissao(id, 'empresa', 'editar'));

-- -----------------------------------------------------------------------------
-- membros_empresa: leitura entre membros da mesma oficina.
-- Inclusão/alteração somente por RPC (criar_empresa, aceitar_convite,
-- alterar_papel_membro, definir_membro_ativo).
-- -----------------------------------------------------------------------------
grant select on public.membros_empresa to authenticated;

create policy membros_ler on public.membros_empresa
  for select to authenticated
  using (
    empresa_id in (select app.empresas_do_usuario())
    or (select app.eh_admin_plataforma())
  );

-- -----------------------------------------------------------------------------
-- convites: leitura por quem gerencia usuários (o hash do token nunca é exposto)
-- -----------------------------------------------------------------------------
grant select (id, empresa_id, email, papel, criado_por, expira_em, aceito_em, aceito_por, revogado_em, criado_em)
  on public.convites to authenticated;

create policy convites_ler on public.convites
  for select to authenticated
  using (app.tem_permissao(empresa_id, 'usuarios', 'ver'));

-- -----------------------------------------------------------------------------
-- assinaturas: leitura pelos membros; escrita apenas pela RendaPrática
-- -----------------------------------------------------------------------------
grant select on public.assinaturas to authenticated;

create policy assinaturas_ler on public.assinaturas
  for select to authenticated
  using (
    empresa_id in (select app.empresas_do_usuario())
    or (select app.eh_admin_plataforma())
  );

-- -----------------------------------------------------------------------------
-- permissoes_papel: leitura (a interface usa para exibir/ocultar ações;
-- a autorização real é sempre feita no banco)
-- -----------------------------------------------------------------------------
grant select on public.permissoes_papel to authenticated;

create policy permissoes_ler on public.permissoes_papel
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- auditoria: leitura por quem tem permissão na empresa; ninguém grava pela API
-- -----------------------------------------------------------------------------
grant select on public.auditoria to authenticated;

create policy auditoria_ler on public.auditoria
  for select to authenticated
  using (
    app.tem_permissao(empresa_id, 'auditoria', 'ver')
    or (select app.eh_admin_plataforma())
  );

-- admins_plataforma e numeradores: RLS habilitado e nenhuma política/privilégio
-- para anon e authenticated → inacessíveis pela API.

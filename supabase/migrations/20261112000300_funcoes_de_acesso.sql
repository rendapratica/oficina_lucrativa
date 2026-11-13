-- =============================================================================
-- Migration 0300: funções de acesso (base do RLS), auditoria e integração Auth
--
-- As funções são SECURITY DEFINER para consultar membros_empresa sem disparar
-- o RLS da própria tabela (evita recursão). Todas fixam search_path = '' e
-- usam nomes qualificados, conforme a recomendação de segurança do Supabase.
-- =============================================================================

-- Empresas em que o usuário autenticado é membro ativo (inclui suspensas,
-- para que ele consiga ver a situação da conta).
create or replace function app.empresas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.empresa_id
  from public.membros_empresa m
  where m.usuario_id = auth.uid()
    and m.ativo;
$$;

-- A empresa pode operar? (ativa, ou em avaliação dentro do prazo)
create or replace function app.empresa_operante(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresas e
    where e.id = p_empresa
      and (
        e.status = 'ativa'
        or (e.status = 'em_avaliacao' and e.avaliacao_termina_em > now())
      )
  );
$$;

-- Empresas que o usuário pode efetivamente usar (membro ativo + empresa operante).
-- É a função que as tabelas operacionais das próximas etapas usarão no RLS.
create or replace function app.empresas_acessiveis()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.empresa_id
  from public.membros_empresa m
  join public.empresas e on e.id = m.empresa_id
  where m.usuario_id = auth.uid()
    and m.ativo
    and (
      e.status = 'ativa'
      or (e.status = 'em_avaliacao' and e.avaliacao_termina_em > now())
    );
$$;

create or replace function app.pode_acessar(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_empresa is not null
     and p_empresa in (select app.empresas_acessiveis());
$$;

create or replace function app.papel_na_empresa(p_empresa uuid)
returns public.papel_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
  from public.membros_empresa m
  where m.empresa_id = p_empresa
    and m.usuario_id = auth.uid()
    and m.ativo;
$$;

-- Permissão por módulo e operação, sempre condicionada à empresa operante.
create or replace function app.tem_permissao(p_empresa uuid, p_modulo text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.empresa_operante(p_empresa)
     and exists (
       select 1
       from public.membros_empresa m
       join public.permissoes_papel pp on pp.papel = m.papel
       where m.empresa_id = p_empresa
         and m.usuario_id = auth.uid()
         and m.ativo
         and pp.modulo = p_modulo
         and pp.acao = p_acao
     );
$$;

-- Empresas em que o usuário tem a permissão informada. Nas políticas, use
--   empresa_id in (select app.empresas_com_permissao('clientes', 'ver'))
-- para que o PostgreSQL avalie a permissão UMA vez por consulta (initplan),
-- e não linha a linha — essencial em tabelas grandes (OS, estoque, financeiro).
create or replace function app.empresas_com_permissao(p_modulo text, p_acao text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.empresa_id
  from public.membros_empresa m
  join public.empresas e on e.id = m.empresa_id
  join public.permissoes_papel pp on pp.papel = m.papel
  where m.usuario_id = auth.uid()
    and m.ativo
    and pp.modulo = p_modulo
    and pp.acao = p_acao
    and (
      e.status = 'ativa'
      or (e.status = 'em_avaliacao' and e.avaliacao_termina_em > now())
    );
$$;

-- Autorização administrativa da RendaPrática: consulta a tabela protegida
-- admins_plataforma no banco. Nunca depende de variável no frontend.
create or replace function app.eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins_plataforma a
    where a.usuario_id = auth.uid()
      and a.ativo
  );
$$;

-- O usuário informado pertence a alguma empresa do usuário autenticado?
create or replace function app.compartilha_empresa(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membros_empresa m
    where m.usuario_id = p_usuario
      and m.empresa_id in (select app.empresas_do_usuario())
  );
$$;

-- Próximo número sequencial da empresa (atômico, sem lacunas por concorrência).
create or replace function app.proximo_numero(p_empresa uuid, p_tipo text)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.numeradores as n (empresa_id, tipo, ultimo_numero)
  values (p_empresa, p_tipo, 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = n.ultimo_numero + 1
  returning ultimo_numero;
$$;

grant execute on function app.empresas_do_usuario() to authenticated, service_role;
grant execute on function app.empresa_operante(uuid) to authenticated, service_role;
grant execute on function app.empresas_acessiveis() to authenticated, service_role;
grant execute on function app.pode_acessar(uuid) to authenticated, service_role;
grant execute on function app.papel_na_empresa(uuid) to authenticated, service_role;
grant execute on function app.tem_permissao(uuid, text, text) to authenticated, service_role;
grant execute on function app.empresas_com_permissao(text, text) to authenticated, service_role;
grant execute on function app.eh_admin_plataforma() to authenticated, service_role;
grant execute on function app.compartilha_empresa(uuid) to authenticated, service_role;
-- proximo_numero é chamado apenas por gatilhos/RPCs SECURITY DEFINER.
grant execute on function app.proximo_numero(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Auditoria genérica
-- -----------------------------------------------------------------------------
create or replace function app.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'token_hash' end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'token_hash' end;
  v_linha  jsonb := coalesce(v_depois, v_antes);
  v_empresa uuid;
begin
  if tg_op = 'UPDATE' and v_antes = v_depois then
    return null;
  end if;

  v_empresa := case
    when tg_table_name = 'empresas' then (v_linha ->> 'id')::uuid
    else (v_linha ->> 'empresa_id')::uuid
  end;

  insert into public.auditoria (empresa_id, tabela, registro_id, acao, dados_antes, dados_depois, usuario_id)
  values (v_empresa, tg_table_name, v_linha ->> 'id', tg_op, v_antes, v_depois, auth.uid());

  return null;
end;
$$;
grant execute on function app.auditar() to authenticated, service_role;

create trigger empresas_auditoria
  after insert or update or delete on public.empresas
  for each row execute function app.auditar();

create trigger membros_empresa_auditoria
  after insert or update or delete on public.membros_empresa
  for each row execute function app.auditar();

create trigger convites_auditoria
  after insert or update or delete on public.convites
  for each row execute function app.auditar();

create trigger assinaturas_auditoria
  after insert or update or delete on public.assinaturas
  for each row execute function app.auditar();

-- -----------------------------------------------------------------------------
-- Integração com Supabase Auth: cria e sincroniza o perfil
-- -----------------------------------------------------------------------------
create or replace function app.ao_criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email, nome)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(trim(coalesce(new.raw_user_meta_data ->> 'nome', '')), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function app.ao_alterar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfis
     set email = lower(coalesce(new.email, ''))
   where id = new.id;
  return new;
end;
$$;

create trigger oficina_lucrativa_ao_criar_usuario
  after insert on auth.users
  for each row execute function app.ao_criar_usuario();

create trigger oficina_lucrativa_ao_alterar_email
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function app.ao_alterar_email_usuario();

create trigger perfis_atualizado_em
  before update on public.perfis
  for each row execute function app.definir_atualizado_em();

-- O Supabase Auth grava em auth.users com o papel supabase_auth_admin.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.ao_criar_usuario() to supabase_auth_admin;
    grant execute on function app.ao_alterar_email_usuario() to supabase_auth_admin;
  end if;
end;
$$;

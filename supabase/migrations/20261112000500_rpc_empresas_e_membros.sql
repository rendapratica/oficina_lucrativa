-- =============================================================================
-- Migration 0500: funções RPC (chamadas pelo frontend via supabase.rpc)
--
-- Códigos de erro usados:
--   28000 sessão ausente | 42501 sem permissão | 22023 dado inválido
--   P0001 regra de negócio | P0002 não encontrado
-- =============================================================================

-- Limite de oficinas que uma mesma conta pode criar sozinha.
create or replace function app.limite_oficinas_por_conta()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;
grant execute on function app.limite_oficinas_por_conta() to authenticated, service_role;

-- Vagas de usuário ocupadas (membros ativos + convites pendentes válidos).
create or replace function app.vagas_ocupadas(p_empresa uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.membros_empresa m where m.empresa_id = p_empresa and m.ativo)
    + (select count(*) from public.convites c
        where c.empresa_id = p_empresa and c.aceito_em is null
          and c.revogado_em is null and c.expira_em > now())
  )::integer;
$$;

create or replace function app.limite_usuarios(p_empresa uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select p.max_usuarios
  from public.assinaturas a
  join public.planos p on p.id = a.plano_id
  where a.empresa_id = p_empresa;
$$;
grant execute on function app.vagas_ocupadas(uuid) to authenticated, service_role;
grant execute on function app.limite_usuarios(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- criar_empresa: cadastra a oficina, o proprietário e a assinatura de avaliação
-- -----------------------------------------------------------------------------
create or replace function public.criar_empresa(
  p_nome_fantasia  text,
  p_tipo_documento text default null,
  p_documento      text default null,
  p_telefone       text default null,
  p_whatsapp       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario    uuid := auth.uid();
  v_email      text;
  v_confirmado timestamptz;
  v_nome       text;
  v_plano      public.planos%rowtype;
  v_empresa    uuid;
  v_tipo       text := nullif(lower(trim(p_tipo_documento)), '');
  v_documento  text := app.normalizar_documento(p_documento);
  v_termino    timestamptz;
begin
  if v_usuario is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmado
  from auth.users u where u.id = v_usuario;

  if v_confirmado is null then
    raise exception 'Confirme seu e-mail antes de cadastrar a oficina.' using errcode = '42501';
  end if;

  if char_length(coalesce(trim(p_nome_fantasia), '')) < 2 then
    raise exception 'Informe o nome da oficina (mínimo de 2 caracteres).' using errcode = '22023';
  end if;

  if (v_tipo is null) <> (v_documento is null) then
    raise exception 'Informe o tipo e o número do documento, ou deixe ambos em branco.' using errcode = '22023';
  end if;

  if v_tipo is not null and not app.documento_valido(v_tipo, v_documento) then
    raise exception '% inválido. Confira os dígitos.', upper(v_tipo) using errcode = '22023';
  end if;

  -- Serializa cadastros simultâneos do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_usuario::text, 0));

  if (select count(*) from public.membros_empresa m
       where m.usuario_id = v_usuario and m.papel = 'proprietario') >= app.limite_oficinas_por_conta() then
    raise exception 'Esta conta já atingiu o limite de oficinas. Fale com a RendaPrática.' using errcode = 'P0001';
  end if;

  select * into v_plano from public.planos where codigo = 'avaliacao' and ativo;
  if not found then
    raise exception 'Cadastro temporariamente indisponível: plano de avaliação não configurado.' using errcode = 'P0001';
  end if;

  select nullif(p.nome, '') into v_nome from public.perfis p where p.id = v_usuario;
  v_termino := now() + make_interval(days => v_plano.dias_avaliacao);

  insert into public.empresas (
    nome_fantasia, tipo_documento, documento, telefone, whatsapp, email,
    responsavel, status, avaliacao_termina_em, criado_por
  ) values (
    p_nome_fantasia, v_tipo, v_documento, p_telefone, p_whatsapp, v_email,
    v_nome, 'em_avaliacao', v_termino, v_usuario
  )
  returning id into v_empresa;

  insert into public.membros_empresa (empresa_id, usuario_id, papel)
  values (v_empresa, v_usuario, 'proprietario');

  insert into public.assinaturas (empresa_id, plano_id, status, avaliacao_termina_em)
  values (v_empresa, v_plano.id, 'avaliacao', v_termino);

  return v_empresa;
end;
$$;

-- -----------------------------------------------------------------------------
-- criar_convite: devolve o token UMA única vez (o banco guarda apenas o hash)
-- -----------------------------------------------------------------------------
create or replace function public.criar_convite(
  p_empresa uuid,
  p_email   text,
  p_papel   public.papel_usuario
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_token  text;
  v_limite integer;
  v_membro_ativo boolean;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  if not app.tem_permissao(p_empresa, 'usuarios', 'criar') then
    raise exception 'Você não tem permissão para convidar usuários nesta oficina.' using errcode = '42501';
  end if;

  if p_papel = 'proprietario' then
    raise exception 'O papel de proprietário não pode ser atribuído por convite.' using errcode = '22023';
  end if;

  if p_papel = 'administrador' and app.papel_na_empresa(p_empresa) <> 'proprietario' then
    raise exception 'Somente o proprietário pode convidar administradores.' using errcode = '42501';
  end if;

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  -- Serializa a contagem de vagas da empresa.
  perform 1 from public.empresas where id = p_empresa for update;

  select m.ativo into v_membro_ativo
  from public.membros_empresa m
  join public.perfis p on p.id = m.usuario_id
  where m.empresa_id = p_empresa and p.email = v_email;

  if v_membro_ativo is true then
    raise exception 'Este e-mail já pertence a um usuário da oficina.' using errcode = 'P0001';
  elsif v_membro_ativo is false then
    raise exception 'Este e-mail pertence a um usuário desativado. Reative-o na lista de usuários.' using errcode = 'P0001';
  end if;

  -- Um novo convite substitui o anterior pendente para o mesmo e-mail.
  update public.convites
     set revogado_em = now()
   where empresa_id = p_empresa and email = v_email
     and aceito_em is null and revogado_em is null;

  v_limite := app.limite_usuarios(p_empresa);
  if v_limite is not null and app.vagas_ocupadas(p_empresa) >= v_limite then
    raise exception 'O plano atual permite até % usuários, contando convites pendentes.', v_limite
      using errcode = 'P0001';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.convites (empresa_id, email, papel, token_hash, criado_por)
  values (p_empresa, v_email, p_papel, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- consultar_convite: dados mínimos para a tela de aceite
-- -----------------------------------------------------------------------------
create or replace function public.consultar_convite(p_token text)
returns table (
  empresa_nome text,
  papel        public.papel_usuario,
  email        text,
  expira_em    timestamptz,
  situacao     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.nome_fantasia,
         c.papel,
         c.email,
         c.expira_em,
         case
           when c.revogado_em is not null then 'cancelado'
           when c.aceito_em is not null then 'utilizado'
           when c.expira_em <= now() then 'expirado'
           else 'valido'
         end
  from public.convites c
  join public.empresas e on e.id = c.empresa_id
  where auth.uid() is not null
    and c.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- aceitar_convite: vincula o usuário autenticado à oficina
-- -----------------------------------------------------------------------------
create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite    public.convites%rowtype;
  v_email      text;
  v_confirmado timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  select * into v_convite
  from public.convites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Convite não encontrado. Confira o link recebido.' using errcode = 'P0002';
  elsif v_convite.revogado_em is not null then
    raise exception 'Este convite foi cancelado. Peça um novo convite à oficina.' using errcode = 'P0001';
  elsif v_convite.aceito_em is not null then
    raise exception 'Este convite já foi utilizado.' using errcode = 'P0001';
  elsif v_convite.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo convite à oficina.' using errcode = 'P0001';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmado
  from auth.users u where u.id = auth.uid();

  if v_email is distinct from v_convite.email then
    raise exception 'Este convite foi enviado para %. Entre com essa conta para aceitá-lo.', v_convite.email
      using errcode = '42501';
  end if;

  if v_confirmado is null then
    raise exception 'Confirme seu e-mail antes de aceitar o convite.' using errcode = '42501';
  end if;

  if not app.empresa_operante(v_convite.empresa_id) then
    raise exception 'O acesso desta oficina está suspenso no momento.' using errcode = 'P0001';
  end if;

  insert into public.membros_empresa (empresa_id, usuario_id, papel, convidado_por)
  values (v_convite.empresa_id, auth.uid(), v_convite.papel, v_convite.criado_por)
  on conflict (empresa_id, usuario_id)
  do update set papel = excluded.papel, ativo = true, convidado_por = excluded.convidado_por;

  update public.convites
     set aceito_em = now(), aceito_por = auth.uid()
   where id = v_convite.id;

  return v_convite.empresa_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- revogar_convite
-- -----------------------------------------------------------------------------
create or replace function public.revogar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.convites where id = p_convite;

  if v_empresa is null or not app.tem_permissao(v_empresa, 'usuarios', 'editar') then
    raise exception 'Convite não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  update public.convites
     set revogado_em = now()
   where id = p_convite and aceito_em is null and revogado_em is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- alterar_papel_membro
-- -----------------------------------------------------------------------------
create or replace function public.alterar_papel_membro(p_membro uuid, p_papel public.papel_usuario)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros_empresa%rowtype;
  v_meu    public.papel_usuario;
begin
  select * into v_membro from public.membros_empresa where id = p_membro;

  if not found or not app.tem_permissao(v_membro.empresa_id, 'usuarios', 'editar') then
    raise exception 'Usuário não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  perform 1 from public.empresas where id = v_membro.empresa_id for update;
  select * into v_membro from public.membros_empresa where id = p_membro for update;

  v_meu := app.papel_na_empresa(v_membro.empresa_id);

  if (v_membro.papel in ('proprietario', 'administrador') or p_papel in ('proprietario', 'administrador'))
     and v_meu <> 'proprietario' then
    raise exception 'Somente o proprietário pode atribuir ou retirar os papéis de proprietário e administrador.'
      using errcode = '42501';
  end if;

  if v_membro.papel = 'proprietario' and p_papel <> 'proprietario'
     and (select count(*) from public.membros_empresa
           where empresa_id = v_membro.empresa_id and papel = 'proprietario' and ativo) <= 1 then
    raise exception 'A oficina precisa de pelo menos um proprietário ativo.' using errcode = 'P0001';
  end if;

  update public.membros_empresa set papel = p_papel where id = p_membro;
end;
$$;

-- -----------------------------------------------------------------------------
-- definir_membro_ativo: desativa ou reativa o acesso de um usuário à oficina
-- -----------------------------------------------------------------------------
create or replace function public.definir_membro_ativo(p_membro uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros_empresa%rowtype;
  v_limite integer;
begin
  select * into v_membro from public.membros_empresa where id = p_membro;

  if not found or not app.tem_permissao(v_membro.empresa_id, 'usuarios', 'editar') then
    raise exception 'Usuário não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  perform 1 from public.empresas where id = v_membro.empresa_id for update;
  select * into v_membro from public.membros_empresa where id = p_membro for update;

  if v_membro.ativo = p_ativo then
    return;
  end if;

  if v_membro.papel in ('proprietario', 'administrador')
     and app.papel_na_empresa(v_membro.empresa_id) <> 'proprietario' then
    raise exception 'Somente o proprietário pode ativar ou desativar proprietários e administradores.'
      using errcode = '42501';
  end if;

  if not p_ativo and v_membro.papel = 'proprietario'
     and (select count(*) from public.membros_empresa
           where empresa_id = v_membro.empresa_id and papel = 'proprietario' and ativo) <= 1 then
    raise exception 'A oficina precisa de pelo menos um proprietário ativo.' using errcode = 'P0001';
  end if;

  if p_ativo then
    v_limite := app.limite_usuarios(v_membro.empresa_id);
    if v_limite is not null and app.vagas_ocupadas(v_membro.empresa_id) >= v_limite then
      raise exception 'O plano atual permite até % usuários, contando convites pendentes.', v_limite
        using errcode = 'P0001';
    end if;
  end if;

  update public.membros_empresa set ativo = p_ativo where id = p_membro;
end;
$$;

-- -----------------------------------------------------------------------------
-- resumo_empresa: indicadores de conta exibidos na página inicial
-- -----------------------------------------------------------------------------
create or replace function public.resumo_empresa(p_empresa uuid)
returns table (
  plano_nome       text,
  max_usuarios     integer,
  armazenamento_mb integer,
  vagas_ocupadas   integer,
  membros_ativos   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nome,
         p.max_usuarios,
         p.armazenamento_mb,
         app.vagas_ocupadas(p_empresa),
         (select count(*)::integer from public.membros_empresa m where m.empresa_id = p_empresa and m.ativo)
  from public.assinaturas a
  join public.planos p on p.id = a.plano_id
  where a.empresa_id = p_empresa
    and p_empresa in (select app.empresas_do_usuario());
$$;

-- -----------------------------------------------------------------------------
-- eh_admin_plataforma: usado pela interface para exibir o painel RendaPrática.
-- A autorização real é feita pelo RLS e pelas RPCs administrativas (Etapa 8).
-- -----------------------------------------------------------------------------
create or replace function public.eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app.eh_admin_plataforma(); $$;

-- -----------------------------------------------------------------------------
-- Privilégios: somente usuários autenticados executam as RPCs
-- -----------------------------------------------------------------------------
revoke execute on function public.criar_empresa(text, text, text, text, text) from public, anon;
revoke execute on function public.criar_convite(uuid, text, public.papel_usuario) from public, anon;
revoke execute on function public.consultar_convite(text) from public, anon;
revoke execute on function public.aceitar_convite(text) from public, anon;
revoke execute on function public.revogar_convite(uuid) from public, anon;
revoke execute on function public.alterar_papel_membro(uuid, public.papel_usuario) from public, anon;
revoke execute on function public.definir_membro_ativo(uuid, boolean) from public, anon;
revoke execute on function public.resumo_empresa(uuid) from public, anon;
revoke execute on function public.eh_admin_plataforma() from public, anon;

grant execute on function public.criar_empresa(text, text, text, text, text) to authenticated;
grant execute on function public.criar_convite(uuid, text, public.papel_usuario) to authenticated;
grant execute on function public.consultar_convite(text) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.revogar_convite(uuid) to authenticated;
grant execute on function public.alterar_papel_membro(uuid, public.papel_usuario) to authenticated;
grant execute on function public.definir_membro_ativo(uuid, boolean) to authenticated;
grant execute on function public.resumo_empresa(uuid) to authenticated;
grant execute on function public.eh_admin_plataforma() to authenticated;

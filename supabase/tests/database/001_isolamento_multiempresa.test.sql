-- =============================================================================
-- Testes de isolamento multiempresa (pgTAP)
-- Executar com:  supabase test db
-- Tudo roda dentro de uma transação desfeita ao final (nenhum dado permanece).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(58);

-- -----------------------------------------------------------------------------
-- Infraestrutura do teste
-- -----------------------------------------------------------------------------
create schema teste;
grant usage on schema teste to authenticated, anon;
create table teste.ctx (k text primary key, v text);
grant all on teste.ctx to authenticated;

create function teste.v(p_k text) returns text language sql stable as
  $$ select v from teste.ctx where k = p_k $$;
create function teste.uid(p_k text) returns uuid language sql stable as
  $$ select v::uuid from teste.ctx where k = p_k $$;
grant execute on function teste.v(text), teste.uid(text) to authenticated, anon;

-- Simula uma requisição autenticada do usuário informado.
create function teste.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Volta ao papel administrativo do banco (fora do RLS).
create function teste.como_banco() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create function teste.como_anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;
grant execute on function teste.como(uuid), teste.como_banco(), teste.como_anonimo() to authenticated, anon;

insert into teste.ctx values
  ('a', 'a0000000-0000-4000-8000-000000000001'),
  ('b', 'b0000000-0000-4000-8000-000000000002'),
  ('c', 'c0000000-0000-4000-8000-000000000003'),
  ('d', 'd0000000-0000-4000-8000-000000000004');

insert into auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) values
  (teste.uid('a'), 'ana@teste.local',    now(), 'authenticated', 'authenticated', '{"nome":"Ana"}'),
  (teste.uid('b'), 'bruno@teste.local',  now(), 'authenticated', 'authenticated', '{"nome":"Bruno"}'),
  (teste.uid('c'), 'carla@teste.local',  now(), 'authenticated', 'authenticated', '{"nome":"Carla"}'),
  (teste.uid('d'), 'diego@teste.local',  null,  'authenticated', 'authenticated', '{"nome":"Diego"}');

select is((select count(*)::int from public.perfis), 4, 'Perfis criados automaticamente pelo gatilho do Auth');

-- -----------------------------------------------------------------------------
-- Cadastro de oficinas
-- -----------------------------------------------------------------------------
select teste.como(teste.uid('a'));
select lives_ok(
  $$ insert into teste.ctx values ('emp_a', public.criar_empresa('Oficina Alfa', 'cnpj', '11.222.333/0001-81')::text) $$,
  'Ana cadastra a Oficina Alfa');

select teste.como(teste.uid('b'));
select lives_ok(
  $$ insert into teste.ctx values ('emp_b', public.criar_empresa('Oficina Beta', 'cpf', '529.982.247-25')::text) $$,
  'Bruno cadastra a Oficina Beta');

select teste.como(teste.uid('d'));
select throws_ok(
  $$ select public.criar_empresa('Oficina Delta') $$,
  '42501', null, 'Usuário sem e-mail confirmado não cadastra oficina');

select teste.como(teste.uid('a'));
select throws_ok(
  $$ select public.criar_empresa('Oficina Inválida', 'cnpj', '11.222.333/0001-82') $$,
  '22023', null, 'CNPJ com dígito verificador errado é recusado');

-- -----------------------------------------------------------------------------
-- Isolamento de leitura e escrita entre oficinas
-- -----------------------------------------------------------------------------
select is((select count(*)::int from public.empresas), 1, 'Ana vê somente a própria oficina');
select is((select count(*)::int from public.empresas where id = teste.uid('emp_b')), 0, 'Ana não lê a Oficina Beta pelo id');
select is((select count(*)::int from public.membros_empresa where empresa_id = teste.uid('emp_b')), 0, 'Ana não vê os usuários da Beta');
select is((select count(*)::int from public.assinaturas), 1, 'Ana vê somente a assinatura da própria oficina');
select is((select count(*)::int from public.auditoria where empresa_id = teste.uid('emp_b')), 0, 'Ana não vê a auditoria da Beta');
select ok((select count(*) from public.auditoria where empresa_id = teste.uid('emp_a')) > 0, 'Ana vê a auditoria da própria oficina');
select is((select count(*)::int from public.perfis where id = teste.uid('b')), 0, 'Ana não vê o perfil de usuário de outra oficina');

select lives_ok(
  $$ update public.empresas set nome_fantasia = 'Invadida' where id = teste.uid('emp_b') $$,
  'Atualização na Beta feita pela Ana não gera erro, mas não afeta linhas (verificado ao final)');

select lives_ok(
  $$ update public.empresas set nome_fantasia = 'Oficina Alfa Eletrônica' where id = teste.uid('emp_a') $$,
  'Controle positivo: Ana altera o nome da própria oficina');

select throws_ok(
  $$ insert into public.membros_empresa (empresa_id, usuario_id, papel) values (teste.uid('emp_b'), teste.uid('a'), 'proprietario') $$,
  '42501', null, 'Ana não se insere como membro da Beta');

select throws_ok(
  $$ insert into public.empresas (nome_fantasia) values ('Oficina Direta') $$,
  '42501', null, 'Inserção direta em empresas é bloqueada (somente via RPC)');

select throws_ok(
  $$ update public.empresas set status = 'ativa' where id = teste.uid('emp_a') $$,
  '42501', null, 'Proprietário não altera o status da própria assinatura');

select throws_ok(
  $$ update public.empresas set avaliacao_termina_em = now() + interval '10 years' where id = teste.uid('emp_a') $$,
  '42501', null, 'Proprietário não estende o período de avaliação');

select throws_ok(
  $$ delete from public.empresas where id = teste.uid('emp_a') $$,
  '42501', null, 'Exclusão de empresa pela API é bloqueada');

select throws_ok($$ select * from public.admins_plataforma $$, '42501', null, 'Tabela de administradores inacessível');
select throws_ok($$ select * from public.numeradores $$, '42501', null, 'Tabela de numeradores inacessível');
select throws_ok($$ select token_hash from public.convites $$, '42501', null, 'Hash do token de convite nunca é exposto');

select throws_ok(
  $$ select public.criar_convite(teste.uid('emp_b'), 'intruso@teste.local', 'tecnico') $$,
  '42501', null, 'Ana não cria convite para a Beta');

-- -----------------------------------------------------------------------------
-- Convites e papéis
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ insert into teste.ctx values ('token_c', public.criar_convite(teste.uid('emp_a'), 'Carla@Teste.local', 'tecnico')) $$,
  'Ana convida Carla como técnica');

select is((select situacao from public.consultar_convite(teste.v('token_c'))), 'valido', 'Convite consultável pelo token');

select is(
  (select array_agg(x) from app.empresas_com_permissao('usuarios', 'criar') x),
  array[teste.uid('emp_a')],
  'empresas_com_permissao devolve só a oficina em que Ana pode convidar');

select teste.como(teste.uid('b'));
select throws_ok(
  $$ select public.aceitar_convite(teste.v('token_c')) $$,
  '42501', null, 'Bruno não aceita convite enviado para outro e-mail');

select teste.como(teste.uid('c'));
select is(public.aceitar_convite(teste.v('token_c')), teste.uid('emp_a'), 'Carla aceita o convite');
select throws_ok(
  $$ select public.aceitar_convite(teste.v('token_c')) $$,
  'P0001', null, 'Convite não pode ser reutilizado');

select is((select count(*)::int from public.empresas), 1, 'Carla vê somente a Oficina Alfa');
select is((select count(*)::int from public.perfis where id = teste.uid('a')), 1, 'Carla vê o perfil da colega da mesma oficina');

select is(
  (select count(*)::int from app.empresas_com_permissao('usuarios', 'criar')),
  0, 'Técnica não tem permissão de convidar em nenhuma oficina');

select throws_ok(
  $$ select public.criar_convite(teste.uid('emp_a'), 'outro@teste.local', 'atendente') $$,
  '42501', null, 'Técnica não convida usuários');

select throws_ok(
  $$ select public.alterar_papel_membro((select id from public.membros_empresa where usuario_id = teste.uid('c')), 'administrador') $$,
  '42501', null, 'Técnica não se promove a administradora');

select lives_ok(
  $$ update public.empresas set nome_fantasia = 'Alterada pela técnica' where id = teste.uid('emp_a') $$,
  'Atualização da técnica não gera erro, mas não afeta linhas (verificado ao final)');

select teste.como(teste.uid('a'));
select throws_ok(
  $$ select public.criar_convite(teste.uid('emp_a'), 'carla@teste.local', 'atendente') $$,
  'P0001', null, 'Não é possível convidar quem já é membro');

select throws_ok(
  $$ select public.alterar_papel_membro((select id from public.membros_empresa where usuario_id = teste.uid('a')), 'tecnico') $$,
  'P0001', null, 'O último proprietário não pode deixar de ser proprietário');

select throws_ok(
  $$ select public.definir_membro_ativo((select id from public.membros_empresa where usuario_id = teste.uid('a')), false) $$,
  'P0001', null, 'O último proprietário não pode ser desativado');

-- -----------------------------------------------------------------------------
-- Storage isolado por empresa
-- -----------------------------------------------------------------------------
select teste.como_banco();
insert into storage.objects (bucket_id, name) values ('empresa-arquivos', teste.v('emp_b') || '/os/1/foto.jpg');

select teste.como(teste.uid('a'));
select is((select count(*)::int from storage.objects where bucket_id = 'empresa-arquivos'), 0, 'Ana não lista arquivos da Beta');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('empresa-arquivos', teste.v('emp_b') || '/os/2/foto.jpg') $$,
  '42501', null, 'Ana não grava arquivo na pasta da Beta');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('empresa-arquivos', 'sem-empresa/arquivo.jpg') $$,
  '42501', null, 'Arquivo fora da pasta de uma empresa é recusado');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('empresa-arquivos', teste.v('emp_a') || '/marca/logo.png') $$,
  'Proprietária grava o logotipo da própria oficina');
select is((select count(*)::int from storage.objects where bucket_id = 'empresa-arquivos'), 1, 'Controle positivo: Ana lista somente o arquivo da própria oficina');

select teste.como(teste.uid('c'));
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('empresa-arquivos', teste.v('emp_a') || '/marca/logo2.png') $$,
  '42501', null, 'Técnica não altera a identidade visual');

-- -----------------------------------------------------------------------------
-- Visitante anônimo
-- -----------------------------------------------------------------------------
select teste.como_anonimo();
select throws_ok($$ select * from public.empresas $$, '42501', null, 'Visitante anônimo não lê empresas');
select throws_ok($$ select public.criar_empresa('Oficina Anônima') $$, '42501', null, 'Visitante anônimo não executa RPCs');

-- -----------------------------------------------------------------------------
-- Suspensão e fim do período de avaliação
-- -----------------------------------------------------------------------------
select teste.como_banco();
update public.empresas set status = 'suspensa', suspensa_em = now() where id = teste.uid('emp_a');
update public.empresas set avaliacao_termina_em = now() - interval '1 day' where id = teste.uid('emp_b');

select teste.como(teste.uid('a'));
select is((select status::text from public.empresas where id = teste.uid('emp_a')), 'suspensa', 'Oficina suspensa continua visível para mostrar a situação');
select ok(not app.pode_acessar(teste.uid('emp_a')), 'Oficina suspensa não pode operar');
select is((select count(*)::int from storage.objects where bucket_id = 'empresa-arquivos'), 0, 'Arquivos de oficina suspensa ficam bloqueados');

select teste.como(teste.uid('b'));
select ok(not app.pode_acessar(teste.uid('emp_b')), 'Avaliação vencida bloqueia a operação');

-- -----------------------------------------------------------------------------
-- Administrador da plataforma (autorização no banco, não no frontend)
-- -----------------------------------------------------------------------------
select is(public.eh_admin_plataforma(), false, 'Usuário comum não é administrador da plataforma');

select teste.como_banco();
insert into public.admins_plataforma (usuario_id) values (teste.uid('b'));

select teste.como(teste.uid('b'));
select is(public.eh_admin_plataforma(), true, 'Administrador reconhecido pela tabela protegida');
select is((select count(*)::int from public.empresas), 2, 'Administrador da plataforma consulta todas as oficinas');

-- -----------------------------------------------------------------------------
-- Defesas adicionais e numeração por empresa
-- -----------------------------------------------------------------------------
select teste.como_banco();
select throws_ok(
  $$ update public.membros_empresa set empresa_id = teste.uid('emp_b') where usuario_id = teste.uid('c') $$,
  '42501', null, 'Gatilho impede transferir registro entre empresas');

select is(app.proximo_numero(teste.uid('emp_a'), 'ordem_servico'), 1::bigint, 'Primeira OS da Alfa recebe o número 1');
select is(app.proximo_numero(teste.uid('emp_a'), 'ordem_servico'), 2::bigint, 'Segunda OS da Alfa recebe o número 2');
select is(app.proximo_numero(teste.uid('emp_b'), 'ordem_servico'), 1::bigint, 'Numeração da Beta é independente');

select is(
  (select array_agg(nome_fantasia order by nome_fantasia) from public.empresas),
  array['Oficina Alfa Eletrônica', 'Oficina Beta'],
  'Nenhuma tentativa de alteração indevida modificou os nomes das oficinas');

select * from finish();
rollback;

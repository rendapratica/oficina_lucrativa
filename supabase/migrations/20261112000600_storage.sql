-- =============================================================================
-- Migration 0600: Supabase Storage isolado por empresa
--
-- Convenção de caminhos (obrigatória):
--   {empresa_id}/marca/...           logotipo e identidade visual (exige empresa:editar)
--   {empresa_id}/<modulo>/<id>/...   fotos, vídeos e documentos das próximas etapas
-- O primeiro segmento do caminho determina a empresa dona do arquivo.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empresa-arquivos',
  'empresa-arquivos',
  false,
  52428800, -- 50 MB por arquivo
  array[
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do nothing;

create or replace function app.empresa_do_caminho(p_nome text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := split_part(coalesce(p_nome, ''), '/', 1);
begin
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
end;
$$;

create or replace function app.pode_ler_arquivo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.pode_acessar(app.empresa_do_caminho(p_nome));
$$;

create or replace function app.pode_gravar_arquivo(p_nome text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_do_caminho(p_nome);
begin
  if v_empresa is null or p_nome like '%..%' or split_part(p_nome, '/', 2) = '' then
    return false;
  end if;

  if split_part(p_nome, '/', 2) = 'marca' then
    return app.tem_permissao(v_empresa, 'empresa', 'editar');
  end if;

  return app.pode_acessar(v_empresa);
end;
$$;

grant execute on function app.empresa_do_caminho(text) to authenticated, service_role;
grant execute on function app.pode_ler_arquivo(text) to authenticated, service_role;
grant execute on function app.pode_gravar_arquivo(text) to authenticated, service_role;

create policy "oficina_arquivos_ler"
  on storage.objects for select to authenticated
  using (bucket_id = 'empresa-arquivos' and app.pode_ler_arquivo(name));

create policy "oficina_arquivos_inserir"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'empresa-arquivos' and app.pode_gravar_arquivo(name));

create policy "oficina_arquivos_atualizar"
  on storage.objects for update to authenticated
  using (bucket_id = 'empresa-arquivos' and app.pode_gravar_arquivo(name))
  with check (bucket_id = 'empresa-arquivos' and app.pode_gravar_arquivo(name));

create policy "oficina_arquivos_excluir"
  on storage.objects for delete to authenticated
  using (bucket_id = 'empresa-arquivos' and app.pode_gravar_arquivo(name));

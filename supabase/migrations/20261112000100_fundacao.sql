-- =============================================================================
-- Oficina Lucrativa (RendaPrática) — Migration 0100: fundação
-- Extensões, schema interno "app", tipos enumerados e funções utilitárias.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Schema interno: NÃO é exposto pela API REST do Supabase (somente "public"
-- é exposto). Guarda funções auxiliares usadas pelas políticas RLS.
create schema if not exists app;
comment on schema app is 'Funções internas da Oficina Lucrativa. Não expor na API.';

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Funções novas no schema app não ficam executáveis por PUBLIC por padrão.
alter default privileges in schema app revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.papel_usuario as enum (
  'proprietario', 'administrador', 'tecnico', 'atendente', 'financeiro'
);

-- Fonte de verdade para o ACESSO da oficina ao sistema.
create type public.status_empresa as enum (
  'em_avaliacao', 'ativa', 'suspensa', 'cancelada'
);

-- Situação comercial da assinatura (cobrança real será integrada na Etapa 8).
create type public.status_assinatura as enum (
  'avaliacao', 'ativa', 'pendente', 'suspensa', 'cancelada'
);

-- -----------------------------------------------------------------------------
-- Funções utilitárias de gatilho
-- -----------------------------------------------------------------------------
create or replace function app.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Impede mover um registro de uma empresa para outra (defesa em profundidade:
-- um usuário que pertence a duas oficinas não pode "transferir" dados).
-- Deve ser aplicado a TODAS as tabelas empresariais criadas nas próximas etapas.
create or replace function app.impedir_troca_de_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Não é permitido transferir registros entre empresas.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validação de CPF e CNPJ (inclui o CNPJ alfanumérico, IN RFB 2.229/2024,
-- emitido a partir de julho de 2026: os 12 primeiros caracteres podem conter
-- letras; o valor de cada caractere é o código ASCII menos 48).
-- -----------------------------------------------------------------------------
create or replace function app.normalizar_documento(p_documento text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;

create or replace function app.documento_valido(p_tipo text, p_documento text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := app.normalizar_documento(p_documento);
  soma int;
  resto int;
  i int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if v is null then
    return false;
  end if;

  if p_tipo = 'cpf' then
    if v !~ '^[0-9]{11}$' or v = repeat(substr(v, 1, 1), 11) then
      return false;
    end if;
    soma := 0;
    for i in 1..9 loop
      soma := soma + substr(v, i, 1)::int * (11 - i);
    end loop;
    resto := (soma * 10) % 11;
    if resto = 10 then resto := 0; end if;
    if resto <> substr(v, 10, 1)::int then return false; end if;

    soma := 0;
    for i in 1..10 loop
      soma := soma + substr(v, i, 1)::int * (12 - i);
    end loop;
    resto := (soma * 10) % 11;
    if resto = 10 then resto := 0; end if;
    return resto = substr(v, 11, 1)::int;
  end if;

  if p_tipo = 'cnpj' then
    if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v = repeat(substr(v, 1, 1), 14) then
      return false;
    end if;
    soma := 0;
    for i in 1..12 loop
      soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos1[i];
    end loop;
    resto := soma % 11;
    if (case when resto < 2 then 0 else 11 - resto end) <> substr(v, 13, 1)::int then
      return false;
    end if;

    soma := 0;
    for i in 1..13 loop
      soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos2[i];
    end loop;
    resto := soma % 11;
    return (case when resto < 2 then 0 else 11 - resto end) = substr(v, 14, 1)::int;
  end if;

  return false;
end;
$$;

grant execute on function app.definir_atualizado_em() to authenticated, service_role;
grant execute on function app.impedir_troca_de_empresa() to authenticated, service_role;
grant execute on function app.normalizar_documento(text) to authenticated, service_role;
grant execute on function app.documento_valido(text, text) to authenticated, service_role;

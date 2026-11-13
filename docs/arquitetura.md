# Arquitetura — Oficina Lucrativa (Etapa 1)

## Visão geral

A aplicação é um frontend estático (HTML, CSS e JavaScript em ES Modules, empacotado pelo Vite) que conversa diretamente com o Supabase: Auth para identidade, PostgreSQL exposto pela API REST (PostgREST) para dados e Storage para arquivos. Não existe servidor intermediário, por isso **toda regra de segurança vive no banco**. O navegador recebe apenas a URL do projeto e a chave publicável, que por si só não dá acesso a nada: cada requisição carrega o token JWT do usuário e o PostgreSQL decide, linha a linha, o que ele pode ver e alterar.

A hospedagem do frontend pode ser Vercel ou Netlify; ambos os arquivos de configuração aplicam Content-Security-Policy restritiva, HSTS, proteção contra clickjacking e cache imutável para os arquivos com hash. O `public/manifest.json` torna o sistema instalável como aplicativo. Não há service worker nesta etapa, de propósito: um cache offline mal planejado pode exibir dados desatualizados de OS e estoque; o modo offline, se desejado, será planejado na Etapa 9.

## Modelo multiempresa

Cada oficina é uma linha em `empresas` (o inquilino). Usuários do Supabase Auth ganham um `perfil` automaticamente e se ligam às oficinas por `membros_empresa`, com um papel por oficina. Um mesmo técnico pode trabalhar para duas oficinas sem que os dados delas se misturem: o frontend guarda qual oficina está selecionada, mas o banco só devolve registros das oficinas em que ele é membro ativo.

`empresas.status` é a fonte de verdade para o acesso. Uma oficina `em_avaliacao` opera até `avaliacao_termina_em`; `suspensa`, `cancelada` ou avaliação vencida bloqueiam toda leitura e escrita operacional, inclusive arquivos, mas os membros continuam enxergando o cadastro da oficina para entender a situação. Somente a RendaPrática altera status, plano e prazos (o proprietário não tem privilégio sobre essas colunas).

| Tabela | Finalidade | Acesso pela API |
|---|---|---|
| `empresas` | Cadastro e identidade visual da oficina | Leitura por membros; edição de colunas cadastrais com `empresa:editar` |
| `perfis` | Nome, e-mail e telefone do usuário | Leitura própria e de colegas; edição do próprio nome e telefone |
| `membros_empresa` | Vínculo usuário–oficina e papel | Somente leitura; alterações por RPC |
| `convites` | Convites por link (só o hash SHA-256 do token é guardado) | Leitura sem a coluna do hash, com `usuarios:ver` |
| `planos`, `assinaturas` | Base comercial da RendaPrática | Somente leitura |
| `permissoes_papel` | Matriz papel × módulo × operação | Somente leitura |
| `auditoria` | Histórico automático de alterações | Leitura com `auditoria:ver` |
| `numeradores` | Numeração sequencial por oficina | Nenhum |
| `admins_plataforma` | Administradores da RendaPrática | Nenhum |

## Camadas de segurança

A primeira camada é o RLS, habilitado em todas as tabelas. As políticas usam funções do schema interno `app`, que não é exposto pela API, marcadas como `SECURITY DEFINER` com `search_path` vazio para evitar recursão e sequestro de nomes. A segunda camada são privilégios mínimos: o papel `anon` não acessa nenhuma tabela, e `authenticated` recebe apenas as operações e colunas necessárias. A terceira são as funções RPC (`criar_empresa`, `criar_convite`, `aceitar_convite`, `revogar_convite`, `alterar_papel_membro`, `definir_membro_ativo`, `resumo_empresa`), que concentram regras como o limite de usuários do plano, a exigência de e-mail confirmado, a obrigatoriedade de ao menos um proprietário ativo e a regra de que só o proprietário mexe em proprietários e administradores. Por fim, gatilhos impedem transferir registros de uma oficina para outra e gravam a auditoria sem que o cliente consiga forjá-la.

O frontend repete validações (CPF, CNPJ alfanumérico, senha, permissões para mostrar ou ocultar botões) apenas para dar retorno rápido. Todo texto vindo do banco é inserido com escape automático pelo template `html` de `src/lib/dom.js`, e a CSP bloqueia scripts que não sejam do próprio domínio.

## Papéis e permissões

Proprietário e administrador têm todas as operações em todos os módulos; a diferença entre eles está nas RPCs de gestão de usuários. Os demais papéis recebem permissões explícitas na migration `0200`, já cobrindo os módulos das próximas etapas: o técnico eletrônico trabalha em equipamentos, OS, diagnósticos e orçamentos; o atendente cuida de clientes, entrada de equipamentos, aprovação de orçamentos pelo cliente e agenda; o financeiro cuida de fornecedores, compras, financeiro e relatórios. A personalização da matriz por oficina está prevista para a Etapa 7.

## Arquivos (Storage)

Há um único bucket privado, `empresa-arquivos`, com limite de 50 MB por arquivo e tipos permitidos (imagens, PDF e vídeos). O primeiro segmento do caminho é obrigatoriamente o id da oficina, por exemplo `{empresa_id}/marca/logo-1731400000.png` ou, nas próximas etapas, `{empresa_id}/ordens_servico/{os_id}/entrada-01.jpg`. A pasta `marca/` exige `empresa:editar`. Imagens são exibidas por URLs assinadas de curta duração. O controle de cota total de armazenamento por plano será implementado na Etapa 8.

## Padrão obrigatório para novas tabelas empresariais

Toda tabela das próximas etapas deve seguir o modelo abaixo e ganhar casos de teste em `supabase/tests/database/` antes de ser considerada concluída.

```sql
create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  -- campos do módulo…
  criado_por    uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index clientes_empresa_idx on public.clientes (empresa_id);

alter table public.clientes enable row level security;
revoke all on public.clientes from anon, authenticated;
grant select, insert, update, delete on public.clientes to authenticated;

create policy clientes_ler on public.clientes for select to authenticated
  using (empresa_id in (select app.empresas_com_permissao('clientes', 'ver')));
create policy clientes_criar on public.clientes for insert to authenticated
  with check (empresa_id in (select app.empresas_com_permissao('clientes', 'criar')));
create policy clientes_editar on public.clientes for update to authenticated
  using (empresa_id in (select app.empresas_com_permissao('clientes', 'editar')))
  with check (empresa_id in (select app.empresas_com_permissao('clientes', 'editar')));
create policy clientes_excluir on public.clientes for delete to authenticated
  using (empresa_id in (select app.empresas_com_permissao('clientes', 'excluir')));

create trigger clientes_mesma_empresa before update on public.clientes
  for each row execute function app.impedir_troca_de_empresa();
create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function app.definir_atualizado_em();
create trigger clientes_auditoria after insert or update or delete on public.clientes
  for each row execute function app.auditar();
```

A forma `empresa_id in (select app.empresas_com_permissao(...))` faz o PostgreSQL calcular as oficinas permitidas uma única vez por consulta, o que mantém as listagens rápidas mesmo com dezenas de milhares de OS. Números de documento (OS, orçamento, compra) devem ser atribuídos por gatilho com `app.proximo_numero(empresa_id, 'ordem_servico')`, nunca pelo frontend.

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `20261112000100_fundacao.sql` | Extensões, schema `app`, tipos, validação de CPF/CNPJ (inclusive alfanumérico) |
| `20261112000200_empresas_e_usuarios.sql` | Tabelas do núcleo, plano de avaliação e matriz de permissões |
| `20261112000300_funcoes_de_acesso.sql` | Funções do RLS, numeração, auditoria e integração com o Auth |
| `20261112000400_rls_e_privilegios.sql` | Políticas RLS e privilégios por tabela e coluna |
| `20261112000500_rpc_empresas_e_membros.sql` | RPCs de oficina, convites e membros |
| `20261112000600_storage.sql` | Bucket e políticas de arquivos por oficina |

Migrations aplicadas nunca são editadas; qualquer ajuste entra como uma nova migration com data posterior.

## Pendências conhecidas, por etapa

O envio de convites é manual por link, porque ainda não há serviço de e-mail transacional próprio (Etapa 7, junto do WhatsApp). O painel administrativo da RendaPrática, a gestão de planos e a cota de armazenamento ficam para a Etapa 8. Limites de taxa adicionais para cadastro de oficinas e uma política de retenção da auditoria serão tratados na Etapa 9, junto dos testes de carga.

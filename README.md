# Oficina Lucrativa

Plataforma SaaS da **RendaPrática** para gestão de oficinas eletrônicas e assistências técnicas.

Este repositório está na **Etapa 1 — arquitetura, banco, autenticação, empresas e isolamento multiempresa**. As etapas seguintes (dashboard, clientes, equipamentos, OS etc.) só começam depois que esta for validada no seu ambiente Supabase.

## O que a Etapa 1 entrega

O banco de dados foi construído para que nenhuma oficina consiga ler ou alterar dados de outra, nem mesmo chamando a API diretamente. Isso é garantido no PostgreSQL por Row Level Security, privilégios por coluna e funções RPC que validam as regras de negócio; o frontend apenas reflete essas regras. Cada usuário se autentica pelo Supabase Auth (nenhuma senha é armazenada pelo sistema), pode participar de mais de uma oficina e tem um papel em cada uma delas (proprietário, administrador, técnico eletrônico, atendente ou financeiro), com permissões por módulo e operação.

Na interface já funcionam: criação de conta com confirmação de e-mail, login, recuperação e troca de senha, cadastro da oficina com início automático do período de avaliação, configurações completas da oficina (identificação, contato, endereço com busca por CEP, logotipo, cor e textos dos documentos, condições de garantia), gestão de usuários com convites por link, troca de papel, desativação e reativação, troca entre oficinas e bloqueio automático de oficinas suspensas ou com avaliação vencida.

O sistema pode ser instalado como aplicativo no celular, tablet ou computador (botão "Instalar" do navegador ou "Adicionar à tela inicial"), graças ao `public/manifest.json` com ícones normais e adaptáveis (maskable) e atalhos para Início e Dados da oficina.

Também ficam prontos, para as próximas etapas, a numeração sequencial exclusiva por oficina (OS, orçamentos, compras), a trilha de auditoria automática (quem alterou o quê e quando), o bucket de arquivos isolado por oficina e a base de planos, assinaturas e administradores da RendaPrática.

## Resultado dos testes

| Suíte | Onde roda | Resultado |
|---|---|---|
| Banco (pgTAP), 58 asserções de isolamento, permissões, storage, suspensão e auditoria | `supabase test db` | 58/58 aprovadas |
| Interface (jsdom), 7 cenários de telas, permissões e escape de HTML, mais 4 verificações do manifest | `npm run test:ui` | 11/11 aprovadas |
| API real (PostgREST + Storage), 12 ataques diretos à API, incluindo token adulterado | `npm run test:api` com `supabase start` | **a executar no seu ambiente** |

Os testes de banco foram executados em PostgreSQL 16 com uma simulação dos schemas `auth` e `storage` do Supabase. O teste de API precisa do Supabase local (Docker) e deve ser rodado antes de avançar para a Etapa 2.

## Estrutura do projeto

```
oficina-lucrativa/
├── index.html
├── public/
│   ├── manifest.json              aplicativo instalável (PWA)
│   ├── favicon.svg
│   └── icones/                    192, 512, maskable e apple-touch-icon
├── src/
│   ├── main.js                    rotas, guardas de acesso e eventos de autenticação
│   ├── lib/
│   │   ├── config.js              variáveis públicas (bloqueia chave secreta no navegador)
│   │   ├── supabase.js            cliente Supabase (fluxo PKCE)
│   │   ├── sessao.js              usuário, oficinas, papel e permissões
│   │   ├── roteador.js            roteamento por hash
│   │   ├── dom.js                 templates com escape automático (anti-XSS)
│   │   ├── validacao.js           CPF, CNPJ (inclusive alfanumérico), máscaras
│   │   ├── erros.js               mensagens de erro em português
│   │   └── icones.js              ícones Lucide sob demanda
│   ├── ui/                        casca (menu lateral), telas de acesso, campos, modal, avisos
│   ├── pages/
│   │   ├── auth/                  entrar, cadastrar, recuperar e redefinir senha
│   │   ├── configuracoes/         oficina e usuários
│   │   ├── inicio.js, nova-oficina.js, convite.js, acesso-bloqueado.js
│   └── styles/                    tokens, base, acesso, casca, componentes
├── supabase/
│   ├── config.toml
│   ├── migrations/                6 migrations versionadas (ver docs/arquitetura.md)
│   └── tests/database/            testes pgTAP de isolamento
├── tests/
│   ├── api/                       ataques à API real (Supabase local)
│   └── ui/                        renderização das telas e manifest (jsdom)
├── docs/arquitetura.md            modelo de dados, segurança e padrão para novas tabelas
├── CHANGELOG.md
├── vercel.json / netlify.toml     build e cabeçalhos de segurança (CSP, HSTS…)
└── .env.example / .env.test.example
```

## Como rodar localmente

Pré-requisitos: Node.js 20.19 ou superior, Docker e a [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm install
npx supabase start          # sobe Postgres, Auth, Storage e aplica as migrations
npx supabase status         # mostra a API URL e as chaves locais
cp .env.example .env.local  # preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                 # http://localhost:5173
```

No ambiente local, os e-mails de confirmação, recuperação de senha e alteração de e-mail não são enviados de verdade: abra o Mailpit em `http://127.0.0.1:54324` para clicar nos links. O link de confirmação deve ser aberto no mesmo navegador em que a conta foi criada (exigência do fluxo PKCE, que é o mais seguro para aplicações no navegador).

## Como testar

```bash
npm run test:ui                     # telas (não precisa de Supabase)
npx supabase test db                # isolamento no banco (pgTAP)
cp .env.test.example .env.test.local  # preencha com os dados de `supabase status`
npm run test:api                    # ataques diretos à API do Supabase local
```

O teste de API usa a chave secreta apenas para criar e apagar os usuários de teste, e se recusa a rodar contra qualquer endereço que não seja `localhost`.

Roteiro manual sugerido para validar a etapa no navegador: crie duas contas em janelas anônimas diferentes, cadastre uma oficina em cada, envie um logotipo, convide a segunda conta para a primeira oficina como técnico, aceite o convite, confirme que o técnico não vê a página Usuários nem consegue editar a oficina, e troque de oficina pelo seletor no topo. Repita em um celular para verificar o menu recolhível.

## Implantação em produção

1. Crie o projeto no Supabase (região São Paulo, `sa-east-1`, para menor latência e aderência à LGPD).
2. Vincule e aplique as migrations: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. No painel do Supabase, em Authentication, configure a Site URL e as Redirect URLs com o domínio final, ative a confirmação de e-mail e a política de senha (mínimo de 8 caracteres, com maiúsculas, minúsculas e números), e ative a proteção contra senhas vazadas se o seu plano permitir.
4. Configure um **SMTP próprio** (Resend, Amazon SES, Brevo etc.). O serviço de e-mail padrão do Supabase tem limite muito baixo e só entrega para membros da equipe do projeto, então não serve para clientes reais.
5. Personalize os modelos de e-mail do Supabase em português, com a marca RendaPrática.
6. Na Vercel ou Netlify, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca cadastre a chave secreta em variáveis `VITE_*`: o próprio app se recusa a iniciar se detectar uma chave secreta.
7. Se usar domínio personalizado no Supabase, inclua-o no `connect-src` e `img-src` da Content-Security-Policy em `vercel.json` ou `netlify.toml`.

### Primeiro administrador da RendaPrática

O acesso administrativo é autorizado pela tabela protegida `admins_plataforma`, que não pode ser lida nem alterada pela API. Depois que a pessoa criar a conta normalmente, execute no SQL Editor do Supabase:

```sql
insert into public.admins_plataforma (usuario_id, observacao)
select id, 'Administrador RendaPrática' from auth.users where email = 'admin@rendapratica.com.br';
```

O painel administrativo em si será construído na Etapa 8.

## Próxima etapa

Etapa 2: dashboard, clientes e equipamentos eletrônicos. As novas tabelas devem seguir o padrão descrito em `docs/arquitetura.md` e ganhar seus próprios testes de isolamento antes de serem consideradas prontas.

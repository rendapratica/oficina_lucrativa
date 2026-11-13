# Changelog

Todas as alterações relevantes do Oficina Lucrativa são registradas aqui.

## [0.1.0] — 12/11/2026 — Etapa 1

### Adicionado
- Arquitetura do projeto (Vite + ES Modules + Supabase) e estrutura de pastas.
- Migrations 0100 a 0600: núcleo multiempresa, RLS, privilégios por coluna, RPCs, auditoria, numeração por oficina e Storage isolado.
- Validação de CPF e CNPJ, incluindo o CNPJ alfanumérico (IN RFB 2.229/2024), no banco e no navegador.
- Autenticação com Supabase Auth (PKCE): criar conta, confirmar e-mail, entrar, recuperar e redefinir senha.
- Cadastro de oficina com período de avaliação, configurações da oficina com logotipo e busca de CEP.
- Gestão de usuários: convites por link, papéis, desativação e reativação, limite de vagas do plano.
- Bloqueio automático de oficinas suspensas, canceladas ou com avaliação vencida.
- Aplicativo instalável: `manifest.json`, ícones 192/512 (normais e maskable) e ícone da Apple.
- Cabeçalhos de segurança para Vercel e Netlify.
- Testes: 58 asserções pgTAP, 11 testes de interface e 12 testes de ataque à API.

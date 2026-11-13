// @vitest-environment jsdom
// Testes de renderização das telas da Etapa 1 com um cliente Supabase simulado.
// Verificam erros de execução, escape de HTML e regras de permissão na interface.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const dados = {};
const chamadasRpc = [];

function consulta(tabela) {
  let unico = false;
  const construtor = {
    select: () => construtor, eq: () => construtor, is: () => construtor, gt: () => construtor,
    order: () => construtor, in: () => construtor, update: () => construtor,
    single: () => { unico = true; return construtor; },
    maybeSingle: () => { unico = true; return construtor; },
    then: (resolver) => {
      const valor = dados[tabela] ?? [];
      return Promise.resolve({ data: unico ? (Array.isArray(valor) ? valor[0] : valor) : valor, error: null }).then(resolver);
    },
  };
  return construtor;
}

const supabaseFalso = {
  from: (tabela) => consulta(tabela),
  rpc: async (nome, args) => {
    chamadasRpc.push([nome, args]);
    return { data: dados[`rpc:${nome}`] ?? null, error: null };
  },
  auth: {
    signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resend: vi.fn(async () => ({ error: null })),
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://exemplo/logo.png' }, error: null }) }) },
};

vi.mock('../../src/lib/supabase.js', () => ({ supabase: supabaseFalso, BUCKET_ARQUIVOS: 'empresa-arquivos' }));

const { sessao } = await import('../../src/lib/sessao.js');
const { casca } = await import('../../src/ui/casca.js');

const EMPRESA = {
  id: '11111111-1111-4111-8111-111111111111',
  nome_fantasia: 'Eletrônica <script>alert(1)</script>',
  status: 'em_avaliacao',
  avaliacao_termina_em: new Date(Date.now() + 10 * 86400000).toISOString(),
  logo_path: null, documento: null, logradouro: null, cidade: null, whatsapp: '24999887766', telefone: null,
  texto_garantia: null, razao_social: null, tipo_documento: null, cep: null, numero: null, complemento: null,
  bairro: null, uf: null, email: null, responsavel: null, dados_pagamento: null, cor_principal: '#F26B1D',
  garantia_padrao_dias: 90, mensagem_documentos: null,
};

function entrarComo(papel, permissoes) {
  sessao.usuario = { id: 'u1', email: 'ana@oficina.com' };
  sessao.perfil = { id: 'u1', nome: 'Ana Souza', email: 'ana@oficina.com' };
  sessao.vinculo = { id: 'm1', papel, empresa_id: EMPRESA.id, empresa: EMPRESA };
  sessao.vinculos = [sessao.vinculo];
  sessao.permissoes = new Set(permissoes);
}

const aguardar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="toasts"></div>';
  chamadasRpc.length = 0;
  dados.empresas = [EMPRESA];
  dados['rpc:resumo_empresa'] = [{ plano_nome: 'Avaliação', max_usuarios: 3, armazenamento_mb: 1024, vagas_ocupadas: 2, membros_ativos: 1 }];
  dados.membros_empresa = [
    { id: 'm1', papel: 'proprietario', ativo: true, criado_em: '2026-11-01T10:00:00Z', usuario_id: 'u1', perfil: { nome: 'Ana Souza', email: 'ana@oficina.com' } },
    { id: 'm2', papel: 'tecnico', ativo: false, criado_em: '2026-11-02T10:00:00Z', usuario_id: 'u2', perfil: { nome: 'Caio <b>', email: 'caio@oficina.com' } },
  ];
  dados.convites = [{ id: 'c1', email: 'nova@oficina.com', papel: 'atendente', expira_em: '2026-11-19T10:00:00Z', criado_em: '2026-11-12T10:00:00Z' }];
});

describe('Telas de acesso', () => {
  it('Entrar: valida e-mail e mostra erro de credenciais traduzido', async () => {
    const { render } = await import('../../src/pages/auth/entrar.js');
    const raiz = document.getElementById('app');
    render(raiz, { parametros: new URLSearchParams() });
    const form = raiz.querySelector('form');

    form.elements.email.value = 'invalido';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(raiz.querySelector('[data-erro-de="email"]').textContent).toContain('e-mail válido');

    form.elements.email.value = 'ana@oficina.com';
    form.elements.senha.value = 'Errada123';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await aguardar(); await aguardar();
    expect(raiz.querySelector('.form-alerta').textContent).toBe('E-mail ou senha incorretos.');
    expect(raiz.querySelector('.placa')).not.toBeNull();
  });

  it('Criar conta: exige senha forte e confirmação igual', async () => {
    const { render } = await import('../../src/pages/auth/cadastrar.js');
    const raiz = document.getElementById('app');
    render(raiz);
    const form = raiz.querySelector('form');
    form.elements.nome.value = 'Ana';
    form.elements.email.value = 'ana@oficina.com';
    form.elements.senha.value = 'fraca';
    form.elements.confirmacao.value = 'outra';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(raiz.querySelector('[data-erro-de="senha"]')).not.toBeNull();
    expect(raiz.querySelector('[data-erro-de="confirmacao"]').textContent).toContain('não coincidem');
    expect(supabaseFalso.auth.signUp).not.toHaveBeenCalled();
  });
});

describe('Casca e permissões', () => {
  it('Proprietário vê Usuários no menu; nome da oficina é escapado', () => {
    entrarComo('proprietario', ['empresa:ver', 'empresa:editar', 'usuarios:ver', 'usuarios:editar', 'usuarios:criar']);
    const raiz = document.getElementById('app');
    casca(raiz, '/inicio');
    const menu = [...raiz.querySelectorAll('.menu-item')].map((a) => a.textContent.trim());
    expect(menu).toEqual(['Início', 'Oficina', 'Usuários']);
    expect(raiz.querySelector('script')).toBeNull();
    expect(raiz.querySelector('.topo-empresa-nome').textContent).toContain('<script>');
    expect(raiz.querySelector('[aria-current="page"]').getAttribute('href')).toBe('#/inicio');
  });

  it('Técnico não vê Usuários e não edita a oficina', async () => {
    entrarComo('tecnico', ['empresa:ver']);
    const raiz = document.getElementById('app');
    const conteudo = casca(raiz, '/configuracoes/oficina');
    expect([...raiz.querySelectorAll('.menu-item')].map((a) => a.textContent.trim())).toEqual(['Início', 'Oficina']);

    const { render } = await import('../../src/pages/configuracoes/oficina.js');
    await render(conteudo);
    expect(conteudo.querySelector('[type=submit]')).toBeNull();
    expect(conteudo.querySelector('#arquivo-logo')).toBeNull();
    expect(conteudo.querySelector('#campo-nome_fantasia').disabled).toBe(true);
  });
});

describe('Páginas internas', () => {
  it('Início mostra avaliação, vagas e pendências de cadastro', async () => {
    entrarComo('proprietario', ['empresa:ver', 'empresa:editar']);
    const conteudo = casca(document.getElementById('app'), '/inicio');
    const { render } = await import('../../src/pages/inicio.js');
    await render(conteudo);
    expect(conteudo.textContent).toContain('Em avaliação até');
    expect(conteudo.textContent).toContain('2 de 3 vagas ocupadas');
    expect(conteudo.querySelectorAll('.checklist li.feito')).toHaveLength(1); // apenas o WhatsApp
    expect(conteudo.querySelector('a[href="#/configuracoes/oficina"]')).not.toBeNull();
  });

  it('Usuários lista equipe e convites, com escape de HTML', async () => {
    entrarComo('proprietario', ['usuarios:ver', 'usuarios:editar', 'usuarios:criar']);
    const conteudo = casca(document.getElementById('app'), '/configuracoes/usuarios');
    const { render } = await import('../../src/pages/configuracoes/usuarios.js');
    await render(conteudo);
    expect(conteudo.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(conteudo.textContent).toContain('Ana Souza (você)');
    expect(conteudo.textContent).toContain('Caio <b>');
    expect(conteudo.querySelector('[data-reativar="m2"]')).not.toBeNull();
    expect(conteudo.querySelector('[data-cancelar-convite="c1"]')).not.toBeNull();
    expect(conteudo.querySelector('[data-convidar]').disabled).toBe(false);
  });

  it('Botão de convite fica desativado sem vagas no plano', async () => {
    dados['rpc:resumo_empresa'] = [{ plano_nome: 'Avaliação', max_usuarios: 3, armazenamento_mb: 1024, vagas_ocupadas: 3, membros_ativos: 2 }];
    entrarComo('proprietario', ['usuarios:ver', 'usuarios:editar', 'usuarios:criar']);
    const conteudo = casca(document.getElementById('app'), '/configuracoes/usuarios');
    const { render } = await import('../../src/pages/configuracoes/usuarios.js');
    await render(conteudo);
    expect(conteudo.querySelector('[data-convidar]').disabled).toBe(true);
    expect(conteudo.querySelector('#sem-vagas')).not.toBeNull();
  });
});

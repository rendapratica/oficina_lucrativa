// Testes de isolamento multiempresa pela API pública do Supabase (PostgREST + Storage),
// exatamente como um usuário mal-intencionado faria com a chave publicável.
//
// Requisitos: `supabase start` + `.env.test.local` (ver .env.test.example).
// Por segurança, o teste se recusa a rodar fora de localhost.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('test', process.cwd(), '');
const URL_API = env.SUPABASE_URL;
const CHAVE_PUBLICA = env.SUPABASE_PUBLISHABLE_KEY;
const CHAVE_SECRETA = env.SUPABASE_SECRET_KEY;
const configurado = Boolean(URL_API && CHAVE_PUBLICA && CHAVE_SECRETA);

if (configurado && !['127.0.0.1', 'localhost'].includes(new URL(URL_API).hostname)) {
  throw new Error('Os testes de API só podem rodar contra o Supabase local.');
}

const BUCKET = 'empresa-arquivos';
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const PNG = new Blob([PNG_BYTES], { type: 'image/png' });
const SENHA = 'Teste-Isolamento-123';
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configurado)('Isolamento multiempresa pela API', () => {
  const sufixo = Date.now();
  let admin;
  const usuarios = {};
  const empresas = {};

  async function criarUsuario(apelido) {
    const email = `${apelido}.${sufixo}@teste.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: SENHA, email_confirm: true, user_metadata: { nome: apelido },
    });
    if (error) throw error;
    const cliente = createClient(URL_API, CHAVE_PUBLICA, opcoes);
    const login = await cliente.auth.signInWithPassword({ email, password: SENHA });
    if (login.error) throw login.error;
    usuarios[apelido] = { id: data.user.id, email, cliente };
  }

  beforeAll(async () => {
    admin = createClient(URL_API, CHAVE_SECRETA, opcoes);
    await criarUsuario('ana');
    await criarUsuario('bruno');

    for (const [apelido, nome] of [['ana', 'Oficina Alfa API'], ['bruno', 'Oficina Beta API']]) {
      const { data, error } = await usuarios[apelido].cliente.rpc('criar_empresa', { p_nome_fantasia: nome });
      if (error) throw error;
      empresas[apelido] = data;
    }

    const envio = await usuarios.bruno.cliente.storage
      .from(BUCKET).upload(`${empresas.bruno}/testes/beta.png`, PNG, { contentType: 'image/png' });
    if (envio.error) throw envio.error;
  });

  afterAll(async () => {
    if (!admin) return;
    const caminhos = Object.values(empresas).flatMap((id) => [`${id}/testes/beta.png`, `${id}/testes/alfa.png`, `${id}/testes/invasao.png`]);
    await admin.storage.from(BUCKET).remove(caminhos);
    if (Object.values(empresas).length) await admin.from('empresas').delete().in('id', Object.values(empresas));
    for (const u of Object.values(usuarios)) await admin.auth.admin.deleteUser(u.id);
  });

  it('cada usuário lista somente a própria oficina', async () => {
    const { data, error } = await usuarios.ana.cliente.from('empresas').select('id');
    expect(error).toBeNull();
    expect(data.map((e) => e.id)).toEqual([empresas.ana]);
  });

  it('não lê outra oficina pelo id', async () => {
    const { data } = await usuarios.ana.cliente.from('empresas').select('*').eq('id', empresas.bruno);
    expect(data).toEqual([]);
  });

  it('não altera outra oficina (nenhuma linha afetada)', async () => {
    const { data } = await usuarios.ana.cliente.from('empresas')
      .update({ nome_fantasia: 'Invadida' }).eq('id', empresas.bruno).select('id');
    expect(data ?? []).toEqual([]);
    const conferencia = await admin.from('empresas').select('nome_fantasia').eq('id', empresas.bruno).single();
    expect(conferencia.data.nome_fantasia).toBe('Oficina Beta API');
  });

  it('não se insere como membro de outra oficina', async () => {
    const { error } = await usuarios.ana.cliente.from('membros_empresa')
      .insert({ empresa_id: empresas.bruno, usuario_id: usuarios.ana.id, papel: 'proprietario' });
    expect(error).not.toBeNull();
  });

  it('não lê membros, assinatura nem auditoria de outra oficina', async () => {
    const c = usuarios.ana.cliente;
    for (const tabela of ['membros_empresa', 'assinaturas', 'auditoria']) {
      const { data } = await c.from(tabela).select('empresa_id').eq('empresa_id', empresas.bruno);
      expect(data ?? [], tabela).toEqual([]);
    }
  });

  it('não altera o próprio status nem o prazo de avaliação', async () => {
    const { error } = await usuarios.ana.cliente.from('empresas')
      .update({ status: 'ativa', avaliacao_termina_em: '2099-01-01' }).eq('id', empresas.ana);
    expect(error).not.toBeNull();
  });

  it('não cria convite para outra oficina', async () => {
    const { error } = await usuarios.ana.cliente.rpc('criar_convite', {
      p_empresa: empresas.bruno, p_email: 'intruso@teste.local', p_papel: 'administrador',
    });
    expect(error?.code).toBe('42501');
  });

  it('não acessa tabelas internas', async () => {
    for (const tabela of ['admins_plataforma', 'numeradores']) {
      const { error } = await usuarios.ana.cliente.from(tabela).select('*');
      expect(error, tabela).not.toBeNull();
    }
  });

  it('Storage: não lista, não baixa e não grava na pasta de outra oficina', async () => {
    const bucket = usuarios.ana.cliente.storage.from(BUCKET);
    const lista = await bucket.list(`${empresas.bruno}/testes`);
    expect(lista.data ?? []).toEqual([]);

    const download = await bucket.download(`${empresas.bruno}/testes/beta.png`);
    expect(download.error).not.toBeNull();

    const envio = await bucket.upload(`${empresas.bruno}/testes/invasao.png`, PNG, { contentType: 'image/png' });
    expect(envio.error).not.toBeNull();
  });

  it('Storage: grava e lê na própria pasta (controle positivo)', async () => {
    const bucket = usuarios.ana.cliente.storage.from(BUCKET);
    const envio = await bucket.upload(`${empresas.ana}/testes/alfa.png`, PNG, { contentType: 'image/png' });
    expect(envio.error).toBeNull();
    const download = await bucket.download(`${empresas.ana}/testes/alfa.png`);
    expect(download.error).toBeNull();
  });

  it('visitante anônimo não lê dados nem executa RPCs', async () => {
    const anonimo = createClient(URL_API, CHAVE_PUBLICA, opcoes);
    const leitura = await anonimo.from('empresas').select('id');
    expect(leitura.error).not.toBeNull();
    const rpc = await anonimo.rpc('criar_empresa', { p_nome_fantasia: 'Anônima' });
    expect(rpc.error).not.toBeNull();
  });

  it('chamada direta à API com token adulterado é rejeitada', async () => {
    const token = (await usuarios.ana.cliente.auth.getSession()).data.session.access_token;
    const [cabecalho, payload, assinatura] = token.split('.');
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString());
    dados.sub = usuarios.bruno.id;
    const adulterado = [cabecalho, Buffer.from(JSON.stringify(dados)).toString('base64url'), assinatura].join('.');

    const resposta = await fetch(`${URL_API}/rest/v1/empresas?select=id`, {
      headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${adulterado}` },
    });
    expect(resposta.status).toBe(401);
  });
});

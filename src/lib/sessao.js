// Estado da sessão: usuário, perfil, oficinas vinculadas e permissões do papel.
// As permissões aqui só controlam a INTERFACE; o banco valida tudo novamente.
import { supabase } from './supabase.js';

const CHAVE_EMPRESA = 'oficina-lucrativa:empresa-atual';
export const CHAVE_CONVITE = 'oficina-lucrativa:convite-pendente';

export const sessao = {
  usuario: null,
  perfil: null,
  vinculos: [],
  vinculo: null,
  permissoes: new Set(),
};

export function limparSessao() {
  sessao.usuario = null;
  sessao.perfil = null;
  sessao.vinculos = [];
  sessao.vinculo = null;
  sessao.permissoes = new Set();
}

export async function carregarUsuario() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  sessao.usuario = data.session?.user ?? null;
  return sessao.usuario;
}

export async function carregarContexto() {
  if (!sessao.usuario) {
    limparSessao();
    return;
  }
  const uid = sessao.usuario.id;
  const [perfil, vinculos] = await Promise.all([
    supabase.from('perfis').select('id, nome, email, telefone').eq('id', uid).maybeSingle(),
    supabase
      .from('membros_empresa')
      .select('id, papel, empresa_id, empresa:empresas(id, nome_fantasia, status, avaliacao_termina_em, logo_path, cor_principal)')
      .eq('usuario_id', uid)
      .eq('ativo', true)
      .order('criado_em'),
  ]);
  if (perfil.error) throw perfil.error;
  if (vinculos.error) throw vinculos.error;

  sessao.perfil = perfil.data;
  sessao.vinculos = vinculos.data ?? [];

  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_EMPRESA); } catch { /* armazenamento indisponível */ }
  sessao.vinculo = sessao.vinculos.find((v) => v.empresa_id === salvo) ?? sessao.vinculos[0] ?? null;
  await carregarPermissoes();
}

async function carregarPermissoes() {
  sessao.permissoes = new Set();
  if (!sessao.vinculo) return;
  const { data, error } = await supabase
    .from('permissoes_papel')
    .select('modulo, acao')
    .eq('papel', sessao.vinculo.papel);
  if (error) throw error;
  sessao.permissoes = new Set(data.map((p) => `${p.modulo}:${p.acao}`));
}

export async function selecionarEmpresa(empresaId) {
  const vinculo = sessao.vinculos.find((v) => v.empresa_id === empresaId);
  if (!vinculo) return;
  sessao.vinculo = vinculo;
  try { localStorage.setItem(CHAVE_EMPRESA, empresaId); } catch { /* ignorado */ }
  await carregarPermissoes();
}

export function pode(modulo, acao) {
  return sessao.permissoes.has(`${modulo}:${acao}`);
}

export function empresaAtual() {
  return sessao.vinculo?.empresa ?? null;
}

// Situação de acesso da oficina, espelhando app.empresa_operante() no banco.
export function situacaoEmpresa(empresa) {
  if (!empresa) return { codigo: 'inexistente', operante: false };
  if (empresa.status === 'ativa') return { codigo: 'ativa', operante: true };
  if (empresa.status === 'em_avaliacao') {
    const restante = new Date(empresa.avaliacao_termina_em).getTime() - Date.now();
    if (restante > 0) {
      return { codigo: 'avaliacao', operante: true, diasRestantes: Math.ceil(restante / 86400000) };
    }
    return { codigo: 'avaliacao_encerrada', operante: false };
  }
  return { codigo: empresa.status, operante: false };
}

export const NOMES_PAPEIS = {
  proprietario: 'Proprietário',
  administrador: 'Administrador',
  tecnico: 'Técnico eletrônico',
  atendente: 'Atendente',
  financeiro: 'Financeiro',
};

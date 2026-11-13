// Converte erros do Supabase (Auth, PostgREST, Storage) em mensagens claras.
const CODIGOS_AUTH = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos para sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  email_exists: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, com letras maiúsculas, minúsculas e números.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  signup_disabled: 'Novos cadastros estão temporariamente desativados.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  flow_state_expired: 'O link expirou. Solicite um novo.',
  flow_state_not_found: 'Abra o link no mesmo navegador em que você fez a solicitação.',
};

const MENSAGENS_AUTH = [
  [/invalid login credentials/i, CODIGOS_AUTH.invalid_credentials],
  [/email not confirmed/i, CODIGOS_AUTH.email_not_confirmed],
  [/already registered/i, CODIGOS_AUTH.user_already_exists],
  [/password should/i, CODIGOS_AUTH.weak_password],
  [/rate limit/i, CODIGOS_AUTH.over_request_rate_limit],
];

// Códigos SQLSTATE cujas mensagens são escritas em português pelas nossas RPCs.
const CODIGOS_NEGOCIO = new Set(['P0001', 'P0002', '22023', '28000']);

export function mensagemErro(erro) {
  if (!erro) return 'Algo deu errado. Tente novamente.';
  const msg = String(erro.message || erro.error_description || erro);

  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }

  if (erro.code && CODIGOS_AUTH[erro.code]) return CODIGOS_AUTH[erro.code];
  for (const [padrao, texto] of MENSAGENS_AUTH) if (padrao.test(msg)) return texto;

  if (CODIGOS_NEGOCIO.has(erro.code)) return msg;

  if (erro.code === '42501') {
    // Mensagens próprias em português vêm das RPCs; as do PostgreSQL vêm em inglês.
    return /permission denied|row-level security/i.test(msg)
      ? 'Você não tem permissão para esta operação.'
      : msg;
  }

  if (erro.code === '23514') return 'Algum campo tem um valor inválido. Revise os dados e tente novamente.';
  if (erro.code === '23505') return 'Já existe um registro com esses dados.';
  if (/row-level security|unauthorized/i.test(msg)) return 'Você não tem permissão para esta operação.';
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return 'Arquivo maior que o permitido.';
  if (/mime type/i.test(msg)) return 'Tipo de arquivo não permitido.';

  console.error('[Oficina Lucrativa] erro não mapeado:', erro);
  return 'Não foi possível concluir a operação. Tente novamente em instantes.';
}

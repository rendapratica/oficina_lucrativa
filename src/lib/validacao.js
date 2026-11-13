// Validações espelhadas no banco (app.documento_valido). O banco é a autoridade;
// aqui servem apenas para dar retorno imediato ao usuário.

export const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '');
export const normalizarDocumento = (v) => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

export function cpfValido(valor) {
  const v = somenteDigitos(valor);
  if (v.length !== 11 || /^(\d)\1{10}$/.test(v)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(v[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(v[9]) && dv(10) === Number(v[10]);
}

// Suporta o CNPJ alfanumérico (IN RFB 2.229/2024): valor do caractere = ASCII − 48.
export function cnpjValido(valor) {
  const v = normalizarDocumento(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v) || /^(.)\1{13}$/.test(v)) return false;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv = (pesos) => {
    const soma = pesos.reduce((acc, peso, i) => acc + (v.charCodeAt(i) - 48) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(pesos1) === Number(v[12]) && dv(pesos2) === Number(v[13]);
}

export function documentoValido(tipo, valor) {
  if (tipo === 'cpf') return cpfValido(valor);
  if (tipo === 'cnpj') return cnpjValido(valor);
  return false;
}

export const emailValido = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v ?? '').trim());
export const telefoneValido = (v) => /^\d{10,13}$/.test(somenteDigitos(v));
export const cepValido = (v) => /^\d{8}$/.test(somenteDigitos(v));

// Mesma política configurada no Supabase Auth (supabase/config.toml).
export function problemaSenha(senha) {
  if (senha.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha)) {
    return 'Use letras maiúsculas, minúsculas e números.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Máscaras de exibição
// ---------------------------------------------------------------------------
export function formatarCpf(v) {
  const d = somenteDigitos(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarCnpj(v) {
  const d = normalizarDocumento(v).slice(0, 14);
  return d
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/\.(\w{3})(\w)/, '.$1/$2')
    .replace(/(\w{4})(\d{1,2})$/, '$1-$2');
}

export function formatarDocumento(tipo, v) {
  if (!v) return '';
  return tipo === 'cnpj' ? formatarCnpj(v) : formatarCpf(v);
}

export function formatarTelefone(v) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function formatarCep(v) {
  return somenteDigitos(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

// Aplica máscara enquanto o usuário digita.
export function aplicarMascara(input, formatador) {
  input.addEventListener('input', () => {
    input.value = formatador(input.value);
  });
}

export function formatarData(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

export function formatarDataHora(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

// Utilitários de renderização com escape automático (proteção contra XSS).
import { icone } from './icones.js';

const SEGURO = Symbol('html-seguro');

export function bruto(texto) {
  return { [SEGURO]: true, valor: String(texto) };
}

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function renderizar(valor) {
  if (valor === null || valor === undefined || valor === false) return '';
  if (Array.isArray(valor)) return valor.map(renderizar).join('');
  if (typeof valor === 'object' && valor[SEGURO]) return valor.valor;
  return escapar(valor);
}

// Template literal que escapa toda interpolação, exceto blocos já seguros.
export function html(partes, ...valores) {
  let saida = '';
  partes.forEach((parte, i) => {
    saida += parte;
    if (i < valores.length) saida += renderizar(valores[i]);
  });
  return bruto(saida);
}

export function montar(elemento, conteudo) {
  elemento.innerHTML = conteudo.valor;
  return elemento;
}

export function ic(nome, classe = '') {
  return bruto(icone(nome, classe));
}

export function qs(seletor, raiz = document) {
  return raiz.querySelector(seletor);
}

export function qsa(seletor, raiz = document) {
  return [...raiz.querySelectorAll(seletor)];
}

// Lê os campos nomeados de um formulário como objeto de texto.
export function dadosDoFormulario(form) {
  const dados = {};
  for (const [chave, valor] of new FormData(form).entries()) {
    dados[chave] = typeof valor === 'string' ? valor.trim() : valor;
  }
  return dados;
}

// Coloca um botão em estado de carregamento durante uma ação assíncrona.
export async function comCarregamento(botao, acao) {
  const textoOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  botao.innerHTML = `<span class="spinner" aria-hidden="true"></span>${botao.dataset.carregando || 'Aguarde…'}`;
  try {
    return await acao();
  } finally {
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
    botao.innerHTML = textoOriginal;
  }
}

export function mostrarErroCampo(form, nome, mensagem) {
  const campo = form.elements[nome];
  if (!campo) return;
  campo.setAttribute('aria-invalid', 'true');
  let alvo = form.querySelector(`[data-erro-de="${nome}"]`);
  if (!alvo) {
    alvo = document.createElement('p');
    alvo.className = 'campo-erro';
    alvo.dataset.erroDe = nome;
    alvo.id = `erro-${nome}`;
    campo.closest('.campo')?.append(alvo);
    campo.setAttribute('aria-describedby', alvo.id);
  }
  alvo.textContent = mensagem;
}

export function limparErros(form) {
  qsa('[aria-invalid="true"]', form).forEach((c) => c.removeAttribute('aria-invalid'));
  qsa('.campo-erro', form).forEach((e) => e.remove());
  const geral = form.querySelector('.form-alerta');
  if (geral) geral.hidden = true;
}

export function alertaFormulario(form, mensagem) {
  let alerta = form.querySelector('.form-alerta');
  if (!alerta) {
    alerta = document.createElement('div');
    alerta.className = 'form-alerta';
    alerta.setAttribute('role', 'alert');
    form.prepend(alerta);
  }
  alerta.textContent = mensagem;
  alerta.hidden = false;
}

import { html, bruto, ic } from '../lib/dom.js';

// Campo de formulário padronizado (rótulo associado, ajuda e atributos).
export function campo({
  rotulo, nome, tipo = 'text', valor = '', obrigatorio = false, ajuda = '',
  autocomplete = 'off', inputmode, maxlength, placeholder = '', desabilitado = false, classe = '',
}) {
  const id = `campo-${nome}`;
  const extras = [
    obrigatorio ? 'required' : '',
    desabilitado ? 'disabled' : '',
    inputmode ? `inputmode="${inputmode}"` : '',
    maxlength ? `maxlength="${maxlength}"` : '',
  ].filter(Boolean).join(' ');
  return html`
    <div class="campo ${classe}">
      <label for="${id}">${rotulo}${obrigatorio ? '' : html` <span class="opcional">(opcional)</span>`}</label>
      <input id="${id}" name="${nome}" type="${tipo}" value="${valor ?? ''}" autocomplete="${autocomplete}"
        placeholder="${placeholder}" ${bruto(extras)} />
      ${ajuda ? html`<p class="campo-ajuda">${ajuda}</p>` : ''}
    </div>`;
}

export function areaTexto({ rotulo, nome, valor = '', ajuda = '', maxlength, linhas = 3, desabilitado = false }) {
  const id = `campo-${nome}`;
  return html`
    <div class="campo campo-largo">
      <label for="${id}">${rotulo} <span class="opcional">(opcional)</span></label>
      <textarea id="${id}" name="${nome}" rows="${linhas}" ${maxlength ? bruto(`maxlength="${Number(maxlength)}"`) : ''} ${desabilitado ? bruto('disabled') : ''}>${valor ?? ''}</textarea>
      ${ajuda ? html`<p class="campo-ajuda">${ajuda}</p>` : ''}
    </div>`;
}

export function campoSenha({ rotulo, nome, autocomplete = 'current-password', ajuda = '' }) {
  const id = `campo-${nome}`;
  return html`
    <div class="campo">
      <label for="${id}">${rotulo}</label>
      <div class="campo-senha">
        <input id="${id}" name="${nome}" type="password" required autocomplete="${autocomplete}" />
        <button type="button" class="botao-icone" data-mostrar-senha="${id}" aria-label="Mostrar senha" aria-pressed="false">
          ${ic('eye')}
        </button>
      </div>
      ${ajuda ? html`<p class="campo-ajuda">${ajuda}</p>` : ''}
    </div>`;
}

// Ativa os botões "mostrar senha" dentro de um container.
export function ativarMostrarSenha(raiz) {
  raiz.querySelectorAll('[data-mostrar-senha]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const input = raiz.querySelector(`#${botao.dataset.mostrarSenha}`);
      const visivel = input.type === 'text';
      input.type = visivel ? 'password' : 'text';
      botao.setAttribute('aria-pressed', String(!visivel));
      botao.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}

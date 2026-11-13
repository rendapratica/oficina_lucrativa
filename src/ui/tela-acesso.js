import { html, montar } from '../lib/dom.js';
import { logotipo, placaCircuito } from './marca.js';

// Moldura das telas públicas (entrar, cadastrar, recuperar senha, convite).
export function telaAcesso(raiz, { titulo, descricao, conteudo }) {
  montar(raiz, html`
    <div class="acesso">
      <aside class="acesso-placa">
        ${placaCircuito()}
        <div class="acesso-placa-texto">
          ${logotipo()}
          <p>Clientes, equipamentos, diagnósticos, componentes e finanças da sua bancada em um só lugar.</p>
        </div>
      </aside>
      <main class="acesso-conteudo" id="conteudo">
        <div class="acesso-cartao">
          <h1>${titulo}</h1>
          ${descricao ? html`<p class="acesso-descricao">${descricao}</p>` : ''}
          <div class="acesso-corpo">${conteudo}</div>
        </div>
      </main>
    </div>
  `);
  return raiz.querySelector('.acesso-corpo');
}

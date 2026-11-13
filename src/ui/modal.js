import { montar, html, ic } from '../lib/dom.js';

// Modal acessível baseado no elemento <dialog> (foco preso e tecla Esc nativos).
export function abrirModal({ titulo, conteudo, largura = 'media', aoFechar }) {
  const dialogo = document.createElement('dialog');
  dialogo.className = `modal modal-${largura}`;
  dialogo.setAttribute('aria-labelledby', 'modal-titulo');
  montar(dialogo, html`
    <header class="modal-cabecalho">
      <h2 id="modal-titulo">${titulo}</h2>
      <button type="button" class="botao-icone" data-fechar aria-label="Fechar">${ic('x')}</button>
    </header>
    <div class="modal-corpo">${conteudo}</div>
  `);
  document.body.append(dialogo);

  const fechar = () => dialogo.close();
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    aoFechar?.();
  });
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo || e.target.closest('[data-fechar]')) fechar();
  });
  dialogo.showModal();
  return { dialogo, fechar, corpo: dialogo.querySelector('.modal-corpo') };
}

export function confirmar({ titulo, mensagem, confirmarTexto = 'Confirmar', perigo = false }) {
  return new Promise((resolver) => {
    let resposta = false;
    const { dialogo, fechar } = abrirModal({
      titulo,
      largura: 'pequena',
      conteudo: html`
        <p>${mensagem}</p>
        <div class="acoes-form">
          <button type="button" class="botao botao-secundario" data-fechar>Voltar</button>
          <button type="button" class="botao ${perigo ? 'botao-perigo' : 'botao-primario'}" data-confirmar>${confirmarTexto}</button>
        </div>`,
      aoFechar: () => resolver(resposta),
    });
    dialogo.querySelector('[data-confirmar]').addEventListener('click', () => {
      resposta = true;
      fechar();
    });
  });
}

import { escapar } from '../lib/dom.js';
import { icone } from '../lib/icones.js';

// Notificações curtas no canto da tela.
export function avisar(mensagem, tipo = 'sucesso', duracao = 4500) {
  const area = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `${icone(tipo === 'erro' ? 'circle-alert' : 'circle-check')}<span>${escapar(mensagem)}</span>`;
  area.append(el);
  setTimeout(() => {
    el.classList.add('saindo');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, duracao);
}

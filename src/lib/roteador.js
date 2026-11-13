// Roteador por hash (#/caminho?param=valor), compatível com qualquer hospedagem estática.
const rotas = new Map();

export function definirRota(caminho, opcoes) {
  rotas.set(caminho, { caminho, ...opcoes });
}

export function obterRota(caminho) {
  return rotas.get(caminho) ?? null;
}

export function rotaAtual() {
  const bruto = window.location.hash.replace(/^#/, '') || '/';
  const [caminho, consulta = ''] = bruto.split('?');
  return { caminho: caminho || '/', parametros: new URLSearchParams(consulta) };
}

export function navegar(caminho, { substituir = false } = {}) {
  const destino = `#${caminho}`;
  if (window.location.hash === destino) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (substituir) {
    window.history.replaceState(null, '', destino);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = destino;
  }
}

// Casca da aplicação: menu lateral, barra superior e área de conteúdo.
import { html, montar, ic, qs } from '../lib/dom.js';
import { sessao, pode, empresaAtual, situacaoEmpresa, selecionarEmpresa, NOMES_PAPEIS } from '../lib/sessao.js';
import { supabase } from '../lib/supabase.js';
import { navegar } from '../lib/roteador.js';
import { logotipo } from './marca.js';
import { avisar } from './avisos.js';
import { mensagemErro } from '../lib/erros.js';

const ITENS_MENU = [
  { caminho: '/inicio', rotulo: 'Início', icone: 'house' },
  { caminho: '/configuracoes/oficina', rotulo: 'Oficina', icone: 'building-2', permissao: ['empresa', 'ver'] },
  { caminho: '/configuracoes/usuarios', rotulo: 'Usuários', icone: 'users', permissao: ['usuarios', 'ver'] },
];

function rotuloSituacao(empresa) {
  const s = situacaoEmpresa(empresa);
  if (s.codigo === 'ativa') return html`<span class="led led-ok"></span>Ativa`;
  if (s.codigo === 'avaliacao') {
    return html`<span class="led led-atencao"></span>Avaliação: ${s.diasRestantes} ${s.diasRestantes === 1 ? 'dia' : 'dias'}`;
  }
  return html`<span class="led led-erro"></span>Acesso bloqueado`;
}

export function casca(raiz, caminhoAtivo) {
  const empresa = empresaAtual();
  const nome = sessao.perfil?.nome || sessao.usuario?.email;
  const itens = ITENS_MENU.filter((i) => !i.permissao || pode(...i.permissao));

  montar(raiz, html`
    <a class="pular-para-conteudo" href="#conteudo-app">Ir para o conteúdo</a>
    <div class="casca">
      <aside class="lateral" id="menu-lateral" aria-label="Menu principal">
        <div class="lateral-marca">${logotipo()}</div>
        <nav>
          <ul class="menu">
            ${itens.map((i) => html`
              <li><a href="#${i.caminho}" class="menu-item" ${caminhoAtivo === i.caminho ? html`aria-current="page"` : ''}>
                ${ic(i.icone)}<span>${i.rotulo}</span></a></li>`)}
          </ul>
        </nav>
        <div class="lateral-rodape">
          <span class="lateral-situacao">${rotuloSituacao(empresa)}</span>
        </div>
      </aside>
      <div class="lateral-fundo" data-fechar-menu></div>

      <div class="principal">
        <header class="topo">
          <button type="button" class="botao-icone topo-menu" aria-controls="menu-lateral" aria-expanded="false" aria-label="Abrir menu">${ic('menu')}</button>

          <div class="topo-empresa">
            ${sessao.vinculos.length > 1
              ? html`<label class="visualmente-oculto" for="trocar-empresa">Oficina atual</label>
                <select id="trocar-empresa" class="seletor-empresa">
                  ${sessao.vinculos.map((v) => html`<option value="${v.empresa_id}" ${v.empresa_id === sessao.vinculo?.empresa_id ? html`selected` : ''}>${v.empresa.nome_fantasia}</option>`)}
                </select>`
              : html`<span class="topo-empresa-nome">${empresa?.nome_fantasia}</span>`}
          </div>

          <details class="menu-usuario">
            <summary>
              <span class="avatar" aria-hidden="true">${(nome || '?').trim().charAt(0).toUpperCase()}</span>
              <span class="menu-usuario-nome">${nome}</span>
              ${ic('chevron-down')}
            </summary>
            <div class="menu-usuario-painel">
              <p class="menu-usuario-dados"><strong>${nome}</strong><span>${sessao.usuario?.email}</span><span>${NOMES_PAPEIS[sessao.vinculo?.papel] ?? ''}</span></p>
              <a href="#/nova-oficina" class="menu-usuario-acao">${ic('plus')}Cadastrar outra oficina</a>
              <button type="button" class="menu-usuario-acao" data-sair>${ic('log-out')}Sair</button>
            </div>
          </details>
        </header>

        <main class="conteudo" id="conteudo-app" tabindex="-1"></main>
      </div>
    </div>
  `);

  const lateral = qs('#menu-lateral', raiz);
  const botaoMenu = qs('.topo-menu', raiz);
  const alternarMenu = (abrir) => {
    raiz.querySelector('.casca').classList.toggle('menu-aberto', abrir);
    botaoMenu.setAttribute('aria-expanded', String(abrir));
    if (abrir) lateral.querySelector('a')?.focus();
  };
  botaoMenu.addEventListener('click', () => alternarMenu(!raiz.querySelector('.casca').classList.contains('menu-aberto')));
  qs('[data-fechar-menu]', raiz).addEventListener('click', () => alternarMenu(false));
  lateral.addEventListener('keydown', (e) => { if (e.key === 'Escape') alternarMenu(false); });

  qs('#trocar-empresa', raiz)?.addEventListener('change', async (e) => {
    try {
      await selecionarEmpresa(e.target.value);
      navegar('/inicio');
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    }
  });

  qs('[data-sair]', raiz).addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) avisar(mensagemErro(error), 'erro');
  });

  return qs('#conteudo-app', raiz);
}

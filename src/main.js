import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/acesso.css';
import './styles/casca.css';
import './styles/componentes.css';

import { supabase } from './lib/supabase.js';
import { problemaDeConfiguracao } from './lib/config.js';
import { html, montar } from './lib/dom.js';
import { mensagemErro } from './lib/erros.js';
import { definirRota, obterRota, rotaAtual, navegar } from './lib/roteador.js';
import { sessao, carregarUsuario, carregarContexto, limparSessao, empresaAtual, situacaoEmpresa, pode, CHAVE_CONVITE } from './lib/sessao.js';
import { casca } from './ui/casca.js';
import { avisar } from './ui/avisos.js';

// -----------------------------------------------------------------------------
// Rotas
//   publica: acessível sem login | somenteVisitante: redireciona quem já entrou
//   empresa: exige oficina selecionada e operante | permissao: [modulo, acao]
//   casca: renderiza dentro do menu lateral
// -----------------------------------------------------------------------------
definirRota('/entrar', { publica: true, somenteVisitante: true, carregar: () => import('./pages/auth/entrar.js') });
definirRota('/cadastrar', { publica: true, somenteVisitante: true, carregar: () => import('./pages/auth/cadastrar.js') });
definirRota('/recuperar-senha', { publica: true, somenteVisitante: true, carregar: () => import('./pages/auth/recuperar-senha.js') });
definirRota('/redefinir-senha', { carregar: () => import('./pages/auth/redefinir-senha.js') });
definirRota('/convite', { carregar: () => import('./pages/convite.js') });
definirRota('/nova-oficina', { carregar: () => import('./pages/nova-oficina.js') });
definirRota('/acesso-bloqueado', { carregar: () => import('./pages/acesso-bloqueado.js') });
definirRota('/inicio', { empresa: true, casca: true, carregar: () => import('./pages/inicio.js') });
definirRota('/configuracoes/oficina', { empresa: true, casca: true, permissao: ['empresa', 'ver'], carregar: () => import('./pages/configuracoes/oficina.js') });
definirRota('/configuracoes/usuarios', { empresa: true, casca: true, permissao: ['usuarios', 'ver'], carregar: () => import('./pages/configuracoes/usuarios.js') });

const raiz = document.getElementById('app');
let renderizacao = 0;

function telaErro(mensagem) {
  montar(raiz, html`
    <div class="tela-erro" role="alert">
      <h1>Não foi possível abrir a Oficina Lucrativa</h1>
      <p>${mensagem}</p>
      <button type="button" class="botao botao-primario" data-recarregar>Tentar novamente</button>
    </div>`);
  raiz.querySelector('[data-recarregar]').addEventListener('click', () => window.location.reload());
}

function destinoPadrao() {
  if (!sessao.usuario) return '/entrar';
  if (sessionStorage.getItem(CHAVE_CONVITE)) return '/convite';
  if (!sessao.vinculo) return '/nova-oficina';
  return situacaoEmpresa(empresaAtual()).operante ? '/inicio' : '/acesso-bloqueado';
}

async function renderizar() {
  const atual = ++renderizacao;
  const { caminho, parametros } = rotaAtual();
  const rota = obterRota(caminho);

  if (!rota) return navegar(destinoPadrao(), { substituir: true });

  if (!rota.publica && !sessao.usuario) {
    if (caminho === '/convite' && parametros.get('t')) {
      sessionStorage.setItem(CHAVE_CONVITE, parametros.get('t'));
      return navegar('/entrar?convite=1', { substituir: true });
    }
    return navegar('/entrar', { substituir: true });
  }
  if (rota.somenteVisitante && sessao.usuario) return navegar(destinoPadrao(), { substituir: true });

  if (rota.empresa) {
    if (!sessao.vinculo) return navegar('/nova-oficina', { substituir: true });
    if (!situacaoEmpresa(empresaAtual()).operante) return navegar('/acesso-bloqueado', { substituir: true });
  }

  try {
    const modulo = await rota.carregar();
    if (atual !== renderizacao) return; // outra navegação começou nesse meio-tempo

    if (rota.casca) {
      const conteudo = casca(raiz, caminho);
      if (rota.permissao && !pode(...rota.permissao)) {
        montar(conteudo, html`<div class="vazio"><h1>Acesso restrito</h1><p>Seu papel nesta oficina não permite abrir esta página. Fale com o proprietário se precisar de acesso.</p><a class="botao botao-secundario" href="#/inicio">Ir para o início</a></div>`);
        return;
      }
      document.title = 'Oficina Lucrativa';
      await modulo.render(conteudo, { parametros });
      conteudo.focus({ preventScroll: true });
    } else {
      await modulo.render(raiz, { parametros });
    }
  } catch (erro) {
    console.error(erro);
    avisar(mensagemErro(erro), 'erro');
  }
}

// Trata parâmetros de retorno dos e-mails do Supabase Auth (?acao=… e erros).
function processarRetornoDeEmail() {
  const url = new URL(window.location.href);
  const acao = url.searchParams.get('acao');
  const erro = url.searchParams.get('error_description') || new URLSearchParams(url.hash.split('?')[1] ?? '').get('error_description');

  if (url.search) {
    window.history.replaceState(null, '', `${url.pathname}${url.hash.startsWith('#/') ? url.hash : ''}`);
  }
  if (erro) {
    avisar('O link é inválido ou expirou. Solicite um novo.', 'erro', 8000);
    return null;
  }
  if (acao === 'email-confirmado' && sessao.usuario) avisar('E-mail confirmado. Bem-vindo à Oficina Lucrativa!');
  if (acao === 'redefinir-senha' && sessao.usuario) return '/redefinir-senha';
  return null;
}

async function iniciar() {
  const problema = problemaDeConfiguracao();
  if (problema) return telaErro(problema);

  try {
    await carregarUsuario(); // aguarda também a troca do código PKCE vindo dos e-mails
    await carregarContexto();
  } catch (erro) {
    return telaErro(mensagemErro(erro));
  }

  const destinoEmail = processarRetornoDeEmail();
  if (destinoEmail) navegar(destinoEmail, { substituir: true });

  window.addEventListener('hashchange', renderizar);
  if (!destinoEmail) renderizar();

  supabase.auth.onAuthStateChange((evento, sessaoAuth) => {
    // As chamadas ao Supabase são adiadas para fora do callback (recomendação do supabase-js).
    setTimeout(async () => {
      const anterior = sessao.usuario?.id ?? null;
      const novo = sessaoAuth?.user?.id ?? null;

      if (evento === 'SIGNED_OUT' || !novo) {
        if (anterior) {
          limparSessao();
          navegar(sessionStorage.getItem(CHAVE_CONVITE) ? '/entrar?convite=1' : '/entrar', { substituir: true });
        }
        return;
      }
      sessao.usuario = sessaoAuth.user;
      if (evento === 'PASSWORD_RECOVERY') return navegar('/redefinir-senha', { substituir: true });
      if (anterior !== novo) {
        try {
          await carregarContexto();
        } catch (erro) {
          avisar(mensagemErro(erro), 'erro');
        }
        navegar(destinoPadrao(), { substituir: true });
      }
    }, 0);
  });
}

iniciar();

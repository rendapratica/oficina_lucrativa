import { html, qs, montar, comCarregamento, alertaFormulario } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { mensagemErro } from '../lib/erros.js';
import { sessao, carregarContexto, selecionarEmpresa, NOMES_PAPEIS, CHAVE_CONVITE } from '../lib/sessao.js';
import { navegar } from '../lib/roteador.js';
import { formatarData } from '../lib/validacao.js';
import { telaAcesso } from '../ui/tela-acesso.js';
import { avisar } from '../ui/avisos.js';


const TEXTOS_SITUACAO = {
  cancelado: 'Este convite foi cancelado pela oficina. Peça um novo convite.',
  utilizado: 'Este convite já foi utilizado.',
  expirado: 'Este convite expirou. Peça um novo convite à oficina.',
};

export async function render(raiz, { parametros }) {
  const token = parametros.get('t') || sessionStorage.getItem(CHAVE_CONVITE);
  sessionStorage.removeItem(CHAVE_CONVITE);

  const corpo = telaAcesso(raiz, { titulo: 'Convite', conteudo: html`<p class="carregando">Consultando convite…</p>` });

  if (!token) {
    montar(corpo, html`<p>Link de convite incompleto. Abra novamente o link recebido.</p><a class="botao botao-secundario botao-bloco" href="#/inicio">Continuar</a>`);
    return;
  }

  const { data, error } = await supabase.rpc('consultar_convite', { p_token: token });
  if (error) {
    montar(corpo, html`<p class="form-alerta">${mensagemErro(error)}</p>`);
    return;
  }
  const convite = data?.[0];
  if (!convite) {
    montar(corpo, html`<p>Convite não encontrado. Confira o link recebido.</p><a class="botao botao-secundario botao-bloco" href="#/inicio">Continuar</a>`);
    return;
  }
  if (convite.situacao !== 'valido') {
    montar(corpo, html`<p>${TEXTOS_SITUACAO[convite.situacao]}</p><a class="botao botao-secundario botao-bloco" href="#/inicio">Continuar</a>`);
    return;
  }

  const emailCorreto = sessao.usuario.email?.toLowerCase() === convite.email;

  montar(corpo, html`
    <form class="form">
      <p>Você foi convidado para a oficina <strong>${convite.empresa_nome}</strong> como <strong>${NOMES_PAPEIS[convite.papel]}</strong>.</p>
      <p class="campo-ajuda">Convite para ${convite.email}, válido até ${formatarData(convite.expira_em)}.</p>
      ${emailCorreto
        ? html`<button type="submit" class="botao botao-primario botao-bloco" data-carregando="Entrando na oficina…">Aceitar convite</button>`
        : html`<p class="form-alerta" role="alert">Você está conectado como ${sessao.usuario.email}. Saia e entre com ${convite.email} para aceitar.</p>
               <button type="button" class="botao botao-secundario botao-bloco" data-trocar-conta>Sair e trocar de conta</button>`}
    </form>`);

  const form = qs('form', corpo);
  qs('[data-trocar-conta]', form)?.addEventListener('click', async () => {
    sessionStorage.setItem(CHAVE_CONVITE, token);
    await supabase.auth.signOut();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await comCarregamento(qs('[type=submit]', form), async () => {
      const { data: empresaId, error: erro } = await supabase.rpc('aceitar_convite', { p_token: token });
      if (erro) return alertaFormulario(form, mensagemErro(erro));
      await carregarContexto();
      await selecionarEmpresa(empresaId);
      avisar(`Você agora faz parte da oficina ${convite.empresa_nome}.`);
      navegar('/inicio', { substituir: true });
    });
  });
}

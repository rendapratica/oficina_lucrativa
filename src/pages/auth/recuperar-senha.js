import { html, qs, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo, montar } from '../../lib/dom.js';
import { supabase } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { emailValido } from '../../lib/validacao.js';
import { telaAcesso } from '../../ui/tela-acesso.js';
import { campo } from '../../ui/campos.js';

export function render(raiz) {
  const corpo = telaAcesso(raiz, {
    titulo: 'Recuperar senha',
    descricao: 'Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.',
    conteudo: html`
      <form class="form" novalidate>
        ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', obrigatorio: true, autocomplete: 'email', inputmode: 'email' })}
        <button class="botao botao-primario botao-bloco" type="submit" data-carregando="Enviando…">Enviar link</button>
      </form>
      <p class="acesso-links"><a href="#/entrar">Voltar para entrar</a></p>`,
  });

  const form = qs('form', corpo);
  qs('#campo-email', form).focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const { email } = dadosDoFormulario(form);
    if (!emailValido(email)) return mostrarErroCampo(form, 'email', 'Informe um e-mail válido.');

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?acao=redefinir-senha`,
      });
      // O Supabase não revela se o e-mail está cadastrado; erros aqui são de limite ou conexão.
      if (error) return alertaFormulario(form, mensagemErro(error));
      montar(corpo, html`
        <div class="mensagem-confirmacao" role="status">
          <p>Se existir uma conta com <strong>${email}</strong>, você receberá um link para criar uma nova senha.</p>
          <p>Abra o link neste mesmo navegador. Ele expira em pouco tempo.</p>
          <a class="botao botao-secundario botao-bloco" href="#/entrar">Voltar para entrar</a>
        </div>`);
    });
  });
}

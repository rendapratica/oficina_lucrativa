import { html, qs, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo } from '../../lib/dom.js';
import { supabase } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { emailValido } from '../../lib/validacao.js';
import { telaAcesso } from '../../ui/tela-acesso.js';
import { campo, campoSenha, ativarMostrarSenha } from '../../ui/campos.js';
import { avisar } from '../../ui/avisos.js';

export function render(raiz, { parametros }) {
  const corpo = telaAcesso(raiz, {
    titulo: 'Entrar',
    descricao: parametros.get('convite') ? 'Entre com a conta que recebeu o convite para continuar.' : '',
    conteudo: html`
      <form class="form" novalidate>
        ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', obrigatorio: true, autocomplete: 'email', inputmode: 'email' })}
        ${campoSenha({ rotulo: 'Senha', nome: 'senha' })}
        <button class="botao botao-primario botao-bloco" type="submit" data-carregando="Entrando…">Entrar</button>
        <div class="reenviar" hidden>
          <p>Não recebeu o e-mail de confirmação?</p>
          <button type="button" class="botao botao-secundario botao-bloco" data-reenviar data-carregando="Enviando…">Reenviar e-mail de confirmação</button>
        </div>
      </form>
      <p class="acesso-links">
        <a href="#/recuperar-senha">Esqueci minha senha</a>
        <span>Ainda não tem conta? <a href="#/cadastrar">Criar conta</a></span>
      </p>`,
  });

  const form = qs('form', corpo);
  ativarMostrarSenha(form);
  qs('#campo-email', form).focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const { email, senha } = dadosDoFormulario(form);
    if (!emailValido(email)) return mostrarErroCampo(form, 'email', 'Informe um e-mail válido.');
    if (!senha) return mostrarErroCampo(form, 'senha', 'Informe a senha.');

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        alertaFormulario(form, mensagemErro(error));
        qs('.reenviar', form).hidden = error.code !== 'email_not_confirmed' && !/not confirmed/i.test(error.message);
      }
      // Em caso de sucesso, o evento SIGNED_IN conduz a navegação (ver main.js).
    });
  });

  qs('[data-reenviar]', form).addEventListener('click', async (e) => {
    const { email } = dadosDoFormulario(form);
    await comCarregamento(e.currentTarget, async () => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/?acao=email-confirmado` },
      });
      if (error) return alertaFormulario(form, mensagemErro(error));
      avisar('Enviamos um novo link de confirmação para o seu e-mail.');
    });
  });
}

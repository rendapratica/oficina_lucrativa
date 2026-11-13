import { html, qs, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo, montar } from '../../lib/dom.js';
import { supabase } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { emailValido, problemaSenha } from '../../lib/validacao.js';
import { telaAcesso } from '../../ui/tela-acesso.js';
import { campo, campoSenha, ativarMostrarSenha } from '../../ui/campos.js';

export function render(raiz) {
  const corpo = telaAcesso(raiz, {
    titulo: 'Criar conta',
    descricao: 'Depois de confirmar o e-mail, você cadastra sua oficina e começa o período de avaliação.',
    conteudo: html`
      <form class="form" novalidate>
        ${campo({ rotulo: 'Seu nome', nome: 'nome', obrigatorio: true, autocomplete: 'name', maxlength: 120 })}
        ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', obrigatorio: true, autocomplete: 'email', inputmode: 'email' })}
        ${campoSenha({ rotulo: 'Senha', nome: 'senha', autocomplete: 'new-password', ajuda: 'Mínimo de 8 caracteres, com letras maiúsculas, minúsculas e números.' })}
        ${campoSenha({ rotulo: 'Confirme a senha', nome: 'confirmacao', autocomplete: 'new-password' })}
        <button class="botao botao-primario botao-bloco" type="submit" data-carregando="Criando conta…">Criar conta</button>
      </form>
      <p class="acesso-links"><span>Já tem conta? <a href="#/entrar">Entrar</a></span></p>`,
  });

  const form = qs('form', corpo);
  ativarMostrarSenha(form);
  qs('#campo-nome', form).focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const { nome, email, senha, confirmacao } = dadosDoFormulario(form);
    let valido = true;
    if (nome.length < 2) { mostrarErroCampo(form, 'nome', 'Informe seu nome.'); valido = false; }
    if (!emailValido(email)) { mostrarErroCampo(form, 'email', 'Informe um e-mail válido.'); valido = false; }
    const problema = problemaSenha(senha);
    if (problema) { mostrarErroCampo(form, 'senha', problema); valido = false; }
    if (senha !== confirmacao) { mostrarErroCampo(form, 'confirmacao', 'As senhas não coincidem.'); valido = false; }
    if (!valido) return;

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome },
          emailRedirectTo: `${window.location.origin}/?acao=email-confirmado`,
        },
      });
      if (error) return alertaFormulario(form, mensagemErro(error));

      // Com confirmação de e-mail ativa (recomendado), não há sessão ainda.
      if (!data.session) {
        montar(corpo, html`
          <div class="mensagem-confirmacao" role="status">
            <p>Enviamos um link de confirmação para <strong>${email}</strong>.</p>
            <p>Abra o link <strong>neste mesmo navegador</strong> para ativar a conta. Se não encontrar o e-mail, confira a caixa de spam.</p>
            <a class="botao botao-secundario botao-bloco" href="#/entrar">Voltar para entrar</a>
          </div>`);
      }
    });
  });
}

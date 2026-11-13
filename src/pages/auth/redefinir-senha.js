import { html, qs, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo } from '../../lib/dom.js';
import { supabase } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { problemaSenha } from '../../lib/validacao.js';
import { navegar } from '../../lib/roteador.js';
import { telaAcesso } from '../../ui/tela-acesso.js';
import { campoSenha, ativarMostrarSenha } from '../../ui/campos.js';
import { avisar } from '../../ui/avisos.js';

export function render(raiz) {
  const corpo = telaAcesso(raiz, {
    titulo: 'Criar nova senha',
    conteudo: html`
      <form class="form" novalidate>
        ${campoSenha({ rotulo: 'Nova senha', nome: 'senha', autocomplete: 'new-password', ajuda: 'Mínimo de 8 caracteres, com letras maiúsculas, minúsculas e números.' })}
        ${campoSenha({ rotulo: 'Confirme a nova senha', nome: 'confirmacao', autocomplete: 'new-password' })}
        <button class="botao botao-primario botao-bloco" type="submit" data-carregando="Salvando…">Salvar nova senha</button>
      </form>`,
  });

  const form = qs('form', corpo);
  ativarMostrarSenha(form);
  qs('#campo-senha', form).focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const { senha, confirmacao } = dadosDoFormulario(form);
    const problema = problemaSenha(senha);
    if (problema) return mostrarErroCampo(form, 'senha', problema);
    if (senha !== confirmacao) return mostrarErroCampo(form, 'confirmacao', 'As senhas não coincidem.');

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) return alertaFormulario(form, mensagemErro(error));
      avisar('Senha alterada.');
      navegar('/inicio', { substituir: true });
    });
  });
}

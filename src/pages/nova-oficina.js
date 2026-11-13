import { html, qs, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { mensagemErro } from '../lib/erros.js';
import { documentoValido, telefoneValido, aplicarMascara, formatarTelefone, formatarCpf, formatarCnpj, somenteDigitos, normalizarDocumento } from '../lib/validacao.js';
import { sessao, carregarContexto, selecionarEmpresa } from '../lib/sessao.js';
import { navegar } from '../lib/roteador.js';
import { telaAcesso } from '../ui/tela-acesso.js';
import { campo } from '../ui/campos.js';
import { avisar } from '../ui/avisos.js';

export function render(raiz) {
  const primeira = sessao.vinculos.length === 0;
  const corpo = telaAcesso(raiz, {
    titulo: primeira ? 'Cadastre sua oficina' : 'Cadastrar outra oficina',
    descricao: 'Comece pelo essencial. Endereço, logotipo e textos dos documentos ficam nas configurações da oficina.',
    conteudo: html`
      <form class="form" novalidate>
        ${campo({ rotulo: 'Nome da oficina', nome: 'nome_fantasia', obrigatorio: true, maxlength: 120, autocomplete: 'organization', ajuda: 'Como aparece para os clientes e nos documentos.' })}
        <fieldset class="campo">
          <legend>Documento <span class="opcional">(opcional)</span></legend>
          <div class="opcoes-linha">
            <label class="opcao"><input type="radio" name="tipo_documento" value="" checked /> Informar depois</label>
            <label class="opcao"><input type="radio" name="tipo_documento" value="cnpj" /> CNPJ</label>
            <label class="opcao"><input type="radio" name="tipo_documento" value="cpf" /> CPF</label>
          </div>
        </fieldset>
        <div data-documento hidden>
          ${campo({ rotulo: 'Número do documento', nome: 'documento', obrigatorio: true, maxlength: 18, ajuda: 'Aceita o novo CNPJ alfanumérico.' })}
        </div>
        ${campo({ rotulo: 'WhatsApp da oficina', nome: 'whatsapp', tipo: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 15 })}
        <button class="botao botao-primario botao-bloco" type="submit" data-carregando="Cadastrando…">Cadastrar oficina</button>
      </form>
      ${primeira
        ? html`<p class="acesso-links"><span>Recebeu um convite de outra oficina? Abra o link do convite.</span><button type="button" class="link" data-sair>Sair</button></p>`
        : html`<p class="acesso-links"><a href="#/inicio">Voltar</a></p>`}`,
  });

  const form = qs('form', corpo);
  const blocoDocumento = qs('[data-documento]', form);
  const inputDocumento = qs('#campo-documento', form);
  aplicarMascara(qs('#campo-whatsapp', form), formatarTelefone);

  const tipoAtual = () => form.elements.tipo_documento.value;
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'tipo_documento') return;
    blocoDocumento.hidden = !tipoAtual();
    inputDocumento.value = '';
  });
  inputDocumento.addEventListener('input', () => {
    inputDocumento.value = tipoAtual() === 'cpf' ? formatarCpf(inputDocumento.value) : formatarCnpj(inputDocumento.value);
  });
  qs('#campo-nome_fantasia', form).focus();

  qs('[data-sair]', corpo)?.addEventListener('click', () => supabase.auth.signOut());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const dados = dadosDoFormulario(form);
    const tipo = dados.tipo_documento || null;
    let valido = true;
    if (dados.nome_fantasia.length < 2) { mostrarErroCampo(form, 'nome_fantasia', 'Informe o nome da oficina.'); valido = false; }
    if (tipo && !documentoValido(tipo, dados.documento)) { mostrarErroCampo(form, 'documento', `${tipo.toUpperCase()} inválido. Confira os dígitos.`); valido = false; }
    if (dados.whatsapp && !telefoneValido(dados.whatsapp)) { mostrarErroCampo(form, 'whatsapp', 'Informe DDD e número.'); valido = false; }
    if (!valido) return;

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { data: empresaId, error } = await supabase.rpc('criar_empresa', {
        p_nome_fantasia: dados.nome_fantasia,
        p_tipo_documento: tipo,
        p_documento: tipo ? normalizarDocumento(dados.documento) : null,
        p_whatsapp: dados.whatsapp ? somenteDigitos(dados.whatsapp) : null,
      });
      if (error) return alertaFormulario(form, mensagemErro(error));
      await carregarContexto();
      await selecionarEmpresa(empresaId);
      avisar('Oficina cadastrada. Seu período de avaliação começou.');
      navegar('/inicio', { substituir: true });
    });
  });
}

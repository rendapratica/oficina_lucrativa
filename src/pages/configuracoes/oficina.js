import {
  html, montar, qs, ic, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo,
} from '../../lib/dom.js';
import { supabase, BUCKET_ARQUIVOS } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { carregarContexto, empresaAtual, pode } from '../../lib/sessao.js';
import {
  documentoValido, telefoneValido, emailValido, cepValido, somenteDigitos, normalizarDocumento,
  aplicarMascara, formatarTelefone, formatarCep, formatarCpf, formatarCnpj, formatarDocumento,
} from '../../lib/validacao.js';
import { campo, areaTexto } from '../../ui/campos.js';
import { avisar } from '../../ui/avisos.js';

const COLUNAS = 'id, nome_fantasia, razao_social, tipo_documento, documento, logo_path, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, whatsapp, email, responsavel, dados_pagamento, cor_principal, garantia_padrao_dias, texto_garantia, mensagem_documentos';
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITE_LOGO = 2 * 1024 * 1024;

async function urlDoLogo(caminho) {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(caminho, 3600);
  return error ? null : data.signedUrl;
}

export async function render(conteudo) {
  montar(conteudo, html`<p class="carregando">Carregando dados da oficina…</p>`);
  const { data: e, error } = await supabase.from('empresas').select(COLUNAS).eq('id', empresaAtual().id).single();
  if (error) {
    montar(conteudo, html`<div class="form-alerta" role="alert">${mensagemErro(error)}</div>`);
    return;
  }
  const editavel = pode('empresa', 'editar');
  const bloqueado = !editavel;
  const logoUrl = await urlDoLogo(e.logo_path);

  montar(conteudo, html`
    <header class="pagina-cabecalho">
      <h1>Oficina</h1>
      <p>${editavel ? 'Esses dados aparecem em todos os documentos emitidos pela oficina.' : 'Somente o proprietário ou um administrador pode alterar estes dados.'}</p>
    </header>

    <section class="painel painel-logo" aria-labelledby="titulo-logo">
      <h2 id="titulo-logo">Logotipo</h2>
      <div class="logo-linha">
        <div class="logo-previa" data-previa>
          ${logoUrl ? html`<img src="${logoUrl}" alt="Logotipo atual da oficina" />` : html`<span>${ic('building-2')}Sem logotipo</span>`}
        </div>
        ${editavel ? html`
          <div class="logo-acoes">
            <label class="botao botao-secundario" for="arquivo-logo">${ic('upload')}Enviar logotipo</label>
            <input id="arquivo-logo" type="file" accept="image/png,image/jpeg,image/webp" class="visualmente-oculto" />
            ${e.logo_path ? html`<button type="button" class="botao botao-texto" data-remover-logo>${ic('trash-2')}Remover</button>` : ''}
            <p class="campo-ajuda">PNG, JPG ou WEBP com até 2 MB. Prefira fundo transparente.</p>
          </div>` : ''}
      </div>
    </section>

    <form class="form form-config" novalidate>
      <section class="painel" aria-labelledby="titulo-ident">
        <h2 id="titulo-ident">Identificação</h2>
        <div class="grade-campos">
          ${campo({ rotulo: 'Nome fantasia', nome: 'nome_fantasia', valor: e.nome_fantasia, obrigatorio: true, maxlength: 120, desabilitado: bloqueado })}
          ${campo({ rotulo: 'Razão social', nome: 'razao_social', valor: e.razao_social, maxlength: 160, desabilitado: bloqueado })}
          <div class="campo">
            <label for="campo-tipo_documento">Tipo de documento <span class="opcional">(opcional)</span></label>
            <select id="campo-tipo_documento" name="tipo_documento" ${bloqueado ? html`disabled` : ''}>
              <option value="" ${!e.tipo_documento ? html`selected` : ''}>Não informado</option>
              <option value="cnpj" ${e.tipo_documento === 'cnpj' ? html`selected` : ''}>CNPJ</option>
              <option value="cpf" ${e.tipo_documento === 'cpf' ? html`selected` : ''}>CPF</option>
            </select>
          </div>
          ${campo({ rotulo: 'Número do documento', nome: 'documento', valor: formatarDocumento(e.tipo_documento, e.documento), maxlength: 18, desabilitado: bloqueado, ajuda: 'Aceita o novo CNPJ alfanumérico.' })}
          ${campo({ rotulo: 'Responsável', nome: 'responsavel', valor: e.responsavel, maxlength: 120, desabilitado: bloqueado })}
        </div>
      </section>

      <section class="painel" aria-labelledby="titulo-contato">
        <h2 id="titulo-contato">Contato</h2>
        <div class="grade-campos">
          ${campo({ rotulo: 'Telefone', nome: 'telefone', tipo: 'tel', inputmode: 'tel', valor: formatarTelefone(e.telefone ?? ''), maxlength: 15, desabilitado: bloqueado })}
          ${campo({ rotulo: 'WhatsApp', nome: 'whatsapp', tipo: 'tel', inputmode: 'tel', valor: formatarTelefone(e.whatsapp ?? ''), maxlength: 15, desabilitado: bloqueado })}
          ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', inputmode: 'email', valor: e.email, desabilitado: bloqueado })}
        </div>
      </section>

      <section class="painel" aria-labelledby="titulo-endereco">
        <h2 id="titulo-endereco">Endereço</h2>
        <div class="grade-campos">
          ${campo({ rotulo: 'CEP', nome: 'cep', inputmode: 'numeric', valor: formatarCep(e.cep ?? ''), maxlength: 9, desabilitado: bloqueado, ajuda: editavel ? 'Ao completar o CEP, preenchemos rua, bairro e cidade.' : '' })}
          ${campo({ rotulo: 'Logradouro', nome: 'logradouro', valor: e.logradouro, maxlength: 160, desabilitado: bloqueado, classe: 'campo-largo' })}
          ${campo({ rotulo: 'Número', nome: 'numero', valor: e.numero, maxlength: 20, desabilitado: bloqueado })}
          ${campo({ rotulo: 'Complemento', nome: 'complemento', valor: e.complemento, maxlength: 80, desabilitado: bloqueado })}
          ${campo({ rotulo: 'Bairro', nome: 'bairro', valor: e.bairro, maxlength: 80, desabilitado: bloqueado })}
          ${campo({ rotulo: 'Cidade', nome: 'cidade', valor: e.cidade, maxlength: 80, desabilitado: bloqueado })}
          <div class="campo">
            <label for="campo-uf">UF <span class="opcional">(opcional)</span></label>
            <select id="campo-uf" name="uf" ${bloqueado ? html`disabled` : ''}>
              <option value="">—</option>
              ${UFS.map((uf) => html`<option ${e.uf === uf ? html`selected` : ''}>${uf}</option>`)}
            </select>
          </div>
        </div>
      </section>

      <section class="painel" aria-labelledby="titulo-docs">
        <h2 id="titulo-docs">Documentos e garantia</h2>
        <div class="grade-campos">
          <div class="campo">
            <label for="campo-cor_principal">Cor principal dos documentos</label>
            <div class="campo-cor">
              <input id="campo-cor_principal" name="cor_principal" type="color" value="${e.cor_principal}" ${bloqueado ? html`disabled` : ''} />
              <span data-cor-texto>${e.cor_principal}</span>
            </div>
          </div>
          ${campo({ rotulo: 'Garantia padrão (dias)', nome: 'garantia_padrao_dias', tipo: 'number', inputmode: 'numeric', valor: e.garantia_padrao_dias, obrigatorio: true, desabilitado: bloqueado, ajuda: 'Sugerida ao registrar a garantia de um reparo. O CDC (art. 26) dá 90 dias para reclamar de defeitos em serviços sobre bens duráveis.' })}
          ${areaTexto({ rotulo: 'Condições de garantia', nome: 'texto_garantia', valor: e.texto_garantia, maxlength: 4000, linhas: 5, desabilitado: bloqueado, ajuda: 'Texto impresso no termo de garantia.' })}
          ${areaTexto({ rotulo: 'Mensagem nos documentos', nome: 'mensagem_documentos', valor: e.mensagem_documentos, maxlength: 1000, desabilitado: bloqueado, ajuda: 'Rodapé exibido em OS, orçamentos e recibos.' })}
          ${areaTexto({ rotulo: 'Dados para pagamento', nome: 'dados_pagamento', valor: e.dados_pagamento, maxlength: 500, desabilitado: bloqueado, ajuda: 'Ex.: chave PIX e banco. Aparece em orçamentos e recibos.' })}
        </div>
      </section>

      ${editavel ? html`<div class="barra-salvar"><button type="submit" class="botao botao-primario" data-carregando="Salvando…">${ic('check')}Salvar alterações</button></div>` : ''}
    </form>
  `);

  if (!editavel) return;

  const form = qs('form', conteudo);
  const tipo = form.elements.tipo_documento;
  const doc = form.elements.documento;
  aplicarMascara(form.elements.telefone, formatarTelefone);
  aplicarMascara(form.elements.whatsapp, formatarTelefone);
  aplicarMascara(form.elements.cep, formatarCep);
  doc.disabled = !tipo.value;
  tipo.addEventListener('change', () => { doc.value = ''; doc.disabled = !tipo.value; });
  doc.addEventListener('input', () => { doc.value = tipo.value === 'cpf' ? formatarCpf(doc.value) : formatarCnpj(doc.value); });
  form.elements.cor_principal.addEventListener('input', (ev) => { qs('[data-cor-texto]', form).textContent = ev.target.value.toUpperCase(); });

  // Preenchimento de endereço pelo CEP (ViaCEP). Falhas não bloqueiam o cadastro.
  form.elements.cep.addEventListener('input', async () => {
    const cep = somenteDigitos(form.elements.cep.value);
    if (cep.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const end = await resposta.json();
      if (end.erro) return mostrarErroCampo(form, 'cep', 'CEP não encontrado. Preencha o endereço manualmente.');
      form.elements.logradouro.value = end.logradouro || form.elements.logradouro.value;
      form.elements.bairro.value = end.bairro || form.elements.bairro.value;
      form.elements.cidade.value = end.localidade || form.elements.cidade.value;
      form.elements.uf.value = end.uf || form.elements.uf.value;
      form.elements.numero.focus();
    } catch {
      /* Sem conexão com o ViaCEP: o preenchimento manual continua disponível. */
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const d = dadosDoFormulario(form);
    const erros = [];
    if (d.nome_fantasia.length < 2) erros.push(['nome_fantasia', 'Informe o nome da oficina.']);
    if (d.tipo_documento && !documentoValido(d.tipo_documento, d.documento)) erros.push(['documento', `${d.tipo_documento.toUpperCase()} inválido. Confira os dígitos.`]);
    if (d.telefone && !telefoneValido(d.telefone)) erros.push(['telefone', 'Informe DDD e número.']);
    if (d.whatsapp && !telefoneValido(d.whatsapp)) erros.push(['whatsapp', 'Informe DDD e número.']);
    if (d.email && !emailValido(d.email)) erros.push(['email', 'Informe um e-mail válido.']);
    if (d.cep && !cepValido(d.cep)) erros.push(['cep', 'O CEP tem 8 dígitos.']);
    const dias = Number(d.garantia_padrao_dias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 3650) erros.push(['garantia_padrao_dias', 'Use um número de 0 a 3650.']);
    if (erros.length) {
      erros.forEach(([n, m]) => mostrarErroCampo(form, n, m));
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { error: erro } = await supabase.from('empresas').update({
        nome_fantasia: d.nome_fantasia,
        razao_social: d.razao_social || null,
        tipo_documento: d.tipo_documento || null,
        documento: d.tipo_documento ? normalizarDocumento(d.documento) : null,
        responsavel: d.responsavel || null,
        telefone: d.telefone ? somenteDigitos(d.telefone) : null,
        whatsapp: d.whatsapp ? somenteDigitos(d.whatsapp) : null,
        email: d.email || null,
        cep: d.cep ? somenteDigitos(d.cep) : null,
        logradouro: d.logradouro || null,
        numero: d.numero || null,
        complemento: d.complemento || null,
        bairro: d.bairro || null,
        cidade: d.cidade || null,
        uf: d.uf || null,
        cor_principal: d.cor_principal,
        garantia_padrao_dias: dias,
        texto_garantia: d.texto_garantia || null,
        mensagem_documentos: d.mensagem_documentos || null,
        dados_pagamento: d.dados_pagamento || null,
      }).eq('id', e.id);
      if (erro) return alertaFormulario(form, mensagemErro(erro));
      await carregarContexto();
      avisar('Alterações salvas.');
    });
  });

  // ---------------------------------------------------------------------------
  // Logotipo (Storage: {empresa_id}/marca/...)
  // ---------------------------------------------------------------------------
  const inputLogo = qs('#arquivo-logo', conteudo);
  inputLogo.addEventListener('change', async () => {
    const arquivo = inputLogo.files[0];
    inputLogo.value = '';
    if (!arquivo) return;
    if (!TIPOS_LOGO.includes(arquivo.type)) return avisar('Envie uma imagem PNG, JPG ou WEBP.', 'erro');
    if (arquivo.size > LIMITE_LOGO) return avisar('O logotipo deve ter no máximo 2 MB.', 'erro');

    const extensao = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[arquivo.type];
    const caminho = `${e.id}/marca/logo-${Date.now()}.${extensao}`;
    const rotulo = qs('label[for="arquivo-logo"]', conteudo);
    rotulo.setAttribute('aria-busy', 'true');
    try {
      const envio = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (envio.error) throw envio.error;
      const atualizacao = await supabase.from('empresas').update({ logo_path: caminho }).eq('id', e.id);
      if (atualizacao.error) {
        await supabase.storage.from(BUCKET_ARQUIVOS).remove([caminho]);
        throw atualizacao.error;
      }
      if (e.logo_path) await supabase.storage.from(BUCKET_ARQUIVOS).remove([e.logo_path]);
      await carregarContexto();
      avisar('Logotipo atualizado.');
      render(conteudo);
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    } finally {
      rotulo.removeAttribute('aria-busy');
    }
  });

  qs('[data-remover-logo]', conteudo)?.addEventListener('click', async (ev) => {
    await comCarregamento(ev.currentTarget, async () => {
      const { error: erro } = await supabase.from('empresas').update({ logo_path: null }).eq('id', e.id);
      if (erro) return avisar(mensagemErro(erro), 'erro');
      await supabase.storage.from(BUCKET_ARQUIVOS).remove([e.logo_path]);
      await carregarContexto();
      avisar('Logotipo removido.');
      render(conteudo);
    });
  });
}

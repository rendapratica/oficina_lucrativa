import {
  html, montar, qs, qsa, ic, dadosDoFormulario, comCarregamento, limparErros, alertaFormulario, mostrarErroCampo,
} from '../../lib/dom.js';
import { supabase } from '../../lib/supabase.js';
import { mensagemErro } from '../../lib/erros.js';
import { sessao, empresaAtual, pode, carregarContexto, NOMES_PAPEIS } from '../../lib/sessao.js';
import { emailValido, formatarData } from '../../lib/validacao.js';
import { campo } from '../../ui/campos.js';
import { abrirModal, confirmar } from '../../ui/modal.js';
import { avisar } from '../../ui/avisos.js';

const PAPEIS_CONVITE = ['administrador', 'tecnico', 'atendente', 'financeiro'];

export async function render(conteudo) {
  const empresaId = empresaAtual().id;
  montar(conteudo, html`<p class="carregando">Carregando usuários…</p>`);

  const [membrosR, convitesR, resumoR] = await Promise.all([
    supabase.from('membros_empresa')
      .select('id, papel, ativo, criado_em, usuario_id, perfil:perfis(nome, email)')
      .eq('empresa_id', empresaId)
      .order('criado_em'),
    pode('usuarios', 'ver')
      ? supabase.from('convites')
        .select('id, email, papel, expira_em, criado_em')
        .eq('empresa_id', empresaId).is('aceito_em', null).is('revogado_em', null)
        .gt('expira_em', new Date().toISOString())
        .order('criado_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.rpc('resumo_empresa', { p_empresa: empresaId }),
  ]);
  const erro = membrosR.error || convitesR.error || resumoR.error;
  if (erro) {
    montar(conteudo, html`<div class="form-alerta" role="alert">${mensagemErro(erro)}</div>`);
    return;
  }

  const membros = membrosR.data;
  const convites = convitesR.data;
  const resumo = resumoR.data?.[0];
  const souProprietario = sessao.vinculo.papel === 'proprietario';
  const podeEditar = pode('usuarios', 'editar');
  const podeConvidar = pode('usuarios', 'criar');
  const vagasLivres = resumo ? resumo.max_usuarios - resumo.vagas_ocupadas : 0;
  // Administradores não gerenciam proprietários e outros administradores.
  const gerenciavel = (m) => podeEditar && (souProprietario || !['proprietario', 'administrador'].includes(m.papel));
  const papeisAtribuiveis = souProprietario ? Object.keys(NOMES_PAPEIS) : ['tecnico', 'atendente', 'financeiro'];

  montar(conteudo, html`
    <header class="pagina-cabecalho pagina-cabecalho-acoes">
      <div>
        <h1>Usuários</h1>
        <p>${resumo ? `${resumo.vagas_ocupadas} de ${resumo.max_usuarios} vagas do plano ocupadas, contando convites pendentes.` : ''}</p>
      </div>
      ${podeConvidar ? html`<button type="button" class="botao botao-primario" data-convidar ${vagasLivres <= 0 ? html`disabled aria-describedby="sem-vagas"` : ''}>${ic('user-plus')}Convidar usuário</button>` : ''}
    </header>
    ${podeConvidar && vagasLivres <= 0 ? html`<p class="aviso-inline" id="sem-vagas">Todas as vagas do plano estão ocupadas. Desative um usuário, cancele um convite ou fale com a RendaPrática para ampliar o plano.</p>` : ''}

    <section class="painel painel-tabela" aria-labelledby="titulo-membros">
      <h2 id="titulo-membros">Equipe</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th scope="col">Nome</th><th scope="col">Papel</th><th scope="col">Situação</th><th scope="col">Desde</th>${podeEditar ? html`<th scope="col"><span class="visualmente-oculto">Ações</span></th>` : ''}</tr></thead>
          <tbody>
            ${membros.map((m) => {
              const eu = m.usuario_id === sessao.usuario.id;
              return html`
              <tr class="${m.ativo ? '' : 'inativo'}">
                <td data-rotulo="Nome"><strong>${m.perfil?.nome || 'Sem nome'}${eu ? ' (você)' : ''}</strong><span class="sub">${m.perfil?.email}</span></td>
                <td data-rotulo="Papel">
                  ${gerenciavel(m) && m.ativo
                    ? html`<label class="visualmente-oculto" for="papel-${m.id}">Papel de ${m.perfil?.nome || m.perfil?.email}</label>
                      <select id="papel-${m.id}" data-papel="${m.id}" data-atual="${m.papel}">
                        ${papeisAtribuiveis.map((p) => html`<option value="${p}" ${p === m.papel ? html`selected` : ''}>${NOMES_PAPEIS[p]}</option>`)}
                      </select>`
                    : NOMES_PAPEIS[m.papel]}
                </td>
                <td data-rotulo="Situação">${m.ativo ? html`<span class="led led-ok"></span>Ativo` : html`<span class="led led-desligado"></span>Desativado`}</td>
                <td data-rotulo="Desde">${formatarData(m.criado_em)}</td>
                ${podeEditar ? html`<td class="celula-acoes">
                  ${gerenciavel(m)
                    ? (m.ativo
                      ? html`<button type="button" class="botao botao-texto" data-desativar="${m.id}" data-nome="${m.perfil?.nome || m.perfil?.email}">Desativar</button>`
                      : html`<button type="button" class="botao botao-texto" data-reativar="${m.id}">${ic('rotate-ccw')}Reativar</button>`)
                    : ''}
                </td>` : ''}
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </section>

    ${convites.length ? html`
      <section class="painel painel-tabela" aria-labelledby="titulo-convites">
        <h2 id="titulo-convites">Convites pendentes</h2>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th scope="col">E-mail</th><th scope="col">Papel</th><th scope="col">Válido até</th>${podeEditar ? html`<th scope="col"><span class="visualmente-oculto">Ações</span></th>` : ''}</tr></thead>
            <tbody>
              ${convites.map((c) => html`
                <tr>
                  <td data-rotulo="E-mail">${c.email}</td>
                  <td data-rotulo="Papel">${NOMES_PAPEIS[c.papel]}</td>
                  <td data-rotulo="Válido até">${formatarData(c.expira_em)}</td>
                  ${podeEditar ? html`<td class="celula-acoes"><button type="button" class="botao botao-texto" data-cancelar-convite="${c.id}" data-email="${c.email}">Cancelar convite</button></td>` : ''}
                </tr>`)}
            </tbody>
          </table>
        </div>
      </section>` : ''}
  `);

  const recarregar = () => render(conteudo);

  qsa('[data-papel]', conteudo).forEach((select) => {
    select.addEventListener('change', async () => {
      select.disabled = true;
      const { error } = await supabase.rpc('alterar_papel_membro', { p_membro: select.dataset.papel, p_papel: select.value });
      select.disabled = false;
      if (error) {
        select.value = select.dataset.atual;
        return avisar(mensagemErro(error), 'erro');
      }
      select.dataset.atual = select.value;
      avisar('Papel alterado.');
      await carregarContexto();
    });
  });

  qsa('[data-desativar]', conteudo).forEach((botao) => {
    botao.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: 'Desativar usuário',
        mensagem: `${botao.dataset.nome} perderá o acesso a esta oficina imediatamente. O histórico de ações dele é mantido e você pode reativá-lo depois.`,
        confirmarTexto: 'Desativar',
        perigo: true,
      });
      if (!ok) return;
      const { error } = await supabase.rpc('definir_membro_ativo', { p_membro: botao.dataset.desativar, p_ativo: false });
      if (error) return avisar(mensagemErro(error), 'erro');
      avisar('Usuário desativado.');
      if (botao.dataset.desativar === sessao.vinculo.id) {
        await carregarContexto();
        window.location.hash = '#/inicio';
        return;
      }
      recarregar();
    });
  });

  qsa('[data-reativar]', conteudo).forEach((botao) => {
    botao.addEventListener('click', async () => {
      await comCarregamento(botao, async () => {
        const { error } = await supabase.rpc('definir_membro_ativo', { p_membro: botao.dataset.reativar, p_ativo: true });
        if (error) return avisar(mensagemErro(error), 'erro');
        avisar('Usuário reativado.');
        recarregar();
      });
    });
  });

  qsa('[data-cancelar-convite]', conteudo).forEach((botao) => {
    botao.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: 'Cancelar convite',
        mensagem: `O link enviado para ${botao.dataset.email} deixará de funcionar.`,
        confirmarTexto: 'Cancelar convite',
        perigo: true,
      });
      if (!ok) return;
      const { error } = await supabase.rpc('revogar_convite', { p_convite: botao.dataset.cancelarConvite });
      if (error) return avisar(mensagemErro(error), 'erro');
      avisar('Convite cancelado.');
      recarregar();
    });
  });

  qs('[data-convidar]', conteudo)?.addEventListener('click', () => abrirConvite(empresaId, souProprietario, recarregar));
}

function abrirConvite(empresaId, souProprietario, aoConcluir) {
  const papeis = souProprietario ? PAPEIS_CONVITE : PAPEIS_CONVITE.filter((p) => p !== 'administrador');
  let gerado = false;
  const { corpo } = abrirModal({
    titulo: 'Convidar usuário',
    aoFechar: () => { if (gerado) aoConcluir(); },
    conteudo: html`
      <form class="form" novalidate>
        ${campo({ rotulo: 'E-mail da pessoa', nome: 'email', tipo: 'email', inputmode: 'email', obrigatorio: true, ajuda: 'Ela precisará entrar (ou criar conta) com este mesmo e-mail.' })}
        <div class="campo">
          <label for="campo-papel">Papel</label>
          <select id="campo-papel" name="papel" required>
            ${papeis.map((p) => html`<option value="${p}" ${p === 'tecnico' ? html`selected` : ''}>${NOMES_PAPEIS[p]}</option>`)}
          </select>
        </div>
        <div class="acoes-form">
          <button type="button" class="botao botao-secundario" data-fechar>Cancelar</button>
          <button type="submit" class="botao botao-primario" data-carregando="Gerando…">Gerar link de convite</button>
        </div>
      </form>`,
  });

  const form = qs('form', corpo);
  qs('#campo-email', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const { email, papel } = dadosDoFormulario(form);
    if (!emailValido(email)) return mostrarErroCampo(form, 'email', 'Informe um e-mail válido.');

    await comCarregamento(qs('[type=submit]', form), async () => {
      const { data: token, error } = await supabase.rpc('criar_convite', { p_empresa: empresaId, p_email: email, p_papel: papel });
      if (error) return alertaFormulario(form, mensagemErro(error));
      gerado = true;
      const link = `${window.location.origin}/#/convite?t=${encodeURIComponent(token)}`;
      montar(corpo, html`
        <div class="form">
          <p>Convite criado para <strong>${email}</strong> como ${NOMES_PAPEIS[papel].toLowerCase()}. Ele vale por 7 dias.</p>
          <p class="aviso-inline">O sistema não envia este link automaticamente. Copie e envie para a pessoa por WhatsApp ou e-mail. Por segurança, ele não será exibido de novo.</p>
          <div class="campo">
            <label for="link-convite">Link do convite</label>
            <div class="campo-copiar">
              <input id="link-convite" type="text" readonly value="${link}" />
              <button type="button" class="botao botao-secundario" data-copiar>${ic('copy')}Copiar</button>
            </div>
          </div>
          <div class="acoes-form"><button type="button" class="botao botao-primario" data-fechar>Concluir</button></div>
        </div>`);
      const input = qs('#link-convite', corpo);
      input.addEventListener('focus', () => input.select());
      qs('[data-copiar]', corpo).addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link);
          avisar('Link copiado.');
        } catch {
          input.select();
          avisar('Não foi possível copiar automaticamente. O link está selecionado: use Ctrl+C.', 'erro');
        }
      });
    });
  });
}

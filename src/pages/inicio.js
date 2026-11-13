import { html, montar, ic } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { mensagemErro } from '../lib/erros.js';
import { sessao, empresaAtual, situacaoEmpresa, pode, NOMES_PAPEIS } from '../lib/sessao.js';
import { formatarData } from '../lib/validacao.js';

// Itens do cadastro que deixam os documentos da oficina completos.
function pendenciasCadastro(e) {
  return [
    { feito: Boolean(e.logo_path), texto: 'Enviar o logotipo' },
    { feito: Boolean(e.documento), texto: 'Informar CNPJ ou CPF' },
    { feito: Boolean(e.logradouro && e.cidade), texto: 'Preencher o endereço' },
    { feito: Boolean(e.whatsapp || e.telefone), texto: 'Informar telefone ou WhatsApp' },
    { feito: Boolean(e.texto_garantia), texto: 'Escrever as condições de garantia' },
  ];
}

export async function render(conteudo) {
  const base = empresaAtual();
  montar(conteudo, html`<p class="carregando">Carregando…</p>`);

  const [empresaR, resumoR] = await Promise.all([
    supabase.from('empresas')
      .select('id, nome_fantasia, status, avaliacao_termina_em, logo_path, documento, logradouro, cidade, whatsapp, telefone, texto_garantia')
      .eq('id', base.id).single(),
    supabase.rpc('resumo_empresa', { p_empresa: base.id }),
  ]);
  if (empresaR.error || resumoR.error) {
    montar(conteudo, html`<div class="form-alerta" role="alert">${mensagemErro(empresaR.error || resumoR.error)}</div>`);
    return;
  }

  const empresa = empresaR.data;
  const resumo = resumoR.data?.[0];
  const situacao = situacaoEmpresa(empresa);
  const pendencias = pendenciasCadastro(empresa);
  const concluidos = pendencias.filter((p) => p.feito).length;
  const primeiroNome = (sessao.perfil?.nome || '').split(' ')[0];

  montar(conteudo, html`
    <header class="pagina-cabecalho">
      <h1>${primeiroNome ? `Olá, ${primeiroNome}` : 'Início'}</h1>
      <p>Você está na ${empresa.nome_fantasia} como ${NOMES_PAPEIS[sessao.vinculo.papel].toLowerCase()}.</p>
    </header>

    <div class="grade-inicio">
      <section class="painel" aria-labelledby="titulo-conta">
        <h2 id="titulo-conta">Conta da oficina</h2>
        <dl class="lista-dados">
          <div><dt>Situação</dt><dd>${situacao.codigo === 'avaliacao'
            ? html`<span class="led led-atencao"></span>Em avaliação até ${formatarData(empresa.avaliacao_termina_em)}`
            : html`<span class="led led-ok"></span>Ativa`}</dd></div>
          <div><dt>Plano</dt><dd>${resumo?.plano_nome ?? '—'}</dd></div>
          <div><dt>Usuários</dt><dd>${resumo ? `${resumo.vagas_ocupadas} de ${resumo.max_usuarios} vagas ocupadas (${resumo.membros_ativos} ativos)` : '—'}</dd></div>
          <div><dt>Armazenamento do plano</dt><dd>${resumo ? `${(resumo.armazenamento_mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB` : '—'}</dd></div>
        </dl>
        ${situacao.codigo === 'avaliacao' && situacao.diasRestantes <= 5
          ? html`<p class="aviso-inline">Faltam ${situacao.diasRestantes} ${situacao.diasRestantes === 1 ? 'dia' : 'dias'} para o fim da avaliação. Fale com a RendaPrática para contratar um plano.</p>`
          : ''}
      </section>

      <section class="painel" aria-labelledby="titulo-cadastro">
        <h2 id="titulo-cadastro">Cadastro para documentos</h2>
        <p class="painel-sub">${concluidos} de ${pendencias.length} itens preenchidos. Esses dados aparecem nas OS, orçamentos, recibos e termos de garantia.</p>
        <ul class="checklist">
          ${pendencias.map((p) => html`<li class="${p.feito ? 'feito' : ''}">${ic(p.feito ? 'circle-check' : 'circle')}<span>${p.texto}</span></li>`)}
        </ul>
        ${pode('empresa', 'editar') && concluidos < pendencias.length
          ? html`<a class="botao botao-secundario" href="#/configuracoes/oficina">Completar cadastro</a>`
          : ''}
      </section>
    </div>
  `);
}

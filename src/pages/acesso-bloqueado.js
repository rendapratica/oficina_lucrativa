import { html, qs } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { sessao, empresaAtual, situacaoEmpresa, selecionarEmpresa } from '../lib/sessao.js';
import { navegar } from '../lib/roteador.js';
import { telaAcesso } from '../ui/tela-acesso.js';

const MOTIVOS = {
  avaliacao_encerrada: 'O período de avaliação desta oficina terminou. Para continuar usando o sistema, contrate um plano com a RendaPrática. Seus dados continuam guardados.',
  suspensa: 'O acesso desta oficina está suspenso. Fale com a RendaPrática para regularizar a conta. Seus dados continuam guardados.',
  cancelada: 'Esta oficina foi cancelada. Fale com a RendaPrática se precisar dos dados.',
};

export function render(raiz) {
  const empresa = empresaAtual();
  const situacao = situacaoEmpresa(empresa);
  if (situacao.operante) {
    navegar('/inicio', { substituir: true });
    return;
  }
  const outras = sessao.vinculos.filter((v) => v.empresa_id !== empresa?.id && situacaoEmpresa(v.empresa).operante);

  const corpo = telaAcesso(raiz, {
    titulo: empresa?.nome_fantasia ?? 'Acesso bloqueado',
    conteudo: html`
      <p class="form-alerta" role="alert">${MOTIVOS[situacao.codigo] ?? 'O acesso desta oficina está bloqueado.'}</p>
      ${outras.length
        ? html`<div class="campo"><label for="outra-oficina">Entrar em outra oficina</label>
            <select id="outra-oficina">${outras.map((v) => html`<option value="${v.empresa_id}">${v.empresa.nome_fantasia}</option>`)}</select></div>
            <button type="button" class="botao botao-primario botao-bloco" data-trocar>Abrir oficina</button>`
        : ''}
      <button type="button" class="botao botao-secundario botao-bloco" data-sair>Sair</button>`,
  });

  qs('[data-trocar]', corpo)?.addEventListener('click', async () => {
    await selecionarEmpresa(qs('#outra-oficina', corpo).value);
    navegar('/inicio', { substituir: true });
  });
  qs('[data-sair]', corpo).addEventListener('click', () => supabase.auth.signOut());
}

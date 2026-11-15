const Ordens={
  STATUS:['Recebido','Diagnóstico','Orçamento','Aguardando aprovação','Aguardando peças','Em reparo','Em testes','Pronto','Entregue','Sem conserto','Cancelado'],
  ENCERRADOS:['Pronto','Entregue','Sem conserto','Cancelado'],
  R:v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
  hoje(){const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)},
  total(pecas,mao,desc){const bruto=pecas.reduce((s,p)=>s+p.qtd*p.valor,0)+(+mao||0);return{bruto,total:Math.max(0,bruto-(+desc||0))}},
  async proximoNumero(){
    const c=(await DB.obter('configuracoes','contador-os'))||{id:'contador-os',n:0};c.n++;await DB.salvar('configuracoes',c);
    return'OS-'+String(c.n).padStart(4,'0');
  },
  async render(el){
    el.innerHTML=`<div class="barra"><input id="busca" type="search" placeholder="Pesquisar nº, cliente ou equipamento"><select id="st"><option value="">Todos os status</option>${this.STATUS.map(s=>`<option>${s}</option>`).join('')}</select><button id="novo">Nova OS</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),busca=el.querySelector('#busca'),st=el.querySelector('#st');
    const desenhar=async()=>{
      const q=UI.norm(busca.value),cl=Object.fromEntries((await DB.todos('clientes')).map(c=>[c.id,c.nome])),
        eq=Object.fromEntries((await DB.todos('equipamentos')).map(e=>[e.id,Equipamentos.nome(e)])),todos=await DB.todos('ordens');
      const ls=todos.filter(o=>(!st.value||o.status===st.value)&&(!q||UI.norm([o.numero,cl[o.clienteId],eq[o.equipamentoId]].join(' ')).includes(q))).sort((a,b)=>b.numero.localeCompare(a.numero));
      lista.innerHTML=UI.tabela(['OS','Cliente / equipamento','Status','Prazo','Total',''],ls.map(o=>{
        const atrasada=o.prazo&&o.prazo<this.hoje()&&!this.ENCERRADOS.includes(o.status);
        return[`<b>${UI.h(o.numero)}</b><br><small>${new Date(o.entrada+'T12:00').toLocaleDateString('pt-BR')}</small>`,`${UI.h(cl[o.clienteId]||'—')}<br><small>${UI.h(eq[o.equipamentoId]||'')}</small>`,
          `<select data-st data-id="${o.id}" aria-label="Status">${this.STATUS.map(s=>`<option${s===o.status?' selected':''}>${s}</option>`).join('')}</select>`,
          o.prazo?`<span class="${atrasada?'atraso':''}">${new Date(o.prazo+'T12:00').toLocaleDateString('pt-BR')}${atrasada?' (atrasada)':''}</span>`:'—',this.R(o.total),
          `<div class="acoes"><button class="sec peq" data-a="ed" data-id="${o.id}">Editar</button><button class="sec peq" data-a="hi" data-id="${o.id}">Histórico</button><button class="peq risco" data-a="ex" data-id="${o.id}">Excluir</button></div>`]}),
        todos.length?'Nenhuma OS encontrada.':'Nenhuma ordem de serviço ainda. Clique em "Nova OS".');
    };
    busca.oninput=st.onchange=desenhar;
    el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onchange=async e=>{
      if(!e.target.dataset.st)return;const o=await DB.obter('ordens',e.target.dataset.id);
      await this.mudarStatus(o,e.target.value);App.toast('Status atualizado.');desenhar();
    };
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const o=await DB.obter('ordens',b.dataset.id);if(!o)return;
      if(b.dataset.a==='ed')this.editar(o,desenhar);
      if(b.dataset.a==='hi')UI.info('Histórico — '+o.numero,UI.tabela(['Data','Alteração'],[...(o.hist||[])].reverse().map(h=>[new Date(h.em).toLocaleString('pt-BR'),UI.h(h.texto)]),'Sem registros.'));
      if(b.dataset.a==='ex')this.excluir(o,desenhar);
    };
    desenhar();
  },
  async mudarStatus(o,novo){
    if(o.status===novo)return;
    (o.hist=o.hist||[]).push({em:new Date().toISOString(),texto:`Status: ${o.status} → ${novo}`});o.status=novo;
    await DB.salvar('ordens',o);await DB.registrarHistorico('status da OS',`${o.numero}: ${novo}`);
  },
  async editar(o,depois){
    const clientes=(await DB.todos('clientes')).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),todosEq=await DB.todos('equipamentos');
    if(!clientes.length){App.toast('Cadastre um cliente e um equipamento antes de abrir uma OS.',true);return}
    const clienteIni=o.clienteId||clientes[0].id,opcoesEq=cid=>{const l=todosEq.filter(e=>e.clienteId===cid);return l.length?l.map(e=>[e.id,Equipamentos.nome(e)]):[['','Este cliente não tem equipamentos']]};
    const original=o.fotos||[];let fotos=[];for(const id of original){const i=await DB.obter('imagens',id);if(i)fotos.push(i)}
    let pecas=(o.pecas||[]).map(p=>({...p}));
    const T=(k,l,w)=>({k,l,t:'textarea',wide:1});
    const campos=[{k:'clienteId',l:'Cliente',t:'select',req:1,opts:clientes.map(c=>[c.id,c.nome])},{k:'equipamentoId',l:'Equipamento',t:'select',req:1,opts:opcoesEq(clienteIni)},
      {k:'status',l:'Status',t:'select',opts:this.STATUS.map(s=>[s,s])},{k:'tecnico',l:'Técnico'},{k:'entrada',l:'Data de entrada',type:'date',req:1},{k:'prazo',l:'Prazo',type:'date'},
      T('defeito','Defeito relatado'),T('diagnostico','Diagnóstico'),T('componentes','Componentes danificados'),T('testes','Testes realizados'),T('medicoes','Medições'),T('servicos','Serviços executados'),
      {k:'maoObra',l:'Mão de obra (R$)',type:'number'},{k:'desconto',l:'Desconto (R$)',type:'number'}];
    const v={status:'Recebido',entrada:this.hoje(),maoObra:'',desconto:'',...o,clienteId:clienteIni};
    UI.form(o.id?'Editar '+o.numero:'Nova ordem de serviço',campos,v,async r=>{
      const ps=[...document.querySelectorAll('#pecas .peca')].map(d=>{const i=d.querySelectorAll('input');return{nome:i[0].value.trim(),qtd:+i[1].value,valor:+i[2].value}}).filter(p=>p.nome);
      if(ps.some(p=>!(p.qtd>0)||p.valor<0))throw new Error('Peças: informe quantidade maior que zero e valor válido.');
      if(r.prazo&&r.prazo<r.entrada)throw new Error('O prazo não pode ser anterior à data de entrada.');
      const mao=+r.maoObra||0,desc=+r.desconto||0;if(mao<0||desc<0)throw new Error('Valores não podem ser negativos.');
      const t=this.total(ps,mao,desc);if(desc>t.bruto)throw new Error('O desconto não pode ser maior que o valor bruto.');
      const ids=[];for(const f of fotos){if(!f.id)await DB.salvar('imagens',f);ids.push(f.id)}
      for(const id of original)if(!ids.includes(id))await DB.remover('imagens',id);
      const novo=!o.id,reg={...o,...r,maoObra:mao,desconto:desc,pecas:ps,fotos:ids,total:t.total,hist:o.hist||[]};
      if(novo){reg.numero=await this.proximoNumero();reg.hist.push({em:new Date().toISOString(),texto:'OS criada com status '+r.status})}
      else if(o.status!==r.status)reg.hist.push({em:new Date().toISOString(),texto:`Status: ${o.status} → ${r.status}`});
      await DB.salvar('ordens',reg);await DB.registrarHistorico(novo?'OS criada':'OS editada',reg.numero);App.toast('OS salva: '+reg.numero);depois();
    },x=>{
      x.innerHTML=`<label>Peças utilizadas</label><div id="pecas"></div><button type="button" class="sec peq" id="addPeca" style="margin-top:8px">+ Adicionar peça</button><div class="total-os" id="totalOs"></div><div id="fotosBox" style="margin-top:12px"></div>`;
      const calc=()=>{const ps=[...x.querySelectorAll('.peca')].map(d=>{const i=d.querySelectorAll('input');return{qtd:+i[1].value||0,valor:+i[2].value||0}});
        x.querySelector('#totalOs').textContent='Total: '+this.R(this.total(ps,document.getElementById('f_maoObra').value,document.getElementById('f_desconto').value).total)};
      const linha=p=>{const d=document.createElement('div');d.className='peca';
        d.innerHTML=`<input placeholder="Peça" value="${UI.h(p.nome)}"><input type="number" min="0" step="1" value="${p.qtd}" aria-label="Quantidade"><input type="number" min="0" step="0.01" value="${p.valor}" aria-label="Valor unitário"><button type="button" class="sec peq" aria-label="Remover peça">×</button>`;
        d.querySelector('button').onclick=()=>{d.remove();calc()};d.oninput=calc;x.querySelector('#pecas').appendChild(d)};
      pecas.forEach(linha);x.querySelector('#addPeca').onclick=()=>{linha({nome:'',qtd:1,valor:0});calc()};
      ['f_maoObra','f_desconto'].forEach(i=>document.getElementById(i).oninput=calc);calc();UI.fotos(x.querySelector('#fotosBox'),fotos);
      const sc=document.getElementById('f_clienteId'),se=document.getElementById('f_equipamentoId');
      if(o.equipamentoId)se.value=o.equipamentoId;
      sc.onchange=()=>{se.innerHTML=opcoesEq(sc.value).map(([a,b])=>`<option value="${UI.h(a)}">${UI.h(b)}</option>`).join('')};
      se.onchange=()=>{const e=todosEq.find(q=>q.id===se.value),d=document.getElementById('f_defeito');if(e&&!d.value)d.value=e.defeito||''};
      if(!o.id)se.onchange();
    });
  },
  async excluir(o,depois){
    if(!await App.confirmar(`Excluir a ${o.numero} e suas fotos? Esta ação não pode ser desfeita.`))return;
    for(const id of o.fotos||[])await DB.remover('imagens',id);
    await DB.remover('ordens',o.id);await DB.registrarHistorico('OS excluída',o.numero);App.toast('OS excluída.');depois();
  }
};

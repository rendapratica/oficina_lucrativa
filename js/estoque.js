const Estoque={
  async saldos(){const s={};(await DB.todos('estoque')).forEach(m=>s[m.componenteId]=(s[m.componenteId]||0)+m.delta);return s},
  mover(componenteId,delta,tipo,motivo,extra){return DB.salvar('estoque',{componenteId,delta,tipo,motivo,data:new Date().toISOString(),...extra})},
  soma(ps){const r={};(ps||[]).filter(p=>p.componenteId).forEach(p=>r[p.componenteId]=(r[p.componenteId]||0)+p.qtd);return r},
  async validarOS(novas,antigas){
    const n=this.soma(novas),a=this.soma(antigas),s=await this.saldos();
    for(const id of Object.keys(n)){const falta=n[id]-(a[id]||0);if(falta>0&&(s[id]||0)<falta){const c=await DB.obter('componentes',id);throw new Error(`Estoque insuficiente de "${c?c.nome:'peça'}": disponível ${s[id]||0}, necessário ${falta}.`)}}
  },
  async aplicarOS(os,antigas,prefixo=''){
    const n=this.soma(os.pecas),a=this.soma(antigas);
    for(const id of new Set([...Object.keys(n),...Object.keys(a)])){const d=(n[id]||0)-(a[id]||0);if(d)await this.mover(id,-d,d>0?'saída':'entrada',prefixo+os.numero,{ordemId:os.id})}
  },
  estornarOS(os){return this.aplicarOS({...os,pecas:[]},os.pecas,'Estorno ')},
  async render(el){
    el.innerHTML=`<div class="barra"><input id="busca" type="search" placeholder="Pesquisar componente ou código"><select id="fil"><option value="">Todos</option><option value="b">Estoque baixo</option></select><button id="novo">Novo componente</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),busca=el.querySelector('#busca'),fil=el.querySelector('#fil');
    const desenhar=async()=>{
      const q=UI.norm(busca.value),s=await this.saldos(),todos=(await DB.todos('componentes')).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      const ls=todos.filter(c=>(!fil.value||(s[c.id]||0)<=(+c.minimo||0))&&(!q||UI.norm(c.nome+' '+c.codigo).includes(q)));
      lista.innerHTML=UI.tabela(['Componente','Saldo','Mínimo','Custo','Venda',''],ls.map(c=>{const sd=s[c.id]||0,baixo=sd<=(+c.minimo||0);
        return[`<b>${UI.h(c.nome)}</b><br><small>${UI.h(c.codigo)}</small>`,`<span class="${baixo?'atraso':''}">${sd} ${UI.h(c.unidade||'un')}${baixo?' (baixo)':''}</span>`,c.minimo||0,Ordens.R(c.custo),Ordens.R(c.preco),
        `<div class="acoes"><button class="peq" data-a="entrada" data-id="${c.id}">Entrada</button><button class="sec peq" data-a="saída" data-id="${c.id}">Saída</button><button class="sec peq" data-a="ajuste" data-id="${c.id}">Ajuste</button><button class="sec peq" data-a="ed" data-id="${c.id}">Editar</button><button class="sec peq" data-a="hi" data-id="${c.id}">Histórico</button><button class="peq risco" data-a="ex" data-id="${c.id}">Excluir</button></div>`]}),
        todos.length?'Nenhum componente encontrado.':'Nenhum componente cadastrado. Clique em "Novo componente".');
    };
    busca.oninput=fil.onchange=desenhar;el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const c=await DB.obter('componentes',b.dataset.id);if(!c)return;const a=b.dataset.a;
      if(a==='ed')this.editar(c,desenhar);else if(a==='hi')this.historico(c);else if(a==='ex')this.excluir(c,desenhar);else this.movimento(c,a,desenhar);
    };
    desenhar();
  },
  editar(c,depois){
    const campos=[{k:'nome',l:'Componente',req:1,wide:1},{k:'codigo',l:'Código / referência'},{k:'unidade',l:'Unidade',list:['un','m','kg','pç']},{k:'minimo',l:'Estoque mínimo',type:'number'},{k:'custo',l:'Custo unitário (R$)',type:'number'},{k:'preco',l:'Preço de venda (R$)',type:'number'}];
    UI.form(c.id?'Editar componente':'Novo componente',campos,{unidade:'un',...c},async r=>{
      if((await DB.todos('componentes')).some(x=>x.id!==c.id&&UI.norm(x.nome)===UI.norm(r.nome)))throw new Error('Já existe um componente com este nome.');
      await DB.salvar('componentes',{...c,...r,minimo:+r.minimo||0,custo:+r.custo||0,preco:+r.preco||0});App.toast('Componente salvo.');depois();
    });
  },
  async movimento(c,tipo,depois){
    const sd=(await this.saldos())[c.id]||0,T={entrada:'Entrada',saída:'Saída',ajuste:'Ajuste (contagem)'}[tipo];
    const campos=[{k:'qtd',l:tipo==='ajuste'?'Saldo contado':'Quantidade',type:'number',req:1,wide:tipo!=='entrada'}];
    if(tipo==='entrada')campos.push({k:'custo',l:'Custo unitário (R$)',type:'number'},{k:'despesa',l:'Lançar como despesa?',t:'select',opts:[['','Não'],['1','Sim']]});
    campos.push({k:'obs',l:'Observação',wide:1});
    UI.form(`${T} — ${c.nome} (saldo ${sd})`,campos,{custo:c.custo||''},async r=>{
      const q=+r.qtd;let d=q;
      if(tipo==='ajuste')d=q-sd;else if(!(q>0))throw new Error('Informe uma quantidade maior que zero.');
      if(tipo==='saída'){if(q>sd)throw new Error('Saída maior que o saldo disponível.');d=-q}
      if(tipo==='ajuste'&&d===0)throw new Error('O saldo contado é igual ao atual.');
      await this.mover(c.id,d,tipo,r.obs||T);
      if(tipo==='entrada'&&+r.custo>0){c.custo=+r.custo;await DB.salvar('componentes',c);
        if(r.despesa==='1')await DB.salvar('despesas',{descricao:'Compra: '+c.nome,categoria:'Peças',valor:q*(+r.custo),vencimento:Ordens.hoje(),pago:true,dataPagamento:Ordens.hoje(),forma:''})}
      App.toast('Movimento registrado.');depois();
    });
  },
  async historico(c){
    const m=(await DB.todos('estoque')).filter(x=>x.componenteId===c.id).sort((a,b)=>b.data.localeCompare(a.data));
    UI.info('Histórico — '+c.nome,UI.tabela(['Data','Tipo','Qtd','Motivo'],m.map(x=>[new Date(x.data).toLocaleString('pt-BR'),x.tipo,(x.delta>0?'+':'')+x.delta,UI.h(x.motivo)]),'Sem movimentos.'));
  },
  async excluir(c,depois){
    const m=(await DB.todos('estoque')).filter(x=>x.componenteId===c.id);
    if(m.some(x=>x.ordemId)){App.toast('Este componente foi usado em ordens de serviço e não pode ser excluído.',true);return}
    if(!await App.confirmar(`Excluir "${c.nome}" e seus ${m.length} movimento(s)?`))return;
    for(const x of m)await DB.remover('estoque',x.id);await DB.remover('componentes',c.id);App.toast('Componente excluído.');depois();
  }
};

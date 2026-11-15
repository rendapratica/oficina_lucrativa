const Garantias={
  DIAS:90,
  add(dataISO,dias){const d=new Date(dataISO+'T12:00');d.setDate(d.getDate()+dias);return d.toISOString().slice(0,10)},
  situacao(g){const h=Ordens.hoje();if(g.vencimento<h)return['Vencida','atraso'];const n=Math.round((new Date(g.vencimento)-new Date(h))/864e5);return[n<=7?`Vence em ${n} dia(s)`:'Vigente',n<=7?'atraso':'']},
  async criarPara(os){
    if((await DB.todos('garantias')).some(g=>g.ordemId===os.id))return;
    const i=Ordens.hoje();await DB.salvar('garantias',{ordemId:os.id,inicio:i,dias:this.DIAS,vencimento:this.add(i,this.DIAS),retornos:[]});
  },
  async render(el){
    el.innerHTML=`<div class="barra"><select id="fil"><option value="">Todas</option><option value="v">Vigentes</option><option value="x">Vencidas</option></select><button id="novo">Nova garantia</button></div><div class="aviso">Ao marcar uma OS como "Entregue", a garantia é criada automaticamente com ${this.DIAS} dias (ajustável aqui).</div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),fil=el.querySelector('#fil');
    const desenhar=async()=>{
      const os=Object.fromEntries((await DB.todos('ordens')).map(o=>[o.id,o])),cl=Object.fromEntries((await DB.todos('clientes')).map(c=>[c.id,c.nome])),h=Ordens.hoje();
      const todos=(await DB.todos('garantias')).sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
      const ls=todos.filter(g=>!fil.value||(fil.value==='v')===(g.vencimento>=h));
      lista.innerHTML=UI.tabela(['OS / cliente','Início','Vencimento','Situação',''],ls.map(g=>{const o=os[g.ordemId]||{},[s,c]=this.situacao(g);
        return[`<b>${UI.h(o.numero)}</b><br><small>${UI.h(cl[o.clienteId]||'')}</small>`,Documentos.data(g.inicio),Documentos.data(g.vencimento),`<span class="${c}">${s}</span>`,
        `<div class="acoes"><button class="sec peq" data-a="ret" data-id="${g.id}">Registrar retorno</button><button class="sec peq" data-a="hi" data-id="${g.id}">Histórico</button><button class="sec peq" data-a="pdf" data-id="${g.id}">Termo PDF</button><button class="sec peq" data-a="ed" data-id="${g.id}">Editar</button><button class="peq risco" data-a="ex" data-id="${g.id}">Excluir</button></div>`]}),'Nenhuma garantia registrada.');
    };
    fil.onchange=desenhar;el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const g=await DB.obter('garantias',b.dataset.id);if(!g)return;const a=b.dataset.a;
      if(a==='ed')this.editar(g,desenhar);
      if(a==='pdf'){const o=await DB.obter('ordens',g.ordemId);if(o)Documentos.executar('garantia',o,{dias:g.dias},false)}
      if(a==='hi')UI.info('Histórico da garantia',`<p>Vigência: ${Documentos.data(g.inicio)} a ${Documentos.data(g.vencimento)} (${g.dias} dias).</p>`+UI.tabela(['Data','Retorno'],(g.retornos||[]).map(r=>[Documentos.data(r.data),UI.h(r.obs)]),'Nenhum retorno registrado.'));
      if(a==='ret')UI.form('Registrar retorno em garantia',[{k:'data',l:'Data',type:'date',req:1},{k:'obs',l:'O que aconteceu',t:'textarea',req:1,wide:1}],{data:Ordens.hoje()},async r=>{
        (g.retornos=g.retornos||[]).push(r);await DB.salvar('garantias',g);App.toast('Retorno registrado.');desenhar()});
      if(a==='ex'&&await App.confirmar('Excluir esta garantia e seu histórico?')){await DB.remover('garantias',g.id);App.toast('Garantia excluída.');desenhar()}
    };
    desenhar();
  },
  async editar(g,depois){
    const os=await DB.todos('ordens');if(!os.length){App.toast('Cadastre uma OS antes.',true);return}
    UI.form(g.id?'Editar garantia':'Nova garantia',[{k:'ordemId',l:'OS',t:'select',req:1,opts:os.map(o=>[o.id,o.numero])},{k:'inicio',l:'Início',type:'date',req:1},{k:'dias',l:'Prazo (dias)',type:'number',req:1}],{inicio:Ordens.hoje(),dias:this.DIAS,...g},async r=>{
      const d=Math.round(+r.dias);if(!(d>0))throw new Error('Informe o prazo em dias.');
      await DB.salvar('garantias',{retornos:[],...g,...r,dias:d,vencimento:this.add(r.inicio,d)});App.toast('Garantia salva.');depois()});
    if(g.ordemId)document.getElementById('f_ordemId').value=g.ordemId;
  }
};

const Agenda={
  TIPOS:['Atendimento na oficina','Serviço externo','Retirada de equipamento','Entrega de equipamento'],
  STATUS:['Agendado','Concluído','Cancelado'],
  async render(el){
    el.innerHTML=`<div class="barra"><select id="per"><option value="p">Próximos (a partir de hoje)</option><option value="h">Somente hoje</option><option value="7">Próximos 7 dias</option><option value="">Todos</option></select><select id="st"><option value="">Todos os status</option>${this.STATUS.map(s=>`<option>${s}</option>`).join('')}</select><button id="novo">Novo agendamento</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),per=el.querySelector('#per'),st=el.querySelector('#st');
    const desenhar=async()=>{
      const h=Ordens.hoje(),fim=Garantias.add(h,7),cl=Object.fromEntries((await DB.todos('clientes')).map(c=>[c.id,c.nome]));
      const ls=(await DB.todos('agendamentos')).filter(a=>(!st.value||a.status===st.value)&&(per.value===''||(per.value==='p'&&a.data>=h)||(per.value==='h'&&a.data===h)||(per.value==='7'&&a.data>=h&&a.data<=fim))).sort((a,b)=>(a.data+(a.hora||'')).localeCompare(b.data+(b.hora||'')));
      lista.innerHTML=UI.tabela(['Data / hora','Atendimento','Cliente / local','Status',''],ls.map(a=>{const atr=a.status==='Agendado'&&a.data<h;
        return[`<b class="${atr?'atraso':''}">${Documentos.data(a.data)}${a.data===h?' (hoje)':''}</b><br><small>${UI.h(a.hora)}</small>`,`<b>${UI.h(a.titulo)}</b><br><small>${UI.h(a.tipo)}</small>`,`${UI.h(cl[a.clienteId]||'')}<br><small>${UI.h(a.local)}</small>`,
        `<select data-st data-id="${a.id}" aria-label="Status">${this.STATUS.map(s=>`<option${s===a.status?' selected':''}>${s}</option>`).join('')}</select>${atr?'<br><small class="atraso">atrasado</small>':''}`,
        `<div class="acoes"><button class="sec peq" data-a="ed" data-id="${a.id}">Editar</button><button class="peq risco" data-a="ex" data-id="${a.id}">Excluir</button></div>`]}),'Nenhum agendamento neste filtro.');
    };
    per.onchange=st.onchange=desenhar;el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onchange=async e=>{if(!e.target.dataset.st)return;const a=await DB.obter('agendamentos',e.target.dataset.id);a.status=e.target.value;await DB.salvar('agendamentos',a);App.toast('Status atualizado.');desenhar()};
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const a=await DB.obter('agendamentos',b.dataset.id);if(!a)return;
      if(b.dataset.a==='ed')this.editar(a,desenhar);
      if(b.dataset.a==='ex'&&await App.confirmar('Excluir este agendamento?')){await DB.remover('agendamentos',a.id);App.toast('Agendamento excluído.');desenhar()}
    };
    desenhar();
  },
  async editar(a,depois){
    const cl=(await DB.todos('clientes')).sort((x,y)=>x.nome.localeCompare(y.nome,'pt-BR')),os=await DB.todos('ordens');
    UI.form(a.id?'Editar agendamento':'Novo agendamento',[{k:'titulo',l:'Título',req:1,wide:1},{k:'tipo',l:'Tipo',t:'select',opts:this.TIPOS.map(t=>[t,t])},{k:'status',l:'Status',t:'select',opts:this.STATUS.map(t=>[t,t])},
      {k:'data',l:'Data',type:'date',req:1},{k:'hora',l:'Hora',type:'time'},{k:'clienteId',l:'Cliente',t:'select',opts:[['','—'],...cl.map(c=>[c.id,c.nome])]},{k:'ordemId',l:'OS (opcional)',t:'select',opts:[['','—'],...os.map(o=>[o.id,o.numero])]},
      {k:'local',l:'Local / endereço',wide:1},{k:'obs',l:'Observações',t:'textarea',wide:1}],{tipo:this.TIPOS[0],status:'Agendado',data:Ordens.hoje(),...a},async r=>{
      await DB.salvar('agendamentos',{...a,...r});App.toast('Agendamento salvo.');depois()});
    ['clienteId','ordemId'].forEach(k=>{if(a[k])document.getElementById('f_'+k).value=a[k]});
  }
};

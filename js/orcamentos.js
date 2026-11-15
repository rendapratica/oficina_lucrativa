const Orcamentos={
  STATUS:['Pendente','Aprovado','Recusado'],
  async proximoNumero(){const c=(await DB.obter('configuracoes','contador-orc'))||{id:'contador-orc',n:0};c.n++;await DB.salvar('configuracoes',c);return'ORC-'+String(c.n).padStart(4,'0')},
  somaDias(n){const d=new Date(Date.now()+n*864e5);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)},
  async render(el){
    el.innerHTML=`<div class="barra"><input id="busca" type="search" placeholder="Pesquisar nº ou cliente"><select id="st"><option value="">Todos os status</option>${this.STATUS.map(s=>`<option>${s}</option>`).join('')}</select><button id="novo">Novo orçamento</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),busca=el.querySelector('#busca'),st=el.querySelector('#st');
    const desenhar=async()=>{
      const q=UI.norm(busca.value),cl=Object.fromEntries((await DB.todos('clientes')).map(c=>[c.id,c.nome])),todos=await DB.todos('orcamentos');
      const ls=todos.filter(o=>(!st.value||o.status===st.value)&&(!q||UI.norm(o.numero+' '+cl[o.clienteId]).includes(q))).sort((a,b)=>b.numero.localeCompare(a.numero));
      lista.innerHTML=UI.tabela(['Orçamento','Cliente','Status','Validade','Total',''],ls.map(o=>[`<b>${UI.h(o.numero)}</b>`,UI.h(cl[o.clienteId]||'—'),
        `<select data-st data-id="${o.id}" aria-label="Status">${this.STATUS.map(s=>`<option${s===o.status?' selected':''}>${s}</option>`).join('')}</select>`,Documentos.data(o.validade),Ordens.R(o.total),
        `<div class="acoes"><button class="sec peq" data-a="pdf" data-id="${o.id}">PDF</button><button class="sec peq" data-a="zap" data-id="${o.id}">WhatsApp</button><button class="sec peq" data-a="ed" data-id="${o.id}">Editar</button><button class="peq risco" data-a="ex" data-id="${o.id}">Excluir</button></div>`]),
        todos.length?'Nenhum orçamento encontrado.':'Nenhum orçamento ainda. Clique em "Novo orçamento".');
    };
    busca.oninput=st.onchange=desenhar;el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onchange=async e=>{if(!e.target.dataset.st)return;const o=await DB.obter('orcamentos',e.target.dataset.id);o.status=e.target.value;await DB.salvar('orcamentos',o);await DB.registrarHistorico('orçamento',o.numero+': '+o.status);App.toast('Status atualizado.');desenhar()};
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const o=await DB.obter('orcamentos',b.dataset.id);if(!o)return;
      if(b.dataset.a==='ed')this.editar(o,desenhar);
      if(b.dataset.a==='pdf')Documentos.executar('orcamento',o,{},false);
      if(b.dataset.a==='zap')Documentos.executar('orcamento',o,{},true);
      if(b.dataset.a==='ex'&&await App.confirmar(`Excluir o orçamento ${o.numero}? Esta ação não pode ser desfeita.`)){await DB.remover('orcamentos',o.id);await DB.registrarHistorico('orçamento excluído',o.numero);App.toast('Orçamento excluído.');desenhar()}
    };
    desenhar();
  },
  async editar(o,depois){
    const clientes=(await DB.todos('clientes')).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),ordens=await DB.todos('ordens');
    if(!clientes.length){App.toast('Cadastre um cliente antes de criar um orçamento.',true);return}
    const campos=[{k:'clienteId',l:'Cliente',t:'select',req:1,opts:clientes.map(c=>[c.id,c.nome])},{k:'ordemId',l:'OS vinculada (opcional)',t:'select',opts:[['','Nenhuma'],...ordens.map(x=>[x.id,x.numero])]},
      {k:'validade',l:'Validade',type:'date',req:1},{k:'status',l:'Status',t:'select',opts:this.STATUS.map(s=>[s,s])},{k:'maoObra',l:'Mão de obra (R$)',type:'number'},{k:'desconto',l:'Desconto (R$)',type:'number'},{k:'obs',l:'Observações',t:'textarea',wide:1}];
    const v={status:'Pendente',validade:this.somaDias(7),maoObra:'',desconto:'',...o,clienteId:o.clienteId||clientes[0].id};
    UI.form(o.id?'Editar '+o.numero:'Novo orçamento',campos,v,async r=>{
      const it=[...document.querySelectorAll('#itens .peca')].map(d=>{const i=d.querySelectorAll('input');return{nome:i[0].value.trim(),qtd:+i[1].value,valor:+i[2].value}}).filter(p=>p.nome);
      if(!it.length&&!(+r.maoObra>0))throw new Error('Adicione ao menos um item ou mão de obra.');
      if(it.some(p=>!(p.qtd>0)||p.valor<0))throw new Error('Itens: informe quantidade maior que zero e valor válido.');
      const mao=+r.maoObra||0,desc=+r.desconto||0,t=Ordens.total(it,mao,desc);if(mao<0||desc<0||desc>t.bruto)throw new Error('Confira mão de obra e desconto.');
      const novo=!o.id,reg={...o,...r,itens:it,maoObra:mao,desconto:desc,total:t.total};
      if(novo){reg.numero=await this.proximoNumero();reg.emissao=new Date().toISOString()}
      await DB.salvar('orcamentos',reg);await DB.registrarHistorico(novo?'orçamento criado':'orçamento editado',reg.numero);App.toast('Orçamento salvo: '+reg.numero);depois();
    },x=>{
      x.innerHTML=`<label>Itens (peças e serviços)</label><div id="itens"></div><button type="button" class="sec peq" id="addIt" style="margin-top:8px">+ Adicionar item</button><div class="total-os" id="totalOs"></div>`;
      const calc=()=>{const ps=[...x.querySelectorAll('.peca')].map(d=>{const i=d.querySelectorAll('input');return{qtd:+i[1].value||0,valor:+i[2].value||0}});
        x.querySelector('#totalOs').textContent='Total: '+Ordens.R(Ordens.total(ps,document.getElementById('f_maoObra').value,document.getElementById('f_desconto').value).total)};
      const linha=p=>{const d=document.createElement('div');d.className='peca';
        d.innerHTML=`<input placeholder="Descrição" value="${UI.h(p.nome)}"><input type="number" min="0" step="1" value="${p.qtd}" aria-label="Quantidade"><input type="number" min="0" step="0.01" value="${p.valor}" aria-label="Valor unitário"><button type="button" class="sec peq" aria-label="Remover item">×</button>`;
        d.querySelector('button').onclick=()=>{d.remove();calc()};d.oninput=calc;x.querySelector('#itens').appendChild(d)};
      (o.itens||[]).forEach(linha);x.querySelector('#addIt').onclick=()=>{linha({nome:'',qtd:1,valor:0});calc()};
      ['f_maoObra','f_desconto'].forEach(i=>document.getElementById(i).oninput=calc);calc();
      document.getElementById('f_ordemId').onchange=e=>{const s=ordens.find(q=>q.id===e.target.value);if(!s)return;
        document.getElementById('f_clienteId').value=s.clienteId;
        if(!x.querySelector('.peca')){(s.pecas||[]).forEach(linha);document.getElementById('f_maoObra').value=s.maoObra||'';document.getElementById('f_desconto').value=s.desconto||'';calc()}};
      if(o.ordemId)document.getElementById('f_ordemId').value=o.ordemId;
    });
  }
};

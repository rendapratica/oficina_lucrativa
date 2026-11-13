const Clientes={
  async render(el){
    el.innerHTML=`<div class="barra"><input id="busca" type="search" placeholder="Pesquisar por nome, telefone ou documento"><button id="novo">Novo cliente</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),busca=el.querySelector('#busca');
    const desenhar=async()=>{
      const q=UI.norm(busca.value),todos=(await DB.todos('clientes')).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      const ls=todos.filter(c=>!q||UI.norm([c.nome,c.telefone,c.whatsapp,c.documento,c.email].join(' ')).includes(q));
      lista.innerHTML=UI.tabela(['Nome','Tipo','Documento','Telefone',''],ls.map(c=>[`<b>${UI.h(c.nome)}</b>`,c.tipo==='PJ'?'Pessoa jurídica':'Pessoa física',UI.h(c.documento),UI.h(c.telefone||c.whatsapp),
        `<div class="acoes"><button class="sec peq" data-a="ed" data-id="${c.id}">Editar</button><button class="sec peq" data-a="hi" data-id="${c.id}">Histórico</button><button class="peq risco" data-a="ex" data-id="${c.id}">Excluir</button></div>`]),
        todos.length?'Nenhum cliente encontrado.':'Nenhum cliente cadastrado ainda. Clique em "Novo cliente".');
    };
    busca.oninput=desenhar;
    el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const c=await DB.obter('clientes',b.dataset.id);if(!c)return;
      if(b.dataset.a==='ed')this.editar(c,desenhar);
      if(b.dataset.a==='hi')this.historico(c);
      if(b.dataset.a==='ex')this.excluir(c,desenhar);
    };
    desenhar();
  },
  editar(c,depois){
    const campos=[{k:'tipo',l:'Tipo',t:'select',opts:[['PF','Pessoa física'],['PJ','Pessoa jurídica']]},{k:'nome',l:'Nome / razão social',req:1},{k:'documento',l:'CPF/CNPJ'},
      {k:'telefone',l:'Telefone'},{k:'whatsapp',l:'WhatsApp'},{k:'email',l:'E-mail'},{k:'endereco',l:'Endereço',wide:1},{k:'obs',l:'Observações',t:'textarea',wide:1}];
    UI.form(c.id?'Editar cliente':'Novo cliente',campos,{tipo:'PF',...c},async r=>{
      const dig=r.documento.replace(/\D/g,'');
      if(dig&&dig.length!==(r.tipo==='PJ'?14:11))throw new Error(r.tipo==='PJ'?'CNPJ deve ter 14 números.':'CPF deve ter 11 números.');
      if(r.email&&!/^\S+@\S+\.\S+$/.test(r.email))throw new Error('E-mail inválido.');
      if(dig&&(await DB.todos('clientes')).some(x=>x.id!==c.id&&(x.documento||'').replace(/\D/g,'')===dig))throw new Error('Já existe um cliente com este documento.');
      const reg=await DB.salvar('clientes',{...c,...r});
      await DB.registrarHistorico(c.id?'cliente editado':'cliente criado',reg.nome);
      App.toast('Cliente salvo.');depois();
    });
  },
  async historico(c){
    const eqs=(await DB.todos('equipamentos')).filter(e=>e.clienteId===c.id).sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));
    UI.info('Histórico — '+c.nome,`<p class="muted">Cliente desde ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}.</p>`+
      UI.tabela(['Equipamento','Defeito informado','Cadastrado em'],eqs.map(e=>[UI.h([e.tipo,e.marca,e.modelo].filter(Boolean).join(' ')),UI.h(e.defeito),new Date(e.criadoEm).toLocaleDateString('pt-BR')]),'Nenhum equipamento cadastrado para este cliente.'));
  },
  async excluir(c,depois){
    const n=(await DB.todos('equipamentos')).filter(e=>e.clienteId===c.id).length;
    if(n){App.toast(`Não é possível excluir: o cliente tem ${n} equipamento(s). Exclua os equipamentos antes.`,true);return}
    if(!await App.confirmar(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`))return;
    await DB.remover('clientes',c.id);await DB.registrarHistorico('cliente excluído',c.nome);App.toast('Cliente excluído.');depois();
  }
};

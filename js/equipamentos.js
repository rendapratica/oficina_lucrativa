const Equipamentos={
  PADRAO:['Televisão','Som e áudio','Micro-ondas','Máquina de lavar','Geladeira','Placa eletrônica','Computador','Celular','Outros'],
  async categorias(){const c=await DB.obter('configuracoes','categorias');return[...new Set([...this.PADRAO,...(c?c.lista:[])])]},
  async salvarCategoria(nome){
    if(!nome||(await this.categorias()).some(x=>UI.norm(x)===UI.norm(nome)))return;
    const c=(await DB.obter('configuracoes','categorias'))||{id:'categorias',lista:[]};c.lista.push(nome);await DB.salvar('configuracoes',c);
  },
  nome(e){return[e.tipo,e.marca,e.modelo].filter(Boolean).join(' ')},
  async render(el){
    const cats=await this.categorias();
    el.innerHTML=`<div class="barra"><input id="busca" type="search" placeholder="Pesquisar marca, modelo, série ou cliente"><select id="cat"><option value="">Todas as categorias</option>${cats.map(c=>`<option>${UI.h(c)}</option>`).join('')}</select><button id="novo">Novo equipamento</button></div><div id="lista"></div>`;
    const lista=el.querySelector('#lista'),busca=el.querySelector('#busca'),cat=el.querySelector('#cat');
    const desenhar=async()=>{
      const q=UI.norm(busca.value),cl=Object.fromEntries((await DB.todos('clientes')).map(c=>[c.id,c.nome])),todos=await DB.todos('equipamentos');
      const ls=todos.filter(e=>(!cat.value||e.tipo===cat.value)&&(!q||UI.norm([e.tipo,e.marca,e.modelo,e.serie,cl[e.clienteId]].join(' ')).includes(q))).sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));
      lista.innerHTML=UI.tabela(['Equipamento','Cliente','Série','Fotos',''],ls.map(e=>[`<b>${UI.h(this.nome(e))}</b><br><small>${UI.h(e.defeito)}</small>`,UI.h(cl[e.clienteId]||'—'),UI.h(e.serie),(e.fotos||[]).length,
        `<div class="acoes"><button class="sec peq" data-a="ed" data-id="${e.id}">Editar</button><button class="peq risco" data-a="ex" data-id="${e.id}">Excluir</button></div>`]),
        todos.length?'Nenhum equipamento encontrado.':'Nenhum equipamento cadastrado ainda.');
    };
    busca.oninput=cat.onchange=desenhar;
    el.querySelector('#novo').onclick=()=>this.editar({},desenhar);
    lista.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const q=await DB.obter('equipamentos',b.dataset.id);if(!q)return;
      if(b.dataset.a==='ed')this.editar(q,desenhar);
      if(b.dataset.a==='ex')this.excluir(q,desenhar);
    };
    desenhar();
  },
  async editar(e,depois){
    const clientes=(await DB.todos('clientes')).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    if(!clientes.length){App.toast('Cadastre um cliente antes de cadastrar equipamentos.',true);return}
    const cats=await this.categorias(),original=e.fotos||[];let fotos=[];
    for(const id of original){const i=await DB.obter('imagens',id);if(i)fotos.push(i)}
    const campos=[{k:'clienteId',l:'Cliente',t:'select',req:1,wide:1,opts:clientes.map(c=>[c.id,c.nome])},{k:'tipo',l:'Tipo / categoria',req:1,list:cats},{k:'marca',l:'Marca'},{k:'modelo',l:'Modelo'},{k:'serie',l:'Número de série'},
      {k:'voltagem',l:'Voltagem'},{k:'potencia',l:'Potência'},{k:'defeito',l:'Defeito informado',t:'textarea',wide:1},{k:'condicoes',l:'Condições físicas',t:'textarea',wide:1},
      {k:'acessorios',l:'Acessórios',wide:1},{k:'obs',l:'Observações',t:'textarea',wide:1}];
    UI.form(e.id?'Editar equipamento':'Novo equipamento',campos,{clienteId:clientes[0].id,...e},async r=>{
      const eq={...(e.id?e:{id:DB.uuid(),criadoEm:new Date().toISOString()}),...r},ids=[];
      for(const f of fotos){if(!f.id)await DB.salvar('imagens',f);ids.push(f.id)}
      for(const id of original)if(!ids.includes(id))await DB.remover('imagens',id);
      eq.fotos=ids;await this.salvarCategoria(r.tipo);await DB.salvar('equipamentos',eq);
      await DB.registrarHistorico(e.id?'equipamento editado':'equipamento criado',this.nome(eq));App.toast('Equipamento salvo.');depois();
    },x=>{
      const desenhar=()=>{x.innerHTML=`<label for="arqFotos">Fotografias</label><input type="file" id="arqFotos" accept="image/*" multiple><div class="fotos">${fotos.map((f,i)=>`<div><img src="${f.data}" alt="Foto ${i+1}"><button type="button" class="risco" data-i="${i}" aria-label="Remover foto">×</button></div>`).join('')}</div>`;
        x.querySelector('#arqFotos').onchange=async ev=>{
          for(const arq of ev.target.files){try{fotos.push({data:await Config.comprimirImagem(arq,1000,.7)})}catch(er){App.toast(er.message,true)}}desenhar()};
        x.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{fotos.splice(+b.dataset.i,1);desenhar()})};
      desenhar();
    });
    if(e.clienteId)document.getElementById('f_clienteId').value=e.clienteId;
  },
  async excluir(e,depois){
    if(!await App.confirmar(`Excluir o equipamento "${this.nome(e)}" e suas fotos? Esta ação não pode ser desfeita.`))return;
    for(const id of e.fotos||[])await DB.remover('imagens',id);
    await DB.remover('equipamentos',e.id);await DB.registrarHistorico('equipamento excluído',this.nome(e));App.toast('Equipamento excluído.');depois();
  }
};

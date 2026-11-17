const Dashboard={
  ENCERRADAS:['Entregue','Cancelado','Sem conserto'],REPARO:['Em reparo','Em testes','Aguardando peças'],
  iso(d){return d.toLocaleDateString('sv-SE')},
  meses(n,ref=new Date()){return Array.from({length:n},(_,k)=>{const i=n-1-k,a=new Date(ref.getFullYear(),ref.getMonth()-i,1),b=new Date(ref.getFullYear(),ref.getMonth()-i+1,0);
    return{rot:a.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),de:this.iso(a),ate:this.iso(b)}})},
  csv(linhas){const esc=v=>{v=v==null?'':String(v);return/[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};return'\ufeff'+linhas.map(l=>l.map(esc).join(';')).join('\n')},
  periodoHtml(){const h=Ordens.hoje();return`<div class="barra"><div style="flex:1"><label for="de">De</label><input id="de" type="date" value="${h.slice(0,8)}01"></div><div style="flex:1"><label for="ate">Até</label><input id="ate" type="date" value="${h}"></div></div>`},
  grafico(host,tipo,rotulos,series,fmt){
    if(window.Chart){Chart.defaults.color=getComputedStyle(document.documentElement).getPropertyValue('--texto').trim()||'#333';host.innerHTML='<canvas></canvas>';
      new Chart(host.firstChild,{type:tipo,data:{labels:rotulos,datasets:series.map(s=>({label:s.nome,data:s.dados,backgroundColor:s.cor}))},options:{responsive:true,plugins:{legend:{display:series.length>1}}}});return}
    const max=Math.max(1,...series.flatMap(s=>s.dados));
    host.innerHTML=(series.length>1?`<small>${series.map(s=>`<span style="color:${s.cor}">■</span> ${UI.h(s.nome)}`).join(' &nbsp; ')}</small>`:'')+rotulos.map((l,i)=>`<div class="linha"><span>${UI.h(l)}</span><div>${series.map(s=>`<div class="fill" style="width:${Math.max(1,s.dados[i]/max*100)}%;background:${s.cor}"></div>`).join('')}</div><span>${series.map(s=>fmt(s.dados[i])).join(' / ')}</span></div>`).join('');
  },
  async render(el){
    el.innerHTML=App.statusBackup()+Licenca.aviso()+this.periodoHtml()+'<div id="painel"></div>';
    const de=el.querySelector('#de'),ate=el.querySelector('#ate'),p=el.querySelector('#painel'),R=Ordens.R;
    const desenhar=async()=>{
      if(de.value>ate.value){App.toast('A data inicial não pode ser depois da final.',true);return}
      const [os,orc,hist]=await Promise.all(['ordens','orcamentos','historico'].map(s=>DB.todos(s))),f=await Financeiro.resumo(de.value,ate.value);
      const ent=os.filter(o=>o.status==='Entregue'&&(o.hist||[]).some(x=>x.texto.includes('Entregue')&&x.em.slice(0,10)>=de.value&&x.em.slice(0,10)<=ate.value)).length;
      const M=(t,v)=>`<div class="card metrica"><small>${t}</small><div class="total-os">${v}</div></div>`;
      p.innerHTML=`<div class="grade">${M('OS abertas',os.filter(o=>!this.ENCERRADAS.includes(o.status)).length)}${M('OS em diagnóstico',os.filter(o=>o.status==='Diagnóstico').length)}${M('Orçamentos pendentes',orc.filter(o=>o.status==='Pendente').length)}
        ${M('Equipamentos em reparo',os.filter(o=>this.REPARO.includes(o.status)).length)}${M('Equipamentos prontos',os.filter(o=>o.status==='Pronto').length)}${M('Serviços entregues (período)',ent)}
        ${M('Faturamento (período)',R(f.fat))}${M('Despesas (período)',R(f.despesas))}${M('Lucro estimado (período)',R(f.lucro))}${M('Valores a receber',R(f.areceber))}</div>
        <div class="card"><h2>Faturamento x despesas — últimos 6 meses</h2><div class="graf" id="g1"></div></div>
        <div class="card"><h2>Ordens de serviço por status</h2><div class="graf" id="g2"></div></div>
        <div class="card"><h2>Últimas movimentações</h2>${UI.tabela(['Quando','Operação','Detalhe'],hist.sort((a,b)=>b.data.localeCompare(a.data)).slice(0,10).map(x=>[new Date(x.data).toLocaleString('pt-BR'),UI.h(x.acao),UI.h(x.detalhe)]),'Nenhuma movimentação ainda.')}</div>`;
      const ms=this.meses(6),rs=[];for(const m of ms)rs.push(await Financeiro.resumo(m.de,m.ate));
      this.grafico(p.querySelector('#g1'),'bar',ms.map(m=>m.rot),[{nome:'Faturamento',dados:rs.map(r=>r.fat),cor:'#f28c28'},{nome:'Despesas',dados:rs.map(r=>r.despesas),cor:'#5b6b82'}],R);
      this.grafico(p.querySelector('#g2'),'bar',Ordens.STATUS,[{nome:'OS',dados:Ordens.STATUS.map(s=>os.filter(o=>o.status===s).length),cor:'#f28c28'}],v=>v);
    };
    de.onchange=ate.onchange=desenhar;desenhar();
  },
  async relatorios(el){
    el.innerHTML=this.periodoHtml()+'<div id="rel"></div>';
    const de=el.querySelector('#de'),ate=el.querySelector('#ate'),box=el.querySelector('#rel'),R=Ordens.R;
    const desenhar=async()=>{
      const [os,cl,eq,pag,rec,des]=await Promise.all(['ordens','clientes','equipamentos','pagamentos','receitas','despesas'].map(s=>DB.todos(s))),no=d=>d&&d>=de.value&&d<=ate.value;
      const nc=Object.fromEntries(cl.map(c=>[c.id,c.nome])),ne=Object.fromEntries(eq.map(e=>[e.id,Equipamentos.nome(e)]));
      const linhas=os.filter(o=>no(o.entrada)).sort((a,b)=>a.numero.localeCompare(b.numero)).map(o=>{const p=Financeiro.pago(pag,o.id);return[o.numero,Documentos.data(o.entrada),nc[o.clienteId]||'',ne[o.equipamentoId]||'',o.status,o.total,p,Math.max(0,o.total-p)]});
      const formas={};[...pag.filter(p=>no(p.data)),...rec.filter(r=>no(r.data))].forEach(x=>formas[x.forma||'Não informada']=(formas[x.forma||'Não informada']||0)+x.valor);
      const dcat={};des.filter(d=>d.pago&&no(d.dataPagamento)).forEach(d=>dcat[d.categoria||'Sem categoria']=(dcat[d.categoria||'Sem categoria']||0)+d.valor);
      box.innerHTML=`<div class="card"><h2>Ordens de serviço do período</h2><div class="acoes" style="margin:0 0 10px"><button id="csvOs" ${linhas.length?'':'disabled'}>Exportar CSV</button></div>${UI.tabela(['OS','Entrada','Cliente','Equipamento','Status','Total','Pago','Saldo'],linhas.map(l=>[l[0],l[1],UI.h(l[2]),UI.h(l[3]),l[4],R(l[5]),R(l[6]),R(l[7])]),'Nenhuma OS no período.')}</div>
        <div class="card"><h2>Recebimentos por forma de pagamento</h2>${UI.tabela(['Forma','Total'],Object.entries(formas).map(([k,v])=>[UI.h(k),R(v)]),'Sem recebimentos no período.')}</div>
        <div class="card"><h2>Despesas pagas por categoria</h2>${UI.tabela(['Categoria','Total'],Object.entries(dcat).map(([k,v])=>[UI.h(k),R(v)]),'Sem despesas pagas no período.')}</div>`;
      const b=box.querySelector('#csvOs');if(b)b.onclick=()=>Backup.baixar(`relatorio-os-${de.value}-a-${ate.value}.csv`,this.csv([['OS','Entrada','Cliente','Equipamento','Status','Total','Pago','Saldo'],...linhas]),'text/csv;charset=utf-8');
    };
    de.onchange=ate.onchange=desenhar;desenhar();
  }
};

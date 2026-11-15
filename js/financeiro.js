const Financeiro={
  FORMAS:['Dinheiro','PIX','Cartão de crédito','Cartão de débito','Transferência','Boleto'],
  CATS:['Peças','Aluguel','Energia','Internet','Ferramentas','Impostos','Outros'],
  formas(){return this.FORMAS.map(f=>[f,f])},
  pago(pags,id){return pags.filter(p=>p.ordemId===id).reduce((s,p)=>s+p.valor,0)},
  async resumo(de,ate){
    const [pag,rec,des,os]=await Promise.all(['pagamentos','receitas','despesas','ordens'].map(s=>DB.todos(s))),no=d=>d&&d>=de&&d<=ate;
    const fat=pag.filter(p=>no(p.data)).reduce((s,p)=>s+p.valor,0)+rec.filter(r=>no(r.data)).reduce((s,r)=>s+r.valor,0);
    const dp=des.filter(d=>d.pago&&no(d.dataPagamento)).reduce((s,d)=>s+d.valor,0);
    const areceber=os.filter(o=>o.status!=='Cancelado').reduce((s,o)=>s+Math.max(0,o.total-this.pago(pag,o.id)),0);
    return{fat,despesas:dp,lucro:fat-dp,areceber,apagar:des.filter(d=>!d.pago).reduce((s,d)=>s+d.valor,0)};
  },
  async render(el){
    const h=Ordens.hoje();
    el.innerHTML=`<div class="barra"><div style="flex:1"><label for="de">De</label><input id="de" type="date" value="${h.slice(0,8)}01"></div><div style="flex:1"><label for="ate">Até</label><input id="ate" type="date" value="${h}"></div></div><div id="conteudo2"></div>`;
    const c=el.querySelector('#conteudo2'),de=el.querySelector('#de'),ate=el.querySelector('#ate'),R=Ordens.R;
    const desenhar=async()=>{
      if(de.value>ate.value){App.toast('A data inicial não pode ser depois da final.',true);return}
      const s=await this.resumo(de.value,ate.value),[pag,rec,des,os,cl]=await Promise.all(['pagamentos','receitas','despesas','ordens','clientes'].map(x=>DB.todos(x)));
      const nc=Object.fromEntries(cl.map(x=>[x.id,x.nome])),no=d=>d&&d>=de.value&&d<=ate.value,btn=(a,id,t,cls='sec')=>`<button class="${cls} peq" data-a="${a}" data-id="${id}">${t}</button>`;
      const card=(t,v)=>`<div class="card"><small>${t}</small><div class="total-os" style="margin:4px 0 0">${R(v)}</div></div>`;
      const recv=os.filter(o=>o.status!=='Cancelado').map(o=>({o,saldo:o.total-this.pago(pag,o.id)})).filter(x=>x.saldo>0.004);
      c.innerHTML=`<div class="grade">${card('Faturamento no período',s.fat)}${card('Despesas pagas no período',s.despesas)}${card('Lucro estimado',s.lucro)}${card('A receber (total)',s.areceber)}${card('A pagar (total)',s.apagar)}</div>
      <h2 style="margin:18px 0 8px">Contas a receber</h2>${UI.tabela(['OS','Cliente','Total','Pago','Saldo',''],recv.map(x=>[x.o.numero,UI.h(nc[x.o.clienteId]||'—'),R(x.o.total),R(x.o.total-x.saldo),`<b>${R(x.saldo)}</b>`,btn('rec',x.o.id,'Receber','')]),'Nada a receber.')}
      <h2 style="margin:18px 0 8px">Recebimentos no período</h2><div class="barra"><button class="sec" data-a="novaRec">Nova receita avulsa</button></div>${UI.tabela(['Data','Origem','Forma','Valor',''],
        [...pag.filter(p=>no(p.data)).map(p=>({...p,t:'pagamentos',n:(os.find(o=>o.id===p.ordemId)||{}).numero||'OS'})),...rec.filter(r=>no(r.data)).map(r=>({...r,t:'receitas',n:r.descricao}))].sort((a,b)=>b.data.localeCompare(a.data))
        .map(p=>[Documentos.data(p.data),UI.h(p.n),UI.h(p.forma),R(p.valor),btn('delx',p.id+'|'+p.t,'Excluir','risco')]),'Nenhum recebimento no período.')}
      <h2 style="margin:18px 0 8px">Despesas</h2><div class="barra"><button class="sec" data-a="novaDes">Nova despesa</button></div>${UI.tabela(['Vencimento','Descrição','Categoria','Valor','Situação',''],
        des.filter(d=>!d.pago||no(d.dataPagamento)||no(d.vencimento)).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)).map(d=>[Documentos.data(d.vencimento),UI.h(d.descricao),UI.h(d.categoria),R(d.valor),
        d.pago?'Paga em '+Documentos.data(d.dataPagamento):`<span class="${d.vencimento<h?'atraso':''}">${d.vencimento<h?'Vencida':'A pagar'}</span>`,
        `<div class="acoes">${d.pago?'':btn('pagar',d.id,'Pagar','')}${btn('edDes',d.id,'Editar')}${btn('delx',d.id+'|despesas','Excluir','risco')}</div>`]),'Nenhuma despesa.')}`;
    };
    de.onchange=ate.onchange=desenhar;
    c.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
      if(a==='rec')this.receber(await DB.obter('ordens',id),desenhar);
      if(a==='novaRec')this.novaReceita(desenhar);
      if(a==='novaDes')this.despesa({},desenhar);
      if(a==='edDes')this.despesa(await DB.obter('despesas',id),desenhar);
      if(a==='pagar')this.pagar(await DB.obter('despesas',id),desenhar);
      if(a==='delx'){const[i,t]=id.split('|');if(await App.confirmar('Excluir este lançamento? Esta ação não pode ser desfeita.')){await DB.remover(t,i);await DB.registrarHistorico('lançamento excluído',t);App.toast('Excluído.');desenhar()}}
    };
    desenhar();
  },
  async receber(o,depois){
    const pag=await DB.todos('pagamentos'),saldo=o.total-this.pago(pag,o.id);
    UI.form(`Receber — ${o.numero} (saldo ${Ordens.R(saldo)})`,[{k:'valor',l:'Valor (R$)',type:'number',req:1},{k:'forma',l:'Forma de pagamento',t:'select',opts:this.formas()},{k:'data',l:'Data',type:'date',req:1},{k:'obs',l:'Observação',wide:1}],{valor:saldo.toFixed(2),data:Ordens.hoje()},async r=>{
      const v=+r.valor;if(!(v>0))throw new Error('Informe um valor maior que zero.');if(v>saldo+0.005)throw new Error('O valor é maior que o saldo da OS.');
      await DB.salvar('pagamentos',{ordemId:o.id,valor:v,forma:r.forma,data:r.data,obs:r.obs});await DB.registrarHistorico('pagamento',`${o.numero}: ${Ordens.R(v)}`);App.toast(v<saldo-0.005?'Pagamento parcial registrado.':'OS quitada.');depois();
    });
  },
  novaReceita(depois){UI.form('Nova receita avulsa',[{k:'descricao',l:'Descrição',req:1,wide:1},{k:'valor',l:'Valor (R$)',type:'number',req:1},{k:'forma',l:'Forma de pagamento',t:'select',opts:this.formas()},{k:'data',l:'Data',type:'date',req:1}],{data:Ordens.hoje()},async r=>{
    if(!(+r.valor>0))throw new Error('Informe um valor maior que zero.');await DB.salvar('receitas',{...r,valor:+r.valor});App.toast('Receita registrada.');depois()})},
  despesa(d,depois){UI.form(d.id?'Editar despesa':'Nova despesa',[{k:'descricao',l:'Descrição',req:1,wide:1},{k:'categoria',l:'Categoria',list:this.CATS},{k:'valor',l:'Valor (R$)',type:'number',req:1},{k:'vencimento',l:'Vencimento',type:'date',req:1}],{vencimento:Ordens.hoje(),...d},async r=>{
    if(!(+r.valor>0))throw new Error('Informe um valor maior que zero.');await DB.salvar('despesas',{pago:false,...d,...r,valor:+r.valor});App.toast('Despesa salva.');depois()})},
  pagar(d,depois){UI.form('Pagar — '+d.descricao,[{k:'forma',l:'Forma de pagamento',t:'select',opts:this.formas()},{k:'data',l:'Data do pagamento',type:'date',req:1}],{data:Ordens.hoje()},async r=>{
    await DB.salvar('despesas',{...d,pago:true,dataPagamento:r.data,forma:r.forma});App.toast('Despesa paga.');depois()})}
};

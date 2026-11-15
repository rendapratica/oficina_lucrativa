const Documentos={
  lib(){const J=window.jspdf&&window.jspdf.jsPDF;if(!J)throw new Error('Biblioteca jsPDF não encontrada. Salve o arquivo jspdf.umd.min.js na pasta js/vendor/.');return J},
  rgb(h){h=(h||'#f28c28').replace('#','');return[0,2,4].map(i=>parseInt(h.substr(i,2),16))},
  data(d){return d?new Date(d.length>10?d:d+'T12:00').toLocaleDateString('pt-BR'):'—'},
  img(src){return new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src})},
  async novo(titulo,numero){
    const cfg=await Config.obter(),doc=new(this.lib())({unit:'mm',format:'a4'}),c={doc,cfg,y:52,M:15,W:210,H:297},cor=this.rgb(cfg.corPrincipal);
    doc.setFillColor(15,39,66);doc.rect(0,0,210,30,'F');doc.setFillColor(...cor);doc.rect(0,30,210,1.5,'F');
    let x=15;
    if(cfg.logo){const im=await this.img(cfg.logo);if(im){const k=Math.min(20/im.height,40/im.width),w=im.width*k,h=im.height*k;
      doc.setFillColor(255,255,255);doc.roundedRect(15,4,w+4,h+4,2,2,'F');
      try{doc.addImage(cfg.logo,cfg.logo.startsWith('data:image/png')?'PNG':'JPEG',17,6,w,h);x=15+w+10}catch(e){}}}
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(cfg.nomeFantasia||'Oficina',x,12);
    doc.setFont('helvetica','normal');doc.setFontSize(8.5);
    doc.text([cfg.razaoSocial,[cfg.documento,cfg.telefone||cfg.whatsapp].filter(Boolean).join(' - '),[cfg.email,cfg.endereco].filter(Boolean).join(' - ')].filter(Boolean).map(t=>doc.splitTextToSize(t,150)[0]),x,17);
    doc.setTextColor(20,30,45);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(titulo.toUpperCase(),15,42);
    if(numero){doc.setFontSize(11);doc.text(numero,195,42,{align:'right'})}
    c.quebra=n=>{if(c.y+n>c.H-18){doc.addPage();c.y=20}};
    c.titulo=t=>{c.quebra(14);c.y+=2;doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...cor);doc.text(t,c.M,c.y);doc.setDrawColor(...cor);doc.line(c.M,c.y+1.5,c.W-c.M,c.y+1.5);doc.setTextColor(20,30,45);c.y+=7};
    c.texto=(t,o={})=>{doc.setFont('helvetica',o.b?'bold':'normal');doc.setFontSize(o.s||10);doc.splitTextToSize(String(t||'—'),c.W-2*c.M).forEach(l=>{c.quebra(6);doc.text(l,c.M,c.y);c.y+=5});c.y+=1};
    c.campo=(r,v)=>c.texto(r+': '+(v||'—'));
    c.tabela=(cols,larg,linhas)=>{
      const lin=(cel,b)=>{const ls=cel.map((t,i)=>doc.splitTextToSize(String(t),larg[i]-2)),h=Math.max(...ls.map(l=>l.length))*4.6+2;c.quebra(h);
        doc.setFont('helvetica',b?'bold':'normal');doc.setFontSize(9);if(b){doc.setFillColor(238,240,243);doc.rect(c.M,c.y-4,c.W-2*c.M,h,'F')}
        let x=c.M;ls.forEach((l,i)=>{doc.text(l,i?x+larg[i]-1:x+1,c.y,{align:i?'right':'left'});x+=larg[i]});c.y+=h;doc.setDrawColor(213,217,224);doc.line(c.M,c.y-3.5,c.W-c.M,c.y-3.5)};
      lin(cols,true);linhas.forEach(l=>lin(l));c.y+=2};
    c.assinaturas=(a,b)=>{c.quebra(30);c.y+=18;doc.setDrawColor(60);doc.line(c.M,c.y,c.M+70,c.y);doc.line(c.W-c.M-70,c.y,c.W-c.M,c.y);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(a,c.M,c.y+5);doc.text(b,c.W-c.M-70,c.y+5);c.y+=12};
    c.fim=()=>{const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);doc.text(`${cfg.nomeFantasia||''} - Emitido em ${new Date().toLocaleDateString('pt-BR')} - Página ${i}/${n}`,c.W/2,c.H-8,{align:'center'})}return doc};
    return c;
  },
  bloco(c,cl,eq){c.titulo('Cliente');c.campo('Nome',cl.nome);c.campo('CPF/CNPJ',cl.documento);c.campo('Telefone',cl.telefone||cl.whatsapp);c.campo('Endereço',cl.endereco);
    if(eq){c.titulo('Equipamento');c.campo('Equipamento',Equipamentos.nome(eq));c.campo('Número de série',eq.serie);c.campo('Voltagem / potência',[eq.voltagem,eq.potencia].filter(Boolean).join(' / '))}},
  itens(c,itens,mao,desc,total){const R=Ordens.R;
    const l=itens.map(p=>[p.nome,String(p.qtd),R(p.valor),R(p.qtd*p.valor)]);
    if(mao)l.push(['Mão de obra','1',R(mao),R(mao)]);if(desc)l.push(['Desconto','','','- '+R(desc)]);
    c.tabela(['Descrição','Qtd','Valor unit.','Subtotal'],[85,20,35,40],l);c.texto('TOTAL: '+R(total),{b:1,s:12})},
  async gerar(tipo,reg,op={}){
    const R=Ordens.R,cfg=await Config.obter();let c,nome,texto,cl,eq;
    if(tipo==='orcamento'){
      cl=await DB.obter('clientes',reg.clienteId)||{};c=await this.novo('Orçamento',reg.numero);this.bloco(c,cl);
      c.titulo('Dados do orçamento');c.campo('Emissão',this.data(reg.emissao));c.campo('Validade',this.data(reg.validade));
      c.titulo('Itens');this.itens(c,reg.itens||[],reg.maoObra,reg.desconto,reg.total);
      if(cfg.pagamento){c.titulo('Formas de pagamento');c.texto(cfg.pagamento)}
      if(reg.obs){c.titulo('Observações');c.texto(reg.obs)}
      nome=`orcamento-${reg.numero}.pdf`;texto=`Olá, ${cl.nome||''}! Segue o orçamento ${reg.numero} da ${cfg.nomeFantasia||'nossa oficina'}, válido até ${this.data(reg.validade)}.`;
    }else{
      cl=await DB.obter('clientes',reg.clienteId)||{};eq=await DB.obter('equipamentos',reg.equipamentoId)||{};
      const T={entrada:'Comprovante de entrada',relatorio:'Relatório técnico',entrega:'Comprovante de entrega',garantia:'Termo de garantia',recibo:'Recibo'}[tipo];
      c=await this.novo(T,reg.numero);
      if(tipo==='recibo'){
        c.titulo('Recibo');c.texto(`Recebi de ${cl.nome||'—'}${cl.documento?' (CPF/CNPJ '+cl.documento+')':''} a quantia de ${R(reg.total)}, referente ao serviço em ${Equipamentos.nome(eq)} (${reg.numero}).`,{s:11});
        c.campo('Forma de pagamento',op.forma);c.campo('Data',this.data(new Date().toISOString()));c.assinaturas('Assinatura do recebedor','Assinatura do cliente');
      }else{
        this.bloco(c,cl,eq);
        if(tipo==='entrada'){c.titulo('Recebimento');c.campo('Data de entrada',this.data(reg.entrada));c.campo('Prazo previsto',this.data(reg.prazo));c.campo('Defeito relatado',reg.defeito||eq.defeito);c.campo('Condições físicas',eq.condicoes);c.campo('Acessórios',eq.acessorios);
          c.texto('O cliente declara que as informações acima conferem com o estado do equipamento no ato da entrega à oficina.');c.assinaturas('Assinatura da oficina','Assinatura do cliente')}
        if(tipo==='relatorio'){c.titulo('Relatório técnico');[['Defeito relatado',reg.defeito],['Diagnóstico',reg.diagnostico],['Componentes danificados',reg.componentes],['Testes realizados',reg.testes],['Medições',reg.medicoes],['Serviços executados',reg.servicos],['Técnico',reg.tecnico]].forEach(([a,b])=>c.campo(a,b));
          c.titulo('Peças e valores');this.itens(c,reg.pecas||[],reg.maoObra,reg.desconto,reg.total)}
        if(tipo==='entrega'){c.titulo('Entrega');c.campo('Serviços executados',reg.servicos);c.campo('Data da entrega',this.data(new Date().toISOString()));c.campo('Valor total',R(reg.total));
          c.texto('O cliente declara ter recebido o equipamento acima, testado e em funcionamento.');c.assinaturas('Assinatura da oficina','Assinatura do cliente')}
        if(tipo==='garantia'){const dias=+op.dias||90,fim=new Date(Date.now()+dias*864e5);c.titulo('Garantia');c.campo('Serviço',reg.servicos);c.campo('Prazo de garantia',dias+' dias');c.campo('Válida até',this.data(fim.toISOString()));
          c.titulo('Condições');c.texto(cfg.garantia||'A garantia cobre somente o serviço executado e as peças substituídas, e perde a validade em caso de mau uso, violação do lacre, quedas, líquidos ou intervenção de terceiros.');c.assinaturas('Assinatura da oficina','Assinatura do cliente')}
      }
      nome=`${tipo}-${reg.numero}.pdf`;texto=`Olá, ${cl.nome||''}! Segue o documento (${tipo}) referente à ${reg.numero} da ${cfg.nomeFantasia||'nossa oficina'}.`;
    }
    return{doc:c.fim(),nome,texto,fone:cl.whatsapp||cl.telefone};
  },
  async compartilhar(r){
    const file=new File([r.doc.output('blob')],r.nome,{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],text:r.texto});return}catch(e){if(e.name==='AbortError')return}}
    r.doc.save(r.nome);const n=(r.fone||'').replace(/\D/g,'');
    window.open('https://wa.me/'+(n.length>=10&&n.length<=11?'55'+n:n)+'?text='+encodeURIComponent(r.texto+' (O PDF foi baixado: anexe o arquivo na conversa.)'),'_blank');
  },
  async executar(tipo,reg,op,zap){try{const r=await this.gerar(tipo,reg,op);zap?await this.compartilhar(r):r.doc.save(r.nome)}catch(e){App.toast(e.message,true)}},
  menuOS(o){
    const L=[['entrada','Comprovante de entrada'],['relatorio','Relatório técnico'],['entrega','Comprovante de entrega'],['garantia','Termo de garantia'],['recibo','Recibo']];
    UI.info('Documentos — '+o.numero,`<div class="grade"><div><label for="dGar">Garantia (dias)</label><input id="dGar" type="number" min="1" value="90"></div><div><label for="dForma">Forma de pagamento (recibo)</label><input id="dForma"></div></div>`+
      UI.tabela(['Documento',''],L.map(([t,n])=>[n,`<div class="acoes"><button class="sec peq" data-t="${t}">PDF</button><button class="peq" data-t="${t}" data-w="1">WhatsApp</button></div>`]),''));
    document.getElementById('dlg').onclick=e=>{const b=e.target.closest('[data-t]');if(b)this.executar(b.dataset.t,o,{dias:document.getElementById('dGar').value,forma:document.getElementById('dForma').value},!!b.dataset.w)};
  }
};

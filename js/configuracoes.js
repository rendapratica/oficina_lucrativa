const CAMPOS=[['nomeFantasia','Nome fantasia'],['razaoSocial','Razão social'],['documento','CPF/CNPJ'],['telefone','Telefone'],['whatsapp','WhatsApp'],['email','E-mail'],['endereco','Endereço'],['responsavel','Responsável']];
const Config={
  ID:'oficina',
  async obter(){return(await DB.obter('configuracoes',this.ID))||{id:this.ID}},
  async aplicarCor(){const c=await this.obter();document.documentElement.style.setProperty('--cor',c.corPrincipal||'#f28c28')},
  comprimirImagem(arq,max=400,q=.8){ // reduz e comprime antes de salvar
    return new Promise((ok,erro)=>{
      const img=new Image(),u=URL.createObjectURL(arq);
      img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');
        c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(u);ok(c.toDataURL(arq.type==='image/png'?'image/png':'image/jpeg',q))};
      img.onerror=()=>erro(new Error('Imagem inválida.'));img.src=u;
    });
  },
  async render(el){
    const c=await this.obter(),h=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    el.innerHTML=`<form id="fCfg" class="card"><h2>Dados da oficina</h2><div class="grade">`+
      CAMPOS.map(([k,l])=>`<div><label for="${k}">${l}</label><input id="${k}" value="${h(c[k])}"></div>`).join('')+
      `<div><label for="corPrincipal">Cor principal</label><input type="color" id="corPrincipal" value="${c.corPrincipal||'#f28c28'}"></div>
      <div><label for="logo">Logotipo</label><input type="file" id="logo" accept="image/*"><img class="logo-prev" id="prev" alt="Logotipo" ${c.logo?`src="${c.logo}"`:'hidden'}></div></div>
      <div style="margin-top:12px"><label for="pagamento">Informações de pagamento (PIX, conta…)</label><textarea id="pagamento" rows="2">${h(c.pagamento)}</textarea></div>
      <div style="margin-top:12px"><label for="garantia">Informações de garantia</label><textarea id="garantia" rows="3">${h(c.garantia)}</textarea></div>
      <div class="acoes"><button type="submit">Salvar configurações</button></div></form>`;
    let logo=c.logo||null;
    el.querySelector('#logo').onchange=async e=>{
      const f=e.target.files[0];if(!f)return;
      try{logo=await this.comprimirImagem(f);const p=el.querySelector('#prev');p.src=logo;p.hidden=false}catch(x){App.toast(x.message,true)}
    };
    el.querySelector('#fCfg').onsubmit=async e=>{
      e.preventDefault();const r={id:this.ID,criadoEm:c.criadoEm,logo};
      [...CAMPOS.map(x=>x[0]),'corPrincipal','pagamento','garantia'].forEach(k=>r[k]=el.querySelector('#'+k).value.trim());
      if(!r.nomeFantasia){App.toast('Informe o nome fantasia.',true);return}
      if(r.email&&!/^\S+@\S+\.\S+$/.test(r.email)){App.toast('E-mail inválido.',true);return}
      await DB.salvar('configuracoes',r);await this.aplicarCor();App.toast('Configurações salvas.');
    };
  }
};

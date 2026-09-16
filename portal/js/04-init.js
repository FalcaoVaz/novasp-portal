
function initApp(){
  const ini=CUR.nome.split(' ').slice(0,2).map(n=>n[0]).join('');
  document.getElementById('sbav').textContent=ini;
  document.getElementById('sbav').style.background=CUR.cor_avatar||'#1E2D4A';
  document.getElementById('sbn').textContent=CUR.nome.split(' ')[0];
  document.getElementById('sbd').textContent=CUR.dept||'';
  document.getElementById('tbch').textContent=CUR.nome;
  document.getElementById('h-nome').textContent=CUR.nome.split(' ')[0];
  document.getElementById('h-data').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Pessoal de Vendas (gerentes + assistentes) tambem tem acesso a chamados
  // internos. Representantes puros NAO — so veem o Forum dentro de Vendas.
  const ehRepPuro = (typeof ehRepresentantePuro === 'function') && ehRepresentantePuro();
  const vendasTbm = (typeof podeAcessarVendas === 'function') && podeAcessarVendas() && !ehRepPuro;
  const podeCal = ((typeof podeAcessarCalendar === 'function') ? podeAcessarCalendar() : !!CUR.acesso_calendar) && !ehRepPuro;
  ['jur','int','cal'].forEach(k=>{
    const has=k==='jur'?CUR.acesso_juridico
            : k==='int'?(CUR.acesso_interno || vendasTbm)
            : podeCal;
    document.getElementById('t-'+k).classList.toggle('off',!has);
  });
  // Gestao: lideres/admin (modulo completo) ou colaboradores de avaliacao (so feedback)
  const tGes = document.getElementById('t-ges');
  if (tGes) tGes.classList.toggle('off', !(typeof podeAcessarGestao === 'function' && podeAcessarGestao()));
  // Gestao de Vendas: gerentes + assistentes + admin
  const tVnd = document.getElementById('t-vnd');
  if (tVnd) tVnd.classList.toggle('off', !(typeof podeAcessarVendas === 'function' && podeAcessarVendas()));

  // Cibele (telefonista): vai direto para abertura de chamado
  if(CUR.dept==='Telefonista'){
    setMod('interno');
    // Após carregar o módulo, abre direto o modal de novo chamado
    setTimeout(()=>openM('m-man'), 400);
    return;
  }

  // Fotógrafo: vai direto pra agenda dele
  if (typeof ehFotografo === 'function' && ehFotografo()) {
    setMod('vendas');
    setTimeout(()=>goTo('vnd-fotografo'), 100);
    return;
  }

  // Representante puro (corretor rep, nao gerente/admin/assistente):
  // vai direto pro Forum. Sem home, sem outros modulos.
  if (typeof ehRepresentantePuro === 'function' && ehRepresentantePuro()) {
    setMod('vendas');
    setTimeout(()=>goTo('vnd-forum'), 100);
    return;
  }

  renderHome();
  if (typeof resolverIcones === 'function') resolverIcones();
  if (typeof atualizarBadgeAvisos === 'function') atualizarBadgeAvisos();
  // Atualiza o badge a cada 5min
  setInterval(()=>{ if (typeof atualizarBadgeAvisos==='function') atualizarBadgeAvisos(); }, 5*60*1000);
}

function renderHome(){
  const podeGestao = (typeof podeAcessarGestao === 'function') && podeAcessarGestao();
  const soFeedback = (typeof ehColaboradorGestao === 'function') && ehColaboradorGestao();
  const ehRepPuro = (typeof ehRepresentantePuro === 'function') && ehRepresentantePuro();
  const cards=[
    {id:'jur',tone:'blue',   ic:'scale',    ti:'Sistema Jurídico', ds:'Processos, prazos, petições IA, documentos extrajudiciais, financeiro e chamados.', ac:CUR.acesso_juridico && !ehRepPuro, mod:'juridico', fn:'abrirJuridico()'},
    {id:'int',tone:'emerald',ic:'building', ti:'Sistema Interno',  ds:'Manutenção predial, requisições internas e entrega de chaves.',                        ac:(!ehRepPuro && (CUR.acesso_interno || ((typeof podeAcessarVendas==='function') && podeAcessarVendas()))),  mod:'interno'},
    {id:'cal',tone:'purple', ic:'calendar', ti:'Calendar & Tarefas',ds:'Tarefas, agenda da equipe, horários livres e pauta das reuniões.',                  ac:!ehRepPuro && ((typeof podeAcessarCalendar==='function') ? podeAcessarCalendar() : CUR.acesso_calendar), mod:'calendar'},
    {id:'ges',tone:'amber',  ic:'users',    ti: soFeedback?'Avaliação & Feedback':'Gestão & Feedback', ds: soFeedback?'Avalie seu líder no trimestre.':'Liderados, avaliações trimestrais, metas e cálculo de bônus.', ac:podeGestao && !ehRepPuro, mod:'gestao'},
    {id:'reg',tone:'slate',  ic:'book',     ti:'Regras e Processos', ds:'Diretrizes padronizadas de Vendas, Locação, Financeiro e RH.',                      ac:!ehRepPuro,                 mod:'regras'},
    {id:'vnd',tone:'blue',   ic:'briefcase',ti:'Gestão de Vendas',   ds:'Seleção de imóveis, presença em atividades, cotas de anúncios e agenda do fotógrafo.', ac:(typeof podeAcessarVendas==='function') && podeAcessarVendas(), mod:'vendas'}
  ];
  const ic = (typeof icon==='function') ? icon : (n=>n);
  document.getElementById('pgrid').innerHTML=cards.map(c=>`
    <div class="pc ${!c.ac?'lk':''}" data-tone="${c.tone}" onclick="${c.ac?(c.fn?c.fn:`setMod('${c.mod}')`):''}">
      <div class="pci">${ic(c.ic,32)}</div>
      <div class="pct">${c.ti}</div>
      <div class="pcd">${c.ds}</div>
      <div class="pcb">${c.ac?'Disponível':'Sem acesso'}</div>
    </div>`).join('');
}

function setMod(mod){
  // Representante puro so acessa Vendas (e dentro dela, so o Forum)
  const ehRepPuro = (typeof ehRepresentantePuro === 'function') && ehRepresentantePuro();
  if (ehRepPuro && mod !== 'vendas') return;
  if(mod==='juridico'&&!CUR.acesso_juridico)return;
  // Interno: tambem libera p/ pessoal de Vendas (chamados TI/Manutencao), mas nao rep puro
  if(mod==='interno' && !CUR.acesso_interno && !((typeof podeAcessarVendas==='function' && podeAcessarVendas()) && !ehRepPuro)) return;
  if(mod==='calendar'){
    const podeCal = (typeof podeAcessarCalendar==='function') ? podeAcessarCalendar() : !!CUR.acesso_calendar;
    if (!podeCal) return;
  }
  if(mod==='gestao'&&typeof podeAcessarGestao==='function'&&!podeAcessarGestao())return;
  if(mod==='vendas'&&typeof podeAcessarVendas==='function'&&!podeAcessarVendas())return;
  // regras: liberado para todos os usuarios autenticados
  const modAbreviada = {juridico:'jur', interno:'int', calendar:'cal', gestao:'ges', regras:'reg', vendas:'vnd'}[mod] || mod;
  ['jur','int','cal','ges','reg','vnd'].forEach(k=>{
    const el = document.getElementById('t-'+k);
    if(el) el.classList.remove('active');
  });
  const tabEl = document.getElementById('t-'+modAbreviada);
  if(tabEl) tabEl.classList.add('active');
  const itens = (mod==='gestao' && typeof menuGestaoItens==='function') ? menuGestaoItens()
              : (mod==='vendas' && typeof menuVendasItens==='function') ? menuVendasItens()
              : (MENUS[mod]||[]);
  const nav=document.getElementById('nav');
  nav.innerHTML=itens.map(i=>`<div class="ni" onclick="goTo('${i.pg}')" id="n-${i.pg}"><span class="ic">${(typeof icon==='function'?icon(i.ic):'')||i.ic}</span><span>${i.lb}</span></div>`).join('');
  if(mod==='interno'){goTo('interno-home');}
  else if(mod==='regras'){goTo('regras-home');}
  else if(mod==='vendas'){goTo('vendas-home');}
  else{const first=itens[0];if(first)goTo(first.pg);}
  if (typeof resolverIcones === 'function') resolverIcones();
  if(window.innerWidth<=768)closeSB();
}

function goTo(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  // req-ti e req-manut compartilham a mesma pagina p-requisicoes com modo fixo
  const pgEfetivo = (pg==='req-ti'||pg==='req-manut') ? 'requisicoes' : pg;
  const p=document.getElementById('p-'+pgEfetivo);if(p)p.classList.add('active');
  const n=document.getElementById('n-'+pg);if(n)n.classList.add('active');
  document.getElementById('tbt').textContent=TITLES[pg]||pg;
  if(pg==='manutencao')loadMan();
  if(pg==='requisicoes'){ _reqModoFixo=null; loadReq(); }
  if(pg==='req-ti'){      _reqModoFixo='ti';      loadReq(); }
  if(pg==='req-manut'){   _reqModoFixo='manut';   loadReq(); }
  if(pg==='regras-home')    renderRegrasHome?.();
  if(pg==='reg-vendas')     renderRegras?.('vendas');
  if(pg==='reg-locacao')    renderRegras?.('locacao');
  if(pg==='reg-financeiro') renderRegras?.('financeiro');
  if(pg==='reg-rh')         renderRegras?.('rh');
  if(pg==='reg-adm')        renderRegras?.('adm');
  if(pg==='avisos')         carregarAvisos?.();
  if(pg==='tarefas')loadTar();
  if(pg==='ativ-semanais') carregarAtividadesSemanais?.();
  if(pg==='vendas-home')   {
    const cardPen = document.getElementById('card-vnd-peneira');
    if (cardPen) cardPen.style.display = (typeof ehVotantePeneira==='function' && ehVotantePeneira()) ? '' : 'none';
    const cardFor = document.getElementById('card-vnd-forum');
    if (cardFor) cardFor.style.display = (typeof podeAcessarForumVendas==='function' && podeAcessarForumVendas()) ? '' : 'none';
    // Representante puro (corretor rep, nao gerente/admin) so ve o Forum.
    // Esconde todos os outros cards de Vendas.
    if (typeof ehRepresentantePuro === 'function' && ehRepresentantePuro()) {
      ['card-vnd-selecao','card-vnd-presenca','card-vnd-cotas','card-vnd-fotografo','card-vnd-peneira']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      // Redireciona direto pro forum (sem passar pelo home de Vendas)
      setTimeout(() => goTo('vnd-forum'), 60);
    }
  }
  if(pg==='vnd-selecao')   carregarSelecaoImoveis?.();
  if(pg==='vnd-captacao')  carregarCaptacao?.();
  if(pg==='vnd-peneira')   carregarPeneiraSelecao?.();
  if(pg==='vnd-presenca')  carregarVendasPresenca?.();
  if(pg==='vnd-cotas')     carregarVendasCotas?.();
  if(pg==='vnd-fotografo') carregarAgendaFotografo?.();
  if(pg==='vnd-foto-disp') carregarFotoDisp?.();
  if(pg==='vnd-forum')     carregarForum?.();
  if(pg==='agenda')renderAg();
  if(pg==='pauta-terca')renderPauta('terca');
  if(pg==='pauta-quarta')renderPauta('quarta');
  if(pg==='pauta-juridico')renderPauta('juridico');
  if(pg==='pauta-renata')renderPauta('renata');
  if(pg==='pauta-felippe')renderPauta('felippe');
  if(pg==='pauta-christiane')renderPauta('christiane');
  if(pg==='pauta-emilia')renderPauta('emilia');
  if(pg==='horarios')renderHor();
  // Gestao
  if(pg==='liderados')   carregarLiderados?.();
  if(pg==='processos-bpmn') carregarProcessosBpmn?.();
  if(pg==='organograma') carregarOrganograma?.();
  if(pg==='avaliacoes')  carregarAvaliacoes?.();
  if(pg==='aval-imoveis') carregarAvalImoveis?.();
  if(pg==='metas')       carregarMetasBonus?.();
  if(pg==='bonus')       carregarBonus?.();
  if(pg==='av-lider')    carregarAvLider?.();
  if(window.innerWidth<=768)closeSB();
}



// MANUTENÇÃO

// Converte qualquer resposta do Apps Script em array de objetos

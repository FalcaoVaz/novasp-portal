// PAUTA
// Config por tipo de reunião (terça / quarta / jurídico).
// dow = dia da semana (0=Dom..6=Sáb) usado para mostrar a "próxima" reunião.
// quinzenal: reunião a cada 2 semanas. paridade: define em quais semanas ocorre
// (0 ou 1, calculado pela paridade da semana ISO). Quarta e Jurídico são ambas
// às 4as-feiras (dow:3) e se intercalam — uma semana adm, na outra jurídico.
const PAUTA_CFG = {
  terca:      {aba:'PAUTA_TERCA',     cor:'#8B5CF6', dom:'ter',        dow:2, hora:'15:00', lb:'Mkt',       quinzenal:false, paridade:null},
  quarta:     {aba:'PAUTA_QUARTA',    cor:'#0EA5E9', dom:'qua',        dow:3,               lb:'Adm',       quinzenal:true,  paridade:0},
  juridico:   {aba:'PAUTA_JURIDICO',  cor:'#D97706', dom:'jur',        dow:3,               lb:'Jurídico',  quinzenal:true,  paridade:1},
  // 1:1 quinzenais com gerentes de vendas — TODOS na 5a-feira (dow=4):
  //   Semana A: Felippe 10h, Emilia 11h
  //   Semana B: Renata 10h, Christiane 11h
  felippe:    {aba:'PAUTA_FELIPPE',    cor:'#2563EB', dom:'felippe',    dow:4, hora:'10:00', lb:'Felippe',         quinzenal:true, paridade:0},
  emilia:     {aba:'PAUTA_EMILIA',     cor:'#2563EB', dom:'emilia',     dow:4, hora:'11:00', lb:'Emilia',          quinzenal:true, paridade:0},
  renata:     {aba:'PAUTA_RENATA',     cor:'#2563EB', dom:'renata',     dow:4, hora:'10:00', lb:'Renata (Moema)',  quinzenal:true, paridade:1},
  christiane: {aba:'PAUTA_CHRISTIANE', cor:'#2563EB', dom:'christiane', dow:4, hora:'11:00', lb:'Christiane',      quinzenal:true, paridade:1}
};
function _pCfg(t){return PAUTA_CFG[t]||PAUTA_CFG.quarta;}

// Participantes fixos de cada reunião — refletem quem senta na sala.
// Serve pra popular os cards "reunião" injetados na agenda semanal.
const PAUTA_PARTICIPANTES = {
  terca:      ['Rodrigo Falcão Vaz','Thais','Anderson'],                                             // Mkt (terça 15h)
  quarta:     ['Rodrigo Falcão Vaz','Vivian','Nogueira','João Marcos'],                              // Adm (quarta 10h/11h)
  juridico:   ['Rodrigo Falcão Vaz','Fernanda Araujo','Renata Navarro','Edna Rebesco','Durval Falcão Vaz','Janaina Alves'], // Jurídico (quarta)
  felippe:    ['Rodrigo Falcão Vaz','Felippe'],                                                      // 1:1 quinta 10h
  emilia:     ['Rodrigo Falcão Vaz','Emilia'],                                                       // 1:1 quinta 11h
  renata:     ['Rodrigo Falcão Vaz','Renata Navarro'],                                               // 1:1 quinta 10h
  christiane: ['Rodrigo Falcão Vaz','Christiane']                                                    // 1:1 quinta 11h
};

// Retorna as reuniões que ocorrem NUM dia específico, respeitando paridade
// (quinzenais só aparecem em semanas certas). Usado pelo grid da agenda.
function reunioesDoDia(day){
  const dow = day.getDay(); // 0=Dom..6=Sáb
  const parDia = _paridadeData(day);
  const out = [];
  for (const [tipo, cfg] of Object.entries(PAUTA_CFG)) {
    if (cfg.dow !== dow) continue;
    if (cfg.quinzenal && cfg.paridade !== null && cfg.paridade !== parDia) continue;
    out.push({
      tipo,
      hora:  cfg.hora || (tipo==='terca' ? '15:00' : (tipo==='juridico' ? '11:00' : (tipo==='quarta' ? '10:00' : '10:00'))),
      label: cfg.lb,
      cor:   cfg.cor,
      participantes: PAUTA_PARTICIPANTES[tipo] || []
    });
  }
  // Ordena por horário
  out.sort((a,b) => String(a.hora).localeCompare(String(b.hora)));
  return out;
}
// Offset por tipo. _pOff lê e _pAddOff incrementa. Cada pauta tem seu próprio offset.
const _PAUTA_OFFS = { terca:0, quarta:0, juridico:0, renata:0, felippe:0, christiane:0, emilia:0 };
function _pOff(t){
  if (t==='terca')    return rOt;
  if (t==='juridico') return rOj;
  if (t==='quarta')   return rOq;
  return _PAUTA_OFFS[t] || 0;
}
function _pAddOff(t,d){
  if (t==='terca')         rOt += d;
  else if (t==='juridico') rOj += d;
  else if (t==='quarta')   rOq += d;
  else if (_PAUTA_OFFS.hasOwnProperty(t)) _PAUTA_OFFS[t] += d;
  else rOq += d;
}

const _SEMANA_MS = 6048e5; // 7 dias em ms
// Paridade (0/1) da semana de uma data qualquer, ancorada na segunda-feira.
function _paridadeData(d){const x=new Date(d);const dy=x.getDay()||7;x.setDate(x.getDate()-dy+1);x.setHours(0,0,0,0);return Math.floor(x.getTime()/_SEMANA_MS)%2;}
// Ancoragem FIXA das paridades:
//  - Quarta 17/06/2026 = JURÍDICO (Adm é a outra semana)
//  - 5a-feira 25/06/2026 = FELIPPE (10h) + EMILIA (11h)
//    semana seguinte (02/07): RENATA (10h) + CHRISTIANE (11h)
(function(){
  var pJur = _paridadeData(new Date(2026,5,17));
  PAUTA_CFG.juridico.paridade = pJur;
  PAUTA_CFG.quarta.paridade   = pJur ^ 1;
  var p5a = _paridadeData(new Date(2026,5,25)); // 25/06/2026 (qui)
  PAUTA_CFG.felippe.paridade    = p5a;
  PAUTA_CFG.emilia.paridade     = p5a;
  PAUTA_CFG.renata.paridade     = p5a ^ 1;
  PAUTA_CFG.christiane.paridade = p5a ^ 1;
})();
function wkId(off=0){return getMon(off).toISOString().slice(0,10);}
function nextDay(dow){const d=new Date(),df=(dow-d.getDay()+7)%7||7;d.setDate(d.getDate()+df);return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});}
// Texto "Próxima: ..." — para quinzenais procura a próxima data com paridade certa.
function _proxLabel(cfg){
  const horaSufixo = cfg.hora ? ' · ' + cfg.hora : '';
  if(!cfg.quinzenal) return 'Próxima: '+nextDay(cfg.dow)+horaSufixo;
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  for(let i=1;i<=28;i++){
    const d=new Date(hoje); d.setDate(d.getDate()+i);
    if(d.getDay()===cfg.dow && _paridadeData(d)===cfg.paridade){
      return 'Próxima: '+d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})+horaSufixo+' · quinzenal';
    }
  }
  return 'Quinzenal' + horaSufixo;
}
// Navegação: quinzenais pulam 2 semanas por clique (sempre caem em semana de reunião).
function chReu(t,d){_pAddOff(t, _pCfg(t).quinzenal ? d*2 : d);renderPauta(t);}

async function renderPauta(tipo){
  const cfg=_pCfg(tipo);
  // Quinzenal: alinha a semana exibida à paridade da reunião (a semana atual pode
  // pertencer à outra reunião do par adm/jurídico). Como a navegação pula de 2 em 2,
  // o alinhamento se mantém após o ajuste inicial.
  if(cfg.quinzenal && _paridadeData(getMon(_pOff(tipo)))!==cfg.paridade){ _pAddOff(tipo,1); }
  const off=_pOff(tipo);
  const wk=wkId(off);
  const wkAtual=wkId(0); // semana atual
  document.getElementById('rw-'+cfg.dom).textContent=wkLabel(off);
  document.getElementById('prox-'+cfg.dom).textContent=_proxLabel(cfg);
  // Filtro: mostra pendentes (qualquer semana) + concluidos da semana atual.
  // Concluidos com data_conclusao em semanas anteriores nao aparecem mais.
  const _filtroSemana = (x, dataReuniao) => {
    const dr  = String(dataReuniao||'');
    const st  = (x.status||x.Status||'').toString().toLowerCase();
    const dc  = String(x.data_conclusao||x.Data_conclusao||x.dataconclusao||'');
    if(st.includes('conclu')){
      // So mostra se foi concluido nesta semana (data_conclusao bate com wk)
      return dc.startsWith(wk);
    }
    // Pendente: dessa semana ou anterior (carry-over)
    return dr.startsWith(wk) || dr < wk;
  };

  let items=[], tarefasPend=[];
  // As duas leituras vao em PARALELO e com cache de 60s (gasGetCached):
  // antes eram sequenciais (~4s cada = ~8s por pauta) e refeitas a cada
  // troca de semana, que só re-filtra os mesmos dados no cliente.
  const [pPauta, pTarefas] = [
    gasGetCached(GAS_CALENDAR,{action:'read',sheet:cfg.aba}),
    gasGetCached(GAS_CALENDAR,{action:'read',sheet:'TAREFAS'})
  ];
  // 1) Itens nativos da pauta
  try{
    const resp=await pPauta;
    const todos=gasParseRows(resp);
    items=todos.filter(x => _filtroSemana(x, x.data_reuniao||x.Data_reuniao||''));
    console.log('Pauta',tipo,':',items.length,'na pauta de',todos.length);
  }catch(e){console.warn('Pauta:',e.message);}
  // 2) Tarefas relacionadas ao grupo dessa reuniao
  try{
    const respT = await pTarefas;
    const todasT = gasParseRows(respT);
    const grupoNomes = GRUPOS[tipo] || [];
    const primeirosNomes = grupoNomes.map(n => n.toLowerCase().split(' ')[0]).filter(Boolean);
    tarefasPend = todasT.filter(x=>{
      const respText = String(x.responsavel||x.Responsavel||'').toLowerCase();
      if(!primeirosNomes.some(n => respText.includes(n))) return false;
      const st = (x.status||'').toString().toLowerCase();
      const dc = String(x.data_conclusao||x.Data_conclusao||'');
      if(st.includes('conclu')) return dc.startsWith(wk);
      return true;
    });
    console.log('Tarefas em',tipo,':',tarefasPend.length,'na pauta de',todasT.length);
  }catch(e){console.warn('Tarefas em pauta:',e.message);}

  // ── DEDUPLICACAO ──
  // Normaliza titulo: lowercase + trim + remove acentos + colapsa espacos.
  const _norm = s => String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')  // remove acentos
    .replace(/\s+/g,' ')
    .trim();

  // 1) Dedup interno em PAUTA: se ha varias rows com mesmo titulo,
  //    mantem so a com maior id (mais recente)
  const pautaByTit = {};
  for(const p of items){
    const k = _norm(p.item);
    if(!k) continue;
    if(!pautaByTit[k] || Number(p.id) > Number(pautaByTit[k].id)) pautaByTit[k] = p;
  }
  const itemsDedup = Object.values(pautaByTit);
  if(items.length !== itemsDedup.length) console.log('Pauta dedup interno:', items.length - itemsDedup.length, 'duplicatas removidas');
  items.length = 0; items.push(...itemsDedup);

  // 2) Dedup interno em TAREFAS: idem
  const tarByTit = {};
  for(const t of tarefasPend){
    const k = _norm(t.titulo||t.Titulo);
    if(!k) continue;
    if(!tarByTit[k] || Number(t.id) > Number(tarByTit[k].id)) tarByTit[k] = t;
  }
  const tarefasDedup = Object.values(tarByTit);
  if(tarefasPend.length !== tarefasDedup.length) console.log('Tarefas dedup interno:', tarefasPend.length - tarefasDedup.length, 'duplicatas removidas');
  tarefasPend.length = 0; tarefasPend.push(...tarefasDedup);

  // 3) Dedup pauta-vs-tarefa: tarefa cujo titulo bate com pauta sai
  const titulosPauta = new Set(items.map(p => _norm(p.item)).filter(Boolean));
  const antes = tarefasPend.length;
  tarefasPend = tarefasPend.filter(t => {
    const tit = _norm(t.titulo||t.Titulo);
    return !tit || !titulosPauta.has(tit);
  });
  if(antes !== tarefasPend.length) console.log('Pauta×Tarefa dedup:', antes - tarefasPend.length, 'tarefas removidas');
  const el=document.getElementById('pc-'+tipo);
  const cor=cfg.cor;

  // Junta os dois tipos numa lista unica de "itens da pauta"
  const todosItens = [
    ...items.map(p => ({
      kind: 'pauta',
      id: p.id, titulo: p.item||'—',
      responsavel: p.responsavel||'',
      status: p.status||'Pendente',
      comentario: p.comentario||p.Comentario||'',
      data_ref: p.data_reuniao||'',
      raw: p
    })),
    ...tarefasPend.map(t => ({
      kind: 'tarefa',
      id: t.id, titulo: t.titulo||t.Titulo||'—',
      responsavel: t.responsavel||'',
      status: t.status||'Pendente',
      comentario: t.comentario||t.Comentario||'',
      data_ref: t.data_criacao||t.prazo||'',
      prazo: t.prazo||'',
      raw: t
    }))
  ];

  if(!todosItens.length){
    el.innerHTML=`<div class="empty"><p style="color:#94a3b8;font-size:13px;padding:24px;text-align:center">Nenhum item para essa reunião.</p></div>`;
    return;
  }

  // Separa em 2 grupos: itens nativos da pauta vs tarefas do grupo
  const itensPauta = todosItens.filter(x => x.kind === 'pauta');
  const itensTarefa = todosItens.filter(x => x.kind === 'tarefa');

  // Em cada grupo, ordena: pendentes/em-andamento primeiro, concluídos no fim
  const _ordenaCard = lista => lista.sort((a,b) => {
    const aC = (a.status||'').toLowerCase().includes('conclu') ? 1 : 0;
    const bC = (b.status||'').toLowerCase().includes('conclu') ? 1 : 0;
    return aC - bC;
  });
  _ordenaCard(itensPauta);
  _ordenaCard(itensTarefa);

  // Renderiza um card individual
  const renderCard = (it, num) => {
    const hist = _parseComentarios(it.comentario);
    const ultimoComent = hist[0];
    const isConc = (it.status||'').toLowerCase().includes('conclu');
    const sheet = it.kind === 'tarefa' ? 'TAREFAS' : '';
    const statusOpts = it.kind === 'tarefa'
      ? ['Não iniciado','Em andamento','Em espera','Concluído']
      : ['Pendente','Discutido','Concluído'];
    const sheetArg = sheet ? `,'${sheet}'` : '';
    const concludedStyle = isConc ? 'opacity:.55;background:#f8fafc' : '';
    const concludedRiscado = isConc ? 'text-decoration:line-through;color:#94a3b8' : '';
    // "Pendente desde" para itens de pauta de semanas anteriores (sem emoji confuso)
    const dataItem = _formatSemana(it.data_ref);
    const carryOver = it.kind === 'pauta' && dataItem && !String(it.data_ref||'').startsWith(wkId(0))
      ? `<span style="font-size:11px;color:#92400e;background:#fef3c7;padding:2px 8px;border-radius:99px;margin-left:6px">Pendente desde ${dataItem}</span>` : '';
    const prazoLbl = it.prazo ? ` · Prazo: ${it.prazo}` : '';

    return `<div data-card style="background:#fff;border:1px solid var(--borda);border-radius:10px;padding:13px 15px;margin-bottom:8px;${concludedStyle}">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:26px;height:26px;border-radius:50%;background:${cor}18;color:${cor};font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${num}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;${concludedRiscado}">${it.titulo}${carryOver}${isConc?' <span style="color:#16a34a;font-size:11px;font-weight:700;margin-left:6px">concluído</span>':''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${it.responsavel||'—'}${prazoLbl}</div>
        </div>
        <button class="btn btn-o bxs" onclick="abrirComentariosPauta('${it.id}','${tipo}'${sheetArg})" title="Comentários">💬${hist.length?' '+hist.length:''}</button>
        <select style="font-size:12px;padding:4px 8px;border:1px solid var(--borda);border-radius:6px;background:var(--bg);cursor:pointer" onchange="_pautaStatusChange('${it.id}','${tipo}',this.value${sheetArg})">
          ${statusOpts.map(s => `<option ${(it.status||'')===s?'selected':''}>${s}</option>`).join('')}
        </select>
        ${it.kind==='pauta' ? `<button class="btn btn-o bxs" style="color:var(--danger)" onclick="delPauta('${it.id}','${tipo}')" title="Remover da pauta">×</button>` : ''}
      </div>
      ${ultimoComent ? `<div style="margin-top:8px;padding:8px 10px;background:#f8fafc;border-left:3px solid ${cor};border-radius:0 6px 6px 0;font-size:12px;color:#334155">
        <span style="font-size:10px;color:#94a3b8">${ultimoComent.data} · ${ultimoComent.autor}</span>
        <div>${(ultimoComent.texto||'').replace(/</g,'&lt;')}</div>
        ${hist.length > 1 ? `<button onclick="abrirComentariosPauta('${it.id}','${tipo}'${sheetArg})" style="background:none;border:none;color:${cor};font-size:11px;font-weight:600;cursor:pointer;padding:4px 0 0">+ ${hist.length-1} ${hist.length-1===1?'anterior':'anteriores'}</button>`:''}
      </div>` : ''}
    </div>`;
  };

  // Renderiza uma seção com cabeçalho
  const renderSecao = (titulo, descricao, lista) => {
    if (!lista.length) return '';
    let n = 0;
    return `
      <div style="margin-bottom:8px;padding:10px 14px;background:${cor}10;border-left:3px solid ${cor};border-radius:6px">
        <div style="font-size:12px;font-weight:700;color:${cor};letter-spacing:.5px;text-transform:uppercase">${titulo} <span style="background:${cor};color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px">${lista.length}</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${descricao}</div>
      </div>
      ${lista.map(it => { n++; return renderCard(it, n); }).join('')}
    `;
  };

  el.innerHTML =
    renderSecao('Itens da Pauta', 'Pontos cadastrados manualmente para a reunião.', itensPauta) +
    renderSecao('Tarefas do Grupo', 'Tarefas em aberto cujos responsáveis participam desta reunião.', itensTarefa);
}

// ───────── COMENTÁRIOS DA PAUTA ─────────
// Estrutura armazenada no campo "comentario" da planilha:
// JSON array: [{data, autor, texto}, ...] — mais recente PRIMEIRO

function _parseComentarios(raw){
  if(!raw) return [];
  try{
    if(typeof raw === 'string' && raw.trim().startsWith('[')) return JSON.parse(raw);
    // Fallback: texto plano vira um unico comentario
    return [{data:'—', autor:'—', texto:String(raw)}];
  }catch(_){ return [{data:'—', autor:'—', texto:String(raw)}]; }
}

function _formatSemana(dr){
  if(!dr) return '';
  // YYYY-MM-DD da segunda-feira
  const d = new Date(String(dr)+'T12:00:00');
  if(isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
}

let _pautaComAlvo = null; // {id, tipo, item}

async function abrirComentariosPauta(id, tipo, sheet){
  const aba = sheet || _pCfg(tipo).aba;
  document.getElementById('pcom-titulo').textContent = '💬 Comentários — carregando...';
  document.getElementById('pcom-historico').innerHTML = 'Carregando histórico...';
  document.getElementById('pcom-novo').value = '';
  document.getElementById('pcom-concluir').style.display = 'none';
  openM('m-pauta-com');
  // Busca o item para ter dados frescos
  try{
    const resp = await gasGet(GAS_CALENDAR, {action:'read', sheet:aba});
    const todos = gasParseRows(resp);
    const item = todos.find(x => String(x.id) === String(id));
    if(!item){ document.getElementById('pcom-historico').innerHTML = 'Item não encontrado.'; return; }
    // Campo do "titulo" varia: pauta tem 'item', tarefas tem 'titulo'
    const titulo = item.item || item.titulo || item.Titulo || '—';
    _pautaComAlvo = { id, tipo, sheet: aba, item: titulo, statusAtual: item.status };
    const badge = aba === 'TAREFAS' ? '📋 Tarefa' : '🗂️ Pauta';
    document.getElementById('pcom-titulo').textContent = `💬 ${badge} — ${titulo}`;
    document.getElementById('pcom-subtitulo').textContent = `Responsável: ${item.responsavel||'—'} · Status atual: ${item.status||'—'}`;
    const hist = _parseComentarios(item.comentario||item.Comentario||'');
    if(!hist.length){
      document.getElementById('pcom-historico').innerHTML = `<div style="text-align:center;color:#94a3b8;padding:14px;font-size:12px">Nenhum comentário ainda. Adicione o primeiro abaixo.</div>`;
    } else {
      document.getElementById('pcom-historico').innerHTML = hist.map(c => `
        <div style="padding:10px 12px;background:#f8fafc;border-left:3px solid ${_pCfg(tipo).cor};border-radius:0 8px 8px 0;margin-bottom:8px">
          <div style="font-size:10px;color:#94a3b8;font-weight:600;margin-bottom:3px">${c.data} · ${c.autor}</div>
          <div style="font-size:13px;color:#1e293b;white-space:pre-wrap">${(c.texto||'').replace(/</g,'&lt;')}</div>
        </div>`).join('');
    }
  }catch(e){
    console.error('[abrirComentariosPauta]',e);
    document.getElementById('pcom-historico').innerHTML = `Erro: ${e.message}`;
  }
}

async function adicionarComentarioPauta(){
  const txt = document.getElementById('pcom-novo')?.value?.trim();
  if(!txt){ toast('Digite o comentário.','err'); return; }
  if(!_pautaComAlvo){ return; }
  const aba = _pautaComAlvo.sheet || _pCfg(_pautaComAlvo.tipo).aba;
  try{
    const resp = await gasGet(GAS_CALENDAR, {action:'read', sheet:aba});
    const todos = gasParseRows(resp);
    const item = todos.find(x => String(x.id) === String(_pautaComAlvo.id));
    if(!item){ toast('Item nao encontrado.','err'); return; }
    const hist = _parseComentarios(item.comentario||item.Comentario||'');
    const novoComentario = {
      data: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      autor: CUR?.nome?.split(' ')[0] || 'Usuário',
      texto: txt
    };
    hist.unshift(novoComentario);
    await gasGet(GAS_CALENDAR, {action:'update', sheet:aba, id:_pautaComAlvo.id, data: JSON.stringify({comentario: JSON.stringify(hist)})});
    toast('💬 Comentário adicionado.','ok');
    document.getElementById('pcom-novo').value = '';
    abrirComentariosPauta(_pautaComAlvo.id, _pautaComAlvo.tipo, _pautaComAlvo.sheet);
  }catch(e){ console.error('[adicionarComentarioPauta]',e); toast('Erro: '+e.message,'err'); }
}

// Concluir item — comentario eh OPCIONAL.
// Salva data_conclusao com a semana atual (so aparece na pauta dessa semana).
async function concluirComComentario(){
  const txt = document.getElementById('pcom-novo')?.value?.trim();
  if(!_pautaComAlvo){ return; }
  const aba = _pautaComAlvo.sheet || _pCfg(_pautaComAlvo.tipo).aba;
  try{
    const updateData = { status: 'Concluído', data_conclusao: wkId(0) };
    if(txt){
      const resp = await gasGet(GAS_CALENDAR, {action:'read', sheet:aba});
      const todos = gasParseRows(resp);
      const item = todos.find(x => String(x.id) === String(_pautaComAlvo.id));
      const hist = _parseComentarios(item?.comentario||item?.Comentario||'');
      hist.unshift({
        data: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
        autor: CUR?.nome?.split(' ')[0] || 'Usuário',
        texto: '✅ CONCLUSÃO: '+txt
      });
      updateData.comentario = JSON.stringify(hist);
    }
    await gasGet(GAS_CALENDAR, {action:'update', sheet:aba, id:_pautaComAlvo.id, data: JSON.stringify(updateData)});
    closeM('m-pauta-com');
    toast(txt ? '✅ Concluído e registrado.' : '✅ Concluído.','ok');
    setTimeout(() => renderPauta(_pautaComAlvo.tipo), 600);
    // Tambem refresh a tarefas se o item era tarefa
    if(aba === 'TAREFAS' && typeof loadTar === 'function') setTimeout(loadTar, 800);
  }catch(e){ console.error('[concluirComComentario]',e); toast('Erro: '+e.message,'err'); }
}
function openPauta(tipo){
  document.getElementById('pi').value='';document.getElementById('ptipo').value=tipo;
  document.getElementById('pm-title').textContent='Pauta — '+_pCfg(tipo).lb;
  const g=GRUPOS[tipo];
  document.getElementById('pr').innerHTML=g.map(n=>`<option ${n===CUR.nome?'selected':''}>${n}</option>`).join('');
  openM('m-pauta');
}
async function savePauta(){
  const item=document.getElementById('pi').value.trim();
  if(!item){toast('Informe o item.','err');return;}
  const tipo=document.getElementById('ptipo').value;
  const off=_pOff(tipo);
  const resp=document.getElementById('pr').value;
  try{
    const aba=_pCfg(tipo).aba;
    const payload = {id:Date.now(), data_reuniao:wkId(off), item, responsavel:resp, status:'Pendente'};
    const r = await gasGet(GAS_CALENDAR, {action:'create', sheet:aba, data: JSON.stringify(payload)});
    if (r?.success === false) throw new Error(r.error||r.erro||'falha');
    closeM('m-pauta');toast('✅ Item adicionado!','ok');renderPauta(tipo);
  }catch(e){console.error('[savePauta]',e);toast('Erro: '+e.message,'err');}
}
async function updPauta(id,tipo,status){const aba=_pCfg(tipo).aba;try{const r=await gasGet(GAS_CALENDAR,{action:'update',sheet:aba,id,data:JSON.stringify({status})});console.log('[updPauta]',{id,status,r});return r;}catch(e){console.warn('updPauta:',e.message);throw e;}}

// Handler do onchange: ao concluir, oferece o modal de comentario (opcional).
async function _pautaStatusChange(id, tipo, status, sheet){
  if(status === 'Concluído'){
    await abrirComentariosPauta(id, tipo, sheet);
    const cBtn = document.getElementById('pcom-concluir');
    if(cBtn){
      cBtn.style.display = 'inline-flex';
      cBtn.textContent = '✅ Concluir item';
    }
    const textarea = document.getElementById('pcom-novo');
    if(textarea){
      textarea.placeholder = 'Comentário de conclusão (opcional) — pode concluir sem comentar se preferir.';
      textarea.focus();
    }
    return; // o status muda em concluirComComentario, com ou sem texto
  }
  const aba = sheet || _pCfg(tipo).aba;
  const card = event?.target?.closest('div[data-card]');
  if(card){ card.style.opacity = '.5'; card.style.pointerEvents = 'none'; }
  try{
    // Mudou para algo que NAO eh concluido → limpa data_conclusao
    const updateData = {status};
    if(!status.toLowerCase().includes('conclu')) updateData.data_conclusao = '';
    await gasGet(GAS_CALENDAR, {action:'update', sheet:aba, id, data: JSON.stringify(updateData)});
  }catch(e){
    toast?.('Erro ao salvar status: '+e.message,'err');
    if(card){ card.style.opacity = '1'; card.style.pointerEvents = ''; }
    return;
  }
  setTimeout(() => renderPauta(tipo), 600);
  if(aba === 'TAREFAS' && typeof loadTar === 'function') setTimeout(loadTar, 800);
}
async function delPauta(id,tipo){if(!confirm('Remover?'))return;const aba=_pCfg(tipo).aba;try{await gasGet(GAS_CALENDAR,{action:'delete',sheet:aba,id});}catch(e){console.warn(e);}renderPauta(tipo);}


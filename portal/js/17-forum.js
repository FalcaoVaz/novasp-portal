// ═══════════════════════════════════════════════════════════════
// Fórum dos Representantes — reunião trimestral dos corretores
// representantes. Só representantes + gerentes + admin veem.
// ═══════════════════════════════════════════════════════════════

const FORUM_TAG_LBL = {
  comissao:    '💰 Comissão',
  treinamento: '🎓 Treinamento',
  processos:   '⚙️ Processos',
  ferramentas: '🛠️ Ferramentas',
  clima:       '🤝 Clima',
  outros:      '📎 Outros'
};
const FORUM_STATUS_LBL = {
  proposta:  {lb:'Proposta',  cor:'#3b82f6', bg:'#dbeafe'},
  em_debate: {lb:'Em debate', cor:'#f59e0b', bg:'#fef3c7'},
  decidido:  {lb:'Decidido',  cor:'#10b981', bg:'#d1fae5'},
  arquivado: {lb:'Arquivado', cor:'#94a3b8', bg:'#f1f5f9'}
};

let _forumCiclosCache = [];
let _forumDetTopicoId = null;
// Total de representantes (denominador do X/N do "priorizar" e votacao)
const FORUM_TOTAL_REPS = 5;
// Quorum pra decisao automatica (3 de 5 = maioria simples)
const FORUM_QUORUM = 3;

// Emails do forum ATIVOS — precisa que o snippet portal/gas/forum-email.gs
// esteja implantado no GAS_EMAIL (com acaoForumNovoTopico e acaoForumDecisao).
// Se nao estiver, nao bloqueia UI — falha silenciosa no console.
const FORUM_EMAIL_ATIVO = true;
async function _forumDispararEmail(action, dados){
  if (!FORUM_EMAIL_ATIVO) return;
  try {
    if (typeof GAS_EMAIL === 'undefined') { console.warn('[forum] GAS_EMAIL nao definido'); return; }
    const url = GAS_EMAIL + '?action=' + encodeURIComponent(action)
              + '&data=' + encodeURIComponent(JSON.stringify(dados))
              + '&t=' + Date.now();
    const r = await fetch(url);
    console.log('[forum] email disparado:', action, await r.text().catch(()=>'?'));
  } catch(e) {
    console.warn('[forum] falha email:', e.message);
  }
}

// Trimestre atual (1..4) e ano.
function _forumTrimAtual(){
  const d = new Date();
  return { trimestre: Math.floor(d.getMonth()/3) + 1, ano: d.getFullYear() };
}
function _forumCicloLbl(t, a){ return `Q${t} ${a}`; }

async function carregarForum(){
  // Mostra card do home só pra quem pode acessar
  const card = document.getElementById('card-vnd-forum');
  if (card) card.style.display = (typeof podeAcessarForumVendas === 'function' && podeAcessarForumVendas()) ? '' : 'none';

  // Sanity: se usuário abriu a página sem permissão, joga pro home
  if (typeof podeAcessarForumVendas === 'function' && !podeAcessarForumVendas()) {
    document.getElementById('forum-lista').innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--muted)">Restrito a representantes e gerentes.</div>';
    return;
  }

  // Popula seletor de ciclos (trimestres). Garante o ciclo atual.
  await _forumGarantirCicloAtual();
  await _forumRecarregarCiclos();
  renderForum();
}

async function _forumRecarregarCiclos(){
  try {
    _forumCiclosCache = await db.get('vendas_forum_ciclos', '?order=ano.desc,trimestre.desc');
  } catch(_) {
    _forumCiclosCache = [];
  }
  const sel = document.getElementById('forum-ciclo');
  if (!sel) return;
  const atual = _forumTrimAtual();
  const atualId = _forumCiclosCache.find(c => c.trimestre===atual.trimestre && c.ano===atual.ano)?.id || '';
  sel.innerHTML = _forumCiclosCache.map(c => {
    const ehAtual = c.trimestre===atual.trimestre && c.ano===atual.ano;
    return `<option value="${c.id}">${_forumCicloLbl(c.trimestre, c.ano)}${ehAtual?' (atual)':''}${c.encerrado?' [encerrado]':''}</option>`;
  }).join('');
  if (atualId) sel.value = atualId;
}

async function _forumGarantirCicloAtual(){
  const {trimestre, ano} = _forumTrimAtual();
  try {
    const j = await db.get('vendas_forum_ciclos', `?trimestre=eq.${trimestre}&ano=eq.${ano}`);
    if (!j || !j.length) {
      await db.post('vendas_forum_ciclos', {trimestre, ano, encerrado:false});
    }
  } catch(_) {}
}

function _forumCicloSelecionado(){
  const id = document.getElementById('forum-ciclo')?.value;
  return _forumCiclosCache.find(c => c.id === id);
}

async function renderForum(){
  const box = document.getElementById('forum-lista');
  if (!box) return;
  const ciclo = _forumCicloSelecionado();
  if (!ciclo) {
    box.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)">Sem ciclo carregado.</div>';
    document.getElementById('kpi-forum-prop').textContent = '0';
    document.getElementById('kpi-forum-deb').textContent = '0';
    document.getElementById('kpi-forum-dec').textContent = '0';
    document.getElementById('kpi-forum-apoios').textContent = '0';
    return;
  }
  // Header: reunião info + botão marcar (só gerente/admin)
  const info = document.getElementById('forum-reuniao-info');
  const btnR = document.getElementById('forum-btn-reuniao');
  if (info) {
    if (ciclo.data_reuniao) {
      const d = new Date(ciclo.data_reuniao + 'T00:00:00');
      const dl = d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const diff = Math.round((d - hoje) / (86400000));
      const rel = diff===0 ? 'hoje' : (diff===1 ? 'amanhã' : (diff>0 ? `em ${diff}d` : `há ${-diff}d`));
      info.innerHTML = `<b>${dl}</b> <span style="color:#94a3b8;font-weight:400">· ${rel}</span>${ciclo.encerrado?' <span style="color:var(--danger);font-weight:700">[encerrado]</span>':''}`;
    } else {
      info.innerHTML = '<span style="color:#94a3b8">Sem data definida</span>';
    }
  }
  const podeMarcar = (typeof ehGerenteVendas === 'function' && ehGerenteVendas()) || (typeof CUR !== 'undefined' && CUR && CUR.admin);
  if (btnR) btnR.style.display = podeMarcar ? '' : 'none';
  const btnEnc = document.getElementById('forum-btn-encerrar');
  if (btnEnc) btnEnc.style.display = (podeMarcar && !ciclo.encerrado) ? '' : 'none';

  const fSt = document.getElementById('forum-filtro-status')?.value || '';
  const fTg = document.getElementById('forum-filtro-tag')?.value || '';
  let q = `?trimestre=eq.${ciclo.trimestre}&ano=eq.${ciclo.ano}`;
  if (fSt) q += `&status=eq.${fSt}`;
  if (fTg) q += `&tag=eq.${fTg}`;

  let topicos = [];
  try {
    topicos = await db.get('vendas_forum_topicos', q) || [];
  } catch(e) {
    box.innerHTML = `<div style="color:var(--danger);padding:20px;text-align:center">Erro: ${e.message}<br><small>Rodou o SQL forum_representantes.sql no Supabase?</small></div>`;
    return;
  }

  // Carrega apoios, comentários e votos em batch
  const ids = topicos.map(t => t.id);
  let apoios = [], coms = [], votos = [];
  if (ids.length) {
    const idsIn = `(${ids.map(encodeURIComponent).join(',')})`;
    try { apoios = await db.get('vendas_forum_apoios',       `?topico_id=in.${idsIn}`) || []; } catch(_) {}
    try { coms   = await db.get('vendas_forum_comentarios',  `?topico_id=in.${idsIn}&select=id,topico_id`) || []; } catch(_) {}
    try { votos  = await db.get('vendas_forum_votos',        `?topico_id=in.${idsIn}&select=topico_id,voto`) || []; } catch(_) {}
  }
  const apoiosPorTop = {}, comsPorTop = {}, votosPorTop = {};
  const meuNome = (typeof autorForumInfo === 'function') ? autorForumInfo().nome : '';
  const jaApoiei = {};
  apoios.forEach(a => {
    apoiosPorTop[a.topico_id] = (apoiosPorTop[a.topico_id]||0) + 1;
    if (a.autor_nome === meuNome) jaApoiei[a.topico_id] = true;
  });
  coms.forEach(c => { comsPorTop[c.topico_id] = (comsPorTop[c.topico_id]||0) + 1; });
  votos.forEach(v => {
    votosPorTop[v.topico_id] = votosPorTop[v.topico_id] || {ap:0, rp:0};
    if (v.voto === 'aprovar') votosPorTop[v.topico_id].ap++;
    else if (v.voto === 'reprovar') votosPorTop[v.topico_id].rp++;
  });

  // KPIs
  const nProp = topicos.filter(t=>t.status==='proposta').length;
  const nDeb  = topicos.filter(t=>t.status==='em_debate').length;
  const nDec  = topicos.filter(t=>t.status==='decidido').length;
  document.getElementById('kpi-forum-prop').textContent   = nProp;
  document.getElementById('kpi-forum-deb').textContent    = nDeb;
  document.getElementById('kpi-forum-dec').textContent    = nDec;
  document.getElementById('kpi-forum-apoios').textContent = apoios.length;

  // Ordena: apoios desc, depois criado_em desc
  topicos.sort((a,b) => {
    const aA = apoiosPorTop[a.id] || 0;
    const bA = apoiosPorTop[b.id] || 0;
    if (bA !== aA) return bA - aA;
    return (b.criado_em||'').localeCompare(a.criado_em||'');
  });

  if (!topicos.length) {
    box.innerHTML = `<div style="text-align:center;padding:48px;color:#94a3b8">
      <div style="font-size:48px;margin-bottom:12px">💬</div>
      <div style="font-size:15px;font-weight:600;color:#475569">Nenhum tópico neste ciclo${(fSt||fTg)?' com esses filtros':''}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:6px">Clique em <b>+ Novo tópico</b> pra propor uma pauta</div>
    </div>`;
    return;
  }

  box.innerHTML = topicos.map(t => {
    const st = FORUM_STATUS_LBL[t.status] || FORUM_STATUS_LBL.proposta;
    const tagLbl = FORUM_TAG_LBL[t.tag] || (t.tag||'—');
    const nApoios = apoiosPorTop[t.id] || 0;
    const nComs = comsPorTop[t.id] || 0;
    const apoiado = !!jaApoiei[t.id];
    const dt = new Date(t.criado_em||Date.now()).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
    const vAp = (votosPorTop[t.id]||{}).ap || 0;
    const vRp = (votosPorTop[t.id]||{}).rp || 0;
    const decisaoBadge = t.decisao_votacao === 'aprovado'
      ? '<span style="font-size:10px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">✓ Aprovado</span>'
      : t.decisao_votacao === 'reprovado'
      ? '<span style="font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">✗ Reprovado</span>'
      : '';
    const ehDisc = t.tipo === 'discussao';
    const tipoBadge = ehDisc
      ? '<span style="font-size:10px;background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">💬 Discussão</span>'
      : '<span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">🗳️ Votação</span>';
    // Badge de prazo (só em votacao)
    let prazoBadge = '';
    if (!ehDisc && t.prazo_votacao) {
      const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
      const pd = new Date(t.prazo_votacao + 'T00:00:00');
      const diff2 = Math.round((pd - hoje2) / 86400000);
      if (diff2 < 0) prazoBadge = '<span style="font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-weight:700">⏰ Prazo vencido</span>';
      else if (diff2 === 0) prazoBadge = '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:700">⏰ Vence hoje</span>';
      else if (diff2 <= 2) prazoBadge = `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:700">⏰ ${diff2}d</span>`;
      else prazoBadge = `<span style="font-size:10px;color:#64748b">⏰ ${diff2}d</span>`;
    }
    return `<div class="card" style="padding:16px;margin-bottom:10px;cursor:pointer;border-left:4px solid ${st.cor}" onclick="abrirDetalheForum('${t.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-size:10px;background:${st.bg};color:${st.cor};padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${st.lb}</span>
            <span style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px">${tagLbl}</span>
            ${tipoBadge}
            ${decisaoBadge}
            ${prazoBadge}
            ${!ehDisc && (vAp+vRp)>0 ? `<span style="font-size:11px;color:#64748b">🗳️ ${vAp}👍 · ${vRp}👎</span>` : ''}
          </div>
          <div style="font-size:15px;font-weight:700;color:#1e293b;line-height:1.35">${_forumEsc(t.titulo)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:6px">
            por <b>${_forumEsc(t.autor_nome||'—')}</b> · ${_forumEsc(t.autor_equipe||'')} · ${dt}
          </div>
          ${t.deliberacao ? `<div style="margin-top:8px;padding:8px 10px;background:#ecfdf5;border-left:3px solid #10b981;border-radius:4px;font-size:12px;color:#065f46"><b>Deliberação:</b> ${_forumEsc(t.deliberacao).substring(0,180)}${t.deliberacao.length>180?'…':''}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;min-width:100px">
          <button onclick="event.stopPropagation();apoiarForumTopico('${t.id}')" title="${apoiado?'Remover minha priorização deste tópico':'Marcar este tópico como prioridade pra reunião — quanto mais representantes priorizarem, mais alto vai na pauta'}" style="background:${apoiado?'#fef3c7':'#f8fafc'};border:1.5px solid ${apoiado?'#f59e0b':'var(--borda)'};border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:700;color:${apoiado?'#92400e':'#64748b'};display:flex;align-items:center;gap:6px;white-space:nowrap">
            ⭐ <span>${nApoios}/${FORUM_TOTAL_REPS}</span>
          </button>
          <span style="font-size:10px;color:#94a3b8">${apoiado?'você priorizou':'priorize p/ pauta'}</span>
          <span style="font-size:11px;color:#94a3b8">💬 ${nComs} coment.</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _forumEsc(s){
  return String(s||'').replace(/[&<>"']/g, ch => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
  ));
}

function abrirNovoForumTopico(){
  const ciclo = _forumCicloSelecionado();
  if (!ciclo) { alert('Ciclo não carregado'); return; }
  if (ciclo.encerrado && !(typeof CUR !== 'undefined' && CUR && CUR.admin)) {
    alert('Este trimestre já foi encerrado.'); return;
  }
  document.getElementById('ft-titulo').value = '';
  document.getElementById('ft-tag').value = 'processos';
  document.getElementById('ft-desc').value = '';
  // Prazo default: hoje + 7 dias (pode limpar pra "sem prazo")
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('ft-prazo').value = d.toISOString().slice(0,10);
  const rVot = document.querySelector('input[name="ft-tipo"][value="votacao"]');
  if (rVot) rVot.checked = true;
  _atualizarTipoLbl();
  openM('m-forum-novo');
}
// Destaque visual do card selecionado + mostra/esconde campo de prazo
function _atualizarTipoLbl(){
  const vot = document.querySelector('input[name="ft-tipo"][value="votacao"]')?.checked;
  const lblV = document.getElementById('ft-tipo-lbl-vot');
  const lblD = document.getElementById('ft-tipo-lbl-dis');
  if (lblV) lblV.style.borderColor = vot ? '#3b82f6' : 'var(--borda)';
  if (lblV) lblV.style.background  = vot ? '#eff6ff' : '#fff';
  if (lblD) lblD.style.borderColor = !vot ? '#8b5cf6' : 'var(--borda)';
  if (lblD) lblD.style.background  = !vot ? '#f5f3ff' : '#fff';
  // Discussao nao tem prazo — esconde
  const wrap = document.getElementById('ft-prazo-wrap');
  if (wrap) wrap.style.display = vot ? '' : 'none';
}

async function salvarForumTopico(){
  const titulo = document.getElementById('ft-titulo').value.trim();
  const tag = document.getElementById('ft-tag').value;
  const desc = document.getElementById('ft-desc').value.trim();
  const tipo = document.querySelector('input[name="ft-tipo"]:checked')?.value || 'votacao';
  const prazo = (tipo === 'votacao') ? (document.getElementById('ft-prazo')?.value || null) : null;
  if (!titulo) { alert('Informe o título'); return; }
  const ciclo = _forumCicloSelecionado();
  const aut = (typeof autorForumInfo === 'function') ? autorForumInfo() : {nome:'',equipe:''};
  const payload = {
    trimestre:      ciclo.trimestre,
    ano:            ciclo.ano,
    titulo:         titulo,
    tag:            tag,
    tipo:           tipo,
    prazo_votacao:  prazo,
    descricao:      desc || null,
    autor_nome:     aut.nome,
    autor_equipe:   aut.equipe,
    status:         'proposta'
  };
  try {
    const criado = await db.post('vendas_forum_topicos', payload);
    closeM('m-forum-novo');
    renderForum();
    // Notifica reps + gerentes por email (nao bloqueia)
    const t = Array.isArray(criado) ? criado[0] : criado;
    _forumDispararEmail('forum_novo_topico', {
      titulo, tag_label: FORUM_TAG_LBL[tag] || tag,
      tipo, prazo_votacao: prazo,
      descricao: desc, autor_nome: aut.nome, autor_equipe: aut.equipe,
      trimestre: ciclo.trimestre, ano: ciclo.ano,
      topico_id: t?.id || '',
      link: 'https://novasp.netlify.app/#forum'
    });
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

// Votacao aprovar/reprovar (so representantes). 3+ decide.
async function votarForumTopico(topId, voto){
  if (typeof ehRepresentanteVendas === 'function' && !ehRepresentanteVendas()) {
    alert('Apenas representantes podem votar.');
    return;
  }
  const aut = (typeof autorForumInfo === 'function') ? autorForumInfo() : {nome:''};
  if (!aut.nome) { alert('Sem autor identificado'); return; }
  // Checa prazo antes de aceitar voto
  try {
    const topArr = await db.get('vendas_forum_topicos', `?id=eq.${topId}&select=prazo_votacao`);
    const p = topArr?.[0]?.prazo_votacao;
    if (p) {
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      if (new Date(p + 'T00:00:00') < hoje) {
        alert('O prazo desta votação já venceu.');
        return;
      }
    }
  } catch(_) {}
  try {
    // Verifica voto existente
    const j = await db.get('vendas_forum_votos',
      `?topico_id=eq.${topId}&autor_nome=eq.${encodeURIComponent(aut.nome)}`);
    if (j && j.length) {
      if (j[0].voto === voto) {
        // Clicou no mesmo → cancela voto
        await db.del('vendas_forum_votos', j[0].id);
      } else {
        // Mudou o voto
        await db.patch('vendas_forum_votos', j[0].id, {voto, criado_em: new Date().toISOString()});
      }
    } else {
      await db.post('vendas_forum_votos', {topico_id: topId, autor_nome: aut.nome, voto});
    }
    // Reconta e decide
    await _forumChecarDecisao(topId);
    if (_forumDetTopicoId === topId) await renderDetalheForum(topId);
    renderForum();
  } catch(e) {
    alert('Erro ao votar: ' + e.message);
  }
}

// Se atingir 3+ aprovar OU 3+ reprovar, marca decisao no topico e
// dispara email. Se cair abaixo do quorum, reverte a decisao.
async function _forumChecarDecisao(topId){
  const [votos, topArr] = await Promise.all([
    db.get('vendas_forum_votos', `?topico_id=eq.${topId}`).catch(()=>[]),
    db.get('vendas_forum_topicos', `?id=eq.${topId}`).catch(()=>[])
  ]);
  const top = topArr && topArr[0];
  if (!top) return;
  if (top.tipo === 'discussao') return;  // discussao nao tem decisao automatica
  const aprovar = votos.filter(v => v.voto === 'aprovar').length;
  const reprovar = votos.filter(v => v.voto === 'reprovar').length;
  let novaDecisao = null;
  if (aprovar >= FORUM_QUORUM) novaDecisao = 'aprovado';
  else if (reprovar >= FORUM_QUORUM) novaDecisao = 'reprovado';
  if (top.decisao_votacao !== novaDecisao) {
    await db.patch('vendas_forum_topicos', topId, {
      decisao_votacao: novaDecisao,
      atualizado_em: new Date().toISOString()
    });
    // So notifica quando cruza pra decidido (nao quando volta atras)
    if (novaDecisao) {
      _forumDispararEmail('forum_decisao', {
        titulo: top.titulo,
        decisao: novaDecisao,
        aprovacoes: aprovar,
        reprovacoes: reprovar,
        autor_nome: top.autor_nome,
        autor_equipe: top.autor_equipe,
        topico_id: top.id,
        link: 'https://novasp.netlify.app/#forum'
      });
    }
  }
}

async function apoiarForumTopico(id){
  const aut = (typeof autorForumInfo === 'function') ? autorForumInfo() : {nome:''};
  if (!aut.nome) { alert('Sem autor identificado'); return; }
  try {
    // Verifica se já apoiou
    const j = await db.get('vendas_forum_apoios',
      `?topico_id=eq.${id}&autor_nome=eq.${encodeURIComponent(aut.nome)}`);
    if (j && j.length) {
      // Já apoiou → remove
      await db.del('vendas_forum_apoios', j[0].id);
    } else {
      await db.post('vendas_forum_apoios', {topico_id: id, autor_nome: aut.nome});
    }
    // Re-render preservando modal se aberto
    if (_forumDetTopicoId === id) {
      await renderDetalheForum(id);
    }
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

async function abrirDetalheForum(id){
  _forumDetTopicoId = id;
  openM('m-forum-det');
  await renderDetalheForum(id);
}

async function renderDetalheForum(id){
  const body = document.getElementById('mfd-body');
  const tit = document.getElementById('mfd-titulo');
  body.innerHTML = '<div style="padding:32px;text-align:center;color:#94a3b8">Carregando…</div>';
  let top;
  try {
    const arr = await db.get('vendas_forum_topicos', `?id=eq.${id}`);
    top = arr && arr[0];
  } catch(e) { body.innerHTML = `<div style="color:var(--danger)">Erro: ${e.message}</div>`; return; }
  if (!top) { body.innerHTML = '<div style="color:var(--danger)">Tópico não encontrado.</div>'; return; }

  tit.textContent = top.titulo;

  const [apoios, coms, votos] = await Promise.all([
    db.get('vendas_forum_apoios',      `?topico_id=eq.${id}`).catch(()=>[]),
    db.get('vendas_forum_comentarios', `?topico_id=eq.${id}&order=criado_em.asc`).catch(()=>[]),
    db.get('vendas_forum_votos',       `?topico_id=eq.${id}`).catch(()=>[])
  ]);
  const votosAprovar  = votos.filter(v => v.voto === 'aprovar');
  const votosReprovar = votos.filter(v => v.voto === 'reprovar');
  const meuVoto = votos.find(v => v.autor_nome === ((typeof autorForumInfo === 'function') ? autorForumInfo().nome : ''))?.voto;
  const ehRepr = (typeof ehRepresentanteVendas === 'function') && ehRepresentanteVendas();
  const meuNome = (typeof autorForumInfo === 'function') ? autorForumInfo().nome : '';
  const jaApoiei = apoios.some(a => a.autor_nome === meuNome);
  const st = FORUM_STATUS_LBL[top.status] || FORUM_STATUS_LBL.proposta;
  const podeGerenciar = (typeof ehGerenteVendas === 'function' && ehGerenteVendas()) || (typeof CUR !== 'undefined' && CUR && CUR.admin);

  const dt = new Date(top.criado_em||Date.now()).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

  const comsHtml = coms.length ? coms.map(c => {
    const cdt = new Date(c.criado_em||Date.now()).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="padding:10px 12px;background:#f8fafc;border-radius:8px;margin-bottom:8px;border-left:3px solid #cbd5e1">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
        <b style="font-size:13px;color:#1e293b">${_forumEsc(c.autor_nome||'—')} <span style="color:#64748b;font-weight:400">(${_forumEsc(c.autor_equipe||'')})</span></b>
        <span style="font-size:11px;color:#94a3b8">${cdt}</span>
      </div>
      <div style="font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.5">${_forumEsc(c.texto)}</div>
    </div>`;
  }).join('') : '<div style="text-align:center;color:#94a3b8;padding:14px;font-size:12px;font-style:italic">Nenhum comentário ainda — seja o primeiro</div>';

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;background:${st.bg};color:${st.cor};padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${st.lb}</span>
      <span style="font-size:11px;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px">${FORUM_TAG_LBL[top.tag]||top.tag||'—'}</span>
      <span style="font-size:12px;color:#64748b;margin-left:auto">por <b>${_forumEsc(top.autor_nome||'—')}</b> · ${_forumEsc(top.autor_equipe||'')} · ${dt}</span>
    </div>

    ${top.descricao ? `<div style="padding:12px 14px;background:#f8fafc;border-radius:8px;font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.55;margin-bottom:14px">${_forumEsc(top.descricao)}</div>` : ''}

    <div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--borda);border-bottom:1px solid var(--borda);margin-bottom:14px;flex-wrap:wrap">
      <button onclick="apoiarForumTopico('${top.id}')" title="${jaApoiei?'Remover minha priorização':'Marcar como prioridade pra reunião'}" style="background:${jaApoiei?'#fef3c7':'#f8fafc'};border:1.5px solid ${jaApoiei?'#f59e0b':'var(--borda)'};border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:700;color:${jaApoiei?'#92400e':'#64748b'}">
        ⭐ ${jaApoiei?'Priorizado por você':'Priorizar pra pauta'} · ${apoios.length}/${FORUM_TOTAL_REPS}
      </button>
      <span style="font-size:11px;color:#94a3b8">
        ${apoios.length ? 'Priorizado por: ' + apoios.map(a=>_forumEsc(a.autor_nome)).join(', ') : 'Ninguém priorizou ainda'}
      </span>
      ${podeGerenciar ? `
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:#64748b">Status:</span>
          <select onchange="mudarStatusForum('${top.id}', this.value)" style="padding:4px 8px;border:1px solid var(--borda);border-radius:6px;font-size:12px">
            ${Object.entries(FORUM_STATUS_LBL).map(([k,v]) => `<option value="${k}" ${top.status===k?'selected':''}>${v.lb}</option>`).join('')}
          </select>
          <button class="btn btn-o bsm" style="color:var(--danger)" onclick="excluirForumTopico('${top.id}')">🗑️</button>
        </div>
      ` : ''}
    </div>

    <!-- Bloco de votacao ou discussao conforme o tipo do topico -->
    ${_forumBlocoInteracao(top, votos, votosAprovar, votosReprovar, coms, meuVoto, ehRepr)}

    ${podeGerenciar ? `
      <div style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Deliberação da reunião</label>
        <textarea id="mfd-deliberacao" rows="2" style="width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:6px;font-size:13px;font-family:inherit" placeholder="Consolidado após reunião: decisão, próximo passo, responsável…">${_forumEsc(top.deliberacao||'')}</textarea>
        <button class="btn btn-o bsm" style="margin-top:6px" onclick="salvarDeliberacao('${top.id}')">💾 Salvar deliberação</button>
      </div>
    ` : (top.deliberacao ? `
      <div style="margin-bottom:14px;padding:12px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px">
        <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Deliberação</div>
        <div style="font-size:13px;color:#064e3b;white-space:pre-wrap">${_forumEsc(top.deliberacao)}</div>
      </div>` : '')}

    <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">💬 Comentários (${coms.length})</div>
    ${comsHtml}

    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--borda)">
      <textarea id="mfd-novo-com" rows="2" style="width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:6px;font-size:13px;font-family:inherit" placeholder="Adicionar comentário…"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button class="btn btn-p bsm" onclick="salvarComentarioForum('${top.id}')">Comentar</button>
      </div>
    </div>
  `;
}

async function salvarComentarioForum(topId){
  const el = document.getElementById('mfd-novo-com');
  const txt = (el?.value||'').trim();
  if (!txt) return;
  const aut = (typeof autorForumInfo === 'function') ? autorForumInfo() : {nome:'',equipe:''};
  try {
    await db.post('vendas_forum_comentarios', {
      topico_id: topId,
      texto: txt,
      autor_nome: aut.nome,
      autor_equipe: aut.equipe
    });
    if (el) el.value = '';
    await renderDetalheForum(topId);
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

async function salvarDeliberacao(id){
  const el = document.getElementById('mfd-deliberacao');
  const txt = (el?.value||'').trim();
  try {
    await db.patch('vendas_forum_topicos', id, {
      deliberacao: txt || null,
      atualizado_em: new Date().toISOString()
    });
    await renderDetalheForum(id);
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

async function mudarStatusForum(id, novo){
  try {
    await db.patch('vendas_forum_topicos', id, {
      status: novo,
      atualizado_em: new Date().toISOString()
    });
    await renderDetalheForum(id);
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

async function excluirForumTopico(id){
  if (!confirm('Excluir este tópico e todos os comentários/apoios?')) return;
  try {
    await db.del('vendas_forum_topicos', id);
    closeM('m-forum-det');
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

function abrirDataReuniao(){
  const ciclo = _forumCicloSelecionado();
  if (!ciclo) return;
  document.getElementById('fr-data').value = ciclo.data_reuniao || '';
  document.getElementById('fr-encerrado').checked = !!ciclo.encerrado;
  openM('m-forum-reuniao');
}

// Bloco central do modal detalhe: votacao (com aprovar/reprovar) OU
// discussao (só participação). Sempre mostra QUEM ainda nao opinou —
// diferencia por tipo: no votacao, "opinar" = votar; na discussao, comentar.
function _forumBlocoInteracao(top, votos, votosAp, votosRp, coms, meuVoto, ehRepr){
  const ehDiscussao = top.tipo === 'discussao';
  const listaReps = (typeof REPRESENTANTES_EQUIPE === 'object' && REPRESENTANTES_EQUIPE)
    ? Object.entries(REPRESENTANTES_EQUIPE).map(([eq, n]) => ({equipe: eq, nome: n}))
    : [];
  // Quem ja opinou? Se votacao: quem votou. Se discussao: quem comentou.
  const opinaram = new Set();
  if (ehDiscussao) {
    (coms||[]).forEach(c => c.autor_nome && opinaram.add(String(c.autor_nome).toLowerCase()));
  } else {
    (votos||[]).forEach(v => v.autor_nome && opinaram.add(String(v.autor_nome).toLowerCase()));
  }
  const opinaramNomes = listaReps.filter(r => opinaram.has(r.nome.toLowerCase()));
  const faltantes = listaReps.filter(r => !opinaram.has(r.nome.toLowerCase()));

  const badgeFalta = faltantes.length ? `
    <div style="margin-top:10px;padding:8px 10px;background:#fef9c3;border-left:3px solid #eab308;border-radius:6px;font-size:12px;color:#713f12">
      <b>⏳ Aguardando ${ehDiscussao?'opinião':'voto'} de ${faltantes.length} representante${faltantes.length>1?'s':''}:</b>
      ${faltantes.map(r => `${_forumEsc(r.nome)} <span style="color:#a16207;font-weight:400">(${r.equipe})</span>`).join(' · ')}
    </div>` : `
    <div style="margin-top:10px;padding:8px 10px;background:#ecfdf5;border-left:3px solid #10b981;border-radius:6px;font-size:12px;color:#065f46">
      ✅ Todos os ${listaReps.length} representantes já ${ehDiscussao?'opinaram':'votaram'}
    </div>`;

  if (ehDiscussao) {
    // Bloco de DISCUSSAO: sem botoes de votar. So mostra participacao.
    return `<div style="margin-bottom:14px;padding:12px;border-radius:8px;background:#f5f3ff;border-left:4px solid #8b5cf6">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:#5b21b6;text-transform:uppercase;letter-spacing:.05em;font-weight:700">💬 Tópico só para discussão</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">Este tópico não tem votação de decisão — só debate. Comente abaixo.</div>
        </div>
        <span style="font-size:11px;background:#ede9fe;color:#5b21b6;padding:4px 10px;border-radius:6px;font-weight:700">DISCUSSÃO</span>
      </div>
      ${opinaramNomes.length ? `<div style="font-size:11px;color:#64748b;margin-top:8px"><b style="color:#065f46">✍️ Já opinaram:</b> ${opinaramNomes.map(r=>_forumEsc(r.nome)).join(', ')}</div>` : ''}
      ${badgeFalta}
    </div>`;
  }

  // Prazo: calcula status (sem prazo / faltam X dias / vence hoje / vencido)
  let prazoHtml = '';
  let prazoVencido = false;
  if (top.prazo_votacao) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const p = new Date(top.prazo_votacao + 'T00:00:00');
    const diff = Math.round((p - hoje) / 86400000);
    const dl = p.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    if (diff < 0) {
      prazoVencido = true;
      prazoHtml = `<div style="margin-bottom:8px;padding:6px 10px;background:#fee2e2;border-left:3px solid #ef4444;border-radius:6px;font-size:11px;color:#991b1b"><b>⏰ Prazo vencido</b> (${dl}) — não aceita mais votos.</div>`;
    } else if (diff === 0) {
      prazoHtml = `<div style="margin-bottom:8px;padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:11px;color:#92400e"><b>⏰ Vence hoje</b> (${dl}) — vote antes do fim do dia.</div>`;
    } else if (diff <= 2) {
      prazoHtml = `<div style="margin-bottom:8px;padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:11px;color:#92400e"><b>⏰ Vence em ${diff} dia${diff>1?'s':''}</b> (${dl})</div>`;
    } else {
      prazoHtml = `<div style="margin-bottom:8px;padding:6px 10px;background:#eff6ff;border-left:3px solid #3B82F6;border-radius:6px;font-size:11px;color:#1e40af"><b>⏰ Prazo:</b> ${dl} (faltam ${diff} dias)</div>`;
    }
  }

  // Bloco de VOTACAO
  return `<div style="margin-bottom:14px;padding:12px;border-radius:8px;background:${top.decisao_votacao==='aprovado'?'#ecfdf5':top.decisao_votacao==='reprovado'?'#fef2f2':'#f8fafc'};border-left:4px solid ${top.decisao_votacao==='aprovado'?'#10b981':top.decisao_votacao==='reprovado'?'#ef4444':'#cbd5e1'}">
    ${prazoHtml}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <div>
        <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.05em;font-weight:700">🗳️ Votação da decisão · ${FORUM_QUORUM} de ${FORUM_TOTAL_REPS} decide</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">${votos.length}/${FORUM_TOTAL_REPS} representantes votaram · ${votosAp.length} aprovaram · ${votosRp.length} reprovaram</div>
      </div>
      ${top.decisao_votacao ? `<span style="font-size:11px;background:${top.decisao_votacao==='aprovado'?'#d1fae5':'#fee2e2'};color:${top.decisao_votacao==='aprovado'?'#065f46':'#991b1b'};padding:4px 10px;border-radius:6px;font-weight:800;text-transform:uppercase;letter-spacing:.05em">✓ ${top.decisao_votacao}</span>` : (prazoVencido ? '<span style="font-size:11px;background:#f1f5f9;color:#475569;padding:4px 10px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Sem decisão</span>' : '')}
    </div>
    ${ehRepr && !prazoVencido ? `
      <div style="display:flex;gap:8px;margin-top:6px">
        <button onclick="votarForumTopico('${top.id}','aprovar')" style="flex:1;background:${meuVoto==='aprovar'?'#d1fae5':'#fff'};border:1.5px solid ${meuVoto==='aprovar'?'#10b981':'var(--borda)'};border-radius:8px;padding:8px;cursor:pointer;font-weight:700;color:${meuVoto==='aprovar'?'#065f46':'#475569'}">
          👍 ${meuVoto==='aprovar'?'Aprovado por você':'Aprovar'} · ${votosAp.length}
        </button>
        <button onclick="votarForumTopico('${top.id}','reprovar')" style="flex:1;background:${meuVoto==='reprovar'?'#fee2e2':'#fff'};border:1.5px solid ${meuVoto==='reprovar'?'#ef4444':'var(--borda)'};border-radius:8px;padding:8px;cursor:pointer;font-weight:700;color:${meuVoto==='reprovar'?'#991b1b':'#475569'}">
          👎 ${meuVoto==='reprovar'?'Reprovado por você':'Reprovar'} · ${votosRp.length}
        </button>
      </div>
      ${meuVoto ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px;text-align:center">Clique no mesmo botão pra cancelar seu voto</div>` : ''}
    ` : `
      <div style="display:flex;gap:8px;margin-top:6px">
        <div style="flex:1;background:#f8fafc;border:1px solid var(--borda);border-radius:8px;padding:8px;text-align:center;font-weight:700;color:#065f46">👍 ${votosAp.length} aprovou</div>
        <div style="flex:1;background:#f8fafc;border:1px solid var(--borda);border-radius:8px;padding:8px;text-align:center;font-weight:700;color:#991b1b">👎 ${votosRp.length} reprovou</div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:4px;text-align:center">${prazoVencido ? 'Prazo encerrado — votos bloqueados' : 'Só representantes votam'}</div>
    `}
    ${votos.length ? `<div style="font-size:11px;color:#64748b;margin-top:8px;line-height:1.5">
      ${votosAp.length ? `<b style="color:#065f46">👍 A favor:</b> ${votosAp.map(v=>_forumEsc(v.autor_nome)).join(', ')}<br>` : ''}
      ${votosRp.length ? `<b style="color:#991b1b">👎 Contra:</b> ${votosRp.map(v=>_forumEsc(v.autor_nome)).join(', ')}` : ''}
    </div>` : ''}
    ${!prazoVencido ? badgeFalta : ''}
  </div>`;
}

async function salvarDataReuniao(){
  const ciclo = _forumCicloSelecionado();
  if (!ciclo) return;
  const data = document.getElementById('fr-data').value || null;
  const encerrado = document.getElementById('fr-encerrado').checked;
  try {
    await db.patch('vendas_forum_ciclos', ciclo.id, {
      data_reuniao: data,
      encerrado: encerrado
    });
    closeM('m-forum-reuniao');
    await _forumRecarregarCiclos();
    renderForum();
  } catch(e) {
    alert('Erro: ' + e.message);
  }
}

// Encerra ciclo atual + cria proximo trimestre + migra topicos ativos.
// Regra: topicos em 'proposta' ou 'em_debate' migram (mantem apoios,
// comentarios e votos). 'decidido' e 'arquivado' ficam no ciclo antigo
// como historico consultavel.
async function encerrarCicloEAbrirProximo(){
  const ciclo = _forumCicloSelecionado();
  if (!ciclo) return;
  if (ciclo.encerrado) { alert('Este ciclo ja esta encerrado.'); return; }

  // Descobre proximo trimestre (Q4->Q1 do ano seguinte)
  let proxTrim = ciclo.trimestre + 1;
  let proxAno  = ciclo.ano;
  if (proxTrim > 4) { proxTrim = 1; proxAno++; }
  const proxLbl = 'Q' + proxTrim + ' ' + proxAno;
  const cicloLbl = 'Q' + ciclo.trimestre + ' ' + ciclo.ano;

  // Preview: quantos topicos migram vs ficam
  let ativos = 0, historico = 0;
  try {
    const arr = await db.get('vendas_forum_topicos',
      `?trimestre=eq.${ciclo.trimestre}&ano=eq.${ciclo.ano}&select=id,status`);
    (arr||[]).forEach(t => {
      if (t.status === 'proposta' || t.status === 'em_debate') ativos++;
      else historico++;
    });
  } catch(_) {}

  const msg = `⚠️ Atenção: esta ação avança pro PRÓXIMO trimestre.\n\n` +
    `De: ${cicloLbl} (será marcado como encerrado)\n` +
    `Pra: ${proxLbl} (novo ciclo aberto)\n\n` +
    `• ${ativos} tópico${ativos!==1?'s':''} em proposta / em debate migram pro ${proxLbl}\n` +
    `• ${historico} tópico${historico!==1?'s':''} decidido/arquivado ficam em ${cicloLbl} como histórico\n\n` +
    `Só clique OK se REALMENTE quer encerrar ${cicloLbl}.\n` +
    `Apoios, comentários e votos ficam preservados nos migrados.`;
  if (!confirm(msg)) return;

  try {
    // 1) Cria proximo ciclo (ou reusa se ja existe)
    let novoCiclo;
    const jaExiste = _forumCiclosCache.find(c => c.trimestre===proxTrim && c.ano===proxAno);
    if (jaExiste) {
      novoCiclo = jaExiste;
    } else {
      const criado = await db.post('vendas_forum_ciclos', {
        trimestre: proxTrim, ano: proxAno, encerrado: false
      });
      novoCiclo = Array.isArray(criado) ? criado[0] : criado;
    }

    // 2) Migra topicos ativos
    // PostgREST aceita PATCH com filtro. Uso db.get pra pegar ids
    // e faco patches individuais (mais previsivel + apoios ficam pelo id).
    const topAtivos = await db.get('vendas_forum_topicos',
      `?trimestre=eq.${ciclo.trimestre}&ano=eq.${ciclo.ano}&status=in.(proposta,em_debate)&select=id`);
    for (const t of (topAtivos||[])) {
      await db.patch('vendas_forum_topicos', t.id, {
        trimestre: proxTrim,
        ano: proxAno,
        atualizado_em: new Date().toISOString()
      });
    }

    // 3) Marca ciclo antigo como encerrado
    await db.patch('vendas_forum_ciclos', ciclo.id, { encerrado: true });

    // 4) Atualiza UI: recarrega ciclos e seleciona o novo
    await _forumRecarregarCiclos();
    const sel = document.getElementById('forum-ciclo');
    if (sel && novoCiclo?.id) sel.value = novoCiclo.id;
    renderForum();

    alert(`✅ ${cicloLbl} encerrado.\n${topAtivos?.length || 0} tópicos migrados pra ${proxLbl}.\n\nDica: marque a data da próxima reunião pelo botão 📅.`);
  } catch(e) {
    alert('Erro ao encerrar ciclo: ' + e.message);
  }
}

// AGENDA
function getMon(off=0){const d=new Date(),dy=d.getDay()||7;d.setDate(d.getDate()-dy+1+off*7);d.setHours(0,0,0,0);return d;}

// Normaliza nomes: lowercase, sem acentos, sem caracteres especiais
function _agNormNome(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9\s]/g,'')
    .replace(/\s+/g,' ').trim();
}

// Pra cada nome encontrado nos eventos, tenta casar com um usuário canônico
// (USERS). Retorna a lista de canônicos que aparecem na agenda, com array
// de variações pra filtrar depois.
function _agParticipantesCanonicos(evs){
  // Coleta todos os nomes únicos dos eventos
  const nomesRaw = new Set();
  evs.forEach(e => {
    String(e.responsavel||e.Responsavel||'').split(/[,;]/).forEach(n => {
      const t = n.trim(); if (t) nomesRaw.add(t);
    });
  });

  // Mapa de canônicos: { chaveNorm: { nome: 'canonical', variacoes: Set } }
  const canonicos = {};

  // Função: dada uma string, tenta achar usuário em USERS que melhor casa.
  // Match por: nome completo igual, primeira palavra igual, ou QUALQUER palavra
  // do nome do usuário aparece no texto buscado.
  const matchUsuario = raw => {
    if (!Array.isArray(USERS) || !USERS.length) return null;
    const rawNorm = _agNormNome(raw);
    if (!rawNorm) return null;
    const rawPalavras = rawNorm.split(' ');

    // 1) Igualdade total
    for (const u of USERS) {
      if (_agNormNome(u.nome) === rawNorm) return u.nome;
    }
    // 2) Match por primeira palavra (Rodrigo → Rodrigo Falcão Vaz)
    for (const u of USERS) {
      const uPalavras = _agNormNome(u.nome).split(' ');
      if (uPalavras[0] && uPalavras[0] === rawPalavras[0]) return u.nome;
    }
    // 3) Match por sobrenome (Nogueira → Leandro Nogueira)
    for (const u of USERS) {
      const uPalavras = _agNormNome(u.nome).split(' ');
      // Se alguma palavra (≥4 chars) do raw bate com alguma palavra do user → match
      const intersecao = rawPalavras.find(p => p.length >= 4 && uPalavras.includes(p));
      if (intersecao) return u.nome;
    }
    return null;
  };

  for (const raw of nomesRaw) {
    const canonical = matchUsuario(raw) || raw;
    const chave = _agNormNome(canonical);
    if (!canonicos[chave]) canonicos[chave] = { nome: canonical, variacoes: new Set() };
    canonicos[chave].variacoes.add(raw);
    canonicos[chave].variacoes.add(canonical);
  }

  return Object.values(canonicos);
}

// ─── INTERCALAÇÃO ADM × JURÍDICO (4a-feira, quinzenal) ───
// Mesmo cálculo de paridade da PAUTA (08-pauta.js).
const _AG_WK_MS = 6048e5;
function _agParidade(d){
  const x = new Date(d);
  const dy = x.getDay() || 7;
  x.setDate(x.getDate() - dy + 1);
  x.setHours(0,0,0,0);
  return Math.floor(x.getTime() / _AG_WK_MS) % 2;
}
// Âncora FIXA: 4a-feira 17/06/2026 é Jurídico (combinado com o time).
// A partir dai alterna a cada 2 semanas. Anchor data fixa evita flip ao
// virar a semana (problema do anchor dinamico em new Date()).
const _PAR_JURIDICO = _agParidade(new Date(2026, 5, 17));  // mes 5 = junho (0-indexado)
const _PAR_ADM      = _PAR_JURIDICO ^ 1;

// Detecta categoria de uma reuniao de 4a.
// Ordem: tipo > titulo > nomes-chave em QUALQUER campo do evento.
// Retorna 'juridico', 'adm' ou null (= nao eh par intercalado, mostra sempre).
const _AG_NOMES_JUR = ['fernanda','edna','janaina','rebesco','araujo'];
const _AG_NOMES_ADM = ['vivian','nogueira','joao marcos','joao'];
function _agCategoria4a(ev){
  if (!ev) return null;
  // Concat lower de tipo e titulo (varias variacoes de nome de coluna)
  const tipo = String(ev.tipo||ev.Tipo||'').toLowerCase();
  const tit  = String(ev.titulo||ev.Titulo||ev['Título']||'').toLowerCase();
  // 1) Tipo explicito tem prioridade
  if (/jur[ií]d/.test(tipo)) return 'juridico';
  if (/\badm\b|administrativ/.test(tipo)) return 'adm';
  // 2) Titulo
  if (/jur[ií]d/.test(tit)) return 'juridico';
  if (/\badm\b|administrativ/.test(tit)) return 'adm';
  // 3) Nomes-chave em qualquer campo do evento (cobre 'responsavel',
  //    'Responsavel', 'Responsável', 'Participantes', 'participantes', etc).
  let all = '';
  try { all = Object.values(ev).map(v => String(v||'').toLowerCase()).join(' | '); } catch(_){}
  let nJur = 0, nAdm = 0;
  _AG_NOMES_JUR.forEach(n => { if (all.includes(n)) nJur++; });
  _AG_NOMES_ADM.forEach(n => { if (all.includes(n)) nAdm++; });
  if (nJur > nAdm) return 'juridico';
  if (nAdm > nJur) return 'adm';
  return null;
}
// Para uma data e categoria, decide se o evento deve aparecer naquela 4a-feira.
function _agMostraNa4a(dateObj, categoria){
  if (!categoria) return true; // sem categoria reconhecida -> mostra sempre
  const par = _agParidade(dateObj);
  if (categoria === 'juridico') return par === _PAR_JURIDICO;
  if (categoria === 'adm')      return par === _PAR_ADM;
  return true;
}

function wkDays(off=0){return Array.from({length:5},(_,i)=>{const d=getMon(off);d.setDate(d.getDate()+i);return d;});}
function wkStr(off=0){const d=wkDays(off);return d[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' – '+d[4].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});}
// Rótulo com referência relativa: deixa claro em que semana estamos.
function wkLabel(off=0){
  const range=wkStr(off);
  let rel;
  if(off===0) rel='Esta semana';
  else if(off===1) rel='Próxima semana';
  else if(off===-1) rel='Semana passada';
  else if(off>1) rel='Em '+off+' semanas';
  else rel='Há '+Math.abs(off)+' semanas';
  return rel+' · '+range;
}
function isToday(d){return d.toDateString()===new Date().toDateString();}
function chWk(d){wkO+=d;renderAg();}

// Normaliza qualquer formato de data ('2026-05-13', '2026-05-13T03:00:00Z',
// '13/05/2026', numero serial do Excel, Date object) para 'YYYY-MM-DD' local.
function _normDate(v){
  if(!v && v!==0) return '';
  // Se ja eh YYYY-MM-DD ou comeca com isso, pega os 10 primeiros
  const s = String(v);
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // dd/mm/yyyy ou dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m){
    const dd=m[1].padStart(2,'0'), mm=m[2].padStart(2,'0'), yyyy=m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // Tenta parsear via Date (cobre ISO strings, timestamps, serial numbers)
  try{
    const d = (typeof v === 'number') ? new Date((v-25569)*86400*1000) : new Date(s);
    if(!isNaN(d)){
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
  }catch(_){}
  return s.slice(0,10);
}

// ═══════════════════════════════════════════════════════════════
// AGENDA agora no Supabase (migrada do Apps Script em 11/09/2026).
// Resolve a lentidao/nao-grava de raiz — leitura ~0,2s vs 2-30s do GAS.
// As reunioes fixas (pautas) continuam vindo do codigo; so os EVENTOS
// (aba AGENDA) sairam da planilha pro banco.
// ═══════════════════════════════════════════════════════════════
async function _agLerEventos(){
  return await db.get('agenda_eventos', '?select=*&order=data.desc&limit=3000');
}
async function _agCriarEvento(ev){
  if(!ev.id) ev.id = Date.now();
  await db.post('agenda_eventos', ev);
  return {success:true, id:ev.id};
}
async function _agAtualizarEvento(id, ev){
  await db.patch('agenda_eventos', id, ev);
  return {success:true, id};
}
async function _agExcluirEvento(id){
  return await db.del('agenda_eventos', id);
}

async function renderAg(){
  document.getElementById('ag-lbl').textContent=wkLabel(wkO);
  const days=wkDays(wkO);
  let evs=[];
  let _agFalhouLeitura=false;
  try{
    // Cache de 60s (mesma otimizacao das pautas): navegar entre semanas
    // so re-filtra no cliente — nao precisa rebuscar no Apps Script.
    evs = await _agLerEventos();
    _evCache = evs; // cache para o editor de eventos achar por id rapido
    console.log('Agenda:',evs.length,'eventos');
    const ultimo = evs.reduce((a,b)=>(b.id||0)>(a.id||0)?b:a, {id:0});
    if(ultimo.id) console.log('Agenda — evento mais recente:', {id:ultimo.id, titulo:ultimo.titulo, data:ultimo.data, dataNorm:_normDate(ultimo.data)});
  }catch(e){
    // Leitura falhou (Apps Script travado). NAO zera a tela: reusa os
    // eventos ja carregados (_evCache) pra nao dar a impressao de que os
    // compromissos "sumiram" — foi o que levava a re-salvar e duplicar.
    console.warn('Agenda: leitura falhou, mantendo ultima carga.',e.message);
    evs = Array.isArray(_evCache) ? _evCache : [];
    _agFalhouLeitura = true;
  }
  if (_agFalhouLeitura && typeof toast==='function') {
    toast('⚠️ Servidor da agenda lento agora. Mostrando a última versão carregada — seus compromissos NÃO foram perdidos, estão salvos. Tente recarregar em instantes.','err');
  }

  // Popula o filtro de participantes — agora restrito aos usuarios elegiveis
  // do Calendar (lideres + gerentes/assistentes vendas + admin). Antes
  // listava qualquer nome que aparecesse em algum evento, poluindo a UI.
  const selFiltro = document.getElementById('ag-filtro-pessoa');
  if (selFiltro) {
    const elegiveis = (typeof usuariosCalendar==='function') ? usuariosCalendar() : (USERS||[]);
    const ordenados = elegiveis.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const valorAtual = selFiltro.value;
    selFiltro.innerHTML = '<option value="">Todos os participantes</option>' +
      ordenados.map(u => `<option value="${u.nome.replace(/"/g,'&quot;')}"${valorAtual===u.nome?' selected':''}>${u.nome}</option>`).join('');
  }
  const pessoaFiltro = selFiltro?.value || '';
  const ns=['Segunda','Terça','Quarta','Quinta','Sexta'];
  // ISO de cada dia da semana, em LOCAL time (evita bug de timezone)
  const isoLocal = day => day.getFullYear() + '-' + String(day.getMonth()+1).padStart(2,'0') + '-' + String(day.getDate()).padStart(2,'0');
  console.log('Agenda — dias da semana:', days.map(isoLocal));
  document.getElementById('ag-grid').style.gridTemplateColumns='repeat(5,1fr)';
  // Debug: paridade calculada
  console.log('[Agenda] Paridade FIXA:', {_PAR_JURIDICO, _PAR_ADM, ancora:'17/06/2026 = juridico'});
  document.getElementById('ag-grid').innerHTML=days.map((day,i)=>{
    const iso=isoLocal(day);
    const ehQuarta = day.getDay() === 3;
    const parDia = _agParidade(day);
    const tipoDa4a = ehQuarta ? (parDia===_PAR_JURIDICO ? 'juridico' : 'adm') : null;
    // Eventos do dia ordenados por hora_inicio (vazios ao final) + dedup
    const todosDoDia = evs.filter(e=>_normDate(e.data||e.Data||e.DATA)===iso);
    // Log detalhado das 4as
    if (ehQuarta && todosDoDia.length){
      console.log(`[Agenda] 4a ${iso} é da semana do ${tipoDa4a.toUpperCase()} (paridade ${parDia}). Eventos do dia:`,
        todosDoDia.map(e => ({
          titulo: e.titulo || e.Titulo,
          tipo: e.tipo,
          responsavel: e.responsavel,
          categoria_detectada: _agCategoria4a(e),
          sera_mostrada: _agMostraNa4a(day, _agCategoria4a(e))
        })));
    }
    const brutos = todosDoDia
      // Filtro por pessoa (dropdown no topo) — usa as variações do canônico
      .filter(e=>{
        if (!pessoaFiltro) return true;
        const respRaw = String(e.responsavel||e.Responsavel||'');
        // Quebra os participantes do evento e tenta casar cada um contra a pessoa selecionada
        const filtroNorm = _agNormNome(pessoaFiltro);
        const filtroPrimNome = filtroNorm.split(' ')[0];
        const respPalavras = respRaw.split(/[,;]/).map(s=>s.trim()).filter(Boolean);
        for (const part of respPalavras) {
          const pNorm = _agNormNome(part);
          if (!pNorm) continue;
          // Match: contém o filtro inteiro, OU primeira palavra igual, OU
          // alguma palavra grande em comum (>=4 chars)
          if (pNorm.includes(filtroNorm) || filtroNorm.includes(pNorm)) return true;
          const pPalavras = pNorm.split(' ');
          if (pPalavras[0] === filtroPrimNome) return true;
          const filtroPalavras = filtroNorm.split(' ');
          if (pPalavras.some(w => w.length >= 4 && filtroPalavras.includes(w))) return true;
        }
        return false;
      })
      // Filtra intercalacao adm/juridico nas 4as-feiras
      .filter(e=>{
        if (!ehQuarta) return true;
        return _agMostraNa4a(day, _agCategoria4a(e));
      })
      // Compromisso PESSOAL (tipo "Pessoal"): so aparece pro proprio dono
      // (identificado pelo nome no campo responsavel). Privacidade sem
      // depender de coluna nova na planilha.
      .filter(e=>{
        if (String(e.tipo||e.Tipo||'').toLowerCase() !== 'pessoal') return true;
        const dono = _normLogin(e.responsavel||e.Responsavel||'');
        const eu   = _normLogin((typeof CUR!=='undefined' && CUR && CUR.nome) || '');
        return eu && dono.includes(eu);
      })
      // Filtra reunioes legadas que ja foram substituidas por outras
      // pautas — includes em qualquer parte do titulo pra pegar todas as
      // variacoes possiveis. Ver todos os campos possiveis do evento
      // (titulo, Titulo, tipo, descricao, categoria).
      .filter(e=>{
        const camposTexto = [
          e.titulo, e.Titulo, e.tipo, e.Tipo,
          e.descricao, e.Descricao, e.categoria, e.Categoria
        ];
        const junto = camposTexto.filter(Boolean).join(' | ')
          .normalize('NFD').replace(/[̀-ͯ]/g,'')
          .toLowerCase().replace(/\s+/g,' ');
        const OCULTAS_TERMOS = ['reuniao terca', 'reuniao quarta'];
        for (const p of OCULTAS_TERMOS) {
          if (junto.includes(p)) {
            console.log('[agenda] ocultando reuniao legada. Titulo:', (e.titulo||e.Titulo||'?'), '| Match:', p, '| Junto:', junto.substring(0,120));
            return false;
          }
        }
        return true;
      })
      .sort((a,b)=>{
        const ha=(a.hora_inicio||'99:99'), hb=(b.hora_inicio||'99:99');
        return ha.localeCompare(hb);
      });
    // Dedup por (titulo|hora_inicio|hora_fim) — evita reuniao recorrente
    // ou import duplicado aparecer 2x no mesmo dia
    const _vistos = new Set();
    const evDia = [];
    for (const e of brutos){
      const titulo = String(e.titulo||e.Titulo||'').trim().toLowerCase();
      const hi = String(e.hora_inicio||'').slice(0,5);
      const hf = String(e.hora_fim||'').slice(0,5);
      const key = `${titulo}|${hi}|${hf}`;
      if (_vistos.has(key)) continue;
      _vistos.add(key);
      evDia.push(e);
    }
    // Badge na quarta indicando o tipo da semana
    const badge4a = ehQuarta
      ? `<div style="display:inline-block;margin-top:4px;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:.5px;${tipoDa4a==='juridico'?'background:#fef3c7;color:#92400e':'background:#dbeafe;color:#1e40af'}">${tipoDa4a==='juridico'?'🟧 4ª JURÍDICO':'🟦 4ª ADM'}</div>`
      : '';

    // Marcadores de cancelamento semanal ([CANCELADA:tipo] ...) — saem
    // da lista de eventos e desligam o card virtual da reuniao fixa.
    const cancelDia = {};
    for (let k = evDia.length - 1; k >= 0; k--) {
      const mCanc = String(evDia[k].titulo || evDia[k].Titulo || '').match(/^\[CANCELADA:([a-z]+)\]/);
      if (mCanc) { cancelDia[mCanc[1]] = evDia[k]; evDia.splice(k, 1); }
    }
    const podeCancelarReuniao = (typeof CUR !== 'undefined' && CUR &&
      (CUR.admin || (typeof ehLiderGestao === 'function' && ehLiderGestao())));

    // Reuniões fixas da PAUTA (terça Mkt, quarta Adm/Jurídico, quinta 1:1s)
    // injetadas no topo com participantes visíveis.
    const reunioes = (typeof reunioesDoDia === 'function') ? reunioesDoDia(day) : [];
    const cardsReuniao = reunioes.map(r => {
      const canc = cancelDia[r.tipo];
      if (canc) {
        // Cancelada esta semana: nota discreta + desfazer (lideres)
        return `<div style="padding:6px 8px;border-radius:6px;font-size:11px;margin-bottom:4px;background:var(--bg);border-left:3px solid #cbd5e1;color:#94a3b8">
          <s>${r.hora} · ${r.label}</s> cancelada esta semana
          ${podeCancelarReuniao ? `<a href="#" onclick="event.preventDefault();desfazerCancelReuniao('${String(canc.id||'')}')" style="color:#3b82f6;font-size:10px;margin-left:4px">desfazer</a>` : ''}
        </div>`;
      }
      const partsFmt = r.participantes.map(p => p.split(' ')[0]).join(', ');
      const btnCanc = podeCancelarReuniao
        ? `<span onclick="event.stopPropagation();cancelarReuniaoFixa('${r.tipo}','${r.label}','${iso}')" title="Cancelar esta reunião só nesta semana" style="float:right;color:#94a3b8;font-weight:700;padding:0 3px;cursor:pointer">✕</span>`
        : '';
      return `<div onclick="goTo('pauta-${r.tipo}')" title="Abrir pauta desta reunião · Participantes: ${r.participantes.join(', ')}"
        style="padding:6px 8px;border-radius:6px;font-size:11.5px;margin-bottom:4px;background:${r.cor}15;border-left:3px solid ${r.cor};cursor:pointer">
        <div style="font-weight:700;color:${r.cor}">${btnCanc}<b>${r.hora}</b> · ${r.label} <span style="font-size:9px;background:${r.cor};color:#fff;padding:1px 5px;border-radius:8px;margin-left:3px">REUNIÃO</span></div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">👥 ${partsFmt}</div>
      </div>`;
    }).join('');
    return`<div class="card">
      <div style="padding:10px;text-align:center;background:var(--bg);border-bottom:1px solid var(--borda)">
        <div style="font-size:11px;font-weight:700;color:#94a3b8">${ns[i]}</div>
        <div style="font-size:20px;font-weight:800;${isToday(day)?'color:#2a4070':''}">${day.getDate()}</div>
        ${badge4a}
      </div>
      <div style="padding:6px;min-height:60px">
        ${cardsReuniao}
        ${evDia.map(e=>{
          const hi=(e.hora_inicio||'').slice(0,5);
          const hf=(e.hora_fim||'').slice(0,5);
          const horario = hi ? (hf ? `${hi}–${hf}` : hi) : '';
          const resp = (e.responsavel||'').trim();
          const eid = String(e.id||'');
          const ehPessoal = String(e.tipo||'').toLowerCase()==='pessoal';
          const bgEv = ehPessoal ? '#f5f3ff' : 'var(--bg)';
          return `<div style="padding:5px 7px;border-radius:6px;font-size:11.5px;margin-bottom:4px;background:${bgEv};cursor:pointer" onclick="abrirEditarEv('${eid}')" title="${ehPessoal?'Compromisso pessoal (só você vê)':'Clique para editar'}">
            ${horario?`<b>${horario}</b> `:''}${ehPessoal?'🔒 ':''}${e.titulo||''}
            ${(!ehPessoal && resp)?`<div style="font-size:10px;color:#64748b;margin-top:2px">👤 ${resp.length>40?resp.slice(0,38)+'…':resp}</div>`:''}
          </div>`;
        }).join('')}
        <button onclick="abrirNovoEv('${iso}')" style="width:100%;padding:4px;font-size:11px;color:#94a3b8;background:none;border:1px dashed var(--borda);border-radius:6px;cursor:pointer;margin-top:4px">+ add</button>
      </div>
    </div>`;
  }).join('');
}
// Eventos guardados em cache para o editor (preenchido pelo renderAg)
let _evCache = [];
let _editEvId = null;

// ─── CANCELAR REUNIÃO FIXA (só na semana) ────────────────────────
// Grava um marcador [CANCELADA:tipo] na planilha AGENDA — o card
// virtual da reuniao some pra todo mundo naquele dia, com desfazer.
async function cancelarReuniaoFixa(tipo, label, iso){
  if (!confirm(`Cancelar a reunião ${label} desta semana?\nEla some da agenda de todos (dá pra desfazer).`)) return;
  try {
    await _agCriarEvento({
      titulo: `[CANCELADA:${tipo}] Reunião ${label}`,
      data: iso,
      tipo: 'cancelamento',
      responsavel: (typeof CUR!=='undefined' && CUR && CUR.nome) || ''
    });
    toast(`Reunião ${label} cancelada nesta semana.`,'ok');
  } catch(e) { toast('Erro ao cancelar: '+e.message,'err'); }
  renderAg();
}
async function desfazerCancelReuniao(id){
  if (!id) { toast('Marcador sem id — recarregue a página.','err'); return; }
  try {
    await _agExcluirEvento(id);
    toast('Cancelamento desfeito — a reunião voltou.','ok');
  } catch(e) { toast('Erro: '+e.message,'err'); }
  renderAg();
}

// Abre modal pre-preenchido para criar reuniao de 4a do tipo certo.
// Usa GRUPOS de 02-manutencao.js quando disponivel.
function abrirNovaReuniao4a(iso, tipo){
  abrirNovoEv(iso);
  // Preenche titulo, tipo e participantes
  const tit = tipo==='juridico' ? 'Reunião 4ª Jurídico' : 'Reunião 4ª Adm';
  const tipoSel = tipo==='juridico' ? 'Reunião Jurídico' : 'Reunião Adm';
  const etEl = document.getElementById('et'); if (etEl) etEl.value = tit;
  const etyEl = document.getElementById('ety');
  if (etyEl) {
    for (let i=0; i<etyEl.options.length; i++){
      if (etyEl.options[i].text === tipoSel){ etyEl.selectedIndex = i; break; }
    }
  }
  // Hora padrao
  const eiEl = document.getElementById('ei'); if (eiEl && !eiEl.value) eiEl.value = '09:30';
  const efEl = document.getElementById('ef'); if (efEl && !efEl.value) efEl.value = '11:00';
  // Participantes do grupo
  try {
    if (typeof GRUPOS !== 'undefined' && GRUPOS[tipo]){
      _evParticipantes = GRUPOS[tipo].slice();
      const lista = document.getElementById('ev-partic-lista');
      if (lista){
        lista.innerHTML = '';
        _evParticipantes.forEach(nome => {
          const chip = document.createElement('span');
          chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#dbeafe;color:#1d4ed8;border-radius:99px;font-size:12px;font-weight:500';
          chip.innerHTML = `${nome} <button onclick="remParticipante('${nome.replace(/'/g,"\\'")}',this.parentElement)" style="background:none;border:none;cursor:pointer;color:#1d4ed8;font-size:13px;padding:0">×</button>`;
          lista.appendChild(chip);
        });
      }
    }
  } catch(_){}
}

// Abre modal para CRIAR novo evento (reseta estado de edicao)
// Preenche os selects de hora de 15 em 15 min (00:00 … 23:45).
function _popularHorasSelects(){
  ['ei','ef'].forEach(id=>{
    const sel=document.getElementById(id);
    if(!sel || sel.dataset.pop) return;
    let html='<option value="">--:--</option>';
    for(let h=6;h<24;h++) for(let m=0;m<60;m+=15){   // comeca as 06:00
      const v=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
      html+=`<option value="${v}">${v}</option>`;
    }
    sel.innerHTML=html; sel.dataset.pop='1';
  });
}
// Seta o valor; se for um horario "quebrado" de evento antigo (ex 14:37),
// adiciona a opcao pra nao perder o dado ao editar.
function _setHoraSelect(id,val){
  const sel=document.getElementById(id); if(!sel) return;
  val=String(val||'').slice(0,5);
  if(val && !Array.from(sel.options).some(o=>o.value===val)){
    const o=document.createElement('option'); o.value=val; o.textContent=val+' (fora do padrão)'; sel.appendChild(o);
  }
  sel.value=val;
}
// Compromisso pessoal: esconde participantes (nao faz sentido convidar).
function _toggleEvPessoal(){
  const p=document.getElementById('ev-pessoal')?.checked;
  const wrap=document.getElementById('ev-partic-wrap');
  if(wrap) wrap.style.display = p ? 'none' : '';
}
// Repeticao: mostra o "ate" quando repete != nao; default = +3 meses.
function _toggleRepeteAte(){
  const rep=document.getElementById('ev-repete')?.value || 'nao';
  const wrap=document.getElementById('ev-repete-ate-wrap');
  if(wrap) wrap.style.display = (rep==='nao') ? 'none' : '';
  const ate=document.getElementById('ev-repete-ate');
  if(ate && !ate.value && rep!=='nao'){
    const d=new Date(); d.setMonth(d.getMonth()+3);
    ate.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
}
// Gera as datas (ISO) de uma serie a partir de isoInicial ate isoAte.
// Limite de seguranca: 200 ocorrencias.
function _gerarDatasRepeticao(isoInicial, freq, isoAte){
  const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const [y,m,d0]=isoInicial.split('-').map(Number);
  let cur=new Date(y,m-1,d0);
  let ate;
  if(isoAte){ const [ay,am,ad]=isoAte.split('-').map(Number); ate=new Date(ay,am-1,ad); }
  else { ate=new Date(y,m-1,d0); ate.setMonth(ate.getMonth()+3); }
  const datas=[]; let guard=0;
  while(cur<=ate && guard<200){
    guard++;
    const dow=cur.getDay();
    if(freq==='diaria'){ if(dow>=1&&dow<=5) datas.push(iso(cur)); cur.setDate(cur.getDate()+1); }
    else if(freq==='semanal'){ datas.push(iso(cur)); cur.setDate(cur.getDate()+7); }
    else if(freq==='quinzenal'){ datas.push(iso(cur)); cur.setDate(cur.getDate()+14); }
    else if(freq==='mensal'){ datas.push(iso(cur)); cur.setMonth(cur.getMonth()+1); }
    else break;
  }
  return datas;
}

function abrirNovoEv(iso){
  _editEvId = null;
  _popularHorasSelects();
  // Limpa campos
  ['et','ei','ef','edesc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const tipoEl = document.getElementById('ety'); if(tipoEl) tipoEl.selectedIndex = 0;
  const pes=document.getElementById('ev-pessoal'); if(pes) pes.checked=false;
  _toggleEvPessoal();
  // Repeticao disponivel so na criacao
  const rep=document.getElementById('ev-repete'); if(rep){ rep.value='nao'; rep.closest('.frow').style.display=''; }
  const ateW=document.getElementById('ev-repete-ate-wrap'); if(ateW) ateW.style.display='none';
  const ate=document.getElementById('ev-repete-ate'); if(ate) ate.value='';
  document.getElementById('ed').value = iso || '';
  _evParticipantes = [];
  const lista=document.getElementById('ev-partic-lista'); if(lista) lista.innerHTML='';
  // Restaura titulo padrao do modal e remove botao excluir se existir
  const titleEl = document.querySelector('#m-ev .mt');
  if(titleEl) titleEl.textContent = '📅 Novo Compromisso';
  const btnDel = document.getElementById('btn-excluir-ev');
  if(btnDel) btnDel.remove();
  openM('m-ev');
}

async function abrirEditarEv(id){
  if(!id) return;
  // Busca o evento pelo id
  let ev = _evCache.find(x => String(x.id) === String(id));
  if(!ev){
    // Refetch caso o cache esteja desatualizado
    try{
      const evs = await _agLerEventos();
      ev = evs.find(x => String(x.id) === String(id));
      _evCache = evs;
    }catch(e){}
  }
  if(!ev){ toast('Evento nao encontrado.','err'); return; }
  _editEvId = id;
  _popularHorasSelects();
  // Preenche o modal
  document.getElementById('et').value   = ev.titulo || '';
  document.getElementById('ed').value   = _normDate(ev.data || ev.Data) || '';
  _setHoraSelect('ei', ev.hora_inicio);
  _setHoraSelect('ef', ev.hora_fim);
  const ehPessoal = String(ev.tipo||'').toLowerCase()==='pessoal';
  const pes=document.getElementById('ev-pessoal'); if(pes) pes.checked=ehPessoal;
  _toggleEvPessoal();
  // Repeticao so aparece ao CRIAR — ao editar, esconde a linha inteira
  const repEl=document.getElementById('ev-repete');
  if(repEl){ repEl.value='nao'; const fr=repEl.closest('.frow'); if(fr) fr.style.display='none'; }
  const tipoEl = document.getElementById('ety'); if(tipoEl) tipoEl.value = ev.tipo || '';
  const descEl = document.getElementById('edesc'); if(descEl) descEl.value = ev.descricao || '';
  // Limpa participantes anteriores e adiciona os atuais
  _evParticipantes = String(ev.responsavel||'').split(',').map(s=>s.trim()).filter(Boolean);
  const lista = document.getElementById('ev-partic-lista');
  if(lista){
    lista.innerHTML = '';
    _evParticipantes.forEach(nome => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#dbeafe;color:#1d4ed8;border-radius:99px;font-size:12px;font-weight:500';
      chip.innerHTML = `${nome} <button onclick="remParticipante('${nome.replace(/'/g,"\\'")}',this.parentElement)" style="background:none;border:none;cursor:pointer;color:#1d4ed8;font-size:13px;padding:0">×</button>`;
      lista.appendChild(chip);
    });
  }
  // Adiciona botao Excluir no modal se ainda nao existir
  const footer = document.querySelector('#m-ev .mf');
  if (footer && !document.getElementById('btn-excluir-ev')){
    const btn = document.createElement('button');
    btn.id = 'btn-excluir-ev';
    btn.className = 'btn btn-o';
    btn.style.cssText = 'color:var(--danger);margin-right:auto';
    btn.textContent = '🗑️ Excluir';
    btn.onclick = excluirEv;
    footer.insertBefore(btn, footer.firstChild);
  }
  // Altera titulo do modal
  const titleEl = document.querySelector('#m-ev .mt');
  if(titleEl) titleEl.textContent = '✏️ Editar Compromisso';
  openM('m-ev');
}

async function excluirEv(){
  if(!_editEvId){ closeM('m-ev'); return; }
  // Faz parte de uma serie repetida? Oferece excluir so este ou todos.
  const ev = (_evCache||[]).find(x => String(x.id)===String(_editEvId));
  const grupo = ev && ev.repete_grupo;
  try{
    if (grupo){
      const todos = confirm('Este compromisso se repete.\n\nOK = excluir TODA a série (todas as ocorrências).\nCancelar = excluir SÓ este dia.');
      if (todos){
        // apaga a serie inteira de uma vez (delete where repete_grupo)
        await fetch(SBU+'/rest/v1/agenda_eventos?repete_grupo=eq.'+grupo, {method:'DELETE', headers:hdr()});
        toast('🗑️ Série inteira excluída.','ok');
      } else {
        await _agExcluirEvento(_editEvId);
        toast('🗑️ Ocorrência excluída.','ok');
      }
    } else {
      if(!confirm('Excluir este compromisso? Esta acao nao pode ser desfeita.')) return;
      await _agExcluirEvento(_editEvId);
      toast('🗑️ Compromisso excluído.','ok');
    }
    closeM('m-ev');
    _editEvId = null;
    renderAg();
  }catch(e){
    console.error('[excluirEv]',e);
    toast('Erro ao excluir: '+e.message,'err');
  }
}

let _saveEvBusy = false;
let _saveEvSafetyTimer = null;
async function saveEv(){
  if(_saveEvBusy){
    console.log('[saveEv] ja em andamento — ignorando duplo clique');
    return;
  }
  _saveEvBusy = true;
  clearTimeout(_saveEvSafetyTimer);
  _saveEvSafetyTimer = setTimeout(()=>{
    console.warn('[saveEv] safety timeout — liberando _saveEvBusy');
    _saveEvBusy = false;
  }, 50000);   // > timeout de escrita (45s) pra nao liberar duplo-clique antes da resposta
  console.log('[saveEv] iniciando', _editEvId ? '(EDIT id='+_editEvId+')' : '(CREATE)');
  const ti=document.getElementById('et')?.value?.trim();
  const dataVal=document.getElementById('ed')?.value;
  console.log('[saveEv] titulo:', ti, 'data:', dataVal);
  if(!ti){toast('Informe o título.','err'); _saveEvBusy=false; return;}
  if(!dataVal){toast('Informe a data.','err'); _saveEvBusy=false; return;}
  // Compromisso pessoal: dono = usuario atual, tipo "Pessoal" (marca que
  // a renderizacao usa pra so mostrar pro dono). Nao tem participantes.
  const ehPessoal = !!document.getElementById('ev-pessoal')?.checked;
  const partArr = (typeof _evParticipantes !== 'undefined' && _evParticipantes) ? _evParticipantes : [];
  const participantes = ehPessoal
    ? (CUR?.nome || '')
    : (partArr.length ? partArr.join(', ') : (CUR?.nome || ''));
  const payload = {
    titulo:ti,
    data:dataVal,
    hora_inicio:document.getElementById('ei')?.value || '',
    hora_fim:document.getElementById('ef')?.value || '',
    tipo: ehPessoal ? 'Pessoal' : (document.getElementById('ety')?.value || ''),
    descricao:document.getElementById('edesc')?.value || '',
    responsavel:participantes
  };
  // CREATE precisa de id novo; UPDATE usa o id existente
  if (!_editEvId) payload.id = Date.now();
  console.log('[saveEv] payload final:', JSON.stringify(payload));

  // Repeticao (so na criacao): materializa uma ocorrencia por data.
  const repFreq = !_editEvId ? (document.getElementById('ev-repete')?.value || 'nao') : 'nao';
  try{
    let resp;
    if (repFreq !== 'nao'){
      const ate = document.getElementById('ev-repete-ate')?.value || '';
      const datas = _gerarDatasRepeticao(dataVal, repFreq, ate);
      if (!datas.length){ toast('Nenhuma data gerada — confira o período.','err'); _saveEvBusy=false; clearTimeout(_saveEvSafetyTimer); return; }
      const grupo = Date.now();
      const base = grupo;
      for (let k=0; k<datas.length; k++){
        await _agCriarEvento({ ...payload, id: base + k, data: datas[k], repete_grupo: grupo });
      }
      resp = {success:true, id:base, serie:datas.length};
    } else if (_editEvId){
      // Grava no Supabase (era Apps Script). Instantaneo e confiavel.
      resp = await _agAtualizarEvento(_editEvId, payload);
    } else {
      resp = await _agCriarEvento(payload);   // payload.id ja = Date.now()
    }
    console.log('[saveEv] resposta:', resp);
    if (!resp || resp.success === false) {
      throw new Error(resp?.error || resp?.erro || 'falha ao gravar');
    }
    if (!_editEvId && !resp.id) throw new Error('nao retornou id no create');

    if (typeof _evParticipantes !== 'undefined') _evParticipantes=[];
    const acao = resp.serie ? `criado — ${resp.serie} ocorrências` : (_editEvId ? 'atualizado' : 'adicionado');
    _editEvId = null;
    closeM('m-ev');
    // Restaura titulo padrao do modal e remove botao excluir
    const titleEl = document.querySelector('#m-ev .mt');
    if(titleEl) titleEl.textContent = '📅 Novo Compromisso';
    const btnDel = document.getElementById('btn-excluir-ev');
    if(btnDel) btnDel.remove();
    toast(`✅ Compromisso ${acao}!`,'ok');
    renderAg();
  }catch(e){
    console.error('[saveEv] erro final:', e);
    toast('Erro ao salvar: '+(e.message||e),'err');
  }finally{
    _saveEvBusy = false;
    clearTimeout(_saveEvSafetyTimer);
  }
}


// Cinto-e-suspensorio: popula os selects de hora assim que a pagina
// carrega, pra nunca ficarem vazios (qualquer caminho de abertura do
// modal funciona, mesmo se nao passar por abrirNovoEv).
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => { try { _popularHorasSelects(); } catch(_){} });
}

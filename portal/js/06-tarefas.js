// TAREFAS — agrupadas por área (Vendas / Adm / Marketing / Jurídico / Outros)

// Cada área tem cor e lista de nomes-chave (busca por primeira palavra do responsável)
const AREAS_TAREFAS = [
  {key:'vendas',    titulo:'Vendas',     cor:'#2563eb', nomes:['renata','felippe','christiane','emilia']},
  {key:'adm',       titulo:'Adm',        cor:'#d97706', nomes:['vivian','nogueira','joao']},
  {key:'marketing', titulo:'Marketing',  cor:'#7c3aed', nomes:['anderson','thais']},
  {key:'juridico',  titulo:'Jurídico',   cor:'#0d9488', nomes:['fernanda','edna','janaina']},
];

function _areaPorResp(resp){
  const r = String(resp||'').toLowerCase();
  for (const a of AREAS_TAREFAS) {
    if (a.nomes.some(n => r.includes(n))) return a;
  }
  return {key:'outros', titulo:'Outros', cor:'#64748b', nomes:[]};
}

async function loadTar(){
  const tbody = document.getElementById('tb-tar');
  if(tbody) tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8">Conectando...</td></tr>';

  if(!GAS_CALENDAR || GAS_CALENDAR.includes('COLE_AQUI')){
    if(tbody) tbody.innerHTML='<tr><td colspan="7"><div class="empty"><div class="ei">⚙️</div><p>Configure a URL do Apps Script do Calendar.</p></div></td></tr>';
    return;
  }

  try{
    // Cache de 60s compartilhado com as pautas (mesma sheet TAREFAS):
    // abrir Tarefas depois de uma pauta (ou vice-versa) fica instantaneo.
    const resp = await gasGetCached(GAS_CALENDAR, {action:'read', sheet:'TAREFAS'});
    const d = gasParseRows(resp);
    console.log('GAS tarefas parsed:', d.length, d[0]?Object.keys(d[0]):[]);
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    setEl('t-tot', d.length);
    setEl('t-and', d.filter(x=>(x.status||'').toLowerCase().includes('andamento')).length);
    setEl('t-ok',  d.filter(x=>(x.status||'').includes('Conclu')).length);
    setEl('t-ov',  d.filter(x=>{const p=x.prazo;return p&&new Date(p+'T12:00:00')<hoje&&!(x.status||'').includes('Conclu');}).length);
    document.getElementById('tar-sub').textContent = CUR.admin?'Todas as tarefas':'Suas demandas';

    if(!d.length){
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><p style="color:#94a3b8;padding:24px;text-align:center">Nenhuma tarefa ainda.</p></div></td></tr>`;
      return;
    }

    // Classifica cada tarefa em uma área (pela 1ª palavra do responsável)
    const porArea = {};
    for (const a of AREAS_TAREFAS) porArea[a.key] = [];
    porArea['outros'] = [];

    for (const t of d) {
      const respRaw = String(t.responsavel || t['Responsável'] || t.Responsavel || '');
      const primeiroResp = respRaw.split(',')[0].trim();
      const area = _areaPorResp(primeiroResp);
      (porArea[area.key] || porArea['outros']).push(t);
    }

    // Em cada área: pendentes primeiro, concluídas no fim
    const _ord = lista => lista.sort((a,b) => {
      const ac = (a.status||'').includes('Conclu') ? 1 : 0;
      const bc = (b.status||'').includes('Conclu') ? 1 : 0;
      return ac - bc;
    });
    Object.values(porArea).forEach(_ord);

    const pc = {'URG./IMP.':'b-red','N.U./IMP.':'b-blue','URG./N.IMP.':'b-amber','N.U./N.IMP.':'b-gray'};
    const sc = {'Não iniciado':'b-gray','Em andamento':'b-blue','Concluído':'b-green','Em espera':'b-red'};

    // Renderiza UMA linha (mantém colspan da tabela = 7)
    const renderRow = (x) => {
      const st = x.status||x.Status||'Não iniciado';
      const pr = x.prioridade||x.Prioridade||'N.U./IMP.';
      const prazo = x.prazo||x.Prazo||'';
      const v = prazo ? new Date(prazo) : null;
      const diff = v&&!isNaN(v) ? Math.ceil((v-hoje)/(864e5)) : null;
      const ps = diff===null ? '—' : diff<0 ? `Venceu ${Math.abs(diff)}d` : diff===0 ? 'Hoje' : `${diff}d`;
      const pc2 = diff===null ? '' : diff<0 ? 'color:var(--danger)' : diff<=3 ? 'color:var(--amber)' : '';
      const resp2 = x.responsavel||x['Responsável']||x.Responsavel||CUR.nome;
      const cat = x.categoria||x.Categoria||'Pontual';
      const tit = x.titulo||x['Título']||x.Titulo||x.tarefa||'—';
      const rowId = x.id||x.Protocolo||x.ID||'';
      const isConc = st==='Concluído';
      let nComents = 0;
      try{
        const raw = x.comentario || x.Comentario || '';
        if(raw && String(raw).trim().startsWith('[')) nComents = JSON.parse(raw).length;
      }catch(_){}
      return `<tr style="${isConc?'opacity:.55':''}">
        <td style="font-weight:600;font-size:13px;${isConc?'text-decoration:line-through;color:#94a3b8':''}">${tit}</td>
        <td style="font-size:12px">${String(resp2).split(',')[0].split(' ')[0]}${String(resp2).includes(',')?' <span style="color:#94a3b8;font-size:10px">+'+String(resp2).split(',').length+'</span>':''}</td>
        <td>
          <select class="badge ${sc[st]||'b-gray'}" style="font-size:11px;padding:3px 6px;border:0;cursor:pointer" onchange="_tarStatusChange('${rowId}',this.value)">
            <option ${st==='Não iniciado'?'selected':''}>Não iniciado</option>
            <option ${st==='Em andamento'?'selected':''}>Em andamento</option>
            <option ${st==='Em espera'?'selected':''}>Em espera</option>
            <option ${st==='Concluído'?'selected':''}>Concluído</option>
          </select>
        </td>
        <td><span class="badge ${pc[pr]||'b-gray'}" style="font-size:10px">${pr}</span></td>
        <td style="font-size:12px;${pc2}">${ps}</td>
        <td style="font-size:12px;color:#94a3b8">${cat}</td>
        <td><button class="btn btn-o bxs" onclick="abrirComentariosPauta('${rowId}','terca','TAREFAS')" title="Comentários (compartilhados com a pauta)">💬${nComents?' '+nComents:''}</button></td>
      </tr>`;
    };

    // Cabeçalho de seção (linha colspan que abrange a tabela inteira)
    const renderHeader = (area, count) => `
      <tr><td colspan="7" style="padding:12px 14px 8px;background:${area.cor}10;border-left:3px solid ${area.cor}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:${area.cor};letter-spacing:.5px;text-transform:uppercase">${area.titulo}</span>
          <span style="background:${area.cor};color:#fff;font-size:10px;font-weight:700;padding:1px 8px;border-radius:99px">${count}</span>
        </div>
      </td></tr>`;

    // Monta o HTML: cada área com seu header + linhas. Áreas vazias somem.
    let html = '';
    for (const area of AREAS_TAREFAS) {
      const lista = porArea[area.key];
      if (!lista.length) continue;
      html += renderHeader(area, lista.length);
      html += lista.map(renderRow).join('');
    }
    // "Outros" — última seção, só se tiver itens
    if (porArea['outros'] && porArea['outros'].length) {
      html += renderHeader({titulo:'Outros / Não classificado', cor:'#64748b'}, porArea['outros'].length);
      html += porArea['outros'].map(renderRow).join('');
    }

    tbody.innerHTML = html;
  }catch(e){
    console.error('loadTar:', e.message);
    if(tbody) tbody.innerHTML=`<tr><td colspan="7"><div class="empty"><p style="color:var(--danger);padding:14px">Erro: ${e.message?.substring(0,80)}</p></div></td></tr>`;
  }
}

async function saveTar(){
  const ti=document.getElementById('tt').value.trim();
  if(!ti){toast('Informe o título.','err');return;}
  // Responsavel: se _tarParticipantes tem chips, junta por virgula; senao usa CUR.nome
  const partArr = (typeof _tarParticipantes !== 'undefined' && _tarParticipantes) ? _tarParticipantes : [];
  const responsavel = partArr.length ? partArr.join(', ') : (CUR?.nome || '');
  const payload = {
    id:Date.now(), titulo:ti,
    status:document.getElementById('ts').value,
    prioridade:document.getElementById('tp').value,
    prazo:document.getElementById('tpr').value||'',
    categoria:document.getElementById('tc').value,
    observacoes:document.getElementById('to').value,
    responsavel,
    data_criacao:new Date().toISOString().slice(0,10)
  };
  console.log('[saveTar] payload:', payload);
  try{
    const r = await gasGet(GAS_CALENDAR, {action:'create', sheet:'TAREFAS', data: JSON.stringify(payload)});
    if (r?.success === false) throw new Error(r.error||r.erro||'falha');
    if (typeof _tarParticipantes !== 'undefined') _tarParticipantes = [];
    closeM('m-tar');toast('✅ Tarefa salva!','ok');loadTar();
  }catch(e){console.error('[saveTar]',e);toast('Erro: '+e.message,'err');}
}
async function togTar(id,st){
  if(!id)return;
  const novo=st==='Concluído'?'Em andamento':'Concluído';
  try{
    const data = {status:novo};
    if(novo==='Concluído') data.data_conclusao = (typeof wkId==='function')? wkId(0) : new Date().toISOString().slice(0,10);
    else data.data_conclusao = '';
    await gasGet(GAS_CALENDAR,{action:'update',sheet:'TAREFAS',id,data:JSON.stringify(data)});
    loadTar();
  }catch(e){toast('Erro ao atualizar.','err');}
}

// Handler do <select> de status nas tarefas. Se for Concluído, abre modal
// de comentarios (opcional). Caso contrario, salva direto.
async function _tarStatusChange(id, status){
  if(!id || !status) return;
  if(status === 'Concluído'){
    // Reaproveita o modal de comentarios da pauta
    if(typeof abrirComentariosPauta === 'function'){
      await abrirComentariosPauta(id, 'terca', 'TAREFAS');
      const cBtn = document.getElementById('pcom-concluir');
      if(cBtn){ cBtn.style.display = 'inline-flex'; cBtn.textContent = '✅ Concluir tarefa'; }
      const ta = document.getElementById('pcom-novo');
      if(ta){ ta.placeholder = 'Comentário de conclusão (opcional)'; ta.focus(); }
    } else {
      // Fallback sem modal
      await togTar(id, 'Em andamento'); // fingir que esta em andamento p/ togTar virar pra concluido
    }
    return;
  }
  try{
    await gasGet(GAS_CALENDAR, {action:'update', sheet:'TAREFAS', id, data: JSON.stringify({status, data_conclusao:''})});
    loadTar();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}


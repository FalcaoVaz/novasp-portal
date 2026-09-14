// HORÁRIOS
function chHor(d){horO+=d;renderHor();}

async function renderHor(){
  console.log('[renderHor] iniciando, semana off=', horO);
  const lblEl = document.getElementById('hor-lbl');
  const gridEl = document.getElementById('hor-grid');
  if (lblEl) lblEl.textContent = wkStr(horO);
  if (!gridEl) { console.warn('[renderHor] elemento hor-grid nao existe'); return; }

  const wk=wkId(horO);
  const dias=wkDays(horO); // array de Date para Seg-Sex
  console.log('[renderHor] wkId:', wk, 'dias da semana:', dias.map(d=>d.toISOString().slice(0,10)));
  const canEdit=CUR?.admin||CUR?.nome?.includes('Rodrigo');
  const ns=['Segunda','Terça','Quarta','Quinta','Sexta'];
  const slots=['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

  // ── 1. Slots LIVRES manualmente marcados em HORARIOS_RODRIGO
  // HORARIOS_RODRIGO segue no Apps Script; AGENDA migrou pro Supabase.
  const _pHor = gasGetCached(GAS_CALENDAR,{action:'read',sheet:'HORARIOS_RODRIGO'});
  const _pAg  = (typeof _agLerEventos==='function') ? _agLerEventos() : Promise.resolve([]);
  let livres=[];
  try{
    const resp=await _pHor;
    const todos = gasParseRows(resp);
    livres=todos.filter(x=>{
      const sem = x.Semana||x.semana||x.SEMANA||'';
      return String(sem)===wk;
    });
    console.log('[renderHor] slots livres da semana', wk, ':', livres.length);
  }catch(e){
    console.error('[renderHor] erro horarios livres:',e);
    gridEl.innerHTML = `<div style="padding:20px;color:#dc2626;font-size:12px">Erro ao carregar horários: ${e.message}</div>`;
    return;
  }

  // ── 2. Eventos da AGENDA onde Rodrigo participa (vira ocupado automaticamente)
  let eventos=[];
  try{
    const todosEv=await _pAg;   // ja vem como array (Supabase)
    const isoLocal = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const isoDiasSemana = new Set(dias.map(isoLocal));
    eventos=todosEv.filter(e=>{
      const dataNorm = (typeof _normDate==='function') ? _normDate(e.data||e.Data||e.DATA) : String(e.data||'').slice(0,10);
      if(!dataNorm) return false;
      if(!isoDiasSemana.has(dataNorm)) return false;
      // Rodrigo participa?
      const resp = String(e.responsavel||e.Responsavel||e.RESPONSAVEL||'').toLowerCase();
      return resp.includes('rodrigo');
    });
    console.log('[renderHor] eventos de Rodrigo na semana:', eventos.length, eventos.map(e=>({t:e.titulo,d:e.data,h:e.hora_inicio})));
  }catch(e){
    console.warn('[renderHor] nao foi possivel ler agenda (segue sem):', e.message);
  }

  // ── 3. Determina o estado de cada slot (dia, hora)
  const isoLocalDay = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const slotInfo = (diaIdx, h) => {
    const dataIso = isoLocalDay(dias[diaIdx]);
    // Evento na agenda?
    const evento = eventos.find(e=>{
      const dataNorm = (typeof _normDate==='function') ? _normDate(e.data||e.Data||e.DATA) : String(e.data||'').slice(0,10);
      const hi = String(e.hora_inicio||e.HoraInicio||'').slice(0,5);
      const hf = String(e.hora_fim||e.HoraFim||'').slice(0,5);
      if(dataNorm!==dataIso) return false;
      if(hi===h) return true;
      if(hi && hf && hi<=h && h<hf) return true;
      return false;
    });
    if(evento) return { tipo:'ocupado', titulo: evento.titulo||evento.Titulo||'Compromisso' };
    // Slot livre manual?
    const livre = livres.find(x=>{
      const d  = x.dia||x.Dia||x.DIA;
      const hi = String(x.hora_inicio||x.HoraInicio||x.hora||'').slice(0,5);
      return String(d)===ns[diaIdx] && hi.startsWith(h);
    });
    if(livre) return { tipo:'livre' };
    return { tipo:'vazio' };
  };

  // ── 4. Renderiza grid
  const hdr=`<div style="display:grid;grid-template-columns:70px repeat(5,1fr);border-bottom:1px solid var(--borda);background:var(--bg)">
    <div style="padding:9px 6px;font-size:11px;text-align:center;font-weight:600;color:var(--muted)">Hora</div>
    ${ns.map(n=>`<div style="padding:9px 6px;font-size:11px;text-align:center;font-weight:600;color:var(--muted)">${n}</div>`).join('')}
  </div>`;

  const rows=slots.map(h=>`<div style="display:grid;grid-template-columns:70px repeat(5,1fr);border-bottom:1px solid var(--borda)">
    <div style="padding:9px 6px;font-size:11px;text-align:center;color:var(--muted);font-weight:600">${h}</div>
    ${ns.map((n,i)=>{
      const info = slotInfo(i,h);
      if(info.tipo==='ocupado'){
        const t = String(info.titulo).length>16 ? String(info.titulo).slice(0,14)+'…' : info.titulo;
        return `<div style="padding:9px 6px;text-align:center;font-size:10.5px;background:rgba(220,38,38,.10);color:#b91c1c;font-weight:600;cursor:default" title="${info.titulo}">📅 ${t}</div>`;
      }
      if(info.tipo==='livre'){
        return `<div style="padding:9px 6px;text-align:center;font-size:11.5px;cursor:${canEdit?'pointer':'default'};background:rgba(39,174,96,.12);color:var(--verde);font-weight:700" ${canEdit?`onclick="togHor('${wk}','${n}','${h}',true)"`:''}>✓ Livre</div>`;
      }
      return `<div style="padding:9px 6px;text-align:center;font-size:11.5px;cursor:${canEdit?'pointer':'default'};transition:background .15s" ${canEdit?`onclick="togHor('${wk}','${n}','${h}',false)"`:''}></div>`;
    }).join('')}
  </div>`).join('');

  gridEl.innerHTML=hdr+rows;

  // Nota apenas uma vez (evita acumular)
  if(canEdit){
    let note = document.getElementById('hor-grid-note');
    if(!note){
      note = document.createElement('p');
      note.id = 'hor-grid-note';
      note.style.cssText='font-size:12px;color:var(--muted);margin-bottom:10px';
      note.textContent='Clique em slots vazios/livres para alternar disponibilidade. Slots em vermelho são eventos da agenda (não editáveis aqui).';
      gridEl.insertAdjacentElement('beforebegin', note);
    }
  }
}

async function togHor(wk,dia,hora,wasL){
  console.log('[togHor]', {wk, dia, hora, wasL});
  try{
    if(wasL){
      const r=await gasGet(GAS_CALENDAR,{action:'read',sheet:'HORARIOS_RODRIGO'});
      const list=gasParseRows(r);
      const found=list.find(x=>{
        const sem = x.semana||x.Semana||x.SEMANA;
        const d   = x.dia||x.Dia||x.DIA;
        const hi  = x.hora_inicio||x.HoraInicio||x.hora||'';
        return String(sem)===wk && String(d)===dia && String(hi).startsWith(hora);
      });
      const id = found?.id||found?.ID||found?.Id;
      if(id) await gasGet(GAS_CALENDAR,{action:'delete',sheet:'HORARIOS_RODRIGO',id});
      else console.warn('[togHor] registro nao encontrado para deletar');
    }else{
      const payload = {id:Date.now(), semana:wk, dia, hora_inicio:hora, hora_fim:''};
      const r = await gasGet(GAS_CALENDAR, {action:'create', sheet:'HORARIOS_RODRIGO', data: JSON.stringify(payload)});
      if (r?.success === false) throw new Error(r.error||r.erro||'falha');
    }
  }catch(e){console.error('[togHor] erro:',e); toast?.('Erro: '+e.message,'err');}
  renderHor();
}

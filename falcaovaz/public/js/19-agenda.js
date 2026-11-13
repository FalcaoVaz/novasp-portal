// ═══════════════════════════════════════════════════════════════
// AGENDA DO JURÍDICO (13/11/2026)
// Mesma tabela da agenda do portal (agenda_eventos), separada pelo campo agenda = 'juridico'
// (sql: portal/sql/2026-11-13-agenda-juridico.sql). Regras:
//   · aqui aparecem os compromissos da agenda do jurídico;
//   · o Rodrigo vê também os SEUS compromissos da agenda da NSP (etiqueta "NSP", só leitura aqui) — e no portal os seus daqui;
//   · compromisso PESSOAL: o dono vê completo; os demais veem só "🔒 Ocupado · Nome" naquele horário.
//     Vale nas duas agendas (é o tempo da pessoa): o pessoal de quem é do jurídico aparece aqui como ocupado,
//     mesmo se foi marcado na agenda do portal.
// ═══════════════════════════════════════════════════════════════
const AGJ_DUAS_AGENDAS = 'rodrigo@novasaopaulo.com.br';
const AGJ_TIPOS = ['Audiência', 'Reunião', 'Prazo', 'Atendimento', 'Diligência', 'Despacho', 'Outro'];
// Reunião fixa do jurídico: quarta 11h, quinzenal — mesma conta do portal (08-pauta.js / 07-agenda.js):
// âncora 17/06/2026 = semana do jurídico; alterna com a reunião Adm. Cancelada na semana pelo portal ([CANCELADA:juridico]) não aparece.
const AGJ_REUNIAO = { dow: 3, hora: '11:00', fim: '12:00', lb: 'Reunião Jurídico',
  part: ['Rodrigo Falcão Vaz', 'Fernanda Araujo', 'Vitor Cordeiro', 'Renata Navarro', 'Edna Rebesco', 'Durval Falcão Vaz', 'Janaina Alves'] };
function agjParidade(d) { const x = new Date(d), dy = x.getDay() || 7; x.setDate(x.getDate() - dy + 1); x.setHours(0, 0, 0, 0); return Math.floor(x.getTime() / 6048e5) % 2; }
const AGJ_PAR_JUR = agjParidade(new Date(2026, 5, 17));
let agjSemana = 0, agjEventos = [], agjMembros = [], agjEditId = null;

const agjEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agjNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const agjIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function agjSegunda(off) { const d = new Date(), dy = d.getDay() || 7; d.setDate(d.getDate() - dy + 1 + off * 7); d.setHours(0, 0, 0, 0); return d; }
function agjDias(off) { return Array.from({ length: 5 }, (_, i) => { const d = agjSegunda(off); d.setDate(d.getDate() + i); return d; }); }
function agjVeDuas() { return !!(currentUser && String(currentUser.email || '').trim().toLowerCase() === AGJ_DUAS_AGENDAS); }
const agjPessoal = e => agjNorm(e.tipo) === 'pessoal';
function agjDono(e) { const eu = agjNorm(currentUser && currentUser.name); return !!(eu && agjNorm(e.responsavel).includes(eu)); }
// o compromisso tem a pessoa entre os participantes? (nome completo ou só o primeiro nome)
function agjParticipa(e, nome) {
  const eu = agjNorm(nome), pn = eu.split(' ')[0];
  return !!eu && String(e.responsavel || '').split(/[,;]/).map(agjNorm).filter(Boolean)
    .some(p => p === eu || p === pn || (p.length >= 4 && (eu.includes(p) || p.includes(eu))));
}
const agjPrimeiro = e => String(e.responsavel || '').split(/[,;]/)[0].trim().split(' ')[0] || 'alguém';
// o pessoal de alguém do jurídico (participa desta agenda) aparece aqui como ocupado
function agjDonoEhMembro(e) {
  const d = agjNorm(String(e.responsavel || '').split(/[,;]/)[0]);
  return !!d && agjMembros.some(m => agjNorm(m.nome) === d || agjNorm(m.nome).includes(d) || d.includes(agjNorm(m.nome)));
}

async function carregarAgendaJur() {
  const lbl = document.getElementById('agj-semana'), grid = document.getElementById('agj-grid'), aviso = document.getElementById('agj-aviso');
  if (!grid) return;
  const dias = agjDias(agjSemana);
  const f = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  lbl.textContent = agjSemana === 0 ? `Esta semana · ${f(dias[0])} – ${f(dias[4])}` : `${f(dias[0])} – ${f(dias[4])}`;
  if (!agjMembros.length) agjMembros = await db.get('usuarios', '?select=nome,email&judicial=eq.true&ativo=eq.true&order=nome.asc') || [];
  const evs = await db.get('agenda_eventos', `?data=gte.${agjIso(dias[0])}&data=lte.${agjIso(dias[4])}&select=*&order=hora_inicio.asc`);
  if (db.lastError) { aviso.innerHTML = `<div class="card"><div class="card-body" style="color:#b91c1c">Não consegui ler a agenda: ${agjEsc(String(db.lastError).slice(0, 200))}</div></div>`; return; }
  aviso.innerHTML = (evs.length && !('agenda' in evs[0]))
    ? '<div class="card" style="margin-bottom:12px"><div class="card-body" style="color:#b45309">Falta rodar o SQL portal/sql/2026-11-13-agenda-juridico.sql — até lá não dá para gravar nesta agenda.</div></div>' : '';
  const duas = agjVeDuas();
  agjEventos = (evs || []).filter(e => {
    if (agjPessoal(e)) { e._dono = agjDono(e); e._ocupado = !e._dono; return e._dono || agjDonoEhMembro(e); }
    e._ocupado = false;
    if ((e.agenda || 'nsp') === 'juridico') return true;
    // 13/11/2026: da agenda da NSP só entram os compromissos em que o Rodrigo participa (não a agenda inteira da empresa)
    return duas && agjParticipa(e, currentUser.name) && !/^\[CANCELADA:/.test(e.titulo || '') && agjNorm(e.tipo) !== 'cancelamento';
  });
  const canceladas = new Set((evs || []).filter(e => /^\[CANCELADA:juridico\]/.test(e.titulo || '')).map(e => String(e.data).slice(0, 10)));
  const nomesDia = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'], hoje = agjIso(new Date());
  grid.innerHTML = dias.map((d, i) => {
    const iso = agjIso(d);
    const doDia = agjEventos.filter(e => String(e.data).slice(0, 10) === iso);
    if (d.getDay() === AGJ_REUNIAO.dow && agjParidade(d) === AGJ_PAR_JUR)
      doDia.push(canceladas.has(iso) ? { _fixa: true, _cancelada: true, hora_inicio: AGJ_REUNIAO.hora } : { _fixa: true, hora_inicio: AGJ_REUNIAO.hora, hora_fim: AGJ_REUNIAO.fim });
    doDia.sort((a, b) => String(a.hora_inicio || '99:99').localeCompare(String(b.hora_inicio || '99:99')));
    return `<div class="card" style="min-width:0">
      <div style="padding:10px;text-align:center;background:var(--gray-50);border-bottom:1px solid var(--gray-200)">
        <div style="font-size:11px;font-weight:700;color:var(--gray-400)">${nomesDia[i]}</div>
        <div style="font-size:20px;font-weight:800;${iso === hoje ? 'color:var(--blue-600)' : ''}">${d.getDate()}</div>
      </div>
      <div style="padding:6px;min-height:80px">
        ${doDia.map(agjCartao).join('')}
        <button onclick="agjNovo('${iso}')" style="width:100%;padding:5px;font-size:11px;color:var(--gray-400);background:none;border:1px dashed var(--gray-300);border-radius:6px;cursor:pointer;margin-top:4px">+ compromisso</button>
      </div></div>`;
  }).join('');
}

function agjCartao(e) {
  const hi = String(e.hora_inicio || '').slice(0, 5), hf = String(e.hora_fim || '').slice(0, 5);
  const h = hi ? (hf ? `${hi}–${hf}` : hi) : '';
  const base = 'padding:6px 8px;border-radius:6px;font-size:12px;margin-bottom:5px;';
  if (e._fixa && e._cancelada) return `<div style="${base}background:var(--gray-50);border-left:3px solid var(--gray-300);color:var(--gray-400)"><s>${AGJ_REUNIAO.hora} · ${AGJ_REUNIAO.lb}</s> cancelada esta semana</div>`;
  if (e._fixa) return `<div style="${base}background:#fef3c7;border-left:3px solid #d97706" title="Reunião fixa quinzenal (pauta no portal). Participantes: ${agjEsc(AGJ_REUNIAO.part.join(', '))}">
    <b style="color:#92400e">${AGJ_REUNIAO.hora} · ${AGJ_REUNIAO.lb}</b> <span style="font-size:9px;background:#d97706;color:#fff;padding:1px 5px;border-radius:8px">FIXA</span>
    <div style="font-size:10px;color:var(--gray-500);margin-top:2px">👥 ${agjEsc(AGJ_REUNIAO.part.map(n => n.split(' ')[0]).join(', '))}</div></div>`;
  if (e._ocupado) return `<div style="${base}background:repeating-linear-gradient(135deg,#f1f5f9,#f1f5f9 6px,#e2e8f0 6px,#e2e8f0 12px);color:var(--gray-600)" title="Horário ocupado (compromisso pessoal)">${h ? `<b>${h}</b> ` : ''}🔒 Ocupado · ${agjEsc(agjPrimeiro(e))}</div>`;
  const nsp = (e.agenda || 'nsp') === 'nsp' && !agjPessoal(e);
  const pes = agjPessoal(e);
  const bg = pes ? '#f5f3ff' : (nsp ? '#eff6ff' : '#fff7ed');
  const borda = pes ? '#7c3aed' : (nsp ? '#2563c4' : '#d97706');
  const resp = String(e.responsavel || '').trim();
  return `<div onclick="agjAbrir('${e.id}')" style="${base}background:${bg};border-left:3px solid ${borda};cursor:pointer" title="${nsp ? 'Agenda da NSP (edite no portal)' : (pes ? 'Pessoal: os outros veem só Ocupado' : 'Clique para editar')}">
    ${h ? `<b>${h}</b> ` : ''}${pes ? '🔒 ' : ''}${nsp ? '<span style="font-size:9px;background:#2563c4;color:#fff;padding:1px 5px;border-radius:8px;margin-right:3px">NSP</span>' : ''}${agjEsc(e.titulo)}
    ${(!pes && e.tipo && !nsp) ? `<div style="font-size:10px;color:var(--amber);margin-top:2px">${agjEsc(e.tipo)}</div>` : ''}
    ${(!pes && resp) ? `<div style="font-size:10px;color:var(--gray-500);margin-top:2px">👤 ${agjEsc(resp.length > 45 ? resp.slice(0, 43) + '…' : resp)}</div>` : ''}
  </div>`;
}

function agjMudarSemana(n) { agjSemana = n === 0 ? 0 : agjSemana + n; carregarAgendaJur(); }

// ── modal ──
function agjHoras(sel, val) {
  const el = document.getElementById(sel); let opts = '<option value="">—</option>';
  for (let h = 6; h <= 22; h++) for (const m of ['00', '15', '30', '45']) { const v = `${String(h).padStart(2, '0')}:${m}`; opts += `<option ${v === val ? 'selected' : ''}>${v}</option>`; }
  if (val && !opts.includes(`>${val}<`)) opts += `<option selected>${val}</option>`;
  el.innerHTML = opts;
}
function agjModal(ev, iso) {
  const e = ev || { data: iso, responsavel: currentUser.name, tipo: 'Reunião' };
  const pes = agjPessoal(e), sel = String(e.responsavel || '').split(/[,;]/).map(s => agjNorm(s)).filter(Boolean);
  let m = document.getElementById('agj-modal');
  if (!m) { m = document.createElement('div'); m.id = 'agj-modal'; document.body.appendChild(m); }
  m.style.cssText = 'position:fixed;inset:0;background:rgba(15,32,68,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  const ist = 'width:100%;padding:8px 10px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:14px;box-sizing:border-box';
  m.innerHTML = `<div style="background:#fff;border-radius:var(--radius);max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:20px;box-shadow:var(--shadow-lg)">
    <div style="font-weight:800;font-size:17px;margin-bottom:12px">${ev ? 'Editar compromisso' : 'Novo compromisso'} <span style="font-size:12px;font-weight:500;color:var(--gray-400)">· agenda do jurídico</span></div>
    <label style="font-size:12px;color:var(--gray-500)">Título</label><input id="agj-t" style="${ist}" value="${agjEsc(e.titulo || '')}" placeholder="Ex.: Audiência — proc. 0000000-00.2026">
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <div style="flex:1 1 140px"><label style="font-size:12px;color:var(--gray-500)">Data</label><input id="agj-d" type="date" style="${ist}" value="${agjEsc(String(e.data || '').slice(0, 10))}"></div>
      <div style="flex:1 1 90px"><label style="font-size:12px;color:var(--gray-500)">Início</label><select id="agj-hi" style="${ist}"></select></div>
      <div style="flex:1 1 90px"><label style="font-size:12px;color:var(--gray-500)">Fim</label><select id="agj-hf" style="${ist}"></select></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13.5px"><input type="checkbox" id="agj-pes" ${pes ? 'checked' : ''} onchange="agjTogglePes()"> 🔒 Compromisso pessoal <span style="color:var(--gray-400);font-size:12px">(os outros veem só "Ocupado" nesse horário)</span></label>
    <div id="agj-bloco-trab">
      <label style="font-size:12px;color:var(--gray-500);display:block;margin-top:10px">Tipo</label><select id="agj-tipo" style="${ist}">${AGJ_TIPOS.map(t => `<option ${t === e.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label style="font-size:12px;color:var(--gray-500);display:block;margin-top:10px">Participantes</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px">${agjMembros.map(u => `<label><input type="checkbox" class="agj-part" value="${agjEsc(u.nome)}" ${sel.some(s => agjNorm(u.nome) === s || agjNorm(u.nome).startsWith(s)) ? 'checked' : ''}> ${agjEsc(u.nome)}</label>`).join('')}</div>
    </div>
    <label style="font-size:12px;color:var(--gray-500);display:block;margin-top:10px">Descrição</label><textarea id="agj-desc" rows="3" style="${ist}">${agjEsc(e.descricao || '')}</textarea>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;flex-wrap:wrap">
      <div>${ev ? '<button class="btn btn-outline" style="color:var(--red)" onclick="agjExcluir()">Excluir</button>' : ''}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-outline" onclick="agjFechar()">Cancelar</button><button class="btn btn-primary" id="agj-salvar" onclick="agjSalvar()">Salvar</button></div>
    </div></div>`;
  agjHoras('agj-hi', String(e.hora_inicio || '').slice(0, 5)); agjHoras('agj-hf', String(e.hora_fim || '').slice(0, 5));
  agjTogglePes();
  m.onclick = x => { if (x.target === m) agjFechar(); };
}
function agjTogglePes() { const p = document.getElementById('agj-pes'); const b = document.getElementById('agj-bloco-trab'); if (p && b) b.style.display = p.checked ? 'none' : ''; }
function agjFechar() { const m = document.getElementById('agj-modal'); if (m) m.remove(); agjEditId = null; }
function agjNovo(iso) { agjEditId = null; agjModal(null, iso); }
function agjAbrir(id) {
  const e = agjEventos.find(x => String(x.id) === String(id)); if (!e) return;
  if (e._ocupado) return;
  if ((e.agenda || 'nsp') === 'nsp' && !agjPessoal(e)) { showToast('Compromisso da agenda da NSP — edite no portal.'); return; }
  if (agjPessoal(e) && !e._dono) return;
  agjEditId = e.id; agjModal(e);
}
async function agjSalvar() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const titulo = v('agj-t').trim(), data = v('agj-d'), hi = v('agj-hi'), hf = v('agj-hf'), pes = document.getElementById('agj-pes').checked;
  if (!titulo) { showToast('⚠️ Informe o título.'); return; }
  if (!data) { showToast('⚠️ Informe a data.'); return; }
  if (hi && hf && hf <= hi) { showToast('⚠️ O fim precisa ser depois do início.'); return; }
  let parts = [...document.querySelectorAll('.agj-part:checked')].map(c => c.value);
  if (pes) parts = [currentUser.name];
  if (!parts.length) parts = [currentUser.name];
  const reg = { titulo, data, hora_inicio: hi, hora_fim: hf, tipo: pes ? 'Pessoal' : v('agj-tipo'), responsavel: parts.join(', '), descricao: v('agj-desc').trim(), agenda: 'juridico' };
  const b = document.getElementById('agj-salvar'); b.disabled = true; b.textContent = 'Salvando…';
  let ok;
  if (agjEditId) {
    const atual = agjEventos.find(x => String(x.id) === String(agjEditId));
    if (atual && atual.agenda) reg.agenda = atual.agenda;   // pessoal criado no portal continua lá
    ok = await db.update('agenda_eventos', agjEditId, reg);
  } else ok = await db.insert('agenda_eventos', Object.assign({ id: Date.now() }, reg));
  if (!ok) { b.disabled = false; b.textContent = 'Salvar'; showToast('⚠️ Não salvou: ' + String(db.lastError || '').slice(0, 160)); return; }
  agjFechar(); showToast('✅ Compromisso salvo.'); carregarAgendaJur();
}
async function agjExcluir() {
  if (!agjEditId || !confirm('Excluir este compromisso?')) return;
  const ok = await db.delete('agenda_eventos', agjEditId);
  if (!ok) { showToast('⚠️ Não consegui excluir.'); return; }
  agjFechar(); showToast('Compromisso excluído.'); carregarAgendaJur();
}

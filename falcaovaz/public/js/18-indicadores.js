// ═══════════════════════════════════════════════════════════════
// INDICADORES DO JURÍDICO + CUSTAS + PETIÇÕES PROTOCOLADAS + RESULTADOS + COBRANÇAS EXTRAJUDICIAIS (09/11/2026)
// Trazido do painel da Dra. Fernanda (artefato "Painel Jurídico NovaSP"), só o que o portal não tinha.
// Usa as tabelas que já existem (processos, andamentos_processos, prazos) + juridico_custas, juridico_peticoes,
// juridico_cobrancas e processos.resultado (sql/2026-11-09-painel-fernanda.sql).
// Regras do painel dela: dias parados = hoje − último andamento; faixas até 30 / 31–60 / 61–90 / acima de 90;
// êxito = ganhas ÷ (ganhas + perdidas); prazo "no prazo" = cumprido até o dia do vencimento.
// ═══════════════════════════════════════════════════════════════
const IND = { proc: [], ult: new Map(), custas: [], pets: [], prazos: [], usuarios: [], filtroAdv: '', filtroTipo: '' };
const indEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const indHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const indDias = (de, ate) => Math.round((new Date(ate + 'T12:00:00') - new Date(de + 'T12:00:00')) / 86400000);
const indBr = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—';
const indBRL = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const indNum = s => { const t = String(s || '').replace(/[^\d,.-]/g, ''); if (!/\d/.test(t)) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isNaN(n) ? null : n; };
const IND_FAIXAS = [['ate30', 'Até 30 dias', 'em dia', '#047857'], ['31a60', '31 a 60', 'atenção', '#b45309'], ['61a90', '61 a 90', 'cobrar', '#c2410c'], ['mais90', 'Acima de 90', 'crítico', '#b91c1c']];
const indFaixa = d => d == null ? null : d <= 30 ? 'ate30' : d <= 60 ? '31a60' : d <= 90 ? '61a90' : 'mais90';
const IND_RES = { ganha: 'Ganha', perdida: 'Perdida', parcial: 'Parcialmente procedente', acordo: 'Acordo', extinto: 'Extinto sem mérito' };
const IND_TIPOS_CUSTA = ['Inicial', 'Diligência', 'Preparo / recurso', 'Perícia', 'Certidão', 'Outra'];
const IND_TIPOS_PET = ['Inicial', 'Manifestação', 'Recurso', 'Cumprimento de sentença', 'Acordo', 'Outra'];

async function carregarIndicadores() {
  const box = document.getElementById('ind-conteudo'); if (!box) return;
  box.innerHTML = '<div class="card"><div class="card-body text-gray">Carregando…</div></div>';
  const [proc, andam, custas, pets, prazos, usuarios] = await Promise.all([
    db.get('processos', '?status=eq.ativo&select=id,numero,tipo,fase,autor,reu,responsavel_id,ultimo_mov_cnj,resultado,resultado_data,resultado_nota,status&order=numero.asc'),
    db.get('andamentos_processos', '?select=processo_id,data&order=data.desc&limit=20000'),
    db.get('juridico_custas', '?select=*&order=data.desc'),
    db.get('juridico_peticoes', '?select=*&order=data.desc&limit=2000'),
    db.get('prazos', '?select=id,processo_id,referencia,tipo,vencimento,concluido,concluido_em,responsavel_id&order=vencimento.asc'),
    db.get('usuarios', '?select=id,nome&ativo=eq.true&order=nome.asc')
  ]);
  if (db.lastError && /juridico_custas|juridico_peticoes|resultado|concluido_em/.test(db.lastError)) {
    box.innerHTML = `<div class="card"><div class="card-body" style="color:#b91c1c">Falta rodar o SQL sql/2026-11-09-painel-fernanda.sql (${indEsc(db.lastError).slice(0, 200)}).</div></div>`; return;
  }
  const encerrados = await db.get('processos', '?status=eq.encerrado&resultado=not.is.null&select=id,numero,tipo,responsavel_id,resultado,resultado_data');
  const ult = new Map();
  (andam || []).forEach(a => { if (a.data && (!ult.has(a.processo_id) || a.data > ult.get(a.processo_id))) ult.set(a.processo_id, a.data); });
  (proc || []).forEach(p => { const c = p.ultimo_mov_cnj ? String(p.ultimo_mov_cnj).slice(0, 10) : null; if (c && (!ult.has(p.id) || c > ult.get(p.id))) ult.set(p.id, c); });
  Object.assign(IND, { proc: proc || [], encerrados: encerrados || [], ult, custas: custas || [], pets: pets || [], prazos: prazos || [], usuarios: usuarios || [] });
  renderIndicadores();
}
const indNome = id => ((IND.usuarios.find(u => u.id === id) || {}).nome || '—');
const indProc = id => IND.proc.find(p => p.id === id) || (IND.encerrados || []).find(p => p.id === id);
const indRotProc = p => p ? `${p.numero || '—'}${p.autor || p.reu ? ' · ' + [p.autor, p.reu].filter(Boolean).join(' x ').slice(0, 60) : ''}` : '—';

function renderIndicadores() {
  const box = document.getElementById('ind-conteudo'); if (!box) return;
  const hoje = indHoje(), fa = IND.filtroAdv, ft = IND.filtroTipo;
  const ok = p => (!fa || p.responsavel_id === fa) && (!ft || p.tipo === ft);
  const procs = IND.proc.filter(ok);
  const ids = new Set(procs.map(p => p.id));
  const linhas = procs.map(p => { const u = IND.ult.get(p.id) || null; const d = u ? indDias(u, hoje) : null;
    const custa = IND.custas.filter(c => c.processo_id === p.id).reduce((s, c) => s + Number(c.valor || 0), 0);
    return { p, ult: u, dias: d, faixa: indFaixa(d), custa }; });
  const cont = k => linhas.filter(l => l.faixa === k).length;
  const semData = linhas.filter(l => l.dias == null).length;
  // prazos
  const pz = IND.prazos.filter(z => !z.processo_id || ids.has(z.processo_id) || (!fa && !ft));
  const abertos = pz.filter(z => !z.concluido && z.vencimento).map(z => ({ z, falta: indDias(hoje, z.vencimento) })).sort((a, b) => a.falta - b.falta);
  const venc = abertos.filter(x => x.falta < 0).length, proximos = abertos.filter(x => x.falta >= 0 && x.falta <= 15);
  const semanas = []; for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1 - 7 * i); const ini = d.toISOString().slice(0, 10); const f = new Date(d); f.setDate(f.getDate() + 6); semanas.push([ini, f.toISOString().slice(0, 10)]); }
  const cumpr = semanas.map(([a, b]) => { const s = pz.filter(z => z.concluido && z.concluido_em && z.concluido_em >= a && z.concluido_em <= b); return { a, n: s.length, noPrazo: s.filter(z => !z.vencimento || z.concluido_em <= z.vencimento).length }; });
  const maxS = Math.max(1, ...cumpr.map(c => c.n));
  // êxito (todos os processos com resultado, ativos e encerrados)
  const comRes = IND.proc.concat(IND.encerrados || []).filter(p => p.resultado && ok(p));
  const ganhas = comRes.filter(p => p.resultado === 'ganha').length, perdidas = comRes.filter(p => p.resultado === 'perdida').length;
  const exito = ganhas + perdidas ? Math.round(ganhas * 100 / (ganhas + perdidas)) : null;
  // custas
  const custasF = IND.custas.filter(c => !fa && !ft || ids.has(c.processo_id));
  const totalCustas = custasF.reduce((s, c) => s + Number(c.valor || 0), 0);
  // petições (últimos 30 dias)
  const desde30 = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
  const petsF = IND.pets.filter(x => (!fa || x.advogado_id === fa) && (!ft || (indProc(x.processo_id) || {}).tipo === ft));
  const pets30 = petsF.filter(x => x.data >= desde30);
  const mesAtual = hoje.slice(0, 7);
  const prod = {}; petsF.filter(x => String(x.data).slice(0, 7) === mesAtual).forEach(x => { const n = indNome(x.advogado_id); prod[n] = (prod[n] || 0) + 1; });
  const parados = linhas.filter(l => l.dias != null).sort((a, b) => b.dias - a.dias).slice(0, 12);
  const tipos = [...new Set(IND.proc.map(p => p.tipo).filter(Boolean))].sort();
  const advs = [...new Set(IND.proc.map(p => p.responsavel_id).filter(Boolean))];
  const kpi = (rot, val, sub, cor) => `<div class="stat-card" style="padding:14px"><div style="font-size:12px;color:var(--gray-500)">${rot}</div><div style="font-size:24px;font-weight:700;color:${cor || 'var(--gray-800)'}">${val}</div><div style="font-size:11px;color:var(--gray-500)">${sub || ''}</div></div>`;
  const alertas = [];
  if (venc) alertas.push(`<b>${venc}</b> prazo(s) vencido(s) sem cumprimento`);
  const em3 = abertos.filter(x => x.falta >= 0 && x.falta <= 3).length; if (em3) alertas.push(`<b>${em3}</b> prazo(s) vencem em até 3 dias`);
  if (cont('mais90')) alertas.push(`<b>${cont('mais90')}</b> processo(s) parado(s) há mais de 90 dias`);
  if (cont('61a90')) alertas.push(`<b>${cont('61a90')}</b> processo(s) parado(s) entre 61 e 90 dias`);
  box.innerHTML = `
    <div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select onchange="IND.filtroAdv=this.value;renderIndicadores()" style="padding:7px 10px"><option value="">Todas as advogadas</option>${advs.map(a => `<option value="${a}" ${fa === a ? 'selected' : ''}>${indEsc(indNome(a))}</option>`).join('')}</select>
      <select onchange="IND.filtroTipo=this.value;renderIndicadores()" style="padding:7px 10px"><option value="">Todos os tipos de ação</option>${tipos.map(t => `<option ${ft === t ? 'selected' : ''}>${indEsc(t)}</option>`).join('')}</select>
      <span style="flex:1"></span>
      <button class="btn btn-secondary" onclick="indNovaCusta()">+ Custa</button>
      <button class="btn btn-secondary" onclick="indNovaPeticao()">+ Petição protocolada</button>
      <button class="btn btn-secondary" onclick="indNovoResultado()">+ Resultado</button>
    </div></div>
    <div id="ind-form"></div>
    ${alertas.length ? `<div class="card" style="margin-bottom:14px;border-left:4px solid #b45309"><div class="card-body" style="background:#fffbeb;font-size:13px">⚠️ ${alertas.join(' · ')}</div></div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px">
      ${kpi('Processos ativos', procs.length, semData ? `${semData} sem andamento registrado` : 'com andamento registrado')}
      ${kpi('Parados há mais de 60 dias', cont('61a90') + cont('mais90'), `${cont('mais90')} acima de 90 dias`, cont('mais90') ? '#b91c1c' : '')}
      ${kpi('Prazos vencidos', venc, `${proximos.length} vencem em 15 dias`, venc ? '#b91c1c' : '')}
      ${kpi('Taxa de êxito', exito == null ? '—' : exito + '%', `${ganhas} ganha(s) · ${perdidas} perdida(s)`, '#047857')}
      ${kpi('Custas pagas', indBRL(totalCustas), `${custasF.length} lançamento(s)`)}
      ${kpi('Petições (30 dias)', pets30.length, `${Object.values(prod).reduce((a, b) => a + b, 0)} no mês`)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">
      <div class="card"><div class="card-header"><div class="card-title">Processos parados por faixa</div></div><div class="card-body">
        ${IND_FAIXAS.map(([k, r, s, c]) => { const n = cont(k); return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:13px"><span style="width:110px">${r} <small style="color:var(--gray-500)">${s}</small></span>
          <div style="flex:1;background:#f1f5f9;border-radius:6px;height:16px"><div style="width:${procs.length ? n * 100 / procs.length : 0}%;background:${c};height:16px;border-radius:6px"></div></div><b style="width:30px;text-align:right">${n}</b></div>`; }).join('')}
        <div style="font-size:11px;color:var(--gray-500);margin-top:6px">Dias parados = hoje menos o último andamento (DataJud, DJEN, e-SAJ ou manual).</div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Prazos cumpridos por semana</div></div><div class="card-body">
        <div style="display:flex;align-items:flex-end;gap:6px;height:120px">${cumpr.map(c => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%" title="semana de ${indBr(c.a)}: ${c.n} cumprido(s), ${c.noPrazo} no prazo">
          <small style="font-size:10px">${c.n || ''}</small><div style="width:100%;height:${c.n * 90 / maxS}px;background:#1e4d99;border-radius:4px 4px 0 0;position:relative"><div style="position:absolute;bottom:0;width:100%;height:${c.n ? c.noPrazo * 100 / c.n : 0}%;background:#047857;border-radius:4px 4px 0 0"></div></div>
          <small style="font-size:9px;color:var(--gray-500)">${indBr(c.a).slice(0, 5)}</small></div>`).join('')}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:6px">Verde = cumprido até o vencimento. A data de cumprimento é gravada ao marcar o prazo como concluído (a partir de 09/11/2026).</div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Próximos prazos (15 dias)</div></div><div class="card-body" style="font-size:13px">
        ${proximos.length || venc ? abertos.filter(x => x.falta <= 15).slice(0, 12).map(x => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100)"><b style="width:74px;color:${x.falta < 0 ? '#b91c1c' : x.falta <= 3 ? '#b45309' : 'inherit'}">${x.falta < 0 ? 'venceu' : x.falta === 0 ? 'hoje' : x.falta + ' dia(s)'}</b>
          <span style="flex:1">${indEsc(x.z.referencia || x.z.tipo || 'Prazo')}<br><small style="color:var(--gray-500)">${indEsc(indRotProc(indProc(x.z.processo_id)))} · ${indBr(x.z.vencimento)}</small></span></div>`).join('') : '<span class="text-gray">Nenhum prazo nos próximos 15 dias.</span>'}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Os 12 mais parados</div></div><div class="card-body" style="font-size:13px">
        ${parados.map(l => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100);cursor:pointer" onclick="goTo('processos');setTimeout(()=>abrirProcesso('${l.p.id}'),300)">
          <b style="width:60px;color:${(IND_FAIXAS.find(f => f[0] === l.faixa) || [])[3]}">${l.dias} d</b><span style="flex:1">${indEsc(indRotProc(l.p))}<br><small style="color:var(--gray-500)">${indEsc(indNome(l.p.responsavel_id))} · último andamento ${indBr(l.ult)}${l.custa ? ' · custas ' + indBRL(l.custa) : ''}</small></span></div>`).join('') || '<span class="text-gray">—</span>'}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Custas × tempo parado</div></div><div class="card-body" style="font-size:13px">
        ${linhas.filter(l => l.custa > 0).sort((a, b) => b.custa - a.custa).slice(0, 10).map(l => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100)"><b style="width:110px">${indBRL(l.custa)}</b><span style="flex:1">${indEsc(indRotProc(l.p))}<br><small style="color:var(--gray-500)">${l.dias == null ? 'sem andamento' : 'parado há ' + l.dias + ' dia(s)'}</small></span></div>`).join('') || '<span class="text-gray">Nenhuma custa lançada ainda. Use “+ Custa”.</span>'}
        ${custasF.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--blue-600)">Lançamentos (${custasF.length})</summary>${custasF.slice(0, 50).map(c => `<div style="font-size:12px;padding:3px 0;display:flex;gap:6px"><span style="width:76px">${indBr(c.data)}</span><span style="width:96px">${indBRL(c.valor)}</span><span style="flex:1">${indEsc(c.tipo || '')} · ${indEsc(indRotProc(indProc(c.processo_id)))}${c.descricao ? ' · ' + indEsc(c.descricao) : ''}</span><a href="#" onclick="event.preventDefault();indApagar('juridico_custas','${c.id}')" style="color:#b91c1c">✕</a></div>`).join('')}</details>` : ''}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Petições protocoladas</div></div><div class="card-body" style="font-size:13px">
        <div style="margin-bottom:8px">${Object.entries(prod).length ? Object.entries(prod).map(([n, q]) => `<span class="badge" style="margin-right:6px">${indEsc(n.split(' ')[0])}: <b>${q}</b> no mês</span>`).join('') : '<span class="text-gray">Nenhuma petição registrada neste mês.</span>'}</div>
        ${petsF.slice(0, 12).map(x => `<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid var(--gray-100);font-size:12px"><span style="width:76px">${indBr(x.data)}</span><span style="flex:1">${indEsc(x.tipo || 'Petição')} · ${indEsc(indRotProc(indProc(x.processo_id)))}<br><small style="color:var(--gray-500)">${indEsc(indNome(x.advogado_id))}${x.descricao ? ' · ' + indEsc(x.descricao) : ''}</small></span><a href="#" onclick="event.preventDefault();indApagar('juridico_peticoes','${x.id}')" style="color:#b91c1c">✕</a></div>`).join('')}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Resultados</div></div><div class="card-body" style="font-size:13px">
        ${Object.keys(IND_RES).map(k => `<span class="badge" style="margin:0 6px 6px 0">${IND_RES[k]}: <b>${comRes.filter(p => p.resultado === k).length}</b></span>`).join('')}
        ${comRes.slice().sort((a, b) => String(b.resultado_data || '').localeCompare(String(a.resultado_data || ''))).slice(0, 10).map(p => `<div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--gray-100)">${indBr(p.resultado_data)} · <b>${IND_RES[p.resultado]}</b> · ${indEsc(indRotProc(p))}</div>`).join('')}
        <div style="font-size:11px;color:var(--gray-500);margin-top:6px">Êxito = ganhas ÷ (ganhas + perdidas). Acordo, parcial e extinto ficam fora da conta.</div></div></div>
    </div>`;
}

// ── formulários ──
function indProcOptions() {
  return IND.proc.concat(IND.encerrados || []).map(p => `<option value="${p.id}">${indEsc(indRotProc(p))}</option>`).join('');
}
function indForm(titulo, campos, salvar) {
  document.getElementById('ind-form').innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-body">
    <div style="font-weight:700;margin-bottom:10px">${titulo}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${campos}</div>
    <div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-primary" onclick="${salvar}">Salvar</button><button class="btn btn-secondary" onclick="document.getElementById('ind-form').innerHTML=''">Cancelar</button><span id="ind-msg" style="font-size:12px;color:#b91c1c"></span></div></div></div>`;
}
const indCampo = (rot, html) => `<label style="font-size:12px;color:var(--gray-500);display:flex;flex-direction:column;gap:3px">${rot}${html}</label>`;
const indV = id => (document.getElementById(id) || {}).value || '';
function indNovaCusta() {
  indForm('Lançar custa', indCampo('Processo', `<select id="ic-proc">${indProcOptions()}</select>`) + indCampo('Data do pagamento', `<input type="date" id="ic-data" value="${indHoje()}">`)
    + indCampo('Valor (R$)', `<input id="ic-valor" inputmode="decimal" placeholder="0,00">`) + indCampo('Tipo', `<select id="ic-tipo">${IND_TIPOS_CUSTA.map(t => `<option>${t}</option>`).join('')}</select>`)
    + indCampo('Descrição', `<input id="ic-desc" placeholder="Ex.: guia DARE da inicial">`), 'indSalvarCusta()');
}
async function indSalvarCusta() {
  const valor = indNum(indV('ic-valor')); if (valor == null) { document.getElementById('ind-msg').textContent = 'Informe o valor.'; return; }
  const r = await db.insert('juridico_custas', { processo_id: indV('ic-proc'), data: indV('ic-data') || indHoje(), valor, tipo: indV('ic-tipo'), descricao: indV('ic-desc') || null, criado_por_id: currentUser.id });
  if (!r) { document.getElementById('ind-msg').textContent = 'Não salvou: ' + (db.lastError || ''); return; }
  carregarIndicadores();
}
function indNovaPeticao() {
  const advs = IND.usuarios.filter(u => IND.proc.some(p => p.responsavel_id === u.id) || u.id === currentUser.id);
  indForm('Registrar petição protocolada', indCampo('Processo', `<select id="ip-proc"><option value="">(sem processo cadastrado)</option>${indProcOptions()}</select>`)
    + indCampo('Data do protocolo', `<input type="date" id="ip-data" value="${indHoje()}">`) + indCampo('Tipo', `<select id="ip-tipo">${IND_TIPOS_PET.map(t => `<option>${t}</option>`).join('')}</select>`)
    + indCampo('Advogada', `<select id="ip-adv">${advs.map(u => `<option value="${u.id}" ${u.id === currentUser.id ? 'selected' : ''}>${indEsc(u.nome)}</option>`).join('')}</select>`)
    + indCampo('Descrição', `<input id="ip-desc" placeholder="Ex.: réplica">`), 'indSalvarPeticao()');
}
async function indSalvarPeticao() {
  const r = await db.insert('juridico_peticoes', { processo_id: indV('ip-proc') || null, data: indV('ip-data') || indHoje(), tipo: indV('ip-tipo'), advogado_id: indV('ip-adv') || currentUser.id, descricao: indV('ip-desc') || null, criado_por_id: currentUser.id });
  if (!r) { document.getElementById('ind-msg').textContent = 'Não salvou: ' + (db.lastError || ''); return; }
  carregarIndicadores();
}
function indNovoResultado() {
  indForm('Registrar resultado do processo', indCampo('Processo', `<select id="ir-proc">${indProcOptions()}</select>`)
    + indCampo('Resultado', `<select id="ir-res"><option value="">(limpar resultado)</option>${Object.keys(IND_RES).map(k => `<option value="${k}">${IND_RES[k]}</option>`).join('')}</select>`)
    + indCampo('Data da decisão', `<input type="date" id="ir-data" value="${indHoje()}">`) + indCampo('Nota', `<input id="ir-nota" placeholder="Ex.: sentença de procedência">`), 'indSalvarResultado()');
}
async function indSalvarResultado() {
  const res = indV('ir-res') || null;
  const r = await db.update('processos', indV('ir-proc'), { resultado: res, resultado_data: res ? (indV('ir-data') || indHoje()) : null, resultado_nota: res ? (indV('ir-nota') || null) : null });
  if (!r) { document.getElementById('ind-msg').textContent = 'Não salvou: ' + (db.lastError || ''); return; }
  carregarIndicadores();
}
async function indApagar(tabela, id) {
  if (!confirm('Apagar este lançamento?')) return;
  await db.delete(tabela, id); carregarIndicadores();
}

// ═══════════════ COBRANÇAS EXTRAJUDICIAIS (planilha da reunião mensal) ═══════════════
const COB_ST = ['Cobrança / Pagamento', 'Acordo', 'Sem atualização', 'Ação / Despejo', 'Procuração', 'Administrativo', 'Bonificação'];
let _cob = [], _cobQ = '', _cobSt = '';
async function carregarCobrancas() {
  const box = document.getElementById('cob-conteudo'); if (!box) return;
  box.innerHTML = '<div class="card"><div class="card-body text-gray">Carregando…</div></div>';
  _cob = await db.get('juridico_cobrancas', '?ativo=eq.true&select=*&order=vencimento.asc.nullslast');
  if (db.lastError && /juridico_cobrancas/.test(db.lastError)) { box.innerHTML = '<div class="card"><div class="card-body" style="color:#b91c1c">Falta rodar o SQL sql/2026-11-09-painel-fernanda.sql.</div></div>'; return; }
  renderCobrancas();
}
function renderCobrancas() {
  const box = document.getElementById('cob-conteudo'); if (!box) return;
  const hoje = indHoje(), q = _cobQ.toLowerCase();
  const lista = _cob.filter(c => (!_cobSt || c.status === _cobSt) && (!q || [c.contrato, c.locador, c.locatario, c.observacao].join(' ').toLowerCase().includes(q)));
  const porSt = {}; _cob.forEach(c => { porSt[c.status || 'Sem atualização'] = (porSt[c.status || 'Sem atualização'] || 0) + 1; });
  box.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${[['', 'Todos', _cob.length]].concat(COB_ST.map(s => [s, s, porSt[s] || 0])).map(([k, r, n]) => `<button class="btn ${_cobSt === k ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 10px;font-size:12px" onclick="_cobSt='${k}';renderCobrancas()">${r} · ${n}</button>`).join('')}</div>
    <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
      <input placeholder="Buscar contrato, locador, locatário ou observação" value="${indEsc(_cobQ)}" oninput="_cobQ=this.value;renderCobrancas()" style="flex:1;min-width:240px;padding:7px 10px">
      <button class="btn btn-secondary" onclick="document.getElementById('cob-imp').style.display='block'">Atualizar com a planilha do mês</button></div>
      <div id="cob-imp" class="card-body" style="display:none;border-top:1px solid var(--gray-100)">
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:6px">Copie da planilha da reunião as linhas (contrato, vencimento, status, locador, locatário, observação) e cole aqui. Contratos novos entram; os que já existem são atualizados; os que não vierem na planilha saem da lista (ficam guardados).</div>
        <textarea id="cob-txt" rows="6" style="width:100%;font-family:monospace;font-size:12px"></textarea>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center"><button class="btn btn-primary" onclick="cobImportar()">Atualizar</button><span id="cob-msg" style="font-size:12px"></span></div></div></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Contrato</th><th>Vencimento</th><th>Em aberto</th><th>Status</th><th>Locador × Locatário</th><th>Observação</th></tr></thead><tbody>
      ${lista.map(c => { const d = c.vencimento ? indDias(c.vencimento, hoje) : null; return `<tr>
        <td><b>${indEsc(c.contrato)}</b></td><td>${indBr(c.vencimento)}</td>
        <td style="color:${d > 90 ? '#b91c1c' : d > 30 ? '#b45309' : 'inherit'};font-weight:600">${d == null ? '—' : d + ' dia(s)'}</td>
        <td><select onchange="cobSalvar('${indEsc(c.contrato)}',{status:this.value})" style="padding:4px 6px;font-size:12px">${COB_ST.concat(COB_ST.includes(c.status) || !c.status ? [] : [c.status]).map(s => `<option ${c.status === s ? 'selected' : ''}>${indEsc(s)}</option>`).join('')}</select></td>
        <td style="font-size:12px">${indEsc(c.locador || '')}<br><small style="color:var(--gray-500)">${indEsc(c.locatario || '')}</small></td>
        <td><input value="${indEsc(c.observacao || '')}" onchange="cobSalvar('${indEsc(c.contrato)}',{observacao:this.value})" style="width:100%;min-width:180px;padding:4px 6px;font-size:12px">
          <br><small style="color:var(--gray-500)">${c.atualizado_por ? 'por ' + indEsc(c.atualizado_por) + ' em ' + indBr(String(c.atualizado_em).slice(0, 10)) : ''}</small></td></tr>`; }).join('') || '<tr><td colspan="6" class="text-gray">Nenhum contrato.</td></tr>'}
    </tbody></table></div></div>`;
}
async function cobSalvar(contrato, dados) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/juridico_cobrancas?contrato=eq.${encodeURIComponent(contrato)}`, { method: 'PATCH', headers: DB_HEADERS,
    body: JSON.stringify(Object.assign({ atualizado_em: new Date().toISOString(), atualizado_por: currentUser.name }, dados)) });
  if (!r.ok) { alert('Não salvou: ' + await r.text()); return; }
  const c = _cob.find(x => x.contrato === contrato); if (c) Object.assign(c, dados, { atualizado_por: currentUser.name, atualizado_em: new Date().toISOString() });
}
async function cobImportar() {
  const msg = document.getElementById('cob-msg'), linhas = indV('cob-txt').split(/\n/).map(l => l.trim()).filter(Boolean);
  const novos = [], falhas = [];
  linhas.forEach(l => {
    const p = l.split(/\t|;/).map(x => x.trim()); const c = (p[0] || '').replace(/\D/g, ''); const m = (p[1] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) || (p[1] || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!c || !p[3]) { falhas.push(l.slice(0, 40)); return; }
    let st = p[2] || 'Sem atualização'; if (/despejo/i.test(st)) st = 'Ação / Despejo'; if (!COB_ST.includes(st)) st = COB_ST.find(s => s.toLowerCase().startsWith(st.toLowerCase().slice(0, 5))) || st;
    const venc = m ? (m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`) : null;
    novos.push({ contrato: c, vencimento: venc, status: st, locador: p[3], locatario: p[4] || null, observacao: p[5] || null, ativo: true, atualizado_em: new Date().toISOString(), atualizado_por: currentUser.name });
  });
  if (!novos.length) { msg.textContent = 'Nenhuma linha reconhecida.'; return; }
  const sai = _cob.filter(c => !novos.some(n => n.contrato === c.contrato));
  if (sai.length && !confirm(`${novos.length} contrato(s) na planilha. ${sai.length} contrato(s) da lista atual não vieram e vão sair da lista (ficam guardados). Continuar?`)) return;
  const h = Object.assign({}, DB_HEADERS, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/juridico_cobrancas?on_conflict=contrato`, { method: 'POST', headers: h, body: JSON.stringify(novos) });
  if (!r.ok) { msg.textContent = 'Não salvou: ' + await r.text(); return; }
  if (sai.length) await fetch(`${SUPABASE_URL}/rest/v1/juridico_cobrancas?contrato=in.(${sai.map(c => '"' + c.contrato + '"').join(',')})`, { method: 'PATCH', headers: DB_HEADERS, body: JSON.stringify({ ativo: false }) });
  msg.textContent = `${novos.length} contrato(s) atualizado(s)${falhas.length ? ` · ${falhas.length} linha(s) não reconhecida(s)` : ''}.`;
  carregarCobrancas();
}

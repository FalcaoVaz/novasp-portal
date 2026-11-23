// ═══════════════════════════════════════════════════════════════
// ENTREGA DE CHAVES no banco (23/11/2026) — etapa 3 da saída do Apps Script.
// Substitui o painel antigo (entregaapp/painel.html em iframe, público e sem login).
//  · tela inicial = entregas do MÊS + "Precisa de atenção" (atrasados de qualquer mês) + rescisões do Imoview sem processo
//  · cada processo: responsável, prazo da etapa atual, histórico (quem fez o quê), avisos por e-mail às partes
//  · cadastro pelo código do contrato no Imoview (cópia em imoview_contratos / imoview_pessoas, atualizada de hora em hora)
// Tabelas: chaves_processos, chaves_andamentos (sql/2026-11-23-entrega-chaves-supabase.sql).
// E-mails: função falcaovaz enviar-aviso (tipo 'chaves'); respostas para entrega.chaves@ + João, cópia para o João.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const AVISO_FN = 'https://falcaovaz.netlify.app/.netlify/functions/enviar-aviso';
  const RESCISOES_DESDE = '2026-11-01';   // antes disso as datas de rescisão do Imoview vieram distorcidas da migração

  // ── etapas e prazos ────────────────────────────────────────────
  // prazo: dias corridos a partir da data "de" (a etapa fica ATRASADA depois disso)
  const ETAPAS_BASE = [
    { key: 'agendada', col: 'data_agendada',  status: 'Entrega de chaves agendada',  label: 'Agendamento',        prazo: { de: 'data_cadastro', dias: 3 } },
    { key: 'entregue', col: 'data_entrega',   status: 'Entrega de chaves realizada', label: 'Entrega das chaves', prazo: { de: 'data_agendada', dias: 1 } },
    { key: 'vistoria', col: 'data_vistoria',  status: 'Vistoria realizada',          label: 'Vistoria',           prazo: { de: 'data_entrega', dias: 3 } },
    { key: 'liberada', col: 'data_liberacao', status: 'Chaves liberadas',            label: 'Chaves liberadas p/ locação', prazo: { de: 'data_vistoria', dias: p => (p.necessita_reparo === 'Sim' ? 20 : 2) } },
  ];
  const ETAPAS_FINAIS = {
    'Caução': [
      { key: 'debitos',   col: 'data_debitos',   status: 'Débitos quitados',    label: 'Débitos quitados',    prazo: { de: 'data_entrega', dias: 30 } },
      { key: 'devolucao', col: 'data_devolucao', status: 'Devolução da caução', label: 'Devolução da caução', prazo: { de: 'data_debitos', dias: 10 } }],
    'Título de capitalização': [
      { key: 'resgate',   col: 'data_resgate',   status: 'Resgate do título',   label: 'Resgate do título',   prazo: { de: 'data_entrega', dias: 30 } },
      { key: 'debitos',   col: 'data_debitos',   status: 'Débitos quitados',    label: 'Débitos quitados',    prazo: { de: 'data_entrega', dias: 30 } }],
    'Seguro fiança': [
      { key: 'sinistro',  col: 'data_sinistro',  status: 'Entrada no sinistro', label: 'Entrada no sinistro (se houver débito)', opcional: true, prazo: { de: 'data_entrega', dias: 15 } },
      { key: 'debitos',   col: 'data_debitos',   status: 'Débitos quitados',    label: 'Débitos quitados',    prazo: { de: 'data_entrega', dias: 30 } }],
    'Fiador': [
      { key: 'debitos',   col: 'data_debitos',   status: 'Débitos quitados',    label: 'Débitos quitados',    prazo: { de: 'data_entrega', dias: 30 } }],
  };
  const GARANTIAS = ['Caução', 'Seguro fiança', 'Fiador', 'Título de capitalização', 'Sem garantia'];
  const etapasDe = p => ETAPAS_BASE.concat(ETAPAS_FINAIS[p.tipo_fianca] || ETAPAS_FINAIS['Fiador']);
  const feita = (p, et) => !!p[et.col];
  const encerrado = p => !!p.cancelado || etapasDe(p).every(et => et.opcional || feita(p, et));
  const etapaAtual = p => p.cancelado ? null : (etapasDe(p).find(et => !et.opcional && !feita(p, et)) || null);

  const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const D = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const br = s => { const d = D(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
  const diasEntre = (a, b) => Math.round((b - a) / 864e5);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quem = () => (typeof CUR !== 'undefined' && CUR && CUR.nome) || '';
  const mesDe = p => String(p.data_entrega || p.data_agendada || p.data_cadastro || '').slice(0, 7);
  const mesAtual = () => iso(hoje()).slice(0, 7);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesLabel = m => MESES[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);

  // prazo da etapa atual: {vence: Date, atraso: dias (>0 = atrasado)} ou null
  function prazoDe(p, et) {
    if (!et || !et.prazo) return null;
    const base = D(p[et.prazo.de]); if (!base) return null;
    const dias = typeof et.prazo.dias === 'function' ? et.prazo.dias(p) : et.prazo.dias;
    const vence = new Date(base.getTime() + dias * 864e5);
    return { vence, atraso: diasEntre(vence, hoje()) };
  }
  // seguro fiança: sinistro precisa entrar em até 15 dias da entrega se ainda houver débito
  function alertaSinistro(p) {
    if (p.tipo_fianca !== 'Seguro fiança' || p.data_sinistro || p.data_debitos || !p.data_entrega || p.cancelado) return null;
    const d = diasEntre(D(p.data_entrega), hoje());
    return d > 15 ? { atraso: d - 15, txt: `sinistro: ${d - 15} dia(s) além do prazo de 15 dias` } : d > 10 ? { atraso: 0, txt: `sinistro: faltam ${15 - d} dia(s) (prazo 15 dias)` } : null;
  }
  function situacao(p) {
    if (p.cancelado) return { cls: 'b-gray', txt: 'Cancelado', atraso: null };
    const et = etapaAtual(p);
    if (!et) return { cls: 'b-green', txt: '✓ Encerrado', atraso: null };
    const pr = prazoDe(p, et), si = alertaSinistro(p);
    const atraso = Math.max(pr && pr.atraso > 0 ? pr.atraso : 0, si ? si.atraso : 0);
    return { cls: atraso > 0 ? 'b-red' : 'b-amber', txt: et.label, atraso: atraso || null, vence: pr && pr.vence, et };
  }

  // ── estado ─────────────────────────────────────────────────────
  let _proc = [], _resc = [], _users = [], _filtro = 'mes', _mes = '', _busca = '', _aberto = null;

  async function carregar() {
    const [proc, resc, users] = await Promise.all([
      db.get('chaves_processos', '?select=*&order=data_cadastro.desc&limit=5000'),
      db.get('imoview_contratos', `?select=codigo,codigo_auxiliar,locatario_nome,endereco,garantia,data_rescisao,data_aviso_desocupacao,data_previsao_rescisao,situacao&or=(data_rescisao.gte.${RESCISOES_DESDE},data_aviso_desocupacao.gte.${RESCISOES_DESDE})&order=data_rescisao.desc.nullslast&limit=500`).catch(() => []),
      _users.length ? _users : db.get('usuarios', '?select=nome&ativo=eq.true&order=nome.asc').catch(() => []),
    ]);
    _proc = proc || []; _users = users || [];
    const comProc = new Set(_proc.map(p => p.contrato_imoview).filter(Boolean));
    _resc = (resc || []).filter(c => !comProc.has(c.codigo));
  }

  // ── página ─────────────────────────────────────────────────────
  async function abrir() {
    const pg = document.getElementById('p-entrega'); if (!pg) return;
    if (!pg.dataset.novo) {
      pg.dataset.novo = '1';
      pg.innerHTML = `<div class="ph"><div><h1 class="pt">Entrega de Chaves</h1><div class="pst">Processos de devolução de imóvel: entrega, vistoria, liberação e garantia</div></div>
        <div style="display:flex;gap:8px"><button class="btn btn-o" onclick="EntregaChaves.atualizar()">↻ Atualizar</button><button class="btn btn-g" onclick="EntregaChaves.novo()">+ Nova entrega</button></div></div>
        <div class="sg" id="ec-kpis"></div>
        <div id="ec-atencao"></div>
        <div id="ec-resc"></div>
        <div style="display:flex;gap:8px;margin:14px 0 10px;flex-wrap:wrap;align-items:center" id="ec-filtros"></div>
        <div class="tw tbl"><table><thead><tr><th>Imóvel</th><th>Locatário</th><th>Garantia</th><th>Etapa atual</th><th>Prazo</th><th>Responsável</th><th>Mês</th></tr></thead><tbody id="ec-lista"><tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8">Carregando…</td></tr></tbody></table></div>
        <div style="font-size:12px;color:var(--muted,#64748b);margin-top:8px">Prazos: agendar em até 3 dias do cadastro · vistoria até 3 dias após a entrega · liberação até 2 dias após a vistoria (20 se houver reparo) · débitos quitados até 30 dias · devolução da caução até 10 dias após os débitos · sinistro do seguro fiança até 15 dias após a entrega.</div>`;
    }
    _mes = _mes || mesAtual();
    await atualizar();
  }
  async function atualizar() {
    try { await carregar(); render(); }
    catch (e) { const l = document.getElementById('ec-lista'); if (l) l.innerHTML = `<tr><td colspan="7" style="color:#dc2626;padding:16px">Erro: ${esc(e.message)}</td></tr>`; }
  }

  function render() {
    const sit = new Map(_proc.map(p => [p.protocolo, situacao(p)]));
    const abertos = _proc.filter(p => !encerrado(p));
    const atrasados = abertos.filter(p => sit.get(p.protocolo).atraso);
    const encMes = _proc.filter(p => !p.cancelado && encerrado(p) && String(p.atualizado_em || '').slice(0, 7) === mesAtual()).length;
    const kpi = (cor, lb, v, on) => `<div class="sc" style="cursor:${on ? 'pointer' : 'default'}" ${on ? `onclick="${on}"` : ''}><div class="sa" style="background:${cor}"></div><div class="sl">${lb}</div><div class="sv">${v}</div></div>`;
    document.getElementById('ec-kpis').innerHTML =
      kpi('#2563EB', 'Em andamento', abertos.length, "EntregaChaves.filtrar('andamento')") +
      kpi('#dc2626', 'Atrasados', atrasados.length, "EntregaChaves.filtrar('atrasados')") +
      kpi('#d97706', 'Rescisões sem processo', _resc.length, "document.getElementById('ec-resc').scrollIntoView({behavior:'smooth'})") +
      kpi('#16a34a', 'Encerrados no mês', encMes, null);

    // precisa de atenção (qualquer mês)
    const at = atrasados.slice().sort((a, b) => sit.get(b.protocolo).atraso - sit.get(a.protocolo).atraso);
    document.getElementById('ec-atencao').innerHTML = at.length ? `<div class="card" style="padding:12px 14px;margin-bottom:12px;border-left:4px solid #dc2626">
      <div style="font-weight:700;margin-bottom:6px">⚠️ Precisa de atenção (${at.length}) <small style="font-weight:400;color:#64748b">· etapas com prazo vencido, de qualquer mês</small></div>
      ${at.slice(0, 8).map(p => { const s = sit.get(p.protocolo); return `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #f1f5f9;font-size:13px;cursor:pointer" onclick="EntregaChaves.detalhe('${esc(p.protocolo)}')">
        <span><b>${esc(p.endereco || '—')}</b> · ${esc(s.txt)}${p.responsavel ? ' · ' + esc(p.responsavel) : ''}</span><span style="color:#dc2626;white-space:nowrap">${s.atraso} dia(s) de atraso</span></div>`; }).join('')}
      ${at.length > 8 ? `<a href="#" onclick="EntregaChaves.filtrar('atrasados');return false" style="font-size:13px">Ver todos os ${at.length}</a>` : ''}</div>` : '';

    // rescisões do Imoview sem processo
    document.getElementById('ec-resc').innerHTML = _resc.length ? `<details class="card" style="padding:12px 14px;margin-bottom:12px;border-left:4px solid #d97706">
      <summary style="font-weight:700;cursor:pointer">📋 Rescisões no Imoview sem processo de entrega (${_resc.length}) <small style="font-weight:400;color:#64748b">· desde ${br(RESCISOES_DESDE)}; cada uma precisa virar processo</small></summary>
      ${_resc.map(c => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px">
        <span>Contrato ${c.codigo}${c.codigo_auxiliar ? ' (Guess ' + esc(c.codigo_auxiliar) + ')' : ''} · <b>${esc(c.endereco || '—')}</b> · ${esc(c.locatario_nome || '')} · ${c.data_rescisao ? 'rescisão ' + br(c.data_rescisao) : 'aviso ' + br(c.data_aviso_desocupacao)}</span>
        <button class="btn btn-o bsm" onclick="EntregaChaves.novo(${c.codigo})">Criar processo</button></div>`).join('')}</details>` : '';

    // filtros
    const meses = [...new Set(_proc.map(mesDe).filter(Boolean))].sort().reverse().slice(0, 12);
    const chip = (id, lb, on) => `<button class="btn ${on ? 'btn-p' : 'btn-o'} bsm" onclick="EntregaChaves.filtrar('${id}')">${lb}</button>`;
    document.getElementById('ec-filtros').innerHTML =
      chip('mes', 'Este mês (' + mesLabel(mesAtual()) + ')', _filtro === 'mes' && _mes === mesAtual()) +
      chip('andamento', 'Em andamento', _filtro === 'andamento') + chip('atrasados', 'Atrasados', _filtro === 'atrasados') +
      chip('reparo', 'Reparo pendente', _filtro === 'reparo') + chip('encerrados', 'Encerrados', _filtro === 'encerrados') + chip('todos', 'Todos', _filtro === 'todos') +
      `<select class="fc" style="max-width:150px;padding:5px 8px;font-size:13px" onchange="EntregaChaves.verMes(this.value)"><option value="">Outro mês…</option>${meses.map(m => `<option value="${m}" ${_filtro === 'mes' && _mes === m && m !== mesAtual() ? 'selected' : ''}>${mesLabel(m)}</option>`).join('')}</select>` +
      `<input class="fc" placeholder="🔍 Buscar endereço, pessoa, protocolo ou contrato" value="${esc(_busca)}" style="max-width:300px;padding:6px 12px;font-size:13px" oninput="EntregaChaves.buscar(this.value)">`;

    const q = _busca.trim().toLowerCase();
    const lista = _proc.filter(p => {
      const s = sit.get(p.protocolo);
      if (q) return [p.protocolo, p.endereco, p.locador, p.locatario, p.contrato_imoview, p.codigo_guess, p.responsavel].some(v => String(v || '').toLowerCase().includes(q));
      if (_filtro === 'mes') return mesDe(p) === _mes;
      if (_filtro === 'andamento') return !encerrado(p);
      if (_filtro === 'atrasados') return !!s.atraso;
      if (_filtro === 'reparo') return p.necessita_reparo === 'Sim' && !encerrado(p);
      if (_filtro === 'encerrados') return encerrado(p);
      return true;
    }).sort((a, b) => (sit.get(b.protocolo).atraso || 0) - (sit.get(a.protocolo).atraso || 0) || String(b.data_entrega || b.data_agendada || b.data_cadastro).localeCompare(String(a.data_entrega || a.data_agendada || a.data_cadastro)));
    const tb = document.getElementById('ec-lista');
    tb.innerHTML = lista.length ? lista.map(p => {
      const s = sit.get(p.protocolo);
      const pz = s.atraso ? `<span style="color:#dc2626;font-weight:600">${s.atraso} dia(s) atrasado</span>` : s.vence ? `até ${s.vence.toLocaleDateString('pt-BR')}` : '—';
      return `<tr style="cursor:pointer" onclick="EntregaChaves.detalhe('${esc(p.protocolo)}')"><td><b>${esc(p.endereco || '—')}</b><br><small style="color:#64748b">${esc(p.protocolo)}${p.contrato_imoview ? ' · contrato ' + p.contrato_imoview : ''}</small></td>
        <td>${esc(p.locatario)}</td><td>${esc(p.tipo_fianca)}</td><td><span class="badge ${s.cls}">${esc(s.txt)}</span></td><td style="font-size:12px">${pz}</td><td>${esc(p.responsavel || '—')}</td><td>${mesLabel(mesDe(p) || mesAtual())}</td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty"><div class="ei">🔑</div><p>${_filtro === 'mes' && !q ? 'Nenhuma entrega neste mês.' : 'Nenhum processo encontrado.'}</p></div></td></tr>`;
  }

  function filtrar(f) { _filtro = f; if (f === 'mes') _mes = mesAtual(); render(); }
  function verMes(m) { if (!m) return; _filtro = 'mes'; _mes = m; render(); }
  let _tb = null; function buscar(v) { _busca = v; clearTimeout(_tb); _tb = setTimeout(() => { render(); const i = document.querySelector('#ec-filtros input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 250); }

  // ── modal genérico ─────────────────────────────────────────────
  function modal(id, titulo, corpo, largura) {
    const old = document.getElementById(id); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'mo open'; ov.id = id;
    ov.innerHTML = `<div class="modal" style="width:${largura || 640}px;max-width:96vw"><div class="mh"><div class="mt">${titulo}</div><button class="mc" onclick="document.getElementById('${id}').remove()">×</button></div><div class="mb">${corpo}</div></div>`;
    document.body.appendChild(ov); return ov;
  }
  const fechar = id => { const m = document.getElementById(id); if (m) m.remove(); };
  const val = id => (document.getElementById(id) || {}).value || '';
  const listaUsuarios = () => `<datalist id="ec-users">${_users.map(u => `<option value="${esc(u.nome)}">`).join('')}</datalist>`;

  // ── detalhe ────────────────────────────────────────────────────
  async function detalhe(proto) {
    const p = _proc.find(x => x.protocolo === proto); if (!p) return; _aberto = proto;
    const s = situacao(p), ets = etapasDe(p), atual = etapaAtual(p);
    const linhaEt = et => {
      const ok = feita(p, et), cur = atual && atual.key === et.key;
      const pr = cur ? prazoDe(p, et) : null;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #f1f5f9;font-size:13px">
        <span>${ok ? '✅' : cur ? '⏳' : '⬜'} ${esc(et.label)}${et.opcional ? ' <small style="color:#64748b">(opcional)</small>' : ''}
          ${ok ? `· <b>${br(p[et.col])}</b> <a href="#" title="Alterar data" onclick="EntregaChaves.etapa('${esc(proto)}','${et.key}',true);return false">✏️</a>` : ''}
          ${pr ? `<small style="color:${pr.atraso > 0 ? '#dc2626' : '#64748b'}"> · prazo ${pr.vence.toLocaleDateString('pt-BR')}${pr.atraso > 0 ? ' (' + pr.atraso + ' dia(s) de atraso)' : ''}</small>` : ''}</span>
        ${!ok && !p.cancelado && (cur || et.opcional) ? `<button class="btn ${cur ? 'btn-g' : 'btn-o'} bsm" onclick="EntregaChaves.${et.key === 'vistoria' ? 'vistoria' : 'etapa'}('${esc(proto)}','${et.key}')">Registrar</button>` : ''}</div>`;
    };
    const ov = modal('ec-det', `🔑 ${esc(p.endereco || p.protocolo)}`, `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px"><div><small style="color:#64748b">${esc(p.protocolo)}${p.contrato_imoview ? ' · contrato Imoview ' + p.contrato_imoview : ''}${p.codigo_guess ? ' · Guess ' + esc(p.codigo_guess) : ''} · cadastrado em ${br(p.data_cadastro)}${p.criado_por ? ' por ' + esc(p.criado_por) : ''}</small></div><span class="badge ${s.cls}">${esc(s.txt)}${s.atraso ? ' · ' + s.atraso + 'd atraso' : ''}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px">
        <div><small style="color:#64748b">Locador</small><br>${esc(p.locador || '—')}<br><small>${esc(p.email_locador || 'sem e-mail')}</small></div>
        <div><small style="color:#64748b">Locatário</small><br>${esc(p.locatario || '—')}<br><small>${esc(p.email_locatario || 'sem e-mail')}</small></div>
        <div><small style="color:#64748b">Garantia</small><br>${esc(p.tipo_fianca || '—')}</div>
        <div><small style="color:#64748b">Responsável</small><br><input class="fc" list="ec-users" id="ec-resp" value="${esc(p.responsavel)}" style="padding:4px 8px;font-size:13px;max-width:220px" onchange="EntregaChaves.salvarResp('${esc(proto)}',this.value)">${listaUsuarios()}</div>
      </div>
      ${alertaSinistro(p) ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:13px">⚠️ Seguro fiança — ${esc(alertaSinistro(p).txt)}</div>` : ''}
      ${p.necessita_reparo ? `<div style="margin-top:8px;font-size:13px"><b>Vistoria:</b> ${p.necessita_reparo === 'Sim' ? 'com reparos' : 'sem reparos'}${p.descricao_reparo ? ' — ' + esc(p.descricao_reparo) : ''}${p.valor_reparo ? ' · ' + esc(p.valor_reparo) : ''}${p.responsavel_reparo ? ' · por conta de: ' + esc(p.responsavel_reparo) : ''}</div>` : ''}
      ${p.observacoes ? `<div style="margin-top:6px;font-size:13px"><b>Observações:</b> ${esc(p.observacoes)}</div>` : ''}
      <div style="font-weight:700;margin:14px 0 2px">Etapas</div>${ets.map(linhaEt).join('')}
      <div style="font-weight:700;margin:14px 0 4px">Histórico</div><div id="ec-hist" style="font-size:13px;color:#64748b">Carregando…</div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
        <div style="display:flex;gap:8px"><button class="btn btn-o bsm" onclick="EntregaChaves.editar('${esc(proto)}')">Editar dados</button><a class="btn btn-o bsm" target="_blank" href="entregaapp/consulta.html?p=${encodeURIComponent(proto)}">Ver como o cliente vê</a></div>
        ${p.cancelado ? `<button class="btn btn-o bsm" onclick="EntregaChaves.cancelar('${esc(proto)}',false)">Reabrir processo</button>` : `<button class="btn btn-o bsm" style="color:#b91c1c" onclick="EntregaChaves.cancelar('${esc(proto)}',true)">Cancelar processo</button>`}
      </div>`, 760);
    try {
      const h = await db.get('chaves_andamentos', `?select=em,etapa,mensagem,autor,notificou&protocolo=eq.${encodeURIComponent(proto)}&order=em.desc`);
      const el = ov.querySelector('#ec-hist'); if (!el) return;
      el.innerHTML = h.length ? h.map(a => `<div style="padding:6px 0;border-top:1px solid #f1f5f9"><b style="color:#1e293b">${esc(a.etapa || 'Atualização')}</b> · ${new Date(a.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${a.autor ? ' · ' + esc(a.autor) : ''}${a.notificou ? ' · ✉️ partes avisadas' : ''}${a.mensagem ? '<br>' + esc(a.mensagem) : ''}</div>`).join('') : 'Sem registros.';
    } catch (e) { const el = ov.querySelector('#ec-hist'); if (el) el.textContent = 'Não consegui carregar o histórico.'; }
  }

  // ── gravações ──────────────────────────────────────────────────
  async function patch(proto, dados) {
    const r = await db._fetch(SBU + '/rest/v1/chaves_processos?protocolo=eq.' + encodeURIComponent(proto), { method: 'PATCH', body: JSON.stringify(dados) });
    const b = await r.json().catch(() => null);
    if (!r.ok) throw new Error((b && b.message) || 'falha ao gravar');
    if (!Array.isArray(b) || !b.length) throw new Error('Processo não encontrado');
    const i = _proc.findIndex(x => x.protocolo === proto); if (i >= 0) _proc[i] = b[0];
    return b[0];
  }
  const andamento = (protocolo, etapa, mensagem, notificou) => db.post('chaves_andamentos', { protocolo, etapa: etapa || '', mensagem: mensagem || '', autor: quem(), notificou: !!notificou });
  async function avisar(protocolo, modelo, titulo, mensagem) {
    try {
      const r = await fetch(AVISO_FN, { method: 'POST', headers: { Authorization: hdr().Authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'chaves', modelo, protocolo, titulo, mensagem }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || r.status);
      if (j.enviado === false) { toast('Gravado. Ninguém foi avisado: ' + (j.motivo || 'sem e-mail'), ''); return false; }
      return true;
    } catch (e) { toast('Gravado, mas o e-mail não saiu (' + e.message + ').', 'err'); return false; }
  }
  // status = etapa mais adiantada concluída (compatível com a planilha antiga e a consulta do cliente)
  const statusDe = p => { const f = etapasDe(p).filter(et => feita(p, et)); return f.length ? f[f.length - 1].status : 'Cadastrado'; };

  async function salvarResp(proto, v) {
    try { await patch(proto, { responsavel: v.trim() }); await andamento(proto, 'Responsável', 'Responsável: ' + (v.trim() || '—')); toast('Responsável atualizado.', 'ok'); render(); }
    catch (e) { toast('Erro: ' + e.message, 'err'); }
  }

  function etapa(proto, key, editar) {
    const p = _proc.find(x => x.protocolo === proto); const et = etapasDe(p).find(e => e.key === key); if (!p || !et) return;
    modal('ec-et', (editar ? 'Alterar data — ' : 'Registrar — ') + esc(et.label), `
      <div class="frow"><div class="fg"><label>Data</label><input type="date" class="fc" id="ec-et-data" value="${esc(String(p[et.col] || '').slice(0, 10) || iso(hoje()))}"></div></div>
      <div class="fg"><label>Mensagem (vai no e-mail e no histórico)</label><textarea class="fc" id="ec-et-msg" rows="3" placeholder="Opcional"></textarea></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="ec-et-av" ${editar ? '' : 'checked'}> Avisar locador e locatário por e-mail</label>
      <div style="text-align:right;margin-top:10px"><button class="btn btn-g" onclick="EntregaChaves.salvarEtapa('${esc(proto)}','${key}',${!!editar})">${editar ? 'Salvar data' : 'Registrar'}</button></div>`, 480);
  }
  async function salvarEtapa(proto, key, editar) {
    const p = _proc.find(x => x.protocolo === proto); const et = etapasDe(p).find(e => e.key === key);
    const data = val('ec-et-data'), msg = val('ec-et-msg').trim(), av = document.getElementById('ec-et-av').checked;
    if (!data) { toast('Informe a data.', 'err'); return; }
    try {
      const novo = Object.assign({}, p, { [et.col]: data });
      await patch(proto, { [et.col]: data, status: statusDe(novo) });
      const ok = av ? await avisar(proto, 'etapa', et.status, msg) : false;
      await andamento(proto, (editar ? 'Data alterada: ' : '') + et.status + ' (' + br(data) + ')', msg, ok);
      fechar('ec-et'); toast('✅ ' + et.label + ' registrada.', 'ok'); render(); detalhe(proto);
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }

  function vistoria(proto) {
    const p = _proc.find(x => x.protocolo === proto);
    modal('ec-vist', 'Registrar vistoria', `
      <div class="frow"><div class="fg"><label>Data da vistoria</label><input type="date" class="fc" id="ec-v-data" value="${esc(String(p.data_vistoria || '').slice(0, 10) || iso(hoje()))}"></div>
        <div class="fg"><label>Precisa de reparo?</label><select class="fc" id="ec-v-rep" onchange="document.getElementById('ec-v-det').style.display=this.value==='Sim'?'':'none'"><option>Não</option><option ${p.necessita_reparo === 'Sim' ? 'selected' : ''}>Sim</option></select></div></div>
      <div id="ec-v-det" style="${p.necessita_reparo === 'Sim' ? '' : 'display:none'}">
        <div class="fg"><label>Descrição dos reparos</label><textarea class="fc" id="ec-v-desc" rows="2">${esc(p.descricao_reparo)}</textarea></div>
        <div class="frow"><div class="fg"><label>Valor estimado</label><input class="fc" id="ec-v-val" value="${esc(p.valor_reparo)}" placeholder="R$"></div>
          <div class="fg"><label>Por conta de</label><select class="fc" id="ec-v-resp">${['Locatário', 'Locador', 'Imobiliária'].map(o => `<option ${p.responsavel_reparo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      </div>
      <div class="fg"><label>Mensagem (vai no e-mail e no histórico)</label><textarea class="fc" id="ec-v-msg" rows="2"></textarea></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="ec-v-av" checked> Avisar locador e locatário por e-mail (se o reparo for do locatário, o locador também recebe o pedido de 2 orçamentos)</label>
      <div style="text-align:right;margin-top:10px"><button class="btn btn-g" onclick="EntregaChaves.salvarVistoria('${esc(proto)}')">Registrar vistoria</button></div>`, 560);
  }
  async function salvarVistoria(proto) {
    const p = _proc.find(x => x.protocolo === proto);
    const rep = val('ec-v-rep'), data = val('ec-v-data'), msg = val('ec-v-msg').trim(), av = document.getElementById('ec-v-av').checked;
    if (!data) { toast('Informe a data.', 'err'); return; }
    const d = { data_vistoria: data, necessita_reparo: rep, descricao_reparo: rep === 'Sim' ? val('ec-v-desc').trim() : '', valor_reparo: rep === 'Sim' ? val('ec-v-val').trim() : '', responsavel_reparo: rep === 'Sim' ? val('ec-v-resp') : '' };
    try {
      await patch(proto, Object.assign(d, { status: statusDe(Object.assign({}, p, d)) }));
      let ok = false;
      if (av) { ok = await avisar(proto, 'vistoria', 'Vistoria realizada', msg); if (rep === 'Sim' && d.responsavel_reparo === 'Locatário') await avisar(proto, 'orcamentos', 'Orçamentos', ''); }
      await andamento(proto, 'Vistoria realizada (' + br(data) + ')', (rep === 'Sim' ? 'COM reparos' + (d.descricao_reparo ? ': ' + d.descricao_reparo : '') + (d.responsavel_reparo ? ' · por conta de ' + d.responsavel_reparo : '') : 'SEM reparos') + (msg ? ' — ' + msg : ''), ok);
      fechar('ec-vist'); toast('✅ Vistoria registrada.', 'ok'); render(); detalhe(proto);
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }

  async function cancelar(proto, sim) {
    const motivo = sim ? prompt('Motivo do cancelamento (ex.: locatário desistiu de sair, cadastro duplicado):') : '';
    if (sim && motivo === null) return;
    try { await patch(proto, { cancelado: sim, motivo_cancelamento: motivo || '' }); await andamento(proto, sim ? 'Processo cancelado' : 'Processo reaberto', motivo || ''); toast(sim ? 'Processo cancelado.' : 'Processo reaberto.', 'ok'); render(); detalhe(proto); }
    catch (e) { toast('Erro: ' + e.message, 'err'); }
  }

  // ── cadastro / edição ──────────────────────────────────────────
  function form(p) {
    return `<div class="frow"><div class="fg"><label>Contrato no Imoview</label><div style="display:flex;gap:6px"><input class="fc" id="ec-n-ctr" value="${esc(p.contrato_imoview || '')}" placeholder="código do contrato (ou nº do Guess)"><button class="btn btn-o bsm" onclick="EntregaChaves.buscarContrato()">Buscar</button></div><small id="ec-n-info" style="color:#64748b"></small></div>
        <div class="fg"><label>Garantia</label><select class="fc" id="ec-n-gar">${GARANTIAS.map(g => `<option ${p.tipo_fianca === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
      <div class="fg"><label>Endereço do imóvel *</label><input class="fc" id="ec-n-end" value="${esc(p.endereco)}"></div>
      <div class="frow"><div class="fg"><label>Locador *</label><input class="fc" id="ec-n-ldr" value="${esc(p.locador)}"></div><div class="fg"><label>E-mail(s) do locador</label><input class="fc" id="ec-n-eldr" value="${esc(p.email_locador)}" placeholder="separe por vírgula"></div></div>
      <div class="frow"><div class="fg"><label>Locatário *</label><input class="fc" id="ec-n-lta" value="${esc(p.locatario)}"></div><div class="fg"><label>E-mail do locatário</label><input class="fc" id="ec-n-elta" value="${esc(p.email_locatario)}"></div></div>
      <div class="frow"><div class="fg"><label>Data prevista da entrega das chaves</label><input type="date" class="fc" id="ec-n-ag" value="${esc(String(p.data_agendada || '').slice(0, 10))}"></div>
        <div class="fg"><label>Responsável</label><input class="fc" list="ec-users" id="ec-n-resp" value="${esc(p.responsavel)}">${listaUsuarios()}</div></div>
      <div class="fg"><label>Observações</label><input class="fc" id="ec-n-obs" value="${esc(p.observacoes)}"></div>`;
  }
  async function novo(contrato) {
    modal('ec-novo', '🔑 Nova entrega de chaves', form({ responsavel: quem(), tipo_fianca: 'Caução' }) + `
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="ec-n-av" checked> Avisar locador e locatário por e-mail (com o protocolo para acompanhar)</label>
      <div style="text-align:right;margin-top:10px"><button class="btn btn-g" onclick="EntregaChaves.salvarNovo()">Cadastrar</button></div>`, 680);
    if (contrato) { document.getElementById('ec-n-ctr').value = contrato; await buscarContrato(); }
  }
  async function buscarContrato() {
    const v = val('ec-n-ctr').trim(), info = document.getElementById('ec-n-info'); if (!/^\d+$/.test(v)) { info.textContent = 'Digite só o número.'; return; }
    info.textContent = 'Buscando…';
    try {
      let [c] = await db.get('imoview_contratos', `?select=*&codigo=eq.${v}&limit=1`);
      if (!c) [c] = await db.get('imoview_contratos', `?select=*&codigo_auxiliar=eq.${v}&order=situacao.asc&limit=1`);
      if (!c) { info.textContent = 'Contrato não encontrado na cópia do Imoview (atualizada de hora em hora). Preencha à mão.'; return; }
      document.getElementById('ec-n-ctr').value = c.codigo;
      const locs = Array.isArray(c.locadores) ? c.locadores : [];
      const cods = locs.map(l => l.codigo).filter(Boolean);
      const pes = cods.length ? await db.get('imoview_pessoas', `?select=codigo,emails&codigo=in.(${cods.join(',')})`).catch(() => []) : [];
      const set = (id, x) => { const el = document.getElementById(id); if (el && x) el.value = x; };
      set('ec-n-end', c.endereco); set('ec-n-lta', c.locatario_nome); set('ec-n-elta', c.locatario_email);
      set('ec-n-ldr', [...new Set(locs.map(l => l.nome).filter(Boolean))].join(', '));
      set('ec-n-eldr', [...new Set(pes.flatMap(x => String(x.emails || '').split(',').map(s => s.trim()).filter(Boolean)))].join(', '));
      const g = String(c.garantia || '').toLowerCase();
      const gar = /cau/.test(g) ? 'Caução' : /seguro/.test(g) ? 'Seguro fiança' : /t[ií]tulo|capitaliza/.test(g) ? 'Título de capitalização' : /fiador/.test(g) ? 'Fiador' : /sem/.test(g) ? 'Sem garantia' : '';
      if (gar) document.getElementById('ec-n-gar').value = gar;
      const ja = _proc.find(x => x.contrato_imoview === c.codigo && !x.cancelado);
      info.innerHTML = `Contrato ${c.codigo}${c.codigo_auxiliar ? ' (Guess ' + esc(c.codigo_auxiliar) + ')' : ''} · ${esc(c.situacao)}${c.data_rescisao ? ' · rescisão ' + br(c.data_rescisao) : ''}${ja ? ` · <b style="color:#b91c1c">já existe o processo ${esc(ja.protocolo)}</b>` : ''} — confira os dados.`;
    } catch (e) { info.textContent = 'Erro na busca: ' + e.message; }
  }
  const dadosForm = () => ({ contrato_imoview: /^\d+$/.test(val('ec-n-ctr').trim()) ? +val('ec-n-ctr').trim() : null, tipo_fianca: val('ec-n-gar'), endereco: val('ec-n-end').trim(),
    locador: val('ec-n-ldr').trim(), email_locador: val('ec-n-eldr').trim(), locatario: val('ec-n-lta').trim(), email_locatario: val('ec-n-elta').trim(),
    data_agendada: val('ec-n-ag') || null, responsavel: val('ec-n-resp').trim(), observacoes: val('ec-n-obs').trim() });
  async function salvarNovo() {
    const d = dadosForm();
    if (!d.endereco || !d.locador || !d.locatario) { toast('Preencha endereço, locador e locatário.', 'err'); return; }
    if (d.contrato_imoview && _proc.some(x => x.contrato_imoview === d.contrato_imoview && !x.cancelado) && !confirm('Já existe processo aberto para esse contrato. Cadastrar mesmo assim?')) return;
    const n = new Date(), proto = 'CHV-' + iso(n).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 9000) + 1000);
    const reg = Object.assign(d, { protocolo: proto, data_cadastro: iso(n), criado_por: quem() });
    reg.status = d.data_agendada ? 'Entrega de chaves agendada' : 'Cadastrado';
    try {
      await db.post('chaves_processos', reg);
      const ok = document.getElementById('ec-n-av').checked ? await avisar(proto, 'cadastro', 'Processo aberto', '') : false;
      await andamento(proto, 'Processo aberto', d.data_agendada ? 'Entrega prevista para ' + br(d.data_agendada) : 'Sem data de entrega ainda', ok);
      fechar('ec-novo'); toast('✅ Processo ' + proto + ' cadastrado.', 'ok'); await atualizar(); detalhe(proto);
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }
  function editar(proto) {
    const p = _proc.find(x => x.protocolo === proto);
    modal('ec-novo', 'Editar dados — ' + esc(proto), form(p) + `<div style="text-align:right;margin-top:10px"><button class="btn btn-g" onclick="EntregaChaves.salvarEdicao('${esc(proto)}')">Salvar</button></div>`, 680);
  }
  async function salvarEdicao(proto) {
    const d = dadosForm(); const p = _proc.find(x => x.protocolo === proto);
    if (!d.endereco || !d.locador || !d.locatario) { toast('Preencha endereço, locador e locatário.', 'err'); return; }
    try {
      const mud = Object.keys(d).filter(k => String(d[k] == null ? '' : d[k]) !== String(p[k] == null ? '' : p[k]).slice(0, k === 'data_agendada' ? 10 : 999));
      d.status = statusDe(Object.assign({}, p, d));
      await patch(proto, d); if (mud.length) await andamento(proto, 'Dados alterados', mud.join(', '));
      fechar('ec-novo'); toast('Dados salvos.', 'ok'); render(); detalhe(proto);
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }

  window.EntregaChaves = { abrir, atualizar, filtrar, verMes, buscar, detalhe, etapa, salvarEtapa, vistoria, salvarVistoria, cancelar, salvarResp,
    novo, buscarContrato, salvarNovo, editar, salvarEdicao, _t: { situacao, etapaAtual, prazoDe, encerrado, etapasDe, alertaSinistro } };
})();

// ═══════════════════════════════════════════════════════════════
// COBRANÇA — Inadimplentes (25/11/2026). Módulo próprio do portal: financeiro, jurídico e administrativo (cobranca_pode()).
// Dados: cobranca_aberto (cobranças de locatário vencidas e em aberto no Imoview), reescrita a cada 30 min pela função
// falcaovaz inadimplencia-sync-background; botão "Atualizar agora" → inadimplencia-agora.
// Responsável: extrajudicial = Janaína · judicial (locatário é réu em processo ativo) = advogado · seguro fiança = João.
// A atribuição pode ser trocada por contrato (cobranca_contratos) e o financeiro tira da lista o que foi pago no Guess
// (cobranca_ignorados). Vencimentos antes de dez/2026 saíram em boleto do Guess: confirmar antes de cobrar.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const AGORA_FN = 'https://falcaovaz.netlify.app/.netlify/functions/inadimplencia-agora';
  const CORTE_GUESS = '2026-12-01';   // vencimentos anteriores: boleto emitido pelo Guess (pode ter sido pago lá)
  const TIPOS = { extrajudicial: ['Extrajudicial', '#1d4ed8', '#dbeafe'], judicial: ['Judicial', '#7c2d12', '#ffedd5'], seguro: ['Seguro fiança', '#047857', '#d1fae5'] };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R$ = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const br = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
  const diasDe = s => { const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return Math.floor((Date.now() - d) / 864e5); };
  const quem = () => (typeof CUR !== 'undefined' && CUR && CUR.nome) || '';

  function podeAcessarCobranca() {
    if (typeof CUR === 'undefined' || !CUR) return false;
    return !!(CUR.admin || CUR.judicial || CUR.acesso_juridico || /(financeiro|encargos|jur[ií]dico|administra|diretoria|superintend)/i.test(CUR.dept || ''));
  }
  window.podeAcessarCobranca = podeAcessarCobranca;

  let _mov = [], _man = {}, _ign = {}, _sync = {}, _f = { resp: '', tipo: '', faixa: '', guess: 'todos', busca: '' }, _abertos = new Set();

  async function carregar() {
    const [mov, man, ign, sy] = await Promise.all([
      db.get('cobranca_aberto', '?select=*&order=vencimento.asc&limit=20000'),
      db.get('cobranca_contratos', '?select=*'),
      db.get('cobranca_ignorados', '?select=movimento,motivo,por,em'),
      db.get('cobranca_sync', '?select=*&id=eq.1').catch(() => []),
    ]);
    _ign = {}; (ign || []).forEach(i => { _ign[i.movimento] = i; });
    _mov = (mov || []).filter(m => !_ign[m.movimento]);
    _man = {}; (man || []).forEach(c => { _man[c.contrato] = c; });
    _sync = (sy && sy[0]) || {};
  }

  // agrupa por contrato, aplicando a atribuição manual
  function contratos() {
    const g = {};
    _mov.forEach(m => {
      const c = g[m.contrato] = g[m.contrato] || { contrato: m.contrato, aux: m.codigo_auxiliar, locatario: m.locatario_nome, endereco: m.endereco, garantia: m.garantia,
        tipo: m.tipo_auto, responsavel: m.responsavel_auto, processo: m.processo_auto, movs: [], total: 0, maisAntigo: m.vencimento, guess: 0 };
      c.movs.push(m); c.total += Number(m.valor || 0); if (m.vencimento < c.maisAntigo) c.maisAntigo = m.vencimento; if (m.vencimento < CORTE_GUESS) c.guess++;
    });
    return Object.values(g).map(c => {
      const o = _man[c.contrato];
      if (o) { if (o.tipo) c.tipo = o.tipo; if (o.responsavel) c.responsavel = o.responsavel; if (o.processo) c.processo = o.processo; c.obs = o.observacao; c.manual = !!(o.tipo || o.responsavel); c.alterado = o; }
      c.dias = diasDe(c.maisAntigo); c.soGuess = c.guess === c.movs.length;
      return c;
    });
  }

  function raiz() { return document.getElementById('cobranca-root'); }
  async function abrir() {
    const el = raiz(); if (!el) return;
    if (!podeAcessarCobranca()) { el.innerHTML = '<div class="card"><div class="cb">Acesso só para financeiro, jurídico e administrativo.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Carregando inadimplentes…</div></div>';
    try { await carregar(); render(); }
    catch (e) { el.innerHTML = `<div class="card"><div class="cb" style="color:#b91c1c">Não consegui ler a cobrança: ${esc(e.message)}</div></div>`; }
  }

  function render() {
    const el = raiz(); if (!el) return;
    const C = contratos();
    const resps = [...new Set(C.map(c => c.responsavel).filter(Boolean))].sort();
    const q = _f.busca.trim().toLowerCase();
    const L = C.filter(c => {
      if (_f.resp && c.responsavel !== _f.resp) return false;
      if (_f.tipo && c.tipo !== _f.tipo) return false;
      if (_f.faixa === '30' && c.dias > 30) return false;
      if (_f.faixa === '90' && (c.dias <= 30 || c.dias > 90)) return false;
      if (_f.faixa === '90+' && c.dias <= 90) return false;
      if (_f.guess === 'imoview' && c.soGuess) return false;
      if (_f.guess === 'guess' && !c.guess) return false;
      if (q && ![c.locatario, c.endereco, c.contrato, c.aux, c.processo].some(v => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => b.dias - a.dias || b.total - a.total);
    const soma = arr => arr.reduce((s, c) => s + c.total, 0);
    const porTipo = t => C.filter(c => c.tipo === t);
    const kpi = (lb, v, sub, cor) => `<div class="sc"><div class="sa" style="background:${cor}"></div><div class="sl">${lb}</div><div class="sv">${v}</div><div style="font-size:12px;color:var(--muted)">${sub}</div></div>`;
    const sel = (id, lb, opts, v) => `<div class="fg" style="margin:0"><label>${lb}</label><select id="${id}" class="fc" style="padding:6px 8px;font-size:13px">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    const syncTxt = _sync.situacao === 'atualizando' ? '⏳ atualizando agora…' : _sync.fim ? `atualizado em ${new Date(_sync.fim).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${/^erro/.test(_sync.situacao || '') ? ' · ⚠️ ' + esc(_sync.situacao) : ''}` : 'ainda não sincronizado';
    el.innerHTML = `
      <div class="ph"><div><h1 class="pt">Inadimplentes</h1><div class="pst">Locatários com cobrança vencida em aberto no Imoview · ${syncTxt}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-o" onclick="Cobranca.atualizarAgora()">↻ Atualizar agora</button><button class="btn btn-o" onclick="Cobranca.exportar()">Exportar CSV</button></div></div>
      <div class="sg">${kpi('Em aberto', R$(soma(C)), `${C.length} contratos · ${_mov.length} cobranças`, '#dc2626')}
        ${kpi('Extrajudicial', R$(soma(porTipo('extrajudicial'))), porTipo('extrajudicial').length + ' contratos', '#2563EB')}
        ${kpi('Judicial', R$(soma(porTipo('judicial'))), porTipo('judicial').length + ' contratos', '#9a3412')}
        ${kpi('Seguro fiança', R$(soma(porTipo('seguro'))), porTipo('seguro').length + ' contratos', '#047857')}</div>
      <div class="card" style="padding:10px 14px;margin-bottom:12px;border-left:4px solid #d97706;font-size:13px">⚠️ Até novembro/2026 os boletos saíram pelo <b>Guess</b>, e o pagamento feito lá nem sempre chegou ao Imoview. Cobranças com vencimento antes de dezembro aparecem com <span class="badge b-amber">confirmar no Guess</span>: confira antes de cobrar e, se já foi pago, use <b>“Pago no Guess”</b> para tirar da lista.</div>
      <div class="card"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="fg" style="flex:2;min-width:200px;margin:0"><label>Buscar</label><input id="cb-busca" class="fc" placeholder="Locatário, endereço, contrato ou processo" value="${esc(_f.busca)}" style="padding:6px 10px;font-size:13px"></div>
        ${sel('cb-resp', 'Responsável', [['', 'Todos']].concat(resps.map(r => [r, r])), _f.resp)}
        ${sel('cb-tipo', 'Tipo', [['', 'Todos'], ['extrajudicial', 'Extrajudicial'], ['judicial', 'Judicial'], ['seguro', 'Seguro fiança']], _f.tipo)}
        ${sel('cb-faixa', 'Atraso', [['', 'Qualquer'], ['30', 'Até 30 dias'], ['90', '31 a 90 dias'], ['90+', 'Mais de 90 dias']], _f.faixa)}
        ${sel('cb-guess', 'Origem do boleto', [['todos', 'Todos'], ['imoview', 'Só boletos do Imoview'], ['guess', 'Com boleto do Guess']], _f.guess)}
      </div></div>
      <div style="font-size:13px;color:var(--muted);margin:8px 2px">${L.length} contrato(s) · ${R$(soma(L))}</div>
      <div class="tw tbl"><table><thead><tr><th>Locatário / imóvel</th><th>Contrato</th><th>Parcelas</th><th>Total</th><th>Mais antiga</th><th>Tipo · responsável</th></tr></thead><tbody>
      ${L.slice(0, 600).map(c => linha(c)).join('') || '<tr><td colspan="6" style="padding:18px;color:#94a3b8">Nenhum contrato neste filtro.</td></tr>'}</tbody></table></div>
      ${L.length > 600 ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">Mostrando 600 de ${L.length}. Use os filtros ou o CSV.</div>` : ''}`;
    const on = (id, k, ev) => { const x = document.getElementById(id); if (x) x[ev || 'onchange'] = e => { _f[k] = e.target.value; render(); if (k === 'busca') { const i = document.getElementById('cb-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }; };
    on('cb-resp', 'resp'); on('cb-tipo', 'tipo'); on('cb-faixa', 'faixa'); on('cb-guess', 'guess');
    let tb; document.getElementById('cb-busca').oninput = e => { clearTimeout(tb); const v = e.target.value; tb = setTimeout(() => { _f.busca = v; render(); const i = document.getElementById('cb-busca'); i.focus(); i.setSelectionRange(v.length, v.length); }, 300); };
  }

  function linha(c) {
    const [tl, tc, tbg] = TIPOS[c.tipo] || TIPOS.extrajudicial;
    const aberto = _abertos.has(c.contrato);
    const atraso = c.dias > 90 ? '#b91c1c' : c.dias > 30 ? '#d97706' : '#475569';
    return `<tr style="cursor:pointer" onclick="Cobranca.toggle(${c.contrato})"><td><b>${esc(c.locatario || '—')}</b><br><small style="color:#64748b">${esc(c.endereco || '')}</small></td>
      <td>${c.contrato}${c.aux ? '<br><small style="color:#64748b">Guess ' + esc(c.aux) + '</small>' : ''}</td>
      <td>${c.movs.length}${c.guess ? `<br><span class="badge b-amber" style="font-size:10px">${c.soGuess ? 'confirmar no Guess' : c.guess + ' do Guess'}</span>` : ''}</td>
      <td style="white-space:nowrap;font-weight:600">${R$(c.total)}</td>
      <td style="white-space:nowrap">${br(c.maisAntigo)}<br><small style="color:${atraso};font-weight:600">${c.dias} dias</small></td>
      <td><span class="badge" style="background:${tbg};color:${tc}">${tl}</span>${c.manual ? ' <small title="Atribuição alterada à mão">✋</small>' : ''}<br><small>${esc(c.responsavel || '—')}${c.processo ? ' · ' + esc(c.processo) : ''}</small>${c.obs ? `<br><small style="color:#64748b">📝 ${esc(c.obs)}</small>` : ''}</td></tr>
      ${aberto ? `<tr><td colspan="6" style="background:#f8fafc;padding:10px 14px">${detalhe(c)}</td></tr>` : ''}`;
  }
  function detalhe(c) {
    return `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:2;min-width:320px"><b style="font-size:13px">Cobranças em aberto</b>
        <table style="width:100%;font-size:12.5px;margin-top:4px"><tr style="color:#64748b"><td>Vencimento</td><td>Valor</td><td>Descrição</td><td></td></tr>
        ${c.movs.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(m => `<tr><td>${br(m.vencimento)}${m.vencimento < CORTE_GUESS ? ' <span class="badge b-amber" style="font-size:10px">Guess</span>' : ''}</td><td style="white-space:nowrap">${R$(m.valor)}</td><td>${esc(m.historico)}</td>
          <td style="text-align:right">${m.vencimento < CORTE_GUESS ? `<button class="btn btn-o bsm" onclick="event.stopPropagation();Cobranca.ignorar(${m.movimento})">Pago no Guess</button>` : ''}</td></tr>`).join('')}</table></div>
      <div style="flex:1;min-width:240px" onclick="event.stopPropagation()"><b style="font-size:13px">Atribuição</b>
        <div class="fg" style="margin:6px 0"><label style="font-size:12px">Tipo</label><select id="cb-a-tipo-${c.contrato}" class="fc" style="padding:5px 8px;font-size:13px">${Object.entries(TIPOS).map(([k, [l]]) => `<option value="${k}" ${k === c.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fg" style="margin:6px 0"><label style="font-size:12px">Responsável</label><input id="cb-a-resp-${c.contrato}" class="fc" value="${esc(c.responsavel)}" style="padding:5px 8px;font-size:13px"></div>
        <div class="fg" style="margin:6px 0"><label style="font-size:12px">Processo</label><input id="cb-a-proc-${c.contrato}" class="fc" value="${esc(c.processo || '')}" style="padding:5px 8px;font-size:13px"></div>
        <div class="fg" style="margin:6px 0"><label style="font-size:12px">Observação</label><input id="cb-a-obs-${c.contrato}" class="fc" value="${esc(c.obs || '')}" placeholder="Ex.: acordo em andamento" style="padding:5px 8px;font-size:13px"></div>
        <div style="display:flex;gap:6px"><button class="btn btn-g bsm" onclick="Cobranca.salvarAtrib(${c.contrato})">Salvar</button>${c.manual || c.obs ? `<button class="btn btn-o bsm" onclick="Cobranca.voltarAuto(${c.contrato})">Voltar ao automático</button>` : ''}</div>
        ${c.alterado ? `<div style="font-size:11px;color:#64748b;margin-top:4px">Alterado por ${esc(c.alterado.alterado_por)} em ${new Date(c.alterado.alterado_em).toLocaleDateString('pt-BR')}</div>` : ''}
      </div></div>`;
  }
  function toggle(ct) { _abertos.has(ct) ? _abertos.delete(ct) : _abertos.add(ct); render(); }

  async function salvarAtrib(ct) {
    const v = id => (document.getElementById(id + ct) || {}).value || '';
    const d = { contrato: ct, tipo: v('cb-a-tipo-'), responsavel: v('cb-a-resp-').trim(), processo: v('cb-a-proc-').trim(), observacao: v('cb-a-obs-').trim(), alterado_por: quem(), alterado_em: new Date().toISOString() };
    try {
      const r = await db._fetch(SBU + '/rest/v1/cobranca_contratos?on_conflict=contrato', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(d) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
      _man[ct] = d; toast('Atribuição salva.', 'ok'); render();
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }
  async function voltarAuto(ct) {
    try { await db._fetch(SBU + '/rest/v1/cobranca_contratos?contrato=eq.' + ct, { method: 'DELETE' }); delete _man[ct]; toast('Voltou à atribuição automática.', 'ok'); render(); }
    catch (e) { toast('Erro: ' + e.message, 'err'); }
  }
  async function ignorar(mov) {
    if (!confirm('Confirmar que esta cobrança foi paga no Guess? Ela sai da lista (fica registrado quem confirmou).')) return;
    try {
      const r = await db._fetch(SBU + '/rest/v1/cobranca_ignorados', { method: 'POST', body: JSON.stringify({ movimento: mov, motivo: 'Pago no Guess', por: quem() }) });
      if (!r.ok && r.status !== 409) throw new Error((await r.json().catch(() => ({}))).message || r.status);
      _mov = _mov.filter(m => m.movimento !== mov); toast('Tirada da lista.', 'ok'); render();
    } catch (e) { toast('Erro: ' + e.message, 'err'); }
  }
  async function atualizarAgora() {
    try {
      const r = await fetch(AGORA_FN, { method: 'POST', headers: { Authorization: hdr().Authorization, 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || r.status);
      toast(j.ja ? 'Já está atualizando — leva cerca de 1 minuto.' : 'Atualizando com o Imoview — leva cerca de 1 minuto.', 'ok');
      _sync.situacao = 'atualizando'; render();
      setTimeout(async () => { try { await carregar(); render(); } catch (_) {} }, 75000);
    } catch (e) { toast('Não consegui atualizar: ' + e.message, 'err'); }
  }
  function exportar() {
    const C = contratos().sort((a, b) => b.dias - a.dias);
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = [['Contrato', 'Guess', 'Locatário', 'Endereço', 'Garantia', 'Parcelas', 'Total', 'Vencimento mais antigo', 'Dias', 'Tipo', 'Responsável', 'Processo', 'Do Guess (confirmar)', 'Observação'].join(';')]
      .concat(C.map(c => [c.contrato, c.aux, c.locatario, c.endereco, c.garantia, c.movs.length, c.total.toFixed(2).replace('.', ','), br(c.maisAntigo), c.dias, (TIPOS[c.tipo] || [])[0], c.responsavel, c.processo, c.guess, c.obs].map(q).join(';')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'inadimplentes-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  window.Cobranca = { abrir, toggle, salvarAtrib, voltarAuto, ignorar, atualizarAgora, exportar };
})();

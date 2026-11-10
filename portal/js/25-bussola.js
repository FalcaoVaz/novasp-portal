/* =====================================================================
   25-bussola.js — BÚSSOLA NSP no portal (EM TESTE, 09/11/2026). Projeto de Emilia Vitória e Camille Cassab.
   O sistema delas fica em portal/bussola/ (código delas sem alteração + adaptador; atualizar com
   sandbox/bussola_atualizar.py) e abre aqui dentro, com o login do portal.
   Quem vê o card: quem está em bussola_acesso e os administradores (sql/2026-11-09-bussola-nsp-teste.sql).
   ===================================================================== */
(function () {
  'use strict';
  let _pode = null, _checando = null;
  function checar() {
    if (_pode !== null) return Promise.resolve(_pode);
    if (_checando) return _checando;
    if (typeof CUR === 'undefined' || !CUR) return Promise.resolve(false);
    if (CUR.admin) { _pode = true; return Promise.resolve(true); }
    const email = String(CUR.email || '').trim().toLowerCase();
    if (!email) { _pode = false; return Promise.resolve(false); }
    _checando = db.get('bussola_acesso', `?select=email&email=eq.${encodeURIComponent(email)}&limit=1`)
      .then(r => (_pode = !!(r && r.length))).catch(() => (_pode = false)).finally(() => { _checando = null; mostrarCard(); });
    return _checando;
  }
  function mostrarCard() {
    const c = document.getElementById('card-vnd-bussola'); if (c) c.style.display = _pode ? '' : 'none';
  }
  async function abrir() {
    const ok = await checar();
    const box = document.getElementById('bussola-box'); if (!box) return;
    if (!ok) { box.innerHTML = '<div class="card"><div class="cb">A Bússola NSP está em teste e ainda não foi liberada para você.</div></div>'; return; }
    if (!box.querySelector('iframe')) {
      box.innerHTML = refBoxHTML() + '<iframe id="bussola-frame" src="bussola/index.html" title="Bússola NSP" allow="clipboard-write" '
        + 'style="width:100%;height:calc(100vh - 150px);min-height:560px;border:1px solid var(--borda,#e2e8f0);border-radius:12px;background:#fff"></iframe>';
    }
  }
  // referências dos acervos por bairro (aluguel fechado NSP + ITBI pago), para o código da Bússola usar:
  //   const ref = await window.parent.BussolaPortal?.referencias('Saúde');
  async function referencias(bairro) {
    if (!(await checar())) return null;
    const h = hdr(); delete h.Prefer;
    const r = await fetch(SBU + '/rest/v1/rpc/bussola_referencias', { method: 'POST', headers: h, body: JSON.stringify({ p_bairro: String(bairro || '') }) });
    if (!r.ok) return null;
    return r.json();
  }
  // ── Referências do bairro (10/11/2026): quadro do portal ACIMA da Bússola, sem mexer no código delas.
  // Preenche sozinho com o bairro do anúncio lido na Bússola (adaptador.js avisa) ou com o bairro digitado.
  // Só mostra os números; o cálculo da Bússola não muda.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n, d) => n == null ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const mes = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : ''; };
  function refBoxHTML() {
    return `<div class="card" style="margin-bottom:10px"><div class="cb" style="padding:10px 14px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b style="font-size:14px">📍 Referências do bairro</b><span style="font-size:12px;color:var(--muted)">ITBI pago (Prefeitura) e aluguéis fechados pela NSP</span>
        <span style="flex:1"></span>
        <input id="bref-bairro" placeholder="Bairro (ex.: Saúde)" style="padding:6px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px;width:200px" onkeydown="if(event.key==='Enter')BussolaPortal.verReferencias(this.value)">
        <button class="btn btn-o bsm" onclick="BussolaPortal.verReferencias(document.getElementById('bref-bairro').value)">Ver</button></div>
      <div id="bref-res" style="font-size:12.5px;color:var(--muted);margin-top:6px">Digite um bairro ou analise um anúncio na Bússola: o bairro dele aparece aqui.</div></div></div>`;
  }
  const caixa = (tit, x, un, dec, fonte) => !x || !x.n ? `<div style="flex:1;min-width:230px;background:#f8fafc;border-radius:10px;padding:8px 12px"><b>${tit}</b><div style="color:var(--muted)">sem transações no período</div></div>`
    : `<div style="flex:1;min-width:230px;background:#f8fafc;border-radius:10px;padding:8px 12px"><b>${tit}</b>${x.confiavel ? '' : ' <span style="color:#b45309;font-size:11.5px">amostra pequena</span>'}
       <div style="font-size:18px;font-weight:700;color:var(--tx,#0f172a);margin:2px 0">${brl(x.mediana_m2, dec)}<span style="font-size:12px;font-weight:400">/m²${un}</span></div>
       <div>faixa ${brl(x.p25, dec)} a ${brl(x.p75, dec)} · ${Number(x.n).toLocaleString('pt-BR')} ${x.n === 1 ? 'negócio' : 'negócios'} · ${mes(x.de)} a ${mes(x.ate)}</div>
       <div style="font-size:11px;color:var(--muted)">${esc(fonte)}</div></div>`;
  let _ultBairro = '';
  async function verReferencias(bairro) {
    bairro = String(bairro || '').trim(); const res = document.getElementById('bref-res'), inp = document.getElementById('bref-bairro');
    if (!res || !bairro) return; if (inp && inp.value !== bairro) inp.value = bairro; _ultBairro = bairro;
    res.innerHTML = 'Consultando…';
    let r = null; try { r = await referencias(bairro); } catch (_) {}
    if (_ultBairro !== bairro) return;
    if (!r) { res.innerHTML = '<span style="color:#b45309">Não consegui consultar as referências agora.</span>'; return; }
    const v = r.venda_itbi_apto || {}, a = r.aluguel_fechado || {};
    res.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;color:var(--tx,#334155)">
      ${caixa('Venda · apartamentos (ITBI pago, 2 anos)', v, '', 0, 'Prefeitura de SP, valor declarado no ITBI; m² sobre a área construída do IPTU (inclui área comum), por isso abaixo do m² útil')}
      ${caixa('Aluguel fechado pela NSP (3 anos)', a, ' por mês', 2, 'Contratos de locação fechados (acervo Nido)')}
      </div><div style="font-size:11px;color:var(--muted);margin-top:4px">Bairro consultado: ${esc(r.bairro)} · referência para conversa, não entra no cálculo da Bússola.</div>`;
  }
  function recarregar() { const f = document.getElementById('bussola-frame'); if (f) f.src = 'bussola/index.html?t=' + Date.now(); }
  // Ponte para a página da Bússola (iframe): CUR, SBU e db são "let/const" do portal e NÃO ficam em window,
  // então a Bússola não consegue lê-los direto por window.parent.
  const usuario = () => (typeof CUR !== 'undefined' && CUR) ? CUR : null;
  const cabecalhos = extra => hdr(extra);
  window.BussolaPortal = { checar, abrir, recarregar, mostrarCard, referencias, verReferencias, usuario, cabecalhos, SBU, pode: () => !!_pode };
})();

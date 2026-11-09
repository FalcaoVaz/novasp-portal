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
      box.innerHTML = '<iframe id="bussola-frame" src="bussola/index.html" title="Bússola NSP" allow="clipboard-write" '
        + 'style="width:100%;height:calc(100vh - 150px);min-height:560px;border:1px solid var(--borda,#e2e8f0);border-radius:12px;background:#fff"></iframe>';
    }
  }
  function recarregar() { const f = document.getElementById('bussola-frame'); if (f) f.src = 'bussola/index.html?t=' + Date.now(); }
  window.BussolaPortal = { checar, abrir, recarregar, mostrarCard, pode: () => !!_pode };
})();

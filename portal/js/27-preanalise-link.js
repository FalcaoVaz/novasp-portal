/* ═══════════════════════════════════════════════════════════════
   27-preanalise-link.js — LINK DE ACOMPANHAMENTO DO CORRETOR (18/11/2026, pacote da Renata / motor 1.3)
   Página pública, só leitura, sem login: falcaovaz.netlify.app/acompanhar/<token> (função acompanhar.js).
   Mostra só o resumo (PAAcomp.resumoPublico + próximos prazos): etapas, tarefas, marcos e prazos — sem CPF, RG,
   valores, certidões ou dados de clientes. O portal atualiza esse resumo quando a equipe abre a venda.
   Tabela preanalise_link_corretor (sql/2026-11-18-preanalise-link-corretor.sql). Gerente, assistente e admin.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const BASE = 'https://falcaovaz.netlify.app/acompanhar/';
  const U = () => window.PreAnalise._u;
  let L = { venda: null, links: [], erro: null };
  const podeGerir = () => { const C = window.PACompr; return !!(C && C.podeEmitir && C.podeEmitir()); };

  async function carregar(v) {
    L = { venda: v, links: [], erro: null };
    try { L.links = await db.get('preanalise_link_corretor', `?venda_id=eq.${v.id}&ativo=is.true&select=token,criado_por,criado_em,atualizado_em,snapshot&order=criado_em.desc`); }
    catch (e) { L.erro = /preanalise_link_corretor|does not exist|schema cache/i.test(e.message) ? 'falta rodar o SQL 2026-11-18-preanalise-link-corretor.sql' : e.message; }
  }
  function snapshot(prazos) {
    const r = window.PAAcomp && PAAcomp.resumoPublico ? PAAcomp.resumoPublico() : null; if (!r) return null;
    r.prazos = (prazos || []).filter(p => !p.feito).slice(0, 6).map(p => ({ titulo: p.titulo, data: p.data }));
    return r;
  }
  // chamado ao abrir a venda: grava o resumo novo nos links ativos (só se mudou)
  async function atualizar(prazos) {
    if (!L.venda || !L.links.length) return;
    const snap = snapshot(prazos); if (!snap) return;
    const novo = JSON.stringify(snap); if (L.links.every(l => JSON.stringify(l.snapshot || {}) === novo)) return;
    try {
      await fetch(`${SBU}/rest/v1/preanalise_link_corretor?venda_id=eq.${L.venda.id}&ativo=is.true`, { method: 'PATCH', headers: hdr({ Prefer: 'return=minimal' }), body: JSON.stringify({ snapshot: snap, atualizado_em: new Date().toISOString() }) });
      L.links.forEach(l => { l.snapshot = snap; });
    } catch (_) {}
  }
  function cardHTML() {
    if (!L.venda || !podeGerir()) return '';
    const u = U(), esc = u.esc;
    const corpo = L.erro ? `<div style="font-size:12.5px;color:#b45309">Indisponível: ${esc(L.erro)}.</div>`
      : L.links.length ? L.links.map(l => `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
          <input readonly value="${BASE + l.token}" style="flex:1;min-width:220px;padding:6px 8px;border:1.5px solid var(--borda);border-radius:7px;font-size:12px" onclick="this.select()">
          <button class="btn btn-o bsm" onclick="PALink.copiar('${l.token}')">Copiar</button>
          <a class="btn btn-o bsm" href="${BASE + l.token}" target="_blank" rel="noopener">Ver como o corretor vê</a>
          <button class="btn btn-o bsm" style="color:#b91c1c" onclick="PALink.desativar('${l.token}')">Desativar</button></div>
          <div style="font-size:11.5px;color:var(--muted)">criado por ${esc(l.criado_por || '')} em ${u.dt(l.criado_em)} · atualizado ${u.dt(l.atualizado_em)}</div>`).join('')
        : '<div style="margin-top:6px"><button class="btn btn-o bsm" onclick="PALink.gerar()">Gerar link para o corretor</button></div>';
    return `<div class="card" style="margin-bottom:12px" id="pa-link-corretor"><div class="cb">
      <div style="font-weight:700;font-size:15px">📱 Corretor: link de acompanhamento</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px">Página só de leitura, sem login, que abre no celular: etapas, tarefas, marcos e próximos prazos. Não mostra CPF, RG, valores, certidões nem dados de clientes.</div>
      ${corpo}</div></div>`;
  }
  async function gerar() {
    if (!podeGerir() || !L.venda) return;
    const token = (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
    try {
      await db.post('preanalise_link_corretor', { token, venda_id: L.venda.id, criado_por: U().quem(), snapshot: snapshot(window.PreAnalise._prazosAtuais || []) || {} });
      try { await db.post('preanalise_evento', { venda_id: L.venda.id, por: U().quem(), acao: 'link do corretor', detalhe: 'gerado' }); } catch (_) {}
      U().aviso('Link gerado. Copie e mande ao corretor.', 'ok'); window.PreAnalise.venda(L.venda.id);
    } catch (e) { U().aviso('Não gerou: ' + e.message, 'err'); }
  }
  async function desativar(token) {
    if (!podeGerir() || !confirm('Desativar este link? Quem tiver o endereço deixa de conseguir abrir.')) return;
    try {
      await fetch(`${SBU}/rest/v1/preanalise_link_corretor?token=eq.${encodeURIComponent(token)}`, { method: 'PATCH', headers: hdr({ Prefer: 'return=minimal' }), body: JSON.stringify({ ativo: false, desativado_por: U().quem(), desativado_em: new Date().toISOString() }) });
      try { await db.post('preanalise_evento', { venda_id: L.venda.id, por: U().quem(), acao: 'link do corretor', detalhe: 'desativado' }); } catch (_) {}
      U().aviso('Link desativado.', 'ok'); window.PreAnalise.venda(L.venda.id);
    } catch (e) { U().aviso('Não desativou: ' + e.message, 'err'); }
  }
  async function copiar(token) {
    try { await navigator.clipboard.writeText(BASE + token); U().aviso('Link copiado.', 'ok'); } catch (_) { prompt('Copie o link:', BASE + token); }
  }
  window.PALink = { carregar, cardHTML, atualizar, gerar, desativar, copiar, BASE };
})();

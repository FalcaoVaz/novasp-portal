/* =====================================================================
   23-preanalise.js — PRÉ-ANÁLISE DE MATRÍCULA E CERTIDÕES (piloto da Renata, Gestão de Vendas Moema)
   ---------------------------------------------------------------------
   Painel das vendas (semáforo, próximo prazo, matrícula, certidões, próxima ação, alertas) → venda (dados da proposta,
   prazos, PDFs) → "Analisar" → dossiê com status, checklist, certidões, providências e ato a ato da matrícula →
   conferência da leitura → mensagens de pendências → revisão jurídica → parecer em PDF.
   04/11/2026: melhorias da versão local da Renata trazidas para cá (painel, prazos, conferência obrigatória, mensagens,
   certidão refeita substitui a antiga, revisão jurídica registrada, parecer em PDF, uso da semana). Minuta e Imoview: depois.
   Banco: sql/2026-11-04-preanalise-painel.sql (colunas novas da venda).
   Banco: sql/2026-10-07-preanalise.sql (tabelas preanalise_*, bucket privado "preanalise", acesso só do piloto).
   Motor: função preanalise-background do site do jurídico (lê os PDFs com o Claude; o status sai das regras no código).
   ===================================================================== */
(function () {
  'use strict';
  const BUCKET = 'preanalise';
  const MAX_PDF = 20 * 1024 * 1024;
  const STATUS = {
    liberado:   { lb: 'Liberado',        cor: '#047857', fundo: '#ecfdf5' },
    ressalvas:  { lb: 'Com ressalvas',   cor: '#b45309', fundo: '#fffbeb' },
    bloqueado:  { lb: 'Bloqueado',       cor: '#b91c1c', fundo: '#fef2f2' },
    incompleto: { lb: 'Incompleto',      cor: '#475569', fundo: '#f1f5f9' }
  };
  const TIPOS = { matricula: 'Matrícula', certidao: 'Certidão', iptu: 'IPTU / tributos', outro: 'Outro' };
  const RES = { encontrado: ['Encontrado', '#b91c1c'], nao_encontrado: ['Não consta', '#047857'], nao_verificado: ['Não verificado', '#475569'],
                ok: ['Em ordem', '#047857'], divergencia: ['Divergência', '#b45309'] };
  const CAT = { bloqueia: 'Bloqueia', ressalva: 'Ressalva', conferir: 'Conferir' };
  const REV = { aprovado: 'aprovado', aprovado_ressalvas: 'aprovado com ressalvas', nao_aprovado: 'não aprovado' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') + ' ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dia = s => { if (!s) return '—'; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s); };
  const aviso = (m, t) => (typeof toast === 'function' ? toast(m, t || '') : alert(m));
  const badge = st => { const s = STATUS[st]; return s ? `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;color:${s.cor};background:${s.fundo};border:1px solid ${s.cor}33">${s.lb}</span>` : '<span style="color:#94a3b8;font-size:12px">sem análise</span>'; };
  const raiz = () => document.getElementById('preanalise-root');
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const quem = () => (typeof CUR !== 'undefined' && CUR) ? (CUR.email || CUR.nome || null) : null;
  const ehJuridico = () => typeof CUR !== 'undefined' && CUR && (CUR.acesso_juridico || CUR.admin);
  const VALIDADE = 30;                                   // dias (a mesma regra da função de leitura)
  const MESES_SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const meioDia = iso => Date.parse(String(iso).slice(0, 10) + 'T12:00:00');
  const diasEntre = (de, ate) => { const a = meioDia(de), b = meioDia(ate); return isNaN(a) || isNaN(b) ? null : Math.round((b - a) / 86400000); };
  const somaDias = (iso, n) => { const d = new Date(meioDia(iso) + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const diaSem = iso => MESES_SEM[new Date(meioDia(iso)).getDay()];
  const fimDeSemana = iso => { const w = new Date(meioDia(iso)).getDay(); return w === 0 || w === 6; };
  const falta = iso => { const n = diasEntre(hojeIso(), iso); return n == null ? '' : n < 0 ? `venceu há ${-n} dia(s)` : n === 0 ? 'é hoje' : `faltam ${n} dia(s)`; };

  // ── Storage (bucket privado; o token do usuário passa pela política de acesso) ──
  async function storageFetch(path, opts) {
    const h = () => { const x = hdr((opts || {}).headers); delete x.Prefer; return x; };
    let r = await fetch(SBU + '/storage/v1/' + path, Object.assign({}, opts, { headers: h() }));
    if (r.status === 401 && typeof _authRenovarSePerto === 'function' && await _authRenovarSePerto(true))
      r = await fetch(SBU + '/storage/v1/' + path, Object.assign({}, opts, { headers: h() }));
    return r;
  }
  async function enviarPdf(caminho, arquivo) {
    const h = hdr({ 'Content-Type': 'application/pdf', 'x-upsert': 'false' }); delete h.Prefer;
    const r = await fetch(`${SBU}/storage/v1/object/${BUCKET}/${caminho}`, { method: 'POST', headers: h, body: arquivo });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(m || 'HTTP ' + r.status); }
  }
  async function linkPdf(caminho) {
    const r = await storageFetch(`object/sign/${BUCKET}/${caminho}`, { method: 'POST', body: JSON.stringify({ expiresIn: 300 }), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json(); if (!r.ok || !j.signedURL) throw new Error(j.message || 'não consegui abrir o PDF');
    return SBU + '/storage/v1' + j.signedURL;
  }
  async function apagarPdfs(caminhos) {
    if (!caminhos.length) return;
    await storageFetch(`object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: caminhos }), headers: { 'Content-Type': 'application/json' } });
  }

  // ── PAINEL (tela inicial) ──
  let _lista = { vendas: [], ult: new Map(), ndocs: new Map() };
  function prazosDe(v) {
    const p = (v.prazos || []).filter(x => x && x.data).map(x => ({ titulo: x.titulo || 'Prazo', data: x.data, feito: !!x.feito }));
    if (v.data_compromisso && v.prazo_escritura_dias) p.push({ titulo: 'Escritura', data: somaDias(v.data_compromisso, Number(v.prazo_escritura_dias)), feito: !!v.escritura_feita, escritura: true });
    return p.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  const proximoPrazo = v => prazosDe(v).find(x => !x.feito) || null;
  function matInfo(e) {                                   // idade da matrícula HOJE (não na data da análise)
    if (!e || !e.mat_data) return null;
    const idade = diasEntre(e.mat_data, hojeIso()); return idade == null ? null : { idade, vencida: idade > VALIDADE };
  }
  function certInfo(e) {
    if (!e) return null;
    const ativas = (e.certidoes || []).filter(c => !c.substituida);
    const vencidas = ativas.filter(c => { const i = c.data_emissao ? diasEntre(c.data_emissao, hojeIso()) : null; return i == null || i > VALIDADE; });
    const faltando = ((e.decisao || {}).certidoes_faltando || []).length;
    return { n: ativas.length, vencidas: vencidas.length, positivas: ativas.filter(c => c.resultado === 'positiva').length, faltando };
  }
  function proximaAcao(v, e, nd) {
    if (!nd) return 'Subir a matrícula';
    if (!e) return 'Analisar';
    if (v.leitura_conferida_exec !== e.id) return 'Conferir a leitura da matrícula';
    const mi = matInfo(e), ci = certInfo(e);
    if (mi && mi.vencida) return 'Pedir matrícula atualizada';
    if (ci && (ci.vencidas || ci.faltando)) return `Emitir/refazer ${ci.vencidas + ci.faltando} certidão(ões)`;
    if (v.status === 'incompleto') return 'Completar o que falta (ver dossiê)';
    if (v.status !== 'liberado' && !v.encaminhado_juridico) return 'Encaminhar ao jurídico';
    if (v.encaminhado_juridico && !v.revisao_status) return 'Aguardando revisão jurídica';
    if (v.revisao_status === 'nao_aprovado') return 'Jurídico não aprovou (ver nota)';
    const pp = proximoPrazo(v); return pp ? `${pp.titulo} em ${dia(pp.data)}` : 'Seguir para o compromisso';
  }
  async function abrir() {
    const el = raiz(); if (!el) return;
    if (typeof ehParticipantePiloto === 'function' && !ehParticipantePiloto()) { el.innerHTML = '<div class="card"><div class="cb">Acesso só para os participantes do piloto.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Carregando vendas…</div></div>';
    let vendas = [], execs = [], docs = [];
    try {
      [vendas, execs, docs] = await Promise.all([
        db.get('preanalise_venda', '?select=*&order=criado_em.desc'),
        db.get('preanalise_execucao', '?situacao=eq.ok&select=id,venda_id,concluido_em,status,decisao:resultado->decisao,mat_data:resultado->matricula->>data_documento,certidoes:resultado->certidoes&order=concluido_em.desc&limit=1000'),
        db.get('preanalise_documento', '?select=venda_id')]);
    } catch (e) { el.innerHTML = `<div class="card"><div class="cb" style="color:#dc2626">Erro ao ler: ${esc(e.message)}<br><small>As tabelas já foram criadas? (sql/2026-10-07-preanalise.sql e sql/2026-11-04-preanalise-painel.sql)</small></div></div>`; return; }
    const ult = new Map(); execs.forEach(x => { if (!ult.has(x.venda_id)) ult.set(x.venda_id, x); });
    const nd = new Map(); docs.forEach(d => nd.set(d.venda_id, (nd.get(d.venda_id) || 0) + 1));
    _lista = { vendas, ult, ndocs: nd };
    // alertas no topo
    const al = [];
    vendas.forEach(v => {
      const e = ult.get(v.id), t = esc(v.titulo);
      prazosDe(v).filter(p => !p.feito).forEach(p => { const n = diasEntre(hojeIso(), p.data); if (n != null && n <= 7) al.push([n < 0 ? 0 : 1, `<b>${t}</b>: ${esc(p.titulo)} em ${dia(p.data)} (${diaSem(p.data)}) — ${falta(p.data)}${fimDeSemana(p.data) ? ' · <b>cai no fim de semana</b>' : ''}`]); });
      const mi = matInfo(e); if (mi && mi.vencida) al.push([2, `<b>${t}</b>: matrícula emitida há ${mi.idade} dias — pedir atualizada`]);
      const ci = certInfo(e); if (ci && ci.vencidas) al.push([3, `<b>${t}</b>: ${ci.vencidas} certidão(ões) com mais de ${VALIDADE} dias — refazer`]);
      if (v.encaminhado_juridico && !v.revisao_status) al.push([4, `<b>${t}</b>: revisão jurídica pendente desde ${dia(String(v.encaminhado_em || '').slice(0, 10))}`]);
    });
    al.sort((a, b) => a[0] - b[0]);
    el.innerHTML = `
      ${al.length ? `<div class="card" style="margin-bottom:12px;border-left:5px solid #b45309"><div class="cb" style="background:#fffbeb"><div style="font-weight:700;color:#b45309;margin-bottom:6px">Atenção (${al.length})</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">${al.map(a => `<li>${a[1]}</li>`).join('')}</ul></div></div>` : ''}
      <div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input id="pa-busca" placeholder="Buscar venda, matrícula ou vendedor…" oninput="PreAnalise.filtrar()" style="flex:1;min-width:200px;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
        <select id="pa-fst" onchange="PreAnalise.filtrar()" style="padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
          <option value="">Todos os status</option>${Object.keys(STATUS).map(k => `<option value="${k}">${STATUS[k].lb}</option>`).join('')}<option value="sem">Sem análise</option><option value="juridico">Aguardando jurídico</option></select>
        <button class="btn btn-o" onclick="PreAnalise.semana()">📊 Uso da semana</button>
        <button class="btn btn-p" onclick="PreAnalise.nova()">+ Nova venda</button>
      </div></div>
      <div id="pa-nova"></div><div id="pa-semana"></div>
      <div id="pa-tabela"></div>
      ${notaPiloto()}`;
    filtrar();
  }
  function filtrar() {
    const box = document.getElementById('pa-tabela'); if (!box) return;
    const q = ((document.getElementById('pa-busca') || {}).value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const fs = (document.getElementById('pa-fst') || {}).value || '';
    const { vendas, ult, ndocs } = _lista;
    const lista = vendas.filter(v => {
      if (q && ![v.titulo, v.matricula, v.cartorio, v.vendedores].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) return false;
      if (fs === 'sem') return !v.status; if (fs === 'juridico') return v.encaminhado_juridico && !v.revisao_status;
      return !fs || v.status === fs;
    });
    const cont = s => vendas.filter(v => v.status === s).length;
    if (!vendas.length) { box.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Nenhuma venda ainda. Clique em "Nova venda" e suba a matrícula.</div></div>'; return; }
    box.innerHTML = `<div style="font-size:12px;color:var(--muted);margin:0 0 6px 2px">${vendas.length} venda(s) · ${Object.keys(STATUS).map(s => `${STATUS[s].lb}: ${cont(s)}`).join(' · ')}${lista.length !== vendas.length ? ` · mostrando ${lista.length}` : ''}</div>
      <div class="card"><div class="tw tbl"><table><thead><tr><th>Venda</th><th>Status</th><th>Matrícula</th><th>Certidões</th><th>Próximo prazo</th><th>Próxima ação</th></tr></thead><tbody>
      ${lista.map(v => {
        const e = ult.get(v.id), mi = matInfo(e), ci = certInfo(e), pp = proximoPrazo(v);
        const n = pp ? diasEntre(hojeIso(), pp.data) : null;
        return `<tr style="cursor:pointer" onclick="PreAnalise.venda('${v.id}')">
          <td style="font-weight:600">${esc(v.titulo)}${v.matricula ? `<br><small style="color:var(--muted);font-weight:400">mat. ${esc(v.matricula)}${v.cartorio ? ' · ' + esc(v.cartorio) : ''}</small>` : ''}</td>
          <td>${badge(v.status)}${v.encaminhado_juridico ? `<br><small style="color:${v.revisao_status ? '#047857' : '#b45309'}">${v.revisao_status ? 'jurídico: ' + REV[v.revisao_status] : 'no jurídico'}</small>` : ''}</td>
          <td style="font-size:12px">${mi ? `<span style="color:${mi.vencida ? '#b91c1c' : '#047857'}">${mi.idade} dias${mi.vencida ? ' · vencida' : ''}</span>` : (ndocs.get(v.id) ? '—' : '<span style="color:var(--muted)">sem PDF</span>')}
            ${e && v.leitura_conferida_exec !== e.id ? '<br><small style="color:#b45309">leitura não conferida</small>' : ''}</td>
          <td style="font-size:12px">${ci ? `${ci.n} lida(s)${ci.vencidas ? `<br><span style="color:#b91c1c">${ci.vencidas} vencida(s)</span>` : ''}${ci.faltando ? `<br><span style="color:#475569">${ci.faltando} faltando</span>` : ''}${ci.positivas ? `<br><span style="color:#b45309">${ci.positivas} positiva(s)</span>` : ''}` : '—'}</td>
          <td style="font-size:12px;white-space:nowrap">${pp ? `${esc(pp.titulo)}<br><b style="color:${n != null && n <= 7 ? '#b45309' : 'inherit'}">${dia(pp.data)}</b> <small>${diaSem(pp.data)}</small><br><small style="color:var(--muted)">${falta(pp.data)}${fimDeSemana(pp.data) ? ' · fim de semana' : ''}</small>` : '—'}</td>
          <td style="font-size:12px">${esc(proximaAcao(v, e, ndocs.get(v.id) || 0))}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  // ── USO DA SEMANA (registro do piloto) ──
  async function semana() {
    const box = document.getElementById('pa-semana'); if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    const desde = somaDias(hojeIso(), -6);
    let ex = [], dc = [];
    try { [ex, dc] = await Promise.all([
      db.get('preanalise_execucao', `?iniciado_em=gte.${desde}T00:00:00-03:00&select=venda_id,situacao,custo_usd,documentos`),
      db.get('preanalise_documento', `?enviado_em=gte.${desde}T00:00:00-03:00&select=id`)]); }
    catch (e) { aviso('Erro: ' + e.message, 'err'); return; }
    const ok = ex.filter(x => x.situacao === 'ok'), vendasAn = new Set(ok.map(x => x.venda_id)).size;
    const lidos = ok.reduce((t, x) => t + ((x.documentos || []).length), 0), custo = ok.reduce((t, x) => t + Number(x.custo_usd || 0), 0);
    let min = 60; try { min = Number(localStorage.getItem('pa_min_por_venda')) || 60; } catch (_) {}
    const horas = Math.round(vendasAn * min / 6) / 10;
    const texto = `Pré-análise — semana de ${dia(desde)} a ${dia(hojeIso())}: ${vendasAn} venda(s) analisada(s) (${ok.length} análise(s)${ex.length > ok.length ? `, ${ex.length - ok.length} com erro` : ''}), ${lidos} documento(s) lido(s), ${dc.length} PDF(s) enviado(s). Custo da leitura: US$ ${custo.toFixed(2).replace('.', ',')}. Economia estimada: cerca de ${String(horas).replace('.', ',')} h (estimativa de ${min} min de leitura manual por venda).`;
    box.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="font-weight:700;margin-bottom:8px">Uso da semana</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-bottom:10px">
        <div><small style="color:var(--muted)">Vendas analisadas</small><br><b style="font-size:18px">${vendasAn}</b></div>
        <div><small style="color:var(--muted)">Documentos lidos</small><br><b style="font-size:18px">${lidos}</b></div>
        <div><small style="color:var(--muted)">PDFs enviados</small><br><b style="font-size:18px">${dc.length}</b></div>
        <div><small style="color:var(--muted)">Custo</small><br><b style="font-size:18px">US$ ${custo.toFixed(2).replace('.', ',')}</b></div>
        <label style="font-size:12px;color:var(--muted)">Min. de leitura manual por venda (estimativa)<br><input type="number" min="5" step="5" value="${min}" style="width:90px;padding:6px 8px;border:1.5px solid var(--borda);border-radius:8px"
          onchange="try{localStorage.setItem('pa_min_por_venda',this.value)}catch(_){};document.getElementById('pa-semana').innerHTML='';PreAnalise.semana()"></label></div>
      <textarea id="pa-sem-txt" rows="3" readonly style="width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${esc(texto)}</textarea>
      <button class="btn btn-o bsm" style="margin-top:6px" onclick="PreAnalise.copiar('pa-sem-txt')">Copiar texto do registro</button></div></div>`;
  }
  function notaPiloto() {
    return `<div style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.5">Piloto: lê, aponta e organiza; não substitui parecer jurídico e não decide. Regras em aberto (validade de 30 dias, itens 6 a 8 do checklist, lista oficial de certidões e prazo de descarte) estão com o valor mais conservador. Documentos de vendedores e anuentes são dado pessoal de terceiros: só os participantes do piloto acessam.</div>`;
  }

  // ── NOVA VENDA ──
  function campos(v) {
    v = v || {};
    const inp = (id, lb, val, ph) => `<label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px">${lb}<input id="${id}" value="${esc(val || '')}" placeholder="${esc(ph || '')}" style="padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px"></label>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        ${inp('pa-titulo', 'Venda (endereço ou apelido) *', v.titulo, 'Ex.: Rua X, 123, apto 41')}
        ${inp('pa-matricula', 'Nº da matrícula', v.matricula)}
        ${inp('pa-cartorio', 'Cartório de registro', v.cartorio, 'Ex.: 14º RI')}
        ${inp('pa-sql', 'SQL (contribuinte)', v.sql_contribuinte)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px">
        <label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px">Vendedores da proposta (um por linha) — para conferir com o proprietário da matrícula
          <textarea id="pa-vendedores" rows="3" style="padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${esc(v.vendedores || '')}</textarea></label>
        <label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px">Área e descrição da proposta
          <textarea id="pa-area" rows="3" style="padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px" placeholder="Ex.: apto 41, 64 m² úteis, 1 vaga">${esc(v.area_proposta || '')}</textarea></label>
      </div>
      <div style="margin-top:10px;font-size:13px;display:flex;gap:16px;flex-wrap:wrap">
        <label><input type="radio" name="pa-escopo" value="matricula" ${v.escopo !== 'completo' ? 'checked' : ''}> Só a matrícula (teste)</label>
        <label><input type="radio" name="pa-escopo" value="completo" ${v.escopo === 'completo' ? 'checked' : ''}> Matrícula e certidões (falta de certidão fecha como Incompleto)</label>
      </div>`;
  }
  function lerCampos() {
    const g = id => (document.getElementById(id) || {}).value || '';
    const esco = (document.querySelector('input[name="pa-escopo"]:checked') || {}).value || 'matricula';
    return { titulo: g('pa-titulo').trim(), matricula: g('pa-matricula').trim() || null, cartorio: g('pa-cartorio').trim() || null, sql_contribuinte: g('pa-sql').trim() || null,
             vendedores: g('pa-vendedores').trim() || null, area_proposta: g('pa-area').trim() || null, escopo: esco };
  }
  function nova() {
    const box = document.getElementById('pa-nova'); if (!box) return;
    box.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cb">${campos()}
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-p" onclick="PreAnalise.criar()">Criar venda</button><button class="btn btn-o" onclick="document.getElementById('pa-nova').innerHTML=''">Cancelar</button></div></div></div>`;
  }
  async function criar() {
    const d = lerCampos(); if (!d.titulo) { aviso('Informe o endereço ou um apelido da venda.', 'err'); return; }
    try { const [v] = await db.post('preanalise_venda', Object.assign(d, { criado_por: quem() })); venda(v.id); }
    catch (e) { aviso('Erro ao criar: ' + e.message, 'err'); }
  }

  // ── VENDA ──
  let _venda = null, _docs = [], _execs = [], _pz = [];
  const eDe = x => x ? { id: x.id, mat_data: ((x.resultado || {}).matricula || {}).data_documento, certidoes: (x.resultado || {}).certidoes, decisao: (x.resultado || {}).decisao } : null;
  async function venda(id) {
    const el = raiz(); if (!el) return;
    el.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Carregando…</div></div>';
    try {
      [_venda] = await db.get('preanalise_venda', `?id=eq.${id}&select=*`);
      _docs = await db.get('preanalise_documento', `?venda_id=eq.${id}&select=*&order=tipo.asc,enviado_em.asc`);
      _execs = await db.get('preanalise_execucao', `?venda_id=eq.${id}&select=id,iniciado_em,concluido_em,situacao,erro,status,pedido_por,modelo,custo_usd,resultado,config,documentos&order=iniciado_em.desc&limit=10`);
    } catch (e) { el.innerHTML = `<div class="card"><div class="cb" style="color:#dc2626">Erro: ${esc(e.message)}</div></div>`; return; }
    if (!_venda) { abrir(); return; }
    const v = _venda, ult = _execs.find(x => x.situacao === 'ok');
    _pz = (v.prazos || []).map(x => Object.assign({}, x));
    const conferida = ult && v.leitura_conferida_exec === ult.id;
    el.innerHTML = `
      <div style="margin-bottom:10px"><a href="#" onclick="event.preventDefault();PreAnalise.abrir()" style="color:var(--pri,#0088CC);font-size:13px">← painel das vendas</a></div>
      <div class="card" style="margin-bottom:12px"><div class="cb">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div><div style="font-size:17px;font-weight:700">${esc(v.titulo)}</div><div style="font-size:12px;color:var(--muted)">Aberta ${dt(v.criado_em)}${v.criado_por ? ' por ' + esc(v.criado_por) : ''}</div></div>
          <div>${badge(v.status)}</div>
        </div>
        ${andamentoHTML(v, ult)}
        <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--pri,#0088CC);font-size:13px">Dados da proposta</summary>
          <div style="margin-top:10px">${campos(v)}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-o bsm" onclick="PreAnalise.salvar()">Salvar dados</button>
          <button class="btn btn-o bsm" style="color:#dc2626" onclick="PreAnalise.excluir()">Excluir venda e PDFs</button></div></div></details>
      </div></div>
      <div id="pa-prazos">${prazosHTML()}</div>
      <details class="card" style="margin-bottom:12px" ${_docs.length ? '' : 'open'}><summary class="cb" style="cursor:pointer;font-weight:700">Documentos (PDF) · ${_docs.length}</summary><div class="cb" style="padding-top:0">
        ${_docs.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${_docs.map(d => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">
          <td style="padding:5px 6px;white-space:nowrap">${TIPOS[d.tipo] || d.tipo}</td><td style="padding:5px 6px">${esc(d.nome_arquivo)}</td>
          <td style="padding:5px 6px;color:var(--muted);white-space:nowrap">${d.tamanho ? Math.round(d.tamanho / 1024) + ' KB' : ''}</td><td style="padding:5px 6px;color:var(--muted);white-space:nowrap">${dt(d.enviado_em)}</td>
          <td style="padding:5px 6px;text-align:right;white-space:nowrap"><button class="btn btn-o bsm" onclick="PreAnalise.ver('${d.id}')">Ver</button> <button class="btn btn-o bsm" onclick="PreAnalise.tirar('${d.id}')">✕</button></td></tr>`).join('')}</tbody></table>`
          : '<div style="font-size:13px;color:var(--muted)">Nenhum PDF ainda. Comece pela matrícula.</div>'}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="pa-tipo" style="padding:7px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k]}</option>`).join('')}</select>
          <input type="file" id="pa-arq" accept="application/pdf,.pdf" multiple style="font-size:13px">
          <button class="btn btn-o" onclick="PreAnalise.subir()">Subir</button>
          <span id="pa-sub" style="font-size:12px;color:var(--muted)">Certidão refeita: pode subir a nova junto; vale a de emissão mais recente.</span>
        </div>
      </div></details>
      <div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-p" id="pa-analisar" onclick="PreAnalise.analisar()" ${_docs.some(d => d.tipo === 'matricula') ? '' : 'disabled title="Suba a matrícula primeiro"'}>🔎 ${ult ? 'Analisar de novo' : 'Analisar'}</button>
        <span id="pa-prog" style="font-size:13px;color:var(--muted)">${_docs.some(d => d.tipo === 'matricula') ? 'A leitura leva de 1 a 4 minutos.' : 'Suba a matrícula para analisar.'}</span>
        <span style="flex:1"></span>
        ${ult && v.status !== 'liberado' && !v.encaminhado_juridico ? `<button class="btn btn-o" onclick="PreAnalise.encaminhar()">Encaminhar para revisão jurídica</button>` : ''}
        ${ult ? `<button class="btn btn-o" onclick="PreAnalise.baixarPdf()">⬇️ Parecer em PDF</button><button class="btn btn-o" onclick="PreAnalise.imprimir()">🖨️ Imprimir</button>` : ''}
      </div></div>
      ${_execs[0] && _execs[0].situacao === 'erro' ? `<div class="card" style="margin-bottom:12px"><div class="cb" style="color:#dc2626;font-size:13px">A última análise falhou (${dt(_execs[0].iniciado_em)}): ${esc(_execs[0].erro)}</div></div>` : ''}
      ${ult ? conferenciaHTML(v, ult) : ''}
      <div id="pa-dossie">${ult ? dossieHTML(ult, v) : ''}</div>
      ${ult ? `<details class="card" style="margin-bottom:12px" ${conferida ? 'open' : ''}><summary class="cb" style="cursor:pointer;font-weight:700">✉️ Mensagens de pendências</summary>
        <div class="cb" style="padding-top:0" id="pa-msgs">${mensagensHTML(ult, v)}</div></details>` : ''}
      ${v.encaminhado_juridico || v.revisao_status ? revisaoHTML(v) : ''}
      ${_execs.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--muted);font-size:13px">Histórico de análises (${_execs.length})</summary>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px"><tbody>${_execs.map(x => `<tr style="border-top:1px solid var(--borda,#e2e8f0)"><td style="padding:4px 6px">${dt(x.iniciado_em)}</td><td style="padding:4px 6px">${x.situacao === 'ok' ? badge(x.status) : esc(x.situacao)}</td><td style="padding:4px 6px">${esc(x.pedido_por || '')}</td><td style="padding:4px 6px">${x.id === v.leitura_conferida_exec ? '✓ leitura conferida' : ''}</td><td style="padding:4px 6px;color:var(--muted)">${x.custo_usd != null ? 'US$ ' + Number(x.custo_usd).toFixed(2) : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${notaPiloto()}`;
  }

  // andamento: etapas feitas e pendentes + próximo prazo
  function andamentoHTML(v, ult) {
    const e = eDe(ult), ci = certInfo(e), mi = matInfo(e), pp = proximoPrazo(v);
    const et = [
      ['Matrícula enviada', _docs.some(d => d.tipo === 'matricula')],
      ['Análise feita', !!ult],
      ['Leitura conferida', !!(ult && v.leitura_conferida_exec === ult.id)],
      ['Matrícula em dia', !!(mi && !mi.vencida)],
      ['Certidões em dia', !!(ci && v.escopo === 'completo' && !ci.vencidas && !ci.faltando)]];
    if (v.status && v.status !== 'liberado') et.push(['Revisão jurídica', !!v.revisao_status]);
    if (v.data_compromisso && v.prazo_escritura_dias) et.push(['Escritura', !!v.escritura_feita]);
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${et.map(([t, ok]) => `<span style="font-size:12px;padding:3px 9px;border-radius:99px;border:1px solid ${ok ? '#04785744' : '#cbd5e1'};color:${ok ? '#047857' : '#64748b'};background:${ok ? '#ecfdf5' : '#f8fafc'}">${ok ? '✓' : '○'} ${t}</span>`).join('')}</div>
      <div style="font-size:13px;margin-top:8px"><b>Próxima ação:</b> ${esc(proximaAcao(v, e, _docs.length))}${pp ? ` · <b>Próximo prazo:</b> ${esc(pp.titulo)} em ${dia(pp.data)} (${diaSem(pp.data)}) — ${falta(pp.data)}${fimDeSemana(pp.data) ? ' · <span style="color:#b45309">cai no fim de semana</span>' : ''}` : ''}</div>`;
  }

  // prazos da venda: compromisso + prazo da escritura (calcula a data) e outros prazos com "feito"
  function prazosHTML() {
    const v = _venda, esc_ = v.data_compromisso && v.prazo_escritura_dias ? somaDias(v.data_compromisso, Number(v.prazo_escritura_dias)) : null;
    const inp = 'padding:6px 8px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px';
    const pend = prazosDe(v).filter(p => !p.feito).length;
    return `<details class="card" style="margin-bottom:12px" ${pend ? 'open' : ''}><summary class="cb" style="cursor:pointer;font-weight:700">📅 Prazos da venda${pend ? ` · ${pend} em aberto` : ''}</summary><div class="cb" style="padding-top:0">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;font-size:12px;color:var(--muted)">
        <label>Data do compromisso<br><input type="date" id="pa-dc" value="${esc(v.data_compromisso || '')}" style="${inp}" onchange="PreAnalise.calcEscritura()"></label>
        <label>Prazo da escritura (dias)<br><input type="number" min="1" id="pa-pe" value="${esc(v.prazo_escritura_dias || '')}" style="${inp};width:90px" oninput="PreAnalise.calcEscritura()"></label>
        <div id="pa-esc-data" style="font-size:13px;color:#0f172a;padding-bottom:6px">${esc_ ? `Escritura até <b>${dia(esc_)}</b> (${diaSem(esc_)}) — ${falta(esc_)}${fimDeSemana(esc_) ? ' · <span style="color:#b45309">cai no fim de semana</span>' : ''}` : ''}</div>
        <label style="padding-bottom:6px"><input type="checkbox" id="pa-ef" ${v.escritura_feita ? 'checked' : ''}> escritura feita</label>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--muted)">Outros prazos</div>
      <div id="pa-pz-lista">${_pz.map((x, i) => `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
        <input id="pa-pz-t-${i}" value="${esc(x.titulo || '')}" placeholder="Ex.: entrega das certidões" style="${inp};flex:1;min-width:180px">
        <input type="date" id="pa-pz-d-${i}" value="${esc(x.data || '')}" style="${inp}">
        <label style="font-size:12px"><input type="checkbox" id="pa-pz-f-${i}" ${x.feito ? 'checked' : ''}> feito</label>
        ${x.data ? `<small style="color:var(--muted)">${diaSem(x.data)}${x.feito ? '' : ' · ' + falta(x.data) + (fimDeSemana(x.data) ? ' · fim de semana' : '')}</small>` : ''}
        <button class="btn btn-o bsm" onclick="PreAnalise.tirarPrazo(${i})">✕</button></div>`).join('')}</div>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-o bsm" onclick="PreAnalise.addPrazo()">+ Prazo</button><button class="btn btn-p bsm" onclick="PreAnalise.salvarPrazos()">Salvar prazos</button></div>
    </div></details>`;
  }
  function lerPrazos() { _pz = _pz.map((x, i) => ({ titulo: ((document.getElementById('pa-pz-t-' + i) || {}).value || '').trim(), data: (document.getElementById('pa-pz-d-' + i) || {}).value || null, feito: !!(document.getElementById('pa-pz-f-' + i) || {}).checked })); }
  function calcEscritura() {
    const dc = (document.getElementById('pa-dc') || {}).value, pe = Number((document.getElementById('pa-pe') || {}).value), box = document.getElementById('pa-esc-data');
    if (!box) return; if (!dc || !(pe > 0)) { box.innerHTML = ''; return; }
    const d = somaDias(dc, pe); box.innerHTML = `Escritura até <b>${dia(d)}</b> (${diaSem(d)}) — ${falta(d)}${fimDeSemana(d) ? ' · <span style="color:#b45309">cai no fim de semana</span>' : ''}`;
  }
  function addPrazo() { lerPrazos(); _pz.push({ titulo: '', data: null, feito: false }); const b = document.getElementById('pa-prazos'); const v0 = { dc: (document.getElementById('pa-dc') || {}).value, pe: (document.getElementById('pa-pe') || {}).value };
    b.innerHTML = prazosHTML(); document.getElementById('pa-dc').value = v0.dc || ''; document.getElementById('pa-pe').value = v0.pe || ''; calcEscritura(); }
  function tirarPrazo(i) { lerPrazos(); _pz.splice(i, 1); document.getElementById('pa-prazos').innerHTML = prazosHTML(); }
  async function salvarPrazos() {
    lerPrazos();
    const pe = Number((document.getElementById('pa-pe') || {}).value);
    const d = { data_compromisso: (document.getElementById('pa-dc') || {}).value || null, prazo_escritura_dias: pe > 0 ? Math.round(pe) : null,
                escritura_feita: !!(document.getElementById('pa-ef') || {}).checked, prazos: _pz.filter(x => x.titulo || x.data) };
    try { await db.patch('preanalise_venda', _venda.id, d); aviso('Prazos salvos.', 'ok'); venda(_venda.id); } catch (e) { aviso('Erro: ' + e.message + ' (o SQL 2026-11-04 já rodou?)', 'err'); }
  }

  // conferência obrigatória da leitura (vale para a análise atual)
  function conferenciaHTML(v, ult) {
    if (v.leitura_conferida_exec === ult.id) return `<div class="card" style="margin-bottom:12px"><div class="cb" style="font-size:13px;color:#047857">✓ Leitura da matrícula conferida por <b>${esc(v.leitura_conferida_por || '')}</b> em ${dt(v.leitura_conferida_em)}${v.leitura_nota ? `<div style="color:#334155;margin-top:4px"><b>Correções anotadas:</b> ${esc(v.leitura_nota)}</div>` : ''}</div></div>`;
    return `<div class="card" style="margin-bottom:12px;border-left:5px solid #b45309"><div class="cb" style="background:#fffbeb">
      <div style="font-weight:700;color:#b45309">Confira a leitura antes de usar o resultado</div>
      <div style="font-size:13px;margin:6px 0 8px;color:#334155">Abra a matrícula ao lado e confira, no dossiê abaixo, os <b>proprietários atuais</b>, a <b>data de emissão</b> e a <b>matrícula ato a ato</b> (nenhum ato faltando, cancelamentos ligados ao registro certo). Se algo estiver errado, anote aqui; se o erro mudar o resultado, corrija os dados da proposta ou suba um PDF melhor e analise de novo.</div>
      <textarea id="pa-conf-nota" rows="2" placeholder="O que estava errado na leitura (deixe em branco se estava tudo certo)" style="width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px"></textarea>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${_docs.filter(d => d.tipo === 'matricula').map(d => `<button class="btn btn-o bsm" onclick="PreAnalise.ver('${d.id}')">Abrir ${esc(d.nome_arquivo)}</button>`).join('')}
        <button class="btn btn-p bsm" onclick="PreAnalise.confirmarLeitura('${ult.id}')">Confirmar leitura</button></div></div></div>`;
  }
  async function confirmarLeitura(execId) {
    const nota = ((document.getElementById('pa-conf-nota') || {}).value || '').trim() || null;
    try { await db.patch('preanalise_venda', _venda.id, { leitura_conferida_exec: execId, leitura_conferida_por: quem(), leitura_conferida_em: new Date().toISOString(), leitura_nota: nota });
          aviso('Leitura conferida.', 'ok'); venda(_venda.id); }
    catch (e) { aviso('Erro: ' + e.message + ' (o SQL 2026-11-04 já rodou?)', 'err'); }
  }

  // mensagens de pendências: pessoa por pessoa (só o que depende do cliente) + lista da equipe (.csv)
  function pendencias(x, v) {
    const r = x.resultado || {}, dec = r.decisao || {}, prov = (r.providencias || []).slice().sort((a, b) => a.prioridade - b.prioridade);
    const clientes = new Map();
    prov.filter(p => p.a_quem === 'vendedor' || p.a_quem === 'comprador').forEach(p => {
      const k = (p.pessoa || '').trim() || (p.a_quem === 'vendedor' ? 'Vendedor(es)' : 'Comprador(es)');
      if (!clientes.has(k)) clientes.set(k, { nome: k, generico: !(p.pessoa || '').trim(), itens: [] });
      clientes.get(k).itens.push(p.pedido_cliente || p.texto);
    });
    const equipe = prov.filter(p => p.a_quem !== 'vendedor' && p.a_quem !== 'comprador').map(p => ({ texto: p.texto, a_quem: p.a_quem, prioridade: p.prioridade }));
    (r.certidoes || []).filter(c => !c.substituida && c.vencida).forEach(c => {
      const nome = (((x.config || {}).certidoes || []).find(z => z.id === c.orgao) || {}).txt || c.orgao;
      equipe.push({ texto: `Refazer certidão (${c.idade_dias == null ? 'sem data legível' : 'emitida há ' + c.idade_dias + ' dias'}): ${nome}${c.refere_a ? ' — ' + c.refere_a : ''}`, a_quem: 'equipe', prioridade: 90 }); });
    (dec.certidoes_faltando || []).forEach(t => equipe.push({ texto: 'Emitir certidão: ' + t, a_quem: 'equipe', prioridade: 95 }));
    return { clientes: [...clientes.values()], equipe };
  }
  function mensagensHTML(x, v) {
    const { clientes, equipe } = pendencias(x, v);
    const lim = (document.getElementById('pa-msg-data') || {}).value || '';
    const texto = c => { const pn = c.generico ? '' : ', ' + c.nome.split(/\s+/)[0].charAt(0).toUpperCase() + c.nome.split(/\s+/)[0].slice(1).toLowerCase();
      return `Olá${pn}! Tudo bem?\nPara seguirmos com a venda do imóvel ${v.titulo}, precisamos do seguinte:\n${c.itens.map(t => '• ' + t).join('\n')}\n${lim ? `Se possível, até ${dia(lim)} (${diaSem(lim)}).\n` : ''}Qualquer dúvida, estou à disposição. Obrigado!`; };
    return `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Só o que depende do cliente, pessoa por pessoa. Confira antes de enviar.
        <label style="margin-left:8px">Data limite (opcional) <input type="date" id="pa-msg-data" value="${esc(lim)}" onchange="PreAnalise.refazerMsgs()" style="padding:4px 6px;border:1.5px solid var(--borda);border-radius:8px;font-size:12px"></label></div>
      ${clientes.length ? clientes.map((c, i) => `<div style="margin-bottom:10px"><div style="font-size:13px;font-weight:600">${esc(c.nome)}</div>
        <textarea id="pa-msg-${i}" rows="${Math.min(10, c.itens.length + 5)}" style="width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${esc(texto(c))}</textarea>
        <button class="btn btn-o bsm" onclick="PreAnalise.copiar('pa-msg-${i}')">Copiar</button></div>`).join('') : '<div style="font-size:13px;color:#047857;margin-bottom:10px">Nada pendente do lado do cliente nesta análise.</div>'}
      <div style="font-size:13px;font-weight:600;margin-top:6px">Para a equipe emitir ou refazer</div>
      ${equipe.length ? `<ul style="margin:4px 0 6px;padding-left:18px;font-size:13px">${equipe.map(e => `<li>${esc(e.texto)} <small style="color:var(--muted)">· ${esc(e.a_quem)}</small></li>`).join('')}</ul>
        <button class="btn btn-o bsm" onclick="PreAnalise.csvEquipe()">Baixar .csv</button>` : '<div style="font-size:13px;color:var(--muted)">Nada.</div>'}`;
  }
  function refazerMsgs() { const ult = _execs.find(x => x.situacao === 'ok'), b = document.getElementById('pa-msgs'); if (ult && b) b.innerHTML = mensagensHTML(ult, _venda); }
  async function copiar(id) {
    const t = document.getElementById(id); if (!t) return;
    try { await navigator.clipboard.writeText(t.value); aviso('Copiado.', 'ok'); } catch (_) { t.select(); document.execCommand('copy'); aviso('Copiado.', 'ok'); }
  }
  function csvEquipe() {
    const ult = _execs.find(x => x.situacao === 'ok'); if (!ult) return;
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const linhas = [['Venda', 'O que fazer', 'A quem'].map(q).join(';')].concat(pendencias(ult, _venda).equipe.map(e => [_venda.titulo, e.texto, e.a_quem].map(q).join(';')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'pendencias-equipe-' + _venda.titulo.replace(/[^\w]+/g, '-').slice(0, 40) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // revisão jurídica registrada
  function revisaoHTML(v) {
    const feito = v.revisao_status ? `<div style="font-size:13px"><b style="color:${v.revisao_status === 'nao_aprovado' ? '#b91c1c' : v.revisao_status === 'aprovado' ? '#047857' : '#b45309'}">${esc(REV[v.revisao_status] || v.revisao_status)}</b> · ${esc(v.revisado_por || '')} em ${dt(v.revisado_em)}${v.revisao_nota ? `<div style="margin-top:4px;color:#334155;white-space:pre-wrap">${esc(v.revisao_nota)}</div>` : ''}</div>` : `<div style="font-size:13px;color:#b45309">Encaminhada ${dt(v.encaminhado_em)}${v.encaminhado_por ? ' por ' + esc(v.encaminhado_por) : ''} · aguardando revisão.</div>`;
    const form = ehJuridico() ? `<details style="margin-top:8px" ${v.revisao_status ? '' : 'open'}><summary style="cursor:pointer;font-size:13px;color:var(--pri,#0088CC)">${v.revisao_status ? 'Alterar revisão' : 'Registrar revisão'}</summary>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <select id="pa-rev-st" style="padding:7px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${Object.keys(REV).map(k => `<option value="${k}" ${v.revisao_status === k ? 'selected' : ''}>${REV[k].charAt(0).toUpperCase() + REV[k].slice(1)}</option>`).join('')}</select>
          <textarea id="pa-rev-nota" rows="3" placeholder="Parecer / orientação para a gerente" style="flex:1;min-width:240px;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${esc(v.revisao_nota || '')}</textarea>
          <button class="btn btn-p bsm" onclick="PreAnalise.revisar()">Registrar</button></div></details>` : '';
    return `<div class="card" style="margin-bottom:12px"><div class="cb"><div style="font-weight:700;margin-bottom:6px">⚖️ Revisão jurídica</div>${feito}${form}</div></div>`;
  }
  async function revisar() {
    const st = (document.getElementById('pa-rev-st') || {}).value, nota = ((document.getElementById('pa-rev-nota') || {}).value || '').trim() || null;
    if (st === 'nao_aprovado' && !nota) { aviso('Explique na nota por que não foi aprovado.', 'err'); return; }
    try { await db.patch('preanalise_venda', _venda.id, { revisao_status: st, revisao_nota: nota, revisado_por: quem(), revisado_em: new Date().toISOString(), encaminhado_juridico: true });
          aviso('Revisão registrada.', 'ok'); venda(_venda.id); }
    catch (e) { aviso('Erro: ' + e.message + ' (o SQL 2026-11-04 já rodou?)', 'err'); }
  }

  async function salvar() {
    const d = lerCampos(); if (!d.titulo) { aviso('A venda precisa de um nome.', 'err'); return; }
    try { await db.patch('preanalise_venda', _venda.id, d); aviso('Dados salvos. Rode a análise de novo para valerem.', 'ok'); venda(_venda.id); } catch (e) { aviso('Erro: ' + e.message, 'err'); }
  }
  async function excluir() {
    if (!confirm(`Excluir a venda "${_venda.titulo}", os PDFs e as análises? Não dá para desfazer.`)) return;
    try { await apagarPdfs(_docs.map(d => d.caminho)); await db.del('preanalise_venda', _venda.id); aviso('Venda excluída.', 'ok'); abrir(); } catch (e) { aviso('Erro: ' + e.message, 'err'); }
  }
  async function subir() {
    const inp = document.getElementById('pa-arq'), tipo = (document.getElementById('pa-tipo') || {}).value || 'outro', st = document.getElementById('pa-sub');
    const arqs = [...((inp && inp.files) || [])]; if (!arqs.length) { aviso('Escolha o PDF.', 'err'); return; }
    for (const f of arqs) {
      if (!/pdf$/i.test(f.type || f.name)) { aviso(`${f.name}: só PDF.`, 'err'); continue; }
      if (f.size > MAX_PDF) { aviso(`${f.name}: maior que 20 MB.`, 'err'); continue; }
      st.textContent = `Enviando ${f.name}…`;
      const caminho = `${_venda.id}/${uuid()}.pdf`;     // sem nome de pessoa no caminho
      try { await enviarPdf(caminho, f); await db.post('preanalise_documento', { venda_id: _venda.id, tipo, nome_arquivo: f.name, caminho, tamanho: f.size, enviado_por: quem() }); }
      catch (e) { aviso(`${f.name}: ${e.message}`, 'err'); }
    }
    venda(_venda.id);
  }
  async function ver(id) {
    const d = _docs.find(x => x.id === id); if (!d) return;
    const w = window.open('', '_blank');
    try { const u = await linkPdf(d.caminho); if (w) w.location = u; else window.open(u, '_blank'); } catch (e) { if (w) w.close(); aviso(e.message, 'err'); }
  }
  async function tirar(id) {
    const d = _docs.find(x => x.id === id); if (!d || !confirm(`Tirar "${d.nome_arquivo}" desta venda?`)) return;
    try { await apagarPdfs([d.caminho]); await db.del('preanalise_documento', id); venda(_venda.id); } catch (e) { aviso('Erro: ' + e.message, 'err'); }
  }
  async function encaminhar() {
    try { await db.patch('preanalise_venda', _venda.id, { encaminhado_juridico: true, encaminhado_em: new Date().toISOString(), encaminhado_por: quem() }); aviso('Encaminhada para a revisão jurídica.', 'ok'); venda(_venda.id); }
    catch (e) { aviso('Erro: ' + e.message, 'err'); }
  }

  // ── ANÁLISE: aciona a função do jurídico e acompanha pelo banco ──
  async function analisar() {
    const btn = document.getElementById('pa-analisar'), prog = document.getElementById('pa-prog');
    const sess = (typeof _authCarregarSessao === 'function') ? _authCarregarSessao() : null;
    if (!sess || !sess.access_token) { aviso('Sessão do portal não encontrada: saia e entre de novo.', 'err'); return; }
    if (typeof _authRenovarSePerto === 'function') { try { await _authRenovarSePerto(); } catch (_) {} }
    const token = ((typeof _authCarregarSessao === 'function' && _authCarregarSessao()) || sess).access_token;
    const exec = uuid(), origem = (typeof JURIDICO_ORIGIN !== 'undefined' && JURIDICO_ORIGIN) || 'https://falcaovaz.netlify.app';
    btn.disabled = true; prog.textContent = 'Enviando os documentos para a leitura…';
    try {
      await fetch(`${origem}/.netlify/functions/preanalise-background`, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ exec_id: exec, venda_id: _venda.id, token }) });
    } catch (e) { prog.textContent = 'Não consegui acionar a leitura.'; btn.disabled = false; return; }
    const t0 = Date.now();
    while (Date.now() - t0 < 12 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 4000));
      const seg = Math.round((Date.now() - t0) / 1000);
      prog.textContent = `Lendo a matrícula e as certidões… ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
      let x = null; try { [x] = await db.get('preanalise_execucao', `?id=eq.${exec}&select=situacao,erro`); } catch (_) {}
      if (!x) continue;
      if (x.situacao === 'erro') { prog.innerHTML = `<span style="color:#dc2626">${esc(x.erro || 'falhou')}</span>`; btn.disabled = false; return; }
      if (x.situacao === 'ok') { venda(_venda.id); return; }
    }
    prog.textContent = 'Está demorando mais que o normal. Recarregue a venda daqui a pouco.'; btn.disabled = false;
  }

  // ── DOSSIÊ ──
  function dossieHTML(x, v) {
    const r = x.resultado || {}, dec = r.decisao || {}, m = r.matricula || {}, cfg = x.config || {}, st = STATUS[x.status] || STATUS.incompleto;
    const ckCfg = new Map((cfg.checklist || []).map(c => [c.n, c]));
    const lista = (t, arr, cor) => arr && arr.length ? `<div style="margin-top:8px"><b style="color:${cor}">${t}</b><ul style="margin:4px 0 0;padding-left:18px">${arr.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
    const card = (t, html) => `<div class="card" style="margin-bottom:12px"><div class="cb"><div style="font-weight:700;margin-bottom:8px">${t}</div>${html}</div></div>`;
    const th = s => `<th style="padding:5px 6px;text-align:left;color:var(--muted);font-weight:600">${s}</th>`;
    const td = (s, est) => `<td style="padding:5px 6px;vertical-align:top;${est || ''}">${s}</td>`;
    const tab = (cab, linhas) => `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${cab.map(th).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
    const quote = s => s ? `<div style="margin-top:4px;padding:4px 8px;border-left:3px solid #cbd5e1;color:#475569;font-size:12px;font-style:italic">“${esc(s)}”</div>` : '';
    const idadeMat = (() => { const d = Date.parse(String(m.data_documento || '') + 'T12:00:00'); return isNaN(d) ? null : Math.floor((Date.parse(x.concluido_em || x.iniciado_em) - d) / 86400000); })();
    return `
      <div class="card" style="margin-bottom:12px;border-left:5px solid ${st.cor}"><div class="cb" style="background:${st.fundo}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-size:20px;font-weight:800;color:${st.cor}">${st.lb}</span>
          <span style="font-size:13px;color:#334155">${esc(dec.encaminhamento || '')}</span><span style="flex:1"></span><span style="font-size:12px;color:var(--muted)">análise de ${dt(x.concluido_em || x.iniciado_em)}</span></div>
        ${lista('Bloqueia', (dec.motivos || {}).bloqueia, '#b91c1c')}${lista('Incompleto', (dec.motivos || {}).incompleto, '#475569')}${lista('Ressalvas', (dec.motivos || {}).ressalva, '#b45309')}
      </div></div>
      ${(r.providencias || []).length ? card('Providências, em ordem de prioridade', `<ol style="margin:0;padding-left:20px;font-size:13px">${r.providencias.slice().sort((a, b) => a.prioridade - b.prioridade).map(p => `<li style="margin-bottom:4px">${esc(p.texto)} <small style="color:var(--muted)">· ${esc(p.a_quem)}${p.pessoa ? ' · ' + esc(p.pessoa) : ''}</small></li>`).join('')}</ol>`) : ''}
      ${card('Checklist da matrícula', tab(['#', 'Item', 'Resultado', 'O que foi lido', 'Providência'], (r.checklist || []).slice().sort((a, b) => a.item - b.item).map(c => {
          const k = ckCfg.get(c.item) || {}, rr = RES[c.resultado] || [c.resultado, '#475569'];
          return `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(c.item)}${td(`${esc(k.txt || '')}<br><small style="color:var(--muted)">${CAT[k.cat] || ''}${k.aberto ? ' · regra em aberto' : ''}</small>`)}${td(`<b style="color:${rr[1]}">${rr[0]}</b>`, 'white-space:nowrap')}
            ${td(`${esc(c.texto)}${c.ato ? ` <small style="color:var(--muted)">(${esc(c.ato)})</small>` : ''}${quote(c.trecho)}`)}${td(esc(c.providencia || ''))}</tr>`; })))}
      ${card('Imóvel e proprietários (pela matrícula)', `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;font-size:13px">
          <div><small style="color:var(--muted)">Matrícula</small><br><b>${esc(m.numero || '—')}</b> ${esc(m.cartorio || '')}</div>
          <div><small style="color:var(--muted)">Emitida em</small><br><b>${dia(m.data_documento)}</b>${idadeMat != null ? ` <small>(${idadeMat} dias)</small>` : ''}</div>
          <div><small style="color:var(--muted)">Leitura</small><br><b>${esc(m.legibilidade || '—')}</b>${m.legibilidade_nota ? `<br><small>${esc(m.legibilidade_nota)}</small>` : ''}</div>
          <div><small style="color:var(--muted)">SQL na matrícula</small><br><b>${esc(m.sql_contribuinte || '—')}</b></div>
          <div><small style="color:var(--muted)">Área</small><br><b>${esc(m.area || '—')}</b></div></div>
        ${m.descricao_imovel ? `<div style="font-size:13px;margin-top:8px">${esc(m.descricao_imovel)}</div>` : ''}
        ${(m.proprietarios_atuais || []).length ? `<div style="margin-top:10px">${tab(['Proprietário atual', 'Fração', 'Estado civil', 'Regime', 'Ato'], m.proprietarios_atuais.map(p => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(esc(p.nome))}${td(esc(p.fracao || ''))}${td(esc(p.estado_civil || ''))}${td(esc(p.regime_bens || ''))}${td(esc(p.ato || ''))}</tr>`))}</div>` : ''}`)}
      ${(r.certidoes || []).length || (dec.certidoes_faltando || []).length ? card('Certidões', `${(r.certidoes || []).length ? tab(['Certidão', 'Refere-se a', 'Emissão', 'Resultado', 'Resumo'], r.certidoes.map(c => {
          const nome = ((cfg.certidoes || []).find(z => z.id === c.orgao) || {}).txt || c.orgao;
          if (c.substituida) return `<tr style="border-top:1px solid var(--borda,#e2e8f0);color:#94a3b8">${td(esc(nome))}${td(esc(c.refere_a || ''))}${td(dia(c.data_emissao), 'white-space:nowrap')}${td('substituída')}${td('Vale a mais recente' + (c.substituida_por ? ' (' + esc(c.substituida_por) + ')' : '') + '.')}</tr>`;
          return `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(esc(nome))}${td(esc(c.refere_a || ''))}${td(`${dia(c.data_emissao)}${c.idade_dias != null ? `<br><small style="color:${c.vencida ? '#b91c1c' : 'var(--muted)'}">${c.idade_dias} dias${c.vencida ? ' · vencida' : ''}</small>` : ''}`, 'white-space:nowrap')}
            ${td(`<b style="color:${c.resultado === 'positiva' ? '#b91c1c' : c.resultado === 'ilegivel' ? '#475569' : '#047857'}">${esc(String(c.resultado).replace(/_/g, ' '))}</b>`)}${td(esc(c.resumo || '') + quote(c.trecho))}</tr>`; })) : ''}
          ${(dec.certidoes_faltando || []).length ? `<div style="margin-top:8px;font-size:13px;color:#475569"><b>Não enviadas:</b> ${dec.certidoes_faltando.map(esc).join('; ')}.</div>` : ''}`) : ''}
      ${(m.atos || []).length ? `<details class="card" style="margin-bottom:12px"><summary class="cb" style="cursor:pointer;font-weight:700">Matrícula ato a ato (${m.atos.length})</summary><div class="cb" style="padding-top:0">
        ${tab(['Ato', 'Data', 'Natureza', 'Resumo', 'Situação'], m.atos.map(a => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(esc(a.ato), 'white-space:nowrap;font-weight:600')}${td(dia(a.data), 'white-space:nowrap')}${td(esc(a.natureza))}${td(esc(a.resumo))}
          ${td(a.cancelado_por ? `cancelado (${esc(a.cancelado_por)})` : a.ativo === true ? '<b>ativo</b>' : a.ativo === false ? 'sem efeito' : '—', 'white-space:nowrap')}</tr>`))}</div></details>` : ''}
      ${(r.observacoes || []).length || (r.limites || []).length ? `<div style="font-size:12px;color:var(--muted);line-height:1.5">${(r.observacoes || []).map(o => `<div>• ${esc(o)}</div>`).join('')}${(r.limites || []).map(o => `<div>• ${esc(o)}</div>`).join('')}
        <div style="margin-top:4px">Leitura por ${esc(x.modelo || '')}, regras versão ${esc(cfg.versao || '')} (validade ${cfg.validade_dias || 30} dias)${x.custo_usd != null ? ` · custo US$ ${Number(x.custo_usd).toFixed(2)}` : ''}.</div></div>` : ''}`;
  }
  // parecer (impressão e PDF): cabeçalho com status, conferência da leitura e revisão jurídica + dossiê
  function parecerHTML() {
    const ult = _execs.find(x => x.situacao === 'ok'), v = _venda; if (!ult) return '';
    const conf = v.leitura_conferida_exec === ult.id;
    return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;font-size:12px;--muted:#64748b;--borda:#e2e8f0">
      <h2 style="margin:0 0 2px;font-size:18px">Pré-análise de matrícula e certidões</h2>
      <div style="color:#64748b;margin-bottom:10px">${esc(v.titulo)}${v.matricula ? ' · matrícula ' + esc(v.matricula) : ''}${v.cartorio ? ' · ' + esc(v.cartorio) : ''} · Imobiliária Nova São Paulo · documento interno, contém dados pessoais · gerado em ${dt(new Date().toISOString())}</div>
      <div style="margin-bottom:10px;font-size:12px;line-height:1.5">
        <div><b>Leitura da matrícula:</b> ${conf ? `conferida por ${esc(v.leitura_conferida_por || '')} em ${dt(v.leitura_conferida_em)}${v.leitura_nota ? ' — correções: ' + esc(v.leitura_nota) : ''}` : '<b style="color:#b45309">AINDA NÃO CONFERIDA</b>'}</div>
        ${v.revisao_status ? `<div><b>Revisão jurídica:</b> ${esc(REV[v.revisao_status])} — ${esc(v.revisado_por || '')} em ${dt(v.revisado_em)}${v.revisao_nota ? ': ' + esc(v.revisao_nota) : ''}</div>` : v.encaminhado_juridico ? '<div><b>Revisão jurídica:</b> encaminhada, aguardando.</div>' : ''}
      </div>
      ${dossieHTML(ult, v).replace(/<details/g, '<details open')}</div>`;
  }
  function imprimir() {
    if (!_execs.some(x => x.situacao === 'ok')) return;
    const w = window.open('', '_blank'); if (!w) { aviso('O navegador bloqueou a janela de impressão.', 'err'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pré-análise — ${esc(_venda.titulo)}</title>
      <style>body{margin:24px}.card{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;break-inside:avoid}.cb{padding:12px 14px}
      details{display:block}details>summary{list-style:none}table{width:100%}</style></head><body>${parecerHTML()}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  }
  let _h2p = null;
  function carregarHtml2pdf() {
    if (window.html2pdf) return Promise.resolve();
    return _h2p || (_h2p = new Promise((ok, err) => { const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; sc.onload = ok; sc.onerror = () => { _h2p = null; err(new Error('não consegui carregar o gerador de PDF')); }; document.head.appendChild(sc); }));
  }
  async function baixarPdf() {
    if (!_execs.some(x => x.situacao === 'ok')) return;
    aviso('Gerando o PDF…');
    try {
      await carregarHtml2pdf();
      const el = document.createElement('div'); el.style.cssText = 'width:690px;padding:0;background:#fff';   // A4 menos as margens (190 mm ≈ 718 px)
      el.innerHTML = `<style>.pa-pdf .card{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;page-break-inside:avoid;max-width:100%}.pa-pdf .cb{padding:10px 12px}.pa-pdf details>summary{list-style:none}
        .pa-pdf table{width:100%;table-layout:auto}.pa-pdf td,.pa-pdf th{white-space:normal !important;word-break:break-word;font-size:11px}.pa-pdf tr{page-break-inside:avoid}.pa-pdf div[style*="overflow"]{overflow:visible !important}</style><div class="pa-pdf">${parecerHTML()}</div>`;
      const nome = 'pre-analise-' + _venda.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).toLowerCase() + '.pdf';
      await window.html2pdf().set({ margin: [10, 10, 12, 10], filename: nome, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.card'] } }).from(el).save();
    } catch (e) { aviso('Erro no PDF: ' + e.message + '. Use "Imprimir" → Salvar como PDF.', 'err'); }
  }

  window.PreAnalise = { abrir, filtrar, semana, nova, criar, venda, salvar, excluir, subir, ver, tirar, analisar, encaminhar, imprimir, baixarPdf,
    calcEscritura, addPrazo, tirarPrazo, salvarPrazos, confirmarLeitura, refazerMsgs, copiar, csvEquipe, revisar };
})();

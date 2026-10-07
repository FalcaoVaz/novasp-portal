/* =====================================================================
   23-preanalise.js — PRÉ-ANÁLISE DE MATRÍCULA E CERTIDÕES (piloto da Renata, Gestão de Vendas Moema)
   ---------------------------------------------------------------------
   Lista de vendas → venda (dados da proposta + PDFs) → "Analisar" → dossiê com status, checklist, certidões,
   providências e ato a ato da matrícula. Encaminhamento: Liberado segue com a gerente; o resto vai ao jurídico.
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

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') + ' ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dia = s => { if (!s) return '—'; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s); };
  const aviso = (m, t) => (typeof toast === 'function' ? toast(m, t || '') : alert(m));
  const badge = st => { const s = STATUS[st]; return s ? `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;color:${s.cor};background:${s.fundo};border:1px solid ${s.cor}33">${s.lb}</span>` : '<span style="color:#94a3b8;font-size:12px">sem análise</span>'; };
  const raiz = () => document.getElementById('preanalise-root');
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const quem = () => (typeof CUR !== 'undefined' && CUR) ? (CUR.email || CUR.nome || null) : null;

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

  // ── LISTA ──
  async function abrir() {
    const el = raiz(); if (!el) return;
    if (typeof ehParticipantePiloto === 'function' && !ehParticipantePiloto()) { el.innerHTML = '<div class="card"><div class="cb">Acesso só para os participantes do piloto.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Carregando vendas…</div></div>';
    let vendas = [];
    try { vendas = await db.get('preanalise_venda', '?select=*&order=criado_em.desc'); }
    catch (e) { el.innerHTML = `<div class="card"><div class="cb" style="color:#dc2626">Erro ao ler: ${esc(e.message)}<br><small>A tabela já foi criada? (sql/2026-10-07-preanalise.sql)</small></div></div>`; return; }
    const cont = s => vendas.filter(v => v.status === s).length;
    el.innerHTML = `
      <div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div style="font-size:13px;color:var(--muted)">${vendas.length} venda(s) · ${Object.keys(STATUS).map(s => `${STATUS[s].lb}: ${cont(s)}`).join(' · ')}</div>
        <button class="btn btn-p" onclick="PreAnalise.nova()">+ Nova venda</button>
      </div></div>
      <div id="pa-nova"></div>
      ${vendas.length ? `<div class="card"><div class="tw tbl"><table><thead><tr><th>Venda</th><th>Matrícula</th><th>Status</th><th>Última análise</th><th>Jurídico</th></tr></thead><tbody>
        ${vendas.map(v => `<tr style="cursor:pointer" onclick="PreAnalise.venda('${v.id}')"><td style="font-weight:600">${esc(v.titulo)}</td><td>${esc(v.matricula || '—')}${v.cartorio ? `<br><small style="color:var(--muted)">${esc(v.cartorio)}</small>` : ''}</td>
          <td>${badge(v.status)}</td><td style="font-size:12px">${dt(v.ultima_analise)}</td><td style="font-size:12px">${v.encaminhado_juridico ? '✓ encaminhada ' + dia(String(v.encaminhado_em || '').slice(0, 10)) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>` : '<div class="card"><div class="cb" style="color:var(--muted)">Nenhuma venda ainda. Clique em "Nova venda" e suba a matrícula.</div></div>'}
      ${notaPiloto()}`;
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
  let _venda = null, _docs = [], _execs = [];
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
    el.innerHTML = `
      <div style="margin-bottom:10px"><a href="#" onclick="event.preventDefault();PreAnalise.abrir()" style="color:var(--pri,#0088CC);font-size:13px">← todas as vendas</a></div>
      <div class="card" style="margin-bottom:12px"><div class="cb">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div><div style="font-size:17px;font-weight:700">${esc(v.titulo)}</div><div style="font-size:12px;color:var(--muted)">Aberta ${dt(v.criado_em)}${v.criado_por ? ' por ' + esc(v.criado_por) : ''}</div></div>
          <div>${badge(v.status)}</div>
        </div>
        <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--pri,#0088CC);font-size:13px">Dados da proposta</summary>
          <div style="margin-top:10px">${campos(v)}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-o bsm" onclick="PreAnalise.salvar()">Salvar dados</button>
          <button class="btn btn-o bsm" style="color:#dc2626" onclick="PreAnalise.excluir()">Excluir venda e PDFs</button></div></div></details>
      </div></div>
      <div class="card" style="margin-bottom:12px"><div class="cb">
        <div style="font-weight:700;margin-bottom:8px">Documentos (PDF)</div>
        ${_docs.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${_docs.map(d => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">
          <td style="padding:5px 6px;white-space:nowrap">${TIPOS[d.tipo] || d.tipo}</td><td style="padding:5px 6px">${esc(d.nome_arquivo)}</td>
          <td style="padding:5px 6px;color:var(--muted);white-space:nowrap">${d.tamanho ? Math.round(d.tamanho / 1024) + ' KB' : ''}</td><td style="padding:5px 6px;color:var(--muted);white-space:nowrap">${dt(d.enviado_em)}</td>
          <td style="padding:5px 6px;text-align:right;white-space:nowrap"><button class="btn btn-o bsm" onclick="PreAnalise.ver('${d.id}')">Ver</button> <button class="btn btn-o bsm" onclick="PreAnalise.tirar('${d.id}')">✕</button></td></tr>`).join('')}</tbody></table>`
          : '<div style="font-size:13px;color:var(--muted)">Nenhum PDF ainda.</div>'}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="pa-tipo" style="padding:7px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k]}</option>`).join('')}</select>
          <input type="file" id="pa-arq" accept="application/pdf,.pdf" multiple style="font-size:13px">
          <button class="btn btn-o" onclick="PreAnalise.subir()">Subir</button>
          <span id="pa-sub" style="font-size:12px;color:var(--muted)"></span>
        </div>
      </div></div>
      <div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-p" id="pa-analisar" onclick="PreAnalise.analisar()" ${_docs.some(d => d.tipo === 'matricula') ? '' : 'disabled title="Suba a matrícula primeiro"'}>🔎 Analisar</button>
        <span id="pa-prog" style="font-size:13px;color:var(--muted)">${_docs.some(d => d.tipo === 'matricula') ? 'A leitura leva de 1 a 4 minutos.' : 'Suba a matrícula para analisar.'}</span>
        ${ult && v.status !== 'liberado' ? `<span style="flex:1"></span>${v.encaminhado_juridico ? `<span style="font-size:13px;color:#047857">✓ Encaminhada ao jurídico ${dt(v.encaminhado_em)}${v.encaminhado_por ? ' por ' + esc(v.encaminhado_por) : ''}</span>` : `<button class="btn btn-o" onclick="PreAnalise.encaminhar()">Encaminhar para revisão jurídica</button>`}` : ''}
        ${ult ? `<button class="btn btn-o" onclick="PreAnalise.imprimir()">🖨️ Imprimir dossiê</button>` : ''}
      </div></div>
      ${_execs[0] && _execs[0].situacao === 'erro' ? `<div class="card" style="margin-bottom:12px"><div class="cb" style="color:#dc2626;font-size:13px">A última análise falhou (${dt(_execs[0].iniciado_em)}): ${esc(_execs[0].erro)}</div></div>` : ''}
      <div id="pa-dossie">${ult ? dossieHTML(ult, v) : ''}</div>
      ${_execs.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--muted);font-size:13px">Histórico de análises (${_execs.length})</summary>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px"><tbody>${_execs.map(x => `<tr style="border-top:1px solid var(--borda,#e2e8f0)"><td style="padding:4px 6px">${dt(x.iniciado_em)}</td><td style="padding:4px 6px">${x.situacao === 'ok' ? badge(x.status) : esc(x.situacao)}</td><td style="padding:4px 6px">${esc(x.pedido_por || '')}</td><td style="padding:4px 6px;color:var(--muted)">${x.custo_usd != null ? 'US$ ' + Number(x.custo_usd).toFixed(2) : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${notaPiloto()}`;
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
      ${(r.providencias || []).length ? card('Providências, em ordem de prioridade', `<ol style="margin:0;padding-left:20px;font-size:13px">${r.providencias.slice().sort((a, b) => a.prioridade - b.prioridade).map(p => `<li style="margin-bottom:4px">${esc(p.texto)} <small style="color:var(--muted)">· ${esc(p.a_quem)}</small></li>`).join('')}</ol>`) : ''}
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
          return `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(esc(nome))}${td(esc(c.refere_a || ''))}${td(`${dia(c.data_emissao)}${c.idade_dias != null ? `<br><small style="color:${c.vencida ? '#b91c1c' : 'var(--muted)'}">${c.idade_dias} dias${c.vencida ? ' · vencida' : ''}</small>` : ''}`, 'white-space:nowrap')}
            ${td(`<b style="color:${c.resultado === 'positiva' ? '#b91c1c' : c.resultado === 'ilegivel' ? '#475569' : '#047857'}">${esc(String(c.resultado).replace(/_/g, ' '))}</b>`)}${td(esc(c.resumo || '') + quote(c.trecho))}</tr>`; })) : ''}
          ${(dec.certidoes_faltando || []).length ? `<div style="margin-top:8px;font-size:13px;color:#475569"><b>Não enviadas:</b> ${dec.certidoes_faltando.map(esc).join('; ')}.</div>` : ''}`) : ''}
      ${(m.atos || []).length ? `<details class="card" style="margin-bottom:12px"><summary class="cb" style="cursor:pointer;font-weight:700">Matrícula ato a ato (${m.atos.length})</summary><div class="cb" style="padding-top:0">
        ${tab(['Ato', 'Data', 'Natureza', 'Resumo', 'Situação'], m.atos.map(a => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">${td(esc(a.ato), 'white-space:nowrap;font-weight:600')}${td(dia(a.data), 'white-space:nowrap')}${td(esc(a.natureza))}${td(esc(a.resumo))}
          ${td(a.cancelado_por ? `cancelado (${esc(a.cancelado_por)})` : a.ativo === true ? '<b>ativo</b>' : a.ativo === false ? 'sem efeito' : '—', 'white-space:nowrap')}</tr>`))}</div></details>` : ''}
      ${(r.observacoes || []).length || (r.limites || []).length ? `<div style="font-size:12px;color:var(--muted);line-height:1.5">${(r.observacoes || []).map(o => `<div>• ${esc(o)}</div>`).join('')}${(r.limites || []).map(o => `<div>• ${esc(o)}</div>`).join('')}
        <div style="margin-top:4px">Leitura por ${esc(x.modelo || '')}, regras versão ${esc(cfg.versao || '')} (validade ${cfg.validade_dias || 30} dias)${x.custo_usd != null ? ` · custo US$ ${Number(x.custo_usd).toFixed(2)}` : ''}.</div></div>` : ''}`;
  }
  function imprimir() {
    const ult = _execs.find(x => x.situacao === 'ok'); if (!ult) return;
    const w = window.open('', '_blank'); if (!w) { aviso('O navegador bloqueou a janela de impressão.', 'err'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pré-análise — ${esc(_venda.titulo)}</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;margin:24px;font-size:13px}.card{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;break-inside:avoid}.cb{padding:12px 14px}
      details{display:block}details>summary{list-style:none}table{width:100%}:root{--muted:#64748b;--borda:#e2e8f0}</style></head><body>
      <h2 style="margin:0 0 4px">Pré-análise de matrícula e certidões</h2><div style="color:#64748b;margin-bottom:14px">${esc(_venda.titulo)} · Imobiliária Nova São Paulo · documento interno, contém dados pessoais</div>
      ${dossieHTML(ult, _venda).replace(/<details/g, '<details open')}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  }

  window.PreAnalise = { abrir, nova, criar, venda, salvar, excluir, subir, ver, tirar, analisar, encaminhar, imprimir };
})();

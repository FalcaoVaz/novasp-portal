/* =====================================================================
   18-vendas-planilhas.js — Gestão de Vendas · Planilha Mensal por EQUIPE
   ---------------------------------------------------------------------
   Lê o "MODELO - Preenchimento Mensal por EQUIPE - OFICIAL.xlsx" e manda
   cada aba para o seu sub-módulo (6). Grava no Supabase (SQL
   portal/sql/2026-09-29-vendas-planilhas.sql) e mostra em cada sub-módulo
   a data em que a planilha foi inserida no sistema.

   Origem: rascunho do Anderson (29/09/2026), adaptado ao portal real:
     • db.get(t,'?query') / db.post(t,obj|array) (Prefer: return=representation)
       / db.del(t,id) — adapter do 00-config.js.
     • Páginas p-vp-<key> no index.html; goTo('vp-<key>') chama abrirPagina.
     • importado_por = CUR.id (usuarios.id) + importado_por_nome = CUR.nome.
     • Importar/excluir só para podeImportarPlanilhaVendas() (02-manutencao.js).
     • Visual com as classes do portal (.ph/.pt/.card/.sg/.sc/.btn/.mo).
     • SheetJS já vem carregado no index.html; cdnjs só como reserva.
   ===================================================================== */
(function () {
  'use strict';

  const api = {
    get:  (t, q)  => db.get(t, '?' + q),
    post: (t, b)  => db.post(t, b),
    del:  (t, id) => db.del(t, id),
  };
  const SHEETJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const T_IMP = 'vendas_planilhas_importacoes';
  const T_LIN = 'vendas_planilhas_linhas';

  /* ---------- Sub-módulos: nome no portal <-> aba do Excel ------------ */
  // tipo: 'cota' (Referência | Corretor | Tipo de Anúncio)
  //       'capt' (Corretor | Equipe | Captação | Placas)
  //       'vend' (Corretor | Equipe | Referência)
  const SUBMODULOS = [
    { key: 'cota_anuncios_apto', tipo: 'cota', aba: 'COTA ANUNCIOS - APARTAMENTOS', icon: 'building',
      nome: 'Cota de Anúncios – APARTAMENTOS',
      desc: 'Super Destaque + Destaque Comum por corretor (mensal)', historico: 'vnd-cotas' },
    { key: 'cota_extra_apto', tipo: 'cota', aba: 'COTA EXTRA - APARTAMENTOS', extra: true, icon: 'star',
      nome: 'Cota Extra – APARTAMENTOS',
      desc: 'Cota extra para corretores que atingiram a meta de 05 captações no mês' },
    { key: 'cota_anuncios_casas', tipo: 'cota', aba: 'COTA ANUNCIOS - CASAS', icon: 'home',
      nome: 'Cota de Anúncios – CASAS E COMERCIAIS',
      desc: 'Super Destaque + Destaque Comum por corretor (mensal)' },
    { key: 'cota_extra_casas', tipo: 'cota', aba: 'COTA EXTRA - CASAS', extra: true, icon: 'star',
      nome: 'Cota Extra – CASAS E COMERCIAIS',
      desc: 'Cota extra para corretores que atingiram a meta de 05 captações no mês' },
    { key: 'captacao_placas', tipo: 'capt', aba: 'CAPTACAO E PLACAS', icon: 'placa',
      nome: 'Captação e Placas Mensal',
      desc: 'Captações ativas e placas por corretor no mês', historico: 'vnd-captacao' },
    { key: 'vendidos_selecao', tipo: 'vend', aba: 'VENDIDOS SELECAO', icon: 'vendido',
      nome: 'Vendidos Seleção',
      desc: 'Imóveis da Seleção de Imóveis vendidos no mês' },
  ];
  const META_CAPTACAO = 5;
  // Referência: basta conter numeração; letras opcionais (BI25354, 25354, AP100B).
  // Sem número ou com caractere especial BLOQUEIA a gravação (correção Anderson 30/09/2026).
  const REF_OK = /^[A-Z0-9]*\d[A-Z0-9]*$/;
  const refProblema = ref => !/\d/.test(ref) ? 'sem numeração'
    : !REF_OK.test(ref) ? 'com caractere especial (use só letras e números)' : null;

  /* ---------- Utilitários -------------------------------------------- */
  const norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const txt = v => (v == null ? '' : String(v).trim());
  const int = v => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; };
  const esc = s => txt(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtMes = ym => { const [y, m] = ym.split('-'); return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m - 1] + '/' + y; };
  const mesAtual = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const ico = (name, size) => (typeof icon === 'function' ? icon(name, size || 18) : '');
  const podeImportar = () => (typeof podeImportarPlanilhaVendas === 'function' ? podeImportarPlanilhaVendas() : false);
  const aviso = (msg, tipo) => { if (typeof toast === 'function') toast(msg, tipo || ''); else alert(msg); };

  function carregarSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = SHEETJS_CDN; s.onload = () => ok(window.XLSX);
      s.onerror = () => erro(new Error('Não foi possível carregar o leitor de Excel.'));
      document.head.appendChild(s);
    });
  }

  /* ---------- Leitura da planilha (função pura, testável) ------------- */
  // Recebe um workbook do SheetJS e devolve { linhas[], limites{}, avisos[], abasFaltando[] }
  function parseWorkbook(wb, XLSX) {
    const porNome = {};
    wb.SheetNames.forEach(n => { porNome[norm(n)] = n; });
    // avisos = conferir, mas pode gravar · bloqueios = impede gravar
    const out = { linhas: [], limites: {}, avisos: [], bloqueios: [], abasFaltando: [] };

    SUBMODULOS.forEach(sm => {
      const nomeReal = porNome[sm.aba];
      if (!nomeReal) { out.abasFaltando.push(sm.aba); return; }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeReal], { header: 1, defval: '' });

      // Limite da cota vem do próprio texto da aba (ex.: "50 Super Destaque | 100 Destaques")
      if (sm.tipo === 'cota') {
        const obs = rows.flat().map(txt).find(t => /quantia das cotas/i.test(t)) || '';
        const m = obs.match(/(\d+)\s*super\s*destaque[^\d]*(\d+)\s*destaque/i);
        if (m) out.limites[sm.key] = { super: +m[1], destaque: +m[2], fonte: obs.replace(/\s+/g, ' ') };
      }

      rows.slice(2).forEach((r, i) => {           // linha 1 = título, linha 2 = cabeçalho
        const linhaExcel = i + 3;
        if (sm.tipo === 'cota') {
          const refBruta = txt(r[0]), corretor = txt(r[1]), tipo = norm(r[2]);
          if (!refBruta && !corretor) return;     // linha do modelo não preenchida
          const ref = refBruta.toUpperCase().replace(/\s+/g, '');
          if (ref && refProblema(ref)) out.bloqueios.push(`${sm.aba}, linha ${linhaExcel}: referência "${refBruta}" ${refProblema(ref)} (ex.: BI25354 ou 25354).`);
          if (!ref) out.avisos.push(`${sm.aba}, linha ${linhaExcel}: corretor sem referência.`);
          if (!corretor) out.avisos.push(`${sm.aba}, linha ${linhaExcel}: referência ${ref} sem corretor.`);
          out.linhas.push({ submodulo: sm.key, linha_excel: linhaExcel, referencia: ref || null, corretor: corretor || null,
            tipo_anuncio: tipo.startsWith('SUPER') ? 'SUPER DESTAQUE' : (tipo ? 'DESTAQUE' : null) });
        } else if (sm.tipo === 'capt') {
          const corretor = txt(r[0]);
          if (!corretor) return;
          out.linhas.push({ submodulo: sm.key, linha_excel: linhaExcel, corretor, equipe: txt(r[1]) || null,
            captacoes: int(r[2]), placas: int(r[3]) });
        } else {
          const corretor = txt(r[0]), refBruta = txt(r[2]);
          if (!corretor && !refBruta) return;
          const ref = refBruta.toUpperCase().replace(/\s+/g, '');
          if (ref && refProblema(ref)) out.bloqueios.push(`${sm.aba}, linha ${linhaExcel}: referência "${refBruta}" ${refProblema(ref)}.`);
          out.linhas.push({ submodulo: sm.key, linha_excel: linhaExcel, corretor: corretor || null, equipe: txt(r[1]) || null, referencia: ref || null });
        }
      });
    });

    // Cruzamento: cota extra só para quem tem >= 5 captações na aba CAPTAÇÃO E PLACAS
    const capt = {};
    out.linhas.filter(l => l.submodulo === 'captacao_placas').forEach(l => { capt[norm(l.corretor)] = l.captacoes; });
    const temCapt = Object.keys(capt).length > 0;
    const jaAvisado = new Set();
    out.linhas.filter(l => /cota_extra/.test(l.submodulo) && l.corretor).forEach(l => {
      const k = norm(l.corretor); if (jaAvisado.has(k)) return;
      const c = capt[k];
      if (temCapt && (c == null || c < META_CAPTACAO)) {
        jaAvisado.add(k);
        out.avisos.push(`Cota Extra: ${l.corretor} tem ${c == null ? 'nenhuma captação lançada' : c + ' captações'} (meta ${META_CAPTACAO}).`);
      }
    });
    // Limite de cota estourado
    Object.entries(out.limites).forEach(([k, lim]) => {
      const ls = out.linhas.filter(l => l.submodulo === k);
      const s = ls.filter(l => l.tipo_anuncio === 'SUPER DESTAQUE').length, d = ls.filter(l => l.tipo_anuncio === 'DESTAQUE').length;
      const nome = SUBMODULOS.find(x => x.key === k).nome;
      if (s > lim.super) out.avisos.push(`${nome}: ${s} Super Destaques lançados, limite ${lim.super}.`);
      if (d > lim.destaque) out.avisos.push(`${nome}: ${d} Destaques lançados, limite ${lim.destaque}.`);
    });
    return out;
  }

  /* ---------- Banco --------------------------------------------------- */
  async function salvarImportacao(mesRef, arquivoNome, parsed) {
    const contagem = {};
    SUBMODULOS.forEach(s => { contagem[s.key] = parsed.linhas.filter(l => l.submodulo === s.key).length; });
    const cur = (typeof CUR !== 'undefined' && CUR) ? CUR : null;
    const [imp] = await api.post(T_IMP, {
      mes_ref: mesRef + '-01', arquivo_nome: arquivoNome,
      importado_por: cur ? cur.id : null, importado_por_nome: cur ? (cur.nome || null) : null,
      limites: parsed.limites, contagem, avisos: parsed.avisos,
    });
    if (parsed.linhas.length) await api.post(T_LIN, parsed.linhas.map(l => ({ ...l, importacao_id: imp.id, mes_ref: mesRef + '-01' })));
    return imp;
  }
  // Última importação do mês = a que vale (histórico fica guardado)
  async function ultimaImportacao(mesRef) {
    const r = await api.get(T_IMP, `select=*&mes_ref=eq.${mesRef}-01&order=importado_em.desc&limit=1`);
    return r && r[0];
  }
  const linhasDe = (impId, key) =>
    api.get(T_LIN, `select=*&importacao_id=eq.${impId}&submodulo=eq.${key}&order=linha_excel.asc`);

  /* ---------- UI: página de um sub-módulo ----------------------------- */
  function abrirPagina(key) {
    const el = document.getElementById('vp-root-' + key);
    if (!el) return;
    render(key, el);
  }

  async function render(key, el, mesRef) {
    const sm = SUBMODULOS.find(s => s.key === key);
    if (!sm) return;
    mesRef = mesRef || el.dataset.vpMes || mesAtual();
    el.dataset.vpMes = mesRef;
    const pode = podeImportar();
    el.innerHTML = `
      <div class="ph">
        <div class="flex aic" style="gap:12px">
          <div class="pci" style="width:42px;height:42px">${ico(sm.icon, 24)}</div>
          <div><h1 class="pt">${esc(sm.nome)}</h1><div class="pst">${esc(sm.desc)} · aba "${esc(sm.aba)}" do Excel</div></div>
        </div>
        <div class="flex" style="gap:6px;flex-wrap:wrap;align-items:center">
          <label style="font-size:13px;color:var(--muted)">Mês de referência
            <input type="month" class="vp-mes" value="${mesRef}" style="margin-left:6px;padding:7px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
          </label>
          ${pode ? `<button class="btn btn-p vp-importar">📤 Importar planilha do mês</button>` : ''}
        </div>
      </div>
      <div class="card vp-carimbo" style="padding:10px 14px;margin-bottom:14px;font-size:13px;border-left:4px solid var(--pri,#0088CC)">Carregando…</div>
      <div class="vp-corpo"></div>`;
    el.querySelector('.vp-mes').onchange = e => render(key, el, e.target.value);
    const btn = el.querySelector('.vp-importar');
    if (btn) btn.onclick = () => abrirImportacao(el.querySelector('.vp-mes').value, () => render(key, el));

    let imp;
    try { imp = await ultimaImportacao(mesRef); }
    catch (e) { el.querySelector('.vp-carimbo').innerHTML = `<span style="color:#dc2626">Erro ao ler dados: ${esc(e.message)}</span><br><small>A tabela já foi criada no Supabase? (sql/2026-09-29-vendas-planilhas.sql)</small>`; return; }

    const carimbo = el.querySelector('.vp-carimbo');
    const linkHist = sm.historico ? ` · <a href="#" onclick="event.preventDefault();goTo('${sm.historico}')" style="color:var(--pri,#0088CC)">ver histórico (tabela antiga)</a>` : '';
    if (!imp) {
      carimbo.style.color = 'var(--muted)';
      carimbo.innerHTML = `Nenhuma planilha inserida para <strong>${fmtMes(mesRef)}</strong>.${pode ? ' Use "Importar planilha do mês".' : ''}${linkHist}`;
      el.querySelector('.vp-corpo').innerHTML = '';
      return;
    }
    // >>> Data em que o Excel foi inserido no sistema (pedido do módulo)
    carimbo.innerHTML = `Planilha inserida no sistema em <strong>${fmtData(imp.importado_em)}</strong>` +
      (imp.importado_por_nome ? ` por ${esc(imp.importado_por_nome)}` : '') +
      ` · arquivo <em>${esc(imp.arquivo_nome)}</em> · referência ${fmtMes(mesRef)}` + linkHist +
      (pode ? ` · <a href="#" class="vp-excluir" style="color:#dc2626">excluir esta importação</a>` : '');
    const ex = carimbo.querySelector('.vp-excluir');
    if (ex) ex.onclick = async e => {
      e.preventDefault();
      if (!confirm(`Excluir a importação de ${fmtMes(mesRef)} (${imp.arquivo_nome})?\nTodas as 6 abas dessa importação saem do sistema. Se houver uma importação anterior do mesmo mês, ela volta a valer.`)) return;
      try { await api.del(T_IMP, imp.id); aviso('Importação excluída.', 'ok'); render(key, el, mesRef); }
      catch (err) { aviso('Erro ao excluir: ' + (err.message || err), 'err'); }
    };

    let linhas;
    try { linhas = await linhasDe(imp.id, key); }
    catch (e) { el.querySelector('.vp-corpo').innerHTML = `<div class="card cb" style="color:#dc2626">Erro ao ler linhas: ${esc(e.message)}</div>`; return; }
    el.querySelector('.vp-corpo').innerHTML = corpoHTML(sm, linhas || [], imp);
  }

  function kpi(rot, v, max, cor) {
    const over = max != null && v > max;
    return `<div class="sc"><div class="sa" style="background:${over ? '#dc2626' : (cor || '#3b82f6')}"></div><div class="sl">${rot}</div><div class="sv" style="${over ? 'color:#dc2626' : ''}">${v}${max != null ? `<span style="font-size:14px;color:var(--muted);font-weight:500"> / ${max}</span>` : ''}</div></div>`;
  }
  function tabela(cab, linhas, fn) {
    return `<div class="card"><div class="tw tbl"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map(fn).join('')}</tbody></table></div></div>`;
  }
  const nota = t => `<div style="font-size:12px;color:var(--muted);margin:6px 0 12px">${t}</div>`;
  const h3 = t => `<div style="font-weight:700;font-size:14px;margin:16px 0 8px">${t}</div>`;

  function corpoHTML(sm, linhas, imp) {
    if (!linhas.length) return `<div class="card cb" style="color:var(--muted)">A aba "${esc(sm.aba)}" veio vazia nesta planilha.</div>`;

    if (sm.tipo === 'cota') {
      const lim = (imp.limites || {})[sm.key];
      const s = linhas.filter(l => l.tipo_anuncio === 'SUPER DESTAQUE').length;
      const d = linhas.filter(l => l.tipo_anuncio === 'DESTAQUE').length;
      const porCor = {};
      linhas.forEach(l => { const c = l.corretor || '(sem corretor)'; porCor[c] = porCor[c] || { s: 0, d: 0 }; l.tipo_anuncio === 'SUPER DESTAQUE' ? porCor[c].s++ : porCor[c].d++; });
      const resumo = Object.entries(porCor).sort((a, b) => (b[1].s + b[1].d) - (a[1].s + a[1].d));
      return `<div class="sg" style="grid-template-columns:repeat(3,1fr)">${kpi('Super Destaque', s, lim && lim.super, '#3b82f6')}${kpi('Destaque', d, lim && lim.destaque, '#10b981')}${kpi('Corretores', resumo.length, null, '#8b5cf6')}</div>
        ${lim ? nota(`Limite lido da própria planilha: "${esc(lim.fonte)}"`) : nota('A planilha não trouxe o texto "Quantia das Cotas" — sem limite para comparar.')}
        ${sm.extra ? nota(`Critério: mínimo de ${META_CAPTACAO} captações ativas no mês (não contam recaptações/recadastros nem captações fora da área).`) : ''}
        ${h3('Por corretor')}
        ${tabela(['Corretor', 'Super Destaque', 'Destaque', 'Total'], resumo, ([c, v]) => `<tr><td style="font-weight:600">${esc(c)}</td><td style="text-align:center">${v.s}</td><td style="text-align:center">${v.d}</td><td style="text-align:center;font-weight:700">${v.s + v.d}</td></tr>`)}
        ${h3('Anúncios lançados')}
        ${tabela(['Referência', 'Corretor', 'Tipo de Anúncio'], linhas, l => `<tr><td style="font-family:monospace">${esc(l.referencia) || '<span style="color:#dc2626">—</span>'}</td><td>${esc(l.corretor)}</td><td>${esc(l.tipo_anuncio)}</td></tr>`)}`;
    }
    if (sm.tipo === 'capt') {
      const tc = linhas.reduce((a, l) => a + (l.captacoes || 0), 0), tp = linhas.reduce((a, l) => a + (l.placas || 0), 0);
      const bateu = linhas.filter(l => (l.captacoes || 0) >= META_CAPTACAO).length;
      linhas = linhas.slice().sort((a, b) => (b.captacoes || 0) - (a.captacoes || 0));
      return `<div class="sg" style="grid-template-columns:repeat(3,1fr)">${kpi('Captações', tc, null, '#3b82f6')}${kpi('Placas', tp, null, '#10b981')}${kpi(`Bateram a meta de ${META_CAPTACAO}`, bateu, null, '#f59e0b')}</div>
        ${nota('Somente captações ativas; recadastramento não conta.')}
        ${tabela(['Corretor', 'Equipe', 'Captação Mês', 'Placas Mês', 'Meta 05'], linhas, l => `<tr><td style="font-weight:600">${esc(l.corretor)}</td><td>${esc(l.equipe)}</td><td style="text-align:center;font-weight:700">${l.captacoes || 0}</td><td style="text-align:center">${l.placas || 0}</td><td>${(l.captacoes || 0) >= META_CAPTACAO ? '<span style="color:#047857;font-weight:600">✔ atingiu</span>' : '<span style="color:var(--muted)">—</span>'}</td></tr>`)}`;
    }
    return `<div class="sg" style="grid-template-columns:repeat(2,1fr)">${kpi('Imóveis vendidos', linhas.length, null, '#3b82f6')}${kpi('Corretores', new Set(linhas.map(l => norm(l.corretor))).size, null, '#8b5cf6')}</div>
      ${tabela(['Corretor', 'Equipe', 'Referência do Imóvel'], linhas, l => `<tr><td style="font-weight:600">${esc(l.corretor)}</td><td>${esc(l.equipe)}</td><td style="font-family:monospace">${esc(l.referencia)}</td></tr>`)}`;
  }

  /* ---------- UI: importação (pré-visualiza antes de gravar) ---------- */
  function abrirImportacao(mesRef, aoConcluir) {
    if (!podeImportar()) { aviso('Você não tem permissão para importar a planilha mensal.', 'err'); return; }
    const old = document.getElementById('m-vp-import'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.className = 'mo open'; ov.id = 'm-vp-import';
    ov.innerHTML = `<div class="modal" style="width:720px;max-width:96vw">
      <div class="mh"><div class="mt">📤 Importar planilha mensal por equipe</div><button class="mc vp-cancel">×</button></div>
      <div class="mb">
        <div class="flex" style="gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
          <label style="font-size:13px;color:var(--muted)">Mês de referência<br><input type="month" class="vp-m" value="${mesRef || mesAtual()}" style="margin-top:4px;padding:7px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px"></label>
          <label style="font-size:13px;color:var(--muted)">Arquivo (modelo oficial .xlsx)<br><input type="file" accept=".xlsx,.xls" class="vp-f" style="margin-top:4px;font-size:13px"></label>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">As 6 abas do modelo viram os 6 sub-módulos. Reimportar o mesmo mês não apaga nada: grava uma importação nova, que passa a valer.</div>
        <div class="vp-prev"></div>
      </div>
      <div class="mf"><button class="btn btn-o vp-cancel">Cancelar</button><button class="btn btn-p vp-ok" disabled>Gravar no sistema</button></div>
    </div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s);
    let parsed = null, nomeArq = '';
    ov.querySelectorAll('.vp-cancel').forEach(b => b.onclick = () => ov.remove());

    $('.vp-f').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      nomeArq = f.name; $('.vp-prev').textContent = 'Lendo…';
      try {
        const XLSX = await carregarSheetJS();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        parsed = parseWorkbook(wb, XLSX);
        $('.vp-prev').innerHTML = previaHTML(parsed);
        $('.vp-ok').disabled = parsed.linhas.length === 0 || parsed.bloqueios.length > 0;
      } catch (err) { $('.vp-prev').innerHTML = `<p style="color:#dc2626">${esc(err.message)}</p>`; }
    };

    $('.vp-ok').onclick = async () => {
      const m = $('.vp-m').value;
      if (!m) { aviso('Escolha o mês de referência.', 'err'); return; }
      $('.vp-ok').disabled = true; $('.vp-ok').textContent = 'Gravando…';
      try {
        await salvarImportacao(m, nomeArq, parsed);
        aviso(`✅ Planilha de ${fmtMes(m)} gravada: ${parsed.linhas.length} linhas.`, 'ok');
        ov.remove(); aoConcluir && aoConcluir();
      } catch (err) {
        $('.vp-prev').insertAdjacentHTML('beforeend', `<p style="color:#dc2626">Erro ao gravar: ${esc(err.message)}</p>`);
        $('.vp-ok').textContent = 'Gravar no sistema'; $('.vp-ok').disabled = false;
      }
    };
  }

  function previaHTML(parsed) {
    return `<div class="tw tbl"><table><thead><tr><th>Aba do Excel</th><th>Sub-módulo</th><th style="text-align:center">Linhas</th></tr></thead><tbody>` +
      SUBMODULOS.map(s => `<tr><td style="font-family:monospace;font-size:12px">${s.aba}</td><td>${esc(s.nome)}</td><td style="text-align:center">${parsed.abasFaltando.includes(s.aba) ? '<b style="color:#dc2626">aba não encontrada</b>' : parsed.linhas.filter(l => l.submodulo === s.key).length}</td></tr>`).join('') +
      `</tbody></table></div>` +
      (parsed.bloqueios.length
        ? `<details open style="margin-top:10px"><summary style="cursor:pointer;color:#dc2626;font-weight:600">${parsed.bloqueios.length} referência(s) a corrigir no Excel antes de gravar</summary><ul style="margin:6px 0;padding-left:18px;font-size:13px;color:#dc2626">${parsed.bloqueios.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>`
        : '') +
      (parsed.avisos.length
        ? `<details open style="margin-top:10px"><summary style="cursor:pointer;color:#b45309;font-weight:600">${parsed.avisos.length} aviso(s) — conferir antes de gravar</summary><ul style="margin:6px 0;padding-left:18px;font-size:13px">${parsed.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>`
        : `<p style="color:#047857;margin-top:10px">Nenhum aviso.</p>`) +
      (parsed.linhas.length === 0 ? `<p style="color:#dc2626;margin-top:6px">Nenhuma linha preenchida — nada para gravar.</p>` : '');
  }

  const mod = { SUBMODULOS, parseWorkbook, render, abrirPagina, abrirImportacao, ultimaImportacao, linhasDe };
  if (typeof window !== 'undefined') window.VendasPlanilhas = mod;
  if (typeof module !== 'undefined') module.exports = mod;   // para teste em Node
})();

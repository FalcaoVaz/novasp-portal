/* =====================================================================
   24-recrutamento.js — RECRUTAMENTO / FUNIL DE CORRETORES (Rodrigo, 20/10/2026, para a Dayani do RH)
   ---------------------------------------------------------------------
   Card Gestão → "Recrutamento". Três abas:
     · Funil ........ funil do período, por origem, motivos, lista de candidatos (etapas alteradas na linha)
     · Entrevistas .. próximas entrevistas marcadas (com WhatsApp de confirmação)
     · Roteiro ...... perguntas básicas das entrevistas (online/presencial), editáveis pelo RH
   Ficha do candidato: dados e perfil (CRECI, experiência), entrevista online e presencial (respostas do roteiro,
   notas por critério, parecer), resultado/motivo, banco de talentos e checklist de integração do aprovado.
   Banco: sql/2026-10-20-recrutamento.sql (rh_candidatos, rh_perguntas; acesso = admin + rh_acesso, via rh_pode()).
   ===================================================================== */
(function () {
  'use strict';
  const T = 'rh_candidatos', TP = 'rh_perguntas';
  const ORIGENS = ['Indeed', 'LinkedIn', 'Instagram', 'Facebook', 'Indicação', 'Site Nova SP', 'InfoJobs', 'Catho', 'WhatsApp', 'Placa/anúncio', 'Outro'];
  const RESPONSAVEIS = ['Dayani', 'Renata', 'Felippe', 'Christiane', 'Emilia', 'Rodrigo'];
  const EQUIPES = ['Aguia', 'Chris', 'Emilia', 'Felippe', 'Fenix', 'Moema'];
  const OP = {
    contato:    [['', 'A contatar'], ['sim', 'Conseguimos'], ['sem_sucesso', 'Sem sucesso']],
    resposta:   [['', '—'], ['sim', 'Respondeu'], ['nao', 'Não respondeu']],
    online:     [['', '—'], ['marcada', 'Marcada'], ['realizada', 'Realizada'], ['faltou', 'Faltou']],
    presencial: [['', '—'], ['marcada', 'Marcada'], ['realizada', 'Realizada'], ['faltou', 'Faltou']],
    resultado:  [['andamento', 'Em andamento'], ['aprovado', 'Aprovado'], ['nao_aprovado', 'Não aprovado'], ['desistiu', 'Desistiu']],
    creci:      [['', '—'], ['tem', 'Tem CRECI'], ['estudante', 'Cursando TTI'], ['nao', 'Não tem']],
    experiencia:[['', '—'], ['sem', 'Sem experiência'], ['ate1', 'Até 1 ano'], ['1a3', '1 a 3 anos'], ['mais3', 'Mais de 3 anos']],
    area_interesse: [['', '—'], ['vendas', 'Vendas'], ['locacao', 'Locação'], ['ambos', 'Vendas e locação']]
  };
  const CRITERIOS = [['comunicacao', 'Comunicação'], ['perfil_comercial', 'Perfil comercial'], ['disponibilidade', 'Disponibilidade'], ['conhece_regiao', 'Conhece a região'], ['postura', 'Postura e apresentação']];
  const INTEGRACAO = [['documentos', 'Documentos (RG, CPF, comprovante de residência)'], ['creci', 'CRECI ativo ou TTI comprovado'], ['contrato', 'Contrato assinado'],
    ['imoview', 'Cadastro no Imoview'], ['email', 'E-mail @novasaopaulo criado'], ['treinamento', 'Treinamento inicial'], ['equipe', 'Equipe e gerente definidos'], ['apresentacao', 'Apresentado à equipe']];
  const PARADO_DIAS = 3;
  const COR = { aprovado: ['#047857', '#d1fae5'], nao_aprovado: ['#b91c1c', '#fee2e2'], desistiu: ['#475569', '#e2e8f0'], andamento: ['#1d4ed8', '#dbeafe'] };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aviso = (m, t) => (typeof toast === 'function' ? toast(m, t || '') : alert(m));
  const rot = (campo, v) => ((OP[campo] || []).find(o => o[0] === (v || '')) || [, v || '—'])[1];
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const diaBr = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
  const dtBr = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const paraLocal = iso => { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const deLocal = v => v ? new Date(v).toISOString() : null;
  const digitos = s => String(s || '').replace(/\D/g, '');
  const meuNome = () => ((typeof CUR !== 'undefined' && CUR && CUR.nome) || '').split(' ')[0];
  const quem = () => (typeof CUR !== 'undefined' && CUR) ? (CUR.email || CUR.nome || null) : null;
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
  const raiz = () => document.getElementById('recrutamento-root');
  const sel = (campo, v, extra) => `<select data-campo="${campo}" ${extra || ''}>${OP[campo].map(([k, l]) => `<option value="${k}" ${k === (v || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const pill = r => { const [c, b] = COR[r] || COR.andamento; return `<span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;color:${c};background:${b}">${esc(rot('resultado', r))}</span>`; };

  let _lista = [], _perg = [], _aba = 'funil', _f = { busca: '', origem: '', resp: '', periodo: '', status: '' };

  // ── acesso (o banco é quem decide: rh_pode(); aqui só esconde o menu) ──
  function podeRecrutamento() {
    if (typeof CUR === 'undefined' || !CUR) return false;
    if (CUR.admin) return true;
    const em = String(CUR.email || '').toLowerCase();
    return ['financeiro@novasaopaulo.com.br', 'renata@novasaopaulo.com.br', 'felippe.lemos@novasaopaulo.com.br', 'gerenciavendas@novasaopaulo.com.br', 'emilia.vitoria@novasaopaulo.com.br'].includes(em);
  }
  window.podeRecrutamento = podeRecrutamento;

  async function carregar() {
    [_lista, _perg] = await Promise.all([
      db.get(T, '?select=*&order=data_entrada.desc,criado_em.desc&limit=5000'),
      db.get(TP, '?select=*&order=ordem.asc,texto.asc')
    ]);
  }

  async function abrir() {
    const el = raiz(); if (!el) return;
    if (!podeRecrutamento()) { el.innerHTML = '<div class="card"><div class="cb">Acesso só para o RH, os gerentes e a diretoria.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="cb" style="color:var(--muted)">Carregando candidatos…</div></div>';
    try { await carregar(); }
    catch (e) { el.innerHTML = `<div class="card"><div class="cb" style="color:#b91c1c">Não consegui ler os candidatos: ${esc(e.message)}${/rh_candidatos|does not exist|relation/i.test(e.message) ? '<br>O SQL do recrutamento ainda não foi rodado no banco.' : ''}</div></div>`; return; }
    render();
  }

  function render() {
    const el = raiz(); if (!el) return;
    const abas = [['funil', 'Funil e candidatos'], ['entrevistas', 'Próximas entrevistas'], ['roteiro', 'Roteiro de perguntas']];
    el.innerHTML = `
      <div class="ph"><div><div style="font-size:11px;letter-spacing:2px;color:var(--muted);font-weight:700">NOVASP · RECRUTAMENTO</div><h1 class="pt">Funil de Corretores</h1>
        <div class="pst">Do primeiro contato à integração na equipe</div></div>
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-o" id="rh-importar">Importar lista</button>
          <button class="btn btn-o" id="rh-exportar">Exportar CSV</button>
          <button class="btn btn-p" id="rh-novo">+ Novo candidato</button></div></div>
      <div class="flex" style="gap:6px;margin-bottom:14px;flex-wrap:wrap">${abas.map(([k, l]) => `<button class="btn ${_aba === k ? 'btn-p' : 'btn-o'}" data-aba="${k}">${l}</button>`).join('')}</div>
      <div id="rh-corpo"></div>
      <style>#recrutamento-root .fg input,#recrutamento-root .fg select,#recrutamento-root .fg textarea,#recrutamento-root input[data-pt],#recrutamento-root select[data-pe],#recrutamento-root input[id^="rh-nova-"],
        #m-rh .fg input,#m-rh .fg select,#m-rh .fg textarea{width:100%;padding:8px 10px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px;font-family:inherit;background:#fff;box-sizing:border-box}
        #m-rh .fg input[type=checkbox]{width:auto}</style>`;
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { _aba = b.dataset.aba; render(); });
    el.querySelector('#rh-novo').onclick = () => ficha(null);
    el.querySelector('#rh-importar').onclick = importar;
    el.querySelector('#rh-exportar').onclick = exportar;
    if (_aba === 'funil') renderFunil(); else if (_aba === 'entrevistas') renderEntrevistas(); else renderRoteiro();
  }

  // ── filtros ──
  function noPeriodo(c) {
    if (!_f.periodo) return true;
    const d = c.data_entrada || '', h = new Date(), ini = new Date(h);
    if (_f.periodo === 'mes') return d.slice(0, 7) === hojeIso().slice(0, 7);
    if (_f.periodo === 'mes_ant') { const m = new Date(h.getFullYear(), h.getMonth() - 1, 1); return d.slice(0, 7) === `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`; }
    if (_f.periodo === 'ano') return d.slice(0, 4) === String(h.getFullYear());
    ini.setDate(ini.getDate() - (+_f.periodo || 0)); return d >= `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-${String(ini.getDate()).padStart(2, '0')}`;
  }
  const parado = c => c.resultado === 'andamento' && !proximaEntrevista(c) && (Date.now() - new Date(c.atualizado_em || c.criado_em)) > PARADO_DIAS * 86400000;
  function proximaEntrevista(c) {
    const futuras = [['online', c.online_em], ['presencial', c.presencial_em]].filter(([k, d]) => c[k] === 'marcada' && d && new Date(d) > Date.now() - 3600000);
    futuras.sort((a, b) => new Date(a[1]) - new Date(b[1]));
    return futuras[0] || null;
  }
  function filtrados() {
    const b = _f.busca.toLowerCase().trim(), bd = digitos(b);
    return _lista.filter(c => {
      if (_f.origem && (c.origem || '') !== _f.origem) return false;
      if (_f.resp && (c.responsavel || '') !== _f.resp) return false;
      if (!noPeriodo(c)) return false;
      if (_f.status === 'talentos' && !c.banco_talentos) return false;
      if (_f.status === 'parados' && !parado(c)) return false;
      if (_f.status && !['talentos', 'parados'].includes(_f.status) && c.resultado !== _f.status) return false;
      if (b && !((c.nome || '').toLowerCase().includes(b) || (c.email || '').toLowerCase().includes(b) || (bd.length >= 3 && digitos(c.telefone).includes(bd)))) return false;
      return true;
    });
  }

  // ── aba Funil ──
  function renderFunil() {
    const corpo = document.getElementById('rh-corpo');
    const origens = [...new Set(ORIGENS.concat(_lista.map(c => c.origem).filter(Boolean)))];
    const resps = [...new Set(RESPONSAVEIS.concat(_lista.map(c => c.responsavel).filter(Boolean)))];
    const opt = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const L = filtrados(), n = L.length;
    const cnt = f => L.filter(f).length;
    const contato = cnt(c => c.contato === 'sim'), semSuc = cnt(c => c.contato === 'sem_sucesso');
    const resp = cnt(c => c.resposta === 'sim'), naoResp = cnt(c => c.resposta === 'nao');
    const onl = cnt(c => c.online), onlR = cnt(c => c.online === 'realizada'), onlF = cnt(c => c.online === 'faltou');
    const pre = cnt(c => c.presencial), preR = cnt(c => c.presencial === 'realizada'), preF = cnt(c => c.presencial === 'faltou');
    const apr = cnt(c => c.resultado === 'aprovado'), napr = cnt(c => c.resultado === 'nao_aprovado'), and = cnt(c => c.resultado === 'andamento'), des = cnt(c => c.resultado === 'desistiu');
    const tempos = L.filter(c => c.resultado === 'aprovado' && c.aprovado_em && c.data_entrada).map(c => (new Date(c.aprovado_em) - new Date(c.data_entrada)) / 86400000);
    const tMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
    const nParados = _lista.filter(parado).length;
    const em7 = _lista.filter(c => { const p = proximaEntrevista(c); return p && new Date(p[1]) - Date.now() < 7 * 86400000; }).length;
    const etapa = (titulo, sub, v, cor) => `<div style="display:grid;grid-template-columns:1fr 70px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--borda)">
        <div><div style="font-weight:600">${titulo}</div><div style="font-size:12px;color:var(--muted)">${sub}</div>
          <div style="height:6px;background:#f1f5f9;border-radius:99px;margin-top:6px"><div style="height:6px;border-radius:99px;width:${pct(v, n)}%;background:${cor || 'var(--pri)'}"></div></div></div>
        <div style="text-align:right"><div style="font-weight:700;font-size:18px">${v}</div><div style="font-size:12px;color:var(--muted)">${pct(v, n)}%</div></div></div>`;
    const porOrigem = {};
    L.forEach(c => { const k = c.origem || 'Sem origem'; const o = porOrigem[k] = porOrigem[k] || { t: 0, a: 0 }; o.t++; if (c.resultado === 'aprovado') o.a++; });
    const motivos = {};
    L.filter(c => ['nao_aprovado', 'desistiu'].includes(c.resultado) && c.motivo).forEach(c => { const k = c.motivo.trim(); motivos[k] = (motivos[k] || 0) + 1; });
    const kpi = (v, l, cor) => `<div class="card" style="flex:1;min-width:150px"><div class="cb" style="padding:14px"><div style="font-size:22px;font-weight:700;color:${cor || 'var(--txt)'}">${v}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div></div>`;
    corpo.innerHTML = `
      <div class="card"><div class="cb flex" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="fg" style="flex:2;min-width:200px;margin:0"><label>Buscar</label><input id="rh-busca" placeholder="Nome, telefone ou e-mail" value="${esc(_f.busca)}"></div>
        <div class="fg" style="margin:0"><label>Origem</label><select id="rh-f-origem"><option value="">Todas</option>${opt(origens, _f.origem)}</select></div>
        <div class="fg" style="margin:0"><label>Responsável</label><select id="rh-f-resp"><option value="">Todos</option>${opt(resps, _f.resp)}</select></div>
        <div class="fg" style="margin:0"><label>Período de entrada</label><select id="rh-f-periodo">${[['', 'Todo o período'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['ano', 'Este ano']].map(([k, l]) => `<option value="${k}" ${k === _f.periodo ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fg" style="margin:0"><label>Situação</label><select id="rh-f-status">${[['', 'Todas'], ['andamento', 'Em andamento'], ['aprovado', 'Aprovados'], ['nao_aprovado', 'Não aprovados'], ['desistiu', 'Desistiram'], ['parados', `Parados há ${PARADO_DIAS}+ dias`], ['talentos', 'Banco de talentos']].map(([k, l]) => `<option value="${k}" ${k === _f.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div></div>
      <div class="flex" style="gap:10px;flex-wrap:wrap;margin:12px 0">
        ${kpi(em7, 'entrevistas nos próximos 7 dias', 'var(--pri)')}
        ${kpi(nParados, `em andamento sem ação há ${PARADO_DIAS}+ dias`, nParados ? '#b45309' : '')}
        ${kpi(tMedio == null ? '—' : tMedio + ' dias', 'tempo médio da entrada à aprovação')}
        ${kpi(_lista.filter(c => c.banco_talentos).length, 'no banco de talentos')}
      </div>
      <div class="flex" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div class="card" style="flex:3;min-width:320px"><div class="cb">
          <div style="font-weight:700;font-size:16px;margin-bottom:4px">Funil do período</div>
          ${etapa('Contatos recebidos', 'todos os candidatos', n, '#94a3b8')}
          ${etapa('Conseguimos contato', `${semSuc} sem sucesso`, contato)}
          ${etapa('Responderam', `${naoResp} não responderam`, resp)}
          ${etapa('Entrevista online marcada', `${onlR} realizadas · ${onlF} faltas`, onl)}
          ${etapa('Entrevista presencial marcada', `${preR} realizadas · ${preF} faltas`, pre)}
          ${etapa('Aprovados', '', apr, '#10b981')}
          ${etapa('Não aprovados', '', napr, '#ef4444')}
          <div class="flex" style="gap:18px;flex-wrap:wrap;font-size:13px;margin-top:10px">
            <span>Em andamento <b>${and}</b></span><span>Desistiram <b>${des}</b></span>
            <span>Contato → resposta <b>${pct(resp, contato)}%</b></span><span>Presencial → aprovado <b>${pct(apr, preR)}%</b></span></div>
        </div></div>
        <div style="flex:2;min-width:280px;display:flex;flex-direction:column;gap:12px">
          <div class="card"><div class="cb"><div class="flex" style="justify-content:space-between"><b>Por origem</b><span style="font-size:12px;color:var(--muted)">% = aprovados ÷ total</span></div>
            ${Object.keys(porOrigem).length ? `<table style="width:100%;font-size:13px;margin-top:8px">${Object.entries(porOrigem).sort((a, b) => b[1].t - a[1].t).map(([k, o]) => `<tr><td style="padding:4px 0">${esc(k)}</td><td style="text-align:right">${o.t}</td><td style="text-align:right;color:var(--muted)">${o.a} aprov.</td><td style="text-align:right;font-weight:700;width:50px">${pct(o.a, o.t)}%</td></tr>`).join('')}</table>`
              : '<div style="color:var(--muted);text-align:center;padding:18px">Sem dados no filtro atual.</div>'}</div></div>
          <div class="card"><div class="cb"><b>Motivos (não aprovados e desistências)</b>
            ${Object.keys(motivos).length ? `<table style="width:100%;font-size:13px;margin-top:8px">${Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `<tr><td style="padding:4px 0">${esc(k)}</td><td style="text-align:right;font-weight:700">${v}</td></tr>`).join('')}</table>`
              : '<div style="color:var(--muted);text-align:center;padding:12px;font-size:13px">Preencha o motivo na ficha de quem não foi aprovado ou desistiu.</div>'}</div></div>
        </div>
      </div>
      <div class="card" style="margin-top:12px"><div class="cb">
        <div class="flex" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><b style="font-size:16px">Candidatos <span style="color:var(--muted);font-weight:400">(${n})</span></b>
          <span style="font-size:12px;color:var(--muted)">Altere as etapas direto na linha. Clique no nome para abrir a ficha.</span></div>
        ${n ? `<div class="tw tbl" style="margin-top:10px"><table class="rh-tab"><thead><tr><th>Candidato</th><th>Origem</th><th>Resp.</th><th>Entrada</th><th>Contato</th><th>Resposta</th><th>Online</th><th>Presencial</th><th>Resultado</th></tr></thead>
          <tbody>${L.map(linha).join('')}</tbody></table></div>`
          : `<div style="text-align:center;padding:30px"><div style="font-weight:700;color:var(--muted);font-size:16px">${_lista.length ? 'Nenhum candidato neste filtro' : 'Nenhum candidato ainda'}</div>
             <div style="color:var(--muted);margin-top:4px">Clique em “+ Novo candidato” ou em “Importar lista” para colar vários contatos de uma vez.</div></div>`}
      </div></div>
      <style>.rh-tab select{padding:4px 6px;border:1px solid var(--borda);border-radius:6px;font-size:12px;background:#fff;max-width:130px}.rh-tab td{vertical-align:top}</style>`;
    const re = () => renderFunil();
    corpo.querySelector('#rh-busca').oninput = e => { _f.busca = e.target.value; clearTimeout(re._t); re._t = setTimeout(() => { re(); const i = document.getElementById('rh-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
    corpo.querySelector('#rh-f-origem').onchange = e => { _f.origem = e.target.value; re(); };
    corpo.querySelector('#rh-f-resp').onchange = e => { _f.resp = e.target.value; re(); };
    corpo.querySelector('#rh-f-periodo').onchange = e => { _f.periodo = e.target.value; re(); };
    corpo.querySelector('#rh-f-status').onchange = e => { _f.status = e.target.value; re(); };
    corpo.querySelectorAll('[data-abre]').forEach(a => a.onclick = () => ficha(a.dataset.abre));
    corpo.querySelectorAll('tr[data-id] select').forEach(s => s.onchange = () => mudarEtapa(s.closest('tr').dataset.id, s.dataset.campo, s.value));
  }

  function linha(c) {
    const pe = proximaEntrevista(c);
    const tel = c.telefone ? `<a href="${wa(c.telefone, '')}" target="_blank" rel="noopener" style="color:var(--muted);font-size:12px;text-decoration:none">${esc(c.telefone)}</a>` : '';
    return `<tr data-id="${c.id}">
      <td><a href="javascript:void 0" data-abre="${c.id}" style="font-weight:700;color:var(--txt)">${esc(c.nome)}</a>${c.banco_talentos ? ' <span title="Banco de talentos">⭐</span>' : ''}${parado(c) ? ` <span title="Sem ação há ${PARADO_DIAS}+ dias" style="font-size:10px;color:#b45309;font-weight:700">PARADO</span>` : ''}
        <div>${tel}</div>${c.creci ? `<div style="font-size:11px;color:var(--muted)">${esc(rot('creci', c.creci))}</div>` : ''}</td>
      <td style="font-size:12px">${esc(c.origem || '—')}</td><td style="font-size:12px">${esc(c.responsavel || '—')}</td><td style="font-size:12px;white-space:nowrap">${diaBr(c.data_entrada)}</td>
      <td>${sel('contato', c.contato)}</td><td>${sel('resposta', c.resposta)}</td>
      <td>${sel('online', c.online)}${c.online_em ? `<div style="font-size:11px;color:var(--muted)">${dtBr(c.online_em)}</div>` : ''}</td>
      <td>${sel('presencial', c.presencial)}${c.presencial_em ? `<div style="font-size:11px;color:var(--muted)">${dtBr(c.presencial_em)}</div>` : ''}</td>
      <td>${sel('resultado', c.resultado)}</td></tr>`;
  }

  async function salvar(id, dados) {
    dados.atualizado_em = new Date().toISOString();
    const [r] = await db.patch(T, id, dados);
    const i = _lista.findIndex(c => c.id === id); if (i >= 0 && r) _lista[i] = r;
    return r;
  }
  async function mudarEtapa(id, campo, v) {
    const c = _lista.find(x => x.id === id); if (!c) return;
    const d = { [campo]: v };
    if (campo === 'resultado' && v === 'aprovado' && !c.aprovado_em) d.aprovado_em = hojeIso();
    if (campo === 'resultado' && v !== 'aprovado') d.aprovado_em = null;
    try {
      await salvar(id, d);
      if ((campo === 'online' || campo === 'presencial') && v === 'marcada' && !c[campo + '_em']) { aviso('Etapa salva. Abra a ficha para pôr a data da entrevista.', 'ok'); ficha(id, campo); return; }
      if (campo === 'resultado' && ['nao_aprovado', 'desistiu'].includes(v) && !c.motivo) { aviso('Salvo. Anote o motivo na ficha.', 'ok'); ficha(id, 'dados'); return; }
      aviso('Salvo.', 'ok'); renderFunil();
    } catch (e) { aviso('Não salvou: ' + e.message, 'err'); renderFunil(); }
  }

  // ── WhatsApp com mensagem pronta ──
  function wa(tel, msg) { let d = digitos(tel); if (d.length <= 11) d = '55' + d; return `https://wa.me/${d}${msg ? '?text=' + encodeURIComponent(msg) : ''}`; }
  function mensagens(c) {
    const p = (c.nome || '').split(' ')[0], eu = meuNome() || 'RH', fmt = iso => iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '[data e hora]';
    return [
      ['Primeiro contato', `Olá, ${p}! Aqui é ${eu}, da Imobiliária Nova São Paulo. Recebemos seu interesse em trabalhar como corretor(a) com a gente. Podemos conversar? Qual o melhor horário para uma ligação ou uma entrevista online rápida?`],
      ['Confirmar entrevista online', `Olá, ${p}! Confirmando nossa entrevista online ${fmt(c.online_em)}. Te envio o link pouco antes. Qualquer imprevisto, me avise por aqui. Até lá!`],
      ['Confirmar entrevista presencial', `Olá, ${p}! Confirmando sua entrevista presencial ${fmt(c.presencial_em)} na Nova São Paulo: Av. Jabaquara, 1947, Saúde (perto do metrô Saúde). Traga um documento com foto. Até lá!`],
      ['Aprovado(a)', `Olá, ${p}! Temos uma ótima notícia: você foi aprovado(a) no nosso processo para corretor(a) da Nova São Paulo! Vou te passar os próximos passos e a lista de documentos. Bem-vindo(a)!`],
      ['Não aprovado(a)', `Olá, ${p}! Obrigado pelo seu tempo e pelo interesse na Nova São Paulo. Neste momento não vamos seguir com a sua candidatura, mas vamos manter seu contato para futuras oportunidades. Sucesso!`]
    ];
  }

  // ── ficha do candidato ──
  function modal(html, largura) {
    let m = document.getElementById('m-rh');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-rh'; document.body.appendChild(m); m.addEventListener('mousedown', e => { m._down = e.target === m; }); m.addEventListener('click', e => { if (e.target === m && m._down) m.classList.remove('open'); }); }
    m.innerHTML = `<div class="modal" style="width:${largura || 760}px">${html}</div>`;
    m.classList.add('open');
    return m;
  }
  const fechar = () => { const m = document.getElementById('m-rh'); if (m) m.classList.remove('open'); };

  function ficha(id, abaIni) {
    const c = id ? Object.assign({}, _lista.find(x => x.id === id)) : { nome: '', telefone: '', email: '', origem: '', responsavel: meuNome(), data_entrada: hojeIso(), contato: '', resposta: '', online: '', presencial: '', resultado: 'andamento', creci: '', experiencia: '', area_interesse: '', entrevistas: {}, integracao: {} };
    c.entrevistas = c.entrevistas || {}; c.integracao = c.integracao || {};
    let aba = abaIni || 'dados';
    const inp = (campo, rotulo, tipo, extra) => `<div class="fg"><label>${rotulo}</label><input data-f="${campo}" type="${tipo || 'text'}" value="${esc(c[campo] || '')}" ${extra || ''}></div>`;
    const selF = (campo, rotulo) => `<div class="fg"><label>${rotulo}</label><select data-f="${campo}">${OP[campo].map(([k, l]) => `<option value="${k}" ${k === (c[campo] || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const lista = (id, arr) => `<datalist id="${id}">${arr.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;

    function entrevistaHTML(etapa) {
      const e = c.entrevistas[etapa] || {}, resp = e.respostas || {}, notas = e.notas || {};
      const pergs = _perg.filter(p => p.ativo !== false && (p.etapa === etapa || p.etapa === 'ambas'));
      const vals = CRITERIOS.map(([k]) => +notas[k]).filter(x => x > 0);
      const media = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
      return `<div class="flex" style="gap:10px;flex-wrap:wrap">
          <div class="fg" style="flex:1;min-width:160px"><label>Situação</label><select data-f="${etapa}">${OP[etapa].map(([k, l]) => `<option value="${k}" ${k === (c[etapa] || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fg" style="flex:1;min-width:200px"><label>Data e hora</label><input type="datetime-local" data-f="${etapa}_em" value="${paraLocal(c[etapa + '_em'])}"></div></div>
        <div style="font-weight:700;margin:6px 0 8px">Roteiro <span style="font-weight:400;color:var(--muted);font-size:12px">(edite as perguntas na aba “Roteiro de perguntas”)</span></div>
        ${pergs.length ? pergs.map((p, i) => `<div class="fg"><label style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)">${i + 1}. ${esc(p.texto)}</label>
            <textarea rows="2" data-resp="${etapa}:${p.id}" style="width:100%">${esc(resp[p.id] || '')}</textarea></div>`).join('') : '<div style="color:var(--muted);font-size:13px;margin-bottom:10px">Nenhuma pergunta para esta etapa.</div>'}
        <div style="font-weight:700;margin:10px 0 8px">Avaliação <span style="font-weight:400;color:var(--muted);font-size:12px">(1 = fraco · 5 = excelente) · média <b id="rh-media-${etapa}">${media}</b></span></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap">${CRITERIOS.map(([k, l]) => `<div class="fg" style="min-width:130px"><label>${l}</label><select data-nota="${etapa}:${k}"><option value="">—</option>${[1, 2, 3, 4, 5].map(n => `<option ${+notas[k] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="fg"><label>Parecer de quem entrevistou</label><textarea rows="3" data-parecer="${etapa}" style="width:100%">${esc(e.parecer || '')}</textarea></div>
        <div class="fg"><label>Resultado desta entrevista</label><select data-resultado-ent="${etapa}">${[['', '—'], ['seguir', 'Seguir para a próxima etapa'], ['nao_seguir', 'Não seguir']].map(([k, l]) => `<option value="${k}" ${k === (e.resultado || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${e.por ? `<div style="font-size:12px;color:var(--muted)">Registrado por ${esc(e.por)}${e.em ? ' em ' + dtBr(e.em) : ''}</div>` : ''}`;
    }

    function corpoHTML() {
      if (aba === 'dados') return `
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:2;min-width:220px">${inp('nome', 'Nome *')}</div><div style="flex:1;min-width:160px">${inp('telefone', 'Telefone / WhatsApp', 'tel')}</div></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:2;min-width:220px">${inp('email', 'E-mail', 'email')}</div><div style="flex:1;min-width:160px">${inp('data_entrada', 'Entrada', 'date')}</div></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:160px">${inp('origem', 'Origem', 'text', 'list="rh-dl-origem"')}</div><div style="flex:1;min-width:160px">${inp('responsavel', 'Responsável', 'text', 'list="rh-dl-resp"')}</div><div style="flex:1;min-width:160px">${inp('regiao', 'Bairro / região onde mora')}</div></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:150px">${selF('creci', 'CRECI')}</div><div style="flex:1;min-width:140px">${inp('creci_numero', 'Nº do CRECI')}</div><div style="flex:1;min-width:150px">${selF('experiencia', 'Experiência no mercado')}</div><div style="flex:1;min-width:150px">${selF('area_interesse', 'Interesse')}</div></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:150px">${selF('contato', 'Contato')}</div><div style="flex:1;min-width:150px">${selF('resposta', 'Resposta')}</div><div style="flex:1;min-width:150px">${selF('resultado', 'Resultado')}</div></div>
        <div class="flex" style="gap:10px;flex-wrap:wrap"><div style="flex:2;min-width:220px">${inp('motivo', 'Motivo (se não aprovado ou desistiu)', 'text', 'list="rh-dl-motivo" placeholder="Ex.: sem CRECI, sem disponibilidade, foi para outra empresa"')}</div>
          <div class="fg" style="flex:1;min-width:180px;display:flex;align-items:flex-end"><label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)"><input type="checkbox" data-f="banco_talentos" ${c.banco_talentos ? 'checked' : ''} style="width:auto"> ⭐ Banco de talentos (chamar de novo no futuro)</label></div></div>
        <div class="fg"><label>Observações</label><textarea rows="3" data-f="observacoes" style="width:100%">${esc(c.observacoes || '')}</textarea></div>
        ${lista('rh-dl-origem', ORIGENS)}${lista('rh-dl-resp', RESPONSAVEIS)}${lista('rh-dl-motivo', ['Sem CRECI / TTI', 'Sem disponibilidade de horário', 'Perfil não comercial', 'Expectativa de salário fixo', 'Mora longe', 'Foi para outra empresa', 'Não compareceu', 'Parou de responder', 'Desistiu da área'].concat([...new Set(_lista.map(x => x.motivo).filter(Boolean))]))}`;
      if (aba === 'online' || aba === 'presencial') return entrevistaHTML(aba);
      if (aba === 'integracao') return `
        <div style="color:var(--muted);font-size:13px;margin-bottom:10px">Checklist de entrada do corretor aprovado.</div>
        <div class="fg" style="max-width:260px"><label>Equipe</label><select data-f="equipe"><option value="">—</option>${EQUIPES.map(e => `<option ${e === c.equipe ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        ${INTEGRACAO.map(([k, l]) => `<label style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--borda);cursor:pointer"><input type="checkbox" data-int="${k}" ${c.integracao[k] ? 'checked' : ''} style="width:auto"> ${l}${c.integracao[k + '_em'] ? `<span style="margin-left:auto;font-size:11px;color:var(--muted)">${diaBr(c.integracao[k + '_em'])}</span>` : ''}</label>`).join('')}
        <div style="margin-top:10px;font-size:13px"><b>${INTEGRACAO.filter(([k]) => c.integracao[k]).length}</b> de ${INTEGRACAO.length} concluídos${c.aprovado_em ? ` · aprovado em ${diaBr(c.aprovado_em)}` : ''}</div>`;
      if (aba === 'whats') return c.telefone
        ? mensagens(c).map(([t, m]) => `<div style="border:1px solid var(--borda);border-radius:10px;padding:10px 12px;margin-bottom:8px"><div class="flex" style="justify-content:space-between;gap:8px;align-items:center"><b>${t}</b>
            <a class="btn btn-p" style="text-decoration:none;padding:6px 12px;font-size:12px" target="_blank" rel="noopener" href="${wa(c.telefone, m)}">Abrir no WhatsApp</a></div><div style="font-size:13px;color:var(--muted);margin-top:6px">${esc(m)}</div></div>`).join('')
        : '<div style="color:var(--muted)">Cadastre o telefone na aba Dados para usar as mensagens.</div>';
      return '';
    }

    function coletar(m) {
      m.querySelectorAll('[data-f]').forEach(i => { c[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.type === 'datetime-local' ? deLocal(i.value) : i.value; });
      m.querySelectorAll('[data-resp]').forEach(i => { const [et, pid] = i.dataset.resp.split(':'); const e = c.entrevistas[et] = c.entrevistas[et] || {}; (e.respostas = e.respostas || {})[pid] = i.value; });
      m.querySelectorAll('[data-nota]').forEach(i => { const [et, k] = i.dataset.nota.split(':'); const e = c.entrevistas[et] = c.entrevistas[et] || {}; (e.notas = e.notas || {})[k] = i.value ? +i.value : null; });
      m.querySelectorAll('[data-parecer]').forEach(i => { const e = c.entrevistas[i.dataset.parecer] = c.entrevistas[i.dataset.parecer] || {}; e.parecer = i.value; });
      m.querySelectorAll('[data-resultado-ent]').forEach(i => { const e = c.entrevistas[i.dataset.resultadoEnt] = c.entrevistas[i.dataset.resultadoEnt] || {}; e.resultado = i.value; });
      m.querySelectorAll('[data-int]').forEach(i => { const k = i.dataset.int; if (i.checked && !c.integracao[k]) c.integracao[k + '_em'] = hojeIso(); if (!i.checked) delete c.integracao[k + '_em']; c.integracao[k] = i.checked; });
      ['online', 'presencial'].forEach(et => { const e = c.entrevistas[et]; if (e && (e.parecer || Object.values(e.respostas || {}).some(Boolean) || Object.values(e.notas || {}).some(Boolean))) { e.por = e.por || meuNome(); e.em = e.em || new Date().toISOString(); } });
    }

    function desenhar() {
      const abas = [['dados', 'Dados e perfil'], ['online', 'Entrevista online'], ['presencial', 'Entrevista presencial'], ['integracao', 'Integração'], ['whats', 'WhatsApp']];
      const m = modal(`<div class="mh"><div class="mt">${id ? esc(c.nome) : 'Novo candidato'} ${id ? pill(c.resultado) : ''}</div><button class="mc" id="rh-x">×</button></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;padding:0 20px;border-bottom:1px solid var(--borda)">${abas.map(([k, l]) => `<button data-fa="${k}" style="border:none;background:none;padding:10px 12px;cursor:pointer;font-weight:${aba === k ? 700 : 500};color:${aba === k ? 'var(--pri)' : 'var(--muted)'};border-bottom:2px solid ${aba === k ? 'var(--pri)' : 'transparent'}">${l}</button>`).join('')}</div>
        <div class="mb">${corpoHTML()}</div>
        <div class="mf">${id ? '<button class="btn btn-o" id="rh-apagar" style="margin-right:auto;color:#b91c1c">Apagar</button>' : ''}<button class="btn btn-o" id="rh-cancelar">Cancelar</button><button class="btn btn-p" id="rh-salvar">Salvar</button></div>`);
      m.querySelector('#rh-x').onclick = fechar; m.querySelector('#rh-cancelar').onclick = fechar;
      m.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => { coletar(m); aba = b.dataset.fa; desenhar(); });
      m.querySelectorAll('[data-nota]').forEach(s => s.onchange = () => { const et = s.dataset.nota.split(':')[0]; const v = [...m.querySelectorAll(`[data-nota^="${et}:"]`)].map(x => +x.value).filter(x => x > 0); const el = m.querySelector('#rh-media-' + et); if (el) el.textContent = v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'; });
      m.querySelector('#rh-salvar').onclick = async () => {
        coletar(m);
        if (!String(c.nome || '').trim()) { aviso('Informe o nome.', 'err'); aba = 'dados'; desenhar(); return; }
        const campos = ['nome', 'telefone', 'email', 'origem', 'responsavel', 'data_entrada', 'contato', 'resposta', 'online', 'online_em', 'presencial', 'presencial_em', 'resultado', 'equipe', 'observacoes',
          'creci', 'creci_numero', 'experiencia', 'area_interesse', 'regiao', 'entrevistas', 'motivo', 'banco_talentos', 'integracao', 'aprovado_em'];
        if (c.resultado === 'aprovado' && !c.aprovado_em) c.aprovado_em = hojeIso();
        if (c.resultado !== 'aprovado') c.aprovado_em = null;
        const d = {}; campos.forEach(k => { d[k] = c[k] === '' && /_em$|^data_entrada$/.test(k) ? null : (c[k] === undefined ? null : c[k]); });
        if (!d.data_entrada) d.data_entrada = hojeIso();
        ['contato', 'resposta', 'online', 'presencial', 'creci', 'experiencia', 'area_interesse'].forEach(k => { if (d[k] == null) d[k] = ''; });
        try {
          if (id) await salvar(id, d);
          else { d.criado_por = quem(); const [r] = await db.post(T, d); if (r) _lista.unshift(r); }
          aviso('Candidato salvo.', 'ok'); fechar(); render();
        } catch (e) { aviso('Não salvou: ' + e.message, 'err'); }
      };
      const ap = m.querySelector('#rh-apagar');
      if (ap) ap.onclick = async () => {
        if (!confirm(`Apagar ${c.nome}? Os dados do candidato saem do sistema.`)) return;
        if (await db.del(T, id)) { _lista = _lista.filter(x => x.id !== id); aviso('Apagado.', 'ok'); fechar(); render(); } else aviso('Não consegui apagar.', 'err');
      };
    }
    desenhar();
  }

  // ── aba Próximas entrevistas ──
  function renderEntrevistas() {
    const corpo = document.getElementById('rh-corpo');
    const itens = [];
    _lista.forEach(c => ['online', 'presencial'].forEach(et => { if (c[et] === 'marcada' && c[et + '_em']) itens.push({ c, et, d: new Date(c[et + '_em']) }); }));
    const limite = Date.now() - 12 * 3600000;
    const prox = itens.filter(i => i.d >= limite).sort((a, b) => a.d - b.d);
    const atras = itens.filter(i => i.d < limite).sort((a, b) => b.d - a.d);
    const semData = _lista.filter(c => ['online', 'presencial'].some(et => c[et] === 'marcada' && !c[et + '_em']));
    const msgConf = i => mensagens(i.c)[i.et === 'online' ? 1 : 2][1];
    const row = (i, velha) => `<tr><td style="white-space:nowrap;font-weight:600">${i.d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td><a href="javascript:void 0" data-abre="${i.c.id}" data-et="${i.et}" style="font-weight:700;color:var(--txt)">${esc(i.c.nome)}</a><div style="font-size:12px;color:var(--muted)">${esc(i.c.telefone || '')}</div></td>
      <td>${i.et === 'online' ? 'Online' : 'Presencial'}</td><td>${esc(i.c.responsavel || '—')}</td>
      <td>${velha ? '<span style="color:#b45309;font-size:12px;font-weight:700">Marcar como realizada ou falta</span>' : (i.c.telefone ? `<a class="btn btn-o" style="text-decoration:none;padding:4px 10px;font-size:12px" target="_blank" rel="noopener" href="${wa(i.c.telefone, msgConf(i))}">Confirmar no WhatsApp</a>` : '')}</td></tr>`;
    const tabela = (l, velha) => `<div class="tw tbl"><table><thead><tr><th>Quando</th><th>Candidato</th><th>Tipo</th><th>Responsável</th><th></th></tr></thead><tbody>${l.map(i => row(i, velha)).join('')}</tbody></table></div>`;
    corpo.innerHTML = `
      <div class="card"><div class="cb"><b style="font-size:16px">Próximas entrevistas</b> <span style="color:var(--muted)">(${prox.length})</span>
        <div style="margin-top:10px">${prox.length ? tabela(prox) : '<div style="color:var(--muted);padding:12px 0">Nenhuma entrevista marcada. Na ficha do candidato, escolha “Marcada” e ponha data e hora.</div>'}</div></div></div>
      ${atras.length ? `<div class="card" style="margin-top:12px"><div class="cb"><b>Já passaram e seguem como “marcada”</b> <span style="color:var(--muted)">(${atras.length})</span><div style="margin-top:10px">${tabela(atras, true)}</div></div></div>` : ''}
      ${semData.length ? `<div class="card" style="margin-top:12px"><div class="cb"><b>Marcadas sem data</b><div style="margin-top:8px">${semData.map(c => `<a href="javascript:void 0" data-abre="${c.id}" style="display:inline-block;margin:0 10px 6px 0;font-weight:600">${esc(c.nome)}</a>`).join('')}</div></div></div>` : ''}`;
    corpo.querySelectorAll('[data-abre]').forEach(a => a.onclick = () => ficha(a.dataset.abre, a.dataset.et || 'dados'));
  }

  // ── aba Roteiro de perguntas ──
  function renderRoteiro() {
    const corpo = document.getElementById('rh-corpo');
    const grupo = (et, titulo) => {
      const l = _perg.filter(p => p.etapa === et);
      return `<div class="card" style="margin-bottom:12px"><div class="cb"><b style="font-size:15px">${titulo}</b> <span style="color:var(--muted)">(${l.filter(p => p.ativo !== false).length})</span>
        ${l.map((p, i) => `<div class="flex" style="gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--borda);${p.ativo === false ? 'opacity:.45' : ''}">
          <span style="color:var(--muted);width:22px">${i + 1}.</span>
          <input data-pt="${p.id}" value="${esc(p.texto)}" style="flex:1">
          <select data-pe="${p.id}" style="width:130px">${[['online', 'Online'], ['presencial', 'Presencial'], ['ambas', 'As duas']].map(([k, lb]) => `<option value="${k}" ${k === p.etapa ? 'selected' : ''}>${lb}</option>`).join('')}</select>
          <button class="btn btn-o" data-sobe="${p.id}" title="Subir" style="padding:4px 8px">↑</button>
          <button class="btn btn-o" data-ativo="${p.id}" title="${p.ativo === false ? 'Reativar' : 'Tirar do roteiro'}" style="padding:4px 8px">${p.ativo === false ? 'Reativar' : 'Ocultar'}</button></div>`).join('') || '<div style="color:var(--muted);padding:8px 0">Nenhuma pergunta.</div>'}
        <div class="flex" style="gap:8px;margin-top:10px"><input id="rh-nova-${et}" placeholder="Nova pergunta…" style="flex:1"><button class="btn btn-p" data-add="${et}">Adicionar</button></div></div></div>`;
    };
    corpo.innerHTML = `<div style="color:var(--muted);font-size:13px;margin-bottom:10px">Estas perguntas aparecem na ficha de cada candidato, nas abas de entrevista, para anotar as respostas. Alterar o texto salva sozinho ao sair do campo. Perguntas ocultadas somem das próximas entrevistas, mas as respostas já anotadas continuam guardadas.</div>
      ${grupo('online', 'Entrevista online')}${grupo('presencial', 'Entrevista presencial')}${grupo('ambas', 'Nas duas entrevistas')}`;
    const atual = async (id, d) => { try { const [r] = await db.patch(TP, id, d); const i = _perg.findIndex(p => p.id === id); if (i >= 0 && r) _perg[i] = r; } catch (e) { aviso('Não salvou: ' + e.message, 'err'); } };
    corpo.querySelectorAll('[data-pt]').forEach(i => i.onchange = async () => { if (!i.value.trim()) return; await atual(i.dataset.pt, { texto: i.value.trim() }); aviso('Pergunta salva.', 'ok'); });
    corpo.querySelectorAll('[data-pe]').forEach(s => s.onchange = async () => { await atual(s.dataset.pe, { etapa: s.value }); renderRoteiro(); });
    corpo.querySelectorAll('[data-ativo]').forEach(b => b.onclick = async () => { const p = _perg.find(x => x.id === b.dataset.ativo); await atual(p.id, { ativo: p.ativo === false }); renderRoteiro(); });
    corpo.querySelectorAll('[data-sobe]').forEach(b => b.onclick = async () => {
      const p = _perg.find(x => x.id === b.dataset.sobe), l = _perg.filter(x => x.etapa === p.etapa), k = l.indexOf(p); if (k <= 0) return;
      const ant = l[k - 1]; const oa = ant.ordem, op = p.ordem === oa ? oa + 1 : p.ordem;
      await atual(p.id, { ordem: oa }); await atual(ant.id, { ordem: op }); _perg.sort((a, b) => a.ordem - b.ordem); renderRoteiro();
    });
    corpo.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
      const et = b.dataset.add, i = document.getElementById('rh-nova-' + et), t = i.value.trim(); if (!t) return;
      try { const [r] = await db.post(TP, { texto: t, etapa: et, ordem: Math.max(0, ..._perg.map(p => p.ordem || 0)) + 1 }); _perg.push(r); renderRoteiro(); aviso('Pergunta adicionada.', 'ok'); }
      catch (e) { aviso('Não salvou: ' + e.message, 'err'); }
    });
  }

  // ── importar lista (colar do Excel, do WhatsApp ou de uma planilha de vagas) ──
  function lerLinhas(txt) {
    return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const partes = l.split(/\t|;|,(?=\s*\S)|\s+-\s+|\s{2,}/).map(x => x.trim()).filter(Boolean);
      let email = '', tel = '', nome = '', origem = '';
      for (const p of partes) {
        if (!email && /\S+@\S+\.\S+/.test(p)) { email = p.match(/\S+@\S+\.\S+/)[0].toLowerCase(); continue; }
        if (!tel && digitos(p).length >= 10 && digitos(p).length <= 13 && !/[a-z]{3,}/i.test(p)) { tel = p; continue; }
        const o = ORIGENS.find(x => x.toLowerCase() === p.toLowerCase()); if (!origem && o) { origem = o; continue; }
        if (!nome && /[a-zà-ú]{2,}/i.test(p)) nome = p;
      }
      if (!tel) { const m = l.match(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/); if (m) tel = m[0]; }
      if (!nome) nome = l.replace(/\S+@\S+\.\S+/, '').replace(/[\d()+\-\s]{10,}/, '').replace(/[;,\t]/g, ' ').trim();
      return { nome: nome.replace(/\s+/g, ' ').trim(), telefone: tel.trim(), email, origem };
    }).filter(x => x.nome || x.telefone || x.email);
  }
  function importar() {
    const m = modal(`<div class="mh"><div class="mt">Importar lista de candidatos</div><button class="mc" id="rh-x">×</button></div>
      <div class="mb">
        <div style="font-size:13px;color:var(--muted);margin-bottom:8px">Cole um candidato por linha: nome, telefone e e-mail, em qualquer ordem (pode colar direto do Excel). Quem já está cadastrado (mesmo telefone ou e-mail) é ignorado.</div>
        <textarea id="rh-imp-txt" rows="9" style="width:100%;font-family:monospace;font-size:12px" placeholder="Maria Souza	(11) 98888-7777	maria@email.com&#10;João Lima; 11 97777-6666"></textarea>
        <div class="flex" style="gap:10px;flex-wrap:wrap;margin-top:10px">
          <div class="fg" style="flex:1;min-width:150px"><label>Origem (para todos)</label><input id="rh-imp-origem" list="rh-imp-dl" placeholder="Ex.: Indeed"><datalist id="rh-imp-dl">${ORIGENS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>
          <div class="fg" style="flex:1;min-width:150px"><label>Responsável</label><input id="rh-imp-resp" value="${esc(meuNome())}" list="rh-imp-dl2"><datalist id="rh-imp-dl2">${RESPONSAVEIS.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>
          <div class="fg" style="flex:1;min-width:150px"><label>Entrada</label><input id="rh-imp-data" type="date" value="${hojeIso()}"></div></div>
        <div id="rh-imp-prev" style="font-size:13px"></div>
      </div>
      <div class="mf"><button class="btn btn-o" id="rh-cancelar">Cancelar</button><button class="btn btn-p" id="rh-imp-ok" disabled>Importar</button></div>`, 720);
    m.querySelector('#rh-x').onclick = fechar; m.querySelector('#rh-cancelar').onclick = fechar;
    const telsJa = new Set(_lista.map(c => digitos(c.telefone).slice(-9)).filter(x => x.length >= 8));
    const emailsJa = new Set(_lista.map(c => (c.email || '').toLowerCase()).filter(Boolean));
    let novos = [];
    const prev = () => {
      const l = lerLinhas(m.querySelector('#rh-imp-txt').value);
      const vistos = new Set();
      novos = []; let dup = 0;
      l.forEach(x => {
        const kt = digitos(x.telefone).slice(-9), ke = x.email;
        if ((kt.length >= 8 && (telsJa.has(kt) || vistos.has('t' + kt))) || (ke && (emailsJa.has(ke) || vistos.has('e' + ke)))) { dup++; return; }
        if (kt.length >= 8) vistos.add('t' + kt); if (ke) vistos.add('e' + ke);
        if (!x.nome) x.nome = x.email ? x.email.split('@')[0] : 'Sem nome';
        novos.push(x);
      });
      m.querySelector('#rh-imp-prev').innerHTML = l.length ? `<b>${novos.length}</b> para importar${dup ? ` · ${dup} já cadastrado${dup > 1 ? 's' : ''} (ignorado${dup > 1 ? 's' : ''})` : ''}
        <div class="tw tbl" style="margin-top:8px;max-height:200px;overflow:auto"><table><thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>${novos.slice(0, 50).map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.telefone)}</td><td>${esc(x.email)}</td></tr>`).join('')}</tbody></table></div>` : '';
      m.querySelector('#rh-imp-ok').disabled = !novos.length;
    };
    m.querySelector('#rh-imp-txt').oninput = prev;
    m.querySelector('#rh-imp-ok').onclick = async () => {
      const og = m.querySelector('#rh-imp-origem').value.trim(), rp = m.querySelector('#rh-imp-resp').value.trim(), dt = m.querySelector('#rh-imp-data').value || hojeIso();
      const linhas = novos.map(x => ({ nome: x.nome, telefone: x.telefone || null, email: x.email || null, origem: x.origem || og || null, responsavel: rp || null, data_entrada: dt, criado_por: quem() }));
      try { const r = await db.post(T, linhas); _lista = (r || []).concat(_lista); aviso(`${linhas.length} candidato${linhas.length > 1 ? 's' : ''} importado${linhas.length > 1 ? 's' : ''}.`, 'ok'); fechar(); render(); }
      catch (e) { aviso('Não importou: ' + e.message, 'err'); }
    };
  }

  // ── exportar CSV (abre no Excel) ──
  function exportar() {
    const L = filtrados();
    if (!L.length) { aviso('Nada para exportar no filtro atual.', 'err'); return; }
    const media = (c, et) => { const n = Object.values(((c.entrevistas || {})[et] || {}).notas || {}).filter(x => x > 0); return n.length ? (n.reduce((a, b) => a + b, 0) / n.length).toFixed(1).replace('.', ',') : ''; };
    const cols = [['Nome', c => c.nome], ['Telefone', c => c.telefone], ['E-mail', c => c.email], ['Origem', c => c.origem], ['Responsável', c => c.responsavel], ['Entrada', c => diaBr(c.data_entrada)],
      ['Região', c => c.regiao], ['CRECI', c => rot('creci', c.creci)], ['Nº CRECI', c => c.creci_numero], ['Experiência', c => rot('experiencia', c.experiencia)], ['Interesse', c => rot('area_interesse', c.area_interesse)],
      ['Contato', c => rot('contato', c.contato)], ['Resposta', c => rot('resposta', c.resposta)], ['Online', c => rot('online', c.online)], ['Data online', c => dtBr(c.online_em)], ['Nota online', c => media(c, 'online')],
      ['Presencial', c => rot('presencial', c.presencial)], ['Data presencial', c => dtBr(c.presencial_em)], ['Nota presencial', c => media(c, 'presencial')],
      ['Resultado', c => rot('resultado', c.resultado)], ['Motivo', c => c.motivo], ['Equipe', c => c.equipe], ['Aprovado em', c => c.aprovado_em ? diaBr(c.aprovado_em) : ''], ['Banco de talentos', c => c.banco_talentos ? 'sim' : ''], ['Observações', c => c.observacoes]];
    const q = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.map(c => c[0]).join(';')].concat(L.map(c => cols.map(([, f]) => q(f(c) === '—' ? '' : f(c))).join(';'))).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `candidatos-${hojeIso()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  window.Recrutamento = { abrir };
})();

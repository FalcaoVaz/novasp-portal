/* =====================================================================
   19-acervo-guess.js — Acervo Guess (locação) · consulta SÓ-LEITURA
   ---------------------------------------------------------------------
   Frente 11 do piloto (dono: Fabio; consultas: João Marcos e Renata;
   retenção: Fernanda). O backup do Guess (contratos de locação ativos e
   encerrados, imóveis, proprietários, inquilinos) vira consulta para
   gerentes dentro do módulo Gestão. Dados nas tabelas guess_* (SQL
   portal/sql/2026-09-29-acervo-guess.sql; carga por sandbox/carregar_guess.py).

   MVP (29/09/2026): busca por endereço do imóvel, nome do proprietário,
   nome do inquilino, nº do contrato ou CPF/CNPJ; filtro por situação;
   ficha completa do contrato (imóvel + partes + demais campos do Guess).
   As consultas definitivas vêm do João Marcos e da Renata.
   ===================================================================== */
(function () {
  'use strict';

  const V_CONTRATOS = 'guess_v_contratos';
  const LIMITE = 200;

  // Legenda dos códigos do Guess — A CONFIRMAR COM O FABIO (só R e A têm
  // indício forte nos dados: R = 6.451 contratos, 3.649 com data de rescisão;
  // A = 1.698, nenhum com rescisão).
  const SITUACAO = { A: 'Ativo (provável)', R: 'Rescindido (provável)', C: 'C — a confirmar', X: 'X — a confirmar',
                     E: 'E — a confirmar', S: 'S — a confirmar', J: 'J — a confirmar', P: 'P — a confirmar', T: 'T — a confirmar' };
  const TIPO_FIANCA = { C: 'Caução (provável)', F: 'Fiador (provável)', S: 'Seguro-fiança (provável)', N: 'Sem garantia (provável)', T: 'T — a confirmar', I: 'I — a confirmar' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtData = d => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
  const fmtHora = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtVal = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const podeVer = () => (typeof ehLiderGestao === 'function' ? ehLiderGestao() : false);
  const aviso = (m, t) => { if (typeof toast === 'function') toast(m, t || ''); };
  const ilike = s => '*' + String(s).replace(/[%*,()]/g, ' ').trim().replace(/\s+/g, '*') + '*';

  let _root = null, _ultimos = [];

  function abrir() {
    _root = document.getElementById('acervo-guess-root');
    if (!_root) return;
    if (!podeVer()) { _root.innerHTML = '<div class="card cb">Acesso restrito a gerentes.</div>'; return; }
    _root.innerHTML = `
      <div class="ph">
        <div><h1 class="pt">Acervo Guess — locação</h1>
          <div class="pst">Consulta só-leitura do backup do Guess (contratos ativos e encerrados, imóveis, proprietários, inquilinos). Nada aqui é editável.</div></div>
      </div>
      <div class="card ag-carimbo" style="padding:10px 14px;margin-bottom:14px;font-size:13px;border-left:4px solid var(--pri,#2563eb)">Carregando…</div>
      <div class="card" style="padding:12px 14px;margin-bottom:14px">
        <div class="flex aic" style="gap:8px;flex-wrap:wrap">
          <select id="ag-tipo" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
            <option value="endereco">Endereço do imóvel</option>
            <option value="proprietario">Nome do proprietário</option>
            <option value="inquilino">Nome do inquilino</option>
            <option value="contrato">Nº do contrato</option>
            <option value="imovel">Código do imóvel</option>
            <option value="documento">CPF / CNPJ</option>
          </select>
          <input type="text" id="ag-busca" placeholder="🔍 Digite e pressione Enter…" style="flex:1;min-width:220px;padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
          <select id="ag-sit" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
            <option value="">Todas as situações</option>
            ${Object.keys(SITUACAO).map(k => `<option value="${k}">${k} — ${esc(SITUACAO[k])}</option>`).join('')}
          </select>
          <button class="btn btn-p" id="ag-btn">Buscar</button>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">Até ${LIMITE} contratos por busca, dos mais recentes (fim de vigência) para os mais antigos. Clique na linha para abrir a ficha.</div>
      </div>
      <div id="ag-res"></div>`;
    _root.querySelector('#ag-btn').onclick = buscar;
    _root.querySelector('#ag-busca').onkeydown = e => { if (e.key === 'Enter') buscar(); };
    carimbo();
  }

  async function carimbo() {
    const el = _root.querySelector('.ag-carimbo'); if (!el) return;
    try {
      const cargas = await db.get('guess_cargas', '?select=tabela,linhas,mascarado,carregado_em&order=carregado_em.desc&limit=4');
      if (!cargas || !cargas.length) { el.innerHTML = 'Acervo ainda não carregado neste ambiente. <small>(sandbox/carregar_guess.py)</small>'; return; }
      const ult = cargas[0];
      const tot = {}; cargas.forEach(c => { if (!tot[c.tabela]) tot[c.tabela] = c.linhas; });
      el.innerHTML = `Acervo carregado em <strong>${fmtHora(ult.carregado_em)}</strong> · ` +
        Object.entries(tot).map(([t, n]) => `${t.replace('guess_', '')}: ${Number(n).toLocaleString('pt-BR')}`).join(' · ') +
        (ult.mascarado ? ' · <span style="color:#b45309;font-weight:600">dados MASCARADOS (ambiente de testes)</span>' : '');
    } catch (e) {
      el.innerHTML = `<span style="color:#dc2626">Acervo indisponível: ${esc(e.message)}</span><br><small>As tabelas guess_* já foram criadas? (sql/2026-09-29-acervo-guess.sql)</small>`;
    }
  }

  async function buscar() {
    const tipo = _root.querySelector('#ag-tipo').value;
    const termo = _root.querySelector('#ag-busca').value.trim();
    const sit = _root.querySelector('#ag-sit').value;
    const res = _root.querySelector('#ag-res');
    if (!termo && !sit) { aviso('Digite algo para buscar ou escolha uma situação.', 'err'); return; }
    res.innerHTML = '<div class="card cb" style="color:var(--muted)">Buscando…</div>';
    try {
      let q = `?select=*&order=vigencia_ate.desc.nullslast&limit=${LIMITE}`;
      if (sit) q += `&situacao=eq.${encodeURIComponent(sit)}`;
      if (termo) {
        if (tipo === 'endereco')          q += `&endereco=ilike.${encodeURIComponent(ilike(termo))}`;
        else if (tipo === 'proprietario') q += `&proprietario_nome=ilike.${encodeURIComponent(ilike(termo))}`;
        else if (tipo === 'inquilino')    q += `&or=(inquilino_nome.ilike.${encodeURIComponent(ilike(termo))},inquilino2_nome.ilike.${encodeURIComponent(ilike(termo))})`;
        else if (tipo === 'contrato')     q += `&contrato=eq.${parseInt(termo.replace(/\D/g, ''), 10) || 0}`;
        else if (tipo === 'imovel')       q += `&imovel=eq.${parseInt(termo.replace(/\D/g, ''), 10) || 0}`;
        else if (tipo === 'documento') {
          // CPF/CNPJ está nas tabelas de pessoas: acha os códigos e busca os contratos deles
          const dig = termo.replace(/\D/g, '');
          const pat = encodeURIComponent('*' + dig.split('').join('*') + '*');   // tolera pontuação
          const [cli, inq] = await Promise.all([
            db.get('guess_clientes',   `?select=codigo&cpf_cnpj=ilike.${pat}&limit=50`),
            db.get('guess_inquilinos', `?select=codigo&cpf_cnpj=ilike.${pat}&limit=50`),
          ]);
          const cc = (cli || []).map(c => c.codigo), ci = (inq || []).map(c => c.codigo);
          if (!cc.length && !ci.length) { res.innerHTML = '<div class="card cb" style="color:var(--muted)">Nenhuma pessoa com esse documento no acervo.</div>'; return; }
          const partes = [];
          if (cc.length) partes.push(`proprietario.in.(${cc.join(',')})`);
          if (ci.length) partes.push(`inquilino.in.(${ci.join(',')})`, `inquilino2.in.(${ci.join(',')})`);
          q += `&or=(${partes.join(',')})`;
        }
      }
      const dados = await db.get(V_CONTRATOS, q);
      _ultimos = dados || [];
      renderResultados(_ultimos, res);
    } catch (e) { res.innerHTML = `<div class="card cb" style="color:#dc2626">Erro na busca: ${esc(e.message)}</div>`; }
  }

  function badgeSit(s) {
    const cor = s === 'A' ? '#047857' : s === 'R' ? '#b91c1c' : '#475569';
    const bg  = s === 'A' ? '#d1fae5' : s === 'R' ? '#fee2e2' : '#e2e8f0';
    return `<span title="${esc(SITUACAO[s] || 'código do Guess')}" style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${bg};color:${cor}">${esc(s || '—')}</span>`;
  }

  function renderResultados(lista, res) {
    if (!lista.length) { res.innerHTML = '<div class="card cb" style="color:var(--muted)">Nenhum contrato encontrado.</div>'; return; }
    const ativos = lista.filter(l => l.situacao === 'A').length;
    res.innerHTML = `
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px">${lista.length} contrato(s)${lista.length >= LIMITE ? ' (limite atingido — refine a busca)' : ''} · ${ativos} com situação A</div>
      <div class="card"><div class="tw tbl"><table>
        <thead><tr><th>Contrato</th><th>Sit.</th><th>Imóvel</th><th>Proprietário</th><th>Inquilino</th><th>Vigência</th><th style="text-align:right">Aluguel</th><th>Rescisão</th></tr></thead>
        <tbody>${lista.map((c, i) => `<tr class="ag-row" data-i="${i}" style="cursor:pointer">
          <td style="font-weight:700">${c.contrato}</td>
          <td>${badgeSit(c.situacao)}</td>
          <td>${esc(c.endereco || '—')}${c.complemento ? ' ' + esc(c.complemento) : ''}<br><small style="color:var(--muted)">${esc(c.bairro || '')} · imóvel ${c.imovel ?? '—'}</small></td>
          <td>${esc(c.proprietario_nome || '—')}<br><small style="color:var(--muted)">cód. ${c.proprietario ?? '—'}</small></td>
          <td>${esc(c.inquilino_nome || '—')}${c.inquilino2_nome ? '<br><small>+ ' + esc(c.inquilino2_nome) + '</small>' : ''}</td>
          <td style="white-space:nowrap">${fmtData(c.vigencia_de)}<br>${fmtData(c.vigencia_ate)}</td>
          <td style="text-align:right;white-space:nowrap">${fmtVal(c.val_contrato)}</td>
          <td style="white-space:nowrap">${fmtData(c.data_rescisao)}</td></tr>`).join('')}</tbody>
      </table></div></div>`;
    res.querySelectorAll('.ag-row').forEach(tr => tr.onclick = () => abrirFicha(lista[+tr.dataset.i].contrato));
  }

  /* ---------- Ficha do contrato ---------------------------------------- */
  const rotulos = {
    contrato: 'Nº contrato', imovel: 'Cód. imóvel', proprietario: 'Cód. proprietário', inquilino: 'Cód. inquilino', inquilino2: 'Cód. inquilino 2', inquilino3: 'Cód. inquilino 3',
    fiador: 'Cód. fiador', fiador2: 'Cód. fiador 2', fiador3: 'Cód. fiador 3', fiador4: 'Cód. fiador 4', data_contrato: 'Data do contrato', prim_vencto: '1º vencimento',
    dia_vencto: 'Dia de vencimento', periodo_contrato: 'Período (meses)', val_contrato: 'Valor do aluguel', administracao_per: 'Administração %', administracao_val: 'Administração R$',
    intermediacao_per: 'Intermediação %', intermediacao_val: 'Intermediação R$', vigencia_de: 'Vigência de', vigencia_ate: 'Vigência até', reajuste: 'Reajuste', tipo_indice: 'Tipo de índice',
    situacao: 'Situação', situacao_j: 'Situação J', tipo_contrato: 'Tipo de contrato', tipo_mod_contrato: 'Modelo de contrato', tipo_fianca: 'Garantia', garantido: 'Garantido',
    seguro_fianca: 'Seguro-fiança', cod_seguradora: 'Cód. seguradora', valor_caucao: 'Valor da caução', data_rescisao: 'Data da rescisão', usuario_rescisao: 'Usuário da rescisão',
    hora_rescisao: 'Hora da rescisão', prox_reajuste: 'Próx. reajuste', prox_renovacao: 'Próx. renovação', ult_renovacao: 'Últ. renovação', n_renovacao: 'Nº renovações', n_meses: 'Nº meses',
    usuario_criacao: 'Criado por', data_criacao: 'Criado em', hora_criacao: 'Hora de criação', observacao: 'Observação', cob_endereco: 'Endereço de cobrança', cob_bairro: 'Bairro (cob.)',
    cob_cep: 'CEP (cob.)', cob_cidade: 'Cidade (cob.)', cob_estado: 'UF (cob.)', cob_complemento: 'Compl. (cob.)', ctrl_pasta: 'Ctrl. pasta', multa: 'Multa', juros: 'Juros',
    mes_adm: 'Mês adm.', carencia: 'Carência', declara_irrf: 'Declara IRRF',
  };
  const fmtCampo = (k, v) => {
    if (v == null || v === '') return '—';
    if (/^(data_|prim_|vigencia_|prox_|ult_)/.test(k) || k === 'cadastro' || k === 'ultima_atividade') return fmtData(v);
    if (/(_val|val_contrato|valor_|renda_)/.test(k)) return fmtVal(v);
    if (k === 'situacao') return `${esc(v)} — ${esc(SITUACAO[v] || 'a confirmar')}`;
    if (k === 'tipo_fianca') return `${esc(v)} — ${esc(TIPO_FIANCA[v] || 'a confirmar')}`;
    return esc(v);
  };
  const grade = (obj, chaves) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 14px;font-size:13px">` +
    chaves.filter(k => k in obj).map(k => `<div><div style="font-size:11px;color:var(--muted)">${esc(rotulos[k] || k)}</div><div>${fmtCampo(k, obj[k])}</div></div>`).join('') + `</div>`;
  const secao = (t, html) => `<div style="font-weight:700;font-size:13px;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--borda)">${t}</div>${html}`;
  const pessoaHTML = p => p ? `<div style="font-size:13px"><strong>${esc(p.nome)}</strong> <small style="color:var(--muted)">cód. ${p.codigo} · ${esc(p.categoria || '')}</small><br>
      ${esc([p.tipo_endereco, p.endereco, p.numero, p.complemento].filter(Boolean).join(' '))} · ${esc(p.bairro || '')} · ${esc(p.cidade || '')}/${esc(p.estado || '')} · ${esc(p.cep || '')}<br>
      <small>CPF/CNPJ ${esc(p.cpf_cnpj || '—')} · tel. ${esc(p.telefone || '—')} · ${esc(p.email || '—')}${p.conjuge ? ' · cônjuge ' + esc(p.conjuge) : ''}</small></div>` : '<div style="font-size:13px;color:var(--muted)">— não encontrado no acervo —</div>';

  async function abrirFicha(numero) {
    const old = document.getElementById('m-ag-ficha'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'mo open'; ov.id = 'm-ag-ficha';
    ov.innerHTML = `<div class="modal" style="width:860px;max-width:96vw"><div class="mh"><div class="mt">Contrato ${numero} — ficha do Guess</div><button class="mc" onclick="document.getElementById('m-ag-ficha').remove()">×</button></div><div class="mb ag-mb">Carregando…</div></div>`;
    document.body.appendChild(ov);
    const mb = ov.querySelector('.ag-mb');
    try {
      const [c] = await db.get('guess_contratos', `?contrato=eq.${numero}&limit=1`);
      if (!c) { mb.textContent = 'Contrato não encontrado.'; return; }
      const codsInq = [c.inquilino, c.inquilino2, c.inquilino3].filter(x => x != null);
      const [imv, prop, inqs] = await Promise.all([
        c.imovel != null ? db.get('guess_imoveis', `?imovel=eq.${c.imovel}&limit=1`).then(r => r && r[0]) : null,
        c.proprietario != null ? db.get('guess_clientes', `?codigo=eq.${c.proprietario}&limit=1`).then(r => r && r[0]) : null,
        codsInq.length ? db.get('guess_inquilinos', `?codigo=in.(${codsInq.join(',')})`) : [],
      ]);
      const core = Object.keys(c).filter(k => k !== 'extra');
      const extra = c.extra || {};
      mb.innerHTML =
        secao('Contrato', grade(c, ['contrato', 'situacao', 'situacao_j', 'tipo_contrato', 'tipo_mod_contrato', 'data_contrato', 'vigencia_de', 'vigencia_ate', 'periodo_contrato', 'dia_vencto', 'prim_vencto', 'val_contrato', 'reajuste', 'tipo_indice', 'prox_reajuste', 'prox_renovacao', 'ult_renovacao', 'n_renovacao', 'n_meses'])) +
        secao('Garantia e taxas', grade(c, ['tipo_fianca', 'garantido', 'seguro_fianca', 'cod_seguradora', 'valor_caucao', 'administracao_per', 'administracao_val', 'intermediacao_per', 'intermediacao_val', 'multa', 'juros', 'carencia', 'mes_adm', 'declara_irrf'])) +
        secao('Rescisão', grade(c, ['data_rescisao', 'usuario_rescisao', 'hora_rescisao'])) +
        secao(`Imóvel ${c.imovel ?? ''}`, imv ? `<div style="font-size:13px"><strong>${esc(imv.endereco || '—')}</strong>${imv.complemento ? ' ' + esc(imv.complemento) : ''} · ${esc(imv.bairro || '')} · ${esc(imv.cidade || '')}/${esc(imv.estado || '')} · CEP ${esc(imv.cep || '—')}<br>
            <small>situação ${esc(imv.situacao || '—')} · pasta ${imv.pasta ?? '—'} · administração ${imv.administracao ?? '—'} · matrícula ${esc(imv.nro_reg_matric_imovel || '—')} · contrib. ${esc(imv.daem_n_contrib || '—')}</small></div>` : '<div style="font-size:13px;color:var(--muted)">— não encontrado no acervo —</div>') +
        secao(`Proprietário ${c.proprietario ?? ''}`, pessoaHTML(prop)) +
        secao('Inquilino(s)', codsInq.length ? codsInq.map(cod => pessoaHTML((inqs || []).find(p => p.codigo === cod))).join('<div style="height:6px"></div>') : '<div style="font-size:13px;color:var(--muted)">—</div>') +
        secao('Cobrança e criação', grade(c, ['cob_endereco', 'cob_complemento', 'cob_bairro', 'cob_cidade', 'cob_estado', 'cob_cep', 'usuario_criacao', 'data_criacao', 'hora_criacao', 'observacao', 'ctrl_pasta', 'fiador', 'fiador2', 'fiador3', 'fiador4'])) +
        (Object.keys(extra).length ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-size:13px;color:var(--muted)">Demais campos do Guess (${Object.keys(extra).length})</summary>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 14px;font-size:12px;margin-top:8px">${Object.entries(extra).map(([k, v]) => `<div><span style="color:var(--muted)">${esc(k)}</span>: ${esc(v)}</div>`).join('')}</div></details>` : '');
    } catch (e) { mb.innerHTML = `<span style="color:#dc2626">Erro: ${esc(e.message)}</span>`; }
  }

  window.AcervoGuess = { abrir, buscar, abrirFicha, SITUACAO, TIPO_FIANCA };
})();

// ════════════════════════════════════════════════════════
// GESTÃO DE VENDAS
// Sub-módulos:
//   1. Seleção de Imóveis (implementado)
//   2. Controle de Presença (em construção)
//   3. Cotas de Anúncios (em construção)
//   4. Agenda do Fotógrafo (em construção)
// ════════════════════════════════════════════════════════

let _selEditId = null;
const _EQUIPES_PADRAO = ['Aguia','Chris','Emilia','Felippe','Fenix'];

// ── SELEÇÃO DE IMÓVEIS ──────────────────────────────────────

// Marca como 'expirado' qualquer 'aprovado' cujo ativo_ate ja venceu.
// Roda no carregamento da Selecao (todo gerente ve sempre o estado atualizado).
// PostgREST: 1 PATCH com filtro server-side, sem N requests.
let _expSweepUltimaData = null;
async function _expirarVencidosSelecao(){
  const hoje = new Date().toISOString().slice(0,10);
  // Roda 1x por dia por sessao (evita PATCH desnecessario a cada navegacao)
  if (_expSweepUltimaData === hoje) return;
  try {
    const url = SBU + '/rest/v1/vendas_selecao_imoveis?status=eq.aprovado&ativo_ate=lt.' + hoje;
    await fetch(url, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ status: 'expirado' })
    });
    _expSweepUltimaData = hoje;
  } catch(_) { /* silencioso */ }
}

async function carregarSelecaoImoveis(){
  const tbody = document.getElementById('tb-vnd-selecao');
  if (!tbody) { console.warn('Selecao: tbody nao encontrado'); return; }

  // Feedback imediato (substitui o "Carregando..." inicial do HTML
  // caso a query demore ou caia silenciosamente)
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#94a3b8">⏳ Buscando imóveis…</td></tr>';

  // Auto-expira aprovados vencidos em background — NAO bloqueia o load.
  // Se falhar (rede/RLS), o sweep do proximo carregamento tenta de novo.
  _expirarVencidosSelecao();

  // Popula filtro de equipes uma vez
  const selEq = document.getElementById('filt-sel-equipe');
  if (selEq && selEq.options.length <= 1) {
    selEq.innerHTML = '<option value="">Todas equipes</option>' +
      _EQUIPES_PADRAO.map(e=>`<option value="${e}">${e}</option>`).join('');
  }
  // Popula filtro de ciclos mensais (ultimos 12) uma vez
  const selMs = document.getElementById('filt-sel-mes');
  if (selMs && selMs.options.length <= 1) {
    const cicloAtual = _cicloAtualYm();
    const meses = [];
    for (let i=0; i<12; i++) {
      const partes = cicloAtual.match(/^(\d{4})-(\d{2})$/);
      const y = Number(partes[1]);
      const m = Number(partes[2]) - 1 - i;
      const d = new Date(y, m, 15);
      const ym = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      meses.push(ym);
    }
    selMs.innerHTML = '<option value="">Todos ciclos</option>' +
      meses.map(ym => `<option value="${ym}">${_ymLabel(ym)}${ym===cicloAtual?' (atual)':''}</option>`).join('');
  }

  const status = document.getElementById('filt-sel-status')?.value || '';
  const equipe = document.getElementById('filt-sel-equipe')?.value || '';
  const mes    = document.getElementById('filt-sel-mes')?.value || '';
  const busca  = document.getElementById('filt-sel-busca')?.value?.toLowerCase() || '';

  // KPIs respeitam equipe e ciclo (status/busca nao — status eh o
  // proprio agrupador dos KPIs, busca eh filtro local em texto)
  _atualizarKpisSelecao({equipe, mes});

  // Filtros base (sem embed, pra ser robusto se FK/relacao quebrar)
  let qBase = '?order=criado_em.desc&limit=500';
  if (status) qBase += `&status=eq.${status}`;
  if (equipe) qBase += `&equipe=eq.${encodeURIComponent(equipe)}`;
  if (mes)    qBase += `&mes_referencia=eq.${encodeURIComponent(mes)}`;

  let dados;
  try {
    // Tenta primeiro com embed do usuario que enviou (pra mostrar quem enviou)
    try {
      dados = await db.get('vendas_selecao_imoveis',
        '?select=*,enviado_por:usuarios!vendas_selecao_imoveis_enviado_por_id_fkey(nome)' + qBase.slice(1));
      console.log('Selecao: query com embed OK, ' + (dados?.length||0) + ' registros');
    } catch(eEmbed) {
      console.warn('Selecao: embed falhou, retry sem join:', eEmbed.message);
      dados = await db.get('vendas_selecao_imoveis', qBase);
      console.log('Selecao: query simples OK, ' + (dados?.length||0) + ' registros');
    }
  } catch(e) {
    console.error('Selecao: erro definitivo', e);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--danger)">
      <b>Erro ao carregar imóveis</b><br>
      <code style="font-size:11px">${e.message}</code><br>
      <small style="display:block;margin-top:8px">Verifique no DevTools (F12 → Console) e confirme se a tabela <code>vendas_selecao_imoveis</code> existe no Supabase.</small>
    </td></tr>`;
    return;
  }

  dados = dados || [];

  // Busca textual
  let filtrados = dados;
  if (busca) {
    filtrados = filtrados.filter(d =>
      (d.codigo||'').toLowerCase().includes(busca) ||
      (d.corretor||'').toLowerCase().includes(busca) ||
      (d.endereco||'').toLowerCase().includes(busca)
    );
  }

  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#94a3b8">Nenhum imóvel encontrado.</td></tr>';
    return;
  }

  const podeFazerPeneira = (typeof ehGerenteVendas === 'function') && ehGerenteVendas();

  const stMap = {
    pendente:   ['badge-amber','⏳ Pendente'],
    aprovado:   ['badge-green','✅ Aprovado'],
    reprovado:  ['badge-red','❌ Reprovado'],
    vendido:    ['badge-blue','💰 Vendido'],
    expirado:   ['badge-gray','⏱️ Expirado'],
    removido:   ['badge-gray','🗑️ Removido']
  };

  tbody.innerHTML = filtrados.map(d => {
    const st = stMap[d.status] || ['badge-gray', d.status];
    const stTxt = st[1];
    const stCls = st[0];
    // Mostra so o mes de referencia (ciclo). ativo_ate eh interno pra expirar.
    const mesRefLbl = d.mes_referencia ? _ymLabel(d.mes_referencia) : '—';
    const diasRest = d.ativo_ate ? Math.ceil((new Date(d.ativo_ate+'T12:00:00') - new Date())/86400000) : null;
    const mesCor = diasRest === null ? '' : diasRest < 0 ? 'color:var(--danger)' : diasRest <= 14 ? 'color:var(--amber)' : '';
    const isInativo = ['reprovado','vendido','expirado','removido'].includes(d.status);
    const trStyle = isInativo ? 'opacity:.6;background:#f8fafc' : '';

    let acoes = `<button class="btn btn-o bxs" onclick="abrirEditarImovelSelecao('${d.id}')" title="Editar">✏️</button>`;
    if (podeFazerPeneira && d.status === 'pendente') {
      acoes = `<button class="btn btn-p bxs" onclick="aprovarImovel('${d.id}')" title="Aprovar">✅ Aprovar</button>
               <button class="btn btn-o bxs" style="color:var(--danger)" onclick="reprovarImovel('${d.id}')" title="Reprovar">❌</button>` + acoes;
    }
    if (d.status === 'aprovado') {
      acoes += `<button class="btn btn-o bxs" style="color:var(--pri)" onclick="marcarVendido('${d.id}','${(d.codigo||'')}')" title="Marcar como vendido">💰</button>`;
    }
    acoes += `<button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirImovelSelecao('${d.id}','${(d.codigo||'')}')" title="Excluir">🗑️</button>`;

    const codHtml = d.link_imovel
      ? `<a href="${d.link_imovel}" target="_blank" rel="noopener" title="Abrir anúncio do imóvel" style="color:var(--pri);text-decoration:none;font-weight:600;font-family:monospace;font-size:13px">${d.codigo||'—'} 🔗</a>`
      : `<div style="font-weight:600;font-size:13px;font-family:monospace">${d.codigo||'—'}</div>`;
    return `<tr style="${trStyle}">
      <td>${codHtml}</td>
      <td style="font-size:12px">${(d.endereco||'—').substring(0,40)}</td>
      <td style="font-size:12px">${d.metragem ? Number(d.metragem).toLocaleString('pt-BR') : '—'}</td>
      <td style="font-size:12px">${d.tempo_venda||'—'}</td>
      <td style="font-size:12px">${d.corretor||'—'}</td>
      <td style="font-size:12px">${d.equipe||'—'}</td>
      <td><span class="badge ${stCls}">${stTxt}</span></td>
      <td style="font-size:12px;font-weight:600;${mesCor}">${mesRefLbl}</td>
      <td><div class="flex" style="gap:4px;flex-wrap:wrap">${acoes}</div></td>
    </tr>`;
  }).join('');
}

// Gera XLSX modelo pra equipes preencherem — com colunas certas, exemplo
// e uma aba de instrucoes. Usa SheetJS (ja carregado pro upload).
function baixarModeloSelecao(){
  if (typeof XLSX === 'undefined') {
    alert('SheetJS não carregou. Recarregue a página com internet.');
    return;
  }

  // Aba 1: dados — colunas na ordem que o parser reconhece + 1 exemplo
  const cabecalhos = [
    'Código', 'Endereço', 'Corretor', 'M²', 'Tempo de venda',
    'Outras opções no prédio', 'Link do imóvel'
  ];
  const exemplo = [
    'BI50125',
    'Rua Domingos de Morais, 123 – ap 42',
    'João Silva',
    75.5,
    '6 meses',
    'Ap 41 (frente) R$ 950k · Ap 52 (posterior) R$ 890k',
    'https://novasaopaulo.com.br/imovel/BI50125'
  ];
  // 20 linhas em branco pra preencher
  const linhasBrancas = Array.from({length: 20}, () => cabecalhos.map(() => ''));

  const dadosSheet = XLSX.utils.aoa_to_sheet([cabecalhos, exemplo, ...linhasBrancas]);
  // Larguras aproximadas por coluna
  dadosSheet['!cols'] = [
    {wch: 12}, {wch: 42}, {wch: 20}, {wch: 8}, {wch: 14},
    {wch: 45}, {wch: 45}
  ];

  // Aba 2: instrucoes
  const instrucoes = [
    ['SELEÇÃO DE IMÓVEIS — MODELO DE UPLOAD MENSAL'],
    [''],
    ['Preencha a aba "Imóveis" com os imóveis do mês da sua equipe.'],
    ['Apague a linha de exemplo antes de importar (ou deixe — o sistema ignora se o código já existir).'],
    [''],
    ['COLUNAS'],
    [''],
    ['Código', 'OBRIGATÓRIO. Sem ele a linha é ignorada. Ex: BI50125'],
    ['Endereço', 'Rua, número, bairro, complemento se útil.'],
    ['Corretor', 'Nome do corretor responsável — primeiro nome já basta.'],
    ['M²', 'Área útil em número. Aceita 75, 75.5 ou 75,5.'],
    ['Tempo de venda', 'Livre. Ex: "6 meses", "1 ano", "novo".'],
    ['Outras opções no prédio', 'Outras unidades disponíveis no mesmo prédio (referência + valor).'],
    ['Link do imóvel', 'URL do anúncio ou ficha interna. Sistema torna o código clicável.'],
    [''],
    ['DICAS'],
    [''],
    ['✓ Não precisa ser em xlsx — csv também funciona.'],
    ['✓ Nomes das colunas podem variar. O sistema reconhece Codigo/Cod/Referencia,'],
    ['   Endereço/Rua/Logradouro, Corretor/Responsável, Metragem/Area/M2, etc.'],
    ['✓ Cada linha vira 1 imóvel pendente na peneira — os 5 votantes decidem.'],
    ['✓ Aprovados ficam ativos por 3 meses.'],
    [''],
    ['DÚVIDAS'],
    [''],
    ['Fale com Rodrigo. Portal: https://novasp.netlify.app'],
  ];
  const instrSheet = XLSX.utils.aoa_to_sheet(instrucoes);
  instrSheet['!cols'] = [{wch: 30}, {wch: 80}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dadosSheet, 'Imóveis');
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instruções');

  const nomeArq = 'modelo-selecao-imoveis-nova-sp.xlsx';
  XLSX.writeFile(wb, nomeArq);
}

// Gera PDF (via window.print) dos aprovados ativos, agrupados por equipe.
// Corretores usam pra visualizar o portfolio atual — enviamos por WhatsApp/email.
async function gerarPdfSelecao(){
  const hoje = new Date().toISOString().slice(0,10);
  let dados;
  try {
    dados = await db.get('vendas_selecao_imoveis',
      `?status=eq.aprovado&ativo_ate=gte.${hoje}&order=equipe.asc,corretor.asc,codigo.asc&limit=1000`);
  } catch(e) {
    alert('Erro ao buscar imóveis: ' + e.message);
    return;
  }
  dados = dados || [];
  if (!dados.length) {
    alert('Nenhum imóvel aprovado ativo pra gerar PDF.');
    return;
  }

  const hoje_fmt = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const equipes = {};
  dados.forEach(d => {
    const eq = d.equipe || '—';
    (equipes[eq] = equipes[eq] || []).push(d);
  });
  const nEquipes = Object.keys(equipes).length;

  const esc = s => String(s||'').replace(/[&<>"']/g, ch => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
  ));

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Seleção de Imóveis — ${hoje_fmt}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm; }
  html, body { margin:0; padding:0; font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#1e293b; }
  header {
    display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #1E2D4A; padding-bottom:8px; margin-bottom:14px;
  }
  header h1 { margin:0; font-size:20pt; color:#1E2D4A; letter-spacing:-.01em; }
  header .sub { font-size:9pt; color:#64748b; margin-top:2px }
  header .meta { text-align:right; font-size:9pt; color:#475569 }
  header .meta b { display:block; font-size:11pt; color:#1E2D4A }
  .totais { display:flex; gap:10px; margin-bottom:16px }
  .kpi { flex:1; padding:8px 10px; background:#f8fafc; border-left:3px solid #3B82F6; border-radius:3px }
  .kpi .lbl { font-size:8pt; color:#64748b; text-transform:uppercase; letter-spacing:.05em; font-weight:600 }
  .kpi .val { font-size:16pt; font-weight:800; color:#1E2D4A; margin-top:2px }
  h2.eq {
    font-size:12pt; color:#fff; background:#1E2D4A;
    padding:5px 10px; border-radius:3px; margin:14px 0 0 0;
    display:flex; justify-content:space-between; align-items:baseline;
    page-break-after:avoid;
  }
  h2.eq .cnt { font-size:9pt; font-weight:500; opacity:.85 }
  table { width:100%; border-collapse:collapse; margin-top:4px; font-size:9pt; }
  th { background:#e2e8f0; padding:5px 6px; text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.03em; color:#334155; border-bottom:1px solid #cbd5e1 }
  td { padding:5px 6px; border-bottom:1px solid #f1f5f9; vertical-align:top }
  tr:nth-child(even) td { background:#fafbfc }
  td.cod { font-family:monospace; font-weight:600; color:#1E2D4A; white-space:nowrap }
  td.small { font-size:8pt; color:#64748b }
  .obs { font-size:8pt; color:#64748b; font-style:italic; padding:3px 6px 8px }
  footer { margin-top:16px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:8pt; color:#94a3b8; text-align:center }
  .btn-print {
    position:fixed; top:12px; right:12px;
    background:#3B82F6; color:#fff; border:none;
    padding:10px 18px; border-radius:8px; font-size:13px; font-weight:600;
    cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.15); z-index:999;
  }
  @media print { .btn-print { display:none } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ Salvar como PDF</button>

<header>
  <div>
    <h1>Seleção de Imóveis</h1>
    <div class="sub">Nova São Paulo Imobiliária · Imóveis aprovados e ativos</div>
  </div>
  <div class="meta">
    <b>${hoje_fmt}</b>
    ${dados.length} imóveis · ${nEquipes} equipes
  </div>
</header>

<div class="totais">
  <div class="kpi"><div class="lbl">Total ativo</div><div class="val">${dados.length}</div></div>
  <div class="kpi"><div class="lbl">Equipes</div><div class="val">${nEquipes}</div></div>
  <div class="kpi"><div class="lbl">Corretores</div><div class="val">${new Set(dados.map(d=>d.corretor).filter(Boolean)).size}</div></div>
</div>

${Object.entries(equipes).map(([eq, arr]) => `
  <h2 class="eq">${esc(eq)} <span class="cnt">${arr.length} imóve${arr.length>1?'is':'l'}</span></h2>
  <table>
    <thead>
      <tr>
        <th style="width:70px">Código</th>
        <th>Endereço</th>
        <th style="width:50px">m²</th>
        <th style="width:60px">Tempo venda</th>
        <th style="width:120px">Corretor</th>
        <th style="width:55px">Ciclo</th>
      </tr>
    </thead>
    <tbody>
      ${arr.map(d => {
        const cicloLbl = d.mes_referencia ? _ymLabel(d.mes_referencia) : '—';
        const mt = d.metragem ? Number(d.metragem).toLocaleString('pt-BR') : '—';
        const obsHtml = (d.outras_infos||d.observacoes) ? `<tr><td colspan="6" class="obs">📌 ${esc(d.outras_infos||'')}${d.observacoes?` · ${esc(d.observacoes)}`:''}</td></tr>` : '';
        const codCell = d.link_imovel
          ? `<a href="${esc(d.link_imovel)}" target="_blank" style="color:#1E2D4A;text-decoration:none">${esc(d.codigo||'—')} 🔗</a>`
          : esc(d.codigo||'—');
        return `
        <tr>
          <td class="cod">${codCell}</td>
          <td>${esc(d.endereco||'—')}</td>
          <td class="small">${mt}</td>
          <td class="small">${esc(d.tempo_venda||'—')}</td>
          <td class="small">${esc(d.corretor||'—')}</td>
          <td class="small">${cicloLbl}</td>
        </tr>
        ${obsHtml}
      `;}).join('')}
    </tbody>
  </table>
`).join('')}

<footer>
  Documento gerado automaticamente pelo Portal Nova SP em ${new Date().toLocaleString('pt-BR')} · Imóveis com validade expirada não constam.
</footer>

<script>
  // Auto-abre dialogo de impressao apos load
  window.addEventListener('load', () => setTimeout(() => window.print(), 400));
<\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('O navegador bloqueou a janela pop-up. Libere pra este site e tente de novo.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// KPIs respeitam os filtros de equipe/ciclo (nao aplica status — ele
// eh o proprio agrupador — nem busca — eh texto local).
async function _atualizarKpisSelecao(filtros){
  try {
    let q = '?select=status,ativo_ate&limit=2000';
    if (filtros?.equipe) q += `&equipe=eq.${encodeURIComponent(filtros.equipe)}`;
    if (filtros?.mes)    q += `&mes_referencia=eq.${encodeURIComponent(filtros.mes)}`;
    const all = await db.get('vendas_selecao_imoveis', q);
    const hoje = new Date().toISOString().slice(0,10);
    let pend=0, ativos=0, vend=0, fora=0;
    for (const d of all||[]) {
      if (d.status === 'pendente') pend++;
      else if (d.status === 'aprovado' && (!d.ativo_ate || d.ativo_ate >= hoje)) ativos++;
      else if (d.status === 'vendido') vend++;
      else fora++;
    }
    document.getElementById('kpi-sel-pend').textContent = pend;
    document.getElementById('kpi-sel-ativos').textContent = ativos;
    document.getElementById('kpi-sel-vendidos').textContent = vend;
    document.getElementById('kpi-sel-fora').textContent = fora;
  } catch(_){}
}

function abrirNovoImovelSelecao(){
  _selEditId = null;
  document.getElementById('m-vnd-sel-titulo').textContent = '+ Enviar Imóvel para Seleção';
  ['sel-codigo','sel-corretor','sel-m2','sel-endereco','sel-link','sel-tempo','sel-outras','sel-obs']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const eq = document.getElementById('sel-equipe'); if (eq) eq.selectedIndex = 0;
  openM('m-vnd-sel');
}

async function abrirEditarImovelSelecao(id){
  try {
    const list = await db.get('vendas_selecao_imoveis', `?id=eq.${id}&select=*`);
    const d = list?.[0];
    if (!d) { toast('Imóvel não encontrado.','err'); return; }
    _selEditId = id;
    document.getElementById('m-vnd-sel-titulo').textContent = '✏️ Editar Imóvel';
    document.getElementById('sel-codigo').value    = d.codigo||'';
    document.getElementById('sel-corretor').value  = d.corretor||'';
    document.getElementById('sel-m2').value        = d.metragem||'';
    document.getElementById('sel-endereco').value  = d.endereco||'';
    const linkEl = document.getElementById('sel-link');
    if (linkEl) linkEl.value = d.link_imovel||'';
    document.getElementById('sel-tempo').value     = d.tempo_venda||'';
    document.getElementById('sel-outras').value    = d.outras_opcoes||'';
    document.getElementById('sel-obs').value       = d.observacoes||'';
    const eq = document.getElementById('sel-equipe');
    if (eq) {
      for (let i=0;i<eq.options.length;i++) if (eq.options[i].value===(d.equipe||'')) { eq.selectedIndex=i; break; }
    }
    openM('m-vnd-sel');
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function salvarImovelSelecao(){
  const codigo = document.getElementById('sel-codigo')?.value?.trim();
  if (!codigo) { toast('Informe o código do imóvel.','err'); return; }
  const m2Str = document.getElementById('sel-m2')?.value;
  const payload = {
    codigo,
    corretor:      document.getElementById('sel-corretor')?.value || null,
    metragem:      m2Str ? parseFloat(m2Str) : null,
    endereco:      document.getElementById('sel-endereco')?.value || null,
    link_imovel:   document.getElementById('sel-link')?.value?.trim() || null,
    tempo_venda:   document.getElementById('sel-tempo')?.value || null,
    outras_opcoes: document.getElementById('sel-outras')?.value || null,
    observacoes:   document.getElementById('sel-obs')?.value || null,
    equipe:        document.getElementById('sel-equipe')?.value || null
  };

  try {
    if (_selEditId) {
      await db.patch('vendas_selecao_imoveis', _selEditId, payload);
      toast('✅ Imóvel atualizado.','ok');
    } else {
      payload.enviado_por_id = CUR?.id || null;
      payload.status = 'pendente';
      // Cadastro manual: mesmo criterio do upload em massa (mes calendario).
      // Peneira depois respeita este ciclo, nao sobrescreve.
      payload.mes_referencia = _mesAtual();
      await db.post('vendas_selecao_imoveis', payload);
      toast('✅ Imóvel enviado para peneira (ciclo '+_ymLabel(payload.mes_referencia)+').','ok');
    }
    _selEditId = null;
    closeM('m-vnd-sel');
    carregarSelecaoImoveis();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

function _recarregarTelaSelecaoAtiva(){
  if (document.getElementById('p-vnd-peneira')?.classList.contains('active')) carregarPeneiraSelecao();
  else carregarSelecaoImoveis();
}

async function aprovarImovel(id){
  if (!confirm('Aprovar este imóvel? Ele fica ativo até o fim do ciclo de 3 meses (dia 9 do 3º mês seguinte ao ciclo).')) return;
  // O ciclo (mes_referencia) SEMPRE vem do imovel — foi definido no upload
  // ou no cadastro. Aqui a gente NUNCA sobrescreve. Se por algum motivo
  // esta null (imovel antigo), usa o ciclo atual como fallback E LOGA.
  let mesRef = null;
  try {
    const arr = await db.get('vendas_selecao_imoveis', `?id=eq.${id}&select=mes_referencia`);
    mesRef = arr?.[0]?.mes_referencia || null;
  } catch(_) {}
  if (!mesRef) {
    mesRef = _cicloAtualYm();
    console.warn('[selecao] imovel', id, 'sem mes_referencia — aplicando ciclo atual', mesRef);
  }
  const ativoAte = _ativoAteDeCiclo(mesRef);
  try {
    await db.patch('vendas_selecao_imoveis', id, {
      status: 'aprovado',
      aprovado_em: new Date().toISOString(),
      aprovado_por_id: CUR?.id || null,
      mes_referencia: mesRef,
      ativo_ate: ativoAte
    });
    toast('✅ Imóvel aprovado — ciclo '+_ymLabel(mesRef)+' · ativo até '+new Date(ativoAte+'T12:00:00').toLocaleDateString('pt-BR'),'ok');
    _recarregarTelaSelecaoAtiva();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function reprovarImovel(id){
  const motivo = prompt('Motivo da reprovação? (opcional)') || '';
  try {
    await db.patch('vendas_selecao_imoveis', id, {
      status: 'reprovado',
      motivo_reprovacao: motivo,
      aprovado_por_id: CUR?.id || null,
      aprovado_em: new Date().toISOString()
    });
    toast('Imóvel reprovado.','ok');
    _recarregarTelaSelecaoAtiva();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function marcarVendido(id, codigo){
  if (!confirm(`Marcar imóvel ${codigo} como vendido? Ele sai da seleção ativa.`)) return;
  try {
    await db.patch('vendas_selecao_imoveis', id, { status: 'vendido' });
    toast('💰 Marcado como vendido. Parabéns!','ok');
    carregarSelecaoImoveis();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function excluirImovelSelecao(id, codigo){
  if (!confirm(`Excluir ${codigo} da seleção? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.del('vendas_selecao_imoveis', id);
    toast('🗑️ Imóvel removido.','ok');
    carregarSelecaoImoveis();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

// ─── UPLOAD DE PLANILHA DO MÊS (por equipe) ──────────────────
let _uploadLinhas = [];   // [{codigo, endereco, corretor, metragem, tempo_venda, outras_opcoes}]

function abrirUploadSelecao(){
  _uploadLinhas = [];
  document.getElementById('up-sel-equipe').selectedIndex = 0;
  const inpMes = document.getElementById('up-sel-mes');
  // Default = MES CALENDARIO (nao o pivo dia 10): upload feito nos dias
  // 1-9 prepara o ciclo que abre dia 10 do proprio mes. O default antigo
  // (_cicloAtualYm) marcava o mes anterior e causou a leva da Emilia
  // entrando como julho em ago/2026.
  if (inpMes) inpMes.value = _mesAtual();
  document.getElementById('up-sel-arq').value = '';
  document.getElementById('up-sel-info').textContent = '';
  document.getElementById('up-sel-preview').innerHTML = '';
  document.getElementById('up-sel-importar').disabled = true;
  // Se for assistente de uma equipe específica, pré-seleciona
  const minhasEqs = equipesDoGerente();
  if (minhasEqs.length === 1) {
    const sel = document.getElementById('up-sel-equipe');
    for (let i=0;i<sel.options.length;i++) if (sel.options[i].value === minhasEqs[0]) { sel.selectedIndex=i; break; }
  }
  openM('m-vnd-upload');
}

// Normaliza chave de coluna pra fuzzy-match com header da planilha
function _normColKey(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

// Mapeia headers da planilha → campo interno. Cada campo tem sinônimos.
const _COL_SINONIMOS = {
  codigo:        ['codigo','cod','codimovel','codigoimovel','referencia','ref'],
  endereco:      ['endereco','endereço','address','rua','logradouro'],
  corretor:      ['corretor','responsavel','agente','vendedor'],
  metragem:      ['metragem','m2','area','arearuneada','arearuneadam2'],
  tempo_venda:   ['tempovenda','tempo','tempodevenda','desde'],
  outras_opcoes: ['outrasopcoes','outras','opcoes','outrasopcoesnopredio'],
  link_imovel:   ['link','url','anuncio','linkimovel','linkanuncio','ficha','sitelink']
};

function _detectarColunas(headersRaw){
  const map = {}; // {campo: indice}
  const heads = headersRaw.map(h => _normColKey(h));
  for (const [campo, sinonimos] of Object.entries(_COL_SINONIMOS)) {
    for (let i=0; i<heads.length; i++) {
      if (sinonimos.some(s => heads[i].includes(s))) { map[campo] = i; break; }
    }
  }
  return map;
}

async function parsearArquivoSelecao(){
  const arq = document.getElementById('up-sel-arq')?.files?.[0];
  if (!arq) return;
  const info = document.getElementById('up-sel-info');
  const prev = document.getElementById('up-sel-preview');
  const btn  = document.getElementById('up-sel-importar');
  info.textContent = 'Lendo arquivo...';
  prev.innerHTML = '';
  btn.disabled = true;

  if (typeof XLSX === 'undefined') {
    info.innerHTML = '<span style="color:var(--danger)">⚠ SheetJS não carregou — recarregue a página com internet.</span>';
    return;
  }

  try {
    const buf = await arq.arrayBuffer();
    const wb  = XLSX.read(buf, { type:'array', raw:false });
    // Usa a primeira planilha
    const ws  = wb.Sheets[wb.SheetNames[0]];
    // Header: usa primeira linha como cabeçalho
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false, blankrows:false });
    if (rows.length < 2) { info.textContent = 'Planilha vazia ou sem dados.'; return; }

    const headers = rows[0].map(x => String(x||'').trim());
    const map = _detectarColunas(headers);
    if (map.codigo === undefined) {
      info.innerHTML = `<span style="color:var(--danger)">⚠ Não achei coluna de <b>código</b>. Cabeçalhos detectados: ${headers.join(' | ')}</span>`;
      return;
    }

    _uploadLinhas = [];
    for (let i=1; i<rows.length; i++) {
      const r = rows[i];
      const get = (campo) => map[campo] !== undefined ? String(r[map[campo]]||'').trim() : '';
      const codigo = get('codigo');
      if (!codigo) continue;
      _uploadLinhas.push({
        codigo,
        endereco:      get('endereco'),
        corretor:      get('corretor'),
        metragem:      get('metragem'),
        tempo_venda:   get('tempo_venda'),
        outras_opcoes: get('outras_opcoes'),
        link_imovel:   get('link_imovel')
      });
    }

    if (!_uploadLinhas.length) { info.textContent = 'Nenhuma linha com código encontrada.'; return; }

    const mapadasTxt = Object.entries(map).map(([k,i]) => `${k} ← <b>${headers[i]}</b>`).join(' · ');
    info.innerHTML = `✅ <b>${_uploadLinhas.length}</b> imóveis lidos. Colunas: ${mapadasTxt}`;

    // Preview da tabela (primeiras 25 linhas)
    const amostra = _uploadLinhas.slice(0, 25);
    prev.innerHTML = `
      <div class="card" style="padding:0;margin-top:8px;overflow:hidden">
        <div class="tw tbl" style="max-height:300px;overflow:auto"><table>
          <thead><tr>
            <th>Código</th><th>Endereço</th><th>Corretor</th><th>M²</th><th>Tempo venda</th>
          </tr></thead>
          <tbody>${amostra.map(l => `<tr>
            <td style="font-family:monospace">${l.codigo}</td>
            <td style="font-size:12px">${l.endereco||'—'}</td>
            <td style="font-size:12px">${l.corretor||'—'}</td>
            <td style="font-size:12px">${l.metragem||'—'}</td>
            <td style="font-size:12px">${l.tempo_venda||'—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        ${_uploadLinhas.length > 25 ? `<div style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:center;border-top:1px solid var(--borda)">... e mais ${_uploadLinhas.length-25} linhas</div>` : ''}
      </div>`;
    btn.disabled = false;
  } catch(e) {
    info.innerHTML = `<span style="color:var(--danger)">Erro ao ler arquivo: ${e.message}</span>`;
  }
}

async function importarSelecao(){
  const equipe = document.getElementById('up-sel-equipe')?.value;
  if (!equipe) { toast('Escolha a equipe.','err'); return; }
  if (!_uploadLinhas.length) { toast('Nenhuma linha pra importar.','err'); return; }
  const mes = document.getElementById('up-sel-mes')?.value || _mesAtual();

  const btn = document.getElementById('up-sel-importar');
  btn.disabled = true;
  btn.textContent = 'Verificando duplicatas...';

  try {
    // Antes de inserir, checa quais códigos JÁ EXISTEM como aprovados
    // em ciclos anteriores. Regra: mantém o ciclo mais antigo — imóvel
    // que já foi aprovado antes NÃO entra de novo.
    const codigos = _uploadLinhas.map(l => String(l.codigo).toUpperCase());
    const idsIn = `(${codigos.map(c => `"${c}"`).join(',')})`;
    let jaExistem = [];
    try {
      jaExistem = await db.get('vendas_selecao_imoveis',
        `?status=eq.aprovado&codigo=in.${idsIn}&select=codigo,mes_referencia`) || [];
    } catch(_) {}
    const setJa = new Set(jaExistem.map(r => String(r.codigo).toUpperCase()));

    const ignorados = _uploadLinhas.filter(l => setJa.has(String(l.codigo).toUpperCase()));
    const novos = _uploadLinhas.filter(l => !setJa.has(String(l.codigo).toUpperCase()));

    if (ignorados.length) {
      const listaIgn = ignorados.slice(0,10).map(l => `${l.codigo}`).join(', ');
      const maisMsg = ignorados.length > 10 ? ` (+${ignorados.length-10} outros)` : '';
      const confirmMsg =
        `${ignorados.length} imóvel(is) já está(ão) aprovado(s) em ciclo anterior — ` +
        `esses serão IGNORADOS (regra: manter o ciclo mais antigo):\n${listaIgn}${maisMsg}\n\n` +
        `Vou importar ${novos.length} novo(s) imóvel(is) da equipe ${equipe} pra ${mes} como pendentes da peneira. Continuar?`;
      if (!confirm(confirmMsg)) { btn.disabled = false; btn.textContent = 'Importar como pendentes'; return; }
    } else if (!confirm(`Importar ${novos.length} imóveis pra equipe ${equipe} (mês ${mes}) como pendentes da peneira (votação dos 5)?`)) {
      btn.disabled = false; btn.textContent = 'Importar como pendentes'; return;
    }

    if (!novos.length) {
      toast('Nenhum imóvel novo pra importar (todos já existem aprovados).','info');
      btn.disabled = false; btn.textContent = 'Importar como pendentes';
      return;
    }

    btn.textContent = 'Importando...';
    const payload = novos.map(l => {
      const metStr = String(l.metragem||'').replace(',', '.').replace(/[^\d.]/g,'');
      const metragem = metStr ? Number(metStr) : null;
      return {
        codigo:         l.codigo,
        endereco:       l.endereco || null,
        corretor:       l.corretor || null,
        equipe,
        mes_referencia: mes,
        metragem:       (metragem && !isNaN(metragem)) ? metragem : null,
        tempo_venda:    l.tempo_venda || null,
        outras_opcoes:  l.outras_opcoes || null,
        link_imovel:    l.link_imovel || null,
        status:         'pendente',
        enviado_por_id: CUR?.id || null
      };
    });
    await db.post('vendas_selecao_imoveis', payload);
    const extra = ignorados.length ? ` · ${ignorados.length} já existentes ignorado(s)` : '';
    toast(`✅ ${payload.length} imóveis enviados pra peneira${extra}.`,'ok');
    closeM('m-vnd-upload');
    carregarSelecaoImoveis();
  } catch(e) {
    toast('Erro: '+e.message,'err');
    btn.disabled = false;
    btn.textContent = 'Importar como pendentes';
  }
}

// ─── PENEIRA: votação dos 5 (4 gerentes + Rodrigo) ───────────
let _penPendentes  = [];   // pendentes com votos agrupados {votos:{Renata:'aprovado',...}, aprov:n, reprov:n, meuVoto:...}
const _PEN_QUORUM  = 3;    // votos pra decidir (5 total, maioria simples)
const TODAS_EQUIPES = ['Aguia','Chris','Emilia','Felippe','Fenix'];

async function carregarPeneiraSelecao(){
  if (!ehVotantePeneira()) {
    document.getElementById('pen-grupos').innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--muted)">Acesso restrito aos 5 votantes da peneira.</div>';
    document.getElementById('pen-kpis').innerHTML = '';
    return;
  }

  // Popula select de equipe (todas as 5 - votante vê tudo)
  const selEq = document.getElementById('pen-equipe');
  if (selEq && selEq.options.length <= 1) {
    TODAS_EQUIPES.forEach(e => {
      const o = document.createElement('option'); o.value = e; o.textContent = e;
      selEq.appendChild(o);
    });
  }
  const filtroEq = selEq?.value || '';

  try {
    let q = '?status=eq.pendente&order=equipe.asc,enviado_em.desc';
    if (filtroEq) q += `&equipe=eq.${encodeURIComponent(filtroEq)}`;
    const pend = await db.get('vendas_selecao_imoveis', q) || [];
    if (!pend.length) {
      _penPendentes = [];
      _renderKpisPeneira();
      renderPeneira();
      return;
    }
    // Busca todos os votos desses pendentes em uma chamada
    const ids = pend.map(p => `"${p.id}"`).join(',');
    const votos = await db.get('vendas_selecao_votos',
      `?imovel_id=in.(${encodeURIComponent(ids)})&select=imovel_id,votante_nome,voto,observacao`) || [];
    const meuNome = nomeVotantePeneira();
    const porImovel = {};
    votos.forEach(v => { (porImovel[v.imovel_id] ||= []).push(v); });
    _penPendentes = pend.map(p => {
      const lista = porImovel[p.id] || [];
      const aprov = lista.filter(v => v.voto==='aprovado').length;
      const reprov = lista.filter(v => v.voto==='reprovado').length;
      const meu = lista.find(v => v.votante_nome === meuNome);
      return {
        ...p,
        votos: lista,
        aprov, reprov,
        meuVoto: meu?.voto || null,
        decidido: (aprov >= _PEN_QUORUM || reprov >= _PEN_QUORUM)
      };
    });
  } catch(e) {
    document.getElementById('pen-grupos').innerHTML =
      `<div style="text-align:center;padding:32px;color:var(--danger)">Erro: ${e.message}</div>`;
    return;
  }

  _renderKpisPeneira();
  renderPeneira();
}

function _renderKpisPeneira(){
  const meuNome = nomeVotantePeneira();
  const total      = _penPendentes.length;
  const faltaMeu   = _penPendentes.filter(p => !p.meuVoto && !p.decidido).length;
  const aguardando = _penPendentes.filter(p => !p.decidido).length;
  document.getElementById('pen-kpis').innerHTML = `
    <div class="sc">
      <div class="sa" style="background:#f59e0b"></div>
      <div class="sl">Pendentes na peneira</div>
      <div class="sv">${total}</div>
    </div>
    <div class="sc">
      <div class="sa" style="background:#ef4444"></div>
      <div class="sl">Aguardando seu voto</div>
      <div class="sv">${faltaMeu}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">você é <b>${meuNome||'—'}</b></div>
    </div>
    <div class="sc">
      <div class="sa" style="background:#3b82f6"></div>
      <div class="sl">Sem decisão (sem 3 votos)</div>
      <div class="sv">${aguardando}</div>
    </div>`;
}

function _penPainelVotos(p){
  // Avatar de cada um dos 5 votantes (✓ verde, ✗ vermelho, ⋯ cinza)
  return VOTANTES_PENEIRA.map(v => {
    const reg = p.votos.find(x => x.votante_nome === v);
    const cor = reg?.voto==='aprovado' ? '#10b981'
              : reg?.voto==='reprovado'? '#ef4444' : '#cbd5e1';
    const ic  = reg?.voto==='aprovado' ? '✓'
              : reg?.voto==='reprovado'? '✗' : '⋯';
    const ini = v.charAt(0);
    return `<span title="${v}: ${reg?.voto||'aguardando'}" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--muted);font-weight:600">
      <span style="width:20px;height:20px;border-radius:50%;background:${cor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${ic}</span>${ini}
    </span>`;
  }).join('');
}

function renderPeneira(){
  const cont = document.getElementById('pen-grupos');
  if (!cont) return;
  const busca = document.getElementById('pen-busca')?.value?.toLowerCase() || '';
  const filtrados = busca
    ? _penPendentes.filter(p => (
        (p.codigo||'').toLowerCase().includes(busca) ||
        (p.corretor||'').toLowerCase().includes(busca) ||
        (p.endereco||'').toLowerCase().includes(busca)
      ))
    : _penPendentes;

  if (!filtrados.length) {
    cont.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--muted)">
      ✅ Nenhum pendente${busca?' bate com a busca':''}. Boa peneira!
    </div>`;
    return;
  }
  // Agrupa por equipe (votantes veem todas)
  const porEq = {};
  filtrados.forEach(p => { (porEq[p.equipe||'(sem equipe)'] ||= []).push(p); });

  cont.innerHTML = Object.entries(porEq).map(([eq, lista]) => {
    const aguardandoMeu = lista.filter(p => !p.meuVoto && !p.decidido).length;
    return `
    <div class="card" style="padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700">Equipe ${eq}</div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:12px;color:var(--muted)">${lista.length} pendente${lista.length!==1?'s':''}${aguardandoMeu?` · <b style="color:var(--danger)">${aguardandoMeu} aguarda${aguardandoMeu>1?'m':''} seu voto</b>`:''}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px">
        ${lista.map(p => {
          const restantes = VOTANTES_PENEIRA.length - p.aprov - p.reprov;
          const meuVotoTxt = p.meuVoto==='aprovado' ? '<span style="color:var(--verde)">✓ aprovou</span>'
                           : p.meuVoto==='reprovado'? '<span style="color:var(--danger)">✗ reprovou</span>'
                           : '<span style="color:#94a3b8">— ainda não votou —</span>';
          return `
          <div style="border:1px solid var(--borda);border-radius:10px;padding:12px;background:#fff;${p.meuVoto?'opacity:.85':''}">
            <div style="display:flex;align-items:center;justify-content:space-between">
              ${p.link_imovel
                ? `<a href="${p.link_imovel}" target="_blank" rel="noopener" title="Abrir anúncio do imóvel" style="font-family:monospace;font-size:12px;color:var(--pri);font-weight:700;text-decoration:none">${p.codigo} 🔗</a>`
                : `<span style="font-family:monospace;font-size:12px;color:var(--pri);font-weight:700">${p.codigo}</span>`}
              <span style="font-size:10px;color:var(--muted)">${p.mes_referencia||'—'}</span>
            </div>
            <div style="font-size:13px;font-weight:600;margin-top:4px">${p.endereco||'—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">
              ${p.corretor||'—'}${p.metragem ? ` · ${p.metragem} m²` : ''}${p.tempo_venda ? ` · ${p.tempo_venda}` : ''}
            </div>
            ${p.outras_opcoes ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;font-style:italic">${p.outras_opcoes}</div>`:''}

            <div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-radius:8px">
              <div style="display:flex;gap:6px;align-items:center;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;font-weight:700;color:var(--muted)">VOTAÇÃO</span>
                <span style="font-size:11px;color:var(--muted)">
                  <b style="color:var(--verde)">${p.aprov}</b> ✓ ·
                  <b style="color:var(--danger)">${p.reprov}</b> ✗ ·
                  ${restantes} faltam
                </span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${_penPainelVotos(p)}</div>
              <div style="font-size:11px;margin-top:6px">Seu voto: ${meuVotoTxt}</div>
            </div>

            <div style="display:flex;gap:6px;margin-top:10px">
              <button class="btn ${p.meuVoto==='aprovado'?'btn-g':'btn-o'} bsm" style="flex:1;${p.meuVoto==='aprovado'?'background:#10b981;color:#fff':'color:#10b981;border-color:#10b981'}" onclick="votarImovel('${p.id}','aprovado')">✓ Aprovar</button>
              <button class="btn ${p.meuVoto==='reprovado'?'btn-g':'btn-o'} bsm" style="flex:1;${p.meuVoto==='reprovado'?'background:#ef4444;color:#fff':'color:#ef4444;border-color:#ef4444'}" onclick="votarImovel('${p.id}','reprovado')">✗ Reprovar</button>
              <button class="btn btn-o bsm" onclick="abrirEditarImovelSelecao('${p.id}')" title="Editar dados antes de votar">✎</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

async function votarImovel(imovelId, voto){
  const meuNome = nomeVotantePeneira();
  if (!meuNome) { toast('Você não está na lista de votantes da peneira.','err'); return; }
  const imovel = _penPendentes.find(p => p.id === imovelId);
  if (!imovel) return;
  // Se ja votou igual, oferece desfazer
  if (imovel.meuVoto === voto) {
    if (!confirm(`Você já votou "${voto}". Quer remover seu voto?`)) return;
    const reg = imovel.votos.find(v => v.votante_nome === meuNome);
    try {
      await db.del('vendas_selecao_votos', reg.id);
      toast('Voto removido.','ok');
      carregarPeneiraSelecao();
    } catch(e) { toast('Erro: '+e.message,'err'); }
    return;
  }
  // Upsert: PATCH se já existe, POST se não
  try {
    const reg = imovel.votos.find(v => v.votante_nome === meuNome);
    if (reg) {
      await db.patch('vendas_selecao_votos', reg.id, { voto, votado_em: new Date().toISOString() });
    } else {
      await db.post('vendas_selecao_votos', {
        imovel_id:     imovelId,
        votante_nome:  meuNome,
        voto,
        votado_por_id: CUR?.id || null
      });
    }
    // Recalcula e aplica decisão se atingir quórum
    await _aplicarDecisaoPeneira(imovelId);
    toast(`Voto ${voto==='aprovado'?'✓':'✗'} registrado.`,'ok');
    carregarPeneiraSelecao();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function _aplicarDecisaoPeneira(imovelId){
  // Refetch votos do imóvel pra ter a contagem fresca (anti-race)
  const votos = await db.get('vendas_selecao_votos',
    `?imovel_id=eq.${imovelId}&select=voto`) || [];
  const aprov  = votos.filter(v => v.voto==='aprovado').length;
  const reprov = votos.filter(v => v.voto==='reprovado').length;
  if (aprov >= _PEN_QUORUM) {
    // mes_referencia SEMPRE vem do imovel (upload/cadastro). Nunca sobrescreve
    // — ou o "ciclo" muda dependendo de quando o gerente peneirou (bug de julho).
    let mesRef = null;
    try {
      const arr = await db.get('vendas_selecao_imoveis', `?id=eq.${imovelId}&select=mes_referencia`);
      mesRef = arr?.[0]?.mes_referencia || null;
    } catch(_) {}
    if (!mesRef) {
      mesRef = _cicloAtualYm();
      console.warn('[peneira] imovel', imovelId, 'sem mes_referencia — aplicando ciclo atual', mesRef);
    }
    const ativoAte = _ativoAteDeCiclo(mesRef);
    await db.patch('vendas_selecao_imoveis', imovelId, {
      status: 'aprovado',
      aprovado_em: new Date().toISOString(),
      aprovado_por_id: CUR?.id || null,
      mes_referencia: mesRef,
      ativo_ate: ativoAte
    });
  } else if (reprov >= _PEN_QUORUM) {
    await db.patch('vendas_selecao_imoveis', imovelId, {
      status: 'reprovado',
      motivo_reprovacao: `Reprovado pela maioria (${reprov}/5 votos)`,
      aprovado_por_id: CUR?.id || null,
      aprovado_em: new Date().toISOString()
    });
  }
}

// ════════════════════════════════════════════════════════════
// CONTROLE DE PRESENÇA
// ════════════════════════════════════════════════════════════

let _presEditId = null;
let _presMarcacaoAtividade = null; // atividade aberta no modal de marcação
let _presTabAtiva = 'ativ'; // 'ativ' | 'stats'

const TIPOS_ATV = {
  reuniao:          { label:'Reunião',         cor:'#3b82f6', bg:'#dbeafe', txt:'#1d4ed8' },
  treinamento:      { label:'Treinamento',     cor:'#8b5cf6', bg:'#ede9fe', txt:'#6d28d9' },
  selecao_imoveis:  { label:'Seleção Imóveis', cor:'#10b981', bg:'#d1fae5', txt:'#047857' },
  confraternizacao: { label:'Confraternização',cor:'#f59e0b', bg:'#fef3c7', txt:'#92400e' },
  outro:            { label:'Outro',           cor:'#64748b', bg:'#e2e8f0', txt:'#475569' }
};

function _mesAtual(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

// Ciclo mensal: comeca dia 10 do mes. Antes do dia 10, ciclo eh o do mes
// anterior. Retorna 'YYYY-MM' do mes onde o ciclo comecou.
function _cicloAtualYm(d){
  d = d || new Date();
  const y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() >= 10) return y + '-' + String(m+1).padStart(2,'0');
  const nm = m - 1;
  return (nm < 0 ? y-1 : y) + '-' + String((nm<0?12:nm+1)).padStart(2,'0');
}

// Ativo ate: dia 9 do 3o mes apos o mes_referencia (dia antes do pivo 10).
// Ex: mes_ref '2026-09' => '2026-12-09'
function _ativoAteDeCiclo(mesRefYm){
  const partes = String(mesRefYm||'').match(/^(\d{4})-(\d{2})$/);
  if (!partes) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth()+3, 9).toISOString().slice(0,10);
  }
  const ano = Number(partes[1]);
  const mes = Number(partes[2]) - 1;   // 0-based
  // Dia 10 do (mes+3) menos 1 dia = dia 9 do (mes+3)
  const dt = new Date(ano, mes + 3, 9);
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
}

// Label bonito pra select ('2026-09' -> 'Set/2026')
function _ymLabel(ym){
  const partes = String(ym||'').match(/^(\d{4})-(\d{2})$/);
  if (!partes) return ym||'';
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return meses[Number(partes[2])-1] + '/' + partes[1];
}

function _presTab(qual){
  _presTabAtiva = qual;
  document.getElementById('pres-pane-ativ').style.display  = qual==='ativ' ? '' : 'none';
  document.getElementById('pres-pane-stats').style.display = qual==='stats'? '' : 'none';
  // Marca o tab ativo
  ['ativ','stats'].forEach(t => {
    const b = document.getElementById('pres-tab-'+t);
    if (b) b.className = 'btn '+(t===qual?'btn-p':'btn-o')+' bsm';
  });
  if (qual === 'stats') carregarStatsPresenca();
}

async function carregarVendasPresenca(){
  // Botao de gestao de corretores: so gerentes + assistentes autorizadas
  const btnCorr = document.getElementById('btn-gerenciar-corretores');
  if (btnCorr) btnCorr.style.display =
    (typeof podeGerenciarCorretores === 'function' && podeGerenciarCorretores()) ? 'inline-flex' : 'none';
  // Carrega corretores do banco (fallback pra constante se erro)
  if (typeof carregarCorretoresDoBanco === 'function') await carregarCorretoresDoBanco();
  // Default do select de mês
  const inpMes = document.getElementById('pres-mes');
  if (inpMes && !inpMes.value) inpMes.value = _mesAtual();
  const mes = inpMes?.value || _mesAtual();
  const equipe = document.getElementById('pres-equipe')?.value || '';

  // Inicializa tab visual
  _presTab(_presTabAtiva);

  // Busca atividades do mês
  let q = `?mes=eq.${mes}&order=data.desc.nullslast,criado_em.desc`;
  if (equipe) q += `&equipe=eq.${encodeURIComponent(equipe)}`;
  let ats;
  try {
    ats = await db.get('vendas_atividades', q);
  } catch(e) {
    document.getElementById('pres-lista-atividades').innerHTML =
      `<div style="text-align:center;padding:24px;color:var(--danger)">Erro: ${e.message}<br><small>A tabela já foi criada no Supabase?</small></div>`;
    return;
  }

  // Busca todas as presenças do mês de uma vez
  let presencas = [];
  if (ats?.length) {
    const ids = ats.map(a => a.id).join(',');
    presencas = await db.get('vendas_presencas', `?atividade_id=in.(${ids})&select=*`);
  }
  const presPorAtv = {};
  (presencas||[]).forEach(p => {
    if (!presPorAtv[p.atividade_id]) presPorAtv[p.atividade_id] = [];
    presPorAtv[p.atividade_id].push(p);
  });

  // KPIs — denominador eh a LISTA OFICIAL da equipe da atividade
  // (presente=true → veio; sem registro → faltou). Total esperado de
  // marcacoes por atividade = corretores da sua equipe (ou de todas).
  const totalAtv = ats.length;
  let totalPres = 0, totalEsperado = 0;
  // Por equipe: { Aguia:{pres:0,esp:0}, ... }
  const porEqKpi = {};
  todasEquipes().forEach(eq => { porEqKpi[eq] = { pres:0, esp:0 }; });
  // Indexa presencas por (atividade_id|corretor) pra lookup O(1)
  const presIdx = {};
  (presencas||[]).forEach(p => { if (p.presente) presIdx[`${p.atividade_id}|${p.corretor_nome}`] = true; });
  ats.forEach(a => {
    const equipesDaAtv = (a.equipe && CORRETORES_POR_EQUIPE[a.equipe]) ? [a.equipe] : todasEquipes();
    equipesDaAtv.forEach(eq => {
      corretoresDaEquipe(eq).forEach(nome => {
        porEqKpi[eq].esp++;
        totalEsperado++;
        if (presIdx[`${a.id}|${nome}`]) { porEqKpi[eq].pres++; totalPres++; }
      });
    });
  });
  const totalAus = Math.max(0, totalEsperado - totalPres);
  const pct = totalEsperado ? Math.round(totalPres/totalEsperado*100) : 0;
  document.getElementById('kpi-pres-atv').textContent = totalAtv;
  document.getElementById('kpi-pres-pre').textContent = totalPres;
  document.getElementById('kpi-pres-aus').textContent = totalAus;
  document.getElementById('kpi-pres-pct').textContent = totalEsperado ? pct+'%' : '—';

  // Cards de % por equipe (verde >=80%, amarelo 50-79%, vermelho <50%)
  const eqCont = document.getElementById('kpi-pres-equipes');
  if (eqCont) {
    eqCont.innerHTML = todasEquipes().map(eq => {
      const { pres, esp } = porEqKpi[eq];
      const p = esp ? Math.round(pres/esp*100) : null;
      const cor = p===null ? '#94a3b8' : p>=80 ? '#10b981' : p>=50 ? '#f59e0b' : '#ef4444';
      const corFundo = p===null ? '#f1f5f9' : p>=80 ? '#ecfdf5' : p>=50 ? '#fffbeb' : '#fef2f2';
      return `<div class="sc" style="background:${corFundo};border-left:4px solid ${cor};position:relative">
        <div class="sl" style="font-weight:700">${eq}</div>
        <div class="sv" style="color:${cor};font-size:22px">${p===null ? '—' : p+'%'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${esp ? `${pres} de ${esp} marcações` : 'sem atividade'}</div>
      </div>`;
    }).join('');
  }

  // Lista
  const lista = document.getElementById('pres-lista-atividades');
  if (!ats?.length) {
    lista.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:#94a3b8">
      <p style="font-size:14px;margin-bottom:6px">Nenhuma atividade cadastrada nesse mês.</p>
      <p style="font-size:12px">Clique em <b>+ Nova Atividade</b> para começar.</p>
    </div>`;
    return;
  }

  lista.innerHTML = ats.map(a => {
    const t = TIPOS_ATV[a.tipo] || TIPOS_ATV.outro;
    const pres = presPorAtv[a.id] || [];
    const pCnt = pres.filter(p => p.presente).length;
    // Total esperado = lista oficial da equipe (ou todas se geral)
    const equipesAtv = (a.equipe && CORRETORES_POR_EQUIPE[a.equipe]) ? [a.equipe] : todasEquipes();
    const total = equipesAtv.reduce((acc,e) => acc + corretoresDaEquipe(e).length, 0);
    const dataFmt = a.data ? new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—';
    const sub = [dataFmt, a.hora, a.local, a.equipe||'Todas'].filter(Boolean).join(' · ');
    return `<div class="card" style="padding:14px 16px;margin-bottom:10px">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;background:${t.bg};color:${t.txt}">${t.label}</span>
            <span style="font-size:11px;color:var(--muted)">${sub}</span>
          </div>
          <div style="font-size:14px;font-weight:600">${a.nome}</div>
          ${a.observacoes ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${a.observacoes}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="text-align:center">
            <div style="font-size:11px;color:var(--muted)">Presenças</div>
            <div style="font-size:16px;font-weight:700;color:${total?'var(--verde)':'var(--muted)'}">${pCnt}${total?` <span style="font-size:11px;color:var(--muted);font-weight:400">/ ${total}</span>`:''}</div>
          </div>
          <button class="btn btn-p bsm" onclick="abrirMarcacaoPresenca('${a.id}')">📝 Marcar</button>
          <button class="btn btn-o bxs" onclick="abrirEditarAtividadeVendas('${a.id}')" title="Editar">✏️</button>
          <button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirAtividadeVendas('${a.id}','${(a.nome||'').replace(/'/g,'')}')" title="Excluir">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function abrirNovaAtividadeVendas(){
  _presEditId = null;
  document.getElementById('m-pres-atv-titulo').textContent = '+ Nova Atividade';
  ['pres-atv-nome','pres-atv-local','pres-atv-obs','pres-atv-data','pres-atv-hora']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('pres-atv-tipo').value = 'reuniao';
  document.getElementById('pres-atv-equipe').value = '';
  openM('m-pres-atv');
}

async function abrirEditarAtividadeVendas(id){
  try {
    const list = await db.get('vendas_atividades', `?id=eq.${id}`);
    const a = list?.[0];
    if (!a) { toast('Atividade não encontrada.','err'); return; }
    _presEditId = id;
    document.getElementById('m-pres-atv-titulo').textContent = '✏️ Editar Atividade';
    document.getElementById('pres-atv-nome').value  = a.nome||'';
    document.getElementById('pres-atv-tipo').value  = a.tipo||'reuniao';
    document.getElementById('pres-atv-equipe').value= a.equipe||'';
    document.getElementById('pres-atv-data').value  = a.data||'';
    document.getElementById('pres-atv-hora').value  = a.hora||'';
    document.getElementById('pres-atv-local').value = a.local||'';
    document.getElementById('pres-atv-obs').value   = a.observacoes||'';
    openM('m-pres-atv');
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function salvarAtividadeVendas(){
  const nome = document.getElementById('pres-atv-nome')?.value?.trim();
  if (!nome) { toast('Informe o nome da atividade.','err'); return; }
  const data = document.getElementById('pres-atv-data')?.value || null;
  // Mês deriva da data (se houver) ou do filtro do mês atual
  const mesPainel = document.getElementById('pres-mes')?.value || _mesAtual();
  const mes = data ? data.slice(0,7) : mesPainel;

  const payload = {
    nome,
    tipo:        document.getElementById('pres-atv-tipo')?.value || 'reuniao',
    equipe:      document.getElementById('pres-atv-equipe')?.value || null,
    data,
    hora:        document.getElementById('pres-atv-hora')?.value || null,
    local:       document.getElementById('pres-atv-local')?.value || null,
    observacoes: document.getElementById('pres-atv-obs')?.value || null,
    mes
  };

  try {
    if (_presEditId) {
      await db.patch('vendas_atividades', _presEditId, payload);
      toast('✅ Atividade atualizada.','ok');
    } else {
      payload.criado_por_id = CUR?.id || null;
      await db.post('vendas_atividades', payload);
      toast('✅ Atividade criada.','ok');
    }
    _presEditId = null;
    closeM('m-pres-atv');
    carregarVendasPresenca();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function excluirAtividadeVendas(id, nome){
  if (!confirm(`Excluir "${nome}"? Todas as marcações de presença dessa atividade também serão removidas.`)) return;
  try {
    await db.del('vendas_atividades', id);
    toast('🗑️ Atividade removida.','ok');
    carregarVendasPresenca();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

// Cache da atividade aberta + presenças (registro = presente, sem registro = ausente)
let _presAtv = null;          // {id, equipe, ...}
let _presPorNome = {};        // { corretor_nome: row }

async function abrirMarcacaoPresenca(atividadeId){
  _presMarcacaoAtividade = atividadeId;
  _presAtv = null;
  // Abre IMEDIATAMENTE com loading, pra evitar a impressão de "nada acontece"
  // quando há latência ou erro de rede.
  document.getElementById('m-pres-marc-titulo').textContent = '📝 Carregando...';
  document.getElementById('m-pres-marc-sub').textContent = '—';
  const cont = document.getElementById('marc-lista');
  if (cont) cont.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:18px">Carregando lista...</div>';
  openM('m-pres-marc');
  try {
    const list = await db.get('vendas_atividades', `?id=eq.${atividadeId}`);
    const a = list?.[0];
    if (!a) { toast('Atividade não encontrada.','err'); return; }
    _presAtv = a;
    document.getElementById('m-pres-marc-titulo').textContent = '📝 ' + a.nome;
    const sub = [
      (a.data ? new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR') : null),
      a.hora, a.local, a.equipe||'Todas equipes'
    ].filter(Boolean).join(' · ');
    document.getElementById('m-pres-marc-sub').textContent = sub;
    await _renderListaPresenca();
  } catch(e) {
    toast('Erro: '+e.message,'err');
    if (cont) cont.innerHTML = `<div style="text-align:center;color:var(--danger);padding:18px">Erro ao carregar: ${e.message}</div>`;
  }
}

async function _renderListaPresenca(){
  const cont = document.getElementById('marc-lista');
  if (!cont || !_presMarcacaoAtividade) return;

  // Recarrega presenças do banco
  const ps = await db.get('vendas_presencas',
    `?atividade_id=eq.${_presMarcacaoAtividade}&order=equipe,corretor_nome`);
  _presPorNome = {};
  (ps||[]).forEach(p => { _presPorNome[p.corretor_nome] = p; });

  // Equipes a exibir: a equipe da atividade (se canônica) ou todas
  let equipes;
  if (_presAtv?.equipe && CORRETORES_POR_EQUIPE[_presAtv.equipe]) {
    equipes = [_presAtv.equipe];
  } else {
    // Fallback: mostra todas as 5 (atividade geral ou equipe não-canônica)
    equipes = todasEquipes();
  }

  // Stats no topo: total presentes / total corretores
  const totCorr = equipes.reduce((acc,e) => acc + corretoresDaEquipe(e).length, 0);
  let totPres = 0;
  equipes.forEach(e => corretoresDaEquipe(e).forEach(n => { if (_presPorNome[n]?.presente) totPres++; }));

  const buckets = equipes.map(eq => {
    const lista = corretoresDaEquipe(eq).slice().sort((a,b) => a.localeCompare(b,'pt-BR'));
    const linhas = lista.map(n => {
      const reg = _presPorNome[n];
      const presente = !!reg?.presente;
      return `
        <div onclick="togglePresencaCorretor('${eq}','${n.replace(/'/g,"\\'")}')" style="padding:9px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;border-radius:8px;${presente?'background:#ecfdf5':'background:#fff'};border:1px solid ${presente?'#a7f3d0':'var(--borda)'};margin-bottom:4px;transition:background .15s">
          <span style="font-size:22px;line-height:1;color:${presente?'var(--verde)':'#cbd5e1'};width:26px;text-align:center">${presente?'✅':'⬜'}</span>
          <span style="flex:1;font-size:13px;font-weight:${presente?'600':'500'};color:${presente?'#065f46':'var(--txt)'}">${n}</span>
          ${presente && reg?.observacao ? `<span style="font-size:11px;color:var(--muted);font-style:italic">${reg.observacao}</span>` : ''}
        </div>`;
    }).join('');
    const presNaEq  = lista.filter(n => _presPorNome[n]?.presente).length;
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:0 4px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--pri)">Equipe ${eq}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:11px;color:var(--muted)">${presNaEq}/${lista.length}</span>
            <button class="btn btn-o bxs" onclick="event.stopPropagation();marcarTodosEquipePresenca('${eq}',true)" title="Marcar toda equipe como presente">✓ todos</button>
            <button class="btn btn-o bxs" onclick="event.stopPropagation();marcarTodosEquipePresenca('${eq}',false)" title="Desmarcar toda equipe">⨯ limpar</button>
          </div>
        </div>
        ${linhas}
      </div>`;
  }).join('');

  cont.innerHTML = `
    <div style="background:#f8fafc;padding:10px 14px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:14px">
      <div style="font-size:24px">📊</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${totPres} de ${totCorr} marcados como presentes</div>
        <div style="font-size:11px;color:var(--muted)">Clique no corretor pra alternar presença. Sem clique = ausente.</div>
      </div>
    </div>
    ${buckets}
  `;
}

async function togglePresencaCorretor(equipe, nome){
  if (!_presMarcacaoAtividade) return;
  const reg = _presPorNome[nome];
  try {
    if (reg) {
      // Existe registro → alterna presente. Se ficaria com presente=false sem
      // observação, exclui pra manter "ausente" como ausência de registro.
      if (reg.presente) {
        await db.del('vendas_presencas', reg.id);
      } else {
        await db.patch('vendas_presencas', reg.id, { presente: true, marcado_em: new Date().toISOString() });
      }
    } else {
      await db.post('vendas_presencas', {
        atividade_id:   _presMarcacaoAtividade,
        corretor_nome:  nome,
        equipe,
        presente:       true,
        marcado_por_id: CUR?.id || null
      });
    }
    await _renderListaPresenca();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function marcarTodosEquipePresenca(equipe, ligar){
  if (!_presMarcacaoAtividade) return;
  const corretores = corretoresDaEquipe(equipe);
  if (!corretores.length) return;
  const msg = ligar
    ? `Marcar todos ${corretores.length} corretores da equipe ${equipe} como presentes?`
    : `Limpar presença de todos da equipe ${equipe}?`;
  if (!confirm(msg)) return;
  try {
    // Sequencial pra não estourar rate-limit / acumular erros silenciosos
    for (const nome of corretores) {
      const reg = _presPorNome[nome];
      if (ligar) {
        if (reg) {
          if (!reg.presente) await db.patch('vendas_presencas', reg.id, { presente: true, marcado_em: new Date().toISOString() });
        } else {
          await db.post('vendas_presencas', {
            atividade_id:   _presMarcacaoAtividade,
            corretor_nome:  nome,
            equipe,
            presente:       true,
            marcado_por_id: CUR?.id || null
          });
        }
      } else {
        if (reg) await db.del('vendas_presencas', reg.id);
      }
    }
    await _renderListaPresenca();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

// ── ESTATÍSTICAS ────────────────────────────────────────────
// Modelo: registro em vendas_presencas com presente=true = veio.
// SEM registro = faltou. Total esperado por (corretor, atividade) eh
// "atividade.equipe == minha equipe OU atividade sem equipe (geral)".

function _agregarStatsPresenca(ats, presencas, equipeFiltro){
  // Indexa presencas por (atividade_id, corretor_nome) pra lookup O(1)
  const presIdx = {};
  (presencas||[]).forEach(p => {
    if (p.presente) presIdx[`${p.atividade_id}|${p.corretor_nome}`] = true;
  });

  // Inicializa todas as equipes (canonicas) e corretores conhecidos
  const equipesAlvo = equipeFiltro ? [equipeFiltro] : todasEquipes();
  const porEq = {};
  const porCor = {};
  equipesAlvo.forEach(eq => {
    if (!CORRETORES_POR_EQUIPE[eq]) return;
    porEq[eq] = { total:0, pres:0 };
    corretoresDaEquipe(eq).forEach(nome => {
      const k = nome + '|' + eq;
      porCor[k] = { nome, equipe:eq, total:0, pres:0 };
    });
  });

  // Para cada atividade, conta cada corretor elegivel uma vez
  (ats||[]).forEach(a => {
    // Atividade vale pra: equipe especifica (se canonica) ou TODAS (geral)
    const equipesDaAtv = (a.equipe && CORRETORES_POR_EQUIPE[a.equipe]) ? [a.equipe] : todasEquipes();
    // Intersecao com equipesAlvo (filtro)
    const aplicaveis = equipesDaAtv.filter(eq => equipesAlvo.includes(eq) && CORRETORES_POR_EQUIPE[eq]);
    aplicaveis.forEach(eq => {
      corretoresDaEquipe(eq).forEach(nome => {
        const k = nome + '|' + eq;
        if (!porCor[k]) porCor[k] = { nome, equipe:eq, total:0, pres:0 };
        porCor[k].total++;
        porEq[eq] = porEq[eq] || { total:0, pres:0 };
        porEq[eq].total++;
        if (presIdx[`${a.id}|${nome}`]) {
          porCor[k].pres++;
          porEq[eq].pres++;
        }
      });
    });
  });
  return { porEq, porCor };
}

async function carregarStatsPresenca(){
  const mes = document.getElementById('pres-mes')?.value || _mesAtual();
  const equipe = document.getElementById('pres-equipe')?.value || '';

  // Atividades do mês
  let qa = `?mes=eq.${mes}&select=id,equipe`;
  if (equipe) qa += `&equipe=eq.${encodeURIComponent(equipe)}`;
  const ats = await db.get('vendas_atividades', qa);
  const idsMes = (ats||[]).map(a => a.id);

  // Presenças desse mês
  let presencas = [];
  if (idsMes.length) {
    presencas = await db.get('vendas_presencas',
      `?atividade_id=in.(${idsMes.join(',')})&select=*`);
  }

  const { porEq, porCor } = _agregarStatsPresenca(ats, presencas, equipe);
  document.getElementById('stats-por-equipe').innerHTML = _renderRankingStats(porEq) ||
    '<div style="color:#94a3b8;font-size:13px;padding:8px">Sem atividades nesse mês.</div>';
  document.getElementById('stats-por-corretor').innerHTML = _renderRankingCorretores(porCor) ||
    '<div style="color:#94a3b8;font-size:13px;padding:8px">Sem atividades nesse mês.</div>';

  // Trimestre — calcula o tri atual a partir do mês
  const [y, m] = mes.split('-').map(Number);
  const tri = Math.ceil(m/3);
  const inicioMes = (tri-1)*3 + 1;
  const meses = [0,1,2].map(i => y + '-' + String(inicioMes+i).padStart(2,'0'));
  document.getElementById('stats-tri-rotulo').textContent =
    `T${tri}/${y} — ${meses.join(', ')}`;

  // Busca atividades do tri inteiro
  let qaTri = `?mes=in.(${meses.map(x=>`"${x}"`).join(',')})&select=id,equipe`;
  if (equipe) qaTri += `&equipe=eq.${encodeURIComponent(equipe)}`;
  const atsTri = await db.get('vendas_atividades', qaTri);
  const idsTri = (atsTri||[]).map(a => a.id);
  let presTri = [];
  if (idsTri.length) {
    presTri = await db.get('vendas_presencas',
      `?atividade_id=in.(${idsTri.join(',')})&select=*`);
  }
  const { porCor: porCorTri } = _agregarStatsPresenca(atsTri, presTri, equipe);
  document.getElementById('stats-trimestre').innerHTML = _renderRankingCorretores(porCorTri) ||
    '<div style="color:#94a3b8;font-size:13px;padding:8px">Sem atividades nesse trimestre.</div>';
}

function _renderRankingStats(porEq){
  const linhas = Object.keys(porEq).sort();
  if (!linhas.length) return '';
  // Maior total p/ escalar a barra
  const maxTotal = Math.max(...linhas.map(k => porEq[k].total));
  return linhas.map(eq => {
    const d = porEq[eq];
    const pct = d.total ? Math.round(d.pres/d.total*100) : 0;
    const w = maxTotal ? Math.round(d.total/maxTotal*100) : 0;
    const cor = pct>=80?'var(--verde)':pct>=50?'var(--pri)':pct>0?'var(--amber)':'var(--danger)';
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:13px;font-weight:600">${eq}</span>
        <span style="font-size:12px;color:${cor};font-weight:700">${pct}% (${d.pres}/${d.total})</span>
      </div>
      <div style="background:#f1f5f9;height:8px;border-radius:4px;overflow:hidden">
        <div style="background:${cor};width:${pct}%;height:100%;transition:width .3s"></div>
      </div>
    </div>`;
  }).join('');
}

function _renderRankingCorretores(porCor){
  const arr = Object.values(porCor).sort((a,b) => {
    const pa = a.total ? a.pres/a.total : 0;
    const pb = b.total ? b.pres/b.total : 0;
    if (pa !== pb) return pb - pa; // melhor % primeiro
    return b.total - a.total;       // mais participações depois
  });
  if (!arr.length) return '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">
    ${arr.map(d => {
      const pct = d.total ? Math.round(d.pres/d.total*100) : 0;
      const cor = pct>=80?'var(--verde)':pct>=50?'var(--pri)':pct>0?'var(--amber)':'var(--danger)';
      return `<div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:${cor}22;color:${cor};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0">${d.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.nome}</div>
          <div style="font-size:10px;color:var(--muted)">${d.equipe||'—'} · ${d.pres}/${d.total}</div>
        </div>
        <div style="font-size:14px;font-weight:800;color:${cor}">${pct}%</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ════════════════════════════════════════════════════════════
// AGENDA DO FOTÓGRAFO
// Grid semanal (5 dias úteis × 9 slots de 1h)
// ════════════════════════════════════════════════════════════

let _fotoSemanaOffset = 0; // 0 = semana atual, -1 = anterior, +1 = próxima
let _fotoEditId = null;

// 6 horários fixos (09-11h seleção / 14-16h geral) + 1 slot LIVRE às 17h
// fora dos fixos pra emergências. O TIPO (selecao/geral) vem da flag no
// registro, não do horário. Default: manhã = selecao, tarde = geral.
const _FOTO_HORAS = ['09:00','10:00','11:00','14:00','15:00','16:00','17:00'];
const _FOTO_HORARIO_LIVRE = '17:00';   // slot extra, sem ocupar os fixos
function _fotoTipoDefault(hora){
  return String(hora).slice(0,5) <= '11:59' ? 'selecao' : 'geral';
}
function _fotoEhSlotLivre(hora){ return String(hora).slice(0,5) === _FOTO_HORARIO_LIVRE; }

// Regiões atendidas em cada dia (fonte: comunicado do fotógrafo jun/2026).
// Terça = zona sul/Jabaquara/Vila Mariana. Quarta = Moema/Itaim/Brooklin.
const _FOTO_REGIOES = {
  terca: [
    'Planalto Paulista','Vila da Saúde','Bosque da Saúde','Sacomã','Jabaquara',
    'Vila Guarani','Vila Santa Catarina','Vila Mascote','Jardim Aeroporto',
    'Vila Mariana','Aclimação','Ipiranga','Paraíso','Mirandópolis'
  ],
  quarta: [
    'Moema','Vila Olímpia','Vila Nova Conceição','Itaim Bibi','Indianópolis',
    'Brooklin','Campo Belo'
  ]
};
function _fotoRegioesDoDia(d){
  const dy = d.getDay(); // 2=ter, 3=qua
  if (dy === 2) return _FOTO_REGIOES.terca;
  if (dy === 3) return _FOTO_REGIOES.quarta;
  return [];
}

function _fotoSegunda(offset){
  const d = new Date();
  d.setHours(0,0,0,0);
  const dy = d.getDay() || 7;          // 1=seg ... 7=dom
  d.setDate(d.getDate() - dy + 1 + offset*7); // segunda da semana atual + offset
  return d;
}
// Atende SÓ terça e quarta (índice 1 e 2 a partir da segunda).
function _fotoSemanaDias(offset){
  const seg = _fotoSegunda(offset);
  return [1,2].map(i => {
    const d = new Date(seg);
    d.setDate(seg.getDate()+i);
    return d;
  });
}
function _fotoIsoLocal(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function navSemanaFoto(delta){
  if (delta === 0) _fotoSemanaOffset = 0;
  else _fotoSemanaOffset += delta;
  renderAgendaFotografo();
}

async function carregarAgendaFotografo(){
  // Popula o filtro de região com Ter+Qua agrupados (uma vez)
  const selFilt = document.getElementById('foto-filtro-regiao');
  if (selFilt && selFilt.options.length <= 1) {
    selFilt.innerHTML = '<option value="">Todas as regiões</option>' +
      '<optgroup label="Terça (Zona Sul / Jabaquara / V. Mariana)">' +
        _FOTO_REGIOES.terca.map(r => `<option>${r}</option>`).join('') +
      '</optgroup>' +
      '<optgroup label="Quarta (Moema / Itaim / Brooklin)">' +
        _FOTO_REGIOES.quarta.map(r => `<option>${r}</option>`).join('') +
      '</optgroup>';
  }
  await renderAgendaFotografo();
}

async function renderAgendaFotografo(){
  const dias = _fotoSemanaDias(_fotoSemanaOffset);     // [terça, quarta]
  const terIso = _fotoIsoLocal(dias[0]);
  const quaIso = _fotoIsoLocal(dias[1]);
  const lbl = `${dias[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${dias[1].toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}`;
  const rel = _fotoSemanaOffset===0 ? 'Esta semana' : _fotoSemanaOffset===1 ? 'Próxima semana' : _fotoSemanaOffset===-1 ? 'Semana passada' : (_fotoSemanaOffset>0?`Em ${_fotoSemanaOffset} sem`:`Há ${Math.abs(_fotoSemanaOffset)} sem`);
  document.getElementById('foto-wk-label').textContent = `${rel} · ${lbl}`;

  const regiao = document.getElementById('foto-filtro-regiao')?.value || '';
  // Como terça e quarta são consecutivas, gte/lte cobre os 2 dias
  let q = `?data=gte.${terIso}&data=lte.${quaIso}&order=data,hora`;
  if (regiao) q += `&regiao=eq.${encodeURIComponent(regiao)}`;

  let dados;
  try {
    dados = await db.get('vendas_agenda_fotografo', q);
  } catch(e) {
    document.getElementById('foto-grid').innerHTML =
      `<div style="text-align:center;padding:24px;color:var(--danger)">Erro: ${e.message}<br><small>Rodou o SQL gestao_vendas.sql no Supabase?</small></div>`;
    return;
  }

  // Indexa por chave "YYYY-MM-DD|HH:MM"
  const idx = {};
  (dados||[]).forEach(d => {
    const h = String(d.hora||'').slice(0,5);
    idx[`${d.data}|${h}`] = d;
  });

  // KPIs
  let nAgend=0, nReal=0, nCanc=0;
  (dados||[]).forEach(d => {
    if (d.status === 'realizado') nReal++;
    else if (d.status === 'cancelado') nCanc++;
    else if (d.status === 'agendado') nAgend++;
  });
  const slotsTotal = dias.length * _FOTO_HORAS.length;
  const slotsLivres = slotsTotal - (dados||[]).filter(d=>d.status==='agendado'||d.status==='realizado').length;
  document.getElementById('kpi-foto-sem').textContent  = nAgend;
  document.getElementById('kpi-foto-real').textContent = nReal;
  document.getElementById('kpi-foto-canc').textContent = nCanc;
  document.getElementById('kpi-foto-livre').textContent = slotsLivres;

  // Header da grid (só Ter + Qua, com regiões atendidas em cada dia)
  const ns = ['Terça-feira','Quarta-feira'];
  const hoje = new Date().toDateString();
  let html = `<table style="width:100%;border-collapse:separate;border-spacing:0;min-width:680px">
    <thead><tr>
      <th style="width:108px;background:#f8fafc;border-bottom:1px solid var(--borda);padding:10px 6px;font-size:11px;color:#94a3b8;font-weight:700;vertical-align:top">Horário</th>`;
  dias.forEach((d,i) => {
    const ehHoje = d.toDateString()===hoje;
    const regs = _fotoRegioesDoDia(d);
    html += `<th style="background:#f8fafc;border-bottom:1px solid var(--borda);padding:10px 10px;text-align:left;vertical-align:top">
      <div style="display:flex;align-items:baseline;gap:6px">
        <div style="font-size:13px;font-weight:700;color:var(--txt)">${ns[i]}</div>
        <div style="font-size:18px;font-weight:800;${ehHoje?'color:var(--pri)':''}">${d.getDate()}</div>
        <div style="font-size:11px;color:#94a3b8">${d.toLocaleDateString('pt-BR',{month:'short'})}</div>
      </div>
      <div style="font-size:10px;color:var(--muted);font-weight:400;line-height:1.4;margin-top:4px;max-width:340px">
        <b style="color:#475569">Regiões:</b> ${regs.join(' · ')}
      </div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  // Contadores de seleção vs geral na semana (mostra no topo do grid)
  let nSel=0, nGer=0;
  (dados||[]).forEach(d => {
    if (d.status === 'cancelado') return;
    if (d.tipo === 'selecao') nSel++; else nGer++;
  });

  // Linhas: uma por slot. Tipo do AGENDAMENTO (ou default do horário se vago).
  // Slot das 17h é "livre" — separado visualmente dos 6 fixos.
  _FOTO_HORAS.forEach(hora => {
    const ehLivre = _fotoEhSlotLivre(hora);
    if (ehLivre) {
      // Separador "SLOT LIVRE" antes da linha das 17h
      html += `<tr><td colspan="${1+dias.length}" style="background:#fef9c3;padding:6px 10px;border-top:2px dashed #facc15;border-bottom:1px solid var(--borda);font-size:10px;color:#854d0e;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:center">🕓 Slot LIVRE — fora dos horários fixos (emergência/extra)</td></tr>`;
    }
    const bgHorario = ehLivre ? '#fffbeb' : '#f8fafc';
    const corHorario = ehLivre ? '#854d0e' : '#475569';
    html += `<tr>
      <td style="background:${bgHorario};border-right:1px solid var(--borda);border-bottom:1px solid var(--borda);padding:8px 10px;font-size:12px;font-weight:700;color:${corHorario};text-align:center">
        ${hora}
      </td>`;
    dias.forEach(d => {
      const iso = _fotoIsoLocal(d);
      const ag = idx[`${iso}|${hora}`];
      if (ag) {
        const stCor = {agendado:'#3b82f6', realizado:'#10b981', cancelado:'#ef4444', livre:'#94a3b8'}[ag.status] || '#94a3b8';
        const stBg  = {agendado:'#dbeafe', realizado:'#d1fae5', cancelado:'#fee2e2', livre:'#f1f5f9'}[ag.status] || '#e2e8f0';
        const tipo = ag.tipo || _fotoTipoDefault(hora);
        const tipoBadge = tipo==='selecao'
          ? '<span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">⭐ Sel</span>'
          : '<span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">🏠 Geral</span>';
        const corretor = (ag.corretor||'').split(' ')[0];
        const codigo = ag.codigo_imovel || '';
        const ehLivre = ag.status === 'livre';
        const confirmadoBadge = ag.confirmado
          ? '<span title="Confirmado com zelador/proprietário" style="font-size:10px;color:var(--verde);font-weight:700">✓</span>'
          : (ehLivre ? '' : '<button onclick="event.stopPropagation();confirmarAgendaFoto(\''+ag.id+'\')" title="Marcar como confirmado" style="background:#fff;border:1px solid var(--borda);border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;color:var(--muted)">confirmar</button>');
        const acessoIcons = [
          ag.imovel_vago     ? '<span title="Imóvel vago">🏠</span>' : '',
          ag.chaves_portaria ? '<span title="Chaves na portaria">🔑</span>' : ''
        ].filter(Boolean).join('');
        const obsTitle = [
          ehLivre ? 'LIVRE — entrada direta' : null,
          ag.endereco, ag.unidade?`Und. ${ag.unidade}`:null,
          ag.regiao, ag.telefone, ag.observacoes,
          ag.imovel_vago ? 'Imóvel vago' : null,
          ag.chaves_portaria ? 'Chaves na portaria' : null,
          ag.confirmado ? '✓ Confirmado' : null
        ].filter(Boolean).join(' · ');
        html += `<td style="border-right:1px solid var(--borda);border-bottom:1px solid var(--borda);padding:0;vertical-align:top">
          <div onclick="abrirEditarAgendaFoto('${ag.id}')" title="${obsTitle.replace(/"/g,'&quot;')}" style="padding:8px 10px;background:${stBg};border-left:3px solid ${stCor};cursor:pointer;min-height:60px;font-size:11px;line-height:1.3">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              ${codigo?`<span style="font-weight:700;font-family:monospace;color:${stCor};font-size:11px">${codigo}</span>`:'<span></span>'}
              <span style="display:flex;align-items:center;gap:4px">${acessoIcons}${tipoBadge}</span>
            </div>
            ${ehLivre ? '<div style="color:#475569;font-weight:600;font-size:11px;margin-top:2px">LIVRE — entrada direta</div>' : ''}
            ${corretor?`<div style="color:#1e293b;font-weight:600;margin-top:2px">${corretor}</div>`:''}
            ${ag.endereco?`<div style="color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${ag.endereco}</div>`:''}
            ${ag.regiao?`<div style="color:var(--muted);font-size:10px;font-style:italic">${ag.regiao}</div>`:''}
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:4px">${confirmadoBadge}</div>
          </div>
        </td>`;
      } else {
        html += `<td style="border-right:1px solid var(--borda);border-bottom:1px solid var(--borda);padding:0;vertical-align:top">
          <div onclick="abrirNovoAgendaFoto('${iso}','${hora}')" title="Clique para agendar" style="padding:8px 10px;min-height:60px;cursor:pointer;text-align:center;color:#cbd5e1;font-size:11px;display:flex;align-items:center;justify-content:center">+ agendar</div>
        </td>`;
      }
    });
    html += '</tr>';
  });
  html += `<tr><td colspan="${1+dias.length}" style="padding:8px 10px;background:#fafbfc;font-size:11px;color:var(--muted);text-align:right;border-top:1px solid var(--borda)">
    <span style="margin-right:14px">⭐ <b>${nSel}</b> seleção</span>
    <span>🏠 <b>${nGer}</b> geral</span>
  </td></tr>`;
  html += '</tbody></table>';
  document.getElementById('foto-grid').innerHTML = html;

  // Renderiza extras da semana abaixo do grid principal (dias/horas fora
  // da pauta padrao terca/quarta 9-17h).
  renderFotoExtrasNaSemana(terIso, quaIso, dias);
}

// ─── DISPONIBILIDADE EXTRA DO FOTOGRAFO ─────────────────────────
// Slots que o proprio fotografo abre em dias/horarios fora do padrao.
// Gerentes veem esses blocos como cards abaixo do grid da semana, e
// clicam pra agendar. O fotografo pode remover slots que ainda nao
// tem agendamento sobreposto.

async function renderFotoExtrasNaSemana(terIso, quaIso, diasTerQua) {
  const bloco = document.getElementById('foto-extras-bloco');
  if (!bloco) return;
  // Cobre da segunda (dia anterior a terca) ate domingo (dia+5 a partir de terca)
  const ini = new Date(diasTerQua[0]); ini.setDate(ini.getDate()-1); // segunda
  const fim = new Date(diasTerQua[0]); fim.setDate(fim.getDate()+5); // domingo
  const iniIso = _fotoIsoLocal(ini);
  const fimIso = _fotoIsoLocal(fim);
  let extras;
  try {
    extras = await db.get('vendas_fotografo_disponibilidade',
      `?data=gte.${iniIso}&data=lte.${fimIso}&order=data,hora_inicio`);
  } catch(e) {
    bloco.innerHTML = '';
    return; // tabela pode nao existir ainda — silencia
  }
  // Filtra: nao mostra terca nem quarta (ja aparecem no grid principal
  // como slots normais quando ha agendamento em cima)
  const extrasFiltrados = (extras||[]).filter(e => e.data !== terIso && e.data !== quaIso);
  if (!extrasFiltrados.length) { bloco.innerHTML = ''; return; }

  const cards = extrasFiltrados.map(e => {
    const d = new Date(e.data + 'T00:00:00');
    const dow = d.toLocaleDateString('pt-BR',{weekday:'long'});
    const dl = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
    const hi = String(e.hora_inicio||'').slice(0,5);
    const hf = String(e.hora_fim||'').slice(0,5);
    return `<div style="border:1.5px dashed #f59e0b;background:#fffbeb;border-radius:10px;padding:10px 12px;cursor:pointer"
                 onclick="abrirNovoAgendaFoto('${e.data}','${hi}')"
                 title="Clique para agendar neste bloco extra aberto pelo fotógrafo">
      <div style="font-size:10px;color:#854d0e;font-weight:700;text-transform:uppercase;letter-spacing:.05em">🆕 Extra</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:2px">${dow} · ${dl}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px">${hi} – ${hf}</div>
      ${e.regiao ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic">${e.regiao}</div>` : ''}
      ${e.observacoes ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${e.observacoes}</div>` : ''}
    </div>`;
  }).join('');

  bloco.innerHTML = `<div class="card" style="padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div>
        <div style="font-size:13px;font-weight:700;color:#1e293b">Disponibilidade extra (${extrasFiltrados.length})</div>
        <div style="font-size:11px;color:var(--muted)">Janelas abertas pelo fotógrafo fora da pauta padrão — clique para agendar</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${cards}</div>
  </div>`;
}

async function carregarFotoDisp(){
  const box = document.getElementById('foto-disp-lista');
  if (!box) return;
  box.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:20px;text-align:center">Carregando…</div>';

  const hojeIso = _fotoIsoLocal(new Date());
  let extras;
  try {
    extras = await db.get('vendas_fotografo_disponibilidade',
      `?data=gte.${hojeIso}&order=data,hora_inicio&limit=200`);
  } catch(e) {
    box.innerHTML = `<div style="color:var(--danger);padding:20px;text-align:center">Erro: ${e.message}<br><small>Rodou o SQL fotografo_disponibilidade.sql no Supabase?</small></div>`;
    return;
  }

  // Detecta uso: existe agendamento no MESMO dia com hora dentro do range?
  let agendamentosDias = [];
  if ((extras||[]).length) {
    const dias = Array.from(new Set(extras.map(e => e.data)));
    try {
      const inQ = dias.map(encodeURIComponent).join(',');
      agendamentosDias = await db.get('vendas_agenda_fotografo',
        `?data=in.(${inQ})&status=neq.cancelado&select=data,hora`);
    } catch(_) {}
  }
  const usoPorDia = {};
  agendamentosDias.forEach(a => {
    const h = String(a.hora||'').slice(0,5);
    (usoPorDia[a.data] = usoPorDia[a.data] || []).push(h);
  });

  if (!extras.length) {
    box.innerHTML = `<div style="text-align:center;padding:32px;color:#94a3b8">
      <div style="font-size:36px;margin-bottom:8px">📅</div>
      <div style="font-size:14px;font-weight:600;color:#475569">Nenhuma disponibilidade extra aberta</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:4px">Abra dias/horários pra ampliar a agenda além de terça e quarta</div>
    </div>`;
    return;
  }

  const rows = extras.map(e => {
    const d = new Date(e.data + 'T00:00:00');
    const dow = d.toLocaleDateString('pt-BR',{weekday:'long'});
    const dl = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'2-digit'});
    const hi = String(e.hora_inicio||'').slice(0,5);
    const hf = String(e.hora_fim||'').slice(0,5);
    // Slot está "usado" se algum agendamento cai dentro do range
    const usados = (usoPorDia[e.data]||[]).filter(h => h >= hi && h < hf);
    const usado = usados.length > 0;
    const badge = usado
      ? `<span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-weight:700">${usados.length} agendamento(s)</span>`
      : `<span style="font-size:10px;background:#f1f5f9;color:#475569;padding:2px 6px;border-radius:4px;font-weight:600">Livre</span>`;
    const botao = usado
      ? `<span style="font-size:11px;color:#94a3b8" title="Já tem agendamento neste bloco — remova o agendamento primeiro">bloqueado</span>`
      : `<button class="btn btn-o bsm" style="color:var(--danger)" onclick="removerFotoDisp('${e.id}')">🗑️ Remover</button>`;
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid var(--borda)">
        <div style="font-weight:700;color:#1e293b">${dow}</div>
        <div style="font-size:11px;color:var(--muted)">${dl}</div>
      </td>
      <td style="padding:10px;border-bottom:1px solid var(--borda);font-family:monospace;font-weight:700">${hi} – ${hf}</td>
      <td style="padding:10px;border-bottom:1px solid var(--borda);color:var(--muted);font-size:12px">${e.regiao||'—'}</td>
      <td style="padding:10px;border-bottom:1px solid var(--borda)">${badge}</td>
      <td style="padding:10px;border-bottom:1px solid var(--borda);text-align:right">${botao}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f8fafc">
      <th style="text-align:left;padding:10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Dia</th>
      <th style="text-align:left;padding:10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Horário</th>
      <th style="text-align:left;padding:10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Região</th>
      <th style="text-align:left;padding:10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Status</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function abrirNovoFotoDisp(){
  const hoje = _fotoIsoLocal(new Date());
  document.getElementById('fdisp-data').value = hoje;
  document.getElementById('fdisp-data').min = hoje;
  document.getElementById('fdisp-hi').value = '08:00';
  document.getElementById('fdisp-hf').value = '18:00';
  document.getElementById('fdisp-reg').value = '';
  document.getElementById('fdisp-obs').value = '';
  openM('m-foto-disp');
}

async function salvarFotoDisp(){
  const data = document.getElementById('fdisp-data').value;
  const hi = document.getElementById('fdisp-hi').value;
  const hf = document.getElementById('fdisp-hf').value;
  if (!data || !hi || !hf) { alert('Preencha data, hora início e hora fim'); return; }
  if (hf <= hi) { alert('Hora fim deve ser depois da hora início'); return; }
  const payload = {
    data,
    hora_inicio: hi,
    hora_fim: hf,
    regiao: document.getElementById('fdisp-reg').value.trim() || null,
    observacoes: document.getElementById('fdisp-obs').value.trim() || null,
    criado_por: (typeof CUR !== 'undefined' && CUR) ? (CUR.email || CUR.nome || '') : ''
  };
  try {
    await db.post('vendas_fotografo_disponibilidade', payload);
    closeM('m-foto-disp');
    carregarFotoDisp();
  } catch(e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

async function removerFotoDisp(id){
  if (!confirm('Remover essa janela de disponibilidade?')) return;
  try {
    await db.del('vendas_fotografo_disponibilidade', id);
    carregarFotoDisp();
  } catch(e) {
    alert('Erro ao remover: ' + e.message);
  }
}

// Ajusta o tipo conforme a hora escolhida — apenas em novo agendamento
// (na edição, o tipo já foi setado conforme o registro).
function _fotoAtualizarTipoDefault(){
  if (_fotoEditId) return;
  const hora = document.getElementById('foto-hora')?.value;
  const sel = document.getElementById('foto-tipo');
  if (sel && hora) sel.value = _fotoTipoDefault(hora);
}

// Vago + chaves na portaria => status 'livre' automatico (entrada direta).
// Roda toda vez que algum dos 2 checkboxes muda.
function _fotoAtualizarLogistica(){
  const vago    = document.getElementById('foto-vago')?.checked;
  const chaves  = document.getElementById('foto-chaves')?.checked;
  const selSt   = document.getElementById('foto-status');
  const hint    = document.getElementById('foto-logistica-hint');
  if (vago && chaves) {
    if (selSt) selSt.value = 'livre';
    if (hint) hint.innerHTML = '✅ <b style="color:var(--verde)">Entrada direta liberada.</b> Status definido como "Livre" — fotógrafo pode ir sem confirmar.';
  } else {
    if (selSt && selSt.value === 'livre') selSt.value = 'agendado';
    if (hint) hint.innerHTML = 'Marque ambos pra liberar entrada direta (fotógrafo não precisa confirmar com ninguém).';
  }
}

// Popula o select de região com as opções do dia escolhido (ter ou qua).
// Preserva o valor atual se ainda for válido pro novo dia, ou limpa.
function _fotoPopularRegioes(){
  const sel = document.getElementById('foto-regiao');
  if (!sel) return;
  const data = document.getElementById('foto-data')?.value;
  if (!data) {
    sel.innerHTML = '<option value="">— escolha a data primeiro —</option>';
    return;
  }
  const d = new Date(data + 'T12:00:00');
  const dy = d.getDay();
  const regs = _fotoRegioesDoDia(d);
  const valorAtual = sel.value;
  if (!regs.length) {
    sel.innerHTML = '<option value="">⚠ Dia inválido (só ter/qua)</option>';
    return;
  }
  const dia = dy===2 ? 'Terça (Zona Sul/Jabaquara/Vila Mariana)' : 'Quarta (Moema/Itaim/Brooklin)';
  sel.innerHTML = '<option value="">— escolha —</option>' +
    `<optgroup label="${dia}">` +
    regs.map(r => `<option ${r===valorAtual?'selected':''}>${r}</option>`).join('') +
    '</optgroup>';
}

// Próximo dia útil válido (terça ou quarta) a partir de hoje
function _fotoProximoDiaValido(){
  const d = new Date();
  d.setHours(0,0,0,0);
  for (let i=0; i<14; i++) {
    const t = new Date(d); t.setDate(d.getDate()+i);
    const dy = t.getDay();
    if (dy === 2 || dy === 3) return t;
  }
  return d;
}

function abrirNovoAgendaFoto(dataPre, horaPre){
  _fotoEditId = null;
  document.getElementById('m-foto-titulo').textContent = '+ Novo Agendamento';
  ['foto-codigo','foto-unidade','foto-endereco','foto-corretor','foto-telefone','foto-obs']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('foto-status').value = 'agendado';
  // Reseta as flags logísticas
  ['foto-vago','foto-chaves','foto-confirmado'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = false;
  });
  const infoConf = document.getElementById('foto-confirmado-info');
  if (infoConf) infoConf.textContent = '';
  if (dataPre) {
    document.getElementById('foto-data').value = dataPre;
    document.getElementById('foto-hora').value = horaPre || '09:00';
  } else {
    // padrão: próxima ter/qua
    document.getElementById('foto-data').value = _fotoIsoLocal(_fotoProximoDiaValido());
    document.getElementById('foto-hora').value = '09:00';
  }
  // Default do tipo conforme horário (manhã = seleção; tarde = geral), pode mudar
  const selTipo = document.getElementById('foto-tipo');
  if (selTipo) selTipo.value = _fotoTipoDefault(document.getElementById('foto-hora').value);
  _fotoPopularRegioes();
  _fotoAtualizarLogistica();
  document.getElementById('m-foto-btn-excluir').style.display = 'none';
  openM('m-foto');
}

async function abrirEditarAgendaFoto(id){
  try {
    const list = await db.get('vendas_agenda_fotografo', `?id=eq.${id}`);
    const a = list?.[0];
    if (!a) { toast('Agendamento não encontrado.','err'); return; }
    _fotoEditId = id;
    document.getElementById('m-foto-titulo').textContent = '✏️ Editar Agendamento';
    document.getElementById('foto-data').value     = a.data || '';
    document.getElementById('foto-hora').value     = (a.hora||'').slice(0,5);
    document.getElementById('foto-codigo').value   = a.codigo_imovel || '';
    document.getElementById('foto-unidade').value  = a.unidade || '';
    document.getElementById('foto-endereco').value = a.endereco || '';
    document.getElementById('foto-corretor').value = a.corretor || '';
    document.getElementById('foto-telefone').value = a.telefone || '';
    document.getElementById('foto-status').value   = a.status || 'agendado';
    document.getElementById('foto-obs').value      = a.observacoes || '';
    const selTipo = document.getElementById('foto-tipo');
    if (selTipo) selTipo.value = a.tipo || _fotoTipoDefault((a.hora||'').slice(0,5));
    // Flags logísticas
    const cbVago = document.getElementById('foto-vago');
    const cbChav = document.getElementById('foto-chaves');
    const cbConf = document.getElementById('foto-confirmado');
    if (cbVago) cbVago.checked = !!a.imovel_vago;
    if (cbChav) cbChav.checked = !!a.chaves_portaria;
    if (cbConf) cbConf.checked = !!a.confirmado;
    const infoConf = document.getElementById('foto-confirmado-info');
    if (infoConf) {
      infoConf.textContent = a.confirmado && a.confirmado_em
        ? `Confirmado em ${new Date(a.confirmado_em).toLocaleString('pt-BR')}`
        : '';
    }
    _fotoAtualizarLogistica();
    // Popula região conforme a data e tenta selecionar o valor salvo
    _fotoPopularRegioes();
    const selReg = document.getElementById('foto-regiao');
    if (selReg && a.regiao) {
      let achei = false;
      for (let i=0; i<selReg.options.length; i++) {
        if (selReg.options[i].value === a.regiao) { selReg.selectedIndex = i; achei = true; break; }
      }
      // Se a região salva não está na lista (legacy), adiciona como opção solta
      if (!achei) {
        const opt = document.createElement('option');
        opt.value = a.regiao; opt.textContent = `${a.regiao} (legado)`;
        opt.selected = true;
        selReg.appendChild(opt);
      }
    }
    document.getElementById('m-foto-btn-excluir').style.display = '';
    openM('m-foto');
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function salvarAgendaFoto(){
  const data = document.getElementById('foto-data')?.value;
  const hora = document.getElementById('foto-hora')?.value;
  if (!data || !hora) { toast('Informe data e hora.','err'); return; }
  // Validações: data deve ser ter/qua e hora deve ser um slot oficial
  const dy = new Date(data + 'T12:00:00').getDay();
  if (dy !== 2 && dy !== 3) { toast('O fotógrafo só atende terça e quarta.','err'); return; }
  if (!_FOTO_HORAS.includes(hora)) { toast(`Hora inválida. Use: ${_FOTO_HORAS.join(', ')}.`,'err'); return; }
  const vago    = !!document.getElementById('foto-vago')?.checked;
  const chaves  = !!document.getElementById('foto-chaves')?.checked;
  const confCb  = !!document.getElementById('foto-confirmado')?.checked;
  // Se vago + chaves portaria => entrada direta, auto-livre e auto-confirmado
  const autoLivre = (vago && chaves);
  const statusRaw = document.getElementById('foto-status')?.value || 'agendado';
  const status    = autoLivre ? 'livre' : statusRaw;
  const confirmado = confCb || autoLivre;

  const payload = {
    data,
    hora,
    tipo:          document.getElementById('foto-tipo')?.value || _fotoTipoDefault(hora),
    codigo_imovel: document.getElementById('foto-codigo')?.value || null,
    unidade:       document.getElementById('foto-unidade')?.value || null,
    endereco:      document.getElementById('foto-endereco')?.value || null,
    corretor:      document.getElementById('foto-corretor')?.value || null,
    telefone:      document.getElementById('foto-telefone')?.value || null,
    regiao:        document.getElementById('foto-regiao')?.value || null,
    status,
    imovel_vago:     vago,
    chaves_portaria: chaves,
    confirmado,
    confirmado_em:   confirmado ? new Date().toISOString() : null,
    confirmado_por_id: confirmado ? (CUR?.id || null) : null,
    observacoes:   document.getElementById('foto-obs')?.value || null
  };
  try {
    if (_fotoEditId) {
      await db.patch('vendas_agenda_fotografo', _fotoEditId, payload);
      toast('✅ Agendamento atualizado.','ok');
    } else {
      payload.criado_por_id = CUR?.id || null;
      await db.post('vendas_agenda_fotografo', payload);
      toast('✅ Agendamento criado.','ok');
    }
    _fotoEditId = null;
    closeM('m-foto');
    renderAgendaFotografo();
  } catch(e) {
    // UNIQUE (data, hora) — slot já ocupado
    if (String(e.message||'').includes('duplicate') || String(e.message||'').includes('vendas_agenda_fotografo_data_hora_key')) {
      toast('Já existe agendamento neste dia/hora. Edite o existente ou escolha outro horário.','err');
    } else {
      toast('Erro: '+e.message,'err');
    }
  }
}

// Confirmacao rapida: o fotografo (ou outro user) clica no botao "confirmar"
// no card do grid sem precisar abrir o modal. Marca confirmado=true com
// timestamp e identifica quem confirmou.
async function confirmarAgendaFoto(id){
  if (!id) return;
  try {
    await db.patch('vendas_agenda_fotografo', id, {
      confirmado:        true,
      confirmado_em:     new Date().toISOString(),
      confirmado_por_id: CUR?.id || null
    });
    toast('✓ Agendamento confirmado.','ok');
    renderAgendaFotografo();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function excluirAgendamentoFoto(){
  if (!_fotoEditId) return;
  if (!confirm('Excluir este agendamento?')) return;
  try {
    await db.del('vendas_agenda_fotografo', _fotoEditId);
    toast('🗑️ Agendamento removido.','ok');
    _fotoEditId = null;
    closeM('m-foto');
    renderAgendaFotografo();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

// ════════════════════════════════════════════════════════════
// COTAS DE ANÚNCIOS — preenchimento mensal por corretor
// ════════════════════════════════════════════════════════════

let _cotasMes  = null;        // YYYY-MM atual da tela
let _cotasAtuais = [];        // linhas do mês selecionado
let _cotasAnteriores = {};    // { corretor_nome: row } do mês anterior

function _mesAnterior(yyyymm){
  const [y,m] = yyyymm.split('-').map(Number);
  if (m === 1) return (y-1) + '-12';
  return y + '-' + String(m-1).padStart(2,'0');
}

async function carregarVendasCotas(){
  const inpMes = document.getElementById('cota-mes');
  if (inpMes && !inpMes.value) inpMes.value = _mesAtual();
  const mes = inpMes?.value || _mesAtual();
  _cotasMes = mes;
  const equipe = document.getElementById('cota-equipe')?.value || '';

  let q = `?mes=eq.${mes}&order=equipe.asc.nullslast,corretor_nome.asc`;
  if (equipe) q += `&equipe=eq.${encodeURIComponent(equipe)}`;

  let dados;
  try {
    dados = await db.get('vendas_cotas', q);
  } catch(e) {
    document.getElementById('tb-vnd-cotas').innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--danger)">Erro: ${e.message}<br><small>A tabela já foi criada no Supabase?</small></td></tr>`;
    return;
  }
  _cotasAtuais = dados || [];

  // Busca mês anterior pra comparação (só os campos necessários)
  const mesAnt = _mesAnterior(mes);
  try {
    const ant = await db.get('vendas_cotas', `?mes=eq.${mesAnt}&select=corretor_nome,total_anuncios`);
    _cotasAnteriores = {};
    (ant||[]).forEach(r => { _cotasAnteriores[r.corretor_nome] = r; });
  } catch(_){ _cotasAnteriores = {}; }

  // KPIs (do mês inteiro — equipe filtrada ou não)
  let sd=0, dc=0, tot=0;
  _cotasAtuais.forEach(r => {
    sd  += Number(r.super_destaque||0);
    dc  += Number(r.destaque_comum||0);
    tot += Number(r.total_anuncios||0);
  });
  document.getElementById('kpi-cot-sd').textContent   = sd;
  document.getElementById('kpi-cot-dc').textContent   = dc;
  document.getElementById('kpi-cot-tot').textContent  = tot;
  document.getElementById('kpi-cot-corr').textContent = _cotasAtuais.length;

  renderCotasTabela();
  renderRankingEquipe();
}

function renderCotasTabela(){
  const tbody = document.getElementById('tb-vnd-cotas');
  if (!tbody) return;
  const busca = document.getElementById('cota-busca')?.value?.toLowerCase() || '';
  let filtrados = _cotasAtuais;
  if (busca) {
    filtrados = filtrados.filter(r =>
      (r.corretor_nome||'').toLowerCase().includes(busca) ||
      (r.equipe||'').toLowerCase().includes(busca)
    );
  }
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8">
      Nenhum corretor cadastrado nesse mês. Clique em <b>+ Corretor</b> ou <b>📋 Copiar mês anterior</b>.
    </td></tr>`;
    return;
  }
  tbody.innerHTML = filtrados.map(r => {
    const ant = _cotasAnteriores[r.corretor_nome];
    const totalAtual = Number(r.total_anuncios||0);
    const totalAnt = ant ? Number(ant.total_anuncios||0) : null;
    let deltaTxt = '—';
    let deltaCor = 'var(--muted)';
    if (totalAnt !== null) {
      const diff = totalAtual - totalAnt;
      if (diff > 0)      { deltaTxt = `▲ +${diff}`; deltaCor = 'var(--verde)'; }
      else if (diff < 0) { deltaTxt = `▼ ${diff}`;  deltaCor = 'var(--danger)'; }
      else               { deltaTxt = `= ${diff}`;  deltaCor = 'var(--muted)'; }
    }
    return `<tr>
      <td style="font-size:13px;font-weight:600">${r.corretor_nome}</td>
      <td style="font-size:12px;color:var(--muted)">${r.equipe||'—'}</td>
      <td style="text-align:center"><input type="number" min="0" value="${r.super_destaque||0}" onchange="atualizarCotaCampo('${r.id}','super_destaque',this.value)" style="width:64px;padding:5px;border:1px solid var(--borda);border-radius:6px;font-size:13px;text-align:center"></td>
      <td style="text-align:center"><input type="number" min="0" value="${r.destaque_comum||0}" onchange="atualizarCotaCampo('${r.id}','destaque_comum',this.value)" style="width:64px;padding:5px;border:1px solid var(--borda);border-radius:6px;font-size:13px;text-align:center"></td>
      <td style="text-align:center"><input type="number" min="0" value="${r.total_anuncios||0}" onchange="atualizarCotaCampo('${r.id}','total_anuncios',this.value)" style="width:64px;padding:5px;border:1px solid var(--borda);border-radius:6px;font-size:13px;text-align:center;font-weight:700"></td>
      <td style="text-align:center;font-size:12px;font-weight:700;color:${deltaCor}">${deltaTxt}${totalAnt!==null?` <span style="color:var(--muted);font-weight:400;font-size:10px">(${totalAnt})</span>`:''}</td>
      <td><input type="text" value="${(r.observacoes||'').replace(/"/g,'&quot;')}" onchange="atualizarCotaCampo('${r.id}','observacoes',this.value)" placeholder="—" style="width:100%;padding:5px 8px;border:1px solid var(--borda);border-radius:6px;font-size:12px"></td>
      <td><button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirCotaCorretor('${r.id}','${(r.corretor_nome||'').replace(/'/g,'')}')" title="Remover do mês">×</button></td>
    </tr>`;
  }).join('');
}

function renderRankingEquipe(){
  const cont = document.getElementById('cota-ranking-equipe');
  if (!cont) return;
  const porEq = {};
  _cotasAtuais.forEach(r => {
    const eq = r.equipe || '(sem equipe)';
    if (!porEq[eq]) porEq[eq] = { sd:0, dc:0, tot:0, n:0 };
    porEq[eq].sd  += Number(r.super_destaque||0);
    porEq[eq].dc  += Number(r.destaque_comum||0);
    porEq[eq].tot += Number(r.total_anuncios||0);
    porEq[eq].n++;
  });
  const arr = Object.entries(porEq).sort((a,b) => b[1].tot - a[1].tot);
  if (!arr.length) {
    cont.innerHTML = '<div style="color:#94a3b8;font-size:13px">Cadastre cotas pra ver o ranking.</div>';
    return;
  }
  const maxTot = Math.max(...arr.map(([_,d]) => d.tot)) || 1;
  cont.innerHTML = arr.map(([eq,d]) => {
    const pct = Math.round(d.tot/maxTot*100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
        <span style="font-size:13px;font-weight:600">${eq}</span>
        <span style="font-size:12px;color:var(--muted)"><b style="color:var(--txt)">${d.tot}</b> anúncios · ${d.n} corretor${d.n!==1?'es':''} · SD ${d.sd} / DC ${d.dc}</span>
      </div>
      <div style="background:#f1f5f9;height:8px;border-radius:4px;overflow:hidden">
        <div style="background:linear-gradient(90deg,var(--pri),#3b82f6);width:${pct}%;height:100%;transition:width .3s"></div>
      </div>
    </div>`;
  }).join('');
}

async function atualizarCotaCampo(id, campo, valor){
  const isNum = campo === 'super_destaque' || campo === 'destaque_comum' || campo === 'total_anuncios';
  const v = isNum ? (parseInt(valor,10) || 0) : valor;
  try {
    await db.patch('vendas_cotas', id, { [campo]: v });
    // Atualiza o cache local pra recalcular KPIs sem refetch
    const row = _cotasAtuais.find(r => r.id === id);
    if (row) row[campo] = v;
    // KPIs e ranking
    let sd=0, dc=0, tot=0;
    _cotasAtuais.forEach(r => {
      sd  += Number(r.super_destaque||0);
      dc  += Number(r.destaque_comum||0);
      tot += Number(r.total_anuncios||0);
    });
    document.getElementById('kpi-cot-sd').textContent  = sd;
    document.getElementById('kpi-cot-dc').textContent  = dc;
    document.getElementById('kpi-cot-tot').textContent = tot;
    renderRankingEquipe();
  } catch(e) { toast('Erro ao salvar: '+e.message,'err'); }
}

function abrirNovaCotaCorretor(){
  document.getElementById('cot-novo-nome').value = '';
  document.getElementById('cot-novo-equipe').selectedIndex = 0;
  document.getElementById('cot-novo-sd').value = '0';
  document.getElementById('cot-novo-dc').value = '0';
  openM('m-cota-novo');
}

async function salvarNovaCotaCorretor(){
  const nome = document.getElementById('cot-novo-nome')?.value?.trim();
  if (!nome) { toast('Informe o nome do corretor.','err'); return; }
  const equipe = document.getElementById('cot-novo-equipe')?.value || null;
  const sd = parseInt(document.getElementById('cot-novo-sd')?.value, 10) || 0;
  const dc = parseInt(document.getElementById('cot-novo-dc')?.value, 10) || 0;
  try {
    await db.post('vendas_cotas', {
      mes:             _cotasMes,
      corretor_nome:   nome,
      equipe,
      super_destaque:  sd,
      destaque_comum:  dc,
      total_anuncios:  sd + dc
    });
    closeM('m-cota-novo');
    toast('✅ Corretor adicionado.','ok');
    carregarVendasCotas();
  } catch(e) {
    if (String(e.message||'').includes('duplicate') || String(e.message||'').includes('vendas_cotas_mes_corretor_nome_key')) {
      toast('Esse corretor já existe no mês selecionado.','err');
    } else {
      toast('Erro: '+e.message,'err');
    }
  }
}

async function excluirCotaCorretor(id, nome){
  if (!confirm(`Remover ${nome} desse mês? Os meses anteriores ficam intactos.`)) return;
  try {
    await db.del('vendas_cotas', id);
    toast('Corretor removido.','ok');
    carregarVendasCotas();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function copiarCotasDoMesAnterior(){
  const mesAnt = _mesAnterior(_cotasMes);
  if (!confirm(`Trazer todos os corretores de ${mesAnt} para ${_cotasMes} (cotas zeradas)? Os que já estão neste mês não são duplicados.`)) return;
  try {
    const anteriores = await db.get('vendas_cotas', `?mes=eq.${mesAnt}&select=corretor_nome,equipe`);
    if (!anteriores?.length) { toast('Mês anterior não tem cotas.','err'); return; }
    const jaExistem = new Set(_cotasAtuais.map(r => r.corretor_nome));
    const novos = anteriores.filter(a => !jaExistem.has(a.corretor_nome));
    if (!novos.length) { toast('Todos os corretores já estão no mês.','ok'); return; }
    // Insere em lote
    const payload = novos.map(a => ({
      mes: _cotasMes,
      corretor_nome: a.corretor_nome,
      equipe: a.equipe,
      super_destaque: 0,
      destaque_comum: 0,
      total_anuncios: 0
    }));
    await db.post('vendas_cotas', payload);
    toast(`✅ ${novos.length} corretor${novos.length>1?'es':''} adicionado${novos.length>1?'s':''}.`,'ok');
    carregarVendasCotas();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

// ════════════════════════════════════════════════════════════
// GERENCIAR CORRETORES (add / mover equipe / desativar)
// ════════════════════════════════════════════════════════════
async function abrirGerenciarCorretores(){
  // Guarda extra alem do botao oculto (alguem chamando via console)
  if (typeof podeGerenciarCorretores === 'function' && !podeGerenciarCorretores()) {
    toast('⚠️ Gestão de corretores é restrita a gerentes e assistentes autorizadas.','err');
    return;
  }
  openM('m-vnd-corretores');
  await renderGerenciarCorretores();
}

async function renderGerenciarCorretores(){
  const box = document.getElementById('corr-body');
  if (!box) return;
  box.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8">Carregando…</div>';
  let linhas;
  try {
    linhas = await db.get('vendas_corretores', '?ativo=eq.true&order=equipe,nome');
  } catch(e) {
    box.innerHTML = `<div style="color:var(--danger);padding:16px;text-align:center">Erro: ${e.message}<br><small>Rodou o SQL corretores_editaveis.sql no Supabase?</small></div>`;
    return;
  }
  linhas = linhas || [];
  const equipes = ['Aguia','Chris','Emilia','Felippe','Fenix'];
  const porEq = {};
  equipes.forEach(eq => { porEq[eq] = []; });
  linhas.forEach(l => { if (porEq[l.equipe]) porEq[l.equipe].push(l); });

  const opcaoEquipes = equipes.map(e => `<option value="${e}">${e}</option>`).join('');

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">
      ${equipes.map(eq => {
        const lista = porEq[eq];
        return `<div class="card" style="padding:12px 14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:14px;font-weight:700;color:var(--pri)">${eq}</div>
            <div style="font-size:11px;color:var(--muted)">${lista.length} corretor${lista.length!==1?'es':''}</div>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <input id="corr-novo-${eq}" placeholder="+ Novo corretor" style="flex:1;padding:6px 10px;border:1.5px solid var(--borda);border-radius:6px;font-size:12px">
            <button class="btn btn-p bsm" onclick="adicionarCorretor('${eq}')">Adicionar</button>
          </div>
          <div style="max-height:280px;overflow-y:auto;border:1px solid var(--borda);border-radius:6px">
            ${lista.length ? lista.map(l => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px">
              <span>${l.nome}</span>
              <div style="display:flex;gap:4px">
                <select onchange="moverCorretor('${l.id}',this.value,this)" title="Mover pra outra equipe" style="padding:2px 4px;border:1px solid var(--borda);border-radius:4px;font-size:11px">
                  <option value="">↔</option>
                  ${equipes.filter(e => e !== eq).map(e => `<option value="${e}">→ ${e}</option>`).join('')}
                </select>
                <button onclick="removerCorretor('${l.id}','${l.nome.replace(/'/g,"\\'")}')" title="Remover" style="background:#fff;border:1px solid var(--borda);border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:var(--danger)">🗑️</button>
              </div>
            </div>`).join('') : '<div style="padding:12px;text-align:center;color:#94a3b8;font-size:11px">Sem corretores</div>'}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:12px;padding:10px 12px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:11px;color:#92400e">
      <b>Dica:</b> mudanças aqui refletem no Controle de Presença e nos KPIs por equipe. Recarrega a página se não ver na hora.
    </div>
  `;
}

async function adicionarCorretor(equipe){
  const inp = document.getElementById('corr-novo-'+equipe);
  const nome = (inp?.value || '').trim();
  if (!nome) { toast('Digite o nome.','err'); return; }
  try {
    await db.post('vendas_corretores', {
      nome, equipe, ativo: true, criado_por: CUR?.nome || CUR?.email || null
    });
    toast(`✅ ${nome} adicionado em ${equipe}.`,'ok');
    if (inp) inp.value = '';
    _CORRETORES_CARREGADO = false;
    await carregarCorretoresDoBanco(true);
    await renderGerenciarCorretores();
  } catch(e) {
    const msg = String(e.message||'');
    if (msg.includes('uniq_corretor_por_equipe')) toast('⚠️ Este corretor já está nessa equipe.','err');
    else toast('Erro: '+msg,'err');
  }
}

async function removerCorretor(id, nome){
  if (!confirm(`Remover ${nome} da equipe?`)) return;
  try {
    await db.patch('vendas_corretores', id, { ativo: false, atualizado_em: new Date().toISOString() });
    toast(`🗑️ ${nome} removido.`,'ok');
    _CORRETORES_CARREGADO = false;
    await carregarCorretoresDoBanco(true);
    await renderGerenciarCorretores();
  } catch(e) { toast('Erro: '+e.message,'err'); }
}

async function moverCorretor(id, novaEquipe, selEl){
  if (!novaEquipe) return;
  try {
    await db.patch('vendas_corretores', id, { equipe: novaEquipe, atualizado_em: new Date().toISOString() });
    toast(`↔ Corretor movido pra ${novaEquipe}.`,'ok');
    _CORRETORES_CARREGADO = false;
    await carregarCorretoresDoBanco(true);
    await renderGerenciarCorretores();
  } catch(e) {
    if (selEl) selEl.value = '';
    const msg = String(e.message||'');
    if (msg.includes('uniq_corretor_por_equipe')) toast('⚠️ Já existe corretor com esse nome nessa equipe.','err');
    else toast('Erro: '+msg,'err');
  }
}

// ─── RELATÓRIO DE PRESENÇA (imprimível / salvar em PDF) ──────────
// Usa os mesmos filtros da tela (mês + equipe). Denominador igual ao
// da tela: lista oficial de corretores da equipe da atividade.
async function gerarRelatorioPresenca(){
  if (typeof carregarCorretoresDoBanco === 'function') await carregarCorretoresDoBanco();
  const mes    = document.getElementById('pres-mes')?.value || _mesAtual();
  const equipe = document.getElementById('pres-equipe')?.value || '';

  let q = `?mes=eq.${mes}&order=data.asc.nullslast,criado_em.asc`;
  if (equipe) q += `&equipe=eq.${encodeURIComponent(equipe)}`;
  let ats = [];
  try { ats = await db.get('vendas_atividades', q); }
  catch(e) { toast('Erro ao buscar atividades: '+e.message,'err'); return; }
  if (!ats.length) { toast('Nenhuma atividade no mês selecionado.','err'); return; }

  let presencas = [];
  try {
    presencas = await db.get('vendas_presencas', `?atividade_id=in.(${ats.map(a=>a.id).join(',')})&select=*`);
  } catch(_) {}
  const presIdx = {};
  (presencas||[]).forEach(p => { if (p.presente) presIdx[`${p.atividade_id}|${p.corretor_nome}`] = true; });

  // Estatística por corretor e por equipe + presentes por atividade
  const porCorretor = {};   // "equipe|nome" -> {equipe,nome,esp,pres}
  const porEquipe = {};
  const presPorAtv = {};    // atividade_id -> {pres,esp}
  ats.forEach(a => {
    presPorAtv[a.id] = { pres:0, esp:0 };
    const eqs = (a.equipe && CORRETORES_POR_EQUIPE[a.equipe]) ? [a.equipe] : todasEquipes();
    eqs.forEach(eq => {
      if (!porEquipe[eq]) porEquipe[eq] = { pres:0, esp:0 };
      corretoresDaEquipe(eq).forEach(nome => {
        const k = `${eq}|${nome}`;
        if (!porCorretor[k]) porCorretor[k] = { equipe:eq, nome, esp:0, pres:0 };
        porCorretor[k].esp++; porEquipe[eq].esp++; presPorAtv[a.id].esp++;
        if (presIdx[`${a.id}|${nome}`]) { porCorretor[k].pres++; porEquipe[eq].pres++; presPorAtv[a.id].pres++; }
      });
    });
  });
  const totEsp  = Object.values(porEquipe).reduce((s,e)=>s+e.esp,0);
  const totPres = Object.values(porEquipe).reduce((s,e)=>s+e.pres,0);
  const pctG = totEsp ? Math.round(totPres/totEsp*100) : 0;
  const pctCor = p => p>=80 ? '#10b981' : p>=50 ? '#f59e0b' : '#ef4444';

  const [ano, m] = mes.split('-');
  const mesLabel = new Date(+ano, +m-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const emitido = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const esc = s => String(s||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  const tipoLbl = { reuniao:'Reunião', treinamento:'Treinamento', plantao:'Plantão', evento:'Evento' };

  const linhasCorretor = Object.values(porCorretor)
    .sort((a,b)=> a.equipe.localeCompare(b.equipe) || (b.esp?b.pres/b.esp:0)-(a.esp?a.pres/a.esp:0) || a.nome.localeCompare(b.nome))
    .map(c => {
      const p = c.esp ? Math.round(c.pres/c.esp*100) : 0;
      return `<tr><td>${esc(c.equipe)}</td><td>${esc(c.nome)}</td>
        <td class="n">${c.esp}</td><td class="n">${c.pres}</td><td class="n">${c.esp-c.pres}</td>
        <td class="n" style="font-weight:700;color:${pctCor(p)}">${p}%</td></tr>`;
    }).join('');

  const linhasAtv = ats.map(a => {
    const s = presPorAtv[a.id];
    const dt = a.data ? new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—';
    return `<tr><td>${dt}${a.hora?' '+esc(a.hora):''}</td><td>${esc(a.nome)}</td>
      <td>${esc(tipoLbl[a.tipo]||a.tipo||'—')}</td><td>${esc(a.local||'—')}</td>
      <td>${esc(a.equipe||'Todas')}</td><td class="n">${s.pres}/${s.esp}</td></tr>`;
  }).join('');

  const cardsEquipe = Object.entries(porEquipe).sort().map(([eq,s]) => {
    const p = s.esp ? Math.round(s.pres/s.esp*100) : 0;
    return `<div class="eqc" style="border-left:4px solid ${pctCor(p)}">
      <div class="eqn">${esc(eq)}</div><div class="eqp" style="color:${pctCor(p)}">${p}%</div>
      <div class="eqd">${s.pres} de ${s.esp}</div></div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Presença — ${esc(mesLabel)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  html,body{margin:0;padding:0;background:#fff;color-scheme:light;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1e293b;font-size:11px}
  .topo{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1E2D4A;padding-bottom:10px;margin-bottom:14px}
  .topo img{height:38px}
  .topo .t{text-align:right}
  .topo h1{margin:0;font-size:17px;color:#1E2D4A}
  .topo .sub{color:#64748b;font-size:11px}
  .resumo{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;text-align:center;min-width:80px}
  .kpi .v{font-size:18px;font-weight:800;color:#1E2D4A}
  .kpi .l{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .eqs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  .eqc{border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;min-width:76px}
  .eqn{font-weight:700;font-size:11px}.eqp{font-size:16px;font-weight:800}.eqd{font-size:9px;color:#64748b}
  h2{font-size:13px;color:#1E2D4A;margin:16px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
  td{padding:4px 8px;border-bottom:1px solid #f1f5f9}
  td.n,th.n{text-align:center}
  tr{page-break-inside:avoid}
  .rodape{margin-top:18px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
  .btn-print{position:fixed;top:10px;right:10px;background:#3B82F6;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;z-index:9}
  @media print{.btn-print{display:none}}
</style></head><body>
<button class="btn-print" onclick="window.print()">🖨️ Salvar como PDF</button>
<div class="topo">
  <img src="${location.origin}/icons/logo-nsp.png" alt="Nova São Paulo">
  <div class="t"><h1>Relatório de Presença — Vendas</h1>
  <div class="sub">${esc(mesLabel)}${equipe?' · Equipe '+esc(equipe):' · Todas as equipes'} · emitido em ${esc(emitido)}</div></div>
</div>
<div class="resumo">
  <div class="kpi"><div class="v">${ats.length}</div><div class="l">Atividades</div></div>
  <div class="kpi"><div class="v">${totPres}</div><div class="l">Presenças</div></div>
  <div class="kpi"><div class="v">${totEsp-totPres}</div><div class="l">Ausências</div></div>
  <div class="kpi"><div class="v" style="color:${pctCor(pctG)}">${pctG}%</div><div class="l">Presença geral</div></div>
</div>
<div class="eqs">${cardsEquipe}</div>
<h2>Presença por corretor</h2>
<table><thead><tr><th>Equipe</th><th>Corretor</th><th class="n">Convocações</th><th class="n">Presenças</th><th class="n">Faltas</th><th class="n">%</th></tr></thead>
<tbody>${linhasCorretor}</tbody></table>
<h2>Atividades do período</h2>
<table><thead><tr><th>Data</th><th>Atividade</th><th>Tipo</th><th>Local</th><th>Equipe</th><th class="n">Presentes</th></tr></thead>
<tbody>${linhasAtv}</tbody></table>
<div class="rodape">Organização Imobiliária Nova São Paulo Ltda · Controle de Presença de Vendas · Portal Interno</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('O navegador bloqueou a janela pop-up. Libere pra este site e tente de novo.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ─── EXPORTAR SELEÇÃO EM EXCEL ───────────────────────────────────
// Baixa a lista de imóveis respeitando os filtros da tela (status,
// equipe, ciclo). Usa o SheetJS que já atende o "Baixar modelo".
async function exportarSelecaoExcel(){
  if (typeof XLSX === 'undefined') {
    alert('SheetJS não carregou. Recarregue a página com internet.');
    return;
  }
  const status = document.getElementById('filt-sel-status')?.value || '';
  const equipe = document.getElementById('filt-sel-equipe')?.value || '';
  const mes    = document.getElementById('filt-sel-mes')?.value || '';

  let q = '?order=equipe,mes_referencia.desc,codigo&limit=1000';
  if (status) q += `&status=eq.${status}`;
  if (equipe) q += `&equipe=eq.${encodeURIComponent(equipe)}`;
  if (mes)    q += `&mes_referencia=eq.${encodeURIComponent(mes)}`;

  let dados;
  try { dados = await db.get('vendas_selecao_imoveis', q); }
  catch(e) { toast('Erro ao buscar imóveis: '+e.message,'err'); return; }
  if (!dados?.length) { toast('Nenhum imóvel com esses filtros.','err'); return; }

  const statusLbl = { pendente:'Pendente', aprovado:'Aprovado', reprovado:'Reprovado', vendido:'Vendido', expirado:'Expirado' };
  const linhas = dados.map(d => ({
    'Código':        d.codigo || '',
    'Equipe':        d.equipe || '',
    'Ciclo':         d.mes_referencia || '',
    'Status':        statusLbl[d.status] || d.status || '',
    'Endereço':      d.endereco || '',
    'Corretor':      d.corretor || '',
    'M²':            d.metragem ?? '',
    'Tempo de venda':d.tempo_venda || '',
    'Outras opções': d.outras_opcoes || '',
    'Link':          d.link_imovel || '',
    'Cadastrado em': d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : ''
  }));

  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [
    {wch:12},{wch:9},{wch:9},{wch:10},{wch:42},{wch:20},
    {wch:7},{wch:14},{wch:34},{wch:34},{wch:12}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Seleção de Imóveis');
  const nome = ['selecao-imoveis', mes || 'todos-ciclos', equipe || 'todas-equipes']
    .join('_').toLowerCase() + '.xlsx';
  XLSX.writeFile(wb, nome);
  toast(`📊 ${dados.length} imóveis exportados.`,'ok');
}

// ═══════════════════════════════════════════════════════════════
// CAPTAÇÃO MENSAL POR CORRETOR (pedido Anderson, 16/09/2026).
// Adaptado ao portal real: CUR (não state.usuarioAtual), toast (não avisar),
// db.get(t,'?query') e upsert por delete+insert (db.post não tem onConflict);
// casa nome por normalização (trim+minúsculo+sem acento). RLS = acesso_autenticado
// (quem pode enviar é gated na UI, como no resto do portal).
// ═══════════════════════════════════════════════════════════════
function _capNorm(s){ return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }

// rows = XLSX.utils.sheet_to_json(ws)  → [{Corretor, Equipe, 'Quantia de Captação'}, ...]
// mesRef = 'YYYY-MM-01'
async function importarCaptacaoMensal(rows, mesRef){
  const corretores = await db.get('vendas_corretores', '?select=id,nome,equipe&ativo=eq.true');
  const idx = {}; (corretores||[]).forEach(c => { idx[_capNorm(c.nome)] = c; });
  const naoEncontrados = [];
  const porCorretor = {};                       // dedup por corretor (último vence)
  for (const linha of (rows||[])){
    const nome = String(linha['Corretor']||'').trim();
    if (!nome) continue;
    const c = idx[_capNorm(nome)];
    if (!c){ naoEncontrados.push(nome); continue; }
    porCorretor[c.id] = {
      corretor_id: c.id, corretor_nome: nome,
      equipe: String(linha['Equipe']||'').trim() || c.equipe || '',
      mes_referencia: mesRef,
      quantidade: Math.max(0, Math.trunc(Number(linha['Quantia de Captação'])||0)),
      enviado_por: (typeof CUR!=='undefined' && CUR) ? CUR.id : null
    };
  }
  const lancamentos = Object.values(porCorretor);
  if (naoEncontrados.length)
    toast('Corretor(es) não encontrado(s) — nome não bate com o cadastro: '+naoEncontrados.join(', '),'err');
  if (!lancamentos.length) return { gravados:0, naoEncontrados };
  // "reenviar o mês substitui": apaga as linhas desses corretores no mês e reinsere
  const ids = lancamentos.map(l=>l.corretor_id).join(',');
  await fetch(SBU+'/rest/v1/vendas_captacoes_mensais?mes_referencia=eq.'+encodeURIComponent(mesRef)+'&corretor_id=in.('+ids+')',
              { method:'DELETE', headers:hdr() });
  await db.post('vendas_captacoes_mensais', lancamentos);
  return { gravados: lancamentos.length, naoEncontrados };
}

// Meta: só corretores com 5+ captações no mês, do maior pro menor.
async function listarMetaCaptacao(mesRef){
  const dados = await db.get('vendas_captacoes_mensais',
    '?mes_referencia=eq.'+encodeURIComponent(mesRef)+'&order=quantidade.desc');
  return (dados||[]).filter(d => (d.quantidade||0) >= 5);
}

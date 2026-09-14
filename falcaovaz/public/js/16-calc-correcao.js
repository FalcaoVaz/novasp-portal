// ═══════════════════════════════════════════════════════════════════
// CALCULADORA DE ATUALIZAÇÃO DE DÉBITO
// Suporta parcela única ou múltiplas parcelas (aluguéis vencidos).
// Índices oficiais do BCB + IPCA-E (Tabela Prática TJSP).
// Salva no Supabase (tabela calculos_atualizacao) e vincula a processo.
// ═══════════════════════════════════════════════════════════════════

const _BCB_SERIES = {
  ipca:  '433',    // IPCA - IBGE - variação % mensal
  ipcae: '10764',  // IPCA-E (IPCA-15) - variação % mensal - base da Tabela Prática TJSP até 12/2021
  igpm:  '189',    // IGP-M - variação % mensal
  inpc:  '188',    // INPC - variação % mensal
  selic: '4390',   // ⚠️ SELIC acumulada NO MÊS em % — 4189 é % a.a. (Meta), NÃO usar
  tr:    '226'     // TR - variação % mensal
};

// EC 113/2021 — a partir de 09/12/2021 a Selic substitui IPCA-E + juros
// nas dívidas da Fazenda Pública. A Tabela Prática TJSP segue essa regra.
const _CORTE_EC113 = '2021-12-09';

const _LABELS_INDICE = {
  ipca:   'IPCA (IBGE)',
  ipcae:  'IPCA-E (IBGE)',
  tjsp:   'Tabela Prática TJSP (IPCA-E até 12/2021 + Selic após EC 113)',
  igpm:   'IGP-M (FGV)',
  inpc:   'INPC (IBGE)',
  selic:  'SELIC acumulada (pós EC 113/2021)',
  tr:     'TR (Taxa Referencial)',
  manual: 'Manual (informado)',
  nenhum: 'Sem correção'
};

let _calcUltimoResultado = null;
let _calcParcelaSeq = 0;

// ─── HELPERS ──────────────────────────────────────────────────────
function _calcParseNum(s) {
  if (s == null) return NaN;
  const t = String(s).replace(/\./g,'').replace(',', '.').replace(/[^\d.-]/g,'');
  return parseFloat(t);
}
function _calcFmtBR(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _calcFmtPct(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%';
}
function _calcFmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}
function _fmtDataBCB(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function _mesesEntre(iso1, iso2) {
  const d1 = new Date(iso1 + 'T12:00:00');
  const d2 = new Date(iso2 + 'T12:00:00');
  return ((d2.getFullYear()-d1.getFullYear())*12) + (d2.getMonth()-d1.getMonth()) + ((d2.getDate()-d1.getDate())/30);
}
function _calcToggleIndiceManual() {
  const sel = document.getElementById('calc-corr-indice')?.value;
  const row = document.getElementById('calc-corr-indice-manual-row');
  if (row) row.style.display = (sel === 'manual') ? '' : 'none';
}

// ─── PARCELAS ─────────────────────────────────────────────────────
function _calcAddParcela(valor, data, nome) {
  _calcParcelaSeq++;
  const id = 'parc-' + _calcParcelaSeq;
  const cont = document.getElementById('calc-corr-parcelas');
  if (!cont) return;
  const div = document.createElement('div');
  // 3 colunas: nome (livre) + valor + data + botão remover
  div.style.cssText = 'display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center';
  div.dataset.id = id;
  const inpStyle = 'padding:8px 10px;font-size:13px;border:1.5px solid var(--gray-200);border-radius:6px;background:#fff;font-family:inherit;color:var(--gray-800);outline:none;width:100%';
  div.innerHTML = `
    <input type="text" class="calc-corr-p-nome"  placeholder="Nome/rótulo (opcional)" value="${nome||''}" style="${inpStyle}">
    <input type="text" class="calc-corr-p-valor" placeholder="Valor (R$)" inputmode="decimal" value="${valor||''}" style="${inpStyle}">
    <input type="date" class="calc-corr-p-data"  value="${data||''}" style="${inpStyle}">
    <button class="btn btn-outline btn-xs" onclick="this.parentElement.remove()" title="Remover parcela">×</button>
  `;
  cont.appendChild(div);
}

function _calcLerParcelas() {
  const cont = document.getElementById('calc-corr-parcelas');
  if (!cont) return [];
  const out = [];
  cont.querySelectorAll('[data-id]').forEach(div => {
    const valor = _calcParseNum(div.querySelector('.calc-corr-p-valor')?.value);
    const data  = div.querySelector('.calc-corr-p-data')?.value;
    const nome  = (div.querySelector('.calc-corr-p-nome')?.value || '').trim();
    if (isFinite(valor) && valor > 0 && data) out.push({ valor, data, nome });
  });
  return out;
}

// ─── BCB ──────────────────────────────────────────────────────────
async function _buscarSerieBCB(codigo, dataIni, dataFim) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados` +
              `?formato=json&dataInicial=${_fmtDataBCB(dataIni)}&dataFinal=${_fmtDataBCB(dataFim)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BCB retornou ${r.status}. Verifique o período.`);
  const j = await r.json();
  return j.map(x => ({ data: x.data, valor: parseFloat(String(x.valor).replace(',','.')) }));
}
function _acumulaSerie(serie) {
  let fator = 1;
  serie.forEach(x => { fator *= (1 + x.valor / 100); });
  return fator - 1;
}

// Busca 1 vez a série do índice cobrindo TODAS as parcelas, e depois filtra
// por data de cada parcela pra evitar N chamadas ao BCB.
let _calcCacheSerie = { key: null, data: null };
async function _buscarSerieCoberta(indice, dataIniMin, dataFim) {
  const key = `${indice}|${dataIniMin}|${dataFim}`;
  if (_calcCacheSerie.key === key) return _calcCacheSerie.data;
  const serie = await _buscarSerieBCB(_BCB_SERIES[indice], dataIniMin, dataFim);
  _calcCacheSerie = { key, data: serie };
  return serie;
}
function _acumulaSerieNoPeriodo(serie, dataIni, dataFim) {
  // Item.data vem "DD/MM/AAAA"
  const parseBCB = s => { const [d,m,y] = s.split('/'); return `${y}-${m}-${d}`; };
  const filtrado = serie.filter(x => {
    const iso = parseBCB(x.data);
    return iso >= dataIni.slice(0,7)+'-01' && iso <= dataFim;
  });
  return { taxa: _acumulaSerie(filtrado), itens: filtrado };
}

// ─── CÁLCULO ──────────────────────────────────────────────────────
async function calcularCorrecao() {
  const status = document.getElementById('calc-corr-status');
  const resEl  = document.getElementById('calc-corr-resultado');
  const btnCp  = document.getElementById('calc-corr-btn-copiar');
  const btnSv  = document.getElementById('calc-corr-btn-salvar');
  status.textContent = '';
  btnCp.style.display = 'none';
  btnSv.style.display = 'none';
  const btnPdf = document.getElementById('calc-corr-btn-pdf');
  if (btnPdf) btnPdf.style.display = 'none';

  const parcelas = _calcLerParcelas();
  if (!parcelas.length) { status.textContent = '⚠️ Adicione ao menos uma parcela.'; return; }

  const dtFim  = document.getElementById('calc-corr-dt-fim').value;
  const indice = document.getElementById('calc-corr-indice').value;
  const jurosPct  = _calcParseNum(document.getElementById('calc-corr-juros').value) || 0;
  const jurosTipo = document.getElementById('calc-corr-juros-tipo').value;
  const multaPct  = _calcParseNum(document.getElementById('calc-corr-multa').value) || 0;
  const honorPct  = _calcParseNum(document.getElementById('calc-corr-honor').value) || 0;

  if (!dtFim) { status.textContent = '⚠️ Informe a data final.'; return; }
  for (const p of parcelas) {
    if (p.data > dtFim) { status.textContent = `⚠️ Parcela ${_calcFmtData(p.data)} é posterior à data final.`; return; }
  }

  // Ordena por data (mais antiga primeiro) pra facilitar debug
  parcelas.sort((a,b) => a.data.localeCompare(b.data));

  // Data mínima entre parcelas (pra pegar a série do BCB de uma vez só)
  const dtIniMin = parcelas[0].data;

  status.textContent = '⏳ Buscando índice do Banco Central...';
  let seriesFetch = {};   // { chave: itens }
  const seriesPrecisa = [];
  if (indice === 'tjsp') seriesPrecisa.push('ipcae','selic');
  else if (['ipca','ipcae','igpm','inpc','selic','tr'].includes(indice)) seriesPrecisa.push(indice);

  for (const ch of seriesPrecisa) {
    try {
      const s = await _buscarSerieCoberta(ch, dtIniMin, dtFim);
      if (!s.length) {
        status.textContent = `⚠️ BCB não devolveu dados de ${_LABELS_INDICE[ch]||ch}. Tente outro índice ou "manual".`;
        return;
      }
      seriesFetch[ch] = s;
    } catch(e) {
      status.textContent = '⚠️ Erro no BCB: ' + (e.message || e) + ' — use "manual" como alternativa.';
      return;
    }
  }

  // Manual: mesma taxa % aplicada a todas as parcelas
  let manualTaxa = 0;
  if (indice === 'manual') {
    const m = _calcParseNum(document.getElementById('calc-corr-indice-manual').value);
    if (!isFinite(m)) { status.textContent = '⚠️ Informe a correção manual (%).'; return; }
    manualTaxa = m / 100;
  }

  // TJSP = IPCA-E (data parcela até 09/12/2021) + Selic (09/12/2021 até dt final).
  // A Selic é acumulada mês a mês (fator composto).
  function _corrigirTJSP(pIni, pFim) {
    // Tudo antes do corte: IPCA-E. Tudo depois: Selic.
    const preItens  = _acumulaSerieNoPeriodo(seriesFetch.ipcae,  pIni, pFim < _CORTE_EC113 ? pFim : _CORTE_EC113);
    const posItens  = pFim > _CORTE_EC113
      ? _acumulaSerieNoPeriodo(seriesFetch.selic, pIni > _CORTE_EC113 ? pIni : _CORTE_EC113, pFim)
      : { taxa: 0, itens: [] };
    // Compõe: fator_total = (1+ipcae) * (1+selic) − 1
    const taxa = (1 + preItens.taxa) * (1 + posItens.taxa) - 1;
    return { taxa, itens: preItens.itens.concat(posItens.itens) };
  }

  // ── Calcula cada parcela individualmente
  const detalhes = parcelas.map(p => {
    const meses = _mesesEntre(p.data, dtFim);
    let taxaCorrecao = 0;
    let itens = [];
    if (indice === 'manual')      taxaCorrecao = manualTaxa;
    else if (indice === 'nenhum') taxaCorrecao = 0;
    else if (indice === 'tjsp') {
      const r = _corrigirTJSP(p.data, dtFim);
      taxaCorrecao = r.taxa; itens = r.itens;
    } else {
      const r = _acumulaSerieNoPeriodo(seriesFetch[indice], p.data, dtFim);
      taxaCorrecao = r.taxa; itens = r.itens;
    }
    const valorCorrigido = p.valor * (1 + taxaCorrecao);
    const juros = (jurosTipo === 'composto')
      ? valorCorrigido * (Math.pow(1 + jurosPct/100, meses) - 1)
      : valorCorrigido * (jurosPct/100) * meses;
    return {
      valor: p.valor, data: p.data, nome: p.nome || '', meses,
      taxaCorrecao, valorCorrigido, juros,
      subtotal: valorCorrigido + juros,
      serieItens: itens
    };
  });

  const somaCorrigido = detalhes.reduce((s,x) => s + x.valorCorrigido, 0);
  const somaJuros     = detalhes.reduce((s,x) => s + x.juros, 0);
  const baseMulta     = somaCorrigido + somaJuros;
  const multa         = baseMulta * (multaPct/100);
  const baseHonor     = baseMulta + multa;
  const honor         = baseHonor * (honorPct/100);
  const total         = baseHonor + honor;
  const somaOriginal  = parcelas.reduce((s,p) => s + p.valor, 0);

  _calcUltimoResultado = {
    parcelas, dtFim, indice,
    indice_manual_pct: (indice==='manual') ? manualTaxa*100 : null,
    jurosPct, jurosTipo, multaPct, honorPct,
    detalhes,
    somaOriginal, somaCorrigido, somaJuros, multa, honor, total,
    processoId: document.getElementById('calc-corr-processo')?.value || null,
    titulo: document.getElementById('calc-corr-titulo')?.value?.trim() || null
  };

  // ── Renderiza
  resEl.style.textAlign = 'left';
  const multiplas = parcelas.length > 1;
  const dtIniUnica = !multiplas ? parcelas[0].data : null;
  let html = `
    <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">
      ${multiplas
        ? `Período: <b>${_calcFmtData(parcelas[0].data)}</b> a <b>${_calcFmtData(dtFim)}</b> · <b>${parcelas.length} parcelas</b>`
        : `Período: <b>${_calcFmtData(dtIniUnica)}</b> a <b>${_calcFmtData(dtFim)}</b>`
      }
    </div>`;

  if (multiplas) {
    html += `
      <details style="margin-bottom:10px" open>
        <summary style="cursor:pointer;font-size:12px;color:var(--blue-600);user-select:none;font-weight:600">Detalhamento por parcela</summary>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px">
          <thead><tr style="border-bottom:1px solid var(--gray-200)">
            <th style="padding:6px 4px;text-align:left">Nome</th>
            <th style="padding:6px 4px;text-align:left">Data</th>
            <th style="padding:6px 4px;text-align:right">Valor</th>
            <th style="padding:6px 4px;text-align:right">Corrigido</th>
            <th style="padding:6px 4px;text-align:right">Juros</th>
            <th style="padding:6px 4px;text-align:right">Subtotal</th>
          </tr></thead>
          <tbody>
            ${detalhes.map(d => `
              <tr style="border-bottom:1px solid var(--gray-100)">
                <td style="padding:5px 4px;font-size:11px">${d.nome || '<span style="color:var(--gray-400)">—</span>'}</td>
                <td style="padding:5px 4px">${_calcFmtData(d.data)} <span style="color:var(--gray-500);font-size:10px">(${d.meses.toFixed(1)}m)</span></td>
                <td style="padding:5px 4px;text-align:right;font-family:'SF Mono',Consolas,monospace">${_calcFmtBR(d.valor)}</td>
                <td style="padding:5px 4px;text-align:right;font-family:'SF Mono',Consolas,monospace">${_calcFmtBR(d.valorCorrigido)}</td>
                <td style="padding:5px 4px;text-align:right;font-family:'SF Mono',Consolas,monospace">${_calcFmtBR(d.juros)}</td>
                <td style="padding:5px 4px;text-align:right;font-family:'SF Mono',Consolas,monospace;font-weight:600">${_calcFmtBR(d.subtotal)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </details>`;
  }

  const linhas = [
    { rot: multiplas ? 'Soma dos valores originais' : 'Valor original', v: somaOriginal },
    { rot:'(+) Correção monetária',      v: somaCorrigido - somaOriginal,
        sub: `${_LABELS_INDICE[indice]}` },
    { rot:'= Valor corrigido',           v: somaCorrigido, cor:'#0f766e', bold:true },
    { rot:`(+) Juros de mora (${jurosPct.toLocaleString('pt-BR')}% a.m., ${jurosTipo})`, v: somaJuros },
    { rot:`(+) Multa (${multaPct.toLocaleString('pt-BR')}%)`, v: multa },
    { rot:`(+) Honorários (${honorPct.toLocaleString('pt-BR')}%)`, v: honor },
    { rot:'TOTAL ATUALIZADO', v: total, cor:'#dc2626', bold:true, big:true }
  ];
  html += `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${linhas.map(l => `
        <tr style="border-bottom:1px solid var(--gray-100)">
          <td style="padding:8px 4px;color:${l.cor||'#475569'};font-weight:${l.bold?700:400};${l.big?'font-size:14px':''}">
            ${l.rot}
            ${l.sub ? `<div style="font-size:10px;color:var(--gray-500);font-weight:400;margin-top:2px">${l.sub}</div>` : ''}
          </td>
          <td style="padding:8px 4px;text-align:right;font-family:'SF Mono',Consolas,monospace;color:${l.cor||'#334155'};font-weight:${l.bold?700:500};${l.big?'font-size:16px':''}">
            R$ ${_calcFmtBR(l.v)}
          </td>
        </tr>
      `).join('')}
    </table>`;

  resEl.innerHTML = html;
  btnCp.style.display = '';
  btnSv.style.display = '';
  if (btnPdf) btnPdf.style.display = '';
  status.textContent = '✅ Cálculo realizado' + (['manual','nenhum'].includes(indice) ? '.' : ' com dados do Banco Central.');
  // Rola até o resultado (aparece no topo da coluna direita)
  resEl.scrollIntoView({ behavior:'smooth', block:'start' });
}

function copiarResultadoCalc() {
  const r = _calcUltimoResultado;
  if (!r) return;
  const multiplas = r.parcelas.length > 1;
  let txt = `CÁLCULO DE ATUALIZAÇÃO DE DÉBITO\n`;
  if (r.titulo) txt += `Referência: ${r.titulo}\n`;
  if (multiplas) {
    txt += `Período: ${_calcFmtData(r.parcelas[0].data)} a ${_calcFmtData(r.dtFim)} (${r.parcelas.length} parcelas)\n`;
  } else {
    txt += `Data inicial: ${_calcFmtData(r.parcelas[0].data)}\n`;
    txt += `Data final: ${_calcFmtData(r.dtFim)}\n`;
  }
  txt += `Índice: ${_LABELS_INDICE[r.indice]}\n\n`;
  if (multiplas) {
    txt += `Parcelas (${r.parcelas.length}):\n`;
    r.detalhes.forEach(d => {
      const rot = d.nome ? `${d.nome} — ` : '';
      txt += `  ${rot}${_calcFmtData(d.data)} — R$ ${_calcFmtBR(d.valor)} → corrigido R$ ${_calcFmtBR(d.valorCorrigido)} + juros R$ ${_calcFmtBR(d.juros)} = R$ ${_calcFmtBR(d.subtotal)}\n`;
    });
    txt += `\n`;
  }
  txt += `Soma original: R$ ${_calcFmtBR(r.somaOriginal)}\n`;
  txt += `Valor corrigido: R$ ${_calcFmtBR(r.somaCorrigido)}\n`;
  txt += `Juros ${r.jurosPct}% a.m. (${r.jurosTipo}): R$ ${_calcFmtBR(r.somaJuros)}\n`;
  txt += `Multa ${r.multaPct}%: R$ ${_calcFmtBR(r.multa)}\n`;
  txt += `Honorários ${r.honorPct}%: R$ ${_calcFmtBR(r.honor)}\n`;
  txt += `TOTAL: R$ ${_calcFmtBR(r.total)}\n`;
  navigator.clipboard.writeText(txt).then(() => {
    if (typeof showToast === 'function') showToast('📋 Resultado copiado');
  });
}

// ─── PDF ──────────────────────────────────────────────────────────
// Abre uma janela nova com o cálculo formatado em A4 e chama print().
// Usuário escolhe "Salvar como PDF" no diálogo do navegador.
function gerarPDFCalculo() {
  const r = _calcUltimoResultado;
  if (!r) return;
  const multiplas = r.parcelas.length > 1;
  const _fmt = _calcFmtBR;
  const _dt  = _calcFmtData;

  const linhaDeriv = (rot, v, opts={}) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 4px;color:${opts.cor||'#334155'};font-weight:${opts.bold?700:400};${opts.big?'font-size:15px':''}">
        ${rot}${opts.sub ? `<div style="font-size:10px;color:#64748b;font-weight:400;margin-top:2px">${opts.sub}</div>` : ''}
      </td>
      <td style="padding:8px 4px;text-align:right;font-family:'Courier New',monospace;color:${opts.cor||'#334155'};font-weight:${opts.bold?700:500};${opts.big?'font-size:17px':''}">
        R$ ${_fmt(v)}
      </td>
    </tr>`;

  const tblParcelas = multiplas ? `
    <h3 style="font-size:14px;margin:20px 0 8px;color:#1e293b">Detalhamento por parcela</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:2px solid #94a3b8;background:#f1f5f9">
        <th style="padding:6px 4px;text-align:left">Nome</th>
        <th style="padding:6px 4px;text-align:left">Data</th>
        <th style="padding:6px 4px;text-align:right">Valor</th>
        <th style="padding:6px 4px;text-align:right">Corrigido</th>
        <th style="padding:6px 4px;text-align:right">Juros</th>
        <th style="padding:6px 4px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${r.detalhes.map(d => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:5px 4px">${d.nome || '—'}</td>
          <td style="padding:5px 4px">${_dt(d.data)} <span style="color:#64748b;font-size:10px">(${d.meses.toFixed(1)}m)</span></td>
          <td style="padding:5px 4px;text-align:right;font-family:'Courier New',monospace">${_fmt(d.valor)}</td>
          <td style="padding:5px 4px;text-align:right;font-family:'Courier New',monospace">${_fmt(d.valorCorrigido)}</td>
          <td style="padding:5px 4px;text-align:right;font-family:'Courier New',monospace">${_fmt(d.juros)}</td>
          <td style="padding:5px 4px;text-align:right;font-family:'Courier New',monospace;font-weight:600">${_fmt(d.subtotal)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '';

  const periodo = multiplas
    ? `Período: <b>${_dt(r.parcelas[0].data)}</b> a <b>${_dt(r.dtFim)}</b> · <b>${r.parcelas.length} parcelas</b>`
    : `Período: <b>${_dt(r.parcelas[0].data)}</b> a <b>${_dt(r.dtFim)}</b>`;

  const dataGeracao = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Cálculo de Atualização — ${r.titulo || _dt(r.dtFim)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color:#111; line-height:1.5; margin:0; padding:0; }
  h1 { font-size:20px; margin:0 0 4px; color:#1e3a8a; }
  h2 { font-size:12px; color:#64748b; margin:0 0 20px; font-weight:400; letter-spacing:1px; text-transform:uppercase; }
  h3 { color:#1e293b; }
  .meta { font-size:12px; color:#475569; margin-bottom:16px; padding:12px; background:#f8fafc; border-left:3px solid #1e40af; border-radius:3px; }
  .meta div { margin:3px 0; }
  table.totais { width:100%; border-collapse:collapse; font-size:13px; margin-top:12px; }
  table.totais tr.total { background:#fef2f2; }
  table.totais td { border-bottom:1px solid #e5e7eb; }
  .rodape { margin-top:36px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:10px; color:#94a3b8; text-align:center; }
  @media print { .no-print { display: none } }
</style>
</head><body>
  <h1>Cálculo de Atualização de Débito</h1>
  <h2>${r.titulo ? r.titulo : 'Memória de cálculo'}</h2>
  <div class="meta">
    <div>${periodo}</div>
    <div>Índice de correção: <b>${_LABELS_INDICE[r.indice]}</b></div>
    <div>Juros de mora: <b>${r.jurosPct.toLocaleString('pt-BR')}% ao mês (${r.jurosTipo})</b></div>
    ${r.multaPct ? `<div>Multa contratual: <b>${r.multaPct.toLocaleString('pt-BR')}%</b></div>` : ''}
    ${r.honorPct ? `<div>Honorários advocatícios: <b>${r.honorPct.toLocaleString('pt-BR')}%</b></div>` : ''}
  </div>

  ${tblParcelas}

  <h3 style="font-size:14px;margin:20px 0 8px">Consolidado</h3>
  <table class="totais">
    ${linhaDeriv(multiplas ? 'Soma dos valores originais' : 'Valor original', r.somaOriginal)}
    ${linhaDeriv('(+) Correção monetária', r.somaCorrigido - r.somaOriginal, { sub: _LABELS_INDICE[r.indice] })}
    ${linhaDeriv('= Valor corrigido', r.somaCorrigido, { cor:'#0f766e', bold:true })}
    ${linhaDeriv(`(+) Juros de mora (${r.jurosPct.toLocaleString('pt-BR')}% a.m., ${r.jurosTipo})`, r.somaJuros)}
    ${linhaDeriv(`(+) Multa (${r.multaPct.toLocaleString('pt-BR')}%)`, r.multa)}
    ${linhaDeriv(`(+) Honorários (${r.honorPct.toLocaleString('pt-BR')}%)`, r.honor)}
    ${linhaDeriv('TOTAL ATUALIZADO', r.total, { cor:'#dc2626', bold:true, big:true })}
  </table>

  <div class="rodape">
    Gerado em ${dataGeracao} · Nova São Paulo Imobiliária · Sistema Jurídico FalcãoVaz<br>
    Índices oficiais coletados do Banco Central do Brasil via API pública (bcb.gov.br)
  </div>

  <script>
    setTimeout(() => { window.print(); }, 300);
  <\/script>
</body></html>`;

  // Abre em nova aba e imprime
  const w = window.open('', '_blank');
  if (!w) {
    if (typeof showToast === 'function') showToast('⚠️ Bloqueado por popup. Libera popups pra este site.');
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}

function limparCalcCorrecao() {
  document.getElementById('calc-corr-parcelas').innerHTML = '';
  _calcAddParcela();
  document.getElementById('calc-corr-dt-fim').value = '';
  document.getElementById('calc-corr-indice-manual').value = '';
  document.getElementById('calc-corr-juros').value = '1,00';
  document.getElementById('calc-corr-multa').value = '0';
  document.getElementById('calc-corr-honor').value = '0';
  document.getElementById('calc-corr-indice').value = 'ipca';
  document.getElementById('calc-corr-juros-tipo').value = 'simples';
  document.getElementById('calc-corr-titulo').value = '';
  document.getElementById('calc-corr-processo').value = '';
  _calcToggleIndiceManual();
  document.getElementById('calc-corr-status').textContent = '';
  document.getElementById('calc-corr-btn-copiar').style.display = 'none';
  const btnPdfLimp = document.getElementById('calc-corr-btn-pdf');
  if (btnPdfLimp) btnPdfLimp.style.display = 'none';
  document.getElementById('calc-corr-btn-salvar').style.display = 'none';
  const resEl = document.getElementById('calc-corr-resultado');
  resEl.style.textAlign = 'center';
  resEl.innerHTML = 'Preencha os dados à esquerda e clique em <b>Calcular</b>.<br>' +
                    'Índices oficiais buscados direto do Banco Central.<br>' +
                    'Suporta múltiplas parcelas (útil pra aluguéis vencidos).';
  _calcUltimoResultado = null;
  _calcCacheSerie = { key: null, data: null };
}

// ─── PERSISTÊNCIA ─────────────────────────────────────────────────
async function salvarCalculoCorrecao() {
  const r = _calcUltimoResultado;
  if (!r) return;
  const status = document.getElementById('calc-corr-status');
  status.textContent = '⏳ Salvando...';
  const payload = {
    processo_id:       r.processoId || null,
    titulo:            r.titulo || null,
    parcelas:          r.parcelas,
    data_final:        r.dtFim,
    indice:            r.indice,
    indice_manual_pct: r.indice_manual_pct,
    juros_pct_am:      r.jurosPct,
    juros_tipo:        r.jurosTipo,
    multa_pct:         r.multaPct,
    honorarios_pct:    r.honorPct,
    resultado: {
      somaOriginal:  r.somaOriginal,
      somaCorrigido: r.somaCorrigido,
      somaJuros:     r.somaJuros,
      multa:         r.multa,
      honor:         r.honor,
      total:         r.total,
      detalhes:      r.detalhes.map(d => ({
        data: d.data, valor: d.valor, meses: d.meses,
        taxaCorrecao: d.taxaCorrecao,
        valorCorrigido: d.valorCorrigido, juros: d.juros, subtotal: d.subtotal
      }))
    },
    criado_por_id: (typeof currentUser !== 'undefined' && currentUser?.id) || null
  };
  const novo = await db.insert('calculos_atualizacao', payload);
  if (novo) {
    status.textContent = '✅ Cálculo salvo no histórico.';
    if (typeof showToast === 'function') showToast('💾 Cálculo salvo');
    carregarHistoricoCalculos();
  } else {
    status.textContent = '⚠️ Erro ao salvar: ' + (db.lastError || 'verifique se rodou o SQL calculos_atualizacao.sql');
  }
}

async function carregarHistoricoCalculos() {
  const el = document.getElementById('calc-corr-historico');
  if (!el) return;
  const dados = await db.get('calculos_atualizacao',
    '?order=criado_em.desc&limit=20&select=*,processo:processos(numero,autor,reu),criado_por:usuarios(nome)');
  if (!dados || !dados.length) {
    el.innerHTML = 'Faça um cálculo e clique em <b>💾 Salvar</b> pra manter o histórico.';
    el.style.textAlign = 'center';
    return;
  }
  el.style.textAlign = 'left';
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--gray-50);border-bottom:1px solid var(--gray-200)">
        <th style="padding:8px;text-align:left">Título</th>
        <th style="padding:8px;text-align:left">Processo</th>
        <th style="padding:8px;text-align:center">Parcelas</th>
        <th style="padding:8px;text-align:right">Total</th>
        <th style="padding:8px;text-align:left">Por</th>
        <th style="padding:8px;text-align:left">Data</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${dados.map(c => {
          const total = c.resultado?.total || 0;
          const dt = c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—';
          const proc = c.processo?.numero || '—';
          const autor = c.criado_por?.nome?.split(' ')[0] || '—';
          const nPar = Array.isArray(c.parcelas) ? c.parcelas.length : 0;
          return `<tr style="border-bottom:1px solid var(--gray-100)">
            <td style="padding:8px">${c.titulo || '<span style="color:var(--gray-400)">(sem título)</span>'}</td>
            <td style="padding:8px;font-family:monospace;font-size:11px">${proc}</td>
            <td style="padding:8px;text-align:center">${nPar}</td>
            <td style="padding:8px;text-align:right;font-family:'SF Mono',Consolas,monospace;font-weight:600;color:#dc2626">R$ ${_calcFmtBR(total)}</td>
            <td style="padding:8px">${autor}</td>
            <td style="padding:8px;color:var(--gray-500)">${dt}</td>
            <td style="padding:8px;text-align:right">
              <button class="btn btn-outline btn-xs" onclick="recarregarCalculo('${c.id}')" title="Recarregar no formulário">↻</button>
              <button class="btn btn-outline btn-xs" style="color:var(--red)" onclick="excluirCalculo('${c.id}')" title="Excluir">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function recarregarCalculo(id) {
  const list = await db.get('calculos_atualizacao', `?id=eq.${id}&limit=1`);
  const c = list?.[0];
  if (!c) return;
  document.getElementById('calc-corr-parcelas').innerHTML = '';
  (c.parcelas || []).forEach(p => _calcAddParcela(_calcFmtBR(p.valor), p.data, p.nome));
  if (!(c.parcelas || []).length) _calcAddParcela();
  document.getElementById('calc-corr-dt-fim').value = c.data_final || '';
  document.getElementById('calc-corr-indice').value = c.indice || 'ipca';
  document.getElementById('calc-corr-indice-manual').value = c.indice_manual_pct != null ? String(c.indice_manual_pct).replace('.',',') : '';
  document.getElementById('calc-corr-juros').value = String(c.juros_pct_am ?? '1').replace('.',',');
  document.getElementById('calc-corr-juros-tipo').value = c.juros_tipo || 'simples';
  document.getElementById('calc-corr-multa').value = String(c.multa_pct ?? '0').replace('.',',');
  document.getElementById('calc-corr-honor').value = String(c.honorarios_pct ?? '0').replace('.',',');
  document.getElementById('calc-corr-titulo').value = c.titulo || '';
  document.getElementById('calc-corr-processo').value = c.processo_id || '';
  _calcToggleIndiceManual();
  document.getElementById('calc-corr-status').textContent = 'Cálculo recarregado. Clique em Calcular pra recalcular.';
  document.getElementById('calc-corr-status').scrollIntoView({behavior:'smooth', block:'center'});
}

async function excluirCalculo(id) {
  if (!confirm('Excluir esse cálculo do histórico?')) return;
  const ok = await db.delete('calculos_atualizacao', id);
  if (ok) {
    if (typeof showToast === 'function') showToast('🗑️ Cálculo excluído');
    carregarHistoricoCalculos();
  } else {
    if (typeof showToast === 'function') showToast('⚠️ ' + (db.lastError || 'erro ao excluir'));
  }
}

// ─── INIT AUTOMÁTICO AO ENTRAR NA PÁGINA ──────────────────────────
async function _calcCarregarProcessos() {
  const sel = document.getElementById('calc-corr-processo');
  if (!sel || sel.options.length > 1) return;   // já populado
  const procs = await db.get('processos', '?order=criado_em.desc&limit=200&select=id,numero,autor,reu,status');
  (procs || []).forEach(p => {
    const nome = `${p.numero || '—'} · ${(p.autor||'').slice(0,20)}${p.autor && p.reu ? ' vs ' + (p.reu||'').slice(0,20) : ''}` +
                 (p.status === 'encerrado' ? ' (encerrado)' : '');
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = nome;
    sel.appendChild(opt);
  });
}

function initCalculadora() {
  const cont = document.getElementById('calc-corr-parcelas');
  if (!cont || cont.children.length) return;
  _calcAddParcela();
  _calcCarregarProcessos();
  carregarHistoricoCalculos();
}

// Sobe automaticamente quando entrar na página (via goTo/nav)
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('nav-planilhas');
  if (nav) nav.addEventListener('click', () => setTimeout(initCalculadora, 50));
  // Também roda uma vez se a página já estiver visível na primeira carga
  setTimeout(() => {
    const page = document.getElementById('page-planilhas');
    if (page && page.classList.contains('active')) initCalculadora();
  }, 300);
});

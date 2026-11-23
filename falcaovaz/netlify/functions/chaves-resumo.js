// Resumo diário da ENTREGA DE CHAVES para o gestor (23/11/2026). Agendado de segunda a sexta às 8h (netlify.toml).
// Mostra: processos atrasados (com responsável), rescisões do Imoview sem processo e entregas previstas para os próximos 7 dias.
// Mesmos prazos da tela do portal (js/29-entrega-chaves.js). Variáveis: SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY.
const PARA = ['joao@novasaopaulo.com.br'], CC = ['entrega.chaves@novasaopaulo.com.br'];
const RESCISOES_DESDE = '2026-11-01';
const BASE = [['agendada', 'data_agendada', 'Agendamento', 'data_cadastro', 3], ['entregue', 'data_entrega', 'Entrega das chaves', 'data_agendada', 1],
  ['vistoria', 'data_vistoria', 'Vistoria', 'data_entrega', 3], ['liberada', 'data_liberacao', 'Chaves liberadas', 'data_vistoria', p => p.necessita_reparo === 'Sim' ? 20 : 2]];
const FINAIS = { 'Caução': [['debitos', 'data_debitos', 'Débitos quitados', 'data_entrega', 30], ['devolucao', 'data_devolucao', 'Devolução da caução', 'data_debitos', 10]],
  'Título de capitalização': [['resgate', 'data_resgate', 'Resgate do título', 'data_entrega', 30], ['debitos', 'data_debitos', 'Débitos quitados', 'data_entrega', 30]],
  'Seguro fiança': [['debitos', 'data_debitos', 'Débitos quitados', 'data_entrega', 30]], 'Fiador': [['debitos', 'data_debitos', 'Débitos quitados', 'data_entrega', 30]] };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = s => s ? new Date(String(s).slice(0, 10) + 'T12:00:00-03:00') : null;
const br = s => { const d = D(s); return d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'; };

exports.handler = async () => {
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, rk = process.env.RESEND_API_KEY;
  if (process.env.CHAVES_RESUMO_ATIVO !== '1') { console.log('[chaves-resumo] desligado (CHAVES_RESUMO_ATIVO)'); return { statusCode: 204 }; }   // liga quando o módulo for apresentado ao João
  if (!key || !rk) return { statusCode: 503 };
  const H = { apikey: key, Authorization: 'Bearer ' + key };
  const proc = await fetch(`${sb}/rest/v1/chaves_processos?select=*&cancelado=is.false&limit=5000`, { headers: H }).then(r => r.json());
  const resc = await fetch(`${sb}/rest/v1/imoview_contratos?select=codigo,codigo_auxiliar,endereco,locatario_nome,data_rescisao,data_aviso_desocupacao&or=(data_rescisao.gte.${RESCISOES_DESDE},data_aviso_desocupacao.gte.${RESCISOES_DESDE})&limit=500`, { headers: H }).then(r => r.json()).catch(() => []);
  const hoje = D(new Date(Date.now() - 3 * 3600e3).toISOString());
  const atras = [], prox = [];
  for (const p of proc) {
    const ets = BASE.concat(FINAIS[p.tipo_fianca] || FINAIS['Fiador']);
    const et = ets.find(e => !p[e[1]]); if (!et) continue;
    const base = D(p[et[3]]), dias = typeof et[4] === 'function' ? et[4](p) : et[4];
    if (base) { const atraso = Math.round((hoje - base) / 864e5) - dias; if (atraso > 0) atras.push({ p, etapa: et[2], atraso }); }
    if (p.tipo_fianca === 'Seguro fiança' && p.data_entrega && !p.data_sinistro && !p.data_debitos) { const d = Math.round((hoje - D(p.data_entrega)) / 864e5); if (d > 15) atras.push({ p, etapa: 'Sinistro do seguro fiança', atraso: d - 15 }); }
    if (!p.data_entrega && p.data_agendada) { const d = Math.round((D(p.data_agendada) - hoje) / 864e5); if (d >= 0 && d <= 7) prox.push(p); }
  }
  const com = new Set(proc.map(p => p.contrato_imoview).filter(Boolean));
  const semProc = (resc || []).filter(c => !com.has(c.codigo));
  atras.sort((a, b) => b.atraso - a.atraso);
  const tab = (cab, linhas) => linhas.length ? `<table style="border-collapse:collapse;font-size:13px;width:100%">${'<tr>' + cab.map(c => `<th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px 6px">${c}</th>`).join('') + '</tr>'}${linhas.map(l => '<tr>' + l.map(c => `<td style="border-bottom:1px solid #f1f5f9;padding:4px 6px">${c}</td>`).join('') + '</tr>').join('')}</table>` : '<p style="color:#16a34a">Nada aqui. ✓</p>';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:720px">
    <h2 style="margin:0 0 4px">Entrega de chaves — resumo de ${hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</h2>
    <p style="color:#64748b;margin:0 0 14px">${proc.length} processos abertos ou concluídos · ${atras.length} com etapa atrasada · ${semProc.length} rescisão(ões) sem processo</p>
    <h3>⚠️ Atrasados (${atras.length})</h3>${tab(['Imóvel', 'Etapa', 'Atraso', 'Responsável'], atras.slice(0, 40).map(a => [esc(a.p.endereco), esc(a.etapa), a.atraso + ' dia(s)', esc(a.p.responsavel || '—')]))}
    <h3>📋 Rescisões no Imoview sem processo (${semProc.length})</h3>${tab(['Contrato', 'Imóvel', 'Locatário', 'Rescisão / aviso'], semProc.slice(0, 40).map(c => [c.codigo + (c.codigo_auxiliar ? ' (Guess ' + esc(c.codigo_auxiliar) + ')' : ''), esc(c.endereco), esc(c.locatario_nome), br(c.data_rescisao || c.data_aviso_desocupacao)]))}
    <h3>📅 Entregas previstas nos próximos 7 dias (${prox.length})</h3>${tab(['Data', 'Imóvel', 'Responsável'], prox.sort((a, b) => String(a.data_agendada).localeCompare(String(b.data_agendada))).map(p => [br(p.data_agendada), esc(p.endereco), esc(p.responsavel || '—')]))}
    <p style="margin-top:18px"><a href="https://novasp.netlify.app">Abrir o portal → Interno → Entrega de Chaves</a></p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + rk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Portal Nova São Paulo <avisos@novasaopaulo.com.br>', to: PARA, cc: CC, subject: `Entrega de chaves: ${atras.length} atrasado(s), ${semProc.length} rescisão(ões) sem processo`, html }) });
  console.log('[chaves-resumo]', r.status, atras.length, semProc.length, prox.length);
  return { statusCode: r.ok ? 200 : 502 };
};

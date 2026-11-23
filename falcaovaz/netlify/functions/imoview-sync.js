// Mantém a cópia leve do Imoview (imoview_contratos / imoview_pessoas) atualizada — 23/11/2026.
// Agendada de hora em hora (netlify.toml). Busca só o que mudou desde a última vez (dataHoraInicialUltimaAlteracao).
// A carga completa inicial foi feita por sandbox/sync_imoview_cache.py. Variáveis: IMOVIEW_CHAVE, SUPABASE_URL, SUPABASE_KEY.
const API = 'https://api.imoview.com.br/';
const data = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const brt = d => { const x = new Date(d.getTime() - 3 * 3600e3); const p = n => String(n).padStart(2, '0');
  return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p(x.getUTCHours())}:${p(x.getUTCMinutes())}`; };
const contrato = m => { const im = (m.imoveis || [])[0] || {};
  return { codigo: m.codigo, codigo_auxiliar: (m.codigoauxiliar || '').trim(), situacao: m.situacao || '', locatario_codigo: m.locatariocodigo || null,
    locatario_nome: m.locatarionome || '', locatario_email: (m.locatarioemail || '').trim(), endereco: im.endereco || '', garantia: m.garantia || '',
    locadores: (m.imoveis || []).flatMap(i => (i.locadores || []).map(l => ({ codigo: l.codigo, nome: l.nome }))),
    data_inicio: data(m.datainicio), data_aviso_desocupacao: data(m.dataavisodesocupacao), data_previsao_rescisao: data(m.dataprevisaorescisao),
    data_rescisao: data(m.datarescisao), motivo_rescisao: m.motivorescisao || '', atualizado_em: new Date().toISOString() }; };
const pessoa = c => ({ codigo: c.codigo, nome: c.nome || '', emails: [...new Set((c.emails || []).map(e => (e.email || '').trim()).filter(e => e.includes('@')))].join(', '), atualizado_em: new Date().toISOString() });

exports.handler = async () => {
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, imv = process.env.IMOVIEW_CHAVE;
  if (!key || !imv) { console.error('[imoview-sync] configuracao'); return { statusCode: 503 }; }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const t0 = Date.now(), inicio = new Date(), res = {};
  const est = await fetch(`${sb}/rest/v1/imoview_sync_estado?select=chave,ultimo`, { headers: H }).then(r => r.json());
  for (const [chave, rota, tab, f] of [['contratos', 'ContratoAluguel/RetornarContratos?ordenacao=1', 'imoview_contratos', contrato], ['pessoas', 'Cliente/RetornarClientes?tipoRelacionamento=2', 'imoview_pessoas', pessoa]]) {
    const ult = (est.find(e => e.chave === chave) || {}).ultimo; if (!ult) { res[chave] = 'sem carga inicial'; continue; }
    const desde = brt(new Date(new Date(ult).getTime() - 15 * 60e3)); let p = 1, n = 0, completo = false;
    while (Date.now() - t0 < 22000) {
      const r = await fetch(`${API}${rota}&dataHoraInicialUltimaAlteracao=${encodeURIComponent(desde)}&numeroPagina=${p}&numeroRegistros=50`, { headers: { chave: imv, Accept: 'application/json' } });
      if (!r.ok) { console.error('[imoview-sync]', chave, r.status); break; }
      const lista = ((await r.json()) || {}).lista || [];
      if (lista.length) {
        const w = await fetch(`${sb}/rest/v1/${tab}?on_conflict=codigo`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lista.map(f)) });
        if (!w.ok) { console.error('[imoview-sync] gravar', chave, w.status, (await w.text()).slice(0, 200)); break; }
        n += lista.length;
      }
      if (lista.length < 50) { completo = true; break; }
      p++;
    }
    if (completo) await fetch(`${sb}/rest/v1/imoview_sync_estado?chave=eq.${chave}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ ultimo: inicio.toISOString() }) });
    res[chave] = `${n} atualizados${completo ? '' : ' (continua na próxima)'}`;
  }
  console.log('[imoview-sync]', JSON.stringify(res));
  return { statusCode: 200, body: JSON.stringify(res) };
};

// Cafés de parceria (site → Agenda do portal) — 23/11/2026. Agendada a cada 20 min (netlify.toml).
// Lê https://www.novasaopaulo.com.br/parceiro/cafes-portal.json (janela −30 a +150 dias) e espelha em agenda_eventos:
//  · chave estável origem_id = id do café no site ("cafe-41"); id numérico = 9000000000 + número → remarcação só muda a data
//  · cancelado no site (ou sumiu do feed dentro da janela) → o evento sai da agenda
//  · participantes (responsavel) = gerentes da área + Rodrigo + Thais + Anderson (+ embaixador), com os nomes do portal
// Variáveis: SITE_CAFES_TOKEN, SUPABASE_URL, SUPABASE_KEY.
const FEED = 'https://www.novasaopaulo.com.br/parceiro/cafes-portal.json?token=';
const FIXOS = ['rodrigo@novasaopaulo.com.br', 'thais.barbosa@novasaopaulo.com.br', 'anderson.lucchi@novasaopaulo.com.br'];

exports.handler = async () => {
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, tok = process.env.SITE_CAFES_TOKEN;
  if (!key || !tok) { console.error('[cafes-sync] configuracao'); return { statusCode: 503 }; }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const r = await fetch(FEED + encodeURIComponent(tok), { headers: { Accept: 'application/json' } });
  if (!r.ok) { console.error('[cafes-sync] feed', r.status); return { statusCode: 502 }; }
  const feed = (await r.json()).cafes || [];
  // nomes do portal pelos e-mails (participante = nome, como no resto da agenda)
  const us = await fetch(`${sb}/rest/v1/usuarios?select=nome,email&ativo=eq.true`, { headers: H }).then(x => x.json());
  const nomeDe = e => { const u = us.find(u => String(u.email || '').toLowerCase() === String(e || '').toLowerCase()); return u ? u.nome : ''; };
  const ativos = [], cancelados = [];
  for (const c of feed) {
    const n = parseInt(String(c.id_site || '').replace(/\D/g, ''), 10); if (!n) continue;
    if (c.status === 'cancelado') { cancelados.push(c.id_site); continue; }
    const emails = [...(c.gerentes || []).map(g => g.email), ...FIXOS, (c.embaixador || {}).email].filter(Boolean);
    const part = [...new Set(emails.map(nomeDe).filter(Boolean))];
    const desc = [`📍 ${c.local || ''}`, c.area ? `Área: ${c.area}` : '', c.embaixador && c.embaixador.nome ? `Embaixador: ${c.embaixador.nome}` : '',
      (c.gerentes || []).length ? `Gerente(s): ${(c.gerentes || []).map(g => g.nome).join(', ')}` : '', c.contato_incorporadora ? `Incorporadora: ${c.contato_incorporadora}` : '',
      `Situação no site: ${c.status}`, 'Marcado pelo site (Área do Corretor → Parcerias). Para mudar, altere lá.'].filter(Boolean).join('\n');
    ativos.push({ id: 9000000000 + n, origem_id: c.id_site, titulo: c.titulo || '☕ Café de parceria', data: c.data, hora_inicio: c.hora_inicio || '', hora_fim: c.hora_fim || '',
      tipo: 'Café parceria', responsavel: part.join(', '), descricao: desc, link: c.link || '', situacao: '', agenda: 'nsp' });
  }
  if (ativos.length) {
    const w = await fetch(`${sb}/rest/v1/agenda_eventos?on_conflict=origem_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(ativos) });
    if (!w.ok) { console.error('[cafes-sync] gravar', w.status, (await w.text()).slice(0, 200)); return { statusCode: 502 }; }
  }
  // sai da agenda: cancelados + cafés do portal que sumiram do feed (dentro da janela do feed)
  const ini = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const noPortal = await fetch(`${sb}/rest/v1/agenda_eventos?select=origem_id&origem_id=like.cafe-*&data=gte.${ini}`, { headers: H }).then(x => x.json());
  const vivos = new Set(ativos.map(a => a.origem_id));
  const tirar = [...new Set(cancelados.concat(noPortal.map(x => x.origem_id).filter(o => !vivos.has(o))))];
  if (tirar.length) await fetch(`${sb}/rest/v1/agenda_eventos?origem_id=in.(${tirar.map(o => '"' + o + '"').join(',')})`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  console.log('[cafes-sync]', ativos.length, 'ativos;', tirar.length, 'retirados');
  return { statusCode: 200, body: JSON.stringify({ ativos: ativos.length, retirados: tirar.length }) };
};

// Botão "Atualizar agora" da tela de Inadimplentes do portal (25/11/2026): confere se quem pede pode ver a cobrança
// (cobranca_pode(), com o token da pessoa) e dispara a função de fundo. Não devolve dados.
const crypto = require('crypto');
const ORIGENS = ['https://novasp.netlify.app'];
const cors = o => ({ 'Access-Control-Allow-Origin': ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+--novasp\.netlify\.app$/.test(o || '') ? o : ORIGENS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin' });
exports.handler = async (event) => {
  const Hc = cors((event.headers || {}).origin);
  const resp = (s, o) => ({ statusCode: s, headers: { ...Hc, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Hc, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { ok: false });
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, anon = process.env.SUPABASE_ANON_KEY;
  const auth = (event.headers || {}).authorization || '';
  if (!key || !anon) return resp(503, { ok: false });
  if (!/^Bearer [\w.-]{20,}$/.test(auth)) return resp(401, { ok: false, erro: 'login' });
  const r = await fetch(`${sb}/rest/v1/rpc/cobranca_pode`, { method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok || (await r.json()) !== true) return resp(403, { ok: false, erro: 'sem acesso' });
  const st = await fetch(`${sb}/rest/v1/cobranca_sync?select=situacao,inicio&id=eq.1`, { headers: { apikey: key, Authorization: 'Bearer ' + key } }).then(x => x.json()).then(x => x[0] || {});
  if (st.situacao === 'atualizando' && st.inicio && Date.now() - new Date(st.inicio) < 10 * 60e3) return resp(200, { ok: true, ja: true });
  const b = await fetch((process.env.URL || 'https://falcaovaz.netlify.app') + '/.netlify/functions/inadimplencia-sync-background',
    { method: 'POST', headers: { 'x-sync': crypto.createHash('sha256').update(key + '|inadimplencia').digest('hex') } });
  return resp(200, { ok: b.status === 202 || b.ok });
};

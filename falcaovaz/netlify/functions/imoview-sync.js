// Agendada de hora em hora (netlify.toml): só dispara a função de fundo imoview-sync-background, que faz a sincronização
// (o agendamento tem ~25 s; o atraso acumulado — ex.: 850 contratos alterados — não cabia). 25/11/2026.
const crypto = require('crypto');
exports.handler = async () => {
  const key = process.env.SUPABASE_KEY; if (!key) return { statusCode: 503 };
  const base = process.env.URL || 'https://falcaovaz.netlify.app';
  const r = await fetch(base + '/.netlify/functions/imoview-sync-background', { method: 'POST', headers: { 'x-sync': crypto.createHash('sha256').update(key + '|imoview-sync').digest('hex') } });
  console.log('[imoview-sync] disparou fundo:', r.status);
  return { statusCode: 200 };
};

// Agendada a cada 30 min (netlify.toml): dispara a função de fundo inadimplencia-sync-background. 25/11/2026.
const crypto = require('crypto');
exports.handler = async () => {
  const key = process.env.SUPABASE_KEY; if (!key) return { statusCode: 503 };
  const r = await fetch((process.env.URL || 'https://falcaovaz.netlify.app') + '/.netlify/functions/inadimplencia-sync-background',
    { method: 'POST', headers: { 'x-sync': crypto.createHash('sha256').update(key + '|inadimplencia').digest('hex') } });
  console.log('[inadimplencia-sync] fundo:', r.status);
  return { statusCode: 200 };
};

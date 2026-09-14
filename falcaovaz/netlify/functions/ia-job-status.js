// Le o status de um job de IA no Supabase, server-side.
// Existe pra contornar redes que bloqueiam supabase.co no navegador
// (aconteceu na rede do escritorio em ago/2026): o front consulta este
// endpoint — mesmo dominio do site, que a rede alcanca — quando a
// leitura direta do banco falha. Ver pollJob em 13-gerar-doc.js.
exports.handler = async (event) => {
  const jobId = (event.queryStringParameters || {}).job_id || '';
  if (!/^job-[A-Za-z0-9-]+$/.test(jobId)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'job_id invalido' }) };
  }
  const url = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'SUPABASE_KEY ausente no ambiente' }) };
  }
  try {
    const r = await fetch(
      `${url}/rest/v1/ia_jobs?job_id=eq.${encodeURIComponent(jobId)}&select=status,resultado,tokens,erro&limit=1`,
      { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key } }
    );
    const body = await r.text();
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body };
  } catch (e) {
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};

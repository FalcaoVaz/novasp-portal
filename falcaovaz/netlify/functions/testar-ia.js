const https = require('https');

exports.handler = async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (!apiKey) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, erro: 'ANTHROPIC_API_KEY não configurada' }) };

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Responda apenas: IA funcionando.' }]
  });

  return new Promise(resolve => {
    const start = Date.now();
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        try {
          const j = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({
              ok: true,
              resposta: j.content?.[0]?.text,
              tempo_ms: ms,
              modelo: j.model
            })});
          } else {
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({
              ok: false,
              status_http: res.statusCode,
              erro: j.error?.message,
              tipo: j.error?.type,
              tempo_ms: ms
            })});
          }
        } catch(e) {
          resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, erro: 'JSON inválido: ' + data.substring(0,100) }) });
        }
      });
    });
    req.on('error', e => resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, erro: 'Conexão: ' + e.message }) }));
    req.write(body);
    req.end();
  });
};

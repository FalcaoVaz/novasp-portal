// ═══════════════════════════════════════════════════════
// FALCÃOVAZ — Netlify Function: Envio de Email ao Cliente
// Usa Resend (resend.com) — gratuito até 3.000 emails/mês
// Variável de ambiente: RESEND_API_KEY
// ═══════════════════════════════════════════════════════
const https = require('https');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({ hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); }
        catch(e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: '{"erro":"Método não permitido"}' };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'RESEND_API_KEY não configurada' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'JSON inválido' }) }; }

  const { email_cliente, nome_cliente, numero_processo, andamentos, advogado } = body;
  if (!email_cliente || !numero_processo) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'email_cliente e numero_processo obrigatórios' }) };
  }

  // Monta o email HTML
  const andamentosHtml = (andamentos || []).map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">${a.data || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${a.descricao || '—'}</td>
    </tr>`).join('') || `<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8">Nenhum andamento recente.</td></tr>`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'DM Sans',Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#1E2D4A;padding:28px 32px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Nova São Paulo</div>
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">Imobiliária</div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px">Olá, ${nome_cliente || 'cliente'}!</p>
      <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">
        Seguem as atualizações do seu processo <strong style="color:#1E2D4A">${numero_processo}</strong> referentes ao último mês.
      </p>

      <!-- Tabela de andamentos -->
      <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:24px">
        <div style="background:#f8fafc;padding:12px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:1px solid #e2e8f0">
          Andamentos Recentes
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Data</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Movimentação</th>
            </tr>
          </thead>
          <tbody>${andamentosHtml}</tbody>
        </table>
      </div>

      <p style="font-size:13px;color:#94a3b8;line-height:1.6">
        Em caso de dúvidas, entre em contato com seu advogado responsável${advogado ? ': <strong>' + advogado + '</strong>' : ''}.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="font-size:12px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>
      <p style="font-size:11px;color:#cbd5e1;margin:4px 0 0">Este email foi enviado automaticamente pelo sistema de gestão de processos.</p>
    </div>

  </div>
</body>
</html>`;

  try {
    console.log('[email] enviando para', email_cliente, 'processo', numero_processo);
    // TEMPORARIO: usando onboarding@resend.dev enquanto o dominio novasaopaulo.com.br
    // nao esta verificado na Resend. Quando verificar, trocar 'from' para um endereco
    // do dominio verificado. O reply_to aponta para novasaopaulo.sp@gmail.com —
    // respostas dos clientes vao para essa caixa.
    const result = await httpsPost('api.resend.com', '/emails', {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }, {
      from: 'Jurídico Nova São Paulo <onboarding@resend.dev>',
      to: [email_cliente],
      reply_to: 'novasaopaulo.sp@gmail.com',
      subject: `Atualização do seu processo ${numero_processo} — Nova São Paulo`,
      html
    });

    console.log('[email] Resend status:', result.status, 'body:', JSON.stringify(result.body));

    if (result.status >= 200 && result.status < 300) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, id: result.body.id }) };
    }
    // Erro do Resend — extrai mensagem util para mostrar no frontend
    const msg = result.body?.message
              || result.body?.error
              || (result.body?.name ? `${result.body.name}: ${result.body.message||''}`.trim() : null)
              || result.body?.raw
              || `HTTP ${result.status}`;
    console.error('[email] Resend rejeitou:', msg);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ erro: msg, detalhe: result.body })
    };
  } catch(e) {
    console.error('[email] erro interno:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro interno: ' + e.message }) };
  }
};

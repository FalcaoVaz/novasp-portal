// "AVALIAR ESTE IMÓVEL": VOLTA para a Área do Corretor do site (15/10/2026).
// O portal envia um formulário (POST, navegação de página inteira — o token não vai no endereço) com
// {token, avaliacao_id, ref, retorno}. Esta função confere quem é (token do Supabase), confere que a avaliação é dele
// (ou que é administrador), mantém o MESMO avaliacao_id por (corretor, imóvel), assina o link do PDF no bucket privado
// "dossies" e devolve o corretor ao site com o passe de volta, assinado com o mesmo segredo do login (SITE_SSO_SECRET).
// Passe: {email, ref, avaliacao_id, valor_min, valor, valor_max, pdf_url, iat, exp, nonce}; exp = iat + 600 s.

const crypto = require('crypto');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pagina = (msg, status) => ({ statusCode: status || 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Área do Corretor</title>
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#0f172a"><p style="font-size:17px">${msg}</p>
<p><a href="https://www.novasaopaulo.com.br/area-do-corretor" style="color:#0088CC">Voltar para a Área do Corretor</a></p></div>` });

exports.handler = async (event) => {
  const segredo = process.env.SITE_SSO_SECRET || '';
  const sbUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const service = process.env.SUPABASE_KEY || '';
  const anon = process.env.SUPABASE_ANON_KEY || service;
  if (event.httpMethod !== 'POST') return pagina('Use o botão "Enviar para a Área do Corretor" na avaliação.', 405);
  if (segredo.length < 32 || !service) return pagina('Envio ao site ainda não configurado. Fale com o Rodrigo.', 503);

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const f = Object.fromEntries(new URLSearchParams(raw));
  const token = String(f.token || ''), id = String(f.avaliacao_id || ''), ref = String(f.ref || '').slice(0, 40), retorno = String(f.retorno || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !token || !ref) return pagina('Dados incompletos para enviar ao site.');
  if (!retorno.startsWith('https://www.novasaopaulo.com.br/')) return pagina('Endereço de retorno inválido.');

  // quem está enviando (pelo token do Supabase)
  let email = '';
  try { const r = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: 'Bearer ' + token } }); if (r.status === 200) email = String(((await r.json()) || {}).email || '').toLowerCase(); } catch (_) {}
  if (!/@novasaopaulo\.com\.br$/.test(email)) return pagina('Sessão vencida. Volte à Área do Corretor e abra a avaliação de novo.', 401);

  const h = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  const get = async (path) => { const r = await fetch(`${sbUrl}/rest/v1/${path}`, { headers: h }); return r.status === 200 ? r.json() : []; };
  const [av] = await get(`aval_resultado?id=eq.${id}&select=id,corretor_nome,valor_mercado,faixa_min,faixa_max`);
  const [u] = await get(`usuarios?select=nome,admin&email=ilike.${encodeURIComponent(email)}`);
  if (!av || !u) return pagina('Avaliação não encontrada.', 404);
  if (!u.admin && av.corretor_nome !== u.nome) return pagina('Esta avaliação é de outro corretor.', 403);

  // MESMO avaliacao_id para o site quando o corretor refaz a avaliação do mesmo imóvel
  let idSite = id;
  const [ja] = await get(`sso_avaliacao_ref?email=eq.${encodeURIComponent(email)}&ref=eq.${encodeURIComponent(ref)}&select=avaliacao_id`);
  if (ja) idSite = ja.avaliacao_id;
  else await fetch(`${sbUrl}/rest/v1/sso_avaliacao_ref`, { method: 'POST', headers: { ...h, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ email, ref, avaliacao_id: id }) });

  // link assinado do PDF (o portal subiu em dossies/<email>/<id>.pdf); 1 hora
  let pdf_url = null;
  try {
    const rs = await fetch(`${sbUrl}/storage/v1/object/sign/dossies/${encodeURIComponent(email)}/${id}.pdf`, { method: 'POST', headers: h, body: JSON.stringify({ expiresIn: 3600 }) });
    const js = await rs.json().catch(() => ({}));
    const sig = js.signedURL || js.signedUrl;
    if (sig) pdf_url = sig.startsWith('http') ? sig : `${sbUrl}/storage/v1${sig}`;
  } catch (_) {}

  const agora = Math.floor(Date.now() / 1000);
  const passe = { email, ref, avaliacao_id: idSite, valor: av.valor_mercado != null ? Math.round(av.valor_mercado) : null,
    valor_min: av.faixa_min != null ? Math.round(av.faixa_min) : null, valor_max: av.faixa_max != null ? Math.round(av.faixa_max) : null,
    pdf_url, iat: agora, exp: agora + 600, nonce: crypto.randomBytes(16).toString('hex') };
  Object.keys(passe).forEach(k => passe[k] == null && delete passe[k]);
  const corpo = b64url(Buffer.from(JSON.stringify(passe), 'utf8'));
  const assinatura = b64url(crypto.createHmac('sha256', segredo).update(corpo).digest());
  console.log('[sso-retorno]', email.replace(/^(.).*@/, '$1***@'), ref, pdf_url ? 'com PDF' : 'sem PDF');
  return { statusCode: 303, headers: { Location: `${retorno}${retorno.includes('?') ? '&' : '?'}t=${corpo}.${assinatura}`, 'Cache-Control': 'no-store' }, body: '' };
};

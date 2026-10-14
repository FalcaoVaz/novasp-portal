// LOGIN ÚNICO DA ÁREA DO CORRETOR (site → Avaliação do portal) — 14/10/2026.
// Base: proposta da sessão do site (HANDOFF-SSO-funcao-netlify-sso-corretor.js), revisada aqui.
// Mora no site do jurídico porque é aqui que está a SUPABASE_KEY (service_role) — o portal é só arquivos estáticos.
//
// Fluxo: card "Avaliação" no site → /.netlify/functions/sso-corretor?t=<passe> → confere o passe → acha ou cria a conta
// no Supabase Auth → gera um magic link → redireciona. O portal recebe a sessão, chama portal_entrar_corretor() e
// abre SÓ a Avaliação (js/03-auth.js, _entrarPeloSite). SQL: portal/sql/2026-10-14-sso-corretor.sql.
//
// Passe = base64url(json) + "." + base64url(HMAC-SHA256(base64url(json), SITE_SSO_SECRET))
// json  = {email, nome, codigos, origem, iat, exp, nonce}; exp = iat + 60 s.
// Variáveis no Netlify do jurídico: SITE_SSO_SECRET (o MESMO valor de AVAL_SSO_SECRET no .env do site).
// Opcional: PORTAL_AVALIACAO_URL (padrão https://novasp.netlify.app/?entrada=site).

const crypto = require('crypto');

const b64urlDecode = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pagina = (msg, status) => ({
  statusCode: status || 403,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Área do Corretor</title>
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#0f172a"><p style="font-size:17px">${msg}</p>
<p><a href="https://www.novasaopaulo.com.br/area-do-corretor" style="color:#0088CC">Voltar para a Área do Corretor</a></p></div>`
});

exports.handler = async (event) => {
  const segredo = process.env.SITE_SSO_SECRET || '';
  const sbUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const service = process.env.SUPABASE_KEY || '';
  const destino = process.env.PORTAL_AVALIACAO_URL || 'https://novasp.netlify.app/?entrada=site';
  if (segredo.length < 32 || !service) return pagina('A avaliação ainda não está configurada. Fale com o Rodrigo.', 503);

  const t = String((event.queryStringParameters || {}).t || '');
  const [corpo, assinatura] = t.split('.');
  if (!corpo || !assinatura) return pagina('Link inválido. Abra a avaliação pela Área do Corretor do site.');

  // assinatura (comparação em tempo constante)
  const esperado = b64url(crypto.createHmac('sha256', segredo).update(corpo).digest());
  const a = Buffer.from(assinatura), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return pagina('Link inválido. Abra a avaliação pela Área do Corretor do site.');

  let dados;
  try { dados = JSON.parse(b64urlDecode(corpo).toString('utf8')); } catch (_) { return pagina('Link inválido.'); }
  const agora = Math.floor(Date.now() / 1000);
  const iat = Number(dados.iat) || 0, exp = Number(dados.exp) || 0;
  if (!exp || exp < agora || exp - iat > 120 || iat > agora + 30) return pagina('Link vencido. Toque de novo em "Avaliação" na Área do Corretor.');
  const email = String(dados.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@novasaopaulo\.com\.br$/.test(email)) return pagina('Acesso só para e-mails da Nova São Paulo.');
  const nonce = String(dados.nonce || '');
  if (nonce.length < 16) return pagina('Link inválido.');

  const h = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };

  // passe de uso único: a gravação do nonce TEM de dar certo (falha = não entra)
  const rn = await fetch(`${sbUrl}/rest/v1/sso_nonces`, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ nonce }) });
  if (rn.status === 409) return pagina('Este link já foi usado. Toque de novo em "Avaliação".');
  if (rn.status >= 300) { console.error('[sso] nonce HTTP', rn.status); return pagina('Não foi possível abrir a avaliação agora. Tente de novo em instantes.', 503); }
  fetch(`${sbUrl}/rest/v1/sso_nonces?criado_em=lt.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`, { method: 'DELETE', headers: h }).catch(() => {});

  // conta no Supabase Auth: cria se faltar (sem senha, e-mail confirmado); 422 = já existe → usa a existente
  const rc = await fetch(`${sbUrl}/auth/v1/admin/users`, { method: 'POST', headers: h,
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { nome: String(dados.nome || '').slice(0, 120), perfil: 'corretor', codigos_imoview: Array.isArray(dados.codigos) ? dados.codigos.slice(0, 20) : [], origem: 'site' } }) });
  if (rc.status >= 300 && rc.status !== 422) console.error('[sso] criar conta HTTP', rc.status);

  // magic link → o portal recebe a sessão no endereço de destino
  const rl = await fetch(`${sbUrl}/auth/v1/admin/generate_link`, { method: 'POST', headers: h,
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: destino, options: { redirect_to: destino } }) });
  const j = await rl.json().catch(() => ({}));
  const link = j.action_link || (j.properties && j.properties.action_link);
  if (!link) { console.error('[sso] generate_link HTTP', rl.status); return pagina('Não foi possível abrir a avaliação agora. Tente de novo em instantes.', 503); }
  console.log('[sso] entrada', email.replace(/^(.).*@/, '$1***@'));
  // o nome que o site conhece vai no user_metadata, que o Supabase põe dentro do token; o portal lê de lá
  return { statusCode: 302, headers: { Location: link, 'Cache-Control': 'no-store' }, body: '' };
};

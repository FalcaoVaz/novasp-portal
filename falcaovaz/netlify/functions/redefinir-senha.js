// "Esqueci minha senha" do PORTAL (17/11/2026).
// Antes, o portal gravava a senha nova só em usuarios.senha_hash — mas desde a migração quem confere a senha no login é o
// Supabase Auth, que continuava com a senha antiga. Resultado: a pessoa redefinia, entrava uma vez e no acesso seguinte
// dava "Senha incorreta" de novo (caso da Christiane). Aqui, com a chave de serviço (que só existe no servidor):
//   1) confere o código de 6 dígitos no Apps Script de e-mail (o mesmo que enviou; uso único, vale 15 min);
//   2) troca a senha da conta no Supabase Auth (cria a conta se faltar);
//   3) grava o hash em usuarios.senha_hash (primeiro_acesso = false).
// Chamada pelo portal (novasp.netlify.app) em js/03-auth.js → confirmarReset().
const crypto = require('crypto');

const ORIGEM = 'https://novasp.netlify.app';
const GAS_EMAIL = 'https://script.google.com/macros/s/AKfycbw6QlYrbYAlM4TFLvX92j5d19WUHHYrN-ykiGp1Umxu4qb8MzjV7oJVixkM4EFqBQqGqw/exec';
const CORS = { 'Access-Control-Allow-Origin': ORIGEM, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
const resp = (status, obj) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

// mesmas regras do portal (js/00-config.js: _authEmailDe e _authSenha)
const emailAuth = u => { const e = String(u.email || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : `u${u.id}@portal.novasaopaulo.local`; };
const senhaAuth = s => (s.length >= 6 ? s : (s + '$nSP42').slice(0, 6));

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, erro: 'método' });
  const sbUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const service = process.env.SUPABASE_KEY || '';
  if (!service) return resp(503, { ok: false, erro: 'configuracao' });

  let d; try { d = JSON.parse(event.body || '{}'); } catch (_) { return resp(400, { ok: false, erro: 'dados' }); }
  const email = String(d.email || '').trim().toLowerCase(), codigo = String(d.codigo || '').trim(), nova = String(d.nova || '');
  if (!email || !/^\d{6}$/.test(codigo)) return resp(400, { ok: false, erro: 'invalido' });
  if (nova.length < 6 || nova.length > 200) return resp(400, { ok: false, erro: 'senha_curta' });

  const h = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  // usuário ativo do portal com esse e-mail
  const ru = await fetch(`${sbUrl}/rest/v1/usuarios?select=id,email,ativo&email=ilike.${encodeURIComponent(email)}&limit=2`, { headers: h });
  const us = ru.ok ? await ru.json() : [];
  const u = us.find(x => x.ativo !== false && String(x.email || '').toLowerCase() === email);
  if (!u) return resp(400, { ok: false, erro: 'invalido' });

  // 1) código (o Apps Script apaga ao acertar: uso único)
  let v = null;
  try {
    const url = `${GAS_EMAIL}?action=verificar_reset&data=${encodeURIComponent(JSON.stringify({ email: u.email, codigo }))}&t=${Date.now()}`;
    v = await (await fetch(url, { redirect: 'follow' })).json();
  } catch (e) { console.error('[reset] GAS', e.message); return resp(502, { ok: false, erro: 'indisponivel' }); }
  if (!v || v.success !== true) return resp(400, { ok: false, erro: (v && v.error) === 'expirado' ? 'expirado' : 'invalido' });

  // 2) Supabase Auth: acha a conta pelo e-mail e troca a senha (ou cria)
  const alvo = emailAuth(u);
  let authId = null;
  for (let page = 1; page <= 20 && !authId; page++) {
    const r = await fetch(`${sbUrl}/auth/v1/admin/users?page=${page}&per_page=500`, { headers: h });
    if (!r.ok) { console.error('[reset] listar HTTP', r.status); break; }
    const j = await r.json(); const lista = j.users || [];
    const achou = lista.find(x => String(x.email || '').toLowerCase() === alvo);
    if (achou) authId = achou.id;
    if (lista.length < 500) break;
  }
  const corpo = JSON.stringify({ password: senhaAuth(nova), email_confirm: true });
  const ra = authId
    ? await fetch(`${sbUrl}/auth/v1/admin/users/${authId}`, { method: 'PUT', headers: h, body: corpo })
    : await fetch(`${sbUrl}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email: alvo, password: senhaAuth(nova), email_confirm: true }) });
  if (!ra.ok) { console.error('[reset] auth HTTP', ra.status, (await ra.text()).slice(0, 200)); return resp(500, { ok: false, erro: 'falhou' }); }

  // 3) hash no cadastro (mesmo SHA-256 do portal)
  const hash = crypto.createHash('sha256').update(nova, 'utf8').digest('hex');
  const rp = await fetch(`${sbUrl}/rest/v1/usuarios?id=eq.${u.id}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ senha_hash: hash, primeiro_acesso: false }) });
  if (!rp.ok) console.error('[reset] usuarios HTTP', rp.status);
  return resp(200, { ok: true });
};

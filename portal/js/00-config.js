const SBU='https://mqcduyvpuxdweqesgwrq.supabase.co';
const SBK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xY2R1eXZwdXhkd2VxZXNnd3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzE5OTcsImV4cCI6MjA5MzQwNzk5N30.QdpRZRxnYF6GTh13wdTNqZTQ-9ztY3veef62mfGRphE';
const H={'apikey':SBK,'Authorization':'Bearer '+SBK,'Content-Type':'application/json','Prefer':'return=representation'};

// Apps Script URLs
// URL1 = Requisições (NSP) | URL2 = Manutenção Predial (MAN)
// URL_A=Manutenção (acao=listar_chamados) | URL_B=Requisições (sem param)
const GAS_MANUTENCAO  = 'https://script.google.com/macros/s/AKfycbzYe4LtYkrHYvAa01L7Gj7kLt49BcTksANSB79m0NaRP4HbKI97HD0IglJ5A-eLoZ5ouQ/exec';
const GAS_REQUISICOES = 'https://script.google.com/macros/s/AKfycbyGxdULpRrk-UPaPWmciY6tvjzlyTvff1tsVxsaFdXH1wMiNWSpMscYTwsaHs2aUImQhw/exec';
const GAS_CALENDAR    = 'https://script.google.com/macros/s/AKfycbzvYElSoSN_rBikiur2Z-kgDF06xt8lvL-F6BfahfayyHKMWPUzqe78_s4h1YjK-0Q/exec';
// Apps Script de email (compartilhado com falcaovaz) — para boas-vindas e outras notificacoes
const GAS_EMAIL       = 'https://script.google.com/macros/s/AKfycbw6QlYrbYAlM4TFLvX92j5d19WUHHYrN-ykiGp1Umxu4qb8MzjV7oJVixkM4EFqBQqGqw/exec';

// Cliente Apps Script — GET
// timeoutMs: o Apps Script trava intermitentemente; sem timeout o fetch
// fica pendurado e a agenda "some" da tela. AbortController corta em 20s.
async function gasGet(url, params={}, opts={}) {
  const q = new URLSearchParams({...params, t: Date.now()}).toString();
  const timeoutMs = opts.timeoutMs || 20000;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let r;
  try {
    r = await fetch(`${url}?${q}`, ctrl ? {signal: ctrl.signal} : {});
  } finally { if (timer) clearTimeout(timer); }
  if (!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
  const text = await r.text();
  console.log('GAS resposta (200 chars):', text.substring(0,200));
  // O Calendar faz escrita via GET (action=create/update/delete) — depois
  // de qualquer uma, o cache de leituras precisa cair pra lista nao
  // mostrar dado velho.
  if (params.action && params.action !== 'read' && typeof _gasCache !== 'undefined') _gasCache.clear();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Resposta não é JSON: ' + text.substring(0,100)); }
}
// GET com cache em memoria (TTL) + resiliencia. O Apps Script leva ~4s
// e as vezes TRAVA (timeout). Estrategia: TTL valido → cache; senao
// tenta ate 3x; se tudo falhar e houver cache antigo, serve o STALE
// (dado de minutos atras) em vez de estourar erro — foi o que fazia a
// agenda aparecer vazia e o usuario re-salvar (gerando duplicatas).
// So LEITURA passa aqui; escrita (create/update/delete) nunca faz retry.
const _gasCache = new Map();
async function gasGetCached(url, params={}, ttlMs=60000){
  const k = url + '::' + JSON.stringify(params);
  const hit = _gasCache.get(k);
  if (hit && (Date.now() - hit.ts) < ttlMs) return hit.data;
  let ultimoErro;
  for (let tent=0; tent<3; tent++){
    try {
      const data = await gasGet(url, params, {timeoutMs:20000});
      _gasCache.set(k, {ts: Date.now(), data});
      return data;
    } catch(e){ ultimoErro=e; console.warn('[gas] leitura falhou (tentativa '+(tent+1)+'/3):', e.message); }
  }
  if (hit) { console.warn('[gas] servindo cache antigo apos 3 falhas — dado pode estar desatualizado'); return hit.data; }
  throw ultimoErro;
}
// Cliente Apps Script — POST
async function gasPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'text/plain'},
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
  const text = await r.text();
  // Escrita invalida o cache de leituras — proxima renderizacao busca fresco.
  _gasCache.clear();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Resposta não é JSON: ' + text.substring(0,100)); }
}
// ═══════════════════════════════════════════════════════════════
// SEGURANÇA — sessão autenticada no Supabase (GoTrue)
// ---------------------------------------------------------------
// Antes: TODAS as requisições iam com a chave anônima, que é pública
// (está neste arquivo, visível pra qualquer um). Isso permitia a
// qualquer pessoa ler e gravar no banco sem login.
//
// Agora: depois do login no portal, o usuário também recebe um token
// JWT do Supabase. Esse token vai em toda requisição e é o que as
// políticas de RLS conferem. A chave anônima vira só um fallback
// enquanto os 69 usuários ainda não migraram.
//
// A migração é transparente: no primeiro login após o deploy, o
// sistema cria a conta no Supabase Auth usando a MESMA senha que a
// pessoa já usa. Ninguém precisa redefinir nada.
// ═══════════════════════════════════════════════════════════════
const AUTH_KEY = 'nsp_sb_session';
let _sbSession = null;   // { access_token, refresh_token, expires_at }

function _authCarregarSessao(){
  if (_sbSession) return _sbSession;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) _sbSession = JSON.parse(raw);
  } catch(_) {}
  return _sbSession;
}
function _authSalvarSessao(s){
  _sbSession = s;
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch(_) {}
}
function _authLimparSessao(){
  _sbSession = null;
  try { localStorage.removeItem(AUTH_KEY); } catch(_) {}
}
// Headers de cada requisição: usa o JWT do usuário quando existe.
function hdr(extra){
  const s = _authCarregarSessao();
  const token = (s && s.access_token && Date.now() < (s.expires_at||0)) ? s.access_token : SBK;
  return Object.assign({
    'apikey': SBK,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }, extra||{});
}
// Email sintético pra quem não tem email cadastrado (o Auth exige um).
function _authEmailDe(u){
  const e = String(u?.email||'').trim().toLowerCase();
  if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return e;
  return `u${u.id}@portal.novasaopaulo.local`;
}
// Faz login no Supabase Auth. Se a conta ainda não existe, cria com a
// mesma senha (migração transparente). Nunca lança erro: se falhar, o
// portal segue funcionando com a chave anônima como antes.
// opts.somenteLogin: nao cria conta se nao existir. Usado no modo
// pos-RLS (a senha nao pode mais ser validada aqui, so no GoTrue —
// se o signup ficasse liberado, qualquer senha digitada viraria a
// conta de um usuario ainda nao migrado).
// O GoTrue exige senha de 6+ chars; o portal historicamente aceitou 4+.
// Pra nao obrigar ninguem a trocar de senha, senhas curtas ganham um
// sufixo FIXO e deterministico so no Auth (o portal continua validando
// a senha original). Mesma transformacao no signup e no login — nunca
// mudar este sufixo, senao as contas migradas ficam orfas.
function _authSenha(senhaPlana){
  const s = String(senhaPlana||'');
  return s.length >= 6 ? s : (s + '$nSP42').slice(0, 6);
}
async function autenticarSupabase(usuario, senhaPlana, opts){
  if (!usuario || !senhaPlana) return false;
  const email = _authEmailDe(usuario);
  const body = JSON.stringify({ email, password: _authSenha(senhaPlana) });
  const base = { 'apikey': SBK, 'Content-Type': 'application/json' };
  const guardar = (j) => {
    if (!j || !j.access_token) return false;
    _authSalvarSessao({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + ((j.expires_in||3600) * 1000) - 60000
    });
    return true;
  };
  try {
    // 1) tenta entrar
    let r = await fetch(SBU+'/auth/v1/token?grant_type=password', {method:'POST', headers:base, body});
    if (r.ok) { if (guardar(await r.json())) { console.log('[auth] sessão Supabase ativa'); return true; } }
    if (opts && opts.somenteLogin) return false;
    // 2) conta ainda não existe → cria com a mesma senha
    r = await fetch(SBU+'/auth/v1/signup', {method:'POST', headers:base, body});
    if (r.ok) {
      const j = await r.json();
      if (guardar(j)) { console.log('[auth] conta Supabase criada e sessão ativa'); return true; }
      // signup exigiu confirmação por email → tenta logar mesmo assim
      r = await fetch(SBU+'/auth/v1/token?grant_type=password', {method:'POST', headers:base, body});
      if (r.ok && guardar(await r.json())) return true;
      console.warn('[auth] conta criada mas confirmação de email está ligada no Supabase — desligue em Auth > Providers > Email > Confirm email');
    } else {
      console.warn('[auth] signup falhou:', (await r.text()).substring(0,200));
    }
  } catch(e) {
    console.warn('[auth] Supabase Auth indisponível, seguindo com chave anônima:', e.message);
  }
  return false;
}
// Renova o token (vale 1h) usando o refresh_token. Usado no auto-login
// do "manter-me conectado", que dura 30 dias.
async function renovarSessaoSupabase(){
  const s = _authCarregarSessao();
  if (!s?.refresh_token) return false;
  if (Date.now() < (s.expires_at||0)) return true;   // ainda válido
  try {
    const r = await fetch(SBU+'/auth/v1/token?grant_type=refresh_token', {
      method:'POST',
      headers:{'apikey':SBK,'Content-Type':'application/json'},
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!r.ok) { _authLimparSessao(); return false; }
    const j = await r.json();
    if (!j.access_token) { _authLimparSessao(); return false; }
    _authSalvarSessao({
      access_token: j.access_token,
      refresh_token: j.refresh_token || s.refresh_token,
      expires_at: Date.now() + ((j.expires_in||3600) * 1000) - 60000
    });
    console.log('[auth] sessão Supabase renovada');
    return true;
  } catch(_) { return false; }
}

function encerrarSessaoSupabase(){
  const s = _authCarregarSessao();
  _authLimparSessao();
  if (s?.access_token) {
    fetch(SBU+'/auth/v1/logout', {
      method:'POST',
      headers:{'apikey':SBK,'Authorization':'Bearer '+s.access_token}
    }).catch(()=>{});
  }
}

// ─── PONTE DE TOKEN PRO JURÍDICO ────────────────────────────────
// O jurídico (falcaovaz) roda em outro domínio: não enxerga o
// localStorage daqui. O portal é o único dono do refresh_token;
// o jurídico só recebe o access_token (1h) e pede outro quando
// está pra vencer. Sem isso, o jurídico quebra quando o RLS ligar.
const JURIDICO_ORIGIN = 'https://falcaovaz.netlify.app';

async function _enviarTokenJuridico(alvo){
  try {
    await renovarSessaoSupabase();
    const s = _authCarregarSessao();
    const ok = s && s.access_token && Date.now() < (s.expires_at||0);
    // Responde SEMPRE (token null quando não há sessão) — o jurídico
    // espera a resposta antes do SSO e não pode ficar pendurado.
    alvo.postMessage({
      type: 'nsp-token',
      access_token: ok ? s.access_token : null,
      expires_at:   ok ? s.expires_at   : 0
    }, JURIDICO_ORIGIN);
  } catch(_) {}
}

window.addEventListener('message', function(ev){
  if (ev.origin !== JURIDICO_ORIGIN) return;
  if (ev.data && ev.data.type === 'nsp-token-request' && ev.source) {
    _enviarTokenJuridico(ev.source);
  }
});

const db={
  async get(t,q=''){
    const r=await fetch(SBU+'/rest/v1/'+t+q,{headers:hdr()});
    const body=await r.json();
    if(!r.ok){
      console.error('Supabase error:',r.status,JSON.stringify(body));
      throw new Error(body.message||body.hint||JSON.stringify(body));
    }
    console.log(`db.get(${t}): ${Array.isArray(body)?body.length+' registros':JSON.stringify(body).substring(0,100)}`);
    return body;
  },
  async post(t,d){const r=await fetch(SBU+'/rest/v1/'+t,{method:'POST',headers:hdr(),body:JSON.stringify(d)});if(!r.ok){const b=await r.json();throw new Error(b.message||JSON.stringify(b));}return r.json();},
  async patch(t,id,d){const r=await fetch(SBU+'/rest/v1/'+t+'?id=eq.'+id,{method:'PATCH',headers:hdr(),body:JSON.stringify(d)});if(!r.ok){const b=await r.json();throw new Error(b.message||JSON.stringify(b));}return r.json();},
  async del(t,id){const r=await fetch(SBU+'/rest/v1/'+t+'?id=eq.'+id,{method:'DELETE',headers:hdr()});return r.ok;}
};

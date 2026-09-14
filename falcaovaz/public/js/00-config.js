// ═══════════════════════════════════════════════════
// EMPRESA — dados institucionais injetados nos documentos gerados pela IA
// ═══════════════════════════════════════════════════
const EMPRESA_DADOS = {
  razao_social: 'Organização Imobiliária Nova São Paulo Ltda',
  cnpj:         '62.407.218/0001-12',
  endereco:     'Av. Jabaquara, 1947, Saúde, São Paulo/SP',
  cidade:       'São Paulo/SP'
};

// ═══════════════════════════════════════════════════
// SUPABASE — CONFIGURAÇÃO
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://mqcduyvpuxdweqesgwrq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xY2R1eXZwdXhkd2VxZXNnd3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzE5OTcsImV4cCI6MjA5MzQwNzk5N30.QdpRZRxnYF6GTh13wdTNqZTQ-9ztY3veef62mfGRphE';

// URL do Apps Script de envio de email do juridico (substitui Resend).
// Crie o Web App seguindo o codigo em falcaovaz/gas/email-juridico.gs e cole a URL aqui.
const GAS_EMAIL_JURIDICO = 'https://script.google.com/macros/s/AKfycbw6QlYrbYAlM4TFLvX92j5d19WUHHYrN-ykiGp1Umxu4qb8MzjV7oJVixkM4EFqBQqGqw/exec';

const DB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// Camada de acesso ao banco.
// db.lastError guarda a ultima mensagem real do PostgREST (corpo + status).
// Funcoes de save leem isso pra mostrar o motivo no toast.
const db = {
  lastError: null,
  _registrarErro(tabela, op, e) {
    const msg = (e && e.message) ? e.message : String(e);
    this.lastError = msg;
    console.error(`db.${op}(${tabela}):`, msg);
  },
  async get(tabela, params = '') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${params}`, { headers: DB_HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      this.lastError = null;
      return await r.json();
    } catch (e) { this._registrarErro(tabela, 'get', e); return []; }
  },
  async insert(tabela, dados) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
        method: 'POST', headers: DB_HEADERS, body: JSON.stringify(dados)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      this.lastError = null;
      return await r.json();
    } catch (e) { this._registrarErro(tabela, 'insert', e); return null; }
  },
  async update(tabela, id, dados) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, {
        method: 'PATCH', headers: DB_HEADERS, body: JSON.stringify(dados)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      this.lastError = null;
      return await r.json();
    } catch (e) { this._registrarErro(tabela, 'update', e); return null; }
  },
  async delete(tabela, id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, {
        method: 'DELETE', headers: DB_HEADERS
      });
      if (!r.ok) throw new Error(await r.text());
      return true;
    } catch (e) { console.error(`db.delete(${tabela}):`, e); return false; }
  },
  async deleteWhere(tabela, params) {
    // params deve comecar com '?' ja com filtros PostgREST, ex: '?processo_id=eq.123'
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${params}`, {
        method: 'DELETE', headers: DB_HEADERS
      });
      if (!r.ok) throw new Error(await r.text());
      return true;
    } catch (e) { console.error(`db.deleteWhere(${tabela}):`, e); return false; }
  }
};

// ═══════════════════════════════════════════════════
// DADOS LOCAIS (fallback enquanto carrega do banco)
// ═══════════════════════════════════════════════════
// ─── DADOS ───────────────────────────────────────────────
const USERS = {
  rodrigo:    { name: 'Rodrigo Falcão Vaz',  short: 'Rodrigo', level: 1, quota: 500000, used: 0,  admin: true,  judicial: true  },
  fernanda:   { name: 'Fernanda Araujo',      short: 'Fernanda', level: 1, quota: 500000, used: 0, admin: false, judicial: true  },
  renata:     { name: 'Renata Navarro',       short: 'Renata',  level: 1, quota: 500000, used: 0,  admin: false, judicial: true  },
  edna:       { name: 'Edna Rebesco',         short: 'Edna',    level: 1, quota: 500000, used: 0,  admin: false, judicial: true  },
  durval:     { name: 'Durval Falcão Vaz',    short: 'Durval',  level: 1, quota: 500000, used: 0,  admin: false, judicial: true  },
  simone:     { name: 'Simone Cirino',        short: 'Simone',  level: 2, quota: 200000, used: 0,  admin: false, judicial: false },
  janaina:    { name: 'Janaina Alves',        short: 'Janaina', level: 1, quota: 500000, used: 0,  admin: false, judicial: true  },
  mikaeli:    { name: 'Mikaeli',              short: 'Mikaeli', level: 2, quota: 200000, used: 0,  admin: false, judicial: false },
  vanderleia: { name: 'Vanderleia',           short: 'Vander',  level: 2, quota: 200000, used: 0,   admin: false, judicial: false },
  christiane: { name: 'Christiane',           short: 'Chris',   level: 3, quota: 100000, used: 0,  admin: false, judicial: false },
  felippe:    { name: 'Felippe',              short: 'Felippe', level: 3, quota: 100000, used: 0,   admin: false, judicial: false },
  emilia:     { name: 'Emilia',              short: 'Emilia',  level: 3, quota: 100000, used: 0,  admin: false, judicial: false },
  regina:     { name: 'Regina',              short: 'Regina',  level: 3, quota: 100000, used: 0,   admin: false, judicial: false },
  thais:      { name: 'Thais',               short: 'Thais',   level: 3, quota: 100000, used: 0,  admin: false, judicial: false },
  vivian:     { name: 'Vivian',              short: 'Vivian',    level: 2, quota: 200000, used: 0,  admin: false, judicial: false },
  joaomarcus: { name: 'João Marcus',         short: 'João M.',   level: 2, quota: 200000, used: 0,      admin: false, judicial: false },
  nogueira:   { name: 'Nogueira',            short: 'Nogueira',  level: 2, quota: 200000, used: 0,      admin: false, judicial: false },
};

let currentUser = null;

// ═══════════════════════════════════════════════════
// TOKEN DO PORTAL — sessao autenticada compartilhada
// ---------------------------------------------------
// O jurídico nao tem login com senha: quem autentica e o portal.
// O portal manda o access_token (1h) por postMessage (iframe) ou
// no hash da URL (aba separada). O token entra no Authorization de
// TODAS as requisicoes (o db.* e os fetch diretos usam DB_HEADERS,
// que e mutado aqui). Sem token, segue a chave anonima — que deixa
// de funcionar quando o RLS for ativado no banco.
// ═══════════════════════════════════════════════════
const PORTAL_ORIGIN = 'https://novasp.netlify.app';
let _tokenPortal = null;
let _tokenPortalExp = 0;
let _tokenPortalRespondido = false;   // o portal respondeu (mesmo que sem sessao)

function aplicarTokenPortal(tok, exp){
  _tokenPortalRespondido = true;
  if (!tok) return;
  _tokenPortal = tok;
  _tokenPortalExp = exp || (Date.now() + 55*60*1000);
  DB_HEADERS['Authorization'] = 'Bearer ' + tok;
  console.log('[auth] token do portal aplicado (expira', new Date(_tokenPortalExp).toLocaleTimeString(), ')');
}

window.addEventListener('message', function(ev){
  if (ev.origin !== PORTAL_ORIGIN) return;
  if (ev.data && ev.data.type === 'nsp-token') {
    aplicarTokenPortal(ev.data.access_token, ev.data.expires_at);
  }
});

// Aba separada: token vem no hash (#at=...&exp=...) — le e limpa da URL.
(function(){
  const m = (location.hash||'').match(/at=([^&]+)/);
  if (m) {
    const e = (location.hash||'').match(/exp=(\d+)/);
    aplicarTokenPortal(decodeURIComponent(m[1]), e ? parseInt(e[1],10) : 0);
    history.replaceState({}, '', location.pathname + location.search);
  }
})();

// Renovacao: dentro do iframe, pede token novo ao portal quando o atual
// esta a menos de 2min de vencer. Vencido sem renovacao (aba separada),
// volta pra chave anonima em vez de mandar token morto.
setInterval(function(){
  if (!_tokenPortal) return;
  const resta = _tokenPortalExp - Date.now();
  if (window.parent !== window && resta < 120000) {
    try { window.parent.postMessage({type:'nsp-token-request'}, PORTAL_ORIGIN); } catch(_) {}
  }
  if (resta <= 0) {
    _tokenPortal = null;
    DB_HEADERS['Authorization'] = 'Bearer ' + SUPABASE_KEY;
    console.warn('[auth] token do portal expirou — voltando pra chave anonima');
  }
}, 60000);

// Espera a resposta do portal antes da primeira consulta (SSO). No
// iframe o portal responde em milissegundos; fora dele resolve direto.
function esperarTokenPortal(timeoutMs){
  if (window.parent === window || _tokenPortalRespondido) return Promise.resolve();
  try { window.parent.postMessage({type:'nsp-token-request'}, PORTAL_ORIGIN); } catch(_) {}
  return new Promise(function(res){
    const t0 = Date.now();
    const iv = setInterval(function(){
      if (_tokenPortalRespondido || Date.now() - t0 > (timeoutMs||2500)) { clearInterval(iv); res(); }
    }, 50);
  });
}


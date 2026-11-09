// Bússola NSP no portal — substitui o "@netlify/blobs" (09/11/2026).
// Mesma interface usada pelo código delas (getStore → get/set/setJSON/delete/list), gravando na tabela
// bussola_blobs do Supabase do portal com o login de quem está usando (regras de acesso no banco).
const P = () => window.parent.BussolaPortal;   // ponte do portal (js/25-bussola.js): usuario(), cabecalhos(), SBU

function cab(extra) {
  const h = Object.assign({}, P().cabecalhos(), extra || {});
  delete h.Prefer; return h;
}
async function rest(caminho, opts = {}) {
  const r = await fetch(P().SBU + '/rest/v1/' + caminho, Object.assign({}, opts, { headers: cab(opts.headers) }));
  if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.message || j.hint || JSON.stringify(j); } catch (_) {} throw new Error(m || 'HTTP ' + r.status); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const enc = encodeURIComponent;

export function getStore({ name }) {
  const loja = String(name);
  return {
    async get(chave, { type } = {}) {
      const rows = await rest(`bussola_blobs?select=valor&loja=eq.${enc(loja)}&chave=eq.${enc(chave)}&limit=1`);
      if (!rows || !rows.length || rows[0].valor == null) return null;
      if (type === 'json') { try { return JSON.parse(rows[0].valor); } catch (_) { return null; } }
      return rows[0].valor;
    },
    async set(chave, texto) {
      const corpo = JSON.stringify({ loja, chave, valor: String(texto), atualizado_em: new Date().toISOString() });
      // auditoria só aceita inclusão (chave sempre nova); o resto grava ou substitui
      if (loja === 'radar-auditoria') return void await rest('bussola_blobs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: corpo });
      await rest('bussola_blobs?on_conflict=loja,chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: corpo });
    },
    async setJSON(chave, obj) { return this.set(chave, JSON.stringify(obj)); },
    async delete(chave) { await rest(`bussola_blobs?loja=eq.${enc(loja)}&chave=eq.${enc(chave)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    async list({ prefix = '' } = {}) {
      // like do PostgREST: * = qualquer coisa; "_" e "%" da chave são escapados
      const padrao = prefix.replace(/[\\%_*]/g, m => '\\' + m) + '*';
      const blobs = []; const PAG = 1000;
      for (let de = 0; ; de += PAG) {
        const rows = await rest(`bussola_blobs?select=chave&loja=eq.${enc(loja)}&chave=like.${enc(padrao)}&order=chave.asc&offset=${de}&limit=${PAG}`);
        (rows || []).forEach(r => { if (r.chave.startsWith(prefix)) blobs.push({ key: r.chave }); });
        if (!rows || rows.length < PAG) break;
      }
      return { blobs };
    }
  };
}

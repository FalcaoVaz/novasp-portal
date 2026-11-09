// Bússola NSP no portal — substitui o netlify/functions/auth.mjs delas (09/11/2026).
// Quem está usando é quem entrou no portal (CUR); papel admin = administrador do portal.
// Cadastro, senha e aprovação de pessoas ficam com o portal: o teste é liberado pela tabela bussola_acesso.
import { getStore } from '@netlify/blobs';

export const DOMINIO = 'novasaopaulo.com.br';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function usuarioPortal() {
  let cur = null; try { const ponte = window.parent !== window ? window.parent.BussolaPortal : null; cur = ponte ? ponte.usuario() : null; } catch (_) {}
  if (!cur || !cur.email) return null;
  return { id: String(cur.id), nome: cur.nome || cur.email, email: String(cur.email).toLowerCase(), papel: cur.admin ? 'admin' : 'corretor', status: 'ativo' };
}
const publico = u => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, status: u.status });

export async function usuarioDaSessao() { return usuarioPortal(); }
export function origemValida() { return true; }

export async function auditar(usuario, tipo, descricao, extra = {}) {
  try {
    const iso = new Date().toISOString();
    const uid = usuario?.id || (usuario === 'sistema' ? 'sistema' : 'anonimo');
    const t = String(tipo).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'outro';
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
    await getStore({ name: 'radar-auditoria' }).setJSON(`log/${iso.slice(0, 7)}/${iso}__${uid}__${t}__${rnd}`, {
      quando: iso, usuarioId: uid, nome: usuario?.nome || extra.nomeInformado || 'Não identificado',
      email: usuario?.email || extra.emailInformado || null, tipo: t, descricao: String(descricao).slice(0, 600), detalhes: extra.detalhes || null
    });
  } catch (e) { console.log('Falha ao registrar auditoria:', e.message); }
}

export default async (req) => {
  const u = usuarioPortal();
  if (req.method === 'GET') return u ? json({ ok: true, usuario: publico(u) }) : json({ ok: false, erro: 'Não conectado.' }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'sair') {
    if (u) await auditar(u, 'logout', 'Saiu da Bússola (voltou ao portal).');
    try { window.parent.goTo('vendas-home'); } catch (_) {}
    return json({ ok: true });
  }
  if (!u) return json({ ok: false, erro: 'Abra a Bússola pelo portal da Nova São Paulo.' }, 401);
  return json({ ok: false, erro: 'No portal, o acesso é o login do portal. Senhas e liberação de pessoas são feitas pelo portal (administrador).' }, 400);
};

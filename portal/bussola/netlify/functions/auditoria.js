// Consulta do log de auditoria (só administradores) e registro de ações feitas no navegador.
// O usuário e o horário são sempre carimbados pelo servidor a partir do login: ninguém registra em nome de outra pessoa,
// e não existe rota para alterar ou apagar registros.
import { getStore } from "@netlify/blobs";
import { usuarioDaSessao, origemValida, auditar } from "./auth.mjs";

export const config = { path: "/api/auditoria" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// ações que só acontecem no navegador e podem ser registradas por ele
const TIPOS_CLIENTE = {
  "busca-oportunidades": "Buscou oportunidades",
  "busca-codigo": "Buscou imóvel pelo código",
  "busca-endereco": "Buscou imóvel pelo endereço",
  "analise-manual": "Fez análise com dados preenchidos à mão",
  "analise-catalogo": "Abriu análise de imóvel do catálogo",
  "relatorio-pdf": "Gerou relatório em PDF",
  "compartilhar-link": "Copiou link de análise",
  "compartilhar-whatsapp": "Enviou análise pelo WhatsApp",
  "comparar": "Comparou imóveis",
  "premissas": "Alterou premissas do cálculo",
};

export default async (req) => {
  if (!origemValida(req)) return json({ ok: false, erro: "Origem não permitida." }, 403);
  const u = await usuarioDaSessao(req);
  if (!u) return json({ ok: false, erro: "Entre com seu e-mail e senha.", login: true }, 401);
  try {
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!TIPOS_CLIENTE[b.tipo]) return json({ ok: false, erro: "Tipo de ação não permitido." }, 400);
      const detalhe = String(b.detalhe || "").replace(/[<>]/g, "").slice(0, 400);
      await auditar(u, b.tipo, `${TIPOS_CLIENTE[b.tipo]}${detalhe ? ": " + detalhe : ""}.`);
      return json({ ok: true });
    }
    if (req.method !== "GET") return json({ ok: false, erro: "Registros de auditoria não podem ser alterados nem apagados." }, 405);
    if (u.papel !== "admin") return json({ ok: false, erro: "Só administradores consultam a auditoria." }, 403);
    const q = new URL(req.url).searchParams;
    const mes = /^\d{4}-\d{2}$/.test(q.get("mes") || "") ? q.get("mes") : new Date().toISOString().slice(0, 7);
    const usuario = q.get("usuario") || "", tipo = q.get("tipo") || "";
    const pagina = Math.max(0, Number(q.get("pagina")) || 0), tamanho = Math.min(500, Math.max(10, Number(q.get("tamanho")) || 100));
    const store = getStore({ name: "radar-auditoria", consistency: "strong" });
    const { blobs } = await store.list({ prefix: `log/${mes}/` });
    let chaves = blobs.map((b) => b.key).sort().reverse(); // mais recentes primeiro
    if (usuario) chaves = chaves.filter((k) => k.split("__")[1] === usuario);
    if (tipo) { const ts = tipo.split("|"); chaves = chaves.filter((k) => { const t = k.split("__")[2] || ""; return ts.some((x) => t === x || t.startsWith(x + "-")); }); }
    const total = chaves.length;
    const fatia = chaves.slice(pagina * tamanho, (pagina + 1) * tamanho);
    const registros = (await Promise.all(fatia.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
    return json({ ok: true, mes, total, pagina, tamanho, registros });
  } catch (e) {
    return json({ ok: false, erro: "Não foi possível concluir: " + e.message }, 500);
  }
};

// Página pública de acompanhamento da venda para o CORRETOR (18/11/2026, pacote da Renata / motor 1.3).
// Endereço: https://falcaovaz.netlify.app/acompanhar/<token> (redirect no netlify.toml).
// Só leitura, sem login: mostra o resumo gravado pelo portal em preanalise_link_corretor.snapshot — etapas, tarefas,
// marcos e próximos prazos. Sem CPF, RG, valores, certidões nem dados de clientes. Link desativado ou inválido: 404.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dia = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const ST = { pendente: ['Pendente', '#475569', '#f1f5f9'], andamento: ['Em andamento', '#1d4ed8', '#eff6ff'], concluida: ['Concluída', '#047857', '#ecfdf5'],
             divergencia: ['Com divergência', '#b91c1c', '#fef2f2'] };

const pagina = (corpo, status = 200) => ({
  statusCode: status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
  body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Acompanhamento da venda · Nova São Paulo</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a}main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:19px;margin:6px 0 2px}.sub{color:#64748b;font-size:13px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-top:12px}
.fase{font-weight:700;font-size:15px;display:flex;justify-content:space-between;gap:8px}.t{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid #eef1f6;font-size:14px}
.b{font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap}.m{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #eef1f6;font-size:14px}
.logo{font-weight:800;color:#1e3a8a;font-size:14px;letter-spacing:.5px}</style></head><body><main>${corpo}
<p class="sub" style="text-align:center;margin-top:18px">Nova São Paulo Imobiliária · página só de leitura</p></main></body></html>`
});

exports.handler = async (event) => {
  const sbUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const service = process.env.SUPABASE_KEY || '';
  const qs = event.queryStringParameters || {};
  const token = String(qs.t || String(event.path || '').split('/').pop() || '').toLowerCase();
  const naoAchou = pagina('<div class="card"><b>Link inválido ou desativado.</b><p class="sub">Peça um link novo à equipe da Nova São Paulo.</p></div>', 404);
  if (!/^[0-9a-f-]{36}$/.test(token) || !service) return naoAchou;
  let linha = null;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/preanalise_link_corretor?token=eq.${token}&ativo=is.true&select=snapshot,atualizado_em&limit=1`,
      { headers: { apikey: service, Authorization: 'Bearer ' + service } });
    if (r.ok) [linha] = await r.json();
  } catch (e) { console.error('[acompanhar]', e.message); }
  if (!linha) return naoAchou;
  const s = linha.snapshot || {};
  const badge = st => { const [t, c, b] = ST[st] || ST.pendente; return `<span class="b" style="color:${c};background:${b}">${t}</span>`; };
  const fases = (s.fases || []).map(f => `<div class="card"><div class="fase"><span>${f.completa ? '✅ ' : ''}${esc(f.nome)}</span><span class="sub">${f.feitas}/${f.total}</span></div>
    ${(f.tarefas || []).map(t => `<div class="t"><span>${esc(t.nome)}</span>${badge(t.status)}</div>`).join('')}</div>`).join('');
  const marcos = (s.marcos || []).map(m => `<div class="m"><span>${esc(m.rotulo)}</span><b>${m.data ? dia(m.data) : '<span class="sub">—</span>'}</b></div>`).join('');
  const prazos = (s.prazos || []).map(p => `<div class="m"><span>${esc(p.titulo)}</span><b>${dia(p.data)}</b></div>`).join('');
  return pagina(`<div class="logo">NOVA SÃO PAULO</div><h1>${esc(s.titulo || 'Venda')}</h1>
    <div class="sub">${s.arquivada ? 'Venda concluída e arquivada.' : `Etapa atual: <b>${esc(s.etapa_atual || '—')}</b>`} · atualizado em ${dia(linha.atualizado_em)}</div>
    ${prazos ? `<div class="card"><div class="fase">📅 Próximos prazos</div>${prazos}</div>` : ''}
    ${marcos ? `<div class="card"><div class="fase">📍 Marcos</div>${marcos}</div>` : ''}
    ${fases}`);
};

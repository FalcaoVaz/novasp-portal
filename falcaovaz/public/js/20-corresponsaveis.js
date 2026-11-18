// ═══════════════════════════════════════════════════════════════
// MAIS DE UM ADVOGADO POR PROCESSO (18/11/2026)
// processos.responsavel_id continua sendo o responsável PRINCIPAL; processos.corresponsaveis (uuid[]) guarda os
// outros advogados (sql: portal/sql/2026-11-18-processos-corresponsaveis.sql).
// O processo entra na carteira de todos: filtro de advogado, relatório de andamentos e indicadores.
// ═══════════════════════════════════════════════════════════════
let _procAdvs = null;   // [{id, nome}] — advogados do jurídico (usuarios.judicial)

async function procAdvs() {
  if (_procAdvs) return _procAdvs;
  const r = await db.get('usuarios', '?select=id,nome&judicial=eq.true&ativo=eq.true&order=nome.asc');
  _procAdvs = Array.isArray(r) ? r : [];
  return _procAdvs;
}
const procNomeDe = id => ((_procAdvs || []).find(u => u.id === id) || {}).nome || '';

// nomes de todos os responsáveis (principal primeiro)
function procResponsaveis(p) {
  const out = [];
  if (p && p.responsavel && p.responsavel.nome) out.push(p.responsavel.nome);
  (p && Array.isArray(p.corresponsaveis) ? p.corresponsaveis : []).forEach(id => {
    const n = procNomeDe(id); if (n && !out.includes(n)) out.push(n);
  });
  return out;
}
// o processo é da carteira desse advogado? (principal ou corresponsável)
function procDoAdvogado(p, nome) {
  if (!nome) return true;
  return procResponsaveis(p).includes(nome);
}
function procDoAdvogadoId(p, id) {
  if (!id) return true;
  return p.responsavel_id === id || (Array.isArray(p.corresponsaveis) && p.corresponsaveis.includes(id));
}

// caixas "Outros advogados responsáveis" no formulário do processo
async function procCorrespRender(selecionados) {
  const box = document.getElementById('proc-corresp'); if (!box) return;
  const advs = await procAdvs(), sel = new Set(selecionados || []);
  box.innerHTML = advs.length
    ? advs.map(u => `<label style="display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13px;font-weight:400">
        <input type="checkbox" class="proc-corresp-cb" value="${u.id}" ${sel.has(u.id) ? 'checked' : ''}> ${String(u.nome).replace(/</g, '&lt;')}</label>`).join('')
    : '<span class="text-xs text-gray">Lista de advogados indisponível.</span>';
}
function procCorrespLer(principalId) {
  return [...document.querySelectorAll('.proc-corresp-cb:checked')].map(c => c.value).filter(id => id && id !== principalId);
}

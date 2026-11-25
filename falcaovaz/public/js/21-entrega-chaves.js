// ═══════════════════════════════════════════════════════════════
// ENTREGA DE CHAVES — acompanhamento pelo jurídico (25/11/2026), SÓ LEITURA.
// Mesmos processos do portal NovaSP (tabelas chaves_processos / chaves_andamentos; quem registra é a Vanderleia no portal).
// Destaques para o jurídico: débitos em aberto há mais de 30 dias da entrega, sinistro do seguro fiança fora do prazo
// (15 dias da entrega), caução não devolvida e reparos por conta do locatário.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const BASE = [['data_agendada', 'Agendamento'], ['data_entrega', 'Entrega das chaves'], ['data_vistoria', 'Vistoria'], ['data_liberacao', 'Chaves liberadas p/ locação']];
  const FINAIS = { 'Caução': [['data_debitos', 'Débitos quitados'], ['data_devolucao', 'Devolução da caução']],
    'Título de capitalização': [['data_resgate', 'Resgate do título'], ['data_debitos', 'Débitos quitados']],
    'Seguro fiança': [['data_sinistro', 'Entrada no sinistro', true], ['data_debitos', 'Débitos quitados']],
    'Fiador': [['data_debitos', 'Débitos quitados']] };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const br = s => { const d = D(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
  const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dias = s => { const d = D(s); return d ? Math.round((hoje() - d) / 864e5) : null; };
  const etapas = p => BASE.concat(FINAIS[p.tipo_fianca] || FINAIS['Fiador']);
  const encerrado = p => p.cancelado || etapas(p).every(([c, , o]) => o || p[c]);
  const atual = p => (etapas(p).find(([c, , o]) => !o && !p[c]) || [])[1] || (p.cancelado ? 'Cancelado' : 'Encerrado');

  // pontos de atenção jurídica
  function alertas(p) {
    if (p.cancelado) return [];
    const a = [], de = dias(p.data_entrega);
    if (de != null && !p.data_debitos && de > 30) a.push(`débitos em aberto há ${de} dias da entrega`);
    if (p.tipo_fianca === 'Seguro fiança' && de != null && !p.data_sinistro && !p.data_debitos && de > 15) a.push(`sinistro não aberto (${de - 15} dia(s) além do prazo)`);
    if (p.tipo_fianca === 'Caução' && p.data_debitos && !p.data_devolucao && dias(p.data_debitos) > 10) a.push(`caução não devolvida (${dias(p.data_debitos)} dias após os débitos)`);
    if (p.necessita_reparo === 'Sim' && p.responsavel_reparo === 'Locatário' && !encerrado(p)) a.push('reparo por conta do locatário');
    return a;
  }

  let _lista = [], _f = 'atencao', _q = '';
  async function carregar() {
    const el = document.getElementById('chv-lista'); if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:#94a3b8">Carregando…</div>';
    _lista = await db.get('chaves_processos', '?select=*&order=data_cadastro.desc&limit=5000');
    if (!Array.isArray(_lista) || (db.lastError && !_lista.length)) { el.innerHTML = `<div style="padding:20px;color:#b91c1c">Não consegui ler os processos${db.lastError ? ': ' + esc(db.lastError.slice(0, 120)) : ''}.</div>`; return; }
    render();
  }
  function filtrar(f) { _f = f; render(); }
  function buscar(v) { _q = v.toLowerCase(); render(); }
  function render() {
    const el = document.getElementById('chv-lista'); if (!el) return;
    const mes = new Date().toISOString().slice(0, 7);
    const L = _lista.filter(p => {
      if (_q) return [p.endereco, p.locador, p.locatario, p.protocolo, p.contrato_imoview].some(v => String(v || '').toLowerCase().includes(_q));
      if (_f === 'atencao') return alertas(p).length > 0;
      if (_f === 'andamento') return !encerrado(p);
      if (_f === 'mes') return String(p.data_entrega || p.data_agendada || p.data_cadastro || '').slice(0, 7) === mes;
      if (_f === 'encerrados') return encerrado(p);
      return true;
    });
    const nAt = _lista.filter(p => alertas(p).length).length, nAnd = _lista.filter(p => !encerrado(p)).length;
    const chip = (k, l) => `<button class="btn ${_f === k ? 'btn-primary' : 'btn-outline'} btn-sm" style="width:auto;flex:0 0 auto" onclick="EntregaChavesJur.filtrar('${k}')">${l}</button>`;
    el.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        ${chip('atencao', `⚠️ Atenção jurídica (${nAt})`)}${chip('andamento', `Em andamento (${nAnd})`)}${chip('mes', 'Este mês')}${chip('encerrados', 'Encerrados')}${chip('todos', 'Todos')}
        <input style="max-width:280px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;flex:1" placeholder="Buscar endereço, pessoa, protocolo ou contrato" value="${esc(_q)}" oninput="EntregaChavesJur.buscar(this.value)"></div>
      <div class="table-wrap"><table><thead><tr><th>Imóvel</th><th>Locatário</th><th>Garantia</th><th>Etapa atual</th><th>Entrega</th><th>Atenção</th></tr></thead><tbody>
      ${L.length ? L.map(p => { const a = alertas(p); return `<tr style="cursor:pointer" onclick="EntregaChavesJur.detalhe('${esc(p.protocolo)}')"><td><b>${esc(p.endereco || '—')}</b><br><small style="color:#64748b">${esc(p.protocolo)}${p.contrato_imoview ? ' · contrato ' + p.contrato_imoview : ''}</small></td>
        <td>${esc(p.locatario)}</td><td>${esc(p.tipo_fianca)}</td><td>${esc(atual(p))}</td><td>${br(p.data_entrega)}</td><td style="color:#b91c1c;font-size:12px">${a.map(esc).join('<br>')}</td></tr>`; }).join('')
        : '<tr><td colspan="6" style="padding:18px;color:#94a3b8">Nenhum processo neste filtro.</td></tr>'}</tbody></table></div>
      <div style="font-size:12px;color:#64748b;margin-top:8px">Só leitura. Os processos são registrados pela equipe de entrega de chaves no portal NovaSP (Interno → Entrega de Chaves).</div>`;
  }
  async function detalhe(proto) {
    const p = _lista.find(x => x.protocolo === proto); if (!p) return;
    const old = document.getElementById('chv-det'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'chv-det';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const a = alertas(p);
    ov.innerHTML = `<div style="background:#fff;border-radius:12px;max-width:720px;width:100%;max-height:90vh;overflow:auto;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;gap:10px"><h3 style="margin:0">🔑 ${esc(p.endereco || p.protocolo)}</h3><button class="btn btn-outline btn-sm" onclick="document.getElementById('chv-det').remove()">Fechar</button></div>
      <div style="font-size:12px;color:#64748b;margin:4px 0 10px">${esc(p.protocolo)}${p.contrato_imoview ? ' · contrato Imoview ' + p.contrato_imoview : ''} · cadastrado em ${br(p.data_cadastro)} · responsável: ${esc(p.responsavel || '—')}${p.cancelado ? ' · <b>CANCELADO</b> ' + esc(p.motivo_cancelamento || '') : ''}</div>
      ${a.length ? `<div style="background:#fef2f2;color:#b91c1c;border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:10px">⚠️ ${a.map(esc).join(' · ')}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px">
        <div><small style="color:#64748b">Locador</small><br>${esc(p.locador || '—')}<br><small>${esc(p.email_locador || '')}</small></div>
        <div><small style="color:#64748b">Locatário</small><br>${esc(p.locatario || '—')}<br><small>${esc(p.email_locatario || '')}</small></div>
        <div><small style="color:#64748b">Garantia</small><br>${esc(p.tipo_fianca || '—')}</div>
        <div><small style="color:#64748b">Vistoria</small><br>${p.necessita_reparo === 'Sim' ? 'Com reparos' + (p.descricao_reparo ? ': ' + esc(p.descricao_reparo) : '') + (p.valor_reparo ? ' · ' + esc(p.valor_reparo) : '') + (p.responsavel_reparo ? ' · por conta de ' + esc(p.responsavel_reparo) : '') : p.necessita_reparo === 'Não' ? 'Sem reparos' : '—'}</div>
      </div>
      ${p.observacoes ? `<div style="font-size:13px;margin-top:8px"><b>Observações:</b> ${esc(p.observacoes)}</div>` : ''}
      <h4 style="margin:14px 0 4px">Etapas</h4>
      ${etapas(p).map(([c, l, o]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px"><span>${p[c] ? '✅' : '⬜'} ${esc(l)}${o ? ' <small style="color:#64748b">(se houver débito)</small>' : ''}</span><b>${p[c] ? br(p[c]) : ''}</b></div>`).join('')}
      <h4 style="margin:14px 0 4px">Histórico</h4><div id="chv-hist" style="font-size:13px;color:#64748b">Carregando…</div></div>`;
    document.body.appendChild(ov);
    const h = await db.get('chaves_andamentos', `?select=em,etapa,mensagem,autor&protocolo=eq.${encodeURIComponent(proto)}&order=em.desc`);
    const el = ov.querySelector('#chv-hist'); if (!el) return;
    el.innerHTML = Array.isArray(h) && h.length ? h.map(x => `<div style="padding:6px 0;border-top:1px solid #f1f5f9"><b style="color:#1e293b">${esc(x.etapa || 'Atualização')}</b> · ${new Date(x.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${x.autor ? ' · ' + esc(x.autor) : ''}${x.mensagem ? '<br>' + esc(x.mensagem) : ''}</div>`).join('') : 'Sem registros.';
  }
  window.carregarEntregaChavesJur = carregar;
  window.EntregaChavesJur = { filtrar, buscar, detalhe, _t: { alertas, atual, encerrado } };
})();

// ════════════════════════════════════════════════════════
// ACORDOS EXTRAJUDICIAIS — Jurídico
// ════════════════════════════════════════════════════════

let _acordoEditId = null;

async function carregarAcordos() {
  const busca   = document.getElementById('filtro-acordo-busca')?.value?.toLowerCase() || '';
  const status  = document.getElementById('filtro-acordo-status')?.value ?? 'ativo';

  let query = '?select=*,responsavel:usuarios(nome),processo:processos(numero)&order=criado_em.desc&limit=200';
  if (status) query += `&status=eq.${status}`;

  const dados = await db.get('acordos_extrajudiciais', query);
  if (!dados) return;

  // KPIs (sempre conta o universo total — uma query rapida sem filtros)
  _atualizarKpisAcordos();

  let filtrados = dados;
  if (busca) {
    filtrados = filtrados.filter(a =>
      (a.proprietario||'').toLowerCase().includes(busca) ||
      (a.inquilino||'').toLowerCase().includes(busca) ||
      (a.situacao||'').toLowerCase().includes(busca) ||
      (a.contrato||'').toLowerCase().includes(busca)
    );
  }

  // Ordena: ativos por proximidade do dia de pagamento, demais por atualizado_em
  const hojeDia = new Date().getDate();
  filtrados.sort((a,b) => {
    if (a.status === 'ativo' && b.status !== 'ativo') return -1;
    if (b.status === 'ativo' && a.status !== 'ativo') return 1;
    if (a.status === 'ativo' && b.status === 'ativo') {
      const da = ((a.dia_pagamento||32) - hojeDia + 31) % 31;
      const db_ = ((b.dia_pagamento||32) - hojeDia + 31) % 31;
      return da - db_;
    }
    return String(b.atualizado_em||'').localeCompare(String(a.atualizado_em||''));
  });

  const tbody = document.getElementById('tbody-acordos');
  if (!tbody) return;
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-gray" style="text-align:center;padding:32px">Nenhum acordo encontrado.</td></tr>`;
    return;
  }

  const stMap = {
    ativo:        ['badge-green','Ativo'],
    concluido:    ['badge-blue','✅ Concluído'],
    rompido:      ['badge-red','💔 Rompido'],
    renegociado:  ['badge-amber','🔁 Renegociado']
  };

  tbody.innerHTML = filtrados.map(a => {
    const st = stMap[a.status] || ['badge-gray', a.status||'—'];
    const pagas = Number(a.parcelas_pagas||0);
    const total = Number(a.parcelas_total||0);
    const pct = total ? Math.round(pagas/total*100) : 0;
    const remaining = Math.max(0, total - pagas);
    const proximoDiff = _diasParaDia(a.dia_pagamento);
    const sit = (a.situacao||'').replace(/'/g,'').substring(0,55);
    const isConcl = a.status === 'concluido';
    const isRomp  = a.status === 'rompido';
    const trStyle = (isConcl || isRomp) ? 'opacity:.6;background:var(--gray-50)' : '';
    const proxLabel = a.status === 'ativo' && a.dia_pagamento
      ? (proximoDiff===0 ? '<span class="badge badge-amber" style="font-size:9px;margin-left:4px">hoje</span>'
        : proximoDiff<=3 ? `<span class="badge badge-amber" style="font-size:9px;margin-left:4px">em ${proximoDiff}d</span>`
        : '')
      : '';
    return `<tr style="${trStyle}">
      <td><div class="text-xs">${a.proprietario||'—'}</div></td>
      <td>
        <div class="text-xs font-semibold">${a.inquilino||'—'}</div>
        ${a.contrato ? `<div class="text-xs text-gray">Contrato ${a.contrato}</div>` : ''}
      </td>
      <td style="text-align:center">
        <div class="font-semibold">${a.dia_pagamento || '—'}</div>
        ${proxLabel}
      </td>
      <td>
        <div class="text-xs font-semibold">${pagas} / ${total}</div>
        <div style="background:var(--gray-100);height:6px;border-radius:3px;overflow:hidden;margin-top:3px;width:80px">
          <div style="background:${pct>=100?'var(--green)':'var(--blue-500,#3b82f6)'};width:${pct}%;height:100%"></div>
        </div>
        <div class="text-xs text-gray" style="margin-top:2px">${remaining} restam</div>
      </td>
      <td class="text-xs">${sit || '—'}</td>
      <td><span class="badge ${st[0]}">${st[1]}</span></td>
      <td><div class="flex gap-1">
        ${a.status === 'ativo' ? `<button class="btn btn-xs btn-primary" onclick="registrarParcela('${a.id}')" title="Registrar parcela paga">💰 +1</button>` : ''}
        <button class="btn btn-xs btn-outline" onclick="abrirEditarAcordo('${a.id}')" title="Editar">✏️</button>
        <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirAcordo('${a.id}','${(a.inquilino||'').replace(/'/g,'')}')" title="Excluir">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

// Quantos dias faltam ate o proximo dia X do mes (proprio mes ou mes seguinte)
function _diasParaDia(dia) {
  if (!dia) return null;
  const hoje = new Date();
  const d = hoje.getDate();
  if (d <= dia) return dia - d;
  // proximo mes
  const ultimoDiaEsteM = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();
  return (ultimoDiaEsteM - d) + dia;
}

async function _atualizarKpisAcordos() {
  const todos = await db.get('acordos_extrajudiciais', '?select=status,dia_pagamento&limit=1000');
  if (!todos) return;
  let ativos=0, concl=0, romp=0, prox=0;
  for (const a of todos) {
    if (a.status === 'ativo') {
      ativos++;
      const diff = _diasParaDia(a.dia_pagamento);
      if (diff !== null && diff <= 3) prox++;
    } else if (a.status === 'concluido') concl++;
    else if (a.status === 'rompido')    romp++;
  }
  setText('kpi-acordo-ativos', ativos);
  setText('kpi-acordo-concl', concl);
  setText('kpi-acordo-romp', romp);
  setText('kpi-acordo-prox', prox);
}
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function abrirNovoAcordo() {
  _acordoEditId = null;
  const t = document.getElementById('modal-acordo-titulo');
  if (t) t.textContent = '+ Novo Acordo Extrajudicial';
  ['acordo-proprietario','acordo-inquilino','acordo-contrato','acordo-dia-pgto',
   'acordo-pagas','acordo-total','acordo-valor','acordo-situacao','acordo-obs']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'acordo-pagas' ? '0' : ''; });
  const sel = document.getElementById('acordo-status');
  if (sel) sel.value = 'ativo';
  openModal('modal-acordo');
}

async function abrirEditarAcordo(id) {
  try {
    const list = await db.get('acordos_extrajudiciais', `?id=eq.${id}&select=*`);
    const a = list?.[0];
    if (!a) { showToast('⚠️ Acordo não encontrado.'); return; }
    _acordoEditId = id;
    const t = document.getElementById('modal-acordo-titulo');
    if (t) t.textContent = '✏️ Editar Acordo';
    document.getElementById('acordo-proprietario').value = a.proprietario || '';
    document.getElementById('acordo-inquilino').value    = a.inquilino || '';
    document.getElementById('acordo-contrato').value     = a.contrato || '';
    document.getElementById('acordo-dia-pgto').value     = a.dia_pagamento || '';
    document.getElementById('acordo-pagas').value        = a.parcelas_pagas ?? 0;
    document.getElementById('acordo-total').value        = a.parcelas_total || '';
    document.getElementById('acordo-valor').value        = a.valor_parcela != null
      ? Number(a.valor_parcela).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    document.getElementById('acordo-situacao').value     = a.situacao || '';
    document.getElementById('acordo-obs').value          = a.observacoes || '';
    document.getElementById('acordo-status').value       = a.status || 'ativo';
    openModal('modal-acordo');
  } catch(e) {
    showToast('⚠️ Erro ao abrir: ' + e.message);
  }
}

async function salvarAcordo() {
  const prop = document.getElementById('acordo-proprietario')?.value?.trim();
  const inq  = document.getElementById('acordo-inquilino')?.value?.trim();
  if (!prop || !inq) { showToast('⚠️ Preencha proprietário e inquilino.'); return; }

  const valorStr = (document.getElementById('acordo-valor')?.value || '').replace(/\./g,'').replace(',','.');
  const valor = parseFloat(valorStr);

  const payload = {
    proprietario:    prop,
    inquilino:       inq,
    contrato:        document.getElementById('acordo-contrato')?.value || null,
    dia_pagamento:   parseInt(document.getElementById('acordo-dia-pgto')?.value, 10) || null,
    parcelas_pagas:  parseInt(document.getElementById('acordo-pagas')?.value, 10) || 0,
    parcelas_total:  parseInt(document.getElementById('acordo-total')?.value, 10) || null,
    valor_parcela:   isNaN(valor) ? null : valor,
    situacao:        document.getElementById('acordo-situacao')?.value || null,
    observacoes:     document.getElementById('acordo-obs')?.value || null,
    status:          document.getElementById('acordo-status')?.value || 'ativo',
    responsavel_id:  currentUser.id
  };

  // Concluido automaticamente se pagou todas
  if (payload.parcelas_total && payload.parcelas_pagas >= payload.parcelas_total && payload.status === 'ativo') {
    payload.status = 'concluido';
  }

  try {
    if (_acordoEditId) {
      await db.update('acordos_extrajudiciais', _acordoEditId, payload);
      showToast('✅ Acordo atualizado!');
    } else {
      const novo = await db.insert('acordos_extrajudiciais', payload);
      if (!novo) throw new Error('falha');
      showToast('✅ Acordo cadastrado!');
    }
    _acordoEditId = null;
    closeModal('modal-acordo');
    carregarAcordos();
  } catch(e) {
    showToast('⚠️ Erro ao salvar: ' + (e.message || ''));
  }
}

// Atalho "+1 parcela" — soma 1 em parcelas_pagas e atualiza
async function registrarParcela(id) {
  try {
    const list = await db.get('acordos_extrajudiciais', `?id=eq.${id}&select=parcelas_pagas,parcelas_total,inquilino`);
    const a = list?.[0];
    if (!a) { showToast('⚠️ Acordo não encontrado.'); return; }
    const novasPagas = (a.parcelas_pagas||0) + 1;
    if (a.parcelas_total && novasPagas > a.parcelas_total) {
      showToast('⚠️ Acordo já está com todas as parcelas pagas.');
      return;
    }
    if (!confirm(`Registrar +1 parcela paga para ${a.inquilino}?\nNovo: ${novasPagas} de ${a.parcelas_total || '—'}`)) return;
    const upd = { parcelas_pagas: novasPagas };
    if (a.parcelas_total && novasPagas >= a.parcelas_total) {
      upd.status = 'concluido';
      showToast('🎉 Acordo concluído!');
    } else {
      showToast(`✅ Parcela registrada (${novasPagas}/${a.parcelas_total||'—'}).`);
    }
    await db.update('acordos_extrajudiciais', id, upd);
    carregarAcordos();
  } catch(e) {
    showToast('⚠️ Erro: ' + e.message);
  }
}

async function excluirAcordo(id, inquilino) {
  if (!confirm(`Excluir acordo com "${inquilino}"? Esta ação não pode ser desfeita.`)) return;
  const ok = await db.delete('acordos_extrajudiciais', id);
  if (ok) {
    showToast('🗑️ Acordo excluído.');
    carregarAcordos();
  } else {
    showToast('⚠️ Erro ao excluir.');
  }
}

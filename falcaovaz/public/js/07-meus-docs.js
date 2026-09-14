async function carregarMeusDocumentos() {
  if (!currentUser?.id) return;
  const tbody = document.getElementById('tbody-doc-unificado');
  if (!tbody) return;

  const filtStatus = document.getElementById('filt-doc-status')?.value || '';
  const filtBusca  = (document.getElementById('filt-doc-busca')?.value || '').trim().toLowerCase();

  let query = `?autor_id=eq.${currentUser.id}&order=criado_em.desc&limit=200`;
  if (filtStatus) query += `&status=eq.${filtStatus}`;

  const docs = await db.get('documentos', query) || [];

  // Filtro textual (busca por protocolo, tipo ou referencia)
  const filtrados = filtBusca
    ? docs.filter(d => (
        (d.protocolo||'').toLowerCase().includes(filtBusca) ||
        (d.tipo||'').toLowerCase().includes(filtBusca) ||
        (d.referencia||'').toLowerCase().includes(filtBusca)
      ))
    : docs;

  const statusInfo = {
    rascunho:              {cls:'badge-gray',  lb:'✏️ Rascunho'},
    aguardando_aprovacao:  {cls:'badge-amber', lb:'⏳ Aguardando'},
    em_revisao:            {cls:'badge-blue',  lb:'👁️ Em revisão'},
    aprovado:              {cls:'badge-green', lb:'✅ Aprovado'},
    devolvido:             {cls:'badge-red',   lb:'↩️ Devolvido'},
    reprovado:             {cls:'badge-red',   lb:'🚫 Reprovado'}
  };

  // Origem: se tem conteudo e tokens_usados > 0, foi gerado por IA. Senao anexado.
  const origemBadge = d => (d.tokens_usados||0) > 0
    ? '<span class="badge badge-blue" title="Gerado com IA">✨ IA</span>'
    : '<span class="badge badge-gray" title="Anexado pronto">📎 Anexo</span>';

  const acoesPor = d => {
    const proto = (d.protocolo||'').replace(/'/g,"\\'");
    const btns = [`<button class="btn btn-xs btn-outline" onclick="verDocumento('${d.id}')" title="Ver">👁️</button>`];
    if (d.status === 'rascunho') {
      btns.push(`<button class="btn btn-xs btn-primary" onclick="docEmRevisaoId='${d.id}';docGeradoId='${d.id}';openModal('modal-enviar-revisao')" title="Enviar para revisão">📤</button>`);
      btns.push(`<button class="btn btn-xs btn-outline" onclick="verDocumento('${d.id}');setTimeout(()=>baixarDocumentoPdf(),300)" title="Baixar PDF">📄</button>`);
      btns.push(`<button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirRascunho('${d.id}','${proto}')" title="Excluir">🗑️</button>`);
    } else if (d.status === 'aprovado') {
      btns.push(`<button class="btn btn-xs btn-outline" onclick="verDocumento('${d.id}');setTimeout(()=>baixarDocumentoPdf(),300)" title="Baixar PDF">📄</button>`);
    } else if (d.status === 'devolvido') {
      btns.push(`<button class="btn btn-xs btn-primary" onclick="docEmRevisaoId='${d.id}';docGeradoId='${d.id}';openModal('modal-enviar-revisao')" title="Reenviar">📤</button>`);
    }
    return btns.join(' ');
  };

  if (!filtrados.length) {
    const msg = filtStatus === 'rascunho'
      ? 'Nenhum rascunho ainda. Clique em <b>✨ Novo com IA</b> pra criar.'
      : filtStatus
      ? `Nenhum documento com status "${statusInfo[filtStatus]?.lb || filtStatus}".`
      : 'Nenhum documento ainda.';
    tbody.innerHTML = `<tr><td colspan="7" class="text-gray text-xs" style="text-align:center;padding:32px">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(d => {
    const si = statusInfo[d.status] || {cls:'badge-gray', lb:d.status||'—'};
    const dt = d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
    const tipoLbl = (d.tipo||'—').replace(/[^\w\sãáàéêíóôúç\/\-]/g,'').trim().substring(0,40) || '—';
    const refLbl = (d.referencia||'—').substring(0,45);
    return `<tr>
      <td><div class="font-semibold text-xs" style="font-family:monospace">${d.protocolo||'—'}</div></td>
      <td>${origemBadge(d)}</td>
      <td class="text-xs">${tipoLbl}</td>
      <td class="text-xs">${refLbl}</td>
      <td><span class="badge ${si.cls}">${si.lb}</span></td>
      <td class="text-xs text-gray">${dt}</td>
      <td><div class="flex gap-2">${acoesPor(d)}</div></td>
    </tr>`;
  }).join('');
}

// ─── EXCLUIR RASCUNHO ─────────────────────────────────────
async function excluirRascunho(id, protocolo) {
  if (!confirm(`Excluir rascunho ${protocolo}? Esta ação não pode ser desfeita.`)) return;
  const ok = await db.delete('documentos', id);
  if (ok) {
    showToast('🗑️ Rascunho excluído.');
    carregarMeusDocumentos();
    if (typeof carregarMeusDocsDashboard === 'function') carregarMeusDocsDashboard();
  } else {
    showToast('⚠️ Erro ao excluir.');
  }
}

// ─── SALVAR / EDITAR / EXCLUIR PROCESSO ───────────────────
let _processoEditId = null;

async function salvarProcesso() {
  const numero = document.getElementById('proc-numero')?.value?.trim();
  const tipo   = document.getElementById('proc-tipo')?.value;
  if (!numero || !tipo) { showToast('⚠️ Preencha o número e tipo do processo.'); return; }

  const respNome = document.getElementById('proc-responsavel')?.value || '';
  let respId = currentUser.id;
  if (respNome && respNome !== currentUser.name) {
    try {
      const u = await db.get('usuarios', `?nome=eq.${encodeURIComponent(respNome)}&select=id&limit=1`);
      if (u?.[0]?.id) respId = u[0].id;
    } catch(_){}
  }

  const valorStr = (document.getElementById('proc-valor')?.value || '').replace(/\./g,'').replace(',','.');
  const valor = parseFloat(valorStr);

  // Campos base que sempre existem na tabela processos
  const payload = {
    numero, tipo,
    vara: document.getElementById('proc-vara')?.value || null,
    fase: document.getElementById('proc-fase')?.value || null,
    autor: document.getElementById('proc-autor')?.value || null,
    reu: document.getElementById('proc-reu')?.value || null,
    responsavel_id: respId,
    valor_causa: isNaN(valor) ? null : valor,
    cliente_nome: document.getElementById('proc-cliente-nome')?.value || null,
    cliente_email: document.getElementById('proc-cliente-email')?.value || null,
    notificar_cliente: document.getElementById('proc-notificar')?.checked ?? true,
    status: document.getElementById('proc-status')?.value || 'ativo'
  };

  // Resiliencia: se o schema ainda nao tem as colunas cliente_*, retira
  // do payload e retenta. Detecta PGRST204 ("Could not find the X column").
  async function _tentarSalvar(p) {
    if (_processoEditId) return await db.update('processos', _processoEditId, p);
    return await db.insert('processos', p);
  }
  function _ehErroColunaInexistente(msg) {
    return /Could not find the .* column|PGRST204|schema cache/i.test(String(msg||''));
  }
  function _semCamposNovos(p) {
    const c = {...p};
    delete c.cliente_nome; delete c.cliente_email; delete c.notificar_cliente;
    return c;
  }

  try {
    let ok = await _tentarSalvar(payload);
    if (!ok && _ehErroColunaInexistente(db.lastError)) {
      // Schema antigo: retenta sem os campos novos
      console.warn('Schema sem cliente_*, retentando sem esses campos. Rode o SQL pra habilitar a feature.');
      ok = await _tentarSalvar(_semCamposNovos(payload));
    }
    if (!ok) throw new Error(db.lastError || 'falha');
    showToast(_processoEditId ? '✅ Processo atualizado!' : '✅ Processo cadastrado!');
    _processoEditId = null;
    closeModal('modal-processo');
    carregarProcessos();
  } catch(e) {
    showToast('⚠️ Erro ao salvar: ' + (e.message || ''));
  }
}

function abrirNovoProcesso() {
  _processoEditId = null;
  const t = document.getElementById('modal-processo-titulo'); if (t) t.textContent = '+ Novo Processo';
  ['proc-numero','proc-vara','proc-autor','proc-reu','proc-valor','proc-cliente-nome','proc-cliente-email']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['proc-tipo','proc-fase','proc-responsavel','proc-status']
    .forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
  const n = document.getElementById('proc-notificar'); if (n) n.checked = true;
  // pre-seleciona o responsavel = usuario logado, se estiver na lista
  const sel = document.getElementById('proc-responsavel');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].text === currentUser.name) { sel.selectedIndex = i; break; }
    }
  }
  openModal('modal-processo');
}

async function abrirEditarProcesso(id) {
  try {
    const list = await db.get('processos', `?id=eq.${id}&select=*,responsavel:usuarios(nome)`);
    const p = list?.[0];
    if (!p) { showToast('⚠️ Processo não encontrado.'); return; }
    _processoEditId = id;
    const t = document.getElementById('modal-processo-titulo'); if (t) t.textContent = '✏️ Editar Processo';
    document.getElementById('proc-numero').value = p.numero || '';
    document.getElementById('proc-tipo').value = p.tipo || 'Cível';
    document.getElementById('proc-vara').value = p.vara || '';
    document.getElementById('proc-fase').value = p.fase || 'Inicial';
    document.getElementById('proc-autor').value = p.autor || '';
    document.getElementById('proc-reu').value = p.reu || '';
    document.getElementById('proc-valor').value = p.valor_causa != null
      ? Number(p.valor_causa).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    document.getElementById('proc-cliente-nome').value = p.cliente_nome || '';
    document.getElementById('proc-cliente-email').value = p.cliente_email || '';
    document.getElementById('proc-notificar').checked = p.notificar_cliente !== false;
    document.getElementById('proc-status').value = p.status || 'ativo';
    const sel = document.getElementById('proc-responsavel');
    const respNome = p.responsavel?.nome;
    if (sel && respNome) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === respNome) { sel.selectedIndex = i; break; }
      }
    }
    openModal('modal-processo');
  } catch(e) {
    showToast('⚠️ Erro ao abrir: ' + e.message);
  }
}

async function excluirProcesso(id, numero) {
  if (!confirm(`Excluir processo ${numero || ''}?\n\nIsso vai apagar TAMBÉM todos os andamentos, prazos, documentos e lançamentos financeiros vinculados.\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    // Apaga dependências primeiro (caso não exista cascade)
    await db.deleteWhere?.('andamentos_processos', `?processo_id=eq.${id}`);
    await db.deleteWhere?.('prazos', `?processo_id=eq.${id}`);
    await db.deleteWhere?.('financeiro_processo', `?processo_id=eq.${id}`);
    await db.delete('processos', id);
    showToast('🗑️ Processo excluído.');
    carregarProcessos();
  } catch(e) {
    showToast('⚠️ Erro: ' + e.message + ' (talvez existam vínculos; remova andamentos/prazos antes)');
  }
}

// ─── SALVAR / EDITAR / CONCLUIR / EXCLUIR PRAZO ───────────
// id do prazo em edicao (null = novo)
let _prazoEditId = null;

async function salvarPrazo() {
  const vencimento = document.getElementById('prazo-data')?.value;
  const tipo       = document.getElementById('prazo-tipo')?.value;
  const referencia = document.getElementById('prazo-ref')?.value || '';
  const obs        = document.getElementById('prazo-obs')?.value || '';
  const respNome   = document.getElementById('prazo-resp')?.value || '';
  if (!vencimento || !tipo) { showToast('⚠️ Preencha o tipo e a data de vencimento.'); return; }

  // lookup do responsavel_id pelo nome
  let respId = currentUser.id;
  if (respNome && respNome !== currentUser.name) {
    try {
      const u = await db.get('usuarios', `?nome=eq.${encodeURIComponent(respNome)}&select=id&limit=1`);
      if (u?.[0]?.id) respId = u[0].id;
    } catch(_){}
  }

  const payload = {
    tipo, vencimento, referencia,
    observacoes: obs,
    responsavel_id: respId
  };

  try {
    if (_prazoEditId) {
      await db.update('prazos', _prazoEditId, payload);
      showToast('✅ Prazo atualizado!');
    } else {
      payload.concluido = false;
      const novo = await db.insert('prazos', payload);
      if (!novo) throw new Error('falha');
      showToast('✅ Prazo cadastrado!');
    }
    _prazoEditId = null;
    closeModal('modal-prazo');
    carregarPrazos();
  } catch(e) {
    showToast('⚠️ Erro ao salvar prazo.');
  }
}

function abrirNovoPrazo() {
  _prazoEditId = null;
  document.getElementById('modal-prazo-titulo').textContent = '+ Novo Prazo';
  ['prazo-ref','prazo-data','prazo-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sel = document.getElementById('prazo-tipo'); if (sel) sel.selectedIndex = 0;
  const r   = document.getElementById('prazo-resp'); if (r) r.value = currentUser.name;
  openModal('modal-prazo');
}

async function abrirEditarPrazo(id) {
  try {
    const list = await db.get('prazos', `?id=eq.${id}&select=*,responsavel:usuarios(nome)`);
    const p = list?.[0];
    if (!p) { showToast('⚠️ Prazo não encontrado.'); return; }
    _prazoEditId = id;
    document.getElementById('modal-prazo-titulo').textContent = '✏️ Editar Prazo';
    document.getElementById('prazo-ref').value  = p.referencia || '';
    document.getElementById('prazo-tipo').value = p.tipo || 'Contestação';
    document.getElementById('prazo-data').value = p.vencimento || '';
    document.getElementById('prazo-resp').value = p.responsavel?.nome || currentUser.name;
    document.getElementById('prazo-obs').value  = p.observacoes || '';
    openModal('modal-prazo');
  } catch(e) {
    showToast('⚠️ Erro ao abrir: ' + e.message);
  }
}

async function concluirPrazo(id, descricao) {
  if (!confirm(`Marcar prazo "${descricao || ''}" como concluído?`)) return;
  try {
    await db.update('prazos', id, { concluido: true });
    showToast('✅ Prazo concluído.');
    carregarPrazos();
  } catch(e) { showToast('⚠️ Erro: ' + e.message); }
}

async function excluirPrazo(id, descricao) {
  if (!confirm(`Excluir prazo "${descricao || ''}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.delete('prazos', id);
    showToast('🗑️ Prazo excluído.');
    carregarPrazos();
  } catch(e) { showToast('⚠️ Erro: ' + e.message); }
}

// ─── SALVAR CHAMADO ───────────────────────────────────────
const JURIDICO_NOMES = ['Rodrigo Falcão Vaz','Fernanda Araujo','Renata Navarro',
  'Edna Rebesco','Durval Falcão Vaz','Janaina Alves'];


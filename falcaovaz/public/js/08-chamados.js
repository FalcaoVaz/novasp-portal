async function abrirModalChamado() {
  // Qualquer pessoa pode abrir um chamado e escolher para quem direcionar
  const titEl = document.getElementById('chamado-modal-titulo');
  const subEl = document.getElementById('chamado-modal-sub');
  const lblEl = document.getElementById('chamado-dest-label');
  if (titEl) titEl.textContent = '🎫 Novo Chamado';
  if (subEl) subEl.textContent = 'Descreva sua necessidade e escolha para quem direcionar';
  if (lblEl) lblEl.textContent = 'Direcionar para';

  const sel = document.getElementById('chamado-dest-input');
  if (sel) {
    sel.innerHTML = '<option value="">— sem preferência —</option>';
    try {
      // Lista todos os usuários ativos — direciona para qualquer pessoa
      const users = await db.get('usuarios', '?select=nome&order=nome.asc');
      (users || [])
        .filter(x => x.nome && x.nome !== currentUser.name)
        .forEach(x => { sel.innerHTML += `<option>${x.nome}</option>`; });
    } catch (e) {
      // Fallback: lista fixa do time jurídico
      JURIDICO_NOMES.filter(n => n !== currentUser.name).forEach(n => {
        sel.innerHTML += `<option>${n}</option>`;
      });
    }
  }
  openModal('modal-chamado');
}

async function salvarChamado() {
  const titulo    = document.getElementById('chamado-titulo-input')?.value?.trim()
                 || document.querySelector('#modal-chamado input[type=text]')?.value?.trim();
  const descricao = document.getElementById('chamado-desc-input')?.value?.trim()
                 || document.querySelector('#modal-chamado textarea')?.value?.trim();
  const urgencia  = document.getElementById('chamado-urgencia-input')?.value || 'media';
  const dest      = document.getElementById('chamado-dest-input')?.value || '';
  if (!titulo) { showToast('⚠️ Preencha o título do chamado.'); return; }
  const protocolo = `JUR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const payload = { protocolo, titulo, descricao, urgencia, status: 'aberto' };
  if (currentUser.id) payload.solicitante_id = currentUser.id;
  if (dest && currentUser.id) {
    const destUser = await db.get('usuarios', `?nome=eq.${encodeURIComponent(dest)}&select=id&limit=1`);
    if (destUser?.[0]?.id) payload.responsavel_id = destUser[0].id;
  }
  const novo = await db.insert('chamados', payload);
  closeModal('modal-chamado');
  ['chamado-titulo-input','chamado-desc-input'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  if (novo) {
    showToast(`📨 Chamado ${protocolo} enviado!`);
    if (typeof carregarChamadosDash === 'function') carregarChamadosDash();
  } else {
    showToast('⚠️ Erro ao enviar chamado.');
  }
}

// ─── ATENDER CHAMADO (modal de detalhe) ──────────────────
let chamadoAtualId = null;

async function abrirChamadoDetalhe(id) {
  if (!id) return;
  chamadoAtualId = id;
  // Estado inicial
  document.getElementById('chamado-det-titulo').textContent = '📋 Chamado';
  document.getElementById('chamado-det-sub').textContent = 'Carregando...';
  document.getElementById('chamado-det-tit-curto').textContent = '—';
  document.getElementById('chamado-det-urgencia').textContent = '—';
  document.getElementById('chamado-det-descricao').textContent = '—';
  document.getElementById('chamado-det-resposta').value = '';
  openModal('modal-chamado-detalhe');

  const dados = await db.get('chamados',
    `?id=eq.${id}&select=*,solicitante:usuarios!chamados_solicitante_id_fkey(nome,nivel),responsavel:usuarios!chamados_responsavel_id_fkey(nome)`
  );
  if (!dados?.length) { showToast('⚠️ Chamado não encontrado.'); return; }
  const c = dados[0];

  const sol = c.solicitante?.nome || '—';
  const nivelLabel = c.solicitante?.nivel === 2 ? 'Adm' : c.solicitante?.nivel === 3 ? 'Vendas' : '—';
  const dt = c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  const urgLabel = c.urgencia === 'alta' ? 'Alta urgência' : c.urgencia === 'media' ? 'Média urgência' : 'Baixa urgência';
  const urgBadge = c.urgencia === 'alta' ? 'badge-red' : c.urgencia === 'media' ? 'badge-amber' : 'badge-blue';

  document.getElementById('chamado-det-titulo').textContent = `📋 ${c.protocolo || 'Chamado'}`;
  document.getElementById('chamado-det-sub').textContent = `Aberto por ${sol} (${nivelLabel}) · ${dt}`;
  document.getElementById('chamado-det-tit-curto').textContent = c.titulo || '—';
  const urgEl = document.getElementById('chamado-det-urgencia');
  urgEl.textContent = urgLabel;
  urgEl.className = `badge ${urgBadge}`;
  document.getElementById('chamado-det-descricao').textContent = c.descricao || '(sem descrição)';

  // Pré-seleciona o responsável se ja atribuido
  if (c.responsavel?.nome) {
    const sel = document.getElementById('atribuir-responsavel');
    if (sel) {
      for (const opt of sel.options) if (opt.value === c.responsavel.nome || opt.textContent === c.responsavel.nome) { opt.selected = true; break; }
    }
  }
}

async function salvarRespostaChamado() {
  if (!chamadoAtualId) { closeModal('modal-chamado-detalhe'); return; }
  const resp = document.getElementById('chamado-det-resposta')?.value?.trim() || '';
  const respNome = document.getElementById('atribuir-responsavel')?.value || '';
  const updates = { status: 'em_andamento' };
  if (resp) updates.resposta = resp;
  if (respNome && respNome !== '— selecione o responsável —') {
    const u = await db.get('usuarios', `?nome=eq.${encodeURIComponent(respNome)}&select=id&limit=1`);
    if (u?.[0]?.id) updates.responsavel_id = u[0].id;
  }
  const ok = await db.update('chamados', chamadoAtualId, updates);
  closeModal('modal-chamado-detalhe');
  showToast(ok ? '💬 Resposta salva.' : '⚠️ Erro ao salvar.');
  if (typeof carregarChamadosRecebidos === 'function') carregarChamadosRecebidos();
}

async function concluirChamado() {
  if (!chamadoAtualId) { closeModal('modal-chamado-detalhe'); return; }
  const resp = document.getElementById('chamado-det-resposta')?.value?.trim() || '';
  const updates = { status: 'concluido' };
  if (resp) updates.resposta = resp;
  const ok = await db.update('chamados', chamadoAtualId, updates);
  closeModal('modal-chamado-detalhe');
  showToast(ok ? '✅ Chamado concluído.' : '⚠️ Erro ao concluir.');
  if (typeof carregarChamadosRecebidos === 'function') carregarChamadosRecebidos();
}


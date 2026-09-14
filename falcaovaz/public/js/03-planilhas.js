function gerarPlanilha(tipo) {
  tipoPlanilhaAtual = tipo;
  document.getElementById('planilha-modal-titulo').textContent = `📊 ${tipo}`;
  document.getElementById('planilha-descricao').value = '';
  document.getElementById('planilha-processo').value = '';
  document.getElementById('planilha-preview-area').style.display = 'none';
  document.getElementById('planilha-generating').style.display = 'none';
  document.getElementById('btn-gerar-planilha').style.display = 'inline-flex';
  document.getElementById('btn-salvar-planilha').style.display = 'none';
  openModal('modal-planilha');
}

function executarGerarPlanilha() {
  const descricao = document.getElementById('planilha-descricao')?.value?.trim();
  if (!descricao) { alert('Descreva os dados para a planilha.'); return; }
  document.getElementById('planilha-generating').style.display = 'block';
  document.getElementById('planilha-preview-area').style.display = 'none';
  document.getElementById('btn-gerar-planilha').style.display = 'none';

  const payload = {
    tipo: tipoPlanilhaAtual,
    referencia: document.getElementById('planilha-processo')?.value || '',
    descricao,
    instrucoes_extras: 'Apresente o demonstrativo de forma estruturada e clara, com totais, subtotais e memória de cálculo detalhada.'
  };
  const arq = uploadData['planilha'];
  if (arq) {
    if (arq.tipo === 'texto') { payload.texto_arquivo = arq.texto; payload.nome_arquivo = arq.nome; }
    else { payload.arquivo_base64 = arq.base64; payload.arquivo_nome = arq.nome; }
  }

  fetch('/.netlify/functions/gerar-documento', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    document.getElementById('planilha-generating').style.display = 'none';
    if (data.erro) { alert('Erro: ' + data.erro); document.getElementById('btn-gerar-planilha').style.display='inline-flex'; return; }
    document.getElementById('planilha-preview-area').style.display = 'block';
    document.getElementById('planilha-preview').textContent = data.conteudo;
    document.getElementById('planilha-tokens').textContent = `${(data.tokens||0).toLocaleString('pt-BR')} tokens`;
    document.getElementById('btn-salvar-planilha').style.display = 'inline-flex';
  })
  .catch(e => {
    document.getElementById('planilha-generating').style.display = 'none';
    document.getElementById('btn-gerar-planilha').style.display = 'inline-flex';
    alert('Erro de conexão.');
  });
}

async function salvarPlanilha() {
  const conteudo = document.getElementById('planilha-preview')?.textContent;
  const ref = document.getElementById('planilha-processo')?.value || '';
  const protocolo = `DOC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  if (currentUser.id) {
    await db.insert('documentos', {
      protocolo, tipo: tipoPlanilhaAtual, modulo: 'judicial',
      referencia: ref, conteudo, status: 'rascunho',
      autor_id: currentUser.id
    });
  }
  closeModal('modal-planilha');
  showToast(`✅ Planilha salva — ${protocolo}`);
  carregarPlanilhasLista();
}

async function carregarPlanilhasLista() {
  const tbody = document.getElementById('tbody-planilhas');
  if (!tbody || !currentUser.id) return;
  const tipos = ['💰','📊','🧾','⚖️','🏠','📈'];
  const filtro = tipos.map(t => `tipo.like.${t}*`).join(',');
  const dados = await db.get('documentos',
    `?autor_id=eq.${currentUser.id}&or=(tipo.like.%25Honorários%25,tipo.like.%25Custas%25,tipo.like.%25Atualização%25,tipo.like.%25Liquidação%25,tipo.like.%25Aluguel%25,tipo.like.%25Relatório%25)&order=criado_em.desc&limit=20`);
  if (!dados?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-gray text-xs" style="text-align:center;padding:24px">Nenhuma planilha gerada ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = dados.map(d => `<tr>
    <td class="text-xs font-semibold">${d.protocolo}</td>
    <td class="text-xs">${d.tipo}</td>
    <td class="text-xs">${d.referencia||'—'}</td>
    <td class="text-xs">${d.autor?.nome?.split(' ')[0]||currentUser.short}</td>
    <td class="text-xs text-gray">${new Date(d.criado_em).toLocaleDateString('pt-BR')}</td>
    <td><button class="btn btn-xs btn-outline" onclick="abrirRevisao('${d.id}')">Ver</button></td>
  </tr>`).join('');
}

// ─── PÁGINA PARA REVISAR ──────────────────────────────────
async function carregarParaRevisar() {
  const tbody = document.getElementById('tbody-para-revisar-jur');
  if (!tbody || !currentUser.id) return;
  // Todos os documentos onde EU sou o revisor designado — em qualquer status.
  // Ativos aparecem no topo; concluidos (aprovado/reprovado) vao para baixo riscados.
  const dados = await db.get('documentos',
    `?revisor_id=eq.${currentUser.id}&order=atualizado_em.desc.nullslast,criado_em.desc&limit=100` +
    `&select=*,autor:usuarios!documentos_autor_id_fkey(nome,nivel)`);

  const todos = dados || [];

  // Categoriza
  const emRevisao  = todos.filter(d => d.status === 'em_revisao' || d.status === 'aguardando_aprovacao');
  const devolvidos = todos.filter(d => d.status === 'devolvido');
  const concluidos = todos.filter(d => d.status === 'aprovado' || d.status === 'reprovado');

  // Badge no menu = so o que precisa de acao (em_revisao)
  const badge    = document.getElementById('badge-para-revisar-nav');
  const pendentes = emRevisao.length;
  if (badge) { badge.textContent = pendentes; badge.style.display = pendentes ? 'inline-flex' : 'none'; }

  if (!todos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-gray text-xs" style="text-align:center;padding:32px">✅ Nenhum documento foi enviado para sua revisão ainda.</td></tr>';
    return;
  }

  const nivelLabel = n => n===1?'Jurídico':n===2?'Adm':'Vendas';
  const nivelCls   = n => n===1?'badge-blue':n===2?'badge-amber':'badge-green';

  // Mapa de status → badge + label
  const stMap = {
    em_revisao:           ['badge-blue',  '👁️ Em revisão',  'Aguardando sua revisão'],
    aguardando_aprovacao: ['badge-amber', '⏳ Aguardando',  'Aguardando aprovação'],
    devolvido:            ['badge-red',   '↩️ Devolvido',   'Devolvido ao autor'],
    aprovado:             ['badge-green', '✅ Aprovado',    'Aprovado'],
    reprovado:            ['badge-red',   '🚫 Reprovado',   'Reprovado'],
  };

  // Render uma linha; `risca` aplica strike-through e opacidade
  const trRow = (d, risca) => {
    const st = stMap[d.status] || ['badge-gray', d.status||'—', ''];
    const autorNome = d.autor?.nome?.split(' ')[0] || '—';
    const autorBadge = `<span class="badge ${nivelCls(d.autor?.nivel)}" style="margin-left:4px;font-size:9px">${nivelLabel(d.autor?.nivel)}</span>`;
    // Para devolvido: deixa explicito que voltou para o solicitante
    const colAutor = d.status === 'devolvido'
      ? `Devolvido a <b>${autorNome}</b> ${autorBadge}`
      : `${autorNome} ${autorBadge}`;
    const btnLabel = (d.status === 'em_revisao' || d.status === 'aguardando_aprovacao')
      ? '⚖️ Revisar' : '👁️ Ver';
    const btnCls = (d.status === 'em_revisao' || d.status === 'aguardando_aprovacao')
      ? 'btn-primary' : 'btn-outline';
    const trStyle = risca
      ? 'text-decoration:line-through;opacity:.55;background:var(--gray-50)'
      : '';
    const dt = d.atualizado_em || d.criado_em;
    return `<tr style="${trStyle}">
      <td><div class="font-semibold text-xs">${d.protocolo}</div></td>
      <td class="text-xs">${d.tipo||'—'}</td>
      <td class="text-xs">${colAutor}</td>
      <td class="text-xs">${(d.referencia||'—').substring(0,30)}</td>
      <td><span class="badge ${st[0]}" title="${st[2]}">${st[1]}</span></td>
      <td class="text-xs text-gray">${dt ? new Date(dt).toLocaleDateString('pt-BR') : '—'}</td>
      <td><button class="btn btn-xs ${btnCls}" onclick="abrirRevisao('${d.id}')">${btnLabel}</button></td>
    </tr>`;
  };

  // Monta a tabela: ativos -> em transito (devolvidos) -> concluidos (riscados)
  let html = '';
  if (emRevisao.length)  html += emRevisao.map(d => trRow(d, false)).join('');
  if (devolvidos.length) {
    html += `<tr><td colspan="7" style="background:var(--gray-50);padding:6px 12px;font-size:11px;color:var(--gray-500);font-weight:600">DEVOLVIDOS — autor está corrigindo</td></tr>`;
    html += devolvidos.map(d => trRow(d, false)).join('');
  }
  if (concluidos.length) {
    html += `<tr><td colspan="7" style="background:var(--gray-50);padding:6px 12px;font-size:11px;color:var(--gray-500);font-weight:600">CONCLUÍDOS</td></tr>`;
    html += concluidos.map(d => trRow(d, true)).join('');
  }
  tbody.innerHTML = html;
}


let processoAtualId = null;


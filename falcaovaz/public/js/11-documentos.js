// Pagina Documentos foi simplificada (uma tabela unificada + filtro).
// Esta funcao agora so delega pra carregarMeusDocumentos e destaca o
// badge "aguardam sua aprovacao" pra usuarios juridicos.
async function carregarPaginaDocumentos() {
  if (!currentUser?.id) return;
  // Renderiza lista principal
  if (typeof carregarMeusDocumentos === 'function') await carregarMeusDocumentos();
  // Highlight de "para aprovar" pro juridico
  if (currentUser.judicial) {
    try {
      const paraAprovar = await db.get('documentos', `?aprovador_id=eq.${currentUser.id}&status=eq.aguardando_aprovacao&select=id`);
      const cnt = (paraAprovar||[]).length;
      const wrap = document.getElementById('doc-tab-aprovar-inline');
      const num  = document.getElementById('badge-aprovar-num');
      if (wrap) wrap.style.display = cnt > 0 ? '' : 'none';
      if (num)  num.textContent = String(cnt);
    } catch(_){}
  }
}



// Versão simplificada — só marca o tipo sem mudar de tela
function escolherTipo(tipo, btn) {
  tipoDocSelecionado = tipo;
  document.querySelectorAll('#novo-doc-step1 .btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
  });
  if (btn) { btn.classList.remove('btn-outline'); btn.classList.add('btn-primary'); }
  document.getElementById('tipo-selecionado-label').textContent = tipo;
  document.getElementById('novo-doc-titulo').textContent = '✨ ' + tipo;
  document.getElementById('doc-descricao').focus();
}

function escolherTipoPeticao() {
  escolherTipo('Petição Judicial',
    document.querySelector('#novo-doc-step1 .btn'));
  document.getElementById('doc-descricao').placeholder =
    'Descreva o tipo de peça e os fatos.\n\nEx: Contestação — Ação de despejo por falta de pagamento. Locatário alega ter quitado os débitos conforme recibos em anexo. Pedir improcedência da ação e condenação em honorários.\n\nEx: Tutela de urgência — Liminar para suspender demolição em imóvel objeto de disputa.';
}

function resetModalDoc() {
  tipoDocSelecionado = null;
  docGerado = false; docGeradoId = null;
  // step1 e step2 agora são sempre visíveis (tela única)
  document.getElementById('novo-doc-footer2').style.display = 'flex';
  document.getElementById('novo-doc-titulo').textContent = '✨ Gerar com IA';
  document.getElementById('doc-preview-area').style.display = 'none';
  document.getElementById('doc-generating').style.display = 'none';
  document.getElementById('doc-referencia').value = '';
  document.getElementById('doc-descricao').value = '';
  ['btn-salvar-rascunho','btn-pedir-revisao','btn-finalizar-doc'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.style.display='none';
  });
  const bg=document.getElementById('btn-gerar-doc'); if(bg) bg.style.display='inline-flex';
  // Limpa arquivos
  uploadData['doc'] = null;
  uploadDataMulti = [];
  const ul=document.getElementById('upload-lista-doc'); if(ul) ul.style.display='none';
  // Remove seleção de tipo
  document.querySelectorAll('.doc-tipo-card.selected').forEach(el=>el.classList.remove('selected'));
  const refIn = document.getElementById('doc-refinar-input'); if (refIn) refIn.value = '';
}

// ─── MODAL PETIÇÃO ───────────────────────────────────────
async function abrirModalPeticao() {
  // Carrega processos ativos do banco
  const sel = document.getElementById('pet-processo-select');
  if (sel) {
    sel.innerHTML = '<option value="">— carregando... —</option>';
    try {
      const procs = await db.get('processos', '?status=eq.ativo&select=id,numero,autor,reu,tipo&order=numero.asc&limit=200');
      if (procs && procs.length) {
        sel.innerHTML = '<option value="">— selecione o processo —</option>' +
          procs.map(p => `<option value="${p.id}|${p.numero}|${p.tipo}">${p.numero} — ${(p.autor||p.reu||'').substring(0,40)}</option>`).join('');
      } else {
        sel.innerHTML = '<option value="">Nenhum processo ativo encontrado</option>';
      }
    } catch(e) {
      sel.innerHTML = '<option value="">Erro ao carregar processos</option>';
    }
  }
  openModal('modal-peticao');
}

function abrirGerarPeticao() {
  const sel = document.getElementById('pet-processo-select');
  const tipoInput = document.getElementById('pet-tipo-select');
  const tipo = tipoInput?.value?.trim() || 'Petição Judicial';
  const instrucoes = document.getElementById('pet-instrucoes')?.value || '';
  const procVal = sel?.value || '';
  const [procId, procNum] = procVal.split('|');

  closeModal('modal-peticao');
  resetModalDoc();

  // Configura o modal de geração
  tipoDocSelecionado = tipo;
  escolherTipo(tipo, null); // marca o tipo

  // Preenche referência com o processo (se selecionado)
  if (procNum) document.getElementById('doc-referencia').value = procNum;

  // Coloca instrucoes como pré-texto na descrição
  if (instrucoes) document.getElementById('doc-descricao').value = instrucoes;

  focarComposerIA();
}


let docEmRevisaoId = null;

async function enviarParaRevisao() {
  const revisor = document.getElementById('select-revisor-unico')?.value;
  if (!revisor) { showToast('⚠️ Selecione um revisor.'); return; }
  const msg = document.getElementById('msg-revisor')?.value || '';
  const id = docGeradoId || docEmRevisaoId;
  if (!id) { showToast('⚠️ Salve o documento primeiro.'); closeModal('modal-enviar-revisao'); return; }

  // Busca o id do revisor pelo nome para persistir o vinculo no banco.
  // Sem isso, a pagina 'Para Revisar' nao conseguiria filtrar corretamente.
  // (email vem junto pra notificar o revisor sem outra consulta)
  let revisorId = null, revisorEmail = null;
  try {
    const users = await db.get('usuarios', `?nome=eq.${encodeURIComponent(revisor)}&select=id,email&limit=1`);
    revisorId = users?.[0]?.id || null;
    revisorEmail = users?.[0]?.email || null;
  } catch(_) {}

  const updates = {
    status: 'em_revisao',
    comentario_revisor: msg || null
  };
  if (revisorId) updates.revisor_id = revisorId;

  try {
    await db.update('documentos', id, updates);
    closeModal('modal-enviar-revisao');
    /* composer inline — nao fecha */
    showToast(`📤 Documento enviado para revisão de ${revisor.split(' ')[0]}`);
    _notificarRevisorEmail(id, revisor, revisorEmail, msg);   // fire-and-forget
    carregarMeusDocsDash();
    carregarStatsJuridico();
  } catch(_) {
    closeModal('modal-enviar-revisao');
    /* composer inline — nao fecha */
    showToast(`📤 Enviado para ${revisor.split(' ')[0]}`);
  }
}

// Avisa o revisor por email que chegou documento pra ele. Nunca
// bloqueia o fluxo: qualquer falha vira so um warn no console.
// Requer a acao 'notificar_revisor' publicada no GAS de email.
async function _notificarRevisorEmail(docId, revisorNome, revisorEmail, mensagem){
  try {
    if (!revisorEmail) { console.warn('[email] revisor sem email cadastrado — notificacao pulada'); return; }
    if (!GAS_EMAIL_JURIDICO || GAS_EMAIL_JURIDICO.includes('COLE_URL')) return;
    let info = {};
    try {
      const d = await db.get('documentos', `?id=eq.${docId}&select=protocolo,tipo,referencia`);
      info = d?.[0] || {};
    } catch(_) {}
    const payload = {
      email:      revisorEmail,
      revisor:    revisorNome,
      autor:      currentUser?.name || '',
      protocolo:  info.protocolo || '',
      tipo:       info.tipo || '',
      referencia: info.referencia || '',
      mensagem:   mensagem || '',
      link:       'https://falcaovaz.netlify.app'
    };
    const url = GAS_EMAIL_JURIDICO
      + '?action=notificar_revisor'
      + '&data=' + encodeURIComponent(JSON.stringify(payload))
      + '&t=' + Date.now();
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    if (data.success) console.log('[email] revisor notificado:', revisorEmail);
    else console.warn('[email] notificacao ao revisor falhou:', data.error || 'GAS sem a acao notificar_revisor? Republique o email-juridico.gs');
  } catch(e) { console.warn('[email] notificacao ao revisor:', e.message); }
}

async function abrirRevisao(id) {
  docEmRevisaoId = id;
  docGeradoId = id;
  if (!id) { openModal('modal-revisar-doc'); return; }
  const docs = await db.get('documentos', `?id=eq.${id}&select=*,autor:usuarios!documentos_autor_id_fkey(nome)`);
  if (!docs?.length) { showToast('⚠️ Documento não encontrado.'); return; }
  const d = docs[0];

  const souAutor = d.autor_id === currentUser?.id;
  // Revisor: o explicitamente atribuído OU usuário judicial (fallback legado).
  // Antes era 'só judicial', o que escondia botões para revisores adm/vendas.
  const souRevisor = !souAutor && (
    d.revisor_id === currentUser?.id ||
    currentUser?.judicial
  );
  const podeReenviar = souAutor && (d.status === 'rascunho' || d.status === 'devolvido');
  const podeRevisar = souRevisor && (d.status === 'em_revisao' || d.status === 'aguardando_aprovacao');

  // Ajusta titulo conforme contexto
  const tituloPrefix = souAutor ? (d.status === 'aprovado' ? '✅' : d.status === 'devolvido' ? '↩️' : '📝') : '⚖️';
  document.getElementById('modal-revisar-titulo').textContent = `${tituloPrefix} ${d.protocolo}`;
  document.getElementById('modal-revisar-sub').textContent = `${d.tipo} · ${d.referencia||''} · ${new Date(d.criado_em).toLocaleDateString('pt-BR')}`;
  // Referencia usada pelos botoes de download do modal (Ref.: no PDF)
  window._docRevisaoRef = d.referencia || '';

  // Mostra so os botoes que fazem sentido neste contexto
  document.getElementById('btn-revisar-enviar').style.display   = podeReenviar  ? 'inline-flex' : 'none';
  document.getElementById('btn-revisar-aprovar').style.display  = podeRevisar   ? 'inline-flex' : 'none';
  document.getElementById('btn-revisar-devolver').style.display = podeRevisar   ? 'inline-flex' : 'none';
  // Autor pode salvar edicao em qualquer estado nao-final (rascunho, em_revisao, devolvido)
  const podeEditarAutor = souAutor && d.status !== 'aprovado';
  const btnSalvarEd = document.getElementById('btn-revisar-salvar-edicao');
  if (btnSalvarEd) btnSalvarEd.style.display = podeEditarAutor ? 'inline-flex' : 'none';

  // Comentario de revisao so faz sentido para o revisor
  const grupoComentario = document.getElementById('revisar-comentario')?.closest('.form-group');
  if (grupoComentario) grupoComentario.style.display = souRevisor ? 'block' : 'none';
  document.getElementById('revisar-autor').textContent = d.autor?.nome || '—';
  document.getElementById('revisar-protocolo').textContent = d.protocolo;
  document.getElementById('revisar-tokens').textContent = (d.tokens_usados||0).toLocaleString('pt-BR') + ' tk';
  document.getElementById('revisar-data').textContent = new Date(d.criado_em).toLocaleDateString('pt-BR');
  const el = document.getElementById('revisar-conteudo');
  el.textContent = d.conteudo || '(sem conteúdo)';
  el.contentEditable = 'false'; el.style.border = ''; el.style.background = '';
  // Mostra comentário do revisor se existir
  const logArea = document.getElementById('revisar-log-area');
  if (d.comentario_revisor) {
    logArea.style.display = 'block';
    document.getElementById('revisar-log-lista').innerHTML = `
      <div style="padding:8px 12px;border-left:3px solid var(--blue-300);margin-bottom:8px;background:var(--gray-50);border-radius:0 8px 8px 0">
        <div class="font-semibold text-xs">📤 Enviado para revisão</div>
        <div class="text-xs" style="margin-top:4px;color:var(--gray-600)">${d.comentario_revisor}</div>
      </div>`;
  } else { logArea.style.display = 'none'; }
  document.getElementById('revisar-comentario').value = '';
  openModal('modal-revisar-doc');
}

function toggleEditarDocGerado() {
  const el = document.getElementById('doc-preview-content');
  const hint = document.getElementById('doc-edit-hint');
  const btn = document.getElementById('btn-editar-gerado');
  const editing = el.contentEditable === 'true';
  el.contentEditable = editing ? 'false' : 'true';
  el.style.border = editing ? '' : '1.5px solid var(--blue-400)';
  el.style.background = editing ? '' : 'white';
  hint.style.display = editing ? 'none' : 'block';
  btn.textContent = editing ? '✏️ Editar' : '✓ Concluir edição';
  if (!editing) el.focus();

  // Ao concluir edição, salva no banco se já tiver ID
  if (editing && docGeradoId) {
    const conteudoAtualizado = el.textContent;
    db.update('documentos', docGeradoId, { conteudo: conteudoAtualizado })
      .then(() => showToast('💾 Edição salva no rascunho.'));
  }
}


function toggleEditRevisar() {
  const el = document.getElementById('revisar-conteudo');
  const editing = el.contentEditable === 'true';
  el.contentEditable = editing ? 'false' : 'true';
  el.style.border = editing ? '' : '1.5px solid var(--blue-400)';
  el.style.background = editing ? '' : 'white';
  if (!editing) el.focus();
}

async function acaoRevisao(acao) {
  const id = docEmRevisaoId;
  if (!id) { closeModal('modal-revisar-doc'); return; }
  const comentario = document.getElementById('revisar-comentario')?.value || '';
  const conteudoEditado = document.getElementById('revisar-conteudo')?.textContent || '';
  const docs = await db.get('documentos', `?id=eq.${id}&select=conteudo`);
  const original = docs?.[0]?.conteudo || '';
  const updates = {
    status:             acao === 'aprovado' ? 'aprovado' : 'rascunho',
    comentario_revisor: comentario || null,
    aprovador_id:       acao === 'aprovado' ? (currentUser.id||null) : null
  };
  if (conteudoEditado && conteudoEditado !== original) updates.conteudo = conteudoEditado;
  await db.update('documentos', id, updates);
  closeModal('modal-revisar-doc');
  showToast(acao === 'aprovado' ? '✅ Documento aprovado!' : '↩️ Documento devolvido ao autor.');
  if (typeof carregarPaginaDocumentos === 'function') carregarPaginaDocumentos();
}

// Salva edicao do autor (sem mudar status, sem virar acao de revisor)
async function salvarEdicaoAutor() {
  const id = docEmRevisaoId || docGeradoId;
  if (!id) { showToast('⚠️ Sem documento aberto.'); return; }
  const conteudoEditado = document.getElementById('revisar-conteudo')?.textContent || '';
  if (!conteudoEditado.trim()) { showToast('⚠️ Conteúdo vazio.'); return; }
  try {
    await db.update('documentos', id, { conteudo: conteudoEditado });
    showToast('💾 Edição salva.');
    // Re-aplica estado nao-editavel apos salvar
    const el = document.getElementById('revisar-conteudo');
    if (el && el.contentEditable === 'true') {
      el.contentEditable = 'false';
      el.style.border = '';
      el.style.background = '';
    }
  } catch(e) {
    console.error('[salvarEdicaoAutor]', e);
    showToast('⚠️ Erro ao salvar edição: ' + (e.message||e));
  }
}

// Aliases para compatibilidade
function enviarParaAprovacao() { openModal('modal-enviar-revisao'); }
function enviarRevisaoJur()    { openModal('modal-enviar-revisao'); }
function enviarRevisaoExt()    { openModal('modal-enviar-revisao'); }
function aprovarDoc()          { acaoRevisao('aprovado'); }
function devolverDoc()         { acaoRevisao('devolvido'); }
function reprovarDoc()         { acaoRevisao('devolvido'); }
function aprovarPeticao()      { acaoRevisao('aprovado'); }
function devolverPeticao()     { acaoRevisao('devolvido'); }
function reprovarPeticao()     { acaoRevisao('devolvido'); }
function toggleEditDoc()       { toggleEditRevisar(); }
function toggleEditPeticao()   { toggleEditRevisar(); }
function verDocumento(id)      { abrirRevisao(id); }

// ─── ABAS PETIÇÕES ───────────────────────────────────────
function switchPeticaoTab(tab, el) {
  ['todas','rascunho','revisao','para-revisar','finalizada'].forEach(t => {
    const el2 = document.getElementById('pet-tab-'+t);
    if (el2) el2.style.display = 'none';
  });
  const target = document.getElementById('pet-tab-'+tab);
  if (target) target.style.display = 'block';
  if (el) {
    el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }
}


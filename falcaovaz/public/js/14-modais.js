
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3500);
}


function switchChamadoTab(tab, el) {
  const allTabs = ['recebidos','em-andamento','concluidos','meus','concluidos-meus'];
  allTabs.forEach(t => {
    const el2 = document.getElementById('chamado-tab-'+t);
    if (el2) el2.style.display = 'none';
  });
  const target = document.getElementById('chamado-tab-'+tab);
  if (target) target.style.display = 'block';

  // marca tab ativa
  if (el) {
    el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }
}

function submitChamado() {
  closeModal('modal-chamado');
  const toast = document.getElementById('toast');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3500);
}


function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  // Se tem documento gerado mas ainda não salvo, avisa
  if (id === 'modal-novo-doc' && docGerado && !docGeradoId) {
    if (!confirm('O documento ainda está sendo salvo. Deseja fechar mesmo assim?\n\nCopie o texto antes de confirmar.')) return;
  }
  document.getElementById(id).classList.remove('open');
  // Limpa estado do modal de geração ao fechar
  if (id === 'modal-novo-doc') {
    docGerado = false;
    docGeradoId = null;
    uploadData = {};
    document.getElementById('doc-preview-area').style.display = 'none';
    document.getElementById('doc-generating').style.display = 'none';
    document.getElementById('btn-gerar-doc').style.display = 'inline-flex';
    document.getElementById('btn-salvar-rascunho').style.display = 'none';
    document.getElementById('btn-pedir-revisao').style.display = 'none';
    document.getElementById('btn-enviar-aprovacao-inline').style.display = 'none';
    // Reseta edição
    const prev = document.getElementById('doc-preview-content');
    if (prev) { prev.contentEditable = 'false'; prev.style.border = ''; prev.style.background = ''; }
    const hint = document.getElementById('doc-edit-hint');
    if (hint) hint.style.display = 'none';
    const btnEdit = document.getElementById('btn-editar-gerado');
    if (btnEdit) btnEdit.textContent = '✏️ Editar';
    const statusEl = document.getElementById('upload-status-doc');
    if (statusEl) statusEl.style.display = 'none';
    const input = document.getElementById('upload-input-doc');
    if (input) input.value = '';
    const refIn = document.getElementById('doc-refinar-input');
    if (refIn) refIn.value = '';
  }
}
// Fechar clicando fora — robusto contra seleção de texto
// (não fecha se a seleção começou dentro do modal e o mouse foi solto no fundo)
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  let mousedownNoFundo = false;
  overlay.addEventListener('mousedown', e => { mousedownNoFundo = (e.target === overlay); });
  overlay.addEventListener('click', e => {
    const comecouEterminouNoFundo = (e.target === overlay) && mousedownNoFundo;
    mousedownNoFundo = false;
    if (!comecouEterminouNoFundo) return; // arrastou seleção pra fora → NÃO fecha
    const id = overlay.id;
    // Modal de geração nunca fecha por clique no fundo — evita perder o documento
    if (id === 'modal-novo-doc') return;
    overlay.classList.remove('open');
  });
});

// Enter no login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

// Rede de segurança: registra erros não tratados no console (diagnóstico)
window.addEventListener('error', e => console.error('[erro global]', e.message, (e.filename||'') + ':' + (e.lineno||'')));
window.addEventListener('unhandledrejection', e => console.error('[promise rejeitada]', e.reason));

// Verifica SSO ao carregar
checkSSO();

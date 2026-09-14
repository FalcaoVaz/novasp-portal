
// ─── UPLOAD DE ARQUIVOS ──────────────────────────────────
let uploadData = {};
let uploadDataMulti = []; // Array para múltiplos arquivos

// ─── ANEXAR DOCUMENTO PRONTO (sem IA) ────────────────────
let _anexoConteudo = '';
let _anexoNome = '';

function abrirAnexarDoc() {
  _anexoConteudo = '';
  _anexoNome = '';
  document.getElementById('anexar-tipo').selectedIndex = 0;
  document.getElementById('anexar-referencia').value = '';
  document.getElementById('anexar-obs').value = '';
  document.getElementById('anexar-input').value = '';
  const st = document.getElementById('anexar-status');
  if (st) { st.style.display = 'none'; st.innerHTML = ''; }
  document.getElementById('btn-salvar-anexo').disabled = true;
  openModal('modal-anexar-doc');
}

async function lerArquivoAnexar(input) {
  const file = input.files?.[0];
  if (!file) return;
  const st = document.getElementById('anexar-status');
  const btnSalvar = document.getElementById('btn-salvar-anexo');
  const ext = file.name.split('.').pop().toLowerCase();
  const tamanhoMB = (file.size / 1024 / 1024).toFixed(2);
  st.style.display = 'block';
  st.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div> Lendo ${file.name} (${tamanhoMB}MB)...`;
  btnSalvar.disabled = true;

  try {
    let texto = '';
    if (ext === 'pdf') {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js nao carregado');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        texto += `\n--- Página ${i} ---\n` + content.items.map(x => x.str).join(' ');
      }
    } else if (['txt'].includes(ext)) {
      texto = await file.text();
    } else if (['docx','doc'].includes(ext)) {
      // DOCX vem como zip — extracao real requer biblioteca extra.
      // Por ora, le como texto (vai dar lixo se for binario). Avisa o user.
      texto = await file.text();
      if (texto.includes('PK') || /[\x00-\x08\x0E-\x1F]/.test(texto.slice(0, 200))) {
        throw new Error('DOCX binario ainda nao suportado — converta para PDF ou TXT primeiro.');
      }
    } else {
      throw new Error('Formato nao suportado. Use PDF, DOCX ou TXT.');
    }

    if (!texto || texto.trim().length < 10) {
      throw new Error('Arquivo vazio ou ilegivel.');
    }

    _anexoConteudo = texto.trim();
    _anexoNome = file.name;
    const palavras = _anexoConteudo.split(/\s+/).length;
    st.innerHTML = `✅ <strong>${file.name}</strong> — ${palavras.toLocaleString('pt-BR')} palavras carregadas`;
    btnSalvar.disabled = false;
  } catch (e) {
    console.error('[lerArquivoAnexar]', e);
    st.innerHTML = `❌ ${e.message || 'Erro ao ler arquivo'}`;
    _anexoConteudo = '';
    _anexoNome = '';
    btnSalvar.disabled = true;
  }
}

async function salvarAnexoDoc() {
  if (!_anexoConteudo) { showToast('⚠️ Selecione um arquivo primeiro.'); return; }
  const tipo = document.getElementById('anexar-tipo')?.value || 'Outro';
  const referencia = document.getElementById('anexar-referencia')?.value?.trim() || '';
  const obs = document.getElementById('anexar-obs')?.value?.trim() || '';

  // Adiciona observacoes do autor no inicio do conteudo, separadas por linha
  let conteudoFinal = _anexoConteudo;
  if (obs) conteudoFinal = `[OBSERVAÇÕES DO AUTOR]\n${obs}\n\n[DOCUMENTO ANEXADO: ${_anexoNome}]\n${'─'.repeat(60)}\n${_anexoConteudo}`;

  const protocolo = `DOC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const btnSalvar = document.getElementById('btn-salvar-anexo');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';
  try {
    const novo = await db.insert('documentos', {
      protocolo,
      tipo,
      modulo: currentUser?.judicial ? 'judicial' : 'extrajudicial',
      referencia,
      conteudo: conteudoFinal,
      status: 'rascunho',
      tokens_usados: 0,
      autor_id: currentUser?.id || null
    });
    if (novo?.[0]?.id) {
      docGeradoId = novo[0].id;
      docEmRevisaoId = novo[0].id;
      showToast(`✅ ${protocolo} salvo como rascunho. Pronto para enviar para revisão.`);
      closeModal('modal-anexar-doc');
      if (typeof carregarPaginaDocumentos === 'function') carregarPaginaDocumentos();
      if (typeof carregarMeusDocsDash === 'function') carregarMeusDocsDash();
    } else {
      showToast('⚠️ Erro ao salvar — tente novamente.');
    }
  } catch (e) {
    console.error('[salvarAnexoDoc]', e);
    showToast('⚠️ Erro: ' + (e.message || e));
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = '💾 Salvar como rascunho';
  }
}

// ── Upload múltiplo (extrajudicial) ──────────────────────────────
async function handleUploadMultiplo(input, contexto) {
  const files = Array.from(input.files).slice(0, 5); // máximo 5
  if (!files.length) return;

  const listaEl = document.getElementById(`upload-lista-${contexto}`);
  const listaItemsEl = document.getElementById(`upload-lista-${contexto}-items`);
  const statusEl = document.getElementById(`upload-status-${contexto}`);
  if (listaEl) listaEl.style.display = 'block';
  uploadDataMulti = [];

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    const itemId = `upload-item-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    // Adiciona item na lista com loading
    if (listaItemsEl) {
      listaItemsEl.insertAdjacentHTML('beforeend', `
        <div id="${itemId}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gray-50);border-radius:6px;margin-bottom:4px;font-size:12px">
          <div class="spinner" style="width:12px;height:12px;border-width:2px;flex-shrink:0"></div>
          <span>${file.name}</span>
        </div>`);
    }

    try {
      let texto = '';
      if (ext === 'pdf') {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const c = await page.getTextContent();
          texto += `\n--- ${file.name} — Página ${i} ---\n` + c.items.map(x=>x.str).join(' ');
        }
      } else if (['txt'].includes(ext)) {
        texto = await file.text();
        // Remove BOM (UTF-8 e UTF-16) que alguns editores Windows colocam
        texto = texto.replace(/^﻿/, '').replace(/^￾/, '');
        console.log(`[upload .txt] ${file.name}: ${texto.length} chars lidos`);
        if (!texto.trim()) throw new Error('Arquivo .txt vazio');
      } else if (['doc','docx'].includes(ext)) {
        texto = await file.text();
        if (texto.includes('PK') || /[\x00-\x08\x0E-\x1F]/.test(texto.slice(0,200))){
          throw new Error('DOCX binário não suportado — salve como TXT ou PDF');
        }
      } else if (['png','jpg','jpeg','webp'].includes(ext)) {
        texto = `[Imagem: ${file.name} — conteúdo visual não extraído em texto]`;
      }
      uploadDataMulti.push({ texto, nome: file.name });

      // Atualiza item na lista
      const itemEl = document.getElementById(itemId);
      if (itemEl) itemEl.innerHTML = `
        <span style="color:var(--green-600)">✅</span>
        <span style="flex:1">${file.name}</span>
        <button onclick="this.parentElement.remove();uploadDataMulti=uploadDataMulti.filter(x=>x.nome!=='${file.name}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">✕</button>`;
    } catch(e) {
      const itemEl = document.getElementById(itemId);
      if (itemEl) itemEl.innerHTML = `<span style="color:var(--red)">❌</span> <span>${file.name} — erro ao ler</span>`;
    }
  }

  // Consolida para uploadData também (compatibilidade)
  if (uploadDataMulti.length) {
    uploadData[contexto] = {
      texto: uploadDataMulti.map(f => `\n\n=== DOCUMENTO: ${f.nome} ===\n${f.texto}`).join('\n'),
      nome: uploadDataMulti.map(f=>f.nome).join(', '),
      tipo: 'texto'
    };
  }
}


function handleUpload(input, contexto) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById(`upload-status-${contexto}`);
  const ext = file.name.split('.').pop().toLowerCase();
  const tamanhoMB = (file.size / 1024 / 1024).toFixed(1);

  if (statusEl) {
    statusEl.style.display = 'flex';
    statusEl.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px"></div> Lendo ${file.name} (${tamanhoMB}MB)...`;
  }

  if (ext === 'pdf') {
    // Extrai texto do PDF via PDF.js — sem limite de tamanho
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        let textoCompleto = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const texto = content.items.map(item => item.str).join(' ');
          textoCompleto += `\n--- Página ${i} ---\n${texto}`;
        }
        const palavras = textoCompleto.split(/\s+/).length;
        uploadData[contexto] = { texto: textoCompleto, nome: file.name, tipo: 'texto' };
        if (statusEl) statusEl.innerHTML = `✅ <strong>${file.name}</strong> — ${pdf.numPages} páginas, ~${palavras.toLocaleString('pt-BR')} palavras extraídas &nbsp;<button onclick="removerUpload('${contexto}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">✕</button>`;
        const area = document.getElementById(`upload-area-${contexto}`);
        if (area) { area.style.borderColor = 'var(--blue-400)'; area.style.background = 'var(--blue-50)'; }
      } catch(err) {
        console.error('Erro PDF.js:', err);
        // Fallback: envia como base64 se PDF.js falhar
        tentarBase64(file, contexto, statusEl);
      }
    };
    reader.onerror = () => tentarBase64(file, contexto, statusEl);
    reader.readAsArrayBuffer(file);

  } else if (['png','jpg','jpeg','webp'].includes(ext)) {
    // Imagens — envia como base64 (sem limite de extração, a IA lê diretamente)
    if (file.size > 5 * 1024 * 1024) {
      if (statusEl) statusEl.innerHTML = '❌ Imagem muito grande. Máximo 5MB para imagens.';
      input.value = ''; return;
    }
    tentarBase64(file, contexto, statusEl);

  } else if (['docx','doc','txt'].includes(ext)) {
    // Texto puro — lê como texto
    const reader = new FileReader();
    reader.onload = (e) => {
      const texto = e.target.result;
      uploadData[contexto] = { texto, nome: file.name, tipo: 'texto' };
      if (statusEl) statusEl.innerHTML = `✅ <strong>${file.name}</strong> — texto carregado &nbsp;<button onclick="removerUpload('${contexto}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">✕</button>`;
    };
    reader.readAsText(file);

  } else {
    if (statusEl) statusEl.innerHTML = '❌ Formato não suportado. Use PDF, PNG, JPG ou TXT.';
    input.value = '';
  }
}

function tentarBase64(file, contexto, statusEl) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1];
    uploadData[contexto] = { base64, nome: file.name, tipo: 'base64' };
    const kb = Math.round(file.size/1024);
    if (statusEl) statusEl.innerHTML = `✅ <strong>${file.name}</strong> (${kb}KB) &nbsp;<button onclick="removerUpload('${contexto}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">✕</button>`;
    const area = document.getElementById(`upload-area-${contexto}`);
    if (area) { area.style.borderColor = 'var(--blue-400)'; area.style.background = 'var(--blue-50)'; }
  };
  reader.onerror = () => { if (statusEl) statusEl.innerHTML = '❌ Erro ao ler arquivo.'; };
  reader.readAsDataURL(file);
}

function removerUpload(contexto) {
  delete uploadData[contexto];
  const statusEl = document.getElementById(`upload-status-${contexto}`);
  if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
  const input = document.getElementById(`upload-input-${contexto}`);
  if (input) input.value = '';
  const area = document.getElementById(`upload-area-${contexto}`);
  if (area) { area.style.borderColor = ''; area.style.background = ''; }
}

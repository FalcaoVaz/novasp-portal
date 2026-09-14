
let tipoDocSelecionado = '';
let docGerado = false;
let docGeradoId = null; // ID do doc salvo no banco

function switchDocTab(tab, el) {
  ['rascunho','aguardando','aprovados','devolvidos','aprovar'].forEach(t => {
    const el2 = document.getElementById('doc-tab-'+t);
    if (el2) el2.style.display = 'none';
  });
  const target = document.getElementById('doc-tab-'+tab);
  if (target) target.style.display = 'block';
  if (el) {
    el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }
}

function selecionarTipoDoc(tipo) {
  tipoDocSelecionado = tipo;
  focarComposerIA();
  escolherTipoModal(tipo, null);
}

function escolherTipoModal(tipo, cardEl) {
  tipoDocSelecionado = tipo;
  document.querySelectorAll('#novo-doc-step1 .doc-tipo-card').forEach(c => c.classList.remove('selected'));
  if (cardEl) cardEl.classList.add('selected');

  setTimeout(() => {
    // Tela única — não precisa esconder/mostrar steps
    document.getElementById('tipo-selecionado-label').textContent = tipo;
    document.getElementById('novo-doc-titulo').textContent = '✨ ' + tipo;
    docGerado = false;
    document.getElementById('doc-preview-area').style.display = 'none';
    document.getElementById('doc-generating').style.display = 'none';
    document.getElementById('btn-gerar-doc').style.display = 'inline-flex';
    document.getElementById('btn-salvar-rascunho').style.display = 'none';
    document.getElementById('btn-pedir-revisao').style.display = 'none';
    document.getElementById('btn-finalizar-doc').style.display = 'none';
    const bea = document.getElementById('btn-enviar-aprovacao-inline');
    if (bea) bea.style.display = 'none';
  }, 150);
}

function voltarStep1() {
  // step1 e step2 agora são sempre visíveis (tela única)
  document.getElementById('novo-doc-footer2').style.display = 'flex';
  document.getElementById('novo-doc-titulo').textContent = '✨ Novo Documento com IA';
}

function gerarDocumento() {
  const descricao = document.getElementById('doc-descricao').value.trim();
  const referencia = document.getElementById('doc-referencia')?.value || '';
  if (!descricao) { showToast('⚠️ Descreva a situação antes de gerar.'); return; }

  // Tipo agora vem do dropdown opcional. Se vazio, IA identifica pelo texto.
  const tipoSel = document.getElementById('doc-tipo-select')?.value || '';
  const tipoFinal = tipoSel || tipoDocSelecionado || 'Documento Jurídico (IA identifica pelo texto)';

  // UI: mostra progresso com contador
  const genEl = document.getElementById('doc-generating');
  genEl.style.display = 'block';
  document.getElementById('doc-preview-area').style.display = 'none';
  document.getElementById('btn-gerar-doc').style.display = 'none';
  ['btn-salvar-rascunho','btn-pedir-revisao','btn-finalizar-doc'].forEach(id => {
    const e = document.getElementById(id); if(e) e.style.display = 'none';
  });

  let segundos = 0;
  const timer = setInterval(() => {
    segundos++;
    genEl.innerHTML = `
      <div class="divider"></div>
      <div class="doc-preview-generating">
        <div class="spinner"></div>
        <div>
          <div style="font-weight:600">Gerando ${tipoFinal}... ${segundos}s</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:4px">Sem pressa — pode levar até 1-2 minutos.</div>
        </div>
      </div>`;
  }, 1000);

  const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
  // Contexto injetado no prompt: empresa + autor (nome do usuário logado)
  // pra IA já cabecalhar/assinar o documento em nome da imobiliária.
  const contexto = {
    empresa: (typeof EMPRESA_DADOS !== 'undefined') ? EMPRESA_DADOS : null,
    autor:   currentUser ? { nome: currentUser.nome || currentUser.name || '', email: currentUser.email || '' } : null,
    data_hoje: new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})
  };
  const payload = { tipo: tipoFinal, referencia, descricao, contexto, job_id: jobId, usuario_nivel: currentUser?.level };

  if (uploadDataMulti?.length > 0) {
    payload.texto_arquivo = uploadDataMulti.map(f => `\n=== ${f.nome} ===\n${f.texto}`).join('\n');
    payload.nome_arquivo  = uploadDataMulti.map(f => f.nome).join(', ');
  } else {
    const arq = uploadData?.['doc'];
    if (arq?.tipo === 'texto') { payload.texto_arquivo = arq.texto; payload.nome_arquivo = arq.nome; }
    else if (arq?.tipo === 'base64') { payload.arquivo_base64 = arq.base64; payload.arquivo_nome = arq.nome; }
  }

  // Tenta primeiro a background function (sem timeout). Se der 404
  // (funcao nao existe / plan free), cai pra sincrona com polling manual.
  _gerarComIA(payload, jobId, timer, tipoFinal, referencia, genEl, {});
}

// Fluxo de geracao com fallback background → sincrono.
async function _gerarComIA(payload, jobId, timer, tipo, referencia, genEl, opts) {
  const btnMain = opts.refino ? 'btn-refinar-doc' : 'btn-gerar-doc';
  try {
    // 1) Tenta background function
    const rBg = await fetch('/.netlify/functions/gerar-documento-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (rBg.status === 202) {
      pollJob(jobId, timer, tipo, referencia, genEl, opts);
      return;
    }
    if (rBg.status !== 404) {
      const text = await rBg.text();
      let msg = text || `HTTP ${rBg.status}`;
      try { const j = JSON.parse(text); if (j.erro) msg = j.erro; } catch(_) {}
      throw new Error(msg);
    }
    // 404 → fallback sincrono
    console.log('[ia] background function 404 — usando fluxo sincrono');
    const rSy = await fetch('/.netlify/functions/gerar-documento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await rSy.text();
    let j;
    try { j = JSON.parse(txt); } catch(_) { throw new Error(txt || `HTTP ${rSy.status}`); }
    if (j.erro) throw new Error(j.erro);
    if (!j.conteudo) throw new Error('Resposta sem conteúdo');
    clearInterval(timer);
    _processarJobIA({resultado: j.conteudo, tokens: j.tokens || 0}, tipo, referencia, genEl, opts);
  } catch(e) {
    clearInterval(timer);
    const b = document.getElementById(btnMain); if (b) b.style.display = 'inline-flex';
    const msgErro = e.message || 'sem detalhes (abra F12 → Console pra ver o erro completo)';
    const ehTimeout = /timeout|inactivity|excedid/i.test(msgErro);
    const dica = ehTimeout
      ? '<div style="margin-top:8px;font-size:12px;color:#7f1d1d">💡 Documento longo demais. Tente: (1) reduzir a descrição · (2) remover anexos grandes (>500KB) · (3) copiar só o trecho relevante do PDF em vez de anexar o arquivo inteiro.</div>'
      : '';
    genEl.innerHTML = `<div class="divider"></div><div style="padding:12px;background:#fef2f2;border-radius:8px;color:#dc2626;font-size:13px">❌ Erro: ${msgErro}${dica}</div>`;
  }
}

// Dá um novo comando à IA para melhorar o documento já gerado
function refinarDocumento() {
  const instr = document.getElementById('doc-refinar-input')?.value?.trim();
  if (!instr) { showToast('⚠️ Escreva o que deseja melhorar.'); return; }
  const base = document.getElementById('doc-preview-content')?.textContent?.trim() || '';
  if (!base) { showToast('⚠️ Gere um documento primeiro.'); return; }

  const tipoFinal  = tipoDocSelecionado || 'Documento Jurídico';
  const referencia = document.getElementById('doc-referencia')?.value || '';

  const genEl = document.getElementById('doc-generating');
  genEl.style.display = 'block';
  ['btn-salvar-rascunho','btn-pedir-revisao','btn-finalizar-doc','btn-refinar-doc','btn-gerar-doc'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'none';
  });

  let segundos = 0;
  const resumo = instr.length > 60 ? instr.slice(0,60) + '…' : instr;
  const timer = setInterval(() => {
    segundos++;
    genEl.innerHTML = `
      <div class="divider"></div>
      <div class="doc-preview-generating">
        <div class="spinner"></div>
        <div>
          <div style="font-weight:600">Melhorando documento... ${segundos}s</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:4px">Aplicando: ${resumo}</div>
        </div>
      </div>`;
  }, 1000);

  const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
  const payload = {
    tipo: tipoFinal, referencia, descricao: instr,
    texto_base: base, refinar: true,
    job_id: jobId, usuario_nivel: currentUser?.level
  };

  _gerarComIA(payload, jobId, timer, tipoFinal, referencia, genEl, { refino: true });
}

// Sucesso da geracao/refino: atualiza UI, salva doc no banco, atualiza tokens.
// Recebe {resultado, tokens} normalizado. Usado tanto pelo fetch sincrono
// quanto pelo pollJob (background function).
function _processarJobIA(job, tipo, referencia, genEl, opts = {}) {
  genEl.style.display = 'none';
  document.getElementById('doc-preview-area').style.display = 'block';
  document.getElementById('doc-preview-content').textContent = job.resultado;
  document.getElementById('doc-tokens-badge').textContent = `${(job.tokens||0).toLocaleString('pt-BR')} tokens`;
  document.getElementById('btn-salvar-rascunho').style.display = 'inline-flex';
  document.getElementById('btn-pedir-revisao').style.display   = 'inline-flex';
  document.getElementById('btn-finalizar-doc').style.display   = 'inline-flex';
  const btnPdf = document.getElementById('btn-baixar-pdf'); if (btnPdf) btnPdf.style.display = 'inline-flex';
  const btnPdfT = document.getElementById('btn-baixar-pdf-timbrado'); if (btnPdfT) btnPdfT.style.display = 'inline-flex';
  const btnRef = document.getElementById('btn-refinar-doc'); if (btnRef) btnRef.style.display = 'inline-flex';
  docGerado = true;

  if (opts.refino && docGeradoId) {
    const inp = document.getElementById('doc-refinar-input'); if (inp) inp.value = '';
    db.update('documentos', docGeradoId, { conteudo: job.resultado, tokens_usados: (job.tokens||0) })
      .then(() => showToast('✨ Documento melhorado!'))
      .catch(() => showToast('✨ Melhorado! Copie o texto — erro ao salvar.'));
    if (currentUser?.id) db.update('usuarios', currentUser.id, { tokens_usados: (currentUser.used||0)+(job.tokens||0) });
    carregarMeusDocsDash(); carregarStatsJuridico();
    return;
  }

  const protocolo = `DOC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  db.insert('documentos', {
    protocolo, tipo,
    modulo: currentUser?.judicial ? 'judicial' : 'extrajudicial',
    referencia: referencia || '',
    conteudo: job.resultado,
    status: 'rascunho',
    tokens_usados: job.tokens || 0,
    autor_id: currentUser?.id || null
  }).then(docs => {
    if (docs?.[0]?.id) {
      docGeradoId = docs[0].id;
      showToast(`✅ ${protocolo} salvo como rascunho`);
      if (currentUser?.id) db.update('usuarios', currentUser.id, { tokens_usados: (currentUser.used||0)+(job.tokens||0) });
      carregarMeusDocsDash(); carregarStatsJuridico();
    }
  }).catch(() => showToast('⚠️ Gerado! Copie o texto — erro ao salvar.'));
}

async function pollJob(jobId, timer, tipo, referencia, genEl, opts = {}) {
  let tentativa = 0;
  const checar = async () => {
    tentativa++;
    if (tentativa > 300) { // 5 minutos maximo (geracao longa pode levar 2-4 min)
      clearInterval(timer);
      document.getElementById('btn-gerar-doc').style.display = 'inline-flex';
      genEl.innerHTML = `<div class="divider"></div><div style="padding:12px;background:#fef2f2;border-radius:8px;color:#dc2626;font-size:13px">⏱️ Tempo limite atingido. Tente novamente.</div>`;
      return;
    }
    try {
      // Leitura direta do banco; se a rede do usuario bloquear o
      // supabase.co (db.get devolve [] com lastError), cai pro proxy
      // no proprio site — ia-job-status — que le server-side.
      let jobs = await db.get('ia_jobs', `?job_id=eq.${jobId}&select=status,resultado,tokens,erro&limit=1`);
      if ((!jobs || !jobs.length) && db.lastError) {
        const r = await fetch(`/.netlify/functions/ia-job-status?job_id=${encodeURIComponent(jobId)}`);
        if (r.ok) jobs = await r.json();
      }
      const job = jobs?.[0];
      if (!job || job.status === 'gerando') { setTimeout(checar, 1000); return; }
      clearInterval(timer);
      if (job.status === 'erro' || job.erro) {
        document.getElementById('btn-gerar-doc').style.display = 'inline-flex';
        genEl.innerHTML = `<div class="divider"></div><div style="padding:12px;background:#fef2f2;border-radius:8px;color:#dc2626;font-size:13px">❌ ${job.erro||'Erro desconhecido'}</div>`;
        return;
      }
      // Sucesso
      genEl.style.display = 'none';
      document.getElementById('doc-preview-area').style.display = 'block';
      document.getElementById('doc-preview-content').textContent = job.resultado;
      document.getElementById('doc-tokens-badge').textContent = `${(job.tokens||0).toLocaleString('pt-BR')} tokens`;
      document.getElementById('btn-salvar-rascunho').style.display = 'inline-flex';
      document.getElementById('btn-pedir-revisao').style.display   = 'inline-flex';
      document.getElementById('btn-finalizar-doc').style.display   = 'inline-flex';
      const btnRef = document.getElementById('btn-refinar-doc'); if (btnRef) btnRef.style.display = 'inline-flex';
      docGerado = true;

      // Modo refino: atualiza o documento já existente em vez de criar outro
      if (opts.refino && docGeradoId) {
        const inp = document.getElementById('doc-refinar-input'); if (inp) inp.value = '';
        db.update('documentos', docGeradoId, { conteudo: job.resultado, tokens_usados: (job.tokens||0) })
          .then(() => showToast('✨ Documento melhorado!'))
          .catch(() => showToast('✨ Melhorado! Copie o texto — erro ao salvar.'));
        if (currentUser?.id) db.update('usuarios', currentUser.id, { tokens_usados: (currentUser.used||0)+(job.tokens||0) });
        carregarMeusDocsDash(); carregarStatsJuridico();
        return;
      }

      const protocolo = `DOC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      db.insert('documentos', {
        protocolo, tipo,
        modulo: currentUser?.judicial ? 'judicial' : 'extrajudicial',
        referencia: referencia || '',
        conteudo: job.resultado,
        status: 'rascunho',
        tokens_usados: job.tokens || 0,
        autor_id: currentUser?.id || null
      }).then(docs => {
        if (docs?.[0]?.id) {
          docGeradoId = docs[0].id;
          showToast(`✅ ${protocolo} salvo como rascunho`);
          if (currentUser?.id) db.update('usuarios', currentUser.id, { tokens_usados: (currentUser.used||0)+(job.tokens||0) });
          carregarMeusDocsDash(); carregarStatsJuridico();
        }
      }).catch(() => showToast('⚠️ Gerado! Copie o texto — erro ao salvar.'));
    } catch(e) { setTimeout(checar, 2000); }
  };
  setTimeout(checar, 2000);
}


// Baixa o documento gerado como PDF (abre nova janela + window.print).
// O usuario escolhe "Salvar como PDF" no destino da impressao.
// timbrado=true usa o papel timbrado oficial da Nova SP (imagens em
// /img/timbre-*.jpg, extraidas do modelo de contrato da empresa) com
// cabecalho e rodape repetidos em TODAS as paginas impressas.
// srcElId/refOverride: permitem baixar de outras telas (ex.: modal de
// revisao/aprovacao le de #revisar-conteudo com a referencia do banco).
function baixarDocumentoPdf(timbrado, srcElId, refOverride){
  const srcEl = document.getElementById(srcElId || 'doc-preview-content');
  const conteudo = srcEl?.innerText || srcEl?.textContent || '';
  if (!conteudo.trim()) { showToast('⚠️ Nenhum documento pra baixar.'); return; }
  const empresa = (typeof EMPRESA_DADOS !== 'undefined') ? EMPRESA_DADOS
                : { razao_social: 'Nova São Paulo Imobiliária', cnpj:'', endereco:'', cidade:'São Paulo/SP' };
  const dataHoje = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const referencia = (refOverride !== undefined && refOverride !== null)
                   ? refOverride
                   : (document.getElementById('doc-referencia')?.value || '');
  const esc = s => String(s||'').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  if (timbrado) {
    // Truque de impressao: o thead/tfoot da tabela reservam a altura
    // exata (mesmo bloco, invisivel) e o header/footer fixos imprimem
    // por cima em todas as paginas.
    // Cabecalho: montado em HTML com o logo oficial novo (Desde 1969);
    // rodape: imagem oficial com as 3 unidades, extraida do contrato.
    const logo = location.origin + '/img/logo-nsp.png';
    const fImg = location.origin + '/img/timbre-footer.jpg';
    const cabecalho = `
  <div class="barra"></div>
  <div class="cab">
    <img class="logo" src="${logo}" alt="">
    <div class="creci">Creci 02061-J</div>
    <div class="linha"></div>
  </div>`;
    const htmlT = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Documento — ${esc(empresa.razao_social)}</title>
<style>
  @page { size: A4; margin: 0; }
  /* fundo branco explicito: sem ele, dark mode deixa o preview preto */
  html, body { margin:0; padding:0; background:#fff; color-scheme:light; font-family: Georgia, "Times New Roman", serif; color:#1e293b; line-height:1.7; font-size:12pt; }
  .timbre-h { position:fixed; top:0; left:0; right:0; background:#fff; }
  .timbre-f { position:fixed; bottom:0; left:0; right:0; }
  .barra { height: 8mm; background:#0088CC; }
  .cab { padding: 5mm 20mm 0; }
  .cab .logo { height: 15mm; width:auto; display:block; }
  .cab .creci { font-family:-apple-system,Arial,sans-serif; font-size:8.5pt; color:#475569; margin:1.5mm 0 0 18mm; }
  .cab .linha { height:1.1mm; background:#9aa1ab; margin-top:3mm; }
  .timbre-f img, .esp-f img { width:100%; display:block; }
  .esp-h, .esp-f { visibility:hidden; }
  table.doc { width:100%; border-collapse:collapse; }
  td.corpo { padding: 6mm 20mm; }
  .ref { font-size:11pt; color:#475569; margin-bottom:14px; text-align:right }
  .body { white-space:pre-wrap; text-align:justify; }
  .emissao { margin-top:20px; font-size:9pt; color:#94a3b8; text-align:center }
  .btn-print { position:fixed; top:12px; right:12px; background:#3B82F6; color:#fff; border:none;
    padding:10px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.15); z-index:999; font-family:-apple-system,Arial,sans-serif; }
  @media print { .btn-print { display:none } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ Salvar como PDF</button>
<div class="timbre-h">${cabecalho}</div>
<div class="timbre-f"><img src="${fImg}" alt=""></div>
<table class="doc">
  <thead><tr><td><div class="esp-h">${cabecalho}</div></td></tr></thead>
  <tbody><tr><td class="corpo">
    ${referencia ? `<div class="ref"><b>Ref.:</b> ${esc(referencia)}</div>` : ''}
    <div class="body">${esc(conteudo)}</div>
    <div class="emissao">Documento emitido em ${esc(dataHoje)}</div>
  </td></tr></tbody>
  <tfoot><tr><td><div class="esp-f"><img src="${fImg}" alt=""></div></td></tr></tfoot>
</table>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 600));<\/script>
</body>
</html>`;
    const wT = window.open('', '_blank');
    if (!wT) { alert('O navegador bloqueou a janela pop-up. Libere pra este site e tente de novo.'); return; }
    wT.document.open(); wT.document.write(htmlT); wT.document.close();
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Documento — ${esc(empresa.razao_social)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm 18mm 22mm; }
  html, body { margin:0; padding:0; background:#fff; color-scheme:light; font-family: Georgia, "Times New Roman", serif; color:#1e293b; line-height:1.7; font-size:12pt; }
  header { border-bottom:2px solid #1E2D4A; padding-bottom:10px; margin-bottom:18px; text-align:center }
  header .n { font-size:14pt; font-weight:700; color:#1E2D4A; letter-spacing:-.01em }
  header .m { font-size:10pt; color:#64748b; margin-top:2px }
  .ref { font-size:11pt; color:#475569; margin-bottom:16px; text-align:right }
  .body { white-space:pre-wrap; text-align:justify; }
  footer { margin-top:32px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:9pt; color:#94a3b8; text-align:center }
  .btn-print { position:fixed; top:12px; right:12px; background:#3B82F6; color:#fff; border:none;
    padding:10px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.15); z-index:999; font-family:-apple-system,Arial,sans-serif; }
  @media print { .btn-print { display:none } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ Salvar como PDF</button>
<header>
  <div class="n">${esc(empresa.razao_social)}</div>
  <div class="m">CNPJ ${esc(empresa.cnpj)} · ${esc(empresa.endereco)}</div>
</header>
${referencia ? `<div class="ref"><b>Ref.:</b> ${esc(referencia)}</div>` : ''}
<div class="body">${esc(conteudo)}</div>
<footer>Documento emitido em ${esc(dataHoje)} · ${esc(empresa.razao_social)}</footer>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));<\/script>
</body>
</html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('O navegador bloqueou a janela pop-up. Libere pra este site e tente de novo.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function salvarRascunho() {
  showToast('💾 Rascunho salvo — aparece na lista abaixo.');
  resetComposerDoc();
  setTimeout(() => { carregarMeusDocumentos(); carregarMeusDocsDash?.(); carregarStatsJuridico?.(); }, 300);
}

function finalizarDocumento() {
  if (!docGeradoId) {
    showToast('✅ Documento finalizado.');
    resetComposerDoc();
    setTimeout(() => { carregarMeusDocumentos(); carregarMeusDocsDash?.(); carregarStatsJuridico?.(); }, 300);
    return;
  }
  db.update('documentos', docGeradoId, { status: 'aprovado' })
    .then(() => {
      showToast('✅ Documento finalizado e arquivado.');
      resetComposerDoc();
      carregarMeusDocumentos();
      carregarMeusDocsDash?.(); carregarStatsJuridico?.();
    })
    .catch(() => {
      showToast('✅ Documento finalizado.');
      resetComposerDoc();
    });
}

// Foca o composer inline na página Documentos. Chamado do dashboard e
// do menu lateral pra manter tudo numa página só (sem modal).
function focarComposerIA() {
  const composer = document.getElementById('composer-novo-doc');
  if (composer && !composer.open) composer.open = true;
  const t = document.getElementById('doc-descricao');
  if (t) {
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => t.focus(), 250);
  }
}

// Limpa o composer pra começar um novo documento do zero.
function resetComposerDoc(){
  tipoDocSelecionado = '';
  docGerado = false; docGeradoId = null;
  ['doc-descricao','doc-referencia','doc-refinar-input'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const sel = document.getElementById('doc-tipo-select'); if (sel) sel.value = '';
  const prev = document.getElementById('doc-preview-area'); if (prev) prev.style.display = 'none';
  const gen  = document.getElementById('doc-generating');   if (gen)  { gen.style.display = 'none'; gen.innerHTML = ''; }
  const bg = document.getElementById('btn-gerar-doc');  if (bg) bg.style.display = 'inline-flex';
  ['btn-baixar-pdf','btn-baixar-pdf-timbrado','btn-salvar-rascunho','btn-pedir-revisao','btn-finalizar-doc'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'none';
  });
  if (typeof uploadDataMulti !== 'undefined') uploadDataMulti = [];
  if (typeof uploadData !== 'undefined') uploadData['doc'] = null;
  const ul = document.getElementById('upload-lista-doc'); if (ul) ul.style.display = 'none';
}


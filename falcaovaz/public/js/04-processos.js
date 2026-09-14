async function abrirProcesso(id) {
  processoAtualId = id;
  // Reseta abas
  switchProcTab('resumo', null);
  openModal('modal-processo-detalhe');

  // Busca dados do processo
  const procs = await db.get('processos',
    `?id=eq.${id}&select=*,responsavel:usuarios(nome)&limit=1`);
  if (!procs?.length) return;
  const p = procs[0];

  // Preenche header
  document.getElementById('proc-det-titulo').textContent = p.numero || 'Processo';
  document.getElementById('proc-det-vara').textContent = p.vara || '—';
  // Guarda o numero CNJ pra abertura no e-SAJ
  const modal = document.getElementById('modal-processo-detalhe');
  if (modal) modal.dataset.cnj = p.numero || '';

  // Preenche resumo
  setEl('proc-det-autor',  p.autor  || '—');
  setEl('proc-det-reu',    p.reu    || '—');
  setEl('proc-det-tipo',   p.tipo   || '—');
  setEl('proc-det-fase',   p.fase   || '—');
  setEl('proc-det-resp',   p.responsavel?.nome || '—');
  setEl('proc-det-valor',  p.valor_causa ? `R$ ${Number(p.valor_causa).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—');
  setEl('proc-det-status', p.status === 'ativo' ? '🟢 Ativo' : p.status === 'encerrado' ? '⚫ Encerrado' : p.status || '—');
  setEl('proc-det-data',   p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '—');

  // Popula campos de email do cliente
  document.getElementById('proc-email-nome').value  = p.nome_cliente  || '';
  document.getElementById('proc-email-addr').value  = p.email_cliente || '';
  const chk = document.getElementById('proc-notif-ativo');
  if (chk) chk.checked = !!p.notif_email_ativo;

  // Carrega as outras abas em paralelo
  carregarAndamentos(id);
  carregarPrazosProcesso(id);
  carregarFinanceiroProcesso(id);
  carregarDocumentosProcesso(id);
}

function switchProcTab(tab, el) {
  ['resumo','andamentos','prazos','financeiro','documentos'].forEach(t => {
    const el2 = document.getElementById(`proc-tab-${t}`);
    if (el2) el2.style.display = 'none';
  });
  const target = document.getElementById(`proc-tab-${tab}`);
  if (target) target.style.display = 'block';
  if (el) {
    el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  } else {
    // Ativa aba sem elemento
    document.querySelectorAll('#modal-processo-detalhe .tab').forEach(t => {
      if (t.getAttribute('onclick')?.includes(`'${tab}'`)) t.classList.add('active');
      else t.classList.remove('active');
    });
  }
}

// Andamentos
async function carregarAndamentos(processoId) {
  const el = document.getElementById('proc-andamentos-lista');
  if (!el) return;
  const dados = await db.get('andamentos_processos',
    `?processo_id=eq.${processoId}&order=data.desc&limit=30` +
    `&select=*,criado_por:usuarios(nome)`).catch(() => null);

  // Se tabela não existir ainda, mostra mensagem amigável
  if (!dados || dados.error) {
    el.innerHTML = `<div class="alert alert-blue">
      📋 Nenhum andamento registrado. Clique em "+ Andamento" para adicionar.
    </div>`;
    return;
  }
  if (!dados.length) {
    el.innerHTML = '<div class="text-gray text-xs" style="text-align:center;padding:24px">Nenhum andamento registrado ainda.</div>';
    return;
  }
  el.innerHTML = dados.map(a => {
    const podeEditar = !currentUser?.id || a.criado_por_id === currentUser.id || currentUser?.admin || currentUser?.judicial;
    // Badges segundo origem
    let origemBadge = '';
    if (a.origem === 'cnj-djen') origemBadge = `<span class="badge badge-amber" style="font-size:9px">📜 DJEN</span>`;
    else if (a.origem === 'tjsp-datajud') origemBadge = `<span class="badge badge-gray" style="font-size:9px">TJSP</span>`;
    const tipoBadge = a.tipo_documento || a.tipo || 'Andamento';
    const temTextoIntegral = !!a.texto_completo;
    // Botao dinamico:
    //  - Tem texto: "📖 Ver texto" (abre o modal com o que ja esta cacheado)
    //  - Nao tem, mas eh DJEN com id_comunicacao: "📥 Buscar texto (DJEN)"
    //    Chama a API do DJEN do navegador (IP BR passa no CloudFront) e
    //    salva no Supabase pra proxima.
    //  - Nao tem e nao eh DJEN: sem botao.
    let btnTexto = '';
    if (temTextoIntegral) {
      btnTexto = `<button class="btn btn-xs btn-primary" onclick="verTextoIntegral('${a.id}')" title="Ler decisão na íntegra">📖 Ver texto</button>`;
    } else if (a.origem === 'cnj-djen' && a.id_comunicacao) {
      btnTexto = `<button class="btn btn-xs btn-outline" onclick="buscarTextoDJENSobDemanda('${a.id}','${a.id_comunicacao}',this)" title="Baixar texto integral do DJEN (1a vez)">📥 Buscar texto (DJEN)</button>`;
    }
    return `
    <div style="padding:12px 0;border-bottom:1px solid var(--gray-100)" data-and-id="${a.id}">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="badge badge-blue">${tipoBadge}</span>
          ${origemBadge}
          <span class="text-xs text-gray">${a.data ? new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR') : '—'} · ${a.criado_por?.nome?.split(' ')[0] || (a.origem === 'cnj-djen' ? 'DJEN/CNJ' : a.origem === 'tjsp-datajud' ? 'TJSP' : '—')}</span>
        </div>
        <div class="flex gap-1">
          ${btnTexto}
          ${podeEditar ? `<button class="btn btn-xs btn-outline" onclick="editarAndamento('${a.id}')">✏️</button>
          <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirAndamento('${a.id}')">🗑️</button>` : ''}
        </div>
      </div>
      <div class="text-sm" style="margin-top:6px;white-space:pre-line" id="and-desc-${a.id}">${a.descricao||'—'}</div>
    </div>`;
  }).join('');
}

// ── DJEN sob demanda (busca do NAVEGADOR do usuario) ──────────────
// O CloudFront do CNJ bloqueia IPs fora do BR. O Apps Script (US) leva
// 403. Solucao: quando o advogado clicar em "Buscar texto (DJEN)", o
// fetch parte do NAVEGADOR dele (IP BR) e passa. Cacheia no Supabase
// pra proxima vez qualquer um abrir ja vir instantaneo.
const _DJEN_API_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

// Sync completo do DJEN pra 1 processo — busca TODAS as publicacoes
// pelo numero CNJ e insere as que ainda nao estao no banco.
async function sincronizarDJENProcesso() {
  if (!processoAtualId) return;
  const statusEl = document.getElementById('proc-djen-status');
  const setStatus = t => { if (statusEl) statusEl.textContent = t; };
  setStatus('⏳ Buscando dados do processo...');
  try {
    // Pega o número CNJ do processo
    const list = await db.get('processos', `?id=eq.${processoAtualId}&select=numero&limit=1`);
    const numeroRaw = list?.[0]?.numero;
    if (!numeroRaw) { setStatus('⚠️ Processo sem número CNJ.'); return; }
    // Remove máscara — DJEN aceita ambos mas alguns endpoints só sem máscara.
    // Ex: "1025685-46.2024.8.26.0003" → "10256854620248260003"
    const numero = String(numeroRaw).replace(/\D/g, '');
    if (numero.length < 14) {
      setStatus('⚠️ Número CNJ inválido: ' + numeroRaw);
      return;
    }
    console.log('[DJEN] numero limpo:', numero);

    // IDs de comunicação DJEN que já estão salvos, pra dedup
    const jaSalvos = await db.get('andamentos_processos',
      `?processo_id=eq.${processoAtualId}&id_comunicacao=not.is.null&select=id_comunicacao`);
    const setJaSalvos = new Set((jaSalvos||[]).map(x => String(x.id_comunicacao)));

    // Estratégia de retry: 1ª tentativa sem data-limite; se 500, retenta com
    // últimos 24 meses (historicos gigantes fazem o CNJ explodir).
    async function tentar(paginacao) {
      const params = new URLSearchParams({
        numeroProcesso: numero,
        itensPorPagina: '50',
        pagina: '1'
      });
      if (paginacao === 'ultimos24m') {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 2);
        params.set('dataDisponibilizacaoInicio', d.toISOString().slice(0,10));
      }
      const url = `${_DJEN_API_URL}?${params}`;
      console.log('[DJEN] fetch:', url);
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const bodyTxt = await r.text();
      console.log('[DJEN] HTTP', r.status, 'body (200 chars):', bodyTxt.substring(0, 200));
      return { ok: r.ok, status: r.status, body: bodyTxt };
    }

    setStatus('🔍 Consultando DJEN (CNJ)...');
    let resp = await tentar('completo');
    if (resp.status === 500) {
      setStatus('⚠️ DJEN devolveu 500 — retentando com últimos 24 meses...');
      resp = await tentar('ultimos24m');
    }
    if (!resp.ok) {
      const trecho = String(resp.body||'').substring(0, 150);
      setStatus(`⚠️ DJEN retornou HTTP ${resp.status}. ` +
        (resp.status === 403 ? 'CNJ bloqueou seu IP.' :
         resp.status === 500 ? 'Servidor CNJ indisponível ou processo sem publicações registradas no DJEN. Trecho: ' + trecho :
         resp.status === 404 ? 'Endpoint não encontrado (CNJ pode ter mudado a API).' :
         'Trecho: ' + trecho));
      return;
    }
    let j;
    try { j = JSON.parse(resp.body); } catch(e) {
      setStatus('⚠️ DJEN devolveu resposta não-JSON: ' + resp.body.substring(0,150));
      return;
    }
    if (!j || j.status !== 'success') {
      setStatus('⚠️ DJEN não devolveu status success. Resposta: ' + JSON.stringify(j).substring(0,200));
      return;
    }
    const pubs = j.items || [];
    if (!pubs.length) {
      setStatus('ℹ️ Nenhuma publicação DJEN encontrada pra esse processo.');
      return;
    }

    // Filtra as novas (não duplicadas por id_comunicacao)
    const novas = pubs.filter(p => p?.id && !setJaSalvos.has(String(p.id)));
    if (!novas.length) {
      setStatus(`✅ ${pubs.length} publicação(ões) — todas já estão no histórico.`);
      return;
    }

    setStatus(`💾 Salvando ${novas.length} publicação(ões) nova(s)...`);
    // Monta rows pra bulk insert
    const rows = novas.map(pub => {
      let dataPub = pub.data_disponibilizacao;
      if (!dataPub && pub.datadisponibilizacao) {
        // "DD/MM/AAAA" → "AAAA-MM-DD"
        dataPub = pub.datadisponibilizacao.split('/').reverse().join('-');
      }
      const tipoDoc = pub.tipoDocumento || pub.tipoComunicacao || 'Publicação';
      return {
        processo_id:    processoAtualId,
        data:           dataPub,
        descricao:      '[DJEN] ' + tipoDoc + (pub.nomeOrgao ? ' — ' + pub.nomeOrgao : ''),
        texto_completo: _djenExtrairTexto(pub),
        id_comunicacao: pub.id,
        tipo_documento: tipoDoc,
        link_origem:    pub.link || pub.linkurl || '',
        origem:         'cnj-djen'
      };
    });
    // Bulk insert via POST array
    for (const row of rows) {
      await db.insert('andamentos_processos', row);
    }
    const comTexto = rows.filter(r => r.texto_completo).length;
    setStatus(`✅ ${novas.length} publicação(ões) salva(s) (${comTexto} com texto integral).`);
    if (typeof showToast === 'function') showToast(`📥 ${novas.length} publicações DJEN`);
    carregarAndamentos(processoAtualId);
  } catch (e) {
    const isCors = /Failed to fetch|NetworkError|CORS/i.test(String(e && e.message || e));
    setStatus(isCors
      ? '⚠️ API do DJEN bloqueou o browser (CORS). Fala com o Rodrigo pra colocar proxy.'
      : '⚠️ Erro: ' + (e.message || e));
  }
}

function _djenExtrairTexto(pub) {
  if (!pub) return '';
  const cs = [
    pub.texto, pub.textoCompleto, pub.texto_completo,
    pub.textoCategoria, pub.textocategoria,
    pub.conteudo, pub.textoHtml, pub.textohtml, pub.textoHTML,
    pub.textoDocumento, pub.corpo,
    pub.inteiroTeor, pub.inteiro_teor
  ];
  for (const v of cs) {
    if (v && String(v).trim().length > 20) return String(v);
  }
  return '';
}

async function _djenFetchDetalhe(idComunicacao) {
  const urls = [
    `${_DJEN_API_URL}/${encodeURIComponent(idComunicacao)}`,
    `${_DJEN_API_URL}/${encodeURIComponent(idComunicacao)}/inteiroteor`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) continue;
      const raw = await r.text();
      if (!raw) continue;
      // Pode vir HTML puro no inteiroteor
      if (raw.charAt(0) !== '{' && raw.charAt(0) !== '[') {
        return { textoHtml: raw };
      }
      const j = JSON.parse(raw);
      if (j && j.items && j.items.length) return j.items[0];
      if (j && j.item) return j.item;
      if (j) return j;
    } catch (_) { /* CORS ou rede — tenta próximo */ }
  }
  return null;
}

async function buscarTextoDJENSobDemanda(andamentoId, idComunicacao, btnEl) {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Buscando...';
  }
  try {
    const det = await _djenFetchDetalhe(idComunicacao);
    const texto = det ? _djenExtrairTexto(det) : '';
    if (!texto) {
      showToast('⚠️ Texto não retornado. Pode ser que o DJEN não tenha o inteiro teor dessa comunicação.');
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '📥 Buscar texto (DJEN)'; }
      return;
    }
    // Cacheia no Supabase pra proxima vez qualquer um abrir
    const patch = { texto_completo: texto };
    const ok = await db.update('andamentos_processos', andamentoId, patch);
    if (!ok) {
      showToast('⚠️ Baixou o texto, mas falhou ao salvar: ' + (db.lastError || ''));
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '📥 Buscar texto (DJEN)'; }
      return;
    }
    showToast('✅ Texto salvo. Abrindo...');
    // Abre o modal com o texto (verTextoIntegral relê do banco)
    verTextoIntegral(andamentoId);
    // Atualiza a linha da lista sem precisar recarregar tudo
    if (btnEl) {
      btnEl.outerHTML = `<button class="btn btn-xs btn-primary" onclick="verTextoIntegral('${andamentoId}')" title="Ler decisão na íntegra">📖 Ver texto</button>`;
    }
  } catch (e) {
    // Tipico de CORS no browser: TypeError: Failed to fetch
    const isCors = /Failed to fetch|NetworkError|CORS/i.test(String(e && e.message || e));
    showToast(isCors
      ? '⚠️ API do DJEN bloqueou o browser (CORS). Fala com o Rodrigo pra colocar um proxy.'
      : '⚠️ Erro: ' + (e.message || e));
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '📥 Buscar texto (DJEN)'; }
  }
}

// Abre modal com texto integral do andamento (DJEN ou manual). O texto
// vem em HTML do CNJ — renderizado dentro de iframe sandbox por seguranca.
async function verTextoIntegral(andamentoId) {
  let modal = document.getElementById('modal-andamento-texto');
  if (!modal) {
    // Cria modal sob demanda
    modal = document.createElement('div');
    modal.id = 'modal-andamento-texto';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:780px;max-width:95vw">
        <div class="modal-header">
          <div>
            <div class="modal-title">📜 Texto integral</div>
            <div class="text-xs text-gray" id="and-texto-sub">—</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-andamento-texto')">×</button>
        </div>
        <div class="modal-body" style="padding:0">
          <iframe id="and-texto-iframe" sandbox="allow-same-origin" style="width:100%;height:65vh;border:0;background:#fff"></iframe>
        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <a id="and-texto-link" target="_blank" rel="noopener" class="btn btn-outline" style="display:none">🔗 Abrir no e-SAJ</a>
          <button class="btn btn-secondary" onclick="closeModal('modal-andamento-texto')">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  const list = await db.get('andamentos_processos',
    `?id=eq.${andamentoId}&select=*,processo:processos(numero)`);
  const a = list?.[0];
  if (!a) { showToast('⚠️ Andamento não encontrado.'); return; }
  const sub = document.getElementById('and-texto-sub');
  const partes = [];
  if (a.tipo_documento) partes.push(a.tipo_documento);
  if (a.data) partes.push(new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR'));
  if (a.processo?.numero) partes.push(a.processo.numero);
  if (sub) sub.textContent = partes.join(' · ');
  const link = document.getElementById('and-texto-link');
  if (link) {
    if (a.link_origem) { link.href = a.link_origem; link.style.display = 'inline-flex'; }
    else { link.style.display = 'none'; }
  }
  const iframe = document.getElementById('and-texto-iframe');
  if (iframe) {
    // texto_completo vem como HTML do DJEN — renderiza em sandbox
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">
      <style>body{font-family:Georgia,serif;padding:24px;line-height:1.55;color:#111}</style></head>
      <body>${a.texto_completo || '<i>(sem texto integral disponível)</i>'}</body></html>`;
    iframe.srcdoc = html;
  }
  openModal('modal-andamento-texto');
}

// Edita um andamento existente (in-line via prompt + update)
async function editarAndamento(id) {
  const dados = await db.get('andamentos_processos', `?id=eq.${id}&select=*`);
  const a = dados?.[0];
  if (!a) { showToast('⚠️ Andamento nao encontrado.'); return; }
  const novaDesc = prompt('Editar descrição do andamento:', a.descricao||'');
  if (novaDesc === null) return; // cancelou
  if (!novaDesc.trim()) { showToast('⚠️ Descrição não pode ficar vazia.'); return; }
  await db.update('andamentos_processos', id, { descricao: novaDesc.trim() });
  showToast('✅ Andamento atualizado.');
  if (processoAtualId) carregarAndamentos(processoAtualId);
}

// Exclui um andamento apos confirmacao
async function excluirAndamento(id) {
  if (!confirm('Excluir este andamento? Esta acao nao pode ser desfeita.')) return;
  await db.delete('andamentos_processos', id);
  showToast('🗑️ Andamento excluído.');
  if (processoAtualId) carregarAndamentos(processoAtualId);
}

// Prazos do processo
async function carregarPrazosProcesso(processoId) {
  const el = document.getElementById('proc-prazos-lista');
  if (!el) return;
  const dados = await db.get('prazos',
    `?processo_id=eq.${processoId}&order=vencimento.asc&select=*,responsavel:usuarios(nome)`);
  if (!dados?.length) {
    el.innerHTML = '<div class="text-gray text-xs" style="text-align:center;padding:24px">Nenhum prazo cadastrado para este processo.</div>';
    return;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:var(--gray-50)">
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Tipo</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Vencimento</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Responsável</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Status</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Ações</th>
    </tr></thead>
    <tbody>${dados.map(p => {
      const diff = Math.ceil((new Date(p.vencimento+'T12:00:00') - new Date()) / (1000*60*60*24));
      const cls = p.concluido ? 'badge-green' : diff<=0 ? 'badge-red' : diff<=5 ? 'badge-amber' : 'badge-blue';
      const label = p.concluido ? '✅ Concluído' : diff<=0 ? 'Vencido' : diff===1 ? 'Amanhã' : `${diff} dias`;
      const desc = ((p.referencia||p.tipo||'').replace(/'/g,'')).substring(0,30);
      const botaoConcluir = p.concluido ? '' :
        `<button class="btn btn-xs btn-outline" style="color:var(--green)" onclick="concluirPrazoProcesso('${p.id}','${desc}')" title="Concluir">✅</button>`;
      return `<tr style="border-bottom:1px solid var(--gray-100)">
        <td style="padding:10px 8px;font-size:13px">${p.tipo}</td>
        <td style="padding:10px 8px;font-size:13px">${new Date(p.vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</td>
        <td style="padding:10px 8px;font-size:13px">${p.responsavel?.nome?.split(' ')[0]||'—'}</td>
        <td style="padding:10px 8px"><span class="badge ${cls}">${label}</span></td>
        <td style="padding:10px 8px"><div class="flex gap-1">
          ${botaoConcluir}
          <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirPrazoProcesso('${p.id}','${desc}')" title="Excluir">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

async function concluirPrazoProcesso(id, desc) {
  if (!confirm(`Marcar prazo "${desc}" como concluído?`)) return;
  await db.update('prazos', id, { concluido: true });
  showToast('✅ Prazo concluído.');
  if (processoAtualId) carregarPrazosProcesso(processoAtualId);
  if (typeof carregarPrazos === 'function') carregarPrazos();
}

async function excluirPrazoProcesso(id, desc) {
  if (!confirm(`Excluir prazo "${desc}"? Esta ação não pode ser desfeita.`)) return;
  await db.delete('prazos', id);
  showToast('🗑️ Prazo excluído.');
  if (processoAtualId) carregarPrazosProcesso(processoAtualId);
  if (typeof carregarPrazos === 'function') carregarPrazos();
}

// Financeiro do processo
async function carregarFinanceiroProcesso(processoId) {
  const el = document.getElementById('proc-financeiro-lista');
  const resumoEl = document.getElementById('proc-financeiro-resumo');
  if (!el) return;
  const dados = await db.get('financeiro',
    `?processo_id=eq.${processoId}&order=criado_em.desc`);
  if (!dados?.length) {
    if (resumoEl) resumoEl.style.display = 'none';
    el.innerHTML = '<div class="text-gray text-xs" style="text-align:center;padding:24px">Nenhum lançamento financeiro para este processo.</div>';
    return;
  }
  const totalVal = dados.reduce((s,d) => s + Number(d.valor||0), 0);
  const totalRec = dados.reduce((s,d) => s + Number(d.recebido||0), 0);
  const saldo = totalVal - totalRec;
  if (resumoEl) {
    resumoEl.style.display = 'grid';
    resumoEl.innerHTML = `
      <div style="padding:12px;background:var(--blue-50);border-radius:8px;text-align:center">
        <div class="text-xs text-gray">Total</div>
        <div class="font-semibold" style="color:var(--blue-700)">R$ ${totalVal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      </div>
      <div style="padding:12px;background:var(--green-light);border-radius:8px;text-align:center">
        <div class="text-xs text-gray">Recebido</div>
        <div class="font-semibold" style="color:var(--green)">R$ ${totalRec.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      </div>
      <div style="padding:12px;background:${saldo>0?'var(--amber-light)':'var(--green-light)'};border-radius:8px;text-align:center">
        <div class="text-xs text-gray">A receber</div>
        <div class="font-semibold" style="color:${saldo>0?'var(--amber)':'var(--green)'}">R$ ${saldo.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      </div>`;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;margin-top:8px">
    <thead><tr style="background:var(--gray-50)">
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Tipo</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Descrição</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Valor</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Recebido</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Status</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:var(--gray-500)">Ações</th>
    </tr></thead>
    <tbody>${dados.map(f => {
      const statusCls = f.status==='quitado'?'badge-green':f.status==='parcial'?'badge-amber':'badge-red';
      const statusLabel = f.status==='quitado'?'Quitado':f.status==='parcial'?'Parcial':'Em aberto';
      const descCurta = (f.descricao||f.tipo||'').replace(/'/g,'').substring(0,40);
      return `<tr style="border-bottom:1px solid var(--gray-100)">
        <td style="padding:10px 8px;font-size:12px">${f.tipo||'—'}</td>
        <td style="padding:10px 8px;font-size:12px">${f.descricao||'—'}</td>
        <td style="padding:10px 8px;font-size:13px;font-weight:600">R$ ${Number(f.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td style="padding:10px 8px;font-size:13px">R$ ${Number(f.recebido||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td style="padding:10px 8px"><span class="badge ${statusCls}">${statusLabel}</span></td>
        <td style="padding:10px 8px"><div class="flex gap-1">
          <button class="btn btn-xs btn-outline" onclick="abrirEditarFinanceiro('${f.id}')" title="Editar">✏️</button>
          <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirFinanceiro('${f.id}','${descCurta}')" title="Excluir">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

// Documentos do processo
async function carregarDocumentosProcesso(processoId) {
  const el = document.getElementById('proc-documentos-lista');
  if (!el) return;
  const dados = await db.get('documentos',
    `?processo_id=eq.${processoId}&order=criado_em.desc&select=*,autor:usuarios!documentos_autor_id_fkey(nome)`);
  if (!dados?.length) {
    el.innerHTML = '<div class="text-gray text-xs" style="text-align:center;padding:24px">Nenhum documento gerado para este processo ainda.</div>';
    return;
  }
  const statusMap = {rascunho:'badge-gray',em_revisao:'badge-amber',aprovado:'badge-green',devolvido:'badge-red'};
  el.innerHTML = dados.map(d => `
    <div style="padding:12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px">
      <div class="flex justify-between items-center">
        <div>
          <span class="font-semibold text-sm">${d.protocolo}</span>
          <span class="text-xs text-gray" style="margin-left:8px">${d.tipo||'—'}</span>
        </div>
        <div class="flex gap-2 items-center">
          <span class="badge ${statusMap[d.status]||'badge-gray'}">${d.status||'—'}</span>
          <button class="btn btn-xs btn-outline" onclick="abrirRevisao('${d.id}')">Ver</button>
        </div>
      </div>
      <div class="text-xs text-gray" style="margin-top:4px">
        ${d.autor?.nome?.split(' ')[0]||'—'} · ${new Date(d.criado_em).toLocaleDateString('pt-BR')} · ${(d.tokens_usados||0).toLocaleString('pt-BR')} tokens
      </div>
    </div>`).join('');
}

// Salvar Andamento
async function salvarAndamento() {
  const descricao = document.getElementById('and-descricao')?.value?.trim();
  const data      = document.getElementById('and-data')?.value;
  const tipo      = document.getElementById('and-tipo')?.value;
  if (!descricao) { alert('Preencha a descrição do andamento.'); return; }
  await db.insert('andamentos_processos', {
    processo_id: processoAtualId,
    descricao, tipo,
    data: data || new Date().toISOString().slice(0,10),
    criado_por_id: currentUser.id || null
  }).catch(() => null);
  closeModal('modal-add-andamento');
  showToast('✅ Andamento salvo!');
  carregarAndamentos(processoAtualId);
}

// Salvar Prazo do Processo
async function salvarPrazoProcesso() {
  const tipo       = document.getElementById('prazo-proc-tipo')?.value;
  const vencimento = document.getElementById('prazo-proc-vencimento')?.value;
  const obs        = document.getElementById('prazo-proc-obs')?.value;
  if (!vencimento) { alert('Selecione o vencimento.'); return; }
  await db.insert('prazos', {
    processo_id: processoAtualId,
    tipo, vencimento,
    observacoes: obs,
    responsavel_id: currentUser.id,
    concluido: false
  });
  closeModal('modal-add-prazo-proc');
  showToast('✅ Prazo salvo!');
  carregarPrazosProcesso(processoAtualId);
  carregarPrazos();
}

// Salvar Financeiro
let _financeiroEditId = null;

async function salvarFinanceiro() {
  const tipo      = document.getElementById('fin-tipo')?.value;
  const valor     = parseFloat(document.getElementById('fin-valor')?.value) || 0;
  const recebido  = parseFloat(document.getElementById('fin-recebido')?.value) || 0;
  const descricao = document.getElementById('fin-descricao')?.value;
  const venc      = document.getElementById('fin-vencimento')?.value;
  if (!valor) { alert('Informe o valor.'); return; }
  const status = recebido >= valor ? 'quitado' : recebido > 0 ? 'parcial' : 'aberto';
  const payload = {
    tipo, descricao, valor, recebido, status,
    vencimento: venc || null
  };
  if (_financeiroEditId) {
    await db.update('financeiro', _financeiroEditId, payload);
    showToast('✅ Lançamento atualizado!');
  } else {
    payload.processo_id = processoAtualId;
    await db.insert('financeiro', payload);
    showToast('✅ Lançamento salvo!');
  }
  _financeiroEditId = null;
  closeModal('modal-add-financeiro');
  carregarFinanceiroProcesso(processoAtualId);
}

async function abrirEditarFinanceiro(id) {
  const list = await db.get('financeiro', `?id=eq.${id}`);
  const f = list?.[0];
  if (!f) { showToast('⚠️ Lançamento não encontrado.'); return; }
  _financeiroEditId = id;
  document.getElementById('fin-tipo').value      = f.tipo || 'Honorarios';
  document.getElementById('fin-valor').value     = f.valor || '';
  document.getElementById('fin-recebido').value  = f.recebido || '0';
  document.getElementById('fin-descricao').value = f.descricao || '';
  document.getElementById('fin-vencimento').value = f.vencimento || '';
  openModal('modal-add-financeiro');
}

async function excluirFinanceiro(id, descricao) {
  if (!confirm(`Excluir lançamento "${descricao}"? Esta ação não pode ser desfeita.`)) return;
  await db.delete('financeiro', id);
  showToast('🗑️ Lançamento excluído.');
  carregarFinanceiroProcesso(processoAtualId);
}

function abrirAddAndamento() {
  document.getElementById('and-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('and-descricao').value = '';
  openModal('modal-add-andamento');
}
function abrirAddPrazo()      { openModal('modal-add-prazo-proc'); }
function abrirAddFinanceiro() {
  _financeiroEditId = null;
  document.getElementById('fin-valor').value = '';
  document.getElementById('fin-recebido').value = '0';
  document.getElementById('fin-descricao').value = '';
  document.getElementById('fin-vencimento').value = '';
  openModal('modal-add-financeiro');
}


// ─── ABRIR NO E-SAJ TJSP ─────────────────────────────────
// O DataJud (CNJ) so retorna metadados dos movimentos — texto integral de
// sentencas e decisoes esta apenas nos autos do e-SAJ. Esta funcao abre a
// consulta processual no e-SAJ TJSP do processo atual numa nova aba.
function abrirNoESAJ() {
  const modal = document.getElementById('modal-processo-detalhe');
  const cnj = (modal?.dataset?.cnj || '').trim();
  if (!cnj) { showToast('⚠️ Numero do processo nao identificado.'); return; }
  // E-SAJ TJSP — consulta de 1o grau (CPOPG). Aceita o numero CNJ com mascara
  // ou sem. Usamos com mascara que e o que esta cadastrado no sistema.
  const url = 'https://esaj.tjsp.jus.br/cpopg/search.do'
    + '?conversationId='
    + '&cbPesquisa=NUMPROC'
    + '&numeroDigitoAnoUnificado=' + encodeURIComponent(cnj.substring(0, 13))
    + '&foroNumeroUnificado=' + encodeURIComponent(cnj.slice(-4))
    + '&dadosConsulta.valorConsultaNuUnificado=' + encodeURIComponent(cnj)
    + '&dadosConsulta.tipoNuProcesso=UNIFICADO';
  window.open(url, '_blank', 'noopener');
}

// ─── EMAIL DO CLIENTE ────────────────────────────────────

// ════════════════════════════════════════════════════════
// AVISOS DE ENVIO — bounces capturados pelo sweeper GAS
// ════════════════════════════════════════════════════════

const TIPO_ERRO_LABEL = {
  address_not_found: { label:'Endereço inexistente',  bg:'#fee2e2', cor:'#991b1b' },
  inbox_full:        { label:'Caixa cheia',           bg:'#fef3c7', cor:'#92400e' },
  blocked_dkim:      { label:'Bloqueado (DKIM)',      bg:'#fce7f3', cor:'#9d174d' },
  mailbox_disabled:  { label:'Caixa desativada',      bg:'#e0e7ff', cor:'#3730a3' },
  other:             { label:'Outro',                 bg:'#e2e8f0', cor:'#475569' },
};

const SISTEMA_LABEL = {
  'juridico-tjsp':  '⚖️ Jurídico (TJSP/DJEN)',
  'requisicao':     '📋 Requisição',
  'manutencao':     '🔧 Manutenção',
  'entrega-chaves': '🔑 Entrega de chaves',
  'usuario':        '👤 Usuário do sistema',
  'desconhecido':   'Origem não identificada',
};

async function carregarAvisos() {
  const tbody = document.getElementById('tb-avisos');
  if (!tbody) return;
  const status = document.getElementById('avisos-filtro-status')?.value ?? 'aberto';
  let query = '?order=recebido_em.desc.nullslast,criado_em.desc&limit=200';
  if (status) query += `&status=eq.${status}`;

  let dados;
  try {
    dados = await db.get('notificacoes_falha', query);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--danger)">Erro: ${e.message}. A tabela já foi criada no Supabase?</td></tr>`;
    return;
  }

  if (!dados?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">Nenhum aviso. 🎉</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(a => {
    const erro = TIPO_ERRO_LABEL[a.tipo_erro] || TIPO_ERRO_LABEL.other;
    const sistema = SISTEMA_LABEL[a.origem_sistema] || a.origem_sistema || '—';
    const recebido = a.recebido_em ? new Date(a.recebido_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    const trStyle = a.status !== 'aberto' ? 'opacity:.5;background:#f8fafc' : '';
    const acoes = a.status === 'aberto'
      ? `<button class="btn btn-o bsm" onclick="marcarAvisoResolvido('${a.id}')" title="Marcar como resolvido">✓ Resolvido</button>
         <button class="btn btn-o bsm" onclick="ignorarAviso('${a.id}')" title="Ignorar este aviso">Ignorar</button>`
      : `<button class="btn btn-o bsm" onclick="reabrirAviso('${a.id}')">Reabrir</button>`;
    const cad = a.cadastrado_por_nome
      ? `<div style="font-size:13px">${a.cadastrado_por_nome.split(' ').slice(0,2).join(' ')}</div>`
      : `<div style="font-size:11px;color:var(--muted)">não identificado</div>`;
    return `<tr style="${trStyle}">
      <td>
        <div style="font-weight:600;font-size:13px;font-family:monospace">${a.email_destinatario}</div>
        ${a.mensagem_erro ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;max-width:340px">${a.mensagem_erro.substring(0,120)}</div>` : ''}
      </td>
      <td><span style="display:inline-block;padding:3px 9px;border-radius:99px;background:${erro.bg};color:${erro.cor};font-size:11px;font-weight:600">${erro.label}</span></td>
      <td>
        <div style="font-size:12px">${sistema}</div>
        ${a.origem_protocolo ? `<div style="font-size:11px;color:var(--muted);font-family:monospace">${a.origem_protocolo}</div>` : ''}
      </td>
      <td>${cad}</td>
      <td style="font-size:12px;color:var(--muted)">${recebido}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">${acoes}</div></td>
    </tr>`;
  }).join('');

  atualizarBadgeAvisos();
}

async function marcarAvisoResolvido(id) {
  try {
    await db.patch('notificacoes_falha', id, { status:'resolvido', resolvido_em:new Date().toISOString(), resolvido_por: CUR?.id || null });
    toast?.('✓ Marcado como resolvido','ok');
    carregarAvisos();
  } catch(e) { toast?.('Erro: '+e.message,'err'); }
}

async function ignorarAviso(id) {
  if (!confirm('Ignorar este aviso? Use quando o email é genérico / teste.')) return;
  try {
    await db.patch('notificacoes_falha', id, { status:'ignorado', resolvido_em:new Date().toISOString(), resolvido_por: CUR?.id || null });
    toast?.('Aviso ignorado','ok');
    carregarAvisos();
  } catch(e) { toast?.('Erro: '+e.message,'err'); }
}

async function reabrirAviso(id) {
  try {
    await db.patch('notificacoes_falha', id, { status:'aberto', resolvido_em:null, resolvido_por:null });
    toast?.('Aviso reaberto','ok');
    carregarAvisos();
  } catch(e) { toast?.('Erro: '+e.message,'err'); }
}

// Atualiza o sininho no topbar com a contagem de abertos.
async function atualizarBadgeAvisos() {
  try {
    const arr = await db.get('notificacoes_falha', '?status=eq.aberto&select=id&limit=200');
    const n = (arr||[]).length;
    const badge = document.getElementById('badge-avisos');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
  } catch(_){}
}

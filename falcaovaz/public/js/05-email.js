async function salvarEmailCliente() {
  if (!processoAtualId) return;
  const nome  = document.getElementById('proc-email-nome')?.value.trim() || '';
  const email = document.getElementById('proc-email-addr')?.value.trim() || '';
  const ativo = document.getElementById('proc-notif-ativo')?.checked || false;
  await db.update('processos', processoAtualId, {
    nome_cliente: nome, email_cliente: email, notif_email_ativo: ativo
  });
  showToast('✅ Email do cliente salvo!');
}

async function toggleNotifEmail(ativo) {
  if (!processoAtualId) return;
  await db.update('processos', processoAtualId, { notif_email_ativo: ativo });
  showToast(ativo ? '✅ Notificação mensal ativada' : 'Notificação mensal desativada');
}

async function enviarEmailClienteAgora() {
  const email = document.getElementById('proc-email-addr')?.value.trim();
  const nome  = document.getElementById('proc-email-nome')?.value.trim();
  if (!email) { showToast('⚠️ Cadastre o email do cliente primeiro.'); return; }
  await salvarEmailCliente();

  // Busca andamentos do último mês
  const umMesAtras = new Date(); umMesAtras.setMonth(umMesAtras.getMonth()-1);
  const andamentos = await db.get('andamentos_processos',
    `?processo_id=eq.${processoAtualId}&data=gte.${umMesAtras.toISOString().slice(0,10)}&order=data.desc&limit=10`
  ).catch(() => []);

  const numero = document.getElementById('proc-det-titulo')?.textContent || '';
  const responsavel = document.getElementById('proc-det-resp')?.textContent || '';

  showToast('📨 Enviando email...');
  try {
    // Verifica se a URL do Apps Script foi configurada
    if (!GAS_EMAIL_JURIDICO || GAS_EMAIL_JURIDICO.includes('COLE_URL')) {
      showToast('⚠️ URL do servico de email nao configurada (GAS_EMAIL_JURIDICO em 00-config.js)');
      return;
    }
    const payload = {
      email_cliente: email, nome_cliente: nome,
      numero_processo: numero, advogado: responsavel,
      andamentos: andamentos.map(a => ({
        data: a.data ? new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR') : '—',
        descricao: a.descricao
      }))
    };
    const url = GAS_EMAIL_JURIDICO
      + '?action=enviar_email_processo'
      + '&data=' + encodeURIComponent(JSON.stringify(payload))
      + '&t=' + Date.now();
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.success) {
      showToast('✅ Email enviado para ' + email);
      await db.insert('notificacoes_email', {
        processo_id: processoAtualId, email_destino: email,
        assunto: `Atualização do processo ${numero}`, status: 'enviado'
      }).catch(() => {});
    } else {
      showToast('❌ Erro: ' + (data.error || 'tente novamente'));
    }
  } catch(e) {
    console.error('[enviarEmailClienteAgora]', e);
    showToast('❌ Erro de conexão ao enviar email');
  }
}

// ─── CARREGAR PROCESSOS ───────────────────────────────────

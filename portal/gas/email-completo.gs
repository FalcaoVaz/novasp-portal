// ════════════════════════════════════════════════════════════════
//  FALCÃOVAZ — Serviço de Email do Jurídico (Google Apps Script)
//  Substitui a Netlify Function + Resend.
//  Envia emails diretamente da conta Google logada — quem deploya esse
//  Apps Script vira o remetente dos emails enviados.
//  Reply-to aponta para novasaopaulo.sp@gmail.com (caixa que recebe respostas).
// ════════════════════════════════════════════════════════════════

var EMAIL_REMETENTE = 'Jurídico Nova São Paulo';
var REPLY_TO        = 'novasaopaulo.sp@gmail.com';

// ── FÓRUM DOS REPRESENTANTES: lista de destino ─────────────────
// Ajuste os emails dos gerentes se estiverem diferentes.
var FORUM_EMAILS_DESTINO = [
  // 5 representantes
  'ricardo.angerami@novasaopaulo.com.br',
  'maria.matias@novasaopaulo.com.br',
  'domenica@novasaopaulo.com.br',
  'willian@novasaopaulo.com.br',
  'won.chang@novasaopaulo.com.br',
  // Gerentes (confirme os emails reais)
  'renata@novasaopaulo.com.br',
  'felippe@novasaopaulo.com.br',
  'christiane@novasaopaulo.com.br',
  'emilia@novasaopaulo.com.br',
  // Admin
  'rodrigo@falcaovaz.com.br'
];

function doGet(e) {
  var output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  if (!e || !e.parameter) {
    output.setContent(JSON.stringify({ success: false, error: 'Acesse via URL do Web App' }));
    return output;
  }

  var action   = e.parameter.action || '';
  var callback = e.parameter.callback || '';
  var result;

  try {
    if (action === 'enviar_email_processo') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = enviarEmailProcesso(dados);
    } else if (action === 'enviar_boas_vindas') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = enviarBoasVindas(dados);
    } else if (action === 'enviar_manual') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = enviarManualUso(dados);
    } else if (action === 'solicitar_reset') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = solicitarReset(dados);
    } else if (action === 'verificar_reset') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = verificarReset(dados);
    } else if (action === 'forum_novo_topico') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = forumNovoTopico(dados);
    } else if (action === 'forum_decisao') {
      var dados = JSON.parse(e.parameter.data || '{}');
      result = forumDecisao(dados);
    } else {
      result = { success: false, error: 'Acao desconhecida: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.toString() };
  }

  var json = JSON.stringify(result);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  output.setContent(json);
  return output;
}

function enviarEmailProcesso(dados) {
  var email      = dados.email_cliente || dados.email;
  var nome       = dados.nome_cliente  || dados.nome  || 'cliente';
  var numero     = dados.numero_processo || '';
  var advogado   = dados.advogado || '';
  var andamentos = dados.andamentos || [];

  if (!email) return { success: false, error: 'email_cliente obrigatorio' };
  if (!numero) return { success: false, error: 'numero_processo obrigatorio' };

  var andamentosHtml = '';
  if (andamentos.length) {
    andamentos.forEach(function(a){
      andamentosHtml +=
        '<tr>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">' + (a.data || '—') + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">' + (a.descricao || '—') + '</td>' +
        '</tr>';
    });
  } else {
    andamentosHtml =
      '<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8">Nenhum andamento recente.</td></tr>';
  }

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +

'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">Imobiliária — Jurídico</div>' +
'</div>' +

'<div style="padding:32px">' +
'<p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px">Olá, ' + nome + '!</p>' +
'<p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">' +
'Seguem as atualizações do seu processo <strong style="color:#1E2D4A">' + numero + '</strong> referentes ao último mês.' +
'</p>' +

'<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:24px">' +
'<div style="background:#f8fafc;padding:12px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:1px solid #e2e8f0">' +
'Andamentos Recentes</div>' +
'<table style="width:100%;border-collapse:collapse">' +
'<thead><tr style="background:#f8fafc">' +
'<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Data</th>' +
'<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Movimentação</th>' +
'</tr></thead>' +
'<tbody>' + andamentosHtml + '</tbody>' +
'</table>' +
'</div>' +

'<p style="font-size:13px;color:#94a3b8;line-height:1.6">' +
'Em caso de dúvidas, entre em contato com seu advogado responsável' +
(advogado ? ': <strong>' + advogado + '</strong>' : '') + '.' +
'</p>' +
'</div>' +

'<div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:12px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'<p style="font-size:11px;color:#cbd5e1;margin:4px 0 0">Este email foi enviado automaticamente pelo sistema jurídico.</p>' +
'</div>' +

'</div></body></html>';

  MailApp.sendEmail({
    to:       email,
    subject:  'Atualização do seu processo ' + numero + ' — Nova São Paulo',
    htmlBody: html,
    name:     EMAIL_REMETENTE,
    replyTo:  REPLY_TO
  });

  return { success: true, destino: email };
}

// ════════════════════════════════════════════════════════════════
//  ENVIAR EMAIL DE BOAS-VINDAS (novo funcionario cadastrado)
//  Payload esperado:
//    { email, nome, lider, portal_url }
// ════════════════════════════════════════════════════════════════
function enviarBoasVindas(dados) {
  var email      = dados.email;
  var nome       = dados.nome || 'colega';
  var lider      = dados.lider || 'a liderança';
  var portalUrl  = dados.portal_url || 'https://novasp.netlify.app';

  if (!email) return { success: false, error: 'email obrigatorio' };

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">Bem-vinda(o) ao Portal Interno</div>' +
'</div>' +
'<div style="padding:32px">' +
'<p style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 12px">Olá, ' + nome + '! 👋</p>' +
'<p style="font-size:14px;color:#475569;margin:0 0 18px;line-height:1.6">' +
'Você foi cadastrada(o) no <strong>Portal Interno</strong> da Nova São Paulo Imobiliária por <strong>' + lider + '</strong>. ' +
'É o seu ponto único de acesso ao dia a dia da empresa — abaixo um resumo do que você encontra por lá.' +
'</p>' +

'<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px;margin-bottom:22px">' +
'<div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Como acessar pela primeira vez</div>' +
'<ol style="font-size:14px;color:#334155;line-height:1.8;margin:0;padding-left:20px">' +
'<li>Acesse <a href="' + portalUrl + '" style="color:#2563eb;font-weight:600">' + portalUrl + '</a></li>' +
'<li>Informe seu email: <strong>' + email + '</strong> (ou seu nome)</li>' +
'<li>Crie sua senha pessoal (mínimo 4 caracteres)</li>' +
'<li>Pronto! Use a mesma senha nos próximos acessos.</li>' +
'</ol>' +
'<div style="font-size:12px;color:#64748b;margin-top:10px">Esqueceu a senha depois? Na tela de login há a opção <strong>"Esqueci minha senha"</strong> — enviamos um código para este email.</div>' +
'</div>' +

'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px">O que você encontra no portal</div>' +

'<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:10px">' +

'<div style="padding:14px 16px;border-bottom:1px solid #eef2f7">' +
'<div style="font-size:14px;font-weight:600;color:#1e293b">🏠 Sistema Interno</div>' +
'<div style="font-size:13px;color:#64748b;line-height:1.6;margin-top:3px">' +
'<strong>Manutenção Predial</strong> (chamados de manutenção dos imóveis), <strong>Requisições Internas</strong> (TI, manutenção interna e outras solicitações) e <strong>Entrega de Chaves</strong> (agendamento, vistoria, reparos e liberação).' +
'</div></div>' +

'<div style="padding:14px 16px;border-bottom:1px solid #eef2f7">' +
'<div style="font-size:14px;font-weight:600;color:#1e293b">📅 Agenda &amp; Tarefas</div>' +
'<div style="font-size:13px;color:#64748b;line-height:1.6;margin-top:3px">' +
'Suas <strong>tarefas</strong> e prazos, a <strong>agenda</strong> de compromissos da equipe, as <strong>pautas das reuniões</strong> de terça e quarta e os <strong>horários livres</strong> para marcar encontros.' +
'</div></div>' +

'<div style="padding:14px 16px;border-bottom:1px solid #eef2f7">' +
'<div style="font-size:14px;font-weight:600;color:#1e293b">⚖️ Jurídico (FalcãoVaz)</div>' +
'<div style="font-size:13px;color:#64748b;line-height:1.6;margin-top:3px">' +
'Processos, prazos, geração de <strong>petições e documentos com IA</strong>, financeiro e <strong>chamados ao jurídico</strong>. Abre direto pelo portal, sem novo login.' +
'</div></div>' +

'<div style="padding:14px 16px">' +
'<div style="font-size:14px;font-weight:600;color:#1e293b">👥 Gestão <span style="font-size:11px;font-weight:600;color:#92400e;background:#fef3c7;padding:2px 8px;border-radius:99px;margin-left:4px">para líderes</span></div>' +
'<div style="font-size:13px;color:#64748b;line-height:1.6;margin-top:3px">' +
'Cadastro de <strong>liderados</strong>, <strong>avaliações mensais</strong>, configuração de <strong>tarefas e pontos de bônus</strong> e a <strong>apuração do bônus</strong> da equipe.' +
'</div></div>' +

'</div>' +

'<p style="font-size:13px;color:#94a3b8;line-height:1.6;margin-top:18px">Os módulos que aparecem para você dependem do seu perfil de acesso. Em caso de dúvidas, responda este email ou fale com ' + lider + '.</p>' +
'</div>' +
'<div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'</div>' +
'</div></body></html>';

  MailApp.sendEmail({
    to:       email,
    subject:  '👋 Bem-vinda(o) ao Portal Nova São Paulo — Crie sua senha',
    htmlBody: html,
    name:     'Nova São Paulo Imobiliária',
    replyTo:  REPLY_TO
  });
  return { success: true, destino: email };
}

// ════════════════════════════════════════════════════════════════
//  MANUAL DE USO (passo a passo de TODAS as funcionalidades)
//  Payload: { email, nome, portal_url }
// ════════════════════════════════════════════════════════════════
function _mPasso(passos) {
  var li = '';
  for (var i = 0; i < passos.length; i++) {
    li += '<li style="margin-bottom:5px">' + passos[i] + '</li>';
  }
  return '<ol style="font-size:13px;color:#334155;line-height:1.6;margin:6px 0 0;padding-left:20px">' + li + '</ol>';
}
function _mItem(titulo, corpoHtml) {
  return '<div style="margin-bottom:14px">' +
    '<div style="font-size:13px;font-weight:700;color:#1E2D4A">' + titulo + '</div>' +
    corpoHtml + '</div>';
}
function _mSec(emoji, titulo, subtitulo, corpoHtml) {
  return '<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px">' +
    '<div style="background:#1E2D4A;padding:12px 16px">' +
    '<div style="font-size:15px;font-weight:700;color:#fff">' + emoji + ' ' + titulo + '</div>' +
    (subtitulo ? '<div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:2px">' + subtitulo + '</div>' : '') +
    '</div>' +
    '<div style="padding:16px">' + corpoHtml + '</div>' +
    '</div>';
}
function _mNota(txt) {
  return '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;font-size:12px;color:#92400e;line-height:1.5;margin-top:6px">💡 ' + txt + '</div>';
}

function enviarManualUso(dados) {
  var email     = dados.email;
  var nome      = dados.nome || 'colega';
  var portalUrl = dados.portal_url || 'https://novasp.netlify.app';
  if (!email) return { success: false, error: 'email obrigatorio' };

  var corpo = '';

  corpo += _mSec('🔑', 'Entrar no sistema', 'Login e primeiro acesso', '' +
    _mItem('Primeiro acesso', _mPasso([
      'Acesse <a href="' + portalUrl + '" style="color:#2563eb;font-weight:600">' + portalUrl + '</a>',
      'Digite seu <strong>email</strong> (ou seu nome) e clique em <strong>Continuar →</strong>',
      'Aparece "👋 Primeiro acesso". <strong>Crie sua senha</strong> (mín. 4 caracteres), confirme e clique em <strong>Entrar</strong>'
    ])) +
    _mItem('Acessos seguintes', _mPasso([
      'Digite email/nome → <strong>Continuar</strong>',
      'Informe a <strong>senha</strong> que você criou → <strong>Entrar</strong>'
    ])) +
    _mItem('Esqueci a senha', _mPasso([
      'Na tela da senha, clique em <strong>"Esqueci minha senha"</strong>',
      'Você recebe um <strong>código de 6 dígitos por email</strong>',
      'Digite o código + a nova senha + confirmação → <strong>Redefinir senha</strong>'
    ])) +
    _mNota('Na lateral há 4 áreas: <strong>⚖️ Jurídico, 🏢 Interno, 📅 Agenda, 👥 Gestão</strong>. Só aparecem as que seu perfil tem acesso.'));

  corpo += _mSec('🏠', 'Sistema Interno', 'Aba 🏢 Int.', '' +
    _mItem('Manutenção Predial — abrir chamado', _mPasso([
      'Aba <strong>🏢 Int. → Manutenção Predial</strong> → <strong>+ Novo Chamado</strong>',
      'Preencha <strong>Nome do solicitante</strong>, <strong>Endereço do imóvel</strong>, <strong>Tipo de serviço</strong> e <strong>Descrição</strong> (obrigatórios)',
      'Clique em <strong>Abrir Chamado</strong> — gera um protocolo (MAN-...)'
    ])) +
    _mItem('Acompanhar / atualizar e avisar o inquilino', _mPasso([
      'Use os filtros <strong>Abertos / Em andamento / Concluídos</strong> ou a busca',
      'Clique em <strong>Ver</strong> no chamado',
      'Defina responsabilidade, profissional, <strong>novo status</strong> e escreva a <strong>mensagem ao inquilino</strong>',
      'Clique em <strong>✅ Atualizar e notificar inquilino</strong>'
    ])) +
    _mItem('Requisições Internas (TI / manutenção interna)', _mPasso([
      '<strong>🏢 Int. → Requisições Internas → + Nova Requisição</strong>',
      'Escolha <strong>Agência/Setor</strong>, <strong>Tipo</strong> (TI/Manutenção/Outro), <strong>Descrição</strong> e <strong>Urgência</strong>',
      'Clique em <strong>Enviar</strong> (vai automaticamente ao responsável: TI → Fabio; demais → Marcelo)'
    ])) +
    _mItem('Entrega de Chaves', _mPasso([
      '<strong>🏢 Int. → Entrega de Chaves</strong> mostra o painel da equipe',
      'Para iniciar, clique em <strong>+ Nova Entrega</strong> (abre o cadastro em nova aba)'
    ])));

  corpo += _mSec('📅', 'Agenda & Tarefas', 'Aba 📅 Cal.', '' +
    _mItem('Tarefas', _mPasso([
      '<strong>📅 Cal. → Tarefas → + Nova Tarefa</strong>',
      'Preencha <strong>Título</strong>, status, prioridade, prazo e categoria',
      'Adicione <strong>responsáveis</strong> (viram "chips") → <strong>Salvar</strong>',
      'Para concluir: troque o status na linha para <strong>Concluído</strong> e registre um comentário (opcional). Use 💬 para ver comentários'
    ])) +
    _mItem('Agenda', _mPasso([
      '<strong>📅 Cal. → Agenda</strong> (mostra a semana). Navegue com <strong>← Anterior / Próxima →</strong>',
      'Clique em <strong>+ Compromisso</strong>',
      'Preencha <strong>Título</strong>, <strong>Data</strong>, tipo, início/fim e participantes → <strong>Salvar</strong>',
      'Para editar/excluir, clique no compromisso no calendário'
    ])) +
    _mItem('Pauta Terça / Quarta', _mPasso([
      '<strong>📅 Cal. → Pauta Terça</strong> (ou Quarta) → <strong>+ Item</strong>',
      'Escreva o <strong>item</strong> e escolha o <strong>responsável</strong> → <strong>Adicionar</strong>',
      'A pauta junta itens + tarefas do grupo; itens de semanas anteriores aparecem com ↻'
    ])) +
    _mItem('Horários Livres', _mPasso([
      '<strong>📅 Cal. → Horários Livres</strong> mostra a grade da semana',
      'Slots <strong>verdes</strong> = livre; <strong>vermelhos</strong> = ocupado pela agenda',
      'A edição dos horários livres é feita pela administração'
    ])));

  corpo += _mSec('⚖️', 'Jurídico (FalcãoVaz)', 'Aba ⚖️ Jur. → "Abrir sistema ↗" (login automático)', '' +
    _mItem('Abrir o Jurídico', _mPasso([
      'Aba <strong>⚖️ Jur.</strong> → <strong>Abrir sistema ↗</strong>',
      'Abre em nova aba, <strong>já logado</strong> (não precisa entrar de novo)'
    ])) +
    _mItem('Gerar um documento/petição com IA', _mPasso([
      'Menu <strong>Gerar Documento</strong> (ou em Meus Documentos escolha o tipo: e-mail, parecer, notificação, contranotificação, distrato, declaração, consulta...)',
      '(Opcional) preencha <strong>Referência/Assunto</strong>',
      'Descreva a situação <strong>em detalhes</strong> (obrigatório). Pode <strong>📎 anexar até 5 arquivos</strong> para a IA ler',
      'Clique em <strong>⚡ Gerar com IA</strong> e aguarde (pode levar 1–2 min)'
    ])) +
    _mItem('🔁 Melhorar o documento gerado', _mPasso([
      'Abaixo do texto, no bloco <strong>"🔁 Melhorar este documento"</strong>, escreva o ajuste (ex.: "deixe mais formal", "inclua multa de 10%")',
      'Clique em <strong>🔁 Melhorar com IA</strong> — ela reescreve o MESMO documento. Pode repetir quantas vezes quiser'
    ])) +
    _mItem('Salvar / aprovar o documento', _mPasso([
      'Use <strong>✏️ Editar</strong> para ajustar à mão',
      'Depois: <strong>💾 Salvar rascunho</strong>, <strong>👁️ Enviar para revisão</strong> ou <strong>✅ Finalizar</strong>'
    ])) +
    _mItem('Processos e prazos', _mPasso([
      '<strong>Processos → + Novo Processo</strong>: informe número (CNJ) e tipo (obrigatórios)',
      'Em <strong>Abrir</strong> você vê resumo, andamentos, prazos, financeiro e documentos',
      '<strong>Prazos → + Novo Prazo</strong>: tipo + data de vencimento (a lista mostra selo de urgência)'
    ])) +
    _mItem('Avisar o cliente por e-mail', _mPasso([
      'Abra o processo → aba <strong>Resumo</strong> → bloco <strong>📧 Notificação por Email</strong>',
      'Preencha nome e email do cliente → <strong>💾 Salvar email</strong>',
      'Clique em <strong>📨 Enviar atualização agora</strong> (envia os andamentos do último mês)'
    ])) +
    _mItem('Financeiro do processo', _mPasso([
      'No processo → aba <strong>Financeiro</strong> → <strong>+ Lançamento</strong>',
      'Informe tipo, descrição, <strong>valor</strong>, recebido e vencimento → salvar (o status Quitado/Parcial/Em aberto é automático)'
    ])));

  corpo += _mSec('🎫', 'Abrir chamado ao Jurídico', 'Disponível para todos', '' +
    _mPasso([
      'No FalcãoVaz, clique em <strong>+ Novo Chamado</strong>',
      'Preencha <strong>Título</strong> e <strong>descrição</strong>, escolha a <strong>urgência</strong>',
      'Em <strong>"Direcionar para"</strong> escolha a pessoa (ou deixe "— sem preferência —")',
      'Clique em <strong>📨 Enviar Chamado</strong> — gera protocolo JUR-...'
    ]));

  corpo += _mSec('👥', 'Gestão', 'Aba 👥 Gestão — apenas para líderes', '' +
    _mItem('Meus Liderados', _mPasso([
      '<strong>👥 Gestão → Meus Liderados → + Adicionar Liderado</strong>',
      'Escolha alguém existente, ou <strong>+ Cadastrar Novo Funcionário</strong> (nome + email): cria a conta, vincula à sua equipe e <strong>envia as boas-vindas</strong> automaticamente'
    ])) +
    _mItem('Avaliações Mensais', _mPasso([
      '<strong>👥 Gestão → Avaliações</strong> → no card do colaborador clique em <strong>Avaliar</strong>',
      'Responda os blocos (escala 1–5, texto, sim/não)',
      'Use <strong>💾 Salvar rascunho</strong> para continuar depois, ou <strong>✅ Finalizar</strong> (pode gerar o <strong>Termo em PDF</strong>)',
      'Em <strong>📋 Critérios</strong> dá para adicionar perguntas específicas daquele colaborador'
    ])) +
    _mItem('Tarefas e Pontos de Bônus', _mPasso([
      '<strong>👥 Gestão → Tarefas / Bônus</strong> → no colaborador clique <strong>+ Tarefa</strong> (descrição, pontos, frequência)',
      'Em <strong>⚙️ Config Bônus</strong> ative o bônus, defina o <strong>valor máximo (R$)</strong> e a periodicidade (recomendado somar 100 pts)'
    ])) +
    _mItem('Apuração de Bônus', _mPasso([
      '<strong>👥 Gestão → Apurar Bônus</strong> → <strong>Apurar</strong>',
      'Em cada tarefa, lance os pontos no campo <strong>"Atingiu"</strong> (o valor em R$ recalcula sozinho)',
      '<strong>✅ Finalizar</strong> e, após pagar, <strong>💰 Marcar pago</strong>'
    ])) +
    _mItem('Avaliar Líder (anônimo)', _mPasso([
      '<strong>👥 Gestão → Avaliar Líder</strong> → responda as perguntas → <strong>Enviar Avaliação</strong>',
      'É anônimo — só o resultado consolidado é visto pela direção'
    ])));

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:640px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">📘 Manual de Uso do Portal</div>' +
'</div>' +
'<div style="padding:28px 24px">' +
'<p style="font-size:17px;font-weight:600;color:#1e293b;margin:0 0 10px">Olá, ' + nome + '! 👋</p>' +
'<p style="font-size:14px;color:#475569;margin:0 0 22px;line-height:1.6">' +
'Este é o <strong>passo a passo</strong> para usar o Portal Interno e o sistema Jurídico (FalcãoVaz). ' +
'Você só vê as áreas liberadas para o seu perfil — então alguns trechos abaixo podem não aparecer para você, e tudo bem.' +
'</p>' +
corpo +
'<p style="font-size:13px;color:#94a3b8;line-height:1.6;margin-top:18px">Dúvidas? Responda este email — ele chega no jurídico. Guarde esta mensagem para consultar quando precisar. 🙂</p>' +
'</div>' +
'<div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'</div>' +
'</div></body></html>';

  MailApp.sendEmail({
    to:       email,
    subject:  '📘 Manual de uso — Portal Nova São Paulo (passo a passo)',
    htmlBody: html,
    name:     'Nova São Paulo Imobiliária',
    replyTo:  REPLY_TO
  });
  return { success: true, destino: email };
}

// ════════════════════════════════════════════════════════════════
//  RECUPERAÇÃO DE SENHA ("Esqueci a senha")
//  O código fica guardado só no CacheService do Apps Script (15 min),
//  nunca passa pelo banco. A nova senha é gravada pelo próprio portal
//  no Supabase depois que o código é validado aqui.
//
//  Fluxo:
//   1) action=solicitar_reset  data={email,nome}
//        -> gera código de 6 dígitos, guarda 15 min e envia por email.
//   2) action=verificar_reset  data={email,codigo}
//        -> confere; se bater devolve {success:true} e apaga (uso único).
// ════════════════════════════════════════════════════════════════
var RESET_TTL_SEG = 900; // 15 minutos

function _resetKey(email) {
  return 'pwreset_' + String(email || '').trim().toLowerCase();
}

function solicitarReset(dados) {
  var email = String(dados.email || '').trim();
  var nome  = dados.nome || 'colega';
  if (!email) return { success: false, error: 'email obrigatorio' };

  var codigo = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  CacheService.getScriptCache().put(_resetKey(email), codigo, RESET_TTL_SEG);

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">Recuperação de Senha</div>' +
'</div>' +
'<div style="padding:32px">' +
'<p style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 12px">Olá, ' + nome + '!</p>' +
'<p style="font-size:14px;color:#475569;margin:0 0 22px;line-height:1.6">' +
'Recebemos um pedido para redefinir a senha do seu acesso ao Portal Interno. ' +
'Use o código abaixo para criar uma nova senha:</p>' +
'<div style="background:#f8fafc;border:1px dashed #94a3b8;border-radius:12px;padding:22px;text-align:center;margin-bottom:22px">' +
'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Seu código</div>' +
'<div style="font-size:38px;font-weight:800;letter-spacing:8px;color:#1E2D4A;font-family:Consolas,monospace">' + codigo + '</div>' +
'</div>' +
'<p style="font-size:13px;color:#94a3b8;line-height:1.6">O código vale por <strong>15 minutos</strong>. ' +
'Se você não pediu a redefinição, ignore este email — sua senha continua a mesma.</p>' +
'</div>' +
'<div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'</div>' +
'</div></body></html>';

  MailApp.sendEmail({
    to:       email,
    subject:  'Código de recuperação de senha — Portal Nova São Paulo',
    htmlBody: html,
    name:     'Nova São Paulo Imobiliária',
    replyTo:  REPLY_TO
  });
  return { success: true, destino: email };
}

function verificarReset(dados) {
  var email  = String(dados.email  || '').trim();
  var codigo = String(dados.codigo || '').trim();
  if (!email || !codigo) return { success: false, error: 'email e codigo obrigatorios' };

  var cache = CacheService.getScriptCache();
  var salvo = cache.get(_resetKey(email));
  if (!salvo)            return { success: false, error: 'expirado' };
  if (salvo !== codigo)  return { success: false, error: 'invalido' };

  cache.remove(_resetKey(email)); // uso único
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  FÓRUM DOS REPRESENTANTES — notificacoes por email
//   1) action=forum_novo_topico  data={titulo,tag_label,tipo,descricao,
//                                      autor_nome,autor_equipe,
//                                      trimestre,ano,prazo_votacao,link}
//   2) action=forum_decisao      data={titulo,decisao,aprovacoes,
//                                      reprovacoes,autor_nome,
//                                      autor_equipe,link}
//  Destinatarios: constante FORUM_EMAILS_DESTINO no topo do arquivo.
// ════════════════════════════════════════════════════════════════
function forumNovoTopico(dados) {
  var titulo    = dados.titulo || '(sem titulo)';
  var tag       = dados.tag_label || dados.tag || '—';
  var tipo      = dados.tipo === 'discussao' ? '💬 Discussão' : '🗳️ Votação';
  var autor     = dados.autor_nome || '—';
  var equipe    = dados.autor_equipe || '—';
  var trim      = dados.trimestre || '';
  var ano       = dados.ano || '';
  var descricao = dados.descricao || '';
  var link      = dados.link || 'https://novasp.netlify.app';
  var prazoLbl  = '';
  if (dados.prazo_votacao) {
    var dp = new Date(String(dados.prazo_votacao) + 'T00:00:00');
    prazoLbl = '<br><strong>Prazo pra votar:</strong> ' + Utilities.formatDate(dp, 'America/Sao_Paulo', 'dd/MM/yyyy');
  }

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">💬 Fórum dos Representantes</div>' +
'</div>' +
'<div style="padding:32px">' +
'<p style="font-size:14px;color:#64748b;margin:0 0 6px">Novo tópico proposto no fórum:</p>' +
'<div style="padding:16px;background:#f1f5f9;border-left:4px solid #3B82F6;border-radius:8px;margin:12px 0 22px">' +
'<div style="font-size:16px;font-weight:700;color:#1E2D4A;margin-bottom:8px">📌 ' + titulo + '</div>' +
'<div style="font-size:13px;color:#475569;line-height:1.7">' +
'<strong>Tipo:</strong> ' + tipo + '<br>' +
'<strong>Categoria:</strong> ' + tag + '<br>' +
'<strong>Autor:</strong> ' + autor + ' (' + equipe + ')<br>' +
'<strong>Trimestre:</strong> Q' + trim + ' ' + ano +
prazoLbl +
'</div></div>' +
(descricao ? '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px">Descrição</div><div style="font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.6;background:#f8fafc;padding:12px;border-radius:6px;margin-bottom:22px">' + descricao + '</div>' : '') +
'<div style="text-align:center;margin:20px 0">' +
'<a href="' + link + '" style="display:inline-block;padding:12px 24px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Abrir Fórum →</a>' +
'</div>' +
'<div style="font-size:12px;color:#64748b;line-height:1.7;background:#fef9c3;padding:12px;border-radius:6px">' +
'<strong>O que você pode fazer:</strong><br>' +
(dados.tipo === 'discussao'
  ? '• 💬 Comentar trazendo a opinião da sua equipe<br>'
  : '• 👍 Aprovar / 👎 Reprovar (3 de 5 decide)<br>• 💬 Comentar pra debater<br>') +
'• ⭐ Priorizar se merece ir pra reunião' +
'</div>' +
'</div>' +
'<div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'</div>' +
'</div></body></html>';

  return _forumEnviar('💬 Novo tópico no Fórum: ' + titulo, html);
}

function forumDecisao(dados) {
  var titulo    = dados.titulo || '(sem titulo)';
  var decisao   = String(dados.decisao || '').toLowerCase();
  var aprov     = dados.aprovacoes || 0;
  var reprov    = dados.reprovacoes || 0;
  var autor     = dados.autor_nome || '—';
  var equipe    = dados.autor_equipe || '—';
  var link      = dados.link || 'https://novasp.netlify.app';

  var emoji = decisao === 'aprovado' ? '✅' : '❌';
  var cor   = decisao === 'aprovado' ? '#10b981' : '#ef4444';
  var bg    = decisao === 'aprovado' ? '#ecfdf5' : '#fef2f2';

  var html =
'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:28px 32px;text-align:center">' +
'<div style="font-size:22px;font-weight:700;color:#fff">Nova São Paulo</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">🗳️ Decisão do Fórum</div>' +
'</div>' +
'<div style="padding:32px">' +
'<p style="font-size:14px;color:#64748b;margin:0 0 6px">Um tópico atingiu maioria e a votação foi encerrada:</p>' +
'<div style="padding:20px;background:' + bg + ';border-left:4px solid ' + cor + ';border-radius:8px;margin:12px 0 22px">' +
'<div style="font-size:16px;font-weight:700;color:#1E2D4A;margin-bottom:10px">📌 ' + titulo + '</div>' +
'<div style="font-size:20px;font-weight:800;color:' + cor + ';margin-bottom:10px">' + emoji + ' ' + decisao.toUpperCase() + '</div>' +
'<div style="font-size:13px;color:#475569;line-height:1.7">' +
'👍 <strong>Aprovações:</strong> ' + aprov + '<br>' +
'👎 <strong>Reprovações:</strong> ' + reprov + '<br>' +
'<strong>Autor:</strong> ' + autor + ' (' + equipe + ')' +
'</div></div>' +
'<div style="text-align:center;margin:20px 0">' +
'<a href="' + link + '" style="display:inline-block;padding:12px 24px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ver detalhes →</a>' +
'</div>' +
'</div>' +
'<div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Zona Sul · São Paulo</p>' +
'</div>' +
'</div></body></html>';

  return _forumEnviar(emoji + ' Decisão do Fórum: "' + titulo + '" — ' + decisao.toUpperCase(), html);
}

// Envia o email HTML pra lista FORUM_EMAILS_DESTINO deduplicada
function _forumEnviar(assunto, htmlBody) {
  var vistos = {};
  var enviados = 0, falhas = [];
  var cota;
  try { cota = MailApp.getRemainingDailyQuota(); } catch(_) { cota = null; }
  FORUM_EMAILS_DESTINO.forEach(function(e) {
    var addr = String(e||'').trim().toLowerCase();
    if (!addr || !/@/.test(addr) || vistos[addr]) return;
    vistos[addr] = true;
    if (cota !== null && enviados >= cota) {
      falhas.push({email: addr, erro: 'Cota diaria esgotada'});
      return;
    }
    try {
      MailApp.sendEmail({
        to:       addr,
        subject:  assunto,
        htmlBody: htmlBody,
        name:     'Nova São Paulo Imobiliária',
        replyTo:  REPLY_TO
      });
      enviados++;
    } catch(err) {
      falhas.push({email: addr, erro: String(err && err.message || err)});
    }
  });
  Logger.log('forum email: ' + enviados + ' enviado(s), ' + falhas.length + ' falha(s)');
  return { success: true, enviados: enviados, falhas: falhas, cota: cota };
}

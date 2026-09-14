// ════════════════════════════════════════════════════════════════
// SWEEPER DE BOUNCES — Apps Script (rodar como o dono da inbox que recebe os bounces)
//
// O que faz:
// 1) Escaneia a inbox procurando emails de mailer-daemon@googlemail.com
//    com assunto "Delivery Status Notification (Failure)".
// 2) Extrai destinatário, tipo de erro e mensagem técnica.
// 3) Tenta correlacionar com o registro de origem (processo, requisição,
//    entrega de chaves, manutenção) consultando o Supabase.
// 4) Cria registro em notificacoes_falha (deduplicando pelo Message-ID).
// 5) Marca como lido e aplica label "Bounces processados" no Gmail.
//
// Setup: rodar instalarTriggerBounces() uma vez. Roda a cada 1h.
// ════════════════════════════════════════════════════════════════

var SBU = 'https://mqcduyvpuxdweqesgwrq.supabase.co';
var SBK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xY2R1eXZwdXhkd2VxZXNnd3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzE5OTcsImV4cCI6MjA5MzQwNzk5N30.QdpRZRxnYF6GTh13wdTNqZTQ-9ztY3veef62mfGRphE';

var LABEL_OK = 'Bounces processados';
var MAX_THREADS = 50;  // por execução
var REMETENTE_BOUNCE = 'mailer-daemon@googlemail.com';

// ── ENTRY POINT ─────────────────────────────────────────────────
function processarBounces() {
  var label = GmailApp.getUserLabelByName(LABEL_OK) || GmailApp.createLabel(LABEL_OK);

  // Busca emails do mailer-daemon nas últimas semanas que ainda não foram processados
  // (excluindo os que já têm o label).
  var query = 'from:' + REMETENTE_BOUNCE +
              ' subject:"Delivery Status Notification (Failure)"' +
              ' -label:"' + LABEL_OK + '"' +
              ' newer_than:30d';
  var threads = GmailApp.search(query, 0, MAX_THREADS);
  Logger.log('Sweeper: ' + threads.length + ' thread(s) encontradas');

  var processados = 0;
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      try {
        var info = parseBounce(m);
        if (!info) { continue; }
        info.hash_bounce = m.getId();
        info.origem = identificarOrigem(info.email_destinatario);
        salvarNotificacao(info);
        processados++;
      } catch (e) {
        Logger.log('  erro msg ' + m.getId() + ': ' + e);
      }
    }
    thread.addLabel(label);
    thread.markRead();
    thread.moveToArchive();
  }
  Logger.log('Sweeper: ' + processados + ' bounce(s) processado(s)');
}

// ── PARSE DO BOUNCE ─────────────────────────────────────────────
function parseBounce(msg) {
  var body = msg.getPlainBody() || msg.getBody();
  if (!body) return null;

  // 1) Email destinatário — "to xyz@..." ou "delivery to xyz@..."
  var emailMatch = body.match(/(?:delivered to|delivery to|reach(?:ed)? to|message to|wasn['']t delivered to|couldn['']t be delivered to|to)\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
  if (!emailMatch) {
    // Fallback: pega o primeiro email no corpo
    emailMatch = body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  }
  if (!emailMatch) return null;
  var emailDest = (emailMatch[1] || emailMatch[0]).toLowerCase().trim();
  // Filtra o próprio mailer-daemon
  if (emailDest.indexOf('mailer-daemon') >= 0) return null;
  if (emailDest.indexOf('@maestro.bounces.google.com') >= 0) return null;

  // 2) Tipo de erro
  var tipo = 'other';
  if (/Address not found|user unknown|5\.1\.1/i.test(body)) tipo = 'address_not_found';
  else if (/inbox is full|over storage|over\s+quota|5\.2\.2/i.test(body)) tipo = 'inbox_full';
  else if (/blocked.*DKIM|unauthenticated|5\.7\.9|5\.7\.26/i.test(body)) tipo = 'blocked_dkim';
  else if (/mailbox.*disabled|account.*disabled|5\.1\.10/i.test(body)) tipo = 'mailbox_disabled';

  // 3) Mensagem técnica (linha 5xx)
  var msgMatch = body.match(/55\d\s+[0-9.]+\s+[^\n]+/);
  var mensagem = msgMatch ? msgMatch[0].trim().substring(0, 500) : '';

  return {
    email_destinatario: emailDest,
    tipo_erro: tipo,
    mensagem_erro: mensagem,
    recebido_em: msg.getDate().toISOString()
  };
}

// ── CORRELACIONA COM REGISTRO DE ORIGEM ─────────────────────────
function identificarOrigem(emailDest) {
  // 1) Tenta processos (jurídico)
  try {
    var procs = supabaseGet('/rest/v1/processos?cliente_email=eq.' +
      encodeURIComponent(emailDest) +
      '&select=numero,responsavel:usuarios(id,nome)&limit=1');
    if (procs && procs.length) {
      return {
        sistema: 'juridico-tjsp',
        protocolo: procs[0].numero,
        cadastrado_por_nome: procs[0].responsavel ? procs[0].responsavel.nome : null,
        cadastrado_por_id: procs[0].responsavel ? procs[0].responsavel.id : null
      };
    }
  } catch(e) { Logger.log('  origem processos erro: ' + e); }

  // 2) Tenta usuarios (talvez seja email do próprio usuário do sistema)
  try {
    var users = supabaseGet('/rest/v1/usuarios?email=eq.' + encodeURIComponent(emailDest) + '&select=id,nome&limit=1');
    if (users && users.length) {
      return {
        sistema: 'usuario',
        protocolo: null,
        cadastrado_por_nome: users[0].nome,
        cadastrado_por_id: users[0].id
      };
    }
  } catch(e) {}

  // 3) Origem desconhecida — pode ser de planilha (requisição / entrega)
  return {
    sistema: 'desconhecido',
    protocolo: null,
    cadastrado_por_nome: null,
    cadastrado_por_id: null
  };
}

// ── SALVA NO SUPABASE (idempotente — hash_bounce é UNIQUE) ──────
function salvarNotificacao(info) {
  var origem = info.origem || {};
  var row = {
    email_destinatario:  info.email_destinatario,
    tipo_erro:           info.tipo_erro,
    mensagem_erro:       info.mensagem_erro,
    origem_sistema:      origem.sistema || 'desconhecido',
    origem_protocolo:    origem.protocolo || null,
    cadastrado_por_nome: origem.cadastrado_por_nome,
    cadastrado_por_id:   origem.cadastrado_por_id,
    recebido_em:         info.recebido_em,
    hash_bounce:         info.hash_bounce,
    status:              'aberto'
  };
  try {
    var resp = UrlFetchApp.fetch(SBU + '/rest/v1/notificacoes_falha', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey': SBK,
        'Authorization': 'Bearer ' + SBK,
        'Prefer': 'resolution=ignore-duplicates'
      },
      payload: JSON.stringify(row),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 400 && code !== 409) {
      Logger.log('  Supabase HTTP ' + code + ': ' + resp.getContentText().substring(0, 200));
    }
  } catch(e) {
    Logger.log('  erro insert: ' + e);
  }
}

// ── SUPABASE GET ────────────────────────────────────────────────
function supabaseGet(path) {
  var r = UrlFetchApp.fetch(SBU + path, {
    headers: { 'apikey': SBK, 'Authorization': 'Bearer ' + SBK },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 400) throw new Error('HTTP ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}

// ── INSTALAR TRIGGER (rodar 1 vez) ──────────────────────────────
function instalarTriggerBounces() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'processarBounces') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarBounces').timeBased().everyHours(1).create();
  Logger.log('Trigger instalado: a cada 1 hora.');
}

// ── TESTE MANUAL ────────────────────────────────────────────────
function testarSweeper() {
  processarBounces();
}

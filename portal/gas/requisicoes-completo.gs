// ════════════════════════════════════════════════════════════════
//  REQUISIÇÕES INTERNAS — Apps Script Web App
//  Aba esperada na planilha: "Requisicoes" (ajuste em SHEET_NAME se for outro)
//  Cabecalho esperado na linha 1:
//    Protocolo | Data | Setor | Responsável | Prioridade | Líder |
//    Agência   | E-mail | Telefone | Título | Descrição | Andamentos | Status
// ════════════════════════════════════════════════════════════════

// Tenta esses nomes em ordem. Se nenhum existir, cai no 1o sheet com dados.
// Voce pode adicionar/remover/reordenar nomes aqui sem mexer no resto.
var SHEET_NAMES = ['Requisicoes', 'Requisições', 'REQUISICOES', 'Página1', 'Pagina1', 'Sheet1', 'DATA', 'Dados'];

// ── ENTRY POINT ───────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};

    // 1) Atualizar status (novo)
    if (p.acao === 'atualizar_status') {
      return atualizarStatusReq(p);
    }

    // 2) Inserir nova requisicao
    if (p.dados) {
      return inserirReq(p);
    }

    // 3) Default: listar todas
    return listarReq();

  } catch (err) {
    return _json({ success: false, error: String(err && err.message || err) });
  }
}

// ── LISTAR ───────────────────────────────────────────────────────
function listarReq() {
  var sh = _aba();
  var values = sh.getDataRange().getValues();
  return _json(values);  // [[header...], [row1...], [row2...]]
}

// ── INSERIR ──────────────────────────────────────────────────────
function inserirReq(p) {
  var sh = _aba();
  var dados = JSON.parse(decodeURIComponent(p.dados));
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // Monta a linha na ordem dos headers
  var row = headers.map(function (h) {
    var k = _normKey(h);
    if (dados[h] !== undefined) return dados[h];
    if (dados[k] !== undefined) return dados[k];
    if (k === 'lider')      return dados.lider || '';
    if (k === 'agencia')    return dados.agencia || '';
    if (k === 'email')      return dados.email || '';
    if (k === 'telefone')   return dados.telefone || '';
    if (k === 'titulo')     return dados.titulo || '';
    if (k === 'descricao')  return dados.descricao || '';
    if (k === 'protocolo')  return dados.protocolo || '';
    if (k === 'data')       return dados.data || '';
    if (k === 'setor')      return dados.setor || '';
    if (k === 'responsavel')return dados.responsavel || '';
    if (k === 'prioridade') return dados.prioridade || '';
    if (k === 'status')     return dados.status || 'Aberta';
    if (k === 'andamentos') return '';
    return '';
  });
  sh.appendRow(row);

  // Notifica solicitante (e-mail) que a requisicao foi recebida
  if (dados.email) {
    try {
      MailApp.sendEmail({
        to: String(dados.email),
        subject: '✅ Requisição ' + (dados.protocolo || '') + ' recebida',
        body:
          'Olá ' + (dados.lider || '') + ',\n\n' +
          'Sua requisição foi recebida e encaminhada ao responsável.\n\n' +
          'Protocolo: ' + (dados.protocolo || '') + '\n' +
          'Setor: ' + (dados.setor || '') + '\n' +
          'Responsável: ' + (dados.responsavel || '') + '\n' +
          'Prioridade: ' + (dados.prioridade || 'Normal') + '\n' +
          'Agência: ' + (dados.agencia || '') + '\n\n' +
          'Descrição:\n' + (dados.descricao || '') + '\n\n' +
          'Você receberá novas mensagens sempre que houver atualização do status.\n\n' +
          'Nova São Paulo Imobiliária'
      });
    } catch (e) { /* silencioso */ }
  }

  // Notifica responsavel (Fabio / Marcelo) — busca email pelo nome no User
  try {
    var emailResp = _emailResponsavel(dados.responsavel || '');
    if (emailResp) {
      MailApp.sendEmail({
        to: emailResp,
        subject: '🔔 Nova requisição ' + (dados.protocolo || '') + ' — ' + (dados.setor || ''),
        body:
          'Olá ' + (dados.responsavel || '') + ',\n\n' +
          'Você recebeu uma nova requisição:\n\n' +
          'Protocolo: ' + (dados.protocolo || '') + '\n' +
          'Solicitante: ' + (dados.lider || '') + ' (' + (dados.email || 'sem email') + ')\n' +
          'Agência: ' + (dados.agencia || '') + '\n' +
          'Prioridade: ' + (dados.prioridade || 'Normal') + '\n\n' +
          'Descrição:\n' + (dados.descricao || '') + '\n\n' +
          'Acesse o portal e atualize o status quando for atender.\n\n' +
          'Nova São Paulo Imobiliária'
      });
    }
  } catch (e) { /* silencioso */ }

  return _json({ success: true, protocolo: dados.protocolo || '' });
}

// Mapeia nome do responsavel pra email.
function _emailResponsavel(nome) {
  var n = String(nome || '').toLowerCase();
  if (n.indexOf('fabio') >= 0)   return 'ti@novasaopaulo.com.br';
  if (n.indexOf('marcelo') >= 0) return 'marcelo.miranda@novasaopaulo.com.br';
  return '';
}

// ── ATUALIZAR STATUS ─────────────────────────────────────────────
function atualizarStatusReq(p) {
  var sh = _aba();
  var protocolo = String(p.protocolo || '').trim();
  var novoStatus = String(p.novo_status || '').trim();
  var mensagem  = String(p.mensagem || '').trim();
  var atualizadoPor = String(p.atualizado_por || '').trim();

  if (!protocolo) return _json({ success: false, error: 'Protocolo obrigatorio' });
  if (!novoStatus) return _json({ success: false, error: 'Novo status obrigatorio' });

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo', 'protocolo']);
  var colStatus = _idx(headers, ['Status', 'status']);
  var colAnd = _idx(headers, ['Andamentos', 'andamentos', 'Historico', 'historico']);

  if (colProto < 0) return _json({ success: false, error: 'Coluna Protocolo nao encontrada' });
  if (colStatus < 0) return _json({ success: false, error: 'Coluna Status nao encontrada' });

  var data = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][colProto]) === protocolo) {
      var rowIdx = i + 2;  // 1-based + header
      sh.getRange(rowIdx, colStatus + 1).setValue(novoStatus);

      // Anota histórico em "Andamentos" se a coluna existir
      if (colAnd >= 0) {
        var atual = data[i][colAnd] || '';
        var stamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
        var linha = '[' + stamp + '] ' + atualizadoPor + ': ' + novoStatus + (mensagem ? ' — ' + mensagem : '');
        var novo = atual ? (atual + '\n' + linha) : linha;
        sh.getRange(rowIdx, colAnd + 1).setValue(novo);
      }

      // (Opcional) Notifica o líder/solicitante por email se a coluna E-mail existir
      var colEmail = _idx(headers, ['E-mail', 'Email', 'email']);
      if (colEmail >= 0 && data[i][colEmail]) {
        try {
          MailApp.sendEmail({
            to: String(data[i][colEmail]),
            subject: 'Requisição ' + protocolo + ' — ' + novoStatus,
            body:
              'Sua requisição ' + protocolo + ' teve o status atualizado para "' + novoStatus + '"' +
              (atualizadoPor ? ' por ' + atualizadoPor : '') + '.\n\n' +
              (mensagem ? 'Observação: ' + mensagem + '\n\n' : '') +
              'Nova São Paulo Imobiliária'
          });
        } catch (e) { /* silencioso */ }
      }

      return _json({ success: true, protocolo: protocolo, status: novoStatus });
    }
  }

  return _json({ success: false, error: 'Protocolo nao encontrado: ' + protocolo });
}

// ── HELPERS ──────────────────────────────────────────────────────
function _aba() {
  var ss = SpreadsheetApp.getActive();
  // 1) tenta cada nome de SHEET_NAMES
  for (var i = 0; i < SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(SHEET_NAMES[i]);
    if (sh && sh.getLastRow() > 0) return sh;
  }
  // 2) cai no 1o sheet que tem pelo menos 1 linha
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    if (sheets[j].getLastRow() > 0) return sheets[j];
  }
  // 3) ultimo recurso: o primeiro sheet, mesmo vazio
  return sheets[0];
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function _normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function _idx(headers, candidatos) {
  for (var i = 0; i < headers.length; i++) {
    var hk = _normKey(headers[i]);
    for (var j = 0; j < candidatos.length; j++) {
      if (hk === _normKey(candidatos[j])) return i;
    }
  }
  return -1;
}

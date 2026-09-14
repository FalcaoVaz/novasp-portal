// ═══════════════════════════════════════════════════════════════
//  GAS_MANUTENCAO — Chamados de manutenção (Web App)
//  Ações: abrir · listar_chamados · buscar_chamado ·
//         atribuir_responsabilidade · atualizar_status
//  Emails vão pro solicitante COM replyTo pra Mikaeli + Simone,
//  pra as respostas chegarem nas gestoras, não no Rodrigo.
// ═══════════════════════════════════════════════════════════════

var SHEET_NAMES = ['Chamados', 'Manutencao', 'Manutenção', 'Página1', 'Pagina1', 'Sheet1'];
var REMETENTE_NOME = 'Nova São Paulo Imobiliária';
// Copiadas + Reply-To vão pras gestoras
var EMAIL_GESTORAS = 'contato@novasaopaulo.com.br, simone@novasaopaulo.com.br';

// ── ENTRY POINT ──────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.acao === 'abrir')                    return abrir(p);
    if (p.acao === 'listar_chamados')          return listarChamados();
    if (p.acao === 'buscar_chamado')           return buscarChamado(p);
    if (p.acao === 'atribuir_responsabilidade') return atribuir(p);
    if (p.acao === 'atualizar_status')         return atualizarStatus(p);
    return _json({status:'erro', msg:'Acao invalida'});
  } catch (err) {
    return _json({status:'erro', msg:String(err && err.message || err)});
  }
}

// ── ABRIR CHAMADO ────────────────────────────────────────────
function abrir(p) {
  var d = JSON.parse(decodeURIComponent(p.dados || '{}'));
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var status = 'Aberto';

  var row = headers.map(function(h) {
    var k = _normKey(h);
    if (k === 'protocolo')    return d.protocolo || '';
    if (k === 'data')         return d.data || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    if (k === 'nome')         return d.nome || '';
    if (k === 'telefone')     return d.telefone || '';
    if (k === 'email')        return d.email || '';
    if (k === 'endereco')     return d.endereco || '';
    if (k === 'tiposervico' || k === 'servico') return d.servico || '';
    if (k === 'observacoes' || k === 'obs' || k === 'descricao') return d.obs || '';
    if (k === 'status')       return status;
    return '';
  });
  sh.appendRow(row);

  // Email pro solicitante
  if (d.email && /@/.test(d.email)) {
    var html =
      '<p>Olá, ' + _esc(d.nome) + '!</p>' +
      '<p>Seu chamado foi registrado com sucesso.</p>' +
      '<p><b>Protocolo:</b> ' + _esc(d.protocolo) + '<br>' +
      '<b>Servico:</b> ' + _esc(d.servico) + '<br>' +
      '<b>Data:</b> ' + _esc(d.data) + '</p>' +
      '<p>Nossa equipe entrara em contato em breve para agendar o atendimento.</p>' +
      '<p>Acompanhe o status do seu chamado em: <a href="https://novasp.netlify.app">novasp.netlify.app</a></p>' +
      '<p>Atenciosamente,<br>' + REMETENTE_NOME + '</p>';
    try {
      MailApp.sendEmail({
        to:       d.email,
        cc:       EMAIL_GESTORAS,
        replyTo:  EMAIL_GESTORAS,
        name:     REMETENTE_NOME,
        subject:  'Chamado ' + d.protocolo + ' recebido - Nova São Paulo',
        htmlBody: html
      });
    } catch(err) {
      Logger.log('Falha email abrir: ' + err);
    }
  }

  return _json({status:'ok', protocolo: d.protocolo});
}

// ── LISTAR CHAMADOS ──────────────────────────────────────────
function listarChamados() {
  var sh = _aba();
  var values = sh.getDataRange().getValues();
  return _json(values);
}

// ── BUSCAR UM CHAMADO ────────────────────────────────────────
function buscarChamado(p) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo','protocolo']);
  if (colProto < 0) return _json({status:'erro', msg:'Coluna Protocolo nao encontrada'});
  var data = sh.getRange(2,1, Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).getValues();
  for (var i=0; i<data.length; i++) {
    if (String(data[i][colProto]) === String(p.protocolo)) {
      var obj = {};
      headers.forEach(function(h, j) { obj[h] = data[i][j]; });
      return _json(obj);
    }
  }
  return _json({status:'erro', msg:'Protocolo nao encontrado'});
}

// ── ATRIBUIR RESPONSABILIDADE ────────────────────────────────
function atribuir(p) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo','protocolo']);
  if (colProto < 0) return _json({status:'erro', msg:'Coluna Protocolo'});

  var data = sh.getRange(2,1, Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).getValues();
  var rowIdx = -1;
  for (var i=0; i<data.length; i++){
    if (String(data[i][colProto]) === String(p.protocolo)){ rowIdx = i; break; }
  }
  if (rowIdx < 0) return _json({status:'erro', msg:'Protocolo nao encontrado'});
  var row = rowIdx + 2;

  var iResp = _idx(headers, ['Responsabilidade','Responsavel']);
  if (iResp >= 0 && p.responsabilidade) sh.getRange(row, iResp+1).setValue(p.responsabilidade);
  var iProf = _idx(headers, ['Profissional','Prestador']);
  if (iProf >= 0 && p.profissional) sh.getRange(row, iProf+1).setValue(p.profissional);

  _adicionarAndamento(sh, headers, data, rowIdx, row,
    'Responsabilidade: ' + (p.responsabilidade||'—') +
    (p.profissional ? ' · Profissional: ' + p.profissional : '') +
    (p.mensagem ? ' · ' + p.mensagem : ''));

  _notificarSolicitante(headers, data[rowIdx], p.protocolo,
    'Atualização no chamado', p.mensagem);
  return _json({status:'ok'});
}

// ── ATUALIZAR STATUS ─────────────────────────────────────────
function atualizarStatus(p) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo','protocolo']);
  if (colProto < 0) return _json({status:'erro', msg:'Coluna Protocolo'});

  var data = sh.getRange(2,1, Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).getValues();
  var rowIdx = -1;
  for (var i=0; i<data.length; i++){
    if (String(data[i][colProto]) === String(p.protocolo)){ rowIdx = i; break; }
  }
  if (rowIdx < 0) return _json({status:'erro', msg:'Protocolo nao encontrado'});
  var row = rowIdx + 2;

  var iSt = _idx(headers, ['Status']);
  if (iSt >= 0) sh.getRange(row, iSt+1).setValue(p.novo_status);

  var iUlt = _idx(headers, ['Ultima Atualizacao','Ultima Atualização','UltimaAtualizacao']);
  if (iUlt >= 0) sh.getRange(row, iUlt+1).setValue(
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm')
  );

  _adicionarAndamento(sh, headers, data, rowIdx, row,
    'Status: ' + p.novo_status + (p.mensagem ? ' — ' + p.mensagem : ''));

  _notificarSolicitante(headers, data[rowIdx], p.protocolo,
    'Chamado ' + p.novo_status, p.mensagem);
  return _json({status:'ok'});
}

// ── EMAIL PRO SOLICITANTE + GESTORAS ─────────────────────────
function _notificarSolicitante(headers, linha, protocolo, tituloEtapa, mensagem) {
  var iEmail = _idx(headers, ['Email','E-mail']);
  var iNome  = _idx(headers, ['Nome']);
  var iSrv   = _idx(headers, ['Tipo Servico','Tipo Serviço','Servico','Serviço']);
  var email  = iEmail >= 0 ? String(linha[iEmail]||'').trim() : '';
  if (!email || !/@/.test(email)) return;

  var html =
    '<p>Olá, ' + _esc(iNome>=0?linha[iNome]:'') + '!</p>' +
    '<p>Seu chamado teve uma atualização:</p>' +
    '<p><b>Protocolo:</b> ' + _esc(protocolo) + '<br>' +
    '<b>Servico:</b> ' + _esc(iSrv>=0?linha[iSrv]:'') + '<br>' +
    '<b>Etapa:</b> ' + _esc(tituloEtapa) + '</p>' +
    (mensagem ? '<p><b>Mensagem da equipe:</b><br>' + _esc(mensagem).replace(/\n/g,'<br>') + '</p>' : '') +
    '<p>Acompanhe em: <a href="https://novasp.netlify.app">novasp.netlify.app</a></p>' +
    '<p>Atenciosamente,<br>' + REMETENTE_NOME + '</p>';
  try {
    MailApp.sendEmail({
      to:       email,
      cc:       EMAIL_GESTORAS,
      replyTo:  EMAIL_GESTORAS,
      name:     REMETENTE_NOME,
      subject:  'Chamado ' + protocolo + ' - ' + tituloEtapa,
      htmlBody: html
    });
  } catch(err) { Logger.log('Falha email notificar: ' + err); }
}

// ── HELPERS ──────────────────────────────────────────────────
function _adicionarAndamento(sh, headers, data, rowIdx, row, texto) {
  var iAnd = _idx(headers, ['Andamentos','Historico','Histórico']);
  if (iAnd < 0) return;
  var atual = data[rowIdx][iAnd] || '';
  var stamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  var linha = '[' + stamp + '] ' + texto;
  sh.getRange(row, iAnd+1).setValue(atual ? (atual + '\n' + linha) : linha);
}

function _esc(s) { return String(s||'').replace(/[<>&]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c]; }); }

function _aba() {
  var ss = SpreadsheetApp.getActive();
  for (var i=0; i<SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(SHEET_NAMES[i]);
    if (sh && sh.getLastRow() > 0) return sh;
  }
  var sheets = ss.getSheets();
  for (var j=0; j<sheets.length; j++) if (sheets[j].getLastRow() > 0) return sheets[j];
  return sheets[0];
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function _normKey(s) {
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

function _idx(headers, candidatos) {
  for (var i=0; i<headers.length; i++) {
    var hk = _normKey(headers[i]);
    for (var j=0; j<candidatos.length; j++) {
      if (hk === _normKey(candidatos[j])) return i;
    }
  }
  return -1;
}

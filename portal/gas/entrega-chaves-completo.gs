// ════════════════════════════════════════════════════════════════
//  ENTREGA DE CHAVES — Apps Script Web App (completo)
//  Suporta:
//   - Cadastro novo (POST) e listar (GET acao=listar)
//   - Atualizar status com nova coluna por etapa
//   - Registrar vistoria + envio de email pro locador
//   - Etapas novas: Devolução da caução, Resgate do título, Entrada no sinistro
//
//  IMPORTANTE — antes de implantar:
//  - Confira nome da aba (lista SHEET_NAMES abaixo).
//  - Confira nomes dos cabeçalhos na sua planilha (se diferentes,
//    edite o array HEADERS_PADRAO).
//  - Garanta que existam as colunas: Data Devolução, Data Resgate,
//    Data Sinistro (caso contrário o atualizar_status ignora).
// ════════════════════════════════════════════════════════════════

var SHEET_NAMES = ['Processos', 'Entrega', 'Entrega de Chaves', 'ENTREGA', 'Página1', 'Pagina1', 'Sheet1'];
var DE_NOME = 'Nova São Paulo Imobiliária';

// Mapa de status -> nome de coluna padrão (fallback quando o frontend
// não envia &col= no atualizar_status).
var MAPA_STATUS_COL = {
  'Entrega de chaves agendada':  'Data Agendada',
  'Entrega de chaves realizada': 'Data Entrega',
  'Vistoria realizada':          'Data Vistoria',
  'Débitos quitados':            'Data Débitos',
  'Chaves liberadas':            'Data Liberação',
  'Devolução da caução':         'Data Devolução',
  'Resgate do título':           'Data Resgate',
  'Entrada no sinistro':         'Data Sinistro'
};

// ── ENTRY POINTS ─────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.acao === 'listar')              return listar();
    if (p.acao === 'atualizar_status')    return atualizarStatus(p);
    if (p.acao === 'registrar_vistoria')  return registrarVistoria(p);
    return _json({success:false, error:'Ação não reconhecida'});
  } catch (err) {
    return _json({success:false, error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    var dados = JSON.parse(e.postData.contents);
    return inserirProcesso(dados);
  } catch (err) {
    return _json({success:false, error:String(err && err.message || err)});
  }
}

// ── LISTAR (matriz [[headers...],[row1...],...]) ─────────────────
function listar() {
  var sh = _aba();
  var values = sh.getDataRange().getValues();
  return _json(values);
}

// ── INSERIR (cadastro.html POST) ─────────────────────────────────
function inserirProcesso(d) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var status = d.modo === 'entrega' ? 'Entrega de chaves realizada' : 'Entrega de chaves agendada';
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');

  var row = headers.map(function(h) {
    var k = _normKey(h);
    if (k === 'protocolo')       return d.protocolo || '';
    if (k === 'datacadastro')    return hoje;
    if (k === 'locador')         return d.locador || '';
    if (k === 'emaillocador' || k === 'emailslocador') return d.emailLocador || '';
    if (k === 'locatario')       return d.locatario || '';
    if (k === 'emaillocatario')  return d.emailLocatario || '';
    if (k === 'endereco')        return d.endereco || '';
    if (k === 'tipofianca')      return d.tipoFianca || '';
    if (k === 'status')          return status;
    if (k === 'dataagendada')    return d.dataAgendada || '';
    if (k === 'dataentrega' && d.modo === 'entrega') return d.dataAgendada || '';
    if (k === 'observacoes')     return d.obs || '';
    return '';
  });
  sh.appendRow(row);

  // Email para as partes (locador pode ter mais de 1 separado por vírgula)
  var todosEmails = [].concat(_split(d.emailLocador), _split(d.emailLocatario));
  Logger.log('Emails coletados: ' + JSON.stringify(todosEmails));
  var emailResult = notificarPartes({
    para: todosEmails,
    assunto: '🔑 Processo ' + d.protocolo + ' — ' + status,
    corpo:
      'Olá,\n\n' +
      'Seu processo de entrega de chaves foi registrado na Imobiliária Nova São Paulo:\n\n' +
      'Protocolo: ' + d.protocolo + '\n' +
      'Endereço: ' + d.endereco + '\n' +
      'Tipo de fiança: ' + d.tipoFianca + '\n' +
      'Situação: ' + status + '\n' +
      (d.dataAgendada ? 'Data: ' + d.dataAgendada + '\n' : '') +
      (d.obs ? '\nObservações: ' + d.obs + '\n' : '') +
      '\nVocê receberá atualizações sempre que houver mudança no processo.\n\n' +
      DE_NOME
  });

  return _json({
    success:true,
    protocolo: d.protocolo,
    email: emailResult  // { enviados, falhas: [{email, erro}], invalidos, cota }
  });
}

// ── ATUALIZAR STATUS ─────────────────────────────────────────────
function atualizarStatus(p) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo','protocolo']);
  if (colProto < 0) return _json({success:false, error:'Coluna Protocolo não encontrada'});

  var data = sh.getRange(2,1, Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).getValues();
  var rowIdx = -1;
  for (var i=0; i<data.length; i++){
    if (String(data[i][colProto]) === String(p.protocolo)){ rowIdx = i; break; }
  }
  if (rowIdx < 0) return _json({success:false, error:'Protocolo não encontrado: ' + p.protocolo});
  var row = rowIdx + 2;

  // 1) Status
  var colStatus = _idx(headers, ['Status']);
  if (colStatus >= 0) sh.getRange(row, colStatus+1).setValue(p.novo_status);

  // 2) Coluna da data — &col= tem prioridade, depois fallback pelo MAPA
  var colNameAlvo = p.col || MAPA_STATUS_COL[p.novo_status] || '';
  if (colNameAlvo) {
    var idxData = _idx(headers, [colNameAlvo]);
    if (idxData >= 0) sh.getRange(row, idxData+1).setValue(p.data);
  }

  // 3) Andamento (histórico)
  var colAnd = _idx(headers, ['Andamentos','Historico']);
  if (colAnd >= 0) {
    var atual = data[rowIdx][colAnd] || '';
    var stamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    var linha = '[' + stamp + '] ' + p.novo_status + (p.mensagem ? ' — ' + p.mensagem : '');
    sh.getRange(row, colAnd+1).setValue(atual ? (atual + '\n' + linha) : linha);
  }

  // 4) Notifica partes
  var emailsLoc = _emailsDaLinha(headers, data[rowIdx], ['Email Locador','Emails Locador']);
  var emailsLoct = _emailsDaLinha(headers, data[rowIdx], ['Email Locatário','Email Locatario']);
  var iEnd = _idx(headers, ['Endereço','Endereco']);
  notificarPartes({
    para: [].concat(emailsLoc, emailsLoct),
    assunto: '🔑 ' + p.protocolo + ' — ' + p.novo_status,
    corpo:
      'Olá,\n\n' +
      'O processo de entrega de chaves teve uma atualização:\n\n' +
      'Protocolo: ' + p.protocolo + '\n' +
      'Imóvel: ' + (iEnd>=0?data[rowIdx][iEnd]:'') + '\n' +
      'Etapa: ' + p.novo_status + '\n' +
      'Data: ' + (p.data || '') + '\n' +
      (p.mensagem ? '\nMensagem: ' + p.mensagem + '\n' : '') +
      '\n' + DE_NOME
  });

  return _json({success:true, protocolo: p.protocolo, status: p.novo_status});
}

// ── REGISTRAR VISTORIA ───────────────────────────────────────────
function registrarVistoria(p) {
  var sh = _aba();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var colProto = _idx(headers, ['Protocolo','protocolo']);
  if (colProto < 0) return _json({success:false, error:'Coluna Protocolo'});

  var data = sh.getRange(2,1, Math.max(0, sh.getLastRow()-1), sh.getLastColumn()).getValues();
  var rowIdx = -1;
  for (var i=0; i<data.length; i++){
    if (String(data[i][colProto]) === String(p.protocolo)){ rowIdx = i; break; }
  }
  if (rowIdx < 0) return _json({success:false, error:'Protocolo não encontrado'});
  var row = rowIdx + 2;

  // Atualiza vários campos
  var sets = {
    'Status':             'Vistoria realizada',
    'Data Vistoria':      p.data,
    'Necessita Reparo':   p.necessita_reparo,
    'Descrição Reparo':   p.descricao || '',
    'Valor Reparo':       p.valor || '',
    'Responsável Reparo': p.responsavel || ''
  };
  for (var k in sets) {
    var idx = _idx(headers, [k]);
    if (idx >= 0) sh.getRange(row, idx+1).setValue(sets[k]);
  }

  // Andamento
  var colAnd = _idx(headers, ['Andamentos','Historico']);
  if (colAnd >= 0) {
    var atual = data[rowIdx][colAnd] || '';
    var stamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    var reparoTxt = p.necessita_reparo === 'Sim' ? 'COM reparos' : 'SEM reparos';
    var linha = '[' + stamp + '] Vistoria registrada: ' + reparoTxt + (p.descricao ? ' — ' + p.descricao : '');
    sh.getRange(row, colAnd+1).setValue(atual ? (atual + '\n' + linha) : linha);
  }

  // Notifica
  var emailsLoc = _emailsDaLinha(headers, data[rowIdx], ['Email Locador','Emails Locador']);
  var emailsLoct = _emailsDaLinha(headers, data[rowIdx], ['Email Locatário','Email Locatario']);
  var iEnd = _idx(headers, ['Endereço','Endereco']);
  var nomeLocador = (_idx(headers,['Locador']) >= 0) ? data[rowIdx][_idx(headers,['Locador'])] : '';

  notificarPartes({
    para: [].concat(emailsLoc, emailsLoct),
    assunto: '🔍 ' + p.protocolo + ' — Vistoria realizada',
    corpo:
      'Olá,\n\n' +
      'A vistoria do imóvel foi registrada:\n\n' +
      'Protocolo: ' + p.protocolo + '\n' +
      'Imóvel: ' + (iEnd>=0?data[rowIdx][iEnd]:'') + '\n' +
      'Data da vistoria: ' + p.data + '\n' +
      'Necessita reparos: ' + p.necessita_reparo + '\n' +
      (p.descricao ? 'Reparo: ' + p.descricao + '\n' : '') +
      (p.valor ? 'Valor estimado: ' + p.valor + '\n' : '') +
      (p.responsavel ? 'Responsável: ' + p.responsavel + '\n' : '') +
      (p.mensagem ? '\nMensagem: ' + p.mensagem + '\n' : '') +
      '\n' + DE_NOME
  });

  // Caso reparo seja do locatário, manda email específico pro locador pedindo orçamentos
  if (p.necessita_reparo === 'Sim' && p.responsavel === 'Locatário' && emailsLoc.length) {
    emailsLoc.forEach(function(emailL){
      try {
        MailApp.sendEmail({
          to: String(emailL),
          subject: '🔧 ' + p.protocolo + ' — Solicitação de 2 orçamentos para reparos',
          body:
            'Olá ' + nomeLocador + ',\n\n' +
            'A vistoria do imóvel identificou necessidade de reparos sob responsabilidade do locatário:\n\n' +
            (p.descricao ? '• ' + p.descricao + '\n' : '') +
            (p.valor ? '• Valor estimado: ' + p.valor + '\n' : '') +
            '\nSolicitamos o envio de 2 (dois) orçamentos para cobrança do locatário.\n\n' +
            'A imobiliária pode indicar profissionais (sem responsabilidade pela indicação) caso seja de seu interesse.\n\n' +
            DE_NOME,
          name: DE_NOME
        });
      } catch(e){}
    });
  }

  return _json({success:true});
}

// ── HELPERS ──────────────────────────────────────────────────────
// Retorna { enviados, falhas: [{email, erro}], invalidos: [] } pra
// que o cliente veja EXATAMENTE quais emails foram enviados e por que
// os outros falharam. Antes o catch(e){} engolia erros silenciosamente.
function notificarPartes(opts) {
  var brutos = opts.para || [];
  var validos = [];
  var invalidos = [];
  brutos.forEach(function(e){
    var s = String(e||'').trim();
    if (s && /@/.test(s)) validos.push(s); else if (s) invalidos.push(s);
  });
  var enviados = 0;
  var falhas = [];
  // Cota do MailApp: 100 emails/dia pra conta free, 1500 pra Workspace.
  // getRemainingDailyQuota() retorna quantos ainda sobram.
  var cota;
  try { cota = MailApp.getRemainingDailyQuota(); } catch(_) { cota = null; }
  validos.forEach(function(addr) {
    if (cota !== null && enviados >= cota) {
      falhas.push({email: addr, erro: 'Cota diaria do Gmail esgotada ('+cota+' restantes)'});
      return;
    }
    try {
      MailApp.sendEmail({
        to: addr,
        subject: opts.assunto,
        body: opts.corpo,
        name: DE_NOME
      });
      enviados++;
    } catch(err) {
      falhas.push({email: addr, erro: String(err && err.message || err)});
      Logger.log('Falha email pra ' + addr + ': ' + err);
    }
  });
  Logger.log('notificarPartes: ' + enviados + ' enviado(s), ' + falhas.length + ' falha(s), ' + invalidos.length + ' invalido(s). Cota inicial: ' + cota);
  return { enviados: enviados, falhas: falhas, invalidos: invalidos, cota: cota };
}

function _emailsDaLinha(headers, linha, candidatos) {
  var idx = _idx(headers, candidatos);
  if (idx < 0) return [];
  return _split(linha[idx]);
}

function _split(s) {
  if (!s) return [];
  return String(s).split(/[,;]/).map(function(x){return x.trim();}).filter(Boolean);
}

function _aba() {
  var ss = SpreadsheetApp.getActive();
  for (var i = 0; i < SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(SHEET_NAMES[i]);
    if (sh && sh.getLastRow() > 0) return sh;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    if (sheets[j].getLastRow() > 0) return sheets[j];
  }
  return sheets[0];
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function _normKey(s) {
  return String(s || '').toLowerCase()
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

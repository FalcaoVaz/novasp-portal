// ════════════════════════════════════════════════════════════════
//  FALCÃOVAZ — Sincronização TJSP via DataJud (CNJ)
//  Apps Script com trigger DIÁRIO.
//  - Lê processos do Supabase
//  - Consulta DataJud (CNJ) por número CNJ
//  - Insere movimentos novos em andamentos_processos
//  - Notifica o advogado responsável por email
// ════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÃO ────────────────────────────────────────────────
var SUPABASE_URL  = 'https://mqcduyvpuxdweqesgwrq.supabase.co';
var SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xY2R1eXZwdXhkd2VxZXNnd3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzE5OTcsImV4cCI6MjA5MzQwNzk5N30.QdpRZRxnYF6GTh13wdTNqZTQ-9ztY3veef62mfGRphE';

// DataJud — endpoint do TJSP e API key publica oficial do CNJ
var DATAJUD_URL    = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search';
var DATAJUD_APIKEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

// DJEN — Diario de Justica Eletronico Nacional (texto integral de
// despachos, decisoes e sentencas). Sem necessidade de API key.
var DJEN_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
// Flag global — loga o schema real da resposta 1x por execucao pra
// facilitar debug quando o CNJ muda nome de campo.
var _DJEN_LOGADO = false;

var EMAIL_REMETENTE = 'Jurídico Nova São Paulo';
var REPLY_TO        = 'novasaopaulo.sp@gmail.com';

// Batching: processa N processos por execucao (Apps Script Gmail tem timeout 6min).
// Ordena por ultima_sync_cnj ASC NULLS FIRST — pega primeiro os menos atualizados.
var BATCH_SIZE = 40;

// ── ENTRY POINT — chamado pelo trigger diário ────────────────────
function sincronizarProcessosTJSP() {
  Logger.log('[sync-tjsp] iniciando ' + new Date().toISOString());

  // 1) Le processos ativos do Supabase com responsavel
  var processos;
  try {
    // Ordena: menos sincronizados primeiro (NULL fica no inicio). Limit = BATCH_SIZE.
    processos = supabaseGet(
      '/rest/v1/processos?status=eq.ativo&select=id,numero,autor,reu,fase,responsavel_id,ultimo_mov_cnj,responsavel:usuarios!processos_responsavel_id_fkey(id,nome,email)'
      + '&order=ultima_sync_cnj.asc.nullsfirst&limit=' + BATCH_SIZE
    );
  } catch (e) {
    Logger.log('[sync-tjsp] erro ao ler processos: ' + e);
    return;
  }
  Logger.log('[sync-tjsp] ' + processos.length + ' processos neste batch (BATCH_SIZE=' + BATCH_SIZE + ')');

  // Agrupa novidades por advogado responsavel (email)
  var resumoPorEmail = {}; // { email: { nome, processos: [{numero, autor, novosCount, movimentos: []}] } }
  var totalNovos = 0;

  for (var i = 0; i < processos.length; i++) {
    var p = processos[i];
    var numero = String(p.numero || '').trim();
    if (!numero) { Logger.log('  processo id=' + p.id + ' sem numero — pulado'); continue; }

    var novos = [];
    var maxDataMov = null;
    try {
      var movs = consultarDataJud(numero);
      if (!movs || !movs.length) {
        Logger.log('  ' + numero + ' — DataJud vazio');
      } else {
        // Filtra so movimentos posteriores ao ultimo_mov_cnj
        var ultimoConhecido = p.ultimo_mov_cnj ? new Date(p.ultimo_mov_cnj) : null;
        novos = movs.filter(function(m) {
          if (!m.dataHora) return false;
          var d = new Date(m.dataHora);
          return ultimoConhecido ? d > ultimoConhecido : true;
        });
        if (!novos.length) {
          Logger.log('  ' + numero + ' — DataJud sem novidades (último: ' + (ultimoConhecido?ultimoConhecido.toISOString():'nunca') + ')');
        } else {
          Logger.log('  ' + numero + ' — ' + novos.length + ' movimento(s) novo(s) no DataJud');
        }
      }

      // 2) Insere movimentos em BULK (1 POST com array) — muito mais rapido.
      //    Extrai TUDO que o DataJud devolve: nome + complementos tabelados +
      //    complemento em texto livre (quando o tribunal envia detalhes).
      var rows = [];
      for (var j = 0; j < novos.length; j++) {
        var mov = novos[j];
        var dataIso = new Date(mov.dataHora).toISOString();
        var descricao = (mov.nome || mov.descricao || 'Movimentação').toString().trim();

        // Complementos tabelados (estrutura padronizada): "Codigo: descricao"
        if (mov.complementosTabelados && mov.complementosTabelados.length) {
          var compls = mov.complementosTabelados.map(function(c){
            var partes = [];
            if (c.descricao) partes.push(String(c.descricao).trim());
            if (c.nome && c.nome !== c.descricao) partes.push(String(c.nome).trim());
            if (c.valor && c.valor !== c.nome) partes.push(String(c.valor).trim());
            return partes.join(': ');
          }).filter(Boolean).join(' · ');
          if (compls) descricao += '\n• ' + compls;
        }

        // Complemento em texto livre — alguns tribunais incluem aqui o resumo
        // do despacho/decisao/sentenca. Vale a pena capturar quando vem.
        if (mov.complemento) {
          var compTxt = String(mov.complemento).trim();
          if (compTxt) descricao += '\n→ ' + compTxt;
        }
        // Fallback: as vezes o detalhamento vem em campos alternativos
        if (mov.tipoDecisao) descricao += '\n[Tipo de decisao: ' + mov.tipoDecisao + ']';
        if (mov.julgamento)  descricao += '\n[Julgamento: '   + JSON.stringify(mov.julgamento) + ']';

        rows.push({
          processo_id: p.id,
          data: dataIso.slice(0,10),
          descricao: descricao,
          origem: 'tjsp-datajud'
        });
        if (!maxDataMov || new Date(mov.dataHora) > maxDataMov) maxDataMov = new Date(mov.dataHora);
      }
      if (rows.length) {
        try { supabasePost('/rest/v1/andamentos_processos', rows); }
        catch (e) { Logger.log('  erro bulk insert: ' + e); }
      }

      // 3) Atualiza ultimo_mov_cnj e ultima_sync_cnj no processo
      atualizarUltimaSync(p.id, maxDataMov);

      // 3.5) DJEN: busca publicacoes com texto integral (despachos,
      //      decisoes, sentencas). Faz dedup pelo id da comunicacao.
      try {
        // Reaproveita p.ultima_sync_cnj como limite inferior se houver
        var dataDesde = p.ultima_sync_cnj || null;
        var pubs = consultarDJEN(numero, dataDesde);
        if (pubs.length) {
          // Log do schema real do 1o item da 1a rodada — ajuda a debugar
          // quando o CNJ mudar nome de campo. Aparece 1x por processo.
          if (!_DJEN_LOGADO) {
            _DJEN_LOGADO = true;
            var amostra = pubs[0] || {};
            Logger.log('  DJEN sample keys: ' + Object.keys(amostra).join(','));
            Logger.log('  DJEN sample raw: ' + JSON.stringify(amostra).substring(0, 800));
          }
          var jaSalvos = idsDJENJaSalvos(p.id);
          var rowsDJEN = [];
          for (var k = 0; k < pubs.length; k++) {
            var pub = pubs[k];
            if (!pub || !pub.id) continue;
            if (jaSalvos[pub.id]) continue;
            var dataPub = pub.data_disponibilizacao || (pub.datadisponibilizacao
              ? pub.datadisponibilizacao.split('/').reverse().join('-') : null);
            if (!dataPub) continue;
            var tipoDoc = pub.tipoDocumento || pub.tipoComunicacao || 'Publicação';
            var descricaoDJEN = '[DJEN] ' + tipoDoc
              + (pub.nomeOrgao ? ' — ' + pub.nomeOrgao : '');
            // Extrai texto tentando varios nomes de campo. Se nada bater,
            // chama o endpoint de detalhe pra puxar inteiro teor.
            var texto = extrairTextoDJEN(pub);
            if (!texto) {
              try {
                var det = consultarDJENDetalhe(pub.id);
                if (det) texto = extrairTextoDJEN(det) || '';
              } catch (eDet) {
                Logger.log('  DJEN detalhe erro id=' + pub.id + ': ' + eDet);
              }
            }
            rowsDJEN.push({
              processo_id:    p.id,
              data:           dataPub,
              descricao:      descricaoDJEN,
              texto_completo: texto,
              id_comunicacao: pub.id,
              tipo_documento: tipoDoc,
              link_origem:    pub.link || pub.linkurl || '',
              origem:         'cnj-djen'
            });
          }
          if (rowsDJEN.length) {
            try { supabasePost('/rest/v1/andamentos_processos', rowsDJEN); }
            catch (e) { Logger.log('  erro bulk DJEN: ' + e); }
            var comTexto = 0;
            rowsDJEN.forEach(function(r){ if (r.texto_completo) comTexto++; });
            Logger.log('  ' + numero + ' — ' + rowsDJEN.length + ' publicacao(oes) DJEN (' + comTexto + ' com texto integral)');
          }
        }
      } catch (eDjen) {
        Logger.log('  erro DJEN processo ' + numero + ': ' + eDjen);
      }

      // 4) Acumula no resumo do advogado responsavel (SO se teve DataJud novo)
      if (novos.length) {
        var resp = p.responsavel || {};
        var email = resp.email;
        if (email) {
          if (!resumoPorEmail[email]) resumoPorEmail[email] = { nome: resp.nome || 'colega', processos: [] };
          resumoPorEmail[email].processos.push({
            numero: numero,
            autor: p.autor || '',
            reu: p.reu || '',
            fase: p.fase || '',
            movimentos: novos.map(function(m){ return {
              data: m.dataHora,
              nome: m.nome || m.descricao || 'Movimentação'
            };})
          });
        } else {
          Logger.log('  processo ' + numero + ' sem responsavel com email — sem notificacao');
        }
        totalNovos += novos.length;
      }

    } catch (err) {
      Logger.log('  erro processo ' + numero + ': ' + err);
    }
    // Throttle reduzido: 200ms entre chamadas (DataJud aguenta tranquilo)
    Utilities.sleep(200);
  }

  // 5) Envia emails de resumo (1 por advogado)
  Object.keys(resumoPorEmail).forEach(function(email) {
    try { enviarResumoAdvogado(email, resumoPorEmail[email]); }
    catch (e) { Logger.log('erro envio email ' + email + ': ' + e); }
  });

  Logger.log('[sync-tjsp] concluido — ' + totalNovos + ' movimentos novos em ' + Object.keys(resumoPorEmail).length + ' advogados');
}

// ── DATAJUD: consulta movimentos de UM processo por numero CNJ ───
function consultarDataJud(numeroCNJ) {
  // DataJud espera o numero SEM mascara (so digitos)
  var numero = String(numeroCNJ).replace(/[^0-9]/g, '');
  if (numero.length < 14) return [];

  var body = JSON.stringify({
    query: { match: { numeroProcesso: numero } },
    size: 1
  });

  var opts = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'APIKey ' + DATAJUD_APIKEY },
    payload: body,
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(DATAJUD_URL, opts);
  var code = resp.getResponseCode();
  if (code !== 200) {
    Logger.log('  DataJud HTTP ' + code + ' para ' + numeroCNJ + ': ' + resp.getContentText().substring(0,200));
    return [];
  }
  var json;
  try { json = JSON.parse(resp.getContentText()); } catch(e) { return []; }
  var hits = json.hits && json.hits.hits || [];
  if (!hits.length) return [];
  var src = hits[0]._source || {};
  return (src.movimentos || []).sort(function(a,b){
    return new Date(a.dataHora) - new Date(b.dataHora);
  });
}

// ── DJEN: consulta publicacoes (texto integral) de UM processo ───
// Retorna array de itens. Cada item tem id, data_disponibilizacao,
// tipoComunicacao, tipoDocumento, texto (HTML), link, nomeOrgao, etc.
// Headers extra (User-Agent, Referer) evitam 403 — a API do CNJ bloqueia
// requests sem UA identificavel.
var _DJEN_ERRO_LOGADO = false;
function consultarDJEN(numeroCNJ, dataDesdeISO) {
  var numero = String(numeroCNJ).trim();
  if (!numero) return [];
  var params = [
    'numeroProcesso=' + encodeURIComponent(numero),
    'itensPorPagina=50',
    'pagina=1'
  ];
  if (dataDesdeISO) {
    params.push('dataDisponibilizacaoInicio=' + dataDesdeISO.slice(0,10));
  }
  var url = DJEN_URL + '?' + params.join('&');
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'Accept':          'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Referer':         'https://comunica.pje.jus.br/',
        'Origin':          'https://comunica.pje.jus.br'
      }
    });
  } catch (e) {
    Logger.log('  DJEN fetch erro ' + numero + ': ' + e);
    return [];
  }
  var code = resp.getResponseCode();
  if (code !== 200) {
    // Loga corpo do erro na 1a vez pra debug
    if (!_DJEN_ERRO_LOGADO) {
      _DJEN_ERRO_LOGADO = true;
      var body = resp.getContentText();
      Logger.log('  DJEN HTTP ' + code + ' body: ' + body.substring(0, 500));
    }
    Logger.log('  DJEN HTTP ' + code + ' para ' + numero);
    return [];
  }
  var json;
  try { json = JSON.parse(resp.getContentText()); } catch(e) { return []; }
  if (!json || json.status !== 'success') return [];
  return (json.items || []);
}

// ── REPARO: preenche texto_completo dos andamentos DJEN antigos que
// ficaram salvos sem texto. Roda MANUALMENTE (menu Executar) uma vez
// depois desse deploy. Batching de 50 por execucao (limite Apps Script).
function repararTextosDJEN() {
  var url = SUPABASE_URL + '/rest/v1/andamentos_processos' +
    '?origem=eq.cnj-djen&texto_completo=is.null&id_comunicacao=not.is.null' +
    '&select=id,id_comunicacao&limit=50';
  var arr = supabaseGet(url.substring(SUPABASE_URL.length));
  if (!arr || !arr.length) {
    Logger.log('repararTextosDJEN: nada pendente.');
    return;
  }
  var ok = 0, semTexto = 0, erros = 0;
  for (var i = 0; i < arr.length; i++) {
    var row = arr[i];
    try {
      var det = consultarDJENDetalhe(row.id_comunicacao);
      var texto = det ? extrairTextoDJEN(det) : '';
      if (texto) {
        supabasePatch(
          '/rest/v1/andamentos_processos?id=eq.' + row.id,
          { texto_completo: texto }
        );
        ok++;
      } else {
        semTexto++;
      }
    } catch (e) {
      Logger.log('  erro id_com=' + row.id_comunicacao + ': ' + e);
      erros++;
    }
    Utilities.sleep(200); // gentil com a API do CNJ
  }
  Logger.log('repararTextosDJEN: ' + ok + ' preenchidos · ' + semTexto + ' ainda sem texto · ' + erros + ' erros. Rode de novo pra próximo batch.');
}

// ── DJEN: extrai texto integral tentando varios nomes de campo ───
// A API do CNJ ja mudou nome do campo algumas vezes (texto vs
// textocategoria vs conteudo). Tenta todos, retorna o primeiro nao
// vazio. Se nada bater, chamador tenta consultarDJENDetalhe.
function extrairTextoDJEN(pub) {
  if (!pub) return '';
  var candidatos = [
    pub.texto, pub.textoCompleto, pub.texto_completo,
    pub.textoCategoria, pub.textocategoria,
    pub.conteudo, pub.textoHtml, pub.textohtml,
    pub.textoHTML, pub.textoDocumento, pub.corpo,
    pub.inteiroTeor, pub.inteiro_teor
  ];
  for (var i = 0; i < candidatos.length; i++) {
    var v = candidatos[i];
    if (v && String(v).trim().length > 20) return String(v);
  }
  return '';
}

// ── DJEN: busca detalhe de UMA comunicacao (fallback quando o item
// da listagem nao traz texto integral). ─────────────────────────────
function consultarDJENDetalhe(idComunicacao) {
  if (!idComunicacao) return null;
  // Tenta 2 formatos de URL — endpoint /{id} e endpoint /{id}/inteiroteor.
  // O primeiro que devolver 200 com JSON vale.
  var urls = [
    DJEN_URL + '/' + encodeURIComponent(idComunicacao),
    DJEN_URL + '/' + encodeURIComponent(idComunicacao) + '/inteiroteor'
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var resp = UrlFetchApp.fetch(urls[i], {
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          'Accept':          'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Referer':         'https://comunica.pje.jus.br/',
          'Origin':          'https://comunica.pje.jus.br'
        }
      });
      if (resp.getResponseCode() !== 200) continue;
      var raw = resp.getContentText();
      // Alguns endpoints retornam HTML puro no inteiroteor
      if (raw && raw.charAt(0) !== '{' && raw.charAt(0) !== '[') {
        return { textoHtml: raw };
      }
      var j = JSON.parse(raw);
      // Se veio no formato items:[], pega o primeiro
      if (j && j.items && j.items.length) return j.items[0];
      if (j && j.item)  return j.item;
      if (j) return j;
    } catch (e) {
      // Continua tentando o proximo formato
    }
  }
  return null;
}

// ── DJEN: dedup — busca ids ja salvos para este processo ─────────
function idsDJENJaSalvos(processoId) {
  try {
    var arr = supabaseGet(
      '/rest/v1/andamentos_processos?processo_id=eq.' + processoId +
      '&id_comunicacao=not.is.null&select=id_comunicacao'
    );
    var set = {};
    (arr || []).forEach(function(r){ if (r.id_comunicacao) set[r.id_comunicacao] = true; });
    return set;
  } catch (e) {
    Logger.log('  erro idsDJENJaSalvos: ' + e);
    return {};
  }
}

// ── SUPABASE REST ────────────────────────────────────────────────
function supabaseGet(path) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('Supabase HTTP ' + code + ': ' + resp.getContentText().substring(0,200));
  return JSON.parse(resp.getContentText());
}

function supabasePost(path, body) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=representation' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('Supabase HTTP ' + code + ': ' + resp.getContentText().substring(0,200));
  return JSON.parse(resp.getContentText());
}

function supabasePatch(path, body) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: 'patch',
    contentType: 'application/json',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('Supabase HTTP ' + code + ': ' + resp.getContentText().substring(0,200));
  return true;
}

function atualizarUltimaSync(processoId, maxDataMov) {
  var patch = { ultima_sync_cnj: new Date().toISOString() };
  if (maxDataMov) patch.ultimo_mov_cnj = maxDataMov.toISOString();
  try { supabasePatch('/rest/v1/processos?id=eq.' + processoId, patch); }
  catch (e) { Logger.log('  erro atualizar ultima_sync: ' + e); }
}

// ── EMAIL RESUMO POR ADVOGADO ────────────────────────────────────
function enviarResumoAdvogado(email, resumo) {
  var totalMovs = resumo.processos.reduce(function(s,p){ return s + p.movimentos.length; }, 0);
  var html =
'<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
'<body style="margin:0;padding:0;background:#f0f2f5;font-family:Helvetica,Arial,sans-serif">' +
'<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
'<div style="background:#1E2D4A;padding:24px 32px;text-align:center">' +
'<div style="font-size:20px;font-weight:700;color:#fff">Nova São Paulo Imobiliária</div>' +
'<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.5);margin-top:4px">Sincronização Diária TJSP</div>' +
'</div>' +
'<div style="padding:28px 32px">' +
'<p style="font-size:15px;color:#1e293b;margin:0 0 8px"><strong>Olá, ' + (resumo.nome||'colega') + '!</strong></p>' +
'<p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.5">' +
'Encontramos <strong>' + totalMovs + ' nova(s) movimentação(ões)</strong> nos seus ' + resumo.processos.length + ' processo(s) acompanhado(s):' +
'</p>';

  resumo.processos.forEach(function(p){
    html += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:14px">';
    html += '<div style="font-weight:700;font-size:14px;color:#1E2D4A">' + p.numero + '</div>';
    if (p.autor || p.reu) html += '<div style="font-size:12px;color:#64748b;margin-top:2px">' + (p.autor||'') + (p.reu?' × '+p.reu:'') + '</div>';
    if (p.fase) html += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + p.fase + '</div>';
    html += '<div style="margin-top:10px;border-top:1px solid #f1f5f9;padding-top:10px">';
    p.movimentos.forEach(function(m){
      var dataFmt = m.data ? new Date(m.data).toLocaleDateString('pt-BR') : '—';
      html += '<div style="font-size:13px;padding:4px 0"><span style="color:#94a3b8">' + dataFmt + '</span> &nbsp;' + m.nome + '</div>';
    });
    html += '</div></div>';
  });

  html +=
'<p style="font-size:12px;color:#94a3b8;line-height:1.5;margin-top:20px">' +
'Os dados foram obtidos da API pública do CNJ DataJud e já estão registrados em <em>andamentos do processo</em> no sistema FalcãoVaz.' +
'</p>' +
'</div>' +
'<div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">' +
'<p style="font-size:11px;color:#94a3b8;margin:0">Nova São Paulo Imobiliária · Jurídico · Sincronização automática</p>' +
'</div>' +
'</div></body></html>';

  MailApp.sendEmail({
    to: email,
    subject: '⚖️ ' + totalMovs + ' movimentação(ões) nova(s) — ' + resumo.processos.length + ' processo(s)',
    htmlBody: html,
    name: EMAIL_REMETENTE,
    replyTo: REPLY_TO
  });
}

// ── INSTALACAO DO TRIGGER (rodar 1 vez manualmente) ──────────────
function instalarTriggerDiario() {
  // Remove triggers antigos da mesma funcao
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t){
    if (t.getHandlerFunction() === 'sincronizarProcessosTJSP') ScriptApp.deleteTrigger(t);
  });
  // 2x ao dia (7h e 13h) — com BATCH_SIZE=40, cobre 80 processos/dia.
  // Cada execucao prioriza os menos sincronizados (ultima_sync ASC NULLS FIRST).
  ScriptApp.newTrigger('sincronizarProcessosTJSP').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('sincronizarProcessosTJSP').timeBased().everyDays(1).atHour(13).create();
  Logger.log('Triggers instalados: 7h e 13h diariamente.');
}

// ── TESTE MANUAL — rodar uma vez para validar ────────────────────
function testarSync() {
  sincronizarProcessosTJSP();
}

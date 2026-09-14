// ═══════════════════════════════════════════════════════════════
// FORUM DOS REPRESENTANTES — snippet pra plugar no GAS_EMAIL
// Copiar/colar essas 3 funcoes + adicionar 2 linhas no doGet.
// ═══════════════════════════════════════════════════════════════

// Lista de emails que recebem TUDO do forum. Ajuste conforme mudanca
// de gerente/representante. Duplicados sao ignorados.
var FORUM_EMAILS_DESTINO = [
  // 5 representantes
  'ricardo.angerami@novasaopaulo.com.br',
  'maria.matias@novasaopaulo.com.br',
  'domenica@novasaopaulo.com.br',
  'willian@novasaopaulo.com.br',
  'won.chang@novasaopaulo.com.br',
  // Gerentes (adicione os emails reais aqui)
  'renata@novasaopaulo.com.br',
  'felippe@novasaopaulo.com.br',
  'christiane@novasaopaulo.com.br',
  'emilia@novasaopaulo.com.br',
  // Rodrigo/admin
  'rodrigo@falcaovaz.com.br'
];
var FORUM_DE_NOME = 'Nova São Paulo Imobiliária';

// ── 1) Notifica novo topico ───────────────────────────────────
function acaoForumNovoTopico(data) {
  var d = JSON.parse(data);
  var assunto = '💬 Novo tópico no Fórum: ' + d.titulo;
  var corpo =
    'Um novo tópico foi proposto no Fórum dos Representantes:\n\n' +
    '📌 ' + d.titulo + '\n' +
    'Categoria: ' + (d.tag_label || d.tag || '—') + '\n' +
    'Autor: ' + (d.autor_nome || '—') + ' (' + (d.autor_equipe || '—') + ')\n' +
    'Trimestre: Q' + d.trimestre + ' ' + d.ano + '\n\n' +
    (d.descricao ? '📝 Descrição:\n' + d.descricao + '\n\n' : '') +
    '🔗 Acesse pra opinar e votar: ' + (d.link || 'https://novasp.netlify.app') + '\n\n' +
    'Você pode:\n' +
    '  • ⭐ Priorizar (se acha que deve entrar na pauta da reunião)\n' +
    '  • 👍 Aprovar / 👎 Reprovar (votação da decisão — 3 de 5 decide)\n' +
    '  • 💬 Comentar pra debater\n\n' +
    FORUM_DE_NOME;
  return forumEnviarPra(FORUM_EMAILS_DESTINO, assunto, corpo);
}

// ── 2) Notifica decisao atingida (3+ votos) ───────────────────
function acaoForumDecisao(data) {
  var d = JSON.parse(data);
  var emoji = d.decisao === 'aprovado' ? '✅' : '❌';
  var assunto = emoji + ' Decisão do Fórum: "' + d.titulo + '" — ' + String(d.decisao||'').toUpperCase();
  var corpo =
    'O tópico abaixo atingiu maioria e a votação foi encerrada:\n\n' +
    '📌 ' + d.titulo + '\n' +
    'Autor: ' + (d.autor_nome || '—') + ' (' + (d.autor_equipe || '—') + ')\n\n' +
    emoji + ' Decisão: ' + String(d.decisao||'').toUpperCase() + '\n' +
    '👍 Aprovações: ' + (d.aprovacoes||0) + '\n' +
    '👎 Reprovações: ' + (d.reprovacoes||0) + '\n\n' +
    '🔗 Ver detalhes: ' + (d.link || 'https://novasp.netlify.app') + '\n\n' +
    FORUM_DE_NOME;
  return forumEnviarPra(FORUM_EMAILS_DESTINO, assunto, corpo);
}

// ── Helper: envia pra lista deduplicada ───────────────────────
function forumEnviarPra(lista, assunto, corpo) {
  var vistos = {};
  var enviados = 0, falhas = [];
  var cota;
  try { cota = MailApp.getRemainingDailyQuota(); } catch(_) { cota = null; }
  (lista||[]).forEach(function(e) {
    var addr = String(e||'').trim().toLowerCase();
    if (!addr || !/@/.test(addr) || vistos[addr]) return;
    vistos[addr] = true;
    if (cota !== null && enviados >= cota) {
      falhas.push({email: addr, erro: 'Cota diaria esgotada'});
      return;
    }
    try {
      MailApp.sendEmail({to: addr, subject: assunto, body: corpo, name: FORUM_DE_NOME});
      enviados++;
    } catch(err) {
      falhas.push({email: addr, erro: String(err && err.message || err)});
    }
  });
  Logger.log('forum email: ' + enviados + ' enviado(s), ' + falhas.length + ' falha(s)');
  return ContentService
    .createTextOutput(JSON.stringify({success:true, enviados:enviados, falhas:falhas, cota:cota}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// EDITAR SEU doGet DO GAS_EMAIL — adicione essas 2 linhas:
// ═══════════════════════════════════════════════════════════════
//
// function doGet(e) {
//   var p = (e && e.parameter) || {};
//   var action = p.action;
//   var data   = p.data;
//   if (action === 'solicitar_reset')     return acaoSolicitarReset(data);
//   if (action === 'verificar_reset')     return acaoVerificarReset(data);
//   if (action === 'forum_novo_topico')   return acaoForumNovoTopico(data);   // ← adicionar
//   if (action === 'forum_decisao')       return acaoForumDecisao(data);      // ← adicionar
//   return ContentService.createTextOutput(JSON.stringify({success:false, error:'Acao invalida'})).setMimeType(ContentService.MimeType.JSON);
// }

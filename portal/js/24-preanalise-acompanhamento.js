/* =====================================================================
   24-preanalise-acompanhamento.js — ACOMPANHAMENTO DA VENDA na Pré-análise (06/11/2026)
   ---------------------------------------------------------------------
   Trazido do programa local da Renata (versão de 06/11), que fica só como referência:
   • Andamento por etapas (Pesquisa → Contrato → Escritura e assessoria → Entrega e comissão → Pós-venda), com status
     SUGERIDO pelo portal e status fixado à mão; marcos da venda; etapa atual e quadro por etapas no painel.
   • Emissão de certidões em MODO ASSISTIDO: o que falta, o que venceu e o que vence em até 5 dias, por pessoa, com o
     link do portal de cada órgão. Nada é emitido sozinho (conectores automáticos e gov.br ficaram fora de propósito).
   • Protocolos (chaves, documentos, escritura), autorizações, notificações extrajudiciais e recibos de comissão,
     numerados NSP-AAAA-NNNN pelo banco, com status, anexos e documento em PDF e Word (modelo básico; o texto jurídico
     da notificação e da autorização é da Fernanda).
   • Pós-venda (contas de consumo, condomínio, recibos e notas fiscais, arquivos) e arquivamento da venda.
   • Linha do tempo da venda.
   08/11/2026 (pacote da Renata de 07/11): marcos "proposta enviada" e "documentos enviados ao banco" com prazos do banco
     (Modelos 1, 3 e 4); procuração, declarações e formulários da NSP; chaves, documentos e declarações saem no modelo
     Word da NSP (modelos-nsp/) preenchido no navegador (JSZip) e o PDF é desenhado a partir dele (docx-preview);
     cartório por extenso com "de/da/do" em minúsculas. SQL: sql/2026-11-08-preanalise-responsaveis-banco-modelos.sql.
   Banco: sql/2026-11-06-preanalise-acompanhamento.sql. Usa os utilitários de js/23-preanalise.js (PreAnalise._u).
   ===================================================================== */
(function () {
  'use strict';
  const U = () => window.PreAnalise._u;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NSP = 'Organização Imobiliária Nova São Paulo Ltda';
  const INP = 'padding:6px 8px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px';
  const MAX_ANEXO = 20 * 1024 * 1024;

  // ── ETAPAS (as do acompanhamento atual da NSP, como no programa da Renata) ──
  const ETAPAS = [
    { id: 'pesquisa', nome: 'Pesquisa', tarefas: [
      { id: 'certidoes', nome: 'Certidões e matrículas', alvo: 'pa-emissao' },
      { id: 'pendencias', nome: 'Verificação de pendências', alvo: 'pa-dossie' }] },
    { id: 'contrato', nome: 'Contrato', tarefas: [
      { id: 'minuta', nome: 'Contrato de compra e venda' },
      { id: 'assinatura', nome: 'Assinatura eletrônica' },
      { id: 'sinal', nome: 'Cobrança de sinal' },
      { id: 'prazos', nome: 'Verificação de prazos', alvo: 'pa-prazos' },
      { id: 'docs74', nome: 'Documentação (cláusula 7.4)', alvo: 'pa-emissao' }] },
    { id: 'escritura', nome: 'Escritura e assessoria', tarefas: [
      { id: 'banco', nome: 'Contrato bancário e crédito imobiliário' },
      { id: 'protoc_escritura', nome: 'Protocolo de entrega de escritura', alvo: 'pa-protocolos' },
      { id: 'registro', nome: 'Registro na matrícula' }] },
    { id: 'entrega', nome: 'Entrega e comissão', tarefas: [
      { id: 'chaves', nome: 'Entrega de chaves', alvo: 'pa-protocolos' },
      { id: 'comissao', nome: 'Comissão: recibo e nota fiscal', alvo: 'pa-posvenda' }] },
    { id: 'posvenda', nome: 'Pós-venda', tarefas: [
      { id: 'contas', nome: 'Contas de consumo', alvo: 'pa-posvenda' },
      { id: 'condominio', nome: 'Condomínio', alvo: 'pa-posvenda' },
      { id: 'arquivo', nome: 'Arquivamento da venda', alvo: 'pa-posvenda' }] }
  ];
  const ST = { pendente: ['Pendente', '#475569', '#f1f5f9'], andamento: ['Em andamento', '#1d4ed8', '#eff6ff'], concluida: ['Concluída', '#047857', '#ecfdf5'],
               divergencia: ['Com divergência', '#b91c1c', '#fef2f2'], desativada: ['Desativada', '#94a3b8', '#f8fafc'] };
  const MARCOS = [['inicio', 'Início'], ['proposta_enviada', 'Proposta enviada'], ['contrato_assinado', 'Contrato assinado'], ['docs_banco', 'Documentos enviados ao banco'],
                  ['financiamento', 'Financiamento'], ['comissao', 'Comissão'], ['registro', 'Registro'], ['entrega_chaves', 'Entrega de chaves']];
  const VERSOES = { '1': 'Modelo 1 — financiamento + FGTS (imóvel vendido ao locatário)', '2': 'Modelo 2 — à vista',
                    '3': 'Modelo 3 — financiamento/alienação fiduciária + FGTS, vendedor pessoa jurídica', '4': 'Modelo 4 — à vista com FGTS' };

  // ── BANCO (pacote da Renata de 07/11): vendas com financiamento/FGTS passam pelo banco (Modelos 1, 3 e 4).
  // Prazos: dias para enviar os documentos (contados do contrato assinado) e dias para o banco devolver (contados do envio).
  // Vazio = padrão do modelo (Modelo 3: 20 e 90; Modelo 4: 30 e 60; Modelo 1: sem padrão).
  const PRAZO_BANCO_PAD = { '3': [20, 90], '4': [30, 60] };
  const usaBanco = v => ['1', '3', '4'].includes(String((v || {}).versao_contrato || ''));
  function prazosBanco(v) {
    const p = PRAZO_BANCO_PAD[v.versao_contrato] || [null, null], n = (x, d) => Number(x) > 0 ? Math.round(Number(x)) : d;
    return [n(v.prazo_docs_banco_dias, p[0]), n(v.prazo_retorno_banco_dias, p[1])];
  }
  function prazosBancoDe(v) {                          // entra na lista de prazos da venda (painel, alertas, tarefa "Verificação de prazos")
    if (!usaBanco(v)) return [];
    const u = U(), mk = v.marcos || {}, [dd, db] = prazosBanco(v), out = [];
    if (mk.contrato_assinado && dd) out.push({ titulo: `Enviar os documentos ao banco (${dd} dias do contrato)`, data: u.somaDias(mk.contrato_assinado, dd), feito: !!mk.docs_banco, banco: true });
    if (mk.docs_banco && db) out.push({ titulo: `Retorno do banco (${db} dias do envio)`, data: u.somaDias(mk.docs_banco, db), feito: !!mk.financiamento, banco: true });
    return out;
  }
  const REV = { aprovado: 'aprovado', aprovado_ressalvas: 'aprovado com ressalvas', nao_aprovado: 'não aprovado' };

  // ── PROTOCOLOS ──
  const PTIPO = { chaves: 'Protocolo de entrega de chaves', documentos: 'Protocolo de entrega de documentos', escritura: 'Protocolo de entrega de escritura / contrato bancário',
                  autorizacao: 'Autorização', notificacao: 'Notificação extrajudicial', recibo: 'Recibo de comissão',
                  procuracao: 'Procuração', atual_proprietario: 'Declaração de atual proprietário', chaves_proprietario: 'Declaração de entrega de chaves e atual proprietário',
                  declaracao_uniao_estavel: 'Declaração de estado civil e inexistência de união estável', declaracao_patrimonio: 'Termo de declaração de patrimônio',
                  direito_preferencia: 'Desistência do direito de preferência (locatário)', proposta: 'Proposta de compra', exclusividade: 'Autorização de venda com exclusividade',
                  corretagem: 'Contrato de corretagem e intermediação', parceria_autonomo: 'Parceria de comissão — corretor autônomo', parceria_pj: 'Parceria de comissão — pessoa jurídica' };
  // grupos do seletor "+ Novo" (recibo sai pelo Pós-venda)
  const PGRUPOS = [['Protocolos, autorizações e notificações', ['chaves', 'documentos', 'escritura', 'autorizacao', 'procuracao', 'notificacao']],
                   ['Declarações (modelo da NSP, preenchido)', ['atual_proprietario', 'chaves_proprietario', 'declaracao_uniao_estavel', 'declaracao_patrimonio']],
                   ['Formulários da NSP (Word em branco)', ['proposta', 'exclusividade', 'corretagem', 'direito_preferencia', 'parceria_autonomo', 'parceria_pj']]];
  // modelos Word da NSP (pasta modelos-nsp/, vindos do pacote da Renata de 07/11). Campos {{...}} preenchidos no navegador.
  const MODELO = { chaves: 'NSP_Doc_chaves.docx', documentos: 'NSP_Doc_documentos.docx', atual_proprietario: 'NSP_Doc_atual_proprietario.docx',
                   chaves_proprietario: 'NSP_Doc_chaves_proprietario.docx', declaracao_uniao_estavel: 'NSP_Doc_declaracao_uniao_estavel.docx',
                   declaracao_patrimonio: 'NSP_Doc_declaracao_patrimonio.docx', proposta: 'NSP_Doc_proposta.docx', exclusividade: 'NSP_Doc_exclusividade.docx',
                   corretagem: 'NSP_Doc_corretagem.docx', direito_preferencia: 'NSP_Doc_direito_preferencia.docx', parceria_autonomo: 'NSP_Doc_parceria_autonomo.docx',
                   parceria_pj: 'NSP_Doc_parceria_pj.docx' };
  const EM_BRANCO = new Set(['proposta', 'exclusividade', 'corretagem', 'direito_preferencia', 'parceria_autonomo', 'parceria_pj']);
  const MODELOS_V = '20261108';
  const PST = { emitido: 'Emitido', assinado: 'Assinado / recebido', enviado: 'Enviado', recebido: 'Recebido pelo notificado', cumprido: 'Obrigação cumprida', descumprido: 'Obrigação descumprida', cancelado: 'Cancelado' };
  const PST_TIPO = { notificacao: ['emitido', 'enviado', 'recebido', 'cumprido', 'descumprido', 'cancelado'] };
  const pstDo = t => PST_TIPO[t] || ['emitido', 'assinado', 'cancelado'];
  const ROT = {
    chaves: ['Entregue por', 'Recebido por', 'Chaves e itens entregues (jogos de chaves, controles, itens que ficam no imóvel)'],
    documentos: ['Entregue por', 'Recebido por', 'Documentos entregues'],
    escritura: ['Entregue por', 'Recebido por', 'Instrumento entregue'],
    autorizacao: ['Autorizante', 'Autorizado', 'O que fica autorizado'],
    notificacao: ['Notificante', 'Notificado(a)', 'Obrigação a cumprir'],
    recibo: ['Quem paga a comissão', 'Beneficiário', 'Referência'],
    procuracao: ['Outorgante', 'Outorgado(a)', 'Poderes (para que fim)'],
    atual_proprietario: ['Vendedores', 'Compradores', 'Observação interna'],
    chaves_proprietario: ['Vendedores', 'Compradores', 'Observação interna'],
    declaracao_uniao_estavel: ['Declarante (nome, nacionalidade, profissão, RG, CPF e endereço)', 'Estado civil (ex.: solteiro, divorciado, viúvo)', 'Observação interna'],
    declaracao_patrimonio: ['Vendedores', 'Compradores', 'Patrimônio que garante (imóvel: endereço, cartório, matrícula e valor aproximado)'],
    proposta: ['Proponente (comprador)', 'Destinatário', 'Resumo (interno)'],
    exclusividade: ['Proprietário(s)', 'Imobiliária', 'Resumo (interno)'],
    corretagem: ['Contratante', 'Imobiliária', 'Resumo (interno)'],
    direito_preferencia: ['Locatário', 'Proprietário(s)', 'Resumo (interno)'],
    parceria_autonomo: ['Imobiliária', 'Corretor parceiro', 'Resumo (interno)'],
    parceria_pj: ['Imobiliária', 'Empresa parceira', 'Resumo (interno)']
  };

  // ── EMISSÃO ASSISTIDA (links da lista da Renata, 06/11/2026) ──
  const FONTES = [
    { id: 'matricula', nome: 'Certidão de matrícula (ONR — Registradores)', alvo: 'imovel', portal: 'https://registradores.onr.org.br', dica: 'Número da matrícula e cartório. Vale 30 dias.' },
    { id: 'tributos_imovel', nome: 'Prefeitura de SP — tributos imobiliários (IPTU)', alvo: 'imovel', portal: 'http://www3.prefeitura.sp.gov.br/certidaotributaria', dica: 'Pelo SQL do imóvel. Com pendência, a Prefeitura manda pedir análise pelo DUC (Senha Web).' },
    { id: 'receita', nome: 'Receita Federal / PGFN — CND', alvo: 'pessoa', portal: 'https://servicos.receitafederal.gov.br/servico/certidoes', dica: 'CPF ou CNPJ; pessoa física pede a data de nascimento. Se já houver certidão válida, baixe a 2ª via.' },
    { id: 'tst', nome: 'TST — CNDT (débitos trabalhistas)', alvo: 'pessoa', portal: 'https://www.tst.jus.br/certidao', dica: 'CPF ou CNPJ.' },
    { id: 'trt2', nome: 'TRT 2ª Região — ações trabalhistas', alvo: 'pessoa', portal: 'https://ww2.trt2.jus.br/servicos/certidoes', dica: 'Conferir se cobre processos físicos e PJe.' },
    { id: 'trf3', nome: 'Justiça Federal — certidão unificada (cível)', alvo: 'pessoa', portal: 'https://certidao-unificada.cjf.jus.br/#/solicitacao-certidao', dica: 'CPF/CNPJ e e-mail. Sem ocorrência sai na hora; com ocorrência, até 5 dias úteis.' },
    { id: 'tjsp_civel', nome: 'TJSP — distribuição cível', alvo: 'pessoa', portal: 'https://certidoes.tjsp.jus.br/', dica: 'São duas: a do e-SAJ e a das Comarcas e Turmas Recursais (eproc, pede conta gov.br).' },
    { id: 'tjsp_fiscal', nome: 'TJSP — execuções fiscais', alvo: 'pessoa', portal: 'https://certidoes.tjsp.jus.br/', dica: 'No mesmo portal do TJSP.' },
    { id: 'protestos', nome: 'Protestos — consulta Cenprot SP', alvo: 'pessoa', portal: 'https://protestosp.com.br/consulta-de-protesto', dica: 'Consulta indicativa (é a que o modelo da NSP pede).' }
  ];
  const AVISO_DIAS = 5;

  // ── utilidades ──
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const PARADAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'ltda', 'me', 'epp', 'sa']);
  const tokens = s => norm(s).split(' ').filter(w => w.length > 1 && !PARADAS.has(w));
  function mesmaPessoa(a, b) {
    const A = tokens(a), B = tokens(b); if (!A.length || !B.length) return false;
    const comum = A.filter(w => B.includes(w)).length, menor = Math.min(A.length, B.length);
    return A[0] === B[0] ? comum >= Math.min(2, menor) : comum >= Math.max(2, Math.min(3, menor));
  }
  const linhas = s => String(s || '').split(/\n|;/).map(x => x.trim()).filter(Boolean);
  const juntar = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
  const badgeSt = st => { const s = ST[st] || ST.pendente; return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;color:${s[1]};background:${s[2]};border:1px solid ${s[1]}33;white-space:nowrap">${s[0]}</span>`; };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dataExtenso = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ''; const d = +m[3]; return `${d === 1 ? '1º' : d} de ${MESES[+m[2] - 1]} de ${m[1]}`; };
  const moeda = n => n == null || n === '' || isNaN(Number(n)) ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = s => { if (s == null || s === '') return null; const t = String(s).replace(/[^\d,.-]/g, ''); if (!/\d/.test(t)) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isNaN(n) ? null : n; };

  // número por extenso (para prazo em dias e valor do recibo)
  const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(CT[c]);
    if (r) p.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : ''));
    return p.join(' e ');
  }
  function extenso(n) {
    n = Math.floor(Math.abs(n)); if (!n) return 'zero';
    const g = []; let r = n;
    for (const [d, s, pl] of [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']]) {
      const q = Math.floor(r / d); if (q) { g.push({ v: q * d, t: d === 1e3 ? (q === 1 ? 'mil' : ate999(q) + ' mil') : ate999(q) + ' ' + (q === 1 ? s : pl), mil: d === 1e3 }); r %= d; }
    }
    if (r) g.push({ v: r, t: ate999(r) });
    return g.map((x, i) => {
      if (i === 0) return x.t;
      const ultimo = i === g.length - 1, val = ultimo && !x.mil ? x.v : x.v / (x.mil ? 1e3 : 1);
      const e = ultimo && (x.mil ? (x.v / 1e3 < 100 || (x.v / 1e3) % 100 === 0) : (val < 100 || val % 100 === 0));
      return (e ? ' e ' : (g[i - 1].mil ? ' ' : ', ')) + x.t;
    }).join('');
  }
  function reaisExtenso(v) {
    const c = Math.round(Number(v) * 100), r = Math.floor(c / 100), ct = c % 100; let s = '';
    if (r) s = extenso(r) + (r === 1 ? ' real' : (r % 1e6 === 0 ? ' de reais' : ' reais'));
    if (ct) s += (r ? ' e ' : '') + extenso(ct) + (ct === 1 ? ' centavo' : ' centavos');
    return s || 'zero reais';
  }

  // ── contexto da venda aberta ──
  let C = null;            // { v, docs, execs, ult, protos, eventos }
  let _pv = null;          // pós-venda em edição
  async function carregar(v, docs, execs) {
    const ult = execs.find(x => x.situacao === 'ok') || null;
    const [protos, eventos] = await Promise.all([
      db.get('preanalise_protocolo', `?venda_id=eq.${v.id}&select=*&order=criado_em.asc`),
      db.get('preanalise_evento', `?venda_id=eq.${v.id}&select=*&order=quando.desc&limit=300`)]);
    C = { v, docs, execs, ult, protos, eventos };
    _pv = JSON.parse(JSON.stringify(v.pos_venda || {}));
    return C;
  }
  const recarregar = () => window.PreAnalise.venda(C.v.id);
  async function evento(acao, detalhe) {
    try { await db.post('preanalise_evento', { venda_id: C.v.id, por: U().quem(), acao, detalhe: detalhe || null }); } catch (_) {}
  }
  const titulares = (v, ult) => { const p = ((((ult || {}).resultado) || {}).matricula || {}).proprietarios_atuais || []; return p.length ? p.map(x => x.nome).filter(Boolean) : linhas(v.vendedores); };

  // ══════════════ ETAPAS ══════════════
  // e: { id, mat_data, certidoes, decisao } (a última análise ok, como no painel)
  function auto(v, e, nd, protos) {
    const u = U(), A = {}, mi = u.matInfo(e), ci = u.certInfo(e), mk = v.marcos || {}, pv = v.pos_venda || {};
    const pend = [];
    if (ci && ci.vencidas) pend.push(`${ci.vencidas} certidão(ões) vencida(s)`);
    if (ci && ci.faltando) pend.push(`${ci.faltando} faltando`);
    if (mi && mi.vencida) pend.push('matrícula vencida');
    if (e && v.leitura_conferida_exec !== e.id) pend.push('conferir a leitura');
    if (!nd) A.certidoes = ['pendente', 'nada anexado'];
    else if (!e) A.certidoes = ['andamento', 'rodar a análise'];
    else if (pend.length) A.certidoes = ['andamento', pend.join(' · ')];
    else if (v.escopo !== 'completo') A.certidoes = ['andamento', 'análise só da matrícula: falta a das certidões'];
    else A.certidoes = ['concluida', 'matrícula e certidões em dia'];
    A.docs74 = A.certidoes;

    if (!e) A.pendencias = ['pendente', 'rodar a análise'];
    else if (v.revisao_status === 'nao_aprovado') A.pendencias = ['divergencia', 'jurídico não aprovou'];
    else if (v.revisao_status) A.pendencias = ['concluida', 'jurídico: ' + REV[v.revisao_status]];
    else if (v.status === 'liberado') A.pendencias = ['concluida', 'Liberado'];
    else if (v.status === 'bloqueado') A.pendencias = ['divergencia', 'Bloqueado' + (v.encaminhado_juridico ? ': no jurídico' : '')];
    else A.pendencias = ['andamento', v.encaminhado_juridico ? 'aguarda a revisão jurídica' : 'encaminhar ao jurídico'];

    const liberada = v.status === 'liberado' || v.revisao_status === 'aprovado' || v.revisao_status === 'aprovado_ressalvas';
    if (mk.contrato_assinado) { A.minuta = ['concluida', 'assinado em ' + u.dia(mk.contrato_assinado)]; A.assinatura = ['concluida', 'em ' + u.dia(mk.contrato_assinado)]; }
    else { A.minuta = liberada ? ['andamento', 'liberada para o contrato'] : ['pendente', 'aguarda a análise liberada']; A.assinatura = ['pendente', '']; }
    A.sinal = ['pendente', ''];

    const todos = u.prazosDe(v), abertos = todos.filter(p => !p.feito), venc = abertos.filter(p => u.diasEntre(u.hojeIso(), p.data) < 0);
    A.prazos = !todos.length ? ['pendente', 'nenhum prazo cadastrado'] : venc.length ? ['divergencia', `${venc.length} prazo(s) vencido(s)`]
      : abertos.length ? ['andamento', `próximo: ${abertos[0].titulo} em ${u.dia(abertos[0].data)}`] : ['concluida', 'todos cumpridos'];

    if (mk.financiamento) A.banco = ['concluida', 'em ' + u.dia(mk.financiamento)];
    else if (v.versao_contrato === '2') A.banco = ['desativada', 'venda à vista'];
    else if (!usaBanco(v)) A.banco = ['pendente', ''];
    else {
      const [dd, db] = prazosBanco(v), hoje = u.hojeIso();
      if (mk.docs_banco) { const lim = db ? u.somaDias(mk.docs_banco, db) : null;
        A.banco = lim && lim < hoje ? ['divergencia', `banco passou do prazo (${u.dia(lim)})`] : ['andamento', `documentos enviados em ${u.dia(mk.docs_banco)}${lim ? '; retorno até ' + u.dia(lim) : ''}`]; }
      else if (mk.contrato_assinado && dd) { const lim = u.somaDias(mk.contrato_assinado, dd);
        A.banco = lim < hoje ? ['divergencia', `documentos ao banco: prazo venceu em ${u.dia(lim)}`] : ['andamento', `enviar os documentos ao banco até ${u.dia(lim)}`]; }
      else A.banco = ['pendente', mk.contrato_assinado ? 'informe o prazo para enviar os documentos ao banco' : ''];
    }
    const doTipo = t => (protos || []).filter(p => p.tipo === t && p.status !== 'cancelado');
    const protoSt = t => { const ps = doTipo(t), ok = ps.find(p => p.status === 'assinado' || p.status === 'recebido');
      return ok ? ['concluida', ok.numero + ' assinado'] : ps.length ? ['andamento', ps[ps.length - 1].numero + ' emitido'] : ['pendente', 'sem protocolo']; };
    A.protoc_escritura = protoSt('escritura');
    A.registro = mk.registro ? ['concluida', 'em ' + u.dia(mk.registro)] : v.escritura_feita ? ['andamento', 'escritura feita: falta o registro'] : ['pendente', ''];
    A.chaves = protoSt('chaves'); if (A.chaves[0] !== 'concluida' && mk.entrega_chaves) A.chaves = ['concluida', 'entregue em ' + u.dia(mk.entrega_chaves)];

    const rec = pv.recibos || [];
    A.comissao = !rec.length ? (mk.comissao ? ['concluida', 'em ' + u.dia(mk.comissao)] : ['pendente', 'sem registro'])
      : rec.every(r => r.recibo_status === 'recebido' && (r.nf_status === 'recebida' || r.nf_status === 'dispensada')) ? ['concluida', 'recibos e notas fiscais em ordem']
      : ['andamento', `${rec.filter(r => r.recibo_status === 'recebido').length}/${rec.length} recibo(s) recebido(s)`];
    const ct = pv.contas || [];
    A.contas = !ct.length ? ['pendente', 'sem levantamento'] : ct.every(c => c.situacao === 'quitada' || c.situacao === 'transferida') ? ['concluida', 'todas quitadas ou transferidas']
      : ['andamento', `${ct.filter(c => c.situacao === 'quitada' || c.situacao === 'transferida').length}/${ct.length} resolvida(s)`];
    const cd = pv.condominio || {};
    A.condominio = !cd.situacao ? ['pendente', 'sem levantamento'] : (cd.situacao === 'quitado' || cd.situacao === 'transferido') ? ['concluida', cd.situacao] : ['andamento', cd.situacao];
    A.arquivo = v.arquivada_em ? ['concluida', 'arquivada em ' + u.dia(String(v.arquivada_em).slice(0, 10))] : ['pendente', ''];
    return A;
  }
  function etapas(v, e, nd, protos) {
    const A = auto(v, e, nd, protos), man = v.etapas || {};
    const monta = () => ETAPAS.map(et => {
      const ts = et.tarefas.map(t => { const m = man[t.id] || {}, [sug, det] = A[t.id] || ['pendente', ''];
        return Object.assign({}, t, { status: m.status || sug, sugerido: sug, detalhe: det, manual: !!m.status, resp: m.resp || '', prazo: m.prazo || '', nota: m.nota || '' }); });
      const val = ts.filter(t => t.status !== 'desativada'), feitas = val.filter(t => t.status === 'concluida').length;
      return { id: et.id, nome: et.nome, tarefas: ts, feitas, total: val.length, completa: feitas >= val.length };
    });
    let lista = monta();
    const outras = lista.flatMap(x => x.tarefas).filter(t => t.id !== 'arquivo' && t.status !== 'desativada');
    if (!v.arquivada_em && outras.length && outras.every(t => t.status === 'concluida')) { A.arquivo = ['andamento', 'tudo concluído: pode arquivar']; lista = monta(); }
    const atual = lista.find(x => !x.completa) || lista[lista.length - 1];
    const abertas = lista.flatMap(x => x.tarefas).filter(t => t.id !== 'arquivo' && t.status !== 'concluida' && t.status !== 'desativada').map(t => t.nome);
    return { lista, atual, abertas };
  }
  const eDe = x => x ? { id: x.id, mat_data: ((x.resultado || {}).matricula || {}).data_documento, certidoes: (x.resultado || {}).certidoes, decisao: (x.resultado || {}).decisao } : null;

  function etapasHTML() {
    const { v, docs, ult, protos } = C, u = U(), et = etapas(v, eDe(ult), docs.length, protos), mk = v.marcos || {};
    const banco = usaBanco(v), [pdd, pdb] = prazosBanco(v), pad = PRAZO_BANCO_PAD[v.versao_contrato] || [];
    const marcos = MARCOS.filter(([k]) => k !== 'docs_banco' || banco).map(([k, rot]) => { const d = mk[k] || (k === 'inicio' ? String(v.criado_em || '').slice(0, 10) : ''); const n = d ? u.diasEntre(d, u.hojeIso()) : null;
      const sub = k === 'docs_banco' && d && pdb ? ` · retorno até ${u.dia(u.somaDias(d, pdb))}` : k === 'docs_banco' && !d && mk.contrato_assinado && pdd ? `enviar até ${u.dia(u.somaDias(mk.contrato_assinado, pdd))}` : '';
      return `<label style="font-size:11px;color:var(--muted);display:flex;flex-direction:column;gap:2px">${rot}<input type="date" id="pa-mk-${k}" value="${esc(d)}" style="${INP};padding:4px 6px;font-size:12px">
        <small style="color:${d ? '#047857' : sub ? '#b45309' : '#94a3b8'}">${d ? (n > 0 ? `há ${n} dia(s)` : n === 0 ? 'hoje' : `em ${-n} dia(s)`) : sub ? '' : '—'}${sub}</small></label>`; }).join('')
      + (banco ? `<label style="font-size:11px;color:var(--muted);display:flex;flex-direction:column;gap:2px">Prazo p/ enviar docs ao banco (dias do contrato)<input type="number" min="1" id="pa-pz-docsbanco" value="${esc(v.prazo_docs_banco_dias || '')}" placeholder="${pad[0] ? 'padrão ' + pad[0] : 'sem padrão'}" style="${INP};padding:4px 6px;font-size:12px"></label>
        <label style="font-size:11px;color:var(--muted);display:flex;flex-direction:column;gap:2px">Prazo do banco p/ devolver (dias do envio)<input type="number" min="1" id="pa-pz-retbanco" value="${esc(v.prazo_retorno_banco_dias || '')}" placeholder="${pad[1] ? 'padrão ' + pad[1] : 'sem padrão'}" style="${INP};padding:4px 6px;font-size:12px"></label>` : '');
    const sel = t => `<select id="pa-et-st-${t.id}" style="${INP};padding:4px 6px;font-size:12px"><option value="">automático (${esc(ST[t.sugerido][0].toLowerCase())})</option>
      ${Object.keys(ST).map(k => `<option value="${k}" ${t.manual && t.status === k ? 'selected' : ''}>${ST[k][0]}</option>`).join('')}</select>`;
    return `<details class="card" style="margin-bottom:12px" open id="pa-etapas"><summary class="cb" style="cursor:pointer;font-weight:700">🧭 Andamento da venda · etapa atual: ${esc(et.atual.nome)} <small style="font-weight:400;color:var(--muted)">(${et.atual.feitas}/${et.atual.total})</small>${v.arquivada_em ? ' · <span style="color:#475569">arquivada</span>' : ''}</summary>
      <div class="cb" style="padding-top:0">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${et.lista.map(x => `<span style="font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid ${x.completa ? '#04785744' : x === et.atual ? '#1d4ed844' : '#cbd5e1'};color:${x.completa ? '#047857' : x === et.atual ? '#1d4ed8' : '#64748b'};background:${x.completa ? '#ecfdf5' : x === et.atual ? '#eff6ff' : '#f8fafc'}">${x.completa ? '✓' : x === et.atual ? '▶' : '○'} ${esc(x.nome)} ${x.feitas}/${x.total}</span>`).join('')}</div>
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Marcos</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:6px">${marcos}</div>
        <button class="btn btn-o bsm" onclick="PAAcomp.salvarMarcos()">Salvar marcos</button>
        ${et.lista.map(x => `<div style="margin-top:12px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">${esc(x.nome)} <small style="font-weight:400;color:var(--muted)">${x.feitas}/${x.total}</small></div>
          <div class="tw"><table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>${x.tarefas.map(t => `<tr style="border-top:1px solid var(--borda,#e2e8f0)">
            <td style="padding:5px 6px;min-width:150px">${t.alvo ? `<a href="#" onclick="event.preventDefault();PAAcomp.ir('${t.alvo}')" style="color:var(--pri,#0088CC)">${esc(t.nome)}</a>` : esc(t.nome)}</td>
            <td style="padding:5px 6px">${badgeSt(t.status)}${t.manual ? ' <small style="color:var(--muted)">fixado à mão</small>' : ''}${t.detalhe ? `<br><small style="color:var(--muted)">${esc(t.detalhe)}</small>` : ''}</td>
            <td style="padding:5px 6px;white-space:nowrap">${sel(t)}</td>
            <td style="padding:5px 6px"><input id="pa-et-resp-${t.id}" value="${esc(t.resp)}" placeholder="responsável" style="${INP};padding:4px 6px;font-size:12px;width:110px"></td>
            <td style="padding:5px 6px"><input type="date" id="pa-et-prazo-${t.id}" value="${esc(t.prazo)}" style="${INP};padding:4px 6px;font-size:12px"></td>
            <td style="padding:5px 6px"><input id="pa-et-nota-${t.id}" value="${esc(t.nota)}" placeholder="observação" style="${INP};padding:4px 6px;font-size:12px;width:100%;min-width:120px"></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-p bsm" onclick="PAAcomp.salvarEtapas()">Salvar etapas</button>
          <small style="color:var(--muted)">"Automático" segue o que o portal deduz (análise, prazos, marcos, protocolos e pós-venda). Escolha outro status só para corrigir; "Desativada" tira a tarefa da conta.</small></div>
      </div></details>`;
  }
  function ir(id) { const el = document.getElementById(id); if (!el) return; if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function salvarEtapas() {
    const ant = C.v.etapas || {}, novo = {}, mudou = [];
    ETAPAS.forEach(et => et.tarefas.forEach(t => {
      const g = k => ((document.getElementById(`pa-et-${k}-${t.id}`) || {}).value || '').trim();
      const x = { status: g('st') || null, resp: g('resp') || null, prazo: g('prazo') || null, nota: g('nota') || null };
      if (x.status || x.resp || x.prazo || x.nota) novo[t.id] = x;
      if ((ant[t.id] || {}).status !== (x.status || undefined) && ((ant[t.id] || {}).status || x.status)) mudou.push(`${t.nome}: ${x.status ? ST[x.status][0] : 'automático'}`);
    }));
    try { await db.patch('preanalise_venda', C.v.id, { etapas: novo }); if (mudou.length) await evento('Etapas', mudou.join('; ')); U().aviso('Etapas salvas.', 'ok'); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-06 já rodou?)', 'err'); }
  }
  async function salvarMarcos() {
    const ant = C.v.marcos || {}, novo = {}, mudou = [];
    MARCOS.forEach(([k, rot]) => { const el = document.getElementById('pa-mk-' + k);
      if (!el) { if (ant[k]) novo[k] = ant[k]; return; }                       // campo escondido (ex.: banco em venda à vista): mantém o que havia
      const d = el.value || ''; if (d) novo[k] = d; if ((ant[k] || '') !== d && !(k === 'inicio' && !ant[k] && d === String(C.v.criado_em || '').slice(0, 10))) mudou.push(`${rot}: ${d ? U().dia(d) : 'apagado'}`); });
    const d = { marcos: novo };
    if (document.getElementById('pa-pz-docsbanco')) {
      const n = id => { const x = Number((document.getElementById(id) || {}).value); return x > 0 ? Math.round(x) : null; };
      d.prazo_docs_banco_dias = n('pa-pz-docsbanco'); d.prazo_retorno_banco_dias = n('pa-pz-retbanco');
      if (d.prazo_docs_banco_dias !== (C.v.prazo_docs_banco_dias || null) || d.prazo_retorno_banco_dias !== (C.v.prazo_retorno_banco_dias || null))
        mudou.push(`Prazos do banco: ${d.prazo_docs_banco_dias || 'padrão'} / ${d.prazo_retorno_banco_dias || 'padrão'} dias`);
    }
    try { await db.patch('preanalise_venda', C.v.id, d); if (mudou.length) await evento('Marcos', mudou.join('; ')); U().aviso('Marcos salvos.', 'ok'); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-08 já rodou?)', 'err'); }
  }

  // ══════════════ EMISSÃO DE CERTIDÕES (modo assistido) ══════════════
  function plano() {
    const { v, ult } = C, u = U(), r = (ult || {}).resultado || {}, certs = (r.certidoes || []).filter(c => !c.substituida);
    const hoje = u.hojeIso(), VAL = 30;
    const situacao = (data, positiva) => {
      if (!data) return { k: 'semdata', t: 'sem data legível', cor: '#b91c1c' };
      const idade = u.diasEntre(data, hoje); if (idade == null) return { k: 'semdata', t: 'sem data legível', cor: '#b91c1c' };
      const resta = VAL - idade, ate = u.somaDias(data, VAL);
      if (resta < 0) return { k: 'vencida', t: `vencida (emitida em ${u.dia(data)})`, cor: '#b91c1c' };
      if (resta <= AVISO_DIAS) return { k: 'vence', t: `vence em ${resta} dia(s) (${u.dia(ate)})`, cor: '#b45309' };
      return { k: 'ok', t: `em dia até ${u.dia(ate)}${positiva ? ' · POSITIVA' : ''}`, cor: positiva ? '#b45309' : '#047857' };
    };
    const maisNova = lista => lista.sort((a, b) => String(b.data_emissao || '').localeCompare(String(a.data_emissao || '')))[0];
    let pessoas = linhas(v.vendedores); const daMatricula = !pessoas.length;
    if (daMatricula) pessoas = titulares(v, ult);
    const generico = !pessoas.length; if (generico) pessoas = ['Vendedor(es)'];
    const imovel = FONTES.filter(f => f.alvo === 'imovel').map(f => {
      if (f.id === 'matricula') { const d = ((r.matricula || {}).data_documento) || null; return { f, s: ult ? situacao(d) : { k: 'falta', t: 'sem análise', cor: '#475569' } }; }
      const c = maisNova(certs.filter(x => x.orgao === f.id)); return { f, s: c ? situacao(c.data_emissao, c.resultado === 'positiva') : { k: 'falta', t: 'falta', cor: '#b91c1c' } };
    });
    const porPessoa = pessoas.map(p => ({ nome: p, itens: FONTES.filter(f => f.alvo === 'pessoa').map(f => {
      const c = maisNova(certs.filter(x => x.orgao === f.id && (generico || mesmaPessoa(x.refere_a, p))));
      return { f, s: c ? situacao(c.data_emissao, c.resultado === 'positiva') : { k: 'falta', t: 'falta', cor: '#b91c1c' } }; }) }));
    const todos = imovel.concat(...porPessoa.map(p => p.itens));
    return { imovel, porPessoa, daMatricula, generico, emitir: todos.filter(x => x.s.k === 'falta' || x.s.k === 'vencida' || x.s.k === 'semdata').length, vencendo: todos.filter(x => x.s.k === 'vence').length };
  }
  function emissaoHTML() {
    const { v, ult } = C, p = plano();
    const linha = x => `<tr style="border-top:1px solid var(--borda,#e2e8f0)"><td style="padding:5px 6px">${esc(x.f.nome)}</td>
      <td style="padding:5px 6px;color:${x.s.cor};font-weight:${x.s.k === 'ok' ? 400 : 600};white-space:nowrap">${esc(x.s.t)}</td>
      <td style="padding:5px 6px;white-space:nowrap">${x.s.k !== 'ok' ? `<a class="btn btn-o bsm" href="${esc(x.f.portal)}" target="_blank" rel="noopener">Abrir portal ↗</a>` : ''}</td>
      <td style="padding:5px 6px;color:var(--muted)">${esc(x.f.dica)}</td></tr>`;
    const tab = itens => `<div class="tw"><table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>${itens.map(linha).join('')}</tbody></table></div>`;
    const copia = (id, txt) => `<input id="${id}" value="${esc(txt)}" readonly style="${INP};padding:3px 6px;font-size:12px;width:${Math.min(320, 40 + txt.length * 7)}px"> <button class="btn btn-o bsm" onclick="PreAnalise.copiar('${id}')">Copiar</button>`;
    const mat = [v.matricula ? 'matrícula ' + v.matricula : '', v.cartorio || ''].filter(Boolean).join(' · ');
    return `<details class="card" style="margin-bottom:12px" id="pa-emissao" ${p.emitir || p.vencendo ? 'open' : ''}><summary class="cb" style="cursor:pointer;font-weight:700">📄 Emissão de certidões${p.emitir ? ` · <span style="color:#b91c1c">${p.emitir} para emitir</span>` : ''}${p.vencendo ? ` · <span style="color:#b45309">${p.vencendo} vencendo</span>` : ''}</summary>
      <div class="cb" style="padding-top:0">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5">Modo assistido: emita no portal do órgão e suba o PDF em <b>Documentos</b> (tipo Certidão); depois clique em <b>Analisar de novo</b> para ele entrar aqui. Validade de 30 dias; "vencendo" = faltam até ${AVISO_DIAS} dias.
          ${ult ? '' : '<br><b>Ainda sem análise:</b> tudo aparece como falta até a primeira leitura.'}
          ${p.daMatricula && !p.generico ? '<br>Vendedores tirados da matrícula (a proposta não informou): confira em Dados da proposta.' : ''}${p.generico ? '<br>Informe os vendedores em Dados da proposta para o plano sair pessoa por pessoa.' : ''}</div>
        <div style="font-size:13px;font-weight:700;margin:4px 0">Imóvel</div>
        <div style="font-size:12px;margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${mat ? copia('pa-em-mat', mat) : ''}${v.sql_contribuinte ? 'SQL ' + copia('pa-em-sql', v.sql_contribuinte) : '<span style="color:#b45309">Informe o SQL em Dados da proposta.</span>'}</div>
        ${tab(p.imovel)}
        ${p.porPessoa.map((x, i) => `<div style="font-size:13px;font-weight:700;margin:12px 0 4px">${esc(x.nome)}</div>
          ${p.generico ? '' : `<div style="font-size:12px;margin-bottom:6px">${copia('pa-em-p' + i, x.nome)} <small style="color:var(--muted)">CPF/CNPJ e nascimento: no documento da pessoa (o portal não guarda CPF).</small></div>`}
          ${tab(x.itens)}`).join('')}
      </div></details>`;
  }

  // ══════════════ PROTOCOLOS ══════════════
  let _ed = null;          // protocolo em edição (ou novo)
  function padrao(tipo) {
    const { v, docs, ult } = C, atual = juntar(titulares(v, ult)), novo = juntar(linhas(v.compradores));
    const fin = v.versao_contrato === '1' || v.versao_contrato === '3';
    const TIPOS_DOC = { matricula: 'Matrícula', certidao: 'Certidão', iptu: 'IPTU', outro: 'Documento' };
    return {
      chaves: { de: atual, para: novo, descricao: '___ jogo(s) de chaves do imóvel; controles: ___; itens que permanecem no imóvel: ___' },
      documentos: { de: atual, para: novo, descricao: docs.map(d => `${TIPOS_DOC[d.tipo] || 'Documento'} (${d.nome_arquivo.replace(/\.pdf$/i, '')})`).join('; ') },
      escritura: { de: atual, para: novo, descricao: fin ? 'contrato bancário de compra e venda com alienação fiduciária, registrado na matrícula' : 'escritura pública de venda e compra, registrada na matrícula' },
      autorizacao: { de: atual, para: 'Imobiliária Nova São Paulo', descricao: '' },
      notificacao: { de: '', para: '', descricao: '', prazo_dias: 15 },
      recibo: { de: novo, para: NSP, descricao: 'comissão pela assessoria e intermediação da venda' },
      procuracao: { de: atual, para: '', descricao: '' },
      atual_proprietario: { de: atual, para: novo, descricao: '' },
      chaves_proprietario: { de: atual, para: novo, descricao: '' },
      declaracao_uniao_estavel: { de: titulares(v, ult)[0] || '', para: '', descricao: '' },
      declaracao_patrimonio: { de: atual, para: novo, descricao: '' },
      proposta: { de: novo, para: NSP, descricao: '' },
      exclusividade: { de: atual, para: NSP, descricao: '' },
      corretagem: { de: atual, para: NSP, descricao: '' },
      direito_preferencia: { de: '', para: atual, descricao: '' },
      parceria_autonomo: { de: NSP, para: '', descricao: '' },
      parceria_pj: { de: NSP, para: '', descricao: '' }
    }[tipo] || {};
  }
  function vencNotif(p) {
    if (p.tipo !== 'notificacao' || !p.recebido_em || !p.prazo_dias || ['cumprido', 'descumprido', 'cancelado'].includes(p.status)) return null;
    const ate = U().somaDias(p.recebido_em, Number(p.prazo_dias)); return { ate, n: U().diasEntre(U().hojeIso(), ate) };
  }
  function protocolosHTML() {
    const { protos } = C, u = U();
    const lista = protos.length ? `<div class="tw"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px 6px">Nº</th><th style="padding:4px 6px">Documento</th><th style="padding:4px 6px">De → Para</th><th style="padding:4px 6px">Status</th><th style="padding:4px 6px">Anexos</th><th></th></tr></thead><tbody>
      ${protos.map(p => { const vn = vencNotif(p); return `<tr style="border-top:1px solid var(--borda,#e2e8f0);${p.status === 'cancelado' ? 'opacity:.55' : ''}">
        <td style="padding:5px 6px;white-space:nowrap;font-weight:600">${esc(p.numero || '')}<br><small style="color:var(--muted);font-weight:400">${u.dia(p.data_doc)}</small></td>
        <td style="padding:5px 6px">${esc(PTIPO[p.tipo])}${p.valor != null ? ` · ${moeda(p.valor)}` : ''}${p.descricao ? `<br><small style="color:var(--muted)">${esc(String(p.descricao).slice(0, 140))}</small>` : ''}</td>
        <td style="padding:5px 6px">${esc(p.de || '—')} → ${esc(p.para || '—')}</td>
        <td style="padding:5px 6px;white-space:nowrap"><select onchange="PAAcomp.statusProto('${p.id}',this.value)" style="${INP};padding:3px 6px;font-size:12px">${pstDo(p.tipo).map(k => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${PST[k]}</option>`).join('')}</select>
          ${p.tipo === 'notificacao' ? `<br><small style="color:${vn && vn.n < 0 ? '#b91c1c' : 'var(--muted)'}">${p.prazo_dias ? p.prazo_dias + ' dia(s)' : ''}${p.recebido_em ? ` · recebida ${u.dia(p.recebido_em)}` : ' · sem data de recebimento'}${vn ? ` · ${vn.n < 0 ? 'VENCEU' : 'vence'} ${u.dia(vn.ate)}` : ''}</small>` : ''}</td>
        <td style="padding:5px 6px">${(p.anexos || []).map((a, i) => `<a href="#" onclick="event.preventDefault();PAAcomp.verAnexo('p','${p.id}',${i})" style="color:var(--pri,#0088CC)">${esc(a.nome)}</a>`).join('<br>') || '<small style="color:var(--muted)">—</small>'}
          <br><label class="btn btn-o bsm" style="cursor:pointer;margin-top:3px">+ anexo<input type="file" accept="application/pdf,image/jpeg,image/png" style="display:none" onchange="PAAcomp.anexarProto('${p.id}',this)"></label></td>
        <td style="padding:5px 6px;white-space:nowrap;text-align:right">${EM_BRANCO.has(p.tipo) ? '' : `<button class="btn btn-o bsm" onclick="PAAcomp.docPdf('${p.id}')">PDF</button> `}<button class="btn btn-o bsm" onclick="PAAcomp.docWord('${p.id}')" title="${MODELO[p.tipo] ? (EM_BRANCO.has(p.tipo) ? 'Formulário da NSP em branco' : 'Modelo da NSP preenchido') : 'Modelo básico'}">Word</button> <button class="btn btn-o bsm" onclick="PAAcomp.editarProto('${p.id}')">Editar</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div style="font-size:13px;color:var(--muted)">Nenhum protocolo ainda.</div>';
    const abertos = protos.filter(p => p.status !== 'cancelado' && !['assinado', 'recebido', 'cumprido', 'descumprido'].includes(p.status)).length;
    return `<details class="card" style="margin-bottom:12px" id="pa-protocolos" ${abertos || _ed ? 'open' : ''}><summary class="cb" style="cursor:pointer;font-weight:700">📑 Protocolos, autorizações e notificações · ${protos.length}</summary>
      <div class="cb" style="padding-top:0">${lista}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="pa-pt-novo" style="${INP}">${PGRUPOS.map(([g, ks]) => `<optgroup label="${esc(g)}">${ks.map(k => `<option value="${k}">${esc(PTIPO[k])}</option>`).join('')}</optgroup>`).join('')}</select>
          <button class="btn btn-o bsm" onclick="PAAcomp.novoProto()">+ Novo</button>
          <small style="color:var(--muted)">Recibo de comissão: pelo Pós-venda. Chaves, documentos e declarações saem no modelo Word da NSP, já preenchido: confira antes de imprimir. Escritura, autorização, procuração e notificação ainda em modelo básico (texto jurídico com o jurídico).</small></div>
        <div id="pa-pt-form">${_ed ? formProtoHTML() : ''}</div>
      </div></details>`;
  }
  function formProtoHTML() {
    const p = _ed, r = ROT[p.tipo], lb = (t, h) => `<label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px">${t}${h}</label>`;
    return `<div style="margin-top:12px;padding:12px;border:1.5px solid var(--borda);border-radius:10px">
      <div style="font-weight:700;margin-bottom:8px">${p.id ? 'Editar ' + esc(p.numero || '') : 'Novo'}: ${esc(PTIPO[p.tipo])}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        ${lb('Data', `<input type="date" id="pa-pt-data" value="${esc(p.data_doc || U().hojeIso())}" style="${INP}">`)}
        ${lb(r[0], `<input id="pa-pt-de" value="${esc(p.de || '')}" style="${INP}">`)}
        ${lb(r[1], `<input id="pa-pt-para" value="${esc(p.para || '')}" style="${INP}">`)}
        ${p.tipo === 'notificacao' ? lb('Prazo para cumprir (dias)', `<input type="number" min="1" id="pa-pt-prazo" value="${esc(p.prazo_dias || '')}" style="${INP}">`) + lb('Recebida pelo notificado em', `<input type="date" id="pa-pt-receb" value="${esc(p.recebido_em || '')}" style="${INP}">`) : ''}
        ${p.tipo === 'recibo' ? lb('Valor (R$)', `<input id="pa-pt-valor" value="${esc(p.valor != null ? String(p.valor).replace('.', ',') : '')}" style="${INP}">`) : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px">
        ${lb(r[2], `<textarea id="pa-pt-desc" rows="3" style="${INP}">${esc(p.descricao || '')}</textarea>`)}
        ${lb('Observações', `<textarea id="pa-pt-obs" rows="3" style="${INP}">${esc(p.observacoes || '')}</textarea>`)}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-p bsm" onclick="PAAcomp.gravarProto()">${p.id ? 'Salvar' : 'Registrar'}</button>
        <button class="btn btn-o bsm" onclick="PAAcomp.fecharProto()">Cancelar</button>
        ${p.id && typeof CUR !== 'undefined' && CUR && CUR.admin ? `<span style="flex:1"></span><button class="btn btn-o bsm" style="color:#dc2626" onclick="PAAcomp.excluirProto()">Excluir (admin)</button>` : ''}</div>
      ${p.id ? '' : '<div style="font-size:12px;color:var(--muted);margin-top:6px">O número sai na hora de registrar (NSP-ano-sequência). Para anular depois, use o status "Cancelado".</div>'}
      ${EM_BRANCO.has(p.tipo) ? '<div style="font-size:12px;color:#b45309;margin-top:6px">Formulário da NSP ainda sem campos marcados: o Word sai em branco, para preencher. Registrar aqui serve para numerar e anexar o documento assinado.</div>'
        : MODELO[p.tipo] ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">Sai no modelo Word da NSP: "${esc(ROT[p.tipo][0])}" e "${esc(ROT[p.tipo][1])}" entram no texto como estão aqui; imóvel, SQL, cartório e data vêm da venda e da matrícula.</div>` : ''}</div>`;
  }
  function redesenharProtos() { const el = document.getElementById('pa-protocolos'); if (el) { el.outerHTML = protocolosHTML(); ir('pa-pt-form'); } }
  function novoProto() { const tipo = (document.getElementById('pa-pt-novo') || {}).value || 'chaves'; _ed = Object.assign({ tipo }, padrao(tipo)); redesenharProtos(); }
  function editarProto(id) { const p = C.protos.find(x => x.id === id); if (!p) return; _ed = Object.assign({}, p); redesenharProtos(); }
  function fecharProto() { _ed = null; redesenharProtos(); }
  async function gravarProto() {
    const g = id => ((document.getElementById(id) || {}).value || '').trim(), p = _ed;
    const d = { data_doc: g('pa-pt-data') || U().hojeIso(), de: g('pa-pt-de') || null, para: g('pa-pt-para') || null, descricao: g('pa-pt-desc') || null, observacoes: g('pa-pt-obs') || null };
    if (p.tipo === 'notificacao') { const n = Number(g('pa-pt-prazo')); d.prazo_dias = n > 0 ? Math.round(n) : null; d.recebido_em = g('pa-pt-receb') || null; }
    if (p.tipo === 'recibo') { d.valor = numero(g('pa-pt-valor')); if (d.valor == null) { U().aviso('Informe o valor do recibo.', 'err'); return; } }
    try {
      if (p.id) { await db.patch('preanalise_protocolo', p.id, d); await evento('Protocolo editado', `${p.numero} (${PTIPO[p.tipo]})`); }
      else { const [n] = await db.post('preanalise_protocolo', Object.assign(d, { venda_id: C.v.id, tipo: p.tipo, criado_por: U().quem() })); await evento('Protocolo registrado', `${n.numero} — ${PTIPO[p.tipo]}`); U().aviso(`${n.numero} registrado.`, 'ok'); }
      _ed = null; recarregar();
    } catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-06 já rodou?)', 'err'); }
  }
  async function excluirProto() {
    const p = _ed; if (!p || !p.id || !confirm(`Excluir ${p.numero}? Prefira o status "Cancelado" (o número fica registrado).`)) return;
    try { await U().apagarPdfs((p.anexos || []).map(a => a.caminho)); await db.del('preanalise_protocolo', p.id); await evento('Protocolo excluído', p.numero); _ed = null; recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }
  async function statusProto(id, st) {
    const p = C.protos.find(x => x.id === id); if (!p) return;
    const d = { status: st }; if (p.tipo === 'notificacao' && st === 'recebido' && !p.recebido_em) d.recebido_em = U().hojeIso();
    try { await db.patch('preanalise_protocolo', id, d); await evento('Status do protocolo', `${p.numero}: ${PST[st]}`); recarregar(); } catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }

  // anexos (protocolo ou pós-venda) no bucket privado
  async function enviarArquivo(f) {
    if (!/^(application\/pdf|image\/jpeg|image\/png)$/.test(f.type)) throw new Error(`${f.name}: só PDF, JPG ou PNG.`);
    if (f.size > MAX_ANEXO) throw new Error(`${f.name}: maior que 20 MB.`);
    const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg', caminho = `${C.v.id}/anexos/${U().uuid()}.${ext}`;
    const h = hdr({ 'Content-Type': f.type, 'x-upsert': 'false' }); delete h.Prefer;
    const r = await fetch(`${SBU}/storage/v1/object/${U().BUCKET}/${caminho}`, { method: 'POST', headers: h, body: f });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error((m || 'HTTP ' + r.status) + (/mime/i.test(m) ? ' (o SQL 2026-11-06 libera JPG e PNG)' : '')); }
    return { nome: f.name, caminho, em: new Date().toISOString(), por: U().quem() };
  }
  async function anexarProto(id, inp) {
    const p = C.protos.find(x => x.id === id), f = inp.files && inp.files[0]; if (!p || !f) return;
    try { U().aviso('Enviando…'); const a = await enviarArquivo(f); await db.patch('preanalise_protocolo', id, { anexos: (p.anexos || []).concat([a]) }); await evento('Anexo no protocolo', `${p.numero}: ${f.name}`); recarregar(); }
    catch (e) { U().aviso(e.message, 'err'); }
  }
  async function verAnexo(onde, id, i) {
    const a = onde === 'p' ? ((C.protos.find(x => x.id === id) || {}).anexos || [])[i] : ((_pv.anexos || [])[i]); if (!a) return;
    const w = window.open('', '_blank');
    try { const u = await U().linkPdf(a.caminho); if (w) w.location = u; else window.open(u, '_blank'); } catch (e) { if (w) w.close(); U().aviso(e.message, 'err'); }
  }

  // documento (modelo básico): HTML → PDF (html2pdf) ou Word (.doc)
  function docHTML(p) {
    const { v } = C, u = U(), atual = juntar(titulares(v, C.ult)), novo = juntar(linhas(v.compradores));
    const cart = cartorioTitulo(v.cartorio || matDa().cartorio);
    const imovel = `${esc(v.titulo)}${v.matricula ? ` (matrícula nº ${esc(v.matricula)}${cart ? ' do ' + esc(cart) : ''})` : ''}`;
    const cidadeData = `São Paulo, ${dataExtenso(p.data_doc)}.`, b = s => `<b>${esc(s || '____________________')}</b>`;
    const assin = nomes => `<table style="width:100%;margin-top:48px"><tr>${nomes.map(n => `<td style="text-align:center;padding:0 12px;vertical-align:top">______________________________<br>${esc(n || '')}</td>`).join('')}</tr></table>`;
    const partes = `<p>Imóvel: ${imovel}.</p>${atual ? `<p>Atual proprietário: ${esc(atual)}</p>` : ''}${novo ? `<p>Novo proprietário: ${esc(novo)}</p>` : ''}`;
    const obs = p.observacoes ? `<p>Observações: ${esc(p.observacoes)}</p>` : '';
    let titulo = '', corpo = '';
    if (p.tipo === 'chaves' || p.tipo === 'documentos' || p.tipo === 'escritura') {
      titulo = { chaves: 'PROTOCOLO DE ENTREGA DE CHAVES', documentos: 'PROTOCOLO DE ENTREGA DE DOCUMENTOS', escritura: 'PROTOCOLO DE ENTREGA DE ESCRITURA / CONTRATO BANCÁRIO' }[p.tipo];
      const oque = { chaves: 'as chaves do imóvel acima, conforme a seguinte descrição', documentos: 'os documentos relacionados a seguir, referentes à venda do imóvel acima', escritura: 'o seguinte instrumento' }[p.tipo];
      corpo = `${partes}<p>Em ${dataExtenso(p.data_doc)}, ${b(p.de)} entregou a ${b(p.para)} ${oque}: ${esc(p.descricao || '____________________')}.</p>${obs}<p>${cidadeData}</p>${assin([p.de, p.para])}`;
    } else if (p.tipo === 'autorizacao') {
      titulo = 'AUTORIZAÇÃO';
      corpo = `<p>Imóvel: ${imovel}.</p><p>${b(p.de)} autoriza ${b(p.para)} a ${esc(p.descricao || '____________________')}, referente à venda do imóvel acima.</p>${obs}<p>${cidadeData}</p>${assin([p.de])}`;
    } else if (p.tipo === 'notificacao') {
      titulo = 'NOTIFICAÇÃO EXTRAJUDICIAL';
      const n = Number(p.prazo_dias) || 0;
      corpo = `<p>Notificante: ${b(p.de)}</p><p>Notificado(a): ${b(p.para)}</p><p>Imóvel: ${imovel}.</p>
        <p>Fica o(a) notificado(a) comunicado(a) de que deve cumprir a seguinte obrigação no prazo de ${n ? `${n} (${extenso(n)})` : '___'} dias, contados do recebimento desta notificação: ${esc(p.descricao || '____________________')}.</p>${obs}<p>${cidadeData}</p>${assin([p.de])}`;
    } else if (p.tipo === 'procuracao') {
      titulo = 'PROCURAÇÃO';
      corpo = `<p>OUTORGANTE: ${b(p.de)}</p><p>OUTORGADO(A): ${b(p.para)}</p>
        <p>Pelo presente instrumento, o(a) outorgante nomeia e constitui o(a) outorgado(a) seu(sua) procurador(a), para o fim de: ${esc(p.descricao || '____________________')}, relativamente ao imóvel ${imovel}.</p>${obs}<p>${cidadeData}</p>${assin([p.de])}`;
    } else {
      titulo = 'RECIBO DE COMISSÃO';
      corpo = `<p>Recebi de ${b(p.de)} a quantia de <b>${moeda(p.valor)}</b> (${esc(reaisExtenso(p.valor || 0))}), referente à ${esc(p.descricao || 'comissão pela assessoria e intermediação da venda')} do imóvel ${imovel}.</p>${obs}<p>${cidadeData}</p>${assin([p.para])}`;
    }
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.5;color:#000;text-align:justify">
      <div style="text-align:center;font-weight:bold;font-size:14pt;letter-spacing:1px;margin-bottom:6px">NOVA SÃO PAULO</div>
      <div style="text-align:center;font-weight:bold;margin:12px 0 18px">${titulo} Nº ${esc(p.numero || '')}</div>${corpo.replace(/<p>/g, '<p style="margin:0 0 12px">')}</div>`;
  }
  const nomeArq = (p, ext) => `${(p.numero || 'documento')}-${p.tipo}.${ext}`;
  const baixar = (blob, nome) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  async function docPdf(id) {
    const p = C.protos.find(x => x.id === id); if (!p) return;
    U().aviso('Gerando o PDF…');
    if (MODELO[p.tipo] && !EM_BRANCO.has(p.tipo)) {
      try { await pdfDoModelo(await docxPreenchido(p), nomeArq(p, 'pdf')); return; }
      catch (e) { U().aviso('Não consegui montar o PDF pelo modelo da NSP (' + e.message + '). Use o botão Word.', 'err'); return; }
    }
    try { await U().carregarHtml2pdf(); const el = document.createElement('div'); el.style.cssText = 'width:690px;background:#fff;padding:10px'; el.innerHTML = docHTML(p);
      await window.html2pdf().set({ margin: [18, 18, 18, 18], filename: nomeArq(p, 'pdf'), image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(el).save(); }
    catch (e) { U().aviso('Erro no PDF: ' + e.message, 'err'); }
  }
  async function docWord(id) {
    const p = C.protos.find(x => x.id === id); if (!p) return;
    if (MODELO[p.tipo]) {
      try { U().aviso('Preparando o Word…'); baixar(await docxPreenchido(p), nomeArq(p, 'docx')); }
      catch (e) { U().aviso('Erro no Word: ' + e.message, 'err'); }
      return;
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(PTIPO[p.tipo])}</title>
      <style>@page{size:21cm 29.7cm;margin:2.5cm}body{font-family:Arial}</style></head><body>${docHTML(p)}</body></html>`;
    baixar(new Blob(['﻿' + html], { type: 'application/msword' }), nomeArq(p, 'doc'));
  }

  // ── modelos Word da NSP: preenche os campos {{...}} (document, cabeçalhos e rodapés) com JSZip ──
  const matDa = () => ((((C || {}).ult || {}).resultado) || {}).matricula || {};
  // "14º RI" → "14º Oficial de Registro de Imóveis da Comarca de São Paulo"; "de/da/do" em minúsculas (pacote de 07/11, item 8)
  function cartorioTitulo(s) {
    s = String(s || '').trim(); if (!s) return '';
    const n = s.match(/^(\d{1,2})\s*[º°ªo]?\.?\s*(?:RI|CRI|R\.I\.|cart[óo]rio|oficial|registro)\b/i);
    if (n && !/oficial de registro de im[óo]veis/i.test(s)) s = `${n[1]}º Oficial de Registro de Imóveis da Comarca de São Paulo`;
    s = s.replace(/\s*[-–]\s*SP\s*$/i, '').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
    return s.replace(/ (De|Da|Do|Das|Dos|E) /g, x => x.toLowerCase());
  }
  const VAZIO = '________________';
  function valoresDoc(p) {
    const { v, ult } = C, m = matDa(), r = (ult || {}).resultado || {};
    const nomeFonte = id => (FONTES.find(f => f.id === id) || {}).nome || id;
    const positivas = (r.certidoes || []).filter(c => !c.substituida && c.resultado === 'positiva');
    const dec = String(p.de || '').trim(), cpf = (dec.match(/CPF(?:\/MF)?\s*(?:n[º°o.]*\s*|sob\s*(?:o\s*)?n[º°o.]*\s*)?([\d.\-/]{11,18})/i) || [])[1] || '';
    return {
      cidade_data: `São Paulo, ${dataExtenso(p.data_doc)}`, data_protocolo: U().dia(p.data_doc), numero_protocolo: p.numero || '',
      endereco_imovel: v.titulo || '', matricula_numero: v.matricula || m.numero || '', contribuinte: v.sql_contribuinte || m.sql_contribuinte || '',
      cartorio_titulo: cartorioTitulo(v.cartorio || m.cartorio), descricao_imovel: String(m.descricao_imovel || v.area_proposta || '').trim().replace(/[.;,\s]+$/, ''),
      partes_vendedoras: p.de || '', parte_compradora: p.para || '', nomes_vendedores: p.de || '', nomes_compradores: p.para || '',
      atual_proprietario: p.de || '', novo_proprietario: p.para || '', entregue_por: p.de || '', recebido_por: p.para || '',
      descricao_itens: p.descricao || '', patrimonio_descricao: p.descricao || '', observacoes: p.observacoes || '',
      declarante_qualificacao: dec, declarante_nome: dec.split(',')[0].trim(), declarante_cpf: cpf, declarante_estado_civil: p.para || '',
      apontamentos_certidoes: positivas.length ? positivas.map(c => `- ${nomeFonte(c.orgao)}, em nome de ${c.refere_a || '—'}: ${c.resumo || 'ver a certidão'}`).join('\n') : '(nenhum apontamento registrado)',
      gerente_responsavel: (v.responsaveis || {}).gerente || '', assistente_responsavel: (v.responsaveis || {}).assistente || '', corretor: (v.responsaveis || {}).corretor || '',
      data_proposta: (v.marcos || {}).proposta_enviada ? U().dia(v.marcos.proposta_enviada) : '', data_envio_banco: (v.marcos || {}).docs_banco ? U().dia(v.marcos.docs_banco) : ''
    };
  }
  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xmlVal = s => xmlEsc(String(s == null ? '' : s).trim() || VAZIO).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">');
  function preencherXml(xml, val) {
    return xml.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (t, k) => Object.prototype.hasOwnProperty.call(val, k) ? xmlVal(val[k]) : t)
              .replace(/<w:t>([^<]*<\/w:t><w:br\/>)/g, '<w:t xml:space="preserve">$1');
  }
  const _libs = {};
  function carregarLib(url, global) {
    if (window[global]) return Promise.resolve();
    return _libs[url] || (_libs[url] = new Promise((ok, err) => { const sc = document.createElement('script'); sc.src = url; sc.onload = ok;
      sc.onerror = () => { delete _libs[url]; err(new Error('não consegui carregar ' + global)); }; document.head.appendChild(sc); }));
  }
  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', DOCXPREV_URL = 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js';
  async function docxPreenchido(p) {
    await carregarLib(JSZIP_URL, 'JSZip');
    const r = await fetch(`modelos-nsp/${MODELO[p.tipo]}?v=${MODELOS_V}`); if (!r.ok) throw new Error('modelo não encontrado (' + r.status + ')');
    const zip = await window.JSZip.loadAsync(await r.arrayBuffer());
    if (!EM_BRANCO.has(p.tipo)) {
      const val = valoresDoc(p);
      for (const nome of Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) zip.file(nome, preencherXml(await zip.file(nome).async('string'), val));
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  // PDF a partir do Word preenchido: desenha o .docx na página (docx-preview) e fotografa (html2pdf), uma folha por seção
  async function pdfDoModelo(blob, nome, soPdf) {
    await carregarLib(JSZIP_URL, 'JSZip'); await carregarLib(DOCXPREV_URL, 'docx'); await U().carregarHtml2pdf();
    const fora = document.createElement('div'); fora.style.cssText = 'position:fixed;left:-20000px;top:0;width:820px;background:#fff';
    const el = document.createElement('div'); el.style.background = '#fff'; fora.appendChild(el); document.body.appendChild(fora);
    try {
      await window.docx.renderAsync(blob, el, null, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, renderHeaders: true, renderFooters: true });
      const st = document.createElement('style'); st.textContent = 'section.docx{min-height:0!important;box-shadow:none!important;margin:0!important}'; el.appendChild(st);
      // cada seção do Word = uma folha A4; o desenho do navegador sai um pouco maior que o do Word, então a seção que passa
      // da folha em até 30% é reduzida para caber (assinatura e rodapé não pulam para uma folha a mais)
      el.querySelectorAll('section.docx').forEach(sec => {
        const folha = document.createElement('div'); folha.className = 'pa-folha'; sec.parentNode.insertBefore(folha, sec); folha.appendChild(sec);
        const alt = sec.offsetWidth * 297 / 210 - 4, h = sec.offsetHeight;
        if (h > alt && h < alt * 1.3) { sec.style.transform = `scale(${alt / h})`; sec.style.transformOrigin = 'top center'; folha.style.cssText = `height:${Math.floor(alt)}px;overflow:hidden`; }
      });
      return await window.html2pdf().set({ margin: 0, filename: nome, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css'], before: '.pa-folha ~ .pa-folha' } }).from(el)[soPdf ? 'outputPdf' : 'save'](soPdf ? 'blob' : undefined);
    } finally { fora.remove(); }
  }

  // ══════════════ PÓS-VENDA ══════════════
  const COLS = {
    contas: [['tipo', 'Conta', 70], ['empresa', 'Concessionária', 110], ['instalacao', 'Nº instalação', 100], ['titular', 'Titular atual', 130],
             ['situacao', 'Situação', 0, ['pendente', 'quitada', 'transferida']], ['valor', 'Valor', 80], ['data', 'Data', 0, 'date'], ['obs', 'Observação', 140]],
    recibos: [['beneficiario', 'Beneficiário', 170], ['valor', 'Valor (R$)', 90], ['recibo_status', 'Recibo', 0, ['pendente', 'emitido', 'recebido']], ['recibo_num', 'Nº recibo', 110],
              ['nf_status', 'Nota fiscal', 0, ['pendente', 'emitida', 'recebida', 'dispensada']], ['nf_num', 'Nº NF', 80], ['nf_data', 'Data NF', 0, 'date'], ['obs', 'Observação', 130]]
  };
  function celula(key, i, c, val) {
    const id = `pa-pv-${key}-${i}-${c[0]}`;
    if (Array.isArray(c[3])) return `<select id="${id}" style="${INP};padding:4px 6px;font-size:12px">${c[3].map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    if (c[3] === 'date') return `<input type="date" id="${id}" value="${esc(val || '')}" style="${INP};padding:4px 6px;font-size:12px">`;
    return `<input id="${id}" value="${esc(val || '')}" style="${INP};padding:4px 6px;font-size:12px;width:${c[2]}px">`;
  }
  function tabelaLinhas(key, extra) {
    const rows = _pv[key] || [];
    return `<div class="tw"><table style="border-collapse:collapse;font-size:12px"><thead><tr style="color:var(--muted);text-align:left">${COLS[key].map(c => `<th style="padding:3px 4px;font-weight:600">${c[1]}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>${COLS[key].map(c => `<td style="padding:3px 4px">${celula(key, i, c, r[c[0]])}</td>`).join('')}<td style="padding:3px 4px;white-space:nowrap">${extra ? extra(r, i) : ''} <button class="btn btn-o bsm" onclick="PAAcomp.tirarLinha('${key}',${i})">✕</button></td></tr>`).join('')}</tbody></table></div>
      <button class="btn btn-o bsm" style="margin-top:4px" onclick="PAAcomp.addLinha('${key}')">+ linha</button>`;
  }
  function lerPv() {
    ['contas', 'recibos'].forEach(key => { _pv[key] = (_pv[key] || []).map((r, i) => { const o = Object.assign({}, r); COLS[key].forEach(c => { const el = document.getElementById(`pa-pv-${key}-${i}-${c[0]}`); if (el) o[c[0]] = el.value.trim(); }); return o; }); });
    const g = id => ((document.getElementById(id) || {}).value || '').trim();
    if (document.getElementById('pa-pv-cd-adm')) _pv.condominio = { administradora: g('pa-pv-cd-adm'), valor: g('pa-pv-cd-valor'), situacao: g('pa-pv-cd-sit'), data: g('pa-pv-cd-data'), obs: g('pa-pv-cd-obs') };
  }
  function posVendaHTML() {
    const { v } = C, u = U();
    if (!_pv.contas || !_pv.contas.length) _pv.contas = ['Água', 'Luz', 'Gás'].map(t => ({ tipo: t, situacao: 'pendente' }));
    if (!_pv.recibos || !_pv.recibos.length) _pv.recibos = [{ beneficiario: NSP, recibo_status: 'pendente', nf_status: 'pendente' }];
    const cd = _pv.condominio || {}, et = etapas(v, eDe(C.ult), C.docs.length, C.protos);
    const arq = v.arquivada_em
      ? `<div style="font-size:13px">Arquivada em ${u.dt(v.arquivada_em)} por ${esc(v.arquivada_por || '')}${v.arquivada_com_pendencias ? ' <b style="color:#b45309">com tarefas em aberto</b>' : ''}${v.arquivada_nota ? ` — ${esc(v.arquivada_nota)}` : ''}.
         ${typeof CUR !== 'undefined' && CUR && CUR.admin ? ' <button class="btn btn-o bsm" onclick="PAAcomp.reabrir()">Reabrir (admin)</button>' : ''}</div>`
      : `${et.abertas.length ? `<div style="font-size:12px;color:#b45309;margin-bottom:6px">Ainda em aberto: ${esc(et.abertas.join('; '))}.</div>` : '<div style="font-size:12px;color:#047857;margin-bottom:6px">Todas as tarefas concluídas: a venda pode ser arquivada.</div>'}
         <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="pa-arq-nota" placeholder="observação do arquivamento (opcional)" style="${INP};flex:1;min-width:220px">
         ${et.abertas.length ? '<label style="font-size:12px"><input type="checkbox" id="pa-arq-forcar"> arquivar mesmo assim</label>' : ''}<button class="btn btn-o bsm" onclick="PAAcomp.arquivar()">Arquivar venda finalizada</button></div>`;
    return `<details class="card" style="margin-bottom:12px" id="pa-posvenda" ${v.marcos && (v.marcos.registro || v.marcos.entrega_chaves) && !v.arquivada_em ? 'open' : ''}><summary class="cb" style="cursor:pointer;font-weight:700">🏁 Pós-venda e arquivamento${v.arquivada_em ? ' · arquivada' : ''}</summary>
      <div class="cb" style="padding-top:0">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">Contas de consumo</div>${tabelaLinhas('contas')}
        <div style="font-size:13px;font-weight:700;margin:12px 0 4px">Condomínio</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;font-size:12px;color:var(--muted)">
          <label>Administradora<br><input id="pa-pv-cd-adm" value="${esc(cd.administradora || '')}" style="${INP};padding:4px 6px;font-size:12px"></label>
          <label>Taxa (R$)<br><input id="pa-pv-cd-valor" value="${esc(cd.valor || '')}" style="${INP};padding:4px 6px;font-size:12px;width:90px"></label>
          <label>Situação<br><select id="pa-pv-cd-sit" style="${INP};padding:4px 6px;font-size:12px">${['', 'pendente', 'quitado', 'transferido'].map(s => `<option value="${s}" ${cd.situacao === s ? 'selected' : ''}>${s || '(não levantado)'}</option>`).join('')}</select></label>
          <label>Data<br><input type="date" id="pa-pv-cd-data" value="${esc(cd.data || '')}" style="${INP};padding:4px 6px;font-size:12px"></label>
          <label style="flex:1;min-width:200px">Observação<br><input id="pa-pv-cd-obs" value="${esc(cd.obs || '')}" placeholder="declaração de quitação, taxa extra…" style="${INP};padding:4px 6px;font-size:12px;width:100%"></label></div>
        <div style="font-size:13px;font-weight:700;margin:12px 0 4px">Recibos de comissão e notas fiscais</div>
        ${tabelaLinhas('recibos', (r, i) => `<button class="btn btn-o bsm" onclick="PAAcomp.gerarRecibo(${i})" title="Registra um Recibo de comissão numerado (PDF/Word em Protocolos)">Gerar recibo</button>`)}
        <div style="margin-top:10px"><button class="btn btn-p bsm" onclick="PAAcomp.salvarPv()">Salvar pós-venda</button></div>
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">Arquivos do pós-venda</div>
        ${(_pv.anexos || []).length ? `<div style="font-size:12px;line-height:1.7">${_pv.anexos.map((a, i) => `<div><a href="#" onclick="event.preventDefault();PAAcomp.verAnexo('pv',null,${i})" style="color:var(--pri,#0088CC)">${esc(a.rotulo || a.nome)}</a> <small style="color:var(--muted)">${esc(a.categoria || '')} · ${esc(a.por || '')} · ${u.dt(a.em)}</small></div>`).join('')}</div>` : '<div style="font-size:12px;color:var(--muted)">Nenhum arquivo.</div>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
          <select id="pa-pv-an-cat" style="${INP};padding:4px 6px;font-size:12px">${['conta de consumo', 'condomínio', 'recibo', 'nota fiscal', 'outro'].map(c => `<option>${c}</option>`).join('')}</select>
          <input id="pa-pv-an-rot" placeholder="descrição (ex.: conta de luz de out/2026)" style="${INP};padding:4px 6px;font-size:12px;min-width:220px">
          <input type="file" id="pa-pv-an-arq" accept="application/pdf,image/jpeg,image/png" style="font-size:12px"><button class="btn btn-o bsm" onclick="PAAcomp.anexarPv()">Anexar</button></div>
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">Arquivamento da venda</div>${arq}
      </div></details>`;
  }
  function redesenharPv() { const el = document.getElementById('pa-posvenda'); if (el) { el.outerHTML = posVendaHTML(); const n = document.getElementById('pa-posvenda'); if (n) n.open = true; } }
  function addLinha(key) { lerPv(); (_pv[key] = _pv[key] || []).push(key === 'contas' ? { situacao: 'pendente' } : { recibo_status: 'pendente', nf_status: 'pendente' }); redesenharPv(); }
  function tirarLinha(key, i) { lerPv(); (_pv[key] || []).splice(i, 1); redesenharPv(); }
  async function gravarPv(msg) {
    await db.patch('preanalise_venda', C.v.id, { pos_venda: _pv });
    if (msg) await evento('Pós-venda', msg);
  }
  async function salvarPv() {
    lerPv();
    _pv.contas = (_pv.contas || []).filter(c => c.tipo); _pv.recibos = (_pv.recibos || []).filter(r => r.beneficiario);
    try { await gravarPv(`${_pv.contas.length} conta(s), condomínio ${(_pv.condominio || {}).situacao || 'não levantado'}, ${_pv.recibos.length} recibo(s)`); U().aviso('Pós-venda salvo.', 'ok'); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-06 já rodou?)', 'err'); }
  }
  async function gerarRecibo(i) {
    lerPv(); const r = (_pv.recibos || [])[i]; if (!r || !r.beneficiario) { U().aviso('Preencha o beneficiário.', 'err'); return; }
    const valor = numero(r.valor); if (valor == null) { U().aviso('Preencha o valor do recibo.', 'err'); return; }
    const pagador = prompt('Quem paga a comissão? (nome como vai no recibo)', juntar(linhas(C.v.compradores)) || ''); if (pagador == null) return;
    try {
      const [n] = await db.post('preanalise_protocolo', { venda_id: C.v.id, tipo: 'recibo', de: pagador.trim() || null, para: r.beneficiario, valor, descricao: 'comissão pela assessoria e intermediação da venda', criado_por: U().quem() });
      r.recibo_num = n.numero; if (r.recibo_status === 'pendente') r.recibo_status = 'emitido';
      await gravarPv(null); await evento('Recibo de comissão', `${n.numero} — ${r.beneficiario} ${moeda(valor)}`);
      U().aviso(`${n.numero} registrado: baixe o PDF ou o Word em Protocolos.`, 'ok'); _ed = null; recarregar();
    } catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-06 já rodou?)', 'err'); }
  }
  async function anexarPv() {
    const f = ((document.getElementById('pa-pv-an-arq') || {}).files || [])[0]; if (!f) { U().aviso('Escolha o arquivo.', 'err'); return; }
    lerPv();
    try { U().aviso('Enviando…'); const a = await enviarArquivo(f); a.categoria = (document.getElementById('pa-pv-an-cat') || {}).value || 'outro'; a.rotulo = ((document.getElementById('pa-pv-an-rot') || {}).value || '').trim() || null;
      (_pv.anexos = _pv.anexos || []).push(a); await gravarPv(`arquivo anexado: ${a.rotulo || f.name}`); recarregar(); }
    catch (e) { U().aviso(e.message, 'err'); }
  }
  async function arquivar() {
    const et = etapas(C.v, eDe(C.ult), C.docs.length, C.protos), forcar = !!(document.getElementById('pa-arq-forcar') || {}).checked;
    if (et.abertas.length && !forcar) { U().aviso('Há tarefas em aberto. Marque "arquivar mesmo assim" para confirmar.', 'err'); return; }
    const nota = ((document.getElementById('pa-arq-nota') || {}).value || '').trim() || null;
    try { await db.patch('preanalise_venda', C.v.id, { arquivada_em: new Date().toISOString(), arquivada_por: U().quem(), arquivada_nota: nota, arquivada_com_pendencias: !!et.abertas.length });
          await evento('Venda arquivada', (et.abertas.length ? 'com tarefas em aberto: ' + et.abertas.join('; ') : 'tudo concluído') + (nota ? ' — ' + nota : '')); U().aviso('Venda arquivada.', 'ok'); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message + ' (o SQL 2026-11-06 já rodou?)', 'err'); }
  }
  async function reabrir() {
    if (!confirm('Reabrir esta venda?')) return;
    try { await db.patch('preanalise_venda', C.v.id, { arquivada_em: null, arquivada_por: null, arquivada_nota: null, arquivada_com_pendencias: null }); await evento('Venda reaberta', ''); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }

  // ══════════════ LINHA DO TEMPO ══════════════
  function timelineHTML() {
    const { v, docs, execs, eventos } = C, u = U(), it = [];
    it.push([v.criado_em, v.criado_por, 'Venda aberta', v.titulo]);
    docs.forEach(d => it.push([d.enviado_em, d.enviado_por, 'PDF enviado', d.nome_arquivo]));
    execs.forEach(x => it.push([x.iniciado_em, x.pedido_por, 'Análise', x.situacao === 'ok' ? 'resultado: ' + ((window.PreAnalise._u.STATUS[x.status] || {}).lb || x.status) : x.situacao === 'erro' ? 'falhou: ' + String(x.erro || '').slice(0, 120) : 'rodando']));
    if (v.leitura_conferida_em) it.push([v.leitura_conferida_em, v.leitura_conferida_por, 'Leitura conferida', v.leitura_nota || '']);
    if (v.encaminhado_em) it.push([v.encaminhado_em, v.encaminhado_por, 'Encaminhada ao jurídico', '']);
    if (v.revisado_em) it.push([v.revisado_em, v.revisado_por, 'Revisão jurídica', REV[v.revisao_status] || '']);
    eventos.forEach(e => it.push([e.quando, e.por, e.acao, e.detalhe || '']));
    it.sort((a, b) => String(b[0] || '').localeCompare(String(a[0] || '')));
    return `<details class="card" style="margin-bottom:12px" id="pa-timeline"><summary class="cb" style="cursor:pointer;font-weight:700">🕒 Linha do tempo · ${it.length}</summary><div class="cb" style="padding-top:0">
      <div class="tw"><table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>${it.map(x => `<tr style="border-top:1px solid var(--borda,#e2e8f0)"><td style="padding:4px 6px;white-space:nowrap;color:var(--muted)">${u.dt(x[0])}</td>
        <td style="padding:4px 6px;font-weight:600;white-space:nowrap">${esc(x[2])}</td><td style="padding:4px 6px">${esc(x[3])}</td><td style="padding:4px 6px;color:var(--muted);white-space:nowrap">${esc(x[1] || '')}</td></tr>`).join('')}</tbody></table></div></div></details>`;
  }

  // ══════════════ PAINEL ══════════════
  async function carregarPainel() {
    try { return await db.get('preanalise_protocolo', '?select=venda_id,numero,tipo,status,recebido_em,prazo_dias&limit=5000'); } catch (_) { return null; }
  }
  function alertasPainel(vendas, protos) {
    const al = [], ativas = new Set(vendas.filter(v => !v.arquivada_em).map(v => v.id)), tit = new Map(vendas.map(v => [v.id, v.titulo]));
    (protos || []).filter(p => ativas.has(p.venda_id)).forEach(p => { const vn = vencNotif(p); if (vn && vn.n < 0) al.push([0, `<b>${esc(tit.get(p.venda_id))}</b>: notificação ${esc(p.numero)} venceu em ${U().dia(vn.ate)} — registrar se foi cumprida`]); });
    return al;
  }
  function quadroHTML(lista, ult, ndocs, protosPor, proximaAcao) {
    const u = U(), col = new Map(ETAPAS.map(e => [e.id, []]));
    lista.forEach(v => { const e = ult.get(v.id), et = etapas(v, e, ndocs.get(v.id) || 0, protosPor.get(v.id) || []); col.get(et.atual.id).push({ v, et, e }); });
    return `<div style="display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px">${ETAPAS.map(e => `<div style="background:#f8fafc;border:1px solid var(--borda,#e2e8f0);border-radius:10px;padding:8px;min-width:180px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">${esc(e.nome)} <small style="color:var(--muted)">${col.get(e.id).length}</small></div>
      ${col.get(e.id).map(({ v, et, e: ex }) => { const pp = u.proximoPrazo(v), n = pp ? u.diasEntre(u.hojeIso(), pp.data) : null;
        return `<div onclick="PreAnalise.venda('${v.id}')" style="cursor:pointer;background:#fff;border:1px solid var(--borda,#e2e8f0);border-radius:8px;padding:7px;margin-bottom:6px;font-size:12px">
          <div style="font-weight:600">${esc(v.titulo)}</div><div style="margin:3px 0">${window.PreAnalise._u.badge(v.status)}</div>
          <div style="color:var(--muted)">${et.atual.feitas}/${et.atual.total} tarefas</div>
          ${pp ? `<div style="color:${n != null && n <= 7 ? '#b45309' : 'inherit'}">${esc(pp.titulo)}: ${u.dia(pp.data)}</div>` : ''}
          <div style="color:#334155;margin-top:2px">${esc(proximaAcao(v, ex, ndocs.get(v.id) || 0))}</div></div>`; }).join('') || '<div style="font-size:12px;color:var(--muted)">—</div>'}</div>`).join('')}</div>`;
  }
  function caminhosAnexos() { if (!C) return []; return C.protos.flatMap(p => (p.anexos || []).map(a => a.caminho)).concat(((C.v.pos_venda || {}).anexos || []).map(a => a.caminho)); }

  window.PAAcomp = { VERSOES, PTIPO, PGRUPOS, MODELO, usaBanco, prazosBancoDe, cartorioTitulo, carregar, etapas, etapasHTML, emissaoHTML, protocolosHTML, posVendaHTML, timelineHTML, carregarPainel, alertasPainel, quadroHTML, caminhosAnexos,
    ir, salvarEtapas, salvarMarcos, novoProto, editarProto, fecharProto, gravarProto, excluirProto, statusProto, anexarProto, verAnexo, docPdf, docWord,
    addLinha, tirarLinha, salvarPv, gerarRecibo, anexarPv, arquivar, reabrir,
    _t: { extenso, reaisExtenso, mesmaPessoa, dataExtenso, numero, cartorioTitulo, preencherXml, prazosBanco, valoresDoc, docxPreenchido, pdfDoModelo, _ctx: c => { C = c; } } };
})();

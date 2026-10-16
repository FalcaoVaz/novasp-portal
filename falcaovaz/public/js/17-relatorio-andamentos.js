// ═══════════════════════════════════════════════════════════════
// RELATÓRIO DE ANDAMENTOS (Fernanda, 30/09/2026 — modelo "Andamentos Setembro/2026 unificado e-SAJ + eproc").
// Adaptado ao jurídico sem servidor próprio (16/10/2026):
//   · DJEN ........ consultado daqui do navegador, por OAB das advogadas (o CNJ só atende IP do Brasil)
//   · e-SAJ ....... pela função tjsp-esaj (1 processo por vez, com intervalo), cache em andamentos_tjsp
//   · DataJud ..... já entra todo dia em andamentos_processos (Apps Script sync-tjsp-datajud)
//   · eproc ....... planilhas que as advogadas exportam e enviam aqui (a consulta pública tem bloqueio anti-robô)
// Classifica cada processo em urgente / parado / regular / arquivado / pendente, gera o PDF (histórico no bucket
// relatorios-andamentos) e lança as providências urgentes na aba Prazos como "A conferir", sem duplicar.
// A data é sempre sugestão: a advogada confere nos autos e confirma.
// ═══════════════════════════════════════════════════════════════
const RA = {
  OAB: { 'Fernanda Araujo': '498574', 'Edna Rebesco': '30248' },   // carteiras com DJEN por OAB
  DJEN_URL: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
  JANELA_DIAS: 180,          // DJEN: publicações dos últimos 6 meses
  LIMITE_PARADO: 30,         // dias sem movimentação para "parado"
  CACHE_ESAJ_H: 12,          // reaproveita a consulta ao e-SAJ feita há menos de 12 h
  INTERVALO_TJSP_MS: 1500,   // entre consultas ao e-SAJ
  extras: new Set(),         // dias_sem_expediente
  ultimo: null               // último relatório montado (para PDF e lançamentos)
};

// ── utilidades ──────────────────────────────────────────────────
const raNum = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 20 ? d : ''; };
const raMask = n => n && n.length === 20 ? `${n.slice(0,7)}-${n.slice(7,9)}.${n.slice(9,13)}.${n.slice(13,14)}.${n.slice(14,16)}.${n.slice(16)}` : (n || '');
const raBr = iso => iso ? iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4) : '—';
const raIsoDe = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const raData = iso => new Date(iso + 'T12:00:00');
const raSoma = (iso, n) => { const d = raData(iso); d.setDate(d.getDate() + n); return raIsoDe(d); };
const raDias = (de, ate) => Math.round((raData(ate) - raData(de)) / 86400000);
const raEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const raSemAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const raEspera = ms => new Promise(ok => setTimeout(ok, ms));
const raIsoBr = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null; };
function raCorta(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
function raTextoHtml(html) {
  if (!html) return '';
  try { return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
  catch (_) { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
}

// ── calendário forense (CPC 219 e 220; feriados nacionais, SP e Capital; recesso 20/12 a 20/01) ──
function raPascoa(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
  return `${a}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
const _raFer = {};
function raFeriados(ano) {
  if (_raFer[ano]) return _raFer[ano];
  const p = raPascoa(ano);
  const s = new Set(['01-01','01-25','04-21','05-01','07-09','09-07','10-12','11-02','11-15','11-20','12-08','12-25'].map(x => `${ano}-${x}`));
  [-48, -47, -2, 60].forEach(n => s.add(raSoma(p, n)));          // carnaval (seg e ter), sexta-feira santa, Corpus Christi
  return (_raFer[ano] = s);
}
function raUtil(iso) {
  const d = raData(iso), dow = d.getDay(), md = iso.slice(5);
  if (dow === 0 || dow === 6) return false;
  if (md >= '12-20' || md <= '01-20') return false;               // recesso forense: prazos suspensos
  return !raFeriados(d.getFullYear()).has(iso) && !RA.extras.has(iso);
}
function raProxUtil(iso) { let d = raSoma(iso, 1); while (!raUtil(d)) d = raSoma(d, 1); return d; }
function raSomaUteis(iso, n) { let d = iso; for (let i = 0; i < n; i++) d = raProxUtil(d); return d; }

// ── leitura dos eventos ──────────────────────────────────────────
const RX = {
  arqProv:   /arquivad[oa]s? provisoriamente|arquivamento provis|aguardando provoca[cç][aã]o no arquivo/i,
  arqDef:    /arquivad[oa]s? definitivamente|arquivamento definitivo|baixa definitiva|\bbaixad[oa]\b|processo (findo|encerrado)|arquivado administrativamente/i,
  susp:      /suspens[aã]o|processo suspenso|\bsuspenso\b|sobrestad/i,
  extinto:   /extin[cç][aã]o|\bextint[oa]\b|julgad[oa] extint/i,
  acordo:    /homologa[cç][aã]o de (acordo|transa)|acordo homologado|homologo o acordo|homologo, por senten[cç]a, o acordo|homologo a transa[cç]/i,
  transito:  /tr[aâ]nsito em julgado|transitad[oa] em julgado/i,
  concluso:  /\bconclus[aã]o\b|\bconclusos?\b/i,
  peticao:   /peti[cç][aã]o|juntada de (peti|manifesta)|contrarraz|recurso (interposto|inominado|de apela)|apela[cç][aã]o interposta|embargos de declara|\batendid[oa]\b|protocol/i,
  mandExp:   /expedi[cç][aã]o de (documento.*mandado|mandado)|mandado expedido|aguardando cumprimento|recebido o mandado/i,
  mandNeg:   /mandado (de \w+ )?(n[aã]o cumprido|negativ|devolvido sem)|n[aã]o cumprid[oa]|\bar negativo|aviso de recebimento.*negativ|carta.*devolvid|devolvid[oa] sem cumprimento|cita[cç][aã]o negativa/i,
  pauta:     /inclu[ií]d[oa] em pauta|inclus[aã]o em pauta|pauta (eletr[oô]nica|virtual)|sess[aã]o de julgamento/i,
  sentenca:  /senten[cç]a|julgo (parcialmente )?(im)?procedente|julgad[oa] (parcialmente )?(im)?procedente/i,
  ac2grau:   /ac[oó]rd[aã]o/i,
  despacho:  /despacho|decis[aã]o|ato ordinat|interlocut/i,
  segGrau:   /c[aâ]mara|turma recursal|[oó]rg[aã]o especial|grupo de c[aâ]maras|relator/i,
  // determinação dirigida à parte (o ato pede que alguém aja)
  det:       /manifest(e|em)-se|manifestar-se|suprir|supra\b|requeira|requerer o que de direito|em termos de prosseguimento|providenci|comprove|junt(e|ar|ando)|recolh|emend|indique|apresente|esclare[cç]a|\bdiga\b|digam|cumpra|regularize|deposite|traga|informe|sob pena|no prazo (comum )?de|aguarde-se provoca|arquivem-se|art\.? ?485|d[eê]-se andamento|dar andamento|in[eé]rcia/i,
  prazo:     /(?:prazo (?:comum |improrrog[aá]vel |sucessivo )?de|\bem|dentro de)\s+(\d{1,3}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta e cinco|sessenta)\s*(?:\([^)]*\)\s*)?dias?(\s+[uú]teis|\s+corridos)?/i,
  poloA:     /(?:(?:^|[^a-zà-ü])(?:o|a|os|as|ao|à|aos|às|do|da|dos|das|pelo|pela|pelos|pelas)(?:\([as]+\))?\s+|parte\s+)(autor(?:a|es|as)?|requerentes?|exequentes?|credor(?:a|es|as)?|locador(?:a|es|as)?|embargad[oa]s?)(?:\([a-z]+\))?(?![a-zà-ü])|inventariante/i,
  poloP:     /(?:(?:^|[^a-zà-ü])(?:o|a|os|as|ao|à|aos|às|do|da|dos|das|pelo|pela|pelos|pelas)(?:\([as]+\))?\s+|parte\s+)(r[eé]us?|r[eé]|requerid[oa]s?|executad[oa]s?|devedor(?:a|es|as)?|locat[aá]ri[oa]s?|embargantes?)(?:\([a-z]+\))?(?![a-zà-ü])/i,
  terceiro:  /\b(ao perito|o perito|ao oficial|o oficial de justi[cç]a|à serventia|ao cart[oó]rio|a serventia|o cart[oó]rio|a contadoria|ao contador|ao minist[eé]rio p[uú]blico|o minist[eé]rio p[uú]blico)\b/i,
  resposta:  /pagamento|recolhiment|custas (recolhid|pagas)|guia (juntada|recolhida)|dilig[eê]ncia (recolhid|paga)|expedi[cç][aã]o de (documento.*(mandado|carta|of[ií]cio)|mandado|carta|of[ií]cio)|carta .{0,30}expedid|mandado expedido|of[ií]cio expedido|juntada de (peti|documento|guia|comprovante|procura)|registro de pagamento/i
};
const _RA_NUM = { um:1, uma:1, dois:2, duas:2, 'três':3, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10, quinze:15, vinte:20, trinta:30, 'quarenta e cinco':45, sessenta:60 };

// Lê o teor de um ato: o que manda, se manda a nós, prazo, cominação
function raFrases(t) {
  return String(t || '').split(/(?<!\b(?:art|arts|fls?|n|nº|inc|al|p|pág|dr|dra|sr|sra|exmo|cf|r|v|ex|des|min|int|proc|res|ss|ltda|cia|s\.a))[.;]\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“(])/i);
}
// Para quem é a determinação? polo = 'A' (escritório no polo ativo) ou 'P'. Frase só com a outra parte (ou só com perito/cartório) não é nossa.
const RA_VERBO = /(intime|intimem|cite|citem|notifique|manifeste|manifestem|providencie|recolha|comprove|junte|apresente|esclare[cç]a|diga|digam|cumpra|regularize|deposite|requeira|indique|emende|traga|informe|supra|fica[m]?\s|dever[aá]|ter[aá]|aguarde-se)/i;
function raDestinatario(f) {
  const m = f.match(RA_VERBO);
  const trecho = m ? f.slice(m.index, m.index + m[0].length + 70) : '';
  const pos = [['A', trecho.search(RX.poloA)], ['P', trecho.search(RX.poloP)], ['T', trecho.search(RX.terceiro)]].filter(x => x[1] >= 0).sort((x, y) => x[1] - y[1]);
  if (pos.length) return pos[0][0];
  const a = RX.poloA.test(f), pp = RX.poloP.test(f);
  if (a !== pp) return a ? 'A' : 'P';
  return RX.terceiro.test(f) && !a ? 'T' : null;
}
function raFraseNossa(f, polo) {
  const d = raDestinatario(f);
  if (d === 'T') return false;
  return d ? d === polo : true;
}
function raLerAto(texto, polo) {
  const t = String(texto || '');
  const frases = raFrases(t);
  // fora: fórmulas de praxe ("Cumpra-se", "Int.") e frases condicionais/futuras ("Se efetivado o pagamento, será o credor intimado…")
  const praxe = f => f.trim().length < 28 && /^(cumpra-se|int\b|intime-se|intimem-se|publique-se|registre-se|servir[aá])/i.test(f.trim());
  const condicional = f => /^\s*(se |caso |ap[oó]s|transcorrid|decorrid|no sil[eê]ncio|n[aã]o havendo|havendo|em caso de|na hip[oó]tese|oportunamente|com a vinda|com a resposta|sobrevindo|cumprid|efetivad|vindo|juntad|com o retorno|em seguida|ap[oó]s,)/i.test(f) && !/aguarde-se (a )?provoca/i.test(f);
  const detFrases = frases.filter(f => RX.det.test(f) && !praxe(f) && !condicional(f));
  const nossa = detFrases.some(f => raFraseNossa(f, polo || 'A'));
  let prazoDias = null, prazoCorridos = false;
  const m = t.match(RX.prazo);
  if (m) { const v = m[1].toLowerCase(); prazoDias = /^\d+$/.test(v) ? +v : (_RA_NUM[v] || null); prazoCorridos = /corridos/i.test(m[2] || ''); }
  // intimação do eproc sobre um evento: só pede ação quando o evento é peça, decisão ou diligência negativa (expedição de ofício/mandado é só aviso)
  const evNome = ((t.match(/refere-se ao seguinte evento:?\s*Evento\s*\d+\s*-\s*\d{2}\/\d{2}\/\d{4}\s*-\s*([^.]{3,120})/i) || [])[1] || '');
  // o ato manda arquivar agora (não é "em caso de omissão, arquivem-se")
  const arquivaAgora = frases.some(f => /arquivem-se|arquive-se|remetam-se.{0,25}arquivo|ao arquivo com baixa/i.test(f) && !condicional(f) && !/omiss|sil[eê]ncio|in[eé]rcia|n[aã]o havendo|decorrid|inerte/i.test(f))
                    && !frases.some(f => RX.det.test(f) && !praxe(f) && !condicional(f) && !/arquiv/i.test(f) && raFraseNossa(f, polo || 'A'));
  const evEproc = !!evNome && /peti|contesta|manifesta|laudo|documento|despacho|decis|senten|n[aã]o cumprid|negativ|impugna|embargos|r[eé]plica|c[aá]lculo|proposta|acordo|ato ordinat/i.test(evNome)
                  && !/expedi[cç][aã]o|mandado cumprido|positiv|decorrido prazo|conclus/i.test(evNome);
  return {
    det: ((detFrases.length > 0 && nossa) || evEproc) && !arquivaAgora,
    arquivaAgora,
    prazoDias, prazoCorridos,
    sobPena: /sob pena|pena de (extin|arquiv|preclus|indeferi)|art\.? ?485/i.test(t),
    arquivo: /aguarde-se provoca|arquivem-se|ao arquivo|remessa ao arquivo|provoca[cç][aã]o em arquivo|no arquivo/i.test(t),
    prosseg: /prosseguimento|requer(a|er) o que de direito|d[eê]-se andamento|dar andamento|in[eé]rcia|inerte/i.test(t),
    emenda: /emend/i.test(t),
    juntar: /junt|comprove|recolh|planilha|c[aá]lculo|custas|despesas|guia|dilig[eê]ncia|dare/i.test(t),
    endereco: /endere[cç]o|n[aã]o localizad|cita[cç][aã]o negativa|novo endere/i.test(t),
    negativo: (RX.mandNeg.test(t) || /resultado negativo/i.test(t)) && /ci[eê]ncia|manifest|intimad|intima[cç][aã]o realizada|refere-se ao seguinte evento/i.test(t),
    eventoEproc: ((t.match(/refere-se ao seguinte evento:?\s*Evento\s*\d+\s*-\s*\d{2}\/\d{2}\/\d{4}\s*-\s*([^.]{3,120})/i) || [])[1] || '').trim() || null,
    provocacao: /aguarde-se (a )?provoca[cç][aã]o|aguardem? provoca[cç][aã]o/i.test(t) && !frases.some(f => !/provoca[cç][aã]o|arquiv/i.test(f) && RX.det.test(f) && raFraseNossa(f, polo || 'A')),
    sentenca: /julgo (parcialmente )?(im)?procedente|ante o exposto|isto posto|diante do exposto[\s\S]{0,200}julgo|^\s*senten[cç]a/i.test(t),
    extingue: /julgo (o processo |a a[cç][aã]o |a execu[cç][aã]o )?extint|declaro extint|julgo extinta|extingo (o processo|a a[cç][aã]o|a execu|o feito)/i.test(t),
    acordo: /homologo[\s\S]{0,60}(acordo|transa[cç])|487,?\s*(inciso\s*)?III/i.test(t),
    pauta: RX.pauta.test(t),
    decorrido: /decurso de prazo|decorrido o prazo|prazo decorrido|in[eé]rcia|quedou-se inerte/i.test(t)
  };
}

// Tira do texto do DJEN o cabeçalho (classe, número, partes, advogados) e deixa o ato
const RA_INICIO_ATO = /\b(Vistos|Fica(m)? |Intime-se|Intimem-se|Manifest|Ci[eê]ncia|Em \d+ ?\(|Diante|Ante |Defiro|Indefiro|Cite-se|Citem-se|Ato Ordinat|Certifico|Nos termos|Considerando|Tendo em vista|Providenci|Recolha|Apresente|Trata-se|Homologo|Julgo|SENTEN[ÇC]A|Aguarde|Comprove|Junte|Regularize|Esclare|Diga|Dê-se|Arquive|Remetam|Expeça|Evento \d|Fls?\.)/;
function raLimpaAto(html) {
  let t = raTextoHtml(html);
  t = t.replace(/Processo Digital\. Peti[cç][õo]es para juntada devem ser apresentadas exclusivamente por meio eletr[ôo]nico,? nos termos do artigo 7º da Res\. 551\/2011\s*-?/gi, '');
  t = t.replace(/\s+-\s+(ADV|Advs?|Advogad[oa]s?)\s*:[\s\S]*$/i, '').replace(/\s+-\s+Magistrad[oa]\(a\)[\s\S]*$/i, '');
  if (/^\s*(DESPACHO|DECIS[ÃA]O|SENTEN[ÇC]A|AC[ÓO]RD[ÃA]O|INTIMA[ÇC][ÃA]O)?\s*(Processo|N[º°o]\.?)\s*\d{7}-/i.test(t)) {          // DJE do e-SAJ / 2º grau: "Processo N - Classe - Assunto - Partes - Vistos…"
    const k = t.slice(20).search(RA_INICIO_ATO);
    if (k >= 0) return t.slice(20 + k).trim();
  }
  const i = t.search(/\(OAB [A-Z]{2}\s?\d+[A-Z]?\)(?![\s\S]*\(OAB [A-Z]{2}\s?\d+)/);
  if (i >= 0) t = t.slice(t.indexOf(')', i) + 1);
  t = t.replace(/^\s*(DESPACHO\/DECIS[ÃA]O|DESPACHO|DECIS[ÃA]O|SENTEN[ÇC]A|ATO ORDINAT[ÓO]RIO|INTIMA[ÇC][ÃA]O|AC[ÓO]RD[ÃA]O)\s*/i, m => m.trim().toUpperCase().startsWith('SENTEN') ? 'SENTENÇA ' : '');
  return t.replace(/\s+/g, ' ').trim();
}

// ── coleta ───────────────────────────────────────────────────────
async function raBuscar(tabela, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${params}`, { headers: DB_HEADERS });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function raDjenPorOab(oab, inicio, fim, log) {
  const itens = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const q = new URLSearchParams({ numeroOab: oab, ufOab: 'SP', dataDisponibilizacaoInicio: inicio, dataDisponibilizacaoFim: fim, itensPorPagina: '100', pagina: String(pagina) });
    let j = null;
    for (let tentativa = 0; tentativa < 3 && !j; tentativa++) {
      try { const r = await fetch(`${RA.DJEN_URL}?${q}`, { headers: { Accept: 'application/json' } }); if (r.ok) j = await r.json(); else if (r.status === 429) await raEspera(4000); }
      catch (_) { await raEspera(1500); }
    }
    if (!j) { log(`⚠️ DJEN não respondeu (OAB ${oab}, página ${pagina}).`); return { itens, ok: false }; }
    itens.push(...(j.items || []));
    if (!j.items || j.items.length < 100 || itens.length >= (j.count || 0)) break;
    await raEspera(700);
  }
  return { itens, ok: true };
}

async function raDjenPorProcesso(num, inicio, fim) {
  const q = new URLSearchParams({ numeroProcesso: num, dataDisponibilizacaoInicio: inicio, dataDisponibilizacaoFim: fim, itensPorPagina: '100', pagina: '1' });
  try { const r = await fetch(`${RA.DJEN_URL}?${q}`, { headers: { Accept: 'application/json' } }); if (r.ok) return ((await r.json()).items) || []; } catch (_) {}
  return null;
}

async function raEsaj(num) {
  if (!_tokenPortal) return { erro: 'sem sessão do portal' };
  try {
    const r = await fetch('/.netlify/functions/tjsp-esaj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: num, token: _tokenPortal }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { erro: j.erro || ('HTTP ' + r.status) };
    return j;
  } catch (e) { return { erro: e.message }; }
}
const raNoEsaj = num => num && num[0] !== '4' && num.slice(16) !== '0000';   // eproc (4…) e 2º grau (0000) não estão no e-SAJ 1º grau

// Junta tudo o que o relatório precisa. opts: {ref, advogado, consultar}
async function raColetar(opts, log) {
  const ref = opts.ref;
  const inicio = raSoma(ref, -RA.JANELA_DIAS);
  log('Lendo processos do portal…');
  const todos = await raBuscar('processos', '?select=id,numero,tipo,vara,fase,autor,reu,status,responsavel_id,responsavel:usuarios(nome)&limit=2000');
  const ativos = todos.filter(p => p.status !== 'encerrado' && (!opts.advogado || p.responsavel?.nome === opts.advogado));
  log(`${ativos.length} processos em andamento${opts.advogado ? ' na carteira de ' + opts.advogado : ''}.`);

  try { (await raBuscar('dias_sem_expediente', '?select=data')).forEach(x => RA.extras.add(x.data)); } catch (_) {}

  // andamentos já gravados (DataJud diário, DJEN, manuais)
  const ands = [];
  for (let i = 0; i < ativos.length; i += 50) {
    const ids = ativos.slice(i, i + 50).map(p => p.id).join(',');
    ands.push(...await raBuscar('andamentos_processos', `?processo_id=in.(${ids})&select=processo_id,tipo,descricao,data,origem,texto_completo,id_comunicacao,tipo_documento&order=data.desc&limit=20000`));
  }

  // DJEN por OAB (fonte principal dos atos com teor)
  const djen = [];
  const carteiras = [...new Set(ativos.map(p => p.responsavel?.nome).filter(Boolean))];
  const fontes = { djen: 'não consultado', esaj: 'não consultado' };
  if (opts.consultar) {
    let okDjen = true;
    for (const nome of carteiras.filter(n => RA.OAB[n])) {
      log(`DJEN: publicações de ${nome} (OAB ${RA.OAB[nome]}/SP)…`);
      const r = await raDjenPorOab(RA.OAB[nome], inicio, ref, log);
      okDjen = okDjen && r.ok;
      r.itens.forEach(it => { it._oabNome = nome; djen.push(it); });
    }
    // carteiras sem OAB cadastrada aqui: por processo
    const semOab = ativos.filter(p => p.responsavel?.nome && !RA.OAB[p.responsavel.nome] && raNum(p.numero));
    for (const p of semOab) {
      const it = await raDjenPorProcesso(raNum(p.numero), inicio, ref);
      if (it) it.forEach(x => djen.push(x)); else okDjen = false;
      await raEspera(500);
    }
    fontes.djen = okDjen ? `${djen.length} publicações` : `${djen.length} publicações (com falhas)`;
    log(`DJEN: ${djen.length} publicações lidas.`);
  }

  // e-SAJ (1º grau, fora do eproc)
  const esaj = {};
  const numsEsaj = [...new Set(ativos.map(p => raNum(p.numero)).filter(raNoEsaj))];
  if (numsEsaj.length) {
    try {
      const cache = await raBuscar('andamentos_tjsp', `?numero=in.(${numsEsaj.join(',')})&select=*`);
      cache.forEach(c => { esaj[c.numero] = c; });
    } catch (_) {}
  }
  if (opts.consultar && numsEsaj.length) {
    const vencido = c => !c || !c.consultado_em || (Date.now() - new Date(c.consultado_em)) > RA.CACHE_ESAJ_H * 3600000 || c.erro;
    const fila = numsEsaj.filter(n => vencido(esaj[n]));
    let ok = 0, falha = 0;
    for (let i = 0; i < fila.length; i++) {
      log(`e-SAJ: ${i + 1} de ${fila.length} (${raMask(fila[i])})…`, true);
      const r = await raEsaj(fila[i]);
      if (r && !r.erro) { esaj[fila[i]] = r; ok++; } else { falha++; if (i === 0 && r && /sessão|acesso|403/i.test(r.erro || '')) { log('⚠️ e-SAJ: ' + r.erro); break; } }
      if (falha >= 4 && ok === 0) { log('⚠️ O e-SAJ não está respondendo para o servidor do jurídico; o relatório segue com DataJud e DJEN.'); break; }
      await raEspera(RA.INTERVALO_TJSP_MS);
    }
    fontes.esaj = `${numsEsaj.length - Object.values(esaj).filter(c => c.erro || c.encontrado === null).length} de ${numsEsaj.length} processos`;
    log(`e-SAJ: ${ok} consultados agora${falha ? `, ${falha} sem resposta` : ''}.`);
  } else if (numsEsaj.length) {
    fontes.esaj = `${Object.keys(esaj).length} de ${numsEsaj.length} (consulta guardada)`;
  }

  // planilhas do eproc (a mais recente de cada carteira, dos últimos 10 dias)
  let planilhas = [];
  try { planilhas = await raBuscar('planilhas_eproc', `?enviado_em=gte.${raSoma(ref, -10)}T00:00:00&select=id,advogado,enviado_em,nome_arquivo,linhas&order=enviado_em.desc&limit=20`); } catch (_) {}
  const vistas = new Set(), eproc = {};
  for (const pl of planilhas) {
    const k = (pl.advogado || '') + '|' + (pl.nome_arquivo || '').replace(/\d+/g, '');
    if (vistas.has(k)) continue; vistas.add(k);
    for (const l of (pl.linhas || [])) { const n = raNum(l.numero); if (n) (eproc[n] = eproc[n] || []).push(Object.assign({ _advogado: pl.advogado, _enviado: pl.enviado_em }, l)); }
  }
  fontes.eproc = planilhas.length ? `${vistas.size} planilha(s), ${Object.keys(eproc).length} processos` : 'nenhuma planilha nos últimos 10 dias';

  return { ref, advogado: opts.advogado || '', todos, ativos, ands, djen, esaj, eproc, fontes, carteiras };
}

// Grava no histórico do processo as publicações novas do DJEN (aparecem na aba Andamentos)
async function raGravarDjen(dados) {
  const porNum = {};
  dados.todos.forEach(p => { const n = raNum(p.numero); if (n) (porNum[n] = porNum[n] || []).push(p.id); });
  const ja = new Set(dados.ands.filter(a => a.id_comunicacao).map(a => a.processo_id + ':' + a.id_comunicacao));
  const rows = [];
  for (const it of dados.djen) {
    for (const pid of (porNum[it.numero_processo] || [])) {
      if (!dados.ativos.some(p => p.id === pid) || ja.has(pid + ':' + it.id)) continue;
      ja.add(pid + ':' + it.id);
      const tipoDoc = it.tipoDocumento || it.tipoComunicacao || 'Publicação';
      rows.push({ processo_id: pid, data: it.data_disponibilizacao, descricao: '[DJEN] ' + tipoDoc + (it.nomeOrgao ? ' — ' + it.nomeOrgao : ''),
                  texto_completo: it.texto || '', id_comunicacao: +it.id, tipo_documento: tipoDoc, link_origem: it.link || '', origem: 'cnj-djen' });
    }
  }
  for (let i = 0; i < rows.length; i += 100) {
    await fetch(`${SUPABASE_URL}/rest/v1/andamentos_processos`, { method: 'POST', headers: Object.assign({}, DB_HEADERS, { Prefer: 'return=minimal' }), body: JSON.stringify(rows.slice(i, i + 100)) }).catch(() => {});
  }
  return rows.length;
}

// ── classificação ────────────────────────────────────────────────
// Publicações que são só aviso (migração para o eproc, distribuição, entrada no tribunal): não são ato com determinação
const RA_AVISO = /passar[aá] a tramitar|tramitar eletronicamente|migra[cç][aã]o (para|do processo)|cientificad[oa]s? de que o presente processo|^\s*processos? distribu[ií]dos? em|^\s*processo entrado em|^\s*processos? entrados? em/i;
function raEventos(p, dados) {
  const num = raNum(p.numero), ref = dados.ref, ev = [];
  const djenIds = new Set();
  for (const it of dados.djen) {
    if (it.numero_processo !== num || it.data_disponibilizacao > ref) continue;
    djenIds.add(String(it.id));
    const polos = (() => { try { const d = typeof it.destinatarios === 'string' ? JSON.parse(it.destinatarios.replace(/'/g, '"')) : it.destinatarios; return [...new Set((d || []).map(x => x.polo))]; } catch (_) { return []; } })();
    const texto = raLimpaAto(it.texto), aviso = RA_AVISO.test(texto) || /distribu[ií]dos|entrados/i.test(it.tipoDocumento || '');
    ev.push({ data: it.data_disponibilizacao, fonte: 'DJEN', titulo: aviso ? (/migra|tramitar/i.test(texto) ? 'Migrado do e-SAJ para o eproc' : (it.tipoDocumento || 'Aviso')) : (it.tipoDocumento || it.tipoComunicacao || 'Publicação'),
              texto: aviso ? '' : texto, ato: !aviso, migracao: aviso && /migra|tramitar/i.test(texto),
              orgao: it.nomeOrgao, classe: it.nomeClasse, polo: polos.length === 1 ? polos[0] : null, idCom: String(it.id) });
  }
  for (const a of dados.ands) {
    if (a.processo_id !== p.id || !a.data || a.data > ref) continue;
    if (a.origem === 'cnj-djen') {
      if (a.id_comunicacao && djenIds.has(String(a.id_comunicacao))) continue;
      const texto = raLimpaAto(a.texto_completo), aviso = RA_AVISO.test(texto);
      ev.push({ data: a.data, fonte: 'DJEN', titulo: aviso ? 'Aviso' : (a.tipo_documento || 'Publicação'), texto: aviso ? '' : texto, ato: !!a.texto_completo && !aviso, orgao: (a.descricao || '').split(' — ')[1] || null });
    } else if (a.origem === 'tjsp-datajud') {
      ev.push({ data: a.data, fonte: 'DataJud', titulo: String(a.descricao || '').split('\n')[0], texto: '', ato: false });
    } else {
      // anotação das advogadas no portal: não é andamento do tribunal; só conta como petição/providência do escritório
      const t = (a.tipo || '') + ' ' + (a.descricao || '');
      const pet = /peti[cç][aã]o protocolad|peticionamos|protocolamos|protocolad[oa]|juntamos|recolhemos|pagamos|pagamento (das|da|de) (custas|dilig|guia|honor)|recolhiment|indicamos|requeremos/i.test(t) && !/vamos|iremos|precisamos|ainda n[aã]o|aguardamos/i.test(t);
      ev.push({ data: a.data, fonte: 'portal', titulo: a.tipo || 'Andamento', texto: a.descricao || '', ato: false, manual: true, peticao: pet });
    }
  }
  const es = dados.esaj[num];
  if (es && es.movimentos) {
    // "Relação: 1158/2026 … Data da Publicação: 29/05/2026" vem na certidão; o teor vem no "Remetido ao DJE" da mesma relação
    const pubPorRel = {};
    es.movimentos.forEach(m => { const r = (m.texto || '').match(/Rela[cç][aã]o:\s*([\d/]+)[\s\S]*?Data da Publica[cç][aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i); if (r) pubPorRel[r[1]] = raIsoBr(r[2]); });
    for (const m of es.movimentos) {
      if (!m.data || m.data > ref) continue;
      const migracao = /migra[cç][aã]o/i.test(m.titulo + ' ' + m.texto);
      const teor = migracao ? null : (m.texto || '').match(/Teor do ato:\s*([\s\S]*?)(?:Advogad[oa]s?\(s\):|$)/i);
      const rel = ((m.texto || '').match(/Rela[cç][aã]o:\s*([\d/]+)/i) || [])[1];
      const pub = (rel && pubPorRel[rel]) || null;
      if (migracao) { if (/remetid/i.test(m.titulo)) ev.push({ data: m.data, fonte: 'e-SAJ', titulo: 'Migrado do e-SAJ para o eproc', texto: '', ato: false, migracao: true }); continue; }
      if (/certid[aã]o de publica/i.test(m.titulo)) continue;           // já usada como data de publicação
      // ato com teor: se o DJEN já trouxe um ato na mesma semana, fica só o do DJEN
      if (teor && ev.some(e => e.fonte === 'DJEN' && e.ato && Math.abs(raDias(e.data, m.data)) <= 4)) continue;
      ev.push({ data: m.data, fonte: 'e-SAJ', titulo: m.titulo, texto: teor ? teor[1].trim() : (m.texto || ''), ato: !!teor, pub });
    }
  }
  for (const l of (dados.eproc[num] || [])) {
    const d = l.data_evento || l.prazo_inicio;
    if (d && d <= ref) ev.push({ data: d, fonte: 'eproc', titulo: l.evento || l.situacao || 'Evento no eproc', texto: '', ato: false, eproc: l, atendido: !!l.atendido });
    if (l.atendido && /^\d{4}-/.test(l.atendido) && l.atendido <= ref) ev.push({ data: l.atendido, fonte: 'eproc', titulo: 'Atendido (petição)', texto: l.evento || '', ato: false, peticao: true });
  }
  ev.sort((a, b) => b.data.localeCompare(a.data));
  return ev;
}

const raTem = (e, rx) => rx.test(e.titulo + ' ' + (e.ato ? '' : e.texto));      // movimentação: olha título e complemento, não o teor
const raEhPeticao = e => e.peticao || (!e.ato && !e.manual && raTem(e, RX.peticao) && !/intima[cç][aã]o|publica|decurso/i.test(e.titulo));
const RA_NSP = /nova s[aã]o paulo|\binsp\b|organiza[cç][aã]o imobili/i;

// Lado do escritório: pelas intimações do DJEN com um só polo; senão, onde está a Nova SP; senão, polo ativo (a maioria da carteira)
function raPolo(p, ev) {
  const v = { A: 0, P: 0 };
  ev.forEach(e => { if (e.polo === 'A' || e.polo === 'P') v[e.polo]++; });
  if (v.A !== v.P) return v.A > v.P ? 'A' : 'P';
  if (RA_NSP.test(p.reu || '') && !RA_NSP.test(p.autor || '')) return 'P';
  return 'A';
}

function raClassificar(p, dados) {
  const ref = dados.ref, num = raNum(p.numero), ev = raEventos(p, dados), es = dados.esaj[num];
  const trib = ev.filter(e => !e.manual);                         // só o que veio do tribunal
  const eprocLinhas = (dados.eproc[num] || []).filter(l => l.prazo_fim);
  const base = { p, num, ev, es, orgao: null, classe: null };
  const comOrgao = trib.find(e => e.orgao); if (comOrgao) base.orgao = comOrgao.orgao;
  base.classe = (es && es.classe) || (trib.find(e => e.classe) || {}).classe || null;
  const R = (cat, situacao, dias, providencia, extra) => Object.assign(base, { cat, situacao, dias, providencia }, extra || {});
  const sit = String(es && es.situacao || '');

  if (!trib.length) return R('pendente', `Sem movimentação nas fontes consultadas (DataJud, DJEN, e-SAJ${eprocLinhas.length ? '' : ', eproc'}).${ev.length ? ' Última anotação no portal em ' + raBr(ev[0].data) + '.' : ''}`, null, 'Conferir o processo no tribunal (número certo? processo novo?)');

  const polo = raPolo(p, trib);
  const ult = trib[0];
  // resposta do escritório depois de uma data: petição, pagamento/recolhimento, diligência expedida, anotação de petição no portal, "atendido" no eproc
  const respostaApos = d => ev.find(e => e.data > d && (raEhPeticao(e) || (!e.ato && !e.manual && RX.resposta.test(e.titulo + ' ' + e.texto))));
  const leituras = new Map();
  const ler = e => { if (!leituras.has(e)) leituras.set(e, raLerAto(e.texto, polo)); return leituras.get(e); };

  // 1) prazo em aberto no eproc vencendo em até 5 dias
  const abertos = eprocLinhas.filter(l => l.prazo_fim >= ref && !l.atendido).sort((a, b) => a.prazo_fim.localeCompare(b.prazo_fim));
  const prEproc = abertos[0];
  const prazoEproc = l => ({ venc: l.prazo_fim, origem: 'Prazo do eproc', regra: `Prazo informado pelo eproc: ${l.prazo_inicio ? 'de ' + raBr(l.prazo_inicio) + ' ' : ''}a ${raBr(l.prazo_fim)}${l.data_evento ? ` (intimação de ${raBr(l.data_evento)})` : ''}`, chave: `eproc:${l.prazo_fim}` });
  if (prEproc && raDias(ref, prEproc.prazo_fim) <= 5) {
    const d = raDias(ref, prEproc.prazo_fim);
    return R('urgente', `Prazo em aberto no eproc ${d === 0 ? 'VENCE HOJE' : 'vence em ' + raBr(prEproc.prazo_fim)}${prEproc.data_evento ? ` (intimação de ${raBr(prEproc.data_evento)})` : ''}.${prEproc.evento ? ' ' + raCorta(prEproc.evento, 120) : ''}`,
      prEproc.data_evento ? raDias(prEproc.data_evento, ref) : null, 'Cumprir o prazo: conferir no eproc o ato intimado e peticionar', { prazo: prazoEproc(prEproc) });
  }

  // último ato com teor (DJEN ou e-SAJ) e o que ele manda
  const ultAto = trib.find(e => e.ato && e.texto);
  const leitura = ultAto ? ler(ultAto) : null;
  const concDepois = ultAto && trib.find(e => e.data > ultAto.data && !e.ato && raTem(e, RX.concluso));
  const riscoExtincao = leitura && (leitura.emenda || (leitura.sobPena && /extin/i.test(ultAto.texto)));
  const semResposta = ultAto ? !respostaApos(ultAto.data) && !(concDepois && !riscoExtincao) : false;
  const diasAto = ultAto ? raDias(ultAto.data, ref) : null;

  // 2) arquivado / suspenso / encerrado
  const arqEv = trib.find(e => !e.ato && (raTem(e, RX.arqProv) || raTem(e, RX.arqDef) || raTem(e, RX.extinto) || raTem(e, RX.acordo) || (raTem(e, RX.susp) && !/prazo/i.test(e.titulo))));
  const sitAtual = es && (!es.consultado_em || Math.abs(raDias(ref, String(es.consultado_em).slice(0, 10))) <= 3);
  const sitArq = sitAtual && /arquiv|extint|baixad|suspens|encerrad/i.test(sit);
  // sentença de extinção recente ainda tem prazo de recurso: fica nos urgentes; acordo homologado e arquivamento vão para arquivados
  const atoEncerra = ultAto && (leitura.acordo || leitura.arquivaAgora || (leitura.extingue && diasAto > 30));
  const provocacaoAntiga = ultAto && leitura.provocacao && diasAto > 60;
  const atoPendente = ultAto && leitura.det && semResposta && !leitura.provocacao && !atoEncerra;
  const arquivado = (arqEv && (!ultAto || arqEv.data >= ultAto.data) && !respostaApos(arqEv.data))
                 || (sitArq && !(atoPendente && diasAto <= 60))
                 || (atoEncerra && semResposta) || provocacaoAntiga;
  if (arquivado) {
    const e = (arqEv && (!ultAto || arqEv.data >= ultAto.data)) ? arqEv : (ultAto || arqEv);
    const desde = e ? e.data : null;
    const t = raSemAcento((arqEv ? arqEv.titulo + ' ' + arqEv.texto : '') + ' ' + sit + ' ' + (ultAto && (atoEncerra || provocacaoAntiga) ? ultAto.texto.slice(0, 500) : ''));
    let situacao, prov, def = false;
    if (/acordo|transa|487,?\s*(inciso\s*)?iii/.test(t)) { situacao = `Acordo homologado${desde ? ' em ' + raBr(desde) : ''}; processo extinto.`; prov = 'Acompanhar o cumprimento do acordo; se descumprido, requerer o cumprimento de sentença'; }
    else if (ultAto && leitura.arquivaAgora && e === ultAto && !/provoca/.test(t)) { situacao = `Arquivamento determinado em ${raBr(desde)}: ${raCorta(ultAto.texto, 140)}`; prov = /baixa/i.test(ultAto.texto) ? 'Dar baixa no cadastro ou abrir cumprimento de sentença, se houver crédito' : 'Desarquivar quando houver bens ou diligência a requerer'; def = /baixa/i.test(ultAto.texto); }
    else if (/provoca/.test(t)) { situacao = `Aguardando provocação no arquivo${desde ? ' desde ' + raBr(desde) : ''}.`; prov = 'Peticionar com pesquisas (Sisbajud/Renajud/Infojud) para reativar'; }
    else if (/provisori/.test(t)) { situacao = `Arquivado provisoriamente${desde ? ' desde ' + raBr(desde) : ''}.`; prov = 'Desarquivar quando houver bens ou diligência a requerer'; }
    else if (/suspens|sobrest/.test(t)) { situacao = `Suspenso${desde ? ' desde ' + raBr(desde) : ''}${arqEv && arqEv.texto ? ': ' + raCorta(arqEv.texto, 120) : ''}.`; prov = /pagamento|parcel|acordo/.test(t) ? 'Acompanhar os pagamentos; se descumprido, requerer o prosseguimento' : 'Acompanhar o fim da suspensão'; }
    else if (/485,?\s*(inciso\s*)?iii|abandono/.test(t)) { situacao = `Extinto sem resolução do mérito${desde ? ' em ' + raBr(desde) : ''} (abandono).`; prov = 'Avaliar nova propositura da ação'; def = true; }
    else { situacao = `Encerrado${desde ? ' desde ' + raBr(desde) : ''}${arqEv ? ' (' + raCorta(arqEv.titulo, 60) + ')' : ''}.`; prov = 'Dar baixa no cadastro ou abrir cumprimento de sentença, se houver crédito'; def = true; }
    const segue = trib.find(x => /cumprimento de senten[cç]a iniciad|execu[cç][aã]o\/cumprimento/i.test(x.titulo) && /\d{7}-\d{2}\.\d{4}/.test(x.texto));
    if (segue) { situacao += ` Andamento segue em ${(segue.texto.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/) || [''])[0]}.`; prov = 'Acompanhar pelo cumprimento de sentença'; }
    if (sit && !/cancelad/i.test(sit) && !situacao.toLowerCase().includes(sit.toLowerCase())) situacao += ` No e-SAJ: ${sit}.`;
    if (ult && desde && ult.data > desde && !ult.migracao) situacao += ` Último evento em ${raBr(ult.data)}: ${raCorta(ult.titulo, 70)}.`;
    return R('arquivado', situacao, desde ? raDias(desde, ref) : null, prov, { definitivo: def });
  }

  // 3) ato que manda o escritório agir, sem resposta depois
  if (ultAto && semResposta) {
    const pub = ultAto.pub || (ultAto.fonte === 'DJEN' ? raProxUtil(ultAto.data) : ultAto.data);
    const trecho = `${raBr(ultAto.data)}: ${raCorta(ultAto.texto, 300)}`;
    const ehSent = (leitura.sentenca || leitura.extingue || RX.sentenca.test(ultAto.titulo) || RX.ac2grau.test(ultAto.titulo)) && !leitura.acordo;
    const fimEproc = prEproc ? ` Prazo em aberto no eproc até ${raBr(prEproc.prazo_fim)}.` : '';
    if (ehSent && diasAto <= 30) {
      const jec = /juizado/i.test((p.vara || '') + ' ' + (base.orgao || '') + ' ' + (p.tipo || ''));
      const n = jec ? 10 : 15;
      return R('urgente', trecho + ' Sem petição do escritório depois do ato.' + fimEproc, diasAto,
        leitura.extingue ? `Sentença de extinção publicada: avaliar recurso (${jec ? 'recurso inominado em 10 dias úteis' : 'apelação em 15 dias úteis'}) ou nova propositura`
          : `${RX.ac2grau.test(ultAto.titulo) ? 'Acórdão publicado' : 'Sentença de mérito publicada'}: avaliar recurso (${jec ? 'recurso inominado em 10 dias úteis' : 'apelação em 15 dias úteis'}) ou cumprimento de sentença`,
        { prazo: prEproc ? prazoEproc(prEproc) : { venc: raSomaUteis(pub, n), origem: 'Prazo legal', regra: `Sentença: ${n} dias úteis (${jec ? 'recurso no Juizado, Lei 9.099, art. 42' : 'apelação, CPC, art. 1.003, § 5º'}), contados da publicação em ${raBr(pub)}`, chave: `sent:${ultAto.data}` } });
    }
    if (leitura.det || leitura.negativo) {
      let prov;
      const ev2 = leitura.eventoEproc;
      if (leitura.emenda) prov = 'Peticionar com urgência (cumprir a determinação ou justificar) antes da decisão';
      else if (leitura.negativo && !leitura.prosseg) prov = 'Indicar novo endereço ou requerer pesquisas (Sisbajud/Infojud/Renajud)';
      else if (ev2 && /despacho|decis|senten/i.test(ev2)) prov = `Ler no eproc o ato intimado (${raCorta(ev2, 50)}) e cumprir o que ele determina`;
      else if (ev2) prov = `Manifestar-se sobre o evento intimado no eproc (${raCorta(ev2, 50)}); conferir o prazo no eproc`;
      else if (leitura.emenda) prov = 'Peticionar com urgência (cumprir a determinação ou justificar) antes da decisão';
      else if (leitura.provocacao || (leitura.arquivo && !leitura.prosseg)) prov = 'Peticionar dando andamento para evitar a remessa ao arquivo';
      else if (leitura.prosseg) prov = 'Peticionar requerendo o prosseguimento (pesquisas de bens, penhora ou diligência cabível)';
      else if (leitura.sobPena) prov = 'Cumprir a determinação dentro do prazo (há cominação de extinção, arquivamento ou preclusão)';
      else if (leitura.juntar) prov = 'Cumprir a determinação (juntar documento, cálculo ou recolher despesas); conferir o prazo';
      else if (leitura.endereco) prov = 'Indicar novo endereço ou requerer pesquisas (Sisbajud/Infojud/Renajud)';
      else prov = 'Cumprir a determinação; conferir o prazo no ato';
      let prazo;
      if (prEproc) prazo = prazoEproc(prEproc);
      else if ((leitura.provocacao && !leitura.prazoDias) || (riscoExtincao && concDepois)) prazo = { venc: ref, origem: 'Data interna', regra: concDepois ? 'O prazo do ato já decorreu sem petição e o processo foi concluso: providenciar imediatamente' : 'Sem prazo processual (aguarda provocação): providenciar imediatamente', chave: `ato:${ultAto.data}` };
      else if (leitura.prazoDias) prazo = { venc: leitura.prazoCorridos ? raSoma(pub, leitura.prazoDias) : raSomaUteis(pub, leitura.prazoDias), origem: 'Calculado do despacho',
        regra: `${leitura.prazoDias} dias ${leitura.prazoCorridos ? 'corridos' : 'úteis'} contados da publicação em ${raBr(pub)} (prazo do próprio ato)`, chave: `ato:${ultAto.data}` };
      else if (leitura.negativo) prazo = { venc: raSomaUteis(pub, 5), origem: 'Prazo legal', regra: `Diligência negativa: 5 dias úteis (CPC, art. 218, § 3º), contados da publicação em ${raBr(pub)}`, chave: `ato:${ultAto.data}` };
      else prazo = { venc: raSomaUteis(pub, 5), origem: 'Prazo legal', regra: `Sem prazo no ato: 5 dias úteis (CPC, art. 218, § 3º), contados da publicação em ${raBr(pub)}`, chave: `ato:${ultAto.data}` };
      let situacao = trecho + ' Sem petição do escritório depois do ato.';
      if (prazo.origem !== 'Prazo do eproc' && prazo.origem !== 'Data interna' && prazo.venc < ref) situacao += ` Prazo decorrido em ${raBr(prazo.venc)}.`;
      return R('urgente', situacao + fimEproc, diasAto, prov, { prazo });
    }
  }

  // 4) mandado / AR negativo (movimentação) sem resposta depois
  const neg = trib.find(e => !e.ato && raTem(e, RX.mandNeg));
  if (neg && !respostaApos(neg.data) && raDias(neg.data, ref) <= 60 && !(ultAto && ultAto.data > neg.data)) {
    return R('urgente', `${raBr(neg.data)}: ${raCorta(neg.titulo + (neg.texto ? ' — ' + neg.texto : ''), 200)}. Sem petição do escritório depois.`, raDias(neg.data, ref),
      'Indicar novo endereço ou requerer pesquisas (Sisbajud/Infojud/Renajud)',
      { prazo: { venc: raSomaUteis(ref, 5), origem: 'Data interna', regra: 'Diligência negativa (mandado/AR): 5 dias úteis sugeridos para a providência', chave: `neg:${neg.data}` } });
  }

  // 5) parado ou regular (só andamentos do tribunal contam)
  const diasUlt = raDias(ult.data, ref);
  const ehSeg = num.slice(16) === '0000' || /grau de recurso/i.test(sit) || RX.segGrau.test((base.orgao || '') + ' ' + (p.vara || ''));
  const conc = trib.find(e => !e.ato && raTem(e, RX.concluso));
  const concAberto = conc && !trib.find(e => e.data > conc.data && (e.ato || raTem(e, RX.despacho) || raTem(e, RX.sentenca)));
  const petUlt = ev.find(raEhPeticao);
  const mand = trib.find(e => !e.ato && raTem(e, RX.mandExp));
  const pauta = trib.find(e => raTem(e, RX.pauta) || (e.ato && RX.pauta.test(e.texto)));
  const rotulo = e => e.ato ? `${e.titulo}: ${raCorta(e.texto, 140)}` : raCorta(e.titulo + (e.texto ? ' — ' + e.texto : ''), 160);
  const motivoUlt = `Último andamento${ult.fonte === 'eproc' ? ' no eproc' : ''} em ${raBr(ult.data)}: ${rotulo(ult)}.`;
  const atend = petUlt && petUlt.data >= ult.data ? `Atendido em ${raBr(petUlt.data)} (${raCorta(petUlt.manual ? petUlt.titulo : 'petição', 40)}). ` : '';

  if (diasUlt > RA.LIMITE_PARADO) {
    let situacao = atend + motivoUlt, prov = 'Verificar no processo o que está pendente e peticionar se couber';
    if (concAberto) {
      const dc = raDias(conc.data, ref), para = ((conc.titulo + ' ' + conc.texto).match(/para ([a-zçãéí ]+?)(?:[:•\n]|$)/i) || [])[1];
      situacao = atend + `${ehSeg ? 'Aguardando julgamento (concluso ao relator)' : 'Concluso' + (para ? ' para ' + para.trim() : '')} desde ${raBr(conc.data)} (${dc} dias).`;
      prov = ehSeg ? 'Peticionar pedindo impulso; avaliar memoriais' : dc > 60 ? (/senten/i.test(para || '') ? 'Peticionar pedindo julgamento' : 'Peticionar pedindo impulso') : 'Acompanhar; se passar de 60 dias, peticionar pedindo impulso';
    } else if (mand && mand === ult) prov = 'Acompanhar o oficial de justiça; se vier negativo, indicar novo endereço';
    else if (petUlt && petUlt.data >= ult.data) prov = diasUlt > 60 ? 'Peticionar pedindo impulso (petição sem despacho há mais de 60 dias)' : 'Aguardar o despacho';
    else if (ehSeg) prov = 'Peticionar pedindo impulso; avaliar memoriais';
    if (sit && !/cancelad/i.test(sit)) situacao += ` No e-SAJ: ${sit}.`;
    return R('parado', situacao, diasUlt, prov);
  }

  let situacao = atend + motivoUlt, prov = 'Acompanhar o próximo ato';
  if (prEproc) { situacao += ` Prazo em aberto no eproc até ${raBr(prEproc.prazo_fim)}.`; prov = `Cumprir o prazo que vence em ${raBr(prEproc.prazo_fim)} (${raDias(ref, prEproc.prazo_fim)} dias)`; }
  else if (pauta && raDias(pauta.data, ref) <= 30) { situacao = `Incluído em pauta em ${raBr(pauta.data)}${pauta.texto ? ' (' + raCorta(pauta.texto, 120) + ')' : ''}.`; prov = 'Preparar memoriais e avaliar sustentação oral / oposição ao julgamento virtual'; }
  else if (mand && mand.data >= ult.data) prov = 'Acompanhar o oficial de justiça; se vier negativo, indicar novo endereço';
  else if (petUlt && petUlt.data >= ult.data) prov = 'Aguardar o despacho';
  else if (!ult.ato && raTem(ult, RX.despacho) && diasUlt <= 10) prov = `Ler o ato de ${raBr(ult.data)} (${raCorta(ult.titulo, 40)}): pode haver nova determinação`;
  else if (concAberto) { situacao = `Concluso desde ${raBr(conc.data)}. ` + situacao; prov = 'Aguardar o despacho'; }
  if (sit && !/andamento|cancelad/i.test(sit)) situacao += ` No e-SAJ: ${sit}.`;
  return R('regular', situacao, diasUlt, prov);
}

// Processos que aparecem nas planilhas do eproc com prazo em aberto e não estão no portal
function raNaoCadastradosEproc(dados) {
  const noPortal = new Set(dados.todos.map(p => raNum(p.numero)).filter(Boolean));
  const out = [];
  for (const [num, linhas] of Object.entries(dados.eproc)) {
    if (noPortal.has(num)) continue;
    const l = linhas.filter(x => x.prazo_fim && x.prazo_fim >= dados.ref).sort((a, b) => a.prazo_fim.localeCompare(b.prazo_fim))[0];
    if (!l || (dados.advogado && l._advogado && l._advogado !== dados.advogado)) continue;
    const d = raDias(dados.ref, l.prazo_fim);
    const p = { id: null, numero: raMask(num), autor: null, reu: null, vara: l.orgao || '', tipo: l.classe || '', responsavel: { nome: l._advogado || '' }, naoCadastrado: true };
    out.push({ p, num, ev: [], cat: d <= 5 ? 'urgente' : 'regular', classe: l.classe, orgao: l.orgao,
      situacao: `${l.evento ? raCorta(l.evento, 120) + '. ' : ''}Não cadastrado no portal. Prazo em aberto no eproc até ${raBr(l.prazo_fim)}.`,
      dias: l.data_evento ? raDias(l.data_evento, dados.ref) : null,
      providencia: d <= 5 ? 'Cumprir o prazo: conferir no eproc o ato intimado e peticionar' : `Cumprir o prazo que vence em ${raBr(l.prazo_fim)} (${d} dias)`,
      prazo: { venc: l.prazo_fim, origem: 'Prazo do eproc', regra: `Prazo informado pelo eproc: ${l.prazo_inicio ? 'de ' + raBr(l.prazo_inicio) + ' ' : ''}a ${raBr(l.prazo_fim)}`, chave: `eproc:${l.prazo_fim}` } });
  }
  return out;
}

// ── alterações sugeridas no cadastro (anexo) ─────────────────────
const RA_FOROS = { '0001': /santana|regional i\b/i, '0002': /santo amaro|regional ii\b/i, '0003': /jabaquara|regional iii\b/i, '0004': /lapa|regional iv\b/i,
  '0005': /s[aã]o miguel|regional v\b/i, '0006': /penha|regional vi\b/i, '0007': /itaquera|regional vii\b/i, '0008': /tatuap|regional viii\b/i,
  '0009': /vila prudente|regional ix\b/i, '0010': /ipiranga|regional x\b/i, '0011': /pinheiros|regional xi\b/i, '0100': /central|jo[aã]o mendes/i };
const RA_FORO_NOME = { '0001': 'Foro Regional I - Santana', '0002': 'Foro Regional II - Santo Amaro', '0003': 'Foro Regional III - Jabaquara', '0004': 'Foro Regional IV - Lapa',
  '0005': 'Foro Regional V - São Miguel Paulista', '0006': 'Foro Regional VI - Penha de França', '0007': 'Foro Regional VII - Itaquera', '0008': 'Foro Regional VIII - Tatuapé',
  '0009': 'Foro Regional IX - Vila Prudente', '0010': 'Foro Regional X - Ipiranga', '0011': 'Foro Regional XI - Pinheiros', '0100': 'Foro Central Cível' };

function raAlteracoes(dados, itens) {
  const alt = [], add = (numero, acao, campo, atual, novo, motivo) => alt.push({ numero, acao, campo, atual, novo, motivo });
  const porNum = {};
  dados.todos.forEach(p => { const n = raNum(p.numero); if (n) (porNum[n] = porNum[n] || []).push(p); });
  const escopo = new Set(dados.ativos.map(p => raNum(p.numero)).filter(Boolean));
  for (const [n, ps] of Object.entries(porNum)) {
    if (ps.length < 2 || !escopo.has(n)) continue;
    const resp = [...new Set(ps.map(p => p.responsavel?.nome || '—'))];
    if (resp.length > 1) add(raMask(n), 'conferir', 'advogado', resp.join(' e '), 'Definir responsável (ou manter os dois no mesmo registro)', 'Processo cadastrado em mais de uma carteira');
    else add(raMask(n), 'excluir duplicata', 'registro', `${ps.length} registros de ${resp[0]} (${ps.map(p => p.status === 'encerrado' ? 'encerrado' : 'ativo').join(', ')})`, '1 registro', 'Processo cadastrado em duplicidade');
  }
  for (const p of dados.ativos) if (!raNum(p.numero)) add(p.numero || '(sem número)', 'conferir', 'número', p.numero || '—', 'Número CNJ completo (20 dígitos)', 'Número fora do padrão CNJ: as consultas automáticas não acham o processo');
  for (const it of itens) {
    const p = it.p; if (p.naoCadastrado) continue;
    const foro = it.num.slice(16);
    if (it.cat === 'arquivado' && it.definitivo) add(raMask(it.num), 'atualizar', 'status', 'Em andamento', 'Encerrado', it.situacao);
    else if (it.cat === 'arquivado' && !/arquiv|suspen/i.test(p.fase || '')) add(raMask(it.num), 'atualizar', 'fase', p.fase || '—', /suspen/i.test(it.situacao) ? 'Suspenso' : /acordo/i.test(it.situacao) ? 'Acordo homologado (acompanhar cumprimento)' : 'Arquivado provisoriamente', it.situacao);
    if (RA_FOROS[foro] && p.vara && Object.entries(RA_FOROS).some(([k, rx]) => k !== foro && rx.test(p.vara)) && !RA_FOROS[foro].test(p.vara))
      add(raMask(it.num), 'conferir', 'vara', p.vara, `Conferir (código de foro ${foro} = ${RA_FORO_NOME[foro]})`, 'Vara incompatível com o número do processo');
    if (it.orgao && RX.segGrau.test(it.orgao) && !raSemAcento(p.vara).includes(raSemAcento(it.orgao).slice(0, 12)))
      add(raMask(it.num), 'atualizar', 'vara/órgão', p.vara || '—', it.orgao, 'Órgão atual no TJSP (processo em grau de recurso)');
  }
  // publicações recentes para as advogadas em processos que não estão no portal
  const noPortal = new Set(Object.keys(porNum));
  const vistos = new Set();
  for (const it of dados.djen) {
    const n = it.numero_processo;
    if (!n || noPortal.has(n) || vistos.has(n) || it.siglaTribunal !== 'TJSP' || it.data_disponibilizacao < raSoma(dados.ref, -30) || it.data_disponibilizacao > dados.ref) continue;
    vistos.add(n);
    add(raMask(n), 'incluir', 'processo', '—', `${it.siglaTribunal || ''} · ${it.nomeOrgao || ''}${it._oabNome ? ' · responsável: ' + it._oabNome : ''}`, `Publicação no DJEN em ${raBr(it.data_disponibilizacao)} (${it.tipoDocumento || it.tipoComunicacao || 'intimação'}${it.nomeClasse ? ', ' + raCorta(it.nomeClasse.toLowerCase(), 40) : ''}) e o processo não está no portal`);
  }
  for (const it of itens.filter(x => x.p.naoCadastrado)) add(raMask(it.num), 'incluir', 'processo', '—', `${it.orgao || ''}${it.p.responsavel?.nome ? ' · responsável: ' + it.p.responsavel.nome : ''}`, 'Tem prazo em aberto no eproc e não está cadastrado no portal');
  return alt;
}

// ── montagem ─────────────────────────────────────────────────────
function raMontar(dados) {
  const vistos = {};
  const unicos = dados.ativos.filter(p => {
    const n = raNum(p.numero); if (!n) return true;
    if (vistos[n]) { const nome = p.responsavel?.nome; if (nome && !vistos[n]._resp.includes(nome)) vistos[n]._resp.push(nome); return false; }
    vistos[n] = p; p._resp = [p.responsavel?.nome].filter(Boolean); return true;
  });
  const itens = unicos.map(p => raClassificar(p, dados)).concat(raNaoCadastradosEproc(dados));
  itens.forEach(i => { if (i.p._resp && i.p._resp.length > 1) i.respTexto = i.p._resp.join(' / '); });
  const ordem = { urgente: 0, parado: 1, regular: 2, arquivado: 3, pendente: 4 };
  itens.sort((a, b) => ordem[a.cat] - ordem[b.cat] || (b.dias ?? -1) - (a.dias ?? -1));
  const cont = { urgente: 0, parado: 0, regular: 0, arquivado: 0, pendente: 0 };
  itens.forEach(i => cont[i.cat]++);
  return { ref: dados.ref, advogado: dados.advogado, carteiras: dados.carteiras, fontes: dados.fontes, itens, cont, alteracoes: raAlteracoes(dados, itens), emitido: new Date() };
}

// ── HTML do relatório (tela e PDF) ───────────────────────────────
const RA_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const RA_CSS = `
.ra-doc{font-family:'DejaVu Sans',Arial,Helvetica,sans-serif;color:#1f2937;font-size:10.5px;line-height:1.38;background:#fff}
.ra-doc h1{font-size:21px;color:#13294b;margin:0 0 4px;line-height:1.2}
.ra-doc .ra-sub{color:#6b7280;font-size:10.5px;margin-bottom:12px}
.ra-doc .ra-lead{background:#eef1f6;border-left:4px solid #13294b;padding:9px 12px;margin-bottom:12px;font-size:11px}
.ra-doc .ra-cards{display:flex;gap:8px;margin-bottom:16px}
.ra-doc .ra-card{flex:1;border:1px solid #d6dbe3;border-radius:6px;padding:8px 10px}
.ra-doc .ra-card b{display:block;font-size:19px;color:#13294b}
.ra-doc .ra-card.urg b{color:#b42318}
.ra-doc h2{font-size:14px;color:#13294b;border-bottom:2px solid #13294b;padding-bottom:3px;margin:16px 0 3px}
.ra-doc h2 small{color:#6b7280;font-weight:normal}
.ra-doc .ra-nota{color:#6b7280;font-size:9.5px;margin-bottom:4px}
.ra-doc table{width:100%;border-collapse:collapse;table-layout:fixed}
.ra-doc th{background:#13294b;color:#fff;text-align:left;padding:5px 6px;font-size:10px}
.ra-doc table.urg th{background:#8b1a1a}
.ra-doc td{padding:6px;border-bottom:1px solid #d6dbe3;vertical-align:top;word-wrap:break-word}
.ra-doc tr:nth-child(even) td{background:#f7f8fa}
.ra-doc .ra-num{font-family:'DejaVu Sans Mono',Menlo,Consolas,monospace;font-size:8.7px;white-space:nowrap}
.ra-doc .ra-min{color:#6b7280;font-size:8.8px}
.ra-doc .ra-dias{text-align:right;font-weight:bold}
.ra-doc .ra-nc{color:#b42318;font-weight:bold}
.ra-doc .ra-fim{color:#6b7280;font-size:9px;margin-top:10px}
`;

const raClasseBonita = c => { c = String(c || '').trim(); const L = c.replace(/[^A-Za-zÀ-ÿ]/g, ''); const up = (L.match(/[A-ZÀ-Þ]/g) || []).length; return L && up / L.length > 0.5 ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : c; };
function raLinhaHTML(i) {
  const p = i.p;
  const partes = p.naoCadastrado ? `<span class="ra-nc">Não cadastrado no portal</span>${i.classe ? ' (' + raEsc(i.classe) + ')' : ''}`
    : `${raEsc(p.autor || '—')}${p.reu ? ' x ' + raEsc(p.reu) : ''}`;
  const orgao = i.orgao || p.vara || '';
  return `<tr>
    <td><div class="ra-num">${raEsc(raMask(i.num) || p.numero || '')}</div><div class="ra-min">${raEsc(raClasseBonita(i.classe) || p.fase || p.tipo || '')}</div></td>
    <td>${partes}<div class="ra-min">${raEsc(orgao)}</div><div class="ra-min">Resp.: ${raEsc(i.respTexto || p.responsavel?.nome || '—')}</div></td>
    <td>${raEsc(i.situacao)}</td>
    <td class="ra-dias">${i.dias == null ? '—' : i.dias}</td>
    <td>${raEsc(i.providencia)}</td></tr>`;
}

function raRelatorioHTML(r) {
  const ref = r.ref, mes = RA_MESES[+ref.slice(5, 7) - 1] + '/' + ref.slice(0, 4);
  const cart = (r.advogado ? [r.advogado] : r.carteiras).map(n => n === 'Edna Rebesco' ? 'Dra. Edna Rebesco' : n);
  const cartTxt = cart.length > 1 ? cart.slice(0, -1).join(', ') + ' e ' + cart[cart.length - 1] : cart[0] || '—';
  const total = r.itens.length;
  const sec = (cat, titulo, nota, urg) => {
    const l = r.itens.filter(i => i.cat === cat);
    if (!l.length) return '';
    return `<h2>${titulo} <small>(${l.length})</small></h2><div class="ra-nota">${nota}</div>
      <table class="${urg ? 'urg' : ''}"><colgroup><col style="width:22%"><col style="width:19%"><col style="width:33%"><col style="width:5%"><col style="width:21%"></colgroup>
      <thead><tr><th>Processo</th><th>Partes / Órgão</th><th>Situação e motivo</th><th style="text-align:right">Dias</th><th>Providência</th></tr></thead>
      <tbody>${l.map(raLinhaHTML).join('')}</tbody></table>`;
  };
  const anexo = r.alteracoes.length ? `<h2>Anexo — Alterações sugeridas no cadastro do portal <small>(${r.alteracoes.length})</small></h2>
    <table><colgroup><col style="width:4%"><col style="width:19%"><col style="width:11%"><col style="width:10%"><col style="width:16%"><col style="width:18%"><col style="width:22%"></colgroup>
    <thead><tr><th>#</th><th>Processo</th><th>Ação</th><th>Campo</th><th>Valor atual</th><th>Novo valor</th><th>Motivo</th></tr></thead>
    <tbody>${r.alteracoes.map((a, k) => `<tr><td>${k + 1}</td><td class="ra-num">${raEsc(a.numero)}</td><td>${raEsc(a.acao)}</td><td>${raEsc(a.campo)}</td><td>${raEsc(a.atual)}</td><td><b>${raEsc(a.novo)}</b></td><td>${raEsc(a.motivo)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="ra-doc"><style>${RA_CSS}</style>
    <h1>Andamentos processuais — ${mes} (unificado, e-SAJ + eproc)</h1>
    <div class="ra-sub">NovaSP Jurídico · Carteira${cart.length > 1 ? 's' : ''}: ${raEsc(cartTxt)} · referência ${raBr(ref)} · emitido em ${r.emitido.toLocaleString('pt-BR')}</div>
    <div class="ra-lead">${total} processos analisados. <b>${r.cont.urgente} exige${r.cont.urgente === 1 ? '' : 'm'} providência imediata do escritório.</b> ${r.cont.parado} ${r.cont.parado === 1 ? 'está parado' : 'estão parados'} há mais de ${RA.LIMITE_PARADO} dias aguardando o juízo; ${r.cont.pendente} não ${r.cont.pendente === 1 ? 'pôde' : 'puderam'} ser consultado${r.cont.pendente === 1 ? '' : 's'} automaticamente.</div>
    <div class="ra-cards">
      <div class="ra-card urg"><b>${r.cont.urgente}</b>urgentes</div><div class="ra-card"><b>${r.cont.parado}</b>parados &gt;${RA.LIMITE_PARADO} dias</div>
      <div class="ra-card"><b>${r.cont.regular}</b>regulares</div><div class="ra-card"><b>${r.cont.arquivado}</b>arquivados/encerrados</div><div class="ra-card"><b>${r.cont.pendente}</b>pendentes</div></div>
    ${sec('urgente', '1. Providências urgentes', 'O juízo intimou o escritório a agir; há risco de arquivamento ou preclusão.', true)}
    ${sec('parado', '2. Parados aguardando o juízo, o cartório ou o tribunal', `Sem movimentação há mais de ${RA.LIMITE_PARADO} dias; a pendência não é do escritório.`)}
    ${sec('regular', '3. Em andamento regular', 'Movimentação recente.')}
    ${sec('arquivado', '4. Arquivados, suspensos ou encerrados', 'Sem movimentação por estarem arquivados ou encerrados; os provisórios podem ser reativados.')}
    ${sec('pendente', '5. Pendentes de consulta', 'Nenhuma fonte automática trouxe movimentação: conferir no tribunal.')}
    ${anexo}
    <div class="ra-fim">Fontes: DJEN/CNJ (${raEsc(r.fontes.djen)}), consulta pública e-SAJ/TJSP 1º grau (${raEsc(r.fontes.esaj)}), DataJud/CNJ (sincronização diária do portal) e planilhas do eproc enviadas pelas advogadas (${raEsc(r.fontes.eproc)}).
    "Dias" = dias corridos desde a última movimentação (ou desde o ato que motivou a urgência) até a data de referência. Relatório gerado automaticamente; confirme nos autos antes de peticionar.</div>
  </div>`;
}

// ── PDF (html2pdf no navegador) ──────────────────────────────────
function raCarregarScript(src) {
  return new Promise((ok, falha) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => falha(new Error('não carregou ' + src)); document.head.appendChild(s); });
}
async function raPdfBlob(html) {
  await raCarregarScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;background:#fff';
  box.innerHTML = html;
  document.body.appendChild(box);
  try {
    const worker = html2pdf().set({ margin: [10, 9, 13, 9], image: { type: 'jpeg', quality: 0.85 }, html2canvas: { scale: 1.6, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2', '.ra-cards', '.ra-lead'] } }).from(box.firstElementChild).toPdf();
    const pdf = await worker.get('pdf');
    const n = pdf.internal.getNumberOfPages();
    for (let k = 1; k <= n; k++) {
      pdf.setPage(k); pdf.setFontSize(8); pdf.setTextColor(110);
      pdf.text(`NovaSP Jurídico · Relatório de andamentos processuais · página ${k} de ${n}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 6, { align: 'center' });
    }
    return pdf.output('blob');
  } finally { box.remove(); }
}

// ── lançamentos na aba Prazos ────────────────────────────────────
async function raLancarPrazos(r) {
  const linhas = r.itens.filter(i => i.cat === 'urgente' && i.prazo && i.prazo.venc).map(i => {
    let respId = i.p.responsavel_id || null;
    if (!respId && i.p.responsavel?.nome) { const u = r.itens.find(x => x.p.responsavel?.nome === i.p.responsavel.nome && x.p.responsavel_id); respId = u ? u.p.responsavel_id : null; }
    return { processo_id: i.p.id || null, referencia: raMask(i.num), tipo: raCorta(i.providencia, 140), modulo: 'judicial', responsavel_id: respId, vencimento: i.prazo.venc, concluido: false,
             observacoes: raCorta(i.situacao, 600), origem: 'relatorio_andamentos', chave_automatica: `ra:${i.num}:${i.prazo.chave}`, origem_data: i.prazo.origem,
             regra_calculo: i.prazo.regra, status_conferencia: 'a_conferir' };
  });
  if (!linhas.length) return 0;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/prazos?on_conflict=chave_automatica`, { method: 'POST',
    headers: Object.assign({}, DB_HEADERS, { Prefer: 'resolution=ignore-duplicates,return=representation' }), body: JSON.stringify(linhas) });
  if (!resp.ok) throw new Error('Prazos: ' + (await resp.text()).slice(0, 200));
  return (await resp.json()).length;
}

// ── tela: relatório ──────────────────────────────────────────────
RA.log = function (msg, substitui) {
  const el = document.getElementById('ra-log'); if (!el) return;
  if (substitui && el.lastElementChild && el.lastElementChild.dataset.prog) el.lastElementChild.textContent = msg;
  else { const d = document.createElement('div'); d.textContent = msg; if (substitui) d.dataset.prog = '1'; el.appendChild(d); }
  el.scrollTop = el.scrollHeight;
};

RA.abrirRelatorio = function () {
  const adv = document.getElementById('filtro-processo-adv')?.value || '';
  document.getElementById('ra-carteira').textContent = adv || 'Todas as carteiras';
  document.getElementById('ra-ref').value = raIsoDe(new Date());
  document.getElementById('ra-log').innerHTML = '';
  document.getElementById('ra-preview').innerHTML = '';
  document.getElementById('ra-acoes').style.display = 'none';
  RA.ultimo = null;
  openModal('modal-relatorio-andamentos');
  RA.historico();
};

RA.gerar = async function () {
  const btn = document.getElementById('ra-gerar');
  const adv = document.getElementById('filtro-processo-adv')?.value || '';
  const ref = document.getElementById('ra-ref').value || raIsoDe(new Date());
  const consultar = document.getElementById('ra-consultar').checked;
  btn.disabled = true; btn.textContent = 'Gerando…';
  document.getElementById('ra-log').innerHTML = '';
  document.getElementById('ra-preview').innerHTML = '';
  document.getElementById('ra-acoes').style.display = 'none';
  try {
    const dados = await raColetar({ ref, advogado: adv, consultar }, RA.log);
    if (consultar && dados.djen.length) { const n = await raGravarDjen(dados); if (n) RA.log(`${n} publicações novas do DJEN gravadas no histórico dos processos.`); }
    const r = raMontar(dados);
    RA.ultimo = r;
    RA.log(`Pronto: ${r.cont.urgente} urgentes, ${r.cont.parado} parados, ${r.cont.regular} regulares, ${r.cont.arquivado} arquivados, ${r.cont.pendente} pendentes · ${r.alteracoes.length} alterações sugeridas.`);
    document.getElementById('ra-preview').innerHTML = raRelatorioHTML(r);
    document.getElementById('ra-acoes').style.display = 'flex';
  } catch (e) {
    RA.log('⚠️ ' + (e.message || e));
  } finally { btn.disabled = false; btn.textContent = 'Gerar relatório'; }
};

RA.emitir = async function () {
  const r = RA.ultimo; if (!r) return;
  const btn = document.getElementById('ra-emitir');
  btn.disabled = true; btn.textContent = 'Gerando PDF…';
  try {
    const blob = await raPdfBlob(raRelatorioHTML(r));
    const nome = `andamentos-${r.ref}${r.advogado ? '-' + raSemAcento(r.advogado).replace(/\W+/g, '-') : ''}.pdf`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    btn.textContent = 'Salvando…';
    const caminho = `${r.ref.slice(0, 7)}/${Date.now()}-${nome}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/relatorios-andamentos/${caminho}`, { method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: DB_HEADERS.Authorization, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: blob });
    let novos = 0, erroPrazos = null;
    try { novos = await raLancarPrazos(r); } catch (e) { erroPrazos = e.message; }
    await db.insert('relatorios_andamentos', { emitido_por: currentUser?.id || null, advogado: r.advogado || null, referencia: r.ref, pdf_path: up.ok ? caminho : null,
      resumo: { analisados: r.itens.length, urgentes: r.cont.urgente, parados: r.cont.parado, regulares: r.cont.regular, arquivados: r.cont.arquivado, pendentes: r.cont.pendente,
                alteracoes: r.alteracoes.length, prazos_novos: novos, fontes: r.fontes } });
    showToast(`📑 Relatório emitido${up.ok ? ' e salvo no histórico' : ' (o PDF não foi salvo no histórico)'} · ${novos} lançamento${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'} na aba Prazos (A conferir)`);
    if (erroPrazos) RA.log('⚠️ Lançamentos na aba Prazos: ' + erroPrazos);
    RA.historico();
    if (typeof carregarPrazos === 'function') carregarPrazos();
  } catch (e) { RA.log('⚠️ PDF: ' + (e.message || e)); }
  finally { btn.disabled = false; btn.textContent = '⬇️ Emitir PDF (salva no histórico e lança os urgentes em Prazos)'; }
};

RA.historico = async function () {
  const el = document.getElementById('ra-historico'); if (!el) return;
  let h = [];
  try { h = await raBuscar('relatorios_andamentos', '?select=id,emitido_em,advogado,referencia,resumo,pdf_path,quem:usuarios(nome)&order=emitido_em.desc&limit=8'); } catch (_) {}
  el.innerHTML = h.length ? h.map(x => `<div class="flex justify-between items-center" style="padding:6px 0;border-bottom:1px solid var(--gray-100)">
      <div class="text-xs"><b>${raBr(x.referencia)}</b> · ${raEsc(x.advogado || 'todas as carteiras')} · ${x.resumo ? `${x.resumo.urgentes} urgentes, ${x.resumo.analisados} processos` : ''}
      <span class="text-gray">· ${new Date(x.emitido_em).toLocaleString('pt-BR')} · ${raEsc((x.quem?.nome || '').split(' ')[0])}</span></div>
      ${x.pdf_path ? `<button class="btn btn-xs btn-outline" onclick="RA.baixarHistorico('${raEsc(x.pdf_path)}')">⬇️ PDF</button>` : ''}</div>`).join('')
    : '<div class="text-xs text-gray">Nenhum relatório emitido ainda.</div>';
};

RA.baixarHistorico = async function (caminho) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/relatorios-andamentos/${caminho}`, { method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: DB_HEADERS.Authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.signedURL) { showToast('⚠️ Não consegui abrir o PDF do histórico.'); return; }
  window.open(`${SUPABASE_URL}/storage/v1${j.signedURL}`, '_blank');
};

// ── tela: planilhas do eproc ─────────────────────────────────────
const RA_COLS = [
  ['numero', /^(n[ºo°.]*\s*(do\s*)?)?processo|n[uú]mero/],
  ['prazo_fim', /(data|prazo).*(final|fim|t[eé]rmino|vencimento)|^fim|vencimento|^final/],
  ['prazo_inicio', /(data|prazo).*(in[ií]cio|inicial)|^in[ií]cio/],
  ['data_evento', /data.*(evento|intima|movimen|expedi|ci[eê]ncia|disponibiliza)|^data$/],
  ['evento', /evento|descri|movimenta|ato|teor/],
  ['situacao', /situa|status|localizador/],
  ['classe', /classe/],
  ['orgao', /[oó]rg[aã]o|ju[ií]zo|vara|unidade/],
  ['atendido', /atendid|cumprid|resposta|respondid|peti[cç][aã]o/],
  ['prazo_dias', /^prazo$|dias|prazo \(dias\)/]
];
function raDataPlanilha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return raIsoDe(v);
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
  const s = String(v); const br = raIsoBr(s); if (br) return br;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/); return iso ? iso[0] : null;
}
function raLerPlanilha(wb) {
  const linhas = [];
  for (const nomeAba of wb.SheetNames) {
    const m = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
    let hi = -1, mapa = {};
    for (let i = 0; i < Math.min(m.length, 25); i++) {
      const cab = m[i].map(c => raSemAcento(String(c)).trim());
      const mp = {};
      cab.forEach((c, k) => { if (!c) return; for (const [campo, rx] of RA_COLS) if (mp[campo] == null && rx.test(c)) { mp[campo] = k; break; } });
      if (mp.numero != null && Object.keys(mp).length >= 2) { hi = i; mapa = mp; break; }
    }
    for (let i = hi + 1; i < m.length; i++) {
      const row = m[i]; if (!row || !row.some(c => String(c).trim())) continue;
      const tudo = row.join(' ');
      const num = raNum((hi >= 0 && row[mapa.numero]) || (tudo.match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/) || [])[0]);
      if (!num) continue;
      const g = c => (mapa[c] != null ? row[mapa[c]] : '');
      const l = { numero: num, evento: String(g('evento') || '').trim().slice(0, 400) || null, situacao: String(g('situacao') || '').trim().slice(0, 120) || null,
                  classe: String(g('classe') || '').trim().slice(0, 120) || null, orgao: String(g('orgao') || '').trim().slice(0, 160) || null,
                  data_evento: raDataPlanilha(g('data_evento')), prazo_inicio: raDataPlanilha(g('prazo_inicio')), prazo_fim: raDataPlanilha(g('prazo_fim')) };
      // prazo numa célula só: "de 10/09/2026 a 30/09/2026"
      if (!l.prazo_fim) { const ds = (String(g('prazo_dias')) + ' ' + String(g('evento'))).match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{4})/); if (ds) { l.prazo_inicio = raIsoBr(ds[1]); l.prazo_fim = raIsoBr(ds[2]); } }
      const at = g('atendido'); if (at !== '' && at != null) l.atendido = raDataPlanilha(at) || (/sim|atendid|cumprid|s$/i.test(String(at)) ? 'sim' : null);
      linhas.push(l);
    }
  }
  return linhas;
}

RA.abrirPlanilhas = function () {
  const sel = document.getElementById('ra-eproc-adv');
  const adv = document.getElementById('filtro-processo-adv')?.value || currentUser?.name || '';
  sel.innerHTML = Object.keys(RA.OAB).concat(['Rodrigo Falcão Vaz', 'Durval Falcão Vaz', 'Janaina Alves']).map(n => `<option ${n === adv ? 'selected' : ''}>${raEsc(n)}</option>`).join('');
  document.getElementById('ra-eproc-arq').value = '';
  document.getElementById('ra-eproc-res').innerHTML = '';
  document.getElementById('ra-eproc-salvar').style.display = 'none';
  RA._planilha = null;
  openModal('modal-planilhas-eproc');
};

RA.lerArquivosEproc = async function (input) {
  const res = document.getElementById('ra-eproc-res');
  const arquivos = [...(input.files || [])];
  if (!arquivos.length) return;
  res.innerHTML = '<div class="text-xs text-gray">Lendo…</div>';
  try {
    await raCarregarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    let linhas = [];
    for (const f of arquivos) {
      const buf = await f.arrayBuffer();
      const wb = /\.csv$/i.test(f.name) ? XLSX.read(new TextDecoder(/utf-?8/i.test(f.type) ? 'utf-8' : 'utf-8').decode(buf), { type: 'string', raw: true, FS: ';' }) : XLSX.read(buf, { type: 'array', cellDates: true });
      linhas = linhas.concat(raLerPlanilha(wb));
    }
    if (!linhas.length) { res.innerHTML = '<div class="text-xs" style="color:var(--red)">Não encontrei processos nesta planilha. Ela precisa ter uma coluna com o número do processo. Se puder, mande o arquivo para o Rodrigo ajustar a leitura.</div>'; return; }
    const ref = raIsoDe(new Date());
    const procs = await raBuscar('processos', '?select=numero,status&limit=2000');
    const noPortal = new Set(procs.map(p => raNum(p.numero)).filter(Boolean));
    const abertos = linhas.filter(l => l.prazo_fim && l.prazo_fim >= ref && !l.atendido).sort((a, b) => a.prazo_fim.localeCompare(b.prazo_fim));
    const vencendo = abertos.filter(l => raDias(ref, l.prazo_fim) <= 5);
    const naoCad = [...new Set(linhas.map(l => l.numero).filter(n => !noPortal.has(n)))];
    const linhaP = l => `<tr><td class="ra-num" style="font-family:monospace;font-size:11px">${raMask(l.numero)}${noPortal.has(l.numero) ? '' : ' <span class="badge badge-red" style="font-size:9px">não cadastrado</span>'}</td><td class="text-xs">${raBr(l.prazo_fim)}${raDias(ref, l.prazo_fim) === 0 ? ' <b style="color:var(--red)">hoje</b>' : ` (${raDias(ref, l.prazo_fim)} dias)`}</td><td class="text-xs">${raEsc(raCorta(l.evento || l.situacao || '', 90))}</td></tr>`;
    RA._planilha = { linhas, nome: arquivos.map(f => f.name).join(', '), resumo: { linhas: linhas.length, processos: new Set(linhas.map(l => l.numero)).size, prazos_abertos: abertos.length, vencendo_5_dias: vencendo.length, nao_cadastrados: naoCad.length } };
    res.innerHTML = `<div class="text-sm" style="margin:8px 0"><b>${RA._planilha.resumo.processos}</b> processos · <b>${abertos.length}</b> prazos em aberto · <b style="color:var(--red)">${vencendo.length}</b> vencendo em até 5 dias · <b>${naoCad.length}</b> não cadastrados no portal</div>
      ${vencendo.length ? `<div class="font-semibold text-sm" style="margin-top:10px">Prazos vencendo (até 5 dias)</div><table style="width:100%">${vencendo.map(linhaP).join('')}</table>` : ''}
      ${abertos.length > vencendo.length ? `<div class="font-semibold text-sm" style="margin-top:10px">Demais prazos em aberto</div><table style="width:100%">${abertos.filter(l => !vencendo.includes(l)).map(linhaP).join('')}</table>` : ''}
      ${naoCad.length ? `<div class="font-semibold text-sm" style="margin-top:10px">Processos não cadastrados no portal</div><div class="text-xs" style="font-family:monospace">${naoCad.map(raMask).join('<br>')}</div>` : ''}
      ${!linhas.some(l => l.prazo_fim) ? '<div class="text-xs" style="color:var(--amber,#b45309);margin-top:8px">A planilha não tem coluna de data final do prazo; ela entra no relatório só como último evento.</div>' : ''}`;
    document.getElementById('ra-eproc-salvar').style.display = 'inline-flex';
  } catch (e) { res.innerHTML = `<div class="text-xs" style="color:var(--red)">Não consegui ler o arquivo: ${raEsc(e.message || e)}</div>`; }
};

RA.salvarPlanilha = async function () {
  if (!RA._planilha) return;
  const adv = document.getElementById('ra-eproc-adv').value;
  const r = await db.insert('planilhas_eproc', { enviado_por: currentUser?.id || null, advogado: adv, nome_arquivo: RA._planilha.nome, linhas: RA._planilha.linhas, resumo: RA._planilha.resumo });
  if (!r) { showToast('⚠️ Não salvou: ' + (db.lastError || '').slice(0, 120)); return; }
  showToast(`📤 Planilha do eproc salva (${RA._planilha.resumo.processos} processos). Ela entra nos relatórios dos próximos 10 dias.`);
  closeModal('modal-planilhas-eproc');
};

// ── aba Prazos: conferência dos lançamentos automáticos ──────────
RA.confirmarPrazo = async function (id) {
  await db.update('prazos', id, { status_conferencia: 'confirmado' });
  showToast('✅ Prazo confirmado.');
  if (typeof carregarPrazos === 'function') carregarPrazos();
};
RA.descartarPrazo = async function (id) {
  if (!confirm('Descartar este lançamento automático? Ele não volta a ser lançado, mesmo que o relatório seja emitido de novo.')) return;
  await db.update('prazos', id, { status_conferencia: 'descartado', concluido: true });   // concluido: some de todas as listas de prazos abertos
  showToast('Lançamento descartado.');
  if (typeof carregarPrazos === 'function') carregarPrazos();
};

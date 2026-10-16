// Consulta pública do e-SAJ (TJSP, 1º grau) para o Relatório de andamentos (16/10/2026).
// O navegador não consegue ler o e-SAJ direto (o tribunal não libera CORS), então a tela do jurídico pede aqui,
// UM processo por chamada e com intervalo entre as chamadas (cuidado pedido pela Fernanda: não sobrecarregar o TJSP).
//
// Entrada: POST {numero, token}. Confere o login (token do portal) e se a pessoa é do jurídico (RPC eh_juridico).
// Saída: {numero, encontrado, situacao, classe, vara, foro, juiz, movimentos:[{data,titulo,texto}]}; grava a mesma
// coisa em andamentos_tjsp (service_role) para o relatório e para a consulta de madrugada.
// Processos do eproc (número começando com 4) e do 2º grau (foro 0000) não estão no e-SAJ: a tela nem pede.

const ESAJ = 'https://esaj.tjsp.jus.br/cpopg';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const PAGINAS_MOV = 4;                     // 5 movimentações por página no e-SAJ → até 20

const json = (status, obj) => ({ statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', ordm: 'º', ordf: 'ª', sect: '§', deg: '°', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…' };
function texto(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&([a-z]+);/gi, (m, n) => {
      if (ENT[n] != null) return ENT[n];
      const acento = { acute: '́', grave: '̀', tilde: '̃', circ: '̂', cedil: '̧', uml: '̈' };
      const k = Object.keys(acento).find(s => n.endsWith(s));
      return k ? (n.slice(0, -k.length) + acento[k]).normalize('NFC') : m;
    })
    .replace(/\s+/g, ' ').trim();
}
const isoBr = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

// fetch com cookies e redirecionamento manual (o e-SAJ só devolve as movimentações para a sessão que abriu o processo)
async function navegar(url, jar, saltos = 5) {
  for (let i = 0; i <= saltos; i++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    let r;
    try {
      r = await fetch(url, { redirect: 'manual', signal: ctrl.signal,
        headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
    } finally { clearTimeout(t); }
    const cookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie()
      : String(r.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+=)/).filter(Boolean);
    for (const c of cookies) { const m = c.match(/^([^=;\s]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url).toString(); continue; }
    return { url, status: r.status, html: await r.text() };
  }
  throw new Error('redirecionamentos demais');
}

function movimentos(html) {
  const out = [];
  const re = /<tr[^>]*containerMovimentacao[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    const data = isoBr((m[1].match(/class="dataMovimentacao"[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
    const desc = (m[1].match(/class="descricaoMovimentacao"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '';
    const partes = desc.split(/<span[^>]*font-style:\s*italic[^>]*>/i);
    const titulo = texto(partes[0]);
    const det = texto(partes.slice(1).join(' '));
    if (data && titulo) out.push({ data, titulo, texto: det.slice(0, 1500) });
  }
  return out;
}

async function consultar(numero) {
  const mask = `${numero.slice(0, 7)}-${numero.slice(7, 9)}.${numero.slice(9, 13)}.${numero.slice(13, 14)}.${numero.slice(14, 16)}.${numero.slice(16)}`;
  const jar = {};
  const q = new URLSearchParams({ conversationId: '', cbPesquisa: 'NUMPROC', numeroDigitoAnoUnificado: mask.slice(0, 15), foroNumeroUnificado: numero.slice(16),
    'dadosConsulta.valorConsultaNuUnificado': mask, 'dadosConsulta.tipoNuProcesso': 'UNIFICADO' });
  let pg = await navegar(`${ESAJ}/search.do?${q}`, jar);
  if (/N[ãa]o existem informa[çc][õo]es/i.test(pg.html)) return { encontrado: false, movimentos: [] };
  if (!/processo\.codigo=/.test(pg.url)) {                          // lista de resultados: abre o primeiro
    const link = (pg.html.match(/href="([^"]*show\.do\?processo\.codigo=[^"]+)"/) || [])[1];
    if (!link) return { encontrado: false, movimentos: [], erro: 'e-SAJ não abriu o processo' };
    pg = await navegar(new URL(link.replace(/&amp;/g, '&'), `${ESAJ}/`).toString(), jar);
  }
  const campo = (id) => { const m = pg.html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</`)); return m ? texto(m[1]) : null; };
  const situacao = [...pg.html.matchAll(/id="labelSituacaoProcesso"[^>]*>([^<]*)</g)].map(x => texto(x[1])).filter(Boolean);
  const codigo = (pg.url.match(/processo\.codigo=([^&]+)/) || [])[1];
  let movs = [];
  if (codigo) {
    let cursor = null;
    for (let i = 0; i < PAGINAS_MOV; i++) {
      const r = await navegar(`${ESAJ}/carregarMovimentacoesAjax.do?processo.codigo=${encodeURIComponent(codigo)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, jar);
      movs = movs.concat(movimentos(r.html));
      cursor = (r.html.match(/cursorMovimentacoesPaginado"[^>]*value="([^"]+)"/) || r.html.match(/trCursorMovimentacoes"[^>]*data-cursor="([^"]+)"/) || [])[1];
      if (!cursor) break;
      await new Promise(ok => setTimeout(ok, 250));
    }
  }
  return { encontrado: true, situacao: [...new Set(situacao)].join(', ') || null, classe: campo('classeProcesso'), vara: campo('varaProcesso'),
           foro: campo('foroProcesso'), juiz: campo('juizProcesso'), movimentos: movs };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'use POST' });
  const sbUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const service = process.env.SUPABASE_KEY || '';
  const anon = process.env.SUPABASE_ANON_KEY || service;
  let input; try { input = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { erro: 'pedido inválido' }); }
  const numero = String(input.numero || '').replace(/\D/g, '');
  const token = String(input.token || '');
  if (numero.length !== 20 || !token) return json(400, { erro: 'número ou sessão faltando' });

  // só o jurídico (com o token da própria pessoa: a função eh_juridico() decide)
  let pode = false;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/eh_juridico`, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    pode = r.status === 200 && (await r.json()) === true;
  } catch (_) {}
  if (!pode) return json(403, { erro: 'Sessão vencida ou sem acesso ao jurídico. Saia e entre de novo pelo portal.' });

  let res;
  try { res = await consultar(numero); }
  catch (e) { res = { encontrado: null, movimentos: [], erro: 'e-SAJ não respondeu: ' + (e.name === 'AbortError' ? 'tempo esgotado' : e.message) }; }

  const linha = { numero, fonte: 'esaj', consultado_em: new Date().toISOString(), encontrado: res.encontrado, situacao: res.situacao || null, classe: res.classe || null,
                  vara: res.vara || null, foro: res.foro || null, juiz: res.juiz || null, movimentos: res.movimentos || [], erro: res.erro || null };
  if (service) {
    try {
      await fetch(`${sbUrl}/rest/v1/andamentos_tjsp?on_conflict=numero`, { method: 'POST',
        headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(linha) });
    } catch (e) { console.error('[tjsp-esaj] gravar', e.message); }
  }
  return json(200, linha);
};

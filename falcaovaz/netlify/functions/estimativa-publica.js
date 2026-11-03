// ESTIMATIVA PÚBLICA para o "Avalie seu imóvel" do site novasaopaulo.com.br (01/11/2026; handoff da sessão do site).
// O site chama servidor a servidor, depois que o proprietário deixa nome, celular e e-mail (esses dados NÃO chegam aqui).
// Faz a mesma conta da Avaliação do portal — o NÚCLEO ÚNICO nsp-avalia-core.js (o mesmo do NSP Intelligence) — sem a tela
// e sem os ajustes manuais do corretor, e devolve a faixa. Comparáveis só em lista anonimizada (02/11/2026); nada de
// número, R$/m² ou método (regra comercial do Rodrigo + LGPD). Cada pedido fica em aval_site_estimativa (sem dado pessoal) com um "ref" para o corretor.
//
// POST /.netlify/functions/estimativa-publica   Header: X-Site-Key: <AVAL_SITE_KEY>
// Body: { tipo, rua, numero, cep?, bairro?, lat?, lng?, area_util?, area_terreno?, quartos?, vagas?, estado? }
// 200: { ok:true, min, max, confianca:'alta'|'media'|'baixa', ref, comparaveis:[…até 8, anonimizados], base?:{n_anuncios,n_vendas,raio_m,vendas_desde} }  ·  { ok:false, motivo }
//
// Anúncios: os da carteira Nova SP por perto (cópia diária do Imoview) + vendas reais do ITBI. O motor ao vivo dos portais
// (Render) fica de fora: exige login de usuário do portal e leva 30–60 s para acordar, mais que o tempo de espera do site.

const crypto = require('crypto');
const SB = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
const NUCLEO_URL = 'https://nspintel.netlify.app/nsp-avalia-core.js';
const NUCLEO_MIN = '2026-10-26.1';
const LIMITE_MIN = 30;                 // pedidos por minuto (todos os clientes somados)
const TIPOS = ['Apartamento', 'Cobertura', 'Studio', 'Casa térrea', 'Sobrado', 'Casa de vila', 'Casa em condomínio', 'Terreno', 'Comercial'];

const json = (st, o) => ({ statusCode: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });

// núcleo: a versão publicada (fonte única); se o site do Intelligence estiver fora ou mais velho, a cópia que vai junto
let _nucleo = null, _nucleoEm = 0;
async function nucleo() {
  if (_nucleo && Date.now() - _nucleoEm < 5 * 60000) return _nucleo;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(NUCLEO_URL, { signal: ctrl.signal }); clearTimeout(t);
    if (r.ok) {
      const m = await import('data:text/javascript;base64,' + Buffer.from(await r.text()).toString('base64'));
      if (String(m.VERSAO || '') >= NUCLEO_MIN) { _nucleo = m; _nucleoEm = Date.now(); return m; }
    }
  } catch (_) {}
  if (!_nucleo) _nucleo = await import('../nucleo/nsp-avalia-core.mjs');
  _nucleoEm = Date.now();
  return _nucleo;
}

async function rpc(key, fn, args, base) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${base || SB}/rest/v1/rpc/${fn}`, { method: 'POST', signal: ctrl.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; } finally { clearTimeout(t); }
}
const um = x => Array.isArray(x) ? (x[0] || null) : x;

// Endereço → ponto, na MESMA ordem da tela de Avaliação do portal (02/11/2026): (1) cadastro do IPTU → centro da quadra fiscal,
// (2) vendas do ITBI geolocalizadas, (3) base local, (4) OpenStreetMap (com o nome digitado e com o nome corrigido pelo IPTU).
// (o cadastro do IPTU está no próprio banco do portal desde 03/11/2026)
const TIPO_RUA = { R: 'Rua', AV: 'Avenida', AL: 'Alameda', TV: 'Travessa', PC: 'Praça', PCA: 'Praça', ESTR: 'Estrada', LGO: 'Largo', VL: 'Viela', PSG: 'Passagem' };
const nomeRuaIptu = lg => { const m = String(lg || '').trim().match(/^(\S+)\s+(.*)$/); if (!m) return lg; return (TIPO_RUA[m[1].toUpperCase()] || m[1]) + ' ' + m[2]; };
async function osm(q) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&bounded=1&viewbox=-46.90,-23.35,-46.35,-24.00&q=' + encodeURIComponent(q);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'NovaSaoPaulo-estimativa/1.0 (novasaopaulo.com.br)' } });
    const o = um(await r.json()); return o && o.lat ? { lat: +o.lat, lng: +o.lon } : null;
  } catch (_) { return null; } finally { clearTimeout(t); }
}
async function localizar(key, rua, num, bairro) {
  let ruasIptu = [];
  if (num) try {
    ruasIptu = (await rpc(key, 'iptu_ruas', { p_logradouro: rua, p_numero: num, p_lim: 4 })) || [];
    const r = ruasIptu.find(x => x.tem_numero && x.sim >= 0.5);
    if (r) {
      const rows = (await rpc(key, 'iptu_por_rua', { p_logradouro_norm: r.logradouro_norm, p_numero: num, p_lim: 3 })) || [];
      const h = rows[0] && rows[0].sql ? um(await rpc(key, 'aval_quadra_ponto', { p_sql: rows[0].sql })) : null;
      if (h && h.lat) return { lat: +h.lat, lng: +h.lng };
    }
  } catch (_) {}
  const g = um(await rpc(key, 'aval_geocode_endereco', { p_rua: rua, p_numero: num || '' }))
         || um(await rpc(key, 'aval_geocode', { p_q: [rua, num].filter(Boolean).join(' ') }));
  if (g && g.lat) return { lat: +g.lat, lng: +g.lng };
  const o = await osm([rua + (num ? ', ' + num : ''), bairro, 'São Paulo', 'SP'].filter(Boolean).join(', '));
  if (o) return o;
  for (const r of ruasIptu.filter(x => x.tem_numero || x.sim >= 0.6).slice(0, 2)) {
    const c = await osm(`${nomeRuaIptu(r.logradouro)}${num ? ', ' + num : ''}, São Paulo, SP`); if (c) return c;
  }
  return null;
}
const coord = v => { const n = Number(v); return v != null && v !== '' && isFinite(n) && n !== 0 ? n : null; };
const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

function confianca(r) {
  const mu = r.metodo_unico || {}, ev = r.evolutivo || {};
  const div = x => x == null ? 999 : Math.abs(x);
  switch (r.regra) {
    case 'metodo_unico':
      if ((mu.n_anuncio || 0) >= 5 && (mu.n_itbi || 0) >= 5 && div(mu.divergencia) <= 20) return 'alta';
      return ((mu.n_anuncio || 0) >= 3 || (mu.n_itbi || 0) >= 3) ? 'media' : 'baixa';
    case 'casa_calibrada': return (ev.comparativo && div(ev.divergencia) <= 20) ? 'alta' : 'media';
    case 'terreno': return r.lote_local ? (r.lote_local.n >= 8 ? 'alta' : 'media') : 'baixa';
    case 'media_comparativo_evolutivo': return 'media';
    default: return 'baixa';           // comercial, evolutivo sem comparação, sem ajuste
  }
}

// COMPARÁVEIS ANONIMIZADOS (Rodrigo, 02/11/2026: o proprietário vê a lista na tela e no e-mail do site).
// Só os que entraram na conta, até 8, mais perto primeiro. Sai SÓ: origem, rua (sem número), distância (50 m), área, dorm., vagas,
// mês e valor (R$ 10 mil). Nunca: número, unidade, nomes, código/link do anúncio, SQL, R$/m², mediana ou o texto do método.
const ABREV = { R: 'Rua', AV: 'Avenida', AL: 'Alameda', TV: 'Travessa', PC: 'Praça', PCA: 'Praça', ESTR: 'Estrada', LGO: 'Largo', VL: 'Viela', PSG: 'Passagem',
  BRIG: 'Brigadeiro', STA: 'Santa', STO: 'Santo', S: 'São', PROF: 'Professor', PROFA: 'Professora', DR: 'Doutor', DRA: 'Doutora', GAL: 'General', GEN: 'General',
  CEL: 'Coronel', ENG: 'Engenheiro', PE: 'Padre', MAL: 'Marechal', DES: 'Desembargador', CONS: 'Conselheiro', CAP: 'Capitão', TEN: 'Tenente', VISC: 'Visconde',
  BR: 'Barão', CDE: 'Conde', MQ: 'Marquês', PRES: 'Presidente', SEN: 'Senador', DEP: 'Deputado', MIN: 'Ministro', GOV: 'Governador', ALM: 'Almirante',
  COM: 'Comendador', MONS: 'Monsenhor', D: 'Dom', MAJ: 'Major', SGT: 'Sargento', VER: 'Vereador', JD: 'Jardim', PQ: 'Parque', VIL: 'Vila' };
const MIN_PALAVRA = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
function ruaLimpa(x) {
  const t = String(x || '').split(',')[0].replace(/\s+(n[º°o.]*|nº)\s*\d.*$/i, '').replace(/\s+\d+[a-z]?\s*$/i, '').trim();   // sem número nem complemento
  return t.split(/\s+/).filter(Boolean).map((w, i) => { const u = w.toUpperCase().replace(/\.$/, ''); if (ABREV[u]) return ABREV[u];
    const l = w.toLowerCase(); return i && MIN_PALAVRA.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join(' ');
}
const arred = (v, passo) => (v == null || !isFinite(Number(v))) ? null : Math.round(Number(v) / passo) * passo;
function listaComparaveis(r, sel, grupo, nsp, areaRef) {
  const vazio = { comparaveis: [], base: null };
  if (grupo === 'com') return vazio;                       // comercial usa referência residencial: não mostra como "comparável"
  const ev = r.evolutivo || {};
  const usaComps = r.regra === 'metodo_unico' || r.regra === 'media_comparativo_evolutivo' || r.regra === 'sem_ajuste'
    || (r.regra === 'casa_calibrada' && ev.comparativo) || (r.regra === 'terreno' && r.lote_local);
  if (!usaComps) return vazio;
  const mesNsp = {}; (nsp || []).forEach(n => { if (n.ref && n.carregado_em) mesNsp[n.ref] = String(n.carregado_em).slice(0, 7); });
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);
  const anuncios = sel.amostraTodos.filter(a => !a.excluido && !a.manual && a.rs_m2 > 0).map(a => ({ origem: 'anuncio', rua: ruaLimpa(a.rua), dist_m: a.dist_m,
    rs: Number(a.rs_m2), chave: 'a|' + ruaLimpa(a.rua).toLowerCase() + '|' + Math.round(Number(a.area)),
    area: Math.round(Number(a.area)) || null, dorm: a.dorm || null, vagas: a.vaga || null, mes: mesNsp[a.ref] || hoje, valor: Number(a.preco) }));
  const vendas = sel.compsItbi.filter(c => !c.excluido && c.rs_util > 0).map(c => ({ origem: 'venda', rua: ruaLimpa(c.logradouro), dist_m: c.dist_m,
    rs: Number(c.rs_util), chave: 'v|' + (c.logradouro || '') + '|' + (c.numero || ''),
    area: Math.round(grupo === 'terreno' ? Number(c.area_terreno) : Number(c.area_util_est)) || null, dorm: null, vagas: null,
    mes: c.data ? String(c.data).slice(0, 7) : null, valor: Number(c.valor) }));
  const todos = [...anuncios, ...vendas].filter(x => x.rua && x.valor > 0);
  const dists = todos.map(x => Number(x.dist_m)).filter(d => d >= 0);
  const meses = vendas.map(v => v.mes).filter(Boolean).sort();
  const base = { n_anuncios: anuncios.length, n_vendas: vendas.length, raio_m: dists.length ? Math.ceil(Math.max(...dists) / 100) * 100 : null, vendas_desde: meses[0] || null };
  // QUAIS 8 MOSTRAR (02/11/2026, caso Rua 13 de Maio): a conta usa a amostra inteira (mediana), mas a lista que o proprietário vê
  // prioriza os parecidos — tamanho até ±25% do dele primeiro, no máximo 2 do mesmo prédio/endereço, até 3 anúncios garantidos, e sem os fora da curva
  // (R$/m² além de 1,5× da mediana da própria fonte, que a mediana já praticamente ignora). Todos os mostrados entraram na conta.
  const medRs = {}; ['venda', 'anuncio'].forEach(o => { const v = todos.filter(x => x.origem === o && x.rs > 0).map(x => x.rs).sort((a, b) => a - b);
    medRs[o] = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; });
  const naCurva = x => !medRs[x.origem] || !(x.rs > 0) || (x.rs >= medRs[x.origem] / 1.5 && x.rs <= medRs[x.origem] * 1.5);
  const parecido = x => areaRef && x.area ? Math.abs(x.area / areaRef - 1) <= 0.25 : false;
  const porDist = (x, y) => (x.dist_m == null) - (y.dist_m == null) || (x.dist_m || 0) - (y.dist_m || 0);
  const noPredio = {}, escolhidos = [];
  const ordem = [...todos.filter(naCurva)].sort((x, y) => (parecido(y) - parecido(x)) || porDist(x, y));
  const pega = (lista, max) => lista.forEach(x => { if (escolhidos.length >= max || escolhidos.includes(x)) return; const k = x.chave;
    if ((noPredio[k] || 0) >= 2) return; noPredio[k] = (noPredio[k] || 0) + 1; escolhidos.push(x); });
  pega(ordem.filter(x => x.origem === 'anuncio'), 3);     // até 3 anúncios garantidos (o e-mail cita as duas fontes)
  pega(ordem, 8);
  const comparaveis = escolhidos.sort(porDist)
    .map(x => { const o = { origem: x.origem, rua: x.rua, dist_m: arred(x.dist_m, 50), mes: x.mes, valor: arred(x.valor, 10000) };
      if (x.area) o.area = x.area; if (x.dorm) o.dorm = x.dorm; if (x.vagas) o.vagas = x.vagas; return o; });
  return { comparaveis, base };
}

exports.handler = async (event) => {
  // diagnóstico da chave (02/11/2026): mostra só o tamanho e 6 caracteres do SHA-256 — não revela a chave
  if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).diag === '1') {
    const k = String(process.env.AVAL_SITE_KEY || '').trim();
    return json(200, { configurada: !!k, tamanho: k.length, impressao: k ? crypto.createHash('sha256').update(k).digest('hex').slice(0, 6) : null });
  }
  if (event.httpMethod !== 'POST') return json(405, { ok: false, motivo: 'use_post' });
  const segredo = String(process.env.AVAL_SITE_KEY || '').trim(), key = process.env.SUPABASE_KEY || '';   // trim: valor colado com quebra de linha
  const enviado = String((event.headers || {})['x-site-key'] || '').trim();
  const a = Buffer.from(enviado), b = Buffer.from(segredo);
  if (!segredo || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json(401, { ok: false, motivo: 'nao_autorizado' });
  if (!key) return json(500, { ok: false, motivo: 'configuracao' });
  const H = { apikey: key, Authorization: 'Bearer ' + key };

  // limite simples: pedidos do último minuto
  try {
    const desde = new Date(Date.now() - 60000).toISOString();
    const r = await fetch(`${SB}/rest/v1/aval_site_estimativa?select=ref&criado_em=gte.${encodeURIComponent(desde)}`, { method: 'HEAD', headers: Object.assign({ Prefer: 'count=exact' }, H) });
    const n = Number(((r.headers.get('content-range') || '').split('/')[1]) || 0);
    if (n >= LIMITE_MIN) return json(429, { ok: false, motivo: 'muitos_pedidos' });
  } catch (_) {}

  let e; try { e = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { ok: false, motivo: 'pedido_invalido' }); }
  const tipo = TIPOS.includes(e.tipo) ? e.tipo : null;
  if (!tipo) return json(400, { ok: false, motivo: 'tipo_invalido' });
  const entrada = { tipo, rua: String(e.rua || '').slice(0, 120), numero: String(e.numero || '').slice(0, 12), cep: String(e.cep || '').replace(/\D/g, '').slice(0, 8) || null,
    bairro: String(e.bairro || '').slice(0, 80) || null, lat: coord(e.lat), lng: coord(e.lng),
    area_util: num(e.area_util), area_terreno: num(e.area_terreno), quartos: num(e.quartos), vagas: num(e.vagas), estado: ['novo', 'bom', 'regular', 'reforma'].includes(e.estado) ? e.estado : 'bom' };
  const ref = 'est-' + new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex');
  const post = (o) => fetch(`${SB}/rest/v1/aval_site_estimativa`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H),
    body: JSON.stringify(Object.assign({ ref, entrada }, o)) });
  const grava = async (o) => {   // se as colunas comparaveis/base ainda não existirem no banco, grava sem elas
    try { const r = await post(o); if (!r.ok && ('comparaveis' in o)) { const { comparaveis, base, ...resto } = o; await post(resto); } } catch (_) {}
  };
  const falha = async (motivo) => { await grava({ ok: false, motivo }); return json(200, { ok: false, motivo }); };

  try {
    const A = await nucleo();
    const grupo = A.tipoGrupo(tipo);
    // ponto: o pino do cliente; sem pino, o endereço
    let lat = entrada.lat, lng = entrada.lng;
    if (!(lat && lng) && entrada.rua) {
      const g = await localizar(key, entrada.rua, entrada.numero, entrada.bairro);
      if (g) { lat = g.lat; lng = g.lng; }
    }
    if (!(lat && lng)) return await falha('sem_endereco');
    const geo = um(await rpc(key, 'aval_geo', { p_lat: lat, p_lng: lng })) || {};
    const bairro = entrada.bairro || (geo.distrito ? A.cap(String(geo.distrito).toLowerCase()) : '');
    if (!bairro && !geo.zona) return await falha('fora_da_area');

    const [nsp, comps, tlocal] = await Promise.all([
      rpc(key, 'aval_anuncios_nsp_perto', { p_lat: lat, p_lng: lng, p_grupo: grupo === 'terreno' ? 'terreno' : (A.ehCasa(tipo) ? 'casa' : 'apto'), p_lim: 30 }),
      grupo === 'terreno' ? rpc(key, 'aval_comps_itbi_terreno_raio', { p_lat: lat, p_lng: lng, p_lim: 20 })
                          : rpc(key, 'aval_comps_itbi_raio', { p_lat: lat, p_lng: lng, p_tipo: A.ehCasa(tipo) ? 'casa' : 'apto', p_lim: 40 }),
      grupo === 'casa' ? rpc(key, 'aval_terreno_local', { p_lat: lat, p_lng: lng }) : null
    ]);
    let compsItbi = comps || [];
    if (!compsItbi.length && grupo !== 'terreno' && bairro) compsItbi = (await rpc(key, 'aval_comps_itbi', { p_bairro: bairro, p_lim: 20 })) || [];

    const inp = { tipo, bairro: bairro || 'São Paulo', rua: entrada.rua, numero: entrada.numero, numeros_predio: [entrada.numero],
      area: entrada.area_util, terreno: entrada.area_terreno, dorm: entrada.quartos, vaga: entrada.vagas,
      padrao: A.padraoSugerido(bairro), estado: entrada.estado, usar_predio: false, usar_comparativo: false };
    const dados = { precos: {}, semMotor: true, nsp: nsp || [], compsItbi, geo, tlocal: um(tlocal), excl: [], manuais: [] };
    const sel = A.selecionarComparaveis(inp, dados);
    A.ordenarAmostra(sel.amostraTodos);
    const r = A.calcularValor(inp, sel, dados);
    if (!r.ok || !r.faixa_min || !r.faixa_max) return await falha(r.versao ? 'poucos_dados' : (r.erro && /Informe|área/i.test(r.erro) ? 'dados_incompletos' : 'poucos_dados'));
    const conf = confianca(r);
    let lista = { comparaveis: [], base: null };
    try { lista = listaComparaveis(r, sel, grupo, nsp, grupo === 'terreno' ? entrada.area_terreno : entrada.area_util); } catch (err) { console.error('[estimativa-publica] comparaveis', err && err.message); }
    await grava({ ok: true, faixa_min: r.faixa_min, faixa_max: r.faixa_max, valor: r.valor_mercado, confianca: conf, regra: r.regra || null, nucleo: r.versao || null,
      comparaveis: lista.comparaveis, base: lista.base });
    const resp = { ok: true, min: r.faixa_min, max: r.faixa_max, confianca: conf, ref, comparaveis: lista.comparaveis };
    if (lista.base) resp.base = lista.base;
    return json(200, resp);
  } catch (err) {
    console.error('[estimativa-publica]', err && err.message);
    return await falha('erro_interno');
  }
};

// ESTIMATIVA PÚBLICA para o "Avalie seu imóvel" do site novasaopaulo.com.br (01/11/2026; handoff da sessão do site).
// O site chama servidor a servidor, depois que o proprietário deixa nome, celular e e-mail (esses dados NÃO chegam aqui).
// Faz a mesma conta da Avaliação do portal — o NÚCLEO ÚNICO nsp-avalia-core.js (o mesmo do NSP Intelligence) — sem a tela
// e sem os ajustes manuais do corretor, e devolve SÓ a faixa. Nada de comparáveis, endereços, R$/m² ou método (regra
// comercial do Rodrigo + LGPD). Cada pedido fica em aval_site_estimativa (sem dado pessoal) com um "ref" para o corretor.
//
// POST /.netlify/functions/estimativa-publica   Header: X-Site-Key: <AVAL_SITE_KEY>
// Body: { tipo, rua, numero, cep?, bairro?, lat?, lng?, area_util?, area_terreno?, quartos?, vagas?, estado? }
// 200: { ok:true, min, max, confianca:'alta'|'media'|'baixa', ref }  ·  { ok:false, motivo }
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

async function rpc(key, fn, args) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', signal: ctrl.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; } finally { clearTimeout(t); }
}
const um = x => Array.isArray(x) ? (x[0] || null) : x;
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

exports.handler = async (event) => {
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
  const grava = (o) => fetch(`${SB}/rest/v1/aval_site_estimativa`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H),
    body: JSON.stringify(Object.assign({ ref, entrada }, o)) }).catch(() => {});
  const falha = async (motivo) => { await grava({ ok: false, motivo }); return json(200, { ok: false, motivo }); };

  try {
    const A = await nucleo();
    const grupo = A.tipoGrupo(tipo);
    // ponto: o pino do cliente; sem pino, o endereço
    let lat = entrada.lat, lng = entrada.lng;
    if (!(lat && lng) && entrada.rua) {
      const g = um(await rpc(key, 'aval_geocode_endereco', { p_rua: entrada.rua, p_numero: entrada.numero || '' }))
             || um(await rpc(key, 'aval_geocode', { p_q: [entrada.rua, entrada.numero, entrada.bairro].filter(Boolean).join(' ') }));
      if (g && g.lat) { lat = Number(g.lat); lng = Number(g.lng); }
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
    await grava({ ok: true, faixa_min: r.faixa_min, faixa_max: r.faixa_max, valor: r.valor_mercado, confianca: conf, regra: r.regra || null, nucleo: r.versao || null });
    return json(200, { ok: true, min: r.faixa_min, max: r.faixa_max, confianca: conf, ref });
  } catch (err) {
    console.error('[estimativa-publica]', err && err.message);
    return await falha('erro_interno');
  }
};

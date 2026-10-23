// Agenda do portal no celular (23/10/2026): calendário .ics de assinatura, um por pessoa.
// GET /.netlify/functions/agenda-ics?t=<token>  (o token vem do portal, RPC agenda_feed_token)
// Monta só os compromissos daquela pessoa, com as MESMAS regras da tela de Agenda do portal (07-agenda.js / 08-pauta.js):
//   · eventos de agenda_eventos em que ela é responsável/participante (casamento de nome igual ao filtro da tela)
//   · compromissos "Pessoal" só do dono · marcadores [CANCELADA:tipo] e tipo "cancelamento" não entram
//   · reuniões "Reunião Adm"/"Reunião Jurídico" só na 4ª da semana certa (intercalação quinzenal)
//   · reuniões fixas da pauta (Mkt 3ª, Adm/Jurídico 4ª, 1:1 de 5ª) de que ela participa, menos as canceladas na semana
// Horário de São Paulo (UTC−3, sem horário de verão). Só leitura.

const SB = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
const PASSADO_DIAS = 30, FUTURO_DIAS = 180;

// ── reuniões fixas: cópia de PAUTA_CFG / PAUTA_PARTICIPANTES (portal/js/08-pauta.js) — manter iguais ──
const FIXAS = {
  terca:      { dow: 2, hora: '15:00', lb: 'Reunião Mkt',            quinzenal: false, part: ['Rodrigo Falcão Vaz', 'Thais', 'Anderson'] },
  quarta:     { dow: 3, hora: '11:00', lb: 'Reunião Adm',            quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Vivian', 'Nogueira', 'João Marcos'] },
  juridico:   { dow: 3, hora: '11:00', lb: 'Reunião Jurídico',       quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Fernanda Araujo', 'Renata Navarro', 'Edna Rebesco', 'Durval Falcão Vaz', 'Janaina Alves'] },
  felippe:    { dow: 4, hora: '10:00', lb: '1:1 Felippe',            quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Felippe'] },
  emilia:     { dow: 4, hora: '11:00', lb: '1:1 Emilia',             quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Emilia'] },
  renata:     { dow: 4, hora: '10:00', lb: '1:1 Renata (Moema)',     quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Renata Navarro'] },
  christiane: { dow: 4, hora: '11:00', lb: '1:1 Christiane',         quinzenal: true,  part: ['Rodrigo Falcão Vaz', 'Christiane'] }
};
const SEMANA_MS = 6048e5;
// O portal roda no fuso do navegador (−3); a função roda em UTC. Para a paridade sair igual, a conta usa a meia-noite de SP.
function paridadeSP(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const seg = new Date(Date.UTC(y, m - 1, d)); const dy = seg.getUTCDay() || 7; seg.setUTCDate(seg.getUTCDate() - dy + 1);
  return Math.floor((seg.getTime() + 3 * 3600000) / SEMANA_MS) % 2;
}
const PAR_JUR = paridadeSP('2026-06-17'), PAR_5A = paridadeSP('2026-06-25');
const parFixa = { quarta: PAR_JUR ^ 1, juridico: PAR_JUR, felippe: PAR_5A, emilia: PAR_5A, renata: PAR_5A ^ 1, christiane: PAR_5A ^ 1 };

// ── nomes: mesmo casamento do filtro "participante" da tela ──
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function casaNome(campo, nome) {
  const alvo = norm(nome); if (!alvo) return false;
  const prim = alvo.split(' ')[0], palavras = alvo.split(' ');
  for (const parte of String(campo || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
    const p = norm(parte); if (!p) continue;
    if (p.includes(alvo) || alvo.includes(p)) return true;
    const pp = p.split(' ');
    if (pp[0] === prim) return true;
    if (pp.some(w => w.length >= 4 && palavras.includes(w))) return true;
  }
  return false;
}

// ── iCalendar ──
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
function dobra(l) { const out = []; let s = l; while (Buffer.byteLength(s, 'utf8') > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n), 'utf8') > 74) n--; out.push(s.slice(0, n)); s = ' ' + s.slice(n); } out.push(s); return out.join('\r\n'); }
const hm = h => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? [+m[1], +m[2]] : null; };
function utc(iso, h) { const [y, mo, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1, d, h[0] + 3, h[1])); return t.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; }
const diaIcs = iso => iso.replace(/-/g, '');
const somaDia = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
function vevent(uid, iso, ini, fim, titulo, desc, carimbo) {
  const L = ['BEGIN:VEVENT', `UID:${uid}@novasp-portal`, `DTSTAMP:${carimbo}`];
  const a = hm(ini);
  if (a) {
    let b = hm(fim); if (!b || b[0] * 60 + b[1] <= a[0] * 60 + a[1]) b = [a[0] + 1, a[1]];
    L.push(`DTSTART:${utc(iso, a)}`, `DTEND:${utc(iso, b)}`);
  } else L.push(`DTSTART;VALUE=DATE:${diaIcs(iso)}`, `DTEND;VALUE=DATE:${diaIcs(somaDia(iso, 1))}`);
  L.push(`SUMMARY:${esc(titulo)}`);
  if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
  L.push('END:VEVENT');
  return L.map(dobra).join('\r\n');
}

exports.handler = async (event) => {
  const key = process.env.SUPABASE_KEY;                 // service_role
  const token = String((event.queryStringParameters || {}).t || '').replace(/[^a-f0-9]/gi, '');
  const txt = (st, m) => ({ statusCode: st, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: m });
  if (!key) return txt(500, 'configuração ausente');
  if (token.length < 32) return txt(404, 'link inválido');
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const get = async (p) => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: h }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

  let feed;
  try { [feed] = await get(`agenda_feed?token=eq.${token}&revogado_em=is.null&select=usuario_id,usuario:usuarios(nome,ativo)`); }
  catch (e) { return txt(502, 'erro ao ler o banco'); }
  if (!feed || !feed.usuario || feed.usuario.ativo === false) return txt(404, 'link inválido ou renovado — gere um novo na Agenda do portal');
  const nome = feed.usuario.nome;
  fetch(`${SB}/rest/v1/agenda_feed?token=eq.${token}`, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, h), body: JSON.stringify({ ultimo_uso: new Date().toISOString() }) }).catch(() => {});

  const hojeSP = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const ini = somaDia(hojeSP, -PASSADO_DIAS), fim = somaDia(hojeSP, FUTURO_DIAS);
  let evs = [];
  try { evs = await get(`agenda_eventos?data=gte.${ini}&data=lte.${fim}&select=id,titulo,data,hora_inicio,hora_fim,tipo,responsavel,descricao&order=data.asc&limit=5000`); }
  catch (e) { return txt(502, 'erro ao ler a agenda'); }

  const carimbo = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const saida = [], cancel = {}, vistos = new Set();
  for (const e of evs) {
    const tit = String(e.titulo || '');
    const m = tit.match(/^\[CANCELADA:([a-z]+)\]/);
    if (m) { cancel[e.data + '|' + m[1]] = true; continue; }
    if (/^cancelamento$/i.test(e.tipo || '')) continue;
    const tipo = String(e.tipo || '').toLowerCase();
    if (tipo === 'pessoal') { if (!norm(e.responsavel).includes(norm(nome))) continue; }
    else if (!casaNome(e.responsavel, nome)) continue;
    const junto = norm([e.titulo, e.tipo, e.descricao].filter(Boolean).join(' '));
    if (junto.includes('reuniao terca') || junto.includes('reuniao quarta')) continue;          // reuniões legadas ocultas na tela
    const cat = /jur[ií]d/i.test(e.tipo || '') ? 'juridico' : (/\badm\b|administrativ/i.test(e.tipo || '') ? 'adm' : null);
    if (cat && new Date(e.data + 'T12:00:00Z').getUTCDay() === 3) {
      const p = paridadeSP(e.data); if ((cat === 'juridico' && p !== PAR_JUR) || (cat === 'adm' && p !== (PAR_JUR ^ 1))) continue;
    }
    const k = `${e.data}|${tit.trim().toLowerCase()}|${String(e.hora_inicio || '').slice(0, 5)}|${String(e.hora_fim || '').slice(0, 5)}`;
    if (vistos.has(k)) continue; vistos.add(k);
    const desc = [e.descricao, tipo === 'pessoal' ? '' : (e.responsavel ? 'Participantes: ' + e.responsavel : '')].filter(Boolean).join('\n');
    saida.push(vevent('ev-' + e.id, e.data, e.hora_inicio, e.hora_fim, (tipo === 'pessoal' ? '🔒 ' : '') + tit, desc, carimbo));
  }
  // reuniões fixas de que a pessoa participa
  for (let d = ini; d <= fim; d = somaDia(d, 1)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    for (const [tipo, c] of Object.entries(FIXAS)) {
      if (c.dow !== dow) continue;
      if (c.quinzenal && parFixa[tipo] !== paridadeSP(d)) continue;
      if (!c.part.some(p => casaNome(p, nome) || casaNome(nome, p))) continue;
      if (cancel[d + '|' + tipo]) continue;
      saida.push(vevent(`fixa-${tipo}-${d}`, d, c.hora, null, c.lb, 'Reunião fixa da pauta · Participantes: ' + c.part.join(', '), carimbo));
    }
  }

  const corpo = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nova Sao Paulo//Agenda do portal//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    dobra(`X-WR-CALNAME:${esc('Agenda NovaSP — ' + nome.split(' ')[0])}`), 'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M']
    .concat(saida).concat(['END:VCALENDAR']).join('\r\n') + '\r\n';
  return { statusCode: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="agenda-novasp.ics"', 'Cache-Control': 'no-store' }, body: corpo };
};

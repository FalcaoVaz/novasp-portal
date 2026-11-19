// Fotos do Acervo Nido (19/11/2026). As fotos do backup do NIDO (06/11/2026) ficam só no Skybox, em pacotes zip;
// a tabela nido_fotos diz onde cada uma está. Esta função lê SÓ os bytes daquela foto (Range) e devolve a imagem.
// Chamada pelo portal (js/20-acervo-nido.js) com o login de quem consulta:
//   GET /.netlify/functions/nido-foto?ref=MO19108&o=3   (Authorization: Bearer <token do portal>)
// A consulta a nido_fotos usa o token da pessoa, então vale a regra do Acervo (nido_pode_ler): sem acesso = 404.
// Variáveis no Netlify: SKYBOX_TOKEN (link SOMENTE LEITURA da pasta "backup NIDO 2026-11-06"), SUPABASE_URL, SUPABASE_ANON_KEY.
const zlib = require('zlib');

const ORIGENS = ['https://novasp.netlify.app'];
const cors = o => ({ 'Access-Control-Allow-Origin': ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+--novasp\.netlify\.app$/.test(o || '') ? o : ORIGENS[0],
  'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, apikey', 'Vary': 'Origin' });
const RAIZ = 'backup NIDO 2026-11-06';
const tipo = b => b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
  : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : 'application/octet-stream';

exports.handler = async (event) => {
  const H = cors((event.headers || {}).origin);
  const erro = (s, m) => ({ statusCode: s, headers: { ...H, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: m });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'GET') return erro(405, 'método');
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const anon = process.env.SUPABASE_ANON_KEY || '', sky = process.env.SKYBOX_TOKEN || '';
  if (!anon || !sky) return erro(503, 'configuracao');
  const q = event.queryStringParameters || {};
  const ref = String(q.ref || ''), o = parseInt(q.o, 10);
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(ref) || !(o >= 1 && o <= 32000)) return erro(400, 'parametros');
  const auth = (event.headers || {}).authorization || '';
  if (!/^Bearer [\w.-]{20,}$/.test(auth)) return erro(401, 'login');

  // 1) onde está a foto — com o login da pessoa (RLS nido_pode_ler)
  let f;
  try {
    const r = await fetch(`${sb}/rest/v1/nido_fotos?select=pacote,off,tam,metodo&ref=eq.${encodeURIComponent(ref)}&ordem=eq.${o}&limit=1`,
      { headers: { apikey: anon, Authorization: auth } });
    if (r.status === 401) return erro(401, 'login');
    [f] = r.ok ? await r.json() : [];
  } catch (e) { console.error('[nido-foto] banco', e.message); return erro(502, 'banco'); }
  if (!f) return erro(404, 'nao encontrada');

  // 2) só os bytes da foto dentro do pacote (cabeçalho local de 30 bytes + nome + extra + dados)
  const pac = `fotos/fotos-${String(f.pacote).padStart(4, '0')}.zip`;
  const ini = Number(f.off), fim = ini + 30 + 1024 + Number(f.tam);
  let b;
  try {
    const r = await fetch('https://skybox.skymail.net.br/public.php/webdav/' + encodeURIComponent(RAIZ) + '/' + pac.split('/').map(encodeURIComponent).join('/'),
      { headers: { Authorization: 'Basic ' + Buffer.from(sky + ':').toString('base64'), 'X-Requested-With': 'XMLHttpRequest', Range: `bytes=${ini}-${fim}` } });
    if (r.status !== 206) throw new Error('skybox ' + r.status);
    b = Buffer.from(await r.arrayBuffer());
  } catch (e) { console.error('[nido-foto]', e.message); return erro(502, 'skybox'); }
  if (b.readUInt32LE(0) !== 0x04034b50) return erro(502, 'zip');
  const ini2 = 30 + b.readUInt16LE(26) + b.readUInt16LE(28);
  let dados = b.subarray(ini2, ini2 + Number(f.tam));
  if (Number(f.metodo) === 8) dados = zlib.inflateRawSync(dados);
  return { statusCode: 200, isBase64Encoded: true, body: dados.toString('base64'),
    headers: { ...H, 'Content-Type': tipo(dados), 'Cache-Control': 'private, max-age=604800', 'X-Robots-Tag': 'noindex' } };
};

// Avisos por e-mail do PORTAL, sem Apps Script (21/11/2026 — etapa 2 da saída do Apps Script).
// Saem de avisos@novasaopaulo.com.br pelo Resend; as respostas vão para quem cuida do assunto (não para o Rodrigo).
// Chamada pelo portal com o login de quem age:
//   POST /.netlify/functions/enviar-aviso  {tipo:'manutencao', protocolo, titulo, mensagem}   (Authorization: Bearer <token>)
// Segurança: o destinatário NUNCA vem do navegador. A função lê o chamado no banco COM o token da pessoa (RLS do portal);
// se a pessoa não enxerga o chamado, nada é enviado. O texto é montado aqui (o navegador só manda título/mensagem).
// Variáveis: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
const ORIGENS = ['https://novasp.netlify.app'];
const cors = o => ({ 'Access-Control-Allow-Origin': ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+--novasp\.netlify\.app$/.test(o || '') ? o : ORIGENS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REMETENTE = 'Nova São Paulo Imobiliária <avisos@novasaopaulo.com.br>';

// quem recebe cópia e respostas, por assunto
const ROTAS = {
  manutencao: { replyTo: ['contato@novasaopaulo.com.br', 'joao@novasaopaulo.com.br'], cc: ['joao@novasaopaulo.com.br'] },
  chaves:     { replyTo: ['entrega.chaves@novasaopaulo.com.br', 'joao@novasaopaulo.com.br'], cc: ['joao@novasaopaulo.com.br'] },
};
const CONSULTA = 'https://novasp.netlify.app/entregaapp/consulta.html?p=';
const emails = s => [...new Set(String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
const dataBR = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

const htmlBase = corpo => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;max-width:560px">${corpo}
<p style="margin-top:22px">Atenciosamente,<br><b>Nova São Paulo Imobiliária</b></p>
<p style="font-size:12px;color:#64748b">Para falar conosco sobre este assunto, basta responder a este e-mail.</p></div>`;

const MODELOS = {
  async manutencao({ sb, anon, auth, protocolo, titulo, mensagem }) {
    const r = await fetch(`${sb}/rest/v1/manutencao_chamados?select=protocolo,nome,email,tipo_servico,status&protocolo=eq.${encodeURIComponent(protocolo)}&limit=1`,
      { headers: { apikey: anon, Authorization: auth } });
    const [c] = r.ok ? await r.json() : [];
    if (!c) return { erro: 'chamado nao encontrado', status: 404 };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email || '').trim())) return { semEmail: true };
    const novo = /^recebido$/i.test(titulo || '');
    const assunto = novo ? `Chamado ${c.protocolo} recebido - Nova São Paulo` : `Chamado ${c.protocolo} - ${titulo || 'Atualização'}`;
    const corpo = `<p>Olá, ${esc(c.nome)}!</p>` +
      (novo ? '<p>Seu chamado de manutenção foi registrado com sucesso.</p>' : '<p>Seu chamado de manutenção teve uma atualização.</p>') +
      `<p><b>Protocolo:</b> ${esc(c.protocolo)}<br><b>Serviço:</b> ${esc(c.tipo_servico)}<br><b>${novo ? 'Situação' : 'Etapa'}:</b> ${esc(novo ? 'Aberto' : (titulo || c.status))}</p>` +
      (mensagem ? `<p><b>Mensagem da equipe:</b><br>${esc(mensagem).replace(/\n/g, '<br>')}</p>` : '') +
      (novo ? '<p>Nossa equipe entrará em contato em breve para agendar o atendimento.</p>' : '');
    return { para: [String(c.email).trim()], assunto, html: htmlBase(corpo) };
  },
};

// Entrega de chaves (23/11/2026): modelo = cadastro | etapa | vistoria | orcamentos
MODELOS.chaves = async ({ sb, anon, auth, protocolo, titulo, mensagem, modelo }) => {
  const r = await fetch(`${sb}/rest/v1/chaves_processos?select=*&protocolo=eq.${encodeURIComponent(protocolo)}&limit=1`, { headers: { apikey: anon, Authorization: auth } });
  const [p] = r.ok ? await r.json() : [];
  if (!p) return { erro: 'processo nao encontrado', status: 404 };
  const loc = emails(p.email_locador), lta = emails(p.email_locatario);
  const link = `<p>Acompanhe o processo a qualquer momento em <a href="${CONSULTA}${encodeURIComponent(p.protocolo)}">${CONSULTA}${esc(p.protocolo)}</a> (protocolo <b>${esc(p.protocolo)}</b>).</p>`;
  const msg = mensagem ? `<p><b>Mensagem da equipe:</b><br>${esc(mensagem).replace(/\n/g, '<br>')}</p>` : '';
  if (modelo === 'orcamentos') {
    if (!loc.length) return { semEmail: true };
    return { para: loc, assunto: `🔧 ${p.protocolo} — Solicitação de 2 orçamentos para reparos`, html: htmlBase(
      `<p>Olá, ${esc(p.locador)}!</p><p>A vistoria do imóvel <b>${esc(p.endereco)}</b> identificou reparos sob responsabilidade do locatário:</p>` +
      `<p>${p.descricao_reparo ? '• ' + esc(p.descricao_reparo) + '<br>' : ''}${p.valor_reparo ? '• Valor estimado: ' + esc(p.valor_reparo) : ''}</p>` +
      '<p>Solicitamos o envio de <b>2 (dois) orçamentos</b> para a cobrança do locatário. Se preferir, a imobiliária pode indicar profissionais (sem responsabilidade pela indicação).</p>') };
  }
  const para = [...new Set(loc.concat(lta))];
  if (!para.length) return { semEmail: true };
  let corpo;
  if (modelo === 'cadastro') corpo = `<p>Olá!</p><p>Foi aberto o processo de entrega das chaves do imóvel <b>${esc(p.endereco)}</b>.</p>` +
    `<p><b>Protocolo:</b> ${esc(p.protocolo)}<br><b>Garantia:</b> ${esc(p.tipo_fianca)}${p.data_agendada ? '<br><b>Entrega prevista:</b> ' + dataBR(p.data_agendada) : ''}</p>`;
  else if (modelo === 'vistoria') corpo = `<p>Olá!</p><p>A vistoria do imóvel <b>${esc(p.endereco)}</b> foi registrada.</p>` +
    `<p><b>Data:</b> ${dataBR(p.data_vistoria)}<br><b>Necessita reparos:</b> ${esc(p.necessita_reparo || 'Não')}` +
    (p.necessita_reparo === 'Sim' ? `${p.descricao_reparo ? '<br><b>Reparos:</b> ' + esc(p.descricao_reparo) : ''}${p.valor_reparo ? '<br><b>Valor estimado:</b> ' + esc(p.valor_reparo) : ''}${p.responsavel_reparo ? '<br><b>Por conta de:</b> ' + esc(p.responsavel_reparo) : ''}` : '') + '</p>';
  else corpo = `<p>Olá!</p><p>O processo de entrega das chaves do imóvel <b>${esc(p.endereco)}</b> teve uma atualização:</p><p><b>Etapa:</b> ${esc(titulo || p.status)}</p>`;
  const assunto = modelo === 'cadastro' ? `🔑 ${p.protocolo} — Processo de entrega de chaves aberto` : modelo === 'vistoria' ? `🔍 ${p.protocolo} — Vistoria realizada` : `🔑 ${p.protocolo} — ${titulo || p.status}`;
  return { para, assunto, html: htmlBase(corpo + msg + link) };
};

exports.handler = async (event) => {
  const H = cors((event.headers || {}).origin);
  const resp = (s, o) => ({ statusCode: s, headers: { ...H, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, erro: 'metodo' });
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const anon = process.env.SUPABASE_ANON_KEY || '', key = process.env.RESEND_API_KEY || '';
  if (!anon || !key) return resp(503, { ok: false, erro: 'configuracao' });
  const auth = (event.headers || {}).authorization || '';
  if (!/^Bearer [\w.-]{20,}$/.test(auth)) return resp(401, { ok: false, erro: 'login' });
  let d; try { d = JSON.parse(event.body || '{}'); } catch (_) { return resp(400, { ok: false, erro: 'dados' }); }
  const tipo = String(d.tipo || ''), modelo = MODELOS[tipo], rota = ROTAS[tipo];
  if (!modelo || !rota) return resp(400, { ok: false, erro: 'tipo' });
  const protocolo = String(d.protocolo || '').slice(0, 60);
  if (!/^[A-Za-z0-9-]{3,60}$/.test(protocolo)) return resp(400, { ok: false, erro: 'protocolo' });

  let m;
  try { m = await modelo({ sb, anon, auth, protocolo, titulo: String(d.titulo || '').slice(0, 120), mensagem: String(d.mensagem || '').slice(0, 4000), modelo: String(d.modelo || '') }); }
  catch (e) { console.error('[enviar-aviso] banco', e.message); return resp(502, { ok: false, erro: 'banco' }); }
  if (m.erro) return resp(m.status || 400, { ok: false, erro: m.erro });
  if (m.semEmail) return resp(200, { ok: true, enviado: false, motivo: 'sem e-mail cadastrado' });

  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMETENTE, to: m.para, cc: rota.cc, reply_to: rota.replyTo, subject: m.assunto, html: m.html }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('[enviar-aviso] resend', r.status, j && j.message); return resp(502, { ok: false, erro: 'envio', detalhe: (j && j.message) || r.status }); }
  return resp(200, { ok: true, enviado: true, id: j.id });
};

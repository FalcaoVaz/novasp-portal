// COBRANÇA — inadimplentes do Imoview para o portal (25/11/2026). Função de FUNDO (até 15 min).
// Disparada a cada 30 min por inadimplencia-sync.js e pelo botão "Atualizar agora" do portal (inadimplencia-agora.js).
// Lê todas as cobranças de LOCATÁRIO vencidas e em aberto (Movimento/RetornarMovimentos, situacaoConta=1) e reescreve
// cobranca_aberto, com o responsável automático:
//   locatário é réu em processo ATIVO do jurídico → judicial, advogado responsável do processo
//   garantia seguro fiança → seguro, João · demais → extrajudicial, Janaína
// Variáveis: IMOVIEW_CHAVE, IMOVIEW_INTEG_EMAIL, IMOVIEW_INTEG_SENHA, SUPABASE_URL, SUPABASE_KEY. Cabeçalho x-sync obrigatório.
const crypto = require('crypto');
const API = 'https://api.imoview.com.br/';
const RESP = { extrajudicial: 'Janaina Alves', seguro: 'João Marcos' };
const PARADA = new Set(['DOS', 'DAS', 'DE', 'DA', 'DO', 'E', 'LTDA', 'EIRELI', 'ME', 'EPP', 'SA', 'S/A']);
const toks = s => new Set(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !PARADA.has(w)));
const num = s => { const t = String(s || '').replace(/[^\d,.-]/g, ''); return Math.abs(parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0); };
const dia = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const brHoje = () => { const x = new Date(Date.now() - 3 * 3600e3); const p = n => String(n).padStart(2, '0'); return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };

let _sess = null;
async function sessao(imv, forcar) {
  if (_sess && !forcar) return _sess;
  const r = await fetch(API + 'Usuario/Integracao_ValidarAcesso', { method: 'POST', headers: { chave: imv, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.IMOVIEW_INTEG_EMAIL, senha: process.env.IMOVIEW_INTEG_SENHA }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.codigoacesso) throw new Error('login de integração: ' + (j.mensagem || r.status));
  _sess = { codigousuario: String(j.codigousuario), codigoacesso: String(j.codigoacesso) };
  return _sess;
}
async function imvGet(imv, rota) {
  for (let t = 0; t < 3; t++) {
    const r = await fetch(API + rota, { headers: { chave: imv, Accept: 'application/json', ...(await sessao(imv, t > 0)) } });
    if (r.status === 401 && t < 2) continue;
    if (!r.ok) throw new Error(rota.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 150));
    return r.json();
  }
}

exports.handler = async (event) => {
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY, imv = process.env.IMOVIEW_CHAVE;
  const tok = key ? crypto.createHash('sha256').update(key + '|inadimplencia').digest('hex') : '';
  if (!event || ((event.headers || {})['x-sync'] || '') !== tok) { console.error('[inadimplencia] sem autorização'); return { statusCode: 401 }; }
  if (!key || !imv || !process.env.IMOVIEW_INTEG_EMAIL || !process.env.IMOVIEW_INTEG_SENHA) { console.error('[inadimplencia] configuracao'); return { statusCode: 503 }; }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const sync = d => fetch(`${sb}/rest/v1/cobranca_sync?id=eq.1`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(d) });
  const inicio = new Date().toISOString();
  await sync({ inicio, situacao: 'atualizando' });
  try {
    // 1) cobranças de locatário vencidas em aberto (até ontem)
    const ontem = (() => { const x = new Date(Date.now() - 3 * 3600e3 - 864e5); const p = n => String(n).padStart(2, '0'); return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; })();
    const movs = [];
    for (let p = 1; p < 400; p++) {
      const d = await imvGet(imv, `Movimento/RetornarMovimentos?numeroPagina=${p}&numeroRegistros=50&situacao=1&situacaoConta=1&dataVencimentoInicial=01/01/2024&dataVencimentoFinal=${ontem}`);
      const l = (d && d.lista) || [];
      movs.push(...l.filter(m => m.tipocliente === 'Locatário' && !m.datapagamento && m.codigocontratoaluguel));
      if (l.length < 50) break;
    }
    // 2) contratos (cópia do Imoview) e processos ativos do jurídico
    const ctrIds = [...new Set(movs.map(m => m.codigocontratoaluguel))];
    const ctr = {};
    for (let i = 0; i < ctrIds.length; i += 300) {
      const r = await fetch(`${sb}/rest/v1/imoview_contratos?select=codigo,codigo_auxiliar,locatario_nome,endereco,garantia&codigo=in.(${ctrIds.slice(i, i + 300).join(',')})`, { headers: H }).then(x => x.json());
      r.forEach(c => { ctr[c.codigo] = c; });
    }
    const procs = await fetch(`${sb}/rest/v1/processos?select=numero,reu,responsavel_id,status&status=eq.ativo`, { headers: H }).then(x => x.json());
    const us = await fetch(`${sb}/rest/v1/usuarios?select=id,nome`, { headers: H }).then(x => x.json());
    const nomeU = id => (us.find(u => u.id === id) || {}).nome || '';
    const procToks = procs.map(p => ({ p, t: toks(p.reu) }));
    const auto = {};
    for (const id of ctrIds) {
      const c = ctr[id] || {}, m0 = movs.find(m => m.codigocontratoaluguel === id) || {};
      const tl = toks(c.locatario_nome || m0.nomecliente);
      const pr = tl.size >= 2 ? procToks.find(({ t }) => [...tl].filter(w => t.has(w)).length >= Math.min(2, tl.size)) : null;
      if (pr) auto[id] = { tipo_auto: 'judicial', responsavel_auto: nomeU(pr.p.responsavel_id) || 'Jurídico', processo_auto: pr.p.numero || '' };
      else if (/seguro/i.test(c.garantia || '')) auto[id] = { tipo_auto: 'seguro', responsavel_auto: RESP.seguro, processo_auto: '' };
      else auto[id] = { tipo_auto: 'extrajudicial', responsavel_auto: RESP.extrajudicial, processo_auto: '' };
    }
    const agora = new Date().toISOString();
    const linhas = movs.map(m => { const c = ctr[m.codigocontratoaluguel] || {};
      return { movimento: m.codigo, contrato: m.codigocontratoaluguel, codigo_auxiliar: c.codigo_auxiliar || '', locatario_codigo: m.codigocliente || null,
        locatario_nome: m.nomecliente || c.locatario_nome || '', endereco: c.endereco || '', garantia: c.garantia || '', vencimento: dia(m.datavencimento),
        valor: num(m.saldo), historico: String(m.historico || '').slice(0, 200), tem_boleto: !!m.temboletoativo, ...auto[m.codigocontratoaluguel], atualizado_em: agora }; })
      .filter(l => l.vencimento);
    // 3) grava (upsert) e apaga o que saiu (foi pago / baixado)
    for (let i = 0; i < linhas.length; i += 500) {
      const w = await fetch(`${sb}/rest/v1/cobranca_aberto?on_conflict=movimento`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(linhas.slice(i, i + 500)) });
      if (!w.ok) throw new Error('gravar ' + w.status + ' ' + (await w.text()).slice(0, 150));
    }
    await fetch(`${sb}/rest/v1/cobranca_aberto?atualizado_em=lt.${encodeURIComponent(agora)}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
    await sync({ fim: new Date().toISOString(), situacao: 'ok', movimentos: linhas.length });
    console.log('[inadimplencia]', linhas.length, 'cobranças em', ctrIds.length, 'contratos');
    return { statusCode: 200 };
  } catch (e) {
    console.error('[inadimplencia]', e.message);
    await sync({ fim: new Date().toISOString(), situacao: 'erro: ' + e.message.slice(0, 150) });
    return { statusCode: 500 };
  }
};

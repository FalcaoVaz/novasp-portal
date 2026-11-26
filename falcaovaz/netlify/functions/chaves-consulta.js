// Consulta pública do processo de ENTREGA DE CHAVES pelo protocolo (23/11/2026) — usada por novasp.netlify.app/entregaapp/consulta.html.
// Só leitura e só o necessário para o cliente acompanhar: endereço, garantia, etapas com datas, reparo e histórico de etapas.
// SEM nomes, e-mails, observações internas nem mensagens. Lê com a chave de serviço (a tabela não é aberta a anônimos).
const ORIGENS = ['https://novasp.netlify.app'];
const cors = o => ({ 'Access-Control-Allow-Origin': ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+--novasp\.netlify\.app$/.test(o || '') ? o : ORIGENS[0], 'Vary': 'Origin' });
const BASE = [['data_agendada', 'Entrega das chaves agendada'], ['data_entrega', 'Chaves entregues'], ['data_vistoria_agendada', 'Vistoria agendada'], ['data_vistoria', 'Vistoria realizada'], ['data_liberacao', 'Chaves liberadas p/ locação']];
const FINAIS = {
  'Caução': [['data_debitos', 'Débitos quitados'], ['data_devolucao', 'Devolução da caução']],
  'Título de capitalização': [['data_resgate', 'Resgate do título'], ['data_debitos', 'Débitos quitados']],
  'Seguro fiança': [['data_sinistro', 'Entrada no sinistro', true], ['data_debitos', 'Débitos quitados']],
  'Fiador': [['data_debitos', 'Débitos quitados']],
};
exports.handler = async (event) => {
  const H = { ...cors((event.headers || {}).origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  const r = (s, o) => ({ statusCode: s, headers: H, body: JSON.stringify(o) });
  const p = String((event.queryStringParameters || {}).p || '').trim().toUpperCase();
  if (!/^CHV-\d{8}-\d{3,6}$/.test(p)) return r(400, { ok: false, erro: 'protocolo' });
  const sb = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co', key = process.env.SUPABASE_KEY || '';
  if (!key) return r(503, { ok: false, erro: 'configuracao' });
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const cols = 'protocolo,endereco,tipo_fianca,cancelado,necessita_reparo,descricao_reparo,valor_reparo,responsavel_reparo,data_cadastro,' + BASE.concat(...Object.values(FINAIS)).map(x => x[0]).filter((v, i, a) => a.indexOf(v) === i).join(',');
  const [c] = await fetch(`${sb}/rest/v1/chaves_processos?select=${cols}&protocolo=eq.${encodeURIComponent(p)}&limit=1`, { headers: h }).then(x => x.ok ? x.json() : []).catch(() => []);
  if (!c) return r(404, { ok: false, erro: 'nao encontrado' });
  const and = await fetch(`${sb}/rest/v1/chaves_andamentos?select=em,etapa&protocolo=eq.${encodeURIComponent(p)}&order=em.asc`, { headers: h }).then(x => x.ok ? x.json() : []).catch(() => []);
  const etapas = BASE.concat(FINAIS[c.tipo_fianca] || FINAIS['Fiador']).map(([col, label, opc]) => ({ label, data: c[col] || (col === 'data_vistoria_agendada' ? c.data_vistoria : null) || null, opcional: !!opc }));
  return r(200, { ok: true, protocolo: c.protocolo, endereco: c.endereco, garantia: c.tipo_fianca, cancelado: c.cancelado, cadastro: c.data_cadastro, etapas,
    reparo: c.necessita_reparo === 'Sim' ? { descricao: c.descricao_reparo, valor: c.valor_reparo, por: c.responsavel_reparo } : null,
    historico: and.filter(a => !/^Respons|^Dados alterados/.test(a.etapa || '')).map(a => ({ em: a.em, etapa: a.etapa })) });
};

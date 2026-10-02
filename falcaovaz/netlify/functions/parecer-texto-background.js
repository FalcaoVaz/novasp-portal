// Background Function — texto do parecer de valor do PORTAL (módulo Avaliação), escrito pelo Claude.
// Mora no site do jurídico porque é aqui que está a ANTHROPIC_API_KEY (variável secreta do Netlify).
//
// Fluxo: o portal (novasp.netlify.app) envia {job_id, token, dados} em POST "simples" (sem preflight),
// esta função valida o login do corretor no Supabase, chama a API da Anthropic e grava o resultado
// na tabela ia_jobs (a mesma fila do gerar-documento). O portal lê o job direto do banco.
//
// Chamada HTTP direta (sem SDK) porque este site é publicado por zip arrastado no Netlify, sem
// "npm install" — mesmo motivo das outras funções daqui.

const MODELO = process.env.PARECER_MODELO || 'claude-sonnet-5-5';   // Sonnet 5.5: metade do custo do Opus 5.5 (decisão Rodrigo 02/10/2026)
const EFFORT = process.env.PARECER_EFFORT || 'medium';

const SISTEMA = `Você escreve pareceres de valor de imóveis para a Imobiliária Nova São Paulo, que atua na Zona Sul de São Paulo desde 1969. O parecer é entregue ao cliente (proprietário ou comprador) pelo corretor.

Escreva em português do Brasil, com frases curtas e claras, para um leitor leigo e inteligente. Tom sóbrio e seguro, sem adjetivos de venda ("imperdível", "excelente oportunidade") e sem jargão técnico sem explicação.

Regras de conteúdo, inegociáveis:
- Use SOMENTE os dados do JSON. Não invente vendas, endereços, datas, preços, histórico do bairro, obras ou equipamentos que não estejam ali. Se um dado não veio, não fale dele.
- Valor por metro quadrado sempre em ÁREA ÚTIL. A área "no cadastro" da Prefeitura inclui áreas comuns e garagem; cite-a só para explicar a diferença, nunca como base de preço.
- "Venda real" é a transação registrada na Prefeitura (guia de ITBI), com o preço declarado. "Anúncio" é preço pedido, que costuma fechar abaixo. Explique a diferença quando usar os dois.
- Fale em mediana, não em média.
- Publique a incerteza: quando as fontes divergem, diga quanto e o que provavelmente explica. Não force concordância.
- Cite números com sua base: quantas vendas, de quando, a que distância.
- Não cite nomes de pessoas, de clientes, de comunidades ou favelas, nem projetos ou empresas usados internamente para calibrar parâmetros.
- Este documento é uma opinião de valor para comercialização, não um laudo de avaliação (NBR 14.653). Não use a palavra "laudo" para descrevê-lo.

Estrutura:
- "titulo": uma pergunta curta que o parecer responde, com o endereço (ex.: "Quanto vale o apartamento da Alameda dos Guaiós, 247").
- "resposta": 2 a 4 frases que respondem de frente: o valor, a faixa e a razão principal.
- "secoes": de 3 a 5 seções, cada uma com "titulo" curto e "texto" em 1 a 3 parágrafos (separe parágrafos com uma linha em branco). Escolha entre: o imóvel e o prédio; a localização e o entorno; o que as vendas reais e os anúncios mostram; como as evidências se combinam no valor; estratégia de preço (preço de anúncio e de fechamento esperado); potencial para incorporadora (só se o JSON trouxer essa conta). Omita a seção sem dado suficiente.
- "atencao": até 3 pontos curtos que o cliente deve verificar ou que podem mudar o valor (estado de conservação, documentação, vagas, zoneamento a confirmar). Lista vazia se não houver.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    resposta: { type: 'string' },
    secoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titulo: { type: 'string' }, texto: { type: 'string' } },
        required: ['titulo', 'texto'],
        additionalProperties: false
      }
    },
    atencao: { type: 'array', items: { type: 'string' } }
  },
  required: ['titulo', 'resposta', 'secoes', 'atencao'],
  additionalProperties: false
};

async function gravarJob(supabaseUrl, supabaseKey, jobId, campos) {
  const r = await fetch(`${supabaseUrl}/rest/v1/ia_jobs?on_conflict=job_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ job_id: jobId, ...campos })
  });
  if (r.status >= 400) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function loginValido(supabaseUrl, anonKey, token) {
  if (!token || !anonKey) return false;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    return r.status === 200;
  } catch (_) { return false; }
}

async function chamarClaude(apiKey, dados) {
  const corpo = {
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    messages: [{ role: 'user', content: 'Dados da avaliação (JSON). Escreva o parecer seguindo as regras.\n\n' + JSON.stringify(dados) }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: ESQUEMA } },
    fallbacks: 'default'
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify(corpo),
      signal: ctrl.signal
    });
    const txt = await r.text();
    if (r.status !== 200) {
      let msg = txt.slice(0, 300);
      try { msg = JSON.parse(txt).error.message || msg; } catch (_) {}
      throw new Error(`API da Anthropic respondeu ${r.status}: ${msg}`);
    }
    const resp = JSON.parse(txt);
    if (resp.stop_reason === 'refusal') throw new Error('O modelo não escreveu o texto desta avaliação. Tente de novo ou siga sem o texto.');
    if (resp.stop_reason === 'max_tokens') throw new Error('O texto ficou longo demais e foi cortado. Tente de novo.');
    const bloco = (resp.content || []).find(b => b.type === 'text');
    if (!bloco || !bloco.text) throw new Error('Resposta sem texto. Tente de novo.');
    const texto = JSON.parse(bloco.text);
    const u = resp.usage || {};
    return { texto, modelo: resp.model, tokens: (u.input_tokens || 0) + (u.output_tokens || 0) };
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400 }; }
  const { job_id, token, dados } = input;
  if (!/^par-[A-Za-z0-9-]{8,64}$/.test(job_id || '')) return { statusCode: 400 };
  if (!supabaseKey) { console.error('[parecer] SUPABASE_KEY/SUPABASE_ANON_KEY ausente'); return { statusCode: 500 }; }

  const falha = (msg) => gravarJob(supabaseUrl, supabaseKey, job_id, { status: 'erro', erro: msg }).catch(e => console.error('[parecer] gravar erro', e.message));

  if (!(await loginValido(supabaseUrl, anonKey, token))) { await falha('Sessão do portal inválida ou vencida. Saia e entre de novo.'); return { statusCode: 202 }; }
  if (!apiKey) { await falha('ANTHROPIC_API_KEY não configurada no Netlify do jurídico.'); return { statusCode: 202 }; }
  if (!dados || typeof dados !== 'object' || JSON.stringify(dados).length > 60000) { await falha('Resumo da avaliação ausente ou grande demais.'); return { statusCode: 202 }; }

  try {
    await gravarJob(supabaseUrl, supabaseKey, job_id, { status: 'processando' });
    const r = await chamarClaude(apiKey, dados);
    await gravarJob(supabaseUrl, supabaseKey, job_id, { status: 'pronto', resultado: JSON.stringify(r.texto), modelo: r.modelo, tokens: r.tokens, erro: null });
    console.log('[parecer] pronto', job_id, r.modelo, r.tokens);
  } catch (e) {
    console.error('[parecer] erro', job_id, e.message);
    await falha(e.name === 'AbortError' ? 'O serviço de texto demorou demais. Tente de novo.' : e.message);
  }
  return { statusCode: 202 };
};

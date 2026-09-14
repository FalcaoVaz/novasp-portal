const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
};

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_JSON, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_JSON, body: '{"erro":"Método não permitido"}' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS_JSON, body: JSON.stringify({ erro: 'ANTHROPIC_API_KEY não configurada.' }) };

  let input;
  try { input = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: CORS_JSON, body: JSON.stringify({ erro: 'JSON inválido' }) }; }

  const { tipo, referencia, descricao, contexto, texto_arquivo, nome_arquivo, arquivo_base64, arquivo_nome } = input;
  if (!descricao) return { statusCode: 400, headers: CORS_JSON, body: JSON.stringify({ erro: 'Descreva a situação antes de gerar.' }) };

  const tipoFinal = tipo || 'Documento Jurídico';

  // Bloco de contexto injetado no prompt (empresa + autor + data)
  let ctxBloco = '';
  if (contexto) {
    if (contexto.empresa) {
      ctxBloco += `\n\n=== CONTEXTO — CONTRATANTE (use como parte "requerente"/autor/subscritor do documento; NÃO peça esses dados como [PREENCHER]) ===\n` +
        `Razão social: ${contexto.empresa.razao_social}\n` +
        `CNPJ: ${contexto.empresa.cnpj}\n` +
        `Endereço: ${contexto.empresa.endereco}\n`;
    }
    if (contexto.autor?.nome) {
      ctxBloco += `Subscritor / redator interno: ${contexto.autor.nome}\n`;
    }
    if (contexto.data_hoje) {
      ctxBloco += `Data de emissão: ${contexto.data_hoje}\n`;
    }
    ctxBloco += `=== FIM DO CONTEXTO ===`;
  }

  // Monta conteúdo
  const userContent = [];

  if (texto_arquivo && texto_arquivo.length > 10) {
    userContent.push({ type: 'text', text: `=== DOCUMENTO: ${nome_arquivo||'anexo'} ===\n${texto_arquivo.substring(0,8000)}\n=== FIM ===` });
  } else if (arquivo_base64 && arquivo_nome) {
    const ext = arquivo_nome.split('.').pop().toLowerCase();
    const kb = Math.round(arquivo_base64.length * 0.75 / 1024);
    if (['png','jpg','jpeg','webp'].includes(ext) && kb <= 2000)
      userContent.push({ type: 'image', source: { type: 'base64', media_type: ext==='jpg'?'image/jpeg':`image/${ext}`, data: arquivo_base64 } });
    else if (ext === 'pdf' && kb <= 1500)
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo_base64 } });
  }

  userContent.push({ type: 'text', text: `Tipo: ${tipoFinal}\nReferência: ${referencia||'—'}${ctxBloco}\n\nSituação:\n${descricao}` });

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,   // reduzido de 8000 pra caber no timeout de 26s do Netlify Free
    stream: true,
    system: getSystem(tipoFinal),
    messages: [{ role: 'user', content: userContent }]
  });

  // Coleta o streaming inteiro e retorna como JSON
  // (Netlify não suporta streaming de resposta, mas o timeout é no request — não na resposta)
  return new Promise((resolve) => {
    let textoCompleto = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let erro = null;

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      // Lê linha por linha do stream SSE
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // guarda linha incompleta

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              textoCompleto += evt.delta.text;
            }
            if (evt.type === 'message_delta' && evt.usage) {
              outputTokens = evt.usage.output_tokens || 0;
            }
            if (evt.type === 'message_start' && evt.message?.usage) {
              inputTokens = evt.message.usage.input_tokens || 0;
            }
            if (evt.type === 'error') {
              erro = evt.error?.message || 'Erro na API';
            }
          } catch(e) { /* linha inválida, ignora */ }
        }
      });

      res.on('end', () => {
        if (erro) {
          resolve({ statusCode: 502, headers: CORS_JSON, body: JSON.stringify({ erro }) });
          return;
        }
        if (!textoCompleto) {
          resolve({ statusCode: 502, headers: CORS_JSON, body: JSON.stringify({ erro: 'A IA não retornou conteúdo. Tente novamente.' }) });
          return;
        }
        resolve({
          statusCode: 200,
          headers: CORS_JSON,
          body: JSON.stringify({
            conteudo: textoCompleto,
            tokens: inputTokens + outputTokens,
            modelo: 'claude-sonnet-4-5-20250929'
          })
        });
      });

      res.on('error', (e) => {
        resolve({ statusCode: 500, headers: CORS_JSON, body: JSON.stringify({ erro: 'Erro de leitura: ' + e.message }) });
      });
    });

    req.on('error', (e) => {
      resolve({ statusCode: 500, headers: CORS_JSON, body: JSON.stringify({ erro: 'Erro de conexão: ' + e.message }) });
    });

    // Timeout de 25s no request (deixa margem para Netlify)
    req.setTimeout(25000, () => {
      req.destroy();
      // Se já tiver texto parcial, retorna o que tem
      if (textoCompleto.length > 200) {
        resolve({
          statusCode: 200,
          headers: CORS_JSON,
          body: JSON.stringify({
            conteudo: textoCompleto + '\n\n[⚠️ Documento truncado por limite de tempo. Complete manualmente as seções restantes.]',
            tokens: inputTokens + outputTokens,
            modelo: 'claude-sonnet-4-5-20250929',
            truncado: true
          })
        });
      } else {
        resolve({ statusCode: 504, headers: CORS_JSON, body: JSON.stringify({ erro: 'Tempo excedido. Tente uma descrição mais curta.' }) });
      }
    });

    req.write(requestBody);
    req.end();
  });
};

function antiAlucinacao() {
  return `

REGRAS sobre dados externos:
- NUNCA invente números específicos de processo, acórdão, REsp, AgRg, ADI, ARE. Não cite "REsp 1.234.567/SP" ou similares.
- Artigos de lei (CC, CPC, Lei 8.245/91, CDC, etc.) podem ser citados normalmente — são públicos e estáveis.
- Quando faltar um dado do caso, use marcador no formato [PREENCHER: descrição do que falta].
- Ao final do documento, inclua um bloco "⚠️ ANTES DE USAR:" listando o que o advogado deve revisar antes de protocolar (jurisprudência específica, dados pessoais, valor da causa, etc).`;
}

function getSystem(tipo) {
  const anti = antiAlucinacao();

  const judicial = `Você é advogado sênior brasileiro especializado em direito civil e imobiliário.
Redija a peça completa, longa e bem fundamentada, em português jurídico formal e preciso.

ESTRUTURA OBRIGATÓRIA (siga exatamente, com as seções na ordem):

EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ª VARA ___ DA COMARCA DE ___
[qualificação completa das partes, com [PREENCHER] onde faltarem dados]
vem, respeitosamente, à presença de Vossa Excelência, com fundamento [base legal], expor e requerer o que segue:

I — DOS FATOS
Narração objetiva e cronológica do caso, em parágrafos numerados ou contínuos. Use os fatos fornecidos pelo usuário. Onde faltar dado relevante, use [PREENCHER: ...].

II — DO DIREITO
Mínimo 3-5 parágrafos analisando o direito aplicável. Cite artigos específicos com numeração real (ex.: "Nos termos do art. 9º da Lei 8.245/91...", "O Código Civil, em seu art. 421..."). Desenvolva o argumento jurídico ligando cada artigo aos fatos do caso. Não se limite a listar artigos — explique a aplicação.

III — DA JURISPRUDÊNCIA
Escreva 2-3 parágrafos SUBSTANTIVOS sobre o entendimento jurisprudencial dominante na matéria. NÃO escreva apenas "[VERIFICAR JURISPRUDÊNCIA]" — isso é placeholder, não conteúdo. Em vez disso:
- Identifique qual tribunal pacificou o entendimento (STJ, STF, TJSP, etc.) — você pode nomear tribunais.
- Descreva a tese jurídica em si com formulações como: "O Superior Tribunal de Justiça tem reiteradamente decidido que...", "É pacífico no Tribunal de Justiça de São Paulo o entendimento de que...", "A jurisprudência majoritária firma-se no sentido de que...".
- NÃO cite números específicos de processo, REsp ou acórdão.
- Ao final da seção, inclua uma linha de nota: "[VERIFICAR JURISPRUDÊNCIA — incluir 2-3 precedentes específicos atualizados antes do protocolo]".

IV — DO PEDIDO
Pedidos claros, numerados (a, b, c... ou 1, 2, 3...), específicos e coerentes com os fatos e o direito desenvolvidos.

REQUERIMENTOS FINAIS
Citação da parte contrária, produção de provas pretendida, honorários advocatícios, valor da causa (use [PREENCHER] se não informado), local e data.

${anti}`;

  const extrajudicial = `Você é advogado sênior brasileiro, especializado em direito civil e imobiliário.
Redija o documento extrajudicial (notificação, contrato, parecer, etc.) em português formal, direto e profissional.

Inclua sempre:
- Qualificação completa das partes (use [PREENCHER] onde faltar)
- Objeto claro do documento
- Fundamentação legal com citação de artigos específicos (CC, Lei 8.245/91, CDC, etc.)
- Prazos e consequências do descumprimento, quando aplicável
- Local, data e assinatura

Desenvolva cada seção com substância — não use placeholders vazios para conteúdo.${anti}`;

  const consulta = `Você é advogado sênior brasileiro. Responda em estrutura curta e objetiva:

1. PERGUNTA — reformule a dúvida em uma frase clara
2. RESPOSTA — resposta direta em 2-3 parágrafos
3. BASE LEGAL — artigos específicos aplicáveis (cite numeração real)
4. RISCOS — riscos jurídicos ou operacionais relevantes
5. RECOMENDAÇÃO — o que fazer na prática

Máximo 500 palavras. Seja substantivo, não use placeholders vazios.${anti}`;

  const tiposJudiciais = ['Petição Judicial','Contestação','Razões de Apelação','Contrarrazões',
    'Alegações Finais','Embargos de Declaração','Recurso Especial','Recurso Ordinário',
    'Agravo de Instrumento','Mandado de Segurança','Tutela de Urgência','Réplica',
    'Memoriais','Petição Simples','Impugnação ao Cumprimento de Sentença',
    'Exceção de Pré-Executividade','Embargos à Execução'];

  if (tiposJudiciais.includes(tipo)) return judicial;
  if (tipo === '❓ Consulta / Orientação Jurídica' || tipo.includes('Consulta')) return consulta;
  return extrajudicial;
}

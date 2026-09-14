// Background Function — sem limite de tempo (até 15 minutos)
// O frontend dispara e fica consultando o banco até o resultado aparecer
const https = require('https');

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

// Salva resultado no Supabase diretamente do servidor
async function salvarNoSupabase(supabaseUrl, supabaseKey, jobId, resultado) {
  const body = JSON.stringify({
    job_id: jobId,
    resultado: resultado.conteudo || null,
    tokens: resultado.tokens || 0,
    modelo: resultado.modelo || null,
    erro: resultado.erro || null,
    status: resultado.erro ? 'erro' : 'pronto'
  });

  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl + '/rest/v1/ia_jobs');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + '?on_conflict=job_id',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Prefer': 'resolution=merge-duplicates'
      }
    }, res => {
      let respBody = '';
      res.on('data', c => respBody += c.toString());
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Supabase HTTP ${res.statusCode}: ${respBody.slice(0,500)}`));
        } else {
          resolve(res.statusCode);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Supabase timeout 30s')); });
    req.write(body);
    req.end();
  });
}

async function chamarAnthropic(apiKey, requestBody) {
  return new Promise((resolve, reject) => {
    let textoCompleto = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let bytesRecebidos = 0;
    let httpStatus = 0;
    let errorBody = ''; // acumula body se status != 200 (nao e SSE, e JSON de erro)

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'accept': 'text/event-stream'
      }
    }, (res) => {
      httpStatus = res.statusCode;
      console.log('[bg] Anthropic HTTP ' + httpStatus);

      // Se status != 200, response NAO e SSE, e JSON de erro. Coleta body inteiro.
      if (httpStatus !== 200) {
        res.on('data', c => { errorBody += c.toString(); bytesRecebidos += c.length; });
        res.on('end', () => {
          let msg = errorBody.slice(0, 1000);
          try { const j = JSON.parse(errorBody); msg = j.error?.message || j.message || msg; } catch(_) {}
          reject(new Error(`Anthropic HTTP ${httpStatus}: ${msg}`));
        });
        return;
      }

      // Status 200: parsing SSE normal
      let buffer = '';
      res.on('data', chunk => {
        bytesRecebidos += chunk.length;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta')
              textoCompleto += evt.delta.text;
            if (evt.type === 'message_start' && evt.message?.usage)
              inputTokens = evt.message.usage.input_tokens || 0;
            if (evt.type === 'message_delta' && evt.usage)
              outputTokens = evt.usage.output_tokens || 0;
            if (evt.type === 'error')
              reject(new Error(evt.error?.message || 'Erro na API'));
          } catch(e) { /* linha SSE invalida */ }
        }
      });
      res.on('end', () => {
        console.log('[bg] stream end: ' + bytesRecebidos + ' bytes, ' + textoCompleto.length + ' chars de texto');
        if (!textoCompleto || textoCompleto.length < 20) {
          reject(new Error('Anthropic retornou stream vazio ou muito curto (' + textoCompleto.length + ' chars). Verifique a Anthropic dashboard.'));
          return;
        }
        resolve({ conteudo: textoCompleto, tokens: inputTokens + outputTokens, modelo: 'claude-sonnet-4-5-20250929' });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    // Timeout duro de 3 min — Anthropic raramente demora mais para 8000 tokens.
    // Se estourar, e melhor falhar rapido do que o frontend ficar 5 min esperando.
    req.setTimeout(180000, () => { req.destroy(new Error('Anthropic timeout 3min — request travada')); });
    req.write(requestBody);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_JSON, body: '' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://mqcduyvpuxdweqesgwrq.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  console.log('[bg] iniciando', { hasApiKey: !!apiKey, hasSupabaseKey: !!supabaseKey });

  let input;
  try { input = JSON.parse(event.body); }
  catch(e) { console.error('[bg] JSON invalido'); return { statusCode: 400 }; }

  const { tipo, referencia, descricao, contexto, texto_arquivo, nome_arquivo, arquivo_base64, arquivo_nome, job_id, texto_base, refinar } = input;

  // Contexto injetado (empresa + autor + data hoje). Vai no texto do user.
  let ctxBloco = '';
  if (contexto) {
    if (contexto.empresa) {
      ctxBloco += `\n\n=== CONTEXTO — CONTRATANTE (use como parte/autor do documento; NÃO peça esses dados como [PREENCHER]) ===\n` +
        `Razão social: ${contexto.empresa.razao_social}\n` +
        `CNPJ: ${contexto.empresa.cnpj}\n` +
        `Endereço: ${contexto.empresa.endereco}\n`;
    }
    if (contexto.autor?.nome) ctxBloco += `Subscritor / redator interno: ${contexto.autor.nome}\n`;
    if (contexto.data_hoje)   ctxBloco += `Data de emissão: ${contexto.data_hoje}\n`;
    ctxBloco += `=== FIM DO CONTEXTO ===`;
  }
  if (!job_id) { console.error('[bg] job_id ausente'); return { statusCode: 400 }; }

  // Se faltar config, registra erro no banco para o frontend receber feedback
  if (!apiKey) {
    await salvarNoSupabase(supabaseUrl, supabaseKey, job_id, { erro: 'ANTHROPIC_API_KEY nao configurada no Netlify.' }).catch(e => console.error('[bg] falha gravar erro de env:', e));
    return { statusCode: 202 };
  }
  if (!supabaseKey) {
    console.error('[bg] SUPABASE_ANON_KEY ausente — impossivel gravar resultado');
    return { statusCode: 500 };
  }
  if (!descricao) {
    await salvarNoSupabase(supabaseUrl, supabaseKey, job_id, { erro: 'Descricao obrigatoria.' }).catch(e => console.error('[bg]', e));
    return { statusCode: 202 };
  }

  const tipoFinal = tipo || 'Documento Jurídico';

  const userContent = [];
  if (texto_arquivo?.length > 3)
    userContent.push({ type: 'text', text: `=== DOCUMENTO: ${nome_arquivo||'anexo'} ===\n${texto_arquivo.substring(0,8000)}\n=== FIM ===` });
  else if (arquivo_base64 && arquivo_nome) {
    const ext = arquivo_nome.split('.').pop().toLowerCase();
    const kb = Math.round(arquivo_base64.length * 0.75 / 1024);
    if (['png','jpg','jpeg','webp'].includes(ext) && kb <= 2000)
      userContent.push({ type: 'image', source: { type: 'base64', media_type: ext==='jpg'?'image/jpeg':`image/${ext}`, data: arquivo_base64 } });
    else if (ext === 'pdf' && kb <= 1500)
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo_base64 } });
  }
  const refinando = refinar === true && texto_base && String(texto_base).length > 10;
  if (refinando) {
    userContent.push({ type: 'text', text:
      `Tipo: ${tipoFinal}\nReferência: ${referencia||'—'}\n\n` +
      `=== DOCUMENTO ATUAL (a ser revisado) ===\n${String(texto_base).substring(0,12000)}\n=== FIM ===\n\n` +
      `INSTRUÇÃO DE AJUSTE DO USUÁRIO:\n${descricao}` });
  } else {
    userContent.push({ type: 'text', text: `Tipo: ${tipoFinal}\nReferência: ${referencia||'—'}${ctxBloco}\n\nSituação:\n${descricao}` });
  }

  let systemPrompt = getSystem(tipoFinal);
  if (refinando) {
    systemPrompt += `\n\n— MODO REVISÃO —
O usuário já gerou um documento e agora pede ajustes. A mensagem traz o DOCUMENTO ATUAL e uma INSTRUÇÃO DE AJUSTE.
Reescreva o documento COMPLETO aplicando a instrução, mantendo o mesmo formato e respeitando todas as regras acima.
Entregue apenas o documento revisado, sem comentar as mudanças nem adicionar texto explicativo fora do documento.`;
  }

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,  // background nao tem timeout, pode gerar documento longo
    stream: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  });

  // Background functions: o cliente ja recebeu 202 automaticamente do Netlify
  // quando a invocacao comecou. Aqui dentro temos ate 15 min para terminar.
  // O trabalho TEM QUE ser awaitado — promises soltas sao perdidas quando
  // o handler retorna (Lambda congela a execucao).
  try {
    console.log('[bg] chamando Anthropic, job_id=' + job_id);
    const t0 = Date.now();
    const resultado = await chamarAnthropic(apiKey, requestBody);
    console.log('[bg] Anthropic ok em ' + (Date.now()-t0) + 'ms, tokens=' + resultado.tokens);
    const status = await salvarNoSupabase(supabaseUrl, supabaseKey, job_id, resultado);
    console.log('[bg] salvou ia_jobs status=' + status);
  } catch(e) {
    console.error('[bg] erro:', e.message);
    await salvarNoSupabase(supabaseUrl, supabaseKey, job_id, { erro: e.message }).catch(err => console.error('[bg] falha gravar erro:', err));
  }

  return { statusCode: 202 };
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

  // Resposta a E-mail Jurídico — formato de e-mail, NÃO de notificação
  const email = `Você é advogado sênior brasileiro de uma imobiliária, redigindo a RESPOSTA a um e-mail de teor jurídico.
O resultado deve ser um E-MAIL, não uma peça nem uma notificação. Tom profissional, cordial e claro — escreva para ser lido por um cliente, parceiro ou colega, não por um juiz.

FORMATO:
- Linha "Assunto:" curta e objetiva (responda ao assunto original quando houver).
- Saudação ("Prezado(a) [PREENCHER: nome]," ou "Olá [PREENCHER],").
- Corpo em parágrafos curtos e diretos: responda ao que foi perguntado, explique o ponto jurídico em linguagem acessível e, quando útil, mencione o fundamento legal de forma leve (ex.: "conforme prevê a Lei do Inquilinato"). Evite juridiquês pesado e estrutura de petição.
- Se houver providências ou prazos, liste-os de forma simples.
- Encerramento cordial ("Permaneço à disposição.", "Atenciosamente,") com espaço para assinatura [PREENCHER: nome / cargo].

NÃO use seções "DOS FATOS / DO DIREITO", nem linguagem de notificação ("fica V.Sa. notificado", "sob pena de"). É uma resposta de e-mail.${anti}`;

  // Parecer sobre Documento — análise técnica
  const parecer = `Você é advogado sênior brasileiro. Redija um PARECER JURÍDICO analisando o documento/situação informada.
Tom técnico, analítico e fundamentado, mas objetivo.

ESTRUTURA:
1. EMENTA — resumo do que será analisado em 1-2 linhas.
2. DO OBJETO — o que está sendo analisado e o contexto.
3. ANÁLISE — exame do mérito: pontos relevantes do documento, cláusulas, riscos, lacunas, conformidade legal. Cite artigos específicos (CC, Lei 8.245/91, CDC etc.) ligando-os ao caso.
4. CONCLUSÃO — posicionamento claro: o documento está adequado? Quais ajustes recomendar?
5. RECOMENDAÇÕES — ações práticas sugeridas.

É um parecer interno de análise — NÃO é notificação nem peça judicial.${anti}`;

  // Contranotificação — resposta formal a uma notificação recebida
  const contranotificacao = `Você é advogado sênior brasileiro. Redija uma CONTRANOTIFICAÇÃO EXTRAJUDICIAL respondendo formalmente a uma notificação recebida.
Tom formal e firme, porém respeitoso.

Inclua:
- Cabeçalho com qualificação do notificante (quem responde) e do destinatário (quem havia notificado), use [PREENCHER] onde faltar.
- Referência expressa à notificação recebida (data/teor).
- Refutação ponto a ponto das alegações, com fundamentação legal (artigos específicos).
- Posicionamento da parte e eventuais contrapropostas ou ressalvas de direitos.
- Encerramento, local, data e assinatura.

NÃO redija como notificação ofensiva inicial — é uma RESPOSTA a uma notificação já recebida.${anti}`;

  // Distrato / Rescisão — minuta contratual
  const distrato = `Você é advogado sênior brasileiro. Redija uma minuta de DISTRATO / INSTRUMENTO DE RESCISÃO CONTRATUAL.
Formato de instrumento contratual (não é carta nem petição).

Inclua:
- Título ("INSTRUMENTO PARTICULAR DE DISTRATO / RESCISÃO DE ...").
- Qualificação completa das partes (use [PREENCHER]).
- Considerandos: referência ao contrato original (data, objeto), use [PREENCHER] onde faltar.
- Cláusulas numeradas: objeto do distrato, quitação/acerto de valores, prazos de desocupação ou devolução quando aplicável, responsabilidades remanescentes, foro.
- Fundamentação legal pertinente (CC, Lei 8.245/91 etc.).
- Fecho com local, data, assinaturas das partes e testemunhas.${anti}`;

  // Declaração Imobiliária — documento declaratório
  const declaracao = `Você é advogado sênior brasileiro. Redija uma DECLARAÇÃO no contexto imobiliário (quitação, posse, anuência, residência etc.).
Formato de declaração — texto direto e enxuto, na primeira pessoa do declarante.

Inclua:
- Título ("DECLARAÇÃO" ou "DECLARAÇÃO DE QUITAÇÃO/POSSE/ANUÊNCIA", conforme o caso).
- Qualificação do declarante (use [PREENCHER]).
- Corpo declaratório claro: "Declaro, para os devidos fins, que ...", contendo o conteúdo solicitado e, quando útil, o fundamento.
- Eventual menção a imóvel/contrato de referência (use [PREENCHER]).
- Fecho com local, data e assinatura do declarante.

NÃO transforme em notificação nem em petição — é um documento declaratório curto.${anti}`;

  const judiciais = ['Petição Judicial','Contestação','Razões de Apelação','Contrarrazões','Alegações Finais',
    'Embargos de Declaração','Recurso Especial','Recurso Ordinário','Agravo de Instrumento',
    'Mandado de Segurança','Tutela de Urgência','Réplica','Memoriais','Petição Simples',
    'Impugnação ao Cumprimento de Sentença','Exceção de Pré-Executividade','Embargos à Execução'];

  // Mapa por chave enviada pelos cards (minúsculas)
  const t = String(tipo || '').trim();
  const key = t.toLowerCase();
  const mapa = {
    'email': email,
    'parecer': parecer,
    'notificacao': extrajudicial,
    'notificação': extrajudicial,
    'contranotificacao': contranotificacao,
    'contranotificação': contranotificacao,
    'distrato': distrato,
    'declaracao': declaracao,
    'declaração': declaracao,
    'consulta': consulta
  };
  if (mapa[key]) return mapa[key];
  if (judiciais.includes(t)) return judicial;
  if (key.includes('petic') || key.includes('petiç')) return judicial;
  if (key.includes('consulta')) return consulta;
  if (key.includes('parecer') || key.includes('análise') || key.includes('analise')) return parecer;
  if (key.includes('e-mail') || key.includes('email')) return email;
  if (key.includes('contranot')) return contranotificacao;
  if (key.includes('distrato') || key.includes('rescis')) return distrato;
  if (key.includes('declara')) return declaracao;
  return extrajudicial;
}

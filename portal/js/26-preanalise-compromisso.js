/* =====================================================================
   26-preanalise-compromisso.js — COMPROMISSO DE VENDA E COMPRA na pré-análise (pacote da Renata de 09/11/2026)
   ---------------------------------------------------------------------
   Na venda: quatro campos de anexo (1 proposta de compra, 2 matrícula, 3 documentos pessoais, 4 IPTU), o cartão
   "pronto / falta" e o botão "Emitir compromisso de venda e compra", que preenche o Word da NSP da versão da venda
   (Modelos 1 a 4, pasta modelos-nsp/) e gera o Word e o PDF. Só gerente e administrador emitem; o assistente anexa.
   - Dados do compromisso (negociação, vendedores e compradores qualificados): preanalise_venda.minuta (JSON).
   - Proposta, documentos pessoais e o compromisso emitido: preanalise_anexo (não entram na leitura das certidões).
     Matrícula e IPTU continuam em preanalise_documento (entram na análise).
   - Regras da minuta: porte do minuta.py da Renata (montar_valores e preencher_docx): mesmos textos de qualificação,
     mesmos campos obrigatórios por modelo, texto preenchido destacado em amarelo e aviso de conferência no topo.
   - Proposta: porte do proposta.py (leitura do formulário da NSP em Word ou PDF); o gerente confere antes de aplicar.
   - Biblioteca de modelos (Minutas, Protocolos, Declarações, Formulários e Cláusulas): para todos do piloto.
   Banco: sql/2026-11-10-preanalise-compromisso.sql.
   ===================================================================== */
(function () {
  'use strict';
  const U = () => window.PreAnalise._u;
  const T = () => window.PAAcomp._t;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 20 * 1024 * 1024;
  const MODELOS_V = '20261111';
  const MODELO_ARQ = { modelo1: 'NSP_Modelo1_financiamento_FGTS_locatario.docx', modelo2: 'NSP_Modelo2_a_vista.docx',
                       modelo3: 'NSP_Modelo3_financiamento_FGTS_vendedor_PJ.docx', modelo4: 'NSP_Modelo4_a_vista_com_FGTS.docx' };
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // ══════════════ utilidades (mesmas regras do minuta.py) ══════════════
  const tok = n => new Set(String(n || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2));
  function nomeIgual(a, b) {                       // nome_igual: um conjunto de palavras contém o outro (2 palavras ou mais)
    const A = tok(a), B = tok(b); if (A.size < 2 || B.size < 2) return false;
    const sub = (x, y) => [...x].every(w => y.has(w)); return sub(A, B) || sub(B, A);
  }
  // valor em centavos (inteiro): aceita "480000,00", "480.000,00", "R$ 480.000", "480000.5"
  function cent(txt) {
    if (txt == null || txt === '') return null;
    let s = String(txt).replace(/R\$|\s/g, ''); if (!/\d/.test(s)) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return isNaN(n) ? null : Math.round(n * 100);
  }
  const moedaC = c => c == null ? '' : 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moeda = txt => moedaC(cent(txt));
  const nsp = t => String(t || '').replace(/, /g, ' e ').replace(/catorze/g, 'quatorze');      // estilo da NSP: grupos ligados por " e "
  const extensoC = c => c == null ? '' : nsp(T().reaisExtenso(c / 100));
  const extensoReais = txt => extensoC(cent(txt));
  const extensoNum = n => { const x = parseInt(n, 10); return isNaN(x) ? '' : nsp(T().extenso(x)); };
  const dataBr = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dataExt = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; };
  const REGIME_TXT = { comunhao_parcial: 'comunhão parcial', comunhao_universal: 'comunhão universal', separacao_obrigatoria: 'separação obrigatória',
                       separacao_total: 'separação total', participacao_aquestos: 'participação final nos aquestos' };
  const EC_TXT = { solteiro: 'solteiro(a)', solteira: 'solteiro(a)', divorciado: 'divorciado(a)', separado: 'separado(a)', viuvo: 'viúvo(a)', 'viúvo': 'viúvo(a)' };
  const EST_CIVIL = [['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['união estável', 'União estável'], ['divorciado', 'Divorciado(a)'], ['separado', 'Separado(a)'], ['viuvo', 'Viúvo(a)']];
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const regimeTxt = r => REGIME_TXT[r] || String(r || '').replace(/_/g, ' ');
  const regimeCap = r => cap1(regimeTxt(r));
  function normEC(s) {
    const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/uniao/.test(t)) return 'união estável'; if (/casad/.test(t)) return 'casado'; if (/solteir/.test(t)) return 'solteiro';
    if (/divorc/.test(t)) return 'divorciado'; if (/separad/.test(t)) return 'separado'; if (/viuv/.test(t)) return 'viuvo'; return String(s || '').trim();
  }
  function normRegime(s) {                                  // _regime do proposta.py (também para o texto da matrícula)
    const t = String(s || '').toLowerCase();
    if (/universal/.test(t)) return 'comunhao_universal'; if (/parcial/.test(t)) return 'comunhao_parcial'; if (/participa/.test(t)) return 'participacao_aquestos';
    if (/separa/.test(t)) return /obrig/.test(t) ? 'separacao_obrigatoria' : 'separacao_total'; return REGIME_TXT[s] ? s : '';
  }

  // ── qualificação das partes (textos exatamente como no minuta.py) ──
  const identRC = (q) => `RG nº ${q.rg || ''} e CPF nº ${q.cpf || ''}` + (q.email ? `, ${q.email}` : '');
  function qualificarM1(q, anu, cap) {
    const ecRaw = String(q.estado_civil || '').trim(), ec = ecRaw.toLowerCase();
    let ecTxt = EC_TXT[ec] || ecRaw; if (cap && ec !== 'casado') ecTxt = cap1(ecTxt);
    if (ec === 'casado' && anu)
      return `${q.nome}, ${q.nacionalidade || ''}, ${q.profissao || ''}, ${identRC(q)}, casado(a) sob o regime de ${regimeTxt(q.regime)} de bens, com ${anu.nome}, CPF nº ${anu.cpf || ''}, residentes e domiciliados à ${q.endereco || ''}`;
    return `${q.nome}, ${q.nacionalidade || ''}, ${ecTxt}, ${q.profissao || ''}, ${identRC(q)}, residente e domiciliado(a) à ${q.endereco || ''}`;
  }
  function qualificarRepresentante(q) {
    const ec = String(q.estado_civil || '').toLowerCase().trim();
    const est = ec === 'casado' ? `casado(a) sob o regime da ${regimeCap(q.regime)} de bens com ${q.conjuge_nome || ''}` : (EC_TXT[ec] || q.estado_civil || '');
    return `${q.nome}, ${q.nacionalidade || ''}, ${q.profissao || ''}, ${identRC(q)}, residente e domiciliado(a) à ${q.endereco || ''}, ${est}`;
  }
  const qualificarPJ = (nome, pj, rep) => `${nome}, CNPJ nº ${pj.cnpj || ''}` + (pj.email ? `, ${pj.email}` : '') + `, com sede à ${pj.sede || ''}` + (rep ? `, neste ato representada por ${rep}` : '');
  function identConj(q) {
    const em = q.conjuge_email || '', rg = q.conjuge_rg || '', cpf = q.conjuge_cpf || '';
    return em ? (rg ? `${em}, RG nº ${rg} e CPF nº ${cpf}` : `${em} e CIN/CPF nº ${cpf}`) : (rg ? `RG nº ${rg} e CPF nº ${cpf}` : `CIN/CPF nº ${cpf}`);
  }
  function qualificarCompradorM3(q) {
    const base = `${q.nome}, ${q.nacionalidade || ''}, ${q.profissao || ''}, ${identRC(q)}, residente e domiciliado(a) à ${q.endereco || ''}`;
    if (['casado', 'união estável'].includes(String(q.estado_civil || '').toLowerCase()) && q.conjuge_nome)
      return base + `, e seu(sua) cônjuge ou companheiro(a), em relação sob o regime da ${regimeCap(q.regime)} de bens, ${q.conjuge_nome}, ${q.conjuge_nacionalidade || ''}, ${q.conjuge_profissao || ''}, ${identConj(q)}`;
    return null;
  }
  const ident = (rg, cpf, email) => (rg ? `RG nº ${rg} e CPF nº ${cpf || ''}` : `CIN/CPF nº ${cpf || ''}`) + (email ? `, ${email}` : '');
  function qualificarCasal(q, c) {
    return `${q.nome}, ${q.nacionalidade || ''}, ${q.profissao || ''}, ${ident(q.rg, q.cpf, q.email)}, residente e domiciliado(a) à ${q.endereco || ''}` +
      `, e seu(sua) cônjuge ou companheiro(a), em relação sob o regime da ${regimeCap(q.regime)} de bens, ${c.nome}, ${c.nacionalidade || ''}, ${c.profissao || ''}, ${ident(c.rg, c.cpf, c.email)}`;
  }
  function cartorioExtenso(c) {
    const m = String(c || '').match(/^\s*(\d+)\s*[ºo°]?\s*RI\b/i);
    return m ? `${m[1]}º OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE SÃO PAULO - SP` : String(c || '');
  }
  function contaSinal(cs) {
    if (!cs.length) return '';
    const um = c => { let t = [c.conta && `conta corrente nº ${c.conta}`, c.banco && `banco ${c.banco}`, c.agencia && `agência ${c.agencia}`].filter(Boolean).join(', ');
      if (c.pix) t += ` Chave Pix: ${c.pix}`; return t.trim(); };
    if (cs.length === 1) return `na ${um(cs[0])} nominal à PARTE VENDEDORA`;
    return 'nas contas indicadas a seguir, nominais à PARTE VENDEDORA: ' + cs.map(c => (c.valor ? `${moeda(c.valor)} ` : '') + `(${c.nome || ''}) ` + um(c)).join('; ');
  }
  const conjugeDe = q => q && q.conjuge_nome ? { nome: q.conjuge_nome, cpf: q.conjuge_cpf || '', rg: q.conjuge_rg || '', nacionalidade: q.conjuge_nacionalidade || '',
                                                   profissao: q.conjuge_profissao || '', email: q.conjuge_email || '' } : null;
  const PROF = c => c.replace('profissao', 'profissão').replace('endereco', 'endereço').replace('estado_civil', 'estado civil');

  // ══════════════ MONTAR OS VALORES DA MINUTA (montar_valores) ══════════════
  // x: { tipo, N, vendedores, compradores, mat:{numero,cartorio,contribuinte,descricao}, titulo, itens:Set(itens do checklist encontrados),
  //      positivas:[...], prazos:{banco,docs,escritura}, responsaveis, marcos }
  function montar(x) {
    const N = x.N || {}, t = x.tipo || '', m1 = t === 'modelo1', m2 = t === 'modelo2', m3 = t === 'modelo3', m4 = t === 'modelo4';
    const faltas = [], avisos = [], val = {}, mat = x.mat || {};
    if (!MODELO_ARQ[t]) faltas.push('Versão do contrato (Modelo 1 a 4) em Dados da proposta');
    // imóvel
    val.matricula_numero = mat.numero || ''; val.cartorio = mat.cartorio || ''; val.contribuinte = mat.contribuinte || '';
    val.cartorio_extenso = N.cartorio_extenso || cartorioExtenso(mat.cartorio);
    val.endereco_imovel = N.endereco_completo || x.titulo || '';
    val.descricao_imovel = String(N.descricao_imovel || mat.descricao || '').trim().replace(/[.;,\s]+$/, '');
    val.averbacoes_imovel = N.averbacoes_imovel || '';
    val.cartorio_titulo = T().cartorioTitulo(String(val.cartorio_extenso).replace(/\s*-\s*SP\s*$/i, ''));
    const aq = [N.aquisicao_data, N.aquisicao_titulo, N.aquisicao_antecessores];
    val.aquisicao_imovel = aq.every(Boolean) ? `A PARTE VENDEDORA adquiriu o imóvel em ${aq[0]} através da ${aq[1]} sendo o pagamento da compra realizado com ${N.aquisicao_pagamento || 'recursos próprios'} aos VENDEDORES ${aq[2]}.` : '';
    val.clausula_corretor = N.corretor_nome ? `4.7.6. O imóvel foi apresentado à PARTE COMPRADORA através da corretora ${N.corretor_nome} inscrita no CRECI nº ${N.corretor_creci || ''}.` : '';
    val.objeto_imovel = `${val.endereco_imovel}, registrado à matrícula nº ${val.matricula_numero} do ${val.cartorio_extenso}, Contribuinte nº ${val.contribuinte}` + (val.descricao_imovel ? `, descrevendo-se como: ${val.descricao_imovel}` : '');
    [['matricula_numero', 'número da matrícula'], ['cartorio', 'cartório da matrícula'], ['contribuinte', 'contribuinte (SQL)']].forEach(([k, r]) => { if (!val[k]) faltas.push('Matrícula: ' + r); });
    if (!val.descricao_imovel) faltas.push('Descrição do imóvel (conforme a matrícula)');
    // vendedores (pessoa física com cônjuge anuente, ou pessoa jurídica com representante)
    const vend = x.vendedores || [], partes = [], anuentes = [];
    if (!vend.length) faltas.push('Vendedor: qualificação');
    for (const q0 of vend) {
      const nome = q0.nome || '?';
      if (q0.pj) {
        [['cnpj', 'CNPJ'], ['sede', 'sede']].forEach(([c, r]) => { if (!q0[c]) faltas.push(`Vendedora ${nome}: ${r}`); });
        const rq = Object.assign({}, q0.rep || {});
        if (!rq.nome) faltas.push(`Vendedora ${nome}: representante`);
        else {
          ['nacionalidade', 'profissao', 'rg', 'cpf', 'endereco', 'estado_civil'].forEach(c => { if (!rq[c]) faltas.push(`Representante ${rq.nome}: ${PROF(c)}`); });
          if (String(rq.estado_civil || '').toLowerCase() === 'casado' && !(rq.regime && rq.conjuge_nome)) faltas.push(`Representante ${rq.nome}: regime de bens e nome do cônjuge`);
        }
        partes.push(qualificarPJ(nome, q0, rq.nome ? qualificarRepresentante(rq) : '')); continue;
      }
      const q = Object.assign({}, q0);
      ['nacionalidade', 'profissao', 'rg', 'cpf', 'endereco'].forEach(c => { if (!q[c]) faltas.push(`Vendedor ${nome}: ${PROF(c)}`); });
      if (!q.estado_civil) faltas.push(`Vendedor ${nome}: estado civil (matrícula/certidão)`);
      const casado = q.estado_civil === 'casado';
      if (casado && !q.regime) faltas.push(`Vendedor ${nome}: regime de bens`);
      const a = conjugeDe(q);
      if (casado && !a) faltas.push(`Cônjuge anuente de ${nome}: informar e qualificar`);
      else if (a && !a.cpf) faltas.push(`Cônjuge anuente ${a.nome}: CPF`);
      if (a) anuentes.push(a.nome);
      if (m4 && casado && a) {
        if (!a.nacionalidade) faltas.push(`Cônjuge anuente ${a.nome}: nacionalidade`);
        if (!a.profissao) faltas.push(`Cônjuge anuente ${a.nome}: profissão`);
        partes.push(qualificarCasal(q, a));
      } else partes.push(qualificarM1(q, m4 ? null : a, m2 || m4));
    }
    val.partes_vendedoras = partes.join('; ');
    // compradores
    const comp = x.compradores || [], textos = [];
    if (!comp.length) faltas.push('Comprador: qualificação');
    for (const q of comp) {
      const nm = q.nome || '?';
      ['nome', 'nacionalidade', 'estado_civil', 'profissao', 'rg', 'cpf', 'endereco'].forEach(c => { if (!q[c]) faltas.push(`Comprador ${nm}: ${PROF(c)}`); });
      const a = q.conjuge_nome ? { nome: q.conjuge_nome, cpf: q.conjuge_cpf || '' } : null;
      const casado = String(q.estado_civil || '').toLowerCase() === 'casado';
      if (casado && !a) faltas.push(`Comprador ${nm}: cônjuge (nome e CPF)`);
      if ((m3 || m4) && casado) {
        const req = m4 ? [['conjuge_nacionalidade', 'nacionalidade'], ['conjuge_profissao', 'profissão'], ['regime', 'regime de bens']]
                       : [['conjuge_nacionalidade', 'nacionalidade'], ['conjuge_profissao', 'profissão'], ['conjuge_rg', 'RG'], ['regime', 'regime de bens']];
        req.forEach(([c, r]) => { if (!q[c]) faltas.push(c === 'regime' ? `Comprador ${nm}: regime de bens` : `Comprador ${nm}: ${r} do cônjuge`); });
      }
      textos.push(((m3 || m4) ? qualificarCompradorM3(q) : null) || qualificarM1(q, a, m2 || m4));
    }
    val.parte_compradora = textos.join('; ');
    // negociação
    let obrig = [['preco', 'preço'], ['sinal', 'sinal'], ['data_assinatura', 'data da assinatura']];
    if (m2) obrig.push(['comissao_valor', 'valor da comissão']);
    if (m3) obrig.push(['comissao_valor', 'valor da comissão'], ['banco_financiador', 'banco do financiamento']);
    if (m4) obrig.push(['comissao_valor', 'valor da comissão'], ['valor_fgts', 'valor dos recursos do FGTS']);
    if (m1) obrig.push(['sinal_data', 'data do sinal'], ['banco_financiador', 'banco do financiamento'], ['valor_financiado_aprox', 'valor financiado (aproximado)'],
                       ['valor_fgts_aprox', 'valor do FGTS (aproximado)'], ['caucao_valor', 'saldo do depósito-caução da locação'], ['comissao_valor', 'valor da comissão']);
    obrig.forEach(([k, r]) => { if (!N[k]) faltas.push('Negociação: ' + r); });
    const cs = (N.contas || []).filter(c => c && (c.nome || c.banco || c.conta || c.pix));
    if (!cs.length) faltas.push('Negociação: conta da parte vendedora (sinal e saldo)');
    if (m3 && cs.length && !cs[0].doc) faltas.push('Negociação: CPF/CNPJ do beneficiário da conta');
    const test = (N.testemunhas || []).filter(x2 => x2 && x2.nome);
    if (!test.length) faltas.push('Testemunhas (nome e CPF)');
    const pr = cent(N.preco), si = cent(N.sinal), saldo = pr != null && si != null ? pr - si : null;
    val.preco = moedaC(pr); val.preco_extenso = extensoC(pr); val.sinal = moedaC(si); val.sinal_extenso = extensoC(si); val.sinal_data = dataBr(N.sinal_data);
    val.saldo = moedaC(saldo); val.saldo_extenso = extensoC(saldo);
    val.conta_sinal_texto = contaSinal(cs);
    const ted = c => [c.banco && `no ${c.banco}`, [c.agencia && `Agência: ${c.agencia}`, c.conta && `Conta Corrente: ${c.conta}`].filter(Boolean).join(' ')].filter(Boolean).join(', ') + (c.pix ? `, Chave Pix: ${c.pix}` : '');
    val.conta_ted_texto = cs.length === 1 ? ted(cs[0]) : cs.map(c => `(${c.nome || ''}) ` + ted(c)).join('; ');
    val.prazo_escritura_du = String(N.prazo_escritura_du || '05').padStart(2, '0');
    const c0 = cs[0] || {};
    const m3c = (c, ini) => `${ini} nº ${c.conta || ''} da Agência nº ${c.agencia || ''}, do ${c.banco || ''}, de beneficiário ${c.nome || ''} (CPF/CNPJ nº ${c.doc || ''})`;
    val.conta_sinal_m3 = m3c(c0, 'na conta corrente'); val.conta_credito_m3 = m3c(c0, 'Conta').replace(', do ', ' do ');
    const pz = x.prazos || {};
    val.prazo_banco_dias = String(pz.banco || (m4 ? 60 : 90)); val.prazo_banco_extenso = extensoNum(val.prazo_banco_dias);
    val.prazo_documentos_dias = String(pz.docs || (m4 ? 30 : 20)); val.prazo_documentos_extenso = extensoNum(val.prazo_documentos_dias);
    val.clausula_programa = N.programa ? `3.3.1. AS PARTES tem ciência que o financiamento bancário será realizado através do programa ${N.programa} e seguirá os trâmites e prazos da Instituição.` : '';
    val.contribuinte_obs = N.contribuinte_obs ? ' ' + String(N.contribuinte_obs).trim() : '';
    val.contas_bancarias = cs.map(c => `${c.nome || ''} — banco ${c.banco || ''}, ag. ${c.agencia || ''}, c/c ${c.conta || ''}` + (c.pix ? `, Pix ${c.pix}` : '')).join('\n');
    val.banco_financiador = N.banco_financiador || ''; val.valor_financiado_aprox = moeda(N.valor_financiado_aprox); val.valor_fgts_aprox = moeda(N.valor_fgts_aprox);
    const fi = cent(N.valor_financiado_aprox), fa = cent(N.valor_fgts_aprox);
    if (saldo != null && fi != null && fa != null && fi + fa !== saldo) avisos.push(`Financiamento (${val.valor_financiado_aprox}) mais FGTS (${val.valor_fgts_aprox}) não fecham com o saldo (${val.saldo}).`);
    val.clausula_preaprovado = N.preaprovado ? `A PARTE COMPRADORA declara, ainda, possuir crédito pré-aprovado para o financiamento junto ao ${N.banco_financiador || ''}, cujas condições conhece e aceita.` : '';
    val.itens_permanecem = N.itens_permanecem || 'nenhum item além do imóvel';
    val.caucao_valor = moeda(N.caucao_valor); val.caucao_extenso = extensoReais(N.caucao_valor);
    val.comissao_valor = moeda(N.comissao_valor); val.comissao_extenso = extensoReais(N.comissao_valor); val.comissao = val.comissao_valor;
    val.comissao_beneficiarios = N.comissao_beneficiarios || '';
    val.comissao_participes = N.comissao_beneficiarios || (val.comissao_valor ? `- ${val.comissao_valor} (${val.comissao_extenso}) a ORGANIZACAO IMOBILIARIA NOVA SAO PAULO LTDA, CPF/CNPJ nº 62.407.218/0001-12, CRECI nº 02061-J, atuando como Imobiliária` : '');
    val.forma_pagamento_texto = N.forma_pagamento_texto || '';
    const pe = N.prazo_escritura_dias || pz.escritura || '';
    val.prazo_escritura_dias = String(pe); val.prazo_escritura_extenso = pe ? extensoNum(pe) : ''; val.foro = N.foro || '';
    val.data_assinatura = dataBr(N.data_assinatura); val.cidade_assinatura = N.cidade_assinatura || 'São Paulo - SP';
    val.cidade_assinatura_barra = val.cidade_assinatura.split(' - ').join(' / ').toUpperCase();
    val.local_data_assinatura = N.data_assinatura ? `${val.cidade_assinatura.split(' - ')[0]}, ${dataExt(N.data_assinatura)}` : '';
    val.testemunhas_texto = test.map(w => `${w.nome} (CPF nº ${w.cpf || ''})` + (w.cargo ? ` ${w.cargo}` : '')).join(' e ');
    const linha = '______________________________';
    val.assinaturas_vendedoras = vend.map(q => `${linha}\n${q.nome || ''}`).concat(anuentes.map(n => `${linha}\n${n} — cônjuge/anuente`)).join('\n\n');
    val.assinaturas_compradora = comp.map(q => `${linha}\n${q.nome || ''}` + (q.conjuge_nome ? `\n\n${linha}\n${q.conjuge_nome} — cônjuge/anuente` : '')).join('\n\n');
    val.assinaturas_testemunhas = test.map(w => `${linha}\n${w.nome} — CPF nº ${w.cpf || ''}`).join('\n\n');
    // Modelo 4 (à vista com FGTS)
    val.prazo_posse_dias = String(N.prazo_posse_dias || '15'); val.prazo_posse_extenso = extensoNum(val.prazo_posse_dias);
    const fg = cent(N.valor_fgts), vp = N.valor_proprio ? cent(N.valor_proprio) : (pr != null && si != null && fg != null ? pr - si - fg : null);
    val.valor_fgts = moedaC(fg); val.valor_fgts_extenso = extensoC(fg); val.valor_proprio = moedaC(vp); val.valor_proprio_extenso = extensoC(vp);
    if (m4 && vp != null && pr != null && si != null && fg != null && si + vp + fg !== pr) avisos.push('Sinal, recursos próprios e FGTS não fecham com o preço.');
    const conta = (fin, ini) => { const c = cs.find(y => (y.finalidade || '') === fin) || cs[0]; if (!c) return '';
      return fin === 'fgts' ? `na conta bancária nº ${c.conta || ''}, banco ${c.banco || ''}, agência ${c.agencia || ''} em nome de ${c.nome || ''}`
                            : `${ini}conta corrente nº ${c.conta || ''}, Banco ${c.banco || ''}, Agência: ${c.agencia || ''} em nome de ${String(c.nome || '').toUpperCase()}`; };
    val.conta_sinal_fgts = conta('sinal', 'na '); val.conta_proprios_fgts = conta('proprios', ''); val.conta_fgts_texto = conta('fgts', '');
    // usufruto (item 5 da análise): nome do usufrutuário vem do formulário
    const itens = x.itens || new Set(), usu = itens.has(5) ? String(N.usufrutuario || '').trim() : '';
    if (itens.has(5) && m4 && !usu) faltas.push('Usufruto apontado na matrícula: nome do usufrutuário');
    const nus = vend.map(q => q.nome).filter(n => n && !nomeIgual(n, usu || 'x x'));
    val.observacao_usufruto = usu && nus.length ? `Consta na matrícula que Sr(a). ${usu} na qualidade de usufrutuário(a) e na qualidade de nu-proprietário(s) ` + nus.map(n => `Sr(a). ${n}`).join(' e ') + '.' : '';
    val.exigencia_matricula = usu ? ' constando a renúncia do usufruto' : '';
    const clAuto = usu ? ['A parte vendedora compromete-se em realizar a escritura de renúncia ao usufruto dentro do prazo estipulado na cláusula 7.4 deste instrumento, ciente que todas as despesas de taxas e emolumentos cartorários serão de sua inteira responsabilidade.',
                          'As partes tem ciência que o processo bancário para liberação dos recursos de FGTS da parte compradora somente terá início a contar da entrega da matrícula devidamente regularizada, ou seja, constando as averbações e registros necessários.'] : [];
    const blocos = clAuto.concat(String(N.clausulas_adicionais || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean));
    val.clausulas_adicionais = blocos.map((b, i) => /^\d+\.\d+/.test(b) ? b : `2.${i + 3}. ${b}`).join('\n\n');
    val.clausulas_adicionais_preco = String(N.clausulas_adicionais_preco || '').trim();
    // pontos de atenção da análise
    const onus = [1, 2, 3, 5, 7, 8].filter(i => itens.has(i));
    if (onus.length && !m4) avisos.push(`A cláusula 1.1 do modelo declara o imóvel livre de ônus e de discussões, mas a análise aponta ressalva ou bloqueio de ônus/restrição (itens ${onus.join(', ')}): revisar com o jurídico antes de assinar.`);
    if ((x.positivas || []).length) avisos.push(`A cláusula 5.2 afirma que as certidões foram apresentadas e aceitas, sem indício de insolvência ou fraude, mas há certidão com apontamento (${x.positivas.join('; ')}): revisar com o jurídico antes de assinar.`);
    ['livre_de_onus', 'usufruto', 'partilha'].forEach(k => { val['clausula_' + k] = ''; }); val.clausulas_condicionais = '';
    val.empresa_vendedora = vend.filter(q => q.pj).map(q => q.nome).join(', ');
    const rp = x.responsaveis || {}, mk = x.marcos || {};
    val.gerente_responsavel = rp.gerente || ''; val.assistente_responsavel = rp.assistente || ''; val.corretor = rp.corretor || '';
    val.data_proposta = dataBr(mk.proposta_enviada); val.data_envio_banco = dataBr(mk.docs_banco);
    return { val, faltas, avisos };
  }

  // ══════════════ PREENCHER O WORD (preencher_docx) ══════════════
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const PH = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
  const AVISO = 'MINUTA PARA CONFERÊNCIA — campos preenchidos automaticamente em amarelo. Revisão e assinatura são humanas. Apagar este aviso antes de enviar.';
  // ordem dos filhos de w:rPr exigida pelo Word (para inserir o realce no lugar certo)
  const RPR_ORDEM = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
                     'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
  function poeNoRpr(doc, rPr, nome, attrs) {
    [...rPr.childNodes].filter(n => n.nodeType === 1 && n.localName === nome).forEach(n => rPr.removeChild(n));
    const el = doc.createElementNS(W, 'w:' + nome); Object.entries(attrs || {}).forEach(([k, v]) => el.setAttributeNS(W, 'w:' + k, v));
    const pos = RPR_ORDEM.indexOf(nome);
    const depois = [...rPr.childNodes].find(n => n.nodeType === 1 && RPR_ORDEM.indexOf(n.localName) > pos);
    rPr.insertBefore(el, depois || null);
  }
  const filhos = (el, nome) => [...el.childNodes].filter(n => n.nodeType === 1 && n.namespaceURI === W && n.localName === nome);
  // runs do próprio parágrafo (não os de caixas de texto aninhadas)
  const paiP = el => { let x = el.parentNode; while (x && !(x.namespaceURI === W && x.localName === 'p')) x = x.parentNode; return x; };
  const runsDe = p => [...p.getElementsByTagNameNS(W, 'r')].filter(r => paiP(r) === p);
  function textoParagrafo(p) {
    let t = '';
    runsDe(p).forEach(r => {
      for (const n of r.childNodes) { if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
        if (n.localName === 't') t += n.textContent; else if (n.localName === 'tab') t += '\t'; else if (n.localName === 'br' || n.localName === 'cr') t += '\n'; }
    });
    return t;
  }
  function limparParagrafo(p) { [...p.childNodes].forEach(n => { if (!(n.nodeType === 1 && n.namespaceURI === W && n.localName === 'pPr')) p.removeChild(n); }); }
  function escrever(doc, p, partes, baseRPr) {
    for (const [txt, ehValor] of partes) {
      if (!txt) continue;
      const linhas = String(txt).split('\n');
      linhas.forEach((ln, i) => {
        const r = doc.createElementNS(W, 'w:r');
        const rPr = baseRPr ? baseRPr.cloneNode(true) : doc.createElementNS(W, 'w:rPr');
        if (ehValor) poeNoRpr(doc, rPr, 'highlight', { val: 'yellow' });
        if (rPr.childNodes.length) r.appendChild(rPr);
        const te = doc.createElementNS(W, 'w:t'); te.setAttribute('xml:space', 'preserve'); te.textContent = ln; r.appendChild(te);
        if (i < linhas.length - 1) r.appendChild(doc.createElementNS(W, 'w:br'));
        p.appendChild(r);
      });
    }
  }
  function processaParagrafo(doc, p, val, usados, desc) {
    const texto = textoParagrafo(p); if (!texto.includes('{{')) return;
    const r0 = runsDe(p)[0], base = r0 ? filhos(r0, 'rPr')[0] || null : null;
    const unico = texto.trim().match(/^\{\{\s*([a-z0-9_]+)\s*\}\}$/);
    if (unico && Object.prototype.hasOwnProperty.call(val, unico[1]) && String(val[unico[1]] || '').includes('\n\n')) {
      usados.add(unico[1]); const blocos = String(val[unico[1]]).split('\n\n').map(b => b.trim()).filter(Boolean);
      const molde = p.cloneNode(true); let ant = p;
      limparParagrafo(p); escrever(doc, p, [[blocos[0], true]], base);
      for (const b of blocos.slice(1)) { const novo = molde.cloneNode(true); limparParagrafo(novo); escrever(doc, novo, [[b, true]], base); ant.parentNode.insertBefore(novo, ant.nextSibling); ant = novo; }
      return;
    }
    const partes = []; let pos = 0; PH.lastIndex = 0; let m;
    while ((m = PH.exec(texto))) {
      partes.push([texto.slice(pos, m.index), false]); const k = m[1];
      if (Object.prototype.hasOwnProperty.call(val, k)) { partes.push([String(val[k] == null ? '' : val[k]), true]); usados.add(k); } else { partes.push([m[0], false]); desc.add(k); }
      pos = m.index + m[0].length;
    }
    partes.push([texto.slice(pos), false]);
    limparParagrafo(p);
    const semValor = partes.filter(x => x[1]).every(x => !x[0]), semTexto = !partes.filter(x => !x[1]).some(x => x[0].trim());
    if (semValor && semTexto) { p.parentNode.removeChild(p); return; }          // parágrafo só com campo vazio (cláusula que não se aplica)
    escrever(doc, p, partes, base);
  }
  const _libs = {};
  function lib(url, global) {
    if (window[global]) return Promise.resolve();
    return _libs[url] || (_libs[url] = new Promise((ok, err) => { const s = document.createElement('script'); s.src = url; s.onload = ok;
      s.onerror = () => { delete _libs[url]; err(new Error('não consegui carregar ' + global)); }; document.head.appendChild(s); }));
  }
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  async function preencherDocx(arquivo, val, aviso) {
    await lib(JSZIP, 'JSZip');
    const r = await fetch(`modelos-nsp/${arquivo}?v=${MODELOS_V}`); if (!r.ok) throw new Error('modelo não encontrado (' + r.status + ')');
    const zip = await window.JSZip.loadAsync(await r.arrayBuffer()), usados = new Set(), desc = new Set();
    for (const nome of Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
      const xml = await zip.file(nome).async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('modelo com XML inválido: ' + nome);
      [...doc.getElementsByTagNameNS(W, 'p')].forEach(p => processaParagrafo(doc, p, val, usados, desc));
      if (nome === 'word/document.xml') {               // aviso de conferência no topo
        const body = doc.getElementsByTagNameNS(W, 'body')[0], prim = body && filhos(body, 'p')[0];
        if (prim) {
          const novo = prim.cloneNode(true); limparParagrafo(novo);
          const rr = doc.createElementNS(W, 'w:r'), rp = doc.createElementNS(W, 'w:rPr');
          poeNoRpr(doc, rp, 'b'); poeNoRpr(doc, rp, 'color', { val: 'C00000' }); poeNoRpr(doc, rp, 'sz', { val: '18' });
          const te = doc.createElementNS(W, 'w:t'); te.setAttribute('xml:space', 'preserve'); te.textContent = aviso || AVISO;
          rr.appendChild(rp); rr.appendChild(te); novo.appendChild(rr); body.insertBefore(novo, prim);
        }
      }
      let out = new XMLSerializer().serializeToString(doc);
      if (!/^<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + out;
      zip.file(nome, out);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: DOCX_MIME });
    return { blob, usados, desconhecidos: desc };
  }
  // PDF do Word preenchido (desenho do docx no navegador, sem quebrar parágrafo no meio da página)
  const DOCXPREV = 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js';
  async function pdfDoDocx(blob, nome) {
    await lib(JSZIP, 'JSZip'); await lib(DOCXPREV, 'docx'); await U().carregarHtml2pdf();
    const fora = document.createElement('div'); fora.style.cssText = 'position:fixed;left:-20000px;top:0;width:820px;background:#fff';
    const el = document.createElement('div'); el.style.background = '#fff'; fora.appendChild(el); document.body.appendChild(fora);
    try {
      await window.docx.renderAsync(blob, el, null, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, renderHeaders: false, renderFooters: false });
      const st = document.createElement('style'); st.textContent = 'section.docx{min-height:0!important;box-shadow:none!important;margin:0!important}'; el.appendChild(st);
      return await window.html2pdf().set({ margin: [12, 0, 12, 0], filename: nome, image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css'], before: 'section.docx ~ section.docx', avoid: ['p', 'tr'] } }).from(el).outputPdf('blob');
    } finally { fora.remove(); }
  }

  // ══════════════ LER A PROPOSTA (proposta.py) ══════════════
  const MES_N = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const limpa = v => String(v || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[ \t.,:;\-–]+|[ \t.,:;\-–]+$/g, '');
  function money(s) {
    s = String(s || '').replace(/[^\d,.]/g, ''); if (!s) return '';
    let int, dec;
    if (s.includes(',')) { const i = s.lastIndexOf(','); int = s.slice(0, i).replace(/\./g, ''); dec = (s.slice(i + 1) + '00').slice(0, 2); } else { int = s.replace(/\./g, ''); dec = '00'; }
    return int ? `${int},${dec}` : '';
  }
  const cpfFmt = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : limpa(s); };
  const dataP = s => { const m = String(s || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/); return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : ''; };
  function entre(L, ini, fim) {
    const i = L.findIndex(l => ini.test(l)); if (i < 0) return [];
    const out = [];
    for (const l of L.slice(i + 1)) {
      if (fim.test(l)) break;
      const x = limpa(l).replace(/^(?:o|[\-–•·])\s+/, '');
      if (x && !/^[()\s\-–xX]*$/.test(x) && !x.endsWith(':') && !/^(entre as partes|\(?caso tenha\)?)\W*$/i.test(x)) out.push(x);
    }
    return out;
  }
  function extrairProposta(texto) {
    const L = String(texto || '').split(/\r?\n/).map(l => l.trim()), tudo = L.join('\n'), d = {};
    let ic = L.findIndex(l => /Contrato a ORGANIZA/i.test(l)); if (ic < 0) ic = L.length;
    const cab = L.slice(0, ic), resto = L.slice(ic);
    let icj = cab.findIndex(l => /^C[ôo]njuge/i.test(l)); if (icj < 0) icj = cab.length;
    const comp = cab.slice(0, icj), conj = cab.slice(icj);
    const achar = (bloco, re, g = 1) => { for (const l of bloco) { const m = l.match(re); if (m) return limpa(m[g]); } return ''; };
    for (const l of comp) { const m = l.match(/^Eu\b[\s,:]*(.*)$/); if (m && limpa(m[1])) { d.comprador_nome = limpa(m[1]); break; } }
    const rgcpf = bloco => { for (const l of bloco) { const m = l.match(/RG\s*n?[°º.]?\s*[:\-]?\s*(.*?)\s*CPF\s*[:\-]?\s*(.*)$/i); if (m) return [limpa(m[1]), cpfFmt(m[2])]; } return ['', '']; };
    [d.comprador_rg, d.comprador_cpf] = rgcpf(comp); d.comprador_nascimento = dataP(achar(comp, /Data de nascimento\s*:?\s*(.*)$/i));
    for (const l of comp) { const m = l.match(/Estado civil\s*:?\s*(.*?)\s*Profiss[ãa]o\s*:?\s*(.*)$/i); if (m) { d.comprador_estado_civil = limpa(m[1]); d.comprador_profissao = limpa(m[2]); break; } }
    d.conjuge_nome = achar(conj, /C[ôo]njuge\s*:?\s*(.*)$/i); d.conjuge_profissao = achar(conj, /^Profiss[ãa]o\s*:?\s*(.*)$/i);
    d.regime = normRegime(achar(conj, /Regime de Bens.*?:\s*(.*)$/i)); [d.conjuge_rg, d.conjuge_cpf] = rgcpf(conj); d.conjuge_nascimento = dataP(achar(conj, /Data de nascimento\s*:?\s*(.*)$/i));
    d.comprador_endereco = achar(cab, /Endere[çc]o\s*:?\s*(.*)$/i); d.comprador_telefones = achar(cab, /Telefones?\s*:?\s*(.*)$/i);
    const em = achar(cab, /E-?mails?\s*:?\s*(.*)$/i); d.comprador_email = em ? ((em.match(/[\w.\-+]+@[\w.\-]+\.\w+/) || [em])[0]) : '';
    d.imovel_endereco = achar(resto.slice(0, 3), /situad[oa]\s+na\s*:?\s*(.*)$/i) || achar(L, /situad[oa]\s+na\s*:?\s*(.*)$/i);
    d.fac = achar(resto, /FAC\s*n?[°º.]?\s*:?\s*(.*)$/i); d.referencia = achar(resto, /Refer[êe]ncia do im[óo]vel\s*:?\s*(.*)$/i);
    let m = tudo.match(/PRE[ÇC]O\s+TOTAL\s+DE\s+R\$\s*([\d.]+(?:,\d{1,2})?)/i); d.preco = m ? money(m[1]) : '';
    m = tudo.match(/SINAL\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i); d.sinal = m ? money(m[1]) : '';
    for (const [k, re] of [['valor_proprio', /Recursos?\s+Pr[óo]prios?/i], ['valor_financiamento', /Financiamento/i], ['valor_fgts', /F\.?\s*G\.?\s*T\.?\s*S/i]]) {
      const l = resto.find(x => re.test(x) && /R\$/.test(x)) || ''; const mm = l.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/); d[k] = mm ? money(mm[1]) : '';
    }
    const lp = resto.find(x => /Prazo para Outorga/i.test(x)) || ''; const pz = limpa(lp.replace(/^.*Outorga da Escritura\s*:?/i, '')); d.prazo_escritura_texto = pz;
    const mp = pz.match(/(\d{1,3})\s*(?:\([^)]*\))?\s*dias/i) || pz.match(/(\d{1,3})/); d.prazo_escritura_dias = mp ? mp[1] : '';
    const lo = resto.find(x => /^OBS\b/i.test(x)) || '';
    d.obs = [limpa(lo.replace(/^OBS\s*:?/i, ''))].concat(entre(resto, /^OBS/i, /BENS E UTENS/i)).join(' ').trim();
    const moveis = entre(resto, /M[ÓO]VEIS que permanecer/i, /ELETRODOM/i), eletro = entre(resto, /^ELETRODOM/i, /UTENS[ÍI]LIOS E EQUIP/i), utens = entre(resto, /^UTENS[ÍI]LIOS E EQUIP/i, /DEMAIS OBSERVA/i);
    d.itens = moveis.concat(eletro, utens).join('; '); d.demais_observacoes = entre(resto, /DEMAIS OBSERVA/i, /^S[ãa]o Paulo,/i).join(' ');
    m = tudo.match(/S[ãa]o Paulo,\s*(\d{1,2})\s*de\s*([A-Za-zçÇ]+)\s*de\s*(\d{4})/);
    d.data_proposta = m && MES_N[m[2].toLowerCase()] ? `${m[1].padStart(2, '0')}/${String(MES_N[m[2].toLowerCase()]).padStart(2, '0')}/${m[3]}` : '';
    Object.keys(d).forEach(k => { if (!d[k]) delete d[k]; });
    const avisos = [];
    [['comprador_nome', 'nome do comprador'], ['comprador_cpf', 'CPF do comprador'], ['preco', 'preço total'], ['sinal', 'valor do sinal'], ['imovel_endereco', 'endereço do imóvel']]
      .forEach(([k, r]) => { if (!d[k]) avisos.push(`Não consegui ler: ${r}. Preencha na conferência.`); });
    if (!d.valor_proprio && !d.valor_financiamento && !d.valor_fgts) avisos.push('Não consegui ler a forma de pagamento (recursos próprios, financiamento ou FGTS).');
    return { dados: d, avisos };
  }
  function versaoSugerida(d, vendedorPJ) {
    const fin = (cent(d.valor_financiamento) || 0) > 0, fgts = (cent(d.valor_fgts) || 0) > 0;
    return fin ? (vendedorPJ ? '3' : '1') : (fgts ? '4' : '2');
  }
  async function textoDocx(buf) {
    await lib(JSZIP, 'JSZip');
    const zip = await window.JSZip.loadAsync(buf), f = zip.file('word/document.xml'); if (!f) throw new Error('não é um Word (.docx)');
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    return [...doc.getElementsByTagNameNS(W, 'p')].map(textoParagrafo).join('\n');
  }
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  async function textoPdf(buf) {
    await lib(PDFJS, 'pdfjsLib');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise, linhas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const it = (await (await pdf.getPage(i)).getTextContent()).items.filter(x => x.str != null);
      const porY = new Map();
      it.forEach(x => { const y = Math.round(x.transform[5] / 3) * 3; if (!porY.has(y)) porY.set(y, []); porY.get(y).push(x); });
      [...porY.keys()].sort((a, b) => b - a).forEach(y => linhas.push(porY.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(x => x.str).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return linhas.join('\n').replace(/[●•▪■]/g, '');
  }

  // ══════════════ ESTADO DA VENDA ABERTA ══════════════
  let S = null;            // { v, docs, ult, anexos, M, cfg }
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const mat = () => ((((S || {}).ult || {}).resultado) || {}).matricula || {};
  const tipoDe = v => v.versao_contrato ? 'modelo' + v.versao_contrato : '';
  const usaPJ = () => tipoDe(S.v) === 'modelo3';
  const quem = () => U().quem();
  async function carregar(v, docs, execs) {
    const ult = (execs || []).find(x => x.situacao === 'ok') || null;
    const [anexos, cfg] = await Promise.all([db.get('preanalise_anexo', `?venda_id=eq.${v.id}&select=*&order=enviado_em.asc`),
                                              db.get('preanalise_config', '?select=chave,valor').catch(() => [])]);
    S = { v, docs: docs || [], ult, anexos, M: clone(v.minuta), cfg: Object.fromEntries((cfg || []).map(c => [c.chave, c.valor])) };
    ['N', 'proposta', 'emitido'].forEach(k => { if (!S.M[k] || typeof S.M[k] !== 'object') S.M[k] = {}; });
    ['vendedores', 'compradores'].forEach(k => { if (!Array.isArray(S.M[k])) S.M[k] = []; });
    return S;
  }
  const recarregar = () => window.PreAnalise.venda(S.v.id);
  async function evento(acao, detalhe) { try { await db.post('preanalise_evento', { venda_id: S.v.id, por: quem(), acao, detalhe: detalhe || null }); } catch (_) {} }
  async function salvarM(extra) {
    const d = Object.assign({ minuta: S.M }, extra || {});
    await db.patch('preanalise_venda', S.v.id, d); Object.assign(S.v, d);
  }
  // pacote da Renata de 10/11: gerente, assistente e administrador emitem; só gerente e administrador decidem apontamentos
  const semAc = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ASSISTENTES = ['Leticia', 'Thais', 'Camille', 'Amanda', 'Karina', 'Juliana', 'Anderson'];
  function ehDaLista(lista) { const n = semAc(typeof CUR !== 'undefined' && CUR ? CUR.nome : ''); return !!n && lista.some(g => n.includes(semAc(g))); }
  const ehAdmin = () => typeof CUR !== 'undefined' && !!CUR && !!CUR.admin;
  const ehGerente = () => ehAdmin() || ehDaLista(typeof VENDAS_GERENTES !== 'undefined' ? VENDAS_GERENTES : []);
  const podeEmitir = () => ehGerente() || ehDaLista(ASSISTENTES);
  const podeDecidir = () => ehGerente();
  const conferida = () => !!(S.ult && S.v.leitura_conferida_exec === S.ult.id);
  const liberadaPorDecisao = () => {
    if (S.v.status !== 'ressalvas') return false;
    const ress = ((((S.ult || {}).resultado || {}).decisao || {}).motivos || {}).ressalva || [], ap = apontamentos(), d = S.v.decisoes_apontamentos || {};
    return ap.length > 0 && ress.every(t => /^Certid[ãa]o positiva/i.test(t)) && ap.every(a => (d[a.id] || {}).decisao === 'seguir');
  };
  const liberada = () => S.v.status === 'liberado' || ['aprovado', 'aprovado_ressalvas'].includes(S.v.revisao_status) || liberadaPorDecisao();
  function itensEncontrados() {
    const ck = (((S.ult || {}).resultado) || {}).checklist || [];
    return new Set(ck.filter(c => c.resultado === 'encontrado').map(c => c.item));
  }
  const certs = () => { const r = ((S.ult || {}).resultado) || {}; return (r.decisao && r.decisao.certidoes) || r.certidoes || []; };
  function positivas() {
    return certs().filter(c => !c.substituida && c.resultado === 'positiva').map(c => `${c.orgao}${c.refere_a ? ' de ' + c.refere_a : ''}`);
  }
  function entrada() {
    const v = S.v, m = mat();
    return { tipo: tipoDe(v), N: S.M.N, vendedores: S.M.vendedores, compradores: S.M.compradores, titulo: v.titulo,
             mat: { numero: v.matricula || m.numero || '', cartorio: v.cartorio || m.cartorio || '', contribuinte: v.sql_contribuinte || m.sql_contribuinte || '', descricao: m.descricao_imovel || '' },
             itens: itensEncontrados(), positivas: positivas(), prazos: { banco: v.prazo_retorno_banco_dias, docs: v.prazo_docs_banco_dias, escritura: v.prazo_escritura_dias },
             responsaveis: v.responsaveis || {}, marcos: v.marcos || {} };
  }
  // pessoas da venda (para os documentos pessoais): vendedores (ou representante da PJ), cônjuges, compradores e cônjuges
  function pessoas() {
    const out = [], poe = n => { n = String(n || '').trim(); if (n && !out.some(x => nomeIgual(x, n) || x === n)) out.push(n); };
    const vend = S.M.vendedores.length ? S.M.vendedores : ((mat().proprietarios_atuais || []).map(p => ({ nome: p.nome })));
    (vend.length ? vend : String(S.v.vendedores || '').split('\n').map(n => ({ nome: n }))).forEach(q => { if (q.pj) poe((q.rep || {}).nome); else poe(q.nome); poe(q.conjuge_nome); });
    const comp = S.M.compradores.length ? S.M.compradores : String(S.v.compradores || '').split('\n').map(n => ({ nome: n }));
    comp.forEach(q => { poe(q.nome); poe(q.conjuge_nome); });
    return out;
  }

  // ══════════════ PREENCHIMENTO AUTOMÁTICO (sem sobrescrever o que foi digitado) ══════════════
  function autopreencher() {
    const v = S.v, m = mat(), N = S.M.N, feito = [];
    const poe = (k, val, rot) => { if (val && !N[k]) { N[k] = val; feito.push(rot); } };
    poe('endereco_completo', v.titulo, 'endereço do imóvel (confira bairro, cidade e CEP)');
    poe('descricao_imovel', String(m.descricao_imovel || '').trim(), 'descrição do imóvel (da matrícula)');
    poe('data_assinatura', U().hojeIso(), 'data da assinatura (hoje)'); poe('cidade_assinatura', 'São Paulo - SP', 'cidade da assinatura');
    if (!(N.testemunhas || []).some(t => t && t.nome) && Array.isArray(S.cfg.testemunhas) && S.cfg.testemunhas.length) { N.testemunhas = clone(S.cfg.testemunhas); feito.push('testemunhas (padrão)'); }
    if (!S.M.vendedores.length) {
      const props = m.proprietarios_atuais || [];
      const nomes = props.length ? props.map(p => p.nome) : String(v.vendedores || '').split('\n').map(x => x.trim()).filter(Boolean);
      nomes.forEach(n => S.M.vendedores.push({ nome: n, nacionalidade: 'brasileiro(a)' })); if (nomes.length) feito.push(`vendedores (${props.length ? 'da matrícula' : 'da proposta'})`);
    }
    for (const q of S.M.vendedores) {
      const p = (m.proprietarios_atuais || []).find(x => nomeIgual(x.nome, q.nome) || x.nome === q.nome);
      if (p && !q.estado_civil && p.estado_civil) { q.estado_civil = normEC(p.estado_civil); feito.push(`estado civil de ${q.nome} (matrícula)`); }
      if (p && !q.regime && normRegime(p.regime_bens)) { q.regime = normRegime(p.regime_bens); feito.push(`regime de bens de ${q.nome} (matrícula)`); }
      if (!q.pj && !q.nacionalidade) q.nacionalidade = 'brasileiro(a)';
    }
    String(v.compradores || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(n => {
      if (S.M.compradores.some(c => nomeIgual(c.nome, n) || c.nome === n || nomeIgual(c.conjuge_nome, n))) return;
      S.M.compradores.push({ nome: n, nacionalidade: 'brasileiro(a)' }); feito.push(`comprador ${n}`);
    });
    return feito;
  }

  // ══════════════ ANEXOS ══════════════
  async function enviar(caminho, arquivo, mime) {
    const h = hdr({ 'Content-Type': mime || arquivo.type || 'application/octet-stream', 'x-upsert': 'false' }); delete h.Prefer;
    const r = await fetch(`${SBU}/storage/v1/object/${U().BUCKET}/${caminho}`, { method: 'POST', headers: h, body: arquivo });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (_) {} throw new Error(m || 'HTTP ' + r.status); }
  }
  const extDe = n => (String(n || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || '';
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', docx: DOCX_MIME };
  async function anexar(slot, f, pessoa) {
    const ext = extDe(f.name), mime = MIME[ext]; if (!mime) throw new Error(`${f.name}: formato não aceito`);
    if (f.size > MAX) throw new Error(`${f.name}: maior que 20 MB`);
    const caminho = `${S.v.id}/${slot}/${U().uuid()}.${ext}`;
    await enviar(caminho, f, mime);
    const [a] = await db.post('preanalise_anexo', { venda_id: S.v.id, slot, pessoa: pessoa || null, nome_arquivo: f.name, caminho, tamanho: f.size, mime, enviado_por: quem() });
    return a;
  }
  async function subirDoc(tipo, input) {             // matrícula e IPTU: entram na análise (preanalise_documento)
    const arqs = [...(input.files || [])]; if (!arqs.length) return;
    for (const f of arqs) {
      if (extDe(f.name) !== 'pdf') { U().aviso(`${f.name}: envie em PDF.`, 'err'); continue; }
      if (f.size > MAX) { U().aviso(`${f.name}: maior que 20 MB.`, 'err'); continue; }
      const caminho = `${S.v.id}/${U().uuid()}.pdf`;
      try { await enviar(caminho, f, 'application/pdf'); await db.post('preanalise_documento', { venda_id: S.v.id, tipo, nome_arquivo: f.name, caminho, tamanho: f.size, enviado_por: quem() }); }
      catch (e) { U().aviso(`${f.name}: ${e.message}`, 'err'); }
    }
    await evento('anexou', `${arqs.length} arquivo(s): ${tipo === 'iptu' ? 'IPTU' : 'matrícula'}`);
    U().aviso('Anexado. Rode a análise para ler o documento.', 'ok'); recarregar();
  }
  async function subirPessoais(input) {
    const arqs = [...(input.files || [])]; if (!arqs.length) return;
    const sel = (document.getElementById('cp-pessoa') || {}).value || '';
    const ps = pessoas(); let n = 0;
    for (const f of arqs) {
      let p = sel;
      if (!p) { const base = f.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' '); p = ps.find(x => nomeIgual(base, x) || tok(x).size && [...tok(x)].filter(w => tok(base).has(w)).length >= 2) || ''; }
      try { await anexar('pessoal', f, p || null); n++; } catch (e) { U().aviso(e.message, 'err'); }
    }
    if (n) await evento('anexou', `${n} documento(s) pessoal(is)`);
    recarregar();
  }
  async function definirPessoa(id, sel) {
    try { await db.patch('preanalise_anexo', id, { pessoa: sel.value || null }); const a = S.anexos.find(x => x.id === id); if (a) a.pessoa = sel.value || null; U().aviso('Anotado.', 'ok'); }
    catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }
  async function verAnexo(id) {
    const a = S.anexos.find(x => x.id === id) || S.docs.find(x => x.id === id); if (!a) return;
    const w = window.open('', '_blank');
    try { const u = await U().linkPdf(a.caminho); if (w) w.location = u; else window.open(u, '_blank'); } catch (e) { if (w) w.close(); U().aviso(e.message, 'err'); }
  }
  async function tirarAnexo(id) {
    const a = S.anexos.find(x => x.id === id); if (!a || !confirm(`Tirar "${a.nome_arquivo}" desta venda?`)) return;
    try { await U().apagarPdfs([a.caminho]); await db.del('preanalise_anexo', id); await evento('tirou anexo', a.nome_arquivo); recarregar(); } catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }

  // ── proposta de compra: anexa, lê e mostra para conferência ──
  async function subirProposta(input) {
    const f = (input.files || [])[0]; if (!f) return;
    const ext = extDe(f.name); if (!['docx', 'pdf'].includes(ext)) { U().aviso('Envie a proposta em Word (.docx) ou PDF.', 'err'); return; }
    const st = document.getElementById('cp-prop-st'); if (st) st.textContent = 'Lendo a proposta…';
    try {
      const buf = await f.arrayBuffer();
      const texto = ext === 'docx' ? await textoDocx(buf) : await textoPdf(buf);
      const { dados, avisos } = extrairProposta(texto);
      if (texto.trim().length < 60) avisos.unshift('O arquivo quase não tem texto (PDF escaneado?): preencha os dados à mão.');
      const a = await anexar('proposta', f);
      S.M.proposta = { anexo_id: a.id, arquivo: f.name, dados, avisos, por: quem(), lida_em: new Date().toISOString() };
      await salvarM(); await evento('proposta lida', `${f.name}: ${Object.keys(dados).length} campo(s)`);
      U().aviso('Proposta lida: confira os dados e aplique à venda.', 'ok'); recarregar();
    } catch (e) { if (st) st.textContent = ''; U().aviso('Não consegui ler a proposta: ' + e.message, 'err'); }
  }
  const PROP_CAMPOS = [['comprador_nome', 'Comprador'], ['comprador_cpf', 'CPF'], ['comprador_rg', 'RG'], ['comprador_estado_civil', 'Estado civil'], ['comprador_profissao', 'Profissão'],
    ['comprador_endereco', 'Endereço'], ['comprador_email', 'E-mail'], ['comprador_telefones', 'Telefones'], ['conjuge_nome', 'Cônjuge'], ['conjuge_cpf', 'CPF do cônjuge'], ['conjuge_rg', 'RG do cônjuge'],
    ['conjuge_profissao', 'Profissão do cônjuge'], ['regime', 'Regime de bens'], ['imovel_endereco', 'Imóvel'], ['fac', 'FAC'], ['preco', 'Preço total (R$)'], ['sinal', 'Sinal (R$)'],
    ['valor_proprio', 'Recursos próprios (R$)'], ['valor_financiamento', 'Financiamento (R$)'], ['valor_fgts', 'FGTS (R$)'], ['prazo_escritura_dias', 'Prazo da escritura (dias)'],
    ['itens', 'Itens que permanecem'], ['obs', 'Observações'], ['demais_observacoes', 'Demais observações'], ['data_proposta', 'Data da proposta (dd/mm/aaaa)']];
  function propostaHTML() {
    const p = S.M.proposta; if (!p || !p.dados) return '';
    const inp = 'padding:5px 7px;border:1.5px solid var(--borda);border-radius:6px;font-size:12.5px;width:100%;box-sizing:border-box';
    return `<details style="margin-top:8px" ${p.aplicada_em ? '' : 'open'}><summary style="cursor:pointer;font-size:13px;color:var(--pri,#0088CC)">${p.aplicada_em ? 'Dados lidos da proposta (aplicados)' : 'Conferir os dados lidos e aplicar à venda'}</summary>
      ${(p.avisos || []).length ? `<div style="font-size:12px;color:#b45309;margin:6px 0">${p.avisos.map(esc).join('<br>')}</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px 10px;margin-top:6px">${PROP_CAMPOS.map(([k, r]) => `<label style="font-size:11.5px;color:var(--muted)">${r}<input id="cp-pr-${k}" value="${esc(k === 'regime' ? (REGIME_TXT[p.dados[k]] || p.dados[k] || '') : (p.dados[k] || ''))}" style="${inp}"></label>`).join('')}</div>
      <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12.5px">
        <label><input type="checkbox" id="cp-pr-sobre"> substituir o que já foi digitado</label><label><input type="checkbox" id="cp-pr-obs"> observações como cláusula adicional</label>
        <button class="btn btn-p bsm" onclick="PACompr.aplicarProposta()">Aplicar à venda</button></div></details>`;
  }
  async function aplicarProposta() {
    const d = {}; PROP_CAMPOS.forEach(([k]) => { const x = ((document.getElementById('cp-pr-' + k) || {}).value || '').trim(); if (x) d[k] = x; });
    const sobre = (document.getElementById('cp-pr-sobre') || {}).checked, obsCl = (document.getElementById('cp-pr-obs') || {}).checked;
    const N = S.M.N, feito = [], extra = {};
    const poe = (k, val, rot) => { if (val && (sobre || !N[k])) { N[k] = val; feito.push(rot); } };
    poe('preco', d.preco, 'preço'); poe('sinal', d.sinal, 'sinal'); poe('valor_proprio', d.valor_proprio, 'recursos próprios');
    poe('valor_financiado_aprox', d.valor_financiamento, 'financiamento'); poe('valor_fgts_aprox', d.valor_fgts, 'FGTS'); poe('valor_fgts', d.valor_fgts, 'FGTS');
    poe('endereco_completo', d.imovel_endereco, 'endereço do imóvel'); poe('itens_permanecem', d.itens, 'itens que permanecem');
    if (/^\d+$/.test(d.prazo_escritura_dias || '')) poe('prazo_escritura_dias', d.prazo_escritura_dias, 'prazo da escritura');
    if (d.comprador_nome) {
      const cpf = String(d.comprador_cpf || '').replace(/\D/g, '');
      let alvo = S.M.compradores.find(c => (cpf && String(c.cpf || '').replace(/\D/g, '') === cpf) || nomeIgual(c.nome, d.comprador_nome) || c.nome === d.comprador_nome);
      const novo = { nome: d.comprador_nome, nacionalidade: 'brasileiro(a)', estado_civil: normEC(d.comprador_estado_civil), profissao: d.comprador_profissao || '', rg: d.comprador_rg || '',
        cpf: d.comprador_cpf || '', email: d.comprador_email || '', endereco: d.comprador_endereco || '', regime: normRegime(d.regime), conjuge_nome: d.conjuge_nome || '', conjuge_cpf: d.conjuge_cpf || '',
        conjuge_nacionalidade: d.conjuge_nome ? 'brasileiro(a)' : '', conjuge_profissao: d.conjuge_profissao || '', conjuge_email: '', conjuge_rg: d.conjuge_rg || '' };
      if (!alvo) { S.M.compradores.push(novo); feito.push(`comprador ${d.comprador_nome} (novo)`); }
      else { Object.entries(novo).forEach(([k, x]) => { if (x && (sobre || !alvo[k])) alvo[k] = x; }); feito.push(`dados do comprador ${alvo.nome}`); }
      const lin = String(S.v.compradores || '').split('\n').map(x => x.trim()).filter(Boolean);
      [d.comprador_nome, d.conjuge_nome].filter(Boolean).forEach(n => { if (!lin.some(x => nomeIgual(x, n) || x === n)) lin.push(n); });
      extra.compradores = lin.join('\n') || null;
    }
    const dm = String(d.data_proposta || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dm && !(S.v.marcos || {}).proposta_enviada) { extra.marcos = Object.assign({}, S.v.marcos || {}, { proposta_enviada: `${dm[3]}-${dm[2]}-${dm[1]}` }); feito.push('data da proposta'); }
    if (!S.v.versao_contrato) { extra.versao_contrato = versaoSugerida(d, S.M.vendedores.some(q => q.pj)); feito.push(`versão do contrato sugerida: Modelo ${extra.versao_contrato}`); }
    if (obsCl && (d.obs || d.demais_observacoes)) { N.clausulas_adicionais = (String(N.clausulas_adicionais || '').trim() + '\n\nObservações da proposta de compra: ' + [d.obs, d.demais_observacoes].filter(Boolean).join(' ')).trim(); feito.push('observações como cláusula adicional'); }
    Object.assign(S.M.proposta, { dados: d, aplicada_em: new Date().toISOString(), aplicada_por: quem() });
    try { await salvarM(extra); await evento('proposta aplicada', feito.join('; ').slice(0, 300)); U().aviso(feito.length ? 'Aplicado: ' + feito.join('; ') : 'Nada novo para aplicar.', 'ok'); recarregar(); }
    catch (e) { U().aviso('Erro: ' + e.message, 'err'); }
  }

  // ══════════════ CARTÃO NA VENDA ══════════════
  const chip = (ok, t) => `<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700;${ok ? 'background:#dcfce7;color:#166534' : 'background:#fee2e2;color:#991b1b'}">${t}</span>`;
  const quando = a => `<span style="color:var(--muted);font-size:11.5px">${esc(a.enviado_por || '')} · ${U().dt(a.enviado_em)}</span>`;
  const btnMini = (fn, t) => `<button class="btn btn-o bsm" style="padding:2px 8px" onclick="${fn}">${t}</button>`;
  function prontidao() {
    const m = mat(), p = S.M.proposta || {}, itens = [];
    const temMat = S.docs.some(d => d.tipo === 'matricula');
    itens.push({ rot: 'Proposta de compra', ok: !!p.aplicada_em, bloq: false, txt: p.aplicada_em ? 'aplicada à venda' : (p.lida_em ? 'lida: falta conferir e aplicar' : 'não anexada: o preço e o comprador vêm dela') });
    itens.push({ rot: 'Matrícula', ok: conferida(), bloq: true, txt: conferida() ? `nº ${esc(S.v.matricula || m.numero || '')} lida e conferida` : (!temMat ? 'anexe a matrícula' : (!S.ult ? 'rode a análise' : 'confira a leitura da matrícula (botão "Confirmar leitura")')) });
    const ps = pessoas(), sem = ps.filter(n => !S.anexos.some(a => a.slot === 'pessoal' && a.pessoa && (a.pessoa === n || nomeIgual(a.pessoa, n))));
    itens.push({ rot: 'Documentos pessoais', ok: ps.length > 0 && !sem.length, bloq: false, txt: !ps.length ? 'informe vendedores e compradores' : (sem.length ? 'faltam de: ' + esc(sem.join(', ')) : 'de todas as partes anexados') });
    const iptu = S.docs.filter(d => d.tipo === 'iptu');
    itens.push({ rot: 'IPTU', ok: iptu.length > 0, bloq: false, txt: iptu.length ? 'anexado' + (S.v.sql_contribuinte || m.sql_contribuinte ? `, contribuinte ${esc(S.v.sql_contribuinte || m.sql_contribuinte)}` : '') : 'anexe a certidão de débitos ou o comprovante do IPTU' });
    itens.push({ rot: 'Análise das certidões', ok: liberada(), bloq: true, txt: liberada() ? (S.v.status === 'liberado' ? 'Liberado' : liberadaPorDecisao() ? 'Liberada: o gerente decidiu seguir sem o jurídico em todos os apontamentos' : 'aprovada pelo jurídico') : `status: ${esc(((U().STATUS[S.v.status] || {}).lb) || 'sem análise')}; resolva os apontamentos ou peça a revisão jurídica` });
    const r = montar(entrada());
    itens.push({ rot: 'Dados do compromisso', ok: !r.faltas.length, bloq: false, txt: !r.faltas.length ? 'completos' : `${r.faltas.length} campo(s) faltando: ${esc(r.faltas.slice(0, 3).join('; '))}${r.faltas.length > 3 ? '…' : ''}. Não impede a emissão: sai como rascunho e você completa antes da assinatura`, acao: 'PACompr.abrirDados()' });
    return { itens, pronto: itens.every(i => !i.bloq || i.ok), r };
  }
  function cardHTML(erro) {
    if (erro) return `<div class="card" style="margin-bottom:12px"><div class="cb" style="font-size:13px;color:#b45309">Compromisso de venda e compra indisponível: ${esc(erro)}. O SQL 2026-11-10-preanalise-compromisso.sql já rodou?</div></div>`;
    if (!S) return '';
    const p = S.M.proposta || {}, m = mat(), pron = prontidao(), em = S.M.emitido || {};
    const box = 'background:var(--card,#fff);border:1px solid var(--borda,#e2e8f0);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px';
    const fin = 'font-size:12.5px;max-width:100%';
    const matDocs = S.docs.filter(d => d.tipo === 'matricula'), iptu = S.docs.filter(d => d.tipo === 'iptu'), pes = S.anexos.filter(a => a.slot === 'pessoal'), ps = pessoas();
    const propA = S.anexos.filter(a => a.slot === 'proposta'), compA = S.anexos.filter(a => a.slot === 'compromisso');
    const tribut = certs().find(c => c.orgao === 'tributos_imovel' && !c.substituida);
    const docLinha = d => `<div style="font-size:12px">${esc(d.nome_arquivo)} ${quando(d)} ${btnMini(`PACompr.verAnexo('${d.id}')`, 'Ver')}</div>`;
    return `<div class="card" style="margin-bottom:12px" id="cp-card"><div class="cb">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <div style="font-weight:700;font-size:15px">📝 Compromisso de venda e compra</div>
        <button class="btn btn-o bsm" onclick="PACompr.modelos()">📚 Modelos da NSP</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">
        <div style="${box}" id="cp-slot-proposta"><b>1 · Proposta de compra</b>${p.lida_em ? chip(true, p.aplicada_em ? 'lida e aplicada' : 'lida: conferir') : chip(false, 'falta anexar')}
          ${propA.length ? propA.slice(-1).map(a => `<div style="font-size:12px">${esc(a.nome_arquivo)} ${quando(a)} ${btnMini(`PACompr.verAnexo('${a.id}')`, 'Ver')}</div>`).join('') : '<div style="font-size:12px;color:var(--muted)">Word ou PDF no modelo da NSP: o sistema lê e o gerente confere.</div>'}
          <input type="file" accept=".docx,.pdf" style="${fin}" onchange="PACompr.subirProposta(this)"><span id="cp-prop-st" style="font-size:12px;color:var(--muted)"></span></div>
        <div style="${box}" id="cp-slot-matricula"><b>2 · Matrícula</b>${matDocs.length ? chip(conferida(), conferida() ? 'lida e conferida' : (S.ult ? 'lida: falta conferir' : 'anexada: rodar a análise')) : chip(false, 'falta anexar')}
          ${matDocs.length ? matDocs.slice(-2).map(docLinha).join('') : '<div style="font-size:12px;color:var(--muted)">PDF atualizado, com no máximo 30 dias.</div>'}
          <input type="file" accept=".pdf" style="${fin}" onchange="PACompr.subirDoc('matricula', this)"></div>
        <div style="${box}" id="cp-slot-pessoais"><b>3 · Documentos pessoais</b><div style="font-size:12px;color:var(--muted)">RG ou CNH, CPF, certidão de casamento, comprovante de residência. PDF, JPG ou PNG.</div>
          <ul style="list-style:none;margin:0;padding:0;font-size:12.5px">${ps.map(n => { const k = pes.filter(a => a.pessoa && (a.pessoa === n || nomeIgual(a.pessoa, n))).length;
            return `<li style="color:${k ? '#166534' : '#991b1b'}">${k ? '✓' : '○'} ${esc(n)} <span style="color:var(--muted)">${k} arquivo(s)</span></li>`; }).join('') || '<li style="color:var(--muted)">Informe vendedores e compradores.</li>'}</ul>
          ${pes.length ? `<details><summary style="cursor:pointer;font-size:12px;color:var(--pri,#0088CC)">Arquivos (${pes.length})</summary>${pes.map(a => `<div style="font-size:12px;margin-top:4px">${esc(a.nome_arquivo)}
            <select style="font-size:11.5px;max-width:150px" onchange="PACompr.definirPessoa('${a.id}', this)"><option value="">(de quem é? conferir)</option>${ps.map(n => `<option ${a.pessoa === n || (a.pessoa && nomeIgual(a.pessoa, n)) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            ${quando(a)} ${btnMini(`PACompr.verAnexo('${a.id}')`, 'Ver')} ${btnMini(`PACompr.tirarAnexo('${a.id}')`, '✕')}</div>`).join('')}</details>` : ''}
          <select id="cp-pessoa" style="${fin};padding:4px"><option value="">(identificar pelo nome do arquivo)</option>${ps.map(n => `<option>${esc(n)}</option>`).join('')}</select>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style="${fin}" onchange="PACompr.subirPessoais(this)"></div>
        <div style="${box}" id="cp-slot-iptu"><b>4 · IPTU</b>${iptu.length ? chip(true, 'anexado') : chip(false, 'falta anexar')}
          ${iptu.length ? iptu.slice(-2).map(docLinha).join('') + `<div style="font-size:12px">${S.v.sql_contribuinte || m.sql_contribuinte ? 'Contribuinte da matrícula: <b>' + esc(S.v.sql_contribuinte || m.sql_contribuinte) + '</b>' : ''}${tribut ? (tribut.data_emissao ? ` · certidão emitida em ${U().dia(tribut.data_emissao)}` : ' · <b style="color:#b45309">sem data de emissão lida: confira</b>') : (S.ult ? ' · <span style="color:#b45309">rode a análise de novo para ler o IPTU</span>' : '')}</div>`
            : '<div style="font-size:12px;color:var(--muted)">Certidão de débitos de IPTU ou comprovante de quitação, em PDF (o contribuinte é conferido com a matrícula na análise).</div>'}
          <input type="file" accept=".pdf" style="${fin}" onchange="PACompr.subirDoc('iptu', this)"></div>
      </div>
      ${propostaHTML()}
      <div style="margin-top:12px;border-top:1px solid var(--borda,#e2e8f0);padding-top:10px" id="cp-emitir">
        <ul style="list-style:none;margin:0 0 8px;padding:0">${pron.itens.map(i => `<li style="padding:5px 0;border-top:1px solid #eef1f6;font-size:13px">
          <span style="display:inline-block;width:20px;font-weight:700;color:${i.ok ? '#166534' : (i.bloq ? '#b91c1c' : '#b45309')}">${i.ok ? '✓' : '!'}</span><b>${i.rot}</b>: ${i.txt}
          ${!i.ok && i.acao ? ` <a href="#" onclick="event.preventDefault();${i.acao}">completar</a>` : ''}</li>`).join('')}</ul>
        ${pron.r.avisos.length ? `<div style="font-size:12.5px;color:#b45309;margin-bottom:8px">${pron.r.avisos.map(a => '⚠️ ' + esc(a)).join('<br>')}</div>` : ''}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${podeEmitir() ? `<button class="btn btn-p" style="font-size:15px;padding:10px 20px${pron.pronto ? '' : ';opacity:.45;cursor:not-allowed'}" ${pron.pronto ? '' : 'disabled title="Resolva os itens em vermelho"'} onclick="PACompr.emitir()" id="cp-btn-emitir">Emitir compromisso de venda e compra</button>
            ${pron.pronto ? ((S.M.emitido || {}).rascunho ? '<span style="font-size:12px;color:var(--muted)">a última emissão é um rascunho: complete os dados e emita de novo</span>' : '') : '<span style="font-size:12px;color:var(--muted)">resolva os itens em vermelho para liberar o botão</span>'}` : '<span style="font-size:12.5px;color:var(--muted)">Só gerente, assistente e administrador emitem o compromisso.</span>'}
          <button class="btn btn-o" onclick="PACompr.abrirDados()">Dados do compromisso</button>
          <span id="cp-st" style="font-size:12.5px;color:var(--muted)"></span></div>
        ${em.em && em.rascunho ? `<div style="margin-top:8px;font-size:13px;background:#fef3c7;border:1px solid #f0c48a;border-radius:8px;padding:8px 10px;color:#7a3b00"><b>Rascunho com ${(em.faltas || []).length} pendência(s)</b>: ${esc((em.faltas || []).slice(0, 5).join('; '))}${(em.faltas || []).length > 5 ? '…' : ''}. <a href="#" onclick="event.preventDefault();PACompr.abrirDados()">Completar</a></div>` : ''}
        ${em.em ? `<div style="margin-top:8px;font-size:13px">Última emissão: <b>${U().dt(em.em)}</b> por ${esc(em.por || '')} · ${esc(em.modelo || '')}
          ${em.docx_id ? ' · ' + btnMini(`PACompr.verAnexo('${em.docx_id}')`, 'Word') : ''}${em.pdf_id ? ' ' + btnMini(`PACompr.verAnexo('${em.pdf_id}')`, 'PDF') : ''}
          ${(em.avisos || []).length ? `<div style="font-size:12px;color:#b45309">${em.avisos.map(esc).join('<br>')}</div>` : ''}
          <div style="font-size:12px;color:var(--muted)">${em.rascunho ? 'Rascunho: não enviar para assinatura antes de completar e emitir de novo.' : 'Confira a minuta (texto preenchido em amarelo) e apague o aviso do topo antes de enviar.'} Envio para assinatura (Clicksign): depois.</div></div>` : ''}
        ${compA.length > 2 ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Emissões anteriores (${compA.length})</summary>${compA.map(a => `<div style="font-size:12px">${esc(a.nome_arquivo)} ${quando(a)} ${btnMini(`PACompr.verAnexo('${a.id}')`, 'Abrir')}</div>`).join('')}</details>` : ''}
      </div>
      <div id="cp-dados"></div>
    </div></div>`;
  }

  // ══════════════ FORMULÁRIO: DADOS DO COMPROMISSO ══════════════
  // [chave, rótulo, modelos ('' = todos), tipo]
  const CN = [
    ['endereco_completo', 'Endereço completo do imóvel', '', 'text'], ['descricao_imovel', 'Descrição do imóvel (conforme a matrícula)', '', 'area'],
    ['averbacoes_imovel', 'Averbações do imóvel', '1', 'area'], ['contribuinte_obs', 'Observação do contribuinte (ex.: área maior)', '3', 'text'],
    ['preco', 'Preço (R$)', '', 'text'], ['sinal', 'Sinal (R$)', '', 'text'], ['sinal_data', 'Data do sinal', '1', 'date'],
    ['valor_proprio', 'Recursos próprios (R$; vazio = preço − sinal − FGTS)', '4', 'text'], ['valor_fgts', 'Recursos do FGTS (R$)', '4', 'text'],
    ['banco_financiador', 'Banco do financiamento', '1,3', 'text'], ['valor_financiado_aprox', 'Valor financiado aproximado (R$)', '1', 'text'], ['valor_fgts_aprox', 'FGTS aproximado (R$)', '1', 'text'],
    ['programa', 'Programa do financiamento (se houver)', '3', 'text'], ['preaprovado', 'Comprador com crédito pré-aprovado', '1', 'check'],
    ['caucao_valor', 'Saldo do depósito-caução da locação (R$)', '1', 'text'],
    ['comissao_valor', 'Valor da comissão (R$)', '', 'text'], ['comissao_beneficiarios', 'Beneficiários da comissão (vazio = só a NSP)', '2,3,4', 'area'],
    ['prazo_escritura_du', 'Prazo da escritura (dias úteis)', '2', 'text'], ['prazo_posse_dias', 'Prazo da posse (dias; padrão 15)', '4', 'text'],
    ['itens_permanecem', 'Itens que permanecem no imóvel', '', 'area'],
    ['corretor_nome', 'Corretora que apresentou o imóvel (cláusula 4.7.6)', '2', 'text'], ['corretor_creci', 'CRECI da corretora', '2', 'text'],
    ['aquisicao_data', 'Aquisição pelo vendedor: data', '2', 'text'], ['aquisicao_titulo', 'Aquisição: título (ex.: escritura de venda e compra)', '2', 'text'],
    ['aquisicao_antecessores', 'Aquisição: vendedores anteriores', '2', 'text'], ['aquisicao_pagamento', 'Aquisição: pagamento (padrão: recursos próprios)', '2', 'text'],
    ['usufrutuario', 'Usufrutuário (se a matrícula tiver usufruto)', '4', 'text'],
    ['clausulas_adicionais', 'Cláusulas adicionais (uma por parágrafo; numeração 2.3, 2.4…)', '4', 'area'], ['clausulas_adicionais_preco', 'Cláusulas adicionais do preço', '4', 'area'],
    ['data_assinatura', 'Data da assinatura', '', 'date'], ['cidade_assinatura', 'Cidade da assinatura', '', 'text']];
  const PF = [['nome', 'Nome completo'], ['nacionalidade', 'Nacionalidade'], ['profissao', 'Profissão'], ['rg', 'RG'], ['cpf', 'CPF'], ['email', 'E-mail'], ['endereco', 'Endereço (residência)']];
  const CONJ = [['conjuge_nome', 'Cônjuge/companheiro(a)'], ['conjuge_cpf', 'CPF do cônjuge'], ['conjuge_rg', 'RG do cônjuge'], ['conjuge_nacionalidade', 'Nacionalidade do cônjuge'],
                ['conjuge_profissao', 'Profissão do cônjuge'], ['conjuge_email', 'E-mail do cônjuge']];
  const CONTA = [['nome', 'Titular', 130], ['doc', 'CPF/CNPJ', 110], ['banco', 'Banco', 110], ['agencia', 'Agência', 70], ['conta', 'Conta', 90], ['pix', 'Pix', 110], ['valor', 'Valor (se dividir)', 90]];
  const ist = 'padding:6px 8px;border:1.5px solid var(--borda);border-radius:7px;font-size:12.5px;width:100%;box-sizing:border-box';
  const campo = (id, rot, val, tipo, extra) => tipo === 'area' ? `<label style="font-size:11.5px;color:var(--muted);grid-column:1/-1">${rot}<textarea data-cp="${id}" rows="2" style="${ist}" ${extra || ''}>${esc(val || '')}</textarea></label>`
    : tipo === 'check' ? `<label style="font-size:12.5px;align-self:end"><input type="checkbox" data-cp="${id}" ${val ? 'checked' : ''}> ${rot}</label>`
    : `<label style="font-size:11.5px;color:var(--muted)">${rot}<input data-cp="${id}" ${tipo === 'date' ? 'type="date"' : ''} value="${esc(val || '')}" style="${ist}" ${extra || ''}></label>`;
  const sel = (id, rot, val, ops) => `<label style="font-size:11.5px;color:var(--muted)">${rot}<select data-cp="${id}" style="${ist}"><option value="">—</option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${val === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const grade = h => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px 10px">${h}</div>`;
  const REG_OPS = Object.entries(REGIME_TXT).map(([k, t]) => [k, cap1(t)]);
  function pessoaHTML(lado, i, q) {
    const p = `${lado}.${i}.`, pj = lado === 'V' && q.pj, cas = ['casado', 'união estável'].includes(String(q.estado_civil || ''));
    let h = `<div style="border:1px solid var(--borda,#e2e8f0);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px"><b style="font-size:13px">${lado === 'V' ? 'Vendedor' : 'Comprador'} ${i + 1}</b>
      <span>${lado === 'V' && (usaPJ() || q.pj) ? `<label style="font-size:12px;margin-right:10px"><input type="checkbox" data-cp="${p}pj" ${q.pj ? 'checked' : ''} onchange="PACompr.redesenhar()"> pessoa jurídica</label>` : ''}${btnMini(`PACompr.tirarPessoa('${lado}', ${i})`, 'Tirar')}</span></div>`;
    if (pj) {
      const r = q.rep || {};
      h += grade(campo(p + 'nome', 'Razão social', q.nome) + campo(p + 'cnpj', 'CNPJ', q.cnpj) + campo(p + 'email', 'E-mail', q.email) + campo(p + 'sede', 'Sede (endereço)', q.sede));
      h += `<div style="font-size:12px;font-weight:700;margin:8px 0 4px">Representante</div>` + grade(PF.map(([k, t]) => campo(p + 'rep.' + k, t, r[k])).join('') +
        sel(p + 'rep.estado_civil', 'Estado civil', r.estado_civil, EST_CIVIL) + sel(p + 'rep.regime', 'Regime de bens', r.regime, REG_OPS) + campo(p + 'rep.conjuge_nome', 'Cônjuge', r.conjuge_nome));
    } else {
      h += grade(PF.map(([k, t]) => campo(p + k, t, q[k])).join('') + sel(p + 'estado_civil', 'Estado civil', q.estado_civil, EST_CIVIL).replace('<select', '<select onchange="PACompr.redesenhar()"') +
        (cas ? sel(p + 'regime', 'Regime de bens', q.regime, REG_OPS) : ''));
      if (cas || q.conjuge_nome) h += `<div style="font-size:12px;font-weight:700;margin:8px 0 4px">${lado === 'V' ? 'Cônjuge anuente' : 'Cônjuge ou companheiro(a)'}</div>` + grade(CONJ.map(([k, t]) => campo(p + k, t, q[k])).join(''));
    }
    return h + '</div>';
  }
  function dadosHTML() {
    const v = S.v, t = tipoDe(v), n = t.slice(-1), N = S.M.N, r = montar(entrada());
    const vis = ms => !ms || ms.split(',').includes(n);
    const contas = (N.contas && N.contas.length ? N.contas : [{}]), test = (N.testemunhas && N.testemunhas.length ? N.testemunhas : [{}, {}]);
    const fin = t === 'modelo4';
    return `<div style="margin-top:12px;border-top:2px solid var(--borda,#e2e8f0);padding-top:10px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-size:14px">Dados do compromisso</b>
        <span><button class="btn btn-o bsm" onclick="PACompr.preencherAuto()">Preencher automaticamente</button> <button class="btn btn-p bsm" onclick="PACompr.salvarDados()">Salvar</button> ${btnMini('PACompr.fecharDados()', 'Fechar')}</span></div>
      <div style="font-size:12px;color:var(--muted);margin:4px 0 8px">Copie do RG/CNH e das certidões. O que vem da matrícula e da proposta entra sozinho ao clicar em "Preencher automaticamente" (não apaga o que foi digitado).</div>
      ${r.faltas.length ? `<div style="font-size:12.5px;color:#991b1b;background:#fef2f2;border-radius:8px;padding:8px 10px;margin-bottom:8px"><b>Falta (${r.faltas.length}):</b> ${esc(r.faltas.join('; '))}</div>` : '<div style="font-size:12.5px;color:#166534;margin-bottom:8px">✓ Todos os dados obrigatórios preenchidos.</div>'}
      ${grade(`<label style="font-size:11.5px;color:var(--muted)">Versão do contrato<select data-cp="versao" style="${ist}" onchange="PACompr.redesenhar()"><option value="">(escolha)</option>${Object.entries(window.PAAcomp.VERSOES).map(([k, x]) => `<option value="${k}" ${v.versao_contrato === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`)}
      <div style="font-size:13px;font-weight:700;margin:10px 0 6px">Vendedores</div>${S.M.vendedores.map((q, i) => pessoaHTML('V', i, q)).join('')}${btnMini("PACompr.addPessoa('V')", '+ vendedor')}
      <div style="font-size:13px;font-weight:700;margin:12px 0 6px">Compradores</div>${S.M.compradores.map((q, i) => pessoaHTML('C', i, q)).join('')}${btnMini("PACompr.addPessoa('C')", '+ comprador')}
      <div style="font-size:13px;font-weight:700;margin:12px 0 6px">Imóvel e negociação ${n ? '(Modelo ' + n + ')' : ''}</div>
      ${grade(CN.filter(c => vis(c[2])).map(([k, rot, , tp]) => campo('N.' + k, rot, N[k], tp)).join(''))}
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Prazos do banco (Modelos 1, 3 e 4) e da escritura: em Dados da proposta / Prazos da venda.</div>
      <div style="font-size:13px;font-weight:700;margin:12px 0 6px">Conta(s) da parte vendedora</div>
      <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px"><tr>${CONTA.map(c => `<th style="text-align:left;padding:2px 4px;color:var(--muted);font-weight:600">${c[1]}</th>`).join('')}${fin ? '<th style="text-align:left;padding:2px 4px;color:var(--muted)">Finalidade</th>' : ''}<th></th></tr>
        ${contas.map((c, i) => `<tr>${CONTA.map(([k, , w]) => `<td style="padding:2px"><input data-cp="K.${i}.${k}" value="${esc(c[k] || '')}" style="${ist};width:${w}px"></td>`).join('')}
          ${fin ? `<td style="padding:2px"><select data-cp="K.${i}.finalidade" style="${ist};width:110px"><option value="">—</option>${[['sinal', 'sinal'], ['proprios', 'recursos próprios'], ['fgts', 'FGTS']].map(([k, x]) => `<option value="${k}" ${c.finalidade === k ? 'selected' : ''}>${x}</option>`).join('')}</select></td>` : ''}
          <td>${btnMini(`PACompr.tirarLinha('contas', ${i})`, '✕')}</td></tr>`).join('')}</table></div>${btnMini("PACompr.addLinha('contas')", '+ conta')}
      <div style="font-size:13px;font-weight:700;margin:12px 0 6px">Testemunhas</div>
      ${test.map((w, i) => grade(campo(`T.${i}.nome`, 'Nome', w.nome) + campo(`T.${i}.cpf`, 'CPF', w.cpf) + `<div style="align-self:end">${btnMini(`PACompr.tirarLinha('testemunhas', ${i})`, '✕')}</div>`)).join('<div style="height:4px"></div>')}
      ${btnMini("PACompr.addLinha('testemunhas')", '+ testemunha')} <label style="font-size:12px;margin-left:8px"><input type="checkbox" id="cp-test-padrao"> usar estas testemunhas como padrão nas próximas vendas</label>
      ${r.avisos.length ? `<div style="font-size:12.5px;color:#b45309;margin-top:10px">${r.avisos.map(a => '⚠️ ' + esc(a)).join('<br>')}</div>` : ''}
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-p" onclick="PACompr.salvarDados()">Salvar dados do compromisso</button><button class="btn btn-o" onclick="PACompr.preVisualizar()">Ver o texto das partes</button></div>
      <div id="cp-previa"></div></div>`;
  }
  // lê o formulário para S.M (caminhos: N.x, V.i.x, V.i.rep.x, C.i.x, K.i.x (contas), T.i.x (testemunhas), versao)
  function lerForm() {
    const box = document.getElementById('cp-dados'); if (!box || !box.innerHTML) return undefined;
    let versao = S.v.versao_contrato || null;
    const contas = [], test = [];
    box.querySelectorAll('[data-cp]').forEach(el => {
      const path = el.dataset.cp.split('.'), val = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
      if (path[0] === 'versao') { versao = val || null; return; }
      if (path[0] === 'N') { S.M.N[path[1]] = val; return; }
      const arr = path[0] === 'V' ? S.M.vendedores : path[0] === 'C' ? S.M.compradores : path[0] === 'K' ? contas : test, i = +path[1];
      arr[i] = arr[i] || {};
      if (path[2] === 'rep') { arr[i].rep = arr[i].rep || {}; arr[i].rep[path[3]] = val; } else arr[i][path[2]] = val;
    });
    S.M.N.contas = contas.filter(c => c && Object.entries(c).some(([k, x]) => k !== 'finalidade' && x));
    S.M.N.testemunhas = test.filter(w => w && (w.nome || w.cpf));
    return versao;
  }
  function abrirDados() { const b = document.getElementById('cp-dados'); if (!b) return; b.innerHTML = dadosHTML(); b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function fecharDados() { const b = document.getElementById('cp-dados'); if (b) b.innerHTML = ''; }
  function redesenhar() { const vs = lerForm(); if (vs !== undefined) S.v.versao_contrato = vs || null; const b = document.getElementById('cp-dados'); if (b) b.innerHTML = dadosHTML(); }
  function addPessoa(l) { redesenhar(); (l === 'V' ? S.M.vendedores : S.M.compradores).push({ nacionalidade: 'brasileiro(a)' }); redesenhar(); }
  function tirarPessoa(l, i) { redesenhar(); (l === 'V' ? S.M.vendedores : S.M.compradores).splice(i, 1); const b = document.getElementById('cp-dados'); if (b) b.innerHTML = dadosHTML(); }
  function addLinha(k) { redesenhar(); S.M.N[k] = (S.M.N[k] || []).concat([{}]); if (S.M.N[k].length === 1 && k === 'testemunhas') S.M.N[k].push({}); const b = document.getElementById('cp-dados'); if (b) b.innerHTML = dadosHTML(); }
  function tirarLinha(k, i) { redesenhar(); (S.M.N[k] || []).splice(i, 1); const b = document.getElementById('cp-dados'); if (b) b.innerHTML = dadosHTML(); }
  async function salvarDados(silencioso) {
    let versao = lerForm(); if (versao === undefined) versao = S.v.versao_contrato || null;
    S.M.vendedores = S.M.vendedores.filter(q => q && (q.nome || q.cpf || q.cnpj)); S.M.compradores = S.M.compradores.filter(q => q && (q.nome || q.cpf));
    try {
      await salvarM({ versao_contrato: versao });
      if ((document.getElementById('cp-test-padrao') || {}).checked && S.M.N.testemunhas.length) {
        const h = hdr({ Prefer: 'resolution=merge-duplicates,return=minimal' });
        await fetch(`${SBU}/rest/v1/preanalise_config`, { method: 'POST', headers: h, body: JSON.stringify({ chave: 'testemunhas', valor: S.M.N.testemunhas, atualizado_por: quem(), atualizado_em: new Date().toISOString() }) });
        S.cfg.testemunhas = clone(S.M.N.testemunhas);
      }
      if (!silencioso) { await evento('dados do compromisso', 'atualizou'); U().aviso('Dados do compromisso salvos.', 'ok'); recarregar(); }
    } catch (e) { U().aviso('Erro ao salvar: ' + e.message, 'err'); throw e; }
  }
  async function preencherAuto() {
    lerForm(); const feito = autopreencher();
    U().aviso(feito.length ? 'Preenchido: ' + feito.join('; ') + '. Confira e salve.' : 'Nada novo para preencher automaticamente.', feito.length ? 'ok' : '');
    const b = document.getElementById('cp-dados'); if (b) b.innerHTML = dadosHTML();
  }
  function preVisualizar() {
    lerForm(); const r = montar(entrada()), b = document.getElementById('cp-previa'); if (!b) return;
    b.innerHTML = `<div style="margin-top:10px;font-size:12.5px;background:#f8fafc;border-radius:8px;padding:10px;line-height:1.5">
      <b>PARTE VENDEDORA:</b> ${esc(r.val.partes_vendedoras)}<br><br><b>PARTE COMPRADORA:</b> ${esc(r.val.parte_compradora)}<br><br><b>Preço:</b> ${esc(r.val.preco)} (${esc(r.val.preco_extenso)}) · <b>Sinal:</b> ${esc(r.val.sinal)} (${esc(r.val.sinal_extenso)}) · <b>Saldo:</b> ${esc(r.val.saldo)}</div>`;
  }

  // ══════════════ EMITIR ══════════════
  async function emitir() {
    if (!podeEmitir()) { U().aviso('Só gerente, assistente e administrador emitem o compromisso.', 'err'); return; }
    const st = document.getElementById('cp-st'), b = document.getElementById('cp-btn-emitir'), msg = t => { if (st) st.textContent = t; };
    if (document.getElementById('cp-dados') && document.getElementById('cp-dados').innerHTML) { try { await salvarDados(true); } catch (_) { return; } }
    const feito = autopreencher(); if (feito.length) await salvarM();
    const pr = prontidao();
    if (!pr.pronto) { U().aviso('Ainda não dá para emitir: ' + pr.itens.filter(i => i.bloq && !i.ok).map(i => i.rot).join(', '), 'err'); recarregar(); return; }
    const t = tipoDe(S.v), arq = MODELO_ARQ[t], r = pr.r;
    if (b) b.disabled = true;
    try {
      msg('Preenchendo o Word…');
      const rascunho = r.faltas.length > 0;
      const avisoW = rascunho ? `RASCUNHO COM PENDÊNCIAS: faltam ${r.faltas.length} dado(s): ${r.faltas.join('; ')}. Complete no sistema e emita de novo antes da assinatura. Apagar este aviso antes de enviar.` : AVISO;
      const { blob, desconhecidos } = await preencherDocx(arq, r.val, avisoW);
      const avisos = r.avisos.slice(); if (desconhecidos.size) avisos.unshift('O modelo tem campos que o portal não conhece (ficaram como estão): ' + [...desconhecidos].sort().join(', '));
      const quandoTxt = new Date().toLocaleString('pt-BR').replace(/[/:]/g, '-').replace(', ', ' ');
      const base = `${rascunho ? 'RASCUNHO - ' : ''}Compromisso - ${S.v.titulo.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)} - ${quandoTxt}`;
      msg('Gerando o PDF…');
      let pdf = null; try { pdf = await pdfDoDocx(blob, base + '.pdf'); } catch (e) { avisos.push('PDF não gerado (' + e.message + '): use o Word.'); }
      msg('Guardando na venda…');
      const fx = new File([blob], base + '.docx', { type: DOCX_MIME }); const ax = await anexar('compromisso', fx);
      let ap = null; if (pdf) ap = await anexar('compromisso', new File([pdf], base + '.pdf', { type: 'application/pdf' }));
      S.M.emitido = { por: quem(), em: new Date().toISOString(), modelo: (window.PAAcomp.VERSOES[S.v.versao_contrato] || t), arquivo_modelo: arq, docx_id: ax.id, pdf_id: ap ? ap.id : null, avisos, rascunho, faltas: r.faltas.slice() };
      await salvarM(); await evento('emitiu o compromisso', `${S.M.emitido.modelo}: Word${ap ? ' e PDF' : ''}${rascunho ? ` (rascunho, ${r.faltas.length} pendência(s))` : ''}`);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = base + '.docx'; document.body.appendChild(a); a.click(); a.remove();
      U().aviso(rascunho ? `Compromisso emitido como RASCUNHO (${r.faltas.length} pendência(s)): complete os dados e emita de novo antes da assinatura.` : 'Compromisso emitido: Word e PDF prontos. Confira a minuta (amarelo) e ajuste se precisar.', 'ok'); recarregar();
    } catch (e) { msg(''); if (b) b.disabled = false; U().aviso('Não consegui emitir: ' + e.message, 'err'); }
  }

  // ══════════════ APONTAMENTOS DAS CERTIDÕES: decisão do gerente (pacote da Renata de 10/11) ══════════════
  // Certidão positiva que vale (não substituída) = apontamento. Para cada um o gerente escolhe enviar ao jurídico ou
  // seguir sem o jurídico, com motivo padrão (opcional) e/ou texto escrito. Fica com nome, dia e hora e entra no parecer.
  // Todos "seguir" e nenhuma outra ressalva → venda liberada para o compromisso. Algum "jurídico" → vai para a revisão.
  // Grava em preanalise_venda.decisoes_apontamentos (sql/2026-11-11-preanalise-apontamentos.sql).
  const MOTIVOS_SEGUIR = ['Cobrança de IPTU de outro imóvel: não recai sobre o bem negociado', 'Homônimo: o apontamento não é do vendedor', 'Ação extinta ou arquivada', 'Outro (descrever na observação)'];
  const normK = x => semAc(x).replace(/[^a-z0-9]+/g, ' ').trim();
  function apontamentos() {
    const cfg = ((S || {}).ult || {}).config || {};
    return certs().filter(c => !c.substituida && c.resultado === 'positiva').map(c => ({
      id: [c.orgao, normK(c.refere_a), c.data_emissao || ''].join('|'), orgao: c.orgao,
      nome: ((cfg.certidoes || []).find(z => z.id === c.orgao) || {}).txt || c.orgao, pessoa: c.refere_a || '', resumo: c.resumo || '' }));
  }
  function decisaoTexto(d) {
    if (!d) return '';
    const mot = [d.motivo, d.obs].filter(Boolean);
    return (d.decisao === 'juridico' ? 'Enviado ao jurídico' : 'Seguir sem jurídico') + (mot.length ? ' — ' + mot.join(' — ') : '') + ` (por ${d.por || ''}, ${U().dt(d.em)})`;
  }
  function formDecisao(k, atual, todos) {
    const ist2 = 'padding:6px 8px;border:1.5px solid var(--borda);border-radius:7px;font-size:12.5px;max-width:100%';
    const a = atual || {};
    return `<div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:13px"><label><input type="radio" name="cpd-${k}" value="seguir" ${todos || a.decisao === 'seguir' ? 'checked' : ''}> Seguir sem jurídico</label> &nbsp;
        <label><input type="radio" name="cpd-${k}" value="juridico" ${!todos && a.decisao === 'juridico' ? 'checked' : ''}> ${todos ? 'Enviar todos ao jurídico' : 'Enviar ao jurídico'}</label></div>
      <select id="cpm-${k}" style="${ist2}"><option value="">Motivo padrão (opcional)</option>${MOTIVOS_SEGUIR.map(m => `<option ${a.motivo === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <textarea id="cpo-${k}" rows="2" style="${ist2}" placeholder="Motivo de seguir sem o jurídico: escreva aqui (obrigatório se não escolher um motivo padrão)">${esc(a.obs || '')}</textarea>
      <div><button class="btn ${todos ? 'btn-p' : 'btn-o'} bsm" onclick="PACompr.${todos ? 'decidirTodos()' : `decidir(${k.slice(1)})`}">${todos ? 'Aplicar a todos' : 'Registrar decisão'}</button></div></div>`;
  }
  function apontamentosHTML() {
    if (!S) return ''; const ap = apontamentos(); if (!ap.length) return '';
    const d = S.v.decisoes_apontamentos || {}, pode = podeDecidir(), sem = ap.filter(a => !d[a.id]);
    return `<div class="card" style="margin-bottom:12px" id="cp-apontamentos"><div class="cb">
      <div style="font-weight:700;font-size:15px">⚖️ Apontamentos das certidões <span style="font-size:12px;font-weight:400;color:var(--muted)">${ap.length - sem.length} de ${ap.length} decidido(s)</span></div>
      <div style="font-size:12.5px;color:var(--muted);margin:2px 0 8px">Para cada certidão positiva, o gerente decide: enviar ao jurídico ou seguir sem o jurídico, com o motivo. Fica registrado e entra no parecer.${liberadaPorDecisao() ? ' <b style="color:#047857">Todos decididos como "seguir": venda liberada para o compromisso.</b>' : ''}</div>
      ${ap.map((a, i) => `<div style="border-top:1px solid #eef1f6;padding:8px 0"><b>${esc(a.nome)}</b>${a.pessoa ? ' · ' + esc(a.pessoa) : ''}<div style="font-size:12.5px;color:#475569">${esc(a.resumo)}</div>
        ${d[a.id] ? `<div style="font-size:12.5px;margin-top:4px;color:${d[a.id].decisao === 'juridico' ? '#b45309' : '#047857'}"><b>${esc(decisaoTexto(d[a.id]))}</b></div>` : '<div style="font-size:12.5px;color:#b91c1c;margin-top:4px">sem decisão</div>'}
        ${pode ? `<details style="margin-top:4px" ${d[a.id] ? '' : 'open'}><summary style="cursor:pointer;font-size:12.5px;color:var(--pri,#0088CC)">${d[a.id] ? 'Mudar a decisão' : 'Decidir'}</summary>${formDecisao('a' + i, d[a.id], false)}</details>` : ''}</div>`).join('')}
      ${pode && sem.length > 1 ? `<div style="background:#f1f6ff;border-radius:10px;padding:10px;margin-top:8px"><b>Seguir com a venda</b> <span style="font-size:12px;color:var(--muted)">aplica a mesma decisão e o mesmo motivo aos ${sem.length} apontamentos ainda sem decisão</span>${formDecisao('todos', null, true)}</div>` : ''}
      ${pode ? '' : '<div style="font-size:12px;color:var(--muted);margin-top:6px">Só o gerente (ou o administrador) decide os apontamentos.</div>'}
    </div></div>`;
  }
  function lerDecisao(k) {
    const dec = (document.querySelector(`input[name="cpd-${k}"]:checked`) || {}).value || '';
    let motivo = (document.getElementById('cpm-' + k) || {}).value || ''; const obs = ((document.getElementById('cpo-' + k) || {}).value || '').trim();
    if (motivo && !MOTIVOS_SEGUIR.includes(motivo)) motivo = '';
    if (!dec) throw new Error('Escolha a decisão (enviar ao jurídico ou seguir).');
    if (dec === 'seguir' && !motivo && !obs) throw new Error('Para seguir sem o jurídico, informe o motivo (escolha um dos padrões ou escreva no campo).');
    if (dec === 'seguir' && /^Outro/.test(motivo) && !obs) throw new Error('Descreva o motivo no campo de texto.');
    return { decisao: dec, motivo: dec === 'seguir' ? motivo : '', obs, por: quem(), em: new Date().toISOString() };
  }
  async function gravarDecisoes(lista, base) {
    const d = Object.assign({}, S.v.decisoes_apontamentos || {});
    lista.forEach(a => { d[a.id] = Object.assign({}, base, { certidao: a.nome, pessoa: a.pessoa }); });
    const extra = { decisoes_apontamentos: d };
    if (base.decisao === 'juridico' && !S.v.encaminhado_juridico) Object.assign(extra, { encaminhado_juridico: true, encaminhado_em: new Date().toISOString(), encaminhado_por: quem() });
    await db.patch('preanalise_venda', S.v.id, extra); Object.assign(S.v, extra);
    await evento('decisão sobre apontamento', `${lista.length} apontamento(s): ` + (base.decisao === 'juridico' ? 'enviar ao jurídico' : 'seguir sem jurídico — ' + [base.motivo, base.obs].filter(Boolean).join(' — ')));
  }
  async function decidir(i) {
    if (!podeDecidir()) { U().aviso('Só o gerente (ou o administrador) decide os apontamentos.', 'err'); return; }
    const a = apontamentos()[i]; if (!a) return;
    try { const b = lerDecisao('a' + i); await gravarDecisoes([a], b); U().aviso(b.decisao === 'juridico' ? 'Decisão registrada: a venda vai para a revisão jurídica.' : 'Decisão registrada: seguindo sem o jurídico, com o motivo registrado.', 'ok'); recarregar(); }
    catch (e) { U().aviso(e.message, 'err'); }
  }
  async function decidirTodos() {
    if (!podeDecidir()) { U().aviso('Só o gerente (ou o administrador) decide os apontamentos.', 'err'); return; }
    const d = S.v.decisoes_apontamentos || {}, pend = apontamentos().filter(a => !d[a.id]);
    if (!pend.length) { U().aviso('Não há apontamentos sem decisão.', ''); return; }
    try { const b = lerDecisao('todos'); await gravarDecisoes(pend, b); U().aviso(`Decisão registrada para ${pend.length} apontamento(s).` + (b.decisao === 'seguir' ? ' A venda segue sem o jurídico.' : ' A venda vai para a revisão jurídica.'), 'ok'); recarregar(); }
    catch (e) { U().aviso(e.message, 'err'); }
  }
  // para o parecer (impressão/PDF): uma linha por apontamento com a decisão
  function decisoesParecer() {
    if (!S) return ''; const ap = apontamentos(); if (!ap.length) return '';
    const d = S.v.decisoes_apontamentos || {};
    return `<div><b>Apontamentos das certidões (decisão do gerente):</b><ul style="margin:2px 0 0;padding-left:18px">${ap.map(a => `<li>${esc(a.nome)}${a.pessoa ? ' — ' + esc(a.pessoa) : ''}: ${d[a.id] ? esc(decisaoTexto(d[a.id])) : '<b style="color:#b45309">sem decisão</b>'}</li>`).join('')}</ul></div>`;
  }

  // ══════════════ BIBLIOTECA DE MODELOS ══════════════
  let _clausulas = null;
  async function modelos() {
    const A = window.PAAcomp, ex = document.getElementById('cp-modal'); if (ex) ex.remove();
    if (!_clausulas) { try { _clausulas = await (await fetch(`modelos-nsp/clausulas_nsp.json?v=${MODELOS_V}`)).json(); } catch (_) { _clausulas = []; } }
    const MIN = [['modelo1', A.VERSOES['1']], ['modelo2', A.VERSOES['2']], ['modelo3', A.VERSOES['3']], ['modelo4', A.VERSOES['4']]];
    const abas = [['Minutas do compromisso', MIN.map(([k, t]) => [t, MODELO_ARQ[k]])]].concat((A.PGRUPOS || []).map(([g, tipos]) => [g, tipos.filter(x => A.MODELO[x]).map(x => [A.PTIPO[x], A.MODELO[x]])])).concat([['Cláusulas', null]]);
    const lin = (t, f) => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-top:1px solid #eef1f6;font-size:13px"><span>${esc(t)}<br><small style="color:var(--muted)">${esc(f)}</small></span>
      <a class="btn btn-o bsm" href="modelos-nsp/${encodeURIComponent(f)}?v=${MODELOS_V}" download="${esc(f)}">Baixar Word</a></div>`;
    const cl = (_clausulas || []).map((c, i) => `<details style="border-top:1px solid #eef1f6;padding:6px 0"><summary style="cursor:pointer;font-size:13px">${esc(c.titulo)} <small style="color:var(--muted)">· ${esc(c.categoria || '')}</small></summary>
      <div style="font-size:12.5px;white-space:pre-wrap;margin:6px 0">${esc(c.texto)}</div><button class="btn btn-o bsm" onclick="PACompr.copiarClausula(${i})">Copiar</button> <small style="color:#b45309">a validar pelo jurídico</small></details>`).join('');
    const div = document.createElement('div'); div.id = 'cp-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 12px;overflow:auto';
    div.innerHTML = `<div style="background:var(--card,#fff);border-radius:14px;max-width:760px;width:100%;padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px">📚 Modelos da NSP</b><button class="btn btn-o bsm" onclick="document.getElementById('cp-modal').remove()">Fechar</button></div>
      <div style="font-size:12px;color:var(--muted);margin:4px 0 10px">Os campos <code>{{campo}}</code> são preenchidos pelo portal; o texto fora deles é o da NSP. Para mudar um modelo, envie o Word ajustado ao administrador.</div>
      ${abas.map(([g, itens], i) => `<details ${i === 0 ? 'open' : ''} style="margin-bottom:8px"><summary style="cursor:pointer;font-weight:700;font-size:14px">${esc(g)} ${itens ? `<small style="color:var(--muted)">(${itens.length})</small>` : `<small style="color:var(--muted)">(${(_clausulas || []).length})</small>`}</summary>
        ${itens ? itens.map(([t, f]) => lin(t, f)).join('') : cl}</details>`).join('')}</div>`;
    div.addEventListener('click', e => { if (e.target === div) div.remove(); });
    document.body.appendChild(div);
  }
  async function copiarClausula(i) {
    const c = (_clausulas || [])[i]; if (!c) return;
    try { await navigator.clipboard.writeText(c.texto); U().aviso('Cláusula copiada: cole em "Cláusulas adicionais".', 'ok'); } catch (_) { prompt('Copie o texto:', c.texto); }
  }

  const caminhosAnexos = () => S ? S.anexos.map(a => a.caminho) : [];
  window.PACompr = { carregar, cardHTML, caminhosAnexos, apontamentosHTML, decidir, decidirTodos, decisoesParecer, liberada: () => !!S && liberada(), subirProposta, aplicarProposta, subirDoc, subirPessoais, definirPessoa, verAnexo, tirarAnexo, abrirDados, fecharDados, redesenhar,
    addPessoa, tirarPessoa, addLinha, tirarLinha, salvarDados, preencherAuto, preVisualizar, emitir, modelos, copiarClausula,
    _t: { montar, extrairProposta, versaoSugerida, preencherDocx, pdfDoDocx, textoDocx, cent, moeda, extensoReais, nomeIgual, normEC, normRegime, qualificarM1, _ctx: s => { S = s; } } };
})();

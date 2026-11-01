// ═══════════════════════════════════════════════════════════════════════════════════════════════
// NSP AVALIA — NÚCLEO ÚNICO DA AVALIAÇÃO DE IMÓVEIS (Imobiliária Nova São Paulo)
//
// É a ÚNICA conta de valor de imóvel da Nova SP. Usada por:
//   · portal Nova SP (novasp.netlify.app → módulo Avaliação de Imóveis / dossiê)
//   · NSP Intelligence (Avalie seu imóvel, Farol da carteira de venda, Ofertas)
// Publicada em https://nspintel.netlify.app/nsp-avalia-core.js (o portal carrega daqui).
//
// CALIBRAÇÃO (índices, CUB, terreno por bairro, regras por tipo) SE MUDA SÓ AQUI:
//   repositório github.com/FalcaoVaz/nsp-intelligence → shared/nsp-avalia-core.js  (ver shared/README.md)
//
// Extraído de portal/js/18-avaliacoes.js → avalCalcular (commit 604cd02, 23/10/2026). O núcleo NÃO busca dados:
// quem chama traz os anúncios (motor + Nova SP), as vendas reais (ITBI), o terreno local etc. e recebe o resultado.
// Sem DOM, sem rede: roda igual no navegador e no servidor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const VERSAO = '2026-10-26.1';

export const AV_CASA = ['CASA','CASA TÉRREA','CASA ASSOBRADADA','CASA DE VILA','CASA EM CONDOMÍNIO','SOBRADO','CONDOMÍNIO'];
export const AV_TIPOS = ['Apartamento','Studio','Cobertura','Casa térrea','Sobrado','Casa de vila','Casa em condomínio','Terreno','Comercial'];
export const AV_TEXTO_LEGAL = 'Este documento é uma opinião de valor para fins de comercialização, elaborada pela Imobiliária Nova São Paulo a partir de dados públicos (ITBI, zoneamento, outorga) e de mercado (anúncios e negócios fechados), por meio automatizado revisado pelo corretor responsável. Não constitui laudo de avaliação nem parecer técnico de avaliação mercadológica (NBR 14.653 / Resolução COFECI 1.066/2007), não substitui vistoria e não vale como garantia de preço de venda. Os valores podem variar com as condições do imóvel, da documentação e do mercado. O zoneamento, os coeficientes de aproveitamento e os gabaritos indicados vêm da base pública do GeoSampa e são aproximados: o enquadramento do lote deve ser confirmado pelo proprietário junto à Prefeitura de São Paulo (ficha técnica / certidão de zoneamento) antes de qualquer decisão, e a altura máxima construível depende ainda das restrições do COMAER (zona de proteção do Aeroporto de Congonhas) e de verificação em projeto.';

// ── Padrão construtivo → custo de obra (CUB/m² Sinduscon-SP, jul/2026, com oneração) ──
export const AV_PADROES = {
  economico: { lb:'Econômico / MCMV', cub:1945.55, ref:'R8-B' },
  medio:     { lb:'Médio',            cub:2231.37, ref:'R8-N' },
  alto:      { lb:'Alto',             cub:2618.33, ref:'R8-A' },
};

// ── Terreno × construção por bairro, medido na carteira da NSP (análise de 01/10/2026) ──
export const AV_TERRENO = {"aclimacao":{"terreno":3239,"constr":3085,"share":0.52,"n":103,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6500,"casa_n":103},"americanopolis":{"casa_util":3414,"casa_n":137,"per":"2018–2026","lote":1303,"lote_n":12,"lote_per":"2018–2026"},"bosque da saude":{"terreno":2049,"constr":3662,"share":0.36,"n":211,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6471,"casa_n":211,"lote":3220,"lote_n":9,"lote_per":"2024–2026"},"brooklin paulista":{"terreno":4508,"constr":3662,"share":0.55,"n":148,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8744,"casa_n":148,"lote":3875,"lote_n":11,"lote_per":"2018–2026"},"cambuci":{"terreno":2092,"constr":3085,"share":0.4,"n":106,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5345,"casa_n":106,"lote":4000,"lote_n":9,"lote_per":"2024–2026"},"campanario":{"casa_util":2270,"casa_n":32,"per":"2018–2026"},"campo belo":{"terreno":3398,"constr":3662,"share":0.48,"n":120,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7132,"casa_n":120,"lote":2778,"lote_n":11,"lote_per":"2018–2026"},"centro":{"casa_util":3200,"casa_n":321,"per":"2018–2026","lote":1684,"lote_n":72,"lote_per":"2018–2026"},"chacara inglesa":{"terreno":2657,"constr":3662,"share":0.42,"n":64,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7250,"casa_n":64,"lote":2832,"lote_n":18,"lote_per":"2018–2026"},"chacara santo antonio":{"casa_util":6794,"casa_n":30,"per":"2018–2026"},"cidade ademar":{"casa_util":2122,"casa_n":61,"per":"2018–2026"},"cidade domitila":{"casa_util":3116,"casa_n":42,"per":"2018–2026"},"cidade julia":{"casa_util":4607,"casa_n":42,"per":"2018–2026"},"cidade moncoes":{"casa_util":7000,"casa_n":55,"per":"2018–2026"},"cidade vargas":{"terreno":1221,"constr":3662,"share":0.28,"n":91,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5083,"casa_n":91,"lote":2207,"lote_n":14,"lote_per":"2018–2026"},"conceicao":{"casa_util":2376,"casa_n":110,"per":"2018–2026","lote":1363,"lote_n":14,"lote_per":"2018–2026"},"conjunto residencial jardim canaa":{"casa_util":3664,"casa_n":36,"per":"2018–2026"},"eldorado":{"casa_util":2400,"casa_n":65,"per":"2018–2026","lote":400,"lote_n":10,"lote_per":"2018–2026"},"indianopolis":{"terreno":4803,"constr":3662,"share":0.57,"n":108,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8323,"casa_n":108,"lote":6343,"lote_n":27,"lote_per":"2018–2026"},"interlagos":{"casa_util":4800,"casa_n":37,"per":"2018–2026"},"ipiranga":{"terreno":1589,"constr":3662,"share":0.3,"n":178,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5371,"casa_n":178,"lote":5000,"lote_n":10,"lote_per":"2024–2026"},"jabaquara":{"terreno":1196,"constr":3662,"share":0.26,"n":169,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5000,"casa_n":169,"lote":3370,"lote_n":13,"lote_per":"2024–2026"},"jardim aeroporto":{"terreno":1446,"constr":3662,"share":0.28,"n":69,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5667,"casa_n":69},"jardim botucatu":{"casa_util":11250,"casa_n":39,"per":"2018–2026"},"jardim da gloria":{"terreno":2984,"constr":3085,"share":0.47,"n":155,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6410,"casa_n":155},"jardim da saude":{"terreno":1962,"constr":3662,"share":0.36,"n":146,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5963,"casa_n":146,"lote":3956,"lote_n":5,"lote_per":"2024–2026"},"jardim europa":{"lote":8470,"lote_n":8,"lote_per":"2018–2026"},"jardim jabaquara":{"casa_util":3459,"casa_n":38,"per":"2018–2026"},"jardim maria estela":{"terreno":568,"constr":3085,"share":0.12,"n":81,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":3065,"casa_n":81},"jardim miriam":{"casa_util":4318,"casa_n":72,"per":"2018–2026"},"jardim oriental":{"terreno":881,"constr":3662,"share":0.21,"n":127,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":4921,"casa_n":127,"lote":2500,"lote_n":10,"lote_per":"2024–2026"},"jardim paulista":{"casa_util":17893,"casa_n":50,"per":"2018–2026","lote":9731,"lote_n":8,"lote_per":"2018–2026"},"jardim paulistano":{"casa_util":13313,"casa_n":32,"per":"2018–2026"},"jardim prudencia":{"casa_util":4762,"casa_n":51,"per":"2018–2026"},"jardim santa cruz":{"casa_util":3790,"casa_n":31,"per":"2018–2026"},"jardim saude":{"terreno":2461,"constr":3085,"share":0.46,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6000,"casa_n":66},"jardim vergueiro":{"casa_util":3764,"casa_n":32,"per":"2018–2026"},"jardim vila mariana":{"casa_util":6138,"casa_n":36,"per":"2018–2026"},"mirandopolis":{"terreno":3790,"constr":3662,"share":0.5,"n":216,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7452,"casa_n":216,"lote":4861,"lote_n":36,"lote_per":"2018–2026"},"moema":{"terreno":7002,"constr":3085,"share":0.7,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":9702,"casa_n":66},"paraiso":{"casa_util":7043,"casa_n":36,"per":"2018–2026"},"parque colonial":{"casa_util":6600,"casa_n":39,"per":"2018–2026"},"parque imperial":{"terreno":1711,"constr":3085,"share":0.35,"n":120,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5000,"casa_n":120,"lote":2950,"lote_n":11,"lote_per":"2018–2026"},"parque jabaquara":{"terreno":921,"constr":3662,"share":0.2,"n":109,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":4800,"casa_n":109},"pinheiros":{"lote":10608,"lote_n":13,"lote_per":"2018–2026"},"planalto paulista":{"terreno":2917,"constr":3662,"share":0.44,"n":656,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6659,"casa_n":656,"lote":3235,"lote_n":29,"lote_per":"2024–2026"},"sacoma":{"terreno":685,"constr":3085,"share":0.18,"n":111,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":3929,"casa_n":111,"lote":2500,"lote_n":33,"lote_per":"2018–2026"},"santo amaro":{"casa_util":6414,"casa_n":55,"per":"2018–2026","lote":3769,"lote_n":27,"lote_per":"2018–2026"},"sao joao climaco":{"lote":1201,"lote_n":9,"lote_per":"2018–2026"},"sao judas":{"terreno":2498,"constr":3085,"share":0.45,"n":125,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5932,"casa_n":125,"lote":4542,"lote_n":8,"lote_per":"2024–2026"},"saude":{"terreno":2696,"constr":3662,"share":0.42,"n":328,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6876,"casa_n":328,"lote":4613,"lote_n":42,"lote_per":"2024–2026"},"serraria":{"lote":152,"lote_n":7,"lote_per":"2018–2026"},"taboao":{"casa_util":2652,"casa_n":67,"per":"2018–2026"},"vila agua funda":{"casa_util":4534,"casa_n":50,"per":"2018–2026"},"vila babilonia":{"casa_util":4333,"casa_n":71,"per":"2018–2026"},"vila brasilina":{"casa_util":4290,"casa_n":213,"per":"2018–2026"},"vila brasilio machado":{"terreno":1555,"constr":3085,"share":0.34,"n":125,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5034,"casa_n":125,"lote":2367,"lote_n":14,"lote_per":"2018–2026"},"vila campestre":{"casa_util":3557,"casa_n":113,"per":"2018–2026","lote":1351,"lote_n":8,"lote_per":"2024–2026"},"vila caraguata":{"casa_util":4564,"casa_n":32,"per":"2018–2026"},"vila clementino":{"terreno":5556,"constr":3662,"share":0.59,"n":92,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":9326,"casa_n":92,"lote":7645,"lote_n":24,"lote_per":"2018–2026"},"vila congonhas":{"terreno":2572,"constr":3085,"share":0.48,"n":63,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6286,"casa_n":63},"vila cordeiro":{"casa_util":6504,"casa_n":32,"per":"2018–2026"},"vila da saude":{"terreno":2290,"constr":3662,"share":0.39,"n":97,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6825,"casa_n":97,"lote":4167,"lote_n":15,"lote_per":"2024–2026"},"vila das merces":{"terreno":1145,"constr":3085,"share":0.27,"n":73,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4236,"casa_n":73,"lote":2575,"lote_n":12,"lote_per":"2018–2026"},"vila do bosque":{"terreno":1725,"constr":3085,"share":0.36,"n":93,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5778,"casa_n":93,"lote":2957,"lote_n":11,"lote_per":"2018–2026"},"vila do encontro":{"casa_util":3846,"casa_n":146,"per":"2018–2026","lote":1882,"lote_n":6,"lote_per":"2024–2026"},"vila dom pedro i":{"terreno":2317,"constr":3085,"share":0.43,"n":141,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5380,"casa_n":141,"lote":4500,"lote_n":7,"lote_per":"2024–2026"},"vila fachini":{"casa_util":3426,"casa_n":114,"per":"2018–2026","lote":1645,"lote_n":12,"lote_per":"2018–2026"},"vila firmiano pinto":{"terreno":2158,"constr":3085,"share":0.41,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5552,"casa_n":66,"lote":3097,"lote_n":8,"lote_per":"2018–2026"},"vila guarani":{"terreno":1296,"constr":3662,"share":0.27,"n":270,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5411,"casa_n":270,"lote":3231,"lote_n":35,"lote_per":"2024–2026"},"vila gumercindo":{"terreno":2795,"constr":3662,"share":0.43,"n":127,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7250,"casa_n":127,"lote":2801,"lote_n":34,"lote_per":"2018–2026"},"vila marari":{"casa_util":4293,"casa_n":38,"per":"2018–2026"},"vila mariana":{"terreno":4345,"constr":3662,"share":0.53,"n":284,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8020,"casa_n":284,"lote":6034,"lote_n":14,"lote_per":"2024–2026"},"vila mascote":{"casa_util":6009,"casa_n":57,"per":"2018–2026","lote":7083,"lote_n":34,"lote_per":"2018–2026"},"vila moinho velho":{"terreno":1407,"constr":3085,"share":0.32,"n":131,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5154,"casa_n":131,"lote":2385,"lote_n":17,"lote_per":"2018–2026"},"vila monte alegre":{"terreno":1508,"constr":3085,"share":0.33,"n":124,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4749,"casa_n":124,"lote":2615,"lote_n":31,"lote_per":"2018–2026"},"vila monumento":{"terreno":1658,"constr":3085,"share":0.37,"n":122,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5061,"casa_n":122,"lote":1933,"lote_n":16,"lote_per":"2018–2026"},"vila moraes":{"casa_util":3659,"casa_n":201,"per":"2018–2026","lote":2420,"lote_n":8,"lote_per":"2024–2026"},"vila nair":{"terreno":1479,"constr":3085,"share":0.32,"n":109,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5200,"casa_n":109},"vila nogueira":{"casa_util":2157,"casa_n":32,"per":"2018–2026","lote":1672,"lote_n":9,"lote_per":"2018–2026"},"vila nova conceicao":{"casa_util":17741,"casa_n":39,"per":"2018–2026","lote":14151,"lote_n":10,"lote_per":"2018–2026"},"vila olimpia":{"casa_util":7500,"casa_n":39,"per":"2018–2026","lote":22756,"lote_n":7,"lote_per":"2024–2026"},"vila parque jabaquara":{"terreno":1012,"constr":3085,"share":0.25,"n":222,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4532,"casa_n":222,"lote":2129,"lote_n":37,"lote_per":"2018–2026"},"vila paulista":{"casa_util":4558,"casa_n":39,"per":"2018–2026"},"vila santa catarina":{"terreno":815,"constr":3085,"share":0.21,"n":206,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4022,"casa_n":206,"lote":1530,"lote_n":22,"lote_per":"2018–2026"},"vila santa maria":{"casa_util":2635,"casa_n":33,"per":"2018–2026"},"vila santo estefano":{"terreno":1074,"constr":3085,"share":0.26,"n":156,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4418,"casa_n":156,"lote":2523,"lote_n":9,"lote_per":"2024–2026"},"vila sao jose":{"casa_util":5508,"casa_n":42,"per":"2018–2026"},"vila vera":{"casa_util":4144,"casa_n":36,"per":"2018–2026"}};

// Parâmetros (avaliação + conta reversa de incorporação). Editáveis aqui; o corretor não mexe.
export const AV_PARAM = {
  cub_ref:'Sinduscon-SP jul/2026',
  calibracao:'calibrado em viabilidades reais de incorporação na Zona Sul de São Paulo (2026)',
  eficiencia_his:0.97, eficiencia_mercado:0.85, his_unid_m2:28, priv_sobre_construida:0.776,
  obra_sobre_cub:1.68, despesas:0.135, projetos_sobre_obra:0.025, comissao:0.05, ret:0.04, financiamento:0.03, margem:0.15, custo_aquisicao:0.12,
  marketing:0.045, adm:0.02, fator_obra:1.68, eficiencia:0.90, constr_sobre_computavel:1.29,
  lanc_cadastro_util:1.69, lanc_itbi_min_n:30, lanc_anuncio_min_n:3, lanc_sobre_usado:1.25,
  casa_sobre_apto:0.60,       // SEM USO desde 26/10/2026 (casa não usa apartamento de referência)
  outorga_fs:1.0, outorga_fp:1.0, qvt_sobre_mercado:0.50, his_max_rs_m2:12000, hmp_max_rs_m2:15000, fachada_ativa_bonus:0.50,
  terreno_sobre_casa:0.33,    // casa vendida COMO CASA: R$/m² de terreno ≈ 33% do R$/m² útil de casa (fallback)
  lote_sobre_casa:0.57,       // casa vendida COMO LOTE: R$/m² de lote ≈ 57% do R$/m² útil de casa (fallback)
  casa_obra_sobre_cub:1.25, vida_util_casa:70, fator_comercializacao:1.00,
  estados:{ novo:[0,'novo'], bom:[0.025,'bom'], regular:[0.18,'regular'], reforma:[0.33,'precisa de reforma'], ruim:[0.52,'ruim'] },
  lote_min_m2:400, frente_min_m:12, cota_solidariedade_m2:20000,
};

// ── Índices macro → micro (método único: anúncio × ITBI) ──
// pedido→fechado: fechamentos da NSP no NIDO (venda, 2019–2026, 1.773 pares). ITBI declara ~96,6% do negociado → +3,5%.
// Área do cadastro (IPTU) ≈ 1,35 × área útil + 29 m² por vaga.
export const AV_INDICES = {
  pedido_fechado: { global:0.952, 'SAUDE':0.953, 'VILA GUARANI':0.955, 'VILA DA SAUDE':0.963, 'PLANALTO PAULISTA':0.931,
                    'VILA MARIANA':0.952, 'VILA MONTE ALEGRE':0.964, 'MIRANDOPOLIS':0.950, 'JABAQUARA':0.940,
                    'VILA CLEMENTINO':0.952, 'IPIRANGA':0.953, 'CHACARA INGLESA':0.950, 'JARDIM DA SAUDE':0.943, 'SAO JUDAS':0.953 },
  itbi_subdeclaracao: 0.035,
  iptu_por_util: 1.35, iptu_por_vaga: 29,
  fonte: 'NIDO 2019–26 (pedido→fechado) · Foca 28/09/2026 (ITBI × fechamento) · Foca 13/09/2026 (área IPTU × útil)',
};
export const AV_BAIRROS_ALTO = ['moema','itaim','vila nova conceicao','brooklin','campo belo','jardim paulista','jardins','paraiso','vila olimpia','ibirapuera','chacara klabin','vila mariana','pinheiros','perdizes'];

// ── CASA: terreno + construção calibrado nas vendas de casas do ITBI (04/10/2026) ──
export const AV_CASA_CAL = { c0:3500, lote_ref:154, beta:0.5, vida:100, piso:0.5,
  kpad:{ economico:0.8, medio:1, alto:1.25 }, kletra:{ A:0.65, B:0.8, C:1, D:1.25, E:1.55, F:1.9 },
  estado:{ novo:[1.05,'novo'], bom:[1,'bom'], regular:[0.85,'regular'], reforma:[0.65,'precisa de reforma'], ruim:[0.45,'ruim'] },
  fonte:'10.585 vendas de casas registradas no ITBI nos últimos 24 meses (Zona Sul e entorno); erro mediano de 23% na validação' };

// campos que valem para cada grupo (campo de outro tipo não entra na conta)
export const CAMPOS = {
  apto: ['area','dorm','suite','vaga'],
  casa: ['area','terreno','frente','dorm','suite','vaga','padrao','idade','estado','rs_terreno'],
  terreno: ['terreno','frente','rs_terreno'],
  com: ['area','terreno','frente','vaga','padrao','idade','estado','rs_terreno'],
};
export const MANUAL_MAX = 5;

// ── utilidades ──
export const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
export const normBairro = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
export const cap = s => String(s||'').toLowerCase().replace(/(^|\s|-)(\S)/g,(m,a,b)=>a+b.toUpperCase()).replace(/\bDe\b|\bDa\b|\bDo\b|\bDos\b|\bDas\b|\bE\b/g,w=>w.toLowerCase());
export const R$ = v => (v==null||v===''||isNaN(Number(v))) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const n0 = v => Math.round(v||0).toLocaleString('pt-BR');
export const mediana = v => { v=v.filter(x=>x>0).sort((a,b)=>a-b); return v.length?(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null; };
export const ehCasa = t => AV_CASA.includes(String(t||'').toUpperCase());
// tipo do anúncio do motor (portais): casa em condomínio é casa — nunca entra como apartamento (26/10/2026)
export const anuncioCasa = t => t==='Casa' || t==='CasaCondominio';
export const podeTerreno = t => ehCasa(t) || /terreno|comercial|loja|galp|pr[eé]dio|sala/i.test(String(t||''));
export const tipoGrupo = t => /terreno/i.test(t) ? 'terreno' : (ehCasa(t) ? 'casa' : (/comercial|loja|galp|pr[eé]dio|sala/i.test(String(t||'')) ? 'com' : 'apto'));
export function idxPedidoFechado(bairro){ const b=normBairro(bairro).toUpperCase(); const k=Object.keys(AV_INDICES.pedido_fechado).filter(k=>k!=='global').sort((a,c)=>c.length-a.length).find(k=>b.includes(k)); return { idx: k?AV_INDICES.pedido_fechado[k]:AV_INDICES.pedido_fechado.global, origem: k?`${k} (NIDO)`:'média NSP (NIDO)' }; }
export const padraoSugerido = bairro => AV_BAIRROS_ALTO.some(x=>normBairro(bairro).includes(x)) ? 'alto' : 'medio';
export function terrenoBairro(bairro){ const k=norm(bairro).split('(')[0].replace(/\s+/g,' ').trim(); return AV_TERRENO[k]||null; }

export function contaCasaCalibrada({terreno, constr, idade, padrao, padraoIptu, estado, tl, rs_lote, lote_origem}){
  const C=AV_CASA_CAL;
  const letra=(String(padraoIptu||'').match(/padr[aã]o\s+([A-F])/i)||[])[1];
  const kp = letra ? C.kletra[letra.toUpperCase()] : (C.kpad[padrao]||1);
  const padraoLb = letra ? `IPTU padrão ${letra.toUpperCase()}` : ({economico:'econômico',medio:'médio',alto:'alto'}[padrao]||'médio');
  const fl=Math.pow(terreno/C.lote_ref, -C.beta);
  const rs_terreno=Math.round(Number(tl.rs_terreno_ref)*fl), v_terreno=Math.round(terreno*rs_terreno);
  const custo_m2=Math.round(C.c0*kp), v_novo=Math.round(constr*custo_m2);
  const fid=Math.max(C.piso, 1-(idade||50)/C.vida), est=C.estado[estado]||C.estado.bom;
  const v_benf=Math.round(v_novo*fid*est[0]);
  const total=v_terreno+v_benf;
  return { calibrado:true, terreno, rs_terreno, rs_terreno_ref:Number(tl.rs_terreno_ref), fator_lote:Math.round(fl*100)/100,
    rs_terreno_origem:`mediana de ${tl.n} vendas de casas por perto (até ${n0(tl.raio_m)} m), já descontada a construção; lote de referência ${C.lote_ref} m², ajustado ao tamanho deste`,
    rs_terreno_faixa:[Number(tl.rs_terreno_p25), Number(tl.rs_terreno_p75)], v_terreno, constr, padrao, padraoLb, custo_m2, v_novo, idade:idade||null,
    fator_idade:Math.round(fid*100)/100, estado, estadoLb:est[1], fator_estado:est[0], dep:Math.round((1-fid*est[0])*100)/100, v_benf, fc:1, total,
    pct_terreno: total?Math.round(v_terreno/total*100):null, rs_lote:rs_lote||null, lote_origem:lote_origem||null,
    v_lote:(rs_lote&&terreno)?Math.round(terreno*rs_lote):null, fonte:C.fonte };
}
export function contaEvolutivo({terreno, rs_terreno, rs_terreno_origem, constr, padrao, idade, estado, rs_lote, lote_origem, ref}){
  const P=AV_PARAM, p=AV_PADROES[padrao]||AV_PADROES.medio;
  const v_terreno=terreno*rs_terreno;
  const custo_m2=p.cub*P.casa_obra_sobre_cub, v_novo=constr*custo_m2;
  const k=Math.min(Math.max(idade||0,0)/P.vida_util_casa,1), ross=0.5*(k+k*k);
  const est=P.estados[estado]||P.estados.bom, heid=est[0];
  const dep=Math.min(ross+(1-ross)*heid, 0.85);
  const v_benf=v_novo*(1-dep);
  const total=Math.round((v_terreno+v_benf)*P.fator_comercializacao);
  return {terreno, rs_terreno, rs_terreno_origem, v_terreno:Math.round(v_terreno), constr, padrao, padraoLb:p.lb, cub:p.cub, cubRef:p.ref, custo_m2:Math.round(custo_m2),
          v_novo:Math.round(v_novo), idade:idade||0, estado, estadoLb:est[1], dep_ross:ross, dep_heidecke:heid, dep, v_benf:Math.round(v_benf), fc:P.fator_comercializacao, total,
          pct_terreno: total? Math.round(v_terreno/(v_terreno+v_benf)*100):null,
          rs_lote:rs_lote||null, lote_origem:lote_origem||null, v_lote: (rs_lote&&terreno)?Math.round(terreno*rs_lote):null, ref:ref||null};
}

// RECUOS E IMPLANTAÇÃO (07/10/2026): "lote abaixo de 400 m² precisa juntar com vizinho por causa dos recuos" (LPUOS Quadro 3; Código de Obras)
export function recuos({zona, terreno, frente, area_comput}){
  terreno=Number(terreno)||0; if(!terreno) return null;
  const z=String(zona||'').toUpperCase().replace(/\s+/g,'');
  const semFrente=/^(ZEU|ZEM)/.test(z);
  const g500 = terreno>=500;
  const to = /^(ZER|ZCOR|ZPR)/.test(z) ? 0.5 : /^ZPDS/.test(z) ? (g500?0.25:0.35) : /^ZPI-2/.test(z) ? (g500?0.3:0.5)
           : /^(ZDE-1|ZPI-1|ZCA)/.test(z) ? 0.7 : /^(ZEUA|ZEUPA|ZMA|ZMISA|ZDE-2)/.test(z) ? (g500?0.5:0.7) : (g500?0.7:0.85);
  const testada=Number(frente)||Math.sqrt(terreno), prof=terreno/testada;
  const rf = semFrente?0:5;
  const acima=Math.max(Number(area_comput)||0, 0);
  let lat=3, larg=0, pr=0, andar=0, pav=0, H=0;
  for(let i=0;i<3;i++){
    larg=Math.max(0, testada-2*lat); pr=Math.max(0, prof-rf-lat);
    andar=Math.min(larg*pr, to*terreno);
    pav = andar>0 && acima>0 ? Math.ceil(acima/andar) : 0;
    H = pav*3;
    lat = Math.max(3, Math.round((H-6)/10*10)/10);
  }
  const viavel = terreno>=AV_PARAM.lote_min_m2 && larg>=8 && andar>=150;
  return { zona:z||null, to, recuo_frente:rf, recuo_lat:3, afast_aberturas:lat, testada:Math.round(testada*10)/10, frente_informada:!!Number(frente),
           profundidade:Math.round(prof*10)/10, larg_util:Math.round(larg*10)/10, prof_util:Math.round(pr*10)/10, andar:Math.round(andar),
           andar_to:Math.round(to*terreno), pav, altura:H, viavel, precisa_vizinho: terreno<AV_PARAM.lote_min_m2 || !viavel };
}

/** Lê os campos do formulário: só valem os do grupo do tipo escolhido. */
export function lerEntrada(inp){
  const tipo=inp.tipo||'Apartamento', grupo=tipoGrupo(tipo);
  const g=k=>CAMPOS[grupo].includes(k)?inp[k]:null;
  return { tipo, grupo, casa:ehCasa(tipo),
    area:+g('area')||null, terreno:+g('terreno')||null, frente:+g('frente')||null,
    dorm:+g('dorm')||null, suite:+g('suite')||null, vaga:+g('vaga')||null,
    padrao:g('padrao')||'medio', idade:+g('idade')||0, estado:g('estado')||'bom', rs_terreno:+g('rs_terreno')||null,
    bairro:String(inp.bairro||'').trim() };
}

/** Validação do formulário: devolve a mensagem de erro ou null. */
export function validar(e){
  if(e.grupo==='terreno' && !e.terreno) return 'Informe a área do terreno (m²).';
  if(e.grupo!=='terreno' && !e.area) return e.grupo==='apto'?'Informe a área útil.':'Informe a área construída.';
  if(e.grupo==='casa' && !e.terreno) return 'Casa: informe também a área do terreno (m²) — ela entra na conta.';
  if(!e.bairro) return 'Não identifiquei o bairro deste ponto. Preencha o campo "Bairro detectado" abaixo do endereço.';
  return null;
}

/**
 * Bairro complementar: o nome que o mapa dá às vezes é um sub-bairro e o portal traz poucos anúncios.
 * Devolve o bairro mais comum entre os anúncios da Nova SP por perto (para buscar mais anúncios no motor) ou null.
 */
export function bairroComplementar({tipo, bairro, nsp, precos}){
  nsp=nsp||[]; if(!(nsp.length < 12 && nsp.length) || tipoGrupo(tipo)==='terreno') return null;
  const nTipo=((precos&&precos.amostra)||[]).filter(a=>ehCasa(tipo)?anuncioCasa(a.tipo):!anuncioCasa(a.tipo)).length;
  const cont={}; nsp.forEach(n=>{ const b=cap(String(n.bairro||'').replace(/\(.*?\)/g,'').trim().toLowerCase()); if(b) cont[b]=(cont[b]||0)+1; });
  const b2=Object.keys(cont).sort((x,y)=>cont[y]-cont[x])[0];
  return (nTipo<6 && b2 && norm(b2).toUpperCase()!==norm(bairro).toUpperCase()) ? b2 : null;
}
/** Junta a amostra do bairro complementar à do bairro principal (sem repetir anúncio). */
export function juntarPrecos(precos, p2){
  if(!(p2&&p2.amostra&&p2.amostra.length)) return precos;
  const vist=new Set(((precos&&precos.amostra)||[]).map(a=>a.url));
  return {...(precos||{}), amostra:[...((precos&&precos.amostra)||[]), ...p2.amostra.filter(a=>!vist.has(a.url))]};
}

// chaves estáveis dos comparáveis (exclusões feitas pelo corretor)
export const chaveAnuncio = a => a.nsp?'n:'+(a.ref||a.rua+'|'+a.preco):'a:'+(a.url||a.rua+'|'+a.preco);
export const chaveVenda = c => 'i:'+(c.logradouro||'')+'|'+(c.numero||'')+'|'+(c.data||'')+'|'+c.valor;

/**
 * 1ª etapa — seleciona os comparáveis.
 * dados: { precos (motor: {rs_apto, rs_casa, n_apto, n_casa, amostra[]}), semMotor, nsp (anúncios Nova SP perto: rua, bairro, area, valor,
 *          rs_m2, dorm, vaga, ref, url, dist_m), compsItbi (vendas reais: logradouro, numero, data, valor, area_constr, rs_m2, uso, complemento, lat, lng),
 *          excl (Set|array de chaves excluídas), manuais (anúncios incluídos pelo corretor: url, preco, area, dorm, vaga, por, origem) }
 * Devolve { amostraTodos, compsItbi, compsItbiTodos, foraTamanho } — a amostra sai ordenada; depois de calcular a distância das ruas
 * (opcional, só muda a ordem na tabela) chame ordenarAmostra.
 */
export function selecionarComparaveis(inp, dados){
  const e=lerEntrada(inp), {tipo, area, grupo}=e, casa=e.casa;
  // MESMO TIPO (Rodrigo, 26/10/2026): apartamento não é referência de casa nem de terreno; terreno compara com terreno
  const terr=grupo==='terreno', areaRef=terr?e.terreno:area;
  const excl=dados.excl instanceof Set?dados.excl:new Set(dados.excl||[]);
  let compsItbi=(dados.compsItbi||[]).map(c=>({...c}))
    .filter(c=>terr ? (/TERRENO/i.test(c.uso||'') && Number(c.area_terreno)>0)
                    : (!/GARAGEM|VAGA|DEP[OÓ]SITO|TERRENO/i.test(c.uso||'') && (casa ? /RESID|CASA|SOBRADO/i.test(c.uso||'') && !/APART/i.test(c.uso||'') : /APART/i.test(c.uso||''))));
  compsItbi.forEach(c=>{ c._k=chaveVenda(c); c.excluido=excl.has(c._k); });
  // R$/m² do ITBI em base de ÁREA ÚTIL (cadastro ≈ 1,35 × útil + 29 m²/vaga; casa: área construída ≈ útil); terreno: área do terreno
  compsItbi.forEach(c=>{ const ac=terr?Number(c.area_terreno):(Number(c.area_constr)||0); c.area_util_est=(terr||casa)?ac:Math.max(20,(ac-AV_INDICES.iptu_por_vaga)/AV_INDICES.iptu_por_util); c.rs_util=c.area_util_est?Math.round(Number(c.valor)/c.area_util_est):null; });
  // TAMANHO PARECIDO (07/10/2026): no máximo 50% de diferença de área (terreno: área do terreno)
  const tamOk = a => !areaRef || !(Number(a)>0) || (Number(a)>=areaRef*0.5 && Number(a)<=areaRef*1.5);
  const compsItbiTodos=compsItbi;
  compsItbi=compsItbi.filter(c=>tamOk(c.area_util_est)).slice(0,20);
  const foraTamanho={itbi:compsItbiTodos.length-compsItbi.length, anuncios:0};
  // anúncios do MESMO tipo; primeiro os da Nova SP (mais perto primeiro), o motor completa até 12; mesmo imóvel com vários códigos conta uma vez
  const vistoNsp=new Set();
  const tipoAn=terr?'Terreno':(casa?'Casa':'Apartamento');
  const amostraNsp=(dados.nsp||[]).filter(n=>{ const k=norm(n.rua||'')+'|'+Math.round(Number(n.area))+'|'+Math.round(Number(n.valor)); if(vistoNsp.has(k)) return false; vistoNsp.add(k); return true; }).map(n=>{
    const ar=terr?(Number(n.terreno)||Number(n.area)):Number(n.area);
    return {tipo:tipoAn, area:ar, preco:Number(n.valor), rs_m2:terr?(ar?Math.round(Number(n.valor)/ar):null):Number(n.rs_m2),
      dorm:terr?null:(n.dorm||null), vaga:terr?null:(n.vaga||null), rua:n.rua||'', bairro:/[a-zà-ú]/.test(n.bairro||'')?n.bairro:cap(n.bairro||''), ref:n.ref||null, url:n.url||null, nsp:true, dist_m:n.dist_m!=null?Number(n.dist_m):null}; })
    .filter(a=>a.area>0 && a.rs_m2>0);
  // motor (portais): só para apartamento e casa; terreno não usa (os portais misturam casa e apartamento)
  const doMotor=terr?[]:((dados.precos&&dados.precos.amostra)||[]).filter(a=>casa?anuncioCasa(a.tipo):!anuncioCasa(a.tipo)).map(a=>casa&&a.tipo!=='Casa'?{...a, tipo:'Casa'}:a);
  const candidatos=[...amostraNsp, ...doMotor];
  const amostraTodos=candidatos.filter(a=>tamOk(a.area)).slice(0,12);
  foraTamanho.anuncios=candidatos.length-candidatos.filter(a=>tamOk(a.area)).length;
  // anúncios INCLUÍDOS pelo corretor (link obrigatório, no máx. MANUAL_MAX)
  (dados.manuais||[]).slice(0,MANUAL_MAX).forEach(m=>amostraTodos.push({tipo:tipoAn, area:m.area, preco:m.preco, rs_m2:Math.round(m.preco/m.area),
    dorm:m.dorm||null, vaga:m.vaga||null, rua:m.origem==='parecer'?'Anúncio no próprio prédio (achado pelo parecer)':'Anúncio incluído pelo corretor',
    bairro:m.por?('por '+m.por):'', url:m.url, manual:true, por:m.por||null, origem_manual:m.origem||'corretor'}));
  ordenarAmostra(amostraTodos);
  amostraTodos.forEach(a=>{ a._k=chaveAnuncio(a); a.excluido=excl.has(a._k); });
  // anúncios só trazem a rua (sem número): ficam fora do mapa
  amostraTodos.forEach(a=>{ delete a.lat; delete a.lng; });
  return { amostraTodos, compsItbi, compsItbiTodos, foraTamanho, excl };
}
/** Nova SP primeiro, depois os mais perto (a distância não muda a conta — testado em 04/10/2026). */
export function ordenarAmostra(amostra){ return amostra.sort((x,y)=>(!!y.nsp-!!x.nsp) || (x.dist_m==null)-(y.dist_m==null) || (x.dist_m||0)-(y.dist_m||0)); }

/**
 * 2ª etapa — calcula o valor (= avalCalcular do portal, sem tela).
 * inp: { tipo, bairro, rua, numero, numeros_predio[] (nº do imóvel e do vizinho do IPTU), area, terreno, frente, dorm, suite, vaga,
 *        padrao, padrao_iptu, idade, estado, rs_terreno, usar_predio, usar_comparativo, adotado_por }
 * sel: resultado de selecionarComparaveis
 * dados: { precos, semMotor, geo ({zona, ca_maximo}), tlocal (aval_terreno_local) }
 * Devolve { ok, erro?, aviso?, valor_mercado, faixa_min, faixa_max, mercado_rs_m2, metodo, metodo_unico, evolutivo, comparaveis, ... }
 */
export function calcularValor(inp, sel, dados){
  const e=lerEntrada(inp), {tipo, grupo, area, terreno, frente, dorm, suite, vaga, bairro}=e, ehcasa=e.casa;
  const erroForm=validar(e); if(erroForm) return { ok:false, erro:erroForm };
  const { amostraTodos, compsItbi, compsItbiTodos, foraTamanho } = sel;
  const excl=sel.excl||new Set();
  let precos={...(dados.precos||{})}; const semMotor=!!dados.semMotor;
  const amostra=amostraTodos.filter(a=>!a.excluido);
  const compsItbiAtivos=compsItbi.filter(c=>!c.excluido);
  // com anúncio da Nova SP, excluído ou incluído, o R$/m² sai da amostra (e não da mediana da página inteira do portal)
  if(amostraTodos.some(a=>a.excluido) || amostraTodos.some(a=>a.manual) || amostraTodos.some(a=>a.nsp)){
    const pa=amostra.filter(a=>a.tipo!=='Casa'&&a.tipo!=='Terreno').map(a=>a.rs_m2), pc=amostra.filter(a=>a.tipo==='Casa').map(a=>a.rs_m2);
    precos={...precos, rs_apto: pa.length?Math.round(mediana(pa)):null, rs_casa: pc.length?Math.round(mediana(pc)):null, n_apto:pa.length, n_casa:pc.length};
  }
  const nExcl=excl.size;
  let aviso=null;
  if(semMotor && !amostra.length){
    const rs=(compsItbi||[]).map(c=>Number(c.rs_m2)).filter(v=>v>0);
    if(rs.length || grupo==='terreno'){
      precos={rs_apto:null, rs_casa:null, n_apto:0, n_casa:0, amostra:[], base:'ITBI', n_itbi:rs.length};
      aviso=`Anúncios ao vivo indisponíveis agora — o valor usa só as ${rs.length} vendas reais registradas por perto.`;
    }else{
      return { ok:false, erro:`Motor de anúncios indisponível e sem fechamentos ITBI para "${bairro}". Confira o nome do bairro.` };
    }
  }
  const ehterreno=/terreno/i.test(tipo);
  const rs_apto=precos.rs_apto;
  // casa: só anúncios de casa (26/10/2026: acabou a estimativa "casa ≈ apartamento × 0,60")
  const rs_casa=precos.rs_casa || null;
  const rs_tipo = ehcasa ? rs_casa : (ehterreno ? null : rs_apto);
  const geo=dados.geo||{};
  const tb=terrenoBairro(bairro), idxPF=idxPedidoFechado(bairro);
  const rsTerrenoInf=e.rs_terreno;
  const rs_terreno = rsTerrenoInf || (tb&&tb.terreno) || (rs_casa ? Math.round(rs_casa*AV_PARAM.terreno_sobre_casa) : null);
  const rsTerrenoOrigem = rsTerrenoInf ? 'informado pelo corretor' : (tb&&tb.terreno ? `modelo dos anúncios de casas da Nova São Paulo: ${tb.n} casas em ${bairro}, preços de ${tb.per||'2018–2026'}, custo de construção único de R$ ${(tb.constr||0).toLocaleString('pt-BR')}/m² (terreno = ${Math.round(tb.share*100)}% do valor)` : (rs_casa ? `estimado: ${Math.round(AV_PARAM.terreno_sobre_casa*100)}% do R$/m² de casa do bairro (anúncios de casas)` : null));
  // TERRENO PELOS LOTES POR PERTO (26/10/2026): terrenos anunciados pela Nova SP (pedido × índice pedido→fechado) e vendas reais
  // de terreno registradas (× subdeclaração), de tamanho parecido, sem os excluídos pelo corretor; com 4 ou mais, vale a mediana deles
  let loteLocal=null;
  if(grupo==='terreno' && !rsTerrenoInf){
    const vAn=amostra.filter(a=>a.rs_m2>0).map(a=>Math.round(a.rs_m2*idxPF.idx));
    const vIt=compsItbiAtivos.filter(c=>c.rs_util>0).map(c=>Math.round(c.rs_util*(1+AV_INDICES.itbi_subdeclaracao)));
    const todos=[...vAn, ...vIt];
    if(todos.length>=4) loteLocal={ rs:Math.round(mediana(todos)), n:todos.length, n_anuncio:vAn.length, n_itbi:vIt.length,
      rs_anuncio:vAn.length?Math.round(mediana(vAn)):null, rs_itbi:vIt.length?Math.round(mediana(vIt)):null };
  }
  const loteBairro = tb&&tb.lote ? Math.round(tb.lote*idxPF.idx) : null;
  const rs_lote = rsTerrenoInf || (loteLocal&&loteLocal.rs) || loteBairro || (rs_casa ? Math.round(rs_casa*AV_PARAM.lote_sobre_casa) : null);
  const loteOrigem = rsTerrenoInf ? 'informado pelo corretor'
    : loteLocal ? `mediana de ${loteLocal.n} lotes de tamanho parecido por perto: ${loteLocal.n_anuncio} anunciados pela Nova SP (pedido × ${idxPF.idx} pedido→fechado) e ${loteLocal.n_itbi} vendas reais de terreno registradas (× ${(1+AV_INDICES.itbi_subdeclaracao).toFixed(3)})`+(loteBairro?` · referência do bairro: R$ ${loteBairro.toLocaleString('pt-BR')}/m²`:'')
    : (tb&&tb.lote ? `mediana de ${tb.lote_n} lotes anunciados pela NSP em ${bairro}, ${tb.lote_per||'2018–2026'} (R$ ${tb.lote.toLocaleString('pt-BR')}/m² pedido × ${idxPF.idx} pedido→fechado)` : (rs_casa ? `estimado: ${Math.round(AV_PARAM.lote_sobre_casa*100)}% do R$/m² de casa do bairro` : null));

  // ── MÉTODO ÚNICO: macro (índices do bairro) aplicado no micro (este imóvel) ──
  const rsItbiUtil=(()=>{ const v=compsItbiAtivos.map(c=>c.rs_util).filter(x=>x>0); return v.length>=3?mediana(v):null; })();
  const metodoUnico = (()=>{
    if(!area) return null;
    const m={ idx_pedido_fechado:idxPF.idx, idx_origem:idxPF.origem, sub_itbi:AV_INDICES.itbi_subdeclaracao,
              rs_anuncio: rs_tipo||null, n_anuncio: ehcasa?(precos.n_casa||0):(precos.n_apto||0),
              rs_itbi_util: rsItbiUtil, n_itbi: compsItbiAtivos.filter(c=>c.rs_util>0).length, excluidos:nExcl,
              incluidos: amostra.filter(a=>a.manual).length, n_nsp: amostra.filter(a=>a.nsp).length, fora_tamanho: foraTamanho, area_ref: area };
    m.rs_anuncio_ajust = m.rs_anuncio ? Math.round(m.rs_anuncio*m.idx_pedido_fechado) : null;
    // VENDAS NO PRÓPRIO PRÉDIO (05/10/2026): 3+ vendas no mesmo endereço → o corretor pode usar o preço delas
    const ruaKey=t=>{ const w=norm(t).toUpperCase().replace(/[^A-Z0-9 ]/g,' ').trim().split(/\s+/).filter(x=>x.length>=3); return w[w.length-1]||''; };
    const nums=(inp.numeros_predio||[inp.numero]).map(n=>String(n||'').replace(/\D/g,'').replace(/^0+/,'')).filter(Boolean);
    const rk=ruaKey(inp.rua);
    const mp=(grupo==='apto' && rk && nums.length) ? compsItbiAtivos.filter(c=>ruaKey(c.logradouro)===rk && nums.includes(String(c.numero||'').replace(/\D/g,'').replace(/^0+/,''))) : [];
    if(mp.length>=3){
      const pv=mp.map(c=>Number(c.valor)).filter(v=>v>0).sort((a,b)=>a-b), ult=[...mp].sort((a,b)=>String(b.data).localeCompare(String(a.data)))[0];
      m.mesmo_predio={ n:pv.length, min:pv[0], max:pv[pv.length-1], mediana:Math.round(mediana(pv)), ultima:{valor:Number(ult.valor), data:ult.data, unidade:ult.complemento||null},
                       valor_ajust:Math.round(mediana(pv)*(1+AV_INDICES.itbi_subdeclaracao)), endereco:`${mp[0].logradouro}, ${mp[0].numero}` };
      m.usar_predio=!!inp.usar_predio;
    }
    m.rs_itbi_ajust    = m.rs_itbi_util ? Math.round(m.rs_itbi_util*(1+m.sub_itbi)) : null;
    const partes=[m.rs_anuncio_ajust, m.rs_itbi_ajust].filter(x=>x>0);
    m.rs_final = partes.length ? Math.round(partes.reduce((a,b)=>a+b,0)/partes.length) : null;
    m.divergencia = (m.rs_anuncio_ajust && m.rs_itbi_ajust) ? Math.round((m.rs_anuncio_ajust/m.rs_itbi_ajust-1)*100) : null;
    m.valor_anuncio = m.rs_anuncio_ajust ? Math.round(area*m.rs_anuncio_ajust) : null;
    m.valor_itbi    = m.rs_itbi_ajust ? Math.round(area*m.rs_itbi_ajust) : null;
    m.valor_final   = m.rs_final ? Math.round(area*m.rs_final) : null;
    return m; })();
  if(/comercial|loja|galp|sala/i.test(tipo) && metodoUnico) metodoUnico.aviso='Imóvel comercial: o valor como imóvel pronto usa referências residenciais do bairro (o coletor ainda não busca anúncios comerciais); trate como ordem de grandeza.';

  // ── EVOLUTIVO: casas (e comerciais com terreno) — terreno + construção depreciada ──
  let evolutivo=null;
  const tlocal=dados.tlocal||null;
  if(grupo==='casa' && terreno && area && tlocal && tlocal.n>=10 && Number(tlocal.rs_terreno_ref)>300){
    evolutivo=contaCasaCalibrada({terreno, constr:area, idade:e.idade, padrao:e.padrao, padraoIptu:inp.padrao_iptu, estado:e.estado, tl:tlocal, rs_lote, lote_origem:loteOrigem});
    if(metodoUnico && metodoUnico.valor_final){ evolutivo.comparativo=metodoUnico.valor_final; evolutivo.divergencia=Math.round((metodoUnico.valor_final/evolutivo.total-1)*100); }
  }else if((grupo==='casa'||grupo==='com') && terreno && area && rs_terreno){
    const rsT = (grupo==='com' && rs_lote) ? rs_lote : rs_terreno, rsTO = (grupo==='com' && rs_lote) ? loteOrigem : rsTerrenoOrigem;
    evolutivo=contaEvolutivo({terreno, rs_terreno:rsT, rs_terreno_origem:rsTO, constr:area, padrao:e.padrao, idade:e.idade, estado:e.estado, rs_lote, lote_origem:loteOrigem, ref:tb});
    if(metodoUnico && metodoUnico.valor_final){ evolutivo.comparativo=metodoUnico.valor_final; evolutivo.divergencia=Math.round((evolutivo.total/metodoUnico.valor_final-1)*100); }
  }

  const r={ ok:false, versao:VERSAO, tipo, grupo, bairro, area_util:area, terreno, frente, dorm, suite, vaga,
    zona:geo.zona||null, ca:geo.ca_maximo?Number(geo.ca_maximo):null, mercado_rs_m2:rs_tipo||null,
    anuncios_usados: grupo==='terreno' ? ((loteLocal&&loteLocal.n_anuncio)||0) : ehcasa ? (precos.n_casa||0) : (precos.n_apto||0), lote_local:loteLocal,
    valor_mercado:null, faixa_min:null, faixa_max:null, metodo:null, regra:null, comparativo_adotado:null, aviso,
    metodo_unico:metodoUnico, evolutivo, idx_pedido_fechado:idxPF.idx, precos, rs_apto, rs_casa, rs_terreno, rs_terreno_origem:rsTerrenoOrigem,
    rs_lote, lote_origem:loteOrigem, terreno_bairro:tb, padrao_sugerido:padraoSugerido(bairro), n_excluidos:nExcl };
  // faixa com os mesmos multiplicadores do portal (0,93/1,07 · 0,9/1,1 · 0,95/1,05), para arredondar igual
  const FX={0.07:[0.93,1.07],0.1:[0.9,1.1],0.05:[0.95,1.05]};
  const set=(vm, f)=>{ r.valor_mercado=vm; r.faixa_min=Math.round(vm*FX[f][0]); r.faixa_max=Math.round(vm*FX[f][1]); };
  if(grupo==='terreno'){
    if(rs_lote){
      const vm=Math.round(terreno*rs_lote); set(vm, 0.1); r.mercado_rs_m2=rs_lote; r.regra='terreno';
      r.metodo=`terreno nu: ${terreno} m² × R$ ${rs_lote.toLocaleString('pt-BR')}/m² de lote (${loteOrigem})`;
      r.evolutivo={terreno, rs_terreno:rs_lote, rs_terreno_origem:loteOrigem, v_terreno:vm, total:vm, so_terreno:true, ref:tb,
                   recuos:recuos({zona:geo.zona, terreno, frente, area_comput: terreno*(Number(geo.ca_maximo)||1)})};
    }
  }else if(grupo==='casa' && evolutivo && evolutivo.calibrado && inp.usar_comparativo && metodoUnico && metodoUnico.valor_final){
    // CASA COM O COMPARATIVO ADOTADO PELO CORRETOR (23/10/2026): o valor segue os comparáveis; terreno + construção fica como referência
    const mu=metodoUnico, ev=evolutivo, vm=mu.valor_final; set(vm, 0.07); r.mercado_rs_m2=mu.rs_final; r.regra='casa_comparativo';
    r.metodo=`valor comparativo adotado pelo corretor: ${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = média de [anúncios ${mu.rs_anuncio?mu.rs_anuncio.toLocaleString('pt-BR'):'—'} × ${mu.idx_pedido_fechado}`+
      (mu.rs_itbi_ajust?` ; vendas reais ${mu.rs_itbi_util.toLocaleString('pt-BR')}/m² × ${(1+mu.sub_itbi).toFixed(3)}`:'')+`]`+
      ` · terreno + construção daria ${R$(ev.total)}`+(nExcl?` · ${nExcl} comparável(is) excluído(s) pelo corretor`:'');
    r.comparativo_adotado={ por:inp.adotado_por||null, em:new Date().toISOString(), evolutivo:ev.total, comparativo:vm };
  }else if(grupo==='casa' && evolutivo && evolutivo.calibrado){
    const ev=evolutivo, vm=ev.total; set(vm, 0.1); r.mercado_rs_m2=Math.round(vm/area); r.regra='casa_calibrada';
    r.metodo=`terreno ${terreno} m² × R$ ${ev.rs_terreno.toLocaleString('pt-BR')}/m² + construção ${area} m² × R$ ${ev.custo_m2.toLocaleString('pt-BR')}/m² × ${Math.round(ev.fator_idade*ev.fator_estado*100)}% (idade e estado)`+
      (ev.comparativo?` · referência comparativa: ${R$(ev.comparativo)} (${ev.divergencia>0?'+':''}${ev.divergencia}%)`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s)`:'');
  }else if(grupo==='com' && evolutivo){
    const vm=evolutivo.total; set(vm, 0.1); r.mercado_rs_m2=Math.round(vm/area); r.regra='comercial';
    r.metodo=`terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')}/m² de lote + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}%`+
      (metodoUnico&&metodoUnico.valor_final?` · referência residencial do entorno: ${R$(metodoUnico.valor_final)}`:'');
  }else if(metodoUnico && metodoUnico.valor_final && evolutivo){
    const mu=metodoUnico, vm=Math.round((mu.valor_final+evolutivo.total)/2); set(vm, 0.07); r.mercado_rs_m2=mu.rs_final; r.regra='media_comparativo_evolutivo';
    r.metodo=`média de [comparação ${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = ${R$(mu.valor_final)} ; terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')} + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}% = ${R$(evolutivo.total)}]`+
      (evolutivo.divergencia!=null?` · métodos divergem ${evolutivo.divergencia}%`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s)`:'');
  }else if(grupo==='apto' && metodoUnico && metodoUnico.usar_predio && metodoUnico.mesmo_predio){
    const mp=metodoUnico.mesmo_predio, vm=mp.valor_ajust; set(vm, 0.05); r.mercado_rs_m2=Math.round(vm/area); r.regra='mesmo_predio';
    r.metodo=`vendas no próprio prédio (mesma planta, confirmado pelo corretor): mediana de ${mp.n} vendas ${R$(mp.mediana)} × ${(1+AV_INDICES.itbi_subdeclaracao).toFixed(3)} = ${R$(vm)}`+
      (metodoUnico.valor_final?` · referência pelo m² do bairro: ${R$(metodoUnico.valor_final)}`:'');
  }else if(metodoUnico && metodoUnico.valor_final){
    const mu=metodoUnico; set(mu.valor_final, 0.07); r.mercado_rs_m2=mu.rs_final; r.regra='metodo_unico';
    r.metodo=`${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = média de [anúncios ${mu.rs_anuncio?mu.rs_anuncio.toLocaleString('pt-BR'):'—'} × ${mu.idx_pedido_fechado} (pedido→fechado, ${mu.idx_origem})`+
      (mu.rs_itbi_ajust?` ; ITBI ${mu.rs_itbi_util.toLocaleString('pt-BR')}/m² útil est. × ${(1+mu.sub_itbi).toFixed(3)} (subdeclaração)`:'')+
      `]`+(mu.divergencia!=null?` · fontes divergem ${mu.divergencia}%`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s) pelo corretor`:'')+(precos.base==='ITBI'?' · sem anúncios ao vivo nesta avaliação (só vendas reais)':'');
  }else if(evolutivo){
    const vm=evolutivo.total; set(vm, 0.1); r.regra='evolutivo';
    r.metodo=`terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')} + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}% (sem vendas e anúncios suficientes por perto para comparar)`;
  }else if(rs_tipo && area){
    set(Math.round(area*rs_tipo), 0.1); r.regra='sem_ajuste';
    r.metodo=`${area} m² × R$ ${rs_tipo.toLocaleString('pt-BR')}/m² (anúncios ${bairro}, sem ajuste)`;
  }
  r.ok=r.valor_mercado!=null;
  if(!r.ok && !r.erro) r.erro='Sem anúncios nem vendas suficientes por perto para avaliar.';
  r.comparaveis=amostraTodos.map(a=>({k:a._k,excluido:!!a.excluido,tipo:a.tipo,area:a.area,preco:a.preco,rs_m2:a.rs_m2,dorm:a.dorm,vaga:a.vaga,endereco:[a.rua,a.bairro].filter(Boolean).join(', '),aprox:!!a.aprox,url:(a.manual||a.nsp)?(a.url||null):null,dist_m:a.dist_m!=null?a.dist_m:null,manual:!!a.manual,por:a.por||null,nsp:!!a.nsp,ref:a.ref||null,lat:a.lat||null,lng:a.lng||null,origem:a.manual?('anúncio · incluído'+(a.por?' por '+a.por:'')):a.nsp?('anúncio Nova SP'+(a.ref?' · '+a.ref:'')):(a.lancamento?'lançamento':'anúncio')}))
    .concat(compsItbi.map(c=>grupo==='terreno'
      ? ({k:c._k,excluido:!!c.excluido,tipo:'Venda real (terreno)',area:Number(c.area_terreno),area_util_est:0,preco:c.valor,rs_m2:c.rs_util,rs_util:null,endereco:`${c.logradouro||''}${c.numero&&!/^9{4,}$/.test(String(c.numero))?', '+c.numero:''}`,data:c.data,lat:c.lat||null,lng:c.lng||null,dist_m:c.dist_m!=null?c.dist_m:null,origem:'Venda real de terreno '+(c.data||'')})
      : ({k:c._k,excluido:!!c.excluido,tipo:grupo==='com'?'Venda real (ref. residencial)':'Venda real',area:c.area_constr,area_util_est:Math.round(c.area_util_est||0),preco:c.valor,rs_m2:c.rs_m2,rs_util:c.rs_util,endereco:`${c.logradouro||''}${c.numero?', '+c.numero:''}`,data:c.data,lat:c.lat||null,lng:c.lng||null,origem:'Venda real '+(c.data||'')})));
  r.n_itbi_total=compsItbiTodos.length;
  return r;
}

/** Atalho: seleciona os comparáveis e calcula (sem a etapa de distância das ruas). */
export function avaliar(inp, dados){
  const sel=selecionarComparaveis(inp, dados);
  return calcularValor(inp, sel, dados);
}

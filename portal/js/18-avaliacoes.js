// ═══════════════════════════════════════════════════════════════
// AVALIAÇÃO DE IMÓVEIS — sob demanda (a avaliação vem ANTES do cadastro:
// é ela que precifica). Fluxo: corretor digita rua+número → geocode (nosso
// banco primeiro, OSM na cauda) → confirma o pino no mapa → zona por ponto
// (RPC) → preço ao vivo (motor) → dossiê → aprova → link pro proprietário.
//
// Segurança: geocode, zoneamento, comparáveis e gravação rodam no navegador
// com o login do corretor (RPCs Supabase). O motor no ar só raspa anúncio e
// não guarda segredo. pg='aval-imoveis' (≠ 'avaliacoes' = feedback trimestral).
// ═══════════════════════════════════════════════════════════════

// URL do motor de preço ao vivo. Trocar pela URL do host após o deploy
// (Render/Railway). Em dev aponta pro uvicorn local.
const AVAL_MOTOR = (typeof window!=='undefined' && window.AVAL_MOTOR_URL)
  || 'http://localhost:8902';

const AV_CASA = ['CASA','CASA TÉRREA','CASA ASSOBRADADA','CASA DE VILA','CASA EM CONDOMÍNIO','SOBRADO','CONDOMÍNIO'];
// Texto legal — aparece no preview, no detalhe e no dossiê (avaliacao.html tem cópia idêntica)
const AV_TEXTO_LEGAL = 'Este documento é uma opinião de valor para fins de comercialização, elaborada pela Imobiliária Nova São Paulo a partir de dados públicos (ITBI, zoneamento, outorga) e de mercado (anúncios e negócios fechados), por meio automatizado revisado pelo corretor responsável. Não constitui laudo de avaliação nem parecer técnico de avaliação mercadológica (NBR 14.653 / Resolução COFECI 1.066/2007), não substitui vistoria e não vale como garantia de preço de venda. Os valores podem variar com as condições do imóvel, da documentação e do mercado. O zoneamento, os coeficientes de aproveitamento e os gabaritos indicados vêm da base pública do GeoSampa e são aproximados: o enquadramento do lote deve ser confirmado pelo proprietário junto à Prefeitura de São Paulo (ficha técnica / certidão de zoneamento) antes de qualquer decisão, e a altura máxima construível depende ainda das restrições do COMAER (zona de proteção do Aeroporto de Congonhas) e de verificação em projeto.';
const AV_TIPOS = ['Apartamento','Studio','Cobertura','Casa térrea','Sobrado','Casa de vila','Casa em condomínio','Terreno','Comercial'];

// ── Padrão construtivo → custo de obra (CUB/m² Sinduscon-SP, jul/2026, com oneração) ──
// CUB não inclui fundações especiais, projetos, elevadores, ligações e taxas: custo total ≈ CUB × FATOR_OBRA.
// Fonte: Sinduscon-SP, tabela de julho/2026 (R8 = residencial 8 pavimentos; B/N/A = baixo/normal/alto).
const AV_PADROES = {
  economico: { lb:'Econômico / MCMV', cub:1945.55, ref:'R8-B' },
  medio:     { lb:'Médio',            cub:2231.37, ref:'R8-N' },
  alto:      { lb:'Alto',             cub:2618.33, ref:'R8-A' },
};
// CA máximo para EHIS (HIS) e EHMP (HMP) por zona — Decreto 63.728/2024, Quadro 2 (revogou o 59.885/2020, que já trazia os mesmos valores).
// Fora destas zonas o decreto remete ao CA da própria zona (ZEIS: 4). Direito de construir até o CA máximo é GRATUITO para EHIS (art. 19);
// EHMP paga outorga com Fator de Interesse Social (art. 20, Quadro 5).
const AV_HIS_CA = {
  eixos:{ zonas:['ZEU','ZEUa','ZEUP','ZEUPa','ZEM','ZEMP'], his:6, hmp:5, lb:'eixo de estruturação (ZEU/ZEM)' },
  centro:{ zonas:['ZC','ZCa','ZM','ZMa','ZMIS','ZMISa','ZC-ZEIS'], his:3, hmp:2.5, lb:'zona de centralidade / mista (ZC/ZM)' },
};
function _avCaSocial(zona, cat){ const z=String(zona||'').trim(); for(const g of Object.values(AV_HIS_CA)){ if(g.zonas.includes(z)) return {ca:g[cat], lb:g.lb}; } return null; }
// Tetos de preço por unidade (Decreto 64.895/2026, atualização anual pelo INCC) — definem de fato o que é HIS-1, HIS-2 e HMP
const AV_HIS_TETO = { his1:276102.20, his2:383636.74, hmp:537672.71, renda_his1:4863, renda_his2:9726, renda_hmp:16210, ref:'Decreto 64.895/2026' };
// ── Terreno × construção, medido na carteira da NSP (Nido, anúncios de venda; análise de 01/10/2026) ──
// Modelo CONJUNTO: valor = a_bairro·terreno + b·construída, com custo de construção b ÚNICO para todos os bairros (R$ 3661/m² em 2024–26, R² 0.72)
// e só o terreno variando por bairro — mais estável que uma regressão por bairro (vizinhos de padrão parecido ficam próximos).
// Prioridade para anúncios ATUALIZADOS em 2024–2026 (per/lote_per); série 2018–2026 só onde faltou volume ou o coeficiente saiu implausível.
// lote = mediana R$/m² de lotes anunciados (pedido) · share = fração do valor da casa que é terreno · casa_util = mediana R$/m² útil de casas
// chave = bairro normalizado (_avNorm, sem o sufixo entre parênteses)
const AV_TERRENO = {"aclimacao":{"terreno":3239,"constr":3085,"share":0.52,"n":103,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6500,"casa_n":103},"americanopolis":{"casa_util":3414,"casa_n":137,"per":"2018–2026","lote":1303,"lote_n":12,"lote_per":"2018–2026"},"bosque da saude":{"terreno":2049,"constr":3662,"share":0.36,"n":211,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6471,"casa_n":211,"lote":3220,"lote_n":9,"lote_per":"2024–2026"},"brooklin paulista":{"terreno":4508,"constr":3662,"share":0.55,"n":148,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8744,"casa_n":148,"lote":3875,"lote_n":11,"lote_per":"2018–2026"},"cambuci":{"terreno":2092,"constr":3085,"share":0.4,"n":106,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5345,"casa_n":106,"lote":4000,"lote_n":9,"lote_per":"2024–2026"},"campanario":{"casa_util":2270,"casa_n":32,"per":"2018–2026"},"campo belo":{"terreno":3398,"constr":3662,"share":0.48,"n":120,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7132,"casa_n":120,"lote":2778,"lote_n":11,"lote_per":"2018–2026"},"centro":{"casa_util":3200,"casa_n":321,"per":"2018–2026","lote":1684,"lote_n":72,"lote_per":"2018–2026"},"chacara inglesa":{"terreno":2657,"constr":3662,"share":0.42,"n":64,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7250,"casa_n":64,"lote":2832,"lote_n":18,"lote_per":"2018–2026"},"chacara santo antonio":{"casa_util":6794,"casa_n":30,"per":"2018–2026"},"cidade ademar":{"casa_util":2122,"casa_n":61,"per":"2018–2026"},"cidade domitila":{"casa_util":3116,"casa_n":42,"per":"2018–2026"},"cidade julia":{"casa_util":4607,"casa_n":42,"per":"2018–2026"},"cidade moncoes":{"casa_util":7000,"casa_n":55,"per":"2018–2026"},"cidade vargas":{"terreno":1221,"constr":3662,"share":0.28,"n":91,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5083,"casa_n":91,"lote":2207,"lote_n":14,"lote_per":"2018–2026"},"conceicao":{"casa_util":2376,"casa_n":110,"per":"2018–2026","lote":1363,"lote_n":14,"lote_per":"2018–2026"},"conjunto residencial jardim canaa":{"casa_util":3664,"casa_n":36,"per":"2018–2026"},"eldorado":{"casa_util":2400,"casa_n":65,"per":"2018–2026","lote":400,"lote_n":10,"lote_per":"2018–2026"},"indianopolis":{"terreno":4803,"constr":3662,"share":0.57,"n":108,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8323,"casa_n":108,"lote":6343,"lote_n":27,"lote_per":"2018–2026"},"interlagos":{"casa_util":4800,"casa_n":37,"per":"2018–2026"},"ipiranga":{"terreno":1589,"constr":3662,"share":0.3,"n":178,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5371,"casa_n":178,"lote":5000,"lote_n":10,"lote_per":"2024–2026"},"jabaquara":{"terreno":1196,"constr":3662,"share":0.26,"n":169,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5000,"casa_n":169,"lote":3370,"lote_n":13,"lote_per":"2024–2026"},"jardim aeroporto":{"terreno":1446,"constr":3662,"share":0.28,"n":69,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5667,"casa_n":69},"jardim botucatu":{"casa_util":11250,"casa_n":39,"per":"2018–2026"},"jardim da gloria":{"terreno":2984,"constr":3085,"share":0.47,"n":155,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6410,"casa_n":155},"jardim da saude":{"terreno":1962,"constr":3662,"share":0.36,"n":146,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5963,"casa_n":146,"lote":3956,"lote_n":5,"lote_per":"2024–2026"},"jardim europa":{"lote":8470,"lote_n":8,"lote_per":"2018–2026"},"jardim jabaquara":{"casa_util":3459,"casa_n":38,"per":"2018–2026"},"jardim maria estela":{"terreno":568,"constr":3085,"share":0.12,"n":81,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":3065,"casa_n":81},"jardim miriam":{"casa_util":4318,"casa_n":72,"per":"2018–2026"},"jardim oriental":{"terreno":881,"constr":3662,"share":0.21,"n":127,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":4921,"casa_n":127,"lote":2500,"lote_n":10,"lote_per":"2024–2026"},"jardim paulista":{"casa_util":17893,"casa_n":50,"per":"2018–2026","lote":9731,"lote_n":8,"lote_per":"2018–2026"},"jardim paulistano":{"casa_util":13313,"casa_n":32,"per":"2018–2026"},"jardim prudencia":{"casa_util":4762,"casa_n":51,"per":"2018–2026"},"jardim santa cruz":{"casa_util":3790,"casa_n":31,"per":"2018–2026"},"jardim saude":{"terreno":2461,"constr":3085,"share":0.46,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6000,"casa_n":66},"jardim vergueiro":{"casa_util":3764,"casa_n":32,"per":"2018–2026"},"jardim vila mariana":{"casa_util":6138,"casa_n":36,"per":"2018–2026"},"mirandopolis":{"terreno":3790,"constr":3662,"share":0.5,"n":216,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7452,"casa_n":216,"lote":4861,"lote_n":36,"lote_per":"2018–2026"},"moema":{"terreno":7002,"constr":3085,"share":0.7,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":9702,"casa_n":66},"paraiso":{"casa_util":7043,"casa_n":36,"per":"2018–2026"},"parque colonial":{"casa_util":6600,"casa_n":39,"per":"2018–2026"},"parque imperial":{"terreno":1711,"constr":3085,"share":0.35,"n":120,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5000,"casa_n":120,"lote":2950,"lote_n":11,"lote_per":"2018–2026"},"parque jabaquara":{"terreno":921,"constr":3662,"share":0.2,"n":109,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":4800,"casa_n":109},"pinheiros":{"lote":10608,"lote_n":13,"lote_per":"2018–2026"},"planalto paulista":{"terreno":2917,"constr":3662,"share":0.44,"n":656,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6659,"casa_n":656,"lote":3235,"lote_n":29,"lote_per":"2024–2026"},"sacoma":{"terreno":685,"constr":3085,"share":0.18,"n":111,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":3929,"casa_n":111,"lote":2500,"lote_n":33,"lote_per":"2018–2026"},"santo amaro":{"casa_util":6414,"casa_n":55,"per":"2018–2026","lote":3769,"lote_n":27,"lote_per":"2018–2026"},"sao joao climaco":{"lote":1201,"lote_n":9,"lote_per":"2018–2026"},"sao judas":{"terreno":2498,"constr":3085,"share":0.45,"n":125,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5932,"casa_n":125,"lote":4542,"lote_n":8,"lote_per":"2024–2026"},"saude":{"terreno":2696,"constr":3662,"share":0.42,"n":328,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6876,"casa_n":328,"lote":4613,"lote_n":42,"lote_per":"2024–2026"},"serraria":{"lote":152,"lote_n":7,"lote_per":"2018–2026"},"taboao":{"casa_util":2652,"casa_n":67,"per":"2018–2026"},"vila agua funda":{"casa_util":4534,"casa_n":50,"per":"2018–2026"},"vila babilonia":{"casa_util":4333,"casa_n":71,"per":"2018–2026"},"vila brasilina":{"casa_util":4290,"casa_n":213,"per":"2018–2026"},"vila brasilio machado":{"terreno":1555,"constr":3085,"share":0.34,"n":125,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5034,"casa_n":125,"lote":2367,"lote_n":14,"lote_per":"2018–2026"},"vila campestre":{"casa_util":3557,"casa_n":113,"per":"2018–2026","lote":1351,"lote_n":8,"lote_per":"2024–2026"},"vila caraguata":{"casa_util":4564,"casa_n":32,"per":"2018–2026"},"vila clementino":{"terreno":5556,"constr":3662,"share":0.59,"n":92,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":9326,"casa_n":92,"lote":7645,"lote_n":24,"lote_per":"2018–2026"},"vila congonhas":{"terreno":2572,"constr":3085,"share":0.48,"n":63,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":6286,"casa_n":63},"vila cordeiro":{"casa_util":6504,"casa_n":32,"per":"2018–2026"},"vila da saude":{"terreno":2290,"constr":3662,"share":0.39,"n":97,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":6825,"casa_n":97,"lote":4167,"lote_n":15,"lote_per":"2024–2026"},"vila das merces":{"terreno":1145,"constr":3085,"share":0.27,"n":73,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4236,"casa_n":73,"lote":2575,"lote_n":12,"lote_per":"2018–2026"},"vila do bosque":{"terreno":1725,"constr":3085,"share":0.36,"n":93,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5778,"casa_n":93,"lote":2957,"lote_n":11,"lote_per":"2018–2026"},"vila do encontro":{"casa_util":3846,"casa_n":146,"per":"2018–2026","lote":1882,"lote_n":6,"lote_per":"2024–2026"},"vila dom pedro i":{"terreno":2317,"constr":3085,"share":0.43,"n":141,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5380,"casa_n":141,"lote":4500,"lote_n":7,"lote_per":"2024–2026"},"vila fachini":{"casa_util":3426,"casa_n":114,"per":"2018–2026","lote":1645,"lote_n":12,"lote_per":"2018–2026"},"vila firmiano pinto":{"terreno":2158,"constr":3085,"share":0.41,"n":66,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5552,"casa_n":66,"lote":3097,"lote_n":8,"lote_per":"2018–2026"},"vila guarani":{"terreno":1296,"constr":3662,"share":0.27,"n":270,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":5411,"casa_n":270,"lote":3231,"lote_n":35,"lote_per":"2024–2026"},"vila gumercindo":{"terreno":2795,"constr":3662,"share":0.43,"n":127,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":7250,"casa_n":127,"lote":2801,"lote_n":34,"lote_per":"2018–2026"},"vila marari":{"casa_util":4293,"casa_n":38,"per":"2018–2026"},"vila mariana":{"terreno":4345,"constr":3662,"share":0.53,"n":284,"r2":0.72,"per":"2024–2026","modelo":"conjunto","casa_util":8020,"casa_n":284,"lote":6034,"lote_n":14,"lote_per":"2024–2026"},"vila mascote":{"casa_util":6009,"casa_n":57,"per":"2018–2026","lote":7083,"lote_n":34,"lote_per":"2018–2026"},"vila moinho velho":{"terreno":1407,"constr":3085,"share":0.32,"n":131,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5154,"casa_n":131,"lote":2385,"lote_n":17,"lote_per":"2018–2026"},"vila monte alegre":{"terreno":1508,"constr":3085,"share":0.33,"n":124,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4749,"casa_n":124,"lote":2615,"lote_n":31,"lote_per":"2018–2026"},"vila monumento":{"terreno":1658,"constr":3085,"share":0.37,"n":122,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5061,"casa_n":122,"lote":1933,"lote_n":16,"lote_per":"2018–2026"},"vila moraes":{"casa_util":3659,"casa_n":201,"per":"2018–2026","lote":2420,"lote_n":8,"lote_per":"2024–2026"},"vila nair":{"terreno":1479,"constr":3085,"share":0.32,"n":109,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":5200,"casa_n":109},"vila nogueira":{"casa_util":2157,"casa_n":32,"per":"2018–2026","lote":1672,"lote_n":9,"lote_per":"2018–2026"},"vila nova conceicao":{"casa_util":17741,"casa_n":39,"per":"2018–2026","lote":14151,"lote_n":10,"lote_per":"2018–2026"},"vila olimpia":{"casa_util":7500,"casa_n":39,"per":"2018–2026","lote":22756,"lote_n":7,"lote_per":"2024–2026"},"vila parque jabaquara":{"terreno":1012,"constr":3085,"share":0.25,"n":222,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4532,"casa_n":222,"lote":2129,"lote_n":37,"lote_per":"2018–2026"},"vila paulista":{"casa_util":4558,"casa_n":39,"per":"2018–2026"},"vila santa catarina":{"terreno":815,"constr":3085,"share":0.21,"n":206,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4022,"casa_n":206,"lote":1530,"lote_n":22,"lote_per":"2018–2026"},"vila santa maria":{"casa_util":2635,"casa_n":33,"per":"2018–2026"},"vila santo estefano":{"terreno":1074,"constr":3085,"share":0.26,"n":156,"r2":0.71,"per":"2018–2026","modelo":"conjunto","casa_util":4418,"casa_n":156,"lote":2523,"lote_n":9,"lote_per":"2024–2026"},"vila sao jose":{"casa_util":5508,"casa_n":42,"per":"2018–2026"},"vila vera":{"casa_util":4144,"casa_n":36,"per":"2018–2026"}};
// ── Altura máxima pelo COMAER: Plano Básico de Zona de Proteção do Aeroporto de Congonhas (SBSP), superfícies da ICA 11-408/2020, Tabela 4-3, código 4, IFR precisão ──
// O GeoSampa não publica o PBZPA (conferido em 01/10/2026: nem WFS nem WMS). Aqui as superfícies são reconstruídas geometricamente a partir da pista principal;
// a elevação do terreno vem da API pública Open-Meteo (modelo digital de 90 m). Resultado é ESTIMATIVA — a altura real é a da consulta prévia ao DECEA/COMAER.
const AV_COMAER = {
  nome:'Aeroporto de Congonhas (SBSP)', elev:802,                      // elevação do aeródromo (m)
  thr17:{lat:-23.6186, lng:-46.6591}, azimute_pista:167.9, comprimento:1940, // cabeceira 17 e eixo da pista 17R/35L (mesma geometria usada no Foca)
  hi:{h:45, raio:4000}, conica:{grad:0.05, h:100}, he:{h:145, raio:20000},  // horizontal interna, cônica (até 45+100 m), horizontal externa
  aprox:{recuo:60, meia_largura:150, diverg:0.15, s1:{len:3000, grad:0.02}, s2:{len:3600, grad:0.025}, s3:{len:8400, h:150}},
  trans:{grad:0.143, meia_faixa:150}, pe_direito:3.0,
  ref:'ICA 11-408/2020 (DECEA), Tabela 4-3 — PBZPA, aeródromo código 4, operação IFR de precisão'
};
function _avComaerSuperficie(lat,lng){
  const C=AV_COMAER, R=6371000, toR=d=>d*Math.PI/180;
  const m_lat=111320, m_lng=111320*Math.cos(toR(lat));
  const az=toR(C.azimute_pista), ux=Math.sin(az), uy=Math.cos(az);           // vetor unitário da pista (17 → 35), em metros (x=E, y=N)
  const dx=(lng-C.thr17.lng)*m_lng, dy=(lat-C.thr17.lat)*m_lat;             // ponto relativo à cabeceira 17
  const s=dx*ux+dy*uy, c=Math.abs(-dx*uy+dy*ux);                            // ao longo da pista (m) e lateral (m)
  const arpx=ux*C.comprimento/2, arpy=uy*C.comprimento/2, d=Math.hypot(dx-arpx, dy-arpy);
  const cand=[];
  if(d<=C.hi.raio) cand.push({sup:'horizontal interna', alt:C.elev+C.hi.h});
  else if(d<=C.hi.raio+C.conica.h/C.conica.grad) cand.push({sup:'cônica', alt:C.elev+C.hi.h+C.conica.grad*(d-C.hi.raio)});
  else if(d<=C.he.raio) cand.push({sup:'horizontal externa', alt:C.elev+C.he.h});
  // aproximação nas duas cabeceiras: 17 (chega do NNW: s<0) e 35 (chega do SSE: s>comprimento)
  for(const [nome, sa] of [['aproximação 17', -s], ['aproximação 35', s-C.comprimento]]){
    const A=C.aprox, t=sa-A.recuo; if(t<0) continue;
    if(c>A.meia_largura+A.diverg*t) continue;
    let alt;
    if(t<=A.s1.len) alt=C.elev+A.s1.grad*t;
    else if(t<=A.s1.len+A.s2.len) alt=C.elev+A.s1.grad*A.s1.len+A.s2.grad*(t-A.s1.len);
    else if(t<=A.s1.len+A.s2.len+A.s3.len) alt=C.elev+A.s3.h;
    else continue;
    cand.push({sup:nome, alt});
  }
  if(s>=0 && s<=C.comprimento && c>C.trans.meia_faixa) cand.push({sup:'transição', alt:C.elev+C.trans.grad*(c-C.trans.meia_faixa)});
  if(!cand.length) return null;
  cand.sort((a,b)=>a.alt-b.alt); return {...cand[0], dist_arp:Math.round(d)};
}
async function _avComaer(lat,lng){
  const sup=_avComaerSuperficie(lat,lng); if(!sup) return null;
  let elev=null;
  try{ const r=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`); const j=await r.json(); elev=Array.isArray(j.elevation)?j.elevation[0]:null; }catch(_){}
  if(elev==null) return {...sup, alt:Math.round(sup.alt), elev:null, altura:null, pav:null};
  const altura=Math.max(0, Math.round(sup.alt-elev)), pav=Math.floor(altura/AV_COMAER.pe_direito);
  return {...sup, alt:Math.round(sup.alt), elev:Math.round(elev), altura, pav};
}
function _avComaerTexto(k){
  if(!k) return '';
  if(k.altura==null) return `✈️ COMAER: superfície ${k.sup} do PBZPA de Congonhas, altitude máxima ${k.alt} m (sem elevação do terreno para converter em altura)`;
  return `✈️ COMAER (Congonhas): altura máxima ≈ <b>${k.altura} m</b> (~${k.pav} pavimentos) — superfície ${k.sup}, altitude ${k.alt} m, terreno a ${k.elev} m. Estimativa; confirmar no DECEA.`;
}
// Parâmetros padrão da conta reversa (método involutivo). Editáveis aqui; o corretor não mexe.
const AV_PARAM = {
  cub_ref:'Sinduscon-SP jul/2026',
  calibracao:'calibrado em viabilidades reais de incorporação na Zona Sul de São Paulo (2026)',
  // ── Áreas (o que de fato se vende e se constrói sobre o lote) ──
  eficiencia_his:0.97,     // EHIS/EHMP: privativa ≈ computável (garagem, circulação, áreas comuns e terraços são não computáveis — Decreto 63.728/2024 art. 17); projeto A: 6.849 / 6.924 = 0,99
  eficiencia_mercado:0.85, // mercado em eixo: circulação comum CONTA no CA (LPUOS art. 62 V exclui ZEU/ZEM) → privativa ≈ 85% da computável (estimativa; falta viabilidade de mercado p/ calibrar)
  his_unid_m2:28,          // unidade típica de EHIS (projeto A 27 m², projeto B 24–41) — usada só p/ traduzir os tetos de preço por unidade em R$/m²
  priv_sobre_construida:0.776,    // privativa / construída total (projeto A: 6.849 / 8.825)
  // ── Obra ──
  obra_sobre_cub:1.68,  // custo de obra por m² construído = CUB × 1,68 (construtora/projeto A: R$ 3.726/m² ÷ CUB R8-N 2.231; inclui BDI 12,5% e decorados 3%)
  // ── Despesas sobre o VGV (projeto A: incorporação 1% + aprovações 0,5% + gestão 5% + marketing 4,5% + entrega 0,5% + adm 2%) ──
  despesas:0.135,
  projetos_sobre_obra:0.025,  // projetos = 2,5% do custo de obra
  comissao:0.05,        // corretagem sobre o VGV (Rodrigo 01/10/2026; projeto A usa 6%)
  ret:0.04,             // RET (projeto A 4%)
  financiamento:0.03,   // juros/seguro do financiamento à produção (projeto A 0,5–3,4%; projeto C 5,6%)
  margem:0.15,          // margem do incorporador sobre o VGV (Rodrigo; material da incorporadora parceira: mínimo 15%; projeto A EBITDA 17,6%)
  custo_aquisicao:0.12, // ITBI 3% + comissão do terreno 4% + jurídico, estudos, demolição e IPTU ≈ 5% (projeto A: 1,33 MM sobre 10,05 MM) — sai do que vai ao proprietário
  // ── Compatibilidade (telas antigas) ──
  marketing:0.045, adm:0.02, fator_obra:1.68, eficiencia:0.90, constr_sobre_computavel:1.29,
  lanc_cadastro_util:1.69, // ITBI de prédio novo: área do cadastro ÷ área útil ≈ 1,69 (prédios 2019+, medido no Foca 13/09/2026)
  lanc_itbi_min_n:30,      // mínimo de vendas de unidades novas no raio para usar o ITBI como preço de lançamento
  lanc_anuncio_min_n:3,    // mínimo de empreendimentos anunciados (apto.vc) num raio de 2 km para usar como preço de lançamento
  lanc_sobre_usado:1.25,// se não houver lançamento anunciado no bairro: lançamento ≈ usado × 1,25
  casa_sobre_apto:0.60, // se não houver casa anunciada no bairro: R$/m² casa ≈ apto × 0,60 (mediana observada 30/09/2026)
  // Outorga onerosa (PDE, Lei 16.050/2014, art. 117): Ct = (At/Ac) × V × Fs × Fp por m² adicional acima do CA básico.
  outorga_fs:1.0,
  outorga_fp:1.0,
  qvt_sobre_mercado:0.50, // sem QVT informado: V ≈ 50% do valor de mercado do terreno (o cadastro fica bem abaixo do mercado)
  // Incentivos do PDE/LPUOS (Rodrigo, 01/10/2026). Lançamentos reais: projeto A HIS 10.808/m², projeto B HIS+HMP 10.500, UP Saúde studios 11–13 mil.
  his_max_rs_m2:12000,    // lançamento até este R$/m² → HIS (outorga isenta, Fs = 0; áreas não computáveis extras)
  hmp_max_rs_m2:15000,    // até este R$/m² → HMP (Fs = 0,5; mesmas áreas extras); acima → mercado (Fs = 1)
  fachada_ativa_bonus:0.50, // fachada ativa em eixo/centralidade: térreo comercial não computável até 50% do lote
  // ── Casas e terrenos: método evolutivo (terreno + construção depreciada) ──
  terreno_sobre_casa:0.33,     // casa vendida COMO CASA: R$/m² de terreno ≈ 33% do R$/m² útil de casa (modelo conjunto, carteira NSP 2024–26) — fallback quando o bairro não está em AV_TERRENO
  lote_sobre_casa:0.57,        // casa vendida COMO LOTE (p/ construir): R$/m² de lote anunciado ≈ 57% do R$/m² útil de casa (carteira NSP, anúncios 2024–2026) — fallback
  casa_obra_sobre_cub:1.25,    // custo de reposição de casa = CUB × 1,25 (sem BDI de incorporação)
  vida_util_casa:70,           // anos (Ross-Heidecke)
  fator_comercializacao:1.00,  // Fc sobre terreno + benfeitoria
  estados:{ novo:[0,'novo'], bom:[0.025,'bom'], regular:[0.18,'regular'], reforma:[0.33,'precisa de reforma'], ruim:[0.52,'ruim'] }, // Heidecke
  lote_min_m2:400,        // abaixo disso, alerta: CA máximo dificilmente é atingido
  frente_min_m:12,        // idem para frente estreita
  cota_solidariedade_m2:20000, // acima disso, PDE exige 10% em HIS ou equivalente
};
// ── Índices macro → micro (método único: anúncio × ITBI) ──
// pedido→fechado: fechamentos da própria NSP no NIDO (venda, 2019–2026, 1.773 pares): fechado/pedido mediano.
// ITBI: a guia declara ~96,6% do valor negociado (validação do Foca, 1.734 pares, 28/09/2026) → +3,5%.
// Área do cadastro (IPTU) ≈ 1,35 × área útil + 29 m² por vaga (medido no Foca, 13/09/2026) — usado só
// para trazer o R$/m² do ITBI (por área construída) para a base de área útil dos anúncios.
const AV_INDICES = {
  pedido_fechado: { global:0.952, 'SAUDE':0.953, 'VILA GUARANI':0.955, 'VILA DA SAUDE':0.963, 'PLANALTO PAULISTA':0.931,
                    'VILA MARIANA':0.952, 'VILA MONTE ALEGRE':0.964, 'MIRANDOPOLIS':0.950, 'JABAQUARA':0.940,
                    'VILA CLEMENTINO':0.952, 'IPIRANGA':0.953, 'CHACARA INGLESA':0.950, 'JARDIM DA SAUDE':0.943, 'SAO JUDAS':0.953 },
  itbi_subdeclaracao: 0.035,
  iptu_por_util: 1.35, iptu_por_vaga: 29,
  fonte: 'NIDO 2019–26 (pedido→fechado) · Foca 28/09/2026 (ITBI × fechamento) · Foca 13/09/2026 (área IPTU × útil)',
};
function _avIdxPedidoFechado(bairro){ const b=_avNormBairro(bairro).toUpperCase(); const k=Object.keys(AV_INDICES.pedido_fechado).filter(k=>k!=='global').sort((a,c)=>c.length-a.length).find(k=>b.includes(k)); return { idx: k?AV_INDICES.pedido_fechado[k]:AV_INDICES.pedido_fechado.global, origem: k?`${k} (NIDO)`:'média NSP (NIDO)' }; }
// Bairros onde o padrão sugerido é ALTO (o corretor pode trocar na tela)
const AV_BAIRROS_ALTO = ['moema','itaim','vila nova conceicao','brooklin','campo belo','jardim paulista','jardins','paraiso','vila olimpia','ibirapuera','chacara klabin','vila mariana','pinheiros','perdizes'];
const _avNormBairro = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const n0 = v => Math.round(v||0).toLocaleString('pt-BR');
function _avPadraoSugerido(bairro){ const b=_avNormBairro(bairro); return AV_BAIRROS_ALTO.some(x=>b.includes(x)) ? 'alto' : 'medio'; }
// Conta reversa de incorporação: quanto o terreno pode valer para o empreendimento fechar com margem.
function _avContaIncorp({terreno, ca, ca_basico, rs_lanc, padrao, qvt, frente, gabarito, outorga_ref_m2, outorga_ref_n, fp, categoria, fachada_ativa, zona, comaer}){
  const p=AV_PADROES[padrao]||AV_PADROES.medio, P=AV_PARAM;
  const cab = (ca_basico!=null && ca_basico>0) ? Number(ca_basico) : null;
  // categoria pelo preço de lançamento: HIS/HMP têm outorga isenta/reduzida (Fs) e áreas não computáveis a mais
  const cat = categoria && categoria!=='auto' ? categoria : (rs_lanc<=P.his_max_rs_m2 ? 'his' : rs_lanc<=P.hmp_max_rs_m2 ? 'hmp' : 'mercado');
  const fs = {his:0, hmp:0.5, mercado:1}[cat] ?? 1;
  const social = cat!=='mercado';
  // CA usado: para EHIS/EHMP o Decreto 63.728/2024 (Quadro 2) dá CA próprio, maior que o da zona (ZEU: 6 HIS / 5 HMP; ZC/ZM: 3 / 2,5)
  const ca_zona=Number(ca); const cs = social ? _avCaSocial(zona, cat) : null;
  const ca_usado = (cs && cs.ca>ca_zona) ? cs.ca : ca_zona;
  const area_comput=terreno*ca_usado;                             // o que conta no CA
  const priv_fator = social ? P.eficiencia_his : P.eficiencia_mercado;
  const area_fachada = fachada_ativa ? terreno*P.fachada_ativa_bonus : 0;   // térreo comercial NÃO computável
  const area_vendavel=area_comput*priv_fator + area_fachada;      // área privativa vendida (+ lojas da fachada ativa)
  // base legal da área vendável (vai para a memória e para o dossiê)
  const base_legal=[];
  if(social){
    if(cs && cs.ca>ca_zona) base_legal.push(`CA ${cs.ca} para ${cat.toUpperCase()} em ${cs.lb}, contra ${ca_zona} da zona para produto de mercado — Decreto 63.728/2024, Quadro 2 (regra já existente no Decreto 59.885/2020).`);
    else base_legal.push(`Zona ${zona||'?'} fora das zonas com CA próprio para HIS/HMP: usado o CA máximo da zona (${ca_zona}).`);
    base_legal.push(`Em EHIS/EHMP são não computáveis (não consomem CA): garagens, circulação e áreas comuns, terraços até 5% do lote por pavimento, áreas técnicas, e usos não residenciais até 20% da computável — Decreto 63.728/2024, art. 17 e 18; LPUOS art. 62, X. Por isso a área privativa vendida fica ≈ ${Math.round(P.eficiencia_his*100)}% da computável (em projeto real: 6.849 m² privativos sobre 6.924 computáveis).`);
    base_legal.push(cat==='his' ? 'Direito de construir até o CA máximo é gratuito para EHIS: sem outorga onerosa — Decreto 63.728/2024, art. 19.' : 'EHMP paga outorga com Fator de Interesse Social reduzido (Fs 0,5) — Decreto 63.728/2024, art. 20 e Quadro 5 do PDE.');
    base_legal.push(`Para valer, pelo menos 80% da área computável tem de ser ${cat.toUpperCase()} (art. 1º e 9º do decreto) e as unidades precisam caber nos tetos do ${AV_HIS_TETO.ref}: HIS-1 ${_avR$(AV_HIS_TETO.his1)}, HIS-2 ${_avR$(AV_HIS_TETO.his2)}, HMP ${_avR$(AV_HIS_TETO.hmp)} por unidade (renda familiar até ${_avR$(AV_HIS_TETO.renda_his1)}, ${_avR$(AV_HIS_TETO.renda_his2)} e ${_avR$(AV_HIS_TETO.renda_hmp)}). Numa unidade de ${P.his_unid_m2} m² isso equivale a ${_avR$(Math.round(AV_HIS_TETO.his2/P.his_unid_m2))}/m² (HIS-2) e ${_avR$(Math.round(AV_HIS_TETO.hmp/P.his_unid_m2))}/m² (HMP).`);
    base_legal.push('Conferido em projetos reais de HIS/HMP em ZEU na Zona Sul: a área privativa vendida ficou entre 5,9 e 6,4 vezes a área do lote.');
  }else{
    base_legal.push(`Produto de mercado: CA máximo da zona (${ca_zona}). Em ZEU/ZEM a circulação comum conta no CA (LPUOS art. 62, V), só garagem (1 vaga/unidade), áreas técnicas e fachada ativa ficam fora — privativa estimada em ${Math.round(P.eficiencia_mercado*100)}% da computável.`);
    if(_avCaSocial(zona,'his')) base_legal.push(`Alternativa: como EHIS/EHMP este lote teria CA ${_avCaSocial(zona,'his').ca} (HIS) ou ${_avCaSocial(zona,'hmp').ca} (HMP) — Decreto 63.728/2024, Quadro 2. Selecione a categoria no painel para comparar.`);
  }
  const area_constr=area_vendavel/P.priv_sobre_construida;         // construída total (subsolo, comuns, técnicas)
  const vgv=area_vendavel*rs_lanc;
  const custo_m2=p.cub*P.obra_sobre_cub;
  const obra=area_constr*custo_m2;
  const projetos=obra*P.projetos_sobre_obra;
  const despesas=vgv*P.despesas;
  const comissao=vgv*P.comissao, ret=vgv*P.ret, financiamento=vgv*P.financiamento;
  const indiretos=despesas+projetos+comissao+ret+financiamento;
  const margem=vgv*P.margem;
  const antes=vgv-obra-indiretos-margem;                          // sobra para terreno + outorga + custos de aquisição
  // outorga onerosa sobre a área computável acima do CA básico
  let outorga=0, area_adicional=0, v=null, v_origem='', outorga_modo='';
  const fpUsado = (fp!=null && fp>0) ? Number(fp) : P.outorga_fp;
  if(cab!=null && ca_usado>cab && fs>0){
    area_adicional=terreno*(ca_usado-cab);
    if(qvt && qvt>0){
      v=qvt; v_origem='QVT informado'; outorga_modo='formula';
      outorga=area_adicional*(terreno/area_comput)*v*fs*fpUsado;
    }else if(outorga_ref_m2 && outorga_ref_n>=5){
      v=outorga_ref_m2; v_origem=`mediana de ${outorga_ref_n} outorgas concedidas num raio de 1,5 km (GeoSampa)`; outorga_modo='referencia';
      outorga=area_adicional*outorga_ref_m2*fs;
    }else if(antes>0){
      v=(antes/terreno)*P.qvt_sobre_mercado; v_origem=`estimado: ${P.qvt_sobre_mercado*100}% do valor de mercado do terreno`; outorga_modo='formula';
      outorga=area_adicional*(terreno/area_comput)*v*fs*fpUsado;
    }
  }else if(cab!=null && ca_usado>cab){ area_adicional=terreno*(ca_usado-cab); v_origem='HIS: isenta (Decreto 63.728/2024, art. 19)'; outorga_modo='isenta'; }
  const bruto=antes-outorga;                                      // terreno + custos de aquisição
  const custos_aquisicao=Math.max(0,bruto)*(P.custo_aquisicao/(1+P.custo_aquisicao));
  const terreno_max=bruto-custos_aquisicao;                       // o que chega ao proprietário
  const alertas=[];
  if(terreno<P.lote_min_m2) alertas.push(`Lote de ${terreno} m²: abaixo de ${P.lote_min_m2} m² o CA máximo raramente é atingido (recuos e taxa de ocupação).`);
  if(frente && frente<P.frente_min_m) alertas.push(`Frente de ${frente} m: abaixo de ${P.frente_min_m} m a implantação de torre fica comprometida.`);
  if(gabarito && String(gabarito).trim() && !/sem|n[aã]o/i.test(String(gabarito))) alertas.push(`Gabarito de altura na zona: ${gabarito} — pode limitar o número de pavimentos antes do CA.`);
  let pav_nec=null;
  if(comaer && comaer.pav!=null){
    pav_nec=Math.ceil(area_constr/(terreno*0.7));   // pavimentos para caber a área construída com ocupação de 70% do lote
    if(pav_nec>comaer.pav) alertas.push(`Altura: o COMAER limita a ≈ ${comaer.altura} m (~${comaer.pav} pavimentos, superfície ${comaer.sup} do PBZPA de Congonhas); para construir ${n0(area_constr)} m² com 70% de ocupação seriam necessários ~${pav_nec} pavimentos. O CA ${ca_usado} provavelmente não é atingido — a conta é um teto, não o projeto.`);
    else alertas.push(`Altura: COMAER limita a ≈ ${comaer.altura} m (~${comaer.pav} pavimentos); o projeto precisa de ~${pav_nec} com 70% de ocupação — cabe.`);
  }
  if(area_comput>P.cota_solidariedade_m2) alertas.push(`Área computável acima de ${P.cota_solidariedade_m2.toLocaleString('pt-BR')} m²: PDE exige cota de solidariedade (10% em HIS ou equivalente).`);
  if(cab==null) alertas.push('CA básico não identificado na zona: outorga onerosa não calculada.');
  if(social) alertas.push(`Enquadrado como ${cat.toUpperCase()} pelo preço de lançamento (${cat==='his'?'até':'entre '+P.his_max_rs_m2.toLocaleString('pt-BR')+' e'} ${(cat==='his'?P.his_max_rs_m2:P.hmp_max_rs_m2).toLocaleString('pt-BR')} R$/m²): CA ${ca_usado}${ca_usado>ca_zona?' (zona: '+ca_zona+')':''}, outorga ${fs===0?'isenta':'com Fs 0,5'}. Veja "por que a área vendável é maior" abaixo.`);
  else alertas.push(`Mercado: área privativa ≈ ${P.eficiencia_mercado*100}% da computável e outorga integral. Esta faixa ainda não foi calibrada com viabilidade real — tratar como estimativa.`);
  if(fachada_ativa) alertas.push(`Fachada ativa: ${n0(area_fachada)} m² de térreo comercial não computável somados à área vendável (LPUOS, até ${P.fachada_ativa_bonus*100}% do lote). Depende de o projeto adotar fachada ativa e de a zona admitir.`);
  if(terreno_max<=0) alertas.push('Conta fechou negativa: neste padrão e preço de lançamento, a incorporação não paga o terreno.');
  return {padrao, cub:p.cub, custo_m2, ca:ca_usado, ca_zona, ca_social:cs?cs.ca:null, zona:zona||null, base_legal, ca_basico:cab, terreno, frente:frente||null, gabarito:gabarito||null,
          categoria:cat, fs, fachada_ativa:!!fachada_ativa, area_fachada, priv_fator,
          area_comput, area_constr, area_vendavel, vgv, obra, projetos, despesas, comissao, ret, financiamento, indiretos, margem, antes,
          area_adicional, v, v_origem, outorga, outorga_modo, fp:fpUsado, bruto, custos_aquisicao, terreno_max, terreno_vgv: vgv?terreno_max/vgv:null, alertas, comaer:comaer||null, pav_nec};
}

let _avImoveis = [];
let _avFiltro = { status:'', busca:'' };
let _avPino = null;                 // {lat,lng} confirmado
let _avForm = {};                   // dados do formulário atual
let _avMapa = null, _avMarker = null;

const _avR$ = v => (v==null||v===''||isNaN(Number(v))) ? '—'
  : 'R$ ' + Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0});
const _avNorm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const _ehCasa = t => AV_CASA.includes(String(t||'').toUpperCase());
// Conta de terreno para incorporação vale para tudo que ocupa lote próprio: casas, terreno e comercial (loja, galpão, prédio)
const _avPodeTerreno = t => _ehCasa(t) || /terreno|comercial|loja|galp|pr[eé]dio|sala/i.test(String(t||''));
// grupo de campos: apto (área útil) · casa (construída + terreno + idade/estado) · terreno (só o lote) · com (construída + terreno opcional)
const _avTipoGrupo = t => /terreno/i.test(t) ? 'terreno' : (_ehCasa(t) ? 'casa' : (/comercial|loja|galp|pr[eé]dio|sala/i.test(String(t||'')) ? 'com' : 'apto'));
function _avCamposTipo(){
  const sel=document.getElementById('av-tipo'); if(!sel) return;
  const gr=_avTipoGrupo(sel.value);
  document.querySelectorAll('#av-passo2 [data-t]').forEach(el=>{ el.style.display = el.dataset.t.split(' ').includes(gr) ? 'flex' : 'none'; });
  // trocou para casa/comercial depois do cadastro carregado: traz a área construída do cadastro se o campo estiver vazio
  const ar=document.getElementById('av-area'), ip=_avForm&&_avForm.iptuSel;
  if(ar && !ar.value && ip && /^(casa|com)$/.test(gr) && Number(ip.area_construida)>0) ar.value=Math.round(Number(ip.area_construida));
  const a=document.getElementById('av-area'); if(a) a.placeholder = '';
  const al=document.getElementById('av-area-lb'); if(al) al.textContent = gr==='apto' ? 'Área útil (m²)' : 'Área construída (m²)';
  const h=document.getElementById('av-tipo-hint'); if(h) h.textContent = {apto:'Apartamento: a conta usa a área útil (anúncios e ITBI do bairro).',
    casa:'Casa: duas contas — comparativo pela área construída e evolutivo (terreno + construção depreciada). O valor adotado é a média.',
    terreno:'Terreno: valor como lote (R$/m² de terreno) e, se a zona permitir, a conta para incorporadora.',
    com:'Comercial: comparativo pela área construída (referência residencial, ordem de grandeza) e, com terreno, a conta para incorporadora.'}[gr];
}
// Método evolutivo: V = (terreno × R$/m² terreno + construída × custo de reposição × (1 − depreciação)) × Fc. Depreciação Ross-Heidecke.
function _avTerrenoBairro(bairro){ const k=_avNorm(bairro).split('(')[0].replace(/\s+/g,' ').trim(); return AV_TERRENO[k]||null; }
function _avContaEvolutivo({terreno, rs_terreno, rs_terreno_origem, constr, padrao, idade, estado, rs_lote, lote_origem, ref}){
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

const AV_STATUS = {
  gerada:{lb:'Gerada',cor:'#b45309',bg:'#fef3c7'},
  aprovada:{lb:'Aprovada',cor:'#047857',bg:'#d1fae5'},
  rejeitada:{lb:'Rejeitada',cor:'#64748b',bg:'#f1f5f9'}
};

// ── RPC helper (usa o JWT do corretor via hdr()) ─────────────────
// ── Cadastro do IPTU (2º projeto Supabase, dado público da Prefeitura, sem dados pessoais) ──
async function _avIptu(fn, args){
  const U=window.IPTU_URL, K=window.IPTU_KEY; if(!U||!K) return null;
  const r=await fetch(`${U}/rest/v1/rpc/${fn}`,{method:'POST',headers:{'apikey':K,'Authorization':'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
  if(!r.ok) throw new Error('IPTU '+fn+' HTTP '+r.status);
  return r.json();
}
const _avN = v => (v==null||v===''||isNaN(Number(v)))?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});
async function _avBuscarIptu(){
  const el=document.getElementById('av-iptu-info'); if(!el) return;
  const rua=(_avForm.rua||'').trim(), num=(_avForm.num||'').trim();
  _avForm.iptu=null; _avForm.iptuVizinho=null; const seq=(window._avIptuSeq=(window._avIptuSeq||0)+1); const velho=()=>seq!==window._avIptuSeq;
  if(!rua||!num){ el.innerHTML=''; return; }
  el.innerHTML='<span style="color:#94a3b8;font-size:.88em">Consultando o cadastro do IPTU…</span>';
  let rows=[], ruas=[];
  try{ ruas=await _avIptu('iptu_ruas',{p_logradouro:rua,p_numero:num,p_lim:4})||[]; }catch(e){ el.innerHTML='<span style="color:#94a3b8;font-size:.85em">Cadastro do IPTU indisponível agora.</span>'; return; }
  if(velho()) return;
  const comNum=ruas.find(r=>r.tem_numero);
  if(comNum){ try{ rows=await _avIptu('iptu_por_rua',{p_logradouro_norm:comNum.logradouro_norm,p_numero:num,p_lim:300})||[]; }catch(_){} }
  else if(!ruas.length || ruas[0].sim<0.6){
    el.innerHTML = ruas.length ? `<div style="font-size:.86em;color:#334155;padding:6px 8px;background:#f8fafc;border-radius:8px">🏛️ <b>Cadastro do IPTU:</b> não achei "${rua}, ${num}". Você quis dizer: ${ruas.map(r=>`<a href="javascript:void(0)" onclick="_avForm.rua='${_avNomeRuaIptu(r.logradouro).replace(/'/g,"\\'")}';_avBuscarIptu()" style="color:#2563eb">${_avNomeRuaIptu(r.logradouro)}</a>`).join(' · ')}</div>`
                               : `<span style="color:#94a3b8;font-size:.85em">🏛️ Cadastro do IPTU: rua não encontrada no recorte carregado (CEPs 04…).</span>`;
    return;
  }
  if(velho()) return;
  if(!rows.length){
    let prox=[]; try{ prox=await _avIptu('iptu_proximos',{p_logradouro:(ruas[0]&&ruas[0].logradouro_norm)||rua,p_numero:num,p_lim:6})||[]; }catch(_){}
    if(velho()) return;
    // prédio a poucos números: quase sempre é o do imóvel (portaria num número, cadastro em outro)
    const pr=prox.find(p=>p.unidades>=4 && p.dif<=16);
    _avForm.iptuVizinho = pr ? {numero:pr.numero, unidades:Number(pr.unidades), distancia_em_numeros:pr.dif} : null;
    const dest = pr ? `<div style="margin:4px 0;color:#b45309">Prédio de ${pr.unidades} unidades no nº ${pr.numero}: se o imóvel é apartamento, provavelmente é este. <a href="javascript:void(0)" onclick="_avForm.num='${pr.numero}';_avBuscarIptu()" style="color:#2563eb;font-weight:600">Usar o cadastro do nº ${pr.numero}</a></div>` : '';
    el.innerHTML = prox.length
      ? `<div style="font-size:.86em;color:#334155;padding:6px 8px;background:#f8fafc;border-radius:8px">🏛️ <b>Cadastro do IPTU:</b> o nº ${num} não está no cadastro de ${prox[0].logradouro.replace(/\s+/g,' ')}.${dest} Números mais próximos: ${prox.map(p=>`<a href="javascript:void(0)" onclick="_avForm.num='${p.numero}';_avBuscarIptu()" style="color:#2563eb">${p.numero}</a> <span style="color:#94a3b8">(${p.unidades>1?p.unidades+' unid.':(p.uso||'')})</span>`).join(' · ')}</div>`
      : `<span style="color:#94a3b8;font-size:.85em">🏛️ Cadastro do IPTU: rua não encontrada no recorte carregado (CEPs 04…).</span>`;
    return;
  }
  _avForm.iptu=rows;
  const lote=rows[0], vertical=rows.length>1 || /condom|apart/i.test(lote.uso||'');
  const anos=rows.map(r=>+r.ano_construcao).filter(x=>x>1800);
  const resumo = vertical
    ? `<b>${rows.filter(r=>!/garagem|dep[oó]sito/i.test(r.uso||'')).length} unidades</b>${rows.some(r=>/garagem|dep[oó]sito/i.test(r.uso||''))?` + ${rows.filter(r=>/garagem|dep[oó]sito/i.test(r.uso||'')).length} vagas/depósitos avulsos`:''} no lote · terreno ${_avN(lote.area_terreno)} m² · ${lote.pavimentos||'?'} pavimentos · construído em ${anos.length?Math.min(...anos):'?'} · ${lote.padrao||''}`
    : `<b>${lote.uso||'Imóvel'}</b> · terreno <b>${_avN(lote.area_terreno)} m²</b> · construída ${_avN(lote.area_construida)} m² no cadastro · testada ${_avN(lote.testada)} m · ${lote.ano_construcao>1800?'construído em '+lote.ano_construcao:''} · ${lote.padrao||''}`;
  const tabela = vertical ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:#2563eb;font-size:.85em">ver unidades</summary>
      <div style="max-height:220px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.82em"><thead><tr style="color:#94a3b8;text-align:left"><th style="padding:2px 6px">Contribuinte</th><th style="padding:2px 6px">Complemento</th><th style="padding:2px 6px;text-align:right">Construída (cadastro)</th><th style="padding:2px 6px;text-align:right">Fração</th><th style="padding:2px 6px">Uso</th></tr></thead>
      <tbody>${rows.map(r=>`<tr style="border-top:1px solid #f1f5f9;cursor:pointer" onclick="_avUsarIptu('${r.sql}')"><td style="padding:2px 6px">${r.sql}</td><td style="padding:2px 6px">${r.complemento||''}</td><td style="padding:2px 6px;text-align:right">${_avN(r.area_construida)} m²</td><td style="padding:2px 6px;text-align:right">${_avN(r.fracao_ideal)}</td><td style="padding:2px 6px">${r.uso||''}</td></tr>`).join('')}</tbody></table></div>
      <div style="color:#94a3b8;font-size:.78em">Clique numa unidade para usá-la. Área construída do cadastro inclui a fração das áreas comuns e garagem — não é a área útil.</div></details>` : '';
  el.innerHTML=`<div style="font-size:.88em;color:#334155;padding:6px 8px;background:#f8fafc;border-radius:8px">🏛️ <b>Cadastro do IPTU</b> (Prefeitura, 2026): ${resumo}${!vertical?` · contribuinte ${lote.sql}`:''}${tabela}<div id="av-iptu-viz"></div></div>`;
  if(!vertical) _avUsarIptu(lote.sql, true);
  // o nº digitado é casa/lote, mas o prédio pode estar registrado num número vizinho (ex.: portaria no 156, cadastro no 160)
  _avForm.iptuVizinho=null;
  if(!vertical){
    let prox=[]; try{ prox=await _avIptu('iptu_proximos',{p_logradouro:comNum.logradouro_norm,p_numero:num,p_lim:12})||[]; }catch(_){}
    if(velho()) return;
    const pr=prox.find(p=>p.unidades>=4 && p.dif>0 && p.dif<=16);
    const vz=document.getElementById('av-iptu-viz');
    if(pr && vz){
      _avForm.iptuVizinho={numero:pr.numero, unidades:Number(pr.unidades), distancia_em_numeros:pr.dif};
      vz.innerHTML=`<div style="margin-top:6px;color:#b45309">Se o imóvel é apartamento: o nº ${num} é ${String(lote.uso||'casa/lote').toLowerCase()} no cadastro, e há um prédio de ${pr.unidades} unidades no nº ${pr.numero}. <a href="javascript:void(0)" onclick="_avForm.num='${pr.numero}';_avBuscarIptu()" style="color:#2563eb">Usar o cadastro do nº ${pr.numero}</a></div>`;
    }
  }
}
// Preenche o formulário com os dados do cadastro (casa/terreno: terreno e testada; apto: só referência)
// Resumo do cadastro para a caixa "Cadastro da Prefeitura" (tela e dossiê): a unidade escolhida, ou o lote quando nenhuma foi escolhida
function _avIptuResumo(tipo){
  const lote=(_avForm&&_avForm.iptu)||[]; if(!lote.length) return null;
  const sel=_avForm.iptuSel||null, base=sel||lote[0];
  const unid=lote.filter(r=>!/garagem|dep[oó]sito/i.test(r.uso||'')).length, vagas=lote.length-unid;
  const ehApto=/apart|studio|cobertura|duplex/i.test(tipo||'');
  return { unidade: sel?{sql:sel.sql, complemento:sel.complemento||null, uso:sel.uso, area_construida:sel.area_construida, fracao_ideal:sel.fracao_ideal}:null,
           sql: sel?sel.sql:(lote.length===1?base.sql:null), uso:base.uso, padrao:base.padrao, ano_construcao:base.ano_construcao>1800?base.ano_construcao:null,
           pavimentos:base.pavimentos||null, area_terreno:base.area_terreno, testada:base.testada, area_construida:sel||lote.length===1?base.area_construida:null,
           unidades_no_lote:unid, vagas_avulsas:vagas,
           desatualizado: ehApto && !/apart|condom/i.test(base.uso||''), oculto: !!_avForm.iptuOculto };
}
// Caixa do cadastro. Vem aberta; o tique "Ocultar" tira a caixa do dossiê e do parecer em texto (ex.: o número digitado é
// uma casa e o prédio está registrado em outro número). idSalvo = id da avaliação salva (grava na hora) ou null (prévia).
function _avIptuCaixaHTML(ip, idSalvo){
  if(!ip) return '';
  const N=v=>(v==null||v===''||isNaN(Number(v)))?null:Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});
  const it=(lb,v)=>v==null||v===''?'':`<div><span style="color:#94a3b8;font-size:.85em">${lb}</span><br><b>${v}</b></div>`;
  const ref=idSalvo?String(idSalvo):'p';
  const topo=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">🏛️ Cadastro da Prefeitura (IPTU 2026)</div>
      <label style="font-size:.85em;color:#475569;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap"><input type="checkbox" ${ip.oculto?'checked':''} onchange="_avIptuOcultar(this.checked, ${idSalvo?idSalvo:'null'})"> Ocultar do dossiê</label></div>`;
  if(ip.oculto) return `<div class="card" id="av-iptu-caixa-${ref}" style="margin-bottom:12px"><div class="cb">${topo}
    <div style="font-size:.85em;color:#94a3b8">Oculto: não aparece no dossiê do cliente nem no parecer em texto.</div></div></div>`;
  return `<div class="card" id="av-iptu-caixa-${ref}" style="margin-bottom:12px"><div class="cb">
    ${topo}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:.92em">
      ${it('Contribuinte (SQL)', ip.unidade?ip.unidade.sql:ip.sql)}${it('Unidade', ip.unidade&&ip.unidade.complemento)}
      ${it('Uso', ip.unidade?ip.unidade.uso:ip.uso)}${it('Padrão', ip.padrao)}${it('Ano de construção', ip.ano_construcao)}
      ${it('Pavimentos', ip.pavimentos)}${it('Terreno do lote', N(ip.area_terreno)&&N(ip.area_terreno)+' m²')}${it('Testada', N(ip.testada)&&N(ip.testada)+' m')}
      ${it('Área construída no cadastro', N(ip.unidade?ip.unidade.area_construida:ip.area_construida)&&N(ip.unidade?ip.unidade.area_construida:ip.area_construida)+' m²')}
      ${it('Fração ideal', ip.unidade&&N(ip.unidade.fracao_ideal))}${ip.unidades_no_lote>1?it('Unidades no lote', ip.unidades_no_lote+(ip.vagas_avulsas?` + ${ip.vagas_avulsas} vagas/depósitos`:'')):''}
    </div>
    ${ip.desatualizado?`<div style="margin-top:8px;font-size:.85em;color:#b45309">O cadastro de 2026 ainda descreve o lote de outra forma (${ip.uso||'—'}). É comum em prédio recente, antes de a Prefeitura desmembrar as unidades: confirme área e ano na matrícula e no carnê de IPTU da unidade.</div>`:''}
    <div style="margin-top:6px;font-size:.78em;color:#94a3b8">A área construída do cadastro inclui áreas comuns e garagem; não é a área útil. Dado de referência, não entra na conta de valor.</div>
  </div></div>`;
}
async function _avIptuOcultar(v, idSalvo){
  let ip=null;
  if(idSalvo){
    const x=(_avImoveis||[]).find(y=>y.id===idSalvo); if(!x||!x.entorno||!x.entorno.iptu) return;
    const entorno=Object.assign({}, x.entorno, {iptu:Object.assign({}, x.entorno.iptu, {oculto:!!v})});
    try{ await db.patch('aval_resultado', idSalvo, {entorno}); x.entorno=entorno; ip=entorno.iptu; }
    catch(e){ alert('Não foi possível gravar: '+(e.message||e)); return; }
  } else {
    _avForm.iptuOculto=!!v;
    const ent=_avForm.dossie&&_avForm.dossie.entorno; if(ent&&ent.iptu) ent.iptu=Object.assign({}, ent.iptu, {oculto:!!v});
    ip=(ent&&ent.iptu)||Object.assign({}, _avIptuResumo((document.getElementById('av-tipo')||{}).value)||{}, {oculto:!!v});
  }
  const box=document.getElementById('av-iptu-caixa-'+(idSalvo?String(idSalvo):'p'));
  if(box&&ip){ const tmp=document.createElement('div'); tmp.innerHTML=_avIptuCaixaHTML(ip, idSalvo); box.replaceWith(tmp.firstElementChild); }
}
function _avUsarIptu(sql, silencioso){
  const r=(_avForm.iptu||[]).find(x=>x.sql===sql); if(!r) return;
  _avForm.iptuSel=r;
  const set=(id,v)=>{ const e=document.getElementById(id); if(e && v && Number(v)>0 && (!e.value||!silencioso)) e.value=Math.round(Number(v)); };
  set('av-terreno', r.area_terreno); set('av-frente', r.testada);
  const tp=document.getElementById('av-tipo'); if(tp && /^(casa|com)$/.test(_avTipoGrupo(tp.value))) set('av-area', r.area_construida);   // casa: construída do cadastro ≈ útil
  if(r.ano_construcao>1800){ const id=document.getElementById('av-idade'); if(id && (!id.value||!silencioso)) id.value=new Date().getFullYear()-r.ano_construcao; }
  const t=document.getElementById('av-inc-terreno'); if(t && !t.value) t.value=Math.round(Number(r.area_terreno)||0)||'';
  if(!silencioso){ const el=document.getElementById('av-iptu-info'); el && el.querySelectorAll('tr[onclick]').forEach(tr=>tr.style.background= tr.getAttribute('onclick').includes(sql)?'#eff6ff':''); }
}
// Preço de lançamento automático: 1º lançamentos ANUNCIADOS na apto.vc (raio 2 km, preço atual de tabela),
// 2º vendas REAIS de apartamentos novos no ITBI (raio 1,5 km, preço pago 2–3 anos atrás), 3º anúncios do motor, 4º usado × 1,25
async function _avLancAnuncio(){
  if(_avForm.lancAnuncio!==undefined || !_avPino) return _avForm.lancAnuncio;
  try{ const r=await _avRpc('aval_lanc_anuncio',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_raio_m:2000}); _avForm.lancAnuncio=(r&&r.n>=AV_PARAM.lanc_anuncio_min_n&&r.rs_m2)?r:(r&&r.n?Object.assign(r,{_poucos:true}):null); }
  catch(_){ _avForm.lancAnuncio=null; }
  return _avForm.lancAnuncio;
}
async function _avLancItbi(){
  if(_avForm.lancItbi!==undefined || !_avPino) return _avForm.lancItbi;
  try{ const r=await _avRpc('aval_lanc_itbi',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_raio_m:1500}); _avForm.lancItbi=(r&&r.n>=AV_PARAM.lanc_itbi_min_n&&r.predios>=3)?r:null; }
  catch(_){ _avForm.lancItbi=null; }
  return _avForm.lancItbi;
}
function _avLancAuto(precos, rs_apto){
  const an=_avForm.lancAnuncio, it=_avForm.lancItbi;
  if(an&&!an._poucos&&an.rs_m2) return {rs:an.rs_m2, n:an.n,
    origem:`mediana de ${an.n} lançamentos anunciados a até ${(an.raio_m/1000).toLocaleString('pt-BR')} km (apto.vc, ${an.coletado_em}; faixa R$ ${(an.q1||0).toLocaleString('pt-BR')}–${(an.q3||0).toLocaleString('pt-BR')}/m²)`
      +(it&&it.rs_m2_cadastro?` · vendas reais de novos no ITBI: R$ ${Math.round(it.rs_m2_cadastro*AV_PARAM.lanc_cadastro_util).toLocaleString('pt-BR')}/m²`:'')};
  if(it&&it.rs_m2_cadastro) return {rs:Math.round(it.rs_m2_cadastro*AV_PARAM.lanc_cadastro_util), n:it.n,
    origem:`vendas reais (ITBI) de ${it.n} unidades novas em ${it.predios} prédios a até ${(it.raio_m/1000).toLocaleString('pt-BR')} km, ${it.periodo} (R$ ${it.rs_m2_cadastro.toLocaleString('pt-BR')}/m² do cadastro × ${AV_PARAM.lanc_cadastro_util} → área útil)`};
  if(precos&&precos.rs_lanc) return {rs:precos.rs_lanc, n:precos.n_lanc||0, origem:`${precos.n_lanc} lançamentos anunciados`};
  return {rs: rs_apto?Math.round(rs_apto*AV_PARAM.lanc_sobre_usado):null, n:0, origem:`usado × ${AV_PARAM.lanc_sobre_usado} (sem lançamento no ITBI nem anunciado)`};
}
async function _avRpc(fn, args){
  const call=()=>fetch(`${SBU}/rest/v1/rpc/${fn}`, { method:'POST', headers:hdr(), body:JSON.stringify(args||{}) });
  let r=await call();
  // token vencido (401): renova a sessão e tenta de novo uma vez
  if(r.status===401 && typeof _authRenovarSePerto==='function' && await _authRenovarSePerto(true)) r=await call();
  if(!r.ok){ let msg=''; try{ msg=(await r.json()).message||''; }catch(_){} throw new Error('RPC '+fn+' HTTP '+r.status+(msg?' — '+msg:'')); }
  return r.json();
}

// ═══════════════ ENTRADA DO MÓDULO ═══════════════
async function carregarAvalImoveis(opts){
  opts=opts||{};
  const root = document.getElementById('aval-imoveis-root');
  if(!root) return;
  root.innerHTML = `
    <div class="ph" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h1 class="pt">Avaliação de Imóveis</h1>
        <div class="pst">Digite o endereço e gere a avaliação — antes mesmo de cadastrar o imóvel.</div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-o" onclick="carregarAvalImoveis({lista:true})">🗂 Avaliações salvas</button><button class="btn btn-p" onclick="avalNova()">＋ Nova avaliação</button></div>
    </div>
    <div id="aval-corpo"><div class="card"><div class="cb">Carregando…</div></div></div>`;
  // tela inicial = formulário de nova avaliação (a lista fica no botão "Avaliações salvas")
  if(!opts.lista){ try{ fetch(`${AVAL_MOTOR}/health`,{mode:'cors'}).catch(()=>{}); }catch(_){} avalNova(); return; }
  // acorda o motor (Render free hiberna) enquanto a lista carrega — sem esperar a resposta
  try{ fetch(`${AVAL_MOTOR}/health`,{mode:'cors'}).catch(()=>{}); }catch(_){}
  try{
    const q='?select=id,codigo,fonte,tipo,bairro,endereco,area_util,terreno,preco_pedido,'
      +'valor_mercado,zona,ca,incorp_aplicavel,incorp_valor_terreno,incorp_ganho_pct,'
      +'status,aprovado_por,token,gerado_em,comparaveis,faixa_min,faixa_max,mercado_rs_m2,'
      +'anuncios_usados,metodo,incorp_area_constr,incorp_lancamento_rs_m2,incorp_vgv,edificio,dorm,suite,vaga,observacao,lat,lng,entorno,memoria,frente,'
      +'corretor_nome,corretor_creci,lat,lng,entorno,memoria'
      +'&fonte=eq.ondemand&order=gerado_em.desc&limit=300';
    _avImoveis = await db.get('aval_resultado', q);
    if(!Array.isArray(_avImoveis)) _avImoveis=[];
    renderAvalLista();
  }catch(e){
    document.getElementById('aval-corpo').innerHTML =
      `<div class="card"><div class="cb">Não foi possível carregar.<br><small style="color:#94a3b8">${e.message||e}</small></div></div>`;
  }
}

// ═══════════════ LISTA (avaliações salvas) ═══════════════
function renderAvalLista(){
  const corpo = document.getElementById('aval-corpo');
  if(!corpo) return;
  const f=_avFiltro, busca=_avNorm(f.busca);
  const lista=_avImoveis.filter(x=>{
    if(f.status && x.status!==f.status) return false;
    if(busca){ const alvo=_avNorm(`${x.codigo} ${x.endereco} ${x.bairro}`); if(!alvo.includes(busca)) return false; }
    return true;
  });
  const nInc=_avImoveis.filter(x=>x.incorp_aplicavel).length;
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input placeholder="Buscar endereço, bairro, código…" value="${f.busca||''}"
        oninput="_avSet('busca',this.value)" style="flex:1;min-width:180px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px">
      <select onchange="_avSet('status',this.value)" style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px">
        <option value="">Todos os status</option>
        <option value="gerada" ${f.status==='gerada'?'selected':''}>Geradas</option>
        <option value="aprovada" ${f.status==='aprovada'?'selected':''}>Aprovadas</option>
        <option value="rejeitada" ${f.status==='rejeitada'?'selected':''}>Rejeitadas</option>
      </select>
      <span style="color:#94a3b8;font-size:.88em">${_avImoveis.length} salvas · ${nInc} c/ incorporação</span>
    </div></div>
    <div class="card"><div class="cb" style="padding:0"><div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.9em"><thead>
        <tr style="text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">
          <th style="padding:10px 12px">Endereço</th><th style="padding:10px 12px">Bairro</th>
          <th style="padding:10px 12px;text-align:right">Mercado</th>
          <th style="padding:10px 12px">Incorporação</th><th style="padding:10px 12px">Status</th></tr>
      </thead><tbody>
        ${lista.length?lista.map(_avLinha).join(''):
          '<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8">Nenhuma avaliação salva ainda. Clique em <b>Nova avaliação</b>.</td></tr>'}
      </tbody></table>
    </div></div></div>`;
}
function _avLinha(x){
  const st=AV_STATUS[x.status]||AV_STATUS.gerada;
  const inc=x.incorp_aplicavel
    ? `<span style="color:#047857;font-weight:600">${_avR$(x.incorp_valor_terreno)}</span>${x.incorp_ganho_pct!=null?` <span style="color:#059669;font-size:.85em">${x.incorp_ganho_pct>=0?'+':''}${Math.round(x.incorp_ganho_pct)}%</span>`:''}`
    : '<span style="color:#cbd5e1">—</span>';
  return `<tr style="border-bottom:1px solid #f1f5f9;cursor:pointer" onclick="abrirAvalDetalhe(${x.id})">
    <td style="padding:10px 12px"><div style="font-weight:600">${x.endereco||x.codigo}</div>
      <div style="color:#94a3b8;font-size:.85em">${x.tipo||''}${x.area_util?' · '+Math.round(x.area_util)+' m²':''}</div></td>
    <td style="padding:10px 12px">${x.bairro||''}${x.zona?`<div style="color:#94a3b8;font-size:.82em">${x.zona}${x.ca?' · CA '+Number(x.ca):''}</div>`:''}</td>
    <td style="padding:10px 12px;text-align:right">${_avR$(x.valor_mercado)}</td>
    <td style="padding:10px 12px">${inc}</td>
    <td style="padding:10px 12px"><span style="background:${st.bg};color:${st.cor};padding:2px 8px;border-radius:999px;font-size:.8em;font-weight:600">${st.lb}</span></td></tr>`;
}
function _avSet(k,v){ _avFiltro[k]=v; renderAvalLista(); }

// ═══════════════ NOVA AVALIAÇÃO — formulário ═══════════════
function avalNova(){
  _avPino=null; _avForm={};
  if(_avMapa){ try{ _avMapa.remove(); }catch(_){} } _avMapa=null; _avMarker=null;   // o div do mapa é recriado: o mapa antigo ficaria preso ao elemento que saiu da tela
  const corpo=document.getElementById('aval-corpo');
  corpo.innerHTML = `
    <div class="card"><div class="cb">
      <div style="font-weight:600;margin-bottom:10px">1 · Onde fica o imóvel</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
        <input id="av-rua" placeholder="Rua / Avenida — pode digitar só o nome (ex: guaiós, nhambiquaras)" onkeydown="if(event.key==='Enter')avalGeocodificar()" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-num" placeholder="Número" inputmode="numeric" onkeydown="if(event.key==='Enter')avalGeocodificar()" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      </div>
      <div id="av-bairro-box" style="display:none;margin-top:8px;font-size:.88em;color:#64748b">Bairro detectado: <input id="av-bairro" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;width:220px" title="Usado para buscar os anúncios do bairro. Corrija se precisar."></div>
      <button class="btn btn-o" style="margin-top:10px" onclick="avalGeocodificar()">🔎 Localizar no mapa</button>
      <div id="av-geo-res" style="margin-top:10px"></div>
      <div id="av-mapa" style="height:280px;border-radius:10px;margin-top:10px;display:none;border:1px solid #e2e8f0"></div>
      <div id="av-pino-info" style="margin-top:8px;color:#64748b;font-size:.9em"></div>
      <div id="av-comaer-info" style="margin-top:4px;color:#64748b;font-size:.88em"></div>
      <div id="av-iptu-info" style="margin-top:6px"></div>
      <div id="av-incorp-cta"></div>
      <div id="av-incorp-painel" style="display:none;margin-top:10px"></div>
      <div id="av-incorp-solo"></div>
    </div></div>

    <div class="card" id="av-passo2" style="display:none"><div class="cb">
      <div style="font-weight:600;margin-bottom:10px">2 · O imóvel</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Tipo de imóvel</span><select id="av-tipo" onchange="_avCamposTipo()" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%">
          ${AV_TIPOS.map(t=>`<option>${t}</option>`).join('')}</select></label>
        <label data-t="apto casa com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span id="av-area-lb">Área útil (m²)</span><input id="av-area" type="number" placeholder="Área útil (m²)" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="casa terreno com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Terreno (m²)</span><input id="av-terreno" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="casa terreno com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Frente (m)</span><input id="av-frente" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="apto casa" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Dormitórios</span><input id="av-dorm" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="apto casa" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Suítes</span><input id="av-suite" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="apto casa com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Vagas</span><input id="av-vaga" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="casa com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Padrão da construção</span><select id="av-padrao-casa" title="Padrão da construção (custo de reposição pelo CUB Sinduscon-SP)" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%">
          ${Object.entries(AV_PADROES).map(([k,v])=>`<option value="${k}" ${k==='medio'?'selected':''}>${v.lb}</option>`).join('')}</select></label>
        <label data-t="casa com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Idade da construção (anos)</span><input id="av-idade" type="number" placeholder="" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
        <label data-t="casa com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>Estado de conservação</span><select id="av-estado" title="Estado de conservação (Heidecke)" style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%">
          ${Object.entries(AV_PARAM.estados).map(([k,v])=>`<option value="${k}" ${k==='bom'?'selected':''}>${v[1].charAt(0).toUpperCase()+v[1].slice(1)}</option>`).join('')}</select></label>
        <label data-t="casa terreno com" style="display:flex;flex-direction:column;gap:3px;font-size:.78em;color:#64748b;font-weight:500"><span>R$/m² de terreno na região (opcional)</span><input id="av-rs-terreno" type="number" placeholder="se souber" title="Se souber o preço de terreno na região (anúncios de lotes, negócios recentes), informe. Senão o sistema estima pelo R$/m² de casa do bairro." style="font-size:1.28em;color:#0f172a;font-weight:400;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px;width:100%"></label>
      </div>
      <div id="av-tipo-hint" style="color:#94a3b8;font-size:.82em;margin-top:4px"></div>
      <button class="btn btn-p" style="margin-top:12px" onclick="avalCalcular()">⚙️ Gerar avaliação</button>
      <div id="av-calc-status" style="margin-top:8px;color:#64748b;font-size:.9em"></div>
    </div></div>

    <div style="margin-top:8px"><button class="btn btn-o bsm" onclick="carregarAvalImoveis({lista:true})">🗂 Ver avaliações salvas</button></div>`;
  _avCamposTipo();
}

async function _avCarregarLeaflet(){
  if(!document.getElementById('av-tt-css')){ const st=document.createElement('style'); st.id='av-tt-css'; st.textContent='.av-tt{background:#dc2626;color:#fff;border:0;font-weight:600;font-size:.8em;padding:2px 8px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.3)} .av-tt:before{border-top-color:#dc2626}'; document.head.appendChild(st); }
  if(window.L) return;
  await new Promise((ok,err)=>{
    const css=document.createElement('link'); css.rel='stylesheet';
    css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload=ok; s.onerror=err; document.head.appendChild(s);
  });
}

// Localiza o endereço SEM pedir bairro. Ordem: (1) vendas do ITBI geolocalizadas (aceita grafia aproximada: "gaiós" → Al. dos Guaiós),
// (2) base local, (3) OpenStreetMap, (4) OpenStreetMap com o nome corrigido pelo cadastro do IPTU. O bairro é detectado depois.
const _avTipoRua = t => ({R:'Rua',AV:'Avenida',AL:'Alameda',TV:'Travessa',PC:'Praça',PCA:'Praça',ESTR:'Estrada',LGO:'Largo',VL:'Viela',PSG:'Passagem'}[String(t||'').toUpperCase()]||'');
function _avNomeRuaIptu(lg){ const m=String(lg||'').trim().match(/^(\S+)\s+(.*)$/); if(!m) return lg; const t=_avTipoRua(m[1]); return (t?t+' ':m[1]+' ')+_avCap(m[2].replace(/\bDR\b/,'Doutor').replace(/\bPROF\b/,'Professor').replace(/\bGAL\b/,'General').replace(/\bCEL\b/,'Coronel').replace(/\bSTA\b/,'Santa').replace(/\bSTO\b/,'Santo')); }
async function _avOsm(q){
  try{ const url='https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=4&countrycodes=br&bounded=1&viewbox=-46.90,-23.35,-46.35,-24.00&q='+encodeURIComponent(q);
       const arr=await (await fetch(url,{headers:{'Accept-Language':'pt-BR'}})).json();
       return (arr||[]).map(o=>({label:o.display_name.split(',').slice(0,3).join(','),lat:+o.lat,lng:+o.lon,origem:'OpenStreetMap',bairro:(o.address||{}).suburb||(o.address||{}).neighbourhood||(o.address||{}).quarter||''})); }
  catch(_){ return []; }
}
async function avalGeocodificar(){
  const rua=(document.getElementById('av-rua').value||'').trim();
  const num=(document.getElementById('av-num').value||'').trim();
  const res=document.getElementById('av-geo-res');
  if(!rua){ res.innerHTML='<span style="color:#dc2626">Informe ao menos a rua.</span>'; return; }
  _avForm={rua,num,bairro:''}; window._avIptuSeq=(window._avIptuSeq||0)+1;
  ['av-iptu-info','av-comaer-info','av-incorp-cta','av-pino-info'].forEach(id=>{ const e=document.getElementById(id); if(e) e.innerHTML=''; });
  const bb=document.getElementById('av-bairro'); if(bb) bb.value='';
  res.innerHTML='Procurando…';
  let cands=[];
  // 1) vendas registradas (ITBI) geolocalizadas — aceita grafia aproximada
  try{ const r=await _avRpc('aval_geocode_endereco',{p_rua:rua,p_numero:num}); const h=Array.isArray(r)?r[0]:null;
       if(h&&h.lat) cands.push({label:`${_avCap(h.rua_norm)}${num?', '+num:''} (digitado: ${rua})`,lat:h.lat,lng:h.lng,origem:`vendas registradas · ${h.precisao}`}); }catch(_){}
  // 2) base local de endereços
  try{ const loc=await _avRpc('aval_geocode',{p_q:`${rua} ${num}`}); (loc||[]).forEach(c=>cands.push({label:c.endereco,lat:c.lat,lng:c.lng,origem:'nosso banco',bairro:c.distrito||''})); }catch(_){}
  // 3) OpenStreetMap com o que foi digitado
  if(!cands.length) cands=await _avOsm([rua+(num?', '+num:''),'São Paulo','SP'].join(', '));
  // 4) nome corrigido pelo cadastro do IPTU (ex.: "gaiós" → Alameda dos Guaiós) e nova tentativa no OSM
  if(!cands.length){
    try{ const ruas=await _avIptu('iptu_ruas',{p_logradouro:rua,p_numero:num,p_lim:4})||[];
         for(const r of ruas.filter(x=>x.tem_numero||x.sim>=0.6).slice(0,3)){
           const nome=_avNomeRuaIptu(r.logradouro); const c=await _avOsm(`${nome}${num?', '+num:''}, São Paulo, SP`);
           c.forEach(x=>{ x.origem='OpenStreetMap · nome do cadastro: '+nome; x.ruaCorrigida=nome; }); cands.push(...c.slice(0,1)); }
    }catch(_){}
  }
  if(!cands.length){
    res.innerHTML='<span style="color:#b45309">Não localizei este endereço. Arraste o pino até o imóvel — o zoneamento e o cadastro são consultados depois que você posicionar.</span>';
    _avForm.pinoProvisorio=true;
    await _avMostrarMapa(-23.61,-46.66);   // ponto neutro: nada é calculado até o corretor arrastar
    return;
  }
  res.innerHTML='<div style="font-size:.9em;color:#64748b;margin-bottom:6px">Escolha o endereço certo (arraste o pino se precisar ajustar):</div>'
    + cands.slice(0,5).map((c,i)=>`<div style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:4px;cursor:pointer"
        onclick="_avEscolher(${c.lat},${c.lng},${i})">📍 ${c.label} <span style="color:#94a3b8;font-size:.82em">· ${c.origem}</span></div>`).join('');
  window._avCands=cands.slice(0,5);
  await _avEscolher(cands[0].lat,cands[0].lng,0);
}
// Bairro a partir do ponto (OpenStreetMap reverso); cai no distrito do zoneamento se não houver
async function _avDetectarBairro(){
  const seq=window._avPinoSeq;
  const c=(window._avCands||[]).find(x=>Math.abs(x.lat-_avPino.lat)<1e-6&&Math.abs(x.lng-_avPino.lng)<1e-6);
  let b=c&&c.bairro||'';
  if(!b){ try{ const o=await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&addressdetails=1&lat=${_avPino.lat}&lon=${_avPino.lng}`,{headers:{'Accept-Language':'pt-BR'}})).json(); const ad=(o&&o.address)||{}; b=ad.suburb||ad.neighbourhood||ad.quarter||''; }catch(_){} }
  if(seq!==window._avPinoSeq) return;
  if(!b && _avForm.geo && _avForm.geo.distrito) b=_avCap(_avForm.geo.distrito);
  _avForm.bairro=b;
  const inp=document.getElementById('av-bairro'), box=document.getElementById('av-bairro-box');
  if(inp){ inp.value=b; inp.onchange=()=>{ _avForm.bairro=inp.value.trim(); }; }
  if(box) box.style.display='';
}

// Ponto mudou: descarta tudo o que foi calculado para o ponto anterior (incorporação, cache de buscas, dossiê)
function _avNovoPonto(){
  ['ctx','dossie','cache','incorp','memoria','lancItbi','lancAnuncio','evolutivo','comaer','entorno','geo','iptu','iptuSel','iptuOculto','iptuVizinho','podeIncorp','incorpMotivo','metodoUnico'].forEach(k=>{ delete _avForm[k]; });
  const pan=document.getElementById('av-incorp-painel'); if(pan){ pan.style.display='none'; pan.innerHTML=''; }
  const solo=document.getElementById('av-incorp-solo'); if(solo) solo.innerHTML='';
}
async function _avEscolher(lat,lng,i){
  _avNovoPonto();
  _avPino={lat,lng}; _avForm.pinoProvisorio=false;
  const c=(window._avCands||[])[i]; if(c&&c.ruaCorrigida) _avForm.rua=c.ruaCorrigida;
  await _avMostrarMapa(lat,lng);
  if(window._avCands) document.querySelectorAll('#av-geo-res > div[onclick]').forEach((el,k)=>
    el.style.borderColor = k===i ? '#1E2D4A' : '#e2e8f0');
}

async function _avMostrarMapa(lat,lng){
  try{ await _avCarregarLeaflet(); }catch(_){ document.getElementById('av-pino-info').textContent='(mapa indisponível — usando o ponto encontrado)'; _avLiberaPasso2(); return; }
  const div=document.getElementById('av-mapa'); div.style.display='block';
  if(!_avMapa){
    _avMapa=L.map('av-mapa').setView([lat,lng],17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(_avMapa);
    _avMarker=L.marker([lat,lng],{draggable:true}).addTo(_avMapa);
    _avMarker.on('dragend',e=>{ const p=e.target.getLatLng(); _avNovoPonto(); _avPino={lat:p.lat,lng:p.lng}; _avForm.pinoProvisorio=false; _avPinoInfo(); });
    setTimeout(()=>_avMapa.invalidateSize(),200);
  }else{
    _avMapa.setView([lat,lng],17); _avMarker.setLatLng([lat,lng]);
  }
  _avPino={lat,lng}; _avPinoInfo(); _avLiberaPasso2();
}
function _avLiberaPasso2(){ if(!_avForm.pinoProvisorio) _avRenderCta(); }
// Depois do pino: o corretor escolhe o caminho — venda a mercado (passo 2) OU terreno para incorporadora (painel próprio)
function _avRenderCta(){
  const cta=document.getElementById('av-incorp-cta'); if(!cta||!_avPino) return;
  const zi=_avForm.geo, pode=!!(zi && zi.incorporavel && Number(zi.ca_maximo)>=2), modo=_avForm.modo||null;
  cta.innerHTML=`<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="color:#64748b;font-size:.88em">O que avaliar?</span>
      <button class="btn ${modo==='mercado'?'btn-p':'btn-o'} bsm" onclick="_avModo('mercado')">🏠 Venda a mercado</button>
      ${pode?`<button class="btn ${modo==='incorp'?'btn-p':'btn-o'} bsm" onclick="_avModo('incorp')">🏗️ Terreno para incorporadora</button>`:''}
      ${zi?`<span style="color:#94a3b8;font-size:.82em">${pode?`zona ${zi.zona} permite adensar (CA ${Number(zi.ca_maximo)})`:`zona ${zi.zona} (CA ${Number(zi.ca_maximo)}): sem potencial para incorporadora`}</span>`:''}
    </div>`;
}
function _avModo(m){
  _avForm.modo=m; _avRenderCta();
  const p2=document.getElementById('av-passo2'), pan=document.getElementById('av-incorp-painel'), solo=document.getElementById('av-incorp-solo');
  if(m==='mercado'){ if(p2) p2.style.display=''; if(pan) pan.style.display='none'; if(solo) solo.innerHTML=''; p2&&p2.scrollIntoView({behavior:'smooth',block:'start'}); }
  else { if(p2) p2.style.display='none'; avalAbrirIncorp(); }
}

async function _avPinoInfo(){
  const el=document.getElementById('av-pino-info'); if(!el||!_avPino) return;
  if(_avForm.pinoProvisorio){ el.innerHTML='<span style="color:#b45309">📍 Arraste o pino até o imóvel.</span>'; ['av-comaer-info','av-iptu-info','av-incorp-cta'].forEach(id=>{ const e=document.getElementById(id); if(e) e.innerHTML=''; }); return; }
  el.innerHTML='Confirmando zoneamento…';
  const seq=(window._avPinoSeq=(window._avPinoSeq||0)+1), pino={..._avPino};
  try{
    const z=await _avRpc('aval_geo',{p_lat:pino.lat,p_lng:pino.lng});
    if(seq!==window._avPinoSeq) return;   // o pino mudou enquanto esperava: a resposta é de outro ponto
    const zi=Array.isArray(z)?z[0]:z;
    _avForm.geo=zi||null;
    _avForm.lancItbi=undefined; _avForm.lancAnuncio=undefined;
    _avDetectarBairro();
    if(!_avForm.iptu) _avBuscarIptu();
    _avForm.comaer=null; _avComaer(pino.lat,pino.lng).then(k=>{ if(seq!==window._avPinoSeq) return; _avForm.comaer=k; const e=document.getElementById('av-comaer-info'); if(e) e.innerHTML=_avComaerTexto(k); }).catch(()=>{});
    if(zi){
      el.innerHTML=`✅ <b>${zi.zona}</b> · CA máx <b>${Number(zi.ca_maximo)}</b>${zi.dist_m>0?` <span style="color:#94a3b8">(zona mais próxima, pino na rua a ${zi.dist_m} m)</span>`:''}`
        +`${zi.incorporavel?' · <span style="color:#047857">eixo (incorporável)</span>':''}`
        +`${zi.distrito?' · '+zi.distrito:''} <span style="color:#94a3b8">(${_avPino.lat.toFixed(5)}, ${_avPino.lng.toFixed(5)})</span>`;
      _avRenderCta();
    }else{
      _avRenderCta();
      el.innerHTML=`<span style="color:#b45309">Este ponto está fora da área com zoneamento carregado</span> <span style="color:#94a3b8">(${_avPino.lat.toFixed(5)}, ${_avPino.lng.toFixed(5)})</span>. Confira se o pino caiu no endereço certo (arraste-o se precisar). A avaliação de mercado funciona; só a conta de incorporação fica sem zona.`;
    }
  }catch(e){ if(seq!==window._avPinoSeq) return; _avRenderCta(); el.innerHTML='<span style="color:#b45309">Não consegui confirmar o zoneamento deste ponto.</span> <span style="color:#94a3b8;font-size:.85em">'+String(e&&e.message||e).replace(/</g,'&lt;')+(/401/.test(String(e&&e.message))?' — sessão vencida; saia e entre de novo.':'')+'</span>'; }
}

// ═══════════════ CÁLCULO (preço ao vivo + conta no navegador) ═══════════════
async function avalCalcular(opts){
  opts=opts||{}; const recalc=!!opts.recalc && _avForm.cache;
  if(!_avPino){ alert('Confirme o ponto no mapa primeiro.'); return; }
  // no recálculo (exclusão de comparável) o formulário já saiu da tela: lê o que foi digitado antes
  const g=id=>{ const el=document.getElementById(id); return el?el.value:((_avForm.entrada||{})[id]||''); };
  if(!recalc) _avForm.entrada=Object.fromEntries(['av-tipo','av-area','av-terreno','av-frente','av-dorm','av-suite','av-vaga','av-padrao-casa','av-idade','av-estado','av-rs-terreno'].map(id=>[id,g(id)]));
  _avForm.modo='mercado';
  const tipo=g('av-tipo'), grupo=_avTipoGrupo(tipo);
  // só valem os campos do tipo escolhido (campo escondido ou herdado de outro tipo não entra no dossiê)
  const CAMPOS={apto:['av-area','av-dorm','av-suite','av-vaga'], casa:['av-area','av-terreno','av-frente','av-dorm','av-suite','av-vaga','av-padrao-casa','av-idade','av-estado','av-rs-terreno'],
                terreno:['av-terreno','av-frente','av-rs-terreno'], com:['av-area','av-terreno','av-frente','av-vaga','av-padrao-casa','av-idade','av-estado','av-rs-terreno']}[grupo]||[];
  const gt=id=>CAMPOS.includes(id)?g(id):'';
  const area=+gt('av-area')||null;
  const terreno=+gt('av-terreno')||(CAMPOS.includes('av-terreno')&&_avForm.incorp&&_avForm.incorp.terreno)||null, frente=+gt('av-frente')||null;
  const dorm=+gt('av-dorm')||null, suite=+gt('av-suite')||null, vaga=+gt('av-vaga')||null, preco=null;   // valor pretendido saiu do formulário (Rodrigo, 01/10/2026)
  const bairro=(_avForm.bairro||'').trim();
  if(grupo==='terreno' && !terreno){ alert('Informe a área do terreno (m²).'); return; }
  if(grupo!=='terreno' && !area){ alert(grupo==='apto'?'Informe a área útil.':'Informe a área construída.'); return; }
  if(grupo==='casa' && !terreno){ alert('Casa: informe também a área do terreno (m²) — ela entra na conta.'); return; }
  if(!bairro){ alert('Não identifiquei o bairro deste ponto. Preencha o campo "Bairro detectado" abaixo do endereço.'); const bx=document.getElementById('av-bairro-box'); if(bx) bx.style.display=''; return; }
  const stt=document.getElementById('av-calc-status')||{ set textContent(v){}, set innerHTML(v){} };
  stt.textContent='Buscando anúncios ao vivo em '+bairro+'…';

  let precos={}, semMotor=false;
  if(recalc){ precos=_avForm.cache.precos; semMotor=!!_avForm.cache.semMotor; }
  else if(_avForm.cache&&_avForm.cache.precos&&_avForm.cache.precos.rs_apto&&_avForm.ctx&&_avForm.ctx.bairro===bairro&&_avForm.dossie&&_avForm.dossie._solo){ precos=_avForm.cache.precos; }
  else try{
    const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
    const timer=ctrl?setTimeout(()=>ctrl.abort(),45000):null;   // Render free acorda em 30-60 s
    const r=await fetch(`${AVAL_MOTOR}/precos?bairro=`+encodeURIComponent(bairro),Object.assign({headers:hdr()},ctrl?{signal:ctrl.signal}:{}));
    if(timer) clearTimeout(timer);
    if(!r.ok) throw new Error('motor HTTP '+r.status);
    precos=await r.json();
  }catch(e){ semMotor=true; }

  // comparáveis de fechamento (ITBI) — do banco, via RPC
  let compsItbi=[];
  if(recalc) compsItbi=_avForm.cache.compsItbi;
  else {
    // vendas reais pelo RAIO em volta do imóvel (o bairro detectado no mapa nem sempre bate com o do ITBI); sem resultado, cai no bairro
    if(grupo==='terreno') compsItbi=[];   // terreno: o valor vem de lotes; vendas de apartamento não são referência
    else try{ compsItbi=await _avRpc('aval_comps_itbi_raio',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_tipo:_ehCasa(tipo)?'casa':'apto',p_lim:20})||[]; compsItbi.forEach(c=>{ c.porRaio=true; }); }catch(_){ compsItbi=[]; }
    if(!compsItbi.length && grupo!=='terreno'){ try{ compsItbi=await _avRpc('aval_comps_itbi',{p_bairro:bairro,p_lim:20}); }catch(_){} }
  }
  compsItbi=(compsItbi||[]).filter(c=>!/GARAGEM|VAGA|DEP[OÓ]SITO/i.test(c.uso||'') && (_ehCasa(tipo) ? /RESID|CASA|SOBRADO/i.test(c.uso||'') : /APART/i.test(c.uso||'')));
  // exclusões feitas pelo corretor (comparável destoante) — chave estável por origem
  _avForm.excl=_avForm.excl||new Set();
  const kAn=a=>'a:'+(a.url||a.rua+'|'+a.preco); const kIt=c=>'i:'+(c.logradouro||'')+'|'+(c.numero||'')+'|'+(c.data||'')+'|'+c.valor;
  compsItbi.forEach(c=>{ c._k=kIt(c); c.excluido=_avForm.excl.has(c._k); });
  // R$/m² do ITBI em base de ÁREA ÚTIL (cadastro ≈ 1,35 × útil + 29 m²/vaga; casa: área construída ≈ útil)
  compsItbi.forEach(c=>{ const ac=Number(c.area_constr)||0; c.area_util_est=_ehCasa(tipo)?ac:Math.max(20,(ac-AV_INDICES.iptu_por_vaga)/AV_INDICES.iptu_por_util); c.rs_util=c.area_util_est?Math.round(Number(c.valor)/c.area_util_est):null; });
  // endereços → coordenadas (base local de endereços do portal; o que não resolver fica sem pino)
  const geocodar=async q=>{ try{ const r=await _avRpc('aval_geocode',{p_q:q}); const h=Array.isArray(r)?r[0]:null; return h?{lat:h.lat,lng:h.lng}:null; }catch(_){ return null; } };
  const amostraTodos=(precos.amostra||[]).slice(0,12);
  amostraTodos.forEach(a=>{ a._k=kAn(a); a.excluido=_avForm.excl.has(a._k); });
  const amostra=amostraTodos.filter(a=>!a.excluido);
  const compsItbiAtivos=compsItbi.filter(c=>!c.excluido);
  // anúncios só trazem a rua (sem número): ficam fora do mapa — só na tabela de comparáveis (Rodrigo, 02/10/2026)
  amostraTodos.forEach(a=>{ delete a.lat; delete a.lng; });
  if(!recalc) await Promise.all([
    ...compsItbi.slice(0,12).filter(c=>!(c.lat&&c.lng)).map(async c=>{ try{ const r=await _avRpc('aval_geocode_endereco',{p_rua:c.logradouro||'',p_numero:c.numero||''}); const h=Array.isArray(r)?r[0]:null; if(h&&h.lat){ c.lat=h.lat; c.lng=h.lng; return; } }catch(_){} const g=await geocodar(`${c.logradouro||''} ${c.numero||''}`); if(g) Object.assign(c,g); }),
  ]);
  // R$/m² dos anúncios: o motor manda a mediana de toda a página; se o corretor excluiu algum, recalcula pela amostra restante
  const mediana=v=>{ v=v.filter(x=>x>0).sort((a,b)=>a-b); return v.length?(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null; };
  const houveExclAn=amostraTodos.some(a=>a.excluido);
  if(houveExclAn){
    const pa=amostra.filter(a=>a.tipo!=='Casa').map(a=>a.rs_m2), pc=amostra.filter(a=>a.tipo==='Casa').map(a=>a.rs_m2);
    precos={...precos, rs_apto: pa.length?Math.round(mediana(pa)):null, rs_casa: pc.length?Math.round(mediana(pc)):null, n_apto:pa.length, n_casa:pc.length};
  }
  const nExcl=_avForm.excl.size;

  // MODO TESTE (motor de anúncios ao vivo ainda não hospedado): usa a mediana do R$/m²
  // dos fechamentos ITBI do bairro como preço de mercado, e avisa. Quando o motor entrar
  // no ar (AVAL_MOTOR_URL), o fluxo volta ao normal sem mexer aqui.
  if(semMotor){
    const rs=(compsItbi||[]).map(c=>Number(c.rs_m2)).filter(v=>v>0);
    if(rs.length || grupo==='terreno'){
      // sem anúncios: a conta usa só as vendas reais (em área útil, no método único); nada de "anúncio" derivado do ITBI
      precos={rs_apto:null, rs_casa:null, n_apto:0, n_casa:0, amostra:[], base:'ITBI', n_itbi:rs.length};
      stt.innerHTML='<span style="color:#b45309">Anúncios ao vivo indisponíveis agora — o valor usa só as '+rs.length+' vendas reais registradas por perto.</span>';
    }else{
      stt.innerHTML='<span style="color:#dc2626">Motor de anúncios indisponível e sem fechamentos ITBI para "'+bairro+'". Confira o nome do bairro.</span>'; return;
    }
  }

  // trava: se o zoneamento ainda não resolveu (clique rápido), busca agora
  if(!_avForm.geo){
    try{ const z=await _avRpc('aval_geo',{p_lat:_avPino.lat,p_lng:_avPino.lng}); _avForm.geo=Array.isArray(z)?z[0]:z; }catch(_){}
  }
  const ehcasa=_ehCasa(tipo), ehterreno=/terreno/i.test(tipo), ehlote=_avPodeTerreno(tipo);
  const rs_apto=precos.rs_apto;
  const rs_casa=precos.rs_casa || (rs_apto ? Math.round(rs_apto*AV_PARAM.casa_sobre_apto) : null);
  const casaEstimada=!precos.rs_casa && !!rs_casa;
  const rs_tipo = ehcasa ? rs_casa : (ehterreno ? null : rs_apto);
  const geo=_avForm.geo||{};
  // R$/m² de terreno — duas leituras, medidas na carteira da NSP (AV_TERRENO):
  //  · rs_terreno: o que o terreno vale DENTRO de uma casa vendida como casa (regressão valor = a·terreno + b·construída)
  //  · rs_lote:    o que o lote vale vendido PARA CONSTRUIR (mediana de lotes anunciados, trazida a preço fechado)
  const tb=_avTerrenoBairro(bairro), idxPF0=_avIdxPedidoFechado(bairro);
  const rsTerrenoInf=+gt('av-rs-terreno')||null;
  const rs_terreno = rsTerrenoInf || (tb&&tb.terreno) || (rs_casa ? Math.round(rs_casa*AV_PARAM.terreno_sobre_casa) : null);
  const rsTerrenoOrigem = rsTerrenoInf ? 'informado pelo corretor' : (tb&&tb.terreno ? `modelo conjunto da carteira NSP: ${tb.n} casas anunciadas em ${bairro}, preços de ${tb.per||'2018–2026'}, custo de construção único de R$ ${(tb.constr||0).toLocaleString('pt-BR')}/m² (terreno = ${Math.round(tb.share*100)}% do valor)` : (rs_casa ? `estimado: ${Math.round(AV_PARAM.terreno_sobre_casa*100)}% do R$/m² de casa do bairro (${casaEstimada?'casa ≈ apto × '+AV_PARAM.casa_sobre_apto:'anúncios de casas'})` : null));
  const rs_lote = rsTerrenoInf || (tb&&tb.lote ? Math.round(tb.lote*idxPF0.idx) : null) || (rs_casa ? Math.round(rs_casa*AV_PARAM.lote_sobre_casa) : null);
  const loteOrigem = rsTerrenoInf ? 'informado pelo corretor' : (tb&&tb.lote ? `mediana de ${tb.lote_n} lotes anunciados pela NSP em ${bairro}, ${tb.lote_per||'2018–2026'} (R$ ${tb.lote.toLocaleString('pt-BR')}/m² pedido × ${idxPF0.idx} pedido→fechado)` : (rs_casa ? `estimado: ${Math.round(AV_PARAM.lote_sobre_casa*100)}% do R$/m² de casa do bairro` : null));
  const padrao=(_avForm.incorp&&_avForm.incorp.padrao)||_avPadraoSugerido(bairro);
  const lancInformado=(_avForm.incorp&&_avForm.incorp.lanc)||null;
  await Promise.all([_avLancAnuncio(), _avLancItbi()]); const la=_avLancAuto(precos, rs_apto);
  const rs_lanc = lancInformado || la.rs;
  const lancOrigem = lancInformado ? 'informado' : la.origem;

  // ── ENTORNO (metrô, eixo, distrito) pelo ponto — vai para o dossiê ──
  let entorno=null;
  if(recalc) entorno=_avForm.cache.entorno;
  else { try{ entorno=await _avRpc('aval_entorno',{p_lat:_avPino.lat,p_lng:_avPino.lng}); if(Array.isArray(entorno)) entorno=entorno[0]; }catch(_){} }
  _avForm.entorno=entorno;
  _avForm.cache={precos:(recalc?_avForm.cache.precos:precos), semMotor, compsItbi, entorno, refs:recalc?_avForm.cache.refs:undefined, fpInfo:recalc?_avForm.cache.fpInfo:undefined};

  // ── MÉTODO ÚNICO: macro (índices do bairro) aplicado no micro (este imóvel) ──
  const idxPF=_avIdxPedidoFechado(bairro);
  const rsItbiUtil=(()=>{ const v=compsItbiAtivos.map(c=>c.rs_util).filter(x=>x>0); return v.length>=3?mediana(v):null; })();
  const metodoUnico = (()=>{
    if(!area) return null;
    const m={ idx_pedido_fechado:idxPF.idx, idx_origem:idxPF.origem, sub_itbi:AV_INDICES.itbi_subdeclaracao,
              rs_anuncio: rs_tipo||null, n_anuncio: ehcasa?(precos.n_casa||0):(precos.n_apto||0),
              rs_itbi_util: rsItbiUtil, n_itbi: compsItbiAtivos.filter(c=>c.rs_util>0).length, excluidos:nExcl };
    m.rs_anuncio_ajust = m.rs_anuncio ? Math.round(m.rs_anuncio*m.idx_pedido_fechado) : null;     // pedido → fechado esperado
    m.rs_itbi_ajust    = m.rs_itbi_util ? Math.round(m.rs_itbi_util*(1+m.sub_itbi)) : null;         // declarado → negociado
    const partes=[m.rs_anuncio_ajust, m.rs_itbi_ajust].filter(x=>x>0);
    m.rs_final = partes.length ? Math.round(partes.reduce((a,b)=>a+b,0)/partes.length) : null;
    m.divergencia = partes.length===2 ? Math.round((m.rs_anuncio_ajust/m.rs_itbi_ajust-1)*100) : null;
    m.valor_anuncio = m.rs_anuncio_ajust ? Math.round(area*m.rs_anuncio_ajust) : null;
    m.valor_itbi    = m.rs_itbi_ajust ? Math.round(area*m.rs_itbi_ajust) : null;
    m.valor_final   = m.rs_final ? Math.round(area*m.rs_final) : null;
    return m; })();
  _avForm.metodoUnico=metodoUnico;

  const dossie={
    fonte:'ondemand', codigo:'OD'+Date.now(),
    tipo, bairro, endereco:`${_avForm.rua||''}${_avForm.num?', '+_avForm.num:''}`.trim(),
    area_util:area, terreno, frente, dorm, suite, vaga, preco_pedido:preco,
    zona:geo.zona||null, ca:geo.ca_maximo?Number(geo.ca_maximo):null,
    mercado_rs_m2:rs_tipo||null,
    anuncios_usados: ehcasa ? (precos.n_casa||precos.n_apto||0) : (precos.n_apto||0),
    valor_mercado:null, faixa_min:null, faixa_max:null, metodo:null,
    incorp_aplicavel:false, incorp_area_constr:null, incorp_lancamento_rs_m2:null,
    incorp_vgv:null, incorp_valor_terreno:null, incorp_ganho_pct:null,
    comparaveis: JSON.stringify(amostraTodos.map(a=>({k:a._k,excluido:!!a.excluido,tipo:a.tipo,area:a.area,preco:a.preco,rs_m2:a.rs_m2,dorm:a.dorm,vaga:a.vaga,endereco:[a.rua,a.bairro].filter(Boolean).join(', '),aprox:!!a.aprox,url:a.url,lat:a.lat||null,lng:a.lng||null,origem:a.lancamento?'lançamento':'anúncio'}))
                  .concat(compsItbi.map(c=>({k:c._k,excluido:!!c.excluido,tipo:grupo==='com'?'Venda real (ref. residencial)':'Venda real',area:c.area_constr,area_util_est:Math.round(c.area_util_est||0),preco:c.valor,rs_m2:c.rs_m2,rs_util:c.rs_util,endereco:`${c.logradouro||''}${c.numero?', '+c.numero:''}`,data:c.data,lat:c.lat||null,lng:c.lng||null,origem:'Venda real '+(c.data||'')})))),
    lat:_avPino?_avPino.lat:null, lng:_avPino?_avPino.lng:null,
    entorno: Object.assign({}, entorno||{}, {iptu: _avIptuResumo(tipo)}),
    memoria: null,
    metodo_unico: null
  };
  dossie.memoria={ metodo_unico: metodoUnico||null, indices:{fonte:AV_INDICES.fonte}, incorp:null, param:{cub_ref:AV_PARAM.cub_ref, calibracao:AV_PARAM.calibracao, obra_sobre_cub:AV_PARAM.obra_sobre_cub, priv_sobre_construida:AV_PARAM.priv_sobre_construida, despesas:AV_PARAM.despesas, projetos_sobre_obra:AV_PARAM.projetos_sobre_obra, comissao:AV_PARAM.comissao, ret:AV_PARAM.ret, financiamento:AV_PARAM.financiamento, margem:AV_PARAM.margem, custo_aquisicao:AV_PARAM.custo_aquisicao} };
  if(/comercial|loja|galp|sala/i.test(tipo) && metodoUnico) metodoUnico.aviso='Imóvel comercial: o valor como imóvel pronto usa referências residenciais do bairro (o coletor ainda não busca anúncios comerciais); trate como ordem de grandeza.';
  // ── EVOLUTIVO: casas (e comerciais com terreno) — terreno + construção depreciada ──
  let evolutivo=null;
  if((grupo==='casa'||grupo==='com') && terreno && area && rs_terreno){
    // comercial (galpão/loja): o terreno vale como LOTE para construir; na casa, o terreno "dentro" da casa
    const rsT = (grupo==='com' && rs_lote) ? rs_lote : rs_terreno, rsTO = (grupo==='com' && rs_lote) ? loteOrigem : rsTerrenoOrigem;
    evolutivo=_avContaEvolutivo({terreno, rs_terreno:rsT, rs_terreno_origem:rsTO, constr:area, padrao:g('av-padrao-casa')||'medio', idade:+g('av-idade')||0, estado:g('av-estado')||'bom', rs_lote, lote_origem:loteOrigem, ref:tb});
    if(metodoUnico && metodoUnico.valor_final){ evolutivo.comparativo=metodoUnico.valor_final; evolutivo.divergencia=Math.round((evolutivo.total/metodoUnico.valor_final-1)*100); }
  }
  dossie.memoria.evolutivo=evolutivo; _avForm.evolutivo=evolutivo;
  if(grupo==='terreno'){
    if(rs_lote){
      const vm=Math.round(terreno*rs_lote);
      dossie.valor_mercado=vm; dossie.faixa_min=Math.round(vm*0.9); dossie.faixa_max=Math.round(vm*1.1); dossie.mercado_rs_m2=rs_lote;
      dossie.metodo=`terreno nu: ${terreno} m² × R$ ${rs_lote.toLocaleString('pt-BR')}/m² de lote (${loteOrigem})`;
      dossie.memoria.evolutivo={terreno, rs_terreno:rs_lote, rs_terreno_origem:loteOrigem, v_terreno:vm, total:vm, so_terreno:true, ref:tb};
    }
  }else if(grupo==='com' && evolutivo){
    // comercial: as referências de venda e anúncio são residenciais (o coletor não busca comercial) — o valor é
    // terreno a preço de lote + construção depreciada; o residencial fica como referência (04/10/2026: o galpão da
    // R. Alba saía 50% acima do parecer manual com a média; assim fica perto)
    const vm=evolutivo.total;
    dossie.valor_mercado=vm; dossie.faixa_min=Math.round(vm*0.9); dossie.faixa_max=Math.round(vm*1.1); dossie.mercado_rs_m2=Math.round(vm/area);
    dossie.metodo=`terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')}/m² de lote + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}%`+
      (metodoUnico&&metodoUnico.valor_final?` · referência residencial do entorno: ${_avR$(metodoUnico.valor_final)}`:'');
  }else if(metodoUnico && metodoUnico.valor_final && evolutivo){
    const mu=metodoUnico, vm=Math.round((mu.valor_final+evolutivo.total)/2);
    dossie.valor_mercado=vm; dossie.faixa_min=Math.round(vm*0.93); dossie.faixa_max=Math.round(vm*1.07); dossie.mercado_rs_m2=mu.rs_final;
    dossie.metodo=`média de [comparativo ${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = ${_avR$(mu.valor_final)} ; evolutivo terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')} + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}% = ${_avR$(evolutivo.total)}]`+
      (evolutivo.divergencia!=null?` · métodos divergem ${evolutivo.divergencia}%`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s)`:'');
  }else if(metodoUnico && metodoUnico.valor_final){
    const mu=metodoUnico;
    dossie.valor_mercado=mu.valor_final; dossie.faixa_min=Math.round(mu.valor_final*0.93); dossie.faixa_max=Math.round(mu.valor_final*1.07);
    dossie.mercado_rs_m2=mu.rs_final;
    dossie.metodo=`${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = média de [anúncios ${mu.rs_anuncio?mu.rs_anuncio.toLocaleString('pt-BR'):'—'} × ${mu.idx_pedido_fechado} (pedido→fechado, ${mu.idx_origem})`+
      (mu.rs_itbi_ajust?` ; ITBI ${mu.rs_itbi_util.toLocaleString('pt-BR')}/m² útil est. × ${(1+mu.sub_itbi).toFixed(3)} (subdeclaração)`:'')+`]`+(mu.divergencia!=null?` · fontes divergem ${mu.divergencia}%`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s) pelo corretor`:'')+(precos.base==='ITBI'?' · modo teste (sem anúncios ao vivo)':'');
  }else if(evolutivo){
    const vm=evolutivo.total;
    dossie.valor_mercado=vm; dossie.faixa_min=Math.round(vm*0.9); dossie.faixa_max=Math.round(vm*1.1);
    dossie.metodo=`evolutivo: terreno ${terreno} m² × R$ ${evolutivo.rs_terreno.toLocaleString('pt-BR')} + construção ${area} m² depreciada ${Math.round(evolutivo.dep*100)}% (sem comparativo suficiente no bairro)`;
  }else if(rs_tipo && area){
    const vm=area*rs_tipo;
    dossie.valor_mercado=Math.round(vm); dossie.faixa_min=Math.round(vm*0.9); dossie.faixa_max=Math.round(vm*1.1);
    dossie.metodo=`${area} m² × R$ ${rs_tipo.toLocaleString('pt-BR')}/m² (anúncios ${bairro}, sem ajuste)`;
  }
  delete dossie.metodo_unico;
  // ── Incorporação: etapa à parte (botão "Avaliar para incorporadora"); aqui só guardamos o contexto ──
  const ca=dossie.ca;
  _avForm.podeIncorp = ehlote && !!geo.incorporavel && !!ca && ca>=2;
  _avForm.incorpMotivo = !ehlote ? null : (_avForm.podeIncorp ? null : `Zoneamento ${geo.zona||'?'} (CA máximo ${ca||'?'}) não permite adensar o suficiente: a avaliação como terreno de incorporação não se aplica aqui.`);
  _avForm.ctx={ehlote, rs_apto, rs_lanc, lancOrigem, preco, bairro, padraoSugerido:_avPadraoSugerido(bairro), lancAuto: la.rs||null, lancN: la.n||0, lancAutoOrigem: la.origem};
  _avForm.dossie=dossie;
  if(_avForm.incorp && _avForm.podeIncorp) await _avCalcIncorp();   // recálculo (exclusão de comparável) mantém a incorporação já pedida
  renderAvalPreview(_avForm.dossie, precos);
}

// ═══════════════ INCORPORAÇÃO — etapa própria (botão) ═══════════════
async function _avBuscarPrecos(bairro){
  const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),45000):null;   // Render free acorda em 30-60 s
  try{
    const r=await fetch(`${AVAL_MOTOR}/precos?bairro=`+encodeURIComponent(bairro),Object.assign({headers:hdr()},ctrl?{signal:ctrl.signal}:{}));
    if(timer) clearTimeout(timer);
    if(!r.ok) throw new Error('motor HTTP '+r.status);
    return await r.json();
  }catch(e){ if(timer) clearTimeout(timer); return null; }
}
// Contexto mínimo para rodar a incorporação antes da avaliação completa (direto do mapa)
async function _avCtxRapido(){
  const g=id=>{ const el=document.getElementById(id); return el?el.value:''; };
  const bairro=(g('av-bairro')||_avForm.bairro||(_avForm.geo&&_avForm.geo.distrito)||'').trim(); if(!bairro){ alert('Não identifiquei o bairro deste ponto. Preencha o campo "Bairro detectado".'); return false; }
  _avForm.bairro=bairro;
  const geo=_avForm.geo||{};
  const el=document.getElementById('av-incorp-painel'); if(el){ el.style.display=''; el.innerHTML='<div class="card"><div class="cb" style="color:#64748b">Buscando preços de lançamento em '+bairro+'…</div></div>'; }
  const precos=(await _avBuscarPrecos(bairro))||{};
  const rs_apto=precos.rs_apto||null;
  await Promise.all([_avLancAnuncio(), _avLancItbi()]); const la=_avLancAuto(precos, rs_apto); const rs_lanc=la.rs;
  _avForm.cache=_avForm.cache||{}; _avForm.cache.precos=precos;
  _avForm.ctx={ehlote:true, rs_apto, rs_lanc, lancOrigem: la.origem, preco:null, bairro, padraoSugerido:_avPadraoSugerido(bairro), lancAuto:la.rs||null, lancN:la.n||0, lancAutoOrigem:la.origem};
  _avForm.podeIncorp=!!(geo.incorporavel && Number(geo.ca_maximo)>=2);
  let entorno=null; try{ entorno=await _avRpc('aval_entorno',{p_lat:_avPino.lat,p_lng:_avPino.lng}); if(Array.isArray(entorno)) entorno=entorno[0]; }catch(_){}
  _avForm.entorno=entorno; _avForm.cache.entorno=entorno;
  _avForm.dossie={_solo:true, fonte:'ondemand', codigo:'OD'+Date.now(), tipo:'Terreno', bairro,
    endereco:`${(g('av-rua')||_avForm.rua||'').trim()}${(g('av-num')||_avForm.num)?', '+(g('av-num')||_avForm.num):''}`.trim(),
    area_util:null, terreno:null, dorm:null, suite:null, vaga:null, preco_pedido:null,
    zona:geo.zona||null, ca:geo.ca_maximo?Number(geo.ca_maximo):null, mercado_rs_m2:null, anuncios_usados:0,
    valor_mercado:null, faixa_min:null, faixa_max:null, metodo:'avaliação como terreno para incorporação (sem valor de venda a mercado)',
    incorp_aplicavel:false, incorp_area_constr:null, incorp_lancamento_rs_m2:null, incorp_vgv:null, incorp_valor_terreno:null, incorp_ganho_pct:null,
    comparaveis:'[]', lat:_avPino.lat, lng:_avPino.lng, entorno:entorno||null,
    memoria:{ metodo_unico:null, incorp:null, param:{cub_ref:AV_PARAM.cub_ref, calibracao:AV_PARAM.calibracao, obra_sobre_cub:AV_PARAM.obra_sobre_cub, priv_sobre_construida:AV_PARAM.priv_sobre_construida, despesas:AV_PARAM.despesas, projetos_sobre_obra:AV_PARAM.projetos_sobre_obra, comissao:AV_PARAM.comissao, ret:AV_PARAM.ret, financiamento:AV_PARAM.financiamento, margem:AV_PARAM.margem, custo_aquisicao:AV_PARAM.custo_aquisicao} } };
  return true;
}
async function avalAbrirIncorp(){
  const el=document.getElementById('av-incorp-painel'); if(!el) return;
  if(!_avForm.ctx){ if(!(await _avCtxRapido())) return; }
  const c=_avForm.ctx||{}, inc=_avForm.incorp||{};
  const gv=id=>{ const e=document.getElementById(id); const v=e&&e.value?e.value:((_avForm.entrada||{})[id]||''); return v?+v:null; };
  if(!inc.terreno && gv('av-terreno')) inc.terreno=gv('av-terreno');
  if(!inc.frente && gv('av-frente')) inc.frente=gv('av-frente');
  const P=AV_PARAM;
  el.style.display='';
  el.innerHTML=`<div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
    <div style="font-weight:600;margin-bottom:4px">🏗️ Avaliação para incorporadora</div>
    <div style="color:#64748b;font-size:.88em;margin-bottom:10px">Conta reversa: do VGV do prédio possível no lote, descontados obra, despesas, margem, outorga e custos de aquisição, sobra o que chega ao proprietário. Premissas calibradas em viabilidades reais de incorporação (HIS/HMP em eixo). Informe o que souber; o resto o sistema estima e explica.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
      <input id="av-inc-terreno" type="number" value="${inc.terreno||''}" placeholder="Área do terreno (m²) *" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <input id="av-inc-frente" type="number" value="${inc.frente||''}" placeholder="Frente do terreno (m)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <select id="av-inc-padrao" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px" title="Padrão do prédio que seria construído: define o custo de obra (CUB Sinduscon-SP)">
        ${Object.entries(AV_PADROES).map(([k,v])=>`<option value="${k}" ${(inc.padrao||c.padraoSugerido)===k?'selected':''}>Padrão ${v.lb} — obra ≈ ${_avR$(Math.round(v.cub*P.obra_sobre_cub))}/m²</option>`).join('')}</select>
      <input id="av-inc-lanc" type="number" value="${inc.lanc||''}" placeholder="Lançamento R$/m² (auto: ${c.lancAuto?_avR$(c.lancAuto):'—'}${c.lancAutoOrigem&&/apto\.vc/.test(c.lancAutoOrigem)?' · '+c.lancN+' lançamentos anunciados perto':c.lancAutoOrigem&&/ITBI/.test(c.lancAutoOrigem)?' · vendas reais de novos':(c.lancN?' · '+c.lancN+' anunciados':' · usado × '+P.lanc_sobre_usado)})" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px" title="Preço por m² das unidades novas que o incorporador venderia. Se souber o lançamento da região, informe; senão o sistema usa os lançamentos anunciados ou o usado × ${P.lanc_sobre_usado}.">
      <select id="av-inc-categoria" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px" title="HIS e HMP têm outorga isenta/reduzida (Fs do PDE). Automático: pelo preço de lançamento (até ${P.his_max_rs_m2.toLocaleString('pt-BR')} HIS; até ${P.hmp_max_rs_m2.toLocaleString('pt-BR')} HMP).">
        <option value="auto" ${(inc.categoria||'auto')==='auto'?'selected':''}>Categoria: automática pelo preço</option>
        <option value="mercado" ${inc.categoria==='mercado'?'selected':''}>Mercado (outorga integral)</option>
        <option value="hmp" ${inc.categoria==='hmp'?'selected':''}>HMP — mercado popular (CA 5 em eixo / 2,5 em ZC-ZM; outorga × 0,5)</option>
        <option value="his" ${inc.categoria==='his'?'selected':''}>HIS — interesse social (CA 6 em eixo / 3 em ZC-ZM; sem outorga)</option>
      </select>
      <label style="display:flex;align-items:center;gap:8px;font-size:.9em;padding:6px 4px"><input type="checkbox" id="av-inc-fachada" ${inc.fachada_ativa?'checked':''}> Fachada ativa (térreo comercial não computável, até ${P.fachada_ativa_bonus*100}% do lote)</label>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
      <button class="btn btn-p" onclick="avalCalcIncorp()">⚙️ Calcular valor como terreno</button>
      <span style="color:#94a3b8;font-size:.85em">Zona ${(_avForm.geo||{}).zona||'?'} · CA ${(_avForm.geo||{}).ca_basico??'?'} / ${(_avForm.geo||{}).ca_maximo??'?'}${(_avForm.geo||{}).gabarito_m?' · gabarito '+(_avForm.geo||{}).gabarito_m:''}</span>
    </div></div></div>`;
  el.scrollIntoView({behavior:'smooth',block:'center'});
}
async function avalCalcIncorp(){
  const g=id=>{ const el=document.getElementById(id); return el?(el.type==='checkbox'?el.checked:el.value):''; };
  const terreno=+g('av-inc-terreno')||null;
  if(!terreno){ alert('Informe a área do terreno (m²).'); return; }
  _avForm.incorp={terreno, frente:+g('av-inc-frente')||null, padrao:g('av-inc-padrao')||_avForm.ctx.padraoSugerido, lanc:+g('av-inc-lanc')||null, categoria:g('av-inc-categoria')||'auto', fachada_ativa:!!g('av-inc-fachada')};
  await _avCalcIncorp();
  if(_avForm.dossie&&_avForm.dossie._solo){
    _avForm.dossie.terreno=_avForm.incorp.terreno; _avForm.dossie.frente=_avForm.incorp.frente||null;
    const solo=document.getElementById('av-incorp-solo'); if(solo) solo.innerHTML=(_avIncorpCardHTML(_avForm.dossie)||`<div class="card" style="margin-top:10px"><div class="cb" style="color:#b45309">${_avForm.incorpMotivo||'Incorporação inviável com estas premissas.'}</div></div>`)
      +(_avForm.dossie.incorp_aplicavel?`${_avEntornoHTML(_avForm.entorno)}<div class="card" style="margin-top:10px"><div class="cb" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn btn-p" onclick="avalSalvar()">💾 Salvar e gerar dossiê</button><span style="color:#94a3b8;font-size:.88em">Dossiê só com a avaliação como terreno. Para incluir o valor de venda a mercado, escolha "Venda a mercado" acima.</span></div></div><div class="card" style="margin-top:12px;background:#f8fafc"><div class="cb" style="font-size:.8em;color:#64748b">${AV_TEXTO_LEGAL}</div></div>`:'');
    const t=document.getElementById('av-terreno'); if(t && !t.value && _avForm.incorp.terreno) t.value=_avForm.incorp.terreno;   // leva o terreno para o formulário
    const f=document.getElementById('av-frente'); if(f && !f.value && _avForm.incorp.frente) f.value=_avForm.incorp.frente;
  } else renderAvalPreview(_avForm.dossie, _avForm.cache.precos);
  const alvo=document.getElementById('av-incorp-resultado')||document.getElementById('av-incorp-painel');
  if(alvo) alvo.scrollIntoView({behavior:'smooth',block:'start'});
}
async function _avCalcIncorp(){
  const dossie=_avForm.dossie, inc=_avForm.incorp, c=_avForm.ctx, geo=_avForm.geo||{}, P=AV_PARAM;
  if(!dossie||!inc||!c) return;
  const ca=Number(geo.ca_maximo)||dossie.ca;
  const rs_lanc = inc.lanc || c.lancAuto || (c.rs_apto ? Math.round(c.rs_apto*P.lanc_sobre_usado) : null);
  const lancOrigem = inc.lanc ? 'informado pelo corretor' : (c.lancAutoOrigem || (c.lancAuto ? `${c.lancN} lançamentos anunciados` : `usado × ${P.lanc_sobre_usado} (sem lançamento anunciado)`));
  if(!dossie.terreno) dossie.terreno=terrenoOk(inc.terreno);   // não sobrescreve o terreno digitado no passo 2 (usado no evolutivo)
  function terrenoOk(v){ return v; }
  if(!rs_lanc){ _avForm.incorpMotivo='Sem preço de lançamento no bairro: informe um valor de lançamento R$/m².'; return; }
  let refs=[], refMed=null, fpInfo=null;
  if(_avForm.cache.refs){ refs=_avForm.cache.refs; fpInfo=_avForm.cache.fpInfo; }
  else {
    try{ refs=await _avRpc('aval_outorga_ref',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_raio_m:1500,p_lim:30})||[]; }catch(_){}
    try{ const f=await _avRpc('aval_fp',{p_lat:_avPino.lat,p_lng:_avPino.lng}); fpInfo=Array.isArray(f)?f[0]:f; }catch(_){}
    _avForm.cache.refs=refs; _avForm.cache.fpInfo=fpInfo;
  }
  if(refs.length){ const v=refs.map(r=>Number(r.ct_m2)).sort((a,b)=>a-b); refMed=v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2; }
  const m=_avContaIncorp({terreno:inc.terreno, ca, ca_basico:geo.ca_basico, rs_lanc, padrao:inc.padrao, qvt:null, frente:inc.frente, gabarito:geo.gabarito_m, outorga_ref_m2:refMed, outorga_ref_n:refs.length, fp:fpInfo&&fpInfo.fp, categoria:inc.categoria, fachada_ativa:inc.fachada_ativa, zona:geo.zona, comaer:_avForm.comaer||null});
  m.refs=refs.slice(0,10); m.fpInfo=fpInfo;
  _avForm.memoria=m; _avForm.lancOrigem=lancOrigem; _avForm.incorpMotivo=null;
  dossie.memoria=dossie.memoria||{}; dossie.memoria.incorp={...m, lancOrigem, lancRef:(_avForm.lancAnuncio&&_avForm.lancAnuncio.lista||[]).slice(0,6).map(l=>({nome:l.nome,bairro:l.bairro,status:l.status,rs:l.rs,d:l.d})), padraoLb:(AV_PADROES[inc.padrao]||{}).lb, cubRef:(AV_PADROES[inc.padrao]||{}).ref};
  // limpa rastro de cálculo anterior no método
  dossie.metodo=(dossie.metodo||'').replace(/ · incorporação:.*$/,'').replace(/ · incorporação inviável.*$/,'');
  if(m.terreno_max>0){
    dossie.incorp_aplicavel=true;
    dossie.incorp_area_constr=Math.round(m.area_constr);
    dossie.incorp_lancamento_rs_m2=Math.round(rs_lanc);
    dossie.incorp_vgv=Math.round(m.vgv);
    dossie.incorp_valor_terreno=Math.round(m.terreno_max);
    const base = c.preco || dossie.valor_mercado;
    dossie.incorp_ganho_pct = base ? Math.round((m.terreno_max/base-1)*100) : null;
    dossie.metodo+=` · incorporação: padrão ${inc.padrao}, ${m.categoria.toUpperCase()}${m.fachada_ativa?', fachada ativa':''}, lançamento ${lancOrigem}`+
      (m.outorga?`, outorga ${_avR$(Math.round(m.outorga))} (${m.v_origem}${m.fs<1?', Fs '+m.fs:''})`:(m.fs===0?', outorga isenta (HIS)':''))+
      ` [incorp:${JSON.stringify({padrao:inc.padrao, cab:m.ca_basico, qvt:null, frente:inc.frente||null, gab:m.gabarito||null, oref:refMed?Math.round(refMed):null, on:refs.length, fp:m.fp, cat:m.categoria, fa:m.fachada_ativa?1:0})}]`;
  }else{
    dossie.incorp_aplicavel=false; dossie.incorp_valor_terreno=null; dossie.incorp_vgv=null;
    dossie.metodo+=` · incorporação inviável no padrão ${inc.padrao} (terreno máximo ≤ 0)`;
  }
}


function _avIncorpCardHTML(x){
  if(!x||!x.incorp_aplicavel) return '';
  return `
    <div class="card" id="av-incorp-resultado" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
      <div style="color:#047857;font-weight:600">💡 Potencial de incorporação${(_avForm.memoria&&_avForm.memoria.categoria&&_avForm.memoria.categoria!=='mercado')?` <span style="font-size:.8em;background:#ecfdf5;color:#047857;border-radius:6px;padding:1px 6px">${_avForm.memoria.categoria.toUpperCase()} · outorga ${_avForm.memoria.fs===0?'isenta':'× 0,5'}</span>`:''}${(_avForm.memoria&&_avForm.memoria.fachada_ativa)?` <span style="font-size:.8em;background:#ecfdf5;color:#047857;border-radius:6px;padding:1px 6px">fachada ativa</span>`:''}</div>
      <div style="font-size:1.7em;font-weight:800;color:#047857;margin:4px 0">${_avR$(x.incorp_valor_terreno)}</div>
      <div style="color:#64748b">terreno p/ incorporação${x.incorp_ganho_pct!=null?` — <b style="color:#059669">${x.incorp_ganho_pct>=0?'+':''}${x.incorp_ganho_pct}%</b> vs. ${_avForm.ctx&&_avForm.ctx.preco?'preço pretendido':'valor de mercado'}`:''}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px;font-size:.9em">
        <div><span style="color:#94a3b8">Zona/CA</span><br><b>${x.zona} · CA ${x.ca}</b>${(_avForm.memoria&&_avForm.memoria.comaer&&_avForm.memoria.comaer.pav!=null)?`<br><small style="color:#64748b">✈️ altura máx. COMAER ≈ ${_avForm.memoria.comaer.altura} m (~${_avForm.memoria.comaer.pav} pav.)</small>`:''}</div>
        <div><span style="color:#94a3b8">Construível</span><br><b>${x.incorp_area_constr} m²</b></div>
        <div><span style="color:#94a3b8">Lançamento</span><br><b>${_avR$(x.incorp_lancamento_rs_m2)}/m²</b> <small style="color:#94a3b8">${_avForm.lancOrigem||''}</small></div>
        <div><span style="color:#94a3b8">VGV potencial</span><br><b>${_avR$(x.incorp_vgv)}</b></div>
      </div>
      ${_avMemoriaHTML(_avForm.memoria)}</div></div>`;
}
function _avEvolutivoHTML(ev){
  if(!ev) return '';
  const n=v=>Math.round(v||0).toLocaleString('pt-BR');
  if(ev.so_terreno) return `<div class="card" style="margin-bottom:12px"><div class="cb"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Valor como terreno nu</div>
    <div style="font-size:.9em;margin-top:6px">${n(ev.terreno)} m² × ${_avR$(ev.rs_terreno)}/m² = <b>${_avR$(ev.total)}</b> <span style="color:#94a3b8">(${ev.rs_terreno_origem||''})</span></div></div></div>`;
  const l=(r,v,neg)=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:3px 8px;color:#64748b">${r}</td><td style="padding:3px 8px;text-align:right;white-space:nowrap;${neg?'color:#b91c1c':''}">${neg?'− ':''}${_avR$(Math.round(v))}</td></tr>`;
  return `<div class="card" style="margin-bottom:12px"><div class="cb">
    <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Terreno + construção (método evolutivo)</div>
    <div style="font-size:1.3em;font-weight:700;margin:4px 0">${_avR$(ev.total)} <span style="font-size:.6em;font-weight:400;color:#64748b">${ev.comparativo?`· comparativo ${_avR$(ev.comparativo)} · adotada a média${ev.divergencia!=null?` (divergem ${ev.divergencia}%)`:''}`:''}</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:.86em;margin-top:6px"><tbody>
      ${l(`Terreno: ${n(ev.terreno)} m² × ${_avR$(ev.rs_terreno)}/m² <small style="color:#94a3b8">(${ev.rs_terreno_origem||''})</small>`, ev.v_terreno)}
      ${l(`Construção nova: ${n(ev.constr)} m² × ${_avR$(ev.custo_m2)}/m² <small style="color:#94a3b8">(CUB ${ev.cubRef} ${_avR$(ev.cub)} × ${AV_PARAM.casa_obra_sobre_cub}, padrão ${ev.padraoLb})</small>`, ev.v_novo)}
      ${l(`Depreciação ${Math.round(ev.dep*100)}% <small style="color:#94a3b8">(Ross-Heidecke: ${ev.idade} anos de ${AV_PARAM.vida_util_casa}, estado ${ev.estadoLb})</small>`, ev.v_novo-ev.v_benf, true)}
      ${l(`Construção depreciada`, ev.v_benf)}
      <tr style="border-top:2px solid #1E2D4A;font-weight:700"><td style="padding:4px 8px">Terreno + construção${ev.fc!==1?` × Fc ${ev.fc}`:''}</td><td style="padding:4px 8px;text-align:right">${_avR$(ev.total)}</td></tr>
    </tbody></table>
    ${ev.v_lote?`<div style="font-size:.9em;margin-top:8px;padding:6px 8px;background:#f8fafc;border-radius:8px">🏗️ <b>Vendido como lote (para construir):</b> ${n(ev.terreno)} m² × ${_avR$(ev.rs_lote)}/m² = <b>${_avR$(ev.v_lote)}</b> <span style="color:#94a3b8">(${ev.lote_origem||''})</span>${ev.v_lote>ev.total?` — <span style="color:#047857">acima do valor como casa: vale ofertar a construtoras</span>`:''}</div>`:''}
    <div style="color:#94a3b8;font-size:.8em;margin-top:6px">Terreno pesa ${ev.pct_terreno}% do valor como casa.${ev.ref&&ev.ref.constr?` Na carteira da NSP (${ev.ref.n} casas no bairro) a construção vale ≈ ${_avR$(ev.ref.constr)}/m² e o terreno ${Math.round(ev.ref.share*100)}% do preço.`:''} ${/estimado/.test(ev.rs_terreno_origem||'')?'O R$/m² de terreno é estimado — informe o preço de lotes na região para refinar.':''}</div>
  </div></div>`;
}
function renderAvalPreview(x, precos){
  const corpo=document.getElementById('aval-corpo');
  let comps=[]; try{ comps=JSON.parse(x.comparaveis||'[]'); }catch(_){}
  const inc = _avIncorpCardHTML(x);
  corpo.innerHTML = `
    <div class="ph" style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-o bsm" onclick="avalNova()">← Refazer</button>
      <div><h1 class="pt">${x.endereco}</h1><div class="pst">${x.tipo} · ${x.bairro}${x.zona?' · '+x.zona:''}</div></div>
    </div>
    ${x.valor_mercado?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Valor de mercado</div>
      <div style="font-size:1.8em;font-weight:800;margin:4px 0">${_avR$(x.valor_mercado)}</div>
      <div style="color:#64748b">Faixa: ${_avR$(x.faixa_min)} — ${_avR$(x.faixa_max)}</div>
      <div style="color:#94a3b8;font-size:.88em;margin-top:6px">${String(x.metodo||'').replace(/\s*\[incorp:.*?\]/g,'')}${x.anuncios_usados?` · ${x.anuncios_usados} anúncios ao vivo`:''}</div>
      ${x.preco_pedido?`<div style="margin-top:8px;font-size:.9em">Pretendido: <b>${_avR$(x.preco_pedido)}</b> ${_avCompara(x.preco_pedido,x.valor_mercado)}</div>`:''}
    </div></div>`:`<div class="card" style="margin-bottom:12px"><div class="cb" style="color:#b45309">Sem preço de mercado (faltou área útil ou anúncios do bairro).</div></div>`}
    ${AV_TEXTO_ATIVO?`<div id="av-texto">${_avTextoHTML()}</div>`:''}
    ${_avMetodoHTML(_avForm.metodoUnico, x)}
    ${_avEvolutivoHTML((x.memoria&&x.memoria.evolutivo)||_avForm.evolutivo)}
    ${_avIptuCaixaHTML(x.entorno&&x.entorno.iptu)}
    ${_avEntornoHTML(x.entorno||_avForm.entorno)}
    ${(_avForm.ctx&&_avForm.ctx.ehlote)?(_avForm.podeIncorp
        ?`<div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn ${x.incorp_aplicavel?'btn-o':'btn-p'}" onclick="avalAbrirIncorp()">🏗️ ${x.incorp_aplicavel?'Ajustar premissas da incorporação':'Avaliar para incorporadora'}</button>
            <span style="color:#64748b;font-size:.88em">Zona ${x.zona||''} permite adensar (CA ${x.ca}). Calcula quanto um incorporador pagaria pelo terreno.</span>
            ${(_avForm.incorp&&!x.incorp_aplicavel)?`<div style="width:100%;color:#b45309;font-size:.88em">${_avForm.incorpMotivo||'Com estas premissas a incorporação não paga o terreno (conta negativa). Ajuste o lançamento ou o padrão.'}</div>`:''}</div></div>`
        :`<div class="card" style="margin-bottom:12px;border-left:3px solid #cbd5e1"><div class="cb" style="color:#64748b;font-size:.9em">🏗️ Terreno para incorporação: ${_avForm.incorpMotivo||'não se aplica'}</div></div>`):''}
    <div id="av-incorp-painel" style="display:none"></div>
    ${(comps.some(c=>c.lat)||x.lat||_avPino)?`<div class="card" style="margin-bottom:12px"><div class="cb"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Mapa: imóvel avaliado e vendas reais</div><div id="av-mapa-comps" style="height:320px;border-radius:10px;border:1px solid #e2e8f0"></div><div style="font-size:.82em;color:#64748b;margin-top:6px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 2px #dc2626;vertical-align:middle"></span> imóvel avaliado &nbsp; <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#34d399;border:2px solid #047857;vertical-align:middle"></span> vendas reais (ITBI). Os anúncios não trazem o número do imóvel e por isso aparecem só na tabela abaixo.</div></div></div>`:''}
    ${inc}
    ${comps.length?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Comparáveis</div>
      ${_avCompsTabela(comps)}
    </div></div>`:''}
    <div class="card"><div class="cb" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-p" onclick="avalSalvar()">💾 Salvar e gerar dossiê</button>
      <span style="color:#94a3b8;font-size:.88em">Revise acima. Ao salvar, o dossiê fica pronto para imprimir, salvar em PDF ou enviar ao cliente.</span>
    </div></div>
    <div class="card" style="margin-top:12px;background:#f8fafc"><div class="cb" style="font-size:.8em;color:#64748b">${AV_TEXTO_LEGAL}</div></div>`;
  _avDesenharMapaComps(comps, _avPino?{lat:_avPino.lat,lng:_avPino.lng}:null);
}
// Memória da conta reversa. Recebe o objeto de _avContaIncorp ou reconstrói a partir da avaliação salva.
function _avMemoriaHTML(m){
  if(!m) return '';
  const P=AV_PARAM, p=AV_PADROES[m.padrao]||AV_PADROES.medio;
  const l=(r,v,neg)=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:3px 8px;color:#64748b">${r}</td><td style="padding:3px 8px;text-align:right;white-space:nowrap;${neg?'color:#b91c1c':''}">${neg?'− ':''}${_avR$(Math.round(v))}</td></tr>`;
  const n=v=>Math.round(v).toLocaleString('pt-BR');
  const areas=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:.86em;margin-top:6px">
      <div><span style="color:#94a3b8">Terreno</span><br><b>${n(m.terreno)} m²</b>${m.frente?` · frente ${m.frente} m`:''}</div>
      <div><span style="color:#94a3b8">CA básico / máximo usado</span><br><b>${m.ca_basico!=null?m.ca_basico:'?'} / ${m.ca}</b>${m.ca_zona&&m.ca>m.ca_zona?` <small style="color:#047857">(zona: ${m.ca_zona}; ${m.categoria.toUpperCase()}: ${m.ca})</small>`:''}</div>
      <div><span style="color:#94a3b8">Área computável</span><br><b>${n(m.area_comput)} m²</b> <small>(terreno × CA ${m.ca})</small></div>
      <div><span style="color:#94a3b8">Área vendável (privativa)</span><br><b>${n(m.area_vendavel)} m²</b> <small>(${m.priv_fator||P.eficiencia_mercado} × computável${m.area_fachada?' + fachada ativa':''})</small></div>
      <div><span style="color:#94a3b8">Área construída total</span><br><b>${n(m.area_constr)} m²</b> <small>(privativa ÷ ${P.priv_sobre_construida}: subsolo, comuns, técnicas)</small></div>
      <div><span style="color:#94a3b8">Acima do CA básico</span><br><b>${n(m.area_adicional)} m²</b> <small>(paga outorga)</small></div>
    </div>`;
  const alertas=(m.alertas||[]).length?`<ul style="margin:8px 0 0;padding-left:18px;font-size:.84em;color:#b45309">${m.alertas.map(a=>`<li>${a}</li>`).join('')}</ul>`:'';
  return `<details open style="margin-top:10px"><summary style="cursor:pointer;color:#047857;font-size:.9em">Memória de cálculo (conta reversa)</summary>
    ${areas}
    <table style="width:100%;border-collapse:collapse;font-size:.86em;margin-top:8px"><tbody>
      ${l(`VGV: ${n(m.area_vendavel)} m² vendáveis × lançamento ${_avR$(Math.round(m.vgv/m.area_vendavel))}/m²`, m.vgv)}
      ${l(`Obra: ${n(m.area_constr)} m² construídos × ${_avR$(Math.round(m.custo_m2))}/m² (CUB ${p.ref} ${_avR$(p.cub)} × ${P.obra_sobre_cub}, com BDI — padrão ${p.lb})`, m.obra, true)}
      ${l(`Despesas ${P.despesas*100}% do VGV (incorporação, aprovações, gestão, marketing, entrega, adm.) + projetos ${P.projetos_sobre_obra*100}% da obra`, (m.despesas||0)+(m.projetos||0), true)}
      ${l(`Comissão ${P.comissao*100}% + RET ${P.ret*100}% + financiamento da obra ${P.financiamento*100}%`, (m.comissao||0)+(m.ret||0)+(m.financiamento||0), true)}
      ${l(`Margem do incorporador ${P.margem*100}%`, m.margem, true)}
      ${m.fachada_ativa?`<tr style="border-top:1px solid #f1f5f9"><td colspan="2" style="padding:3px 8px;color:#64748b">Fachada ativa: +${n(m.area_fachada)} m² de térreo comercial não computável (incluídos no VGV e na obra)</td></tr>`:''}
      ${m.categoria&&m.categoria!=='mercado'?`<tr style="border-top:1px solid #f1f5f9"><td colspan="2" style="padding:3px 8px;color:#64748b">Categoria ${m.categoria.toUpperCase()}: fator social Fs = ${m.fs} aplicado à outorga</td></tr>`:''}
      ${l(`Terreno máximo antes da outorga`, m.antes)}
      ${m.outorga?l(m.outorga_modo==='referencia'
          ? `Outorga onerosa: ${n(m.area_adicional)} m² adicionais × ${_avR$(Math.round(m.v))}/m² (${m.v_origem})`
          : `Outorga onerosa (fórmula PDE): ${n(m.area_adicional)} m² adicionais × (terreno/computável) × V ${_avR$(Math.round(m.v))}/m² (${m.v_origem}) × Fs ${m.fs!=null?m.fs:P.outorga_fs} × Fp ${m.fp}`, m.outorga, true):''}
      ${m.custos_aquisicao?l(`Custos de aquisição do terreno (ITBI, comissão, jurídico, demolição, IPTU) ≈ ${P.custo_aquisicao*100}%`, m.custos_aquisicao, true):''}
      <tr style="border-top:2px solid #10b981;font-weight:700"><td style="padding:4px 8px">Terreno máximo (o que chega ao proprietário)${m.terreno_vgv?` <small style="font-weight:400;color:#64748b">· ${(m.terreno_vgv*100).toFixed(1)}% do VGV</small>`:''}</td><td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(Math.round(m.terreno_max))}</td></tr>
    </tbody></table>
    ${alertas}
    ${(()=>{ const la=m.lancRef?{n:m.lancRef.length,lista:m.lancRef}:(m===_avForm.memoria?_avForm.lancAnuncio:null); return (la&&(la.lista||[]).length)?la:null; })()?`<details style="margin-top:8px;font-size:.84em"><summary style="cursor:pointer;color:#2563eb">Lançamentos anunciados perto (${(m.lancRef||(_avForm.lancAnuncio||{}).lista||[]).length})</summary>
      <table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr style="color:#94a3b8;text-align:left"><th style="padding:2px 6px">Empreendimento</th><th style="padding:2px 6px">Estágio</th><th style="padding:2px 6px;text-align:right">Dist.</th><th style="padding:2px 6px;text-align:right">R$/m²</th></tr></thead>
      <tbody>${(m.lancRef||(_avForm.lancAnuncio||{}).lista||[]).map(l=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:2px 6px">${l.url?`<a href="${l.url}" target="_blank" rel="noopener" style="color:#2563eb">${l.nome}</a>`:l.nome} <span style="color:#94a3b8">${l.bairro||''}</span></td><td style="padding:2px 6px">${l.status||''}</td><td style="padding:2px 6px;text-align:right">${(l.d||0).toLocaleString('pt-BR')} m</td><td style="padding:2px 6px;text-align:right">${_avR$(l.rs)}</td></tr>`).join('')}</tbody></table></details>`:''}
    ${(m.base_legal||[]).length?`<div style="margin-top:10px;padding:8px 10px;background:#f0fdf4;border-radius:8px;font-size:.85em"><div style="font-weight:600;color:#047857;margin-bottom:4px">Por que a área vendável é ${m.ca>(m.ca_zona||m.ca)?'maior que terreno × CA da zona':'essa'}</div><ul style="margin:0;padding-left:18px;color:#334155">${m.base_legal.map(b=>`<li style="margin:2px 0">${b}</li>`).join('')}</ul></div>`:''}
    ${m.fpInfo?`<div style="font-size:.84em;color:#64748b;margin-top:8px">Fator de planejamento (Quadro 6 do PDE) no ponto: <b>${m.fpInfo.fp_texto||m.fpInfo.fp||'—'}</b> · ${m.fpInfo.macroarea||''}${m.fpInfo.setor?' · '+m.fpInfo.setor:''}</div>`:''}
    ${(m.refs||[]).length?`<div style="font-size:.84em;margin-top:8px"><div style="color:#64748b;margin-bottom:4px">Outorgas concedidas perto (GeoSampa) — contrapartida paga por m² excedente:</div>
      <table style="width:100%;border-collapse:collapse;font-size:.92em"><thead><tr style="text-align:left;color:#94a3b8"><th style="padding:2px 6px">Endereço</th><th style="padding:2px 6px;text-align:right">Dist.</th><th style="padding:2px 6px;text-align:right">Terreno</th><th style="padding:2px 6px;text-align:right">Excedente</th><th style="padding:2px 6px;text-align:right">R$/m²</th><th style="padding:2px 6px">Situação</th></tr></thead>
      <tbody>${m.refs.map(r=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:2px 6px">${r.endereco||''}</td><td style="padding:2px 6px;text-align:right">${r.dist_m} m</td><td style="padding:2px 6px;text-align:right">${n(r.area_terreno||0)} m²</td><td style="padding:2px 6px;text-align:right">${n(r.area_excedente||0)} m²</td><td style="padding:2px 6px;text-align:right">${_avR$(Math.round(r.ct_m2))}</td><td style="padding:2px 6px">${r.situacao||''}</td></tr>`).join('')}</tbody></table></div>`:''}
    <div style="color:#94a3b8;font-size:.8em;margin-top:6px">CUB ${P.cub_ref}. Outorga: referência das concessões vizinhas (GeoSampa, 01/10/2026) ou fórmula do PDE (Lei 16.050/2014, art. 117) quando o QVT é informado. ${P.calibracao}. Parâmetros padrão da NSP em AV_PARAM.</div></details>`;
}
// Reconstrói a memória de uma avaliação salva (padrão vem do texto do método; sem ele, médio)
function _avMemoriaSalva(x){
  if(x&&x.memoria&&x.memoria.incorp&&x.memoria.incorp.vgv) return x.memoria.incorp;   // conta gravada no momento da avaliação
  if(!x||!x.incorp_aplicavel||!x.terreno||!x.ca||!x.incorp_lancamento_rs_m2) return null;
  let extra={}; try{ const mj=/\[incorp:(\{.*?\})\]/.exec(x.metodo||''); if(mj) extra=JSON.parse(mj[1]); }catch(_){}
  const mp=/padrão (economico|medio|alto)/.exec(x.metodo||''); const padrao=extra.padrao||(mp?mp[1]:'medio');
  return _avContaIncorp({terreno:Number(x.terreno), ca:Number(x.ca), ca_basico:extra.cab, rs_lanc:Number(x.incorp_lancamento_rs_m2), padrao, qvt:extra.qvt, frente:extra.frente, gabarito:extra.gab, outorga_ref_m2:extra.oref, outorga_ref_n:extra.on||0, fp:extra.fp, categoria:extra.cat||'mercado', fachada_ativa:!!extra.fa, zona:x.zona, comaer:(x.memoria&&x.memoria.incorp&&x.memoria.incorp.comaer)||null});
}
// Corretor exclui (ou reinclui) um comparável destoante: recalcula sem refazer as buscas
async function _avExcluir(k){
  if(!_avForm.cache) return;
  _avForm.excl=_avForm.excl||new Set();
  if(_avForm.excl.has(k)) _avForm.excl.delete(k); else _avForm.excl.add(k);
  await avalCalcular({recalc:true});
}
// Categorias do entorno (aval_poi: GeoSampa + OSM, mesma base de vizinhança do site). Ordem = ordem de exibição.
const AV_POI_CAT = [
  ['onibus','🚌','Ônibus','ponto'], ['parque','🌳','Parques e praças','parque'], ['escola','🏫','Escolas','escola'],
  ['hospital','🏥','Hospitais','hospital'], ['feira','🥬','Feiras livres','feira'], ['clube','🏊','Clubes e centros esportivos','clube'], ['ciclovia','🚲','Ciclovias','ciclovia'],
];
const _avCap = s => String(s||'').toLowerCase().replace(/(^|\s|-)(\S)/g,(m,a,b)=>a+b.toUpperCase()).replace(/\bDe\b|\bDa\b|\bDo\b|\bDos\b|\bDas\b|\bE\b/g,w=>w.toLowerCase());
function _avEntornoLinhas(e, n){
  n=n||(v=>Number(v||0).toLocaleString('pt-BR'));
  const pois=e.pois||{}, n500=e.n500||{}, n1000=e.n1000||{};
  return AV_POI_CAT.filter(([k])=>(pois[k]||[]).length).map(([k,ic,lb,un])=>{
    const itens=(pois[k]||[]).slice(0,k==='onibus'?1:3).map(p=>`${_avCap(p.nome)} <span style="color:#94a3b8">a ${n(p.dist_m)} m</span>`).join(' · ');
    const cont=n1000[k]?` <span style="color:#94a3b8">(${n500[k]||0} a 500 m, ${n1000[k]} a 1 km)</span>`:'';
    return `<div style="margin-top:3px">${ic} <b>${lb}:</b> ${itens}${cont}</div>`;
  });
}
function _avEntornoHTML(e){
  if(!e) return '';
  const metro=(e.metro||[]).map(m=>`${_avCap(m.nome)}${m.linha?' (linha '+_avCap(m.linha)+')':''} <span style="color:#94a3b8">a ${Number(m.dist_m).toLocaleString('pt-BR')} m</span>`).join(' · ');
  return `<div class="card" style="margin-bottom:12px"><div class="cb">
    <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Entorno</div>
    <div style="font-size:.92em">${e.distrito?`<b>Distrito ${_avCap(e.distrito)}</b>`:''}${e.eixo?` · dentro de eixo de estruturação ativado (${e.eixo}${e.eixo_decreto?', decreto '+e.eixo_decreto:''})`:''}</div>
    <div style="font-size:.92em;margin-top:4px">🚇 <b>Metrô/trem:</b> ${metro||'sem estação em 3 km'}</div>
    <div style="font-size:.9em">${_avEntornoLinhas(e).join('')}</div>
    <div style="color:#94a3b8;font-size:.78em;margin-top:6px">Distâncias em linha reta. Fontes: GeoSampa (equipamentos, parques, ônibus, ciclovias, metrô) e OpenStreetMap (hospitais particulares). Entorno é leitura qualitativa; não altera a conta.</div>
  </div></div>`;
}
function _avCompsTabela(comps, opts){
  const editavel=!(opts&&opts.editavel===false) && !!(_avForm&&_avForm.cache&&_avForm.dossie);
  window._avCompKeys=[];
  return `<table style="width:100%;border-collapse:collapse;font-size:.86em"><thead><tr style="text-align:left;color:#94a3b8">
      <th style="padding:4px 8px">Origem</th><th style="padding:4px 8px">Endereço</th><th style="padding:4px 8px;text-align:right">Área</th>
      <th style="padding:4px 8px;text-align:right">Preço</th><th style="padding:4px 8px;text-align:right">R$/m²</th>${editavel?'<th></th>':''}</tr></thead>
    <tbody>${comps.slice(0,24).map(c=>{ const itbi=/ITBI|Fechamento|Venda real/i.test(c.origem||c.tipo||''); const podeExcluir=editavel&&!!c.k; const ki=window._avCompKeys.push(c.k)-1;
      return `<tr style="border-top:1px solid #f1f5f9${c.excluido?';opacity:.45;text-decoration:line-through':''}">
        <td style="padding:4px 8px;white-space:nowrap">${itbi?'<span style="color:#047857">●</span> ':'<span style="color:#2563eb">●</span> '}${c.origem||c.tipo||'—'}</td>
        <td style="padding:4px 8px">${c.url?`<a href="${c.url}" target="_blank" style="color:#2563eb">${c.endereco||'anúncio'}</a>`:(c.endereco||'—')}${c.dorm?` <small style="color:#94a3b8">${c.dorm} dorm${c.vaga?' · '+c.vaga+' vg':''}</small>`:''}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${itbi&&c.area_util_est?`≈ ${c.area_util_est} m² útil${c.area?`<br><small style="color:#94a3b8">${Math.round(c.area)} m² no cadastro</small>`:''}`:(c.area?Math.round(c.area)+' m²':'—')}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(c.preco)}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${itbi&&c.rs_util?`${_avR$(c.rs_util)} útil${c.rs_m2?`<br><small style="color:#94a3b8">${_avR$(c.rs_m2)} no cadastro</small>`:''}`:_avR$(c.rs_m2)}</td>
        ${podeExcluir?`<td style="padding:4px 4px;text-align:right;white-space:nowrap"><button class="btn btn-o bsm" style="text-decoration:none" title="${c.excluido?'Voltar a usar este comparável':'Excluir este comparável da conta (destoante)'}" onclick="_avExcluir(window._avCompKeys[${ki}])">${c.excluido?'↩︎ incluir':'✕ excluir'}</button></td>`:''}</tr>`; }).join('')}</tbody></table>
    <div style="font-size:.8em;color:#94a3b8;margin-top:6px"><b>Venda real</b> = transação registrada na Prefeitura (guia de ITBI), preço efetivamente declarado. <b>Anúncio</b> = preço pedido em portal, ajustado pelo índice pedido→fechado. ITBI: área do cadastro (IPTU); área útil estimada por (cadastro − ${AV_INDICES.iptu_por_vaga} m²) ÷ ${AV_INDICES.iptu_por_util} (casas: construída ≈ útil). Anúncio: área útil anunciada.</div>`;
}
function _avMetodoHTML(mu, x){
  if(!mu || !mu.rs_final) return '';
  const li=(t,v,sub)=>`<div style="padding:6px 0;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;gap:10px"><span>${t}${sub?`<br><small style="color:#94a3b8">${sub}</small>`:''}</span><b style="white-space:nowrap">${v}</b></div>`;
  return `<div class="card" style="margin-bottom:12px"><div class="cb">
    <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Método único · macro → micro</div>
    <div style="font-size:.85em;color:#64748b;margin:4px 0 8px">Índices do bairro (macro) aplicados a este imóvel (micro): anúncios trazidos ao preço que fecha; ITBI trazido ao valor negociado e à área útil.</div>
    ${mu.rs_anuncio?li(`Anúncios ao vivo: ${_avR$(mu.rs_anuncio)}/m² pedido × ${mu.idx_pedido_fechado}`, _avR$(mu.rs_anuncio_ajust)+'/m²', `pedido → fechado: ${mu.idx_origem}, ${mu.n_anuncio} anúncios`):''}
    ${mu.rs_itbi_ajust?li(`Fechamentos ITBI: ${_avR$(mu.rs_itbi_util)}/m² útil est. × ${(1+mu.sub_itbi).toFixed(3)}`, _avR$(mu.rs_itbi_ajust)+'/m²', `subdeclaração média das guias: ${Math.round(mu.sub_itbi*100)}% · ${mu.n_itbi} fechamentos`):''}
    ${li(`<b>R$/m² adotado</b> (média das fontes${mu.divergencia!=null?`; divergem ${mu.divergencia}%`:''})`, _avR$(mu.rs_final)+'/m²')}
    ${mu.aviso?`<div style="font-size:.85em;color:#b45309;margin-top:6px">⚠️ ${mu.aviso}</div>`:''}
    ${mu.valor_anuncio&&mu.valor_itbi?li('Valor por anúncios × valor por ITBI', `${_avR$(mu.valor_anuncio)} × ${_avR$(mu.valor_itbi)}`):''}
    <div style="font-size:.78em;color:#94a3b8;margin-top:8px">Fontes dos índices: ${AV_INDICES.fonte}.</div>
  </div></div>`;
}
async function _avDesenharMapaComps(comps, centro){
  const el=document.getElementById('av-mapa-comps'); if(!el) return;
  try{ await _avCarregarLeaflet(); }catch(_){ el.textContent='(mapa indisponível)'; return; }
  const pts=comps.filter(c=>c.lat&&c.lng&&/ITBI|Fechamento|Venda real/i.test(c.origem||c.tipo||''));   // só vendas reais (anúncios não têm número)
  const c0=centro||(pts.length?{lat:pts[0].lat,lng:pts[0].lng}:null); if(!c0) return;
  const map=L.map(el).setView([c0.lat,c0.lng],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const b=[];
  // imóvel avaliado em destaque: halo + pino vermelho + rótulo fixo
  const _c=(typeof centro!=='undefined'&&centro)?centro:null;
  if(_c){ L.circleMarker([_c.lat,_c.lng],{radius:18,color:'#dc2626',weight:2,fillColor:'#dc2626',fillOpacity:.15}).addTo(map);
    L.circleMarker([_c.lat,_c.lng],{radius:9,color:'#fff',weight:3,fillColor:'#dc2626',fillOpacity:1}).addTo(map).bindTooltip('Imóvel avaliado',{permanent:true,direction:'top',offset:[0,-10],className:'av-tt'}); b.push([_c.lat,_c.lng]); }
  pts.forEach(c=>{ const itbi=/ITBI|Fechamento|Venda real/i.test(c.origem||''); L.circleMarker([c.lat,c.lng],{radius:7,color:itbi?'#047857':'#2563eb',fillColor:itbi?'#34d399':'#60a5fa',fillOpacity:.8,weight:2}).addTo(map)
      .bindPopup(`<b>${c.origem||''}</b><br>${c.endereco||''}${c.aprox?' <i>(posição aproximada na rua)</i>':''}<br>${c.area?Math.round(c.area)+' m² · ':''}${_avR$(c.preco)} · ${_avR$(c.rs_m2)}/m²${c.url?`<br><a href="${c.url}" target="_blank">abrir anúncio</a>`:''}`); b.push([c.lat,c.lng]); });
  if(b.length>1) map.fitBounds(b,{padding:[20,20]});
  setTimeout(()=>map.invalidateSize(),200);
}
function _avCompara(pedido,mercado){
  const p=Number(pedido),m=Number(mercado); if(!p||!m) return '';
  const d=Math.round((p/m-1)*100);
  if(Math.abs(d)<3) return '<span style="color:#64748b">(alinhado ao mercado)</span>';
  return d>0?`<span style="color:#dc2626">(${d}% acima do mercado)</span>`:`<span style="color:#059669">(${-d}% abaixo do mercado)</span>`;
}

// ═══════════════ TEXTO DO PARECER (Claude) — DESLIGADO em 02/10/2026 (Rodrigo: não compensou o custo) ═══════════════
// O código fica para uma eventual retomada; com AV_TEXTO_ATIVO=false o botão não aparece e nada é cobrado.
const AV_TEXTO_ATIVO = true;   // religado em 02/10/2026 para nova tentativa (prédio identificado + vizinhança)
// O portal resume a avaliação em JSON (sem dado pessoal) e o motor devolve o texto analítico.
// O corretor pode editar antes de salvar; o texto vai para o dossiê em memoria.texto.
function _avResumoParaTexto(){
  const d=_avForm.dossie||{}, mu=_avForm.metodoUnico||null, ev=_avForm.evolutivo||(d.memoria&&d.memoria.evolutivo)||null, geo=_avForm.geo||{}, ent=_avForm.entorno||{};
  let comps=[]; try{ comps=JSON.parse(d.comparaveis||'[]'); }catch(_){}
  const vendas=comps.filter(c=>/Venda/.test(c.tipo||'')&&!c.excluido).slice(0,15).map(c=>({endereco:c.endereco,data:c.data,area_util_estimada:c.area_util_est||null,area_cadastro:c.area,preco:c.preco,rs_m2_util:c.rs_util||null}));
  const anuncios=comps.filter(c=>!/Venda/.test(c.tipo||'')&&!c.excluido).slice(0,12).map(c=>({rua:c.endereco,area_util:c.area,preco_pedido:c.preco,rs_m2:c.rs_m2,dorm:c.dorm||null}));
  const ip=_avForm.iptuSel||null, lote=(_avForm.iptu||[]);
  const m=_avForm.memoria||null;
  return {
    data_base: new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}),
    imovel:{endereco:d.endereco,bairro:d.bairro,tipo:d.tipo,area_util:d.area_util,terreno:d.terreno,frente:d.frente||null,dorm:d.dorm,suites:d.suite,vagas:d.vaga},
    valor:{mercado:d.valor_mercado,faixa_min:d.faixa_min,faixa_max:d.faixa_max,rs_m2_util:d.mercado_rs_m2},
    metodo:mu?{anuncios_rs_m2:mu.rs_anuncio,anuncios_n:mu.n_anuncio,indice_pedido_fechado:mu.idx_pedido_fechado,vendas_reais_rs_m2_util:mu.rs_itbi_util,vendas_reais_n:mu.n_itbi,ajuste_subdeclaracao_itbi:mu.sub_itbi,rs_m2_adotado:mu.rs_final,divergencia_entre_fontes_pct:mu.divergencia,comparaveis_excluidos_pelo_corretor:mu.excluidos||0}:null,
    terreno_mais_construcao:ev&&!ev.so_terreno?{terreno_m2:ev.terreno,rs_m2_terreno:ev.rs_terreno,origem_rs_terreno:ev.rs_terreno_origem,valor_terreno:ev.v_terreno,construcao_m2:ev.constr,idade:ev.idade,estado:ev.estadoLb,depreciacao_pct:Math.round((ev.dep||0)*100),valor_construcao:ev.v_benf,total:ev.total,valor_comparativo:ev.comparativo||null,valor_como_lote:ev.v_lote||null}:(ev&&ev.so_terreno?{terreno_m2:ev.terreno,rs_m2_lote:ev.rs_terreno,origem:ev.rs_terreno_origem,valor:ev.total}:null),
    vendas_reais_proximas:vendas, anuncios_do_bairro:anuncios,
    cadastro_prefeitura: lote.length&&!_avForm.iptuOculto?{uso:(ip||lote[0]).uso,padrao:(ip||lote[0]).padrao,ano_construcao:(ip||lote[0]).ano_construcao,pavimentos:(ip||lote[0]).pavimentos,terreno_do_lote_m2:(ip||lote[0]).area_terreno,unidades_no_lote:lote.filter(r=>!/garagem|dep[oó]sito/i.test(r.uso||'')).length}:null,
    entorno:{distrito:ent.distrito||null,eixo:ent.eixo||null,metro:(ent.metro||[]).slice(0,3),proximos:ent.pois||null,contagem_500m:ent.n500||null,contagem_1km:ent.n1000||null},
    zoneamento:{zona:geo.zona||null,ca_basico:geo.ca_basico||null,ca_maximo:geo.ca_maximo||null,observacao:'aproximado, a confirmar na Prefeitura'},
    altura_maxima_aeroporto:_avForm.comaer&&_avForm.comaer.altura!=null?{metros:_avForm.comaer.altura,pavimentos:_avForm.comaer.pav,observacao:'estimativa pela norma do DECEA; confirmar em consulta'}:null,
    incorporacao:d.incorp_aplicavel&&m?{valor_terreno:d.incorp_valor_terreno,categoria:m.categoria,ca_usado:m.ca,area_vendavel_m2:Math.round(m.area_vendavel),lancamento_rs_m2:d.incorp_lancamento_rs_m2,origem_lancamento:_avForm.lancOrigem||null,vgv:d.incorp_vgv,terreno_pct_vgv:m.terreno_vgv?Math.round(m.terreno_vgv*1000)/10:null}:null
  };
}
function _avTextoHTML(){
  const t=_avForm&&_avForm.texto;
  const esc=v=>String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  if(!t) return `<div class="card" style="margin-bottom:12px"><div class="cb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-o" onclick="avalGerarTexto()">✍️ Escrever o parecer em texto</button>
      <span id="av-texto-st" style="color:#64748b;font-size:.88em">O que não aparece na tela: como idade do prédio, tamanho e andar mexem no preço por aqui, o que já foi vendido no prédio e na rua, e o que se sabe do edifício e do entorno. Leva um a dois minutos; você pode editar antes de salvar.</span></div></div>`;
  const ed='contenteditable="true" spellcheck="true" style="outline:none;border-radius:6px;padding:2px 4px;margin:-2px -4px"';
  return `<div class="card" style="margin-bottom:12px;border-left:3px solid #1E2D4A"><div class="cb">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Parecer em texto <span style="text-transform:none;color:#94a3b8">· clique no texto para editar</span></div>
      <button class="btn btn-o bsm" onclick="if(confirm('Escrever o texto de novo? As edições serão perdidas.')){_avForm.texto=null;avalGerarTexto();}">↻ Reescrever</button></div>
    <h3 data-t="titulo" ${ed} style="margin:8px 0 6px;font-size:1.15em">${esc(t.titulo)}</h3>
    <p data-t="resposta" ${ed} style="font-weight:600;margin:0 0 10px">${esc(t.resposta)}</p>
    ${(t.secoes||[]).map((sec,i)=>`<div style="margin-top:10px"><div data-t="st${i}" ${ed} style="font-weight:600;color:#1E2D4A">${esc(sec.titulo)}</div><div data-t="sx${i}" ${ed} style="white-space:pre-wrap;color:#334155;margin-top:2px">${esc(sec.texto)}</div></div>`).join('')}
    ${(t.fontes||[]).length?`<div style="margin-top:10px;font-size:.82em;color:#64748b"><b>Fontes consultadas:</b> ${t.fontes.map(f=>`<a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:#2563eb">${esc(f.titulo||f.url)}</a>`).join(' · ')}</div>`:''}
    ${(t.atencao||[]).length?`<div style="margin-top:10px;font-size:.92em"><b>Pontos de atenção</b><ul data-t="atencao" ${ed} style="margin:4px 0 0;padding-left:18px">${t.atencao.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`:''}
  </div></div>`;
}
function _avTextoColetar(){
  const t=_avForm.texto, box=document.getElementById('av-texto'); if(!t||!box) return t||null;
  const get=k=>{ const e=box.querySelector(`[data-t="${k}"]`); return e?e.innerText.trim():null; };
  const out={titulo:get('titulo')||t.titulo, resposta:get('resposta')||t.resposta,
    secoes:(t.secoes||[]).map((s,i)=>({titulo:get('st'+i)||s.titulo, texto:get('sx'+i)||s.texto})),
    atencao:(()=>{ const ul=box.querySelector('[data-t="atencao"]'); return ul?[...ul.querySelectorAll('li')].map(li=>li.innerText.trim()).filter(Boolean):(t.atencao||[]); })(),
    fontes:t.fontes||[], gerado:t.gerado||null};
  _avForm.texto=out; return out;
}
// Geração no site do JURÍDICO (falcaovaz.netlify.app), que já tem a chave da Anthropic: o portal dispara a função
// em segundo plano com o login do corretor e acompanha o resultado na fila ia_jobs (mesmo banco).
async function avalGerarTexto(){
  const box=document.getElementById('av-texto'); if(!box) return;
  const msg=t=>{ box.innerHTML=`<div class="card" style="margin-bottom:12px"><div class="cb" style="color:#64748b">${t}</div></div>`; };
  const falhou=t=>{ box.innerHTML=_avTextoHTML(); const st=document.getElementById('av-texto-st'); if(st) st.innerHTML=`<span style="color:#b45309">Não foi possível escrever o texto: ${String(t).replace(/</g,'&lt;')}</span>`; };
  msg('✍️ Pesquisando o prédio e o entorno e escrevendo o parecer… (um a dois minutos)');
  try{ if(typeof _authRenovarSePerto==='function') await _authRenovarSePerto(); }catch(_){}
  const sess=(typeof _authCarregarSessao==='function')?_authCarregarSessao():null;
  if(!sess||!sess.access_token){ falhou('sessão do portal não encontrada — saia e entre de novo.'); return; }
  const job='par-'+(crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
  const origem=(typeof JURIDICO_ORIGIN!=='undefined'&&JURIDICO_ORIGIN)||'https://falcaovaz.netlify.app';
  // achados do mercado local (idade do prédio, tamanho, andar, tendência, mesmo prédio e mesma rua) — o que a tela não mostra
  const dados=_avResumoParaTexto();
  try{ const f=await _avRpc('aval_fatos',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_logradouro:_avForm.rua||null,p_numero:_avForm.num||null,p_raio_m:800}); dados.mercado_local=Array.isArray(f)?f[0]:f; }catch(_){}
  // prédios novos anunciados perto (apto.vc), inclusive os prontos: a pesquisa usa para identificar o prédio do imóvel
  try{ const l=await _avRpc('aval_lanc_anuncio',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_raio_m:300,p_incluir_prontos:true}); const r=Array.isArray(l)?l[0]:l;
       dados.predios_novos_perto=((r&&r.lista)||[]).map(x=>({nome:x.nome,status:x.status,d:x.d,area_min:x.area_min,area_max:x.area_max,andares:x.andares,lote_m2:x.lote_m2,rs_m2_anunciado:x.rs,url:x.url})); }catch(_){}
  // cadastro que não bate com o tipo (ex.: apartamento num lote que o IPTU ainda registra como casa) = prédio provavelmente novo
  if(dados.cadastro_prefeitura && /apart|studio|cobertura|duplex/i.test(dados.imovel.tipo||'') && !/apart|condom/i.test(dados.cadastro_prefeitura.uso||'')) dados.cadastro_prefeitura.pode_estar_desatualizado=true;
  if(_avForm.iptuVizinho && /apart|studio|cobertura|duplex/i.test(dados.imovel.tipo||'')) dados.predio_no_cadastro_em_numero_vizinho=_avForm.iptuVizinho;
  try{
    // POST "simples" (text/plain, sem cabeçalhos extras): o navegador não faz preflight; a resposta é opaca e não importa
    await fetch(`${origem}/.netlify/functions/parecer-texto-background`,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({job_id:job,token:sess.access_token,dados}) });
  }catch(e){ falhou('não consegui acionar o serviço de texto.'); return; }
  const t0=Date.now();
  while(Date.now()-t0<180000){
    await new Promise(r=>setTimeout(r,3000));
    let row=null; try{ const r=await db.get('ia_jobs',`?job_id=eq.${job}&select=status,resultado,erro,modelo`); row=r&&r[0]; }catch(_){}
    if(!row) continue;
    if(row.status==='erro'){ falhou(row.erro||'erro no serviço de texto.'); return; }
    if(row.status==='pronto'){
      let j=null; try{ j=JSON.parse(row.resultado||'null'); }catch(_){}
      if(!j||!j.titulo){ falhou('resposta inválida do serviço de texto.'); return; }
      _avForm.texto={titulo:j.titulo,resposta:j.resposta,secoes:j.secoes||[],atencao:j.atencao||[],fontes:j.fontes||[],gerado:{modelo:row.modelo,em:new Date().toISOString()}};
      box.innerHTML=_avTextoHTML(); return;
    }
    const seg=Math.round((Date.now()-t0)/1000); msg(`✍️ Escrevendo o parecer… ${seg} s`);
  }
  falhou('o serviço de texto demorou mais de 3 minutos. Tente de novo.');
}
async function avalSalvar(){
  const d=_avForm.dossie; if(!d){ alert('Gere a avaliação antes.'); return; }
  try{
    d.corretor_nome=(typeof CUR!=='undefined'&&CUR)?CUR.nome:null;
    try{ const u=await db.get('usuarios',`?select=creci&id=eq.${CUR.id}`); d.corretor_creci=(u&&u[0]&&u[0].creci)||null; }catch(_){ d.corretor_creci=null; }
    const tx=_avTextoColetar(); if(tx){ d.memoria=d.memoria||{}; d.memoria.texto=tx; }
    d.status='aprovada'; d.aprovado_por=d.corretor_nome; d.aprovado_em=new Date().toISOString();   // revisão = o preview; salvar já libera o dossiê
    const payload=Object.fromEntries(Object.entries(d).filter(([k])=>!k.startsWith('_')));
    const rows=await db.post('aval_resultado', payload);
    const novo=Array.isArray(rows)?rows[0]:rows;
    _avForm={}; _avPino=null;   // avaliação gravada: nada dela continua valendo nas próximas telas
    await carregarAvalImoveis({lista:true});
    if(novo?.id) abrirAvalDetalhe(novo.id);
  }catch(e){ alert('Não foi possível salvar: '+(e.message||e)); }
}

// ═══════════════ DETALHE + APROVAÇÃO + LINK (avaliação salva) ═══════════════
function abrirAvalDetalhe(id){
  const x=_avImoveis.find(y=>y.id===id); if(!x) return;
  const st=AV_STATUS[x.status]||AV_STATUS.gerada;
  let comps=[]; try{ comps=typeof x.comparaveis==='string'?JSON.parse(x.comparaveis):(x.comparaveis||[]); }catch(_){}
  const corpo=document.getElementById('aval-corpo');
  const link=`${location.origin}/avaliacao.html?t=${x.token}`;
  const inc = x.incorp_aplicavel ? `
    <div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
      <div style="color:#047857;font-weight:600">💡 Potencial de incorporação</div>
      <div style="font-size:1.7em;font-weight:800;color:#047857;margin:4px 0">${_avR$(x.incorp_valor_terreno)}</div>
      <div style="color:#64748b">${x.zona} · CA ${x.ca} · construível ${x.incorp_area_constr} m² · lançamento ${_avR$(x.incorp_lancamento_rs_m2)}/m² · VGV ${_avR$(x.incorp_vgv)}${x.incorp_ganho_pct!=null?` · <b style="color:#059669">${x.incorp_ganho_pct>=0?'+':''}${Math.round(x.incorp_ganho_pct)}%</b>`:''}</div>
      ${_avMemoriaHTML(_avMemoriaSalva(x))}
    </div></div>`:'';
  const acoes = x.status==='aprovada' ? `
    <div class="card" style="background:#f0fdf4"><div class="cb">
      <div style="color:#047857;font-weight:600;margin-bottom:6px">✅ Aprovada${x.aprovado_por?' por '+x.aprovado_por:''} — link pronto</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a class="btn btn-p" href="${link}&pdf=1" target="_blank" title="Abre o dossiê e chama a impressão: escolha a impressora ou 'Salvar como PDF'">🖨️ Imprimir / salvar PDF</a>
        <a class="btn btn-o" href="https://wa.me/?text=${encodeURIComponent('Olá! Segue a opinião de valor do imóvel '+(x.endereco||'')+' preparada pela Nova São Paulo: '+link)}" target="_blank">💬 Enviar por WhatsApp</a>
        <a class="btn btn-o" href="mailto:?subject=${encodeURIComponent('Opinião de valor — '+(x.endereco||''))}&body=${encodeURIComponent('Olá!\n\nSegue a opinião de valor do imóvel '+(x.endereco||'')+' preparada pela Imobiliária Nova São Paulo:\n'+link+'\n\nFico à disposição.\n'+(x.corretor_nome||''))}">✉️ Enviar por e-mail</a>
        <button class="btn btn-o" onclick="_avCopiarLink()">📋 Copiar link</button>
        <a class="btn btn-o" href="${link}" target="_blank">Abrir</a>
        <button class="btn btn-o" onclick="_avAprovar(${x.id},'gerada')" title="Tira o dossiê do ar até revisar">↩︎ Reabrir</button>
      </div>
      <input id="av-link" readonly value="${link}" onclick="this.select()" style="width:100%;margin-top:8px;padding:8px 10px;border:1px solid #bbf7d0;border-radius:8px;background:#fff;font-size:.85em">
      <div style="font-size:.78em;color:#64748b;margin-top:8px">${AV_TEXTO_LEGAL}</div></div></div>`:`
    <div class="card"><div class="cb" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_avAprovar(${x.id},'aprovada')">✅ Aprovar e gerar link</button>
      <button class="btn btn-o" onclick="_avAprovar(${x.id},'rejeitada')">Rejeitar</button>
    </div></div>`;
  corpo.innerHTML = `
    <div class="ph" style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-o bsm" onclick="carregarAvalImoveis({lista:true})">← Voltar</button>
      <div><h1 class="pt">${x.endereco||x.codigo}</h1>
        <div class="pst">${x.tipo||''} · ${x.bairro||''}
          <span style="background:${st.bg};color:${st.cor};padding:1px 8px;border-radius:999px;font-size:.85em;font-weight:600;margin-left:6px">${st.lb}</span></div></div>
    </div>
    ${_avEntornoHTML(x.entorno)}
    ${x.valor_mercado?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase">Valor de mercado</div>
      <div style="font-size:1.8em;font-weight:800;margin:4px 0">${_avR$(x.valor_mercado)}</div>
      <div style="color:#64748b">Faixa: ${_avR$(x.faixa_min)} — ${_avR$(x.faixa_max)}</div>
      <div style="color:#94a3b8;font-size:.88em;margin-top:6px">${String(x.metodo||'').replace(/\s*\[incorp:.*?\]/g,'')}</div>
      ${_avIptuCaixaHTML(x.entorno&&x.entorno.iptu, x.id)}
      ${x.preco_pedido?`<div style="margin-top:8px;font-size:.9em">Pretendido: <b>${_avR$(x.preco_pedido)}</b> ${_avCompara(x.preco_pedido,x.valor_mercado)}</div>`:''}
    </div></div>`:''}
    ${inc}
    ${(comps.some(c=>c.lat)||x.lat||_avPino)?`<div class="card" style="margin-bottom:12px"><div class="cb"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Mapa: imóvel, anúncios e fechamentos</div><div id="av-mapa-comps" style="height:320px;border-radius:10px;border:1px solid #e2e8f0"></div><div style="font-size:.82em;color:#64748b;margin-top:6px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 2px #dc2626;vertical-align:middle"></span> imóvel avaliado &nbsp; <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#34d399;border:2px solid #047857;vertical-align:middle"></span> vendas reais (ITBI). Os anúncios não trazem o número do imóvel e por isso aparecem só na tabela abaixo.</div></div></div>`:''}
    ${comps.length?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;margin-bottom:6px">Comparáveis</div>
      ${_avCompsTabela(comps,{editavel:false})}
    </div></div>`:''}
    ${acoes}`;
  (async()=>{ let centro=(x.lat&&x.lng)?{lat:+x.lat,lng:+x.lng}:null; if(!centro){ try{ const r=await _avRpc('aval_geocode',{p_q:(x.endereco||'')+' '+(x.bairro||'')}); const h=Array.isArray(r)?r[0]:null; if(h) centro={lat:h.lat,lng:h.lng}; }catch(_){} } _avDesenharMapaComps(comps, centro); })();
}

async function _avAprovar(id, novoStatus){
  const patch={status:novoStatus};
  if(novoStatus==='aprovada'){ patch.aprovado_por=(typeof CUR!=='undefined'&&CUR?.nome)?CUR.nome:null; patch.aprovado_em=new Date().toISOString(); }
  try{
    await db.patch('aval_resultado', id, patch);
    const x=_avImoveis.find(y=>y.id===id); if(x) Object.assign(x,patch);
    abrirAvalDetalhe(id);
  }catch(e){ alert('Não foi possível atualizar: '+(e.message||e)); }
}
function _avCopiarLink(){
  const el=document.getElementById('av-link'); if(!el) return; el.select();
  navigator.clipboard?.writeText(el.value).then(()=>{
    const b=event?.target; if(b){ const t=b.textContent; b.textContent='✓ Copiado'; setTimeout(()=>b.textContent=t,1500); }
  },()=>document.execCommand('copy'));
}

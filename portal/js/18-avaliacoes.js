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

const AV_CASA = ['CASA','CASA TÉRREA','CASA ASSOBRADADA','CASA DE VILA','SOBRADO','CONDOMÍNIO'];
// Texto legal — aparece no preview, no detalhe e no dossiê (avaliacao.html tem cópia idêntica)
const AV_TEXTO_LEGAL = 'Este documento é uma opinião de valor para fins de comercialização, elaborada pela Imobiliária Nova São Paulo a partir de dados públicos (ITBI, zoneamento, outorga) e de mercado (anúncios e negócios fechados), por meio automatizado revisado pelo corretor responsável. Não constitui laudo de avaliação nem parecer técnico de avaliação mercadológica (NBR 14.653 / Resolução COFECI 1.066/2007), não substitui vistoria e não vale como garantia de preço de venda. Os valores podem variar com as condições do imóvel, da documentação e do mercado.';
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
// Parâmetros padrão da conta reversa (método involutivo). Editáveis aqui; o corretor não mexe.
const AV_PARAM = {
  cub_ref:'Sinduscon-SP jul/2026',
  calibracao:'calibrado em viabilidades reais da Nova SP Inc (Maquerobi HIS 1.154 m², Feel Saúde 1.159 m², DRE Free Concept — abr/jul 2026)',
  // ── Áreas (o que de fato se vende e se constrói sobre o lote) ──
  eficiencia_his:0.97,     // EHIS/EHMP: privativa ≈ computável (garagem, circulação, áreas comuns e terraços são não computáveis — Decreto 63.728/2024 art. 17); Maquerobi: 6.849 / 6.924 = 0,99
  eficiencia_mercado:0.85, // mercado em eixo: circulação comum CONTA no CA (LPUOS art. 62 V exclui ZEU/ZEM) → privativa ≈ 85% da computável (estimativa; falta viabilidade de mercado p/ calibrar)
  his_unid_m2:28,          // unidade típica de EHIS (Maquerobi 27 m², Feel Saúde 24–41) — usada só p/ traduzir os tetos de preço por unidade em R$/m²
  priv_sobre_construida:0.776,    // privativa / construída total (Maquerobi: 6.849 / 8.825)
  // ── Obra ──
  obra_sobre_cub:1.68,  // custo de obra por m² construído = CUB × 1,68 (Hoga/Maquerobi: R$ 3.726/m² ÷ CUB R8-N 2.231; inclui BDI 12,5% e decorados 3%)
  // ── Despesas sobre o VGV (Maquerobi: incorporação 1% + aprovações 0,5% + gestão 5% + marketing 4,5% + entrega 0,5% + adm 2%) ──
  despesas:0.135,
  projetos_sobre_obra:0.025,  // projetos = 2,5% do custo de obra
  comissao:0.05,        // corretagem sobre o VGV (Rodrigo 01/10/2026; Maquerobi usa 6%)
  ret:0.04,             // RET (Maquerobi 4%)
  financiamento:0.03,   // juros/seguro do financiamento à produção (Maquerobi 0,5–3,4%; Free Concept 5,6%)
  margem:0.15,          // margem do incorporador sobre o VGV (Rodrigo; deck Nova SP Inc: mínimo 15%; Maquerobi EBITDA 17,6%)
  custo_aquisicao:0.12, // ITBI 3% + comissão do terreno 4% + jurídico, estudos, demolição e IPTU ≈ 5% (Maquerobi: 1,33 MM sobre 10,05 MM) — sai do que vai ao proprietário
  // ── Compatibilidade (telas antigas) ──
  marketing:0.045, adm:0.02, fator_obra:1.68, eficiencia:0.90, constr_sobre_computavel:1.29,
  lanc_sobre_usado:1.25,// se não houver lançamento anunciado no bairro: lançamento ≈ usado × 1,25
  casa_sobre_apto:0.60, // se não houver casa anunciada no bairro: R$/m² casa ≈ apto × 0,60 (mediana observada 30/09/2026)
  // Outorga onerosa (PDE, Lei 16.050/2014, art. 117): Ct = (At/Ac) × V × Fs × Fp por m² adicional acima do CA básico.
  outorga_fs:1.0,
  outorga_fp:1.0,
  qvt_sobre_mercado:0.50, // sem QVT informado: V ≈ 50% do valor de mercado do terreno (o cadastro fica bem abaixo do mercado)
  // Incentivos do PDE/LPUOS (Rodrigo, 01/10/2026). Lançamentos reais: Maquerobi HIS 10.808/m², Feel Saúde HIS+HMP 10.500, UP Saúde studios 11–13 mil.
  his_max_rs_m2:12000,    // lançamento até este R$/m² → HIS (outorga isenta, Fs = 0; áreas não computáveis extras)
  hmp_max_rs_m2:15000,    // até este R$/m² → HMP (Fs = 0,5; mesmas áreas extras); acima → mercado (Fs = 1)
  fachada_ativa_bonus:0.50, // fachada ativa em eixo/centralidade: térreo comercial não computável até 50% do lote
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
function _avIdxPedidoFechado(bairro){ const b=_avNormBairro(bairro).toUpperCase(); const k=Object.keys(AV_INDICES.pedido_fechado).find(k=>k!=='global' && b.includes(k)); return { idx: k?AV_INDICES.pedido_fechado[k]:AV_INDICES.pedido_fechado.global, origem: k?`${k} (NIDO)`:'média NSP (NIDO)' }; }
// Bairros onde o padrão sugerido é ALTO (o corretor pode trocar na tela)
const AV_BAIRROS_ALTO = ['moema','itaim','vila nova conceicao','brooklin','campo belo','jardim paulista','jardins','paraiso','vila olimpia','ibirapuera','chacara klabin','vila mariana','pinheiros','perdizes'];
const _avNormBairro = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const n0 = v => Math.round(v||0).toLocaleString('pt-BR');
function _avPadraoSugerido(bairro){ const b=_avNormBairro(bairro); return AV_BAIRROS_ALTO.some(x=>b.includes(x)) ? 'alto' : 'medio'; }
// Conta reversa de incorporação: quanto o terreno pode valer para o empreendimento fechar com margem.
function _avContaIncorp({terreno, ca, ca_basico, rs_lanc, padrao, qvt, frente, gabarito, outorga_ref_m2, outorga_ref_n, fp, categoria, fachada_ativa, zona}){
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
    base_legal.push(`Em EHIS/EHMP são não computáveis (não consomem CA): garagens, circulação e áreas comuns, terraços até 5% do lote por pavimento, áreas técnicas, e usos não residenciais até 20% da computável — Decreto 63.728/2024, art. 17 e 18; LPUOS art. 62, X. Por isso a área privativa vendida fica ≈ ${Math.round(P.eficiencia_his*100)}% da computável (Maquerobi: 6.849 m² privativos sobre 6.924 computáveis).`);
    base_legal.push(cat==='his' ? 'Direito de construir até o CA máximo é gratuito para EHIS: sem outorga onerosa — Decreto 63.728/2024, art. 19.' : 'EHMP paga outorga com Fator de Interesse Social reduzido (Fs 0,5) — Decreto 63.728/2024, art. 20 e Quadro 5 do PDE.');
    base_legal.push(`Para valer, pelo menos 80% da área computável tem de ser ${cat.toUpperCase()} (art. 1º e 9º do decreto) e as unidades precisam caber nos tetos do ${AV_HIS_TETO.ref}: HIS-1 ${_avR$(AV_HIS_TETO.his1)}, HIS-2 ${_avR$(AV_HIS_TETO.his2)}, HMP ${_avR$(AV_HIS_TETO.hmp)} por unidade (renda familiar até ${_avR$(AV_HIS_TETO.renda_his1)}, ${_avR$(AV_HIS_TETO.renda_his2)} e ${_avR$(AV_HIS_TETO.renda_hmp)}). Numa unidade de ${P.his_unid_m2} m² isso equivale a ${_avR$(Math.round(AV_HIS_TETO.his2/P.his_unid_m2))}/m² (HIS-2) e ${_avR$(Math.round(AV_HIS_TETO.hmp/P.his_unid_m2))}/m² (HMP).`);
    base_legal.push('Conferido em projetos reais da Nova SP Inc: Maquerobi (1.154 m², ZEU, HIS) vende 6.849 m² privativos = 5,9 × o lote; Feel Saúde (1.159 m², ZEU, HIS+HMP, 225 un.) ≈ 6,4 × o lote.');
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
  if(area_comput>P.cota_solidariedade_m2) alertas.push(`Área computável acima de ${P.cota_solidariedade_m2.toLocaleString('pt-BR')} m²: PDE exige cota de solidariedade (10% em HIS ou equivalente).`);
  if(cab==null) alertas.push('CA básico não identificado na zona: outorga onerosa não calculada.');
  if(social) alertas.push(`Enquadrado como ${cat.toUpperCase()} pelo preço de lançamento (${cat==='his'?'até':'entre '+P.his_max_rs_m2.toLocaleString('pt-BR')+' e'} ${(cat==='his'?P.his_max_rs_m2:P.hmp_max_rs_m2).toLocaleString('pt-BR')} R$/m²): CA ${ca_usado}${ca_usado>ca_zona?' (zona: '+ca_zona+')':''}, outorga ${fs===0?'isenta':'com Fs 0,5'}. Veja "por que a área vendável é maior" abaixo.`);
  else alertas.push(`Mercado: área privativa ≈ ${P.eficiencia_mercado*100}% da computável e outorga integral. Esta faixa ainda não foi calibrada com viabilidade real — tratar como estimativa.`);
  if(fachada_ativa) alertas.push(`Fachada ativa: ${n0(area_fachada)} m² de térreo comercial não computável somados à área vendável (LPUOS, até ${P.fachada_ativa_bonus*100}% do lote). Depende de o projeto adotar fachada ativa e de a zona admitir.`);
  if(terreno_max<=0) alertas.push('Conta fechou negativa: neste padrão e preço de lançamento, a incorporação não paga o terreno.');
  return {padrao, cub:p.cub, custo_m2, ca:ca_usado, ca_zona, ca_social:cs?cs.ca:null, zona:zona||null, base_legal, ca_basico:cab, terreno, frente:frente||null, gabarito:gabarito||null,
          categoria:cat, fs, fachada_ativa:!!fachada_ativa, area_fachada, priv_fator,
          area_comput, area_constr, area_vendavel, vgv, obra, projetos, despesas, comissao, ret, financiamento, indiretos, margem, antes,
          area_adicional, v, v_origem, outorga, outorga_modo, fp:fpUsado, bruto, custos_aquisicao, terreno_max, terreno_vgv: vgv?terreno_max/vgv:null, alertas};
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

const AV_STATUS = {
  gerada:{lb:'Gerada',cor:'#b45309',bg:'#fef3c7'},
  aprovada:{lb:'Aprovada',cor:'#047857',bg:'#d1fae5'},
  rejeitada:{lb:'Rejeitada',cor:'#64748b',bg:'#f1f5f9'}
};

// ── RPC helper (usa o JWT do corretor via hdr()) ─────────────────
async function _avRpc(fn, args){
  const r = await fetch(`${SBU}/rest/v1/rpc/${fn}`, {
    method:'POST', headers:hdr(), body:JSON.stringify(args||{})
  });
  if(!r.ok){ throw new Error('RPC '+fn+' HTTP '+r.status); }
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
      +'anuncios_usados,metodo,incorp_area_constr,incorp_lancamento_rs_m2,incorp_vgv,edificio,dorm,suite,vaga,observacao,'
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
    ? `<span style="color:#047857;font-weight:600">${_avR$(x.incorp_valor_terreno)}</span>${x.incorp_ganho_pct!=null?` <span style="color:#059669;font-size:.85em">+${Math.round(x.incorp_ganho_pct)}%</span>`:''}`
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
  const corpo=document.getElementById('aval-corpo');
  corpo.innerHTML = `
    <div class="card"><div class="cb">
      <div style="font-weight:600;margin-bottom:10px">1 · Onde fica o imóvel</div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
        <input id="av-rua" placeholder="Rua / Avenida (ex: Alameda dos Nhambiquaras)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-num" placeholder="Número" inputmode="numeric" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      </div>
      <input id="av-bairro" placeholder="Bairro (ex: Moema)" style="margin-top:8px;width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <button class="btn btn-o" style="margin-top:10px" onclick="avalGeocodificar()">🔎 Localizar no mapa</button>
      <div id="av-geo-res" style="margin-top:10px"></div>
      <div id="av-mapa" style="height:280px;border-radius:10px;margin-top:10px;display:none;border:1px solid #e2e8f0"></div>
      <div id="av-pino-info" style="margin-top:8px;color:#64748b;font-size:.9em"></div>
    </div></div>

    <div class="card" id="av-passo2" style="opacity:.5;pointer-events:none"><div class="cb">
      <div style="font-weight:600;margin-bottom:10px">2 · O imóvel</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <select id="av-tipo" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
          ${AV_TIPOS.map(t=>`<option>${t}</option>`).join('')}</select>
        <input id="av-area" type="number" placeholder="Área útil / construída (m²)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-dorm" type="number" placeholder="Dorm." style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-suite" type="number" placeholder="Suítes" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-vaga" type="number" placeholder="Vagas" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      </div>
      <input id="av-preco" type="number" placeholder="Valor que o proprietário pretende pedir (opcional — o dossiê mostra a diferença para o mercado)" style="margin-top:8px;width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <div style="color:#94a3b8;font-size:.82em;margin-top:4px">Para casas, sobrados, terrenos e comerciais, a avaliação como terreno para incorporadora fica num botão à parte, depois do resultado.</div>
      <button class="btn btn-p" style="margin-top:12px" onclick="avalCalcular()">⚙️ Gerar avaliação</button>
      <div id="av-calc-status" style="margin-top:8px;color:#64748b;font-size:.9em"></div>
    </div></div>

    <div style="margin-top:8px"><button class="btn btn-o bsm" onclick="carregarAvalImoveis({lista:true})">🗂 Ver avaliações salvas</button></div>`;
}

async function _avCarregarLeaflet(){
  if(window.L) return;
  await new Promise((ok,err)=>{
    const css=document.createElement('link'); css.rel='stylesheet';
    css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload=ok; s.onerror=err; document.head.appendChild(s);
  });
}

async function avalGeocodificar(){
  const rua=(document.getElementById('av-rua').value||'').trim();
  const num=(document.getElementById('av-num').value||'').trim();
  const bairro=(document.getElementById('av-bairro').value||'').trim();
  const res=document.getElementById('av-geo-res');
  if(!rua){ res.innerHTML='<span style="color:#dc2626">Informe ao menos a rua.</span>'; return; }
  _avForm={rua,num,bairro};
  res.innerHTML='Procurando…';
  let cands=[];
  // 1) nosso banco (nada sai pra fora)
  try{
    const loc=await _avRpc('aval_geocode',{p_q:`${rua} ${num}`});
    cands=(loc||[]).map(c=>({label:c.endereco,lat:c.lat,lng:c.lng,origem:'nosso banco'}));
  }catch(e){ console.warn('geocode local',e); }
  // 2) OSM na cauda
  if(!cands.length){
    try{
      const q=[rua+(num?', '+num:''), bairro, 'São Paulo', 'SP'].filter(Boolean).join(', ');
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&bounded=1&viewbox=-46.90,-23.35,-46.35,-24.00'
        +'&q='+encodeURIComponent(q);
      const r=await fetch(url,{headers:{'Accept-Language':'pt-BR'}});
      const arr=await r.json();
      cands=(arr||[]).map(o=>({label:o.display_name.split(',').slice(0,3).join(','),
        lat:+o.lat,lng:+o.lon,origem:'OpenStreetMap'}));
    }catch(e){ console.warn('osm',e); }
  }
  if(!cands.length){
    res.innerHTML='<span style="color:#b45309">Não localizei automaticamente. Você pode ajustar o pino no mapa.</span>';
    await _avMostrarMapa(-23.61,-46.66);   // centro aproximado zona sul
    return;
  }
  res.innerHTML='<div style="font-size:.9em;color:#64748b;margin-bottom:6px">Escolha o endereço certo (arraste o pino se precisar ajustar):</div>'
    + cands.map((c,i)=>`<div style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:4px;cursor:pointer"
        onclick="_avEscolher(${c.lat},${c.lng},${i})">📍 ${c.label} <span style="color:#94a3b8;font-size:.82em">· ${c.origem}</span></div>`).join('');
  window._avCands=cands;
  await _avEscolher(cands[0].lat,cands[0].lng,0);
}

async function _avEscolher(lat,lng,i){
  _avPino={lat,lng};
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
    _avMarker.on('dragend',e=>{ const p=e.target.getLatLng(); _avPino={lat:p.lat,lng:p.lng}; _avPinoInfo(); });
    setTimeout(()=>_avMapa.invalidateSize(),200);
  }else{
    _avMapa.setView([lat,lng],17); _avMarker.setLatLng([lat,lng]);
  }
  _avPino={lat,lng}; _avPinoInfo(); _avLiberaPasso2();
}
function _avLiberaPasso2(){
  const p=document.getElementById('av-passo2'); if(p){p.style.opacity='1';p.style.pointerEvents='auto';}
}

async function _avPinoInfo(){
  const el=document.getElementById('av-pino-info'); if(!el||!_avPino) return;
  el.innerHTML='Confirmando zoneamento…';
  try{
    const z=await _avRpc('aval_geo',{p_lat:_avPino.lat,p_lng:_avPino.lng});
    const zi=Array.isArray(z)?z[0]:z;
    _avForm.geo=zi||null;
    if(zi){
      el.innerHTML=`✅ <b>${zi.zona}</b> · CA máx <b>${Number(zi.ca_maximo)}</b>`
        +`${zi.incorporavel?' · <span style="color:#047857">eixo (incorporável)</span>':''}`
        +`${zi.distrito?' · '+zi.distrito:''} <span style="color:#94a3b8">(${_avPino.lat.toFixed(5)}, ${_avPino.lng.toFixed(5)})</span>`;
    }else{
      el.innerHTML=`<span style="color:#b45309">Este ponto está fora da área com zoneamento carregado</span> <span style="color:#94a3b8">(${_avPino.lat.toFixed(5)}, ${_avPino.lng.toFixed(5)})</span>. Confira se o pino caiu no endereço certo (arraste-o se precisar). A avaliação de mercado funciona; só a conta de incorporação fica sem zona.`;
    }
  }catch(e){ el.innerHTML='<span style="color:#b45309">Não consegui confirmar o zoneamento deste ponto.</span>'; }
}

// ═══════════════ CÁLCULO (preço ao vivo + conta no navegador) ═══════════════
async function avalCalcular(opts){
  opts=opts||{}; const recalc=!!opts.recalc && _avForm.cache;
  if(!_avPino){ alert('Confirme o ponto no mapa primeiro.'); return; }
  // no recálculo (exclusão de comparável) o formulário já saiu da tela: lê o que foi digitado antes
  const g=id=>{ const el=document.getElementById(id); return el?el.value:((_avForm.entrada||{})[id]||''); };
  if(!recalc) _avForm.entrada=Object.fromEntries(['av-tipo','av-area','av-dorm','av-suite','av-vaga','av-preco'].map(id=>[id,g(id)]));
  const tipo=g('av-tipo'), area=+g('av-area')||null, terreno=(_avForm.incorp&&_avForm.incorp.terreno)||null;
  const dorm=+g('av-dorm')||null, suite=+g('av-suite')||null, vaga=+g('av-vaga')||null, preco=+g('av-preco')||null;
  const bairro=(_avForm.bairro||'').trim();
  if(!area){ alert('Informe a área útil (ou construída, para casas e comerciais).'); return; }
  if(!bairro){ alert('Informe o bairro (usado para buscar o preço de mercado).'); return; }
  const stt=document.getElementById('av-calc-status')||{ set textContent(v){}, set innerHTML(v){} };
  stt.textContent='Buscando anúncios ao vivo em '+bairro+'…';

  let precos={}, semMotor=false;
  if(recalc){ precos=_avForm.cache.precos; semMotor=!!_avForm.cache.semMotor; }
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
  else { try{ compsItbi=await _avRpc('aval_comps_itbi',{p_bairro:bairro,p_lim:20}); }catch(_){} }
  compsItbi=(compsItbi||[]).filter(c=>_ehCasa(tipo) ? /RESID|CASA|SOBRADO/i.test(c.uso||'') : /APART|CONDOM/i.test(c.uso||''));
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
  if(!recalc) await Promise.all([
    ...amostra.map(async a=>{ if(a.rua){ const g=await geocodar(a.rua+' '+(a.bairro||bairro)); if(g) Object.assign(a,g); } }),
    ...compsItbi.slice(0,12).map(async c=>{ const g=await geocodar(`${c.logradouro||''} ${c.numero||''}`); if(g) Object.assign(c,g); }),
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
    const rs=(compsItbi||[]).map(c=>Number(c.rs_m2)).filter(v=>v>0).sort((a,b)=>a-b);
    if(rs.length){
      const med=rs.length%2?rs[(rs.length-1)/2]:(rs[rs.length/2-1]+rs[rs.length/2])/2;
      precos={rs_apto:Math.round(med), rs_casa:null, n_apto:0, amostra:[], base:'ITBI', n_itbi:rs.length};
      stt.innerHTML='<span style="color:#b45309">Motor de anúncios ao vivo indisponível — usando a mediana de '+rs.length+' fechamentos ITBI de '+bairro+' (preço pago). Modo teste.</span>';
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
  const padrao=(_avForm.incorp&&_avForm.incorp.padrao)||_avPadraoSugerido(bairro);
  const lancInformado=(_avForm.incorp&&_avForm.incorp.lanc)||null;
  const rs_lanc = lancInformado || precos.rs_lanc || (rs_apto ? Math.round(rs_apto*AV_PARAM.lanc_sobre_usado) : null);
  const lancOrigem = lancInformado ? 'informado' : (precos.rs_lanc ? `${precos.n_lanc} lançamentos anunciados` : `usado × ${AV_PARAM.lanc_sobre_usado} (sem lançamento anunciado)`);

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
    area_util:area, terreno, dorm, suite, vaga, preco_pedido:preco,
    zona:geo.zona||null, ca:geo.ca_maximo?Number(geo.ca_maximo):null,
    mercado_rs_m2:rs_tipo||null,
    anuncios_usados: ehcasa ? (precos.n_casa||precos.n_apto||0) : (precos.n_apto||0),
    valor_mercado:null, faixa_min:null, faixa_max:null, metodo:null,
    incorp_aplicavel:false, incorp_area_constr:null, incorp_lancamento_rs_m2:null,
    incorp_vgv:null, incorp_valor_terreno:null, incorp_ganho_pct:null,
    comparaveis: JSON.stringify(amostraTodos.map(a=>({k:a._k,excluido:!!a.excluido,tipo:a.tipo,area:a.area,preco:a.preco,rs_m2:a.rs_m2,dorm:a.dorm,vaga:a.vaga,endereco:[a.rua,a.bairro].filter(Boolean).join(', '),url:a.url,lat:a.lat||null,lng:a.lng||null,origem:a.lancamento?'lançamento':'anúncio'}))
                  .concat(compsItbi.map(c=>({k:c._k,excluido:!!c.excluido,tipo:'Fechamento',area:c.area_constr,area_util_est:Math.round(c.area_util_est||0),preco:c.valor,rs_m2:c.rs_m2,rs_util:c.rs_util,endereco:`${c.logradouro||''}${c.numero?', '+c.numero:''}`,data:c.data,lat:c.lat||null,lng:c.lng||null,origem:'ITBI '+(c.data||'')})))),
    lat:_avPino?_avPino.lat:null, lng:_avPino?_avPino.lng:null,
    entorno: entorno||null,
    memoria: null,
    metodo_unico: null
  };
  dossie.memoria={ metodo_unico: metodoUnico||null, indices:{fonte:AV_INDICES.fonte}, incorp:null, param:{cub_ref:AV_PARAM.cub_ref, calibracao:AV_PARAM.calibracao, obra_sobre_cub:AV_PARAM.obra_sobre_cub, priv_sobre_construida:AV_PARAM.priv_sobre_construida, despesas:AV_PARAM.despesas, projetos_sobre_obra:AV_PARAM.projetos_sobre_obra, comissao:AV_PARAM.comissao, ret:AV_PARAM.ret, financiamento:AV_PARAM.financiamento, margem:AV_PARAM.margem, custo_aquisicao:AV_PARAM.custo_aquisicao} };
  if(/comercial|loja|galp|sala/i.test(tipo) && metodoUnico) metodoUnico.aviso='Imóvel comercial: o valor como imóvel pronto usa referências residenciais do bairro (o coletor ainda não busca anúncios comerciais); trate como ordem de grandeza.';
  if(metodoUnico && metodoUnico.valor_final){
    const mu=metodoUnico;
    dossie.valor_mercado=mu.valor_final; dossie.faixa_min=Math.round(mu.valor_final*0.93); dossie.faixa_max=Math.round(mu.valor_final*1.07);
    dossie.mercado_rs_m2=mu.rs_final;
    dossie.metodo=`${area} m² × R$ ${mu.rs_final.toLocaleString('pt-BR')}/m² = média de [anúncios ${mu.rs_anuncio?mu.rs_anuncio.toLocaleString('pt-BR'):'—'} × ${mu.idx_pedido_fechado} (pedido→fechado, ${mu.idx_origem})`+
      (mu.rs_itbi_ajust?` ; ITBI ${mu.rs_itbi_util.toLocaleString('pt-BR')}/m² útil est. × ${(1+mu.sub_itbi).toFixed(3)} (subdeclaração)`:'')+`]`+(mu.divergencia!=null?` · fontes divergem ${mu.divergencia}%`:'')+(nExcl?` · ${nExcl} comparável(is) excluído(s) pelo corretor`:'')+(precos.base==='ITBI'?' · modo teste (sem anúncios ao vivo)':'');
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
  _avForm.ctx={ehlote, rs_apto, rs_lanc, lancOrigem, preco, bairro, padraoSugerido:_avPadraoSugerido(bairro), lancAuto: precos.rs_lanc||null, lancN: precos.n_lanc||0};
  _avForm.dossie=dossie;
  if(_avForm.incorp && _avForm.podeIncorp) await _avCalcIncorp();   // recálculo (exclusão de comparável) mantém a incorporação já pedida
  renderAvalPreview(_avForm.dossie, precos);
}

// ═══════════════ INCORPORAÇÃO — etapa própria (botão) ═══════════════
function avalAbrirIncorp(){
  const el=document.getElementById('av-incorp-painel'); if(!el) return;
  const c=_avForm.ctx||{}, inc=_avForm.incorp||{};
  const P=AV_PARAM;
  el.style.display='';
  el.innerHTML=`<div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
    <div style="font-weight:600;margin-bottom:4px">🏗️ Avaliação para incorporadora</div>
    <div style="color:#64748b;font-size:.88em;margin-bottom:10px">Conta reversa: do VGV do prédio possível no lote, descontados obra, despesas, margem, outorga e custos de aquisição, sobra o que chega ao proprietário. Premissas calibradas em viabilidades reais da Nova SP Inc (HIS/HMP em eixo). Informe o que souber; o resto o sistema estima e explica.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
      <input id="av-inc-terreno" type="number" value="${inc.terreno||''}" placeholder="Área do terreno (m²) *" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <input id="av-inc-frente" type="number" value="${inc.frente||''}" placeholder="Frente do terreno (m)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <select id="av-inc-padrao" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px" title="Padrão do prédio que seria construído: define o custo de obra (CUB Sinduscon-SP)">
        ${Object.entries(AV_PADROES).map(([k,v])=>`<option value="${k}" ${(inc.padrao||c.padraoSugerido)===k?'selected':''}>Padrão ${v.lb} — obra ≈ ${_avR$(Math.round(v.cub*P.obra_sobre_cub))}/m²</option>`).join('')}</select>
      <input id="av-inc-lanc" type="number" value="${inc.lanc||''}" placeholder="Lançamento R$/m² (auto: ${c.lancAuto?_avR$(c.lancAuto)+' · '+c.lancN+' lançamentos':_avR$(Math.round((c.rs_apto||0)*P.lanc_sobre_usado))+' = usado × '+P.lanc_sobre_usado})" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px" title="Preço por m² das unidades novas que o incorporador venderia. Se souber o lançamento da região, informe; senão o sistema usa os lançamentos anunciados ou o usado × ${P.lanc_sobre_usado}.">
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
  renderAvalPreview(_avForm.dossie, _avForm.cache.precos);
  const alvo=document.getElementById('av-incorp-resultado')||document.getElementById('av-incorp-painel');
  if(alvo) alvo.scrollIntoView({behavior:'smooth',block:'start'});
}
async function _avCalcIncorp(){
  const dossie=_avForm.dossie, inc=_avForm.incorp, c=_avForm.ctx, geo=_avForm.geo||{}, P=AV_PARAM;
  if(!dossie||!inc||!c) return;
  const ca=Number(geo.ca_maximo)||dossie.ca;
  const rs_lanc = inc.lanc || c.lancAuto || (c.rs_apto ? Math.round(c.rs_apto*P.lanc_sobre_usado) : null);
  const lancOrigem = inc.lanc ? 'informado pelo corretor' : (c.lancAuto ? `${c.lancN} lançamentos anunciados` : `usado × ${P.lanc_sobre_usado} (sem lançamento anunciado)`);
  dossie.terreno=terrenoOk(inc.terreno);
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
  const m=_avContaIncorp({terreno:inc.terreno, ca, ca_basico:geo.ca_basico, rs_lanc, padrao:inc.padrao, qvt:null, frente:inc.frente, gabarito:geo.gabarito_m, outorga_ref_m2:refMed, outorga_ref_n:refs.length, fp:fpInfo&&fpInfo.fp, categoria:inc.categoria, fachada_ativa:inc.fachada_ativa, zona:geo.zona});
  m.refs=refs.slice(0,10); m.fpInfo=fpInfo;
  _avForm.memoria=m; _avForm.lancOrigem=lancOrigem; _avForm.incorpMotivo=null;
  dossie.memoria=dossie.memoria||{}; dossie.memoria.incorp={...m, lancOrigem, padraoLb:(AV_PADROES[inc.padrao]||{}).lb, cubRef:(AV_PADROES[inc.padrao]||{}).ref};
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


function renderAvalPreview(x, precos){
  const corpo=document.getElementById('aval-corpo');
  let comps=[]; try{ comps=JSON.parse(x.comparaveis||'[]'); }catch(_){}
  const inc = x.incorp_aplicavel ? `
    <div class="card" id="av-incorp-resultado" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
      <div style="color:#047857;font-weight:600">💡 Potencial de incorporação${(_avForm.memoria&&_avForm.memoria.categoria&&_avForm.memoria.categoria!=='mercado')?` <span style="font-size:.8em;background:#ecfdf5;color:#047857;border-radius:6px;padding:1px 6px">${_avForm.memoria.categoria.toUpperCase()} · outorga ${_avForm.memoria.fs===0?'isenta':'× 0,5'}</span>`:''}${(_avForm.memoria&&_avForm.memoria.fachada_ativa)?` <span style="font-size:.8em;background:#ecfdf5;color:#047857;border-radius:6px;padding:1px 6px">fachada ativa</span>`:''}</div>
      <div style="font-size:1.7em;font-weight:800;color:#047857;margin:4px 0">${_avR$(x.incorp_valor_terreno)}</div>
      <div style="color:#64748b">terreno p/ incorporação${x.incorp_ganho_pct!=null?` — <b style="color:#059669">${x.incorp_ganho_pct>=0?'+':''}${x.incorp_ganho_pct}%</b> vs. ${_avForm.ctx&&_avForm.ctx.preco?'preço pretendido':'valor de mercado'}`:''}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px;font-size:.9em">
        <div><span style="color:#94a3b8">Zona/CA</span><br><b>${x.zona} · CA ${x.ca}</b></div>
        <div><span style="color:#94a3b8">Construível</span><br><b>${x.incorp_area_constr} m²</b></div>
        <div><span style="color:#94a3b8">Lançamento</span><br><b>${_avR$(x.incorp_lancamento_rs_m2)}/m²</b> <small style="color:#94a3b8">${_avForm.lancOrigem||''}</small></div>
        <div><span style="color:#94a3b8">VGV potencial</span><br><b>${_avR$(x.incorp_vgv)}</b></div>
      </div>
      ${_avMemoriaHTML(_avForm.memoria)}</div></div>` : '';
  corpo.innerHTML = `
    <div class="ph" style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-o bsm" onclick="avalNova()">← Refazer</button>
      <div><h1 class="pt">${x.endereco}</h1><div class="pst">${x.tipo} · ${x.bairro}${x.zona?' · '+x.zona:''}</div></div>
    </div>
    ${x.valor_mercado?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em">Valor de mercado</div>
      <div style="font-size:1.8em;font-weight:800;margin:4px 0">${_avR$(x.valor_mercado)}</div>
      <div style="color:#64748b">Faixa: ${_avR$(x.faixa_min)} — ${_avR$(x.faixa_max)}</div>
      <div style="color:#94a3b8;font-size:.88em;margin-top:6px">${x.metodo||''}${x.anuncios_usados?` · ${x.anuncios_usados} anúncios ao vivo`:''}</div>
      ${x.preco_pedido?`<div style="margin-top:8px;font-size:.9em">Pretendido: <b>${_avR$(x.preco_pedido)}</b> ${_avCompara(x.preco_pedido,x.valor_mercado)}</div>`:''}
    </div></div>`:`<div class="card" style="margin-bottom:12px"><div class="cb" style="color:#b45309">Sem preço de mercado (faltou área útil ou anúncios do bairro).</div></div>`}
    ${_avMetodoHTML(_avForm.metodoUnico, x)}
    ${_avEntornoHTML(x.entorno||_avForm.entorno)}
    ${(_avForm.ctx&&_avForm.ctx.ehlote)?(_avForm.podeIncorp
        ?`<div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn ${x.incorp_aplicavel?'btn-o':'btn-p'}" onclick="avalAbrirIncorp()">🏗️ ${x.incorp_aplicavel?'Ajustar premissas da incorporação':'Avaliar para incorporadora'}</button>
            <span style="color:#64748b;font-size:.88em">Zona ${x.zona||''} permite adensar (CA ${x.ca}). Calcula quanto um incorporador pagaria pelo terreno.</span></div></div>`
        :`<div class="card" style="margin-bottom:12px;border-left:3px solid #cbd5e1"><div class="cb" style="color:#64748b;font-size:.9em">🏗️ Terreno para incorporação: ${_avForm.incorpMotivo||'não se aplica'}</div></div>`):''}
    <div id="av-incorp-painel" style="display:none"></div>
    ${comps.some(c=>c.lat)?`<div class="card" style="margin-bottom:12px"><div class="cb"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Mapa: imóvel, anúncios e fechamentos</div><div id="av-mapa-comps" style="height:320px;border-radius:10px;border:1px solid #e2e8f0"></div><div style="font-size:.8em;color:#94a3b8;margin-top:4px">Pino vermelho = imóvel avaliado · azul = anúncios ao vivo · verde = fechamentos ITBI. Anúncio marcado na rua (sem número).</div></div></div>`:''}
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
          : `Outorga onerosa (fórmula PDE): ${n(m.area_adicional)} m² adicionais × (terreno/computável) × V ${_avR$(Math.round(m.v))}/m² (${m.v_origem}) × Fs ${P.outorga_fs} × Fp ${m.fp}`, m.outorga, true):''}
      ${m.custos_aquisicao?l(`Custos de aquisição do terreno (ITBI, comissão, jurídico, demolição, IPTU) ≈ ${P.custo_aquisicao*100}%`, m.custos_aquisicao, true):''}
      <tr style="border-top:2px solid #10b981;font-weight:700"><td style="padding:4px 8px">Terreno máximo (o que chega ao proprietário)${m.terreno_vgv?` <small style="font-weight:400;color:#64748b">· ${(m.terreno_vgv*100).toFixed(1)}% do VGV</small>`:''}</td><td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(Math.round(m.terreno_max))}</td></tr>
    </tbody></table>
    ${alertas}
    ${(m.base_legal||[]).length?`<div style="margin-top:10px;padding:8px 10px;background:#f0fdf4;border-radius:8px;font-size:.85em"><div style="font-weight:600;color:#047857;margin-bottom:4px">Por que a área vendável é ${m.ca>(m.ca_zona||m.ca)?'maior que terreno × CA da zona':'essa'}</div><ul style="margin:0;padding-left:18px;color:#334155">${m.base_legal.map(b=>`<li style="margin:2px 0">${b}</li>`).join('')}</ul></div>`:''}
    ${m.fpInfo?`<div style="font-size:.84em;color:#64748b;margin-top:8px">Fator de planejamento (Quadro 6 do PDE) no ponto: <b>${m.fpInfo.fp_texto||m.fpInfo.fp||'—'}</b> · ${m.fpInfo.macroarea||''}${m.fpInfo.setor?' · '+m.fpInfo.setor:''}</div>`:''}
    ${(m.refs||[]).length?`<div style="font-size:.84em;margin-top:8px"><div style="color:#64748b;margin-bottom:4px">Outorgas concedidas perto (GeoSampa) — contrapartida paga por m² excedente:</div>
      <table style="width:100%;border-collapse:collapse;font-size:.92em"><thead><tr style="text-align:left;color:#94a3b8"><th style="padding:2px 6px">Endereço</th><th style="padding:2px 6px;text-align:right">Dist.</th><th style="padding:2px 6px;text-align:right">Terreno</th><th style="padding:2px 6px;text-align:right">Excedente</th><th style="padding:2px 6px;text-align:right">R$/m²</th><th style="padding:2px 6px">Situação</th></tr></thead>
      <tbody>${m.refs.map(r=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:2px 6px">${r.endereco||''}</td><td style="padding:2px 6px;text-align:right">${r.dist_m} m</td><td style="padding:2px 6px;text-align:right">${n(r.area_terreno||0)} m²</td><td style="padding:2px 6px;text-align:right">${n(r.area_excedente||0)} m²</td><td style="padding:2px 6px;text-align:right">${_avR$(Math.round(r.ct_m2))}</td><td style="padding:2px 6px">${r.situacao||''}</td></tr>`).join('')}</tbody></table></div>`:''}
    <div style="color:#94a3b8;font-size:.8em;margin-top:6px">CUB ${P.cub_ref}. Outorga: referência das concessões vizinhas (GeoSampa, 01/10/2026) ou fórmula do PDE (Lei 16.050/2014, art. 117) quando o QVT é informado. ${P.calibracao}. Parâmetros padrão da NSP em AV_PARAM.</div></details>`;
}
// Reconstrói a memória de uma avaliação salva (padrão vem do texto do método; sem ele, médio)
function _avMemoriaSalva(x){
  if(!x||!x.incorp_aplicavel||!x.terreno||!x.ca||!x.incorp_lancamento_rs_m2) return null;
  let extra={}; try{ const mj=/\[incorp:(\{.*?\})\]/.exec(x.metodo||''); if(mj) extra=JSON.parse(mj[1]); }catch(_){}
  const mp=/padrão (economico|medio|alto)/.exec(x.metodo||''); const padrao=extra.padrao||(mp?mp[1]:'medio');
  return _avContaIncorp({terreno:Number(x.terreno), ca:Number(x.ca), ca_basico:extra.cab, rs_lanc:Number(x.incorp_lancamento_rs_m2), padrao, qvt:extra.qvt, frente:extra.frente, gabarito:extra.gab, outorga_ref_m2:extra.oref, outorga_ref_n:extra.on||0, fp:extra.fp, categoria:extra.cat||'mercado', fachada_ativa:!!extra.fa, zona:x.zona});
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
function _avCompsTabela(comps){
  return `<table style="width:100%;border-collapse:collapse;font-size:.86em"><thead><tr style="text-align:left;color:#94a3b8">
      <th style="padding:4px 8px">Origem</th><th style="padding:4px 8px">Endereço</th><th style="padding:4px 8px;text-align:right">Área</th>
      <th style="padding:4px 8px;text-align:right">Preço</th><th style="padding:4px 8px;text-align:right">R$/m²</th>${(_avForm&&_avForm.cache)?'<th></th>':''}</tr></thead>
    <tbody>${comps.slice(0,24).map(c=>{ const itbi=/ITBI|Fechamento/i.test(c.origem||c.tipo||''); const podeExcluir=!!(_avForm&&_avForm.cache&&c.k);
      return `<tr style="border-top:1px solid #f1f5f9${c.excluido?';opacity:.45;text-decoration:line-through':''}">
        <td style="padding:4px 8px;white-space:nowrap">${itbi?'<span style="color:#047857">●</span> ':'<span style="color:#2563eb">●</span> '}${c.origem||c.tipo||'—'}</td>
        <td style="padding:4px 8px">${c.url?`<a href="${c.url}" target="_blank" style="color:#2563eb">${c.endereco||'anúncio'}</a>`:(c.endereco||'—')}${c.dorm?` <small style="color:#94a3b8">${c.dorm} dorm${c.vaga?' · '+c.vaga+' vg':''}</small>`:''}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${c.area?Math.round(c.area)+' m²':'—'}${itbi&&c.area_util_est?`<br><small style="color:#94a3b8">≈ ${c.area_util_est} m² útil</small>`:''}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(c.preco)}</td>
        <td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(c.rs_m2)}${itbi&&c.rs_util?`<br><small style="color:#94a3b8">${_avR$(c.rs_util)} útil</small>`:''}</td>
        ${podeExcluir?`<td style="padding:4px 4px;text-align:right;white-space:nowrap"><button class="btn btn-o bsm" style="text-decoration:none" title="${c.excluido?'Voltar a usar este comparável':'Excluir este comparável da conta (destoante)'}" onclick="_avExcluir('${String(c.k).replace(/'/g,'')}')">${c.excluido?'↩︎ incluir':'✕ excluir'}</button></td>`:''}</tr>`; }).join('')}</tbody></table>
    <div style="font-size:.8em;color:#94a3b8;margin-top:6px">ITBI: área do cadastro (IPTU); área útil estimada por (cadastro − ${AV_INDICES.iptu_por_vaga} m²) ÷ ${AV_INDICES.iptu_por_util} (casas: construída ≈ útil). Anúncio: área útil anunciada.</div>`;
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
  const pts=comps.filter(c=>c.lat&&c.lng);
  const c0=centro||(pts.length?{lat:pts[0].lat,lng:pts[0].lng}:null); if(!c0) return;
  const map=L.map(el).setView([c0.lat,c0.lng],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const b=[];
  if(centro){ L.marker([centro.lat,centro.lng]).addTo(map).bindPopup('Imóvel avaliado'); b.push([centro.lat,centro.lng]); }
  pts.forEach(c=>{ const itbi=/ITBI|Fechamento/i.test(c.origem||''); L.circleMarker([c.lat,c.lng],{radius:7,color:itbi?'#047857':'#2563eb',fillColor:itbi?'#34d399':'#60a5fa',fillOpacity:.8,weight:2}).addTo(map)
      .bindPopup(`<b>${c.origem||''}</b><br>${c.endereco||''}<br>${c.area?Math.round(c.area)+' m² · ':''}${_avR$(c.preco)} · ${_avR$(c.rs_m2)}/m²${c.url?`<br><a href="${c.url}" target="_blank">abrir anúncio</a>`:''}`); b.push([c.lat,c.lng]); });
  if(b.length>1) map.fitBounds(b,{padding:[20,20]});
  setTimeout(()=>map.invalidateSize(),200);
}
function _avCompara(pedido,mercado){
  const p=Number(pedido),m=Number(mercado); if(!p||!m) return '';
  const d=Math.round((p/m-1)*100);
  if(Math.abs(d)<3) return '<span style="color:#64748b">(alinhado ao mercado)</span>';
  return d>0?`<span style="color:#dc2626">(${d}% acima do mercado)</span>`:`<span style="color:#059669">(${-d}% abaixo do mercado)</span>`;
}

async function avalSalvar(){
  const d=_avForm.dossie; if(!d){ alert('Gere a avaliação antes.'); return; }
  try{
    d.corretor_nome=(typeof CUR!=='undefined'&&CUR)?CUR.nome:null;
    try{ const u=await db.get('usuarios',`?select=creci&id=eq.${CUR.id}`); d.corretor_creci=(u&&u[0]&&u[0].creci)||null; }catch(_){ d.corretor_creci=null; }
    d.status='aprovada'; d.aprovado_por=d.corretor_nome; d.aprovado_em=new Date().toISOString();   // revisão = o preview; salvar já libera o dossiê
    const rows=await db.post('aval_resultado', d);
    const novo=Array.isArray(rows)?rows[0]:rows;
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
      <div style="color:#64748b">${x.zona} · CA ${x.ca} · construível ${x.incorp_area_constr} m² · lançamento ${_avR$(x.incorp_lancamento_rs_m2)}/m² · VGV ${_avR$(x.incorp_vgv)}${x.incorp_ganho_pct!=null?` · <b style="color:#059669">+${Math.round(x.incorp_ganho_pct)}%</b>`:''}</div>
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
      <button class="btn btn-o bsm" onclick="carregarAvalImoveis()">← Voltar</button>
      <div><h1 class="pt">${x.endereco||x.codigo}</h1>
        <div class="pst">${x.tipo||''} · ${x.bairro||''}
          <span style="background:${st.bg};color:${st.cor};padding:1px 8px;border-radius:999px;font-size:.85em;font-weight:600;margin-left:6px">${st.lb}</span></div></div>
    </div>
    ${_avEntornoHTML(x.entorno)}
    ${x.valor_mercado?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase">Valor de mercado</div>
      <div style="font-size:1.8em;font-weight:800;margin:4px 0">${_avR$(x.valor_mercado)}</div>
      <div style="color:#64748b">Faixa: ${_avR$(x.faixa_min)} — ${_avR$(x.faixa_max)}</div>
      <div style="color:#94a3b8;font-size:.88em;margin-top:6px">${x.metodo||''}</div>
      ${x.preco_pedido?`<div style="margin-top:8px;font-size:.9em">Pretendido: <b>${_avR$(x.preco_pedido)}</b> ${_avCompara(x.preco_pedido,x.valor_mercado)}</div>`:''}
    </div></div>`:''}
    ${inc}
    ${comps.some(c=>c.lat)?`<div class="card" style="margin-bottom:12px"><div class="cb"><div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Mapa: imóvel, anúncios e fechamentos</div><div id="av-mapa-comps" style="height:320px;border-radius:10px;border:1px solid #e2e8f0"></div><div style="font-size:.8em;color:#94a3b8;margin-top:4px">Pino vermelho = imóvel avaliado · azul = anúncios · verde = fechamentos ITBI.</div></div></div>`:''}
    ${comps.length?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;margin-bottom:6px">Comparáveis</div>
      ${_avCompsTabela(comps)}
    </div></div>`:''}
    ${acoes}`;
  (async()=>{ let centro=null; try{ const r=await _avRpc('aval_geocode',{p_q:(x.endereco||'')+' '+(x.bairro||'')}); const h=Array.isArray(r)?r[0]:null; if(h) centro={lat:h.lat,lng:h.lng}; }catch(_){} _avDesenharMapaComps(comps, centro); })();
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

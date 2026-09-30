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
const AV_TIPOS = ['Apartamento','Studio','Cobertura','Casa térrea','Sobrado','Casa de vila','Casa em condomínio','Terreno','Comercial'];

// ── Padrão construtivo → custo de obra (CUB/m² Sinduscon-SP, jul/2026, com oneração) ──
// CUB não inclui fundações especiais, projetos, elevadores, ligações e taxas: custo total ≈ CUB × FATOR_OBRA.
// Fonte: Sinduscon-SP, tabela de julho/2026 (R8 = residencial 8 pavimentos; B/N/A = baixo/normal/alto).
const AV_PADROES = {
  economico: { lb:'Econômico / MCMV', cub:1945.55, ref:'R8-B' },
  medio:     { lb:'Médio',            cub:2231.37, ref:'R8-N' },
  alto:      { lb:'Alto',             cub:2618.33, ref:'R8-A' },
};
// Parâmetros padrão da conta reversa (método involutivo). Editáveis aqui; o corretor não mexe.
const AV_PARAM = {
  cub_ref:'Sinduscon-SP jul/2026',
  fator_obra:1.30,      // custo total de obra sobre o CUB (fundação, projetos, elevadores, ligações, taxas)
  eficiencia:0.80,      // área vendável / área computável
  comissao:0.05,        // corretagem sobre o VGV            (Rodrigo, 01/10/2026)
  marketing:0.05,       // publicidade e estande              (Rodrigo, 01/10/2026)
  ret:0.04,             // RET (tributos da incorporação)     (Rodrigo, 01/10/2026)
  adm:0.10,             // despesas administrativas           (Rodrigo, 01/10/2026)
  margem:0.15,          // margem do incorporador             (Rodrigo, 01/10/2026)
  lanc_sobre_usado:1.25,// se não houver lançamento anunciado no bairro: lançamento ≈ usado × 1,25
  casa_sobre_apto:0.60, // se não houver casa anunciada no bairro: R$/m² casa ≈ apto × 0,60 (mediana observada 30/09/2026)
  constr_sobre_computavel:1.40, // área construída real ≈ computável × 1,40 (subsolo/garagem, áreas técnicas e comuns não computam)
  // Outorga onerosa (PDE, Lei 16.050/2014, art. 117): Ct = (At/Ac) × V × Fs × Fp por m² adicional acima do CA básico.
  // V = valor do m² do terreno no Cadastro de Valor de Terreno (QVT) da quadra; Fs = 1,0 (habitação de mercado);
  // Fp = fator de planejamento da macroárea (Quadro do PDE, varia por região) — conferir para o endereço.
  outorga_fs:1.0,
  outorga_fp:1.0,
  qvt_sobre_mercado:0.50, // sem QVT informado: V ≈ 50% do valor de mercado do terreno (o cadastro fica bem abaixo do mercado)
  lote_min_m2:400,        // abaixo disso, alerta: CA máximo dificilmente é atingido
  frente_min_m:12,        // idem para frente estreita
  cota_solidariedade_m2:20000, // acima disso, PDE exige 10% em HIS ou equivalente
};
// Bairros onde o padrão sugerido é ALTO (o corretor pode trocar na tela)
const AV_BAIRROS_ALTO = ['moema','itaim','vila nova conceicao','brooklin','campo belo','jardim paulista','jardins','paraiso','vila olimpia','ibirapuera','chacara klabin','vila mariana','pinheiros','perdizes'];
const _avNormBairro = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function _avPadraoSugerido(bairro){ const b=_avNormBairro(bairro); return AV_BAIRROS_ALTO.some(x=>b.includes(x)) ? 'alto' : 'medio'; }
// Conta reversa de incorporação: quanto o terreno pode valer para o empreendimento fechar com margem.
function _avContaIncorp({terreno, ca, ca_basico, rs_lanc, padrao, qvt, frente, gabarito, outorga_ref_m2, outorga_ref_n, fp}){
  const p=AV_PADROES[padrao]||AV_PADROES.medio, P=AV_PARAM;
  const cab = (ca_basico!=null && ca_basico>0) ? Number(ca_basico) : null;
  const area_comput=terreno*ca;                       // o que conta no CA
  const area_constr=area_comput*P.constr_sobre_computavel;   // o que se constrói de fato (obra)
  const area_vendavel=area_comput*P.eficiencia;       // área privativa vendida
  const vgv=area_vendavel*rs_lanc;
  const obra=area_constr*p.cub*P.fator_obra;
  const indiretos=vgv*(P.comissao+P.marketing+P.ret+P.adm);
  const margem=vgv*P.margem;
  const antes=vgv-obra-indiretos-margem;              // terreno máximo SEM outorga
  // outorga onerosa sobre a área computável acima do CA básico
  let outorga=0, area_adicional=0, v=null, v_origem='', outorga_modo='';
  const fpUsado = (fp!=null && fp>0) ? Number(fp) : P.outorga_fp;
  if(cab!=null && ca>cab){
    area_adicional=terreno*(ca-cab);
    if(qvt && qvt>0){
      // fórmula do PDE com o valor de terreno informado
      v=qvt; v_origem='QVT informado'; outorga_modo='formula';
      outorga=area_adicional*(terreno/area_comput)*v*P.outorga_fs*fpUsado;
    }else if(outorga_ref_m2 && outorga_ref_n>=5){
      // referência EMPÍRICA: o que a prefeitura cobrou por m² excedente nos processos vizinhos (GeoSampa)
      v=outorga_ref_m2; v_origem=`mediana de ${outorga_ref_n} outorgas concedidas num raio de 1,5 km (GeoSampa)`; outorga_modo='referencia';
      outorga=area_adicional*outorga_ref_m2;
    }else if(antes>0){
      v=(antes/terreno)*P.qvt_sobre_mercado; v_origem=`estimado: ${P.qvt_sobre_mercado*100}% do valor de mercado do terreno`; outorga_modo='formula';
      outorga=area_adicional*(terreno/area_comput)*v*P.outorga_fs*fpUsado;
    }
  }
  const terreno_max=antes-outorga;
  const alertas=[];
  if(terreno<P.lote_min_m2) alertas.push(`Lote de ${terreno} m²: abaixo de ${P.lote_min_m2} m² o CA máximo raramente é atingido (recuos e taxa de ocupação).`);
  if(frente && frente<P.frente_min_m) alertas.push(`Frente de ${frente} m: abaixo de ${P.frente_min_m} m a implantação de torre fica comprometida.`);
  if(gabarito && String(gabarito).trim() && !/sem|n[aã]o/i.test(String(gabarito))) alertas.push(`Gabarito de altura na zona: ${gabarito} — pode limitar o número de pavimentos antes do CA.`);
  if(area_comput>P.cota_solidariedade_m2) alertas.push(`Área computável acima de ${P.cota_solidariedade_m2.toLocaleString('pt-BR')} m²: PDE exige cota de solidariedade (10% em HIS ou equivalente).`);
  if(cab==null) alertas.push('CA básico não identificado na zona: outorga onerosa não calculada.');
  if(terreno_max<=0) alertas.push('Conta fechou negativa: neste padrão e preço de lançamento, a incorporação não paga o terreno.');
  return {padrao, cub:p.cub, custo_m2:p.cub*P.fator_obra, ca, ca_basico:cab, terreno, frente:frente||null, gabarito:gabarito||null,
          area_comput, area_constr, area_vendavel, vgv, obra, indiretos, margem, antes, area_adicional, v, v_origem, outorga, outorga_modo, fp:fpUsado, terreno_max, alertas};
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
async function carregarAvalImoveis(){
  const root = document.getElementById('aval-imoveis-root');
  if(!root) return;
  root.innerHTML = `
    <div class="ph" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h1 class="pt">Avaliação de Imóveis</h1>
        <div class="pst">Digite o endereço e gere a avaliação — antes mesmo de cadastrar o imóvel.</div></div>
      <button class="btn btn-p" onclick="avalNova()">＋ Nova avaliação</button>
    </div>
    <div id="aval-corpo"><div class="card"><div class="cb">Carregando avaliações salvas…</div></div></div>`;
  // acorda o motor (Render free hiberna) enquanto a lista carrega — sem esperar a resposta
  try{ fetch(`${AVAL_MOTOR}/health`,{mode:'cors'}).catch(()=>{}); }catch(_){}
  try{
    const q='?select=id,codigo,fonte,tipo,bairro,endereco,area_util,terreno,preco_pedido,'
      +'valor_mercado,zona,ca,incorp_aplicavel,incorp_valor_terreno,incorp_ganho_pct,'
      +'status,aprovado_por,token,gerado_em,comparaveis,faixa_min,faixa_max,mercado_rs_m2,'
      +'anuncios_usados,metodo,incorp_area_constr,incorp_lancamento_rs_m2,incorp_vgv,edificio,dorm,suite,vaga,observacao'
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
        <input id="av-area" type="number" placeholder="Área útil (m²)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-terreno" type="number" placeholder="Terreno (m²) — casas" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-dorm" type="number" placeholder="Dorm." style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-suite" type="number" placeholder="Suítes" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-vaga" type="number" placeholder="Vagas" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <select id="av-padrao" title="Padrão construtivo do que seria construído no terreno (custo de obra pelo CUB Sinduscon-SP)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
          ${Object.entries(AV_PADROES).map(([k,v])=>`<option value="${k}">Padrão ${v.lb} — obra ≈ ${_avR$(Math.round(v.cub*AV_PARAM.fator_obra))}/m²</option>`).join('')}</select>
        <input id="av-lanc" type="number" placeholder="Lançamento R$/m² no bairro (opcional — senão usa anúncios)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-frente" type="number" placeholder="Frente do terreno (m) — casas/terrenos" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
        <input id="av-qvt" type="number" placeholder="Valor de terreno da quadra R$/m² (QVT, opcional — p/ outorga)" style="padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      </div>
      <div style="color:#94a3b8;font-size:.82em;margin-top:4px">Padrão e lançamento só entram na conta de incorporação (casas, sobrados e terrenos em zona que permite adensar). Custo de obra = CUB ${AV_PARAM.cub_ref} × ${AV_PARAM.fator_obra}.</div>
      <input id="av-preco" type="number" placeholder="Preço que o proprietário pensa em pedir (opcional)" style="margin-top:8px;width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:8px">
      <button class="btn btn-p" style="margin-top:12px" onclick="avalCalcular()">⚙️ Gerar avaliação</button>
      <div id="av-calc-status" style="margin-top:8px;color:#64748b;font-size:.9em"></div>
    </div></div>

    <div style="margin-top:8px"><button class="btn btn-o bsm" onclick="carregarAvalImoveis()">← Voltar à lista</button></div>`;
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
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br'
        +'&street='+encodeURIComponent(`${num} ${rua}`)+'&city=S%C3%A3o%20Paulo';
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
  const sel=document.getElementById('av-padrao'); if(sel && !sel.dataset.tocado){ sel.value=_avPadraoSugerido(_avForm.bairro||document.getElementById('av-bairro')?.value); sel.onchange=()=>{ sel.dataset.tocado='1'; }; }
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
      el.innerHTML=`<span style="color:#b45309">Ponto fora das camadas de zoneamento carregadas.</span> <span style="color:#94a3b8">(${_avPino.lat.toFixed(5)}, ${_avPino.lng.toFixed(5)})</span>`;
    }
  }catch(e){ el.innerHTML='<span style="color:#b45309">Não consegui confirmar o zoneamento deste ponto.</span>'; }
}

// ═══════════════ CÁLCULO (preço ao vivo + conta no navegador) ═══════════════
async function avalCalcular(){
  if(!_avPino){ alert('Confirme o ponto no mapa primeiro.'); return; }
  const g=id=>document.getElementById(id).value;
  const tipo=g('av-tipo'), area=+g('av-area')||null, terreno=+g('av-terreno')||null;
  const dorm=+g('av-dorm')||null, suite=+g('av-suite')||null, vaga=+g('av-vaga')||null, preco=+g('av-preco')||null;
  const bairro=(_avForm.bairro||'').trim();
  if(!area && !terreno){ alert('Informe a área útil (ou o terreno, para casa).'); return; }
  if(!bairro){ alert('Informe o bairro (usado para buscar o preço de mercado).'); return; }
  const stt=document.getElementById('av-calc-status');
  stt.textContent='Buscando anúncios ao vivo em '+bairro+'…';

  let precos={}, semMotor=false;
  try{
    const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
    const timer=ctrl?setTimeout(()=>ctrl.abort(),45000):null;   // Render free acorda em 30-60 s
    const r=await fetch(`${AVAL_MOTOR}/precos?bairro=`+encodeURIComponent(bairro),Object.assign({headers:hdr()},ctrl?{signal:ctrl.signal}:{}));
    if(timer) clearTimeout(timer);
    if(!r.ok) throw new Error('motor HTTP '+r.status);
    precos=await r.json();
  }catch(e){ semMotor=true; }

  // comparáveis de fechamento (ITBI) — do banco, via RPC
  let compsItbi=[];
  try{ compsItbi=await _avRpc('aval_comps_itbi',{p_bairro:bairro,p_lim:semMotor?20:8}); }catch(_){}

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
  const ehcasa=_ehCasa(tipo), ehterreno=/terreno/i.test(tipo);
  const rs_apto=precos.rs_apto;
  const rs_casa=precos.rs_casa || (rs_apto ? Math.round(rs_apto*AV_PARAM.casa_sobre_apto) : null);
  const casaEstimada=!precos.rs_casa && !!rs_casa;
  const rs_tipo = ehcasa ? rs_casa : (ehterreno ? null : rs_apto);
  const geo=_avForm.geo||{};
  const padrao=g('av-padrao')||_avPadraoSugerido(bairro);
  const lancInformado=+g('av-lanc')||null;
  const rs_lanc = lancInformado || precos.rs_lanc || (rs_apto ? Math.round(rs_apto*AV_PARAM.lanc_sobre_usado) : null);
  const lancOrigem = lancInformado ? 'informado' : (precos.rs_lanc ? `${precos.n_lanc} lançamentos anunciados` : `usado × ${AV_PARAM.lanc_sobre_usado} (sem lançamento anunciado)`);

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
    comparaveis: JSON.stringify(((precos.amostra||[]).map(a=>({...a,origem:'anúncio'})))
                  .concat((compsItbi||[]).map(c=>({tipo:'Fechamento',area:c.area_constr,preco:c.valor,rs_m2:c.rs_m2,origem:'ITBI '+(c.data||'')}))))
  };
  if(rs_tipo && area){
    const vm=area*rs_tipo;
    dossie.valor_mercado=Math.round(vm); dossie.faixa_min=Math.round(vm*0.9); dossie.faixa_max=Math.round(vm*1.1);
    const rsf=rs_tipo.toLocaleString('pt-BR');
    dossie.metodo=`${area} m² × R$ ${rsf}/m² (${precos.base==='ITBI'?`mediana de ${precos.n_itbi} fechamentos ITBI em ${bairro} — modo teste`:(ehcasa?(casaEstimada?`casas: estimado como apto × ${AV_PARAM.casa_sobre_apto}, sem casa anunciada em ${bairro}`:`${precos.n_casa} casas anunciadas em ${bairro}`):`anúncios ${bairro}`)})`;
  }
  // ── Incorporação (conta reversa): casas, sobrados e terrenos em zona que permite adensar ──
  const ca=dossie.ca;
  if((ehcasa||ehterreno) && geo.incorporavel && ca && ca>=2 && terreno && rs_lanc){
    const frente=+g('av-frente')||null, qvt=+g('av-qvt')||null;
    // referências de outorga concedida (GeoSampa) e fator de planejamento pelo ponto
    let refs=[], refMed=null, fpInfo=null;
    try{ refs=await _avRpc('aval_outorga_ref',{p_lat:_avPino.lat,p_lng:_avPino.lng,p_raio_m:1500,p_lim:30})||[]; }catch(_){}
    if(refs.length){ const v=refs.map(r=>Number(r.ct_m2)).sort((a,b)=>a-b); refMed=v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2; }
    try{ const f=await _avRpc('aval_fp',{p_lat:_avPino.lat,p_lng:_avPino.lng}); fpInfo=Array.isArray(f)?f[0]:f; }catch(_){}
    const m=_avContaIncorp({terreno, ca, ca_basico:geo.ca_basico, rs_lanc, padrao, qvt, frente, gabarito:geo.gabarito_m, outorga_ref_m2:refMed, outorga_ref_n:refs.length, fp:fpInfo&&fpInfo.fp});
    m.refs=refs.slice(0,10); m.fpInfo=fpInfo;
    _avForm.memoria=m; _avForm.lancOrigem=lancOrigem;
    if(m.terreno_max>0){
      dossie.incorp_aplicavel=true;
      dossie.incorp_area_constr=Math.round(m.area_constr);
      dossie.incorp_lancamento_rs_m2=Math.round(rs_lanc);
      dossie.incorp_vgv=Math.round(m.vgv);
      dossie.incorp_valor_terreno=Math.round(m.terreno_max);
      const base = preco || dossie.valor_mercado;
      dossie.incorp_ganho_pct = base ? Math.round((m.terreno_max/base-1)*100) : null;
      dossie.metodo=(dossie.metodo?dossie.metodo+' · ':'')+`incorporação: padrão ${padrao}, lançamento ${lancOrigem}`+
        (m.outorga?`, outorga ${_avR$(Math.round(m.outorga))} (${m.v_origem})`:'')+
        ` [incorp:${JSON.stringify({padrao, cab:m.ca_basico, qvt:qvt||null, frente:frente||null, gab:m.gabarito||null, oref:refMed?Math.round(refMed):null, on:refs.length, fp:m.fp})}]`;
    }else{
      dossie.metodo=(dossie.metodo?dossie.metodo+' · ':'')+`incorporação inviável no padrão ${padrao} (terreno máximo ≤ 0)`;
    }
  }
  _avForm.dossie=dossie;
  renderAvalPreview(dossie, precos);
}

function renderAvalPreview(x, precos){
  const corpo=document.getElementById('aval-corpo');
  let comps=[]; try{ comps=JSON.parse(x.comparaveis||'[]'); }catch(_){}
  const inc = x.incorp_aplicavel ? `
    <div class="card" style="margin-bottom:12px;border-left:3px solid #10b981"><div class="cb">
      <div style="color:#047857;font-weight:600">💡 Potencial de incorporação</div>
      <div style="font-size:1.7em;font-weight:800;color:#047857;margin:4px 0">${_avR$(x.incorp_valor_terreno)}</div>
      <div style="color:#64748b">terreno p/ incorporação${x.incorp_ganho_pct!=null?` — <b style="color:#059669">+${x.incorp_ganho_pct}%</b> vs. preço pretendido`:''}</div>
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
    ${inc}
    ${comps.length?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Comparáveis</div>
      <table style="width:100%;border-collapse:collapse;font-size:.86em"><thead><tr style="text-align:left;color:#94a3b8">
        <th style="padding:4px 8px">Origem</th><th style="padding:4px 8px;text-align:right">Área</th>
        <th style="padding:4px 8px;text-align:right">Preço</th><th style="padding:4px 8px;text-align:right">R$/m²</th></tr></thead>
      <tbody>${comps.slice(0,12).map(c=>`<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:4px 8px">${c.origem||c.tipo||'—'}</td>
        <td style="padding:4px 8px;text-align:right">${c.area?Math.round(c.area)+' m²':'—'}</td>
        <td style="padding:4px 8px;text-align:right">${_avR$(c.preco)}</td>
        <td style="padding:4px 8px;text-align:right">${_avR$(c.rs_m2)}</td></tr>`).join('')}</tbody></table>
    </div></div>`:''}
    <div class="card"><div class="cb" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-p" onclick="avalSalvar()">💾 Salvar avaliação</button>
      <span style="color:#94a3b8;font-size:.88em">Depois de salvar você revisa, aprova e gera o link pro proprietário.</span>
    </div></div>`;
}
// Memória da conta reversa. Recebe o objeto de _avContaIncorp ou reconstrói a partir da avaliação salva.
function _avMemoriaHTML(m){
  if(!m) return '';
  const P=AV_PARAM, p=AV_PADROES[m.padrao]||AV_PADROES.medio;
  const l=(r,v,neg)=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:3px 8px;color:#64748b">${r}</td><td style="padding:3px 8px;text-align:right;white-space:nowrap;${neg?'color:#b91c1c':''}">${neg?'− ':''}${_avR$(Math.round(v))}</td></tr>`;
  const n=v=>Math.round(v).toLocaleString('pt-BR');
  const areas=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:.86em;margin-top:6px">
      <div><span style="color:#94a3b8">Terreno</span><br><b>${n(m.terreno)} m²</b>${m.frente?` · frente ${m.frente} m`:''}</div>
      <div><span style="color:#94a3b8">CA básico / máximo</span><br><b>${m.ca_basico!=null?m.ca_basico:'?'} / ${m.ca}</b></div>
      <div><span style="color:#94a3b8">Área computável</span><br><b>${n(m.area_comput)} m²</b> <small>(terreno × CA)</small></div>
      <div><span style="color:#94a3b8">Área construída estimada</span><br><b>${n(m.area_constr)} m²</b> <small>(× ${P.constr_sobre_computavel}: subsolo, técnicas, comuns)</small></div>
      <div><span style="color:#94a3b8">Área vendável (privativa)</span><br><b>${n(m.area_vendavel)} m²</b> <small>(${P.eficiencia*100}% da computável)</small></div>
      <div><span style="color:#94a3b8">Acima do CA básico</span><br><b>${n(m.area_adicional)} m²</b> <small>(paga outorga)</small></div>
    </div>`;
  const alertas=(m.alertas||[]).length?`<ul style="margin:8px 0 0;padding-left:18px;font-size:.84em;color:#b45309">${m.alertas.map(a=>`<li>${a}</li>`).join('')}</ul>`:'';
  return `<details open style="margin-top:10px"><summary style="cursor:pointer;color:#047857;font-size:.9em">Memória de cálculo (conta reversa)</summary>
    ${areas}
    <table style="width:100%;border-collapse:collapse;font-size:.86em;margin-top:8px"><tbody>
      ${l(`VGV: ${n(m.area_vendavel)} m² vendáveis × lançamento ${_avR$(Math.round(m.vgv/m.area_vendavel))}/m²`, m.vgv)}
      ${l(`Obra: ${n(m.area_constr)} m² construídos × CUB ${p.ref} ${_avR$(p.cub)} × ${P.fator_obra} (padrão ${p.lb})`, m.obra, true)}
      ${l(`Comissão ${P.comissao*100}% + marketing ${P.marketing*100}% + RET ${P.ret*100}% + adm. ${P.adm*100}%`, m.indiretos, true)}
      ${l(`Margem do incorporador ${P.margem*100}%`, m.margem, true)}
      ${l(`Terreno máximo antes da outorga`, m.antes)}
      ${m.outorga?l(m.outorga_modo==='referencia'
          ? `Outorga onerosa: ${n(m.area_adicional)} m² adicionais × ${_avR$(Math.round(m.v))}/m² (${m.v_origem})`
          : `Outorga onerosa (fórmula PDE): ${n(m.area_adicional)} m² adicionais × (terreno/computável) × V ${_avR$(Math.round(m.v))}/m² (${m.v_origem}) × Fs ${P.outorga_fs} × Fp ${m.fp}`, m.outorga, true):''}
      <tr style="border-top:2px solid #10b981;font-weight:700"><td style="padding:4px 8px">Terreno máximo (o que sobra)</td><td style="padding:4px 8px;text-align:right;white-space:nowrap">${_avR$(Math.round(m.terreno_max))}</td></tr>
    </tbody></table>
    ${alertas}
    ${m.fpInfo?`<div style="font-size:.84em;color:#64748b;margin-top:8px">Fator de planejamento (Quadro 6 do PDE) no ponto: <b>${m.fpInfo.fp_texto||m.fpInfo.fp||'—'}</b> · ${m.fpInfo.macroarea||''}${m.fpInfo.setor?' · '+m.fpInfo.setor:''}</div>`:''}
    ${(m.refs||[]).length?`<div style="font-size:.84em;margin-top:8px"><div style="color:#64748b;margin-bottom:4px">Outorgas concedidas perto (GeoSampa) — contrapartida paga por m² excedente:</div>
      <table style="width:100%;border-collapse:collapse;font-size:.92em"><thead><tr style="text-align:left;color:#94a3b8"><th style="padding:2px 6px">Endereço</th><th style="padding:2px 6px;text-align:right">Dist.</th><th style="padding:2px 6px;text-align:right">Terreno</th><th style="padding:2px 6px;text-align:right">Excedente</th><th style="padding:2px 6px;text-align:right">R$/m²</th><th style="padding:2px 6px">Situação</th></tr></thead>
      <tbody>${m.refs.map(r=>`<tr style="border-top:1px solid #f1f5f9"><td style="padding:2px 6px">${r.endereco||''}</td><td style="padding:2px 6px;text-align:right">${r.dist_m} m</td><td style="padding:2px 6px;text-align:right">${n(r.area_terreno||0)} m²</td><td style="padding:2px 6px;text-align:right">${n(r.area_excedente||0)} m²</td><td style="padding:2px 6px;text-align:right">${_avR$(Math.round(r.ct_m2))}</td><td style="padding:2px 6px">${r.situacao||''}</td></tr>`).join('')}</tbody></table></div>`:''}
    <div style="color:#94a3b8;font-size:.8em;margin-top:6px">CUB ${P.cub_ref}. Outorga: referência das concessões vizinhas (GeoSampa, 01/10/2026) ou fórmula do PDE (Lei 16.050/2014, art. 117) quando o QVT é informado. Parâmetros padrão da NSP em AV_PARAM.</div></details>`;
}
// Reconstrói a memória de uma avaliação salva (padrão vem do texto do método; sem ele, médio)
function _avMemoriaSalva(x){
  if(!x||!x.incorp_aplicavel||!x.terreno||!x.ca||!x.incorp_lancamento_rs_m2) return null;
  let extra={}; try{ const mj=/\[incorp:(\{.*?\})\]/.exec(x.metodo||''); if(mj) extra=JSON.parse(mj[1]); }catch(_){}
  const mp=/padrão (economico|medio|alto)/.exec(x.metodo||''); const padrao=extra.padrao||(mp?mp[1]:'medio');
  return _avContaIncorp({terreno:Number(x.terreno), ca:Number(x.ca), ca_basico:extra.cab, rs_lanc:Number(x.incorp_lancamento_rs_m2), padrao, qvt:extra.qvt, frente:extra.frente, gabarito:extra.gab, outorga_ref_m2:extra.oref, outorga_ref_n:extra.on||0, fp:extra.fp});
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
    const rows=await db.post('aval_resultado', d);
    const novo=Array.isArray(rows)?rows[0]:rows;
    await carregarAvalImoveis();
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
        <input id="av-link" readonly value="${link}" onclick="this.select()" style="flex:1;min-width:220px;padding:8px 10px;border:1px solid #bbf7d0;border-radius:8px;background:#fff">
        <button class="btn btn-p" onclick="_avCopiarLink()">📋 Copiar</button>
        <a class="btn btn-o" href="${link}" target="_blank">Abrir</a>
        <button class="btn btn-o" onclick="_avAprovar(${x.id},'gerada')">↩︎ Reabrir</button>
      </div></div></div>`:`
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
    ${x.valor_mercado?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase">Valor de mercado</div>
      <div style="font-size:1.8em;font-weight:800;margin:4px 0">${_avR$(x.valor_mercado)}</div>
      <div style="color:#64748b">Faixa: ${_avR$(x.faixa_min)} — ${_avR$(x.faixa_max)}</div>
      <div style="color:#94a3b8;font-size:.88em;margin-top:6px">${x.metodo||''}</div>
      ${x.preco_pedido?`<div style="margin-top:8px;font-size:.9em">Pretendido: <b>${_avR$(x.preco_pedido)}</b> ${_avCompara(x.preco_pedido,x.valor_mercado)}</div>`:''}
    </div></div>`:''}
    ${inc}
    ${comps.length?`<div class="card" style="margin-bottom:12px"><div class="cb">
      <div style="color:#64748b;font-size:.85em;text-transform:uppercase;margin-bottom:6px">Comparáveis</div>
      <table style="width:100%;border-collapse:collapse;font-size:.86em"><thead><tr style="text-align:left;color:#94a3b8">
        <th style="padding:4px 8px">Origem</th><th style="padding:4px 8px;text-align:right">Área</th>
        <th style="padding:4px 8px;text-align:right">Preço</th><th style="padding:4px 8px;text-align:right">R$/m²</th></tr></thead>
      <tbody>${comps.slice(0,12).map(c=>`<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:4px 8px">${c.origem||c.tipo||'—'}</td>
        <td style="padding:4px 8px;text-align:right">${c.area?Math.round(c.area)+' m²':'—'}</td>
        <td style="padding:4px 8px;text-align:right">${_avR$(c.preco)}</td>
        <td style="padding:4px 8px;text-align:right">${_avR$(c.rs_m2)}</td></tr>`).join('')}</tbody></table>
    </div></div>`:''}
    ${acoes}`;
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

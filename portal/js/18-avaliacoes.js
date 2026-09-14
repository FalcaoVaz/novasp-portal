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
function _avLiberaPasso2(){ const p=document.getElementById('av-passo2'); if(p){p.style.opacity='1';p.style.pointerEvents='auto';} }

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

  let precos={};
  try{
    const r=await fetch(`${AVAL_MOTOR}/precos?bairro=`+encodeURIComponent(bairro),{headers:hdr()});
    if(!r.ok) throw new Error('motor HTTP '+r.status);
    precos=await r.json();
  }catch(e){ stt.innerHTML='<span style="color:#dc2626">Não consegui buscar o preço ao vivo ('+(e.message||e)+'). O motor está no ar?</span>'; return; }

  // comparáveis de fechamento (ITBI) — do banco, via RPC
  let compsItbi=[];
  try{ compsItbi=await _avRpc('aval_comps_itbi',{p_bairro:bairro,p_lim:8}); }catch(_){}

  // trava: se o zoneamento ainda não resolveu (clique rápido), busca agora
  if(!_avForm.geo){
    try{ const z=await _avRpc('aval_geo',{p_lat:_avPino.lat,p_lng:_avPino.lng}); _avForm.geo=Array.isArray(z)?z[0]:z; }catch(_){}
  }
  const ehcasa=_ehCasa(tipo);
  const rs_apto=precos.rs_apto, rs_casa=precos.rs_casa;
  const rs_tipo = ehcasa ? (rs_casa||rs_apto) : rs_apto;
  const geo=_avForm.geo||{};

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
    dossie.metodo=`${area} m² × R$ ${rsf}/m² (anúncios ${bairro})`;
  }
  const ca=dossie.ca;
  if(ehcasa && geo.incorporavel && ca && ca>=2 && terreno && rs_apto){
    const efic=0.80, fator=1.9, pct=0.17;
    const lanc=rs_apto*fator, vgv=terreno*ca*efic*lanc, vt=vgv*pct;
    dossie.incorp_aplicavel=true;
    dossie.incorp_area_constr=Math.round(terreno*ca);
    dossie.incorp_lancamento_rs_m2=Math.round(lanc);
    dossie.incorp_vgv=Math.round(vgv);
    dossie.incorp_valor_terreno=Math.round(vt);
    dossie.incorp_ganho_pct = preco ? Math.round((vt/preco-1)*100) : null;
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
        <div><span style="color:#94a3b8">Lançamento estim.</span><br><b>${_avR$(x.incorp_lancamento_rs_m2)}/m²</b></div>
        <div><span style="color:#94a3b8">VGV potencial</span><br><b>${_avR$(x.incorp_vgv)}</b></div>
      </div></div></div>` : '';
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
      <div style="color:#64748b">${x.zona} · CA ${x.ca} · construível ${x.incorp_area_constr} m² · VGV ${_avR$(x.incorp_vgv)}${x.incorp_ganho_pct!=null?` · <b style="color:#059669">+${Math.round(x.incorp_ganho_pct)}%</b>`:''}</div>
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

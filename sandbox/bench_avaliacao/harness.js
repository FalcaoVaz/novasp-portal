// banco de testes da avaliação (só local): RPC de leitura e motor pelo proxy 127.0.0.1:8792
(function(){
const PX='http://127.0.0.1:8792';
window._avRpc = async (fn,args)=>{ const r=await fetch(PX+'/rest/v1/rpc/'+fn,{method:'POST',body:JSON.stringify(args||{})}); if(!r.ok){ let m=''; try{m=(await r.json()).message}catch(_){} throw new Error('RPC '+fn+' '+r.status+' '+m); } return r.json(); };
_avRpc = window._avRpc;
const _f=window.fetch.bind(window);
window.fetch=(u,o)=>{ if(typeof u==='string' && u.includes('/precos?bairro=')) u=PX+'/precos?'+u.split('?')[1]; return _f(u,o); };
renderAvalPreview=()=>{};
if(!document.getElementById('av-iptu-info')){ const d=document.createElement('div'); d.id='av-iptu-info'; d.style.display='none'; document.body.appendChild(d); }
window._tipoPortal=t=>/APART/i.test(t)?'Apartamento':/SOBRADO|ASSOBRADADA/i.test(t)?'Sobrado':/VILA/i.test(t)?'Casa de vila':/COMERC|GALP/i.test(t)?'Comercial':'Casa térrea';
window._bench2=async function(c){
  const casa=!/APART/i.test(c.tipo);
  _avForm={rua:c.rua, num:c.num}; window._avCands=[];
  _avPino={lat:+c.lat,lng:+c.lng}; window._avPinoSeq=(window._avPinoSeq||0)+1;
  const z=await _avRpc('aval_geo',{p_lat:_avPino.lat,p_lng:_avPino.lng}); _avForm.geo=Array.isArray(z)?z[0]:z;
  if(c.bairro_fix) _avForm.bairro=c.bairro_fix; else await _avDetectarBairro();
  let terreno=c.terreno||0, idade=c.ano?2026-c.ano:'';
  if(casa && (!terreno || !idade)){ try{ await _avBuscarIptu(); const ip=_avForm.iptuSel||(_avForm.iptu||[])[0]||{}; if(!terreno) terreno=Math.round(ip.area_terreno||0); if(!idade && ip.ano_construcao>1800) idade=2026-ip.ano_construcao; }catch(_){} }
  if(casa && !terreno) terreno=Math.round(c.area*1.2);
  _avForm.entrada={'av-tipo':window._tipoPortal(c.tipo),'av-area':String(c.area),'av-terreno':casa?String(terreno):'','av-frente':'','av-dorm':String(c.dorm||''),'av-suite':'','av-vaga':String(c.vaga||''),'av-padrao-casa':'medio','av-idade':String(idade||''),'av-estado':'bom','av-rs-terreno':''};
  await avalCalcular();
  const vaz=c.sem_vazamento?[]:(_avForm.cache&&_avForm.cache.compsItbi||[]).filter(x=>Math.abs(Number(x.valor)/c.valor-1)<0.03 || (x.valor_imovel&&Math.abs(Number(x.valor_imovel)/c.valor-1)<0.03));
  if(vaz.length){ _avForm.excl=new Set(vaz.map(x=>x._k)); await avalCalcular({recalc:true}); }
  const d=_avForm.dossie||{}, mu=_avForm.metodoUnico||{}, ev=_avForm.evolutivo;
  return {k:c.k, tipo:c.tipo, bairro:_avForm.bairro, real:c.valor, calc:d.valor_mercado||null, erro: d.valor_mercado?(d.valor_mercado/c.valor-1):null,
          comp: mu.valor_final||null, evol: ev?ev.total:null, rs_an:mu.rs_anuncio||null, n_an:mu.n_anuncio, rs_itbi:mu.rs_itbi_util||null, vaz:vaz.length, area:c.area};
};
window._rodar=function(lista, chave){ window[chave]={}; window[chave+'_fim']=false; (async()=>{ for(const c of lista){ try{ window[chave][c.k]=await window._bench2(c); }catch(e){ window[chave][c.k]={k:c.k, falha:String(e).slice(0,120)}; } await new Promise(r=>setTimeout(r,1100)); } window[chave+'_fim']=true; })(); };
window._met=rs=>{ const e=rs.filter(r=>typeof r.erro==='number').map(r=>r.erro).sort((a,b)=>a-b); const abs=e.map(Math.abs).sort((a,b)=>a-b); const md=a=>a.length?a[Math.floor(a.length/2)]:null;
  return {n:e.length, sem_valor:rs.length-e.length, vies_mediano_pct:Math.round(md(e)*100), erro_abs_mediano_pct:Math.round(md(abs)*100), dentro_10pct:Math.round(e.filter(x=>Math.abs(x)<=0.10).length/e.length*100), dentro_20pct:Math.round(e.filter(x=>Math.abs(x)<=0.20).length/e.length*100)}; };
})();

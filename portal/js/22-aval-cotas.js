/* 22-aval-cotas.js — Cotas de parecer em texto (só administradores). Pedido do Rodrigo em 05/10/2026:
   cada corretor tem 10 pareceres em texto por mês (custam ~US$ 0,18 cada); ao atingir, o portal bloqueia e o gestor
   libera mais aqui. Dados pelas funções aval_cota_relatorio / aval_cota_definir (sql/2026-10-05-aval-cota-parecer.sql). */
(function(){
  'use strict';
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let _lista=[];
  async function abrir(){
    const root=document.getElementById('aval-cotas-root'); if(!root) return;
    if(!(CUR&&CUR.admin)){ root.innerHTML='<div class="card cb">Só administradores.</div>'; return; }
    root.innerHTML=`<div class="ph"><div><h1 class="pt">Cotas de parecer em texto</h1>
        <div class="pst">Cada parecer escrito pela IA custa cerca de US$ 0,18. Padrão: 10 por corretor por mês; ao atingir, o portal bloqueia até você liberar mais. Administradores não têm limite.</div></div>
        <input id="cota-busca" placeholder="buscar nome ou e-mail" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px"></div>
      <div id="cota-lista" class="card cb" style="color:var(--muted)">Carregando…</div>`;
    root.querySelector('#cota-busca').oninput=desenhar;
    await carregar();
  }
  async function carregar(){
    const el=document.getElementById('cota-lista');
    try{ const r=await _avRpc('aval_cota_relatorio',{}); _lista=Array.isArray(r)?r:[]; }
    catch(e){ el.innerHTML=`<span style="color:#dc2626">Erro: ${esc(e.message)}</span>`; return; }
    desenhar();
  }
  function desenhar(){
    const el=document.getElementById('cota-lista'); if(!el) return;
    const b=((document.getElementById('cota-busca')||{}).value||'').trim().toLowerCase();
    const l=_lista.filter(x=>!b || (x.nome||'').toLowerCase().includes(b) || (x.email||'').includes(b));
    const atingiram=_lista.filter(x=>x.atingiu).length, total=_lista.reduce((s,x)=>s+(x.usados||0),0);
    el.innerHTML=`<div style="margin-bottom:10px;font-size:13px">${atingiram?`<b style="color:#b91c1c">${atingiram} corretor(es) atingiram a cota este mês.</b> `:''}Pareceres no mês: <b>${total}</b> (≈ US$ ${(total*0.18).toFixed(2)}).</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--muted)"><th style="padding:6px">Nome</th><th style="padding:6px">E-mail</th><th style="padding:6px;text-align:right">Usados no mês</th><th style="padding:6px;text-align:right">Limite</th><th></th></tr></thead>
      <tbody>${l.map((x,i)=>`<tr style="border-top:1px solid var(--borda);${x.atingiu?'background:#fef2f2':''}">
        <td style="padding:6px">${esc(x.nome||'—')}${x.atingiu?' <span style="color:#b91c1c;font-size:12px">· atingiu</span>':''}</td><td style="padding:6px;color:var(--muted)">${esc(x.email)}</td>
        <td style="padding:6px;text-align:right">${x.usados}</td>
        <td style="padding:6px;text-align:right"><input type="number" min="0" max="500" value="${x.limite}" data-email="${esc(x.email)}" style="width:70px;padding:4px 6px;border:1px solid var(--borda);border-radius:6px;text-align:right"></td>
        <td style="padding:6px"><button class="btn btn-o bsm" data-salvar="${esc(x.email)}">Salvar</button></td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-salvar]').forEach(bt=>bt.onclick=async()=>{
      const em=bt.getAttribute('data-salvar'), inp=el.querySelector(`input[data-email="${CSS.escape(em)}"]`), v=parseInt(inp.value,10);
      if(!(v>=0 && v<=500)){ alert('Limite entre 0 e 500.'); return; }
      bt.disabled=true; bt.textContent='…';
      try{ await _avRpc('aval_cota_definir',{p_email:em,p_limite:v}); await carregar(); }
      catch(e){ alert('Não foi possível salvar: '+e.message); bt.disabled=false; bt.textContent='Salvar'; }
    });
  }
  window.AvalCotas={abrir};
})();

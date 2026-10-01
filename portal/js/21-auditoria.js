/* 21-auditoria.js — Auditoria (só admin): quem mexeu em quê, quando. Lê a tabela `auditoria`
   preenchida por trigger (sql/2026-10-01-auditoria.sql). Pedido do Rodrigo em 01/10/2026 para o piloto. */
(function(){
  'use strict';
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ROTULO = { usuarios:'Usuários', agenda_eventos:'Agenda', aval_resultado:'Avaliações', vendas_corretores:'Corretores', vendas_cotas:'Cotas (antigas)',
    vendas_captacoes_mensais:'Captação (antiga)', vendas_planilhas_importacoes:'Planilha mensal', guess_acesso:'Acesso ao acervo', processos:'Processos (jurídico)',
    acordos_extrajudiciais:'Acordos (jurídico)', gestao_perguntas:'Perguntas de gestão' };
  const OP = { INSERT:['criou','#047857','#d1fae5'], UPDATE:['alterou','#b45309','#fef3c7'], DELETE:['apagou','#b91c1c','#fee2e2'] };
  let _lista=[];
  async function abrir(){
    const root=document.getElementById('auditoria-root'); if(!root) return;
    if(!(CUR&&CUR.admin)){ root.innerHTML='<div class="card cb">Só administradores.</div>'; return; }
    root.innerHTML=`<div class="ph"><div><h1 class="pt">Auditoria</h1><div class="pst">Quem mexeu em quê. Registro automático das tabelas importantes (últimos 300 eventos).</div></div>
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <select id="aud-tabela" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px"><option value="">Todas as tabelas</option>${Object.entries(ROTULO).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
          <input id="aud-usuario" placeholder="e-mail do usuário" style="padding:8px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px">
          <button class="btn btn-p" id="aud-btn">Filtrar</button></div></div>
      <div id="aud-lista" class="card cb" style="color:var(--muted)">Carregando…</div>`;
    root.querySelector('#aud-btn').onclick=carregar; root.querySelector('#aud-tabela').onchange=carregar;
    carregar();
  }
  async function carregar(){
    const el=document.getElementById('aud-lista'); const t=document.getElementById('aud-tabela').value; const u=document.getElementById('aud-usuario').value.trim();
    let q='?select=id,quando,usuario,tabela,operacao,chave,antes,depois&order=quando.desc&limit=300';
    if(t) q+=`&tabela=eq.${encodeURIComponent(t)}`; if(u) q+=`&usuario=ilike.${encodeURIComponent('*'+u+'*')}`;
    try{ _lista=await db.get('auditoria', q)||[]; }catch(e){ el.innerHTML=`<span style="color:#dc2626">Erro: ${esc(e.message)}</span>`; return; }
    if(!_lista.length){ el.textContent='Nenhum registro ainda.'; return; }
    el.className='card'; el.style.color='';
    el.innerHTML=`<div class="tw tbl"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Onde</th><th>Chave</th><th>O que mudou</th></tr></thead><tbody>${_lista.map(r=>{
      const [verbo,cor,bg]=OP[r.operacao]||[r.operacao,'#475569','#e2e8f0'];
      const mud = r.operacao==='UPDATE' ? Object.keys(r.depois||{}).map(k=>`<div><span style="color:var(--muted)">${esc(k)}</span>: <s style="color:#94a3b8">${esc(resumo((r.antes||{})[k]))}</s> → <b>${esc(resumo((r.depois||{})[k]))}</b></div>`).join('')
                : resumoObj(r.operacao==='INSERT'?r.depois:r.antes);
      return `<tr><td style="white-space:nowrap">${new Date(r.quando).toLocaleString('pt-BR')}</td><td>${esc(r.usuario||'—')}</td>
        <td><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${bg};color:${cor}">${verbo}</span></td>
        <td>${esc(ROTULO[r.tabela]||r.tabela)}</td><td style="font-family:monospace;font-size:11px">${esc(String(r.chave||'').slice(0,8))}</td>
        <td style="font-size:12px;max-width:460px">${mud}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const resumo = v => v==null?'—':(typeof v==='object'?JSON.stringify(v).slice(0,60):String(v).slice(0,60));
  const resumoObj = o => { if(!o) return ''; const ks=['nome','titulo','email','endereco','data','corretor_nome','valor_mercado','status','equipe','mes_ref','autor']; const sel=ks.filter(k=>k in o).slice(0,4); return sel.map(k=>`<div><span style="color:var(--muted)">${esc(k)}</span>: ${esc(resumo(o[k]))}</div>`).join('')||`<span style="color:var(--muted)">${Object.keys(o).length} campos</span>`; };
  window.Auditoria={abrir};
})();

// ─── TOKENS ──────────────────────────────────────────────
function tokenBarHTML(used, quota) {
  const pct = Math.min(100, Math.round(used/quota*100));
  const cls = pct > 85 ? 'danger' : pct > 65 ? 'warn' : '';
  return `
    <div class="token-bar-wrap">
      <div class="flex justify-between text-xs text-gray" style="margin-bottom:4px">
        <span>${used.toLocaleString('pt-BR')} tokens usados</span>
        <span>${pct}% de ${(quota/1000).toFixed(0)}k</span>
      </div>
      <div class="token-bar"><div class="token-bar-fill ${cls}" style="width:${pct}%"></div></div>
    </div>`;
}

async function renderDashTokens() {
  const el = document.getElementById('dash-token-list');
  if (!el) return;

  // Atualiza título com mês atual
  const titulo = document.querySelector('#admin-token-panel .card-title');
  if (titulo) {
    const mesAtual = new Date().toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
    titulo.textContent = `🔋 Consumo de Tokens — Equipe (${mesAtual})`;
  }

  try {
    // Busca todos os usuários do banco
    const users = await db.get('usuarios',
      '?select=id,nome,nivel,judicial,admin,quota_tokens,tokens_usados,dept&order=tokens_usados.desc&limit=30');

    if (!users || !users.length) {
      el.innerHTML = '<div class="text-sm text-gray">Nenhum usuário encontrado.</div>';
      return;
    }

    el.innerHTML = users
      .filter(u => (u.tokens_usados || 0) > 0 || u.judicial || u.admin)
      .map(u => {
        const used  = u.tokens_usados || 0;
        const quota = u.quota_tokens  || 500000;
        const dept  = u.dept || (u.nivel===1?'Jurídico':u.nivel===2?'Administrativo':'Vendas');
        return `
          <div style="margin-bottom:16px">
            <div class="flex justify-between items-center" style="margin-bottom:4px">
              <div class="font-semibold text-sm">${u.nome}</div>
              <div class="text-xs text-gray">${dept}${u.admin?' · 👑':''}</div>
            </div>
            ${tokenBarHTML(used, quota)}
          </div>`;
      }).join('');

  } catch(e) {
    // Fallback para USERS local
    const top = Object.values(USERS).sort((a,b)=>b.used-a.used).slice(0,8);
    el.innerHTML = top.map(u=>`
      <div style="margin-bottom:16px">
        <div class="flex justify-between items-center" style="margin-bottom:4px">
          <div class="font-semibold text-sm">${u.name}</div>
          <div class="text-xs text-gray">${['','Jurídico','Administrativo','Vendas'][u.level]||''}</div>
        </div>
        ${tokenBarHTML(u.used, u.quota)}
      </div>`).join('');
  }
}

async function renderUserTabs() {
  // Carrega todos os usuários do banco
  let todosUsuarios = [];
  try {
    todosUsuarios = await db.get('usuarios',
      '?select=id,nome,dept,nivel,judicial,admin,acesso_juridico,quota_tokens,tokens_usados&order=nome.asc');
  } catch(e) {
    // Fallback para cache local
    todosUsuarios = Object.values(USERS).map(u => ({
      nome: u.name, nivel: u.level, judicial: u.judicial, admin: u.admin,
      quota_tokens: u.quota, tokens_usados: u.used, dept: ''
    }));
  }

  // Salva no cache global para uso nos revisores
  if (typeof USUARIOS_CACHE !== 'undefined') {
    USUARIOS_CACHE.length = 0;
    todosUsuarios.forEach(u => USUARIOS_CACHE.push(u));
  }

  const nivelLabel = n => n===1?'Jurídico':n===2?'Administrativo':'Vendas';

  [1,2,3].forEach(lvl => {
    const el = document.getElementById(`users-nivel${lvl}`);
    if (!el) return;
    const users = todosUsuarios.filter(u => u.nivel === lvl || (lvl===1 && u.judicial));
    if (!users.length) {
      el.innerHTML = '<div class="text-xs text-gray" style="padding:12px">Nenhum usuário neste nível.</div>';
      return;
    }
    el.innerHTML = users.map(u => {
      const quota = u.quota_tokens || 100000;
      const usado = u.tokens_usados || 0;
      return `<div style="padding:14px 0;border-bottom:1px solid var(--gray-100)">
        <div class="flex justify-between items-center" style="margin-bottom:6px">
          <div>
            <div class="font-semibold">${u.nome}</div>
            <div class="text-xs text-gray">${u.dept||nivelLabel(u.nivel)||''} ${u.admin?'· 👑 Admin':''}</div>
          </div>
          <div class="text-xs text-gray">Cota: <strong>${(quota/1000).toFixed(0)}k</strong></div>
        </div>
        ${tokenBarHTML(usado, quota)}
      </div>`;
    }).join('');
  });
}

// ─── TABS ────────────────────────────────────────────────
function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t=>t.style.display='none');
  document.getElementById(tabId).style.display='block';
  el.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
}

function filterPrazos(type, el) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
}

// ─── SIDEBAR MOBILE ──────────────────────────────────────
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// Fechar sidebar ao navegar em mobile
const _goTo = goTo;
window.goTo = function(page) {
  _goTo(page);
  if (window.innerWidth <= 768) closeSidebar();
};



// ─── FERIADOS NACIONAIS ──────────────────────────────────
function getFeriados(ano) {
  const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
  const pascoa=new Date(ano,mes-1,dia);
  const f6=(d,m)=>`${ano}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dp=n=>{const x=new Date(pascoa);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);};
  return new Set([f6(1,1),dp(-48),dp(-47),dp(-2),dp(0),dp(60),
    f6(21,4),f6(1,5),f6(7,9),f6(12,10),f6(2,11),f6(15,11),f6(25,12)]);
}
function isUtil(data,feriados){
  const dow=data.getDay();
  return dow!==0&&dow!==6&&!feriados.has(data.toISOString().slice(0,10));
}

function calcularPrazo() {
  const inicio=document.getElementById('calc-data-inicio').value;
  const tipoC=document.getElementById('calc-contagem').value;
  const dias=parseInt(document.getElementById('calc-tipo').value)||15;
  if(!inicio){alert('Selecione a data de início.');return;}
  let data=new Date(inicio+'T12:00:00');
  const fer=new Set([...getFeriados(data.getFullYear()),...getFeriados(data.getFullYear()+1)]);
  let contados=0;
  while(contados<dias){
    data.setDate(data.getDate()+1);
    if(tipoC==='util'){if(isUtil(data,fer))contados++;}else contados++;
  }
  if(tipoC==='util'){while(!isUtil(data,fer))data.setDate(data.getDate()+1);}
  const diff=Math.ceil((data-new Date())/(1000*60*60*24));
  const label=diff>0?`Faltam ${diff} dias`:diff===0?'Vence hoje':`Venceu há ${Math.abs(diff)} dias`;
  const cor=diff<=0?'var(--red)':diff<=5?'var(--amber)':'var(--blue-700)';
  const el=document.getElementById('calc-data-fim');
  el.textContent=data.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  el.style.color=cor;
  document.getElementById('calc-dias-restantes').textContent=
    label+(tipoC==='util'?' · feriados nacionais considerados':'');
  document.getElementById('calc-resultado').style.display='block';
}

function calcularContrato() {
  const inicio=document.getElementById('calc-contrato-inicio').value;
  const duracao=parseInt(document.getElementById('calc-duracao').value);
  const unidade=document.getElementById('calc-unidade').value;
  if(!inicio||!duracao){alert('Preencha a data e a duração.');return;}
  let data=new Date(inicio+'T12:00:00');
  if(unidade==='dias')data.setDate(data.getDate()+duracao);
  if(unidade==='meses')data.setMonth(data.getMonth()+duracao);
  if(unidade==='anos')data.setFullYear(data.getFullYear()+duracao);
  document.getElementById('calc-contrato-fim').textContent=
    data.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('calc-contrato-resultado').style.display='block';
}

// ─── DASHBOARD POR NÍVEL ─────────────────────────────────
async function renderDashboard() {
  ['dash-stats-judicial','dash-stats-adm','dash-stats-vendas',
   'dash-panel-judicial','dash-panel-extrajudicial'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const badge=document.getElementById('topbar-alert-badge');

  if(currentUser.judicial){
    document.getElementById('dash-stats-judicial').style.display='grid';
    document.getElementById('dash-panel-judicial').style.display='grid';
    const p2 = document.getElementById('dash-panel-judicial-2');
    if (p2) p2.style.display='grid';
    if(badge)badge.style.display='inline-flex';
    carregarStatsJuridico();
    carregarMeusDocsDash();
    carregarMeusChamadosDash();
  } else {
    const prefix = currentUser.level === 2 ? 'adm' : 'vnd';
    document.getElementById(`dash-stats-${currentUser.level===2?'adm':'vendas'}`).style.display='grid';
    document.getElementById('dash-panel-extrajudicial').style.display='grid';
    if(badge)badge.style.display='none';
    carregarStatsExtrajudicial(prefix);
    carregarMeusDocsDash();
    carregarMeusChamadosDash();
  }
}

async function carregarStatsJuridico() {
  if (!currentUser.id) return;

  const em5 = new Date(); em5.setDate(em5.getDate()+5);
  const em5str = em5.toISOString().slice(0,10);

  const [procs, prazos, revisao, chamados] = await Promise.all([
    db.get('processos', '?status=eq.ativo&select=id'),
    db.get('prazos', `?concluido=eq.false&vencimento=lte.${em5str}&select=id,vencimento,tipo,referencia,responsavel:usuarios(nome),processo:processos(numero,vara)`),
    db.get('documentos', `?revisor_id=eq.${currentUser.id}&status=eq.em_revisao&select=id`),
    db.get('chamados', `?status=in.(aberto,em_andamento)&select=*,solicitante:usuarios!chamados_solicitante_id_fkey(nome,nivel),responsavel:usuarios!chamados_responsavel_id_fkey(nome)`),
  ]);

  setEl('stat-jur-processos', procs?.length ?? 0);
  setEl('stat-jur-prazos',    prazos?.length ?? 0);
  setEl('stat-jur-revisao',   revisao?.length ?? 0);
  setEl('stat-jur-chamados',  chamados?.length ?? 0);

  // Painel de prazos
  const tbodyPrazos = document.getElementById('dash-prazos-jur');
  if (tbodyPrazos) {
    if (!prazos?.length) {
      tbodyPrazos.innerHTML = '<tr><td colspan="4" class="text-gray text-xs" style="text-align:center;padding:16px">Nenhum prazo urgente nos próximos 5 dias. ✅</td></tr>';
    } else {
      tbodyPrazos.innerHTML = prazos.slice(0,5).map(p => {
        const venc = new Date(p.vencimento + 'T12:00:00');
        const diff = Math.ceil((venc - new Date()) / (1000*60*60*24));
        const cls = diff <= 0 ? 'prazo-urgent' : diff <= 2 ? 'prazo-warn' : 'prazo-ok';
        const label = diff < 0 ? 'Vencido' : diff === 0 ? 'Hoje' : `${diff}d`;
        const ref = p.processo?.numero?.substring(0,15) || p.referencia || '—';
        const vara = p.processo?.vara?.substring(0,20) || '';
        const resp = p.responsavel?.nome?.split(' ')[0] || '—';
        const ini = resp.substring(0,2).toUpperCase();
        return `<tr>
          <td><div class="font-semibold text-xs">${ref}</div><div class="text-xs text-gray">${vara}</div></td>
          <td class="text-xs">${p.tipo}</td>
          <td><div class="flex items-center gap-2"><div class="avatar" style="width:22px;height:22px;font-size:9px;flex-shrink:0">${ini}</div><span class="text-xs">${resp}</span></div></td>
          <td class="${cls}">${label}</td>
        </tr>`;
      }).join('');
    }
  }

  // Painel de chamados (recebidos + enviados entre pares)
  const tbodyChamados = document.getElementById('dash-chamados-jur');
  if (tbodyChamados) {
    if (!chamados?.length) {
      tbodyChamados.innerHTML = '<tr><td colspan="4" class="text-gray text-xs" style="text-align:center;padding:16px">Nenhum chamado aberto.</td></tr>';
    } else {
      tbodyChamados.innerHTML = chamados.slice(0,4).map(c => {
        const sol = c.solicitante?.nome?.split(' ')[0] || '—';
        const niv = c.solicitante?.nivel;
        const nivelCls = niv===1?'badge-blue':niv===2?'badge-amber':'badge-green';
        const nivelLabel = niv===1?'Jur':niv===2?'Adm':'Vnd';
        const resp = c.responsavel?.nome?.split(' ')[0] || 'Não atrib.';
        const ini = resp !== 'Não atrib.' ? resp.substring(0,2).toUpperCase() : '—';
        const urgCls = c.urgencia==='alta'?'badge-red':c.urgencia==='media'?'badge-amber':'badge-blue';
        return `<tr>
          <td>${sol} <span class="badge ${nivelCls}" style="margin-left:2px;font-size:9px">${nivelLabel}</span></td>
          <td class="text-xs">${c.titulo.substring(0,28)}</td>
          <td><div class="flex items-center gap-2"><div class="avatar" style="width:22px;height:22px;font-size:9px;flex-shrink:0">${ini}</div><span class="text-xs">${resp}</span></div></td>
          <td><span class="badge ${urgCls}" style="font-size:9px">${c.urgencia==='alta'?'Alta':c.urgencia==='media'?'Méd':'Bx'}</span></td>
        </tr>`;
      }).join('');
    }
  }

  // Badge do nav
  const badge = document.getElementById('nav-chamados-badge');
  if (badge && chamados?.length) { badge.textContent = chamados.length; badge.style.display = 'inline-flex'; }
  const topBadge = document.getElementById('topbar-alert-badge');
  if (topBadge) {
    const n = prazos?.length || 0;
    topBadge.textContent = n > 0 ? `${n} prazo${n!==1?'s':''} urgente${n!==1?'s':''}` : '';
    topBadge.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  // Atualiza tabs de prazos com contagens reais
  try {
    const [pTodos, pUrg, pJud, pExt] = await Promise.all([
      db.get('prazos', '?concluido=eq.false&select=id'),
      db.get('prazos', `?concluido=eq.false&vencimento=lte.${em5str}&select=id`),
      db.get('prazos', '?concluido=eq.false&processo_id=not.is.null&select=id'),
      db.get('prazos', '?concluido=eq.false&processo_id=is.null&select=id'),
    ]);
    const nt = (id, n) => { const e=document.getElementById(id); if(e&&n!=null) e.textContent=e.textContent.split(' (')[0]+(n>0?` (${n})`:''); };
    nt('tab-prazos-todos',         pTodos?.length);
    nt('tab-prazos-urgente',       pUrg?.length);
    nt('tab-prazos-judicial',      pJud?.length);
    nt('tab-prazos-extrajudicial', pExt?.length);
  } catch(e) { console.warn('tabs prazos:', e.message); }

  // Atualiza tabs de petições com contagens reais
  try {
    const uid = currentUser.id;
    const [pTodas, pRasc, pRev, pFin] = await Promise.all([
      db.get('documentos', `?autor_id=eq.${uid}&modulo=eq.judicial&select=id`),
      db.get('documentos', `?autor_id=eq.${uid}&modulo=eq.judicial&status=eq.rascunho&select=id`),
      db.get('documentos', `?autor_id=eq.${uid}&modulo=eq.judicial&status=eq.em_revisao&select=id`),
      db.get('documentos', `?autor_id=eq.${uid}&modulo=eq.judicial&status=eq.aprovado&select=id`),
    ]);
    const nt2 = (id, n) => { const e=document.getElementById(id); if(e&&n!=null) e.textContent=e.textContent.split(' (')[0]+(n>0?` (${n})`:''); };
    nt2('tab-pet-todas',     pTodas?.length);
    nt2('tab-pet-rascunho',  pRasc?.length);
    nt2('tab-pet-revisao',   pRev?.length);
    nt2('tab-pet-finalizada',pFin?.length);
    const alertRev = document.getElementById('alert-pet-revisao');
    if (alertRev) alertRev.style.display = (pRev?.length > 0) ? 'flex' : 'none';
  } catch(e) { console.warn('tabs peticoes:', e.message); }

  // Tokens reais do banco
  try {
    const userDB = await db.get('usuarios', `?id=eq.${currentUser.id}&select=tokens_usados,quota_tokens&limit=1`);
    if (userDB?.[0]) {
      currentUser.used  = userDB[0].tokens_usados || 0;
      currentUser.quota = userDB[0].quota_tokens  || currentUser.quota;
    }
  } catch(e) { console.warn('tokens:', e.message); }
}

async function carregarStatsExtrajudicial(prefix) {
  if (!currentUser.id) {
    // Sem banco — zera tudo
    ['docs','aguardando','aprovados','chamados'].forEach(k => setEl(`stat-${prefix}-${k}`, '0'));
    return;
  }
  const idFiltro = `autor_id=eq.${currentUser.id}`;
  const [docs, aguardando, aprovados, chamados] = await Promise.all([
    db.get('documentos', `?${idFiltro}&select=id`),
    db.get('documentos', `?${idFiltro}&status=eq.aguardando_aprovacao&select=id`),
    db.get('documentos', `?${idFiltro}&status=eq.aprovado&select=id`),
    db.get('chamados',   `?solicitante_id=eq.${currentUser.id}&status=eq.aberto&select=id`),
  ]);
  setEl(`stat-${prefix}-docs`,       docs?.length      ?? 0);
  setEl(`stat-${prefix}-aguardando`, aguardando?.length ?? 0);
  setEl(`stat-${prefix}-aprovados`,  aprovados?.length  ?? 0);
  setEl(`stat-${prefix}-chamados`,   chamados?.length   ?? 0);
}

async function carregarMeusDocsDash() {
  const tbody = document.getElementById('dash-meus-docs');
  if (!tbody) return;
  if (!currentUser.id) { tbody.innerHTML = '<tr><td colspan="3" class="text-gray text-xs" style="text-align:center;padding:16px">Faça login com conexão ao banco para ver seus documentos.</td></tr>'; return; }

  const docs = await db.get('documentos', `?autor_id=eq.${currentUser.id}&order=criado_em.desc&limit=5`);
  if (!docs || !docs.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-gray text-xs" style="text-align:center;padding:16px">Nenhum documento ainda. Gere seu primeiro!</td></tr>';
    return;
  }
  const statusMap = {
    rascunho: ['badge-gray','✏️ Rascunho'],
    aguardando_aprovacao: ['badge-amber','⏳ Aguardando'],
    aprovado: ['badge-green','✅ Aprovado'],
    devolvido: ['badge-red','↩️ Devolvido'],
    reprovado: ['badge-red','🚫 Reprovado'],
    em_revisao: ['badge-blue','👁️ Em revisão'],
  };
  tbody.innerHTML = docs.map(d => {
    const [cls, label] = statusMap[d.status] || ['badge-gray', d.status];
    return `<tr>
      <td class="text-xs">${d.tipo?.replace(/[^\w\s]/g,'').trim() || '—'}</td>
      <td class="text-xs">${(d.referencia||'—').substring(0,25)}</td>
      <td><span class="badge ${cls}" style="font-size:10px">${label}</span></td>
      <td><button class="btn btn-xs btn-outline" onclick="verDocumento('${d.id}')">Ver</button></td>
    </tr>`;
  }).join('');
}

async function carregarMeusChamadosDash() {
  const tbody = document.getElementById('dash-meus-chamados');
  if (!tbody || !currentUser.id) return;
  // chamados tem 2 FKs pra usuarios (responsavel_id, solicitante_id).
  // Precisa explicitar qual relacionamento usar no embed.
  const chamados = await db.get('chamados',
    `?solicitante_id=eq.${currentUser.id}&order=criado_em.desc&limit=3&select=*,responsavel:usuarios!chamados_responsavel_id_fkey(nome)`);
  if (!chamados || !chamados.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-gray text-xs" style="text-align:center;padding:16px">Nenhum chamado aberto.</td></tr>';
    return;
  }
  tbody.innerHTML = chamados.map(c => {
    const resp = c.responsavel?.nome?.split(' ')[0] || 'Não atribuído';
    const cls = c.status==='aberto'?'badge-amber':c.status==='em_andamento'?'badge-blue':'badge-green';
    const label = c.status==='aberto'?'Aberto':c.status==='em_andamento'?'Em andamento':'Concluído';
    // Solicitante pode cancelar enquanto ainda nao foi concluido
    const podeCancelar = c.status !== 'concluido';
    const acoes = podeCancelar
      ? `<button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="cancelarMeuChamado('${c.id}','${(c.protocolo||'').replace(/'/g,'')}')" title="Cancelar">🗑️</button>`
      : '';
    return `<tr>
      <td class="text-xs">${c.titulo.substring(0,30)}</td>
      <td class="text-xs">${resp}</td>
      <td><span class="badge ${cls}">${label}</span> ${acoes}</td>
    </tr>`;
  }).join('');
}

async function cancelarMeuChamado(id, protocolo) {
  if (!confirm(`Cancelar chamado ${protocolo}? Esta ação não pode ser desfeita.`)) return;
  await db.delete('chamados', id);
  showToast('🗑️ Chamado cancelado.');
  carregarMeusChamadosDash();
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── CARREGAR PÁGINA DE DOCUMENTOS ───────────────────────

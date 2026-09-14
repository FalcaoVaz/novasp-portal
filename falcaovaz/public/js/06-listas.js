async function carregarProcessos() {
  const busca  = document.getElementById('filtro-processo-busca')?.value?.toLowerCase() || '';
  const tipo   = document.getElementById('filtro-processo-tipo')?.value || '';
  const adv    = document.getElementById('filtro-processo-adv')?.value || '';
  // Default vazio = TODOS (ativos no topo, encerrados riscados no fim)
  const status = document.getElementById('filtro-processo-status')?.value ?? '';

  let query = '?select=*,responsavel:usuarios(nome)&order=criado_em.desc&limit=200';
  if (status) query += `&status=eq.${status}`;
  if (tipo)   query += `&tipo=eq.${encodeURIComponent(tipo)}`;

  const dados = await db.get('processos', query);
  if (!dados) return;

  // Filtro por advogado — join via nome
  let filtrados = dados;
  if (adv) filtrados = filtrados.filter(p => p.responsavel?.nome === adv);

  // Filtro por busca textual
  if (busca) {
    filtrados = filtrados.filter(p =>
      (p.numero||'').toLowerCase().includes(busca) ||
      (p.autor||'').toLowerCase().includes(busca) ||
      (p.reu||'').toLowerCase().includes(busca) ||
      (p.vara||'').toLowerCase().includes(busca) ||
      (p.fase||'').toLowerCase().includes(busca)
    );
  }

  // Busca o ultimo andamento de cada processo para a coluna "Ultima atualizacao"
  // Uma unica query traz os mais recentes de todos os processos da pagina.
  const ultPorProc = {};
  if (filtrados.length) {
    const ids = filtrados.map(p => p.id).join(',');
    const ands = await db.get('andamentos_processos',
      `?processo_id=in.(${ids})&order=data.desc.nullslast,criado_em.desc&select=processo_id,data,criado_em,tipo,origem&limit=2000`);
    for (const a of (ands||[])) {
      if (!ultPorProc[a.processo_id]) ultPorProc[a.processo_id] = a;
    }
  }

  // Ordena: ativos primeiro (por data de ultima atualizacao desc, mais recente em cima),
  // encerrados ao final (tambem por ultima atualizacao desc).
  const _dtSort = p => {
    const u = ultPorProc[p.id];
    return u?.data || u?.criado_em || p.atualizado_em || p.criado_em || '';
  };
  filtrados.sort((a,b) => {
    const aEnc = a.status === 'encerrado';
    const bEnc = b.status === 'encerrado';
    if (aEnc !== bEnc) return aEnc ? 1 : -1; // encerrados pro fim
    return String(_dtSort(b)).localeCompare(String(_dtSort(a)));
  });

  const tbody = document.querySelector('#page-processos table tbody');
  if (!tbody) return;

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-gray" style="text-align:center;padding:32px">Nenhum processo encontrado.</td></tr>`;
    return;
  }

  const hoje = new Date();
  const dtRel = (s) => {
    if (!s) return '<span class="text-gray text-xs">—</span>';
    const d = new Date(s.length===10 ? s+'T12:00:00' : s);
    if (isNaN(d)) return '<span class="text-gray text-xs">—</span>';
    const dias = Math.floor((hoje - d) / (1000*60*60*24));
    let rel;
    if (dias===0) rel='hoje';
    else if (dias===1) rel='ontem';
    else if (dias<7) rel=`há ${dias} dias`;
    else if (dias<30) rel=`há ${Math.floor(dias/7)} sem`;
    else rel=`há ${Math.floor(dias/30)} m`;
    const cls = dias<=7 ? 'badge-green' : dias<=30 ? 'badge-blue' : dias<=90 ? 'badge-amber' : 'badge-red';
    return `<div class="text-xs">${d.toLocaleDateString('pt-BR')}</div><span class="badge ${cls}" style="font-size:9px;padding:1px 6px">${rel}</span>`;
  };

  tbody.innerHTML = filtrados.map(p => {
    const resp = p.responsavel?.nome || '—';
    const initials = resp.split(' ').slice(0,2).map(n=>n[0]).join('');
    const tipoCls = {
      'Imobiliário':'badge-green','Trabalhista':'badge-red',
      'Execução':'badge-amber','Recursal':'badge-blue',
      'JEC':'badge-gray'
    }[p.tipo] || 'badge-blue';
    const encerrado = p.status === 'encerrado';
    const statusCls = encerrado ? 'badge-gray' : 'badge-green';
    const ult = ultPorProc[p.id];
    const ultData = ult?.data || ult?.criado_em || p.atualizado_em || p.criado_em;
    const trStyle = encerrado
      ? 'background:var(--gray-50);opacity:.6;text-decoration:line-through'
      : '';
    return `<tr style="${trStyle}">
      <td><div class="font-semibold" style="font-size:12px">${p.numero}</div><div class="text-xs text-gray">${(p.vara||'').substring(0,40)}</div></td>
      <td><div class="text-xs">${(p.autor||'—').substring(0,35)}</div><div class="text-xs text-gray">${(p.reu||'').substring(0,35)}</div></td>
      <td><span class="badge ${tipoCls}">${p.tipo||'—'}</span></td>
      <td class="text-xs">${(p.fase||'—').substring(0,30)}</td>
      <td><div class="flex items-center gap-2"><div class="avatar" style="width:24px;height:24px;font-size:9px;flex-shrink:0">${initials}</div><span class="text-xs">${resp.split(' ')[0]}</span></div></td>
      <td>${dtRel(ultData)}</td>
      <td><span class="badge ${statusCls}">${encerrado ? 'Encerrado' : 'Ativo'}</span></td>
      <td><div class="flex gap-1">
        <button class="btn btn-xs btn-outline" onclick="abrirProcesso('${p.id}')" title="Abrir">📂</button>
        <button class="btn btn-xs btn-outline" onclick="abrirEditarProcesso('${p.id}')" title="Editar">✏️</button>
        <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirProcesso('${p.id}','${(p.numero||'').replace(/'/g,'')}')" title="Excluir">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── CARREGAR PRAZOS ──────────────────────────────────────
async function carregarPrazos() {
  const dados = await db.get('prazos',
    `?concluido=eq.false&order=vencimento.asc&limit=50` +
    `&select=*,responsavel:usuarios(nome),processo:processos(numero,vara,autor,reu)`
  );
  if (!dados || !dados.length) return;

  const tbody = document.querySelector('#page-prazos table tbody');
  if (!tbody) return;
  tbody.innerHTML = dados.map(p => {
    const venc = new Date(p.vencimento + 'T12:00:00');
    const diff = Math.ceil((venc - new Date()) / (1000*60*60*24));
    const diasLabel = diff < 0 ? 'Vencido' : diff === 0 ? 'Hoje' : `${diff} dias`;
    const cls = diff <= 0 ? 'prazo-urgent' : diff <= 5 ? 'prazo-warn' : 'prazo-ok';
    const badgeCls = diff <= 0 ? 'badge-red' : diff <= 5 ? 'badge-amber' : 'badge-blue';
    const ref = p.processo?.numero || p.referencia || '—';
    const vara = p.processo?.vara || '';
    const autor = (p.processo?.autor||'').substring(0,30);
    const reu   = (p.processo?.reu||'').substring(0,30);
    const partes = (autor || reu)
      ? `<div class="text-xs" style="color:var(--gray-700)">${autor||'—'}</div><div class="text-xs text-gray">× ${reu||'—'}</div>`
      : '';
    const resp = p.responsavel?.nome || '—';
    const descCurta = `${p.tipo} · ${ref}`.replace(/'/g, "\\'");
    return `<tr>
      <td>
        <div class="font-semibold">${ref}</div>
        <div class="text-xs text-gray">${vara}</div>
        ${partes}
      </td>
      <td>${p.tipo}</td>
      <td>${resp}</td>
      <td>${venc.toLocaleDateString('pt-BR')}</td>
      <td class="${cls}">${diasLabel}</td>
      <td><span class="badge ${badgeCls}">${diff<=0?'Urgente':diff<=5?'Atenção':'Normal'}</span></td>
      <td><div class="flex gap-1">
        <button class="btn btn-xs btn-outline" onclick="abrirEditarPrazo('${p.id}')" title="Editar">✏️</button>
        <button class="btn btn-xs btn-outline" style="color:var(--green)" onclick="concluirPrazo('${p.id}','${descCurta}')" title="Marcar concluído">✅</button>
        <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirPrazo('${p.id}','${descCurta}')" title="Excluir">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── CARREGAR CHAMADOS RECEBIDOS ──────────────────────────
// ─── CHAMADOS POR MÊS ─────────────────────────────────────
const _MESES_ABREV_FV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function _mesKeyIso(isoOuPt) {
  if (!isoOuPt) return '';
  const t = String(isoOuPt).trim();
  let m = t.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (m) return m[1]+'-'+m[2];
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return m[3]+'-'+m[2].padStart(2,'0');
  try { const d=new Date(t); if(!isNaN(d)) return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); } catch(_){}
  return '';
}
function _ultMesesIdsFv(n) {
  const hoje = new Date(); hoje.setDate(1);
  const arr = [];
  for (let i=n-1;i>=0;i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    arr.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return arr;
}
// Filtro de mes ativo nos chamados do falcaovaz
let _chamMesFiltro = '';

async function carregarChamadosPorMes() {
  const bars = document.getElementById('cham-pmes-bars');
  const tot  = document.getElementById('cham-pmes-tot');
  if (!bars) return;
  // Para juridico, mostra todos; para outros, so os enviados pelo proprio usuario.
  const filtro = currentUser?.judicial
    ? `?select=criado_em&limit=1000`
    : `?solicitante_id=eq.${currentUser?.id}&select=criado_em&limit=1000`;
  const dados = await db.get('chamados', filtro);
  const meses = _ultMesesIdsFv(6);
  const cont = {}; meses.forEach(m => cont[m]=0);
  let total = 0;
  (dados||[]).forEach(c => {
    const k = _mesKeyIso(c.criado_em);
    if (k && cont.hasOwnProperty(k)) { cont[k]++; total++; }
  });
  const max = Math.max(1, ...meses.map(m => cont[m]));
  const atual = meses[meses.length-1];
  bars.innerHTML = meses.map(m => {
    const v = cont[m];
    const pct = (v/max)*100;
    const sel = (m===_chamMesFiltro);
    const cls = sel ? 'pbar sel' : (m===atual ? 'pbar atual' : 'pbar');
    const lbl = _MESES_ABREV_FV[parseInt(m.split('-')[1],10)-1] + '/' + m.split('-')[0].slice(2);
    return `<div class="pcol" style="cursor:pointer" onclick="setChamMesFiltro('${m}')" title="${v} chamado(s) em ${lbl} (clique para filtrar)"><div class="pval">${v}</div>`
      + `<div class="${cls}" style="height:${pct}%;cursor:pointer"></div>`
      + `<div class="plbl">${lbl}</div></div>`;
  }).join('');
  if (tot) {
    tot.innerHTML = _chamMesFiltro
      ? `Filtrando por <b style="color:var(--gray-700,#334155)">${_mesLabelFv(_chamMesFiltro)}</b> · <a href="#" onclick="setChamMesFiltro('${_chamMesFiltro}');return false;" style="color:var(--amber);text-decoration:underline">limpar</a>`
      : `Total nos últimos 6 meses: <b style="color:var(--gray-700,#334155)">${total}</b> · clique numa barra para filtrar`;
  }
}

function _mesLabelFv(yyyymm){
  const p = yyyymm.split('-');
  if (p.length!==2) return yyyymm;
  return _MESES_ABREV_FV[parseInt(p[1],10)-1] + '/' + p[0].slice(2);
}

function setChamMesFiltro(m){
  _chamMesFiltro = (_chamMesFiltro===m) ? '' : m;
  carregarChamadosPorMes();
  carregarChamadosRecebidos();
}

async function carregarChamadosRecebidos() {
  const tbody = document.getElementById('lista-chamados-recebidos');
  const badge = document.getElementById('badge-chamados-recebidos');
  const navBadge = document.getElementById('nav-chamados-badge');
  const alerta = document.getElementById('alert-chamados-pendentes');
  const txtAlerta = document.getElementById('txt-chamados-pendentes');

  const dados = await db.get('chamados',
    `?status=in.(aberto,em_andamento)&order=criado_em.desc&limit=20` +
    `&select=*,solicitante:usuarios!chamados_solicitante_id_fkey(nome,nivel),responsavel:usuarios!chamados_responsavel_id_fkey(nome)`
  );

  let lista = dados || [];
  // Aplica filtro de mes se ativo
  if (_chamMesFiltro) {
    lista = lista.filter(c => _mesKeyIso(c.criado_em) === _chamMesFiltro);
  }
  const abertos = lista.filter(c => c.status === 'aberto');

  // Atualiza badge da aba
  if (badge) { badge.textContent = lista.length; badge.style.display = lista.length ? 'inline-flex' : 'none'; }
  // Atualiza badge do menu
  if (navBadge) { navBadge.textContent = abertos.length; navBadge.style.display = abertos.length ? 'inline-flex' : 'none'; }
  // Atualiza alerta
  if (alerta) {
    alerta.style.display = abertos.length ? 'block' : 'none';
    if (txtAlerta) txtAlerta.textContent = `${abertos.length} chamado${abertos.length!==1?'s':''} aberto${abertos.length!==1?'s':''}`;
  }

  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-gray text-xs" style="text-align:center;padding:24px">✅ Nenhum chamado pendente no momento.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(c => {
    const sol = c.solicitante?.nome?.split(' ')[0] || '—';
    const nivelLabel = c.solicitante?.nivel === 2 ? 'Adm' : 'Vendas';
    const nivelCls = c.solicitante?.nivel === 2 ? 'badge-amber' : 'badge-blue';
    const urgCls = c.urgencia === 'alta' ? 'badge-red' : c.urgencia === 'media' ? 'badge-amber' : 'badge-blue';
    const urgLabel = c.urgencia === 'alta' ? 'Alta' : c.urgencia === 'media' ? 'Média' : 'Baixa';
    const stCls = c.status === 'aberto' ? 'badge-red' : 'badge-amber';
    const stLabel = c.status === 'aberto' ? 'Aberto' : 'Em andamento';
    const dt = new Date(c.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td><div class="font-semibold">${c.protocolo}</div></td>
      <td>${c.titulo}</td>
      <td>${sol} <span class="badge ${nivelCls}" style="margin-left:4px">${nivelLabel}</span></td>
      <td><span class="badge ${urgCls}">${urgLabel}</span></td>
      <td><span class="badge ${stCls}">${stLabel}</span></td>
      <td class="text-xs text-gray">${dt}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-xs btn-primary" onclick="abrirChamadoDetalhe('${c.id}')" title="Atender">📋</button>
        <button class="btn btn-xs btn-outline" style="color:var(--red)" onclick="excluirChamado('${c.id}','${(c.protocolo||'').replace(/'/g,'')}')" title="Excluir">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function excluirChamado(id, protocolo) {
  if (!confirm(`Excluir chamado ${protocolo}? Esta ação não pode ser desfeita.`)) return;
  await db.delete('chamados', id);
  showToast('🗑️ Chamado excluído.');
  carregarChamadosRecebidos();
  if (typeof carregarChamadosEnviados === 'function') carregarChamadosEnviados();
}

// ─── CARREGAR MEUS DOCUMENTOS ─────────────────────────────

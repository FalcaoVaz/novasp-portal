// ════════════════════════════════════════════════════
//  MÓDULO GESTÃO — Liderados, Avaliações, Metas, Bônus, 360
// ════════════════════════════════════════════════════

let _gestaoLiderados = [];    // liderados do CUR (quando CUR e lider)
let _gestaoMeuLider  = null;  // lider do CUR (quando CUR e colaborador)
let _gestaoPerguntas = [];    // perguntas padrao + custom
let _gestaoPergLider = [];    // perguntas avaliacao do lider
let _gestaoAvalAlvo  = null;  // colaborador sendo avaliado no momento
let _gestaoTarAlvo   = null;  // colaborador sendo gerenciado em tarefas/bonus
let _gestaoApurAlvo  = null;  // colaborador na apuracao atual
let _gestaoEditTarId = null;  // tarefa sendo editada
let _gestaoTarefas   = [];    // tarefas do colaborador alvo

function _periodoAtual(periodicidade){
  const d = new Date();
  if(periodicidade === 'trimestral'){
    const q = Math.floor(d.getMonth()/3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Periodo selecionado na tela de Avaliacoes. Default = trimestre atual,
// mas o lider pode voltar pra trimestres anteriores (ex: fechando
// avaliacoes atrasadas do Q2 ja dentro do Q3).
let _gestaoPeriodoAval = null;
function _periodoAvalSelecionado(){
  return _gestaoPeriodoAval || _periodoAtual('trimestral');
}
// Ultimos N trimestres (do atual pra tras), formato '2026-Q3'
function _periodosTrimestrais(n){
  const d = new Date();
  let ano = d.getFullYear();
  let q = Math.floor(d.getMonth()/3) + 1;
  const out = [];
  for (let i = 0; i < n; i++){
    out.push(`${ano}-Q${q}`);
    q--;
    if (q < 1){ q = 4; ano--; }
  }
  return out;
}
function mudarPeriodoAval(p){
  _gestaoPeriodoAval = p || null;
  carregarAvaliacoes();
}

// Converte periodo interno ('2026-Q2', '2026-05') para texto humano ('2º tri/2026', 'mai/2026')
function _formatPeriodo(p){
  if(!p) return '';
  let m = String(p).match(/^(\d{4})-Q(\d)$/);
  if(m){
    const ord = {'1':'1º','2':'2º','3':'3º','4':'4º'}[m[2]] || (m[2]+'º');
    return `${ord} tri/${m[1]}`;
  }
  m = String(p).match(/^(\d{4})-(\d{2})$/);
  if(m){
    const meses = ['','jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const mes = meses[parseInt(m[2],10)] || m[2];
    return `${mes}/${m[1]}`;
  }
  return p;
}

function _isAdmin(){ return !!CUR?.admin; }

// Prazo de entrega da avaliação trimestral: até o último dia do trimestre.
// A "cobrança" acende a partir de 15 dias antes desse fim.
function _prazoTrimestre(){
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const q = Math.floor(hoje.getMonth()/3);          // 0..3
  const mesFim = q*3 + 2;                            // mês final do tri (0=jan)
  const fim = new Date(hoje.getFullYear(), mesFim+1, 0); fim.setHours(0,0,0,0); // último dia do mês
  const inicioCobranca = new Date(fim); inicioCobranca.setDate(inicioCobranca.getDate()-15);
  const msDia = 86400000;
  const diasRestantes = Math.round((fim - hoje)/msDia);
  return {
    fim, inicioCobranca, diasRestantes,
    fimStr: fim.toLocaleDateString('pt-BR'),
    cobrando: hoje >= inicioCobranca && hoje <= fim,  // dentro da janela de 15 dias
    vencido: hoje > fim                               // passou do fim do tri
  };
}

// ────────────────────────────────────────────────────
// 1. LIDERADOS — CRUD da equipe
// ────────────────────────────────────────────────────
// Uma linha (colaborador) da tabela de liderados
function _linhaLiderado(l){
  const c = l.colaborador || {};
  const ini = (c.nome||'').split(' ').slice(0,2).map(n=>n[0]).join('');
  const cor = c.cor_avatar||'#1E2D4A';
  return `<tr style="border-top:1px solid var(--borda)">
    <td style="padding:10px"><div style="display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${ini}</div>
      <div><div style="font-weight:600">${c.nome||'—'}</div><div style="font-size:11px;color:#94a3b8">Nível ${c.nivel||'—'}</div></div>
    </div></td>
    <td style="padding:10px;font-size:13px">${c.dept||'—'}<div style="font-size:11px;color:#94a3b8">${c.email||'<span style="color:#dc2626">sem e-mail</span>'}</div></td>
    <td style="padding:10px;font-size:13px;color:#94a3b8">${l.data_inicio?new Date(l.data_inicio+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
    <td style="padding:10px;text-align:right;white-space:nowrap">
      <button class="btn btn-o bxs" onclick="abrirEditarColab('${c.id}')">Editar</button>
      <button class="btn btn-o bxs" style="color:var(--danger)" onclick="removerLiderado(${l.id},'${(c.nome||'').replace(/'/g,'')}')">Remover</button>
    </td>
  </tr>`;
}

// Tabela de liderados a partir de uma lista de vínculos
function _tabelaLiderados(arr){
  return `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:var(--bg);text-align:left">
      <th style="padding:10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Colaborador</th>
      <th style="padding:10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Departamento</th>
      <th style="padding:10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase">Desde</th>
      <th style="padding:10px"></th>
    </tr></thead>
    <tbody>${arr.map(_linhaLiderado).join('')}</tbody>
  </table>`;
}

async function carregarLiderados(){
  const el = document.getElementById('liderados-lista');
  if(!el) return;
  el.innerHTML = 'Carregando equipe...';
  try{
    const admin = _isAdmin();
    let q = '?ativo=eq.true&select=*,colaborador:usuarios!gestao_liderados_colaborador_id_fkey(id,nome,dept,cor_avatar,nivel,email),lider:usuarios!gestao_liderados_lider_id_fkey(id,nome,cor_avatar)';
    if(!admin) q += `&lider_id=eq.${CUR.id}`;
    const lista = await db.get('gestao_liderados', q);
    _gestaoLiderados = lista || [];
    if(!_gestaoLiderados.length){
      el.innerHTML = `<div class="empty"><div class="ei">👥</div><p>Nenhum liderado cadastrado.</p><p style="font-size:12px;color:#94a3b8;margin-top:8px">Clique em "+ Adicionar Liderado" para começar.</p></div>`;
      return;
    }
    // Líder comum: vê só a própria equipe, em uma tabela simples.
    if(!admin){
      el.innerHTML = _tabelaLiderados(_gestaoLiderados);
      return;
    }
    // Admin: visão geral de quem lidera quem, agrupado por líder.
    const grupos = {};
    _gestaoLiderados.forEach(l => {
      const lid = l.lider?.id || l.lider_id || 'sem';
      if(!grupos[lid]) grupos[lid] = { nome: l.lider?.nome || '— sem líder —', cor: l.lider?.cor_avatar||'#1E2D4A', itens: [] };
      grupos[lid].itens.push(l);
    });
    const ordenados = Object.values(grupos).sort((a,b)=>a.nome.localeCompare(b.nome));
    el.innerHTML = `<p style="font-size:13px;color:#64748b;margin-bottom:14px">👑 Visão de administrador — ${_gestaoLiderados.length} vínculo(s) em ${ordenados.length} líder(es). Cada bloco mostra quem é liderado direto de quem.</p>` +
      ordenados.map(g => {
        const ini = (g.nome||'').split(' ').slice(0,2).map(n=>n[0]).join('');
        return `<div style="margin-bottom:22px;border:1px solid var(--borda);border-radius:12px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-bottom:1px solid var(--borda)">
            <div style="width:34px;height:34px;border-radius:50%;background:${g.cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${ini}</div>
            <div><div style="font-weight:700">${g.nome}</div><div style="font-size:11px;color:#94a3b8">${g.itens.length} liderado(s) direto(s)</div></div>
          </div>
          ${_tabelaLiderados(g.itens)}
        </div>`;
      }).join('');
  }catch(e){
    console.error('[carregarLiderados]',e);
    el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
  }
}

async function abrirAddLiderado(){
  const sel = document.getElementById('lid-sel');
  if(!sel) return;
  // Mostra TODOS os usuarios cadastrados (menos eu mesmo e quem ja e da minha equipe).
  // Quem ja for liderado de outro lider aparece anotado e pode ser transferido.
  try{
    const [todos, jaLid] = await Promise.all([
      db.get('usuarios', '?select=id,nome,dept,nivel&order=nome.asc'),
      db.get('gestao_liderados', '?ativo=eq.true&select=colaborador_id,lider_id')
    ]);
    const liderDe = {};                        // colaborador_id -> lider_id atual
    (jaLid||[]).forEach(x => { liderDe[x.colaborador_id] = x.lider_id; });
    const nomeUsr = {};                        // id -> nome (para anotar o lider)
    (todos||[]).forEach(u => { nomeUsr[u.id] = u.nome; });
    const disponiveis = (todos||[]).filter(u =>
      u.id !== CUR.id &&                         // nao a si mesmo
      String(liderDe[u.id]) !== String(CUR.id)  // nao quem ja e da minha equipe
    );
    if(!disponiveis.length){
      sel.innerHTML = '<option value="">— nenhum colaborador disponível —</option>';
    } else {
      sel.innerHTML = '<option value="">— selecione —</option>' +
        disponiveis.map(u => {
          const outro = liderDe[u.id] && String(liderDe[u.id]) !== String(CUR.id);
          const tag = outro
            ? ` — (equipe de ${nomeUsr[liderDe[u.id]] || 'outro líder'})`
            : (u.dept ? ' — '+u.dept : '');
          return `<option value="${u.id}">${u.nome}${tag}</option>`;
        }).join('');
    }
    openM('m-add-lid');
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function salvarLiderado(){
  const colabId = document.getElementById('lid-sel')?.value;
  if(!colabId){ toast('Selecione um colaborador.','err'); return; }
  const hoje = new Date().toISOString().slice(0,10);
  try{
    // TODOS os vinculos deste colaborador (ativos E inativos) — pode haver linha antiga
    // de quando ele ja foi liderado e depois removido. Reaproveitamos a linha em vez de
    // inserir outra (evita falha por restricao unica em colaborador_id).
    const todos = await db.get('gestao_liderados',
      `?colaborador_id=eq.${colabId}&select=id,lider_id,ativo&order=id.desc`);
    const ativos   = (todos||[]).filter(r => r.ativo);
    const jaMinha  = ativos.find(r => String(r.lider_id) === String(CUR.id));
    if(jaMinha){
      closeM('m-add-lid');
      toast('Esse colaborador já está na sua equipe.','ok');
      carregarLiderados();
      return;
    }
    // Se esta ativo com outro lider, confirma a transferencia
    const deOutro = ativos.find(r => String(r.lider_id) !== String(CUR.id));
    if(deOutro){
      if(!confirm('Este colaborador já faz parte da equipe de outro líder. Deseja transferi-lo para a sua equipe?')) return;
    }
    // Reaproveita uma linha existente (preferindo a ativa de outro lider), senao a mais recente.
    const reaproveitar = deOutro || (todos||[])[0];
    if(reaproveitar){
      await db.patch('gestao_liderados', reaproveitar.id,
        { lider_id: CUR.id, ativo:true, data_inicio: hoje, data_fim: null });
    } else {
      await db.post('gestao_liderados',
        { lider_id: CUR.id, colaborador_id: colabId, ativo:true, data_inicio: hoje });
    }
    closeM('m-add-lid');
    toast('✅ Liderado adicionado!','ok');
    carregarLiderados();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function removerLiderado(id, nome){
  if(!confirm(`Remover ${nome} da sua equipe?`)) return;
  try{
    await db.patch('gestao_liderados', id, { ativo:false, data_fim: new Date().toISOString().slice(0,10) });
    toast('🗑️ Removido.','ok');
    carregarLiderados();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// Novo funcionario — cria registro em usuarios + vincula como liderado
function abrirNovoFuncionario(){
  ['nf-nome','nf-email','nf-dept'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('nf-nivel').value = '2';
  openM('m-novo-func');
}

async function salvarNovoFuncionario(){
  const nome  = document.getElementById('nf-nome')?.value?.trim();
  const email = document.getElementById('nf-email')?.value?.trim() || null;
  const dept  = document.getElementById('nf-dept')?.value?.trim() || '';
  const nivel = parseInt(document.getElementById('nf-nivel')?.value || '2', 10);
  if(!nome){ toast('Informe o nome.','err'); return; }
  try{
    // Cria usuario APENAS para avaliacao — sem acesso ao Portal (login bloqueado).
    // Email e opcional pois nao ha login; os acessos ficam todos desligados.
    const novo = await db.post('usuarios', {
      nome, email, dept, nivel,
      judicial: false, admin: false,
      acesso_juridico: false, acesso_interno: false, acesso_calendar: false,
      cor_avatar: '#1E4D99', primeiro_acesso: false, quota_tokens: 0, tokens_usados: 0
    });
    const novoId = novo?.[0]?.id;
    if(!novoId){ toast('Erro ao criar usuario','err'); return; }
    // Vincula como liderado do CUR
    await db.post('gestao_liderados', { lider_id: CUR.id, colaborador_id: novoId, ativo: true });
    closeM('m-novo-func');
    toast(`✅ ${nome} adicionado à sua equipe (acesso apenas a Avaliação & Feedback).`,'ok');
    carregarLiderados();
  }catch(e){
    console.error('[salvarNovoFuncionario]',e);
    const msg = (e.message||'').includes('email') && (e.message||'').includes('duplicate')
      ? 'Email ja cadastrado.'
      : e.message;
    toast('Erro: '+msg,'err');
  }
}

// Editar dados do colaborador (nome / email / departamento)
let _gestaoEditColabId = null;
function abrirEditarColab(colabId){
  const l = _gestaoLiderados.find(x => String(x.colaborador?.id) === String(colabId));
  const c = l?.colaborador || {};
  _gestaoEditColabId = colabId;
  document.getElementById('ec-nome').value  = c.nome  || '';
  document.getElementById('ec-email').value = c.email || '';
  document.getElementById('ec-dept').value  = c.dept  || '';
  openM('m-edit-colab');
}

async function salvarEditarColab(){
  if(!_gestaoEditColabId){ toast('Nada para salvar.','err'); return; }
  const nome  = document.getElementById('ec-nome')?.value?.trim();
  const email = document.getElementById('ec-email')?.value?.trim();
  const dept  = document.getElementById('ec-dept')?.value?.trim() || '';
  if(!nome){ toast('Informe o nome.','err'); return; }
  if(!email){ toast('Informe o email.','err'); return; }
  try{
    await db.patch('usuarios', _gestaoEditColabId, { nome, email, dept });
    closeM('m-edit-colab');
    toast('✅ Dados atualizados!','ok');
    carregarLiderados();
  }catch(e){
    const msg = (e.message||'').includes('duplicate') ? 'Email já cadastrado em outra conta.' : e.message;
    toast('Erro: '+msg,'err');
  }
}

// Historico de avaliacoes + apuracoes do colaborador
async function abrirHistoricoColab(colabId, nome){
  document.getElementById('hist-titulo').textContent = `📈 Histórico — ${nome}`;
  const el = document.getElementById('hist-conteudo');
  el.innerHTML = 'Carregando...';
  openM('m-historico');
  try{
    const [avals, apurs] = await Promise.all([
      db.get('gestao_avaliacoes', `?colaborador_id=eq.${colabId}&order=periodo.desc&limit=20`),
      db.get('gestao_bonus_apuracoes', `?colaborador_id=eq.${colabId}&order=periodo.desc&limit=20`)
    ]);
    const perg = await db.get('gestao_perguntas', `?or=(colaborador_id.is.null,colaborador_id.eq.${colabId})&ativa=eq.true&tipo=eq.escala`);
    const pergById = {}; (perg||[]).forEach(p => pergById[p.id]=p);

    const calcMedia = (resp) => {
      const escalas = Object.entries(resp||{}).filter(([k,v]) => pergById[k]?.tipo==='escala').map(([k,v]) => parseInt(v,10));
      if(!escalas.length) return null;
      return (escalas.reduce((a,b)=>a+b,0) / escalas.length).toFixed(2);
    };

    if(!avals?.length && !apurs?.length){
      el.innerHTML = `<div class="empty"><div class="ei">📊</div><p>Sem histórico ainda. Primeira avaliação ou bônus aparecerá aqui.</p></div>`;
      return;
    }

    // Combina por periodo
    const periodos = new Set([
      ...(avals||[]).map(a => a.periodo),
      ...(apurs||[]).map(a => a.periodo)
    ]);
    const ordered = Array.from(periodos).sort().reverse();
    const avalByP = {}; (avals||[]).forEach(a => avalByP[a.periodo]=a);
    const apurByP = {}; (apurs||[]).forEach(a => apurByP[a.periodo]=a);

    let html = '<div style="position:relative;padding-left:24px">';
    html += '<div style="position:absolute;left:8px;top:8px;bottom:8px;width:2px;background:var(--borda)"></div>';
    ordered.forEach(p => {
      const av = avalByP[p];
      const ap = apurByP[p];
      const media = av ? calcMedia(av.respostas) : null;
      html += `<div style="position:relative;margin-bottom:18px;padding-left:18px">
        <div style="position:absolute;left:-8px;top:6px;width:14px;height:14px;border-radius:50%;background:${av?.status==='finalizada'?'#16a34a':av?'#f59e0b':'#94a3b8'};border:2px solid #fff;box-shadow:0 0 0 2px var(--borda)"></div>
        <div style="font-weight:700;font-size:14px">${_formatPeriodo(p)} <span style="font-size:11px;color:#94a3b8;font-weight:400">${p}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
          <div style="padding:10px;background:var(--bg);border-radius:8px">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Avaliação</div>
            ${av ? `<div style="margin-top:4px;font-size:13px">Status: <strong>${av.status==='finalizada'?'✅ Finalizada':'✏️ Rascunho'}</strong></div>
                  ${media ? `<div style="font-size:13px">Média escalas: <strong style="color:#1E4D99">${media}/5</strong></div>` : ''}` : '<div style="margin-top:4px;font-size:12px;color:#94a3b8">Não avaliado</div>'}
          </div>
          <div style="padding:10px;background:var(--bg);border-radius:8px">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Bônus</div>
            ${ap ? `<div style="margin-top:4px;font-size:13px">${ap.pontos_total||0}/${ap.pontos_max||0} pts (${ap.pontos_max?((ap.pontos_total/ap.pontos_max)*100).toFixed(0):0}%)</div>
                  <div style="font-size:13px;font-weight:700;color:#16a34a">R$ ${Number(ap.valor_calculado||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                  <div style="font-size:11px;color:${ap.pago?'#16a34a':'#94a3b8'}">${ap.pago?'✅ Pago em '+(ap.data_pagamento||'—'):ap.status}</div>` : '<div style="margin-top:4px;font-size:12px;color:#94a3b8">Sem apuração</div>'}
          </div>
        </div>
        ${av?.observacoes ? `<div style="margin-top:8px;padding:8px 10px;background:#fef9e7;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;font-size:12px"><strong>Obs:</strong> ${av.observacoes.replace(/</g,'&lt;')}</div>` : ''}
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
  }catch(e){ console.error('[abrirHistoricoColab]',e); el.innerHTML = `Erro: ${e.message}`; }
}

// ────────────────────────────────────────────────────
// 2. AVALIAÇÕES — formulario trimestral pelo lider
// ────────────────────────────────────────────────────
async function carregarAvaliacoes(){
  const el = document.getElementById('avaliacoes-lista');
  if(!el) return;
  el.innerHTML = 'Carregando...';
  try{
    let q = '?ativo=eq.true&select=*,colaborador:usuarios!gestao_liderados_colaborador_id_fkey(id,nome,cor_avatar,dept)';
    if(!_isAdmin()) q += `&lider_id=eq.${CUR.id}`;
    const lista = await db.get('gestao_liderados', q);
    _gestaoLiderados = lista || [];
    if(!_gestaoLiderados.length){
      el.innerHTML = `<div class="empty"><div class="ei">📝</div><p>Cadastre liderados antes para começar as avaliações.</p></div>`;
      return;
    }
    const periodo = _periodoAvalSelecionado();
    const ehPeriodoAtual = periodo === _periodoAtual('trimestral');
    const ids = _gestaoLiderados.map(l => l.colaborador?.id).filter(Boolean);
    const avals = ids.length
      ? await db.get('gestao_avaliacoes', `?periodo=eq.${periodo}&colaborador_id=in.(${ids.join(',')})`)
      : [];
    const byColab = {};
    (avals||[]).forEach(a => byColab[a.colaborador_id] = a);

    // Prazo / cobrança trimestral — so cobra quando olhando o periodo ATUAL
    const prazo = _prazoTrimestre();
    const pendentes = _gestaoLiderados.filter(l => byColab[l.colaborador?.id]?.status !== 'finalizada').length;
    let aviso = '';
    if(ehPeriodoAtual && pendentes > 0 && prazo.vencido){
      aviso = `<div style="padding:12px 14px;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;margin-bottom:14px;font-size:13px;color:#991b1b">
        ⛔ <strong>Avaliações em atraso.</strong> O prazo do trimestre encerrou em <strong>${prazo.fimStr}</strong> e você ainda tem <strong>${pendentes}</strong> avaliação(ões) não finalizada(s). Finalize o quanto antes.</div>`;
    } else if(ehPeriodoAtual && pendentes > 0 && prazo.cobrando){
      aviso = `<div style="padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #d97706;border-radius:8px;margin-bottom:14px;font-size:13px;color:#92400e">
        ⏰ <strong>Prazo de entrega se aproximando.</strong> As avaliações deste trimestre devem ser finalizadas até <strong>${prazo.fimStr}</strong> (faltam <strong>${prazo.diasRestantes}</strong> dia(s)). Há <strong>${pendentes}</strong> pendente(s).</div>`;
    } else if(!ehPeriodoAtual && pendentes > 0){
      aviso = `<div style="padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:8px;margin-bottom:14px;font-size:13px;color:#1e40af">
        📌 Você está avaliando um <strong>trimestre anterior</strong> (${_formatPeriodo(periodo)}). Há <strong>${pendentes}</strong> avaliação(ões) não finalizada(s) nesse período.</div>`;
    }

    const selPeriodo = `<select onchange="mudarPeriodoAval(this.value)" style="padding:6px 12px;border:1.5px solid var(--borda);border-radius:8px;font-size:13px;font-weight:600">
      ${_periodosTrimestrais(6).map(p => `<option value="${p}" ${p===periodo?'selected':''}>${_formatPeriodo(p)}${p===_periodoAtual('trimestral')?' (atual)':''}</option>`).join('')}
    </select>`;

    el.innerHTML = aviso + `<p style="font-size:13px;color:#64748b;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">Período da avaliação: ${selPeriodo} <span style="color:#94a3b8">(${periodo})</span>${ehPeriodoAtual?` · Entrega até <strong>${prazo.fimStr}</strong>`:''}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${_gestaoLiderados.map(l => {
        const c = l.colaborador || {};
        const av = byColab[c.id];
        const ini = (c.nome||'').split(' ').slice(0,2).map(n=>n[0]).join('');
        const cor = c.cor_avatar||'#1E2D4A';
        const sb = av?.status === 'finalizada' ? 'b-green' : av?.status === 'rascunho' ? 'b-amber' : 'b-gray';
        const sl = av?.status === 'finalizada' ? '✅ Finalizada' : av?.status === 'rascunho' ? '✏️ Rascunho' : '— Pendente';
        const nomeEsc = (c.nome||'').replace(/'/g,'');
        const cobrar = (prazo.cobrando || prazo.vencido) && av?.status !== 'finalizada';
        const notaPrazo = cobrar
          ? `<div style="font-size:11px;font-weight:600;color:${prazo.vencido?'#dc2626':'#d97706'};margin-bottom:8px">${prazo.vencido?'⛔ Em atraso':'⏰ Entregar até '+prazo.fimStr}</div>`
          : '';
        return `<div style="padding:16px;border:1px solid ${cobrar?(prazo.vencido?'#fecaca':'#fde68a'):'var(--borda)'};border-radius:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="width:42px;height:42px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${ini}</div>
            <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome||'—'}</div>
              <div style="font-size:11px;color:#94a3b8">${c.dept||'—'}</div></div>
          </div>
          <div style="margin-bottom:12px"><span class="badge ${sb}">${sl}</span></div>
          ${notaPrazo}
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-p bsm" style="flex:1;min-width:90px" onclick="abrirAvaliacao('${c.id}','${nomeEsc}')">${av?'Editar':'Avaliar'}</button>
            <button class="btn btn-o bsm" onclick="abrirCriterios('${c.id}','${nomeEsc}')">📋 Critérios</button>
            <button class="btn btn-o bsm" onclick="abrirHistoricoColab('${c.id}','${nomeEsc}')">📈 Histórico</button>
            ${av?.status==='finalizada'?`<button class="btn btn-o bsm" onclick="gerarTermoAvaliacaoFinalizada('${c.id}','${nomeEsc}')">📄 Termo</button>`:''}
          </div>
        </div>`;
      }).join('')}
      </div>`;
  }catch(e){ console.error('[carregarAvaliacoes]',e); el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`; }
}

async function abrirAvaliacao(colabId, nome){
  _gestaoAvalAlvo = { id: colabId, nome };
  document.getElementById('aval-titulo').textContent = `Avaliação Trimestral — ${nome}`;
  const form = document.getElementById('aval-form');
  form.innerHTML = 'Carregando...';
  try{
    const perg = await db.get('gestao_perguntas',
      `?or=(colaborador_id.is.null,colaborador_id.eq.${colabId})&ativa=eq.true&order=ordem.asc`);
    _gestaoPerguntas = perg || [];
    const periodo = _periodoAvalSelecionado();
    const avalExist = await db.get('gestao_avaliacoes',
      `?colaborador_id=eq.${colabId}&periodo=eq.${periodo}&limit=1`);
    const aval = avalExist?.[0];
    const resp = aval?.respostas || {};

    const blocos = ['comprometimento','qualidade','relacionamento','desenvolvimento','reflexao','plano','custom'];
    const labels = {
      comprometimento:{t:'A — Comprometimento e atitude',ic:'🎯'},
      qualidade:      {t:'B — Qualidade do trabalho',     ic:'⭐'},
      relacionamento: {t:'C — Relacionamento',            ic:'🤝'},
      desenvolvimento:{t:'D — Pontos de melhoria & desenvolvimento', ic:'📈'},
      reflexao:       {t:'E — Reflexão do trimestre',     ic:'💭'},
      plano:          {t:'F — Plano de ação',             ic:'🚀'},
      custom:         {t:'G — Perguntas específicas',     ic:'📋'}
    };

    let html = `<div style="padding:12px 14px;background:linear-gradient(90deg,#2a4070,#4a6090);color:#fff;border-radius:10px;margin-bottom:18px">
      <div style="font-size:13px;opacity:.9">Avaliação trimestral</div>
      <div style="font-size:18px;font-weight:700">${_formatPeriodo(periodo)}</div>
      <div style="font-size:11px;opacity:.8;margin-top:4px">${periodo} · Escala 1 (insatisfatório) — 5 (excelente). Salve rascunho para continuar depois.</div>
    </div>`;
    for (const b of blocos){
      const pergsB = _gestaoPerguntas.filter(p => (p.bloco||'custom') === b);
      if(!pergsB.length) continue;
      const lab = labels[b] || {t:b,ic:'•'};
      html += `<div style="margin-bottom:18px;border:1px solid var(--borda);border-radius:10px;overflow:hidden">
        <div style="padding:10px 14px;background:var(--bg);font-weight:700;font-size:13px;color:#1e293b">${lab.ic} ${lab.t}</div>
        <div style="padding:14px">`;
      for (const p of pergsB){
        const v = resp[p.id] ?? '';
        if(p.tipo === 'escala'){
          html += `<div style="margin-bottom:14px">
            <div style="font-size:13px;margin-bottom:6px">${p.pergunta}</div>
            <div style="display:flex;gap:6px">
              ${[1,2,3,4,5].map(n => {
                const sel = String(v)===String(n);
                return `<label style="flex:1;display:flex;align-items:center;justify-content:center;height:38px;border:1.5px solid ${sel?'#2a4070':'var(--borda)'};background:${sel?'#2a4070':'#fff'};color:${sel?'#fff':'#64748b'};border-radius:8px;font-weight:600;cursor:pointer;transition:all .15s">
                  <input type="radio" name="p${p.id}" value="${n}" ${sel?'checked':''} style="display:none">
                  ${n}
                </label>`;
              }).join('')}
            </div>
          </div>`;
        } else if(p.tipo === 'texto'){
          html += `<div style="margin-bottom:14px">
            <label style="font-size:13px;display:block;margin-bottom:6px;font-weight:500">${p.pergunta}${p.obrigatoria?' <span style="color:#dc2626">*</span>':''}</label>
            <textarea name="p${p.id}" rows="3" style="width:100%;padding:10px;border:1px solid var(--borda);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical">${(v||'').replace(/</g,'&lt;')}</textarea>
          </div>`;
        } else if(p.tipo === 'sim_nao'){
          html += `<div style="margin-bottom:14px"><div style="font-size:13px;margin-bottom:6px">${p.pergunta}</div>
            <div style="display:flex;gap:6px">
              <label style="flex:1;display:flex;align-items:center;justify-content:center;height:38px;border:1.5px solid ${v==='sim'?'#16a34a':'var(--borda)'};background:${v==='sim'?'#16a34a':'#fff'};color:${v==='sim'?'#fff':'#64748b'};border-radius:8px;font-weight:600;cursor:pointer"><input type="radio" name="p${p.id}" value="sim" ${v==='sim'?'checked':''} style="display:none">Sim</label>
              <label style="flex:1;display:flex;align-items:center;justify-content:center;height:38px;border:1.5px solid ${v==='nao'?'#dc2626':'var(--borda)'};background:${v==='nao'?'#dc2626':'#fff'};color:${v==='nao'?'#fff':'#64748b'};border-radius:8px;font-weight:600;cursor:pointer"><input type="radio" name="p${p.id}" value="nao" ${v==='nao'?'checked':''} style="display:none">Não</label>
            </div></div>`;
        }
      }
      html += `</div></div>`;
    }
    html += `<div style="margin-bottom:14px;border:1px solid var(--borda);border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;background:var(--bg);font-weight:700;font-size:13px;color:#1e293b">📝 Observações finais</div>
      <div style="padding:14px">
        <textarea id="aval-obs" rows="4" style="width:100%;padding:10px;border:1px solid var(--borda);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical">${(aval?.observacoes||'').replace(/</g,'&lt;')}</textarea>
      </div>
    </div>
    <button class="btn btn-o bsm" onclick="abrirAddPerguntaCustom('${colabId}','${nome.replace(/'/g,"")}')">+ Adicionar pergunta específica</button>`;
    form.innerHTML = html;
    // Click handler: marca radio + atualiza estilos do grupo SEM re-renderizar (preserva textareas)
    form.querySelectorAll('input[type=radio]').forEach(inp => {
      inp.addEventListener('change', e => {
        const name = e.target.name;
        const isEscala = /^\d$/.test(e.target.value);
        form.querySelectorAll(`input[name="${name}"]`).forEach(other => {
          const label = other.closest('label');
          if (!label) return;
          const sel = other.checked;
          if (isEscala) {
            label.style.borderColor = sel ? '#2a4070' : 'var(--borda)';
            label.style.background  = sel ? '#2a4070' : '#fff';
            label.style.color       = sel ? '#fff'    : '#64748b';
          } else {
            const cor = other.value==='sim' ? '#16a34a' : '#dc2626';
            label.style.borderColor = sel ? cor : 'var(--borda)';
            label.style.background  = sel ? cor : '#fff';
            label.style.color       = sel ? '#fff' : '#64748b';
          }
        });
      });
    });
    // Tambem cobre clique direto no label (sem disparar change se o radio ja estava checked)
    form.querySelectorAll('label').forEach(lab => {
      lab.addEventListener('click', () => {
        const inp = lab.querySelector('input[type=radio]');
        if (inp && !inp.checked) {
          inp.checked = true;
          inp.dispatchEvent(new Event('change', {bubbles:true}));
        }
      });
    });
    openM('m-avaliacao');
  }catch(e){ console.error('[abrirAvaliacao]',e); form.innerHTML = `Erro: ${e.message}`; }
}

async function abrirAddPerguntaCustom(colabId, nome){
  const p = prompt(`Nova pergunta específica para ${nome}:\n(será tipo escala 1-5)`);
  if(!p || !p.trim()) return;
  try{
    await db.post('gestao_perguntas', {
      ordem: 1000, bloco: 'custom', pergunta: p.trim(),
      tipo:'escala', obrigatoria:false, colaborador_id: colabId, criado_por: CUR.id, ativa: true
    });
    abrirAvaliacao(colabId, nome); // recarrega o form
    toast('✅ Pergunta adicionada.','ok');
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// CRITÉRIOS — gestao de perguntas custom por colaborador
// ────────────────────────────────────────────────────
let _gestaoCritAlvo = null; // colaborador atual no modal de criterios

async function abrirCriterios(colabId, nome){
  _gestaoCritAlvo = { id: colabId, nome };
  document.getElementById('crit-titulo').textContent = `📋 Critérios — ${nome}`;
  document.getElementById('crit-pergunta').value = '';
  document.getElementById('crit-tipo').value = 'escala';
  document.getElementById('crit-obrig').checked = false;
  openM('m-criterios');
  await _renderCriterios();
}

async function _renderCriterios(){
  const el = document.getElementById('crit-lista');
  if(!el || !_gestaoCritAlvo) return;
  el.innerHTML = 'Carregando critérios...';
  try{
    const list = await db.get('gestao_perguntas',
      `?colaborador_id=eq.${_gestaoCritAlvo.id}&ativa=eq.true&order=ordem.asc`);
    if(!list?.length){
      el.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:18px;font-size:13px">Nenhum critério específico cadastrado ainda.</div>`;
      return;
    }
    el.innerHTML = `<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:8px">Critérios específicos deste colaborador (${list.length})</div>` +
      list.map(p => {
        const tipoLabel = p.tipo==='escala'?'Escala 1-5':p.tipo==='texto'?'Texto':'Sim/Não';
        return `<div style="padding:10px 12px;border:1px solid var(--borda);border-radius:8px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1">
            <div style="font-size:13px;color:#1e293b">${p.pergunta.replace(/</g,'&lt;')}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px">${tipoLabel}${p.obrigatoria?' · obrigatória':''}</div>
          </div>
          <button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirCriterio(${p.id})">🗑️</button>
        </div>`;
      }).join('');
  }catch(e){ el.innerHTML = `Erro: ${e.message}`; }
}

async function adicionarCriterio(){
  if(!_gestaoCritAlvo) return;
  const pergunta = document.getElementById('crit-pergunta')?.value?.trim();
  const tipo = document.getElementById('crit-tipo')?.value || 'escala';
  const obrig = document.getElementById('crit-obrig')?.checked || false;
  if(!pergunta){ toast('Informe a pergunta.','err'); return; }
  try{
    await db.post('gestao_perguntas', {
      ordem: 1000, bloco: 'custom', pergunta, tipo, obrigatoria: obrig,
      colaborador_id: _gestaoCritAlvo.id, criado_por: CUR.id, ativa: true
    });
    document.getElementById('crit-pergunta').value = '';
    document.getElementById('crit-obrig').checked = false;
    toast('✅ Critério adicionado.','ok');
    await _renderCriterios();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function excluirCriterio(id){
  if(!confirm('Excluir este critério? Avaliações já feitas mantêm a resposta histórica.')) return;
  try{
    await db.patch('gestao_perguntas', id, { ativa: false });
    toast('🗑️ Critério removido.','ok');
    await _renderCriterios();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function salvarAvaliacao(status){
  if(!_gestaoAvalAlvo) return;
  const respostas = {};
  for (const p of _gestaoPerguntas){
    if(p.tipo === 'texto'){
      const el = document.querySelector(`[name="p${p.id}"]`);
      if(el && el.value.trim()) respostas[p.id] = el.value.trim();
    } else {
      const el = document.querySelector(`input[name="p${p.id}"]:checked`);
      if(el) respostas[p.id] = el.value;
    }
  }
  const obs = document.getElementById('aval-obs')?.value || '';
  const periodo = _periodoAvalSelecionado();
  try{
    // Tenta atualizar existente; se nao houver, insere
    const exist = await db.get('gestao_avaliacoes', `?colaborador_id=eq.${_gestaoAvalAlvo.id}&periodo=eq.${periodo}&limit=1`);
    if (exist?.length){
      await db.patch('gestao_avaliacoes', exist[0].id, {
        respostas, observacoes: obs, status,
        finalizada_em: status==='finalizada' ? new Date().toISOString() : null
      });
    } else {
      await db.post('gestao_avaliacoes', {
        colaborador_id: _gestaoAvalAlvo.id, lider_id: CUR.id, periodo,
        respostas, observacoes: obs, status,
        finalizada_em: status==='finalizada' ? new Date().toISOString() : null
      });
    }
    closeM('m-avaliacao');
    toast(status==='finalizada' ? '✅ Avaliação finalizada!' : '💾 Rascunho salvo','ok');
    carregarAvaliacoes();
    if(status==='finalizada' && confirm('Avaliação finalizada! Deseja gerar o termo em PDF para assinatura das partes?')){
      const dept = (_gestaoLiderados.find(l=>String(l.colaborador?.id)===String(_gestaoAvalAlvo.id))?.colaborador?.dept) || '';
      _imprimirTermo(_montarTermoHtml({
        colab:_gestaoAvalAlvo.nome, dept, lider:CUR?.nome||'', periodo,
        perguntas:_gestaoPerguntas, respostas, obs, status:'finalizada'
      }));
    }
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// 3. METAS / TAREFAS BÔNUS (modelo Letícia)
// ────────────────────────────────────────────────────
async function carregarMetasBonus(){
  const el = document.getElementById('metas-lista');
  if(!el) return;
  el.innerHTML = 'Carregando...';
  try{
    let q = '?ativo=eq.true&select=*,colaborador:usuarios!gestao_liderados_colaborador_id_fkey(id,nome,cor_avatar)';
    if(!_isAdmin()) q += `&lider_id=eq.${CUR.id}`;
    const lista = await db.get('gestao_liderados', q);
    _gestaoLiderados = lista || [];
    if(!_gestaoLiderados.length){ el.innerHTML = `<div class="empty"><div class="ei">🎯</div><p>Cadastre liderados antes.</p></div>`; return; }

    // Para cada liderado, busca tarefas e config de bonus
    const html = await Promise.all(_gestaoLiderados.map(async l => {
      const c = l.colaborador || {};
      const [tar, cfg] = await Promise.all([
        db.get('gestao_tarefas_bonus', `?colaborador_id=eq.${c.id}&ativa=eq.true&order=ordem.asc`),
        db.get('gestao_bonus_config', `?colaborador_id=eq.${c.id}&limit=1`)
      ]);
      const cfgB = (cfg||[])[0] || { ativo:false, valor_max:0, periodicidade:'mensal' };
      const totalPontos = (tar||[]).reduce((s,t)=>s+(t.pontos_max||0),0);
      const cor = c.cor_avatar||'#1E2D4A';
      const ini = (c.nome||'').split(' ').slice(0,2).map(n=>n[0]).join('');
      // Indicador 100 pts: verde=100, amarelo=proximo (90-110), vermelho=longe
      let pctCor = '#16a34a', pctLabel = '✅';
      if (totalPontos !== 100) {
        if (Math.abs(totalPontos - 100) <= 10) { pctCor = '#f59e0b'; pctLabel = '⚠️'; }
        else { pctCor = '#dc2626'; pctLabel = '⚠️'; }
      }
      return `<div style="margin-bottom:24px;border:1px solid var(--borda);border-radius:10px;overflow:hidden">
        <div style="padding:14px;background:var(--bg);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${ini}</div>
            <div><div style="font-weight:700">${c.nome||'—'}</div>
              <div style="font-size:12px;color:#64748b">${(tar||[]).length} tarefa(s) · <strong style="color:${pctCor}">${pctLabel} ${totalPontos}/100 pts</strong> · Bônus ${cfgB.ativo?'<span style="color:#16a34a">ativo</span>':'inativo'} · ${cfgB.periodicidade}</div>
              ${totalPontos !== 100 ? `<div style="font-size:11px;color:${pctCor};margin-top:2px">Recomendado: soma das tarefas = 100 pontos (atual: ${totalPontos})</div>` : ''}
            </div>
          </div>
          <div class="flex aic g2">
            <button class="btn btn-o bxs" onclick="abrirConfigBonus('${c.id}','${(c.nome||'').replace(/'/g,'')}')">⚙️ Config Bônus</button>
            <button class="btn btn-p bxs" onclick="abrirTarefaBonus('${c.id}','${(c.nome||'').replace(/'/g,'')}')">+ Tarefa</button>
          </div>
        </div>
        <div style="padding:6px 0">${(tar||[]).length?
          (tar.map(t => `<div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--borda)">
            <div style="flex:1">
              <div style="font-size:13px">${t.descricao||'—'}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px">${t.pontos_max} pts · ${t.frequencia||'—'}</div>
            </div>
            <div class="flex aic g2">
              <button class="btn btn-o bxs" onclick="abrirTarefaBonus('${c.id}','${(c.nome||'').replace(/'/g,'')}',${t.id})">✏️</button>
              <button class="btn btn-o bxs" style="color:var(--danger)" onclick="excluirTarefaBonus(${t.id},'${c.id}','${(c.nome||'').replace(/'/g,'')}')">🗑️</button>
            </div>
          </div>`).join(''))
          : `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px">Sem tarefas cadastradas. Clique em "+ Tarefa".</div>`
        }</div>
      </div>`;
    }));
    el.innerHTML = html.join('');
  }catch(e){ console.error('[carregarMetasBonus]',e); el.innerHTML = `Erro: ${e.message}`; }
}

function abrirTarefaBonus(colabId, nome, tarId){
  _gestaoTarAlvo = { id: colabId, nome };
  _gestaoEditTarId = tarId || null;
  document.getElementById('tar-bonus-titulo').textContent = (tarId?'Editar':'+ Nova')+' Tarefa — '+nome;
  if(tarId){
    db.get('gestao_tarefas_bonus', `?id=eq.${tarId}&limit=1`).then(r => {
      const t = r?.[0] || {};
      document.getElementById('tar-bonus-desc').value = t.descricao||'';
      document.getElementById('tar-bonus-pontos').value = t.pontos_max||0;
      document.getElementById('tar-bonus-freq').value = t.frequencia||'Diário';
    });
  } else {
    document.getElementById('tar-bonus-desc').value = '';
    document.getElementById('tar-bonus-pontos').value = 50;
    document.getElementById('tar-bonus-freq').value = 'Semanal';
  }
  openM('m-tarefa-bonus');
}

async function salvarTarefaBonus(){
  const desc = document.getElementById('tar-bonus-desc').value.trim();
  const pontos = parseInt(document.getElementById('tar-bonus-pontos').value || '0', 10);
  const freq = document.getElementById('tar-bonus-freq').value;
  if(!desc){ toast('Informe a descrição.','err'); return; }
  try{
    if(_gestaoEditTarId){
      await db.patch('gestao_tarefas_bonus', _gestaoEditTarId, {descricao:desc, pontos_max:pontos, frequencia:freq});
    } else {
      await db.post('gestao_tarefas_bonus', {
        colaborador_id: _gestaoTarAlvo.id, descricao: desc, pontos_max: pontos, frequencia: freq, ativa: true
      });
    }
    closeM('m-tarefa-bonus');
    _gestaoEditTarId = null;
    toast('✅ Tarefa salva.','ok');
    carregarMetasBonus();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function excluirTarefaBonus(id, colabId, nome){
  if(!confirm('Excluir esta tarefa?')) return;
  try{
    await db.patch('gestao_tarefas_bonus', id, { ativa: false });
    toast('🗑️ Tarefa excluída.','ok');
    carregarMetasBonus();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

function abrirConfigBonus(colabId, nome){
  _gestaoTarAlvo = { id: colabId, nome };
  db.get('gestao_bonus_config', `?colaborador_id=eq.${colabId}&limit=1`).then(r => {
    const c = r?.[0] || {};
    document.getElementById('cfg-bonus-ativo').checked = !!c.ativo;
    document.getElementById('cfg-bonus-valor').value = c.valor_max || 500;
    document.getElementById('cfg-bonus-period').value = c.periodicidade || 'mensal';
    openM('m-config-bonus');
  });
}

async function salvarConfigBonus(){
  const ativo = document.getElementById('cfg-bonus-ativo').checked;
  const valor = parseFloat(document.getElementById('cfg-bonus-valor').value || '0');
  const period = document.getElementById('cfg-bonus-period').value;
  try{
    // Calcula pontos_max somando tarefas ativas
    const tar = await db.get('gestao_tarefas_bonus', `?colaborador_id=eq.${_gestaoTarAlvo.id}&ativa=eq.true&select=pontos_max`);
    const pontosMax = (tar||[]).reduce((s,t)=>s+(t.pontos_max||0),0);
    // Upsert
    const exist = await db.get('gestao_bonus_config', `?colaborador_id=eq.${_gestaoTarAlvo.id}&limit=1`);
    if (exist?.length){
      await db.patch('gestao_bonus_config', exist[0].id, {ativo, valor_max:valor, pontos_max:pontosMax, periodicidade:period, atualizado_em:new Date().toISOString()});
    } else {
      await db.post('gestao_bonus_config', {colaborador_id: _gestaoTarAlvo.id, ativo, valor_max:valor, pontos_max:pontosMax, periodicidade:period});
    }
    closeM('m-config-bonus');
    toast('✅ Config salva.','ok');
    carregarMetasBonus();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// 4. APURAR BÔNUS — atribuir pontos por tarefa no periodo
// ────────────────────────────────────────────────────
async function carregarBonus(){
  const el = document.getElementById('bonus-lista');
  if(!el) return;
  el.innerHTML = 'Carregando...';
  try{
    let q = '?ativo=eq.true&select=*,colaborador:usuarios!gestao_liderados_colaborador_id_fkey(id,nome,cor_avatar)';
    if(!_isAdmin()) q += `&lider_id=eq.${CUR.id}`;
    const lista = await db.get('gestao_liderados', q);
    if(!lista?.length){ el.innerHTML = `<div class="empty"><div class="ei">💰</div><p>Sem liderados.</p></div>`; return; }
    _gestaoLiderados = lista;

    const html = await Promise.all(lista.map(async l => {
      const c = l.colaborador || {};
      const cfgArr = await db.get('gestao_bonus_config', `?colaborador_id=eq.${c.id}&limit=1`);
      const cfg = cfgArr?.[0];
      if(!cfg?.ativo){
        return `<div style="padding:12px;border:1px solid var(--borda);border-radius:10px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;opacity:.6">
          <div><strong>${c.nome}</strong> — bônus desativado</div>
          <button class="btn btn-o bxs" onclick="abrirConfigBonus('${c.id}','${(c.nome||'').replace(/'/g,'')}')">Ativar</button>
        </div>`;
      }
      const periodo = _periodoAtual(cfg.periodicidade);
      const apurArr = await db.get('gestao_bonus_apuracoes', `?colaborador_id=eq.${c.id}&periodo=eq.${periodo}&limit=1`);
      const apur = apurArr?.[0];
      const pago = apur?.pago;
      const sb = pago?'b-green' : apur?.status==='finalizado'?'b-blue' : apur?.status==='rascunho'?'b-amber' : 'b-gray';
      const sl = pago?'✅ Pago' : apur?.status==='finalizado'?'Finalizado' : apur?.status==='rascunho'?'Em apuração' : 'Pendente';
      const val = apur?.valor_calculado != null
        ? `R$ ${Number(apur.valor_calculado).toLocaleString('pt-BR',{minimumFractionDigits:2})} (${apur.pontos_total||0}/${apur.pontos_max||0} pts)`
        : `Máx R$ ${Number(cfg.valor_max||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} · ${cfg.pontos_max||0} pts`;
      return `<div style="padding:14px;border:1px solid var(--borda);border-radius:10px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700">${c.nome}</div>
            <div style="font-size:12px;color:#64748b">Período: <strong>${_formatPeriodo(periodo)}</strong> · ${cfg.periodicidade} · ${val}</div>
          </div>
          <div class="flex aic g2">
            <span class="badge ${sb}">${sl}</span>
            <button class="btn btn-p bxs" onclick="abrirApurarBonus('${c.id}','${(c.nome||'').replace(/'/g,'')}')">${apur?'Editar':'Apurar'}</button>
            ${apur?.status==='finalizado' && !pago ? `<button class="btn btn-o bxs" onclick="marcarPago(${apur.id})">💰 Marcar pago</button>`:''}
          </div>
        </div>
      </div>`;
    }));
    el.innerHTML = html.join('');
  }catch(e){ console.error('[carregarBonus]',e); el.innerHTML = `Erro: ${e.message}`; }
}

async function abrirApurarBonus(colabId, nome){
  _gestaoApurAlvo = { id: colabId, nome };
  document.getElementById('apur-titulo').textContent = 'Apuração de Bônus — '+nome;
  const form = document.getElementById('apur-form');
  form.innerHTML = 'Carregando tarefas...';
  try{
    const cfgArr = await db.get('gestao_bonus_config', `?colaborador_id=eq.${colabId}&limit=1`);
    const cfg = cfgArr?.[0];
    if(!cfg?.ativo){ form.innerHTML = 'Bônus desativado para este colaborador.'; return; }
    const periodo = _periodoAtual(cfg.periodicidade);
    const [tar, apurArr] = await Promise.all([
      db.get('gestao_tarefas_bonus', `?colaborador_id=eq.${colabId}&ativa=eq.true&order=ordem.asc`),
      db.get('gestao_bonus_apuracoes', `?colaborador_id=eq.${colabId}&periodo=eq.${periodo}&limit=1`)
    ]);
    _gestaoTarefas = tar || [];
    const apur = apurArr?.[0];
    const pont = apur?.pontuacao || {};
    let html = `<p style="font-size:13px;color:#64748b;margin-bottom:14px">Período: <strong>${_formatPeriodo(periodo)}</strong> <span style="color:#94a3b8">(${periodo})</span> · ${cfg.periodicidade} · Valor máx R$ ${Number(cfg.valor_max||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <thead><tr style="background:var(--bg)">
          <th style="padding:8px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase">Tarefa</th>
          <th style="padding:8px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase">Freq.</th>
          <th style="padding:8px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase">Pontos</th>
          <th style="padding:8px;text-align:center;font-size:11px;color:#94a3b8;text-transform:uppercase">Atingiu</th>
        </tr></thead>
        <tbody>${_gestaoTarefas.map(t => {
          const v = pont[t.id] != null ? pont[t.id] : '';
          return `<tr style="border-top:1px solid var(--borda)">
            <td style="padding:8px;font-size:13px">${t.descricao||'—'}</td>
            <td style="padding:8px;text-align:center;font-size:11px;color:#64748b">${t.frequencia||'—'}</td>
            <td style="padding:8px;text-align:center;font-size:13px;font-weight:600">${t.pontos_max}</td>
            <td style="padding:8px;text-align:center">
              <input type="number" data-tar="${t.id}" data-max="${t.pontos_max}" value="${v}" min="0" max="${t.pontos_max}" style="width:80px;text-align:center" oninput="_recalcApur()">
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div id="apur-resumo" style="padding:12px;background:var(--bg);border-radius:8px;font-size:14px"></div>
      <div style="margin-top:14px"><label style="font-size:13px;display:block;margin-bottom:4px">Observações</label>
        <textarea id="apur-obs" rows="2" style="width:100%">${(apur?.observacoes||'').replace(/</g,'&lt;')}</textarea></div>`;
    form.innerHTML = html;
    form.dataset.valorMax = cfg.valor_max;
    form.dataset.pontosMax = (_gestaoTarefas.reduce((s,t)=>s+(t.pontos_max||0),0));
    form.dataset.periodo = periodo;
    _recalcApur();
    openM('m-apurar-bonus');
  }catch(e){ form.innerHTML = `Erro: ${e.message}`; }
}

function _recalcApur(){
  const form = document.getElementById('apur-form');
  const inputs = form.querySelectorAll('input[data-tar]');
  let total = 0;
  inputs.forEach(i => {
    const v = parseInt(i.value || '0', 10);
    const max = parseInt(i.dataset.max || '0', 10);
    if (!isNaN(v) && v >= 0) total += Math.min(v, max);
  });
  const pontosMax = parseInt(form.dataset.pontosMax || '0', 10);
  const valorMax  = parseFloat(form.dataset.valorMax || '0');
  const pct = pontosMax > 0 ? total / pontosMax : 0;
  const valor = valorMax * pct;
  document.getElementById('apur-resumo').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${total}</strong> / ${pontosMax} pontos (${(pct*100).toFixed(1)}%)</div>
      <div style="font-size:18px;font-weight:700;color:#16a34a">R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
    </div>`;
}

async function salvarApuracao(status){
  if(!_gestaoApurAlvo) return;
  const form = document.getElementById('apur-form');
  const inputs = form.querySelectorAll('input[data-tar]');
  const pontuacao = {};
  let total = 0;
  inputs.forEach(i => {
    const v = parseInt(i.value || '0', 10);
    const max = parseInt(i.dataset.max || '0', 10);
    if (!isNaN(v) && v >= 0) { pontuacao[i.dataset.tar] = Math.min(v, max); total += Math.min(v, max); }
  });
  const pontosMax = parseInt(form.dataset.pontosMax || '0', 10);
  const valorMax  = parseFloat(form.dataset.valorMax || '0');
  const valor = pontosMax > 0 ? (valorMax * total / pontosMax) : 0;
  const obs = document.getElementById('apur-obs')?.value || '';
  const periodo = form.dataset.periodo;
  try{
    const exist = await db.get('gestao_bonus_apuracoes', `?colaborador_id=eq.${_gestaoApurAlvo.id}&periodo=eq.${periodo}&limit=1`);
    const payload = {
      pontuacao, pontos_total: total, pontos_max: pontosMax,
      valor_calculado: Number(valor.toFixed(2)), observacoes: obs, status,
      finalizado_em: status==='finalizado' ? new Date().toISOString() : null
    };
    if(exist?.length){
      await db.patch('gestao_bonus_apuracoes', exist[0].id, payload);
    } else {
      payload.colaborador_id = _gestaoApurAlvo.id;
      payload.periodo = periodo;
      await db.post('gestao_bonus_apuracoes', payload);
    }
    closeM('m-apurar-bonus');
    toast(status==='finalizado'?'✅ Apuração finalizada.':'💾 Rascunho salvo.','ok');
    carregarBonus();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

async function marcarPago(id){
  if(!confirm('Confirmar pagamento? Esta acao registra a data.')) return;
  try{
    await db.patch('gestao_bonus_apuracoes', id, {pago:true, data_pagamento: new Date().toISOString().slice(0,10), status:'pago'});
    toast('💰 Marcado como pago.','ok');
    carregarBonus();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// 5. AVALIAÇÃO DO LÍDER (360 simples — colaborador → líder)
// ────────────────────────────────────────────────────
async function carregarAvLider(){
  const el = document.getElementById('av-lider-form');
  if(!el) return;
  el.innerHTML = 'Carregando...';
  try{
    // Descobre meu lider
    const meu = await db.get('gestao_liderados', `?colaborador_id=eq.${CUR.id}&ativo=eq.true&select=*,lider:usuarios!gestao_liderados_lider_id_fkey(id,nome)&limit=1`);
    const link = meu?.[0];
    if(!link){
      el.innerHTML = `<div class="empty"><div class="ei">🌟</div><p>Você ainda não está vinculado a nenhum líder.</p><p style="font-size:12px;color:#94a3b8;margin-top:8px">Peça ao seu líder para te adicionar em 'Meus Liderados'.</p></div>`;
      return;
    }
    _gestaoMeuLider = link;
    const lider = link.lider || {};
    const periodo = _periodoAtual('trimestral');
    const [perg, avalArr] = await Promise.all([
      db.get('gestao_perguntas_lider', '?ativa=eq.true&order=ordem.asc'),
      db.get('gestao_avaliacoes_lider', `?lider_id=eq.${lider.id}&colaborador_id=eq.${CUR.id}&periodo=eq.${periodo}&limit=1`)
    ]);
    _gestaoPergLider = perg || [];
    const aval = avalArr?.[0];
    const resp = aval?.respostas || {};
    let html = `<p style="font-size:13px;color:#64748b;margin-bottom:14px">Avaliando: <strong>${lider.nome||'—'}</strong> · Período: <strong>${_formatPeriodo(periodo)}</strong> · 🔒 Anônimo (apenas admin vê dados consolidados)</p>`;
    for (const p of _gestaoPergLider){
      const v = resp[p.id] ?? '';
      if(p.tipo === 'escala'){
        html += `<div style="margin-bottom:12px"><label style="font-size:13px;display:block;margin-bottom:4px">${p.pergunta}</label>
          <div class="flex aic g2">
            ${[1,2,3,4,5].map(n=>`<label style="display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="radio" name="pl${p.id}" value="${n}" ${String(v)===String(n)?'checked':''}> ${n}
            </label>`).join('')}
          </div></div>`;
      } else if(p.tipo === 'texto'){
        html += `<div style="margin-bottom:12px"><label style="font-size:13px;display:block;margin-bottom:4px">${p.pergunta}</label>
          <textarea name="pl${p.id}" rows="3" style="width:100%">${(v||'').replace(/</g,'&lt;')}</textarea></div>`;
      }
    }
    html += `<div style="margin-top:14px">
      <button class="btn btn-p" onclick="salvarAvLider()">${aval?'Atualizar':'Enviar'} Avaliação</button>
    </div>`;
    el.innerHTML = html;
  }catch(e){ console.error('[carregarAvLider]',e); el.innerHTML = `Erro: ${e.message}`; }
}

async function salvarAvLider(){
  if(!_gestaoMeuLider) return;
  const respostas = {};
  for (const p of _gestaoPergLider){
    if(p.tipo === 'texto'){
      const el = document.querySelector(`[name="pl${p.id}"]`);
      if(el && el.value.trim()) respostas[p.id] = el.value.trim();
    } else {
      const el = document.querySelector(`input[name="pl${p.id}"]:checked`);
      if(el) respostas[p.id] = el.value;
    }
  }
  const periodo = _periodoAtual('trimestral');
  const liderId = _gestaoMeuLider.lider?.id || _gestaoMeuLider.lider_id;
  try{
    const exist = await db.get('gestao_avaliacoes_lider', `?lider_id=eq.${liderId}&colaborador_id=eq.${CUR.id}&periodo=eq.${periodo}&limit=1`);
    if(exist?.length){
      await db.patch('gestao_avaliacoes_lider', exist[0].id, { respostas });
    } else {
      await db.post('gestao_avaliacoes_lider', {
        lider_id: liderId, colaborador_id: CUR.id, periodo, respostas, anonimo: true
      });
    }
    toast('✅ Avaliação enviada.','ok');
    carregarAvLider();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// 6. TERMO DE AVALIAÇÃO (PDF p/ assinatura das partes)
// ────────────────────────────────────────────────────
const _LBL_BLOCOS_TERMO = {
  comprometimento:'A — Comprometimento e atitude',
  qualidade:'B — Qualidade do trabalho',
  relacionamento:'C — Relacionamento',
  desenvolvimento:'D — Pontos de melhoria & desenvolvimento',
  reflexao:'E — Reflexão do trimestre',
  plano:'F — Plano de ação',
  custom:'G — Perguntas específicas'
};

function _escTermo(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _fmtRespostaTermo(p, v){
  if(v==null || v==='') return '<span style="color:#94a3b8">—</span>';
  if(p.tipo==='escala')  return '<b>'+_escTermo(v)+'</b> / 5';
  if(p.tipo==='sim_nao') return v==='sim'?'Sim':(v==='nao'?'Não':_escTermo(v));
  return _escTermo(String(v)).replace(/\n/g,'<br>');
}

function _montarTermoHtml(d){
  const periodoTxt = _formatPeriodo(d.periodo);
  const ordem = ['comprometimento','qualidade','relacionamento','desenvolvimento','reflexao','plano','custom'];
  const perg = d.perguntas || [];
  const resp = d.respostas || {};
  const escalas = perg.filter(p=>p.tipo==='escala').map(p=>parseInt(resp[p.id],10)).filter(n=>!isNaN(n));
  const media = escalas.length ? (escalas.reduce((a,b)=>a+b,0)/escalas.length).toFixed(2) : null;

  let secoes = '';
  for(const b of ordem){
    const ps = perg.filter(p => (p.bloco||'custom') === b);
    if(!ps.length) continue;
    secoes += `<h3>${_escTermo(_LBL_BLOCOS_TERMO[b]||b)}</h3><table class="qt">`;
    for(const p of ps){
      secoes += `<tr><td class="q">${_escTermo(p.pergunta)}</td><td class="a">${_fmtRespostaTermo(p, resp[p.id])}</td></tr>`;
    }
    secoes += `</table>`;
  }
  const hoje = new Date().toLocaleDateString('pt-BR');
  const finalizada = d.status === 'finalizada';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Termo de Avaliação — ${_escTermo(d.colab)} — ${_escTermo(periodoTxt)}</title>
  <style>
    @page{size:A4;margin:18mm 16mm}
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a2233;font-size:12px;line-height:1.5;margin:0}
    .hd{text-align:center;border-bottom:2px solid #2a4070;padding-bottom:12px;margin-bottom:16px}
    .hd h1{font-size:18px;color:#2a4070;margin:0 0 2px}
    .hd p{margin:0;color:#64748b;font-size:11px}
    table.meta{width:100%;border-collapse:collapse;margin-bottom:14px}
    table.meta td{padding:5px 8px;border:1px solid #d8e0ec}
    table.meta td.k{background:#eef2f8;font-weight:700;width:120px;color:#2a4070}
    h3{font-size:13px;color:#2a4070;margin:16px 0 6px;border-left:4px solid #2a4070;padding-left:8px}
    table.qt{width:100%;border-collapse:collapse;margin-bottom:6px}
    table.qt td{padding:6px 8px;border:1px solid #e2e8f0;vertical-align:top}
    table.qt td.a{width:90px;text-align:center;background:#fafbfd;white-space:nowrap}
    .media{margin:12px 0 4px;font-size:13px}
    .obs{margin-top:10px;padding:10px 12px;border:1px solid #e2e8f0;background:#fffdf5;border-radius:4px;white-space:pre-wrap}
    .obs .lbl{font-weight:700;color:#2a4070;display:block;margin-bottom:4px}
    .ciente{margin-top:20px;font-size:11px;color:#475569;line-height:1.6}
    .ass{display:flex;gap:48px;margin-top:54px;page-break-inside:avoid}
    .ass .c{flex:1;text-align:center}
    .ass .ln{border-top:1px solid #1a2233;margin-bottom:6px}
    .ass .nm{font-weight:700}
    .ass .rl{font-size:11px;color:#64748b}
    .ft{margin-top:26px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px}
    .draft{position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);font-size:96px;color:rgba(220,38,38,.07);font-weight:800;z-index:-1;letter-spacing:6px}
    @media print{.noprint{display:none}}
    .noprint{text-align:center;margin-bottom:14px}
    .noprint button{font:inherit;background:#2a4070;color:#fff;border:none;padding:9px 20px;border-radius:6px;cursor:pointer}
  </style></head><body>
  ${finalizada?'':'<div class="draft">RASCUNHO</div>'}
  <div class="noprint"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
  <div class="hd"><h1>Termo de Avaliação de Desempenho</h1><p>Nova São Paulo Imobiliária · Avaliação Trimestral</p></div>
  <table class="meta">
    <tr><td class="k">Colaborador(a)</td><td>${_escTermo(d.colab)}</td><td class="k">Departamento</td><td>${_escTermo(d.dept||'—')}</td></tr>
    <tr><td class="k">Líder avaliador</td><td>${_escTermo(d.lider)}</td><td class="k">Período</td><td>${_escTermo(periodoTxt)} (${_escTermo(d.periodo)})</td></tr>
    <tr><td class="k">Situação</td><td>${finalizada?'Finalizada':'Rascunho'}</td><td class="k">Emitido em</td><td>${hoje}</td></tr>
  </table>
  ${media?`<div class="media">Média geral das notas (escala 1–5): <b>${media} / 5</b></div>`:''}
  ${secoes}
  ${d.obs?`<div class="obs"><span class="lbl">Observações finais</span>${_escTermo(d.obs)}</div>`:''}
  <div class="ciente">Declaro que a presente avaliação de desempenho foi apresentada e discutida entre as partes,
  estando o(a) colaborador(a) ciente de seu conteúdo, pontos de melhoria e plano de ação acordados.</div>
  <div class="ass">
    <div class="c"><div class="ln"></div><div class="nm">${_escTermo(d.colab)}</div><div class="rl">Colaborador(a) — ciente</div></div>
    <div class="c"><div class="ln"></div><div class="nm">${_escTermo(d.lider)}</div><div class="rl">Líder avaliador(a)</div></div>
  </div>
  <div class="ft">Documento gerado pelo Portal Nova São Paulo · Gestão &amp; Feedback · ${hoje}</div>
  </body></html>`;
}

function _imprimirTermo(html){
  const w = window.open('', '_blank');
  if(!w){ toast('Permita pop-ups neste site para gerar o PDF.','err'); return; }
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
}

// Gera o termo a partir do formulário aberto (respostas em edição)
function gerarTermoAvaliacao(){
  if(!_gestaoAvalAlvo || !(_gestaoPerguntas&&_gestaoPerguntas.length)){ toast('Abra uma avaliação primeiro.','err'); return; }
  const respostas = {};
  for(const p of _gestaoPerguntas){
    if(p.tipo === 'texto'){
      const el = document.querySelector(`[name="p${p.id}"]`);
      respostas[p.id] = el ? el.value.trim() : '';
    } else {
      const el = document.querySelector(`input[name="p${p.id}"]:checked`);
      respostas[p.id] = el ? el.value : '';
    }
  }
  const obs = document.getElementById('aval-obs')?.value || '';
  const dept = (_gestaoLiderados.find(l=>String(l.colaborador?.id)===String(_gestaoAvalAlvo.id))?.colaborador?.dept) || '';
  _imprimirTermo(_montarTermoHtml({
    colab:_gestaoAvalAlvo.nome, dept, lider:CUR?.nome||'', periodo:_periodoAvalSelecionado(),
    perguntas:_gestaoPerguntas, respostas, obs, status:'finalizada'
  }));
}

// Gera o termo de uma avaliação já finalizada (busca no banco)
async function gerarTermoAvaliacaoFinalizada(colabId, nome){
  try{
    const periodo = _periodoAvalSelecionado();
    const [perg, avalArr] = await Promise.all([
      db.get('gestao_perguntas', `?or=(colaborador_id.is.null,colaborador_id.eq.${colabId})&ativa=eq.true&order=ordem.asc`),
      db.get('gestao_avaliacoes', `?colaborador_id=eq.${colabId}&periodo=eq.${periodo}&limit=1`)
    ]);
    const aval = avalArr?.[0];
    if(!aval){ toast('Avaliação não encontrada neste período.','err'); return; }
    const dept = (_gestaoLiderados.find(l=>String(l.colaborador?.id)===String(colabId))?.colaborador?.dept) || '';
    _imprimirTermo(_montarTermoHtml({
      colab:nome, dept, lider:CUR?.nome||'', periodo,
      perguntas:perg||[], respostas:aval.respostas||{}, obs:aval.observacoes||'', status:aval.status
    }));
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// ────────────────────────────────────────────────────
// ORGANOGRAMA — arvore lider → liderados montada dos vinculos
// gestao_liderados (ativo=true). Atualiza sozinho: cada abertura
// da pagina refaz a leitura do banco.
// ────────────────────────────────────────────────────
async function carregarOrganograma(){
  const el = document.getElementById('organograma-arvore');
  if (!el) return;
  el.innerHTML = 'Carregando...';
  try {
    const [vinculos, usuarios] = await Promise.all([
      db.get('gestao_liderados', '?ativo=eq.true&select=lider_id,colaborador_id'),
      db.get('usuarios', '?select=id,nome,dept,cor_avatar,admin&order=nome.asc')
    ]);
    const byId = {};
    (usuarios||[]).forEach(u => { byId[u.id] = u; });

    // children[liderId] = [colaboradorId...]
    const children = {};
    const ehColab = new Set();
    (vinculos||[]).forEach(v => {
      if (!byId[v.lider_id] || !byId[v.colaborador_id]) return;   // usuario removido
      (children[v.lider_id] = children[v.lider_id] || []).push(v.colaborador_id);
      ehColab.add(String(v.colaborador_id));
    });

    // Raizes: admin (Rodrigo) + lideres que nao sao liderados de ninguem
    const lideresIds = Object.keys(children);
    const raizes = [];
    const admin = (usuarios||[]).find(u => u.admin);
    if (admin) raizes.push(String(admin.id));
    lideresIds.forEach(id => {
      if (!ehColab.has(String(id)) && String(id) !== String(admin?.id)) raizes.push(String(id));
    });

    if (!lideresIds.length) {
      el.innerHTML = '<div class="empty"><div class="ei">🏢</div><p>Nenhum vínculo líder→liderado cadastrado ainda. Cadastre em "Meus Liderados".</p></div>';
      return;
    }

    const cartao = (u, ehRaiz) => {
      const ini = (u.nome||'').split(' ').slice(0,2).map(n=>n[0]).join('');
      const cor = u.cor_avatar || '#1E2D4A';
      return `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1.5px solid ${ehRaiz?'#1E2D4A':'var(--borda)'};border-radius:10px;background:${ehRaiz?'#f0f4fa':'#fff'};min-width:170px">
        <div style="width:32px;height:32px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${ini}</div>
        <div style="min-width:0">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.nome||'—'}</div>
          <div style="font-size:10px;color:#94a3b8;white-space:nowrap">${u.dept||''}</div>
        </div>
      </div>`;
    };

    // Renderiza recursivo com indentacao por linha vertical
    const jaVisto = new Set();   // protecao contra ciclo A→B→A
    const ramo = (id, nivel) => {
      if (jaVisto.has(String(id))) return '';
      jaVisto.add(String(id));
      const u = byId[id];
      if (!u) return '';
      const filhos = (children[id] || [])
        .map(cid => byId[cid])
        .filter(Boolean)
        .sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
      const filhosHtml = filhos.length
        ? `<div style="margin-left:26px;padding-left:18px;border-left:2px solid #e2e8f0;margin-top:8px;display:flex;flex-direction:column;gap:8px">
            ${filhos.map(f => ramo(f.id, nivel+1)).join('')}
          </div>`
        : '';
      return `<div>${cartao(u, nivel===0)}${filhosHtml}</div>`;
    };

    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px" id="org-conteudo">
      ${raizes.map(r => ramo(r, 0)).join('')}
    </div>
    <div style="margin-top:16px;font-size:11px;color:#94a3b8">
      Gerado automaticamente dos vínculos ativos em "Meus Liderados" · ${new Date().toLocaleDateString('pt-BR')}
    </div>`;
  } catch(e) {
    console.error('[organograma]', e);
    el.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
  }
}

// Imprime / salva o organograma como PDF via janela dedicada
function imprimirOrganograma(){
  const cont = document.getElementById('org-conteudo');
  if (!cont) { toast('Abra o organograma primeiro.','err'); return; }
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up bloqueado — libere pra este site.'); return; }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Organograma — Nova São Paulo</title>
    <style>
      @page { size: A4 portrait; margin: 15mm; }
      body { font-family: -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#1e293b; }
      h1 { font-size: 20pt; color:#1E2D4A; margin: 0 0 4mm; }
      .sub { color:#64748b; font-size: 10pt; margin-bottom: 8mm; }
      :root { --borda:#e2e8f0; }
    </style></head><body>
    <h1>Organograma — Nova São Paulo Imobiliária</h1>
    <div class="sub">Gerado em ${new Date().toLocaleDateString('pt-BR')} · estrutura líder → liderados</div>
    ${cont.outerHTML}
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script>
    </body></html>`);
  w.document.close();
}

// ─── PROCESSOS (BPMN) ────────────────────────────────────────────
// Diagrama mantido pelo gestor no diagrams.net (arquivo no Google
// Drive dele, compartilhado como "qualquer pessoa com o link").
// IMPORTANTE: usar o modo #U (URL direta do download) — o modo #G
// passa pela API do Drive e pede autorizacao da conta Google de QUEM
// ABRE, mesmo com arquivo publico (foi por isso que Telmo/Joao viam
// "Autorizacao necessaria"). Pra trocar o diagrama: substituir o id
// depois de id%3D pelo id do novo arquivo.
const BPMN_VIEWER_URL = 'https://viewer.diagrams.net/?tags=%7B%7D&lightbox=1&highlight=0000ff&layers=1&nav=1&title=Processos%20NSP#Uhttps%3A%2F%2Fdrive.google.com%2Fuc%3Fexport%3Ddownload%26id%3D1OhG5UuGQ6EN6gdtAk63JtqjMcGyUkOjg';

function carregarProcessosBpmn(){
  const f = document.getElementById('bpmn-iframe');
  // so carrega o viewer na 1ª visita (iframe pesado)
  if (f && !f.src) f.src = BPMN_VIEWER_URL;
  const a = document.getElementById('bpmn-link-externo');
  if (a) a.href = BPMN_VIEWER_URL;
}

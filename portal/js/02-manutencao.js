// ── FILTROS ──────────────────────────────────────────────
function filtrarMan(filtro,btn){
  if(filtro && filtro!=='busca') _manFiltroAtual=filtro;
  if(btn){document.querySelectorAll('#p-manutencao .btn').forEach(b=>{b.classList.remove('btn-p');b.classList.add('btn-o');});btn.classList.remove('btn-o');btn.classList.add('btn-p');}
  const busca=(document.getElementById('man-busca')?.value||'').toLowerCase();
  const cur=_manFiltroAtual||'todos';
  const fil=_manDados.filter(x=>{
    const st=(x.Status||'').toLowerCase();
    if(cur!=='todos'&&!st.includes(cur.toLowerCase()))return false;
    if(busca){const txt=((x.Protocolo||'')+(x.Nome||x.nome||'')+(x.Endereco||'')+(x['Tipo Servico']||'')).toLowerCase();if(!txt.includes(busca))return false;}
    if(_manMesFiltro){
      const mk=_mesKeyPt(gasField(x,'Data','data'));
      if(mk!==_manMesFiltro) return false;
    }
    return true;
  });
  renderTbMan(fil);
}

// Click na barra do grafico -> aplica/limpa filtro de mes
function setManMesFiltro(m){
  _manMesFiltro = (_manMesFiltro===m) ? '' : m;
  renderPorMes('man-pmes-bars','man-pmes-tot', _manDados, x => x.Data || x.data || '', 6, setManMesFiltro, _manMesFiltro);
  filtrarMan(_manFiltroAtual, null);
}

// Ajusta UI da pagina p-requisicoes conforme _reqModoFixo
function _aplicarModoReqUI(){
  const pgHead = document.querySelector('#p-requisicoes .ph');
  if (!pgHead) return;
  const titEl = pgHead.querySelector('.pt');
  const subEl = pgHead.querySelector('.pst');
  if (_reqModoFixo==='ti'){
    if (titEl) titEl.innerHTML = '💻 Chamados de T.I.';
    if (subEl) subEl.textContent = 'Solicitações para o Fabio · Tecnologia';
  } else if (_reqModoFixo==='manut'){
    if (titEl) titEl.innerHTML = '🔧 Manutenção Interna';
    if (subEl) subEl.textContent = 'Solicitações para o Marcelo · Manutenção predial interna';
  } else {
    if (titEl) titEl.textContent = 'Requisições Internas';
    if (subEl) subEl.textContent = 'TI, manutenção interna e outras solicitações';
  }
  // Esconde os botoes de filtro por setor quando ja ha modo fixo (redundancia)
  const filtroDiv = document.querySelector('#p-requisicoes > div[style*="display:flex"]');
  if (filtroDiv){
    filtroDiv.querySelectorAll('button').forEach(b => {
      const txt = (b.textContent||'').toLowerCase();
      const ehSetorBtn = txt.includes('ti') || txt.includes('manuten');
      if (_reqModoFixo) {
        // Em modo fixo, esconde so os botoes de setor (mantem todos/abertas/concluidas)
        if (ehSetorBtn) b.style.display='none';
        else b.style.display='';
      } else {
        b.style.display='';
      }
    });
  }
}

function _reqEhTI(x){
  const setor = String(gasField(x,'Setor','setor')||'').trim();
  return /^t\.?\s*i\.?$/i.test(setor);
}
function _reqEhManut(x){
  const setor = String(gasField(x,'Setor','setor')||'').toLowerCase();
  return /manuten/.test(setor);
}
// Aplica modo fixo (ti/manut) antes de qualquer outro filtro
function _reqAplicaModoFixo(lista){
  if (_reqModoFixo==='ti')    return lista.filter(_reqEhTI);
  if (_reqModoFixo==='manut') return lista.filter(_reqEhManut);
  return lista;
}

function filtrarReq(filtro,btn){
  if(filtro && filtro!=='busca') _reqFiltroAtual=filtro;
  if(btn){document.querySelectorAll('#p-requisicoes .btn').forEach(b=>{b.classList.remove('btn-p');b.classList.add('btn-o');});btn.classList.remove('btn-o');btn.classList.add('btn-p');}
  const cur=_reqFiltroAtual||'todos';
  const base = _reqAplicaModoFixo(_reqDados);
  const fil=base.filter(x=>{
    if(cur!=='todos'){
      const st=(x.Status||'').toLowerCase();
      const setor=(x.Setor||'').toLowerCase();
      // No modo fixo (ti/manut), 'cur' aplicado a setor nao faz sentido — so checa status
      const setorOk = _reqModoFixo ? true : setor.includes(cur.toLowerCase());
      if(!(st.includes(cur.toLowerCase())||setorOk)) return false;
    }
    if(_reqMesFiltro){
      const mk=_mesKeyPt(gasField(x,'Data','data'));
      if(mk!==_reqMesFiltro) return false;
    }
    return true;
  });
  renderTbReq(fil);
}

function setReqMesFiltro(m){
  _reqMesFiltro = (_reqMesFiltro===m) ? '' : m;
  renderPorMes('req-pmes-bars','req-pmes-tot', _reqAplicaModoFixo(_reqDados), x => x.Data || x.data || '', 6, setReqMesFiltro, _reqMesFiltro);
  filtrarReq(_reqFiltroAtual, null);
}

function renderTbMan(lista){
  const tbody=document.getElementById('tb-man');if(!tbody)return;
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="ei">🏠</div><p>Nenhum chamado.</p></div></td></tr>`;return;}

  // Concluidos no final (como em tarefas)
  const ativos    = lista.filter(x=>!String(gasField(x,'Status','status')||'').toLowerCase().includes('conclu'));
  const concluidos= lista.filter(x=> String(gasField(x,'Status','status')||'').toLowerCase().includes('conclu'));
  const ordenados = [...ativos, ...concluidos];

  tbody.innerHTML=ordenados.map((x,idx)=>{
    const st    = gasField(x,'Status','status') || 'Aberto';
    const stLow = String(st).toLowerCase();
    const c     = stLow.includes('andamento')?'b-amber':stLow.includes('conclu')?'b-green':stLow.includes('cancel')?'b-gray':'b-red';
    const dt    = gasField(x,'Data','data');
    const proto = String(gasField(x,'Protocolo','protocolo')||'').replace(/'/g,"\\'");
    const end   = gasField(x,'Endereço','Endereco','endereco','endereço') || '—';
    const tip   = gasField(x,'Tipo Serviço','Tipo Servico','servico','tipo servico') || '—';
    const nme   = gasField(x,'Nome','nome') || '—';
    const isConc= stLow.includes('conclu');
    const sep   = isConc && idx===ativos.length
      ? `<tr><td colspan="7" style="padding:8px 14px;background:var(--bg);border-top:2px solid var(--borda)"><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">✅ Concluídos</span></td></tr>` : '';
    return sep+`<tr style="${isConc?'opacity:.55':''}">
      <td><b style="font-size:12px">${gasField(x,'Protocolo','protocolo')||'—'}</b></td>
      <td style="font-size:12px">${nme}</td>
      <td style="font-size:12px">${String(end).substring(0,30)}</td>
      <td style="font-size:12px">${tip}</td>
      <td><span class="badge ${c}">${st}</span></td>
      <td style="font-size:11px;color:#94a3b8">${dt?String(dt).slice(0,10):'—'}</td>
      <td><button class="btn btn-o bxs" onclick="abrirDetMan('${proto}')">Ver</button></td>
    </tr>`;}).join('');
}

function renderTbReq(lista){
  const tbody=document.getElementById('tb-req');if(!tbody)return;
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="8"><div class="empty"><div class="ei">📋</div><p>Nenhuma requisição.</p></div></td></tr>`;return;}

  // Concluidos no final (como em tarefas)
  const ativas    = lista.filter(x=>!String(gasField(x,'Status','status')||'').toLowerCase().includes('conclu'));
  const concluidas= lista.filter(x=> String(gasField(x,'Status','status')||'').toLowerCase().includes('conclu'));
  const ordenadas = [...ativas, ...concluidas];

  tbody.innerHTML=ordenadas.map((x,idx)=>{
    const st     = gasField(x,'Status','status') || 'Aberta';
    const stLow  = String(st).toLowerCase();
    const sc     = stLow.includes('conclu')?'b-green':stLow.includes('andamento')?'b-blue':stLow.includes('cancel')?'b-gray':'b-amber';
    const prior  = gasField(x,'Prioridade','prioridade') || 'Normal';
    const pc     = /urgente/i.test(prior)?'b-red':/alta/i.test(prior)?'b-amber':'b-gray';
    const proto  = String(gasField(x,'Protocolo','protocolo')||'').replace(/'/g,"\\'");
    const agen   = gasField(x,'Agência','Agencia','agencia','agência') || '—';
    const tit    = gasField(x,'Título','Titulo','titulo','título') || '—';
    const set2   = gasField(x,'Setor','setor') || '—';
    const data   = gasField(x,'Data','data');
    const isConc = stLow.includes('conclu');
    const sep    = isConc && idx===ativas.length
      ? `<tr><td colspan="8" style="padding:8px 14px;background:var(--bg);border-top:2px solid var(--borda)"><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">✅ Concluídas</span></td></tr>` : '';
    return sep+`<tr style="${isConc?'opacity:.55':''}">
      <td><b style="font-size:12px">${gasField(x,'Protocolo','protocolo')||'—'}</b></td>
      <td style="font-size:12px">${agen}</td>
      <td style="font-size:12px">${String(tit).substring(0,30)}</td>
      <td style="font-size:12px">${set2}</td>
      <td><span class="badge ${pc}" style="font-size:10px">${prior}</span></td>
      <td><span class="badge ${sc}">${st}</span></td>
      <td style="font-size:11px;color:#94a3b8">${data?String(data).slice(0,10):'—'}</td>
      <td><button class="btn btn-o bxs" onclick="abrirDetReq('${proto}')">Ver</button></td>
    </tr>`;}).join('');
}

// ── DETALHE MANUTENÇÃO ────────────────────────────────────
async function abrirDetMan(protocolo){
  _manProtoAtual=protocolo;
  // Lookup case-insensitive para tolerar 'Protocolo'/'protocolo'
  const x=_manDados.find(r=>String(gasField(r,'Protocolo','protocolo'))===protocolo)||{};
  const data = gasField(x,'Data','data');
  const status = gasField(x,'Status','status');
  setEl('man-det-titulo','Chamado '+protocolo);
  setEl('man-det-sub',(data?String(data).slice(0,10):'')+(status?' · '+status:''));
  setEl('man-det-nome',gasField(x,'Nome','nome') || '—');
  setEl('man-det-tel',gasField(x,'Telefone','telefone') || '—');
  setEl('man-det-end',gasField(x,'Endereço','Endereco','endereco','endereço') || '—');
  setEl('man-det-servico',gasField(x,'Tipo Serviço','Tipo Servico','servico','tipo servico') || '—');
  setEl('man-det-resp',gasField(x,'Responsabilidade','responsabilidade') || '—');
  setEl('man-det-prof',gasField(x,'Profissional','profissional') || 'Não definido');
  setEl('man-det-obs',gasField(x,'Observações','Observacoes','observacoes','obs') || '—');
  const selSt=document.getElementById('man-upd-status');
  if(selSt&&status)selSt.value=status;
  openM('m-man-det');
  const andEl=document.getElementById('man-det-andamentos');
  if(andEl)andEl.innerHTML='<div style="color:#94a3b8;font-size:13px;padding:12px">Carregando histórico...</div>';
  try{
    const resp=await gasGet(GAS_MANUTENCAO,{acao:'buscar_chamado',protocolo});
    if(resp?.andamentos?.length){
      andEl.innerHTML=resp.andamentos.map(a=>`
        <div style="padding:10px;border-left:3px solid #2a4070;margin-bottom:8px;background:var(--bg);border-radius:0 8px 8px 0">
          <div style="display:flex;justify-content:space-between">
            <span class="badge b-blue">${a.status||'Atualização'}</span>
            <span style="font-size:11px;color:#94a3b8">${a.data||'—'}</span>
          </div>
          <div style="font-size:13px;margin-top:4px">${a.mensagem||'—'}</div>
        </div>`).join('');
    } else {
      andEl.innerHTML='<div style="color:#94a3b8;font-size:13px;padding:12px">Nenhum andamento registrado.</div>';
    }
  }catch(e){andEl.innerHTML='<div style="color:#94a3b8;font-size:13px;padding:12px">Não foi possível carregar.</div>';}
}

// O GAS de manutencao (Code.gs) le campos individuais via e.parameter.<nome>
// e chama decodeURIComponent neles. URLSearchParams ja faz o encode necessario,
// entao mandamos os valores PUROS — sem encodeURIComponent.
//
// Formato confirmado pelo Apps Script:
//   atualizar_status:           e.parameter.protocolo, e.parameter.novo_status, e.parameter.mensagem
//   atribuir_responsabilidade:  e.parameter.protocolo, e.parameter.responsabilidade, e.parameter.profissional, e.parameter.mensagem

async function atualizarMan(){
  const resp2=document.getElementById('man-upd-resp')?.value||'';
  const prof =document.getElementById('man-upd-prof')?.value||'';
  const st   =document.getElementById('man-upd-status')?.value||'';
  let   msg  =document.getElementById('man-upd-msg')?.value?.trim()||'';
  console.log('[atualizarMan] proto:', _manProtoAtual, '| resp:', resp2, '| prof:', prof, '| status:', st, '| msg:', msg);
  if(!_manProtoAtual){toast('Erro: protocolo nao definido.','err');return;}
  if(!st && !resp2 && !prof){toast('Selecione um status ou responsavel/profissional.','err');return;}
  if(!msg){
    const partes = [];
    if (st) partes.push(`Status atualizado para "${st}"`);
    if (resp2) partes.push(`responsabilidade: ${resp2}`);
    if (prof) partes.push(`profissional: ${prof}`);
    msg = partes.join(' · ') || 'Atualização do chamado';
    console.log('[atualizarMan] msg autogerada:', msg);
  }

  const btn = document.querySelector('#m-man-det .btn-g');
  if (btn) { btn.disabled = true; btn.textContent = 'Atualizando...'; }
  try{
    // 1) Atribui responsavel/profissional (so se preenchidos)
    if(resp2 || prof){
      const r1 = await gasGet(GAS_MANUTENCAO, {
        acao: 'atribuir_responsabilidade',
        protocolo: _manProtoAtual,
        responsabilidade: resp2,
        profissional: prof,
        mensagem: msg
      });
      console.log('[atualizarMan] atribuir_responsabilidade resposta:', r1);
      if (r1?.status === 'erro') throw new Error(r1.msg || 'falha em atribuir_responsabilidade');
    }
    // 2) Atualiza status
    if(st){
      const r2 = await gasGet(GAS_MANUTENCAO, {
        acao: 'atualizar_status',
        protocolo: _manProtoAtual,
        novo_status: st,
        mensagem: msg
      });
      console.log('[atualizarMan] atualizar_status resposta:', r2);
      if (r2?.status === 'erro') throw new Error(r2.msg || 'falha em atualizar_status');
    }

    toast('✅ Chamado atualizado!','ok');
    closeM('m-man-det');
    loadMan();

    // Verificacao pos-update: confirma se o status realmente mudou
    if(st) setTimeout(async () => {
      try {
        const r = await gasGet(GAS_MANUTENCAO, {acao:'listar_chamados'});
        const lista = gasParseRows(r);
        const ch = lista.find(x => String(gasField(x,'Protocolo','protocolo')) === String(_manProtoAtual));
        const stAtual = ch ? gasField(ch,'Status','status') : null;
        if (String(stAtual||'').toLowerCase() === String(st).toLowerCase()) {
          console.log('[atualizarMan] ✅ VERIFICACAO OK — status atual no GAS:', stAtual);
        } else {
          console.error('[atualizarMan] ⚠️ VERIFICACAO FALHOU — esperava "' + st + '" mas GAS retornou "' + stAtual + '". Bug provavel no Apps Script.');
          toast('⚠️ Update enviado mas status nao mudou no GAS. Olhe console.','err');
        }
      } catch(e) { console.warn('[atualizarMan] verificacao erro:', e.message); }
    }, 1500);

  }catch(e){
    console.error('[atualizarMan] erro:',e);
    toast('Erro: '+(e.message||e),'err');
  }finally{
    if (btn) { btn.disabled = false; btn.textContent = '✅ Atualizar e notificar inquilino'; }
  }
}

// ── DETALHE REQUISIÇÃO ────────────────────────────────────
function abrirDetReq(protocolo){
  _reqProtoAtual=protocolo;
  const x=_reqDados.find(r=>String(gasField(r,'Protocolo','protocolo'))===protocolo)||{};
  const data = gasField(x,'Data','data');
  const status = gasField(x,'Status','status');
  setEl('req-det-titulo','Requisição '+protocolo);
  setEl('req-det-sub',(data?String(data).slice(0,10):'')+(status?' · '+status:''));
  setEl('req-det-lider',gasField(x,'Líder','Lider','lider','líder') || '—');
  setEl('req-det-agencia',gasField(x,'Agência','Agencia','agencia','agência') || '—');
  setEl('req-det-setor',gasField(x,'Setor','setor') || '—');
  setEl('req-det-prior',gasField(x,'Prioridade','prioridade') || '—');
  setEl('req-det-resp',gasField(x,'Responsável','Responsavel','responsavel','responsável') || '—');
  setEl('req-det-status',status || '—');
  const _dt=gasField(x,'Título','Titulo','titulo','título') || '';
  const _dd=gasField(x,'Descrição','Descricao','descricao','descrição') || '';
  setEl('req-det-desc',_dt+(_dd?'\n\n'+_dd:''));
  const sel=document.getElementById('req-upd-status');
  if(sel&&status)sel.value=status;
  openM('m-req-det');
}

async function atualizarReq(){
  const st  = document.getElementById('req-upd-status')?.value||'';
  const msg = document.getElementById('req-upd-msg')?.value?.trim()||'';
  if (!_reqProtoAtual) { toast('Protocolo nao definido.','err'); return; }
  if (!st) { toast('Selecione um status.','err'); return; }
  const btn = document.querySelector('#m-req-det .btn.btn-p');
  if (btn) { btn.disabled = true; btn.textContent = 'Atualizando...'; }
  try {
    // Persiste no GAS de Requisicoes (acao=atualizar_status)
    const r = await gasGet(GAS_REQUISICOES, {
      acao: 'atualizar_status',
      protocolo: _reqProtoAtual,
      novo_status: st,
      mensagem: msg,
      atualizado_por: CUR?.nome || ''
    });
    if (r && r.success === false) throw new Error(r.error||'falha');
    // Atualiza cache local pra refletir antes do reload
    const x = _reqDados.find(r2 => String(gasField(r2,'Protocolo','protocolo')) === String(_reqProtoAtual));
    if (x) x.Status = st;
    toast('✅ Requisição atualizada e gravada na planilha.','ok');
    closeM('m-req-det');
    loadReq(); // recarrega tudo
  } catch(e) {
    console.error('[atualizarReq]', e);
    toast('Erro ao atualizar: ' + (e.message||e), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Atualizar requisição'; }
  }
}

// Mantem versao antiga sob outro nome (caso algo chame): apenas local.
function _atualizarReqLocal(){
  const st=document.getElementById('req-upd-status')?.value||'';
  const x=_reqDados.find(r=>r.Protocolo===_reqProtoAtual);
  if(x)x.Status=st;
  toast('✅ Status atualizado localmente.','ok');
  closeM('m-req-det');
  filtrarReq('todos',null);
}

const GRUPOS={
  terca:    ['Anderson','Thais','Rodrigo Falcão Vaz'],
  quarta:   ['Vivian','Nogueira','João Marcos','Rodrigo Falcão Vaz'],
  juridico: ['Fernanda Araujo','Edna Rebesco','Janaina Alves','Rodrigo Falcão Vaz'],
  // 1:1 quinzenais — SEM Rodrigo pra evitar poluir a pauta com todas
  // as tarefas dele. Itens da pauta nativos aparecem normalmente.
  renata:     ['Renata Navarro'],
  felippe:    ['Felippe'],
  christiane: ['Christiane'],
  emilia:     ['Emilia']
};

// Lideres autorizados a usar o modulo Gestao & Feedback.
// Match: se qualquer palavra do nome do usuario aparece na lista (case-insensitive).
// Isso cobre 'Leandro Nogueira' (match em 'Nogueira'), 'Renata Navarro' (match em 'Renata'), etc.
// Acesso ao modulo Gestao — direto do Rodrigo + lideres autorizados.
// Liderados diretos do Rodrigo (atualizado): Thais, Anderson, Vivian, Nogueira,
// Simone, Fernanda, Edna, Felippe, Emilia, Renata, Christiane.
// Renata deixou de ser superintendente — agora gerente (Aguia+Fenix),
// reportando direto ao Rodrigo, como os demais gerentes.
// Regina e Catia sairam da empresa (removidas em jul/2026).
const LIDERES_GESTAO = [
  'Rodrigo',
  // Vendas (gerentes — todos reportam ao Rodrigo)
  'Renata','Felippe','Christiane','Emilia',
  // Adm — João Marcos assumiu a gerência de Administração em ago/2026
  // (Simone Cirino saiu da empresa em set/2026)
  'Vivian','Nogueira','João Marcos',
  // Marketing
  'Thais','Anderson',
  // Juridico
  'Fernanda','Edna','Janaina',
  // Consultor externo (processos e metas com os lideres) — jul/2026
  'Telmo'
];
// Acesso amplo por EMAIL exato (nao por trecho do nome). Usado pelo TI,
// que precisa enxergar todos os modulos pra dar suporte. Casar por email
// evita colisao com homonimos — ex: 'Fabio' (TI) vs 'Fabio Ayres' (corretor).
const ACESSO_TOTAL_EMAILS = [
  'ti@novasaopaulo.com.br'      // Fabio — T.I.
];
function ehAcessoTotal(){
  if (!CUR) return false;
  return ACESSO_TOTAL_EMAILS.includes(String(CUR.email||'').trim().toLowerCase());
}

function ehLiderGestao(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  if (ehAcessoTotal()) return true;
  const nome = (CUR.nome||'').toLowerCase();
  return LIDERES_GESTAO.some(lid => nome.includes(lid.toLowerCase()));
}
// Colaborador cadastrado somente para avaliacao/feedback: sem acesso aos modulos
// operacionais (juridico/interno/calendar) e nao e lider. So enxerga "Avaliar Lider".
function ehColaboradorGestao(){
  if (!CUR || CUR.admin) return false;
  if (ehLiderGestao()) return false;
  return !CUR.acesso_juridico && !CUR.acesso_interno && !CUR.acesso_calendar;
}
// Tem direito ao modulo Gestao (lider, admin ou colaborador de avaliacao)
function podeAcessarGestao(){ return ehLiderGestao() || ehColaboradorGestao(); }

// Calendar é restrito: lideres + gerentes/assistentes de vendas + admin.
// Substitui a flag acesso_calendar pra evitar que o resto do time apareça
// nos campos de participantes/responsaveis das agendas e tarefas.
function podeAcessarCalendar(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  if (typeof ehLiderGestao === 'function' && ehLiderGestao()) return true;
  if (typeof podeAcessarVendas === 'function' && podeAcessarVendas()) return true;
  return false;
}
// Dado um usuario da USERS, diz se ele eh elegivel pra Calendar.
function _usuarioElegivelCalendar(u){
  if (!u) return false;
  if (u.admin) return true;
  // Acesso total por email exato (TI)
  if (Array.isArray(ACESSO_TOTAL_EMAILS) &&
      ACESSO_TOTAL_EMAILS.includes(String(u.email||'').trim().toLowerCase())) return true;
  const nome = String(u.nome||'').toLowerCase();
  // Lider
  if (Array.isArray(LIDERES_GESTAO) && LIDERES_GESTAO.some(l => nome.includes(l.toLowerCase()))) return true;
  // Vendas (gerentes + assistentes)
  if (Array.isArray(VENDAS_USUARIOS)) {
    const nomeNorm = _vendasNormaliza(u.nome||'');
    const emailNorm = _vendasNormaliza((u.email||'').split('@')[0]);
    if (VENDAS_USUARIOS.some(p => {
      const alvo = _vendasNormaliza(p);
      return nomeNorm.includes(alvo) || emailNorm.includes(alvo);
    })) return true;
  }
  return false;
}
// Lista de USERS visiveis no Calendar (eventos/tarefas/filtros)
function usuariosCalendar(){
  if (!Array.isArray(USERS)) return [];
  return USERS.filter(_usuarioElegivelCalendar);
}
// Itens de menu do modulo Gestao conforme o papel
function menuGestaoItens(){
  if (ehLiderGestao()) return MENUS.gestao;
  // colaborador: somente avaliacao/feedback do proprio lider
  return MENUS.gestao.filter(i => i.pg === 'av-lider');
}
const MENUS={
  juridico:[{ic:'scale',lb:'Sistema Jurídico',pg:'juridico'}],
  interno:[
    {ic:'home',     lb:'Manutenção Predial', pg:'manutencao'},
    {ic:'monitor',  lb:'Chamados T.I.',      pg:'req-ti'},
    {ic:'wrench',   lb:'Manutenção Interna', pg:'req-manut'},
    {ic:'key',      lb:'Entrega de Chaves',  pg:'entrega'}
  ],
  calendar:[
    {ic:'calendar',      lb:'Agenda',                               pg:'agenda'},
    {ic:'clipboardList', lb:'Tarefas',                              pg:'tarefas'},
    {ic:'check',         lb:'Atividades Semanais',                  pg:'ativ-semanais'},
    {ic:'usersTwo',      lb:'Pauta Mkt · 3a 15h',                   pg:'pauta-terca'},
    {ic:'usersTwo',      lb:'Pauta Adm · 4a',                       pg:'pauta-quarta'},
    {ic:'scale',         lb:'Pauta Jurídico · 4a',                  pg:'pauta-juridico'},
    {ic:'user',          lb:'Pauta Vendas — Felippe · 5a 10h',      pg:'pauta-felippe'},
    {ic:'user',          lb:'Pauta Vendas — Emilia · 5a 11h',       pg:'pauta-emilia'},
    {ic:'user',          lb:'Pauta Vendas — Renata · 5a 10h',       pg:'pauta-renata'},
    {ic:'user',          lb:'Pauta Vendas — Christiane · 5a 11h',   pg:'pauta-christiane'}
  ],
  gestao:[
    {ic:'users',     lb:'Meus Liderados',   pg:'liderados'},
    {ic:'building',  lb:'Organograma',      pg:'organograma'},
    {ic:'clipboard', lb:'Avaliações',       pg:'avaliacoes'},
    {ic:'target',    lb:'Tarefas / Bônus',  pg:'metas'},
    {ic:'dollar',    lb:'Apurar Bônus',     pg:'bonus'},
    {ic:'star',      lb:'Avaliar Líder',    pg:'av-lider'}
  ],
  regras:[
    {ic:'clipboardList', lb:'Processos (BPMN)', pg:'processos-bpmn'},
    {ic:'briefcase', lb:'Vendas',        pg:'reg-vendas'},
    {ic:'home',      lb:'Locação',       pg:'reg-locacao'},
    {ic:'dollar',    lb:'Financeiro',    pg:'reg-financeiro'},
    {ic:'user',      lb:'RH',            pg:'reg-rh'},
    {ic:'building',  lb:'Administração', pg:'reg-adm'}
  ],
  vendas:[
    {ic:'home',          lb:'Seleção de Imóveis',     pg:'vnd-selecao'},
    {ic:'target',        lb:'Captação Mensal',        pg:'vnd-captacao'},
    {ic:'building',      lb:'Avaliação de Imóveis',   pg:'aval-imoveis'},
    {ic:'check',         lb:'Controle de Presença',   pg:'vnd-presenca'},
    {ic:'target',        lb:'Cotas de Anúncios',      pg:'vnd-cotas'},
    {ic:'calendar',      lb:'Agenda do Fotógrafo',    pg:'vnd-fotografo'}
  ]
};

// Itens do menu Vendas conforme o usuário. Gerentes ganham "Peneira" extra.
function menuVendasItens(){
  // Fotografo so ve a Agenda dele + Minha Disponibilidade (nao ve selecao/presenca/cotas)
  if (typeof ehFotografo === 'function' && ehFotografo()) {
    return [
      {ic:'calendar', lb:'Agenda do Fotógrafo',   pg:'vnd-fotografo'},
      {ic:'clock',    lb:'Minha Disponibilidade', pg:'vnd-foto-disp'}
    ];
  }
  // Representante puro (corretor rep, nao gerente/assistente/admin) so ve o Forum
  if (typeof ehRepresentantePuro === 'function' && ehRepresentantePuro()) {
    return [{ic:'users', lb:'Fórum Representantes', pg:'vnd-forum'}];
  }
  const itens = MENUS.vendas.slice();
  if (typeof ehVotantePeneira === 'function' && ehVotantePeneira()) {
    itens.splice(1, 0, {ic:'check-square', lb:'Peneira', pg:'vnd-peneira'});
  }
  if (typeof podeAcessarForumVendas === 'function' && podeAcessarForumVendas()) {
    itens.push({ic:'users', lb:'Fórum Representantes', pg:'vnd-forum'});
  }
  return itens;
}

// Quem acessa o módulo Gestão de Vendas (gerentes + assistentes).
// Match: alguma palavra do nome do usuário aparece na lista (case-insensitive).
const VENDAS_USUARIOS = [
  // Gerentes
  'Renata','Felippe','Christiane','Emilia',
  // Assistentes
  'Leticia','Thais','Camille','Amanda','Karina','Jean','Anderson',
  // Consultor externo (visao geral dos modulos dos lideres)
  'Telmo'
];
function _vendasNormaliza(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function podeAcessarVendas(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  if (typeof ehAcessoTotal === 'function' && ehAcessoTotal()) return true;
  // Fotografo eh usuario exclusivo que enxerga so a Agenda do Fotografo
  if (ehFotografo()) return true;
  // Representantes tambem entram — mas so veem o card do Forum (ehRepresentantePuro)
  if (typeof ehRepresentanteVendas === 'function' && ehRepresentanteVendas()) return true;
  const nome = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  return VENDAS_USUARIOS.some(p => {
    const alvo = _vendasNormaliza(p);
    return nome.includes(alvo) || email.includes(alvo);
  });
}

// Conta de uso exclusivo do fotografo: ve so a propria agenda
function ehFotografo(){
  if (!CUR) return false;
  const d = String(CUR.dept||'').trim().toLowerCase();
  return d === 'fotografo' || d === 'fotógrafo';
}
// Gerentes podem fazer peneira (aprovar/reprovar) na seleção
const VENDAS_GERENTES = ['Renata','Felippe','Christiane','Emilia'];
function ehGerenteVendas(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  const nome = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  return VENDAS_GERENTES.some(g => {
    const alvo = _vendasNormaliza(g);
    return nome.includes(alvo) || email.includes(alvo);
  });
}

// Votantes da peneira: 4 gerentes + Rodrigo. Cada imóvel pendente é
// votado pelos 5 (aprovado/reprovado). Maioria simples (>=3) decide.
const VOTANTES_PENEIRA = ['Renata','Felippe','Christiane','Emilia','Rodrigo'];
function nomeVotantePeneira(){
  if (!CUR) return null;
  const nome  = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  for (const g of VOTANTES_PENEIRA) {
    const alvo = _vendasNormaliza(g);
    if (nome.includes(alvo) || email.includes(alvo)) return g;
  }
  return null;
}
function ehVotantePeneira(){ return !!nomeVotantePeneira(); }

// Representantes de cada equipe pro Fórum trimestral. Nome primeiro
// (case-insensitive, sem acento) — bate por "includes" com nome/email.
const REPRESENTANTES_EQUIPE = {
  Chris:   'Ricardo',    // ricardo.angerami@novasaopaulo.com.br
  Emilia:  'Maria',      // maria.matias@novasaopaulo.com.br
  Aguia:   'Domenica',   // domenica@novasaopaulo.com.br
  Fenix:   'Willian',    // willian@novasaopaulo.com.br (2 L's)
  Felippe: 'Chang'       // won.chang@novasaopaulo.com.br
};
function _repEquipeDoUsuario(){
  if (!CUR) return null;
  const nome  = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  for (const [eq, primNome] of Object.entries(REPRESENTANTES_EQUIPE)) {
    const alvo = _vendasNormaliza(primNome);
    if (nome.includes(alvo) || email.includes(alvo)) return {equipe: eq, nome: primNome};
  }
  return null;
}
function ehRepresentanteVendas(){ return !!_repEquipeDoUsuario(); }
// Representante "puro" = corretor representante que NAO eh admin nem
// gerente nem assistente. So enxerga o card do Forum dentro de Vendas.
function ehRepresentantePuro(){
  if (!CUR) return false;
  if (CUR.admin) return false;
  if (!ehRepresentanteVendas()) return false;
  if (ehGerenteVendas()) return false;
  // Se estiver em VENDAS_USUARIOS (assistente/gerente) tambem nao eh "puro"
  const nome = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  const ehAssistente = VENDAS_USUARIOS.some(p => {
    const alvo = _vendasNormaliza(p);
    return nome.includes(alvo) || email.includes(alvo);
  });
  return !ehAssistente;
}
// Acesso ao fórum: representantes + gerentes + admin
// Gestao de corretores (modulo Presenca): restrita a gerentes de
// vendas + assistentes autorizadas (Camille e Thais) — decisao de
// ago/2026; antes qualquer usuario de vendas podia apagar/inserir.
const GESTAO_CORRETORES_EXTRA = ['Camille','Thais'];
function podeGerenciarCorretores(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  if (typeof ehAcessoTotal === 'function' && ehAcessoTotal()) return true;
  if (typeof ehGerenteVendas === 'function' && ehGerenteVendas()) return true;
  const nome = _vendasNormaliza(CUR.nome||'');
  return GESTAO_CORRETORES_EXTRA.some(n => nome.includes(_vendasNormaliza(n)));
}
function podeAcessarForumVendas(){
  if (!CUR) return false;
  if (CUR.admin) return true;
  return ehRepresentanteVendas() || ehGerenteVendas();
}
// Nome + equipe pra autoria de tópicos/comentários
function autorForumInfo(){
  if (!CUR) return {nome: (CUR&&CUR.nome)||'', equipe: ''};
  const rep = _repEquipeDoUsuario();
  if (rep) return {nome: rep.nome, equipe: rep.equipe};
  // Gerente: descobre pela lista GERENTE_EQUIPES
  if (typeof equipesDoGerente === 'function') {
    const eqs = equipesDoGerente();
    return {nome: CUR.nome || '', equipe: eqs.join('+')};
  }
  return {nome: CUR.nome || '', equipe: ''};
}

// Mapeamento de gerente → equipes que lidera (para peneira e escopo)
// Renata é gerente das equipes Aguia e Fenix (mantemos os nomes originais).
const GERENTE_EQUIPES = {
  Renata:     ['Aguia','Fenix'],
  Felippe:    ['Felippe'],
  Christiane: ['Chris'],
  Emilia:     ['Emilia']
};
function equipesDoGerente(){
  if (!CUR) return [];
  if (CUR.admin) return ['Aguia','Chris','Emilia','Felippe','Fenix'];
  const nome  = _vendasNormaliza(CUR.nome||'');
  const email = _vendasNormaliza((CUR.email||'').split('@')[0]);
  for (const [g, eqs] of Object.entries(GERENTE_EQUIPES)) {
    const alvo = _vendasNormaliza(g);
    if (nome.includes(alvo) || email.includes(alvo)) return eqs.slice();
  }
  return [];
}

// Lista oficial de corretores ativos por equipe (extraída do Relatório de
// Produtividade do NIDO em jun/2026, filtrando inativos). Usada na marcação
// de presença (tica em vez de digitar nome) e em validações.
const CORRETORES_POR_EQUIPE = {
  Aguia: [
    'Sandra Bernardes','Nina','Fabio Ayres','Hellen Queiroz','Dirce','Tatiana',
    'Amelia Fuji','Akemi','Domenica','Barbosa','Helio','Jane','Evita'
  ],
  Chris: [
    'Suely','Solange','Olympia','Luisa','Norberto','Christiane','Ana','Nilson',
    'Claudia França','Ricardo Kraut','Gabriela Roza','Wagner Daniele',
    'Leandrinni','Karina','Viviane','Gonzalo','Alencar'
  ],
  Emilia: [
    'Eva','Clara','Maria','Alexandre Silva','Heloisa','Tania','Moacir','Elson',
    'Naldo','Marilda','Amanda','Emilia Vitória','Beto','Mayza','Noemi',
    'Patricia','Aragon'
  ],
  Felippe: [
    'Gilmar Bancaro','Amauri','Rosangela','Adolfo Rizzi','Luzinete','Neusa',
    'Marcia','Luzia','Claudio Norte','Wellington','Claudete Causfer','Lucio',
    'Felippe Lemos','Hevana','Ellen Moreira','Selena','Camille',
    'Duda','Chang','Monica','Betta'
  ],
  Fenix: [
    'Rachel Saez','Andreia Carvalho','Kali','Regina','Thiago','Margara',
    'Lucila','Magali','Willian'
  ]
};
function corretoresDaEquipe(eq){ return CORRETORES_POR_EQUIPE[eq] || []; }
function todasEquipes(){ return Object.keys(CORRETORES_POR_EQUIPE); }

// Carrega corretores do banco e sobrescreve CORRETORES_POR_EQUIPE. Se der
// erro (tabela nao existe ou rede caiu), mantem a constante como fallback.
// Chamado ao entrar em Controle de Presenca / Seleção de Imoveis.
let _CORRETORES_CARREGADO = false;
async function carregarCorretoresDoBanco(force){
  if (_CORRETORES_CARREGADO && !force) return;
  try {
    const linhas = await db.get('vendas_corretores', '?ativo=eq.true&order=equipe,nome');
    if (!Array.isArray(linhas) || !linhas.length) { _CORRETORES_CARREGADO = true; return; }
    const novoMapa = {};
    ['Aguia','Chris','Emilia','Felippe','Fenix'].forEach(eq => { novoMapa[eq] = []; });
    linhas.forEach(l => {
      if (novoMapa[l.equipe]) novoMapa[l.equipe].push(l.nome);
    });
    // Substitui as chaves de CORRETORES_POR_EQUIPE in-place
    Object.keys(CORRETORES_POR_EQUIPE).forEach(k => { CORRETORES_POR_EQUIPE[k] = novoMapa[k] || []; });
    _CORRETORES_CARREGADO = true;
    console.log('[corretores] carregados do banco:',
      Object.entries(CORRETORES_POR_EQUIPE).map(([k,v]) => `${k}:${v.length}`).join(' · '));
  } catch(e) {
    console.warn('[corretores] banco falhou, usando constante:', e.message);
  }
}
const TITLES={
  home:'Portal',juridico:'Sistema Jurídico','interno-home':'Sistema Interno',
  manutencao:'Manutenção Predial',requisicoes:'Requisições Internas',
  'req-ti':'Chamados T.I. (Fabio)','req-manut':'Manutenção Interna (Marcelo)',
  entrega:'Entrega de Chaves',
  'avisos':'Avisos de Envio',
  'regras-home':'Regras e Processos',
  'reg-vendas':'Regras — Vendas',
  'reg-locacao':'Regras — Locação',
  'reg-financeiro':'Regras — Financeiro',
  'reg-rh':'Regras — RH',
  'reg-adm':'Regras — Administração',
  'vendas-home':'Gestão de Vendas',
  'vnd-selecao':'Seleção de Imóveis','vnd-captacao':'Captação Mensal','aval-imoveis':'Avaliação de Imóveis','vnd-peneira':'Peneira de Imóveis','vnd-presenca':'Controle de Presença',
  'juridico-embed':'Sistema Jurídico',
  'vnd-cotas':'Cotas de Anúncios','vnd-fotografo':'Agenda do Fotógrafo',
  'vnd-foto-disp':'Minha Disponibilidade',
  'vnd-forum':'Fórum dos Representantes',
  tarefas:'Tarefas',agenda:'Agenda',horarios:'Horários Livres',
  'ativ-semanais':'Atividades Semanais',
  'pauta-terca':'Pauta Mkt','pauta-quarta':'Pauta Adm','pauta-juridico':'Pauta Jurídico',
  'pauta-renata':'Pauta Vendas — Renata (Moema)','pauta-felippe':'Pauta Vendas — Felippe',
  'pauta-christiane':'Pauta Vendas — Christiane','pauta-emilia':'Pauta Vendas — Emilia',
  liderados:'Meus Liderados',organograma:'Organograma',avaliacoes:'Avaliações Trimestrais',
  'processos-bpmn':'Processos (BPMN)',
  metas:'Tarefas e Pontuação de Bônus',bonus:'Apuração de Bônus',
  'av-lider':'Avaliação do Líder'
};


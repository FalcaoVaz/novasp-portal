// Lookup case-insensitive + sem acento em objeto parseado do GAS.
// Tolera variacoes de header da planilha: 'Agência', 'agencia', 'AGENCIA', etc.
function gasField(obj, ...candidatos) {
  if (!obj) return '';
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[^\w\s]/g,'').trim();
  // Tenta lookup direto primeiro (mais rapido)
  for (const c of candidatos) if (obj[c] !== undefined && obj[c] !== '') return obj[c];
  // Fallback: varre chaves normalizadas
  const alvos = candidatos.map(norm);
  for (const k of Object.keys(obj)) {
    if (alvos.includes(norm(k)) && obj[k] !== '' && obj[k] != null) return obj[k];
  }
  return '';
}

function gasParseRows(resp) {
  // Caso 1: {success:true, data:[...]} — formato do calendar
  if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
    const arr = resp.data || resp.tarefas || resp.events || resp.horarios ||
                resp.pautaTerca || resp.pautaQuarta || resp.dados || [];
    if (Array.isArray(arr)) {
      // Se array de objetos, retorna direto
      if (arr.length === 0 || !Array.isArray(arr[0])) return arr;
      // Se array de arrays (com cabeçalho), converte
      const headers = arr[0].map(h => String(h).trim());
      return arr.slice(1)
        .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
        .map(row => { const o={}; headers.forEach((h,i)=>o[h]=row[i]??''); return o; });
    }
    return [];
  }
  // Caso 2: array de arrays (formato manutenção/requisições)
  if (Array.isArray(resp) && resp.length > 0 && Array.isArray(resp[0])) {
    const headers = resp[0].map(h => String(h).trim());
    return resp.slice(1)
      .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
      .map(row => { const o={}; headers.forEach((h,i)=>o[h]=row[i]??''); return o; });
  }
  // Caso 3: já é array de objetos
  if (Array.isArray(resp)) return resp;
  return [];
}

// ── Helpers de "por mes" (compartilhados entre manutencao, requisicoes, chamados) ──
const _MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function _mesKeyPt(s){
  if(!s) return '';
  const t = String(s).trim();
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m) return m[3]+'-'+m[2].padStart(2,'0');
  m = t.match(/^(\d{4})-(\d{2})-\d{2}/);
  if(m) return m[1]+'-'+m[2];
  // tenta Date()
  try{ const d=new Date(t); if(!isNaN(d)) return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }catch(_){}
  return '';
}
function _ultMesesIds(n){
  const hoje = new Date(); hoje.setDate(1);
  const arr = [];
  for(let i=n-1;i>=0;i--){
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    arr.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return arr;
}
function _mesLabelPt(yyyymm){
  const p = yyyymm.split('-');
  if (p.length!==2) return yyyymm;
  return _MESES_ABREV[parseInt(p[1],10)-1]+'/'+p[0].slice(2);
}
// Renderiza grafico de barras mini num container, dados barras por mes.
// itens: array de objetos. dataPicker(item) -> string de data parseavel.
// onClickMes: callback(yyyymm) invocado ao clicar numa barra. mesSelecionado: 'YYYY-MM' para destaque.
function renderPorMes(containerId, totId, itens, dataPicker, qtdMeses=6, onClickMes=null, mesSelecionado=''){
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const meses = _ultMesesIds(qtdMeses);
  const cont2 = {}; meses.forEach(m => cont2[m]=0);
  let total = 0;
  for (const it of itens||[]){
    const k = _mesKeyPt(dataPicker(it));
    if (k && cont2.hasOwnProperty(k)) { cont2[k]++; total++; }
  }
  const max = Math.max(1, ...meses.map(m => cont2[m]));
  const atual = meses[meses.length-1];
  cont.innerHTML = meses.map(m => {
    const v = cont2[m];
    const pct = (v/max)*100;
    const sel = (m===mesSelecionado);
    const cls = sel ? 'pbar sel' : (m===atual ? 'pbar atual' : 'pbar');
    const clickAttr = onClickMes ? ` onclick="(${onClickMes.name})('${m}')"` : '';
    const csr = onClickMes ? 'cursor:pointer' : '';
    return `<div class="pcol" style="${csr}"${clickAttr}><div class="pval">${v}</div>`
      +`<div class="${cls}" style="height:${pct}%;${csr}" title="${v} em ${_mesLabelPt(m)}${onClickMes?' (clique para filtrar)':''}"></div>`
      +`<div class="plbl">${_mesLabelPt(m)}</div></div>`;
  }).join('');
  if (totId) {
    const tot = document.getElementById(totId);
    if (tot) {
      tot.innerHTML = mesSelecionado
        ? `Filtrando: <b style="color:#1e293b">${_mesLabelPt(mesSelecionado)}</b> · <a href="#" onclick="(${onClickMes?.name||'(()=>{})'})('${mesSelecionado}');return false;" style="color:var(--amber)">limpar</a>`
        : `Total nos últimos ${qtdMeses} meses: <b style="color:#1e293b">${total}</b>${onClickMes?' · clique numa barra':''}`;
    }
  }
}

async function loadMan(){
  const tbody=document.getElementById('tb-man');
  if(tbody) tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8">Conectando...</td></tr>';

  if(!GAS_MANUTENCAO || GAS_MANUTENCAO.includes('COLE_AQUI')){
    if(tbody) tbody.innerHTML='<tr><td colspan="5"><div class="empty"><div class="ei">⚙️</div><p>Configure a URL do Apps Script de manutenção.<br><small>Extensões → Apps Script → Implantar → copie a URL</small></p></div></td></tr>';
    return;
  }

  try{
    const resp = await gasGet(GAS_MANUTENCAO, {acao:'listar_chamados'});
    console.log('MAN raw tipo:', typeof resp, Array.isArray(resp), JSON.stringify(resp).substring(0,300));
    const lista = gasParseRows(resp);
    console.log('MAN parsed:', lista.length, lista[0]?Object.keys(lista[0]):[]);
    _manDados = lista;
    setEl('man-tot', lista.length);
    setEl('man-and', lista.filter(x=>(x.Status||'').toLowerCase().includes('andamento')).length);
    setEl('man-ok',  lista.filter(x=>(x.Status||'').toLowerCase().includes('conclu')).length);
    setEl('man-ab',  lista.filter(x=>(x.Status||'Aberto').toLowerCase().includes('aber')).length);
    renderTbMan(lista);
    // Chamados por mes (data de abertura) - clique filtra a lista
    renderPorMes('man-pmes-bars','man-pmes-tot', lista, x => x.Data || x.data || '', 6, setManMesFiltro, _manMesFiltro);
  }catch(e){
    console.error('loadMan:', e.message);
    const tbody2=document.getElementById('tb-man');
    if(tbody2) tbody2.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message?.substring(0,100)}</p></div></td></tr>`;
    ['man-tot','man-and','man-ok','man-ab'].forEach(id=>setEl(id,'—'));
  }
}
// Wrapper: pre-preenche email do usuario logado e abre modal de Manutencao
function abrirNovoChamadoMan(){
  // Pre-preenche nome e email do usuario logado (caso vazios)
  const nm = document.getElementById('man-nome');
  if (nm && !nm.value) nm.value = CUR?.nome || '';
  const em = document.getElementById('man-email');
  if (em && !em.value) em.value = CUR?.email || '';
  const ab = document.getElementById('man-abertura');
  if (ab) ab.value = CUR?.nome || '';
  openM('m-man');
}

// Wrapper: pre-preenche email do usuario logado e abre modal de Requisicao
function abrirNovaReq(){
  const re = document.getElementById('re');
  if (re && !re.value) re.value = CUR?.email || '';
  openM('m-req');
}

async function savMan(){
  const nm=document.getElementById('man-nome').value.trim();
  const en=document.getElementById('man-end').value.trim();
  const ds=document.getElementById('man-desc').value.trim();
  const emEl=document.getElementById('man-email');
  const em=emEl?emEl.value.trim():'';
  if(!nm||!en||!ds){toast('Preencha nome, endereço e descrição.','err');return;}
  if(!em||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){
    toast('Informe um e-mail válido para receber notificações.','err');
    if(emEl) emEl.focus();
    return;
  }
  const p=`MAN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
  const dt=new Date().toLocaleDateString('pt-BR');
  const vinculo=document.getElementById('man-vinculo')?.value||'Locatário';
  const abertura=CUR.nome;
  try{
    const dados={
      protocolo:p, data:dt,
      nome: nm,
      telefone: document.getElementById('man-tel').value||'',
      email: document.getElementById('man-email').value||'',
      endereco: en,
      servico: document.getElementById('man-tipo').value,
      obs: `[${vinculo}] Atendimento realizado por: ${abertura}. ${ds}`
    };
    await gasGet(GAS_MANUTENCAO, {acao:'abrir', dados:encodeURIComponent(JSON.stringify(dados))});
    closeM('m-man');
    ['man-nome','man-tel','man-end','man-email','man-desc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    toast('✅ Chamado '+p+' aberto!','ok'); loadMan();
  }catch(e){ toast('Erro: '+e.message,'err'); }
}

// REQUISIÇÕES — Apps Script: sem parâmetro = lista tudo; ?dados={...} = insere
async function loadReq(){
  const tbody=document.getElementById('tb-req');
  if(tbody) tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">Carregando...</td></tr>';
  try{
    const resp=await gasGet(GAS_REQUISICOES,{});
    console.log('REQ raw:', JSON.stringify(resp).substring(0,200));
    // Colunas: Protocolo,Data,Setor,Responsável,Prioridade,Líder,Agência,E-mail,Telefone,Título,Descrição,...,Status
    const d=gasParseRows(resp);
    console.log('REQ parsed:', d.length, d[0]?Object.keys(d[0]):[]);
    _reqDados=d;
    _aplicarModoReqUI(); // ajusta titulo e visibilidade dos filtros conforme modo fixo
    filtrarReq(_reqFiltroAtual||'todos', null);
    renderPorMes('req-pmes-bars','req-pmes-tot', _reqAplicaModoFixo(d), x => x.Data || x.data || '', 6, setReqMesFiltro, _reqMesFiltro);
  }catch(e){
    console.error('loadReq:',e);
    if(tbody) tbody.innerHTML=`<tr><td colspan="6"><div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message?.substring(0,80)||''}</p></div></td></tr>`;
  }
}
async function saveReq(){
  const ti=document.getElementById('rd').value.trim();
  if(!ti){toast('Informe a descrição.','err');return;}
  const emEl = document.getElementById('re');
  const em = emEl ? emEl.value.trim() : '';
  if(!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){
    toast('Informe um e-mail válido (você receberá as notificações).','err');
    if(emEl) emEl.focus();
    return;
  }
  const p=`NSP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
  try{
    const tipoReq = document.getElementById('rt').value;
    // Roteamento: TI -> Fabio; Manutencao -> Marcelo Miranda; Outro -> Marcelo (default)
    // Aceita variacoes "TI", "T.I.", "T.I", "t i", etc.
    const ehTI = /^t\.?\s*i\.?$/i.test(tipoReq.trim());
    const responsavel = ehTI ? 'Fabio' : 'Marcelo Miranda';
    console.log('[saveReq] setor:', tipoReq, '-> responsavel:', responsavel);
    const dados={
      protocolo:p,
      data:new Date().toLocaleDateString('pt-BR'),
      setor:tipoReq,
      responsavel,
      prioridade:document.getElementById('ru').value==='Urgente'?'Urgente':'Normal',
      lider:CUR.nome,
      agencia:document.getElementById('ra').value,
      email:em,
      telefone:'',
      titulo:ti,
      descricao:ti,
      status:'Aberta'
    };
    await gasGet(GAS_REQUISICOES,{dados:encodeURIComponent(JSON.stringify(dados))});
    // limpa o campo descricao mas mantem o email salvo (proximo cadastro ja vem preenchido)
    document.getElementById('rd').value='';
    closeM('m-req');toast('✅ Requisição '+p+' enviada! Notificações para '+em,'ok');loadReq();
  }catch(e){toast('Erro: '+e.message,'err');}
}


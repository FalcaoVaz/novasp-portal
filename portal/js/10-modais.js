// UTILS
function setEl(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function openM(id){
  document.getElementById(id).classList.add('open');
  if(id==='m-man'&&CUR){const ab=document.getElementById('man-abertura');if(ab)ab.value=CUR.nome;}
  // Calendar e tarefas usam SO os usuarios elegiveis (lideres + vendas + admin).
  // Os demais (operacional, juridico, telefonista, etc.) nao aparecem como
  // participantes nem responsaveis.
  const _calUsers = (typeof usuariosCalendar==='function') ? usuariosCalendar() : (USERS||[]);
  if(id==='m-ev'){
    const sel=document.getElementById('ev-partic-sel');
    if(sel && _calUsers.length){
      sel.innerHTML='<option value="">+ Adicionar participante...</option>';
      _calUsers.forEach(u=>{sel.innerHTML+=`<option value="${u.nome}">${u.nome}</option>`;});
    }
    const lista=document.getElementById('ev-partic-lista');
    if(lista)lista.innerHTML='';
    _evParticipantes=[];
  }
  if(id==='m-tar'){
    const sel=document.getElementById('tar-partic-sel');
    if(sel && _calUsers.length){
      sel.innerHTML='<option value="">+ Adicionar responsável...</option>';
      _calUsers.forEach(u=>{sel.innerHTML+=`<option value="${u.nome}">${u.nome}</option>`;});
    }
    const lista=document.getElementById('tar-partic-lista');
    if(lista)lista.innerHTML='';
    _tarParticipantes=[];
    // Pre-seleciona o proprio usuario como primeiro responsavel
    if(CUR?.nome) addParticipanteTar(CUR.nome);
  }
}

let _evParticipantes=[];
function addParticipante(nome){
  if(!nome||_evParticipantes.includes(nome))return;
  _evParticipantes.push(nome);
  const lista=document.getElementById('ev-partic-lista');
  if(!lista)return;
  const chip=document.createElement('span');
  chip.style.cssText='display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#dbeafe;color:#1d4ed8;border-radius:99px;font-size:12px;font-weight:500';
  chip.innerHTML=`${nome} <button onclick="remParticipante('${nome.replace(/'/g,"")}',this.parentElement)" style="background:none;border:none;cursor:pointer;color:#1d4ed8;font-size:13px;padding:0">×</button>`;
  lista.appendChild(chip);
}
function remParticipante(nome,el){
  _evParticipantes=_evParticipantes.filter(x=>x!==nome);
  if(el)el.remove();
}

let _tarParticipantes=[];
function addParticipanteTar(nome){
  if(!nome||_tarParticipantes.includes(nome))return;
  _tarParticipantes.push(nome);
  const lista=document.getElementById('tar-partic-lista');
  if(!lista)return;
  const chip=document.createElement('span');
  chip.style.cssText='display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#dbeafe;color:#1d4ed8;border-radius:99px;font-size:12px;font-weight:500';
  chip.innerHTML=`${nome} <button onclick="remParticipanteTar('${nome.replace(/'/g,"")}',this.parentElement)" style="background:none;border:none;cursor:pointer;color:#1d4ed8;font-size:13px;padding:0">×</button>`;
  lista.appendChild(chip);
}
function remParticipanteTar(nome,el){
  _tarParticipantes=_tarParticipantes.filter(x=>x!==nome);
  if(el)el.remove();
}

function closeM(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.mo').forEach(o=>{let _down=false;o.addEventListener('mousedown',e=>{_down=(e.target===o);});o.addEventListener('click',e=>{const ok=(e.target===o)&&_down;_down=false;if(ok)o.classList.remove('open');});});
function toast(msg,type=''){const c=document.getElementById('tc');const t=document.createElement('div');t.className='toast '+(type==='ok'?'ok':type==='err'?'err':'');t.textContent=msg;c.appendChild(t);setTimeout(()=>t.remove(),3500);}
function toggleSB(){document.querySelector('.sidebar').classList.toggle('open');document.getElementById('sbo').classList.toggle('open');}
function closeSB(){document.querySelector('.sidebar').classList.remove('open');document.getElementById('sbo').classList.remove('open');}

initLogin();

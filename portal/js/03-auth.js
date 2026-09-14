// Chave do localStorage pra sessao persistente (30 dias)
// v1 → v2 em 08/08/2026: invalida as sessoes lembradas de antes da
// Fase 1 — forca UM re-login com senha, que e o que cria a conta no
// Supabase Auth (59 usuarios estavam presos no auto-login sem migrar)
// v2 → v3 em 12/08/2026: a onda do v2 falhou pra senhas de 4-5 chars
// (GoTrue exige 6; ver _authSenha) — nova onda com a correcao no ar.
const _AUTH_KEY = 'nsp_auth_v3';
const _AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 dias

function _salvarAuthPersistente(u){
  try {
    // sb:true marca sessao validada pelo Supabase Auth (modo pos-RLS,
    // quando o senha_hash nao esta mais visivel pra tela de login).
    localStorage.setItem(_AUTH_KEY, JSON.stringify({
      email: u.email, senha_hash: u.senha_hash || null,
      sb: !u.senha_hash, ts: Date.now()
    }));
  } catch(_){}
}
function _limparAuthPersistente(){
  try { localStorage.removeItem(_AUTH_KEY); } catch(_){}
}
function _lerAuthPersistente(){
  try {
    const raw = localStorage.getItem(_AUTH_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.email || (!obj?.senha_hash && !obj?.sb)) return null;
    if (Date.now() - (obj.ts || 0) > _AUTH_TTL_MS) { _limparAuthPersistente(); return null; }
    return obj;
  } catch(_) { return null; }
}

// INIT LOGIN — carrega usuarios em background para validacao por email
async function initLogin(){
  const log = msg => { const d = document.getElementById('dbg'); if(d) d.textContent = msg; };
  log('Conectando ao banco...');

  const queries=[
    // Filtro ativo=true esconde ex-funcionarios do login (coluna criada jul/2026)
    ['usuarios','?select=id,nome,email,dept,cor_avatar,nivel,judicial,admin,acesso_juridico,acesso_interno,acesso_calendar,senha_hash&ativo=eq.true&order=nome.asc'],
    // Fallbacks pra banco sem a coluna ativo
    ['usuarios','?select=id,nome,email,dept,cor_avatar,nivel,judicial,admin,acesso_juridico,acesso_interno,acesso_calendar,senha_hash&order=nome.asc'],
    ['usuarios','?select=id,nome,email,nivel,judicial,admin,senha_hash&order=nome.asc'],
    // Pos-RLS: anonimo nao le mais a tabela usuarios; a view usuarios_login
    // expoe so o minimo da tela de login (sem senha_hash — a senha passa a
    // ser validada pelo Supabase Auth em doLogin).
    ['usuarios_login','?select=id,nome,email,dept,cor_avatar,tem_senha&ativo=eq.true&order=nome.asc']
  ];
  for(const [tabela,q] of queries){
    try{
      USERS = await db.get(tabela, q);
      if(!Array.isArray(USERS) || USERS.length===0) throw new Error('lista vazia (RLS ativo?)');
      const viaView = (tabela==='usuarios_login');
      USERS = USERS.map(u=>({
        _viaView: viaView,
        ...u,
        dept: u.dept||'',
        cor_avatar: u.cor_avatar||'#1E2D4A',
        acesso_juridico: u.acesso_juridico!==undefined ? u.acesso_juridico : true,
        acesso_interno:  u.acesso_interno!==undefined  ? u.acesso_interno  : true,
        acesso_calendar: u.acesso_calendar!==undefined ? u.acesso_calendar : true,
      }));
      console.log('✅ Usuários carregados:', USERS.length);
      log(`Pronto. ${USERS.length} contas cadastradas.`);

      // Auto-login se sessao persistente valida
      const auth = _lerAuthPersistente();
      if (auth) {
        let u = USERS.find(x => (x.email||'').toLowerCase() === auth.email.toLowerCase());
        let ok = false;
        if (u && !u._viaView && auth.senha_hash && u.senha_hash === auth.senha_hash) {
          // Renova o token do Supabase (expira em 1h; a sessão persistente dura 30d)
          if (typeof renovarSessaoSupabase === 'function') await renovarSessaoSupabase();
          ok = true;
        } else if (u && u._viaView) {
          // Pos-RLS: sem senha_hash pra comparar — o refresh_token da
          // sessao Supabase e a prova de identidade.
          if (await renovarSessaoSupabase()) {
            const full = await db.get('usuarios','?id=eq.'+u.id+'&limit=1').catch(()=>[]);
            if (full && full[0]) u = {...u, ...full[0]};
            ok = true;
          }
        }
        if (ok) {
          CUR = u;
          document.getElementById('ls').style.display = 'none';
          document.getElementById('app').style.display = 'block';
          initApp();
          console.log('[auth] auto-login via localStorage:', u.email);
          return;
        }
        // Senha mudou, usuario removido ou sessao expirada → limpa
        _limparAuthPersistente();
      }
      return;
    }catch(e){
      console.warn('Query falhou:', e.message);
      log('Tentando alternativa: '+e.message.substring(0,60));
    }
  }
  document.getElementById('lerr').style.display='block';
  document.getElementById('lerr').textContent='Erro ao conectar ao banco. Verifique sua internet e tente novamente.';
}

// Hash SHA-256 via Web Crypto API
async function hashSenha(s){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function showErr(m){const e=document.getElementById('lerr');e.style.display='block';e.textContent=m;}
function hideErr(){document.getElementById('lerr').style.display='none';}
// Monta a URL do jurídico. Em aba separada nao tem postMessage com o
// portal, entao o access_token (1h) vai no hash — o jurídico le e limpa
// da URL na hora. O refresh_token NUNCA sai do portal.
async function _urlJuridico(comToken){
  let hash='';
  if (comToken) {
    try {
      if (typeof renovarSessaoSupabase === 'function') await renovarSessaoSupabase();
      const s = _authCarregarSessao();
      if (s && s.access_token && Date.now() < (s.expires_at||0)) {
        hash = '#at='+encodeURIComponent(s.access_token)+'&exp='+s.expires_at;
      }
    } catch(_) {}
  }
  return 'https://falcaovaz.netlify.app?uid='+CUR.id+'&nome='+encodeURIComponent(CUR.nome)+hash;
}
function abrirJuridico(){
  // Embeda o juridico em iframe dentro do portal — a sidebar de modulos
  // (Manutencao/Calendar/Vendas/etc) continua acessivel do lado.
  const url='https://falcaovaz.netlify.app?uid='+CUR.id+'&nome='+encodeURIComponent(CUR.nome);
  const iframe = document.getElementById('juridico-iframe');
  if (iframe) {
    // Assim que o iframe carrega, empurra o token da sessão pra ele
    // (ele tambem pede sozinho via nsp-token-request; isso cobre reloads).
    iframe.onload = function(){
      try { if (iframe.contentWindow) _enviarTokenJuridico(iframe.contentWindow); } catch(_) {}
    };
    iframe.src = url;
  }
  const linkExterno = document.getElementById('juridico-link-externo');
  if (linkExterno) {
    linkExterno.href = url;
    _urlJuridico(true).then(u => { linkExterno.href = u; });
  }
  if (typeof goTo === 'function') goTo('juridico-embed');
  else if (typeof setMod === 'function') setMod('juridico');
}
// Fallback pra quem prefere abrir em nova aba (menu de contexto)
async function abrirJuridicoNovaAba(){
  window.open(await _urlJuridico(true),'_blank');
}



// Normaliza pra comparar nomes ignorando acentos / case.
// "Fotografo" === "Fotógrafo" === "FOTÓGRAFO" === "fotografo"
function _normLogin(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .trim();
}

function checkUser(){
  const raw = (document.getElementById('lemail')?.value || '').trim();
  if(!raw){ showErr('Informe seu email ou nome.'); return; }
  const rawLower = raw.toLowerCase();
  const rawNorm  = _normLogin(raw);
  let u = null;

  if (raw.includes('@')) {
    // Tem @ → busca por email exato (case-insensitive)
    u = (USERS||[]).find(x => (x.email||'').trim().toLowerCase() === rawLower);
    if(!u){ showErr('Email não cadastrado. Tente seu nome ou peça ao líder pra cadastrar.'); return; }
  } else {
    // Sem @ → busca por nome, tolerante a acentos
    // 1) exato (normalizado)
    u = (USERS||[]).find(x => _normLogin(x.nome) === rawNorm);
    if(!u){
      // 2) match parcial (digitou "renata" e existe "Renata Navarro")
      const candidatos = (USERS||[]).filter(x => _normLogin(x.nome).includes(rawNorm));
      if(candidatos.length === 1) u = candidatos[0];
      else if(candidatos.length > 1){
        showErr(`${candidatos.length} pessoas têm esse nome. Digite mais completo (ex: "Maria Silva") ou use seu email.`);
        return;
      } else {
        showErr('Nome ou email não encontrado. Confirme com seu líder.');
        return;
      }
    }
  }

  CUR = u;
  document.getElementById('step1').style.display='none';
  document.getElementById('step2').style.display='block';
  const av=document.getElementById('login-av');
  av.textContent = u.nome.split(' ').slice(0,2).map(n=>n[0]).join('');
  av.style.background = u.cor_avatar||'#1E2D4A';
  document.getElementById('login-nome-lbl').textContent = u.nome;
  document.getElementById('login-dept-lbl').textContent = u.dept || u.email || '';
  hideErr();
  // No modo view (pos-RLS) o senha_hash nao vem — tem_senha responde.
  const temSenha = u._viaView ? !!u.tem_senha : !!u.senha_hash;
  if(!temSenha){
    document.getElementById('s2-nova').style.display='block';
    document.getElementById('s2-exist').style.display='none';
    setTimeout(()=>document.getElementById('lsen-nova').focus(),100);
  }else{
    document.getElementById('s2-nova').style.display='none';
    document.getElementById('s2-exist').style.display='block';
    setTimeout(()=>document.getElementById('lsen').focus(),100);
  }
}

async function doLogin(){
  const btn=document.getElementById('lbtn');
  btn.disabled=true; btn.textContent='Entrando...';
  hideErr();
  let _senhaPlana = null;   // guardada só na memória, pra abrir a sessão no Supabase Auth
  try{
    const temSenha = CUR._viaView ? !!CUR.tem_senha : !!CUR.senha_hash;
    if(!temSenha){
      const nova=document.getElementById('lsen-nova').value;
      const conf=document.getElementById('lsen-conf').value;
      if(nova.length<6){showErr('Senha deve ter ao menos 6 caracteres.');btn.disabled=false;btn.textContent='Entrar';return;}
      if(nova!==conf){showErr('As senhas não coincidem.');btn.disabled=false;btn.textContent='Entrar';return;}
      const hash=await hashSenha(nova);
      if(CUR._viaView){
        // Pos-RLS: primeiro cria a conta no Auth (signup e permitido —
        // conta nova), pra so entao gravar o hash ja autenticado.
        const okAuth = await autenticarSupabase(CUR, nova);
        if(!okAuth){showErr('Não foi possível criar sua conta agora. Tente de novo em instantes.');btn.disabled=false;btn.textContent='Entrar';return;}
        await db.patch('usuarios',CUR.id,{senha_hash:hash,primeiro_acesso:false}).catch(e=>console.warn('patch senha_hash:',e.message));
      }else{
        await db.patch('usuarios',CUR.id,{senha_hash:hash,primeiro_acesso:false});
      }
      CUR.senha_hash=hash; CUR.tem_senha=true;
      _senhaPlana = nova;
    }else if(CUR._viaView){
      // Pos-RLS: quem valida a senha e o Supabase Auth (o hash nao esta
      // mais visivel aqui). somenteLogin impede que uma senha errada
      // crie conta pra usuario ainda nao migrado.
      const senha=document.getElementById('lsen').value;
      if(!senha){showErr('Digite sua senha.');btn.disabled=false;btn.textContent='Entrar';return;}
      const okAuth = await autenticarSupabase(CUR, senha, {somenteLogin:true});
      if(!okAuth){showErr('Senha incorreta — ou sua conta ainda não foi migrada. Se tiver certeza da senha, fale com o Rodrigo.');btn.disabled=false;btn.textContent='Entrar';return;}
      _senhaPlana = senha;
    }else{
      const senha=document.getElementById('lsen').value;
      if(!senha){showErr('Digite sua senha.');btn.disabled=false;btn.textContent='Entrar';return;}
      const hash=await hashSenha(senha);
      if(hash!==CUR.senha_hash){showErr('Senha incorreta. Tente novamente.');btn.disabled=false;btn.textContent='Entrar';return;}
      _senhaPlana = senha;
    }
    // Senha conferida: abre a sessão autenticada no Supabase (migração
    // transparente — cria a conta no 1º login se ainda não existir).
    // Se falhar, segue com a chave anônima: não bloqueia o acesso.
    if (!CUR._viaView && typeof autenticarSupabase === 'function') {
      await autenticarSupabase(CUR, _senhaPlana);
    }
    // No modo view faltam nivel/permissoes — busca a linha completa
    // agora que a sessao autenticada existe.
    if (CUR._viaView) {
      const full = await db.get('usuarios','?id=eq.'+CUR.id+'&limit=1').catch(()=>[]);
      if (full && full[0]) CUR = {...CUR, ...full[0]};
    }
    _senhaPlana = null;
    btn.disabled=false; btn.textContent='Entrar';
    // Se "manter-me conectado" marcado, persiste no localStorage
    const manter = document.getElementById('lmanter')?.checked;
    if (manter) _salvarAuthPersistente(CUR);
    else _limparAuthPersistente();
    document.getElementById('ls').style.display='none';
    document.getElementById('app').style.display='block';
    initApp();
  }catch(e){
    showErr('Erro ao entrar: '+e.message);
    btn.disabled=false; btn.textContent='Entrar';
  }
}

function doLogout(){
  _limparAuthPersistente();
  if (typeof encerrarSessaoSupabase === 'function') encerrarSessaoSupabase();
  CUR=null;
  document.getElementById('app').style.display='none';
  document.getElementById('ls').style.display='flex';
  ['lemail','lsen','lsen-nova','lsen-conf'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  voltarStep1();
}

// Volta da tela de senha para o campo de email
function voltarStep1(){
  const s1=document.getElementById('step1');
  const s2=document.getElementById('step2');
  const s3=document.getElementById('step3');
  if(s1) s1.style.display='block';
  if(s2) s2.style.display='none';
  if(s3) s3.style.display='none';
  ['lsen','lsen-nova','lsen-conf','reset-codigo','reset-nova','reset-conf'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  hideErr();
  setTimeout(()=>document.getElementById('lemail')?.focus(),100);
}

// ─── ESQUECI A SENHA (código por email via Apps Script) ─────────────
function _maskEmail(em){
  em=String(em||''); const i=em.indexOf('@');
  if(i<1) return em;
  return em.slice(0,2)+'•••'+em.slice(i);
}

// Dispara o código de recuperação para o email do usuário atual (CUR)
async function _enviarCodigoReset(){
  if(!CUR || !CUR.email){
    showErr('Sua conta não tem email cadastrado. Peça ao líder para redefinir sua senha.');
    return false;
  }
  try{
    const url = GAS_EMAIL + '?action=solicitar_reset&data=' +
      encodeURIComponent(JSON.stringify({ email: CUR.email, nome: CUR.nome })) + '&t=' + Date.now();
    const r = await fetch(url);
    const j = await r.json();
    if(!j || j.success===false){ showErr('Não foi possível enviar o código: '+((j&&j.error)||'tente novamente')); return false; }
    return true;
  }catch(e){ showErr('Erro ao enviar código: '+e.message); return false; }
}

// Link "Esqueci minha senha" (só aparece na tela de senha existente)
async function esqueciSenha(){
  hideErr();
  if(!CUR){ showErr('Informe seu email ou nome primeiro.'); return; }
  const ok = await _enviarCodigoReset();
  if(!ok) return;
  document.getElementById('step2').style.display='none';
  document.getElementById('step3').style.display='block';
  const lbl=document.getElementById('reset-dest-lbl');
  if(lbl) lbl.textContent='Código enviado para '+_maskEmail(CUR.email);
  setTimeout(()=>document.getElementById('reset-codigo')?.focus(),100);
}

async function reenviarCodigoReset(){
  hideErr();
  const ok = await _enviarCodigoReset();
  if(ok){
    const lbl=document.getElementById('reset-dest-lbl');
    if(lbl) lbl.textContent='Novo código enviado para '+_maskEmail(CUR.email);
  }
}

// Valida o código no Apps Script e grava a nova senha
async function confirmarReset(){
  const btn=document.getElementById('reset-btn');
  hideErr();
  const codigo=(document.getElementById('reset-codigo').value||'').trim();
  const nova=document.getElementById('reset-nova').value;
  const conf=document.getElementById('reset-conf').value;
  if(!codigo){ showErr('Digite o código que enviamos por email.'); return; }
  if(nova.length<6){ showErr('A senha deve ter ao menos 6 caracteres.'); return; }
  if(nova!==conf){ showErr('As senhas não coincidem.'); return; }
  btn.disabled=true; btn.textContent='Verificando...';
  try{
    const url = GAS_EMAIL + '?action=verificar_reset&data=' +
      encodeURIComponent(JSON.stringify({ email: CUR.email, codigo })) + '&t=' + Date.now();
    const r = await fetch(url);
    const j = await r.json();
    if(!j || j.success===false){
      const er=(j&&j.error)||'';
      showErr(er==='expirado' ? 'Código expirado. Clique em "Reenviar código".'
            : er==='invalido' ? 'Código incorreto. Confira no email.'
            : 'Não foi possível validar o código. Tente novamente.');
      btn.disabled=false; btn.textContent='Redefinir senha'; return;
    }
    const hash=await hashSenha(nova);
    await db.patch('usuarios',CUR.id,{senha_hash:hash,primeiro_acesso:false});
    CUR.senha_hash=hash;
    btn.disabled=false; btn.textContent='Redefinir senha';
    document.getElementById('ls').style.display='none';
    document.getElementById('app').style.display='block';
    initApp();
  }catch(e){
    showErr('Erro: '+e.message);
    btn.disabled=false; btn.textContent='Redefinir senha';
  }
}

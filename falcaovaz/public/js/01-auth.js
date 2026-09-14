// ─── SSO VIA PORTAL ──────────────────────────────────────
async function checkSSO() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid');
  if (!uid) return false;
  // Espera o token do portal chegar antes da 1ª consulta — com RLS
  // ativo, a chave anonima nao le mais nada.
  if (typeof esperarTokenPortal === 'function') await esperarTokenPortal(2500);
  try {
    const resultado = await db.get('usuarios', `?id=eq.${uid}&limit=1`);
    if (resultado && resultado.length > 0) {
      const u = resultado[0];
      currentUser = {
        key: u.nome.split(' ')[0].toLowerCase(),
        id: u.id, name: u.nome,
        short: u.nome.split(' ')[0],
        level: u.nivel, quota: u.quota_tokens,
        used: u.tokens_usados || 0,
        admin: u.admin, judicial: u.judicial
      };
      // Limpa URL sem recarregar
      window.history.replaceState({}, '', window.location.pathname);
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      await initApp();
      return true;
    }
  } catch(e) { console.error('SSO error:', e); }
  return false;
}

// ─── LOGIN COM SUPABASE ──────────────────────────────────
async function doLogin() {
  const key = document.getElementById('login-user').value;
  if (!key) { document.getElementById('login-error').style.display = 'flex'; return; }

  const nomeMap = {
    rodrigo:'Rodrigo Falcão Vaz', fernanda:'Fernanda Araujo', renata:'Renata Navarro',
    edna:'Edna Rebesco', durval:'Durval Falcão Vaz', janaina:'Janaina Alves',
    simone:'Simone Cirino', mikaeli:'Mikaeli', vanderleia:'Vanderleia', vivian:'Vivian',
    joaomarcus:'João Marcus', nogueira:'Nogueira',
    christiane:'Christiane', felippe:'Felippe', emilia:'Emilia',
    regina:'Regina', thais:'Thais'
  };
  const nome = nomeMap[key];
  if (!nome) { document.getElementById('login-error').style.display = 'flex'; return; }

  const btn = document.querySelector('#login-screen .btn-primary');
  btn.textContent = 'Conectando...';
  btn.disabled = true;

  try {
    // Busca direto pela API REST do Supabase
    const url = `${SUPABASE_URL}/rest/v1/usuarios?nome=eq.${encodeURIComponent(nome)}&limit=1`;
    const resp = await fetch(url, { headers: DB_HEADERS });
    const resultado = await resp.json();

    if (resultado && resultado.length > 0) {
      const u = resultado[0];
      currentUser = {
        key, id: u.id, name: u.nome,
        short: u.nome.split(' ')[0],
        level: u.nivel, quota: u.quota_tokens,
        used: u.tokens_usados || 0,
        admin: u.admin, judicial: u.judicial
      };
      console.log('Login OK — id:', u.id, 'nivel:', u.nivel);
    } else {
      // Fallback local — avisa no console
      console.warn('Usuário não encontrado no banco, usando fallback local. Verifique se rodou o SQL de setup.');
      if (!USERS[key]) {
        document.getElementById('login-error').style.display = 'flex';
        btn.textContent = 'Entrar no sistema'; btn.disabled = false; return;
      }
      currentUser = { key, id: null, ...USERS[key] };
    }
  } catch(e) {
    console.error('Erro ao buscar usuário:', e);
    // Fallback local em caso de erro de rede
    if (!USERS[key]) {
      document.getElementById('login-error').style.display = 'flex';
      btn.textContent = 'Entrar no sistema'; btn.disabled = false; return;
    }
    currentUser = { key, id: null, ...USERS[key] };
  }

  btn.textContent = 'Entrar no sistema';
  btn.disabled = false;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  await initApp();
}

function doLogout() {
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
}


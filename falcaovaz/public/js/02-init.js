// ─── INIT ─────────────────────────────────────────────────
async function initApp() {
  const u = currentUser;

  // Sidebar user info
  const initials = u.name.split(' ').slice(0,2).map(n=>n[0]).join('');
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = u.short;
  const levelLabel = ['','Jurídico','Administrativo','Vendas'][u.level];
  document.getElementById('sidebar-role').textContent =
    `${levelLabel}${u.admin ? ' · Admin' : ''}`;
  document.getElementById('topbar-user-chip').textContent = u.name;
  document.getElementById('dash-name').textContent = u.short;

  // Ocultar todos os itens de nav dinamicamente
  document.querySelectorAll('.nav-item[id], .sidebar-section[id]').forEach(el => {
    el.style.display = 'none';
  });

  // ── JURÍDICO (nível 1) — módulo judicial completo
  if (u.judicial) {
    show('nav-section-judicial');
    show('nav-processos'); show('nav-prazos'); show('nav-calculo-prazos');
    show('nav-financeiro'); show('nav-chamados-jur');
    show('nav-acordos-jur');
    show('nav-planilhas');   // Calculadora de Correção
  }

  // ── IA & DOCUMENTOS — todos os níveis
  show('nav-section-ia');
  show('nav-gerar-doc');
  show('nav-meus-docs');
  // "Para Revisar" visível para TODOS: qualquer um pode ser indicado como revisor
  // (Adm aprovando colega da Adm, Vendas, etc). A pagina filtra por revisor_id=user.
  show('nav-aprovar-docs-jur');

  // ── CHAMADOS para Adm/Vendas
  if (!u.judicial) {
    show('nav-section-chamados-ext');
    show('nav-chamado-ext');
  }

  // ── ADMIN
  if (u.admin) {
    show('nav-admin-section');
    show('nav-usuarios');
    show('nav-planilhas');
    const atp = document.getElementById('admin-token-panel');
    if (atp) atp.style.display = 'block';
    renderDashTokens();
    renderUserTabs();
  }

  // Configurar chamados conforme nível
  const chamadosJurView = document.getElementById('chamados-juridico-view');
  const chamadosSolView = document.getElementById('chamados-solicitante-view');
  const tabRecebidos    = document.getElementById('chamado-tab-recebidos');
  const tabMeus         = document.getElementById('chamado-tab-meus');
  const btnNovoChamado  = document.getElementById('btn-novo-chamado');
  if (btnNovoChamado) btnNovoChamado.style.display = 'inline-flex'; // todos podem abrir chamado
  if (u.judicial) {
    const ct = document.getElementById('chamados-title');
    const cs = document.getElementById('chamados-sub');
    if (ct) ct.textContent = 'Chamados Jurídicos';
    if (cs) cs.textContent = 'Atenda solicitações recebidas e abra chamados para quem precisar';
    if (chamadosJurView) chamadosJurView.style.display = 'block';
    if (tabRecebidos)    tabRecebidos.style.display    = 'block';
    if (tabMeus)         tabMeus.style.display          = 'none';
    const tabAprovar = document.getElementById('tab-aprovar-docs');
    if (tabAprovar) tabAprovar.style.display = 'block';
  } else {
    if (chamadosSolView) chamadosSolView.style.display = 'block';
    if (tabMeus)         tabMeus.style.display          = 'block';
    if (tabRecebidos)    tabRecebidos.style.display      = 'none';
  }

  // Data
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  renderDashboard(); // async — carrega dados em paralelo

  // Carrega dados reais do banco em paralelo
  if (u.judicial) {
    carregarPrazos();
    carregarProcessos();
    carregarChamadosRecebidos();
  }
  carregarMeusDocumentos();

  goTo('dashboard');
}

// ─── PLANILHAS ────────────────────────────────────────────
let tipoPlanilhaAtual = '';


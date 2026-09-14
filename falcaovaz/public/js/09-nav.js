function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.tagName === 'DIV' && el.classList.contains('nav-item') ? 'flex' : 'block';
}

// ─── NAVEGAÇÃO ────────────────────────────────────────────
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('page-'+page);
  if (target) target.classList.add('active');

  // Carrega dados do banco ao navegar para certas páginas
  if (page === 'documentos')   carregarPaginaDocumentos();
  if (page === 'processos')    carregarProcessos();
  if (page === 'prazos')       carregarPrazos();
  if (page === 'chamados')     { carregarChamadosRecebidos(); carregarChamadosPorMes(); }
  if (page === 'para-revisar') carregarParaRevisar();
  if (page === 'planilhas')    { if (typeof initCalculadora === 'function') initCalculadora(); }
  if (page === 'acordos')      carregarAcordos();

  const titles = {
    dashboard:'Dashboard',
    prazos:'Controle de Prazos', 'calculo-prazos':'Cálculo de Prazos',
    processos:'Processos Judiciais', peticoes:'Petições com IA',
    financeiro:'Gestão Financeira', planilhas:'Cálculo de Atualização de Débito',
    documentos:'Documentos', 'meus-docs':'Meus Documentos',
    chamados:'Chamados Jurídicos', usuarios:'Usuários & Tokens',
    'para-revisar':'Para Revisar', 'calculo-prazos':'Cálculo de Prazos',
    acordos:'Acordos Extrajudiciais',
    notificacoes:'Notificações'
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;

  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(`'${page}'`))
      n.classList.add('active');
  });
}

// Abre modal de novo doc direto com tipo pré-selecionado
function abrirDoc(tipo) {
  goTo('documentos');
  setTimeout(() => {
    focarComposerIA();
    escolherTipoModal(tipo, null);
  }, 100);
}


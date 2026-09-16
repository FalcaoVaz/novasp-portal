// ═══════════════════════════════════════════════════════════════
// MODO PILOTO — SÓ NO BRANCH SANDBOX. NUNCA MESCLAR NA MAIN.
// Trata todo usuário logado como ACESSO TOTAL (admin, jurídico, gestão,
// gestão de corretores, líder, grupos de pauta), para os 8 participantes
// conhecerem o sistema inteiro. Produção segue com os papéis normais.
//
// Tripla trava de isolamento:
//   (1) este arquivo só existe no branch sandbox;
//   (2) só é referenciado no index.html do branch sandbox;
//   (3) o corpo abaixo só roda se SANDBOX === true (flag do 00-config do sandbox).
// ═══════════════════════════════════════════════════════════════
(function(){
  if (typeof SANDBOX === 'undefined' || !SANDBOX) return;   // trava (3)

  // 1) Funções de papel → sempre liberado
  const SIM = function(){ return true; };
  const NAO = function(){ return false; };
  ['podeAcessarGestao','ehLiderGestao','podeGerenciarCorretores','podeAcessarVendas',
   'podeAcessarForumVendas','podeAcessarCalendar','ehVotantePeneira'
  ].forEach(function(fn){ if (typeof window[fn] !== 'undefined') window[fn] = SIM; });

  // Papéis que RESTRINGEM ou redirecionam ficam desligados no piloto
  // (senão o usuário cairia direto no Fórum / agenda do fotógrafo / só-feedback)
  ['ehColaboradorGestao','ehRepresentantePuro','ehFotografo'
  ].forEach(function(fn){ if (typeof window[fn] !== 'undefined') window[fn] = NAO; });

  // 2) Flags do CUR → tudo liberado. renderHome/setMod leem direto de CUR;
  //    initApp roda logo após o login, com CUR já preenchido — elevamos antes.
  if (typeof window.initApp === 'function') {
    var _origInitApp = window.initApp;
    window.initApp = function(){
      try {
        if (typeof CUR === 'object' && CUR) {
          CUR.admin = true; CUR.judicial = true;
          CUR.acesso_juridico = true; CUR.acesso_interno = true; CUR.acesso_calendar = true;
          CUR.nivel = 1;
        }
      } catch(e){ console.warn('[piloto] falha ao elevar CUR:', e); }
      return _origInitApp.apply(this, arguments);
    };
  }

  // 3) Login sem re-cadastro: no sandbox o GoTrue começa vazio, então
  //    quem entra pela 1ª vez precisa CRIAR a conta a partir da tela de
  //    login. Ignoramos o `somenteLogin` (produção usa pra não deixar
  //    senha errada virar conta) — assim: tenta logar; se a conta ainda
  //    não existe, cria na hora. Quem já tem conta apenas loga (sem
  //    aparecer "primeiro acesso"/cadastro de novo).
  if (typeof window.autenticarSupabase === 'function') {
    var _origAuth = window.autenticarSupabase;
    window.autenticarSupabase = function(usuario, senhaPlana, opts){
      opts = Object.assign({}, opts || {});
      opts.somenteLogin = false;
      return _origAuth.call(this, usuario, senhaPlana, opts);
    };
  }

  console.log('%c[MODO PILOTO] acesso total ativo (somente sandbox)', 'color:#b45309;font-weight:700');
})();

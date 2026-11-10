/* Bússola NSP no portal — adaptador (09/11/2026). Carregado ANTES do código delas (ver index.html, cabeçalho).
   O sistema da Emilia e da Camille foi feito para rodar com funções de servidor no Netlify (/api/...).
   Aqui, as mesmas funções rodam no navegador, sem mudar uma linha delas:
   - /api/auth          → portal/auth.js (o usuário é quem entrou no portal)
   - /api/alertas       → netlify/functions/alertas.js (delas; guarda em bussola_blobs no Supabase do portal)
   - /api/auditoria     → netlify/functions/auditoria.js (delas)
   - /api/ler-imovel    → netlify/functions/ler-imovel.js (delas; o site da NovaSP libera a leitura pelo navegador)
   - data/...           → arquivos de dados do GitHub delas (ramo main), atualizados pelas rotinas delas */
(function () {
  'use strict';
  var REPO_DADOS = 'https://raw.githubusercontent.com/emiliavitoria27/radar-do-imovel/main/';
  var ROTAS = { auth: './portal/auth.js?v=202611091742', alertas: './netlify/functions/alertas.js?v=202611091742', auditoria: './netlify/functions/auditoria.js?v=202611091742', 'ler-imovel': './netlify/functions/ler-imovel.js?v=202611091742' };
  var base = new URL('.', location.href);           // .../bussola/
  var original = window.fetch.bind(window);

  window.fetch = function (entrada, init) {
    var url;
    try { url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href); } catch (_) { return original(entrada, init); }
    if (url.origin === location.origin) {
      var m = url.pathname.match(/^\/api\/([a-z-]+)/);
      if (m && ROTAS[m[1]]) {
        var req = new Request(url.href, init || (typeof entrada === 'string' ? undefined : entrada));
        return import(new URL(ROTAS[m[1]], base).href).then(function (mod) { return mod.default(req); })
          .then(function (resp) {   // anúncio lido: mostra as referências do bairro no quadro do portal (fora do código delas)
            if (m[1] === 'ler-imovel') resp.clone().json().then(function (j) { var b = j && j.dados && j.dados.bairro; if (b) avisaBairro(b); }).catch(function () {});
            return resp;
          })
          .catch(function (e) { return new Response(JSON.stringify({ ok: false, erro: 'Falha na Bússola do portal: ' + e.message }), { status: 500, headers: { 'content-type': 'application/json' } }); });
      }
      if (url.pathname.indexOf(base.pathname + 'data/') === 0)
        return original(REPO_DADOS + url.pathname.slice(base.pathname.length), { cache: 'no-cache' });
    }
    return original(entrada, init);
  };

  function avisaBairro(b) { try { var P = window.parent.BussolaPortal; if (P && P.verReferencias) P.verReferencias(b); } catch (_) {} }
  // bairro digitado à mão no formulário de análise
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'f-bairro' && e.target.value) avisaBairro(e.target.value); }, true);
  // fora do portal (link aberto direto) só funciona o link de análise compartilhada, que não precisa de login
  var noPortal = false; try { noPortal = window.parent !== window && !!(window.parent.BussolaPortal && window.parent.BussolaPortal.usuario()); } catch (_) {}
  document.documentElement.setAttribute('data-portal', noPortal ? 'sim' : 'nao');
  // v9: ".aviso.on" vence ".faixa-compartilhada{display:none}" e a faixa de análise compartilhada aparecia sempre
  var st = document.createElement('style');
  st.textContent = 'body:not(.compartilhado) .faixa-compartilhada{display:none!important}';
  document.head.appendChild(st);
})();

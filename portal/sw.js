// ════════════════════════════════════════════════════════
// SERVICE WORKER — Portal Nova São Paulo
// Estratégia:
//  - HTML / scripts / CSS: network-first com fallback offline
//    (assim qualquer redeploy chega rápido)
//  - Imagens / fontes / icons: cache-first
//  - Chamadas a GAS / Supabase / DJEN: sempre rede (sem cache)
// ════════════════════════════════════════════════════════

const VERSAO = 'nsp-portal-v2';
const ESTATICOS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESTATICOS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSAO).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Origens externas — NUNCA tocar (Supabase, GAS, fontes Google, DJEN, etc)
  if (url.origin !== self.location.origin) return;

  // Navegação (HTML): network-first com fallback ao cache
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSAO).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Scripts e CSS: network-first (igual HTML) pra que o deploy chegue na
  // hora. Cache-first servia codigo velho ate o usuario reabrir o browser.
  if (['style','script'].includes(req.destination)) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSAO).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Imagens e fontes: cache-first (mudam pouco, podem ficar offline)
  if (['image','font'].includes(req.destination)) {
    e.respondWith(
      caches.match(req).then(cached => {
        const fetchAndCache = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(VERSAO).then(c => c.put(req, copy)).catch(()=>{});
          return res;
        }).catch(() => cached);
        return cached || fetchAndCache;
      })
    );
  }
});

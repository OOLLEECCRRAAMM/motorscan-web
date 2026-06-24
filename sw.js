const CACHE_NAME = 'motorscan-cache-v2';
const urlsToCache = [
  '/',
  '/app.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;600;700&family=Share+Tech+Mono&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  // ── CORREÇÃO: para o app.html, SEMPRE busca a versão mais recente da rede primeiro ──
  // Isso garante que atualizações de código apareçam imediatamente, sem esperar o usuário
  // limpar o cache manualmente. Só usa o cache salvo se a rede estiver indisponível (offline).
  if (event.request.url.includes('app.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(fetchResponse => {
          if (fetchResponse && fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return fetchResponse;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/app.html')))
    );
    return;
  }

  // Para os demais arquivos (fontes, ícones, bibliotecas) mantém o comportamento de cache-first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(fetchResponse => {
          if (!fetchResponse || fetchResponse.status !== 200) return fetchResponse;
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return fetchResponse;
        });
      })
      .catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/app.html');
        }
      })
  );
});

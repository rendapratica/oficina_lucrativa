const CACHE='oficina-v3';
const ARQ=['./','index.html','manifest.json','icon.svg','css/style.css','js/database.js','js/backup.js','js/configuracoes.js','js/ui.js','js/clientes.js','js/equipamentos.js','js/ordens.js','js/app.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQ)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});

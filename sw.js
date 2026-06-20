/* AICAM Pellet Analyzer — service worker (PWA offline shell) */
const CACHE = 'aicam-v12';
const ASSETS = [
  './', 'index.html',
  'css/style.css',
  'js/i18n.js', 'js/analyzer.js', 'js/db.js', 'js/chatbot.js', 'js/learn.js', 'js/app.js',
  'manifest.json', 'icon.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ข้าม API ของ Supabase (ต้องสด/ออนไลน์เสมอ)
  if (url.hostname.endsWith('supabase.co')) return;
  // app shell: cache-first, อัปเดตเบื้องหลัง
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

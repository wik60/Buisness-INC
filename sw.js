// Offline cache for Delusional Business Inc. The cache name follows js/version.js.
importScripts('js/version.js');
const VERSION = 'dbi-v' + self.APP_VERSION;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/version.js',
  './css/style.css',
  './js/app.js',
  './js/billion.js',
  './js/data.js',
  './js/empire.js',
  './js/engine.js',
  './js/more.js',
  './js/sports2.js',
  './js/world.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon.svg',
  './assets/city/london.svg',
  './assets/city/nyc.svg',
  './assets/city/warsaw.svg',
  './assets/ui/bank.svg',
  './assets/ui/commercial.svg',
  './assets/ui/crown.svg',
  './assets/ui/empire.svg',
  './assets/ui/factory.svg',
  './assets/ui/job.svg',
  './assets/ui/jobcenter.svg',
  './assets/ui/office.svg',
  './assets/ui/recruiter.svg',
  './assets/ui/sports.svg',
  './assets/ui/stocks.svg',
  './assets/ui/tax.svg',
  './assets/ui/warehouse.svg',
  './assets/biz/airline.svg',
  './assets/biz/bakery.svg',
  './assets/biz/bank.svg',
  './assets/biz/biotech.svg',
  './assets/biz/cars.svg',
  './assets/biz/clothing.svg',
  './assets/biz/coffee.svg',
  './assets/biz/construction.svg',
  './assets/biz/cosmetics.svg',
  './assets/biz/delivery.svg',
  './assets/biz/furniture.svg',
  './assets/biz/gaming.svg',
  './assets/biz/gym.svg',
  './assets/biz/hotel.svg',
  './assets/biz/jewelry.svg',
  './assets/biz/law.svg',
  './assets/biz/luxcars.svg',
  './assets/biz/marketing.svg',
  './assets/biz/realestate.svg',
  './assets/biz/restaurant.svg',
  './assets/biz/security.svg',
  './assets/biz/spaceco.svg',
  './assets/biz/supermarket.svg',
  './assets/biz/tech.svg',
  './assets/biz/usedcars.svg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network-first so updates arrive quickly, cache fallback for offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // cache: 'no-cache' revalidates with GitHub Pages every time instead of trusting the
  // browser's 10-minute HTTP cache, so a new push shows up on the next launch.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

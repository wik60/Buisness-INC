// Offline cache for Delusional Business Inc. The cache name follows js/version.js.
importScripts('js/version.js');
const VERSION = 'dbi-v' + self.APP_VERSION;
const FILES = [
  './',
  "./assets/biz/airline.svg",
  "./assets/biz/bakery.svg",
  "./assets/biz/cars.svg",
  "./assets/biz/clothing.svg",
  "./assets/biz/coffee.svg",
  "./assets/biz/construction.svg",
  "./assets/biz/cosmetics.svg",
  "./assets/biz/delivery.svg",
  "./assets/biz/furniture.svg",
  "./assets/biz/gaming.svg",
  "./assets/biz/gym.svg",
  "./assets/biz/hotel.svg",
  "./assets/biz/jewelry.svg",
  "./assets/biz/law.svg",
  "./assets/biz/marketing.svg",
  "./assets/biz/realestate.svg",
  "./assets/biz/restaurant.svg",
  "./assets/biz/security.svg",
  "./assets/biz/supermarket.svg",
  "./assets/biz/tech.svg",
  "./assets/city/london.svg",
  "./assets/city/nyc.svg",
  "./assets/city/warsaw.svg",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon.svg",
  "./assets/ui/bank.svg",
  "./assets/ui/commercial.svg",
  "./assets/ui/job.svg",
  "./assets/ui/jobcenter.svg",
  "./assets/ui/office.svg",
  "./assets/ui/recruiter.svg",
  "./assets/ui/tax.svg",
  "./assets/ui/warehouse.svg",
  "./css/style.css",
  "./index.html",
  "./js/app.js",
  "./js/data.js",
  "./js/engine.js",
  "./js/version.js",
  "./manifest.webmanifest",
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
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

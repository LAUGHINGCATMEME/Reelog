// Reelog service worker: app shell works offline; posters and fonts are kept once they load.
const VERSION = 'reelog-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (req) => {
  const hit = await caches.match(req);
  // A copy saved from an <img> is opaque and can't answer a CORS request (a poster drawn into a
  // shared tier list image), so that one goes to the network and its readable copy is kept.
  if (hit && !(req.mode === 'cors' && hit.type === 'opaque')) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
  return res;
};

const networkFirst = async (req) => {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || caches.match('./index.html');
  }
};

self.addEventListener('fetch', (e) => {
  const { request: req } = e;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.themoviedb.org') return; // always live
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  if (
    url.hostname === 'image.tmdb.org' ||
    url.hostname === 's4.anilist.co' || // AniList covers
    url.hostname === 'cdn.myanimelist.net' ||
    (url.origin === location.origin && (url.pathname.includes('/assets/') || url.pathname.includes('/fonts/')))
  ) return e.respondWith(cacheFirst(req));
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
});

/**
 * The service worker: the shell that gives the browser what `offline.ts` decides. Built by the plugin in `vite.config.ts`
 * as `sw.js` at the site's root, with `__ASSETS__` the build's own files, and registered by the page once the game is
 * ready (`install.ts` says when). It caches the build whole as it installs, so the game boots with no network after one
 * visit; takes over at once (`skipWaiting`, `clients.claim`) and throws the last build's cache away, so a player online
 * is on the new build from their next load. Nothing of the game is here, and nothing here is reached by it.
 */
import { assetsToCache, cacheNameFor, routeFor, stale } from './offline';

/** What a worker's global has that this one uses; the DOM's types have no worker scope, and the whole of it is not wanted. */
interface WorkerScope {
  location: { origin: string };
  addEventListener(type: 'install' | 'activate', listener: (event: Extendable) => void): void;
  addEventListener(type: 'fetch', listener: (event: Fetching) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}
interface Extendable {
  waitUntil(done: Promise<unknown>): void;
}
interface Fetching extends Extendable {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

const scope = self as unknown as WorkerScope;
const files = assetsToCache([], __ASSETS__);
const name = cacheNameFor(files);

scope.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(name)
      .then((cache) => cache.addAll(files))
      .then(() => scope.skipWaiting()),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(stale(names, name).map((n) => caches.delete(n))))
      .then(() => scope.clients.claim()),
  );
});

/**
 * A cached file is matched by its URL alone (`ignoreVary`): a built file is named by its hash, so there is one response
 * for it however it is asked for, and a server that says `Vary: Origin` (Vite's preview does) would otherwise refuse the
 * page's own module request the file it cached without one, and the page would not boot offline.
 */
const BY_URL = { ignoreVary: true };

/** The page from the network, and the cached one when the network has none. */
async function page(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match('index.html', BY_URL);
    return cached ?? Response.error();
  }
}

/** An asset from the cache, else from the network and kept if it came whole. */
async function asset(request: Request): Promise<Response> {
  const cached = await caches.match(request, BY_URL);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(name);
    await cache.put(request, response.clone());
  }
  return response;
}

scope.addEventListener('fetch', (event) => {
  switch (routeFor(event.request, scope.location.origin)) {
    case 'page':
      event.respondWith(page(event.request));
      break;
    case 'asset':
      event.respondWith(asset(event.request));
      break;
    case 'pass':
      break;
  }
});

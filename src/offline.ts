/**
 * What the service worker decides, with no worker round it: which files of a build are kept for a boot with no network,
 * what the cache that keeps them is called (by what is in it, so a new build is a new cache and the old one is thrown
 * away), and how each request is answered. The worker (`sw.ts`) is a thin shell over this, so the decisions are tested
 * headless; without that a wrong route would show only as a player's page that never updates, or never loads offline.
 */
import { hashed } from './random';

/** What the cache's name begins with: the worker deletes every cache so named that is not its own, and no other. */
export const CACHE_PREFIX = 'ooergolf-';

/** How a request is answered: the page network-first and the cached page when that fails, an asset cache-first, or left to the network. */
export type Route = 'page' | 'asset' | 'pass';

/**
 * The files a build is kept as, relative to the site's root: the page, every built asset but a source map, and every
 * file served as it is (the manifest and the icons). Sorted and unique, so the same build gives the same list in any order.
 */
export function assetsToCache(assetFiles: readonly string[], publicFiles: readonly string[]): string[] {
  const files = new Set<string>(['index.html']);
  for (const f of assetFiles) if (!f.endsWith('.map')) files.add(`assets/${f}`);
  for (const f of publicFiles) files.add(f);
  return [...files].sort();
}

/** The cache's name for a list of files: the prefix and a hash of the list, the same for the same files in any order. */
export function cacheNameFor(files: readonly string[]): string {
  const text = [...files].sort().join('\n');
  const codes: number[] = [];
  for (let i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));
  // two hashes, salted apart, for 64 bits: a build a day for years without two lists sharing a name
  const word = (salt: number) =>
    Math.floor(hashed(salt, ...codes) * 4294967296)
      .toString(16)
      .padStart(8, '0');
  return `${CACHE_PREFIX}${word(1)}${word(2)}`;
}

/**
 * How a request is answered. Only a GET is ever cached; a navigation is the page, fetched fresh while the network is
 * there so a new build is seen on the next load, and the cached page when it is not; anything else of this origin is an
 * asset, served from the cache first (the built files are named by their hash, so one cached is never stale); and a
 * request to another origin is passed to the network as it is.
 */
export function routeFor(request: { method: string; mode: string; url: string }, origin: string): Route {
  if (request.method !== 'GET') return 'pass';
  if (request.mode === 'navigate') return 'page';
  return request.url.startsWith(`${origin}/`) ? 'asset' : 'pass';
}

/** The caches to delete once a worker takes over: every one of this app's but its own. */
export function stale(names: readonly string[], current: string): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/**
 * The service worker's decisions, with no worker: what a build keeps for a boot offline, how its cache is named, how a
 * request is answered, and which caches are thrown away. A wrong answer here is a player whose game never updates or
 * never loads offline, which no gate on the game itself can see.
 */
import { describe, expect, it } from 'vitest';
import { assetsToCache, cacheNameFor, CACHE_PREFIX, routeFor, stale } from '../src/offline';

const ORIGIN = 'https://golf.ooer.com';
const get = (url: string, mode = 'cors') => ({ method: 'GET', mode, url });

describe('what a build keeps', () => {
  it('is the page, every built asset but a source map, and every file served as it is, sorted and once each', () => {
    const files = assetsToCache(
      ['index-Cs7JcrXq.js', 'index-Cs7JcrXq.js.map', 'title-Dmf8Raq1.webp', 'index-abc.css'],
      ['manifest.webmanifest', 'icons/icon-192.png', 'index.html'],
    );
    expect(files).toEqual([
      'assets/index-Cs7JcrXq.js',
      'assets/index-abc.css',
      'assets/title-Dmf8Raq1.webp',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });
});

describe('the cache name', () => {
  it('is the same for the same files in any order, and moves with the files', () => {
    const a = cacheNameFor(['index.html', 'assets/a.js']);
    expect(a).toMatch(new RegExp(`^${CACHE_PREFIX}[0-9a-f]{16}$`));
    expect(cacheNameFor(['assets/a.js', 'index.html'])).toBe(a);
    expect(cacheNameFor(['index.html', 'assets/b.js'])).not.toBe(a);
    expect(cacheNameFor(['index.html'])).not.toBe(a);
  });
});

describe('how a request is answered', () => {
  it('fetches a navigation as the page, this origin as an asset, and passes the rest', () => {
    expect(routeFor(get(`${ORIGIN}/`, 'navigate'), ORIGIN)).toBe('page');
    expect(routeFor(get(`${ORIGIN}/?title=0`, 'navigate'), ORIGIN)).toBe('page');
    expect(routeFor(get(`${ORIGIN}/assets/index-abc.js`), ORIGIN)).toBe('asset');
    expect(routeFor(get(`${ORIGIN}/manifest.webmanifest`, 'no-cors'), ORIGIN)).toBe('asset');
    expect(routeFor(get('https://example.com/thing.js'), ORIGIN)).toBe('pass');
    // an origin that this one is a prefix of is another origin
    expect(routeFor(get('https://golf.ooer.community/x.js'), ORIGIN)).toBe('pass');
  });

  it('never caches anything but a GET', () => {
    expect(routeFor({ method: 'POST', mode: 'cors', url: `${ORIGIN}/api` }, ORIGIN)).toBe('pass');
    expect(routeFor({ method: 'POST', mode: 'navigate', url: `${ORIGIN}/` }, ORIGIN)).toBe('pass');
  });
});

describe('the caches thrown away', () => {
  it("are every one of this app's but the worker's own, and nothing of anyone else's", () => {
    const mine = cacheNameFor(['index.html']);
    expect(stale([`${CACHE_PREFIX}old1`, mine, 'other-app', `${CACHE_PREFIX}old2`], mine)).toEqual([
      `${CACHE_PREFIX}old1`,
      `${CACHE_PREFIX}old2`,
    ]);
  });
});

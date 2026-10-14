/**
 * The game as an installable app, on the built page served as a player gets it (the dev server registers no worker):
 * the manifest a browser installs from, the service worker registered once the game is ready and the build cached,
 * a boot with no network from that cache with the player's save read as ever, and the Install button on the start
 * screen, shown when the browser offers and taking the offer once. The offer is the browser's own event, fired here by
 * hand with a prompt of the test's, since headless Chromium offers nothing; the unit tests hold what is between.
 */
import { expect, test, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { buildDist } from './build';
import { ready, watch } from './game';

/** The built page's port: beside the dev server's, so the two never collide. */
const PORT = (Number(process.env.PORT) || 5201) + 1;
const ROOT = `http://localhost:${PORT}`;
const SAVE = { coins: 123, gems: 4, owned: [], kit: { club: '', ball: '', accessory: '' }, best: {} };

let served: PreviewServer;

test.beforeAll(async () => {
  buildDist();
  served = await preview({ logLevel: 'silent', preview: { port: PORT, strictPort: true } });
});

test.afterAll(async () => {
  await served.close();
});

/** The built page opened with the test's save, no title and no fly-in, and the game ready. */
async function open(page: Page, query = '') {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('ooergolf-test-seeded')) return;
    localStorage.setItem('ooergolf-save-v1', JSON.stringify(s));
    sessionStorage.setItem('ooergolf-test-seeded', '1');
  }, SAVE);
  await page.goto(`${ROOT}/?title=0&flyin=0&paused=1${query}`);
  await ready(page);
}

test('the built page registers the worker once ready, caches the build, and boots offline with the save', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await open(page);
  // the manifest the browser installs from, as the page links it
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!;
    return (await (await fetch(link.href)).json()) as { short_name: string; display: string; icons: { src: string }[] };
  });
  expect(manifest.short_name).toBe('Of Course!');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const status = await page.evaluate((src) => fetch(src).then((r) => r.status), icon.src);
    expect(status, icon.src).toBe(200);
  }
  // the worker, registered after the boot and controlling the page once it has installed the build
  await expect.poll(() => page.evaluate(() => window.game!.app().worker), { timeout: 30_000 }).toBe('ready');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('ooergolf-'));
    const cache = await caches.open(names[0]);
    const keys = await cache.keys();
    return { names, urls: keys.map((k) => new URL(k.url).pathname).sort() };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.urls).toContain('/index.html');
  expect(cached.urls).toContain('/manifest.webmanifest');
  expect(cached.urls).toContain('/icons/icon-512.png');
  expect(cached.urls.some((u) => /^\/assets\/index-.*\.js$/.test(u))).toBe(true);
  expect(problems).toEqual([]);

  // no network: the page, its script and the manifest from the cache, and the save as it was
  await context.setOffline(true);
  const offlineProblems = watch(page);
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.game!.state().coins)).toBe(123);
  expect(await page.evaluate(() => window.game!.state().choosing)).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // a hole played from the cache is the hole it was: the first of The Meadow chosen and begun
  await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
  expect(await page.evaluate(() => window.game!.state().hole)).toBe(0);
  expect(offlineProblems).toEqual([]);
  await context.setOffline(false);
});

test('a page that asks for no worker gets none', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '&sw=0');
  await page.evaluate(() => window.game!.step(3));
  expect(await page.evaluate(() => window.game!.app().worker)).toBe('none');
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
});

test('the Install button shows when the browser offers, takes the offer once, and goes when the app is installed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await open(page, '&sw=0');
  const button = page.locator('#install');
  await expect(button).toBeHidden();
  expect(await page.evaluate(() => window.game!.app().offered)).toBe(false);
  expect(await page.evaluate(() => window.game!.install())).toBe(false);
  // the browser's offer, as Chrome fires it, with a prompt of the test's own that counts its calls
  await page.evaluate(() => {
    const w = window as unknown as { prompted: number };
    w.prompted = 0;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => {
        w.prompted++;
        return Promise.resolve();
      },
    });
    window.dispatchEvent(event);
  });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.game!.app().offered)).toBe(true);
  await button.click();
  expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);
  await expect(button).toBeHidden();
  // pressed again, through the API, there is nothing to take
  expect(await page.evaluate(() => window.game!.install())).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);
  // offered again and then installed some other way: the button goes without being pressed
  await page.evaluate(() => {
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: () => Promise.resolve() }),
    );
  });
  await expect(button).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(button).toBeHidden();
  expect(problems).toEqual([]);
});

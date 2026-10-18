/**
 * The built game served with the headers the build writes for Netlify (`dist/_headers`, from `scripts/headers.ts`), as
 * a player's browser gets it: the response carries every header the kit asks for, and the game boots under the policy,
 * title and all, plays a stroke of golf and registers its service worker, with nothing refused. A policy that refused
 * something the game needs would stop the page for every player once deployed, which is what this is here to catch
 * first. Vite's preview serves the file's headers on every response, as Netlify does; the deployed page's own are read
 * by `npm run headers:live`.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { preview, type PreviewServer } from 'vite';
import { headerProblems, readHeadersFile } from '../scripts/headers';
import { ready, watch } from './game';

/** Beside the dev server's port and the app test's, so none of the three collide. */
const PORT = (Number(process.env.PORT) || 5201) + 2;
const ROOT = `http://localhost:${PORT}`;

let served: PreviewServer;
let sent: Record<string, string>;

test.beforeAll(async () => {
  sent = readHeadersFile(readFileSync('dist/_headers', 'utf8'));
  served = await preview({ logLevel: 'silent', preview: { port: PORT, strictPort: true, headers: sent } });
});

test.afterAll(async () => {
  await served.close();
});

test('the built page is served with every header, and boots, plays and registers its worker under the policy, refused nothing', async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(Object.keys(sent), 'the build wrote headers').not.toHaveLength(0);
  const problems = watch(page);
  // every refusal the policy makes, as the browser reports it, kept from before the page's own scripts run
  await page.addInitScript(() => {
    const refused: string[] = [];
    (window as { refused?: string[] }).refused = refused;
    document.addEventListener('securitypolicyviolation', (e) =>
      refused.push(`${e.effectiveDirective}: ${e.blockedURI || 'inline'} at ${e.sourceFile}:${e.lineNumber}`),
    );
  });
  const response = await page.goto(`${ROOT}/?seed=3`);
  expect(headerProblems(response!.headers(), false), 'the page as served').toEqual([]);
  await ready(page);
  // the title drops its letters, then a course is chosen and a drive is struck and lands
  await expect.poll(() => page.evaluate(() => window.game!.title().landed), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => {
    window.game!.chooseCourse('The Links');
    window.game!.step(120);
  });
  expect(await page.evaluate(() => window.game!.shoot(Math.PI / 2, 0.8, 'driver'))).toBe(true);
  await page.evaluate(() => window.game!.step(600));
  expect((await page.evaluate(() => window.game!.state())).strokes).toBe(1);
  // the shop, with the ball swatches it paints, and the service worker, which the policy's worker-src lets in
  await page.locator('#shopOpen').click();
  await expect.poll(() => page.evaluate(() => window.game!.app().worker), { timeout: 30_000 }).toBe('ready');
  const scripts = await page.evaluate(() => fetch('/sw.js').then((r) => r.headers.get('content-security-policy')));
  expect(scripts, 'every response carries the policy, the worker too').toBe(sent['Content-Security-Policy']);
  expect(await page.evaluate(() => (window as { refused?: string[] }).refused), 'refused by the policy').toEqual([]);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

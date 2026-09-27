/**
 * What the smoke tests share: starting the game in a page, from a save if
 * the test wants one, and waiting until it is ready; and watching the page
 * for errors. Everything else a test does goes through `window.game`, the
 * game's test API (`src/debug.ts`), whose types these tests compile against.
 */
import { expect, type Page } from '@playwright/test';
import type { GameApi } from '../src/debug';
import type { Save } from '../src/progress';

declare global {
  interface Window {
    game?: GameApi;
  }
}

/** Errors on the page, and requests that failed, collected as they happen. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return problems;
}

/**
 * The game in the page, from a save if given (written before the page's own
 * scripts run, and only on the first load, so a reload keeps what was
 * played), and ready. `seed` makes chance the same from before the game is
 * built, and `paused` stops it before a frame of its own has run, so
 * everything after is the test's own stepping.
 */
export async function start(
  page: Page,
  // a save of today's shape, or of any shape ever written, for a test that a save of an old shape still loads
  options: { save?: Partial<Save> | Record<string, unknown>; seed?: number; paused?: boolean } = {},
) {
  const { save, seed, paused } = options;
  if (save)
    await page.addInitScript((s) => {
      if (sessionStorage.getItem('ooergolf-test-seeded')) return;
      localStorage.setItem('ooergolf-save-v1', JSON.stringify(s));
      sessionStorage.setItem('ooergolf-test-seeded', '1');
    }, save);
  const query = new URLSearchParams();
  if (seed !== undefined) query.set('seed', String(seed));
  if (paused) query.set('paused', '1');
  await page.goto(query.size ? `/?${query.toString()}` : '/');
  await ready(page);
}

/**
 * A drag on the page, as a finger or a mouse makes it: pressed at `from`,
 * moved to `to` in `steps` moves, and let go unless told to hold it. Touch
 * goes through Chrome's own touch events, so the page gets the pointer events
 * a phone gives it; the page must have been opened with touch on.
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { touch?: boolean; hold?: boolean; steps?: number } = {},
) {
  const { touch, hold, steps = 6 } = options;
  const at = (k: number) => ({ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps });
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let k = 1; k <= steps; k++) await page.mouse.move(at(k).x, at(k).y);
    if (!hold) await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await send('touchStart', from);
  for (let k = 1; k <= steps; k++) await send('touchMove', at(k));
  if (!hold) await send('touchEnd');
}

/**
 * Fingers on the page, through Chrome's own touch events: each step a list
 * of where every finger down is, by its id, and an empty list to lift them
 * all. A finger missing from a step has lifted. The page must have been
 * opened with touch on.
 */
export async function touches(page: Page, steps: { id: number; x: number; y: number }[][]) {
  const cdp = await page.context().newCDPSession(page);
  let down = new Set<number>();
  for (const points of steps) {
    const now = new Set(points.map((p) => p.id));
    const lifted = [...down].some((id) => !now.has(id));
    const added = points.some((p) => !down.has(p.id));
    const type = points.length === 0 ? 'touchEnd' : added ? 'touchStart' : lifted ? 'touchEnd' : 'touchMove';
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    down = now;
  }
}

/** Wait until the game is booted and its frame loop running, or say what the boot screen was stuck on. */
export async function ready(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
    await expect(page.locator('#boot')).toHaveClass(/gone/);
  } catch {
    throw new Error(`the game did not boot: ${await page.locator('#bootMsg').textContent()}`);
  }
}

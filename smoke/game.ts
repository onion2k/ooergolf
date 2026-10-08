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
  // `screen` leaves the start screen up, for a test of it; otherwise The Meadow is chosen, as its first hole is set;
  // `rung` puts the picture on a rung of the quality ladder and holds it there
  options: {
    save?: Partial<Save> | Record<string, unknown>;
    seed?: number;
    paused?: boolean;
    screen?: boolean;
    rung?: number;
    // the title screen is left out of every page but one that asks for it, so no test waits on a fade
    title?: boolean;
  } = {},
) {
  const { save, seed, paused, screen, rung, title } = options;
  if (save)
    await page.addInitScript((s) => {
      if (sessionStorage.getItem('ooergolf-test-seeded')) return;
      localStorage.setItem('ooergolf-save-v1', JSON.stringify(s));
      sessionStorage.setItem('ooergolf-test-seeded', '1');
    }, save);
  const query = new URLSearchParams();
  if (!title) query.set('title', '0');
  if (rung !== undefined) query.set('rung', String(rung));
  if (seed !== undefined) query.set('seed', String(seed));
  if (paused) query.set('paused', '1');
  await page.goto(query.size ? `/?${query.toString()}` : '/');
  await ready(page);
  if (!screen) await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
}

/**
 * The panels landed: every animation on the page that ends has ended. A hole begun springs its panels in on the wall clock,
 * not the game's, and a finger put down while one is on its way can land on a button sweeping past instead of the course,
 * so the browser takes the drag and no shot is aimed. The phone's drive picture missed so about one run in four on 3 October
 * 2026, when the view switch's arrival crossed the point its drag began at. A player puts a finger down on a screen that
 * has come to rest, and so does a test. An animation that never ends is not waited for, or it would be waited for ever.
 */
export async function landed(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
        .map((a) => a.finished.catch(() => null)),
    ),
  );
}

/**
 * A drag on the page, as a finger or a mouse makes it: pressed at `from`,
 * moved to `to` in `steps` moves, and let go unless told to hold it, once the
 * panels have landed. Touch goes through Chrome's own touch events, so the page
 * gets the pointer events a phone gives it; the page must have been opened with
 * touch on.
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { touch?: boolean; hold?: boolean; steps?: number } = {},
) {
  const { touch, hold, steps = 6 } = options;
  await landed(page);
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
 * opened with touch on. The first finger goes down once the panels have landed.
 */
export async function touches(page: Page, steps: { id: number; x: number; y: number }[][]) {
  await landed(page);
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

/**
 * A golf hole of the test's own with a contoured green, for every test of putting: a fairway up the middle from the tee to a
 * round green with the cup in it, a first cut a tile wide round the green and down the fairway's two edges, rough either
 * side, and ground that leans to the west across the whole hole with a swell on the green, so the arrows have something to
 * show and a putt something to break on. `greens` is how fast the greens run (12, fast); left out, the hole has none, as
 * every golf hole had before. The terrain is plain numbers, one a tile from the south, made into a `Float32Array` in the page.
 */
export function puttingHole(greens: number | null = 12) {
  const cols = 35,
    rows = 46;
  const cx = 17,
    cupRow = 7;
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (r === rows - 4) return c === cx ? 'T' : c === cx - 1 || c === cx + 1 ? 't' : 'f';
      if (r === cupRow && c === cx) return 'C';
      const d = Math.hypot(c - cx, r - cupRow);
      if (d <= 5.2) return 'g';
      if (d <= 6.4) return 'c';
      if (c >= cx - 3 && c <= cx + 3) return 'f';
      if (c === cx - 4 || c === cx + 4) return 'c';
      return 'r';
    }).join(''),
  );
  // heights a tile, from the south: a ramp rising to the east, and a swell round the green, never a step the physics refuses
  const terrain: number[] = [];
  for (let ty = 0; ty < rows; ty++)
    for (let c = 0; c < cols; c++) {
      const r = rows - 1 - ty;
      const swell = 0.6 * Math.exp(-((c - (cx - 2)) ** 2 + (r - cupRow) ** 2) / 18);
      terrain.push(2.4 + 0.1 * (c - cx) + swell);
    }
  return { name: 'Putting', par: 4, map, terrain, ...(greens === null ? {} : { greens }) };
}

/** The same hole, as the page builds it: its terrain a `Float32Array`. */
export type PuttingHole = ReturnType<typeof puttingHole>;

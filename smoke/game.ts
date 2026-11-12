/**
 * What the smoke tests share: starting the game in a page, from a save if
 * the test wants one, and waiting until it is ready; and watching the page
 * for errors. Everything else a test does goes through `window.game`, the
 * game's test API (`src/debug.ts`), whose types these tests compile against.
 */
import { expect, type Page } from '@playwright/test';
import type { GameApi } from '../src/debug';
import type { Save } from '../src/progress';
import { BALL, HARDEST_SHOT, KIND_RADIUS, ROLL, layoutOf, powerFor, tileAt } from '../src/arena';
import { COURSES } from '../src/course';

declare global {
  interface Window {
    game?: GameApi;
  }
}

/**
 * The page's clock held to a moment, so the day by it (and so the daily hole) is the same whenever a test is run: `Date` is put an
 * offset from the real one and goes on at the real pace, and nothing else is touched (a frozen clock stopped `performance.now`
 * too, and with it every timing the boot's tests read). Run in the page, before its own scripts.
 */
function holdTheDay(iso: string) {
  const Real = Date;
  const clock = { real: Real, offset: Real.parse(iso) - Real.now() };
  (window as unknown as { dayClock: typeof clock }).dayClock = clock;
  class Held extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(Real.now() + clock.offset);
      else super(...(args as ConstructorParameters<DateConstructor>));
    }
    static now() {
      return Real.now() + clock.offset;
    }
  }
  window.Date = Held as DateConstructor;
}

/** The day turned, on a page opened with `start`: its clock now reads `iso`, and goes on from there. */
export function turnTheDay(page: Page, iso: string) {
  return page.evaluate((to) => {
    const clock = (window as unknown as { dayClock: { real: DateConstructor; offset: number } }).dayClock;
    clock.offset = clock.real.parse(to) - clock.real.now();
  }, iso);
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
    // and the fly-in to each hole, so a picture a second into a hole is of the view a shot is played from
    flyIn?: boolean;
    // the day it is by the page's clock, as UTC has it at noon: the daily hole is the hole of that day, whenever the test is run;
    // a fixed day for every page, since the start screen's strip says the day and shows its hole, and no picture may change with the date
    day?: string;
  } = {},
) {
  const { save, seed, paused, screen, rung, title, flyIn, day = '2026-11-11' } = options;
  await page.addInitScript(holdTheDay, `${day}T12:00:00Z`);
  if (save)
    await page.addInitScript((s) => {
      if (sessionStorage.getItem('ooergolf-test-seeded')) return;
      localStorage.setItem('ooergolf-save-v1', JSON.stringify(s));
      sessionStorage.setItem('ooergolf-test-seeded', '1');
    }, save);
  const query = new URLSearchParams();
  if (!title) query.set('title', '0');
  if (!flyIn) query.set('flyin', '0');
  // the built page registers its service worker once ready, which only the app and headers tests are about
  query.set('sw', '0');
  if (rung !== undefined) query.set('rung', String(rung));
  if (seed !== undefined) query.set('seed', String(seed));
  if (paused) query.set('paused', '1');
  await page.goto(query.size ? `/?${query.toString()}` : '/');
  await ready(page);
  // the strip's picture is painted a moment after the page is ready, and a page looked at is looked at with it painted
  if (screen) await page.waitForFunction(() => window.game!.daily().shown.strip.painted);
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

/**
 * An aim from the Pond's tee straight into its water: the first angle, from up the hole turning left, whose line meets
 * water before a rail. (The pond's bank of stones is scenery and stops no ball; it was bodies the ball met until 9 October 2026.)
 */
export function intoThePond(): number {
  const pond = COURSES.flatMap((c) => c.holes).find((h) => h.name === 'Pond')!;
  const l = layoutOf(pond.map);
  for (let off = 0.1; off < 1.2; off += 0.02) {
    const angle = Math.PI / 2 + off;
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    for (let d = 0; d < 30; d += 0.25) {
      const t = tileAt(l, l.tee.x + dx * d, l.tee.y + dy * d);
      if (t < 0 || l.rail[t]) break;
      if (l.water[t]) return angle;
    }
  }
  throw new Error('no way into the Pond');
}

/**
 * A putt at the cup of the hole in play, as `test/open-green.ts` strikes one: the ball laid `back` short of the cup's clear
 * distance from the south (or `from` yards due south of the cup, when given), `aside` off its middle, and struck north so as
 * to arrive at the cup's edge at `speed` units a second. Twelve a second, 0.6 of the cup's radius off the middle, lips out on
 * a level green with room all round, and five through the middle drops. For a minigolf hole with a straight run south of
 * the cup, as The Meadow's first has. Whether the shot was taken.
 */
export async function puttAtCup(page: Page, speed: number, aside = 0, options: { back?: number; from?: number } = {}) {
  const cup = await page.evaluate(() => window.game!.content().cup);
  // as far from the middle as a ball may be put down by the cup (game.ts's CLEAR_OF_CUP, which this file cannot import)
  const clear = cup.radius + KIND_RADIUS[BALL] + 0.5;
  const y0 = cup.y - (options.from ?? clear + (options.back ?? 0.1));
  const toEdge = cup.y - Math.sqrt(Math.max(0, cup.radius ** 2 - aside ** 2)) - y0;
  const power = powerFor(Math.sqrt(speed * speed + 2 * ROLL.roll * toEdge), HARDEST_SHOT);
  return page.evaluate(
    ({ x, y, power }) => {
      const g = window.game!;
      g.lay(x, y);
      g.step(10);
      return g.shoot(Math.PI / 2, power);
    },
    { x: cup.x + aside, y: y0, power },
  );
}

/** A save with a career's figures, two feats kept, two titles on the golf tour and one on the mini, and one record. */
export const TROPHIES_SAVE = {
  life: {
    rounds: 41,
    wins: 9,
    holes: 372,
    aces: 23,
    eagles: 4,
    birdies: 96,
    lost: 58,
    lipOuts: 31,
    longestPutt: 31,
    longestDrive: 268,
  },
  feats: ['ace', 'winner'],
  season: {
    golf: { grade: 'championship', begun: 3, played: [], titles: 2 },
    mini: { grade: 'county', begun: 2, played: [], titles: 1 },
  },
  records: { 'The Meadow': { strokes: 19, par: 26, kit: { club: '', ball: '', accessory: '' }, when: '2026-10-15' } },
};

/** The powers a wedge is tried at, the hard ones first: a ball at a wedge's full strength comes down through the pin's height most often. */
const POWERS = [
  ...Array.from({ length: 16 }, (_, i) => 1 - i * 0.01),
  ...Array.from({ length: 35 }, (_, i) => 0.84 - i * 0.01),
];

/**
 * A sand wedge struck at the pin of the golf hole in play, from a point of the compass that will take the ball, at one power
 * after another until a ball comes down through the pole's height, which the game tells as `pinned`. Searched in the page, from
 * the test API, since the lies that will hold a ball are the hole's and the wedge's flight is the hole's wind's. With `stop`, the
 * page is left the moment it is told; otherwise the stroke is played out to rest. The events of the step it was told in (the log is read as it goes), or null if no ball struck the pin.
 */
export async function strikeThePin(page: Page, options: { stop?: boolean } = {}): Promise<string[] | null> {
  return page.evaluate(
    ([stop, powers]) => {
      const g = window.game!;
      const { cup } = g.content();
      for (const back of [75, 70, 65, 60, 55, 50, 45]) {
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          for (const power of powers) {
            // a ball holed ends the hole: begin it again, as the player would
            if (g.state().phase !== 'play') {
              g.startHole(0);
              g.step(30);
            }
            try {
              g.lay(cup.x - Math.cos(a) * back, cup.y - Math.sin(a) * back);
            } catch {
              break;
            }
            g.events();
            if (!g.shoot(a, power, 'sand-wedge')) continue;
            for (let f = 0; f < 900 && g.state().phase === 'play'; f++) {
              g.step(1);
              const lines = g.events();
              if (lines.some((l) => l.startsWith('pinned '))) {
                if (!stop) for (let r = 0; r < 900 && g.state().phase === 'play' && !g.state().ready; r++) g.step(1);
                return lines;
              }
              if (f > 5 && g.state().ready) break;
            }
          }
        }
      }
      return null;
    },
    [options.stop ?? false, POWERS] as const,
  );
}

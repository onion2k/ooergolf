/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU, with a fresh save each test. What the unit tests cannot reach — the
 * renderer, the keyboard, the frame loop, the page — checked for the things
 * that would make it plainly broken: an error, a black screen, a clock that
 * does not run, a save it cannot boot from again.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { drag, start, watch } from './game';

/** How many frames the page draws in a second. */
function framesInASecond(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const began = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - began < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** How much a screenshot has in it: the spread of its brightness, and the share of it that is not near black. */
function content(png: Buffer) {
  const img = PNG.sync.read(png);
  let sum = 0,
    sq = 0,
    lit = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const y = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    sum += y;
    sq += y * y;
    if (y > 40) lit++;
  }
  const mean = sum / n;
  return { spread: Math.sqrt(sq / n - mean * mean), lit: lit / n };
}

test('boots with no errors and draws the course', async ({ page }, info) => {
  const problems = watch(page);
  await start(page);
  expect(await framesInASecond(page)).toBeGreaterThan(20);
  const state = await page.evaluate(() => window.game!.state());
  expect(state.live, 'the ball on the course').toBe(1);
  expect(state.ready, 'and ready to be struck').toBe(true);
  expect(state.t, 'the clock running').toBeGreaterThan(0);
  const shot = await page.screenshot();
  await info.attach('course', { body: shot, contentType: 'image/png' });
  const c = content(shot);
  expect(c.lit, 'share of the screen lit').toBeGreaterThan(0.2);
  expect(c.spread, 'variety in the picture').toBeGreaterThan(20);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('stops and steps as the test API says', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const before = await page.evaluate(() => window.game!.state());
  expect(before.paused).toBe(true);
  expect(before.t, 'no frame of its own has run').toBe(0);
  const after = await page.evaluate(() => {
    window.game!.step(60);
    return window.game!.state();
  });
  expect(after.t).toBeCloseTo(1, 9);
  expect(after.frame).toBe(before.frame + 60);
  expect(problems).toEqual([]);
});

/** A drag straight down the screen from the ball, a share of the full drag long, and what it did. */
async function putt(page: Page, share: number, touch = false) {
  const ball = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
  await drag(page, ball, { x: ball.x, y: ball.y + share * 0.35 * short }, { touch });
  return page.evaluate(() => ({
    state: window.game!.state(),
    ball: window.game!.ball(),
    events: window.game!.events(),
  }));
}

test('a mouse drag pulled back and let go strikes the ball up the course, as hard as it was pulled', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const { hardest } = await page.evaluate(() => window.game!.content());
  const after = await putt(page, 0.5);
  expect(after.state.strokes).toBe(1);
  expect(after.state.ready).toBe(false);
  expect(after.ball.speed / hardest, 'half a full drag, half the hardest shot').toBeCloseTo(0.5, 1);
  expect(after.events.some((e) => e.startsWith('struck'))).toBe(true);
  await page.evaluate(() => window.game!.step(60));
  expect(await page.evaluate(() => window.game!.ball().y), 'up the course').toBeGreaterThan(
    (await page.evaluate(() => window.game!.content())).tee.y + 3,
  );
  await expect(page.locator('#strokes b')).toHaveText('1');
  expect(problems).toEqual([]);
});

test('a drag too short to mean anything is no shot, and no stroke', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const after = await putt(page, 0.05);
  expect(after.state.strokes).toBe(0);
  expect(after.state.ready).toBe(true);
  expect(problems).toEqual([]);
});

test('writes its save, and boots again from it', async ({ page }) => {
  const problems = watch(page);
  await start(page);
  const written = await page.evaluate(() => window.game!.save());
  expect(written).toBe('{}');
  expect(await page.evaluate(() => localStorage.getItem('ooergolf-save-v1'))).toBe(written);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test("boots from the stub's save, which has a bank the game no longer knows", async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: { bank: 7, banked: 7 } });
  expect(await page.evaluate(() => window.game!.save())).toBe('{}');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

  test('a finger drag strikes the ball', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const after = await putt(page, 0.6, true);
    expect(after.state.strokes).toBe(1);
    expect(after.ball.speed).toBeGreaterThan(10);
    expect(problems).toEqual([]);
  });

  test('boots, and nothing is wider than the screen', async ({ page }, info) => {
    const problems = watch(page);
    await start(page);
    await expect(page.locator('#strokes')).toBeVisible();
    await expect(page.locator('#help')).toBeVisible();
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    expect(problems).toEqual([]);
  });
});

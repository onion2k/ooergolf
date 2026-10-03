/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU, with a fresh save each test. What the unit tests cannot reach — the
 * renderer, the keyboard, the frame loop, the page — checked for the things
 * that would make it plainly broken: an error, a black screen, a clock that
 * does not run, a save it cannot boot from again.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { BALL, KIND_RADIUS, ROLL, heightAt, layoutOf, powerFor } from '../src/arena';
import { COURSE, COURSES, CUP } from '../src/course';
import { VOLCANO } from '../test/hills';
import { ORBIT } from '../src/gesture';
import { LIE } from '../src/surfaces';
import { links } from '../src/links';
import { noiseGround } from '../src/noise';
import { clearings } from '../src/scenery';
import { BLADE_ROOM, GOLF_FAIRWAY_DENSITY, GOLF_ROUGH_DENSITY, cellFor } from '../src/turf';
import { drag, start, touches, watch } from './game';
import { holeOut, read, toCard } from './panels';

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
  // half a full drag rolls half as far as the hardest shot, and the distance goes as the square of the speed
  expect(after.ball.speed / hardest, 'half a full drag, half as far').toBeCloseTo(Math.SQRT1_2, 1);
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
  expect(written).toBe('{"coins":0,"gems":0,"owned":["putter"],"club":"putter","best":{}}');
  expect(await page.evaluate(() => localStorage.getItem('ooergolf-save-v1'))).toBe(written);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test("boots from the stub's save, which has a bank the game no longer knows", async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: { bank: 7, banked: 7 } });
  expect(await page.evaluate(() => window.game!.save())).toBe(
    '{"coins":0,"gems":0,"owned":["putter"],"club":"putter","best":{}}',
  );
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('the shop sells a club to a player who can pay, puts it in hand, and a reload keeps it', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, save: { coins: 45, gems: 0 } });
  await expect(page.locator('#coins')).toHaveText('45');
  await page.locator('#shopOpen').click();
  await expect(page.locator('#shop')).toBeVisible();
  // the silver putter is more than the purse holds, and says so
  await expect(page.locator('[data-club=silver] button')).toBeDisabled();
  await page.locator('[data-club=brass] button').click();
  await expect(page.locator('#coins')).toHaveText('5');
  await expect(page.locator('[data-club=brass] button')).toHaveText('Use');
  await page.locator('[data-club=brass] button').click();
  await expect(page.locator('[data-club=brass] button')).toHaveText('In hand');
  const state = await page.evaluate(() => window.game!.state());
  expect(state.club).toBe('brass');
  expect(state.hardest).toBe(42);
  await page.locator('#shopClose').click();
  await expect(page.locator('#shop')).toBeHidden();
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  const after = await page.evaluate(() => window.game!.state());
  expect(after.club).toBe('brass');
  expect(after.coins).toBe(5);
  expect(problems).toEqual([]);
});

test.describe('the start screen', () => {
  test('opens over the first hole, a card for each course, and a click on one plays it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await expect(page.locator('#start')).toBeVisible();
    await expect(page.locator('#start .course')).toHaveCount(6);
    // the courses sit under two headings, minigolf then golf, the Meadow first of all
    await expect(page.locator('#start h2')).toHaveText(['Minigolf', 'Golf']);
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('#courses > *')).map(
          (e) => `${e.tagName}:${e.textContent.split(/\d/)[0]}`,
        ),
      ),
    ).toEqual([
      'H2:Minigolf',
      'BUTTON:The Meadow',
      'BUTTON:The Pinball Shed',
      'BUTTON:The Fair',
      'BUTTON:The Waterworks',
      'H2:Golf',
      'BUTTON:The Range',
      'BUTTON:The Links',
    ]);
    await expect(page.locator('#start .course').nth(1)).toContainText('The Pinball Shed');
    await expect(page.locator('#start .course').nth(1)).toContainText('9 holes');
    await expect(page.locator('#start .course').nth(1)).toContainText('par 25');
    await expect(page.locator('#start .course').nth(2)).toContainText('The Fair');
    await expect(page.locator('#start .course').nth(2)).toContainText('9 holes');
    await expect(page.locator('#start .course').nth(2)).toContainText('par 28');
    await expect(page.locator('#start .course').nth(3)).toContainText('The Waterworks');
    await expect(page.locator('#start .course').nth(3)).toContainText('6 holes');
    await expect(page.locator('#start .course').nth(3)).toContainText('par 18');
    await expect(page.locator('#start .course').nth(4)).toContainText('The Range');
    await expect(page.locator('#start .course').nth(4)).toContainText('9 holes');
    await expect(page.locator('#start .course').nth(4)).toContainText('par 32');
    await expect(page.locator('#start .course').nth(5)).toContainText('The Links');
    await expect(page.locator('#start .course').nth(5)).toContainText('9 holes');
    await expect(page.locator('#start .course').nth(5)).toContainText('par 36');
    await expect(page.locator('#start .course').first()).toContainText('The Meadow');
    await expect(page.locator('#start .course').first()).toContainText('9 holes');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({ choosing: true, course: 'The Meadow' });
    // nothing is struck through it
    const box = (await page.locator('#view').boundingBox())!;
    await drag(page, { x: box.x + 40, y: box.y + box.height - 60 }, { x: box.x + 40, y: box.y + box.height - 10 });
    expect((await page.evaluate(() => window.game!.state())).strokes, 'no stroke through the start screen').toBe(0);
    await page.locator('#start .course', { hasText: 'The Range' }).click();
    await expect(page.locator('#start')).toBeHidden();
    await expect(page.locator('#strokes')).toBeVisible();
    await expect(page.locator('#holeName')).toContainText('Hole 1 of 9');
    await expect(page.locator('#holeName')).toContainText('Pitch and Putt');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({
      choosing: false,
      course: 'The Range',
      hole: 0,
    });
    expect(problems).toEqual([]);
  });

  test('comes back from the card at the end of a round, and a course chosen there starts afresh', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    // the round played out by the autopilot, a frame at a time, to the card
    await page.evaluate(() => {
      const g = window.game!;
      for (let f = 0; f < 60 * 60 * 4 && g.state().phase !== 'over'; f++) {
        const s = g.suggest();
        if (s && g.state().ready) g.shoot(s.angle, s.power);
        g.step(1);
      }
    });
    await expect(page.locator('#card')).toBeVisible();
    await page.locator('#cardCourses').click();
    await expect(page.locator('#start')).toBeVisible();
    await page.locator('#start .course', { hasText: 'The Range' }).click();
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({ course: 'The Range', hole: 0, card: [] });
    expect(problems).toEqual([]);
  });
});

test.describe('a hole whose ground slopes', () => {
  test('is holed with the ball rising and falling with the ground', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate((hole) => window.game!.playCourse([hole as never]), VOLCANO);
    await expect(page.locator('#holeName')).toContainText('Hole 1 of 1');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({ hole: 0, choosing: false });
    // the autopilot's shots, a frame at a time, and where the ball was at each
    const trace = await page.evaluate(() => {
      const g = window.game!;
      const seen: { x: number; y: number; z: number }[] = [];
      for (let stroke = 0; stroke < 12 && g.state().phase === 'play'; stroke++) {
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 900 && g.state().phase === 'play' && !g.state().ready; f++) {
          g.step(1);
          const { x, y, z } = g.ball();
          seen.push({ x, y, z });
        }
      }
      return { seen, state: g.state() };
    });
    expect(trace.state.phase, 'the hole was holed').toBe('done');
    expect(trace.state.card[0]).toBeLessThanOrEqual(VOLCANO.par);
    const l = layoutOf(VOLCANO.map, VOLCANO.terrain);
    const r = KIND_RADIUS[BALL];
    for (const { x, y, z } of trace.seen) {
      // never under the ground it is on, but for the cup, which is a hole in it
      if (Math.hypot(x - l.cup.x, y - l.cup.y) < CUP.radius + r) continue;
      expect(z, `the ball at ${x.toFixed(1)},${y.toFixed(1)} is not under the ground`).toBeGreaterThanOrEqual(
        heightAt(l, x, y) + r - 0.05,
      );
    }
    const under = trace.seen.map(({ x, y }) => heightAt(l, x, y)),
      zs = trace.seen.map((p) => p.z);
    expect(Math.max(...under) - Math.min(...under), 'the ground under the ball rose and fell').toBeGreaterThan(0.4);
    expect(Math.max(...zs) - Math.min(...zs), 'and so did the ball').toBeGreaterThan(0.4);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe('the water and the sand', () => {
  test('sparkle on a pond, a few at a time and never more than six, and not at all where there is no water', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    /** The most sparkles lit in `seconds` of game time, looked at every fifth of a second. */
    const most = (hole: string, seconds: number) =>
      page.evaluate(
        ([name, secs]) => {
          const g = window.game!;
          g.startHole(g.content().holes.findIndex((h) => h.name === name));
          let best = 0;
          for (let f = 0; f < 60 * secs; f += 12) {
            g.step(12);
            best = Math.max(best, g.motions().sparkles);
          }
          return best;
        },
        [hole, seconds] as const,
      );
    const wet = await most('Pond', 8);
    expect(wet, 'some twinkle on the pond').toBeGreaterThan(0);
    expect(wet, 'and never more than there is room for').toBeLessThanOrEqual(6);
    // and they are drawn on the water: each where the pond is on the page, and not in the corner of the screen
    const hole = COURSE.find((h) => h.name === 'Pond')!;
    const l = layoutOf(hole.map);
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.water[t]) {
        const [x, y] = [l.originX + (t % l.cols) * 3, l.originY + Math.floor(t / l.cols) * 3];
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + 3), Math.max(y1, y + 3)];
      }
    const seen = await page.evaluate(
      ([name, box]) => {
        const g = window.game!;
        g.startHole(g.content().holes.findIndex((h) => h.name === name));
        const corners = [
          [box[0], box[1]],
          [box[2], box[1]],
          [box[2], box[3]],
          [box[0], box[3]],
        ].map(([x, y]) => g.project(x, y, -0.3));
        const on: { x: number; y: number }[] = [];
        for (let f = 0; f < 60 * 8; f += 12) {
          g.step(12);
          on.push(...g.motions().sparklesAt);
        }
        return { corners, on };
      },
      ['Pond', [x0, y0, x1, y1]] as const,
    );
    const [left, right] = [Math.min(...seen.corners.map((c) => c.x)), Math.max(...seen.corners.map((c) => c.x))];
    const [top, bottom] = [Math.min(...seen.corners.map((c) => c.y)), Math.max(...seen.corners.map((c) => c.y))];
    expect(seen.on.length, 'some were drawn').toBeGreaterThan(0);
    for (const p of seen.on) {
      expect(p.x, 'across, on the water').toBeGreaterThan(left);
      expect(p.x).toBeLessThan(right);
      expect(p.y, 'down, on the water').toBeGreaterThan(top);
      expect(p.y).toBeLessThan(bottom);
    }
    expect(await most('Straight', 8), 'none where there is no water').toBe(0);
    expect(problems).toEqual([]);
  });

  test('a ball putted into the pond rings out where it went in, wider as it fades, and the ring is gone in a second and a bit', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
      g.step(30);
      g.shoot(Math.PI / 2 + 0.25, 0.45);
    });
    expect((await page.evaluate(() => window.game!.motions())).splash, 'no ring until it goes in').toBe(0);
    const went = await page.evaluate(() => {
      const g = window.game!;
      for (let f = 0; f < 600 && g.state().strokes < 2; f++) g.step(1);
      return g.state().strokes;
    });
    expect(went, 'it went in').toBe(2);
    const first = (await page.evaluate(() => window.game!.motions())).splash;
    expect(first, 'ringing out').toBeGreaterThan(0);
    await page.evaluate(() => window.game!.step(30));
    const later = (await page.evaluate(() => window.game!.motions())).splash;
    expect(later, 'wider').toBeGreaterThan(first);
    await page.evaluate(() => window.game!.step(60));
    expect((await page.evaluate(() => window.game!.motions())).splash, 'gone').toBe(0);
    expect(problems).toEqual([]);
  });

  test('a stroke from sand throws sand and a stroke from grass throws grass', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'The Bunker'));
      g.step(30);
    });
    expect((await page.evaluate(() => window.game!.motions())).puff, 'nothing thrown before a stroke').toBe(null);
    const puffs = await page.evaluate(() => {
      const g = window.game!;
      const ball = g.bodies('ball')[0];
      const { sand } = g.content();
      // in the middle of the sand, and struck from it
      g.place(ball.slot, sand[0].x, sand[0].y);
      g.step(5);
      g.shoot(Math.PI / 2, 0.2);
      const fromSand = g.motions().puff;
      for (let f = 0; f < 900 && !g.state().ready; f++) g.step(1);
      // and again from the tee, on grass
      const { tee } = g.content();
      g.place(ball.slot, tee.x, tee.y);
      g.step(5);
      g.shoot(Math.PI / 2, 0.2);
      return { fromSand, fromGrass: g.motions().puff };
    });
    expect(puffs).toEqual({ fromSand: 'sand', fromGrass: 'grass' });
    expect(problems).toEqual([]);
  });
});

test.describe('looking round', () => {
  /**
   * Where the cup is on the page, which the view turning moves: not the tee, which is where the ball lies, and the
   * camera turns about the ball, so it stays where it was on the screen from every side.
   */
  const cupOnPage = (page: Page) =>
    page.evaluate(() => {
      const g = window.game!;
      const { cup } = g.content();
      return g.project(cup.x, cup.y, 0);
    });

  test('is Aim until the switch is pressed; Look turns a drag into an orbit that strikes nothing, and Aim strikes again', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.step(30));
    const first = await page.evaluate(() => window.game!.view());
    expect(first).toMatchObject({ mode: 'aim', azimuth: 0 });
    expect(first.tilt).toBeCloseTo(0.78, 9);
    await expect(page.locator('#modeAim')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#modeLook')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#help')).toContainText('drag back');
    const cup = await cupOnPage(page);

    await page.locator('#modeLook').click();
    await expect(page.locator('#modeLook')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#modeAim')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#help')).toContainText('look round');
    expect((await page.evaluate(() => window.game!.view())).mode).toBe('look');

    // across the screen, as far as a quarter of its shorter side is: the ground near the ball goes with the finger
    const nearOnPage = () =>
      page.evaluate(() => {
        const g = window.game!;
        const ball = g.ball();
        return g.project(ball.x, ball.y - 8, 0);
      });
    const near = await nearOnPage();
    const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
    await drag(page, { x: 640, y: 400 }, { x: 640 + short / 4, y: 400 });
    await page.evaluate(() => window.game!.step(1));
    const turned = await page.evaluate(() => window.game!.view());
    expect(turned.azimuth, 'turned by the drag').toBeCloseTo(ORBIT.turn / 4, 3);
    expect((await nearOnPage()).x, 'the ground near the ball went across with the finger').toBeGreaterThan(near.x + 30);
    expect(turned.tilt, 'not tilted by a drag straight across').toBeCloseTo(0.78, 3);
    const moved = await cupOnPage(page);
    expect(Math.hypot(moved.x - cup.x, moved.y - cup.y), 'the cup is somewhere else on the page').toBeGreaterThan(30);
    expect((await page.evaluate(() => window.game!.state())).strokes, 'nothing was struck').toBe(0);
    expect(await page.evaluate(() => window.game!.aiming()), 'and no aim was shown').toBe(null);

    // down the screen: the view comes lower, and no lower than it may
    await drag(page, { x: 640, y: 200 }, { x: 640, y: 600 });
    await page.evaluate(() => window.game!.step(1));
    expect((await page.evaluate(() => window.game!.view())).tilt, 'as low as it goes').toBe(1);
    await drag(page, { x: 640, y: 700 }, { x: 640, y: 100 });
    await page.evaluate(() => window.game!.step(1));
    expect((await page.evaluate(() => window.game!.view())).tilt, 'and as high').toBe(0.3);

    // back to Aim, and the same hand strikes the ball
    await page.locator('#modeAim').click();
    await expect(page.locator('#modeAim')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#help')).toContainText('drag back');
    const putted = await putt(page, 0.6);
    expect(putted.state.strokes, 'a stroke in aim mode').toBe(1);
    expect(problems).toEqual([]);
  });

  test('strikes the ball where the drag points on the course, from the far side of it as from the near', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    // the ball in the middle of the hole, with room to roll either way, and the view turned right round: up the screen is
    // now down the course, so pulling back down the screen sends the ball toward the tee end of the hole, and not up it
    // as it does from the tee
    const at = await page.evaluate(() => {
      const g = window.game!;
      g.place(g.bodies('ball')[0].slot, 0, 0);
      g.orbit(Math.PI, 0);
      g.step(60);
      return g.ball();
    });
    await putt(page, 0.3);
    await page.evaluate(() => window.game!.step(90));
    const after = await page.evaluate(() => window.game!.ball());
    expect(after.y, 'down the course').toBeLessThan(at.y - 5);
    expect(Math.abs(after.x - at.x), 'straight').toBeLessThan(2);
    expect(problems).toEqual([]);
  });

  test('puts the switch back to Aim at a new hole, and eases the view home over the glide instead of cutting to it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.locator('#modeLook').click();
    await page.evaluate(() => {
      window.game!.orbit(1.5, 0.2);
      window.game!.step(1);
    });
    expect((await page.evaluate(() => window.game!.view())).azimuth).toBeCloseTo(1.5, 6);
    await page.evaluate(() => window.game!.startHole(1));
    await expect(page.locator('#modeAim')).toHaveAttribute('aria-pressed', 'true');
    expect((await page.evaluate(() => window.game!.view())).mode).toBe('aim');
    const at = async (frames: number) => {
      await page.evaluate((f) => window.game!.step(f), frames);
      return page.evaluate(() => window.game!.view());
    };
    const start0 = await at(1);
    expect(start0.azimuth, 'where it was, as the hole begins').toBeGreaterThan(1.3);
    const mid = await at(24);
    expect(mid.azimuth, 'part of the way').toBeGreaterThan(0.05);
    expect(mid.azimuth).toBeLessThan(start0.azimuth - 0.05);
    const home = await at(60);
    expect(home.azimuth, 'home').toBe(0);
    expect(home.tilt).toBeCloseTo(0.78, 9);
    expect(problems).toEqual([]);
  });

  test('is on the course’s screens and put away under the start screen', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await expect(page.locator('#viewMode')).toBeHidden();
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
    await expect(page.locator('#viewMode')).toBeVisible();
    // and put away again when the card's Courses button brings the start screen back over the course
    await toCard(page);
    await expect(page.locator('#viewMode')).toBeVisible();
    await page.getByRole('button', { name: 'Courses' }).click();
    expect((await page.evaluate(() => window.game!.state())).choosing).toBe(true);
    await expect(page.locator('#viewMode')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('costs a frame inside the budget at the worst view it can be turned and tilted to', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const cost = await page.evaluate(async () => {
      const g = window.game!;
      g.step(120);
      // from behind and as low as it goes, the most grass it can see
      g.orbit(Math.PI, 10);
      g.step(2);
      return g.measureFrame(200);
    });
    console.log(`orbit: the worst view, ${cost.toFixed(2)} ms a frame`);
    expect(cost, 'inside the 5 ms budget').toBeLessThan(5);
    expect(problems).toEqual([]);
  });
});

test.describe('golf', () => {
  test('costs a frame inside the budget on the longest hole of the range, The Long Road: from its tee, in the air, and at the worst view', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const cost = await page.evaluate(async () => {
      const g = window.game!;
      g.chooseCourse('The Range');
      g.startHole(8);
      g.step(120);
      const tee = await g.measureFrame(60);
      // a drive in the air, the camera on it
      g.shoot(Math.PI / 2, 1, 'driver');
      g.step(40);
      const air = await g.measureFrame(60);
      // from behind and as low as it goes, the most ground it can see: over the whole hole, ground and rail and rough
      for (let f = 0; f < 600 && !g.state().ready; f++) g.step(1);
      g.orbit(Math.PI, 10);
      g.step(2);
      const worst = await g.measureFrame(60);
      // the whole hole from the middle of it, as far back as the zoom goes: the fairway and the rough at their densest
      g.orbit(-Math.PI, -10);
      const { tee: t, cup } = g.content();
      g.look((t.x + cup.x) / 2, (t.y + cup.y) / 2, 110);
      g.step(2);
      const whole = await g.measureFrame(60);
      return { tee, air, worst, whole };
    });
    console.log(
      `the range, The Long Road: tee ${cost.tee.toFixed(2)} ms, in the air ${cost.air.toFixed(2)} ms, the worst view ${cost.worst.toFixed(2)} ms, the whole hole ${cost.whole.toFixed(2)} ms a frame`,
    );
    for (const [where, ms] of Object.entries(cost)) expect(ms, `${where}: inside the 5 ms budget`).toBeLessThan(5);
    expect(problems).toEqual([]);
  });
});

test.describe('the grass of a golf hole', () => {
  /** The middle of the first tile of Links hole `hole` that is `lie` and has nothing else (another lie, out of bounds, sand, water, a tree) within `apart` tiles of it, which is where the grass of that lie alone grows. */
  function inside(hole: number, lie: number, apart: number) {
    const def = links()[hole];
    const l = layoutOf(def.map, def.terrain);
    for (let t = 0; t < l.cols * l.rows; t++) {
      const tx = t % l.cols,
        ty = Math.floor(t / l.cols);
      let alone = true;
      for (let dy = -apart; dy <= apart && alone; dy++)
        for (let dx = -apart; dx <= apart && alone; dx++) {
          const u = (ty + dy) * l.cols + tx + dx;
          if (
            tx + dx < 0 ||
            ty + dy < 0 ||
            tx + dx >= l.cols ||
            ty + dy >= l.rows ||
            l.lie[u] !== lie ||
            l.oob[u] ||
            l.sand[u] ||
            l.water[u] ||
            l.solid[u]
          )
            alone = false;
        }
      if (alone) return { x: l.originX + (tx + 0.5) * 3, y: l.originY + (ty + 0.5) * 3 };
    }
    throw new Error(`no ${lie} on hole ${hole + 1}`);
  }

  test('grows the fairway short and thick and the rough dense, and none on the green, the tee or the first cut', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    // a tile of each, the camera 30 back so every blade within view is kept: a circle inside the tile, 1.4 across
    const where = {
      fairway: inside(0, LIE.fairway, 1),
      rough: inside(0, LIE.rough, 1),
      green: inside(0, LIE.green, 0),
      tee: inside(0, LIE.tee, 0),
      cut: inside(0, LIE.cut, 0),
    };
    const counted = await page.evaluate(async (at) => {
      const g = window.game!;
      g.chooseCourse('The Links');
      g.startHole(0);
      g.step(60);
      const out: Record<string, number> = {};
      for (const [what, p] of Object.entries(at)) {
        g.look(p.x, p.y, 30);
        g.step(3);
        out[what] = await g.bladesAround(p.x, p.y, 1.4);
      }
      return out;
    }, where);
    const area = Math.PI * 1.4 ** 2;
    // about as many as the density says, the jitter of a lattice and the renderer's thinning allowing a quarter either way
    expect(counted.fairway, 'the fairway: its own short grass').toBeGreaterThan(GOLF_FAIRWAY_DENSITY * area * 0.7);
    expect(counted.fairway).toBeLessThan(GOLF_FAIRWAY_DENSITY * area * 1.3);
    expect(counted.rough, 'the rough: denser than it was').toBeGreaterThan(GOLF_ROUGH_DENSITY * area * 0.7);
    expect(counted.rough).toBeLessThan(GOLF_ROUGH_DENSITY * area * 1.3);
    expect(counted.green, 'the green is mown flat').toBe(0);
    expect(counted.tee, 'the tee box is mown flat').toBe(0);
    expect(counted.cut, 'the first cut is mown flat').toBe(0);
    expect(problems).toEqual([]);
  });

  test("never runs the renderer out of blades on the longest holes at the widest views, and is thinned by the ladder's rungs and never given up", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const problems = watch(page);
    const shares: number[] = [];
    let full = 0,
      most = 0;
    for (const rung of [0, 1, 2, 3]) {
      await start(page, { seed: 11, paused: true, rung });
      const seen = await page.evaluate(async () => {
        const g = window.game!;
        const out: number[] = [];
        for (const [course, hole] of [
          ['The Links', 6],
          ['The Links', 2],
          ['The Range', 8],
        ] as const) {
          g.chooseCourse(course);
          g.startHole(hole);
          g.club('driver');
          g.step(300);
          const { tee, cup } = g.content();
          // the aim view, and the whole hole from the middle of it at the widest zoom there is, and the home zoom
          for (const [x, y, d] of [
            [tee.x, tee.y, 0],
            [(tee.x + cup.x) / 2, (tee.y + cup.y) / 2, 110],
            [(tee.x + cup.x) / 2, (tee.y + cup.y) / 2, 200],
            [(tee.x + cup.x) / 2, (tee.y + cup.y) / 2, 62],
          ]) {
            if (d) g.look(x, y, d);
            else g.step(0);
            g.step(2);
            const grass = await g.grass();
            out.push(grass.near + grass.far);
          }
        }
        return out;
      });
      const total = seen.reduce((a, b) => a + b, 0);
      most = Math.max(most, ...seen);
      if (rung === 0) full = total;
      shares.push(total / full);
      for (const n of seen) {
        expect(n, `rung ${rung}: grass in view`).toBeGreaterThan(1_000);
        expect(n, `rung ${rung}: room to spare`).toBeLessThan(BLADE_ROOM * 0.85);
      }
    }
    console.log(
      `golf grass: the most blades drawn in any scene ${most}, of room for ${BLADE_ROOM}; rungs' shares ${shares.map((x) => x.toFixed(2)).join(', ')}`,
    );
    expect(shares[1], 'half on the first rung').toBeGreaterThan(0.4);
    expect(shares[1]).toBeLessThan(0.6);
    expect(shares[3], 'a quarter on the last').toBeGreaterThan(0.15);
    expect(shares[3]).toBeLessThan(0.35);
    expect(problems).toEqual([]);
  });
});

test.describe('golf on The Links', () => {
  test('costs a frame inside the budget on the longest hole of The Links: from its tee, in the air over it, and at the worst view', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const cost = await page.evaluate(async () => {
      const g = window.game!;
      g.chooseCourse('The Links');
      g.startHole(6);
      g.step(120);
      const tee = await g.measureFrame(60);
      g.shoot(Math.PI / 2, 1, 'driver');
      g.step(40);
      const air = await g.measureFrame(60);
      for (let f = 0; f < 900 && !g.state().ready; f++) g.step(1);
      g.orbit(Math.PI, 10);
      g.step(2);
      const worst = await g.measureFrame(60);
      // the whole hole from the middle of it, as far back as the zoom goes: every tree and every tile of it in view
      g.orbit(-Math.PI, -10);
      const { tee: t, cup } = g.content();
      g.look((t.x + cup.x) / 2, (t.y + cup.y) / 2, 110);
      g.step(2);
      const whole = await g.measureFrame(60);
      return { tee, air, worst, whole };
    });
    console.log(
      `the links: tee ${cost.tee.toFixed(2)} ms, in the air ${cost.air.toFixed(2)} ms, the worst view ${cost.worst.toFixed(2)} ms, the whole hole ${cost.whole.toFixed(2)} ms a frame`,
    );
    for (const [where, ms] of Object.entries(cost)) expect(ms, `${where}: inside the 5 ms budget`).toBeLessThan(5);
    expect(problems).toEqual([]);
  });

  test('costs a frame inside the budget from the aim view of every club, on the two longest holes, facing up the hole and turned right round', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const rows = await page.evaluate(async () => {
      const g = window.game!;
      g.chooseCourse('The Links');
      const out: { where: string; ms: number; distance: number }[] = [];
      for (const hole of [2, 6]) {
        g.startHole(hole);
        for (const club of ['driver', '3-wood', '5-iron', '7-iron', '9-iron', 'pitching-wedge', 'sand-wedge']) {
          g.club(club);
          g.step(300);
          const v = g.view();
          out.push({ where: `hole ${hole + 1}, the ${club}`, ms: await g.measureFrame(40), distance: v.distance });
          // and the same view turned right round, looking back down the hole at the tee and the grass behind it
          g.orbit(Math.PI, 0);
          g.step(2);
          out.push({
            where: `hole ${hole + 1}, the ${club}, turned round`,
            ms: await g.measureFrame(40),
            distance: v.distance,
          });
          g.orbit(-Math.PI, 0);
        }
      }
      return out;
    });
    const worst = rows.reduce((a, b) => (b.ms > a.ms ? b : a));
    console.log(
      `the aim view: the worst is ${worst.where}, ${worst.ms.toFixed(2)} ms a frame, of ${rows.length} measured`,
    );
    for (const r of rows)
      expect(r.ms, `${r.where} (${r.distance.toFixed(0)} back): inside the 5 ms budget`).toBeLessThan(5);
    expect(
      rows.some((r) => r.distance > 150),
      'the driver is looked at from well past where minigolf stops',
    ).toBe(true);
    expect(problems).toEqual([]);
  });

  test("draws the driver's aim view on every rung of the ladder inside the budget, and the lower rungs no dearer", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const costs: number[] = [];
    for (let rung = 0; rung < 4; rung++) {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, rung });
      costs.push(
        await page.evaluate(async () => {
          const g = window.game!;
          g.chooseCourse('The Links');
          g.startHole(6);
          g.step(300);
          return g.measureFrame(40);
        }),
      );
      expect(problems).toEqual([]);
    }
    console.log(`the driver's aim view on each rung: ${costs.map((c) => c.toFixed(2)).join(', ')} ms a frame`);
    for (const [rung, ms] of costs.entries()) expect(ms, `rung ${rung}: inside the 5 ms budget`).toBeLessThan(5);
    // a rung down is never dearer by more than the wobble of a frame (a third of a millisecond, measured)
    for (let rung = 1; rung < costs.length; rung++)
      expect(costs[rung], `rung ${rung} against the one above`).toBeLessThan(costs[rung - 1] + 0.5);
  });
});

test.describe('the aim view on a phone held upright', () => {
  test.use({ hasTouch: true, isMobile: true });
  const SIZES = [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ];

  test("costs a frame inside the budget from the aim view of every club, on the two longest holes of The Links and the range's longest, at the sizes of a phone, facing up the hole and turned round", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const worst = { ms: 0, where: '' };
    for (const size of [SIZES[0], SIZES[2]]) {
      await page.setViewportSize(size);
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const rows = await page.evaluate(async () => {
        const g = window.game!;
        const out: { where: string; ms: number; back: number }[] = [];
        const measure = async (course: string, hole: number, clubs: string[]) => {
          g.chooseCourse(course);
          g.startHole(hole);
          for (const club of clubs) {
            g.club(club);
            g.step(300);
            const back = g.view().distance;
            out.push({ where: `${course} hole ${hole + 1}, the ${club}`, ms: await g.measureFrame(40), back });
            g.orbit(Math.PI, 0);
            g.step(2);
            out.push({
              where: `${course} hole ${hole + 1}, the ${club}, turned round`,
              ms: await g.measureFrame(40),
              back,
            });
            g.orbit(-Math.PI, 0);
          }
        };
        const bag = ['driver', '3-wood', '5-iron', '9-iron', 'sand-wedge'];
        await measure('The Links', 2, bag);
        await measure('The Links', 6, bag);
        await measure('The Range', 8, bag);
        return out;
      });
      for (const r of rows) {
        if (r.ms > worst.ms) Object.assign(worst, { ms: r.ms, where: `${size.width}x${size.height} ${r.where}` });
        expect(
          r.ms,
          `${size.width}x${size.height} ${r.where} (${r.back.toFixed(0)} back): inside the 5 ms budget`,
        ).toBeLessThan(5);
      }
      expect(problems).toEqual([]);
    }
    console.log(`the phone aim view: the worst is ${worst.where}, ${worst.ms.toFixed(2)} ms a frame`);
  });

  test("draws the driver's aim view on every rung of the ladder inside the budget on a phone, and the lower rungs no dearer", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(SIZES[0]);
    const costs: number[] = [];
    for (let rung = 0; rung < 4; rung++) {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, rung });
      costs.push(
        await page.evaluate(async () => {
          const g = window.game!;
          g.chooseCourse('The Links');
          g.startHole(6);
          g.step(300);
          return g.measureFrame(40);
        }),
      );
      expect(problems).toEqual([]);
    }
    console.log(
      `the driver's aim view on a 360 by 640 phone, each rung: ${costs.map((c) => c.toFixed(2)).join(', ')} ms a frame`,
    );
    for (const [rung, ms] of costs.entries()) expect(ms, `rung ${rung}: inside the 5 ms budget`).toBeLessThan(5);
    for (let rung = 1; rung < costs.length; rung++)
      expect(costs[rung], `rung ${rung} against the one above`).toBeLessThan(costs[rung - 1] + 0.5);
  });

  test("shows the far edge of the driver's and the 3-wood's landing ring below the coins, the shop and the switch, at each size", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      const problems = watch(page);
      for (const club of ['driver', '3-wood']) {
        // a page of its own for each, since a drag held is not let go of
        await start(page, { seed: 11, paused: true });
        await page.evaluate(() => {
          window.game!.chooseCourse('The Range');
          window.game!.startHole(8);
        });
        await page.evaluate((c) => {
          window.game!.club(c);
          window.game!.step(300);
        }, club);
        // pressed low, where the bag is not: the aim is the same wherever on the page it is pulled from
        const from = { x: size.width / 2, y: size.height * 0.4 };
        await drag(
          page,
          from,
          { x: from.x, y: from.y + 0.35 * Math.min(size.width, size.height) },
          { hold: true, touch: true },
        );
        await page.evaluate(() => window.game!.step(2));
        const top = await page.evaluate(() => {
          const g = window.game!;
          const ring = g.motions().shot?.ring;
          if (!ring) return null;
          // the far edge of the ring up the page, on the flat ground of a range hole
          return Math.min(
            g.project(ring.x, ring.y, 0).y,
            g.project(ring.x, ring.y + ring.radius, 0).y,
            g.project(ring.x, ring.y - ring.radius, 0).y,
          );
        });
        expect(top, `${size.width}x${size.height} ${club}: a ring is drawn`).not.toBeNull();
        expect(
          top!,
          `${size.width}x${size.height} ${club}: its far edge is below the switch (150 px)`,
        ).toBeGreaterThanOrEqual(150);
        await page.evaluate(() => window.game!.step(1));
      }
      expect(problems).toEqual([]);
    }
  });
});

test.describe('the cup and the rail', () => {
  /** The ball put down `back` short of the cup on the first hole, and struck at it to arrive at its edge at `speed`. */
  const putt = async (page: Page, speed: number, back = 5) => {
    const { cup, hardest } = await page.evaluate(() => window.game!.content());
    const power = powerFor(Math.sqrt(speed * speed + 2 * ROLL.roll * (back - cup.radius)), hardest);
    return page.evaluate(
      ({ back, power }) => {
        const g = window.game!;
        const { cup } = g.content();
        g.place(g.bodies('ball')[0].slot, cup.x, cup.y - back, 1);
        g.step(60);
        g.events();
        g.shoot(Math.PI / 2, power);
        // whether it crossed the whole of the cup before anything holed it: the first hole's rail is a tile behind the
        // cup, and a ball that runs over may bank off it and come back in
        let over = false;
        const told: string[] = [];
        for (let f = 0; f < 240; f++) {
          g.step(1);
          told.push(...g.events());
          if (!told.some((e) => e.startsWith('holed')) && g.state().live && g.ball().y > cup.y + cup.radius)
            over = true;
        }
        return { over, holed: told.some((e) => e.startsWith('holed')) };
      },
      { back, power },
    );
  };

  test('a gentle putt drops, and one too fast for the rim is thrown over it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    expect(await putt(page, 6), 'dropped').toEqual({ over: false, holed: true });
    await start(page, { seed: 1, paused: true });
    expect((await putt(page, 30)).over, 'thrown over the cup by its rim').toBe(true);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a ball struck at the rail comes back off it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const xs = await page.evaluate(() => {
      const g = window.game!;
      g.shoot(0, 0.3);
      const out: number[] = [];
      for (let f = 0; f < 90; f++) {
        g.step(1);
        out.push(g.ball().x);
      }
      return out;
    });
    const far = Math.max(...xs);
    expect(xs[xs.length - 1], 'back off the rail, not run along it or stopped against it').toBeLessThan(far - 1);
    expect(problems).toEqual([]);
  });
});

test.describe('sand and posts', () => {
  /** The page on the hole called `name`, paused and still. */
  const onHole = (page: Page, name: string) =>
    page.evaluate((hole) => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === hole));
      g.step(1);
      return g.content();
    }, name);

  test('a putt that would roll fifteen units on the green dies in the sand a unit or two in', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const { sand, tee } = await onHole(page, 'The Bunker');
    // the near edge of the sand straight up the hole from the tee
    const edge = Math.min(...sand.filter((s) => Math.abs(s.x - tee.x) < 1).map((s) => s.y)) - 1.5;
    const rest = await page.evaluate(() => {
      const g = window.game!;
      g.shoot(Math.PI / 2, 0.3);
      for (let f = 0; f < 300 && !(f > 1 && g.ball().ready); f++) g.step(1);
      return g.ball();
    });
    expect(rest.y - edge, 'in the sand').toBeGreaterThan(0);
    expect(rest.y - edge, 'a unit or two in, where the green would have taken it twelve past').toBeLessThan(3);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a ball struck at a post comes back off it faster than it met it', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const { posts, tee } = await onHole(page, 'Bumpers');
    expect(posts.length).toBe(5);
    expect(
      posts.some((p) => Math.abs(p.x - tee.x) < 0.01),
      'one on the line up the middle',
    ).toBe(true);
    const { before, after } = await page.evaluate(() => {
      const g = window.game!;
      g.shoot(Math.PI / 2, 0.5);
      // the green only ever slows it: the frame its speed jumps is the frame it met the post, part way through
      let before = g.ball().speed;
      for (let f = 0; f < 240; f++) {
        g.step(1);
        const now = g.ball().speed;
        if (now > before + 0.5) return { before, after: now };
        before = now;
      }
      return { before, after: 0 };
    });
    expect(before, 'met it moving').toBeGreaterThan(5);
    expect(after / before, 'thrown back faster than it came').toBeGreaterThan(1.05);
    expect(problems).toEqual([]);
  });
});

test.describe('the grass', () => {
  test("grows only in the rough round each hole, never on the course, in the hole's own wind", async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.step(1));
    const first = await page.evaluate(() => window.game!.grass());
    const drawn = first.near + first.far;
    // long, lush grass: at the home view several times what the short sparse rough drew (22 thousand), and never so many
    // that the renderer runs out of room for blades and leaves the far rough bare; no blade grows on the course, which
    // the unit tests hold on the field itself
    expect(drawn, 'lush').toBeGreaterThan(60_000);
    expect(drawn, "within the renderer's room for blades").toBeLessThan(BLADE_ROOM * 0.85);
    expect(first.wind.strength, 'a wind that moves long grass').toBeGreaterThanOrEqual(0.7);
    expect(first.wind.strength).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      window.game!.startHole(1);
      window.game!.step(1);
    });
    const second = await page.evaluate(() => window.game!.grass());
    expect(second.near + second.far, 'grown again on the next hole').toBeGreaterThan(60_000);
    expect(second.wind, 'a wind of its own').not.toEqual(first.wind);
    expect(problems).toEqual([]);
  });

  test('grows the rough round a hole too big for the finest cell, and none on its course, and plays it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    // a hundred tiles across is a field of a half-unit cell, three hundred one of a unit: each a hole the renderer
    // would refuse at the quarter-unit cell every hole has had, which is how the size of a hole was once limited
    for (const [tiles, cell] of [
      [100, 0.5],
      [300, 1],
    ] as const) {
      const map = Array.from({ length: tiles }, (_, r) =>
        Array.from({ length: tiles }, (_, c) => {
          if (r === 0 || r === tiles - 1 || c === 0 || c === tiles - 1) return '#';
          if (r === tiles - 3 && c === Math.floor(tiles / 2)) return 'T';
          if (r === 2 && c === Math.floor(tiles / 2)) return 'C';
          return '.';
        }).join(''),
      );
      const layout = layoutOf(map);
      expect(cellFor(layout), `${tiles} tiles across`).toBe(cell);
      const terrain = Array.from(noiseGround(layout, { seed: 8, feel: 'gentle', steepness: 0.3 }));
      const seen = await page.evaluate(
        async ({ map, terrain }) => {
          const g = window.game!;
          g.playCourse([{ name: 'Big', par: 9, map, terrain: Float32Array.from(terrain), moving: {} } as never]);
          g.step(120);
          const { floor, tee } = g.content();
          // the rough from just outside the rail's corner
          g.look(floor.minX - 12, floor.minY - 12, 62);
          g.step(2);
          const rough = await g.grass();
          // and the course underfoot at the tee, in view, where a blade that grew on it would be drawn: within four units of
          // it is all green, the rail's outer face being seven and a half away
          g.look(tee.x, tee.y, 62);
          g.step(2);
          const onCourse = await g.bladesAround(tee.x, tee.y, 4);
          const cost = await g.measureFrame(60);
          g.follow();
          return { blades: rough.near + rough.far, onCourse, cost };
        },
        { map, terrain },
      );
      expect(seen.blades, `${tiles} tiles: the rough grows round it`).toBeGreaterThan(20_000);
      expect(seen.blades, `${tiles} tiles: within the renderer's room`).toBeLessThan(BLADE_ROOM * 0.85);
      expect(seen.onCourse, `${tiles} tiles: no blade on the course`).toBe(0);
      expect(seen.cost, `${tiles} tiles: a frame inside the budget`).toBeLessThan(5);
      // and it is played: the autopilot's first shot from the tee is struck and comes to rest
      const played = await page.evaluate(() => {
        const g = window.game!;
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 1800 && !g.state().ready; f++) g.step(1);
        return g.state();
      });
      expect(played.strokes, `${tiles} tiles: a stroke taken`).toBe(1);
    }
    expect(problems).toEqual([]);
  });

  test('is thinned to half on the first rung down the ladder, the same blades the distance keeps', async ({ page }) => {
    const drawn = async (rung: number) => {
      await start(page, { rung, seed: 1, paused: true });
      await page.evaluate(() => window.game!.step(1));
      return page.evaluate(() => window.game!.grass());
    };
    const full = await drawn(0),
      half = await drawn(1);
    // every blade drawn, near and far: the rough alone is too few near the camera for a share of them to be steady
    const share = (half.near + half.far) / (full.near + full.far);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  test('is thinned to a quarter on the last rung, still there and still swaying', async ({ page }) => {
    const drawn = async (rung: number) => {
      await start(page, { rung, seed: 1, paused: true });
      await page.evaluate(() => window.game!.step(1));
      const [grass, view] = await Promise.all([
        page.evaluate(() => window.game!.grass()),
        page.evaluate(() => window.game!.view()),
      ]);
      return { blades: grass.near + grass.far, swaying: view.swaying };
    };
    const full = await drawn(0),
      last = await drawn(3);
    expect(last.blades, 'the grass is never given up').toBeGreaterThan(0);
    expect(last.blades / full.blades).toBeGreaterThan(0.15);
    expect(last.blades / full.blades).toBeLessThan(0.35);
    for (const rung of [0, 1, 2, 3]) expect((await drawn(rung)).swaying, `rung ${rung} sways`).toBe(true);
  });

  test('never runs the renderer out of blades, at the home view, the widest and the closest, on any hole of any course', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    let most = 0;
    for (const course of ['The Meadow']) {
      await page.evaluate((name) => window.game!.chooseCourse(name), course);
      const holes = await page.evaluate(() => window.game!.content().holes.length);
      for (let hole = 0; hole < holes; hole++) {
        await page.evaluate((i) => window.game!.startHole(i), hole);
        // the home view from the tee, the closest zoom there is, and the widest, whole course in view
        for (const zoom of [62, 30, 110]) {
          const blades = await page.evaluate(async (distance) => {
            const g = window.game!;
            const { floor, tee } = g.content();
            const middle = { x: (floor.minX + floor.maxX) / 2, y: (floor.minY + floor.maxY) / 2 };
            const at = distance === 110 ? middle : tee;
            g.look(at.x, at.y, distance);
            g.step(2);
            const drawn = await g.grass();
            return drawn.near + drawn.far;
          }, zoom);
          most = Math.max(most, blades);
          // grass in view, where the hole leaves any
          expect(blades, `${course} hole ${hole + 1} at zoom ${zoom}: grass there`).toBeGreaterThan(10_000);
          expect(blades, `${course} hole ${hole + 1} at zoom ${zoom}: room to spare`).toBeLessThan(BLADE_ROOM * 0.85);
        }
        // the rough from just outside the rail's corner: on every hole there is grass in view there, and not too much
        const corner = await page.evaluate(async () => {
          const g = window.game!;
          const { floor } = g.content();
          g.look(floor.minX - 12, floor.minY - 12, 62);
          g.step(2);
          const drawn = await g.grass();
          return drawn.near + drawn.far;
        });
        most = Math.max(most, corner);
        expect(corner, `${course} hole ${hole + 1} at the corner: grass there`).toBeGreaterThan(10_000);
        expect(corner, `${course} hole ${hole + 1} at the corner: room to spare`).toBeLessThan(BLADE_ROOM * 0.85);
      }
    }
    console.log(`grass: the most blades drawn in any scene ${most}, of room for ${BLADE_ROOM}`);
    expect(problems).toEqual([]);
  });

  test('grows no blade in the clearing round a rock, on every hole of The Meadow, and grows them right up to its edge', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const holes = COURSES[0].holes;
    let ringed = 0;
    for (const [i, hole] of holes.entries()) {
      const bare = clearings(layoutOf(hole.map, hole.terrain), hole.name);
      await page.evaluate((k) => {
        const g = window.game!;
        g.startHole(k);
        const { floor } = g.content();
        // the whole course in view: every rock is drawn round
        g.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2, 110);
        g.step(2);
      }, i);
      for (const c of bare) {
        // the field is cut in quarter-unit cells, so its edge is true to within one's half diagonal, 0.18
        const inside = await page.evaluate(([x, y, r]) => window.game!.bladesAround(x, y, r - 0.25), [c.x, c.y, c.r]);
        expect(inside, `${hole.name}: blades in the clearing at ${c.x.toFixed(1)},${c.y.toFixed(1)}`).toBe(0);
        // and grass all round it, so it is a clearing and not a place the grass never reached
        const round = await page.evaluate(([x, y, r]) => window.game!.bladesAround(x, y, r + 2.5), [c.x, c.y, c.r]);
        if (round > 0) ringed++;
      }
    }
    expect(ringed, 'grass grows round the clearings that are in view').toBeGreaterThan(10);
    expect(problems).toEqual([]);
  });

  test('sways in the wind: the rough is another picture half a second on, and the same picture at the same moment', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.step(60));
    // a stretch of rough at the side of the home view, clear of the words and the course
    const clip = { x: 880, y: 250, width: 400, height: 300 };
    const shot = async () => PNG.sync.read(await page.screenshot({ clip, animations: 'disabled' }));
    const changed = (a: PNG, b: PNG) => {
      let n = 0;
      for (let i = 0; i < a.data.length; i += 4)
        if (
          Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) >
          12
        )
          n++;
      return n / (clip.width * clip.height);
    };
    const now = await shot();
    // a pixel or two may differ: the blades are appended to the list in whatever order the GPU's threads reach them, so two
    // at the same depth may swap. A clock leaking in would move whole shares of the picture, as half a second of the wind does
    expect(changed(now, await shot()), 'the same moment, the same picture: nothing moves by the clock').toBeLessThan(
      0.002,
    );
    await page.evaluate(() => window.game!.step(30));
    const later = await shot();
    // how hard it blows is the unit tests': this holds that the game's time is what moves it, and that it moves
    expect(changed(now, later), 'the wind moved the grass').toBeGreaterThan(0.2);
    expect(problems).toEqual([]);
  });

  test('keeps its grass and its wind on a page given thirty frames a second, for as long as it is played', async ({
    page,
  }) => {
    // the one test here that runs on the clock, since the clock is what it is about: the governor once took the gap
    // between frames for a slow machine and, at thirty a second, gave up half the grass at four seconds and all of it
    // at twelve
    test.setTimeout(60_000);
    const problems = watch(page);
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      let last = 0;
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          if (t - last < 30) window.requestAnimationFrame(cb);
          else {
            last = t;
            cb(t);
          }
        });
    });
    await start(page, { seed: 1 });
    // 300 frames at thirty a second: long past the point the gap alone stepped the picture down
    await expect.poll(() => page.evaluate(() => window.game!.state().frame), { timeout: 40_000 }).toBeGreaterThan(330);
    const view = await page.evaluate(() => window.game!.view());
    expect(view.rung, 'no slow machine, only a slow screen').toBe(0);
    expect(view.swaying).toBe(true);
    const grass = await page.evaluate(() => window.game!.grass());
    expect(grass.near + grass.far, 'all of the grass').toBeGreaterThan(60_000);
    expect(problems).toEqual([]);
  });

  test('keeps a quarter of the grass swaying on a machine too slow for the drawing, on the last rung', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const drawn = async () => {
      await page.evaluate(() => window.game!.step(1));
      const grass = await page.evaluate(() => window.game!.grass());
      return grass.near + grass.far;
    };
    const full = await drawn();
    // frames that take as long as they are apart are a slow machine, and step the picture down a rung at a time
    expect(await page.evaluate(() => window.game!.judge(1000, 60, 55))).toBe(3);
    // the share, and not only some: a renderer told to draw none reads back the blades of the frame before
    const last = await drawn();
    expect(last / full, 'a quarter of the grass on the last rung').toBeGreaterThan(0.15);
    expect(last / full).toBeLessThan(0.35);
    expect((await page.evaluate(() => window.game!.view())).swaying, 'swaying on the last rung').toBe(true);
    // and the same frames, apart by as much and cheap to draw, leave the picture as it was
    await start(page, { seed: 1, paused: true });
    expect(await page.evaluate(() => window.game!.judge(1000, 33, 2))).toBe(0);
    expect(problems).toEqual([]);
  });
});

test.describe('the edges', () => {
  test('are drawn at four samples a pixel on the top rung, with the post pass a rung down, and plain on the last', async ({
    page,
  }) => {
    const problems = watch(page);
    for (const [rung, antialias] of [
      [0, 'msaa'],
      [1, 'fxaa'],
      [3, 'none'],
    ] as const) {
      await start(page, { rung, seed: 1, paused: true });
      await page.evaluate(() => window.game!.step(1));
      expect((await page.evaluate(() => window.game!.view())).antialias, `rung ${rung}`).toBe(antialias);
    }
    expect(problems).toEqual([]);
  });
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

  test('two fingers spread bring the camera nearer, and never strike the ball', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const before = await page.evaluate(() => window.game!.view().distance);
    await touches(page, [
      [{ id: 1, x: 200, y: 500 }],
      [
        { id: 1, x: 200, y: 500 },
        { id: 2, x: 220, y: 500 },
      ],
      [
        { id: 1, x: 150, y: 500 },
        { id: 2, x: 270, y: 500 },
      ],
      [
        { id: 1, x: 100, y: 500 },
        { id: 2, x: 320, y: 500 },
      ],
      [{ id: 2, x: 320, y: 500 }],
      [],
    ]);
    await page.evaluate(() => window.game!.step(1));
    expect(await page.evaluate(() => window.game!.view().distance)).toBeLessThan(before - 10);
    expect((await page.evaluate(() => window.game!.state())).strokes, 'no shot from a pinch').toBe(0);
    expect(problems).toEqual([]);
  });

  test('a finger drag in Look turns the view and two fingers still zoom it, and none of it strikes the ball', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.locator('#modeLook').tap();
    await expect(page.locator('#modeLook')).toHaveAttribute('aria-pressed', 'true');
    await drag(page, { x: 100, y: 500 }, { x: 300, y: 500 }, { touch: true });
    await page.evaluate(() => window.game!.step(1));
    const turned = await page.evaluate(() => window.game!.view());
    expect(turned.azimuth, 'turned').toBeGreaterThan(0.3);
    const before = turned.distance;
    await touches(page, [
      [{ id: 1, x: 200, y: 500 }],
      [
        { id: 1, x: 200, y: 500 },
        { id: 2, x: 220, y: 500 },
      ],
      [
        { id: 1, x: 100, y: 500 },
        { id: 2, x: 320, y: 500 },
      ],
      [],
    ]);
    await page.evaluate(() => window.game!.step(1));
    const after = await page.evaluate(() => window.game!.view());
    expect(after.distance, 'nearer').toBeLessThan(before - 10);
    expect(after.azimuth, 'and not turned by the pinch').toBeCloseTo(turned.azimuth, 6);
    expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
    expect(problems).toEqual([]);
  });

  test('a second finger landing mid-drag takes the shot back', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const ball = await page.evaluate(() => {
      const b = window.game!.ball();
      return window.game!.project(b.x, b.y, b.z);
    });
    await touches(page, [
      [{ id: 1, ...ball }],
      [{ id: 1, x: ball.x, y: ball.y + 150 }],
      [
        { id: 1, x: ball.x, y: ball.y + 150 },
        { id: 2, x: 60, y: 200 },
      ],
      [{ id: 2, x: 60, y: 200 }],
      [],
    ]);
    expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
    expect(problems).toEqual([]);
  });

  test('on the lowest rung of the quality ladder, asked for, it boots and plays with no errors', async ({ page }) => {
    const problems = watch(page);
    await start(page, { rung: 3, seed: 1, paused: true });
    expect(await page.evaluate(() => window.game!.view())).toMatchObject({ rung: 3, held: true });
    await page.evaluate(() => {
      window.game!.shoot(Math.PI / 2, 0.5);
      window.game!.step(120);
    });
    const grass = await page.evaluate(() => window.game!.grass());
    // a phone's narrow view sees little of the rough, and this is a quarter of that: some grass, and not none
    expect(grass.near + grass.far, 'the grass is not given up on the last rung').toBeGreaterThan(1_000);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('boots, and nothing is wider than the screen: the start screen, the course, the shop, a score and the card', async ({
    page,
  }, info) => {
    const problems = watch(page);
    // a purse fuller than any yet, for the longest numbers it shows
    await start(page, { seed: 11, paused: true, screen: true, save: { coins: 12345, gems: 99 } });
    const beyond: string[] = [];
    /** Whatever on this screen reaches past a side of the phone, or makes the page scroll sideways. */
    const check = async (screen: string) => {
      const r = await read(page);
      expect(r.panels.length, `${screen}: something up`).toBeGreaterThan(0);
      beyond.push(...r.outside.map((o) => `${screen}: ${o}`));
      if (r.scrollWidth > 400) beyond.push(`${screen}: the page scrolls ${r.scrollWidth} wide`);
    };
    await check('the start screen');
    // the hole with the longest name, where the hole's words and the purse come nearest each other at the top
    await page.evaluate(() => {
      const g = window.game!;
      g.chooseCourse('The Meadow');
      const { holes } = g.content();
      g.startHole(holes.reduce((a, h, i) => (h.name.length > holes[a].name.length ? i : a), 0));
      g.step(1);
    });
    // on a phone the hole's words are a chip, with the panel a drawer out of sight
    await expect(page.locator('#holeChip')).toBeVisible();
    await expect(page.locator('#strokes')).toBeHidden();
    // a phone is not given the instruction to drag back
    await expect(page.locator('#help')).toBeHidden();
    await check('the course');
    const hole = (await page.locator('#holeChip').boundingBox())!,
      purse = (await page.locator('#purse').boundingBox())!;
    expect(hole.x + hole.width, "the hole's chip clear of the purse").toBeLessThanOrEqual(purse.x);
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    await page.locator('#shopOpen').click();
    await check('the shop');
    await page.locator('#shopClose').click();
    expect((await holeOut(page)).phase, 'the hole done').toBe('done');
    await check('a hole done');
    expect((await toCard(page)).phase, 'the round over').toBe('over');
    await check('the card');
    expect(beyond).toEqual([]);
    expect(problems).toEqual([]);
  });
});

/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU, with a fresh save each test. What the unit tests cannot reach — the
 * renderer, the keyboard, the frame loop, the page — checked for the things
 * that would make it plainly broken: an error, a black screen, a clock that
 * does not run, a save it cannot boot from again.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { ROLL, powerFor } from '../src/arena';
import { drag, start, touches, watch } from './game';

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
    await expect(page.locator('#start .course')).toHaveCount(2);
    await expect(page.locator('#start .course').first()).toContainText('The Meadow');
    await expect(page.locator('#start .course').first()).toContainText('9 holes');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({ choosing: true, course: 'The Meadow' });
    // nothing is struck through it
    const box = (await page.locator('#view').boundingBox())!;
    await drag(page, { x: box.x + 40, y: box.y + box.height - 60 }, { x: box.x + 40, y: box.y + box.height - 10 });
    expect((await page.evaluate(() => window.game!.state())).strokes, 'no stroke through the start screen').toBe(0);
    await page.locator('#start .course', { hasText: 'The Hills' }).click();
    await expect(page.locator('#start')).toBeHidden();
    await expect(page.locator('#strokes')).toBeVisible();
    await expect(page.locator('#holeName')).toContainText('Hole 1 of 4');
    await expect(page.locator('#holeName')).toContainText('The Hollow');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({
      choosing: false,
      course: 'The Hills',
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
    await page.locator('#start .course', { hasText: 'The Hills' }).click();
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({ course: 'The Hills', hole: 0, card: [] });
    expect(problems).toEqual([]);
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
    // with the green's blades, 51 thousand were drawn near the camera; the rough at the edge of the view is 13 of them
    expect(first.near, 'no green blades near the camera').toBeLessThan(20_000);
    expect(first.far, 'the rough round the course').toBeGreaterThan(1_000);
    expect(first.wind.strength, 'a gentle wind').toBeGreaterThanOrEqual(0.3);
    expect(first.wind.strength).toBeLessThanOrEqual(0.65);
    await page.evaluate(() => {
      window.game!.startHole(1);
      window.game!.step(1);
    });
    const second = await page.evaluate(() => window.game!.grass());
    expect(second.far, 'grown again on the next hole').toBeGreaterThan(1_000);
    expect(second.wind, 'a wind of its own').not.toEqual(first.wind);
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
    expect(grass, 'no grass drawn at all').toMatchObject({ near: 0, far: 0 });
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
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

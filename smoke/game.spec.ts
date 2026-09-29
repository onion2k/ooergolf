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
import { COURSE, COURSES, CUP, DOWNS } from '../src/course';
import { clearings } from '../src/scenery';
import { BLADE_ROOM } from '../src/turf';
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
    await expect(page.locator('#start .course')).toHaveCount(3);
    await expect(page.locator('#start .course').nth(2)).toContainText('The Downs');
    await expect(page.locator('#start .course').nth(2)).toContainText('9 holes');
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

test.describe('The Downs', () => {
  test('is chosen on the start screen, and a hole of it is holed with the ball rising and falling with the ground', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await page.locator('#start .course', { hasText: 'The Downs' }).click();
    await expect(page.locator('#holeName')).toContainText('Hole 1 of 9');
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({
      course: 'The Downs',
      hole: 0,
      choosing: false,
    });
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
    expect(trace.state.card[0]).toBeLessThanOrEqual(DOWNS[0].par);
    const l = layoutOf(DOWNS[0].map, DOWNS[0].terrain);
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

  test('has the whole of every hole in view at the widest zoom, rail and all, on a desktop screen', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await page.evaluate(() => window.game!.chooseCourse('The Downs'));
    const size = page.viewportSize()!;
    for (const [i, hole] of DOWNS.entries()) {
      const corners = await page.evaluate((k) => {
        const g = window.game!;
        g.startHole(k);
        const { floor } = g.content();
        // as far back as the wheel takes it, on the middle of the hole
        g.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2, 110);
        g.step(2);
        // the rail's four corners at the ground and at the top of the highest ground and the rail on it
        return [floor.minX, floor.maxX].flatMap((x) =>
          [floor.minY, floor.maxY].flatMap((y) => [0, 6].map((z) => g.project(x, y, z))),
        );
      }, i);
      for (const c of corners) {
        expect(c.x, `${hole.name}: across`).toBeGreaterThan(0);
        expect(c.x, `${hole.name}: across`).toBeLessThan(size.width);
        expect(c.y, `${hole.name}: down`).toBeGreaterThan(0);
        expect(c.y, `${hole.name}: down`).toBeLessThan(size.height);
      }
    }
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

  test('never runs the renderer out of blades, at the home view, the widest and the closest, on any hole of either course', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    let most = 0;
    for (const course of ['The Meadow', 'The Hills', 'The Downs']) {
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
          expect(blades, `${course} hole ${hole + 1} at zoom ${zoom}: grass there`).toBeGreaterThan(10_000);
          expect(blades, `${course} hole ${hole + 1} at zoom ${zoom}: room to spare`).toBeLessThan(BLADE_ROOM * 0.85);
        }
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
    await expect(page.locator('#strokes')).toBeVisible();
    await expect(page.locator('#help')).toBeVisible();
    await check('the course');
    const hole = (await page.locator('#strokes').boundingBox())!,
      purse = (await page.locator('#purse').boundingBox())!;
    expect(hole.x + hole.width, "the hole's words clear of the purse").toBeLessThanOrEqual(purse.x);
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

/**
 * What the game looks like, held to pictures taken before. Every other check
 * is on what the game does; nothing until now noticed a palette gone muddy,
 * a light lost, or the rail drawn over the grass.
 *
 * Each scene is set through the test API with chance seeded from before the
 * game is built, the game paused, and a fixed number of frames stepped, so
 * the same machine draws the same pixels every run. The pictures are in
 * `smoke/screens/`. They are this machine's GPU: another one will draw them a
 * little differently, so the tolerance is loose and the pictures are not
 * worth arguing with from elsewhere.
 *
 *   npm run look               the scenes against the pictures
 *   npm run look:update        the pictures written again, after a change meant to alter them
 *
 * A failure leaves the picture, what was drawn and the difference in
 * `test-results/`. Look at all three before deciding which is right.
 */
import { expect, test, type Page } from '@playwright/test';
import { layoutOf, slopeAt, TILE } from '../src/arena';
import { COURSE, COURSES, type HoleDef } from '../src/course';
import { LINKS_SPECS, links as linksHoles } from '../src/links';
import { FELLS_SPECS, fells as fellsHoles } from '../src/fells';
import { ISLES_SPECS, isles as islesHoles } from '../src/isles';
import { laneOf } from '../src/golf';
import { holdsBall } from '../src/slopes';
import { breakOf } from '../src/green';

import { AIM_DEAD } from '../src/director';
import { glint } from '../src/glints';
import { LIE } from '../src/surfaces';
import { BOWL, SIDE_HILL } from '../test/hills';
import { STREAM_HOLE } from '../test/stream-hole';
import { wideHole } from '../test/wide-hole';
import { smallHole } from './bighole';
import { drag, landed, puttingHole, start, watch } from './game';
import { openDrawer } from './panels';

/** How far the pictures may differ before it is a change and not the GPU: a fiftieth of the pixels, each well off. */
const TOLERANCE = { maxDiffPixelRatio: 0.002, threshold: 0.02 };

/** The corner that counts the milliseconds a frame takes is different every run, and says nothing about the look. */
async function hideStats(page: Page) {
  await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
}

/**
 * A round of two holes, the second of which the field of grass will not cover, begun at it: the page stopped on the boot
 * screen, which says which hole and why, over the first hole's picture that it was left showing. Settled for the screen's
 * fade, which a picture waits on.
 */
async function stopped(page: Page) {
  await page.evaluate(
    ([first, second]) => {
      const g = window.game!;
      g.playCourse([{ ...first, terrain: Float32Array.from(first.terrain) }, second]);
      g.step(60);
      g.startHole(1);
    },
    [smallHole(), wideHole()] as const,
  );
  await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
}

/** Pressed on the ball and pulled back down the page by `share` of a full drag, and held there. */
async function aim(page: Page, share: number, across = 0) {
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
  await drag(page, at, { x: at.x + across, y: at.y + share * 0.35 * short }, { hold: true });
  await page.evaluate(() => window.game!.step(1));
}

/**
 * A golf shot aimed as a player aims it from the aim view, where the ball sits low on the page: pressed high up it and
 * pulled down by `share` of a full drag, held, and the preview of it worked out for the frame.
 */
async function pullDown(page: Page, share: number, across = 0, touch = false) {
  const size = page.viewportSize()!;
  const short = Math.min(size.width, size.height);
  const from = { x: size.width / 2, y: size.height * 0.15 };
  await drag(page, from, { x: from.x + across, y: from.y + share * 0.35 * short }, { hold: true, touch });
  await page.evaluate(() => window.game!.step(2));
  // a drag held that aims nothing is said for what it is, with what was under the finger, and not left to fail later as a
  // preview that is not there: the phone's drive once missed so one run in four, and once in four hundred after that
  const missed = await page.evaluate(({ x, y }) => {
    if (window.game!.aiming()) return null;
    const e = document.elementFromPoint(x, y) as HTMLElement | null;
    const s = window.game!.state();
    return `under the finger ${e?.tagName}#${e?.id || e?.closest('[id]')?.id}, ready ${s.ready}, choosing ${s.choosing}, mode ${window.game!.view().mode}`;
  }, from);
  expect(missed, 'the drag aimed a shot').toBeNull();
}

/**
 * A clip of the page 360 by 240 round the place on the ground at (x, y), a little more of it below: a ring or a knock is a
 * small part of a frame, too small for a picture of the whole of it to notice if it went.
 */
async function around(page: Page, x: number, y: number) {
  const p = await page.evaluate(([x, y]) => window.game!.project(x, y, window.game!.ball().z), [x, y] as const);
  const size = page.viewportSize()!;
  return {
    x: Math.max(0, Math.min(size.width - 360, Math.round(p.x - 180))),
    y: Math.max(0, Math.min(size.height - 240, Math.round(p.y - 90))),
    width: 360,
    height: 240,
  };
}

/** The index of the longest hole of The Links, the one the overhead view has the most to fit. */
const LONGEST_LINKS = LINKS_SPECS.reduce((best, spec, k) => (spec.length > LINKS_SPECS[best].length ? k : best), 0);

/** The overhead view switched on and given the time to blend all the way up, as the button does. */
async function fromAbove(page: Page) {
  await page.evaluate(() => {
    window.game!.overhead(true);
    window.game!.step(240);
  });
  await hideStats(page);
}

/** The whole round played by the autopilot's shots, to the card. */
async function playRound(page: Page) {
  await page.evaluate(() => {
    const g = window.game!;
    for (let s = 0; s < 40 && g.state().phase !== 'over'; s++) {
      const shot = g.suggest();
      if (shot) g.shoot(shot.angle, shot.power);
      for (let f = 0; f < 900 && g.state().phase !== 'over' && !g.state().ready; f += 10) g.step(10);
    }
  });
}

test.describe('what it looks like', () => {
  test('ground that slopes: a hill with sand on its side and a post on it, a hollow, and a raised step by water', async ({
    page,
  }) => {
    // not on a course: sand and a post on a hillside and a step by water, which no hole has, so they are pictured here
    const SLOPES: HoleDef = {
      name: 'Slopes',
      par: 3,
      map: [
        '###########',
        '#.........#',
        '#....C....#',
        '#.........#',
        '#.........#',
        '#.........#',
        '#.........#',
        '#....ss...#',
        '#....ss...#',
        '#.........#',
        '#......o..#',
        '#.........#',
        '#~~.......#',
        '#~~..11...#',
        '#....11...#',
        '#....T....#',
        '###########',
      ],
      terrain: [
        '22222222222',
        '22222222222',
        '22222222222',
        '22222222222',
        '22222222222',
        '22222222222',
        '11111122221',
        '00000123321',
        '00000124421',
        '00000123321',
        '00000012210',
        '00000001100',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
      ],
    };
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((hole) => {
      const g = window.game!;
      g.playCourse([hole]);
      g.step(1);
      const { floor } = g.content();
      g.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 14, 70);
      g.step(1);
    }, SLOPES);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('slopes.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the first hole, with the ball on the tee', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('course.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the fly-in to the first hole of The Meadow: low behind the tee, the hills, the forest and the sky past it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, flyIn: true });
    await page.evaluate(() => window.game!.step(3));
    expect((await page.evaluate(() => window.game!.view())).flying).toBe(true);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('flyin-meadow.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test("the fly-in to The Links' first hole: the woods round it, the hills, the lake, the mountains and the clouds", async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, flyIn: true });
    await page.evaluate(() => {
      window.game!.chooseCourse('The Links');
      window.game!.step(3);
    });
    expect((await page.evaluate(() => window.game!.view())).flying).toBe(true);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('flyin-links.png', TOLERANCE);
    // and halfway down to the view a shot is played from
    await page.evaluate(() => window.game!.step(80));
    await expect(page.locator('#view')).toHaveScreenshot('flyin-links-mid.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // Stands beside `r5-pond.png` of `~/.claude/plans/ooergolf-title-look-two-evidence/`. The ring is scenery in the water's own tiles,
  // so the ball meets none of it (the stones the ball bounced off went on 9 October 2026, and their picture, `pond-stones`, with them).
  test("The Meadow's Pond with its ring of stones: the smooth shape of its water, the shelf at its corners and the bank", async ({
    page,
  }) => {
    const problems = watch(page);
    // the middle of the pond's water tiles, worked out from the map here and not asked of the page
    const pond = COURSES.flatMap((c) => c.holes).find((h) => h.name === 'Pond')!;
    const l = layoutOf(pond.map, pond.terrain);
    let n = 0,
      mx = 0,
      my = 0;
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.water[t]) {
        n++;
        mx += l.originX + ((t % l.cols) + 0.5) * TILE;
        my += l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
      }
    await start(page, { seed: 11, paused: true });
    await page.evaluate(
      ([x, y]) => {
        const g = window.game!;
        g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
        g.step(90);
        g.look(x, y - 10, 34);
        g.step(1);
      },
      [mx / n, my / n],
    );
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('pond-ring.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('aiming: the dots from the ball, from a soft putt to the hardest shot', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await aim(page, 0.85, -60);
    expect(await page.evaluate(() => window.game!.aiming()), 'a shot is being aimed').not.toBe(null);
    await expect(page.locator('#view')).toHaveScreenshot('aim.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the dog-leg, from its tee', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      window.game!.startHole(1);
      window.game!.step(60);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('dog-leg.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // by name, so a hole added to the course does not move the others' pictures
  for (const [course, name, file] of [
    ['The Meadow', 'The Bunker', 'bunker.png'],
    ['The Meadow', 'Pond', 'pond.png'],
    ['The Meadow', 'Barriers', 'barriers.png'],
    ['The Meadow', 'Bumpers', 'bumpers.png'],
    ['The Meadow', 'Up and Over', 'up-and-over.png'],
    ['The Meadow', 'Windmill', 'windmill.png'],
    ['The Meadow', 'The Mill Race', 'mill-race.png'],
    ['The Pinball Shed', 'Corner Pocket', 'shed-1.png'],
    ['The Pinball Shed', 'Half-pipe', 'shed-2.png'],
    ['The Pinball Shed', 'The Kicker', 'shed-3.png'],
    ['The Pinball Shed', 'Three Cushion', 'shed-4.png'],
    ['The Pinball Shed', 'Dodgems', 'shed-5.png'],
    ['The Pinball Shed', 'Flipper Alley', 'shed-6.png'],
    ['The Pinball Shed', 'The Bowl Pit', 'shed-7.png'],
    ['The Pinball Shed', 'Shooting Gallery', 'shed-8.png'],
    ['The Pinball Shed', 'Multiball', 'shed-9.png'],
    ['The Waterworks', 'The Causeway', 'waterworks-1.png'],
    ['The Waterworks', 'The Stepping Stones', 'waterworks-2.png'],
    ['The Waterworks', 'Traffic', 'waterworks-3.png'],
    ['The Waterworks', 'The Spillway', 'waterworks-4.png'],
    ['The Waterworks', 'Ferris', 'waterworks-5.png'],
    ['The Waterworks', 'The Weir', 'waterworks-6.png'],
    ['The Waterworks', 'The Rapids', 'waterworks-7.png'],
    ['The Waterworks', 'The Big Wheel', 'waterworks-8.png'],
    ['The Waterworks', 'The Flood', 'waterworks-9.png'],
  ] as const) {
    test(`${name}, from its tee`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(
        ([course, hole]) => {
          window.game!.chooseCourse(course);
          window.game!.startHole(window.game!.content().holes.findIndex((h) => h.name === hole));
          // the moving things caught part way through, and the camera still: the whole hole in view
          window.game!.step(75);
          const { floor } = window.game!.content();
          window.game!.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 14, 70);
          window.game!.step(1);
        },
        [course, name] as const,
      );
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(file, TOLERANCE);
      expect(problems).toEqual([]);
    });
  }

  test('a glint on the gold of the cup, close to', async ({ page }) => {
    const problems = watch(page);
    // the first moment a place on the rim is at the height of its glint
    let t = 0;
    for (let f = 0; f < 60 * 60; f++) {
      const g = glint(f / 60, 5);
      if (g.at < 4 && g.brightness > 0.95) {
        t = f;
        break;
      }
    }
    await start(page, { seed: 11, paused: true });
    await page.evaluate((frames) => {
      const g = window.game!;
      const { cup } = g.content();
      g.look(cup.x, cup.y - 12, 30);
      g.step(frames);
    }, t);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('glint.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the long grass, close to: blades a unit and a half tall in the wind, flowers standing out of it and rocks on bare ground, and the same a moment on', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      const { floor } = g.content();
      g.step(60);
      // the rough beside the rail at the cup's end, where a bed of flowers and a pair of rocks stand
      g.look(floor.minX - 7, (floor.minY + floor.maxY) / 2 + 6, 24);
      g.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('grass.png', TOLERANCE);
    // half a second of game time on: the same place, the grass bent another way, and the gust gone further downwind
    await page.evaluate(() => window.game!.step(30));
    await expect(page.locator('#view')).toHaveScreenshot('grass-later.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  /** The middle of the first hole's pond, by name, in world units. */
  const pondOf = (name: string) => {
    const hole = COURSE.find((h) => h.name === name)!;
    const l = layoutOf(hole.map);
    let x = 0,
      y = 0,
      n = 0;
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.water[t]) {
        x += l.originX + ((t % l.cols) + 0.5) * 3;
        y += l.originY + (Math.floor(t / l.cols) + 0.5) * 3;
        n++;
      }
    return { x: x / n, y: y / n };
  };

  test('the water, close to: sunk below the grass in its earth, foam and bands, open water in its finer waves, the sky mirrored and the glitter on the crests, with no rings on it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const at = pondOf('Pond');
    await page.evaluate((c) => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
      g.step(90);
      g.look(c.x, c.y - 6, 22);
      g.step(1);
    }, at);
    expect((await page.evaluate(() => window.game!.motions())).sparkles, 'no sparkle over the waves').toBe(0);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('water.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a ball splashing into the pond, a third of a second after: the water thrown up, and no ring on the waves', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const at = pondOf('Pond');
    await page.evaluate((c) => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
      g.step(30);
      g.shoot(Math.PI / 2 + 0.25, 0.45);
      for (let f = 0; f < 600 && g.state().strokes < 2; f++) g.step(1);
      g.step(20);
      g.look(c.x, c.y - 4, 24);
      g.step(1);
    }, at);
    expect((await page.evaluate(() => window.game!.motions())).splash, 'no ring on open water').toBe(0);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('splash.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the water moves on the game’s clock alone: the same time is the same bytes, a second on is not, and only the water changes', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const at = pondOf('Pond');
    await page.evaluate((c) => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
      g.step(90);
      g.look(c.x, c.y - 6, 22);
      g.step(1);
    }, at);
    await hideStats(page);
    // the middle of the pond, and a tile of the green beside it, a few pixels either side of the point where each lies
    const spots = await page.evaluate((c) => {
      const g = window.game!;
      return { water: g.project(c.x, c.y, -0.3), green: g.project(c.x + 9, c.y, 0) };
    }, at);
    const crop = (p: { x: number; y: number }) => ({
      x: Math.round(p.x) - 16,
      y: Math.round(p.y) - 16,
      width: 32,
      height: 32,
    });
    const look = async () => ({
      water: await page.screenshot({ clip: crop(spots.water), scale: 'css' }),
      green: await page.screenshot({ clip: crop(spots.green), scale: 'css' }),
    });
    // the crops are of the canvas alone: the grass's blades are drawn in no fixed order on the GPU and two pixels of a whole
    // frame differ between two shots of the same moment, which is the grass's and not the water's
    // the panels arrive with a spring in wall-clock time, which is the page's and not the game's: let them land
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
    const first = await look();
    // paused, the same game time again: nothing may have moved, not the ripple and not a wall-clock of any kind
    const again = await look();
    expect(again.water.equals(first.water), 'the water at the same moment drawn twice is the same bytes').toBe(true);
    expect(again.green.equals(first.green), 'and so is the green').toBe(true);
    // a second of the game's time on, a pond rippling is another picture and a green is the same one
    await page.evaluate(() => window.game!.step(60));
    const later = await look();
    // pixels that moved by more than `over` levels of a channel: the GPU may leave a pixel one level out between two draws on
    // the grass, so the green is held to a few levels. The water is the title's calm one (9 October 2026: a pond of waves that
    // turn the normal by 0.3 and a little light glinting on them), which moves by up to four levels of a channel and not the
    // hundred and more the livelier water did; the same water drawn twice at one moment is the same bytes (above), so any
    // level it moves by is the water's own
    const moved = async (a: Buffer, b: Buffer, over: number) => {
      const { PNG } = await import('pngjs');
      const [p, q] = [PNG.sync.read(a).data, PNG.sync.read(b).data];
      let n = 0;
      for (let i = 0; i < p.length; i += 4)
        if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > over) n++;
      return n;
    };
    expect(await moved(first.water, later.water, 0), 'the water a second on is not the water it was').toBeGreaterThan(
      100,
    );
    expect(await moved(first.green, later.green, 3), 'the green beside it is just as it was').toBe(0);
    expect(problems).toEqual([]);
  });

  test('the sand, close to: raked in stripes, its lip lit on the outside and shaded within', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'The Bunker'));
      g.step(90);
      const { sand } = g.content();
      const x = sand.reduce((a, s) => a + s.x, 0) / sand.length,
        y = sand.reduce((a, s) => a + s.y, 0) / sand.length;
      g.look(x, y - 6, 22);
      g.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('sand.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the view turned: the first hole from its side, and from behind and low', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    // a quarter turn round to the side, a little lower than it begins
    await page.evaluate(() => {
      window.game!.orbit(-Math.PI / 2, 0.12);
      window.game!.step(1);
    });
    await expect(page.locator('#view')).toHaveScreenshot('orbit-side.png', TOLERANCE);
    // right round to look back down the course, and as low as it goes
    await page.evaluate(() => {
      window.game!.orbit(-Math.PI / 2, 1);
      window.game!.step(1);
    });
    expect((await page.evaluate(() => window.game!.view())).tilt, 'as low as it goes').toBe(1);
    await expect(page.locator('#view')).toHaveScreenshot('orbit-behind.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the overhead view: the whole of the first hole from straight above, with the Overhead button pressed', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await fromAbove(page);
    await expect(page).toHaveScreenshot('overhead-meadow.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a cup on a side-hill, close to: its collar and rim lying on the slope, its floor level', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((hole) => {
      const g = window.game!;
      g.playCourse([hole]);
      g.step(1);
      const { cup } = g.content();
      g.look(cup.x, cup.y - 10, 22);
      g.step(1);
    }, SIDE_HILL);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('side-hill-cup.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a hole done: its score over the course', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      // the camera follows the ball to the cup, as it does for one stroke in five: the picture is of the confetti over the cup
      g.followShots('always');
      for (let s = 0; s < 6 && g.state().phase === 'play'; s++) {
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 720 && g.state().phase === 'play' && !g.state().ready; f += 1) g.step(1);
      }
      // the confetti up in the air over the cup: a frame at a time, since the particles move only as they are drawn
      for (let f = 0; f < 24; f++) g.step(1);
    });
    await hideStats(page);
    await expect(page).toHaveScreenshot('holed.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the card, at the end of the round', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await playRound(page);
    await hideStats(page);
    await expect(page).toHaveScreenshot('card.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  /** A save that owns three of each kind of thing, wears one of each, and has coins for some of the rest. */
  const SHOPPER = {
    coins: 130,
    gems: 1,
    owned: ['mallet', 'bender', 'clay', 'marble', 'comet', 'pennant'],
    kit: { club: 'mallet', ball: 'clay', accessory: 'comet' },
  };

  test('the shop’s clubs aisle, a mallet worn, another owned and the rest for sale', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: SHOPPER });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await landed(page);
    await page.locator('#shopOpen').click();
    await page.evaluate(() => window.game!.shopTab('club'));
    await expect(page).toHaveScreenshot('shop-clubs.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the shop’s balls aisle, each ball’s look in its swatch, a clay ball worn and a note that a new ball waits for the next hole', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: SHOPPER });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await landed(page);
    await page.locator('#shopOpen').click();
    await page.evaluate(() => window.game!.shopTab('ball'));
    // the list scrolled to the clay ball worn, so the row marked Equipped is in the picture
    await page.locator('[data-item=clay]').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.game!.step(2));
    await expect(page).toHaveScreenshot('shop-balls.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the start screen, over the first hole, a card for each course', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await page.evaluate(() => window.game!.step(1));
    await hideStats(page);
    await expect(page).toHaveScreenshot('start.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the page stopped on a hole that cannot be drawn: the boot screen again, saying which hole and why', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await stopped(page);
    await expect(page).toHaveScreenshot('stopped.png', TOLERANCE);
    // told once to the console, which is where it is looked for
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('could not be drawn');
  });

  // golf, on The Links: nine holes made by the generator, each seen from its tee, some of their greens, the stakes at the
  // line of out of bounds, and a drive that has met a tree
  test.describe('golf, on The Links', () => {
    async function links(page: Page, hole: number) {
      await start(page, { seed: 11, paused: true });
      await page.evaluate((k) => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(k);
        window.game!.step(75);
      }, hole);
      await hideStats(page);
    }

    /** The middle of the pond of Water Carry, The Links' second hole, in world units. */
    const linksPond = () => {
      const l = layoutOf(linksHoles()[1].map, linksHoles()[1].terrain);
      let x = 0,
        y = 0,
        n = 0;
      for (let t = 0; t < l.cols * l.rows; t++)
        if (l.water[t]) {
          x += l.originX + ((t % l.cols) + 0.5) * 3;
          y += l.originY + (Math.floor(t / l.cols) + 0.5) * 3;
          n++;
        }
      return { x: x / n, y: y / n };
    };

    test('open water, close to: the pond of Water Carry in its waves, the sky mirrored and the glitter on the crests, with no rings on it', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 1);
      const at = linksPond();
      await page.evaluate((c) => {
        window.game!.look(c.x, c.y - 14, 40);
        window.game!.step(1);
      }, at);
      expect((await page.evaluate(() => window.game!.motions())).splash, 'no ring on open water').toBe(0);
      await expect(page.locator('#view')).toHaveScreenshot('golf-water.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('open water, from the side and low: the same pond with the camera turned, so the glitter has moved with it', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 1);
      const at = linksPond();
      await page.evaluate((c) => {
        const g = window.game!;
        g.look(c.x, c.y - 14, 40);
        g.orbit(-Math.PI / 2, 0.7);
        g.step(1);
      }, at);
      await expect(page.locator('#view')).toHaveScreenshot('golf-water-orbit.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    for (const [k, spec] of LINKS_SPECS.entries()) {
      test(`${spec.name}, hole ${k + 1} of The Links, from its tee`, async ({ page }) => {
        const problems = watch(page);
        await links(page, k);
        await expect(page).toHaveScreenshot(`links-tee-${k + 1}.png`, TOLERANCE);
        expect(problems).toEqual([]);
      });
    }

    // the greens of the holes with water beside them, from short of them, where the bunkers and the pond are in view
    for (const k of [1, 4, 5]) {
      test(`the green of ${LINKS_SPECS[k].name}, from short of it`, async ({ page }) => {
        const problems = watch(page);
        await links(page, k);
        await page.evaluate(() => {
          const { cup } = window.game!.content();
          window.game!.look(cup.x, cup.y - 22, 78);
          window.game!.step(1);
        });
        await expect(page.locator('#view')).toHaveScreenshot(`links-green-${k + 1}.png`, TOLERANCE);
        expect(problems).toEqual([]);
      });
    }

    // the shot aimed: the camera stands back for the club, the flight is drawn before it is taken, and the pin and the map say where
    test('a full drive aimed at Long Bend: the arc, the ring and the spread a swing may miss by, the pin and the map', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 2);
      await pullDown(page, 1);
      const shot = await page.evaluate(() => window.game!.motions().shot);
      expect(shot?.end).toBe('landed');
      await hideStats(page);
      await expect(page).toHaveScreenshot('links-aim-driver.png', TOLERANCE);
      // and the ring and the spread close to, since they are a small part of the frame and the picture of it all would not miss them
      const clip = await around(page, shot!.ring!.x, shot!.ring!.y);
      await expect(page).toHaveScreenshot('links-aim-ring.png', { ...TOLERANCE, clip });
      expect(problems).toEqual([]);
    });

    test("the overhead view of the longest hole of The Links: the whole of it from above, tee to green, the hole's bounds on the screen", async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, LONGEST_LINKS);
      await fromAbove(page);
      await expect(page).toHaveScreenshot('overhead-links.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive aimed thirty degrees off the hole with the drag held: the camera has turned toward the way it goes, keeping the aim on the edge of its dead zone, the arc and the ring ahead of it', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 0);
      // across by 395 pixels over a pull of 224 down: through a camera tipped back that is thirty degrees off the line of the
      // hole on the ground (the screen's angle is not the ground's, the ground ahead being stretched by the tilt)
      await pullDown(page, 0.8, 395);
      await page.evaluate(() => window.game!.step(180));
      const turned = await page.evaluate(() => window.game!.view());
      // the camera turns only as far as keeps the aim on the dead zone's edge, so the shot is seen from nearly behind
      expect(Math.abs(turned.azimuth), 'turned by about thirty degrees less the dead zone').toBeGreaterThan(
        0.47 - AIM_DEAD.half,
      );
      expect(Math.abs(turned.azimuth)).toBeLessThan(0.57 - AIM_DEAD.half);
      expect(turned.azimuth).toBeCloseTo(turned.heading, 6);
      await hideStats(page);
      await expect(page).toHaveScreenshot('aim-turned.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive in the air with the camera holding the aim view, and not following: the ball flying across the view the shot was aimed from', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 0);
      await page.evaluate(() => {
        const g = window.game!;
        g.followShots('never');
        g.shoot(Math.PI / 2, 1, 'driver');
        // half a second in, the ball high and on its way and still in the inner part of the safe box, where a held camera
        // has not moved at all; from frame 32 it is past `HAND_OVER.from` and the camera begins to be taken up
        g.step(30);
      });
      expect((await page.evaluate(() => window.game!.view())).following, 'held, not following').toBe(false);
      await hideStats(page);
      await expect(page).toHaveScreenshot('hold-mid-drive.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a five iron aimed at the green of Water Carry: the camera in for the shorter club, the ring by the green', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 1);
      await page.locator('#bagClubs button[data-club="5-iron"]').click();
      await page.evaluate(() => window.game!.step(300));
      await pullDown(page, 0.93);
      expect((await page.evaluate(() => window.game!.motions().shot))?.end).toBe('landed');
      await hideStats(page);
      await expect(page).toHaveScreenshot('links-aim-iron.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive aimed into a tree: the arc meets the canopy and the place it knocks the ball is marked in red', async ({
      page,
    }) => {
      const problems = watch(page);
      const cols = 41,
        rows = 130;
      const map = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (r === rows - 4) return c === 20 ? 'T' : c === 19 || c === 21 ? 't' : 'f';
          if (r === rows - 4 - 36 && c === 20) return '^';
          if (r === 2 && c === 3) return 'C';
          return 'f';
        }).join(''),
      );
      await start(page, { seed: 11, paused: true });
      await page.evaluate((m) => {
        const g = window.game!;
        g.playCourse([{ name: 'A tree', par: 4, map: m }]);
        g.step(300);
      }, map);
      await pullDown(page, 1);
      const shot = await page.evaluate(() => window.game!.motions().shot);
      expect(shot?.knock).not.toBeNull();
      await hideStats(page);
      await expect(page).toHaveScreenshot('links-aim-tree.png', TOLERANCE);
      const clip = await around(page, shot!.knock!.x, shot!.knock!.y);
      await expect(page).toHaveScreenshot('links-aim-knock.png', { ...TOLERANCE, clip });
      expect(problems).toEqual([]);
    });

    test('a ball lying in the rough: the grass pressed flat round it so it is seen, and standing tall beyond, the plain bare past the stakes', async ({
      page,
    }) => {
      const problems = watch(page);
      const cols = 61,
        rows = 130;
      // a fairway down the middle, rough either side, out of bounds beyond that, and rock beyond that, inside the rail
      const map = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (c <= 5 || c >= cols - 6) return ' ';
          if (c <= 11 || c >= cols - 12) return 'x';
          if (r === rows - 4) return c === 30 ? 'T' : c === 29 || c === 31 ? 't' : 'f';
          if (r === 2 && c === 30) return 'C';
          return c >= 25 && c <= 35 ? 'f' : 'r';
        }).join(''),
      );
      await start(page, { seed: 11, paused: true });
      const lie = await page.evaluate((m) => {
        const g = window.game!;
        g.playCourse([{ name: 'A lie in the rough', par: 4, map: m }]);
        g.step(120);
        // the middle of the rough beside the fairway, thirty tiles up from the tee
        const x = -91.5 + (22 + 0.5) * 3,
          y = -195 + (130 - 1 - 90 + 0.5) * 3;
        g.lay(x, y);
        for (let k = 0; k < 10; k++) g.step(1);
        // a few frames one at a time, so the press is the frame's own and the grass has bent to it
        g.look(x, y - 6, 24);
        for (let k = 0; k < 6; k++) g.step(1);
        return { x, y };
      }, map);
      expect(await page.evaluate(() => window.game!.motions().press), 'pressed').not.toBeNull();
      const clip = await around(page, lie.x, lie.y);
      await hideStats(page);
      await expect(page).toHaveScreenshot('rough-lie.png', { ...TOLERANCE, clip });
      expect(problems).toEqual([]);
    });

    test('the line of out of bounds, close to: white stakes on the ground’s edge, the dry grass beyond, the rough within', async ({
      page,
    }) => {
      const problems = watch(page);
      await links(page, 0);
      await page.evaluate(() => {
        const { tee } = window.game!.content();
        window.game!.look(tee.x - 34, tee.y + 46, 46);
        window.game!.step(1);
      });
      await expect(page.locator('#view')).toHaveScreenshot('links-oob.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive that has met a tree, the frame it is knocked: the canopy, the ball against it', async ({ page }) => {
      const problems = watch(page);
      const cols = 41,
        rows = 130;
      const map = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
          if (r === rows - 4) return c === 20 ? 'T' : c === 19 || c === 21 ? 't' : 'f';
          if (r === rows - 4 - 36 && c === 20) return '^';
          if (r === 2 && c === 3) return 'C';
          return 'f';
        }).join(''),
      );
      await start(page, { seed: 11, paused: true });
      await page.evaluate((m) => {
        const g = window.game!;
        g.playCourse([{ name: 'A tree', par: 4, map: m }]);
        g.step(75);
        const { trees } = g.content();
        g.lay(trees[0].x, trees[0].y - 30);
        g.step(60);
        g.shoot(Math.PI / 2, 1, 'driver');
        // to the frame the canopy first turned it, and no further
        for (let f = 0; f < 200; f++) {
          g.step(1);
          if (g.events().some((e) => e.startsWith('knocked'))) break;
        }
        g.look(trees[0].x, trees[0].y - 14, 40);
        g.step(1);
      }, map);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('links-tree.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });

  // golf, on The Fells and The Isles: each hole from its tee, and the three things the courses are for, seen from where a
  // player stands: the wood and its lane, an island green from its approach, and a ball on a bank that runs
  test.describe('golf, on The Fells and The Isles', () => {
    async function hole(page: Page, course: string, k: number) {
      await start(page, { seed: 11, paused: true });
      await page.evaluate(
        ([c, k]) => {
          window.game!.chooseCourse(c as string);
          window.game!.startHole(k as number);
          window.game!.step(75);
        },
        [course, k],
      );
      await hideStats(page);
    }

    for (const [course, key, specs] of [
      ['The Fells', 'fells', FELLS_SPECS],
      ['The Isles', 'isles', ISLES_SPECS],
    ] as const) {
      for (const [k, spec] of specs.entries()) {
        test(`${spec.name}, hole ${k + 1} of ${course}, from its tee`, async ({ page }) => {
          const problems = watch(page);
          await hole(page, course, k);
          await expect(page).toHaveScreenshot(`${key}-tee-${k + 1}.png`, TOLERANCE);
          expect(problems).toEqual([]);
        });
      }
    }

    test("The Pinewood's lane from the tee: a low, close view down the gap in the wood", async ({ page }) => {
      const problems = watch(page);
      await hole(page, 'The Fells', 1);
      const lane = laneOf(fellsHoles()[1])!;
      expect(lane, 'the hole has a lane').toBeTruthy();
      await page.evaluate((lane) => {
        const g = window.game!;
        const dx = lane.to.x - lane.from.x,
          dy = lane.to.y - lane.from.y,
          d = Math.hypot(dx, dy);
        // stood on the tee looking along the lane, low, with the camera's target a little way down it
        g.look(lane.from.x + (dx / d) * 190, lane.from.y + (dy / d) * 190, 70);
        g.orbit(Math.atan2(dx, dy), 0.35);
        g.step(2);
      }, lane);
      await expect(page.locator('#view')).toHaveScreenshot('fells-lane.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('The Green Isle from its approach, sixty yards out: the island green in its lake', async ({ page }) => {
      const problems = watch(page);
      await hole(page, 'The Isles', 1);
      const def = islesHoles()[1];
      const l = layoutOf(def.map, def.terrain);
      const at = await page.evaluate(() => window.game!.content().cup);
      // the nearest dry ground a ball is played from, sixty yards short of the cup along the way from the tee
      let best = { x: 0, y: 0, d: Infinity };
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.water[t] || l.solid[t] || l.oob[t] || l.lie[t] !== LIE.fairway) continue;
        const x = l.originX + ((t % l.cols) + 0.5) * TILE,
          y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
        if (y > at.y - 40) continue;
        const d = Math.abs(Math.hypot(x - at.x, y - at.y) - 60);
        if (d < best.d) best = { x, y, d };
      }
      expect(best.d, 'dry fairway about sixty yards out').toBeLessThan(3);
      await page.evaluate((b) => {
        const g = window.game!;
        g.lay(b.x, b.y);
        g.step(150);
      }, best);
      await expect(page).toHaveScreenshot('isles-green-approach.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a ball laid on a bank of The Plunge that runs, from the side and low: the slope in profile', async ({
      page,
    }) => {
      const problems = watch(page);
      await hole(page, 'The Fells', 4);
      const def = fellsHoles()[4];
      const l = layoutOf(def.map, def.terrain);
      // the steepest tile of running fairway, so a ball laid there has a bank under it
      let best = { x: 0, y: 0, sx: 0, sy: 0, s: 0 };
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.lie[t] !== LIE.fairway || holdsBall(l, t, def.greens)) continue;
        const x = l.originX + ((t % l.cols) + 0.5) * TILE,
          y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
        const [sx, sy] = slopeAt(l, x, y);
        const s = Math.hypot(sx, sy);
        if (s > best.s) best = { x, y, sx, sy, s };
      }
      expect(best.s, 'a bank that runs').toBeGreaterThan(0.2);
      await page.evaluate((b) => {
        const g = window.game!;
        g.lay(b.x, b.y);
        const at = g.ball();
        // looking along the contour so the fall of the ground is across the picture
        g.look(at.x, at.y, 26);
        g.orbit(Math.atan2(-b.sy, b.sx), 10);
        g.step(1);
      }, best);
      await expect(page.locator('#view')).toHaveScreenshot('fells-bank.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });

  test.describe('what answers what happens, at a fixed frame of each', () => {
    test('the ball squashed against the rail the frame it is knocked, close to', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const squash = await page.evaluate(() => {
        const g = window.game!;
        g.step(30);
        const { tee } = g.content();
        // from the tee across the first hole at its rail, as hard as there is: the rail's face is seven units off
        g.look(tee.x + 6, tee.y - 9, 18);
        g.events();
        g.shoot(0, 1);
        for (let f = 0; f < 60; f++) {
          g.step(1);
          if (g.events().some((e) => e.startsWith('knocked'))) return g.motions().squash;
        }
        return 0;
      });
      expect(squash, 'squashed as deep as a knock does').toBeGreaterThan(0.25);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('knock.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    /** A gentle putt holed on the first hole, and `frames` more a frame at a time, close to the cup; the motions then. */
    const holedAndOn = (page: Page, frames: number) =>
      page.evaluate((frames) => {
        const g = window.game!;
        const { cup } = g.content();
        g.place(g.bodies('ball')[0].slot, cup.x, cup.y - 4, 1);
        g.step(30);
        g.look(cup.x, cup.y - 12, 30);
        g.shoot(Math.PI / 2, 0.08);
        for (let f = 0; f < 240 && g.state().phase === 'play'; f++) g.step(1);
        for (let f = 0; f < frames; f++) g.step(1);
        return g.motions();
      }, frames);

    test('the gold flashing as the ball drops, close to', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const now = await holedAndOn(page, 2);
      expect(now.flash, 'bright').toBeGreaterThan(0.7);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('cup-flash.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the flag waggling as the ball drops, close to', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      // a quarter of a second on, swung toward the camera, where the flash's picture has it swung away
      const now = await holedAndOn(page, 15);
      expect(now.waggle, 'swung well off the wind').toBeLessThan(-0.2);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('flag-waggle.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test("the aim's dots pulsing, a moment after the aim's own picture", async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await hideStats(page);
      await aim(page, 0.85, -60);
      await page.evaluate(() => window.game!.step(16));
      expect((await page.evaluate(() => window.game!.motions())).pulse, 'a dot swollen').not.toBe(0);
      await expect(page.locator('#view')).toHaveScreenshot('aim-pulse.png', TOLERANCE);
      await page.mouse.up();
      expect(problems).toEqual([]);
    });

    test('the camera part way through its glide to the next hole, from where it was looking', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      const glide = await page.evaluate(() => {
        const g = window.game!;
        g.step(60);
        g.startHole(1);
        g.step(20);
        return g.motions().glide;
      });
      expect(glide, 'still gliding').toBeGreaterThan(3);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('glide.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test("the fly-in to The Links' first hole on a phone held upright", async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, flyIn: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.step(3);
      });
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot('phone-flyin-links.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the course, upright, with the words over it', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await expect(page).toHaveScreenshot('phone.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the overhead view, on a phone: the first hole of The Meadow from above, and the longest of The Links', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await fromAbove(page);
      await expect(page).toHaveScreenshot('phone-overhead-meadow.png', TOLERANCE);
      await page.evaluate((k) => {
        const g = window.game!;
        g.overhead(false);
        g.chooseCourse('The Links');
        g.startHole(k);
        g.step(75);
      }, LONGEST_LINKS);
      await fromAbove(page);
      await expect(page).toHaveScreenshot('phone-overhead-links.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the shop’s balls aisle, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, {
        seed: 11,
        paused: true,
        save: {
          coins: 130,
          gems: 1,
          owned: ['mallet', 'bender', 'clay', 'marble', 'comet', 'pennant'],
          kit: { club: 'mallet', ball: 'clay', accessory: 'comet' },
        },
      });
      await page.evaluate(() => window.game!.step(60));
      await landed(page);
      await page.locator('#shopOpen').click();
      await page.evaluate(() => window.game!.shopTab('ball'));
      // the list scrolled to the clay ball worn, so the row marked Equipped is in the picture
      await page.locator('[data-item=clay]').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.game!.step(2));
      await expect(page).toHaveScreenshot('phone-shop-balls.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the start screen, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      await page.evaluate(() => window.game!.step(1));
      await hideStats(page);
      await expect(page).toHaveScreenshot('phone-start.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the page stopped on a hole that cannot be drawn, on a phone: its words wrapped inside the screen’s edges', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await stopped(page);
      await expect(page).toHaveScreenshot('phone-stopped.png', TOLERANCE);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('could not be drawn');
    });

    test('the lowest rung of the quality ladder: no shadows and no post', async ({ page }) => {
      const problems = watch(page);
      await start(page, { rung: 3, seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await expect(page).toHaveScreenshot('phone-lowest.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the view turned, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await page.evaluate(() => {
        window.game!.orbit(-1.9, 0.15);
        window.game!.step(1);
      });
      await expect(page).toHaveScreenshot('phone-look.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a hole of The Links, from its tee, on a phone: the bag, the trees and the bend', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(75);
      });
      await expect(page).toHaveScreenshot('phone-links.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test("a full drive aimed on a phone: the flight to its ring, the map at the side, and the hole's drawer pulled out with the pin and the wind", async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(300);
      });
      await pullDown(page, 1, 0, true);
      expect((await page.evaluate(() => window.game!.motions().shot))?.end).toBe('landed');
      await expect(page).toHaveScreenshot('phone-links-aim.png', TOLERANCE);
      await openDrawer(page);
      await expect(page).toHaveScreenshot('phone-links-aim-drawer.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test("a full drive aimed on a 390 by 844 phone: the driver's ring clear of the coins, the shop and the switch", async ({
      page,
    }) => {
      const problems = watch(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(300);
      });
      await pullDown(page, 1, 0, true);
      const ring = await page.evaluate(() => {
        const r = window.game!.motions().shot!.ring!;
        const g = window.game!;
        return g.project(r.x, r.y + r.radius, g.ball().z).y;
      });
      expect(ring, 'the far edge of the ring is below the switch, which ends at about 150').toBeGreaterThan(150);
      await expect(page).toHaveScreenshot('phone-links-aim-driver-ring.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the card, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await playRound(page);
      await expect(page).toHaveScreenshot('phone-card.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });

  // a phone on its side has no height to spare: the hole's words in two columns, the map at the left foot,
  // the bag in three short rows and the switch standing in a column at the right edge
  test.describe('on a phone on its side', () => {
    test.use({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });

    test('a hole of minigolf whose ground leans, on its side: the break in words and the switch in a column', async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((hole) => {
        window.game!.playCourse([hole]);
        window.game!.step(75);
      }, BOWL);
      await expect(page).toHaveScreenshot('landscape-slope.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test("a full drive aimed on its side: the chip, the map, the bag and the switch under the shop, and the hole's drawer pulled out", async ({
      page,
    }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Links');
        window.game!.startHole(2);
        window.game!.step(300);
      });
      await pullDown(page, 1, 0, true);
      expect((await page.evaluate(() => window.game!.motions().shot))?.end).toBe('landed');
      await expect(page).toHaveScreenshot('landscape-links-aim.png', TOLERANCE);
      await openDrawer(page);
      await expect(page).toHaveScreenshot('landscape-links-aim-drawer.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the start screen, on its side', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true, screen: true });
      await expect(page).toHaveScreenshot('landscape-start.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});

/**
 * Putting, on a golf hole of the test's own that has a contoured green and a first cut (see `puttingHole`): the arrows over
 * the green, the cut where it meets the green and the fairway, and a putt's roll drawn across the slope before it is struck.
 * New pictures, written for these scenes alone: The Links' own are held to the ones taken before it had a cut.
 */
test.describe('putting', () => {
  const HOLE = puttingHole(12);
  const LAYOUT = layoutOf(HOLE.map, Float32Array.from(HOLE.terrain));
  /** The middle of the nth tile of a lie, nearest the cup first, or the last one south of it. */
  function middleOf(lie: number, nth: number | 'far') {
    const found: { x: number; y: number }[] = [];
    for (let t = 0; t < LAYOUT.cols * LAYOUT.rows; t++)
      if (LAYOUT.lie[t] === lie && !LAYOUT.solid[t] && !LAYOUT.oob[t])
        found.push({
          x: LAYOUT.originX + ((t % LAYOUT.cols) + 0.5) * 3,
          y: LAYOUT.originY + (Math.floor(t / LAYOUT.cols) + 0.5) * 3,
        });
    found.sort(
      (a, b) => Math.hypot(a.x - LAYOUT.cup.x, a.y - LAYOUT.cup.y) - Math.hypot(b.x - LAYOUT.cup.x, b.y - LAYOUT.cup.y),
    );
    return nth === 'far' ? found.filter((p) => p.y < LAYOUT.cup.y).at(-1)! : found[nth];
  }
  async function onTheGreen(page: Page, at: { x: number; y: number }) {
    await page.evaluate(
      ([h, p]) => {
        const g = window.game!;
        const def = h as { terrain: number[] };
        g.playCourse([{ ...def, terrain: Float32Array.from(def.terrain) } as never]);
        g.step(30);
        g.lay((p as { x: number; y: number }).x, (p as { x: number; y: number }).y);
        for (let f = 0; f < 300 && !g.state().ready; f++) g.step(1);
        g.club('putter');
        g.step(120);
      },
      [HOLE, at],
    );
  }

  test('the green with its arrows and its first cut, the ball at rest on it, from above and behind', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await onTheGreen(page, middleOf(LIE.green, 'far'));
    expect((await page.evaluate(() => window.game!.motions().arrows)).shown).toBe(true);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('putting-green.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the first cut close to, where it meets the green on one side and the fairway on the other', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await onTheGreen(page, middleOf(LIE.cut, 0));
    await page.evaluate(
      ([x, y]) => {
        window.game!.look(x, y - 10, 30);
        window.game!.step(1);
      },
      [LAYOUT.cup.x, LAYOUT.cup.y - 18],
    );
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('putting-cut.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a putt aimed across the green: its roll drawn along the ground, to the ring where it will rest', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await onTheGreen(page, middleOf(LIE.green, 'far'));
    await aim(page, 0.6, -10);
    const shot = await page.evaluate(() => window.game!.motions().shot);
    expect(shot?.arc, 'the roll is drawn').toBeGreaterThan(8);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('putting-aim.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('a green of The Links’ own, the most contoured and the fastest: the arrows over its tilt, the break in the panel, and a putt aimed straight at the cup, its roll bending away from the line', async ({
    page,
  }) => {
    const problems = watch(page);
    const hole = linksHoles().at(-1)!;
    const layout = layoutOf(hole.map, hole.terrain);
    // the putt of about fourteen yards that breaks the most, which is the one to look at
    let from = { x: 0, y: 0, across: 0 };
    for (let t = 0; t < layout.cols * layout.rows; t++) {
      const x = layout.originX + ((t % layout.cols) + 0.5) * 3,
        y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * 3;
      const far = Math.hypot(x - layout.cup.x, y - layout.cup.y);
      // south of the cup, the way a hole is played toward it, so the camera has the cup ahead of the ball
      if (layout.lie[t] !== LIE.green || far < 12 || far > 16 || y > layout.cup.y - 6) continue;
      const { across } = breakOf(layout, x, y, hole.greens);
      if (Math.abs(across) > Math.abs(from.across)) from = { x, y, across };
    }
    expect(Math.abs(from.across), 'a putt that breaks').toBeGreaterThan(1.5);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(
      ([x, y]) => {
        const g = window.game!;
        g.chooseCourse('The Links');
        g.startHole(g.content().holes.length - 1);
        g.step(60);
        g.lay(x, y);
        for (let f = 0; f < 300 && !g.state().ready; f++) g.step(1);
        g.club('putter');
        g.step(120);
      },
      [from.x, from.y],
    );
    // pulled back from the ball along the line from the cup through it: the putt goes straight at the cup
    const far = Math.hypot(from.x - layout.cup.x, from.y - layout.cup.y);
    const back = [from.x + ((from.x - layout.cup.x) / far) * 10, from.y + ((from.y - layout.cup.y) / far) * 10];
    const [at, to] = await page.evaluate(
      ([x, y, bx, by]) => {
        const g = window.game!;
        const z = g.ball().z;
        return [g.project(x, y, z), g.project(bx, by, z)];
      },
      [from.x, from.y, back[0], back[1]],
    );
    await drag(page, at, to, { hold: true });
    await page.evaluate(() => window.game!.step(1));
    const shot = await page.evaluate(() => window.game!.motions().shot);
    expect(shot?.arc, 'the roll is drawn').toBeGreaterThan(8);
    await hideStats(page);
    await expect(page).toHaveScreenshot('putting-links.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test("the green with its arrows, and the speed and the break in the hole's drawer", async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await onTheGreen(page, middleOf(LIE.green, 'far'));
      await hideStats(page);
      await expect(page).toHaveScreenshot('phone-putting.png', TOLERANCE);
      await openDrawer(page);
      await expect(page).toHaveScreenshot('phone-putting-drawer.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});

// ---- the flag button: the switch with its flag icon, and a view turned round to face the cup ----

/**
 * The pictures of the switch are a small clip, in which the edges of the words come out a hundred pixels different on one
 * run in ten or so (measured over 36 runs, 105 pixels of 32,000 at the worst, all in the glyphs). So they are held to a
 * third of a per cent and not a fifth: more than that wobble, and far less than the icon, which is 2.6 per cent of the clip.
 */
const SMALL_CLIP = { maxDiffPixelRatio: 0.006, threshold: 0.02 };

/** Every panel's spring finished, so a picture of one is of where it comes to rest and not part of the way. */
const settled = (page: Page) =>
  page.evaluate(async () => {
    for (const a of document.getAnimations()) a.finish();
    // and two frames drawn on it, so the words are painted where they rest and not as they were when the spring was cut short
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });

test.describe('the flag button', () => {
  test('the switch with its flag icon, close up on a desk', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await settled(page);
    const b = (await page.locator('#viewMode').boundingBox())!;
    const clip = {
      x: Math.round(b.x) - 12,
      y: Math.round(b.y) - 12,
      width: Math.round(b.width) + 24,
      height: Math.round(b.height) + 24,
    };
    await expect(page).toHaveScreenshot('flag-switch.png', { ...SMALL_CLIP, clip });
    expect(problems).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test('the switch with its flag icon, under the coins and the shop at the top right', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await settled(page);
      // the purse and the switch under it, the top right corner of the screen
      const purse = (await page.locator('#purse').boundingBox())!;
      const b = (await page.locator('#viewMode').boundingBox())!;
      const clip = {
        x: Math.round(b.x) - 12,
        y: Math.round(purse.y) - 12,
        width: Math.round(Math.max(b.width, purse.width)) + 24,
        height: Math.round(b.y + b.height - purse.y) + 24,
      };
      await expect(page).toHaveScreenshot('phone-flag-switch.png', { ...SMALL_CLIP, clip });
      expect(problems).toEqual([]);
    });
  });

  // a phone with its display size or its font turned up has a CSS viewport far smaller than the panels were laid out for, and
  // they are scaled down to it (`--ui`): the whole layout, in the smaller screen
  test.describe('on a small screen', () => {
    for (const [name, width, height] of [
      ['upright', 300, 640],
      ['on its side', 580, 290],
    ] as const)
      test(`a hole of The Links aimed, ${name}, at ${width} by ${height}: everything over the course scaled to fit`, async ({
        browser,
      }) => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        const problems = watch(page);
        await start(page, { seed: 11, paused: true });
        await page.evaluate(() => {
          window.game!.chooseCourse('The Links');
          window.game!.startHole(2);
          window.game!.step(300);
        });
        await expect(page).toHaveScreenshot(`small-${width}x${height}.png`, TOLERANCE);
        expect(problems).toEqual([]);
        await context.close();
      });
  });

  test('a hole whose cup is off to one side, from the ball, and after the flag button has turned the camera to face it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    // the ball on Long Bend put down where the cup is well off the way the camera faces: the first spot of grass, found in
    // the same order every time, a hundred and fifty yards from the cup and well round from where the camera looks
    const lie = await page.evaluate(() => {
      const g = window.game!;
      g.chooseCourse('The Links');
      g.startHole(2);
      const { cup } = g.content();
      for (const bearing of [1.1, -1.1, 0.9, -0.9, 1.3, -1.3, 0.7, -0.7])
        for (const d of [150, 120, 90]) {
          try {
            g.lay(cup.x - Math.sin(bearing) * d, cup.y - Math.cos(bearing) * d);
            g.step(120);
            return { bearing, d };
          } catch {
            // not a place a ball may lie: the next
          }
        }
      throw new Error('nowhere to put the ball');
    });
    console.log(`the ball put ${lie.d} yards from the cup, ${lie.bearing} radians off`);
    await hideStats(page);
    await settled(page);
    expect(await page.evaluate(() => window.game!.view().azimuth)).toBe(0);
    await expect(page).toHaveScreenshot('flag-before.png', TOLERANCE);
    await page.locator('#viewFlag').click();
    // the frames the turn takes: it is within a thousandth of a radian in two seconds
    await page.evaluate(() => window.game!.step(180));
    expect((await page.evaluate(() => window.game!.view())).turning).toBe(false);
    await expect(page).toHaveScreenshot('flag-after.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

test.describe('a stream', () => {
  test('running water in a channel, close to: foam at its edges, open water in it with no streaks, level with the grass', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate((hole) => {
      const g = window.game!;
      g.playCourse([hole]);
      g.step(1);
      const { tee } = g.content();
      // the middle of the belt, which runs across the hole four rows north of the tee
      g.look(tee.x + 1.5, tee.y + 7, 20);
      g.step(90);
    }, STREAM_HOLE);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('stream.png', TOLERANCE);
    const ms = await page.evaluate(() => window.game!.measureFrame(30));
    console.log(`a frame of the stream scene: ${ms.toFixed(2)} ms`);
    expect(problems).toEqual([]);
  });
});

// The Mill Race with its windmill listed before its barrier: the barrier's box once took the windmill's gate for its own and
// stood parked in the sky, so a hole listed its barriers first; now each thing keeps its own box, whatever the order
test('The Mill Race with its windmill listed first, from its tee: the barrier on the ground, the gate in the door', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const race = COURSE.find((h) => h.name === 'The Mill Race')!;
  const swapped = {
    ...race,
    obstacles: [...race.obstacles!].sort((a, b) => (a.kind === 'windmill' ? -1 : b.kind === 'windmill' ? 1 : 0)),
  };
  await page.evaluate((hole) => {
    window.game!.playCourse([hole]);
    window.game!.step(75);
    const { floor } = window.game!.content();
    window.game!.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 14, 70);
    window.game!.step(1);
  }, swapped);
  await hideStats(page);
  await expect(page.locator('#view')).toHaveScreenshot('mill-race-swapped.png', TOLERANCE);
  expect(problems).toEqual([]);
});

/**
 * What the shop's accessories, balls and clubs draw: the comet's trail, the party cup's streamers, the club pennant, the
 * fireworks over the cup, the rangefinder's ring where a putt or a drive will rest, the chalk's line past a bank and its
 * break arrows off the green, the Retake button, a Super Ball and a Gem Ball on the course, and the Shaper Irons' curved
 * dots. Each is set from a save that owns and wears the item, with the game paused and seeded, and stepped a frame at a
 * time where the picture needs the frames before it (a trail is made of the frames that came first, and `step(n)` draws
 * only once, after the n).
 */
test.describe("the shop's items", () => {
  /** A save that owns one thing and wears it in its aisle, with coins to spare. */
  const holding = (item: string, aisle: 'club' | 'ball' | 'accessory' = 'accessory') => ({
    coins: 200,
    gems: 1,
    owned: [item],
    kit: { club: '', ball: '', accessory: '', [aisle]: item },
  });

  /** The autopilot's shots from the tee of the hole in play, until the ball is in the cup: stops on the first frame of the confetti. */
  async function holeIt(page: Page) {
    await page.evaluate(() => {
      const g = window.game!;
      for (let s = 0; s < 30 && g.state().phase === 'play' && g.motions().confetti === 0; s++) {
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 900 && g.motions().confetti === 0 && !g.state().ready; f++) g.step(1);
      }
    });
  }

  test('the comet trail on minigolf: its trail behind the ball, a few frames after the stroke', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('comet') });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(60);
      const shot = g.suggest()!;
      g.shoot(shot.angle, shot.power);
      g.followShots('always');
      for (let f = 0; f < 24; f++) g.step(1);
    });
    expect(await page.evaluate(() => window.game!.motions().trail), 'the trail is drawn').toBeGreaterThan(2);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-comet-trail.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the comet trail in the air on a drive: its trail along the flight', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('comet') });
    await page.evaluate(() => {
      const g = window.game!;
      g.chooseCourse('The Links');
      g.startHole(0);
      g.step(300);
      g.followShots('always');
      const shot = g.suggest()!;
      g.shoot(shot.angle, shot.power, 'driver');
      for (let f = 0; f < 50; f++) g.step(1);
    });
    expect(await page.evaluate(() => window.game!.motions().trail), 'the trail is drawn').toBeGreaterThan(2);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-comet-trail-drive.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the party cup a few frames after a hole is holed, streamers over the cup', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('streamers') });
    await page.evaluate(() => window.game!.step(60));
    await holeIt(page);
    await page.evaluate(() => {
      const g = window.game!;
      const { cup } = g.content();
      g.look(cup.x, cup.y - 8, 26);
      for (let f = 0; f < 28; f++) g.step(1);
    });
    expect(await page.evaluate(() => window.game!.motions().confetti), 'streamers were thrown').toBeGreaterThan(0);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-streamers.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the club pennant close to, on the cup, its striped cloth in the wind', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('pennant') });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(75);
      const { cup } = g.content();
      g.look(cup.x, cup.y - 3, 12);
      g.step(40);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-pennant-flag.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the fireworks over the cup, a moment after a hole is holed in under par', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('fireworks') });
    // the first hole of The Meadow the autopilot beats par on, holed; then the camera close on the cup, and game time
    // stepped a frame at a time to a moment the second shell's burst is up
    const under = await page.evaluate(() => {
      const g = window.game!;
      for (let h = 0; h < 9; h++) {
        g.startHole(h);
        g.step(60);
        for (let s = 0; s < 30 && g.state().phase === 'play' && g.motions().confetti === 0; s++) {
          const shot = g.suggest();
          if (shot) g.shoot(shot.angle, shot.power);
          for (let f = 0; f < 900 && g.motions().confetti === 0 && !g.state().ready; f++) g.step(1);
        }
        const st = g.state();
        if (st.phase === 'done' && st.strokes < st.par) return { hole: h, strokes: st.strokes, par: st.par };
      }
      return null;
    });
    expect(under, 'a hole was holed under par').not.toBeNull();
    await page.evaluate(() => {
      const g = window.game!;
      const { cup } = g.content();
      g.followShots('always');
      g.look(cup.x, cup.y + 2, 36);
      // the first shell's burst six tenths of a second old and the second's two tenths
      for (let f = 0; f < 66; f++) g.step(1);
    });
    await hideStats(page);
    // the score's sticker is over the sky the shells burst in
    await page.locator('#toast').evaluate((el: HTMLElement) => (el.style.visibility = 'hidden'));
    await expect(page.locator('#view')).toHaveScreenshot('items-fireworks.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the rangefinder on minigolf: a putt part-pulled on the first hole, its line carried on to the ring where it will rest', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('scope') });
    await page.evaluate(() => window.game!.step(75));
    await aim(page, 0.55);
    // `motions().shot` reads the first landing's ring, which a putt has none of, so the rest ring of minigolf is the picture's to show
    expect(await page.evaluate(() => window.game!.aiming()), 'a putt is aimed').not.toBeNull();
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-scope-minigolf.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the rangefinder on a drive: a drive part-pulled on Water Carry, its line carried on past the first landing to the ring where it rests', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('scope') });
    await page.evaluate(() => {
      window.game!.chooseCourse('The Links');
      window.game!.startHole(1);
      window.game!.step(300);
    });
    await pullDown(page, 0.5);
    const shot = await page.evaluate(() => window.game!.motions().shot);
    expect(shot?.rest, 'the carry-on is drawn').not.toBeNull();
    await hideStats(page);
    await expect(page).toHaveScreenshot('items-scope-shot.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the chalk on minigolf: a putt aimed across the first hole at its rail, the line carried on past the bank', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('chalk') });
    await page.evaluate(() => window.game!.step(75));
    // pulled back and across, so the shot goes up the hole and out to the side, to meet the rail at a slant
    await aim(page, 1, 330);
    expect(await page.evaluate(() => window.game!.aiming()), 'a shot is aimed').not.toBeNull();
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-chalk-bank.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the chalk on golf: a putt aimed from the fairway, the arrows over the green and the words in the panel', async ({
    page,
  }) => {
    const problems = watch(page);
    const hole = puttingHole(12);
    const layout = layoutOf(hole.map, Float32Array.from(hole.terrain));
    // the fairway tile nearest the cup that is south of it, so the cup is ahead of the ball
    let at = { x: 0, y: 0, far: Infinity };
    for (let t = 0; t < layout.cols * layout.rows; t++) {
      if (layout.lie[t] !== LIE.fairway || layout.solid[t] || layout.oob[t]) continue;
      const x = layout.originX + ((t % layout.cols) + 0.5) * 3;
      const y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * 3;
      const far = Math.hypot(x - layout.cup.x, y - layout.cup.y);
      if (y < layout.cup.y - 8 && far < at.far) at = { x, y, far };
    }
    expect(at.far, 'a fairway tile was found').toBeLessThan(40);
    await start(page, { seed: 11, paused: true, save: holding('chalk') });
    await page.evaluate(
      ([h, p]) => {
        const g = window.game!;
        const def = h as { terrain: number[] };
        g.playCourse([{ ...def, terrain: Float32Array.from(def.terrain) } as never]);
        g.step(30);
        g.lay((p as { x: number }).x, (p as { y: number }).y);
        for (let f = 0; f < 300 && !g.state().ready; f++) g.step(1);
        g.club('putter');
        g.step(120);
      },
      [hole, at],
    );
    const arrows = await page.evaluate(() => window.game!.motions().arrows);
    expect(arrows.shown, 'the arrows are up off the green').toBe(true);
    await aim(page, 0.5);
    await hideStats(page);
    await expect(page).toHaveScreenshot('items-chalk-fairway.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  /** A ball struck once on the first hole and come to rest, the camera close on it: the ball's look on the course. */
  async function ballClose(page: Page, id: string) {
    await start(page, { seed: 11, paused: true, save: holding(id, 'ball') });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(60);
      const shot = g.suggest()!;
      g.shoot(shot.angle, shot.power * 0.5);
      for (let f = 0; f < 900 && !g.state().ready; f++) g.step(1);
      g.step(30);
      const b = g.ball();
      g.look(b.x, b.y - 1.5, 5);
      g.step(2);
    });
    await hideStats(page);
  }

  test('the Super Ball on the course, close, after a stroke: pink with a cyan swirl and a gloss', async ({ page }) => {
    const problems = watch(page);
    await ballClose(page, 'super');
    await expect(page.locator('#view')).toHaveScreenshot('items-ball-super.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the Gem Ball on the course, close, after a stroke', async ({ page }) => {
    const problems = watch(page);
    await ballClose(page, 'gem');
    await expect(page.locator('#view')).toHaveScreenshot('items-ball-gem.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('the Shaper Irons on minigolf: a putt set to draw, its dots curving off the straight', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, save: holding('bender', 'club') });
    await page.evaluate(() => window.game!.step(75));
    await expect(page.locator('#shapeButton'), 'the shape button is up with a club that bends').toBeVisible();
    await page.locator('#shapeButton').click();
    expect(await page.evaluate(() => window.game!.motions().controls.shape), 'a draw is chosen').not.toBe(0);
    await aim(page, 0.6);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('items-bend-putt.png', TOLERANCE);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  /** One stroke taken with the Pocket Watch worn, and the ball at rest: the Retake button is up. */
  async function afterAStroke(page: Page) {
    await start(page, { seed: 11, paused: true, save: holding('watch') });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(60);
      const shot = g.suggest()!;
      g.shoot(shot.angle, shot.power * 0.5);
      for (let f = 0; f < 900 && !g.state().ready; f++) g.step(1);
      g.step(60);
    });
    const retake = await page.evaluate(() => window.game!.motions().retake);
    expect(retake, 'the Retake button is up and can be pressed').toEqual({ shown: true, enabled: true });
    await hideStats(page);
  }

  test('the Retake button on a desk, after a stroke with the Pocket Watch worn', async ({ page }) => {
    const problems = watch(page);
    await afterAStroke(page);
    await expect(page).toHaveScreenshot('items-retake.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

    test('the Retake button on a phone, after a stroke with the Pocket Watch worn', async ({ page }) => {
      const problems = watch(page);
      await afterAStroke(page);
      await expect(page).toHaveScreenshot('phone-items-retake.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});

/**
 * The second pass of the title's look (9 October 2026, `~/.claude/plans/ooergolf-title-look-two.md`): the curved ground, the
 * water with its ring of stones, scenery in two tones, the lower sun and the woods past a golf hole. Each scene stands beside a
 * round-five picture of `~/.claude/plans/ooergolf-title-look-two-evidence/`, which is what it is looked at against when its picture
 * is written. Each also holds a fact the picture cannot say, through `content().zones`, so a scene that moved off its place is
 * told before the picture is. (The pond's own is above, with its ring.)
 */
test.describe('the second pass of the title look', () => {
  async function onGolf(page: Page, course: string, k: number, frames = 75) {
    await start(page, { seed: 11, paused: true });
    await page.evaluate(
      ([c, k, f]) => {
        window.game!.chooseCourse(c as string);
        window.game!.startHole(k as number);
        window.game!.step(f as number);
      },
      [course, k, frames],
    );
    await hideStats(page);
  }

  // beside `r5-isles2.png` (and `before-isles2.png`, what it was): the tee's rounded box, the fairway's curves with the first cut a
  // constant band round them, the lake's rocky shelf and its ring, woods past the stakes and hills beyond them
  test('The Green Isle from its tee: the curved fairway and green, the lake and its ring, the woods and hills past out of bounds', async ({
    page,
  }) => {
    const problems = watch(page);
    await onGolf(page, 'The Isles', 1);
    const where = await page.evaluate(() => {
      const g = window.game!;
      const { tee, cup, zones } = g.content();
      return { tee: zones(tee.x, tee.y), cup: zones(cup.x, cup.y) };
    });
    expect(where, 'the tee and the cup stand in their own ground').toEqual({ tee: 'tee', cup: 'putting' });
    await expect(page).toHaveScreenshot('look2-isles-tee-2.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // beside `r5-low.png` and `r5-lowpond.png`: stood on the fairway short of the pond looking down the hole at it, low, so the
  // ring's stones stand against the water and the woods stand up behind
  test("the low view down Water Carry toward its pond: the water's curve, its shelf, the ring and the trees behind", async ({
    page,
  }) => {
    const problems = watch(page);
    await onGolf(page, 'The Links', 1);
    const def = linksHoles()[1];
    const l = layoutOf(def.map, def.terrain);
    let x = 0,
      y = 0,
      n = 0;
    for (let t = 0; t < l.cols * l.rows; t++)
      if (l.water[t]) {
        x += l.originX + ((t % l.cols) + 0.5) * TILE;
        y += l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
        n++;
      }
    const pond = { x: x / n, y: y / n };
    const lie = await page.evaluate((p) => window.game!.content().zones(p.x, p.y - 30), pond);
    expect(['fairway', 'cut', 'rough'], 'short of the pond is dry ground a ball is played from').toContain(lie);
    await page.evaluate((p) => {
      const g = window.game!;
      g.look(p.x, p.y - 24, 70);
      g.orbit(0, 0.5);
      g.step(1);
    }, pond);
    await expect(page.locator('#view')).toHaveScreenshot('look2-water-carry-low.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // beside `r5-close.png`: a broadleaf, a pine and a rock close to, each lit on one side and dark on the other, on the rough's
  // shorter, lighter blades, in the lower sun
  test("trees and rocks close by The Meadow's first hole: two tones on each, the dark side much darker", async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      const { floor } = g.content();
      g.step(60);
      g.look(floor.minX - 9, (floor.minY + floor.maxY) / 2 - 4, 26);
      g.orbit(0.6, 0.55);
      g.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('look2-meadow-scenery.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // beside `r5-flylinks.png` and `r5-flyin.png`: the fly-in to The Links' first hole at the middle of its time, the hills coming
  // up past the map's edge from nothing, the woods and the far woods between them and the camera
  test("The Links' fly-in at the middle of its time: the rolling hills past the map, the woods and the far woods", async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, flyIn: true });
    await page.evaluate(() => window.game!.chooseCourse('The Links'));
    // the fly-in holds, then eases: `FLY_IN.hold` and `FLY_IN.time` are 0.5 and 2.2 seconds, so 1.35 seconds is the middle
    await page.evaluate(() => window.game!.step(81));
    expect((await page.evaluate(() => window.game!.view())).flying, 'still flying at the middle').toBe(true);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('look2-links-flyin-middle.png', TOLERANCE);
    expect(problems).toEqual([]);
  });
});

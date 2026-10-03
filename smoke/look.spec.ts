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
import { layoutOf } from '../src/arena';
import { COURSE, type HoleDef } from '../src/course';
import { LINKS_SPECS, links as linksHoles } from '../src/links';
import { breakOf } from '../src/green';

import { glint } from '../src/glints';
import { LIE } from '../src/surfaces';
import { BOWL, SIDE_HILL } from '../test/hills';
import { STREAM_HOLE } from '../test/stream-hole';
import { drag, puttingHole, start, watch } from './game';
import { openDrawer } from './panels';

/** How far the pictures may differ before it is a change and not the GPU: a fiftieth of the pixels, each well off. */
const TOLERANCE = { maxDiffPixelRatio: 0.002, threshold: 0.02 };

/** The corner that counts the milliseconds a frame takes is different every run, and says nothing about the look. */
async function hideStats(page: Page) {
  await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
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
    ['The Pinball Shed', 'The Funnel', 'shed-2.png'],
    ['The Pinball Shed', 'Plinko', 'shed-3.png'],
    ['The Pinball Shed', 'Half-pipe', 'shed-4.png'],
    ['The Pinball Shed', 'Three Cushion', 'shed-5.png'],
    ['The Fair', 'Turnstile', 'fair-1.png'],
    ['The Fair', 'Traffic', 'fair-2.png'],
    ['The Fair', 'The Lift', 'fair-3.png'],
    ['The Fair', 'Whack-a-mole', 'fair-4.png'],
    ['The Waterworks', 'The Causeway', 'waterworks-1.png'],
    ['The Waterworks', 'The Stepping Stones', 'waterworks-2.png'],
    ['The Waterworks', 'The Lock', 'waterworks-3.png'],
    ['The Waterworks', 'The Island Green', 'waterworks-4.png'],
    ['The Waterworks', 'The Spillway', 'waterworks-5.png'],
    ['The Waterworks', 'Mill Pond', 'waterworks-6.png'],
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

  test('the water, close to: sunk below the grass in its earth, foam and bands, veined, with its rings spreading and the sun on it', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    const at = pondOf('Pond');
    await page.evaluate((c) => {
      const g = window.game!;
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Pond'));
      g.step(90);
      // on to a moment the sun is on the water in two places at least, so the picture has its sparkles in it
      for (let f = 0; f < 240 && g.motions().sparkles < 2; f++) g.step(1);
      g.look(c.x, c.y - 6, 22);
      g.step(1);
    }, at);
    expect((await page.evaluate(() => window.game!.motions())).sparkles, 'the sun on the water').toBeGreaterThanOrEqual(
      2,
    );
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('water.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  test('a ball splashing into the pond, a third of a second after: the ring spreading from where it went in', async ({
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
    expect((await page.evaluate(() => window.game!.motions())).splash, 'a ring').toBeGreaterThan(0.3);
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('splash.png', TOLERANCE);
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

  test('looking round: the first hole from its side, and from behind and low, with the switch on Look', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => window.game!.step(60));
    await page.locator('#modeLook').click();
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

  test('the shop, with a club in hand, one owned and the rest for sale', async ({ page }) => {
    const problems = watch(page);
    await start(page, {
      seed: 11,
      paused: true,
      save: { coins: 130, gems: 1, owned: ['putter', 'brass'], club: 'brass' },
    });
    await page.evaluate(() => window.game!.step(60));
    await hideStats(page);
    await page.locator('#shopOpen').click();
    await expect(page).toHaveScreenshot('shop.png', TOLERANCE);
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

  // golf, on the range: the ground told apart by its colour, the bag over it, and a ball in the air with its landing marked
  test.describe('golf, on the range', () => {
    /** The range's hole `k` begun from its tee, the ball still and the stats hidden. */
    async function range(page: Page, hole: number) {
      await start(page, { seed: 11, paused: true });
      await page.evaluate((k) => {
        window.game!.chooseCourse('The Range');
        window.game!.startHole(k);
        window.game!.step(75);
      }, hole);
      await hideStats(page);
    }

    test('The Long Way from its tee: the box, the fairway between the rough, the bag, and the aim reaching as far as the driver carries', async ({
      page,
    }) => {
      const problems = watch(page);
      await range(page, 2);
      await aim(page, 0.9);
      await expect(page).toHaveScreenshot('range-tee.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive in the air, a second after it was struck: the ball high above the fairway', async ({ page }) => {
      const problems = watch(page);
      await range(page, 2);
      await page.evaluate(() => {
        window.game!.shoot(Math.PI / 2, 1, 'driver');
        window.game!.step(60);
      });
      await expect(page).toHaveScreenshot('range-flight.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('a drive come down: the ring opened where it landed, and the ball on its first hop', async ({ page }) => {
      const problems = watch(page);
      await range(page, 2);
      await page.evaluate(() => {
        const g = window.game!;
        g.shoot(Math.PI / 2, 1, 'driver');
        // to the frame it came down in, and a few after, while the ring is opening
        for (let f = 0; f < 400 && !g.motions().landing; f++) g.step(1);
        g.step(14);
      });
      await expect(page).toHaveScreenshot('range-landed.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the green of Iron Alley, close to: the putting green in its stripes, the bunker beside it, the cup and its flag', async ({
      page,
    }) => {
      const problems = watch(page);
      await range(page, 1);
      await page.evaluate(() => {
        const { cup } = window.game!.content();
        window.game!.look(cup.x - 2, cup.y - 14, 60);
        window.game!.step(1);
      });
      await expect(page.locator('#view')).toHaveScreenshot('range-green.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
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

    test('the course, upright, with the words over it', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await expect(page).toHaveScreenshot('phone.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the shop, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, {
        seed: 11,
        paused: true,
        save: { coins: 130, gems: 1, owned: ['putter', 'brass'], club: 'brass' },
      });
      await page.evaluate(() => window.game!.step(60));
      await page.locator('#shopOpen').click();
      await expect(page).toHaveScreenshot('phone-shop.png', TOLERANCE);
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

    test('the lowest rung of the quality ladder: no shadows and no post', async ({ page }) => {
      const problems = watch(page);
      await start(page, { rung: 3, seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await expect(page).toHaveScreenshot('phone-lowest.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('looking round, on a phone: the switch on Look, and the view turned', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => window.game!.step(60));
      await page.locator('#modeLook').tap();
      await page.evaluate(() => {
        window.game!.orbit(-1.9, 0.15);
        window.game!.step(1);
      });
      await expect(page).toHaveScreenshot('phone-look.png', TOLERANCE);
      expect(problems).toEqual([]);
    });

    test('the range, on a phone: the bag over the switch, the driver in hand', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Range');
        window.game!.startHole(1);
        window.game!.step(75);
      });
      await expect(page).toHaveScreenshot('phone-range.png', TOLERANCE);
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
  test('running water in a channel, close to: foam at its edges, ripples on it, level with the grass', async ({
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

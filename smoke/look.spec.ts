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
import { COURSE, DOWNS, moors, type HoleDef } from '../src/course';
import { LINKS_SPECS } from '../src/links';

const MOORS = moors();
import { glint } from '../src/glints';
import { drag, start, watch } from './game';

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
    ['The Hills', 'The Hollow', 'hollow.png'],
    ['The Hills', 'The Volcano', 'volcano.png'],
    ['The Hills', 'The Bowl', 'bowl.png'],
    ['The Hills', 'Side-hill', 'side-hill.png'],
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

  // The Moors, a hole each from the middle of the way from its tee to its cup: each is many times the size of any other,
  // more than the widest zoom takes in, so no one picture has the whole of one, and the middle is where its hazards are
  for (const [i, hole] of MOORS.entries()) {
    test(`${hole.name}, hole ${i + 1} of The Moors, from the middle of the way`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((k) => {
        window.game!.chooseCourse('The Moors');
        window.game!.startHole(k);
        window.game!.step(75);
        const { tee, cup } = window.game!.content();
        window.game!.look((tee.x + cup.x) / 2, (tee.y + cup.y) / 2 - 12, 100);
        window.game!.step(1);
      }, i);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(`moors-${i + 1}.png`, TOLERANCE);
      expect(problems).toEqual([]);
    });
  }

  // and the first and the last from their tees, as a player begins them: how much of a big hole is not in view
  for (const i of [0, 8]) {
    test(`${MOORS[i].name}, hole ${i + 1} of The Moors, from its tee`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((k) => {
        window.game!.chooseCourse('The Moors');
        window.game!.startHole(k);
        window.game!.step(75);
      }, i);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(`moors-tee-${i + 1}.png`, TOLERANCE);
      expect(problems).toEqual([]);
    });
  }

  // The Downs, a hole each from its tee: half as long again as the others, so the whole of it is in view from further back
  for (const [i, hole] of DOWNS.entries()) {
    test(`${hole.name}, hole ${i + 1} of The Downs, from its tee`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((k) => {
        window.game!.chooseCourse('The Downs');
        window.game!.startHole(k);
        window.game!.step(75);
        const { floor } = window.game!.content();
        window.game!.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 12, 100);
        window.game!.step(1);
      }, i);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(`downs-${i + 1}.png`, TOLERANCE);
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
    await page.evaluate(() => {
      const g = window.game!;
      g.chooseCourse('The Hills');
      g.startHole(g.content().holes.findIndex((h) => h.name === 'Side-hill'));
      g.step(1);
      const { cup } = g.content();
      g.look(cup.x, cup.y - 10, 22);
      g.step(1);
    });
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

    test('the biggest hole of The Moors, from its tee, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate(() => {
        window.game!.chooseCourse('The Moors');
        window.game!.startHole(8);
        window.game!.step(75);
      });
      await expect(page).toHaveScreenshot('phone-moors.png', TOLERANCE);
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
});

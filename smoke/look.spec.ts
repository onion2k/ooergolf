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
import type { HoleDef } from '../src/course';
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

    test('the card, on a phone', async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await playRound(page);
      await expect(page).toHaveScreenshot('phone-card.png', TOLERANCE);
      expect(problems).toEqual([]);
    });
  });
});

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

  for (const [index, file] of [
    [2, 'pond.png'],
    [3, 'barriers.png'],
    [4, 'up-and-over.png'],
    [5, 'windmill.png'],
    [6, 'mill-race.png'],
  ] as const) {
    test(`hole ${index + 1}, ${file.replace('.png', '')}, from its tee`, async ({ page }) => {
      const problems = watch(page);
      await start(page, { seed: 11, paused: true });
      await page.evaluate((i) => {
        window.game!.startHole(i);
        // the moving things caught part way through, and the camera still: the whole hole in view
        window.game!.step(75);
        const { floor } = window.game!.content();
        window.game!.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 14, 70);
        window.game!.step(1);
      }, index);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(file, TOLERANCE);
      expect(problems).toEqual([]);
    });
  }

  test('a hole done: its score over the course', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      for (let s = 0; s < 6 && g.state().phase === 'play'; s++) {
        const shot = g.suggest();
        if (shot) g.shoot(shot.angle, shot.power);
        for (let f = 0; f < 720 && g.state().phase === 'play' && !g.state().ready; f += 10) g.step(10);
      }
      g.step(10);
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

    test('the lowest rung of the quality ladder: no shadows and no post', async ({ page }) => {
      const problems = watch(page);
      await page.goto('/?rung=3&seed=11&paused=1');
      await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
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

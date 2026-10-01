/**
 * The six holes The Range was given after its first three, each seen from its tee and from where its hazard is: a
 * bunker, a narrow fairway, a pond to carry, a wind, a dogleg and a hole of three shots. Held to pictures of their own,
 * kept by name in `smoke/screens/` like the look tests', so that a hazard drawn where it is not, or lost in the rough,
 * is seen. Time is stepped and chance seeded, as everywhere.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

const TOLERANCE = { maxDiffPixelRatio: 0.002, threshold: 0.02 };

/** The range's hole `k` begun from its tee, the ball still and the stats hidden. */
async function range(page: Page, hole: number) {
  await start(page, { seed: 11, paused: true });
  await page.evaluate((k) => {
    window.game!.chooseCourse('The Range');
    window.game!.startHole(k);
    window.game!.step(75);
  }, hole);
  await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
}

const NEW = [
  { hole: 3, name: 'Sand Trap' },
  { hole: 4, name: 'Narrow Straits' },
  { hole: 5, name: 'Over the Pond' },
  { hole: 6, name: 'Gusty' },
  { hole: 7, name: 'The Corner' },
  { hole: 8, name: 'The Long Road' },
];

test.describe('the six new holes of the range', () => {
  for (const { hole, name } of NEW) {
    test(`${name} from its tee, and its green seen from short of it`, async ({ page }) => {
      const problems = watch(page);
      await range(page, hole);
      expect(await page.evaluate(() => window.game!.state().hole)).toBe(hole);
      await expect(page).toHaveScreenshot(`range-hole-${hole + 1}-tee.png`, TOLERANCE);
      await page.evaluate(() => {
        const { cup } = window.game!.content();
        window.game!.look(cup.x, cup.y - 40, 120);
        window.game!.step(1);
      });
      await expect(page.locator('#view')).toHaveScreenshot(`range-hole-${hole + 1}-green.png`, TOLERANCE);
      expect(problems).toEqual([]);
    });
  }
});

/**
 * A hole with a flipper in the real page: the arm is drawn, swings with game time and the ball is struck at it through the
 * test API without an error from the scene, the renderer or the game's rules. No picture is held here; the model's is in
 * `models.spec.ts`.
 */
import { expect, test } from '@playwright/test';
import { start, watch } from './game';

const HOLE = {
  name: 'Flipper smoke',
  par: 4,
  map: [
    '#############',
    '#C..........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#.....T.....#',
    '#############',
  ],
  obstacles: [{ kind: 'flipper', at: [1, 4], length: 3, swing: 1, period: 2, pivot: 'left' }],
};

test('a flipper is drawn and swung in the page, and the rules hold as it is played', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate((hole) => window.game!.playCourse([hole as never]), HOLE);
  await expect(page.locator('#holeName')).toContainText('Hole 1 of 1');
  for (let k = 0; k < 6; k++) {
    await page.evaluate(() => window.game!.step(25));
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  }
  await page.evaluate(() => {
    const g = window.game!;
    const shot = g.suggest();
    if (shot) g.shoot(shot.angle, shot.power);
    g.step(240);
  });
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

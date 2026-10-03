/**
 * A kicker in a real browser, on a hole of the test's own (no course has one yet): the test API lists it, the page draws
 * it, and when a ball hits it the page lights it for a moment and then not. The model's picture is `models.spec.ts`'s.
 */
import { expect, test } from '@playwright/test';
import { start, watch } from './game';

const HOLE = {
  name: 'Smoke kicker',
  par: 3,
  map: ['#######', '#..C..#', '#.....#', '#..k..#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
};

test('a kicker is listed, drawn, lit when a ball hits it, and dark again after', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 3, paused: true });
  await page.evaluate((hole) => {
    window.game!.playCourse([hole]);
    for (let f = 0; f < 60; f++) window.game!.step(1);
  }, HOLE);
  const content = await page.evaluate(() => window.game!.content());
  expect(content.kickers).toHaveLength(1);
  expect(content.posts).toHaveLength(0);
  // nothing lit before a ball has hit it, and the field is not there at all, so the rest of the page reads as it did
  expect(await page.evaluate(() => window.game!.motions().kicks)).toBeUndefined();
  await page.evaluate(() => window.game!.shoot(Math.PI / 2, 0.4));
  let lit = 0;
  for (let f = 0; f < 240; f++) {
    lit = await page.evaluate(() => {
      window.game!.step(1);
      window.game!.step(0);
      return window.game!.motions().kicks ?? 0;
    });
    if (lit) break;
  }
  expect(lit, 'a kicker lit as the ball hit it').toBe(1);
  // and dark again once its flash has run out, with the ball away
  for (let f = 0; f < 60; f++) await page.evaluate(() => window.game!.step(1));
  expect(await page.evaluate(() => window.game!.motions().kicks)).toBeUndefined();
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

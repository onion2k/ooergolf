/**
 * The game played through in a real browser, a stage at a time. There is
 * nothing to play yet, so the one stage is the course left standing: played
 * through the test API with the game paused and stepped a frame at a time,
 * so it is the same every run and waits on no clock, but everything that
 * follows, the physics, the scene, the words on the screen, is the game's
 * own.
 *
 * A feature that a player can reach gets a stage here, and after every
 * stage the game's invariants are checked.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** Play `frames` frames, and check nothing that must hold has broken. */
async function play(page: Page, frames: number, stage: string) {
  const broken = await page.evaluate((n) => {
    window.game!.step(n);
    return window.game!.invariants();
  }, frames);
  expect(broken, `invariants after ${stage}`).toEqual([]);
}

test('the course stands empty, and nothing happens on it', async ({ page }, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await play(page, 120, 'standing');
  const state = await page.evaluate(() => window.game!.state());
  expect(state.live, 'nothing on the course').toBe(0);
  expect(await page.evaluate(() => window.game!.bodies())).toEqual([]);
  expect(await page.evaluate(() => window.game!.events()), 'nothing has happened').toEqual([]);
  const { floor } = await page.evaluate(() => window.game!.content());
  expect(floor.maxX - floor.minX, 'a floor to play on').toBeGreaterThan(0);
  await info.attach('standing', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

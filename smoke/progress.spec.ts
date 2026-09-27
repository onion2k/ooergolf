/**
 * The game played through in a real browser, a stage at a time: the ball
 * struck by a drag, rolled to rest, and struck again; a hole played out to
 * the cup, the next begun, and the round finished to the card and begun
 * again from its button. Played with the game
 * paused and stepped a frame at a time, so it is the same every run and waits
 * on no clock, but everything that follows, the pointer, the physics, the
 * scene, the words on the screen, is the game's own.
 *
 * A feature that a player can reach gets a stage here, and after every
 * stage the game's invariants are checked.
 */
import { expect, test, type Page } from '@playwright/test';
import { drag, start, watch } from './game';

/** Play `frames` frames, and check nothing that must hold has broken. */
async function play(page: Page, frames: number, stage: string) {
  const broken = await page.evaluate((n) => {
    window.game!.step(n);
    return window.game!.invariants();
  }, frames);
  expect(broken, `invariants after ${stage}`).toEqual([]);
}

/** Play until the ball is at rest, ten frames at a time; how many frames it took. */
async function untilReady(page: Page, stage: string) {
  for (let f = 0; f < 20 * 60; f += 10) {
    await play(page, 10, stage);
    if (await page.evaluate(() => window.game!.state().ready)) return f + 10;
  }
  throw new Error(`the ball never came to rest ${stage}`);
}

/** A drag from the ball, `dx` and `dy` across and down the page, let go. */
async function putt(page: Page, dx: number, dy: number) {
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  await drag(page, at, { x: at.x + dx, y: at.y + dy });
}

test('the ball is struck, rolls to rest, and is struck again', async ({ page }, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const tee = await page.evaluate(() => window.game!.ball());
  expect(tee.ready).toBe(true);

  await putt(page, 0, 150);
  expect(await page.evaluate(() => window.game!.state().strokes), 'the first stroke').toBe(1);
  // a drag let go while the ball rolls is refused, and not counted
  await play(page, 20, 'rolling');
  await putt(page, 0, 200);
  expect(await page.evaluate(() => window.game!.state().strokes), 'no stroke while it rolls').toBe(1);
  const took = await untilReady(page, 'after the first stroke');
  expect(took / 60, 'at rest within eight seconds').toBeLessThanOrEqual(8);
  const lie = await page.evaluate(() => window.game!.ball());
  expect(lie.y).toBeGreaterThan(tee.y + 5);
  // the camera has followed: the ball is still well on the screen
  const onScreen = await page.evaluate(() => {
    const b = window.game!.ball();
    const p = window.game!.project(b.x, b.y, b.z);
    return p.x > innerWidth * 0.1 && p.x < innerWidth * 0.9 && p.y > innerHeight * 0.1 && p.y < innerHeight * 0.9;
  });
  expect(onScreen, 'the ball in view after it rolled').toBe(true);

  await putt(page, -120, 60);
  expect(await page.evaluate(() => window.game!.state().strokes), 'the second stroke').toBe(2);
  await untilReady(page, 'after the second stroke');
  const events = await page.evaluate(() => window.game!.events());
  expect(events.filter((e) => e.startsWith('struck')).length).toBe(2);
  expect(events.filter((e) => e.startsWith('stopped')).length).toBe(2);
  await expect(page.locator('#strokes b')).toHaveText('2');
  await info.attach('second lie', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

/** A drag from the ball that strikes it as the autopilot would, found by projecting the shot's direction onto the page. */
async function puttAsSuggested(page: Page) {
  const plan = await page.evaluate(() => {
    const g = window.game!;
    const shot = g.suggest()!;
    const b = g.ball();
    const from = g.project(b.x, b.y, b.z);
    // a point a little way back along the shot, on the course, gives the drag's direction on the page
    const back = g.project(b.x - Math.cos(shot.angle) * 4, b.y - Math.sin(shot.angle) * 4, b.z);
    return { from, back, power: shot.power, short: Math.min(innerWidth, innerHeight) };
  });
  const dx = plan.back.x - plan.from.x,
    dy = plan.back.y - plan.from.y;
  const len = Math.hypot(dx, dy);
  const pull = plan.power * 0.35 * plan.short;
  await drag(
    page,
    plan.from,
    { x: plan.from.x + (dx / len) * pull, y: plan.from.y + (dy / len) * pull },
    { steps: 10 },
  );
}

test('a hole played out to the cup by drags, its score shown, and the next hole begun', async ({ page }, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const { holes } = await page.evaluate(() => window.game!.content());
  for (let stroke = 1; stroke <= 6; stroke++) {
    await puttAsSuggested(page);
    for (let f = 0; f < 12 * 60; f += 10) {
      await play(page, 10, `stroke ${stroke}`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') break;
  }
  const done = await page.evaluate(() => window.game!.state());
  expect(done.phase, 'holed').toBe('done');
  expect(done.card.length).toBe(1);
  await expect(page.locator('#toast')).toBeVisible();
  await info.attach('holed', { body: await page.screenshot(), contentType: 'image/png' });
  await play(page, 150, 'between holes');
  const next = await page.evaluate(() => window.game!.state());
  expect(next.hole).toBe(1);
  expect(next.phase).toBe('play');
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#holeName')).toContainText(`Hole 2 of ${holes.length}`);
  expect(problems).toEqual([]);
});

test('the round finished to the card, and begun again from its button', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const { holes } = await page.evaluate(() => window.game!.content());
  await page.evaluate((last) => window.game!.startHole(last), holes.length - 1);
  for (let stroke = 1; stroke <= 8; stroke++) {
    await page.evaluate(() => {
      const shot = window.game!.suggest();
      if (shot) window.game!.shoot(shot.angle, shot.power);
    });
    for (let f = 0; f < 12 * 60; f += 20) {
      await play(page, 20, `stroke ${stroke} of the last hole`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') break;
  }
  await play(page, 150, 'after the last hole');
  const over = await page.evaluate(() => window.game!.state());
  expect(over.phase).toBe('over');
  expect(over.card.length).toBe(holes.length);
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#cardRows tr')).toHaveCount(holes.length);
  await page.locator('#again').click();
  const again = await page.evaluate(() => window.game!.state());
  expect(again.hole).toBe(0);
  expect(again.card).toEqual([]);
  expect(again.ready).toBe(true);
  await expect(page.locator('#card')).toBeHidden();
  expect(problems).toEqual([]);
});

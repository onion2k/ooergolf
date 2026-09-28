/**
 * The game played through in a real browser, a stage at a time: the ball
 * struck by a drag, rolled to rest, and struck again; a hole played out to
 * the cup, the next begun, and the round finished to the card and begun
 * again from its button; and what answers each, read back from what was
 * drawn: the ball squashed by a knock, the cup's flag and gold as a ball
 * drops, the aim's pulse and the camera's glide. Played with the game
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
  expect(done.coins, 'the hole paid').toBeGreaterThan(0);
  await expect(page.locator('#coins')).toHaveText(String(done.coins));
  await expect(page.locator('#toast')).toBeVisible();
  await info.attach('holed', { body: await page.screenshot(), contentType: 'image/png' });
  // the cup answers the ball dropping: its gold flashing, and its flag waggling, a frame at a time
  const cup = await page.evaluate(() => {
    const g = window.game!;
    const seen = [g.motions()];
    for (let f = 0; f < 4; f++) {
      g.step(1);
      seen.push(g.motions());
    }
    return seen;
  });
  expect(cup[0].flash, 'the gold flashing').toBeGreaterThan(0.2);
  expect(cup[0].glints, 'every glint of it lit at once').toBeGreaterThan(1);
  expect(Math.max(...cup.map((m) => Math.abs(m.waggle))), 'the flag waggling').toBeGreaterThan(0.05);
  // on to the next hole a frame at a time, watching a point on the course on the screen: the camera glides, never cuts
  const arrival = await page.evaluate(() => {
    const g = window.game!;
    let before = g.project(0, 0, 0);
    for (let f = 0; f < 200; f++) {
      g.step(1);
      const now = g.project(0, 0, 0);
      if (g.state().hole === 1)
        return { moved: Math.hypot(now.x - before.x, now.y - before.y), glide: g.motions().glide, cup: g.motions() };
      before = now;
    }
    return null;
  });
  expect(arrival, 'the next hole begun').not.toBe(null);
  expect(arrival!.glide, 'the camera gliding to its tee').toBeGreaterThan(5);
  expect(arrival!.moved, 'without a jump on the screen').toBeLessThan(20);
  expect(arrival!.cup.flash, 'the last cup done with').toBe(0);
  expect(arrival!.cup.waggle).toBe(0);
  await play(page, 60, 'between holes');
  expect((await page.evaluate(() => window.game!.motions())).glide, 'there, within a second').toBe(0);
  const next = await page.evaluate(() => window.game!.state());
  expect(next.hole).toBe(1);
  expect(next.phase).toBe('play');
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#holeName')).toContainText(`Hole 2 of ${holes.length}`);
  expect(problems).toEqual([]);
});

test('a ball struck by a drag at the rail is knocked back off it: told, squashed that frame, and round again', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  // pulled back to the left of the ball and let go: struck to the right, across the first hole, at its rail
  await putt(page, -160, 0);
  expect(await page.evaluate(() => window.game!.state().strokes), 'struck').toBe(1);
  const knock = await page.evaluate(() => {
    const g = window.game!;
    g.events();
    for (let f = 0; f < 120; f++) {
      g.step(1);
      const told = g.events().filter((e) => e.startsWith('knocked'));
      if (told.length) return { told, frame: f, squash: g.motions().squash, ball: g.ball() };
    }
    return null;
  });
  expect(knock, 'a knock told').not.toBe(null);
  expect(knock!.told.length).toBe(1);
  const [hard, , , dx] = knock!.told[0].split(' ')[1].split(',').map(Number);
  expect(hard, 'a hard knock').toBeGreaterThan(15);
  expect(dx, 'pushed back off the rail to the right, leftward').toBeLessThan(-0.9);
  expect(knock!.squash, 'the ball squashed the frame it was knocked').toBeGreaterThan(0.05);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  // sprung back within a tenth of a second, a frame at a time, and round from then on
  const after = await page.evaluate(() => {
    const g = window.game!;
    const out: number[] = [];
    for (let f = 0; f < 8; f++) {
      g.step(1);
      out.push(g.motions().squash);
    }
    return out;
  });
  expect(Math.min(...after), 'a little long as it springs back').toBeLessThan(0);
  expect(after[6], 'round again').toBe(0);
  expect(after[7]).toBe(0);
  // a hole begun again mid-squash begins with the ball round, and the camera gliding back from where it was
  await page.evaluate(() => {
    const g = window.game!;
    for (let f = 0; f < 600 && !g.state().ready; f++) g.step(1);
    g.events();
    g.shoot(0, 1);
    for (let f = 0; f < 60 && !g.events().some((e) => e.startsWith('knocked')); f++) g.step(1);
  });
  const restarted = await page.evaluate(() => {
    const g = window.game!;
    const squashed = g.motions().squash;
    const before = g.project(0, 0, 0);
    g.startHole(0);
    g.step(1);
    const now = g.project(0, 0, 0);
    return { squashed, after: g.motions(), moved: Math.hypot(now.x - before.x, now.y - before.y) };
  });
  expect(restarted.squashed, 'knocked again, and squashed').toBeGreaterThan(0);
  expect(restarted.after.squash, 'round on the tee').toBe(0);
  expect(restarted.moved, 'the camera a frame on from where it was').toBeLessThan(1);
  expect(restarted.after.glide, 'and gliding back to the tee').toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('the aim pulses while a drag is held, and is gone when it is let go', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  expect((await page.evaluate(() => window.game!.motions())).pulse, 'no drag, no pulse').toBe(0);
  await drag(page, at, { x: at.x, y: at.y + 150 }, { hold: true });
  const pulses = await page.evaluate(() => {
    const g = window.game!;
    const out: number[] = [];
    for (let f = 0; f < 60; f++) {
      g.step(1);
      out.push(g.motions().pulse);
    }
    return out;
  });
  expect(Math.max(...pulses), 'swelling').toBeGreaterThan(0.08);
  expect(Math.min(...pulses), 'and easing').toBeLessThan(-0.08);
  await page.mouse.up();
  const after = await page.evaluate(() => {
    window.game!.step(1);
    return window.game!.motions().pulse;
  });
  expect(after, 'let go: no dots drawn the next frame').toBe(0);
  expect(await page.evaluate(() => window.game!.state().strokes), 'and struck').toBe(1);
  expect(problems).toEqual([]);
});

test('a ball knocked in the cup as it drops is holed once, and nothing of the knock is drawn', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const told = await page.evaluate(() => {
    const g = window.game!;
    const { cup } = g.content();
    // through the middle of the cup at about 15, as fast as drops: it knocks the far wall on its way down
    g.place(g.bodies('ball')[0].slot, cup.x, cup.y - 4, 1);
    g.step(30);
    g.events();
    g.shoot(Math.PI / 2, (Math.sqrt(15 * 15 + 2 * 16 * 2.55) / g.content().hardest) ** 2);
    const out: string[] = [];
    let drawn = 0;
    for (let f = 0; f < 120; f++) {
      g.step(1);
      const now = g.events();
      out.push(...now);
      if (out.some((e) => e.startsWith('holed'))) drawn = Math.max(drawn, Math.abs(g.motions().squash));
    }
    return { out, drawn };
  });
  const holed = told.out.findIndex((e) => e.startsWith('holed'));
  expect(holed, 'holed').toBeGreaterThanOrEqual(0);
  expect(told.out.filter((e) => e.startsWith('holed')).length, 'once').toBe(1);
  expect(
    told.out.slice(0, holed).some((e) => e.startsWith('knocked')),
    'knocked on the way down',
  ).toBe(true);
  expect(told.drawn, 'no ball to squash once it is in').toBe(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('the round finished to the card, and begun again from its button', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const { holes } = await page.evaluate(() => window.game!.content());
  await page.evaluate((last) => window.game!.startHole(last), holes.length - 1);
  // played to the cup or to the limit, whichever comes first: either finishes the hole, and the round
  for (let stroke = 1; stroke <= 12; stroke++) {
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
  // everything that answered the last hole is over by the card: nothing kept past its end, and the gold's glints back to
  // a twinkle at most
  const card = await page.evaluate(() => window.game!.motions());
  expect({ ...card, glints: 0 }).toEqual({ squash: 0, waggle: 0, flash: 0, glints: 0, glide: 0, pulse: 0 });
  expect(card.glints).toBeLessThanOrEqual(1);
  await page.locator('#again').click();
  const again = await page.evaluate(() => window.game!.state());
  expect(again.hole).toBe(0);
  expect(again.card).toEqual([]);
  expect(again.ready).toBe(true);
  await expect(page.locator('#card')).toBeHidden();
  expect((await page.evaluate(() => window.game!.motions())).glide, 'gliding back to the first tee').toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('a ball putted into the water costs a stroke, is splashed, and comes back to where it was struck from', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const pond = (await page.evaluate(() => window.game!.content())).holes.findIndex((h) => h.name === 'Pond');
  await page.evaluate((i) => window.game!.startHole(i), pond);
  const tee = await page.evaluate(() => window.game!.content().tee);
  // straight up the hole from the tee, into the pond across it
  await page.evaluate(() => window.game!.shoot(Math.PI / 2 + 0.25, 0.45));
  let splashed = false;
  for (let f = 0; f < 300 && !splashed; f += 10) {
    await play(page, 10, 'rolling into the pond');
    splashed = (await page.evaluate(() => window.game!.state().strokes)) === 2;
  }
  expect(splashed, 'a stroke more for the water').toBe(true);
  await expect(page.locator('#toast')).toHaveText('In the water! +1');
  const back = await page.evaluate(() => window.game!.ball());
  expect(back.x).toBeCloseTo(tee.x, 0);
  expect(back.y).toBeCloseTo(tee.y, 0);
  await expect(page.locator('#strokes b')).toHaveText('2');
  expect(problems).toEqual([]);
});

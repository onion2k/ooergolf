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
import { scoreName } from '../src/score';
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
  await expect(page.locator('#toast'), "the score's name").toHaveText(scoreName(done.card[0], done.par));
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

test('a hole of The Moors, a hundred units from tee to cup, played out by drags, the camera following the ball the whole way', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => {
    window.game!.chooseCourse('The Moors');
    window.game!.startHole(0);
    window.game!.step(75);
  });
  const { holes } = await page.evaluate(() => window.game!.content());
  expect(holes.length, 'nine holes').toBe(9);
  let strokes = 0;
  for (let stroke = 1; stroke <= 9; stroke++) {
    await puttAsSuggested(page);
    strokes = stroke;
    for (let f = 0; f < 12 * 60; f += 10) {
      await play(page, 10, `stroke ${stroke}`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') break;
    // the camera has followed the ball a long way up the hole: it is still well on the screen a moment after it stops
    await play(page, 40, `after stroke ${stroke}`);
    const onScreen = await page.evaluate(() => {
      const b = window.game!.ball();
      const p = window.game!.project(b.x, b.y, b.z);
      return p.x > innerWidth * 0.1 && p.x < innerWidth * 0.9 && p.y > innerHeight * 0.1 && p.y < innerHeight * 0.9;
    });
    expect(onScreen, `the ball in view after stroke ${stroke}`).toBe(true);
  }
  const done = await page.evaluate(() => window.game!.state());
  expect(done.phase, 'holed').toBe('done');
  expect(done.course).toBe('The Moors');
  expect(done.card.length).toBe(1);
  // a hundred units at the putter's fifty a stroke: three at the least, and a hole of its own par or so
  expect(strokes, 'not in one or two').toBeGreaterThanOrEqual(3);
  expect(done.card[0], 'inside its limit').toBeLessThan(done.par + 5);
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#holeName')).toContainText('Wide Open');
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
  // and the water of the last hole, behind the card, twinkles as it does always, and the last stroke's puff is a stroke's
  expect(card.sparkles).toBeLessThanOrEqual(6);
  expect({ ...card, glints: 0, sparkles: 0, sparklesAt: [], puff: null }).toEqual({
    squash: 0,
    waggle: 0,
    flash: 0,
    glints: 0,
    glide: 0,
    pulse: 0,
    sparkles: 0,
    sparklesAt: [],
    splash: 0,
    puff: null,
    // no ball has come down on a hole of minigolf, which has no landing to mark
    landing: null,
  });
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
  // the water's word stays until the next stroke, and goes with it
  await untilReady(page, 'back where it was struck from');
  await expect(page.locator('#toast')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const s = window.game!.suggest()!;
      return window.game!.shoot(s.angle, s.power);
    }),
    'the next stroke taken',
  ).toBe(true);
  await expect(page.locator('#toast'), "the water's word gone with it").toBeHidden();
  expect(problems).toEqual([]);
});

/** A club chosen by its button in the bag, as the suggested shot names it, and then struck by a drag as `puttAsSuggested` does. */
async function swingAsSuggested(page: Page) {
  const club = await page.evaluate(() => window.game!.suggest()!.club);
  if (club) await page.locator(`#bagClubs button[data-club="${club}"]`).click();
  await puttAsSuggested(page);
}

test('a hole of golf played with the bag: a club chosen by its button, struck into the air by a drag, the landing marked, and played out', async ({
  page,
}, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, screen: true });
  // the course chosen as a player chooses it, from its card, and the bag is there with the driver in hand
  await expect(page.locator('#bag')).toBeHidden();
  await page.locator('#start .course', { hasText: 'The Range' }).click();
  await expect(page.locator('#start')).toBeHidden();
  await page.evaluate(() => window.game!.step(75));
  await expect(page.locator('#bag')).toBeVisible();
  await expect(page.locator('#bagClubs button')).toHaveCount(8);
  await expect(page.locator('#bagClubs button[aria-pressed="true"]')).toHaveAttribute('data-club', 'driver');
  await expect(page.locator('#bagInfo')).toContainText('Driver');
  await expect(page.locator('#help')).toContainText('swing');
  const first = await page.evaluate(() => window.game!.state());
  expect(first).toMatchObject({ course: 'The Range', golf: true, inHand: 'driver', strokes: 0, ready: true });

  // a club chosen by pressing its button: in hand, lit, and said with how far it carries
  await page.locator('#bagClubs button[data-club="pitching-wedge"]').click();
  expect((await page.evaluate(() => window.game!.state())).inHand).toBe('pitching-wedge');
  await expect(page.locator('#bagClubs button[data-club="pitching-wedge"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bagClubs button[data-club="driver"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#bagInfo')).toContainText('Pitching wedge');
  await expect(page.locator('#bagInfo')).toContainText('carries 101');

  // the aim reaches as far as the club carries, not as far as a putt rolls
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
  await drag(page, at, { x: at.x, y: at.y + 0.35 * short }, { hold: true });
  await page.evaluate(() => window.game!.step(1));
  expect(await page.evaluate(() => window.game!.aiming()), 'a full pull is a full power shot').toMatchObject({
    power: 1,
  });
  await page.mouse.up();
  const shot = await page.evaluate(() => window.game!.state());
  expect(shot.strokes, 'let go, the stroke is taken').toBe(1);

  // in the air: well above the ground, drawn above it, not yet come down, and nothing marked yet
  await play(page, 30, 'in the air');
  const air = await page.evaluate(() => {
    const g = window.game!;
    const b = g.ball();
    return {
      z: b.z,
      ready: g.state().ready,
      up: g.project(b.x, b.y, b.z),
      ground: g.project(b.x, b.y, 0),
      landing: g.motions().landing,
    };
  });
  expect(air.z, 'flying').toBeGreaterThan(8);
  expect(air.ready, 'not ready to be struck again in the air').toBe(false);
  expect(air.up.y, 'drawn above its own shadow on the ground').toBeLessThan(air.ground.y - 10);
  expect(air.landing).toBeNull();
  // and the camera keeps it in view, at every height of its flight, with the whole of the drive still to come
  for (let f = 0; f < 5; f++) {
    const seen = await page.evaluate(() => {
      const b = window.game!.ball();
      const p = window.game!.project(b.x, b.y, b.z);
      return { z: b.z, x: p.x / innerWidth, y: p.y / innerHeight };
    });
    expect(seen.x, `the ball across the screen at height ${seen.z.toFixed(0)}`).toBeGreaterThan(0.1);
    expect(seen.x).toBeLessThan(0.9);
    expect(seen.y, `the ball down the screen at height ${seen.z.toFixed(0)}`).toBeGreaterThan(0.1);
    expect(seen.y).toBeLessThan(0.9);
    await play(page, 4, 'in the air');
  }
  await info.attach('in the air', { body: await page.screenshot(), contentType: 'image/png' });

  // it comes down: told once as the first landing, and the ring opens where it landed
  let landed: string | undefined;
  for (let f = 0; f < 6 * 60 && !landed; f += 5) {
    await play(page, 5, 'coming down');
    landed = (await page.evaluate(() => window.game!.events())).find((e) => e.startsWith('landed'));
  }
  expect(landed, 'told of a landing').toBeDefined();
  const [lx, ly] = landed!.split(' ')[1].split(',').map(Number);
  const mark = await page.evaluate(() => window.game!.motions().landing);
  expect(mark, 'the mark is up').not.toBeNull();
  expect(mark!.radius).toBeGreaterThan(0.4);
  expect(Math.hypot(mark!.x - lx, mark!.y - ly), 'where it landed').toBeLessThan(0.15);
  await info.attach('landed', { body: await page.screenshot(), contentType: 'image/png' });
  await untilReady(page, 'after coming down');
  // and it has closed away by the time it has been looked at a while
  await play(page, 7 * 60, 'the mark closing');
  expect((await page.evaluate(() => window.game!.motions())).landing, 'the mark closed').toBeNull();

  // the hole played out with the clubs the autopilot would choose, each pressed as a player presses it
  const purse = (await page.evaluate(() => window.game!.state())).coins;
  for (let stroke = 2; stroke <= 9; stroke++) {
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') break;
    await swingAsSuggested(page);
    for (let f = 0; f < 15 * 60; f += 10) {
      await play(page, 10, `stroke ${stroke}`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
  }
  const done = await page.evaluate(() => window.game!.state());
  expect(done.phase, 'holed or picked up').toBe('done');
  expect(done.card.length).toBe(1);
  expect(done.card[0]).toBeLessThanOrEqual(done.par + 5);
  // a round of golf pays nothing into the shop's coins
  expect(done.coins).toBe(purse);
  await expect(page.locator('#coins')).toHaveText(String(purse));
  await expect(page.locator('#toast')).toBeVisible();
  expect(problems).toEqual([]);
});

test('a full drive is followed the whole way: the ball is in the middle of the screen at every frame from the tee to rest', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const seen = await page.evaluate(() => {
    const g = window.game!;
    g.chooseCourse('The Range');
    g.startHole(2);
    g.step(75);
    g.shoot(Math.PI / 2, 1, 'driver');
    const out: { f: number; z: number; x: number; y: number }[] = [];
    for (let f = 0; f < 600 && !(f > 5 && g.state().ready); f++) {
      g.step(1);
      const b = g.ball();
      const p = g.project(b.x, b.y, b.z);
      out.push({ f, z: b.z, x: p.x / innerWidth, y: p.y / innerHeight });
    }
    return { out, invariants: g.invariants(), ready: g.state().ready };
  });
  expect(seen.ready, 'it came to rest').toBe(true);
  expect(seen.out.length, 'a drive takes a good while').toBeGreaterThan(120);
  // an eighth in from every edge, at every frame of it: the drive at its fastest is 216 a second, and the camera must
  // not be left behind it, above the top of the screen or the words over it
  for (const s of seen.out) {
    expect(s.x, `across at frame ${s.f}, ${s.z.toFixed(0)} up`).toBeGreaterThan(0.125);
    expect(s.x, `across at frame ${s.f}`).toBeLessThan(0.875);
    expect(s.y, `down at frame ${s.f}, ${s.z.toFixed(0)} up`).toBeGreaterThan(0.125);
    expect(s.y, `down at frame ${s.f}`).toBeLessThan(0.875);
  }
  expect(seen.invariants).toEqual([]);
  expect(problems).toEqual([]);
});

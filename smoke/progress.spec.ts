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
import { PNG } from 'pngjs';
import { TILE, layoutOf } from '../src/arena';
import { facing } from '../src/camera';
import { breakOf } from '../src/green';
import { puttText } from '../src/readout';
import { DRAG } from '../src/shot';
import { scoreName } from '../src/score';
import { LIE } from '../src/surfaces';
import { FLAT } from '../test/level';
import { wideHole } from '../test/wide-hole';
import { smallHole } from './bighole';
import { BUDGET } from './budget';
import { drag, puttingHole, start, watch } from './game';
import { CONTRAST, THUMB, holeOut, openDrawer, read } from './panels';

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
  // a drag shorter than the dead zone is not a shot: a putt that softer takes the least a player can pull, as a player's would
  // (faster greens ask less of a short putt, and the autopilot's tap of a hundredth under the dead zone could not be made)
  const pull = Math.max(plan.power * DRAG.full, DRAG.dead * 1.1) * plan.short;
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

test('with the magnet cup worn the game loads, and a hole holed out is followed by the next, drawn and played', async ({
  page,
}) => {
  const problems = watch(page);
  // a player who has bought the magnet and wears it, as the save they come back to has it. Its cup is wider than a tile, which the scene
  // refused to draw: the page stopped on a blue screen as it loaded, and a hole begun in a round left the last hole's picture and panel
  // up over the next hole's physics, the ball on a tee that was not drawn and rails that were not
  await start(page, { seed: 1, paused: true, save: { coins: 500, gems: 5, owned: ['magnet'], item: 'magnet' } });
  for (const course of ['The Meadow', 'The Links']) {
    await page.evaluate((name) => window.game!.chooseCourse(name), course);
    const first = await page.evaluate(() => window.game!.content().cup);
    expect(first.radius, `${course}: the magnet's cup, 1.9 across the middle`).toBe(1.9);
    const done = await holeOut(page);
    expect(done.phase, `${course}: holed`).toBe('done');
    // the next hole begun, which is drawn as it begins: its panel names it, the card has the one score, and nothing threw
    await play(page, 200, `${course}: between holes`);
    const next = await page.evaluate(() => window.game!.state());
    expect(next.hole, `${course}: the next hole begun`).toBe(1);
    expect(next.phase).toBe('play');
    expect(next.card.length).toBe(1);
    await expect(page.locator('#holeName')).toContainText('Hole 2 of');
  }
  expect(problems).toEqual([]);
});

/** The boot screen's colour, `--boot` in `index.html`: what a screen the page has stopped on is all of, but for its words. */
const BOOT = [0xbf, 0xe3, 0xff];

for (const [label, viewport, touch] of [
  ['a desk', { width: 1280, height: 800 }, false],
  ['a phone', { width: 400, height: 860 }, true],
] as const) {
  test.describe(`a hole that cannot be drawn, on ${label}`, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch });

    test('begun mid-round, it stops the page on the boot screen, which names the hole and says why: the last hole and the shop open over it are put away, and no frame goes on', async ({
      page,
    }, info) => {
      const problems = watch(page);
      await start(page, { seed: 1, paused: true });
      // a round of two holes: one that is played out, and one that the field of grass will not cover, which the game plays and
      // the scene's models are built for, so that it is begun as a hole is and fails as it is drawn (a real refusal, not a hook)
      const wide = wideHole();
      await page.evaluate(
        ([first, second]) => {
          window.game!.playCourse([{ ...first, terrain: Float32Array.from(first.terrain) }, second]);
          window.game!.step(75);
        },
        [smallHole(), wide] as const,
      );
      await expect(page.locator('#holeName')).toContainText('Hole 1 of 2');
      await expect(page.locator('#boot'), 'the first hole is drawn: the boot screen is gone').toHaveClass(/gone/);
      expect((await holeOut(page)).phase, 'the first hole holed').toBe('done');
      // the shop open between the holes: a panel that stands over the page's others, and so over a boot screen that did not
      await page.locator('#shopOpen').click();
      await expect(page.locator('#shop')).toBeVisible();
      // on to the next hole, a frame at a time, as the frame loop does it: it is begun, and cannot be drawn
      const thrown = await page.evaluate(() => {
        try {
          for (let f = 0; f < 400 && window.game!.state().hole === 0; f++) window.game!.step(1);
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      });

      // what the player sees: the boot screen again, saying which hole and why, and nothing of the last hole
      await expect(page.locator('#boot'), 'the boot screen is up again').not.toHaveClass(/gone/);
      await expect(page.locator('#bootMsg')).toContainText(`Hole 2, ${wide.name}, could not be drawn.`);
      await expect(page.locator('#bootMsg')).toContainText('more than a field of grass covers');
      await expect(page.locator('#bootMsg'), 'told to a screen reader as it appears').toHaveAttribute('role', 'alert');
      await expect(page.locator('#boot')).toHaveCSS('opacity', '1');
      const png = await page.screenshot({ animations: 'disabled' });
      await info.attach('the page stopped', { body: png, contentType: 'image/png' });
      const shot = PNG.sync.read(png);
      const scale = shot.width / viewport.width;
      const words = (await page.locator('#bootMsg').boundingBox())!;
      const off: string[] = [];
      let looked = 0;
      for (let i = 0; i <= 12; i++)
        for (let j = 0; j <= 16; j++) {
          const x = Math.min(viewport.width - 1, Math.round((viewport.width * i) / 12));
          const y = Math.min(viewport.height - 1, Math.round((viewport.height * j) / 16));
          // the words are anti-aliased into the colour, so a point in the box round them says nothing of what is under
          if (x > words.x - 6 && x < words.x + words.width + 6 && y > words.y - 6 && y < words.y + words.height + 6)
            continue;
          looked++;
          const at = (Math.round(y * scale) * shot.width + Math.round(x * scale)) * 4;
          const rgb = [shot.data[at], shot.data[at + 1], shot.data[at + 2]];
          if (rgb.some((c, k) => Math.abs(c - BOOT[k]) > 2)) off.push(`(${x}, ${y}) is rgb(${rgb.join(', ')})`);
        }
      // a check that looked at nothing would pass in silence: the grid is 13 by 17, and only the words' own box is left out
      expect(looked, 'most of the screen was looked at').toBeGreaterThan(190);
      expect(off, 'every part of the screen but its words is the boot screen: no hole, panel or shop left up').toEqual(
        [],
      );

      // what the page did: the game has begun the hole it could not draw, and told no one it threw; and the picture is not
      // played over, by a step of the test's or by the page's own frame loop
      expect(thrown, 'the page deals with it, and does not throw it at whoever stepped the game').toBeNull();
      const stopped = await page.evaluate(() => window.game!.state());
      expect(stopped.hole, 'the game has begun the second hole').toBe(1);
      expect(stopped.phase).toBe('play');
      const stepped = await page.evaluate(() => {
        const g = window.game!;
        const was = g.state();
        g.step(120);
        const now = g.state();
        return { seconds: now.t - was.t, frames: now.frame - was.frame };
      });
      expect(stepped, 'a step of the test’s plays nothing').toEqual({ seconds: 0, frames: 0 });
      // the page's own loop, let go and given five frames to show it: it plays nothing, and asks for no frame but the test's own
      const looped = await page.evaluate(async () => {
        const g = window.game!;
        const real = window.requestAnimationFrame.bind(window);
        let asked = 0;
        window.requestAnimationFrame = (callback) => {
          asked++;
          return real(callback);
        };
        const was = g.state().t;
        g.resume();
        const ticks = 5;
        for (let k = 0; k < ticks; k++) await new Promise((resolve) => requestAnimationFrame(resolve));
        g.pause();
        window.requestAnimationFrame = real;
        return { seconds: g.state().t - was, others: asked - ticks };
      });
      expect(looped, 'the page’s own frame loop has ended').toEqual({ seconds: 0, others: 0 });
      expect(await page.evaluate(() => window.game!.invariants()), 'the game itself is as it should be').toEqual([]);
      // and it is told, once, to the console, with the error that was thrown, which is where a developer looks
      expect(problems, 'told once to the console').toHaveLength(1);
      expect(problems[0]).toContain(`Hole 2, ${wide.name}, could not be drawn.`);
      expect(problems[0]).toContain('more than a field of grass covers');
    });
  });
}

test('a hole of open country, fifty-one units from tee to cup, played out by drags, the camera following the ball the whole way', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate((hole) => {
    window.game!.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }]);
    window.game!.step(75);
  }, smallHole());
  const { holes } = await page.evaluate(() => window.game!.content());
  expect(holes.length, 'the one hole').toBe(1);
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
    // the camera has followed the ball up the hole: it is still well on the screen a moment after it stops
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
  expect(done.card.length).toBe(1);
  // fifty-one units at the putter's fifty a stroke: two at the least, and a hole of its own par or so
  expect(strokes, 'not in one').toBeGreaterThanOrEqual(2);
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
    // no ball has come down on a hole of minigolf, which has no landing to mark, and no lofted shot to preview, no wind to
    // show, no grass pressed round a ball, and no shape or spin to choose
    landing: null,
    shot: null,
    press: null,
    wind: null,
    controls: { shown: false, shape: 0, shapeText: 'Shape: Straight', spin: 0, spinText: 'Spin: Flat' },
    arrows: { shown: false, count: 0 },
    // the items' own: no glow trail without the item, one strip of cloth without the rainbow, no Retake without the
    // Mulligan, and the particles the last holing threw, which are kept to be read until the next holing (not put to nought
    // at a new hole): 84 is the plain cup's, 14 for each of five confetti colours and the sparkle, off a hole not in one
    trail: 0,
    strips: 1,
    retake: { shown: false, enabled: false },
    confetti: 84,
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
  await page.locator('#start .course', { hasText: 'The Links' }).click();
  await expect(page.locator('#start')).toBeHidden();
  await page.evaluate(() => window.game!.step(75));
  await expect(page.locator('#bag')).toBeVisible();
  await expect(page.locator('#bagClubs button')).toHaveCount(8);
  await expect(page.locator('#bagClubs button[aria-pressed="true"]')).toHaveAttribute('data-club', 'driver');
  await expect(page.locator('#bagInfo')).toContainText('Driver');
  await expect(page.locator('#help')).toContainText('swing');
  const first = await page.evaluate(() => window.game!.state());
  expect(first).toMatchObject({ course: 'The Links', golf: true, inHand: 'driver', strokes: 0, ready: true });

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
  // a round of golf pays into the shop's coins as minigolf does: a hole holed pays, and one picked up pays nothing
  if (done.card[0] < done.par + 5) expect(done.coins, 'the hole paid').toBeGreaterThan(purse);
  else expect(done.coins).toBe(purse);
  await expect(page.locator('#coins')).toHaveText(String(done.coins));
  await expect(page.locator('#toast')).toBeVisible();
  expect(problems).toEqual([]);
});

for (const [course, first] of [
  ['The Fells', 'Fell Foot'],
  ['The Isles', 'Landfall'],
] as const) {
  test(`${course} is chosen by its card on the start screen, begun on its first hole with the driver in hand, and a stroke is struck by a drag`, async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await expect(page.locator('#start .course')).toHaveCount(6);
    await page.locator('#start .course', { hasText: course }).click();
    await expect(page.locator('#start')).toBeHidden();
    await page.evaluate(() => window.game!.step(75));
    await expect(page.locator('#bag')).toBeVisible();
    await expect(page.locator('#bagClubs button')).toHaveCount(8);
    expect(await page.evaluate(() => window.game!.state())).toMatchObject({
      course,
      golf: true,
      inHand: 'driver',
      strokes: 0,
      ready: true,
    });
    expect(await page.evaluate(() => window.game!.content().holes[0].name)).toBe(first);
    const at = await page.evaluate(() => {
      const b = window.game!.ball();
      return window.game!.project(b.x, b.y, b.z);
    });
    const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
    await drag(page, at, { x: at.x, y: at.y + 0.35 * short });
    expect((await page.evaluate(() => window.game!.state())).strokes, 'let go, the stroke is taken').toBe(1);
    expect(problems).toEqual([]);
  });
}

test('a full drive is followed the whole way: the ball is in the middle of the screen at every frame from the tee to rest', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const seen = await page.evaluate(() => {
    const g = window.game!;
    g.chooseCourse('The Links');
    g.startHole(0);
    g.step(75);
    // a drive the camera follows up into the air (it is one stroke in five unless told, and this is a test of that follow)
    g.followShots('always');
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

test('a ball struck out of bounds on The Links is lost: told, a word over the course, a stroke more, and the ball back where it was struck from', async ({
  page,
}, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => {
    window.game!.chooseCourse('The Links');
    window.game!.startHole(0);
    window.game!.step(75);
  });
  const tee = await page.evaluate(() => window.game!.ball());
  // the driver, as it is at a tee; struck by a drag pulled to the right across the screen, so the ball goes off to the left,
  // at full power, across the rough and over the stakes
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
  await drag(page, at, { x: at.x + 0.36 * short, y: at.y }, { steps: 10 });
  expect(await page.evaluate(() => window.game!.state().strokes), 'the stroke is taken').toBe(1);
  let told: string | undefined;
  for (let f = 0; f < 20 * 60 && !told; f += 5) {
    await play(page, 5, 'in the air');
    told = (await page.evaluate(() => window.game!.events())).find((e) => e.startsWith('outOfBounds'));
  }
  expect(told, 'told of a ball lost out of bounds').toBeDefined();
  // a word over the course, of its own kind, and the stroke it cost; the ball is where it was struck from, at rest
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Out of bounds! +1');
  await expect(page.locator('#toast')).toHaveAttribute('data-kind', 'out');
  await expect(page.locator('#strokes b')).toHaveText('2');
  const back = await page.evaluate(() => window.game!.ball());
  expect(Math.hypot(back.x - tee.x, back.y - tee.y), 'put back on the tee').toBeLessThan(0.5);
  expect(await page.evaluate(() => window.game!.state())).toMatchObject({ strokes: 2, ready: true, phase: 'play' });
  await info.attach('out of bounds', { body: await page.screenshot(), contentType: 'image/png' });
  // the camera comes back to the tee, as a player waits a moment for it, and then the next stroke takes the word away
  await play(page, 90, 'the camera coming back');
  await putt(page, 0, 40);
  await expect(page.locator('#toast')).toBeHidden();
  expect(problems).toEqual([]);
});

/** A fairway a long way up a field with one tree standing on it, thirty-six tiles from the tee: a hole for a tree to be met on. */
function treeHole() {
  const cols = 41,
    rows = 130;
  const tee = rows - 4;
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (r === tee) return c === 20 ? 'T' : c === 19 || c === 21 ? 't' : 'f';
      if (r === tee - 36 && c === 20) return '^';
      if (r === 2 && c === 3) return 'C';
      return 'f';
    }).join(''),
  );
  return { name: 'A tree', par: 4, map };
}

test('a drive that flies into a tree is stopped by its canopy and drops, told as a knock, and a wedge over it is not', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const hole = treeHole();
  const tree = await page.evaluate((h) => {
    const g = window.game!;
    g.playCourse([h]);
    g.step(75);
    return g.content().trees[0];
  }, hole);
  expect(tree, 'a tree on the hole').toBeDefined();
  const shootAt = (from: number, club: string, power: number) =>
    page.evaluate(
      ({ tree, from, club, power }) => {
        const g = window.game!;
        // the ball put down `from` units short of the tree, straight up the field, and struck straight at it
        g.lay(tree.x, tree.y - from);
        g.step(60);
        g.events();
        g.shoot(Math.PI / 2, power, club);
        let farthest = -Infinity;
        for (let f = 0; f < 15 * 60; f++) {
          g.step(1);
          farthest = Math.max(farthest, g.ball().y - tree.y);
          if (f > 5 && g.state().ready) break;
        }
        return {
          farthest,
          knocks: g.events().filter((e) => e.startsWith('knocked')).length,
          invariants: g.invariants(),
        };
      },
      { tree, from, club, power },
    );
  // a drive from 30 short: in the canopy at ten or twelve up, stopped, never beyond the tree by more than its width
  const drive = await shootAt(30, 'driver', 1);
  expect(drive.invariants).toEqual([]);
  expect(drive.knocks, 'a knock, told').toBeGreaterThan(0);
  expect(drive.farthest, 'never through it').toBeLessThan(6);
  // and a sand wedge at full power from 38 short goes over the top, and comes down well beyond
  const over = await shootAt(38, 'sand-wedge', 1);
  expect(over.invariants).toEqual([]);
  expect(over.farthest, 'over it, and on').toBeGreaterThan(15);
  expect(problems).toEqual([]);
});

// ---- aiming a golf shot: the view that shows where it lands, the flight drawn before it is taken, the pin, the map ----

/** A long fairway with a pond across it 240 to 270 yards up, where a full drive goes in the water. */
function pondHole() {
  const cols = 81,
    rows = 200;
  const tee = rows - 4;
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (r === tee) return c === 40 ? 'T' : c === 39 || c === 41 ? 't' : 'f';
      if (r > tee - 90 && r < tee - 80) return '~';
      if (r === 2 && c === 3) return 'C';
      return 'f';
    }).join(''),
  );
  return { name: 'A pond', par: 5, map };
}

/** The Links' third hole, Long Bend, a par five, begun and the camera settled on its tee. */
async function longBend(page: Page) {
  await start(page, { seed: 11, paused: true });
  await page.evaluate(() => {
    window.game!.chooseCourse('The Links');
    window.game!.startHole(2);
    window.game!.step(300);
  });
  await expect(page.locator('#start')).toBeHidden();
}

/** A drag pressed high on the page and pulled down by `share` of the most a shot takes, `across` pixels over, held. */
async function pull(page: Page, share: number, across = 0, touch = false) {
  const size = page.viewportSize()!;
  const short = Math.min(size.width, size.height);
  const from = { x: size.width / 2, y: size.height * 0.15 };
  await drag(page, from, { x: from.x + across, y: from.y + 0.35 * short * share }, { hold: true, touch });
  await page.evaluate(() => window.game!.step(2));
}

/** Where a ground point is on the page as a share of it across and down. */
const onPage = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const g = window.game!;
      const p = g.project(x, y, g.ball().z);
      return { across: p.x / innerWidth, down: p.y / innerHeight };
    },
    [x, y] as const,
  );

test.describe('aiming a golf shot', () => {
  test('the camera stands back for the club in hand until where it lands is on the screen, and comes in for a shorter one', async ({
    page,
  }) => {
    const problems = watch(page);
    await longBend(page);
    const view = () => page.evaluate(() => window.game!.view());
    const driver = await view();
    expect(driver.distance, 'further back than the 110 a hole of minigolf allows').toBeGreaterThan(150);
    expect(driver.distance).toBeLessThanOrEqual(200);
    expect(driver.tilt, 'tipped lower for the long club').toBeGreaterThan(0.95);
    expect(driver.aiming, 'the ease is over').toBe(false);
    // a club chosen by its button: the camera eases to its view over a moment, by game time
    await page.locator('#bagClubs button[data-club="pitching-wedge"]').click();
    expect((await view()).aiming, 'on its way').toBe(true);
    await page.evaluate(() => window.game!.step(300));
    const wedge = await view();
    expect(wedge.distance, 'nearer for a club that goes a hundred yards').toBeLessThan(driver.distance - 50);
    expect(wedge.distance).toBeGreaterThanOrEqual(62);
    expect(wedge.tilt).toBeLessThan(driver.tilt);
    await page.locator('#bagClubs button[data-club="putter"]').click();
    await page.evaluate(() => window.game!.step(300));
    const putter = await view();
    expect(putter.distance, 'a putt is looked at from home').toBeCloseTo(62, 0);
    expect(putter.tilt).toBeCloseTo(0.78, 1);
    // a hole of minigolf is looked at as it always was
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.startHole(0);
      window.game!.step(300);
    });
    const meadow = await view();
    expect([meadow.distance, meadow.tilt.toFixed(2), meadow.lead]).toEqual([62, '0.78', 10]);
    expect(problems).toEqual([]);
  });

  for (const [name, viewport, touch] of [
    ['a desktop', { width: 1280, height: 800 }, false],
    ['a phone', { width: 400, height: 860 }, true],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: touch, isMobile: touch });

      test('every club shows where it lands at full power, on the screen, from where the ball lies', async ({
        page,
      }) => {
        const problems = watch(page);
        await longBend(page);
        const radii: number[] = [];
        for (const club of ['driver', '3-wood', '5-iron', '7-iron', '9-iron', 'pitching-wedge', 'sand-wedge']) {
          await page.locator(`#bagClubs button[data-club="${club}"]`).click();
          await page.evaluate(() => window.game!.step(300));
          await pull(page, 1, 0, touch);
          const shot = await page.evaluate(() => window.game!.motions().shot);
          expect(shot, `${club}: a preview drawn`).not.toBeNull();
          expect(shot!.arc, `${club}: the arc of dots`).toBeGreaterThan(10);
          expect(shot!.ring, `${club}: the ring`).not.toBeNull();
          const at = await onPage(page, shot!.ring!.x, shot!.ring!.y);
          expect(at.across, `${club}: across the screen`).toBeGreaterThan(0.1);
          expect(at.across).toBeLessThan(0.9);
          expect(at.down, `${club}: up the screen, and on it`).toBeGreaterThan(0.03);
          expect(at.down).toBeLessThan(0.93);
          radii.push(shot!.ring!.radius);
          // taken back to where it began, which is no shot (letting go of a full pull would strike the ball, and in a wind it
          // would not be at rest for the next club)
          const size = page.viewportSize()!;
          await page.mouse.move(size.width / 2, size.height * 0.15);
          await page.mouse.up().catch(() => undefined);
          if (touch) await page.evaluate(() => window.game!.step(1));
          expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
        }
        // the marks are bigger the further back the camera stands, so they read from a drive's view as from a wedge's
        expect(radii[0], "the driver's ring against the sand wedge's").toBeGreaterThan(radii[6] * 1.3);
        expect(problems).toEqual([]);
      });
    });
  }

  test('the camera comes in when the ball lies in the rough, where the club goes less far, and the pin and the map follow the ball', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    // a strip of fairway at the tee and the rough all round it, so a ball put down up the field lies in the rough
    const cols = 61,
      rows = 130;
    const map = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
        if (r === rows - 4) return c === 30 ? 'T' : c === 29 || c === 31 ? 't' : 'f';
        if (r === 2 && c === 3) return 'C';
        return 'r';
      }).join(''),
    );
    await page.evaluate((m) => {
      const g = window.game!;
      g.playCourse([{ name: 'Rough', par: 4, map: m }]);
      g.step(300);
    }, map);
    const view = () => page.evaluate(() => window.game!.view());
    const tee = await view();
    const pin = await page.locator('#pin').textContent();
    // the ball lies in the rough thirty yards up: a driver goes little more than half as far from there, so the camera comes in
    await page.evaluate(() => {
      const g = window.game!;
      const b = g.ball();
      g.lay(b.x, b.y + 30);
      g.step(300);
    });
    const rough = await view();
    expect(rough.distance, 'nearer, for a club that goes less far from the rough').toBeLessThan(tee.distance - 15);
    expect(rough.aiming, 'and settled').toBe(false);
    await expect(page.locator('#pin')).not.toHaveText(pin!);
    expect(problems).toEqual([]);
  });

  test('a held drag straight up the view draws the flight and says where it lands, has no reason to move the camera, and is gone when taken back', async ({
    page,
  }) => {
    const problems = watch(page);
    await longBend(page);
    const before = await page.evaluate(() => window.game!.view());
    // a pull of three fifths, which a camera that looked at the drag's own landing would be moved by
    await pull(page, 0.6);
    const held = await page.evaluate(() => window.game!.motions().shot);
    expect(held).not.toBeNull();
    expect(held!.end).toBe('landed');
    expect(held!.carry, 'three fifths of a drive carries about a hundred and fifty').toBeGreaterThan(130);
    expect(held!.carry).toBeLessThan(175);
    await expect(page.locator('#bagInfo')).toContainText(`lands ${Math.round(held!.carry)}`);
    await expect(page.locator('#bagInfo')).toContainText('Driver');
    // the camera did not move (the aim is the way it already faces), nor the aim, for as long as it is held
    const aim = await page.evaluate(() => window.game!.aiming());
    for (let k = 0; k < 4; k++) {
      await page.evaluate(() => window.game!.step(15));
      expect(await page.evaluate(() => window.game!.aiming())).toEqual(aim);
      expect(await page.evaluate(() => window.game!.motions().shot!.ring)).toEqual(held!.ring);
    }
    const after = await page.evaluate(() => window.game!.view());
    expect([after.distance, after.tilt, after.lead, after.azimuth]).toEqual([
      before.distance,
      before.tilt,
      before.lead,
      before.azimuth,
    ]);
    // a spread is shown round the ring, which a swing may miss by
    expect(held!.spread, 'the spread of a swing that is not true').not.toBeNull();
    expect(held!.spread!.across).toBeGreaterThan(5);
    // half that pull is about half as far, for the same aim (a little over, since a ball comes down a little below where it left)
    await page.mouse.move(640, 120 + 0.35 * 800 * 0.3);
    await page.evaluate(() => window.game!.step(2));
    const half = await page.evaluate(() => window.game!.motions().shot);
    // (on ground that rises and falls a shorter pull is not exactly half as far, so this is a bracket and not a figure)
    expect(half!.carry / held!.carry).toBeGreaterThan(0.3);
    expect(half!.carry / held!.carry).toBeLessThan(0.65);
    // taken back to where it began, it is no shot: the flight goes, the words go back to the carry, and no stroke is taken
    await page.mouse.move(640, 120);
    await page.evaluate(() => window.game!.step(2));
    expect(await page.evaluate(() => window.game!.motions().shot)).toBeNull();
    await expect(page.locator('#bagInfo')).toContainText('carries');
    await page.mouse.up();
    expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
    expect(problems).toEqual([]);
  });

  test('a held drag turns the camera to look the way it aims, and a drag taken back leaves it looking there', async ({
    page,
  }) => {
    const problems = watch(page);
    await longBend(page);
    const view = () => page.evaluate(() => window.game!.view());
    const before = await view();
    // pulled back and well across: the shot goes up the course and a good way to the left of it
    await pull(page, 0.6, 300);
    const aim = (await page.evaluate(() => window.game!.aiming()))!;
    expect(aim).not.toBeNull();
    // the view turns to look the way the aim goes; the aim itself does not change as it does (it is read through the view the
    // drag began in), however many frames go by
    const heading = (await view()).heading;
    // with the aim on the edge of the dead zone, which is `AIM_DEAD.half` off the way the camera looks
    const edge = -Math.sign(Math.PI / 2 - aim.angle) * 0.2;
    expect(
      Math.abs(heading - (Math.PI / 2 - aim.angle + edge)),
      'looks to keep the aim on the dead zone’s edge',
    ).toBeLessThan(1e-9);
    expect(Math.abs(heading), 'and that is not the way it was looking').toBeGreaterThan(0.3);
    for (let k = 0; k < 8; k++) {
      await page.evaluate(() => window.game!.step(15));
      expect(await page.evaluate(() => window.game!.aiming())).toEqual(aim);
    }
    const turned = await view();
    expect(turned.azimuth).toBeCloseTo(heading, 3);
    expect([turned.distance, turned.tilt, turned.lead]).toEqual([before.distance, before.tilt, before.lead]);
    // taken back to where it began: no shot, and no stroke, and the camera is left looking where it was turned to
    const from = { x: (page.viewportSize()!.width / 2) | 0, y: (page.viewportSize()!.height * 0.15) | 0 };
    await page.mouse.move(from.x, from.y);
    await page.evaluate(() => window.game!.step(2));
    expect(await page.evaluate(() => window.game!.motions().shot)).toBeNull();
    await page.mouse.up();
    expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
    await page.evaluate(() => window.game!.step(300));
    const left = await view();
    expect(left.azimuth).toBe(turned.azimuth);
    expect(left.heading).toBe(turned.heading);
    expect(problems).toEqual([]);
  });

  test('the shot taken comes down inside the spread the preview showed, which is where the game puts the ball, struck true, at most', async ({
    page,
  }) => {
    const problems = watch(page);
    for (const seed of [3, 8, 21]) {
      await longBend(page);
      await page.evaluate((s) => window.game!.seed(s), seed);
      await pull(page, 1, 12);
      const shot = await page.evaluate(() => window.game!.motions().shot);
      const aim = await page.evaluate(() => window.game!.aiming());
      expect(shot && aim).toBeTruthy();
      await page.mouse.up();
      let landed: string | undefined;
      for (let f = 0; f < 8 * 60 && !landed; f += 5) {
        await play(page, 5, 'in flight');
        landed = (await page.evaluate(() => window.game!.events())).find((e) => e.startsWith('landed'));
      }
      expect(landed, `seed ${seed}: told of a landing`).toBeDefined();
      const [lx, ly] = landed!.split(' ')[1].split(',').map(Number);
      // in the spread's own axes: along the aim and across it, from the ellipse's middle
      const s = shot!.spread!;
      const u = (lx - s.x) * Math.cos(aim!.angle) + (ly - s.y) * Math.sin(aim!.angle);
      const v = -(lx - s.x) * Math.sin(aim!.angle) + (ly - s.y) * Math.cos(aim!.angle);
      // inside what a swing can do: within its scatter across, and between the worst mishit and the ring along
      const where = `seed ${seed}: landed ${u.toFixed(1)} along and ${v.toFixed(1)} across of a spread ${s.along.toFixed(1)} by ${s.across.toFixed(1)}`;
      expect(Math.abs(u), where).toBeLessThan(s.along + 1.5);
      expect(Math.abs(v), where).toBeLessThan(s.across + 1.5);
      // and never past the ring, which is the true swing's landing, by more than the ball's own width
      expect(Math.hypot(lx - shot!.ring!.x, ly - shot!.ring!.y)).toBeLessThan(2 * s.across + s.along + 3);
    }
    expect(problems).toEqual([]);
  });

  test('a tree in the way is marked where it knocks the ball, and a pond in the way is a blue ring and the words for it', async ({
    page,
  }, info) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const tree = await page.evaluate((h) => {
      const g = window.game!;
      g.playCourse([h]);
      g.step(300);
      return g.content().trees[0];
    }, treeHole());
    await pull(page, 1);
    const hit = await page.evaluate(() => window.game!.motions().shot);
    expect(hit!.knock, 'marked where the tree knocks it').not.toBeNull();
    expect(Math.hypot(hit!.knock!.x - tree.x, hit!.knock!.y - tree.y), 'at the tree').toBeLessThan(9);
    expect(hit!.carry, 'and it does not go the distance it would have').toBeLessThan(150);
    await expect(page.locator('#bagInfo')).toContainText('tree');
    await info.attach('a tree in the way', { body: await page.screenshot(), contentType: 'image/png' });
    await page.mouse.up();

    // a fresh hole for the pond: the ring is another colour, and the words say water
    const dry = hit!.ring!.colour;
    await page.evaluate((h) => {
      const g = window.game!;
      g.playCourse([h]);
      g.step(300);
    }, pondHole());
    await pull(page, 1);
    const wet = await page.evaluate(() => window.game!.motions().shot);
    expect(wet!.end).toBe('water');
    expect(wet!.ring!.colour, 'not the colour of a ball that comes down on the course').not.toEqual(dry);
    expect(wet!.ring!.colour[2], 'blue').toBeGreaterThan(wet!.ring!.colour[0]);
    await expect(page.locator('#bagInfo')).toContainText('water');
    await info.attach('a pond in the way', { body: await page.screenshot(), contentType: 'image/png' });
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the putter is aimed by its dots as it always was, and on a hole with greens that run at a speed its roll is drawn too: along the ground to where it rests', async ({
    page,
  }) => {
    const problems = watch(page);
    // a hole with no speed to its greens, a level hole of the test helpers: the dots and nothing else, no arc, no ring
    await start(page, { seed: 11, paused: true });
    await page.evaluate((hole) => {
      window.game!.playCourse([hole]);
      window.game!.step(300);
    }, FLAT.long);
    await page.locator('#bagClubs button[data-club="putter"]').click();
    await page.evaluate(() => window.game!.step(300));
    await pull(page, 0.5);
    expect(await page.evaluate(() => window.game!.motions().shot)).toBeNull();
    expect(await page.evaluate(() => window.game!.aiming())).not.toBeNull();
    expect(await page.evaluate(() => window.game!.motions().pulse), 'the dots').toBeGreaterThan(0);
    await page.mouse.up();

    // The Links', whose greens have a speed: the same dots, and the roll as a line along the ground to a ring
    await longBend(page);
    await page.locator('#bagClubs button[data-club="putter"]').click();
    await page.evaluate(() => window.game!.step(300));
    await pull(page, 0.5);
    const rolled = await page.evaluate(() => window.game!.motions().shot);
    expect(rolled, 'the roll').not.toBeNull();
    expect(rolled!.arc, 'dots along the ground').toBeGreaterThan(5);
    expect(rolled!.ring, 'where it rests').not.toBeNull();
    expect(rolled!.spread, 'a putt has no spread').toBeNull();
    expect(await page.evaluate(() => window.game!.aiming())).not.toBeNull();
    expect(await page.evaluate(() => window.game!.motions().pulse), 'the dots').toBeGreaterThan(0);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the pin is read off the ball, and the hole is mapped: its ground, the ball, the cup and the aim, and only on a golf hole', async ({
    page,
  }, info) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await expect(page.locator('#pin')).toBeHidden();
    await expect(page.locator('#holeMap')).toBeHidden();
    await page.locator('#start .course', { hasText: 'The Meadow' }).click();
    await page.evaluate(() => window.game!.step(75));
    await expect(page.locator('#pin')).toBeHidden();
    await expect(page.locator('#holeMap')).toBeHidden();

    await longBend(page);
    await expect(page.locator('#pin')).toBeVisible();
    const hole = await page.evaluate(() => {
      const g = window.game!;
      const c = g.content();
      const b = g.ball();
      return { cup: c.cup, ball: b };
    });
    const yards = Math.round(Math.hypot(hole.cup.x - hole.ball.x, hole.cup.y - hole.ball.y));
    await expect(page.locator('#pin')).toContainText(`${yards} yd`);
    expect(yards, 'Long Bend is a par five').toBeGreaterThan(450);

    await expect(page.locator('#holeMap')).toBeVisible();
    const map = await page.evaluate(() => window.game!.map());
    expect(map).not.toBeNull();
    expect(map!.width).toBeGreaterThan(40);
    expect(map!.height, 'a long thin hole').toBeGreaterThan(map!.width * 1.8);
    expect(map!.ball[1], 'the ball at the bottom, where the tee is').toBeGreaterThan(map!.height * 0.8);
    expect(map!.cup[1], 'the cup at the top').toBeLessThan(map!.height * 0.2);
    // the picture is on the canvas: ground where the ball is, and the ball in white over it
    const px = await page.evaluate(() => {
      const c = document.getElementById('holeMap') as HTMLCanvasElement;
      const m = window.game!.map()!;
      const d = c.getContext('2d')!.getImageData(Math.round(m.ball[0]), Math.round(m.ball[1]), 1, 1).data;
      const corner = c.getContext('2d')!.getImageData(0, 0, 1, 1).data;
      return { ball: Array.from(d), corner: Array.from(corner) };
    });
    expect(px.ball[3], 'painted').toBe(255);
    expect(Math.min(px.ball[0], px.ball[1], px.ball[2]), 'the ball is white').toBeGreaterThan(200);
    expect(px.corner[3], 'nothing off the hole').toBe(0);
    await info.attach('the map', { body: await page.screenshot(), contentType: 'image/png' });

    // the aim is on the map while a shot is aimed, and the pin is read from where the ball comes to rest
    await pull(page, 1);
    const aimed = await page.evaluate(() => window.game!.map()!.aim);
    expect(aimed, 'the aim line and its ring on the map').not.toBeNull();
    expect(aimed![1], 'up the hole from the ball').toBeLessThan(map!.ball[1]);
    await page.mouse.up();
    await untilReady(page, 'after the drive');
    const rest = await page.evaluate(() => window.game!.ball());
    const left = Math.round(Math.hypot(hole.cup.x - rest.x, hole.cup.y - rest.y));
    expect(left).toBeLessThan(yards - 100);
    await expect(page.locator('#pin')).toContainText(`${left} yd`);
    expect(problems).toEqual([]);
  });
});

// ---- shape, spin and wind: the buttons that choose them, the preview that shows them, and the wind that is told ----

/** A plain fairway a long way up a field, with its wind in miles an hour (calm for nought): a hole for a shape and a wind to be seen on. */
function windHole(name: string, wind: number) {
  const cols = 61,
    rows = 130;
  const tee = rows - 4;
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (r === tee) return c === 30 ? 'T' : c === 29 || c === 31 ? 't' : 'f';
      if (r === 2 && c === 3) return 'C';
      return 'f';
    }).join(''),
  );
  return { name, par: 4, map, wind };
}

/** A hole of the test's own begun and the camera settled on its tee. */
async function onHole(page: Page, hole: ReturnType<typeof windHole>) {
  await page.evaluate((h) => {
    const g = window.game!;
    g.playCourse([h]);
    g.step(300);
  }, hole);
  await expect(page.locator('#start')).toBeHidden();
}

/** A button of the bag's pressed as a click on the element presses it, which a drag held on the course is not let go by. */
const press = (page: Page, selector: string) => page.locator(selector).evaluate((el: HTMLElement) => el.click());

test.describe('shape, spin and wind', () => {
  test('the shape and spin buttons each cycle through their three by a real click, are there for a lofted club on a golf hole and nowhere else, and are put back when a shot is struck', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    // under the start screen, and on a hole of minigolf, there are none
    await expect(page.locator('#bagShaping')).toBeHidden();
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.step(60);
    });
    await expect(page.locator('#bagShaping')).toBeHidden();
    expect((await page.evaluate(() => window.game!.motions().controls)).shown).toBe(false);
    await onHole(page, windHole('Calm', 0));
    await expect(page.locator('#bagShaping')).toBeVisible();
    const shape = page.locator('#shapeButton'),
      spin = page.locator('#spinButton');
    const state = () => page.evaluate(() => ({ shape: window.game!.state().shape, spin: window.game!.state().spin }));
    // straight and flat to begin with, the buttons say so, and so does the game
    await expect(shape).toHaveText('Shape: Straight');
    await expect(spin).toHaveText('Spin: Flat');
    expect(await state()).toEqual({ shape: 0, spin: 0 });
    // each a click on to the next, and round again: straight, draw, fade; flat, back, top
    for (const [word, value, aria] of [
      ['Draw', -1, 'draw'],
      ['Fade', 1, 'fade'],
      ['Straight', 0, 'straight'],
    ] as const) {
      await shape.click();
      await expect(shape).toHaveText(`Shape: ${word}`);
      await expect(shape).toHaveAttribute('data-shape', String(value));
      await expect(shape).toHaveAttribute('aria-label', new RegExp(`^Shape: ${aria}`));
      expect((await state()).shape).toBe(value);
    }
    for (const [word, value, aria] of [
      ['Back', -1, 'backspin'],
      ['Top', 1, 'topspin'],
      ['Flat', 0, 'flat'],
    ] as const) {
      await spin.click();
      await expect(spin).toHaveText(`Spin: ${word}`);
      await expect(spin).toHaveAttribute('data-spin', String(value));
      await expect(spin).toHaveAttribute('aria-label', new RegExp(`^Spin: ${aria}`));
      expect((await state()).spin).toBe(value);
    }
    // what the test API reads back is what the buttons draw
    await shape.click();
    await spin.click();
    expect(await page.evaluate(() => window.game!.motions().controls)).toEqual({
      shown: true,
      shape: -1,
      spin: -1,
      shapeText: 'Shape: Draw',
      spinText: 'Spin: Back',
    });
    // the putter has neither, and the driver again has them
    await page.locator('#bagClubs button[data-club="putter"]').click();
    await expect(page.locator('#bagShaping')).toBeHidden();
    expect((await page.evaluate(() => window.game!.motions().controls)).shown).toBe(false);
    await page.locator('#bagClubs button[data-club="driver"]').click();
    await expect(page.locator('#bagShaping')).toBeVisible();
    // a shot struck by a drag puts both back to straight and flat, in the game and on the buttons
    // (a draw and a back spin from above, so one press on each goes on to a fade and a topspin)
    await shape.click();
    await expect(shape).toHaveText('Shape: Fade');
    await spin.click();
    await page.evaluate(() => window.game!.step(300));
    await pull(page, 0.5);
    await page.mouse.up();
    await play(page, 5, 'the shot struck');
    expect(await page.evaluate(() => window.game!.state().strokes)).toBe(1);
    expect(await state(), 'put back in the game').toEqual({ shape: 0, spin: 0 });
    await expect(shape).toHaveText('Shape: Straight');
    await expect(spin).toHaveText('Spin: Flat');
    // a choice made, and the hole begun again, is put back too
    await shape.click();
    await page.evaluate(() => window.game!.startHole(0));
    await play(page, 5, 'the hole begun');
    expect(await state()).toEqual({ shape: 0, spin: 0 });
    await expect(shape).toHaveText('Shape: Straight');
    // a shape and a spin given to the test API's shot are shown and put back as well
    await page.evaluate(() => window.game!.shoot(Math.PI / 2, 0.4, 'driver', 1, -1));
    await play(page, 5, 'a shot of the test API');
    expect(await state()).toEqual({ shape: 0, spin: 0 });
    expect(problems).toEqual([]);
  });

  test('the preview of a fade ends to the right of the straight shot, and of a draw to the left, and the words and the spread say so', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await onHole(page, windHole('Calm', 0));
    // a full drive straight up the field, held
    await pull(page, 1);
    const straight = await page.evaluate(() => window.game!.motions().shot);
    expect(straight, 'a preview drawn').not.toBeNull();
    await expect(page.locator('#bagInfo')).not.toContainText('fade');
    // a fade chosen while the drag is held draws the flight again, without the finger moving
    await press(page, '#shapeButton');
    await press(page, '#shapeButton');
    await page.evaluate(() => window.game!.step(2));
    const fade = await page.evaluate(() => window.game!.motions().shot);
    expect(fade).not.toBeNull();
    // up the field is up the screen, and to the right of that is +x: a fade comes down to the right of the straight shot
    expect(fade!.ring!.x - straight!.ring!.x, 'the ring of a fade is to the right of the straight one').toBeGreaterThan(
      2,
    );
    expect(fade!.heading, 'its heading is turned clockwise from the aim').toBeLessThan(straight!.heading);
    await expect(page.locator('#bagInfo')).toContainText('fade');
    await expect(page.locator('#bagInfo')).toContainText('Driver');
    // the spread lies along the way the ball went, and not the way it was aimed
    expect(fade!.spread, 'the spread of a swing that is not true').not.toBeNull();
    expect(Math.cos(fade!.spread!.heading - fade!.heading), 'its long axis along the heading').toBeGreaterThan(0.98);
    // the same drag with a draw comes down to the left, and the map's ring moved with it
    const map = await page.evaluate(() => window.game!.map()!.aim);
    // fade, straight, draw
    await press(page, '#shapeButton');
    await press(page, '#shapeButton');
    await page.evaluate(() => window.game!.step(2));
    const draw = await page.evaluate(() => window.game!.motions().shot);
    expect(straight!.ring!.x - draw!.ring!.x, 'the ring of a draw is to the left').toBeGreaterThan(2);
    await expect(page.locator('#bagInfo')).toContainText('draw');
    const mapDraw = await page.evaluate(() => window.game!.map()!.aim);
    expect(mapDraw![0], 'on the map, the aim ends to the left of where the fade did').toBeLessThan(map![0]);
    // a spin is said in the words, and does not move the flight in the air
    await press(page, '#shapeButton');
    await press(page, '#shapeButton');
    await press(page, '#spinButton');
    await page.evaluate(() => window.game!.step(2));
    const back = await page.evaluate(() => window.game!.motions().shot);
    await expect(page.locator('#bagInfo')).toContainText('back');
    expect(Math.hypot(back!.ring!.x - straight!.ring!.x, back!.ring!.y - straight!.ring!.y)).toBeLessThan(0.5);
    await page.mouse.up();
    expect(problems).toEqual([]);
  });

  test('the wind is told under the pin on a golf hole: calm for none, and for a wind its miles an hour with an arrow that points the way it blows on the screen, turning with the camera; and it is not there on minigolf', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await expect(page.locator('#wind')).toBeHidden();
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.step(60);
    });
    await expect(page.locator('#wind'), 'none on minigolf').toBeHidden();
    expect(await page.evaluate(() => window.game!.motions().wind)).toBeNull();
    // calm: the word, and no arrow
    await onHole(page, windHole('Calm', 0));
    await expect(page.locator('#wind')).toBeVisible();
    await expect(page.locator('#windText')).toHaveText('calm');
    await expect(page.locator('#windArrow')).toBeHidden();
    expect(await page.evaluate(() => window.game!.motions().wind)).toMatchObject({ text: 'calm' });
    expect((await page.evaluate(() => window.game!.state().wind)).speed).toBe(0);
    const calm = await page.evaluate(() => window.game!.view());
    // twelve miles an hour: the number, and an arrow
    await onHole(page, windHole('Breezy', 12));
    await expect(page.locator('#windText')).toHaveText('12 mph');
    await expect(page.locator('#windArrow')).toBeVisible();
    const wind = await page.evaluate(() => window.game!.state().wind);
    expect(wind.speed).toBe(12);
    expect(Math.hypot(wind.x, wind.y), 'a direction, as a unit vector').toBeCloseTo(1, 6);
    const arrow = () => page.evaluate(() => window.game!.motions().wind!);
    const drawn = async () =>
      page.locator('#windArrow').evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return (Math.atan2(m.b, m.a) * 180) / Math.PI;
      });
    const first = await arrow();
    expect(first.text).toBe('12 mph');
    // what the stylesheet draws is what the test API reads back
    expect(Math.abs((((await drawn()) - first.degrees + 540) % 360) - 180)).toBeLessThan(0.5);
    // where the wind blows on the page, from where it carries a point of the course (the tilt of the view squeezes what runs up the screen, so within thirty degrees): the arrow is turned that way, clockwise from up
    const onScreen = () =>
      page.evaluate((w) => {
        const g = window.game!;
        const b = g.ball();
        const from = g.project(b.x, b.y, b.z),
          to = g.project(b.x + w.x * 20, b.y + w.y * 20, b.z);
        return (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
      }, wind);
    const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    expect(gap(first.degrees, await onScreen()), 'the arrow points as the wind goes on the screen').toBeLessThan(30);
    // the camera turned by a quarter turn turns the arrow the other way by as much, and every turn after it
    for (const turn of [Math.PI / 2, 0.7, -2.2]) {
      const before = (await arrow()).degrees;
      await page.evaluate((t) => {
        window.game!.orbit(t, 0);
        window.game!.step(1);
      }, turn);
      const after = (await arrow()).degrees;
      expect(gap(after, before - (turn * 180) / Math.PI), `after a turn of ${turn}`).toBeLessThan(0.5);
      expect(gap(after, await onScreen()), `and on the screen after a turn of ${turn}`).toBeLessThan(30);
    }
    // a wind never makes the camera stand nearer than a calm one: a tailwind's reach is in the view
    await page.evaluate(() => window.game!.startHole(0));
    await page.evaluate(() => window.game!.step(300));
    const windy = await page.evaluate(() => window.game!.view());
    expect(windy.distance).toBeGreaterThanOrEqual(calm.distance - 1e-9);
    // the strongest wind there is, and back to calm, and the words follow
    await onHole(page, windHole('Gale', 25));
    await expect(page.locator('#windText')).toHaveText('25 mph');
    await onHole(page, windHole('Calm', 0));
    await expect(page.locator('#windText')).toHaveText('calm');
    expect(problems).toEqual([]);
  });
});

// ---- the grass of a golf hole: the rough, and only the rough; and the ball in it seen ----

/**
 * A golf hole 61 tiles across and 130 long with every kind of ground in bands up it: a fairway down the middle, rough either
 * side, out of bounds beyond that, and rock beyond that, inside the rail. Returns it with the middle of a tile of each kind, in
 * world units (the hole is centred on nought).
 */
function bandsHole() {
  const cols = 61,
    rows = 130;
  const map = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
      if (c <= 5 || c >= cols - 6) return ' ';
      if (c <= 11 || c >= cols - 12) return 'x';
      if (r === rows - 4) return c === 30 ? 'T' : c === 29 || c === 31 ? 't' : 'f';
      if (r === 2 && c === 30) return 'C';
      if (c >= 25 && c <= 35) return 'f';
      return 'r';
    }).join(''),
  );
  const at = (r: number, c: number) => ({ x: -91.5 + (c + 0.5) * 3, y: -195 + (rows - 1 - r + 0.5) * 3 });
  return {
    hole: { name: 'Bands', par: 4, map },
    rough: at(60, 18),
    fairway: at(60, 30),
    stakes: at(60, 8),
    rock: at(60, 3),
    beyond: { x: -91.5 - 40, y: 0 },
  };
}

test.describe('the grass of a golf hole', () => {
  test('grows in the rough and on the fairway and nowhere else: not past the stakes, on the rock beyond them, or beyond the hole', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const b = bandsHole();
    await page.evaluate((h) => {
      window.game!.playCourse([h]);
      window.game!.step(120);
    }, b.hole);
    const blades = (p: { x: number; y: number }) =>
      page.evaluate(
        async ([x, y]) => {
          const g = window.game!;
          g.look(x, y, 30);
          g.step(2);
          return g.bladesAround(x, y, 1.4);
        },
        [p.x, p.y] as const,
      );
    expect(await blades(b.rough), 'the rough, which is long grass').toBeGreaterThan(100);
    expect(await blades(b.fairway), 'the fairway, which is short grass of its own').toBeGreaterThan(100);
    for (const [what, p] of [
      ['out of bounds, past the stakes', b.stakes],
      ['the rock beyond it', b.rock],
      ['beyond the hole', b.beyond],
    ] as const)
      expect(await blades(p), what).toBe(0);
    expect(problems).toEqual([]);
  });

  test('is pressed flat round a ball lying in the rough, so it is seen, and not round one on the fairway, in the air, or struck away', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const b = bandsHole();
    await page.evaluate((h) => {
      window.game!.playCourse([h]);
      window.game!.step(120);
    }, b.hole);
    const press = () => page.evaluate(() => window.game!.motions().press);
    // on the tee, which is the fairway: nothing is pressed, there being no blade to lose it in
    expect(await press(), 'on the tee').toBeNull();
    await page.evaluate((p) => {
      window.game!.lay(p.x, p.y);
      window.game!.step(90);
    }, b.fairway);
    expect(await press(), 'on the fairway').toBeNull();
    // in the rough: a disc of grass round the ball, wide enough that it is seen, for as long as it lies there
    await page.evaluate((p) => {
      window.game!.lay(p.x, p.y);
      window.game!.step(90);
    }, b.rough);
    const ball = await page.evaluate(() => window.game!.ball());
    const lies = await press();
    expect(lies, 'in the rough').not.toBeNull();
    expect(Math.hypot(lies!.x - ball.x, lies!.y - ball.y), 'round the ball').toBeLessThan(0.05);
    expect(lies!.radius, 'wide enough to see it in').toBeGreaterThan(2.5);
    expect(lies!.took, 'the renderer took it, there being a trample for it to press in').toBe(true);
    await page.evaluate(() => window.game!.step(240));
    expect(await press(), 'and still, as long as it lies there').not.toBeNull();
    // struck, it is in the air and rolling: nothing is pressed, and the grass is left to stand again
    await page.evaluate(() => window.game!.shoot(Math.PI / 2, 0.5, '7-iron'));
    await page.evaluate(() => window.game!.step(10));
    expect(await press(), 'in the air').toBeNull();
    expect(problems).toEqual([]);
  });

  test('is none under a hole of minigolf, which has never had its ball pressed into it, and the same blades as ever', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.step(60));
    expect(await page.evaluate(() => window.game!.motions().press)).toBeNull();
    const rough = await page.evaluate(async () => {
      const g = window.game!;
      const { floor } = g.content();
      g.look(floor.minX - 8, floor.minY - 8, 30);
      g.step(2);
      return g.bladesAround(floor.minX - 8, floor.minY - 8, 3);
    });
    expect(rough, 'the rough round a hole of minigolf').toBeGreaterThan(500);
    expect(problems).toEqual([]);
  });
});

/** The hole the putting tests play, its layout as the game builds it, and the middle of a tile of each kind of ground on it. */
const PUTTING = puttingHole(12);
const PUTTING_LAYOUT = layoutOf(PUTTING.map, Float32Array.from(PUTTING.terrain));
function middleOf(lie: number, nth: number | 'far' = 0) {
  const l = PUTTING_LAYOUT;
  const found: { x: number; y: number }[] = [];
  for (let t = 0; t < l.cols * l.rows; t++)
    if (l.lie[t] === lie && !l.solid[t] && !l.oob[t])
      found.push({ x: l.originX + ((t % l.cols) + 0.5) * TILE, y: l.originY + (Math.floor(t / l.cols) + 0.5) * TILE });
  // the one nearest the cup, then the ones after it: a tile the ball is sure to rest on, and not the cup's own
  found.sort((a, b) => Math.hypot(a.x - l.cup.x, a.y - l.cup.y) - Math.hypot(b.x - l.cup.x, b.y - l.cup.y));
  return nth === 'far' ? found.filter((p) => p.y < l.cup.y).at(-1)! : found[nth];
}

/** The putting hole played in the page, its ball put down at (x, y) and let come to rest, the putter in hand. */
async function puttingAt(page: Page, at: { x: number; y: number } | null, hole: object = PUTTING) {
  await page.evaluate(
    ([h, p]) => {
      const g = window.game!;
      const def = h as { terrain: number[] };
      g.playCourse([{ ...def, terrain: Float32Array.from(def.terrain) } as never]);
      g.step(30);
      if (p) g.lay((p as { x: number; y: number }).x, (p as { x: number; y: number }).y);
      for (let f = 0; f < 300 && !g.state().ready; f++) g.step(1);
      g.step(2);
      g.club('putter');
      // the camera eases to the putter's view, a few frames
      g.step(90);
    },
    [hole, at],
  );
}

test.describe('putting on a golf hole whose greens have a speed and a contour', () => {
  test('says how fast the greens run, shows the arrows and the break while the ball rests on the green or the first cut, and nothing off them', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    // on the tee: the speed is told, and nothing of a putt, since the ball is not on a green
    await puttingAt(page, null);
    const at = await page.evaluate(() => {
      const g = window.game!;
      return { state: g.state(), view: g.view(), arrows: g.content().arrows, motions: g.motions().arrows };
    });
    expect(at.state.greens, 'the hole’s own speed').toBe(12);
    expect(at.state.greenSpeed).toBe('fast');
    expect(at.view.greens).toBe('Fast greens');
    expect(at.view.putt, 'no putt from the tee').toBeNull();
    expect(at.arrows, 'the contour has arrows to show').toBeGreaterThan(20);
    expect(at.motions, 'and none shown from the tee').toEqual({ shown: false, count: 0 });

    // on the green, and on the first cut round it: the arrows are up, and the break is said as the layout says it
    for (const [kind, lie, nth] of [
      ['green', LIE.green, 3],
      ['cut', LIE.cut, 2],
      ['green again', LIE.green, 8],
    ] as const) {
      const spot = middleOf(lie, nth);
      await puttingAt(page, spot);
      const now = await page.evaluate(() => {
        const g = window.game!;
        return { ball: g.ball(), view: g.view(), arrows: g.motions().arrows, count: g.content().arrows };
      });
      expect(now.ball.ready, `${kind}: at rest`).toBe(true);
      expect(now.arrows, `${kind}: the arrows are shown`).toEqual({ shown: true, count: now.count });
      const want = puttText(breakOf(PUTTING_LAYOUT, now.ball.x, now.ball.y, 12));
      expect(now.view.putt, `${kind}: the break is said`).toBe(want);
      await expect(page.locator('#putt')).toHaveText(want);
      await expect(page.locator('#greens')).toHaveText('Fast greens');
    }

    // struck, the ball rolls and both are put away; at rest again, both are up and the break is the new place's
    await page.evaluate(() => {
      const g = window.game!;
      g.shoot(Math.PI / 2, 0.3);
      g.step(1);
    });
    const rolling = await page.evaluate(() => ({ view: window.game!.view(), arrows: window.game!.motions().arrows }));
    expect(rolling.arrows, 'put away while it rolls').toEqual({ shown: false, count: 0 });
    expect(rolling.view.putt, 'and the break with them').toBeNull();
    await untilReady(page, 'after the putt');
    const after = await page.evaluate(() => ({
      ball: window.game!.ball(),
      view: window.game!.view(),
      arrows: window.game!.motions().arrows,
    }));
    expect(after.arrows.shown).toBe(true);
    expect(after.view.putt).toBe(puttText(breakOf(PUTTING_LAYOUT, after.ball.x, after.ball.y, 12)));

    // on the rough or the fairway: neither
    for (const lie of [LIE.rough, LIE.fairway]) {
      const l = PUTTING_LAYOUT;
      let spot: { x: number; y: number } | undefined;
      for (let t = 0; t < l.cols * l.rows && !spot; t++)
        if (
          l.lie[t] === lie &&
          !l.oob[t] &&
          Math.hypot(l.originX + ((t % l.cols) + 0.5) * TILE - l.cup.x, 0) > 40 &&
          t % 7 === 0
        )
          spot = { x: l.originX + ((t % l.cols) + 0.5) * TILE, y: l.originY + (Math.floor(t / l.cols) + 0.5) * TILE };
      await puttingAt(page, spot!);
      const off = await page.evaluate(() => ({ view: window.game!.view(), arrows: window.game!.motions().arrows }));
      expect(off.arrows, `lie ${lie}`).toEqual({ shown: false, count: 0 });
      expect(off.view.putt, `lie ${lie}`).toBeNull();
    }
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a golf hole with no greens speed reads as it did: no speed, no break, and no arrows on its level green', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    const flat = { ...puttingHole(null), terrain: puttingHole(null).terrain.map(() => 0) };
    await puttingAt(page, middleOf(LIE.green, 3), flat);
    const seen = await page.evaluate(() => {
      const g = window.game!;
      return { state: g.state(), view: g.view(), arrows: g.motions().arrows, count: g.content().arrows };
    });
    expect(seen.state.greens).toBeNull();
    expect(seen.state.greenSpeed).toBeNull();
    expect(seen.view.greens).toBeNull();
    expect(seen.view.putt, 'no break line on a hole that has not set its greens').toBeNull();
    expect(seen.count).toBe(0);
    expect(seen.arrows).toEqual({ shown: false, count: 0 });
    await expect(page.locator('#greens')).toBeHidden();
    await expect(page.locator('#putt')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('the putt’s roll is drawn before it is struck, and the ball comes to rest where it says, after breaking across the slope', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    // a long putt across the lean, the ground rising to the east
    const spot = middleOf(LIE.green, 'far');
    await puttingAt(page, spot);
    const from = await page.evaluate(() => {
      const b = window.game!.ball();
      return { ball: b, at: window.game!.project(b.x, b.y, b.z) };
    });
    // pulled back down the page and across, as a player aims, and held
    await drag(page, from.at, { x: from.at.x - 20, y: from.at.y + 200 }, { hold: true });
    await page.evaluate(() => window.game!.step(2));
    const aimed = await page.evaluate(() => ({ aim: window.game!.aiming(), shot: window.game!.motions().shot }));
    expect(aimed.aim, 'a putt is being aimed').not.toBeNull();
    expect(aimed.shot, 'and its roll is drawn').not.toBeNull();
    expect(aimed.shot!.arc, 'in dots along the ground').toBeGreaterThan(8);
    expect(aimed.shot!.ring, 'to the ring where it rests').not.toBeNull();
    expect(aimed.shot!.spread, 'a putt has no spread').toBeNull();
    // the roll leaves the line it was aimed along: the green’s lean is in the picture
    const dir = { x: Math.cos(aimed.aim!.angle), y: Math.sin(aimed.aim!.angle) };
    const ring = aimed.shot!.ring!;
    const across = Math.abs((ring.x - from.ball.x) * -dir.y + (ring.y - from.ball.y) * dir.x);
    expect(across, 'the ring is off the aimed line by the break').toBeGreaterThan(0.3);
    // the frame with the roll, the arrows and the cut drawn is inside the budget: they cost a few hundred triangles
    const ms = await page.evaluate(() => window.game!.measureFrame());
    console.log(`putting: a frame with the roll aimed and the arrows up, ${ms.toFixed(2)} ms`);
    expect(ms, 'a frame of the putting green').toBeLessThan(BUDGET.frameMs);
    // let go: the ball comes to rest at the ring
    await page.mouse.up();
    await untilReady(page, 'after the aimed putt');
    const rest = await page.evaluate(() => window.game!.ball());
    expect(Math.hypot(rest.x - ring.x, rest.y - ring.y), 'the ball rests where the roll said').toBeLessThan(0.8);
    expect(problems).toEqual([]);
  });

  for (const [label, viewport, touch] of [
    ['a desk', { width: 1280, height: 800 }, false],
    ['a phone', { width: 400, height: 860 }, true],
  ] as const) {
    test.describe(`on ${label}`, () => {
      test.use({ viewport, hasTouch: touch, isMobile: touch });

      test('the speed and break lines fit the panel and the screen, clear of the other panels, and are readable', async ({
        page,
      }) => {
        const problems = watch(page);
        await start(page, { seed: 5, paused: true });
        await puttingAt(page, middleOf(LIE.green, 8));
        // on a phone the speed and the break are in the hole's drawer, pulled out by its chip
        const drawer = await openDrawer(page);
        const r = await read(page);
        expect(r.outside, 'nothing past the screen').toEqual([]);
        expect(r.scrollWidth).toBeLessThanOrEqual(viewport.width);
        expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
        expect(
          r.texts.some((t) => t.text.startsWith('Putt:')),
          'the break line is read',
        ).toBe(true);
        expect(r.texts.some((t) => t.text === 'Fast greens')).toBe(true);
        for (const b of r.buttons) expect(b.height, b.text).toBeGreaterThanOrEqual(Math.min(THUMB, 30));
        const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
        const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        const strokes = await box('#strokes');
        for (const sel of ['#greens', '#putt']) {
          const b = await box(sel);
          expect(b.x, `${sel} in the panel: left`).toBeGreaterThanOrEqual(strokes.x - 1);
          expect(b.x + b.width, `${sel} in the panel: right`).toBeLessThanOrEqual(strokes.x + strokes.width + 1);
          expect(b.y + b.height, `${sel} in the panel: bottom`).toBeLessThanOrEqual(strokes.y + strokes.height + 1);
        }
        const wind = await box('#wind').catch(() => null);
        const pin = await box('#pin');
        expect((await box('#greens')).y, 'under the pin').toBeGreaterThanOrEqual(pin.y + pin.height - 1);
        expect((await box('#putt')).y, 'under the speed').toBeGreaterThanOrEqual(
          (await box('#greens')).y + (await box('#greens')).height - 1,
        );
        void wind;
        // a drawer is over the other panels by design, so it is only on a desk that they are clear of it
        if (!drawer)
          for (const other of ['#purse', '#holePanel', '#bag', '#viewMode', '#viewFlag', ...(touch ? [] : ['#help'])])
            expect(apart(strokes, await box(other)), `the strokes panel and ${other} do not overlap`).toBe(true);
        expect(problems).toEqual([]);
      });
    });
  }
});

// ---- the flag button: the camera turned to face the cup, by the shortest way, whatever a drag is ----

test.describe('the flag button', () => {
  /** A golf hole begun with the ball put down east and south of the cup, so that the cup is well off to one side. */
  async function offToOneSide(page: Page) {
    await onHole(page, windHole('Off line', 0));
    await page.evaluate(() => {
      const g = window.game!;
      const { cup } = g.content();
      g.lay(cup.x + 45, cup.y - 30);
      g.step(120);
    });
  }

  /** The azimuth that faces the cup squarely from the ball, worked out here from where each is: what the flag button must turn to look near and never to. */
  const cupHeading = (page: Page) =>
    page
      .evaluate(() => {
        const g = window.game!;
        const b = g.ball();
        const c = g.content().cup;
        return { from: { x: b.x, y: b.y }, to: { x: c.x, y: c.y } };
      })
      .then(({ from, to }) => facing(from, to)!);

  /** The azimuth the flag button would turn the camera to from where the ball lies, which is the cup's own heading. */
  const toFace = (page: Page) => page.evaluate(() => window.game!.view().flag!);

  const view = (page: Page) => page.evaluate(() => window.game!.view());
  /** An angle's distance from another, the short way round. */
  const gap = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

  test('a real click turns the camera to look directly at the cup, eased, and touches neither the strokes nor the ball; the cup is then in the middle of the screen across', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await offToOneSide(page);
    const cup = await cupHeading(page);
    expect(Math.abs(cup), 'the cup is well off the line').toBeGreaterThan(0.5);
    const want = await toFace(page);
    expect(gap(want, cup), 'the way it will look is the cup’s own heading').toBeLessThan(1e-6);
    const before = await page.evaluate(() => ({ ball: window.game!.ball(), strokes: window.game!.state().strokes }));
    expect((await view(page)).turning, 'not turning before').toBe(false);
    expect(gap((await view(page)).azimuth, want), 'not facing it before').toBeGreaterThan(0.5);
    await page.locator('#viewFlag').click();
    expect((await view(page)).turning, 'turning at once').toBe(true);
    // eased: a frame on it has moved, and not all the way
    await page.evaluate(() => window.game!.step(2));
    const part = await view(page);
    expect(part.turning).toBe(true);
    expect(gap(part.azimuth, want)).toBeGreaterThan(0.01);
    expect(gap(part.azimuth, want)).toBeLessThan(gap(0, want));
    await page.evaluate(() => window.game!.step(120));
    const after = await view(page);
    expect(after.turning, 'there').toBe(false);
    expect(gap(after.azimuth, want)).toBeLessThan(1e-6);
    expect(gap(after.azimuth, cup), 'and at the cup').toBeLessThan(1e-6);
    // and nothing else was done
    expect(await page.evaluate(() => ({ ball: window.game!.ball(), strokes: window.game!.state().strokes }))).toEqual(
      before,
    );
    // the cup is on the screen, on the line down the middle
    const at = await page.evaluate(() => {
      const g = window.game!;
      const c = g.content().cup;
      return { ...g.project(c.x, c.y, g.ball().z), width: innerWidth, height: innerHeight };
    });
    expect(at.x, 'on the screen across').toBeGreaterThan(0);
    expect(at.x).toBeLessThan(at.width);
    expect(at.y, 'and down it').toBeGreaterThan(0);
    expect(at.y).toBeLessThan(at.height);
    expect(Math.abs(at.x - at.width / 2), 'in the middle across').toBeLessThan(at.width * 0.01);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('looks the same way on a second load and for any seed, and pressed again on the same lie changes nothing', async ({
    page,
  }) => {
    const problems = watch(page);
    const press = async () => {
      await offToOneSide(page);
      await page.locator('#viewFlag').click();
      await page.evaluate(() => window.game!.step(120));
      return (await view(page)).azimuth;
    };
    await start(page, { seed: 11, paused: true });
    const first = await press();
    // pressed again on the same lie it goes to the same heading
    await page.evaluate(() => window.game!.orbit(0.8, 0));
    await page.locator('#viewFlag').click();
    await page.evaluate(() => window.game!.step(120));
    expect((await view(page)).azimuth).toBe(first);
    // the heading is the cup's own, so no seed changes it
    await page.evaluate(() => window.game!.seed(12));
    expect(await toFace(page), 'another seed').toBe(first);
    // and from another load of the page with the same seed
    await start(page, { seed: 11, paused: true });
    expect(await press()).toBe(first);
    expect(problems).toEqual([]);
  });

  test('it turns the view to face the cup and leaves the overhead button as it was; the flag is not a toggle, and is put away from overhead', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await offToOneSide(page);
    const want = await toFace(page);
    await expect(page.locator('#viewFlag')).not.toHaveAttribute('aria-pressed', /.*/);
    // turned away first, so there is a turn to make
    await page.evaluate(() => {
      window.game!.orbit(1.4, 0);
      window.game!.step(1);
    });
    expect(gap((await view(page)).azimuth, want)).toBeGreaterThan(0.3);
    await page.locator('#viewFlag').click();
    await page.evaluate(() => window.game!.step(120));
    const v = await view(page);
    expect(gap(v.azimuth, want), 'facing it').toBeLessThan(1e-6);
    expect(v.mode).toBe('aim');
    await expect(page.locator('#viewOverhead')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#viewFlag')).not.toHaveAttribute('aria-pressed', /.*/);

    // from overhead there is no way to face the cup: the button is disabled, the API refuses, and the view stays as it was
    await page.locator('#viewOverhead').click();
    await page.evaluate(() => {
      window.game!.orbit(1.4, 0);
      window.game!.step(120);
    });
    const before = await view(page);
    await expect(page.locator('#viewFlag')).toBeDisabled();
    expect(await page.evaluate(() => window.game!.faceFlag()), 'refused through the API too').toBe(false);
    await page.evaluate(() => window.game!.step(60));
    const after = await view(page);
    expect(after.turning).toBe(false);
    expect(after.azimuth).toBe(before.azimuth);
    expect(after.mode, 'still overhead').toBe('overhead');
    expect(problems).toEqual([]);
  });

  test('it turns the shortest way round: a quarter turn, and one that is nearer the other way than it looks', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await offToOneSide(page);
    const want = await toFace(page);
    // from this far round, 3.5 radians one way is 2.78 the other: it goes forward, never back through nought
    for (const start of [Math.PI / 2, -Math.PI / 2, 3.5, -3.5]) {
      await page.evaluate(
        ([from]) => {
          const g = window.game!;
          g.orbit(-g.view().azimuth + from, 0);
          g.step(1);
        },
        [want + start] as const,
      );
      const first = gap((await view(page)).azimuth, want);
      expect(first, `from ${start} round`).toBeCloseTo(Math.min(Math.abs(start), 2 * Math.PI - Math.abs(start)), 6);
      await page.locator('#viewFlag').click();
      // each frame is nearer than the last, and on the same side of it, so it never goes the long way
      let last = first;
      const side = Math.sign(Math.sin(want - (want + start)));
      for (let f = 0; f < 60; f++) {
        await page.evaluate(() => window.game!.step(1));
        const az = (await view(page)).azimuth;
        const left = gap(az, want);
        expect(left, `frame ${f} from ${start}`).toBeLessThanOrEqual(last + 1e-9);
        expect(Math.sign(Math.sin(want - az)) === side || left < 1e-6, `the same way round at frame ${f}`).toBe(true);
        last = left;
      }
      // and the rest of the way, which the ease takes a little over a second to settle
      await page.evaluate(() => window.game!.step(60));
      expect(gap((await view(page)).azimuth, want)).toBeLessThan(1e-6);
      expect((await view(page)).turning).toBe(false);
    }
    expect(problems).toEqual([]);
  });

  test('a player’s own turn of the view takes it over from the turn, which is not taken up again', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await offToOneSide(page);
    const want = await toFace(page);
    await page.locator('#viewFlag').click();
    await page.evaluate(() => window.game!.step(3));
    expect((await view(page)).turning).toBe(true);
    // a player’s own turn, which there is no drag for any more: the camera orbit's setter does it as the drag did
    await page.evaluate(() => {
      window.game!.orbit(0.3, 0);
      window.game!.step(1);
    });
    const taken = await view(page);
    expect(taken.turning, 'their own turn ended it').toBe(false);
    await page.evaluate(() => window.game!.step(120));
    const later = await view(page);
    expect(later.azimuth, 'and it stays where their turn left it').toBeCloseTo(taken.azimuth, 9);
    expect(gap(later.azimuth, want), 'not at the flag').toBeGreaterThan(0.05);
    expect(problems).toEqual([]);
  });

  test('it does nothing while a drag is held, which is still the shot it was, and works again once it is let go', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await offToOneSide(page);
    const want = await toFace(page);
    await pull(page, 0.5);
    const held = await page.evaluate(() => window.game!.aiming());
    expect(held, 'a shot is being aimed').not.toBeNull();
    const before = await view(page);
    await press(page, '#viewFlag');
    expect(await page.evaluate(() => window.game!.faceFlag()), 'refused through the API too').toBe(false);
    await page.evaluate(() => window.game!.step(30));
    const after = await view(page);
    expect(after.turning).toBe(false);
    expect(after.azimuth).toBe(before.azimuth);
    expect(await page.evaluate(() => window.game!.aiming()), 'the same shot').toEqual(held);
    await page.mouse.up();
    expect(await page.evaluate(() => window.game!.state().strokes), 'and it was struck').toBe(1);
    await untilReady(page, 'after the shot');
    await press(page, '#viewFlag');
    expect((await view(page)).turning, 'turning once the drag is over').toBe(true);
    await page.evaluate(() => window.game!.step(120));
    expect(gap((await view(page)).azimuth, await toFace(page))).toBeLessThan(1e-6);
    void want;
    expect(problems).toEqual([]);
  });

  test('it is not there under the start screen, and refuses; and is there with the switch on minigolf and on golf', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await expect(page.locator('#viewFlag')).toBeHidden();
    expect(await page.evaluate(() => window.game!.faceFlag()), 'nothing under the screen').toBe(false);
    expect((await view(page)).turning).toBe(false);
    for (const course of ['The Meadow', 'The Links', 'The Fells', 'The Isles']) {
      await page.evaluate((name) => {
        window.game!.chooseCourse(name);
        window.game!.step(60);
      }, course);
      await expect(page.locator('#viewMode'), course).toBeVisible();
      await expect(page.locator('#viewFlag'), course).toBeVisible();
      await expect(page.locator('#viewFlag'), course).toHaveAccessibleName('Look at the flag');
      await expect(page.locator('#viewFlag')).toHaveAttribute('title', /flag/i);
    }
    expect(problems).toEqual([]);
  });

  test('on a hole of minigolf it turns the camera to the cup as well, from wherever the ball lies', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      window.game!.orbit(2.2, 0);
      window.game!.step(1);
    });
    expect(await page.evaluate(() => window.game!.state().golf)).toBe(false);
    const want = await toFace(page);
    await page.locator('#viewFlag').click();
    await page.evaluate(() => window.game!.step(120));
    const v = await view(page);
    expect(gap(v.azimuth, want)).toBeLessThan(1e-6);
    expect(v.turning).toBe(false);
    expect(problems).toEqual([]);
  });

  for (const [label, viewport, touch] of [
    ['a desk', { width: 1280, height: 800 }, false],
    ['a phone', { width: 400, height: 860 }, true],
    ['a narrower phone', { width: 360, height: 780 }, true],
  ] as const) {
    test.describe(`on ${label}`, () => {
      test.use({ viewport, hasTouch: touch, isMobile: touch });

      test('the switch with its flag button is read well and touches nothing: not the help (a desk\u2019s), the bag, the coins, the hole’s words or the map, on golf and on minigolf', async ({
        page,
      }) => {
        const problems = watch(page);
        const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
        const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        for (const golf of [true, false]) {
          if (golf) await longBend(page);
          else {
            await page.evaluate(() => {
              window.game!.chooseCourse('The Meadow');
              window.game!.step(60);
            });
          }
          const r = await read(page);
          expect(r.outside, 'nothing past the screen').toEqual([]);
          expect(r.scrollWidth).toBeLessThanOrEqual(viewport.width);
          expect(r.texts.filter((t) => t.ratio < CONTRAST).map((t) => `"${t.text}" ${t.ratio}:1`)).toEqual([]);
          const flag = await box('#viewFlag');
          expect(flag.height, 'a thumb high').toBeGreaterThanOrEqual(THUMB);
          expect(flag.width, 'a thumb wide').toBeGreaterThanOrEqual(THUMB);
          // as high as the pills beside it
          expect(flag.height).toBeCloseTo((await box('#viewOverhead')).height, 0);
          const panel = await box('#viewMode');
          expect(flag.x).toBeGreaterThanOrEqual(panel.x);
          expect(flag.x + flag.width).toBeLessThanOrEqual(panel.x + panel.width);
          expect(apart(flag, await box('#viewOverhead')), 'beside Overhead, not on it').toBe(true);
          const others = [...(touch ? [] : ['#help']), '#strokes', '#purse', ...(golf ? ['#bag', '#holePanel'] : [])];
          for (const other of others) {
            const o = await box(other);
            expect(apart(panel, o), `the switch and ${other} do not overlap, golf ${golf}`).toBe(true);
            expect(apart(flag, o), `the flag button and ${other} do not overlap, golf ${golf}`).toBe(true);
            // and do not touch: a pixel of the page between
            const touching =
              !(panel.x + panel.width < o.x - 0.5 || o.x + o.width < panel.x - 0.5) &&
              !(panel.y + panel.height < o.y - 0.5 || o.y + o.height < panel.y - 0.5);
            expect(touching, `the switch and ${other} do not touch, golf ${golf}`).toBe(false);
          }
        }
        expect(problems).toEqual([]);
      });
    });
  }
});

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
import { COURSES, type HoleDef } from '../src/course';
import { FEATS } from '../src/feats';
import { ITEMS } from '../src/items';
import { facing } from '../src/camera';
import { breakOf } from '../src/green';
import { links } from '../src/links';
import { onBank } from '../src/slopes';
import { puttText } from '../src/readout';
import { DRAG } from '../src/shot';
import { shareText } from '../src/daily';
import { dailyFacts } from '../src/dailywords';
import { paid } from '../src/items';
import { scoreName } from '../src/score';
import { driveWords, fromWords, lipWords, pinWords } from '../src/eventwords';
import { LIE } from '../src/surfaces';
import { zonesOf } from '../src/zones';
import { CADDIE_HOLES, FLAT } from '../test/level';
import { wideHole } from '../test/wide-hole';
import { smallHole } from './bighole';
import { BUDGET } from './budget';
import {
  TROPHIES_SAVE,
  drag,
  intoThePond,
  landed,
  puttAtCup,
  puttingHole,
  start,
  strikeThePin,
  turnTheDay,
  watch,
} from './game';
import { CONTRAST, THUMB, holeOut, openDrawer, read } from './panels';
import { alone } from './gpu';

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
  await expect(page.locator('#toastWords'), "the score's name").toHaveText(scoreName(done.card[0], done.par));
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

test('with the horseshoe worn the game loads, and a hole holed out is followed by the next, drawn and played', async ({
  page,
}) => {
  const problems = watch(page);
  // a player who has bought the horseshoe and wears it, as the save they come back to has it. Its cup is wider than a tile, which the scene
  // refused to draw once: the page stopped on a blue screen as it loaded, and a hole begun in a round left the last hole's picture and panel
  // up over the next hole's physics, the ball on a tee that was not drawn and rails that were not
  await start(page, {
    seed: 1,
    paused: true,
    save: { coins: 500, gems: 5, owned: ['horseshoe'], kit: { club: '', ball: '', accessory: 'horseshoe' } },
  });
  for (const course of ['The Meadow', 'The Links']) {
    await page.evaluate((name) => window.game!.chooseCourse(name), course);
    const first = await page.evaluate(() => window.game!.content().cup);
    expect(first.radius, `${course}: the horseshoe's cup, 1.8 across the middle`).toBe(1.8);
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

test('the shop is opened, each aisle pressed by a real pointer, one thing bought and worn from each, and a stroke played with the kit', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, save: { coins: 500, gems: 1 } });
  await page.locator('#shopOpen').click();
  await expect(page.locator('#shop')).toBeVisible();
  // each tab pressed with the pointer, its fifteen rows and the row for none shown, and the note on the ball aisle that a new ball waits for the next hole
  for (const [aisle, label, buy] of [
    ['club', 'Clubs', 'mallet'],
    ['ball', 'Balls', 'clay'],
    ['accessory', 'Accessories', 'comet'],
  ] as const) {
    await page.locator(`#shopTab-${aisle}`).click();
    await expect(page.locator(`#shopTab-${aisle}`)).toHaveText(label);
    await expect(page.locator(`#shopTab-${aisle}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#shopItems .item')).toHaveCount(16);
    if (aisle === 'ball') await expect(page.locator('#shopNote')).toBeVisible();
    else await expect(page.locator('#shopNote')).toBeHidden();
    // bought with coins, then worn, and it is the one marked in its aisle
    await page.locator(`[data-item=${buy}] button`).click();
    await expect(page.locator(`[data-item=${buy}] button`)).toHaveText('Equip');
    await page.locator(`[data-item=${buy}] button`).click();
    await expect(page.locator(`[data-item=${buy}] button`)).toHaveText('Equipped');
    await expect(page.locator('[data-item=""] button')).toHaveText('Equip');
  }
  const worn = await page.evaluate(() => window.game!.state());
  expect(worn.kit).toEqual({ club: 'mallet', ball: 'clay', accessory: 'comet' });
  expect(worn.coins).toBe(500 - 160 - 140 - 60);
  // the aisles keep what is worn when they are pressed again, and a second thing of an aisle takes the first’s place
  await page.locator('#shopTab-club').click();
  await expect(page.locator('[data-item=mallet] button')).toHaveText('Equipped');
  await page.locator('#shopClose').click();
  await expect(page.locator('#shop')).toBeHidden();
  await play(page, 10, 'after the shop');
  // and a stroke is played, by a drag, with the kit on
  await landed(page);
  await putt(page, 0, 70);
  await play(page, 5, 'the stroke');
  const after = await page.evaluate(() => window.game!.state());
  expect(after.strokes).toBe(1);
  expect(after.kit).toEqual({ club: 'mallet', ball: 'clay', accessory: 'comet' });
  await untilReady(page, 'the stroke played with the kit');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

/**
 * The boot screen's sky, from the title's own blue at the top (`#2c9cf5`) to `--boot` in `index.html` at the foot, a straight
 * gradient down the screen: what a screen the page has stopped on is all of, but for its words.
 */
const SKY = { top: [0x2c, 0x9c, 0xf5], foot: [0xbf, 0xe3, 0xff] };
/** The sky's colour `down` of the way from the top of the screen (0) to the foot (1). */
const skyAt = (down: number) => SKY.top.map((c, k) => c + (SKY.foot[k] - c) * down);

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
          const sky = skyAt(y / viewport.height);
          if (rgb.some((c, k) => Math.abs(c - sky[k]) > 3)) off.push(`(${x}, ${y}) is rgb(${rgb.join(', ')})`);
        }
      // a check that looked at nothing would pass in silence: the grid is 13 by 17, and only the words' own box, a pill now, is left out
      expect(looked, 'most of the screen was looked at').toBeGreaterThan(170);
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

test('time stands still under the hole’s menu: the game does not step and nothing is struck, and both go on when it is shut', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const t = () => page.evaluate(() => window.game!.state().t);
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const t0 = await t();
  await play(page, 30, 'before the menu');
  const t1 = await t();
  expect(t1, 'the game steps with no menu').toBeGreaterThan(t0);
  expect(await page.evaluate(() => window.game!.menu(true)), 'opened').toBe(true);
  expect((await page.evaluate(() => window.game!.state())).menu).toBe(true);
  await play(page, 60, 'under the menu');
  expect(await t(), 'sixty frames under the menu are no time').toBe(t1);
  // the menu's scrim and panel let a pointer through, so that what stops the drag is the page's own block on the course
  await page.addStyleTag({ content: '#menuScrim, #menu { pointer-events: none !important; }' });
  await drag(page, at, { x: at.x, y: at.y + 150 });
  await play(page, 2, 'a drag under the menu');
  expect(await page.evaluate(() => window.game!.state().strokes), 'nothing is struck through the menu').toBe(0);
  expect(await page.evaluate(() => window.game!.menu(false)), 'shut').toBe(false);
  await play(page, 30, 'after the menu');
  expect(await t(), 'and the game goes on').toBeGreaterThan(t1);
  await page.addStyleTag({ content: '#menuScrim, #menu { pointer-events: auto !important; }' });
  await drag(page, at, { x: at.x, y: at.y + 150 });
  await play(page, 2, 'a drag after the menu');
  expect(await page.evaluate(() => window.game!.state().strokes), 'a shot is struck again').toBe(1);
  expect(problems).toEqual([]);
});

test('the hole’s menu does not open under the start screen', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, screen: true });
  expect(await page.evaluate(() => window.game!.menu(true))).toBe(false);
  expect((await page.evaluate(() => window.game!.state())).menu).toBe(false);
  expect(problems).toEqual([]);
});

/** The menu as drawn, and the page's own say of whether time stands. */
const menuNow = (page: Page) => page.evaluate(() => ({ ...window.game!.menuShown(), up: window.game!.state().menu }));

test('the menu: its button and the escape key open and shut it, Restart begins the hole again from its tee, Give up asks twice, and Courses goes to the start screen', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await play(page, 5, 'the first frames');
  const bar = page.locator('#viewMenu');
  await expect(bar, 'the button is with the others').toBeVisible();
  // the button, by a real click: up, and its words say where the player is
  await bar.click();
  const menu = await menuNow(page);
  expect(menu.up).toBe(true);
  expect(menu.shown).toBe(true);
  expect(menu.subtitle).toMatch(/^Hole 1 · .+ · 0 strokes · par \d$/);
  expect(menu.restart, 'free of an event, a restart is there').toBe(true);
  expect(menu.note).toBe('');
  // the way back, and the escape key both ways
  await page.locator('#menuResume').click();
  expect((await menuNow(page)).up).toBe(false);
  await page.keyboard.press('Escape');
  expect((await menuNow(page)).up, 'escape opens it').toBe(true);
  await page.keyboard.press('Escape');
  expect((await menuNow(page)).up, 'and shuts it').toBe(false);
  await expect(page.locator('#menu')).toBeHidden();

  // a stroke taken, and Restart: the ball is on the tee again with no strokes, the menu gone, the hole the same
  await putt(page, 0, 120);
  await untilReady(page, 'the stroke before the restart');
  const before = await page.evaluate(() => window.game!.state());
  expect(before.strokes).toBe(1);
  await bar.click();
  expect((await menuNow(page)).subtitle).toContain('1 stroke ·');
  await page.locator('#menuRestart').click();
  const restarted = await page.evaluate(() => window.game!.state());
  expect([restarted.hole, restarted.strokes, restarted.phase, restarted.menu]).toEqual([before.hole, 0, 'play', false]);
  const tee = await page.evaluate(() => ({ ball: window.game!.ball(), tee: window.game!.content().holes[0] }));
  expect(tee.ball.z).toBeGreaterThan(0);

  // Give up: the first press asks, a shut menu forgets it, the second press picks the hole up at par and five
  await bar.click();
  const first = await menuNow(page);
  expect(first.sure).toBe(false);
  await page.locator('#menuGiveUp').click();
  const asked = await menuNow(page);
  expect(asked.sure).toBe(true);
  expect(asked.giveUp).toBe(`Give up? It scores ${restarted.par + 5}`);
  expect((await page.evaluate(() => window.game!.state())).card, 'nothing scored by one press').toEqual([]);
  await page.locator('#menuResume').click();
  await bar.click();
  expect((await menuNow(page)).sure, 'asked again from the start').toBe(false);
  await page.locator('#menuGiveUp').click();
  await page.locator('#menuGiveUp').click();
  const gave = await page.evaluate(() => window.game!.state());
  expect(gave.card).toEqual([restarted.par + 5]);
  expect(gave.phase).toBe('done');
  expect(gave.menu).toBe(false);
  expect(gave.coins, 'a hole given up pays nothing').toBe(before.coins);
  await play(page, 150, 'the next hole after a hole given up');
  expect((await page.evaluate(() => window.game!.state())).hole).toBe(1);

  // Courses: the start screen, the menu put away
  await page.keyboard.press('Escape');
  await page.locator('#menuCourses').click();
  const out = await page.evaluate(() => window.game!.state());
  expect(out.choosing).toBe(true);
  expect(out.menu).toBe(false);
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
  await play(page, 1, 'the start screen after Courses');
  expect(problems).toEqual([]);
});

test('the menu in an event offers Give up and Courses only, a hole given up goes on the card, and Courses keeps the round to go on with', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, screen: true, save: { coins: 10 } });
  expect(await page.evaluate(() => window.game!.enter('mini'))).toBe(true);
  await play(page, 5, 'the event begun');
  expect((await page.evaluate(() => window.game!.state())).choosing).toBe(false);
  await page.locator('#viewMenu').click();
  const menu = await menuNow(page);
  expect(menu.restart, 'no restart in an event').toBe(false);
  await expect(page.locator('#menuRestart')).toBeHidden();
  expect(menu.subtitle).toMatch(/^Club tour · The Meadow · hole 1 · 0 strokes$/);
  expect(menu.note).toBe('Courses keeps this round to go on with');
  expect(await page.evaluate(() => window.game!.restartHole()), 'and the game refuses it').toBe(false);
  // Give up twice: the hole is on the card at the limit and the round kept goes on from the next hole
  const par = await page.evaluate(() => window.game!.state().par);
  await page.locator('#menuGiveUp').click();
  await page.locator('#menuGiveUp').click();
  const gave = await page.evaluate(() => window.game!.state());
  expect(gave.card).toEqual([par + 5]);
  const kept = (await page.evaluate(() => window.game!.career())).round;
  expect(kept).toMatchObject({ tour: 'mini', course: 'The Meadow', hole: 1, card: [par + 5], pickedUp: true });
  await play(page, 150, 'the next hole of the event');
  // Courses leaves the round to go on with
  await page.keyboard.press('Escape');
  await page.locator('#menuCourses').click();
  expect((await page.evaluate(() => window.game!.state())).choosing).toBe(true);
  expect((await page.evaluate(() => window.game!.career())).round, 'the round is kept').toMatchObject({ hole: 1 });
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test.describe('the menu on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  test('is opened by its button among the view’s, and the escape key shuts the hole’s drawer before it opens the menu', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await play(page, 5, 'the first frames');
    expect(await openDrawer(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game!.state().menu), 'the drawer first').toBe(false);
    await expect(page.locator('#strokes')).toBeHidden();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game!.state().menu), 'then the menu').toBe(true);
    await page.locator('#menuResume').tap();
    expect(await page.evaluate(() => window.game!.state().menu)).toBe(false);
    await page.locator('#viewMenu').tap();
    expect(await page.evaluate(() => window.game!.state().menu), 'by its button').toBe(true);
    const reading = await read(page);
    expect(reading.outside).toEqual([]);
    for (const b of reading.buttons.filter((b) => b.text !== 'Overhead'))
      expect(b.height, `${b.text} a thumb high`).toBeGreaterThanOrEqual(THUMB);
    for (const t of reading.texts) expect(t.ratio, `${t.text} on ${t.behind}`).toBeGreaterThanOrEqual(CONTRAST);
    expect(problems).toEqual([]);
  });
});

const trophiesNow = (page: Page) => page.evaluate(() => window.game!.trophies());

test('the trophy room: its button on the start screen opens it with the career as the save has it, and Back and the escape key shut it', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, screen: true, save: TROPHIES_SAVE });
  expect((await trophiesNow(page)).shown.shown, 'shut until asked').toBe(false);
  await page.locator('#trophiesOpen').click();
  await expect(page.locator('#trophies')).toBeVisible();
  const room = await trophiesNow(page);
  expect(room.shown.shown).toBe(true);
  expect(room.shown.menuBehind, 'no menu behind it on the start screen').toBe(false);
  expect(room.shown.tours.map((t) => [t.name, t.cups, t.won])).toEqual([
    ['Golf', '\u{1F3C6}\u{1F3C6}', true],
    ['Mini', '\u{1F3C6}', true],
    ['Desert', '', false],
    ['Moon', '', false],
    ['Future', '', false],
  ]);
  expect(room.shown.figures.map((f) => f.value)).toEqual(['41', '9', '372', '23', '4', '96', '31 yd', '268 yd']);
  expect(room.shown.featsHead).toBe(`Feats · 2 of ${FEATS.length}`);
  expect(room.shown.feats.map((f) => f.id)).toEqual(FEATS.map((f) => f.id));
  expect(room.shown.feats.filter((f) => f.earned).map((f) => f.id)).toEqual(['ace', 'winner']);
  expect(room.shown.records.map((r) => r.course)).toEqual(COURSES.map((c) => c.name));
  expect(room.shown.records[0]).toEqual({ course: 'The Meadow', text: '19 (−7)', held: true });
  expect(room.shown.records.filter((r) => r.held)).toHaveLength(1);
  // what is drawn is read as a player reads it: legible, whole, and every button a thumb high
  const reading = await read(page);
  expect(reading.outside).toEqual([]);
  for (const t of reading.texts.filter((t) => t.text !== ''))
    expect(t.ratio, `${t.text} on ${t.behind}`).toBeGreaterThanOrEqual(CONTRAST);
  for (const b of reading.buttons.filter((b) => b.text === 'Back'))
    expect(b.height, 'Back is a thumb high').toBeGreaterThanOrEqual(THUMB);
  // Back, by a real click; and the escape key
  await page.locator('#trophiesClose').click();
  await expect(page.locator('#trophies')).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#trophiesOpen').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#trophies')).toBeHidden();
  expect((await page.evaluate(() => window.game!.state())).menu, 'the escape key shuts it and opens no menu').toBe(
    false,
  );
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('the trophy room opened from the hole’s menu hides the menu and gives it back, and time stands still under both', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, save: TROPHIES_SAVE });
  await play(page, 30, 'before the menu');
  const t = () => page.evaluate(() => window.game!.state().t);
  await page.locator('#viewMenu').click();
  const t0 = await t();
  await page.locator('#menuTrophies').click();
  await expect(page.locator('#trophies')).toBeVisible();
  await expect(page.locator('#menu'), 'the menu steps aside').toBeHidden();
  const room = await trophiesNow(page);
  expect(room.shown.menuBehind).toBe(true);
  expect((await page.evaluate(() => window.game!.state())).menu, 'the game is still paused under it').toBe(true);
  await play(page, 60, 'under the trophy room');
  expect(await t(), 'sixty frames under it are no time').toBe(t0);
  // Back gives the menu back, still paused, with the focus on the button that opened it
  await page.locator('#trophiesClose').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#trophies')).toBeHidden();
  await expect(page.locator('#menuTrophies')).toBeFocused();
  expect((await menuNow(page)).up).toBe(true);
  // the escape key shuts the room first, and then the menu
  await page.locator('#menuTrophies').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#trophies')).toBeHidden();
  expect((await menuNow(page)).up, 'the menu is back after the room').toBe(true);
  await page.keyboard.press('Escape');
  expect((await menuNow(page)).up, 'and the next escape shuts it').toBe(false);
  // the menu shut by the test API takes the room with it
  await page.locator('#viewMenu').click();
  await page.locator('#menuTrophies').click();
  expect(await page.evaluate(() => window.game!.menu(false))).toBe(false);
  await expect(page.locator('#trophies')).toBeHidden();
  expect(problems).toEqual([]);
});

test('a feat earned is said on the hole’s word and kept in the save, and one earned in the shop has a word of its own', async ({
  page,
}) => {
  const problems = watch(page);
  // a save that has already won an event, and not been told: the next hole done earns the feat
  await start(page, { seed: 1, paused: true, save: { life: { wins: 1 } } });
  expect((await trophiesNow(page)).feats).toEqual([]);
  const done = await holeOut(page);
  expect(done.phase).toBe('done');
  // the autopilot holes the first hole in one stroke, which is a feat of its own, told first; both on the one line
  await expect(page.locator('#toastFrom')).toHaveText(/Feats earned: Ace, Winner/);
  expect((await trophiesNow(page)).feats).toEqual(['ace', 'winner']);
  expect(
    (JSON.parse(await page.evaluate(() => window.game!.save())) as { feats: string[] }).feats,
    'written to the save',
  ).toEqual(['ace', 'winner']);
  expect(problems).toEqual([]);
});

test('a feat earned by a purchase, the fifteenth thing owned, has a word of its own over the course until the next hole', async ({
  page,
}) => {
  const problems = watch(page);
  const owned = ITEMS.slice(0, 14).map((i) => i.id);
  await start(page, { seed: 1, paused: true, save: { coins: 100_000, gems: 1000, owned } });
  await play(page, 5, 'the first frames');
  await expect(page.locator('#toast')).toBeHidden();
  expect(await page.evaluate((id) => window.game!.buy(id), ITEMS[14].id)).toBe(true);
  await expect(page.locator('#toastWords')).toHaveText('Feat earned: Kitted out');
  expect((await trophiesNow(page)).feats).toEqual(['kittedOut']);
  expect(problems).toEqual([]);
});

test.describe('the trophy room on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  test('is whole on the screen, legible, with its two columns, opened and shut by touch', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true, save: TROPHIES_SAVE });
    await page.locator('#trophiesOpen').tap();
    await expect(page.locator('#trophies')).toBeVisible();
    const reading = await read(page);
    expect(reading.outside).toEqual([]);
    expect(reading.scrollWidth).toBeLessThanOrEqual(400);
    for (const t of reading.texts) expect(t.ratio, `${t.text} on ${t.behind}`).toBeGreaterThanOrEqual(CONTRAST);
    for (const b of reading.buttons.filter((b) => b.text === 'Back'))
      expect(b.height, 'Back is a thumb high').toBeGreaterThanOrEqual(THUMB);
    // the grade is the short word on a phone, so five tours stand in a row
    expect(await page.locator('#trophyTours .short').first().isVisible()).toBe(true);
    expect(await page.locator('#trophyTours .long').first().isVisible()).toBe(false);
    await page.locator('#trophiesClose').tap();
    await expect(page.locator('#trophies')).toBeHidden();
    expect(problems).toEqual([]);
  });
});

/**
 * The daily hole, on a fixed day by the page's clock (the hole of a day is the same whenever this is run). The share sheet and the
 * clipboard are stubs that note what they were given: the real ones are never called. A page of its own with nothing saved.
 */
const DAY = '2026-11-11';
const NEXT = '2026-11-12';
const stubShare = (page: Page, how: 'share' | 'clipboard' | 'abort' | 'none' = 'share') =>
  page.addInitScript((mode) => {
    const w = window as unknown as { shared: string[] };
    w.shared = [];
    if (mode === 'share' || mode === 'abort')
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data: { text: string }) => {
          if (mode === 'abort') return Promise.reject(new DOMException('put away', 'AbortError'));
          w.shared.push(data.text);
          return Promise.resolve();
        },
      });
    else Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          if (mode === 'none') return Promise.reject(new Error('no clipboard'));
          w.shared.push(`clipboard: ${text}`);
          return Promise.resolve();
        },
      },
    });
  }, how);
const dailyNow = (page: Page) => page.evaluate(() => window.game!.daily());
const sharedWords = (page: Page) => page.evaluate(() => (window as unknown as { shared: string[] }).shared);
/** The page's daily picture painted, which it is after the first frame and not before. */
const painted = (page: Page) =>
  page.waitForFunction(() => window.game!.daily().shown.strip.painted).then(() => dailyNow(page));

test('the daily hole: the strip asks for a go, the first go is paid and kept and its card shares it, a later go pays nothing, and a reload keeps the day', async ({
  page,
}) => {
  const problems = watch(page);
  await stubShare(page);
  await start(page, { seed: 1, paused: true, screen: true, day: DAY });
  // the strip, before the day's go: the hole's facts from its spec, Play only, and its picture painted once the page is ready
  const first = await painted(page);
  const facts = dailyFacts(DAY);
  expect(first.today).toBe(DAY);
  expect(first.shown.strip).toMatchObject({
    shown: true,
    state: 'open',
    title: 'Today’s hole · Wednesday 11 November',
    buttons: ['dailyPlay'],
    painted: true,
  });
  expect(first.shown.strip.meta).toContain(`par ${facts.par} · ${facts.yards} yards`);
  expect(first.slot).toEqual({ day: '', strokes: 0, par: 0, streak: 0 });
  await expect(page.locator('#daily')).toBeVisible();
  const coins0 = (await page.evaluate(() => window.game!.state())).coins;

  // Play today's hole, by a real click: the first go, with the menu saying so and no Restart
  await page.locator('#dailyPlay').click();
  const go = await dailyNow(page);
  expect(go.go).toEqual({ day: DAY, pays: true });
  expect((await page.evaluate(() => window.game!.state())).choosing).toBe(false);
  await play(page, 5, 'the daily hole begun');
  await page.locator('#viewMenu').click();
  const menu = await menuNow(page);
  expect(menu.subtitle).toMatch(new RegExp(`^Today’s hole · 11 Nov 2026 · 0 strokes · par ${facts.par}$`));
  expect(menu.restart, 'the first go is not restarted').toBe(false);
  expect(menu.note).toBe('The first go is the one that counts');
  await expect(page.locator('#menuRestart')).toBeHidden();
  expect(await page.evaluate(() => window.game!.restartHole()), 'and the game refuses it').toBe(false);
  await page.locator('#menuResume').click();

  // played out: the slot is the day, kept at the first stroke, and the card says what was done and what Share sends
  const done = await holeOut(page);
  expect(done.phase).toBe('done');
  const strokes = done.card[0];
  await play(page, 150, 'the daily hole done');
  const kept = await dailyNow(page);
  expect(kept.slot).toEqual({ day: DAY, strokes, par: done.par, streak: 1 });
  const pay = paid(strokes, done.par, strokes >= done.par + 5).coins;
  expect((await page.evaluate(() => window.game!.state())).coins - coins0, 'paid as a hole is').toBe(pay);
  await expect(page.locator('#dailyCard')).toBeVisible();
  await expect(page.locator('#card'), 'not the round’s card').toBeHidden();
  const words = shareText(DAY, done.par, strokes);
  expect(kept.shown.card).toMatchObject({
    shown: true,
    head: 'Today’s hole · 11 November',
    score: scoreName(strokes, done.par, strokes >= done.par + 5),
    words,
    buttons: ['dailyCardShare', 'dailyCardAgain', 'dailyCardCourses'],
  });
  expect(kept.shown.card.line.startsWith(`${strokes} on a par ${done.par}`)).toBe(true);
  expect(
    (JSON.parse(await page.evaluate(() => window.game!.save())) as { best: object }).best,
    'no best for a day',
  ).toEqual({});
  expect(words).toContain('https://golf.ooer.com/');
  // Share, by a real click: the share sheet is handed the words, and nothing else
  await page.locator('#dailyCardShare').click();
  expect(await sharedWords(page)).toEqual([words]);
  await expect(page.locator('#dailyShareNote')).toHaveText('Shared');

  // again, for nothing: a later go pays nothing, counts nothing and leaves the slot, and the menu has its Restart
  const coins1 = (await page.evaluate(() => window.game!.state())).coins;
  const life1 = (await page.evaluate(() => window.game!.trophies())).life;
  await page.locator('#dailyCardAgain').click();
  expect((await dailyNow(page)).go).toEqual({ day: DAY, pays: false });
  await play(page, 5, 'a later go begun');
  await page.locator('#viewMenu').click();
  const later = await menuNow(page);
  expect(later.restart).toBe(true);
  expect(later.note).toBe('A later go: nothing is paid');
  await page.locator('#menuRestart').click();
  expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
  const again = await holeOut(page);
  expect(again.phase).toBe('done');
  await play(page, 150, 'a later go done');
  const second = await dailyNow(page);
  expect(second.slot, 'the first go stands').toEqual(kept.slot);
  expect((await page.evaluate(() => window.game!.state())).coins, 'nothing paid').toBe(coins1);
  expect((await page.evaluate(() => window.game!.trophies())).life, 'nothing counted').toEqual(life1);
  expect(second.shown.card.line).toContain('counts for nothing');
  expect(second.shown.card.note).toBe(
    `Your first go, ${scoreName(strokes, done.par).replace(/!$/, '')} (${strokes}), is the one that counts.`,
  );
  expect(second.shown.card.words, 'the first go is what is shared').toBe(words);

  // Courses: the strip says the day's score, with Share and another go, and a reload keeps the day
  await page.locator('#dailyCardCourses').click();
  const strip = (await dailyNow(page)).shown.strip;
  expect(strip).toMatchObject({ state: 'done', buttons: ['dailyShare', 'dailyAgain'] });
  expect(strip.title).toBe(`Today: ${scoreName(strokes, done.par).replace(/!$/, '')} · ${strokes}`);
  expect(strip.meta).toBe('1 day running');
  await page.locator('#dailyShare').click();
  expect(await sharedWords(page)).toEqual([words, words]);
  await page.reload();
  await page.waitForFunction(() => window.game?.ready);
  const after = await dailyNow(page);
  expect(after.slot).toEqual(kept.slot);
  expect(after.shown.strip.state).toBe('done');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);

  // the day turns at midnight UTC: the strip, read when the start screen opens, asks for a go again, and the old day stays kept
  await turnTheDay(page, `${NEXT}T00:00:01Z`);
  await page.evaluate(() => window.game!.playDaily('2026-11-11'));
  await page.evaluate(() => window.game!.menu(true));
  await page.locator('#menuCourses').click();
  const turned = await dailyNow(page);
  expect(turned.today).toBe(NEXT);
  expect(turned.shown.strip).toMatchObject({ state: 'open', title: 'Today’s hole · Thursday 12 November' });
  expect(turned.slot).toEqual(kept.slot);
  expect(problems).toEqual([]);
});

test('the daily hole left unfinished reads did not finish, with no Share, and a go after it pays nothing', async ({
  page,
}) => {
  const problems = watch(page);
  await stubShare(page);
  await start(page, { seed: 1, paused: true, screen: true, day: DAY });
  await painted(page);
  await page.locator('#dailyPlay').click();
  await play(page, 5, 'the daily hole begun');
  await page.evaluate(() => {
    const shot = window.game!.suggest();
    if (shot) window.game!.shoot(shot.angle, shot.power, shot.club);
  });
  await play(page, 5, 'the first stroke');
  expect((await page.evaluate(() => window.game!.state())).strokes).toBe(1);
  const taken = await dailyNow(page);
  expect(taken.slot, 'taken at its first stroke').toEqual({ day: DAY, strokes: 0, par: expect.any(Number), streak: 0 });
  // the menu's Courses leaves it as it stands
  await page.locator('#viewMenu').click();
  await page.locator('#menuCourses').click();
  const strip = (await dailyNow(page)).shown.strip;
  expect(strip).toMatchObject({
    state: 'unfinished',
    title: 'Today: did not finish',
    buttons: ['dailyAgain'],
  });
  await expect(page.locator('#dailyShare')).toBeHidden();
  const coins = (await page.evaluate(() => window.game!.state())).coins;
  await page.locator('#dailyAgain').click();
  expect((await dailyNow(page)).go).toEqual({ day: DAY, pays: false });
  const done = await holeOut(page);
  expect(done.phase).toBe('done');
  await play(page, 150, 'a go after it');
  const card = (await dailyNow(page)).shown.card;
  expect(card.note).toBe('Your first go was not finished, and that is the one that counts.');
  expect(card.words, 'nothing to share').toBe('');
  await expect(page.locator('#dailyCardShare')).toBeHidden();
  expect((await page.evaluate(() => window.game!.state())).coins).toBe(coins);
  expect((await dailyNow(page)).slot.strokes).toBe(0);
  expect(problems).toEqual([]);
});

test('Give up on the daily hole’s first go scores it at the limit and keeps that for the day', async ({ page }) => {
  const problems = watch(page);
  await stubShare(page);
  await start(page, { seed: 1, paused: true, screen: true, day: DAY });
  await painted(page);
  await page.locator('#dailyPlay').click();
  await play(page, 5, 'the daily hole begun');
  await page.locator('#viewMenu').click();
  const par = (await page.evaluate(() => window.game!.state())).par;
  await page.locator('#menuGiveUp').click();
  expect((await menuNow(page)).giveUp).toBe(`Give up? It scores ${par + 5} for the day`);
  await page.locator('#menuGiveUp').click();
  await play(page, 150, 'the hole given up');
  const after = await dailyNow(page);
  expect(after.slot).toEqual({ day: DAY, strokes: par + 5, par, streak: 1 });
  expect(after.shown.card.score).toBe('Picked up');
  expect((await page.evaluate(() => window.game!.state())).coins, 'a hole given up pays nothing').toBe(0);
  expect(problems).toEqual([]);
});

for (const how of ['clipboard', 'abort', 'none'] as const)
  test(`Share ${how === 'clipboard' ? 'falls back to the clipboard where there is no share sheet' : how === 'abort' ? 'says nothing when the share sheet is put away' : 'says it could not where there is neither'}`, async ({
    page,
  }) => {
    const problems = watch(page);
    await stubShare(page, how);
    const finished = { day: DAY, strokes: 3, par: 4, streak: 1 };
    await start(page, { seed: 1, paused: true, screen: true, day: DAY, save: { daily: finished } });
    await painted(page);
    expect((await dailyNow(page)).shown.strip.buttons).toEqual(['dailyShare', 'dailyAgain']);
    await page.locator('#dailyShare').click();
    const words = shareText(DAY, 4, 3);
    const shared = await sharedWords(page);
    expect(shared).toEqual(how === 'clipboard' ? [`clipboard: ${words}`] : []);
    // the strip has no note of its own: what became of the words is said on the card, which is where Share is pressed from there
    await page.locator('#dailyAgain').click();
    await holeOut(page);
    await play(page, 150, 'a later go done');
    await page.locator('#dailyCardShare').click();
    const note = page.locator('#dailyShareNote');
    if (how === 'clipboard') await expect(note).toHaveText('Copied to the clipboard');
    else if (how === 'none') await expect(note).toHaveText(/Could not share/);
    else await expect(note).toBeHidden();
    expect(problems).toEqual([]);
  });

test.describe('the daily hole on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  test('the strip and the card are whole on the screen, legible, a thumb high, and work by touch', async ({ page }) => {
    const problems = watch(page);
    await stubShare(page);
    await start(page, { seed: 1, paused: true, screen: true, day: DAY });
    await painted(page);
    // the strip on the start screen: nothing past the sides, every word legible, every button a thumb high
    let reading = await read(page);
    expect(reading.outside).toEqual([]);
    expect(reading.scrollWidth).toBeLessThanOrEqual(400);
    for (const t of reading.texts) expect(t.ratio, `${t.text} on ${t.behind}`).toBeGreaterThanOrEqual(CONTRAST);
    for (const b of reading.buttons.filter((b) => b.text === 'Play today’s hole'))
      expect(b.height, 'Play today’s hole is a thumb high').toBeGreaterThanOrEqual(THUMB);
    await page.locator('#dailyPlay').tap();
    expect((await dailyNow(page)).go).toEqual({ day: DAY, pays: true });
    await holeOut(page);
    await play(page, 150, 'the daily hole done');
    await expect(page.locator('#dailyCard')).toBeVisible();
    await landed(page);
    reading = await read(page);
    expect(reading.outside).toEqual([]);
    expect(reading.scrollWidth).toBeLessThanOrEqual(400);
    for (const t of reading.texts) expect(t.ratio, `${t.text} on ${t.behind}`).toBeGreaterThanOrEqual(CONTRAST);
    for (const b of reading.buttons.filter((b) => ['Share', 'Again, for nothing', 'Courses'].includes(b.text)))
      expect(b.height, `${b.text} is a thumb high`).toBeGreaterThanOrEqual(THUMB);
    await page.locator('#dailyCardShare').tap();
    expect((await sharedWords(page)).length).toBe(1);
    await page.locator('#dailyCardCourses').tap();
    expect((await dailyNow(page)).shown.strip.state).toBe('done');
    // and the strip after the day's go: Share and another go are a thumb high too
    reading = await read(page);
    for (const b of reading.buttons.filter((b) => ['Share'].includes(b.text)))
      expect(b.height, 'Share is a thumb high').toBeGreaterThanOrEqual(THUMB);
    expect(reading.outside).toEqual([]);
    expect(problems).toEqual([]);
  });
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

/** Hole 1 of seed 1 holed in one, the way the test above does, stopped on the frame the ball drops: the page is paused and the camera has not moved yet. */
async function aceInOne(page: Page) {
  return page.evaluate(() => {
    const g = window.game!;
    const { cup } = g.content();
    g.place(g.bodies('ball')[0].slot, cup.x, cup.y - 4, 1);
    g.step(30);
    g.events();
    const before = g.view();
    g.shoot(Math.PI / 2, (Math.sqrt(15 * 15 + 2 * 16 * 2.55) / g.content().hardest) ** 2);
    for (let f = 0; f < 120; f++) {
      g.step(1);
      if (g.events().some((e) => e.startsWith('holed'))) return { before, began: g.view(), found: true };
    }
    return { before, began: before, found: false };
  });
}

test('a hole in one has the camera turn a quarter turn about the cup, and the next hole begins as always', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const { before, began, found } = await aceInOne(page);
  expect(found, 'holed').toBe(true);
  expect(before.circling, 'not before the ball drops').toBe(false);
  expect(began.circling, 'begun as it drops').toBe(true);
  const turn = (a: number) => Math.atan2(Math.sin(a - began.azimuth), Math.cos(a - began.azimuth));
  const at = async (frames: number) =>
    page.evaluate((n) => {
      window.game!.step(n);
      return window.game!.view();
    }, frames);
  const early = await at(15);
  expect(early.circling, 'under way a quarter second in').toBe(true);
  expect(turn(early.azimuth), 'and begun').toBeGreaterThan(0);
  expect(turn(early.azimuth), 'but not far on').toBeLessThan(Math.PI / 4);
  const middle = await at(30);
  expect(middle.circling, 'under way in the middle').toBe(true);
  expect(turn(middle.azimuth), 'half way round, eased').toBeGreaterThan(Math.PI / 8);
  const end = await at(60);
  expect(end.circling, 'over by the end of its time').toBe(false);
  expect(turn(end.azimuth), 'a quarter turn').toBeCloseTo(Math.PI / 2, 3);
  expect(await page.evaluate(() => window.game!.state().phase), 'the wait is not over').toBe('done');
  // past the wait the next hole begins, and the camera is back on a tee's view: nothing of the turn is left
  await at(60);
  const state = await page.evaluate(() => window.game!.state());
  expect(state.hole, 'the next hole').toBe(1);
  expect(state.phase).toBe('play');
  const home = await at(240);
  expect(home.circling).toBe(false);
  expect(Math.abs(turn(home.azimuth)), 'turned home').toBeLessThan(0.05);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('a hole in one has no turn for a player who prefers reduced motion', async ({ page }) => {
  const problems = watch(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page, { seed: 1, paused: true });
  const { began, found } = await aceInOne(page);
  expect(found, 'holed').toBe(true);
  for (const frames of [1, 20, 40]) {
    const view = await page.evaluate((n) => {
      window.game!.step(n);
      return window.game!.view();
    }, frames);
    expect(view.circling).toBe(false);
    expect(view.azimuth).toBe(began.azimuth);
  }
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
    // the help says what a drag does on a hole of minigolf, and no drag is held under the card, so it is not telling how
    // to take one back
    help: { aiming: null, text: 'drag back and let go to putt' },
    // the sky is the fly-in's and the title's alone: no cloud is drawn to the view the card stands over
    sky: 0,
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

test('an event: Continue after a reload goes on from the kept hole, the board follows the field, the last hole places the player, and Enter goes on to the next', async ({
  page,
}) => {
  const problems = watch(page);
  // the mini tour's first event, The Meadow, kept at its last hole with the eight before it scored two each, as a reload finds it
  const card = [2, 2, 2, 2, 2, 2, 2, 2];
  await start(page, {
    seed: 1,
    paused: true,
    screen: true,
    save: {
      coins: 10,
      round: { tour: 'mini', course: 'The Meadow', hole: 8, card, retaken: false, pickedUp: false },
    },
  });
  // the mini tab is the tour's event, The Meadow, its Enter Continue from the hole kept
  await page.locator('#tab-minigolf').click();
  await expect(page.locator('#courseName')).toHaveText('The Meadow');
  await expect(page.locator('#courseEvent')).toHaveText('Club tour · Event 1 of 3');
  await expect(page.locator('#enterEvent')).toHaveText('Continue · hole 9');
  await expect(page.locator('#playMode'), 'the career switch on').toHaveAttribute('aria-checked', 'true');
  // Continue, pressed by a real pointer: no fee is asked again
  await page.locator('#enterEvent').click();
  const resumed = await page.evaluate(() => window.game!.state());
  expect(resumed.choosing).toBe(false);
  expect(resumed.hole).toBe(8);
  expect(resumed.card).toEqual(card);
  expect(resumed.coins).toBe(10);
  expect((await page.evaluate(() => window.game!.season())).event).toEqual({ tour: 'mini', index: 0 });
  // the board is the field thru the eight holes kept: sixteen strokes against their par of 22
  const board = (await page.evaluate(() => window.game!.season())).board;
  expect(board?.head).toBe('Leaderboard · thru 8');
  expect(board?.rows.some((r) => r[1] === 'You' && r[2] === '−6')).toBe(true);
  // the last hole played out as the autopilot would
  for (let stroke = 1; stroke <= 12; stroke++) {
    await page.evaluate(() => {
      const shot = window.game!.suggest();
      if (shot) window.game!.shoot(shot.angle, shot.power);
    });
    for (let f = 0; f < 12 * 60; f += 20) {
      await play(page, 20, `stroke ${stroke} of the kept event's last hole`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') break;
  }
  await play(page, 150, 'after the last hole');
  const over = await page.evaluate(() => window.game!.state());
  expect(over.phase).toBe('over');
  const after = await page.evaluate(() => window.game!.season());
  expect(after.season.mini.played, "the card is the season's first event").toEqual([over.card]);
  expect((await page.evaluate(() => window.game!.career())).round, 'the round kept is let go').toBeNull();
  // the card says the place, the field with you in it, and the order of merit; Next event for Play again
  await expect(page.locator('#card h2')).toHaveText('The Meadow');
  await expect(page.locator('#cardPrize')).toBeVisible();
  await expect(page.locator('#cardResults tr.you')).toContainText('You');
  await expect(page.locator('#meritMove')).toHaveText(/^Order of merit: \d+(st|nd|rd|th)$/);
  await expect(page.locator('#again')).toBeHidden();
  await page.locator('#nextEvent').click();
  // the start screen, the mini tab's next event, which at the club grade is entered for nothing
  await page.locator('#tab-minigolf').click();
  await expect(page.locator('#courseEvent')).toHaveText('Club tour · Event 2 of 3');
  const purse = (await page.evaluate(() => window.game!.state())).coins;
  await expect(page.locator('#enterEvent')).toHaveText('Enter · free');
  await page.locator('#enterEvent').click();
  const entered = await page.evaluate(() => window.game!.state());
  expect(entered.coins, 'no fee at the club grade').toBe(purse);
  expect(entered.choosing).toBe(false);
  expect((await page.evaluate(() => window.game!.season())).event).toEqual({ tour: 'mini', index: 1 });
  expect((await page.evaluate(() => window.game!.career())).round?.hole, 'kept from its first tee').toBe(0);

  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('free play, chosen on the start screen, shows no event, pays nothing and keeps nothing, and a reload keeps it', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, screen: true, save: { coins: 10 } });
  await expect(page.locator('#enterEvent')).toBeVisible();
  await page.locator('#playMode').click();
  await expect(page.locator('#enterEvent'), 'no event in free play').toBeHidden();
  await expect(page.locator('#playCourse')).toBeVisible();
  await expect(page.locator('#playMode'), 'the career switch off').toHaveAttribute('aria-checked', 'false');
  expect((await page.evaluate(() => window.game!.career())).mode).toBe('free');
  await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
  const coins = (await page.evaluate(() => window.game!.state())).coins;
  const done = await holeOut(page);
  expect(done.phase).toBe('done');
  expect((await page.evaluate(() => window.game!.state())).coins, 'free play pays nothing').toBe(coins);
  expect((await page.evaluate(() => window.game!.career())).round, 'and keeps no round').toBeNull();
  // the mode is kept in the save, and a reload comes back to it
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  expect((await page.evaluate(() => window.game!.career())).mode).toBe('free');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
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
  // up the hole from the tee, into the pond across it
  await page.evaluate((angle) => window.game!.shoot(angle, 0.45), intoThePond());
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

test('a putt that lips out of the cup says so until the next stroke, and a long putt holed says how far on a second line', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 3, paused: true });
  await page.evaluate(() => window.game!.step(30));
  const toast = page.locator('#toast');

  // twelve a second, 0.6 of the cup's radius off its middle: round the rim and out
  expect(await puttAtCup(page, 12, 0.6 * 1.45)).toBe(true);
  await untilReady(page, 'lipped out');
  expect((await page.evaluate(() => window.game!.state())).phase, 'not holed').toBe('play');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(lipWords());
  await expect(toast).toHaveAttribute('data-kind', 'lip');
  await expect(page.locator('#toastFrom'), 'a lip-out has no second line').toBeHidden();
  // it stays while the ball is at rest, and goes with the next stroke
  await play(page, 60, 'the word left up');
  await expect(toast).toBeVisible();
  expect(
    await page.evaluate(() => {
      const s = window.game!.suggest()!;
      return window.game!.shoot(s.angle, s.power);
    }),
    'the next stroke taken',
  ).toBe(true);
  await expect(toast, 'the lip-out gone with the stroke').toBeHidden();

  // a long putt: the hole's first stroke is a hole in one whatever it is, so one is taken first, and then one from 22 yards
  await page.evaluate(() => {
    window.game!.startHole(0);
    window.game!.step(5);
    window.game!.shoot(0, 0.05);
  });
  await untilReady(page, 'the first stroke');
  expect(await puttAtCup(page, 5, 0, { from: 22 })).toBe(true);
  // stopped as the hole is done, before the next is begun for the player two seconds on
  await page.evaluate(() => {
    for (let f = 0; f < 600 && window.game!.state().phase === 'play'; f++) window.game!.step(1);
  });
  const done = await page.evaluate(() => window.game!.state());
  expect(done.phase).toBe('done');
  await expect(toast).toBeVisible();
  await expect(page.locator('#toastWords'), "the score's name").toHaveText(scoreName(done.card[0], done.par));
  // where it was holed from, and after it the feat a putt of twenty yards is, on the one line
  await expect(page.locator('#toastFrom'), 'and where it was holed from').toHaveText(
    `${fromWords(22)} · Feat earned: From downtown`,
  );

  // the next hole's score is its own: a hole holed with no long putt has no second line
  await page.evaluate(() => window.game!.startHole(1));
  await expect(toast).toBeHidden();
  expect((await holeOut(page)).phase).toBe('done');
  await expect(toast).toBeVisible();
  await expect(page.locator('#toastFrom'), 'no second line the next time').toBeHidden();
  expect(problems).toEqual([]);
});

test('a lofted ball that strikes the pin says so until the next stroke, and the flag waggles', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  await page.evaluate(() => {
    window.game!.chooseCourse('Tranquility');
    window.game!.startHole(0);
    window.game!.step(30);
  });
  const toast = page.locator('#toast');
  expect(await strikeThePin(page, { stop: true }), 'a wedge flown through the pin').not.toBeNull();
  // a frame or two on, the flag swinging
  await page.evaluate(() => window.game!.step(6));
  expect((await page.evaluate(() => window.game!.motions())).waggle, 'the flag waggles').not.toBe(0);
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(pinWords());
  await expect(toast).toHaveAttribute('data-kind', 'pin');
  await page.evaluate(() => {
    const g = window.game!;
    for (let f = 0; f < 900 && g.state().phase === 'play' && !g.state().ready; f++) g.step(1);
  });
  // it stays while the ball is at rest, and goes with the next stroke
  if ((await page.evaluate(() => window.game!.state().phase)) === 'play') {
    await expect(toast).toBeVisible();
    expect(
      await page.evaluate(() => {
        const s = window.game!.suggest()!;
        return window.game!.shoot(s.angle, s.power);
      }),
      'the next stroke taken',
    ).toBe(true);
    await expect(toast, 'the pin’s word gone with the stroke').toBeHidden();
  }
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  test('the lip-out word and the long putt’s second line are whole, on the screen and legible', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 3, paused: true });
    await page.evaluate(() => window.game!.step(30));
    expect(await puttAtCup(page, 12, 0.6 * 1.45)).toBe(true);
    await untilReady(page, 'lipped out');
    await expect(page.locator('#toast')).toHaveText(lipWords());
    const lip = await read(page);
    expect(lip.outside, 'nothing past the screen').toEqual([]);
    expect(lip.scrollWidth).toBeLessThanOrEqual(400);
    const word = lip.texts.find((t) => t.text === lipWords())!;
    console.log(`lip-out word at 400 wide: contrast ${word.ratio.toFixed(2)}`);
    expect(word.ratio, 'the lip-out word against its panel').toBeGreaterThanOrEqual(CONTRAST);

    await page.evaluate(() => {
      window.game!.startHole(0);
      window.game!.step(5);
      window.game!.shoot(0, 0.05);
    });
    await untilReady(page, 'the first stroke');
    expect(await puttAtCup(page, 5, 0, { from: 22 })).toBe(true);
    await page.evaluate(() => {
      for (let f = 0; f < 600 && window.game!.state().phase === 'play'; f++) window.game!.step(1);
    });
    await expect(page.locator('#toastFrom')).toHaveText('from 22 yards · Feat earned: From downtown');
    const from = await read(page);
    expect(from.outside, 'nothing past the screen').toEqual([]);
    expect(from.scrollWidth).toBeLessThanOrEqual(400);
    for (const text of from.texts.filter((t) => t.text.includes('from 22 yards') || t.text === 'Par!')) {
      console.log(`${text.text} at 400 wide: contrast ${text.ratio.toFixed(2)}`);
      expect(text.ratio, text.text).toBeGreaterThanOrEqual(CONTRAST);
    }
    expect(problems).toEqual([]);
  });
});

test('a long drive says so over the course, with its carry in whole yards, until the next stroke', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 3, paused: true });
  await page.evaluate(() => window.game!.wake());
  let told: string | undefined;
  for (const name of ['The Links', 'The Heath', 'The Woods', 'The Old Course', 'The Fells', 'The Isles']) {
    await page.evaluate((n) => window.game!.chooseCourse(n), name);
    const holes = (await page.evaluate(() => window.game!.content())).holes.length;
    for (let hole = 0; hole < holes && !told; hole++) {
      await page.evaluate((h) => {
        window.game!.startHole(h);
        window.game!.step(5);
        window.game!.events();
        const s = window.game!.suggest()!;
        window.game!.shoot(s.angle, s.power, s.club);
      }, hole);
      // in slices, since the log keeps the latest lines, until it lands or comes to rest
      for (let slice = 0; slice < 30 && !told; slice++) {
        const seen = await page.evaluate(() => {
          const g = window.game!;
          for (let f = 0; f < 15 && !g.state().ready; f++) g.step(1);
          return g.events();
        });
        told = seen.find((l) => l.startsWith('longDrive '));
        if (await page.evaluate(() => window.game!.state().ready)) break;
      }
    }
    if (told) break;
  }
  expect(told, 'a long drive within these holes, as the seed gives it').toBeDefined();
  const yards = Number(told!.split(' ')[1]);
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('data-kind', 'drive');
  const shown = Number((await toast.textContent())!.match(/^Long drive! (\d+) yd$/)![1]);
  expect(Math.abs(shown - yards), 'whole yards of the carry told').toBeLessThanOrEqual(1);
  expect(await toast.textContent()).toBe(driveWords(shown));
  // it stays while the ball runs and rests, and goes with the next stroke
  await untilReady(page, 'the drive run out');
  await expect(toast).toBeVisible();
  expect(
    await page.evaluate(() => {
      const s = window.game!.suggest()!;
      return window.game!.shoot(s.angle, s.power, s.club);
    }),
    'the next stroke taken',
  ).toBe(true);
  await expect(toast, 'the long drive gone with the stroke').toBeHidden();
  expect(problems).toEqual([]);
});

test('each hole is flown in to, low behind the tee with the horizon in view, eased to the play view, and cut short by a drag', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true, flyIn: true });
  // the first hole, begun as the course was chosen: low, and the far plane out to the horizon
  let view = await page.evaluate(() => window.game!.view());
  expect(view.flying, 'flying in to the first hole').toBe(true);
  expect(view.tilt).toBeGreaterThan(1.2);
  expect(view.farPlane).toBeGreaterThan(3000);
  // the sky is drawn to the fly-in, whose screen has the horizon on it
  await page.evaluate(() => window.game!.step(1));
  expect((await page.evaluate(() => window.game!.motions())).sky, 'the clouds drawn to the fly-in').toBeGreaterThan(10);
  // eased to the play view in a few seconds of the game's time
  await page.evaluate(() => window.game!.step(200));
  view = await page.evaluate(() => window.game!.view());
  expect(view.flying, 'over').toBe(false);
  expect(view.tilt).toBeLessThan(1.01);
  // and to no view a shot is aimed from, nor to the one from overhead: a cloud drifts over the hole at the height they stand at
  expect((await page.evaluate(() => window.game!.motions())).sky, 'no cloud drawn to the play view').toBe(0);
  await page.evaluate(() => window.game!.overhead(true));
  await page.evaluate(() => window.game!.step(60));
  expect((await page.evaluate(() => window.game!.motions())).sky, 'none from overhead').toBe(0);
  await page.evaluate(() => window.game!.overhead(false));
  await page.evaluate(() => window.game!.step(60));
  // the next hole flown in to again, and a real drag from the ball cuts it short
  await page.evaluate(() => window.game!.startHole(1));
  await page.evaluate(() => window.game!.step(2));
  expect((await page.evaluate(() => window.game!.view())).flying, 'flying in to the next').toBe(true);
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  // across the screen, since from the fly-in's low view the ball is near its foot and a pull down would leave it
  await drag(page, at, { x: at.x + 140, y: at.y - 20 }, { hold: true });
  expect(await page.evaluate(() => window.game!.aiming()), 'a shot aimed by the drag').not.toBeNull();
  await page.evaluate(() => window.game!.step(30));
  expect((await page.evaluate(() => window.game!.view())).flying, 'cut short by the drag').toBe(false);
  await page.mouse.up();
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
  await page.evaluate(() => window.game!.chooseCourse('The Links'));
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
  ['The Heath', 'Gorse Gate'],
  ['The Woods', 'Acorn Rise'],
  ['The Old Course', 'The Burn'],
] as const) {
  test(`${course} is chosen on the start screen, begun on its first hole with the driver in hand, and a stroke is struck by a drag`, async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true });
    await page.evaluate((c) => window.game!.chooseCourse(c), course);
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
  // at seven tenths of the power, over the bank and the stakes. At full power it no longer comes down out of bounds on this
  // hole: the ground rises to the bank's height by the stakes (the land rolls), so a drive flown sideways meets the bank and
  // rests on it, and only a shot that clears it and drops in the band beyond is lost (`rolling: false` on the spec gives the
  // full-power drive back, to the digit)
  const at = await page.evaluate(() => {
    const b = window.game!.ball();
    return window.game!.project(b.x, b.y, b.z);
  });
  const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
  await drag(page, at, { x: at.x + 0.7 * 0.35 * short, y: at.y }, { steps: 10 });
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

test('a ball lying on a bank of The Links, in the rough above the fairway, is struck by the test API and comes to rest, and the next stroke can be taken', async ({
  page,
}) => {
  const problems = watch(page);
  // the highest tile of rough on The Opener that the fuzzer counts as a bank, so the ball lies well up a slope and not on its
  // toe; rough by the zones, as the game puts a ball down by them, since a tile of rough by the stakes can lie past the
  // curve of out of bounds (where `lieAt` says rough too, out of bounds being rough to roll on)
  const hole = links()[0];
  const layout = layoutOf(hole.map, hole.terrain);
  let best = { x: 0, y: 0, z: -1 };
  for (let t = 0; t < layout.cols * layout.rows; t++) {
    const x = layout.originX + ((t % layout.cols) + 0.5) * TILE,
      y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE;
    if (layout.terrain[t] > best.z && onBank(layout, x, y) && zonesOf(layout).at(x, y) === 'rough')
      best = { x, y, z: layout.terrain[t] };
  }
  expect(best.z, 'a bank to stand on').toBeGreaterThan(3);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => {
    window.game!.chooseCourse('The Links');
    window.game!.startHole(0);
    window.game!.step(75);
  });
  await page.evaluate((b) => window.game!.lay(b.x, b.y), best);
  await play(page, 5, 'a ball put on a bank');
  const lies = await page.evaluate(() => window.game!.ball());
  expect(Math.hypot(lies.x - best.x, lies.y - best.y), 'the ball lies where it was put').toBeLessThan(0.5);
  expect(await page.evaluate(() => window.game!.state())).toMatchObject({ golf: true, ready: true, strokes: 0 });
  // struck toward the cup with a wedge, by the test API's own shoot, at half power: a stroke is taken
  const aim = await page.evaluate(() => {
    const b = window.game!.ball();
    const c = window.game!.content().cup;
    return Math.atan2(c.y - b.y, c.x - b.x);
  });
  expect(await page.evaluate((a) => window.game!.shoot(a, 0.5, 'pitching-wedge'), aim), 'the stroke is taken').toBe(
    true,
  );
  await untilReady(page, 'from a bank');
  const after = await page.evaluate(() => window.game!.state());
  expect(after).toMatchObject({ ready: true, phase: 'play' });
  expect(after.strokes, 'one stroke, or two with a penalty').toBeGreaterThanOrEqual(1);
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

/**
 * How far down the page a drag is pressed, high on it: below the view's buttons on a phone, which reach the middle of the page
 * there since the menu's joined them, and a press on a button aims nothing.
 */
function pressedAt(size: { width: number; height: number }): number {
  return size.height * (size.width < 600 ? 0.22 : 0.15);
}

/** A drag pressed high on the page and pulled down by `share` of the most a shot takes, `across` pixels over, held. */
async function pull(page: Page, share: number, across = 0, touch = false) {
  const size = page.viewportSize()!;
  const short = Math.min(size.width, size.height);
  const from = { x: size.width / 2, y: pressedAt(size) };
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
          await page.mouse.move(size.width / 2, pressedAt(size));
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
    const from = { x: (page.viewportSize()!.width / 2) | 0, y: pressedAt(page.viewportSize()!) | 0 };
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
      const from = await page.evaluate(() => window.game!.ball());
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
      // the spread's along is the carry's own arithmetic (it goes as the speed squared), true on level ground; on the rolling land
      // a slower ball comes down on ground that rises or falls under it, which moves where it lands by a few per cent of the carry
      // (21.0 against 19.2 + 1.5 on seed 21). The fuzzer holds the same rule with the slack of 2 and three per cent of the carry
      const slack = 1.5 + 0.03 * Math.hypot(shot!.ring!.x - from.x, shot!.ring!.y - from.y);
      expect(Math.abs(u), where).toBeLessThan(s.along + slack);
      expect(Math.abs(v), where).toBeLessThan(s.across + slack);
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
    await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
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
async function onHole(page: Page, hole: ReturnType<typeof windHole> | HoleDef) {
  await page.evaluate((h) => {
    const g = window.game!;
    g.playCourse([h]);
    g.step(300);
  }, hole);
  await expect(page.locator('#start')).toBeHidden();
}

/** A button of the bag's pressed as a click on the element presses it, which a drag held on the course is not let go by. */
const press = (page: Page, selector: string) => page.locator(selector).evaluate((el: HTMLElement) => el.click());

test.describe('the caddie', () => {
  test('a tip pops over the bag when a drive would find the water, is out of the way while a drag is held, puts its draw in hand by its button, counts the stroke that took it, and is asked for and put away by its buttons', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.step(60);
    });
    await onHole(page, CADDIE_HOLES.pondRight);
    const bubble = page.locator('#caddie');
    await expect(bubble).toBeVisible();
    await expect(page.locator('#caddieText')).toHaveText(
      /^Driver finds the water at \d+ yd\. A draw bends it clear\.$/,
    );
    await expect(page.locator('#caddieTry')).toHaveText('Try a draw');
    const said = await page.evaluate(() => window.game!.caddie());
    expect(said.offered).toEqual({ kind: 'shape', club: 'driver', shape: -1, spin: 0 });
    expect(said.looking.done).toBe(true);
    // a drag held puts it out of the way, and it is back when the drag is taken back where it began
    const ball = await page.evaluate(() => {
      const b = window.game!.ball();
      return window.game!.project(b.x, b.y, b.z);
    });
    await drag(page, ball, { x: ball.x, y: ball.y + 120 }, { hold: true });
    await page.evaluate(() => window.game!.step(2));
    await expect(bubble).toBeHidden();
    expect((await page.evaluate(() => window.game!.caddie())).said?.held).toBe(true);
    await page.mouse.move(ball.x, ball.y, { steps: 6 });
    await page.mouse.up();
    await page.evaluate(() => window.game!.step(2));
    expect((await page.evaluate(() => window.game!.state())).strokes).toBe(0);
    await expect(bubble).toBeVisible();
    // its button puts the draw in hand, as the shape button would, and the tip is said no more
    await page.locator('#caddieTry').click();
    await page.evaluate(() => window.game!.step(10));
    expect(
      await page.evaluate(() => ({ club: window.game!.state().inHand, shape: window.game!.state().shape })),
    ).toEqual({
      club: 'driver',
      shape: -1,
    });
    await expect(page.locator('#shapeButton')).toHaveText('Shape: Draw');
    await expect(bubble).toBeHidden();
    // the stroke struck with it took it, and is counted in the save
    await page.evaluate(() => {
      window.game!.shoot(Math.PI / 2, 1);
      window.game!.step(900);
    });
    expect((await page.evaluate(() => window.game!.caddie())).taken).toEqual({ club: 0, shape: 1, spin: 0 });
    // asked for from where the ball now lies it says something, a tip or that the club is fine, and its ✕ puts it away
    expect(await page.evaluate(() => window.game!.caddiePress('ask'))).toBe(true);
    await page.evaluate(() => window.game!.step(10));
    await expect(bubble).toBeVisible();
    await expect(page.locator('#caddieText')).not.toBeEmpty();
    await page.locator('#caddieClose').click();
    await page.evaluate(() => window.game!.step(2));
    await expect(bubble).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('offers top spin to a drive that comes up short on a long hole, and its button puts the spin in hand', async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true, screen: true });
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.step(60);
    });
    // the look at spin runs its rolls to rest a slice a frame, so it is given the frames a long one takes
    await onHole(page, FLAT.road);
    await page.evaluate(() => window.game!.step(120));
    await expect(page.locator('#caddie')).toBeVisible();
    await expect(page.locator('#caddieText')).toHaveText(
      /^Top spin runs the driver on to \d+ yd, \d+ yd from the pin\.$/,
    );
    await expect(page.locator('#caddieTry')).toHaveText('Add top spin');
    await page.locator('#caddieTry').click();
    await page.evaluate(() => window.game!.step(10));
    expect((await page.evaluate(() => window.game!.state())).spin).toBe(1);
    await expect(page.locator('#spinButton')).toHaveText('Spin: Top');
    await expect(page.locator('#caddie')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('is nowhere on a hole of minigolf, under the start screen, or with no tip to give', async ({ page }) => {
    await start(page, { seed: 11, paused: true, screen: true });
    await expect(page.locator('#caddie')).toBeHidden();
    await page.evaluate(() => {
      window.game!.chooseCourse('The Meadow');
      window.game!.step(60);
    });
    await expect(page.locator('#caddie')).toBeHidden();
    await expect(page.locator('#caddieAsk')).toBeHidden();
    await onHole(page, FLAT.long);
    await expect(page.locator('#caddieAsk')).toBeVisible();
    await expect(page.locator('#caddie')).toBeHidden();
  });
});

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
    const ms = await alone(() => page.evaluate(() => window.game!.measureFrame()));
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

  test('on a dogleg a ball come to rest has the camera turn by itself along the line of play, and not to the flag round the corner; the flag button still turns to the flag', async ({
    page,
  }) => {
    const problems = watch(page);
    await longBend(page);
    // the ball put down 100 yards up the first leg of The Links' Long Bend, and chipped a few yards: it comes to rest there and the camera turns by itself
    const [a, b] = links()[2].way!;
    const leg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const to = [a[0] + ((b[0] - a[0]) / leg) * 100, a[1] + ((b[1] - a[1]) / leg) * 100];
    await page.evaluate(([x, y]) => {
      const g = window.game!;
      g.lay(x, y);
      g.step(120);
    }, to);
    expect(await page.evaluate(() => window.game!.shoot(Math.PI / 2, 0.05, 'sand-wedge'))).toBe(true);
    await page.evaluate(() => {
      const g = window.game!;
      for (let f = 0; f < 40 && !g.state().ready; f++) g.step(30);
      g.step(240);
    });
    const v = await view(page);
    expect(v.turning, 'done turning').toBe(false);
    expect(v.line, 'a line of play to look along').not.toBeNull();
    expect(gap(v.azimuth, v.line!), 'turned to it by itself').toBeLessThan(1e-3);
    expect(gap(v.azimuth, v.flag!), 'and not to the flag, which is round the bend').toBeGreaterThan(0.1);
    // the flag button turns to the flag, from the same ball
    await page.locator('#viewFlag').click();
    await page.evaluate(() => window.game!.step(120));
    expect(gap((await view(page)).azimuth, v.flag!), 'the button faces the flag').toBeLessThan(1e-3);
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

/**
 * The first thing a player does: a course chosen from the start screen over the title scene, with a real pointer on the
 * picker's tab, arrow and Play, once the letters have landed and the panel has sprung in. The title is let go, the course's first hole begins, and
 * a stroke can be taken with a drag as on any hole.
 */
test('a course is chosen from over the title with a real pointer, and played', async ({ page }) => {
  const problems = watch(page);
  // in free play, whose start screen is the picker; in the career it is the season's events
  await start(page, { title: true, paused: true, seed: 1, screen: true, save: { mode: 'free' } });
  await play(page, 120, 'the letters dropping');
  expect(await page.evaluate(() => window.game!.title().landed)).toBe(true);
  await expect(page.locator('#start')).toBeVisible();
  await landed(page);
  // the picker worked by a real pointer: the Mini Golf tab, the next arrow to the second course, and Play
  await page.locator('#tab-minigolf').click();
  await page.locator('#courseNext').click();
  await expect(page.locator('#courseName')).toHaveText('The Pinball Shed');
  await page.locator('#playCourse').click();
  const chosen = await page.evaluate(() => window.game!.state());
  expect([chosen.course, chosen.hole, chosen.choosing]).toEqual(['The Pinball Shed', 0, false]);
  expect((await page.evaluate(() => window.game!.title())).up, 'the title is let go').toBe(false);
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#strokes')).toBeVisible();
  await play(page, 60, 'the first hole');
  await putt(page, 0, 80);
  await untilReady(page, 'after the first stroke');
  expect((await page.evaluate(() => window.game!.state())).strokes, 'a stroke taken by a drag').toBe(1);
  expect(problems).toEqual([]);
});

/** The biomes' courses, easiest first, as the start screen's tabs stand them: the tab, and the courses in the order the arrows step. */
const BIOME_TABS = [
  ['desert', ['The Saltpan', 'The Mesa', 'The Badlands']],
  ['moon', ['Tranquility', 'Copernicus', 'The Far Side']],
  ['future', ['Neon Park', 'Chrome Heights', 'The Singularity']],
] as const;

/** The hole in play finished as the autopilot would, a stroke at a time; whether it was holed within `most` strokes. */
async function finishHole(page: Page, stage: string, most = 14) {
  for (let stroke = 1; stroke <= most; stroke++) {
    await page.evaluate(() => {
      const shot = window.game!.suggest();
      if (shot) window.game!.shoot(shot.angle, shot.power);
    });
    for (let f = 0; f < 20 * 60; f += 20) {
      await play(page, 20, `stroke ${stroke} of ${stage}`);
      const { phase, ready } = await page.evaluate(() => window.game!.state());
      if (phase !== 'play' || ready) break;
    }
    if ((await page.evaluate(() => window.game!.state().phase)) !== 'play') return true;
  }
  return false;
}

for (const [biome, courses] of BIOME_TABS)
  test(`a course of the ${biome} is chosen through its tab by a real pointer, a stroke taken by a real drag, and a hole finished`, async ({
    page,
  }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true, screen: true, save: { mode: 'free' } });
    await landed(page);
    // the tab, then the arrows: three courses each, easiest first, wrapping, and the dots say how many
    await page.locator(`#tab-${biome}`).click();
    await expect(page.locator(`#tab-${biome}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#courseName')).toHaveText(courses[0]);
    await expect(page.locator('#courseDots > *')).toHaveCount(3);
    await page.locator('#courseNext').click();
    await expect(page.locator('#courseName')).toHaveText(courses[1]);
    await page.locator('#coursePrev').click();
    await page.locator('#coursePrev').click();
    await expect(page.locator('#courseName'), 'back from the first is the last').toHaveText(courses[2]);
    await page.locator('#courseNext').click();
    await expect(page.locator('#courseName')).toHaveText(courses[0]);
    // the strip of its nine holes is fetched as it is viewed
    await expect(page.locator('#courseStrip img')).toHaveCount(9);
    await page.locator('#playCourse').click();
    const chosen = await page.evaluate(() => window.game!.state());
    expect([chosen.course, chosen.golf, chosen.hole, chosen.choosing]).toEqual([courses[0], true, 0, false]);
    expect((await page.evaluate(() => window.game!.theme())).name, 'the hole is in its biome').toBe(biome);
    await expect(page.locator('#start')).toBeHidden();
    await play(page, 75, 'the first tee');
    await expect(page.locator('#bag')).toBeVisible();
    // a stroke by a real drag: back and down from the ball, half the swing
    const at = await page.evaluate(() => {
      const b = window.game!.ball();
      return window.game!.project(b.x, b.y, b.z);
    });
    const short = await page.evaluate(() => Math.min(innerWidth, innerHeight));
    await drag(page, at, { x: at.x, y: at.y + 0.2 * short });
    expect((await page.evaluate(() => window.game!.state())).strokes, 'the stroke taken by the drag').toBe(1);
    await untilReady(page, `after the first stroke on ${courses[0]}`);
    // and the hole finished, scored on the card
    expect(await finishHole(page, `${courses[0]}'s first hole`), 'holed').toBe(true);
    await play(page, 20, 'the hole done');
    const done = await page.evaluate(() => window.game!.state());
    expect(done.phase).toBe('done');
    expect(done.card).toHaveLength(1);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

test('a round of one biome ends on the card, and the start screen it goes back to takes the next course of another biome, and of the earth, in the look of each', async ({
  page,
}) => {
  const problems = watch(page);
  // under the title, as a player meets the game: its letters dropped, the start screen over the earth
  await start(page, { title: true, paused: true, seed: 1, screen: true, save: { mode: 'free' } });
  await play(page, 120, 'the letters dropping');
  expect(await page.evaluate(() => window.game!.title().landed)).toBe(true);
  await landed(page);
  // the desert's last hole, begun as a round of one: finished to the card
  await page.locator('#tab-desert').click();
  await page.locator('#playCourse').click();
  await page.evaluate(() => window.game!.startHole(8));
  await play(page, 75, 'the last hole of The Saltpan');
  expect((await page.evaluate(() => window.game!.theme())).name).toBe('desert');
  expect(await finishHole(page, 'the last hole of The Saltpan', 16), 'holed').toBe(true);
  await play(page, 240, 'the card');
  expect((await page.evaluate(() => window.game!.state())).phase).toBe('over');
  await expect(page.locator('#card')).toBeVisible();
  // back to the courses, the Moon's tab pressed by a real pointer: a hole of the Moon in the Moon's look
  await page.locator('#cardCourses').click();
  await expect(page.locator('#start')).toBeVisible();
  await landed(page);
  await play(page, 30, 'the start screen after the round');
  expect((await page.evaluate(() => window.game!.theme())).name, 'the title’s own sky is the earth’s again').toBe(
    'earth',
  );
  await page.locator('#tab-moon').click();
  await expect(page.locator('#courseName')).toHaveText('Tranquility');
  await page.locator('#playCourse').click();
  await play(page, 30, 'the Moon’s first hole');
  expect((await page.evaluate(() => window.game!.state())).course).toBe('Tranquility');
  expect((await page.evaluate(() => window.game!.theme())).name).toBe('moon');
  // and from the Moon to The Links: earth's sky comes back, every field of it
  await page.evaluate(() => window.game!.chooseCourse('The Links'));
  await play(page, 30, 'The Links');
  expect((await page.evaluate(() => window.game!.theme())).name).toBe('earth');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('a save from before the biome tours loads with each new tour at its first event, entered and gone on with from its own tab', async ({
  page,
}) => {
  const problems = watch(page);
  // the season of 15 October 2026's shape: two tours only, the golf at the county grade, a round kept on the mini
  const kit = { club: '', ball: '', accessory: '' };
  await start(page, {
    seed: 1,
    paused: true,
    screen: true,
    save: {
      coins: 500,
      gems: 0,
      owned: [],
      kit,
      best: {},
      mode: 'career',
      records: {},
      round: null,
      season: {
        golf: { grade: 'county', begun: 1, played: [[4, 4, 4, 4, 4, 4, 4, 4, 4]], titles: 0 },
        mini: { grade: 'club', begun: 0, played: [], titles: 0 },
      },
      caddie: { club: 0, shape: 0, spin: 0 },
    },
  });
  await landed(page);
  for (const [biome, courses] of BIOME_TABS) {
    await page.locator(`#tab-${biome}`).click();
    await expect(page.locator('#courseName')).toHaveText(courses[0]);
    await expect(page.locator('#courseEvent')).toHaveText('Club tour · Event 1 of 3');
    await expect(page.locator('#enterEvent')).toHaveText('Enter · free');
  }
  const loaded = (await page.evaluate(() => window.game!.season())).season;
  for (const tour of ['desert', 'moon', 'future'] as const)
    expect(loaded[tour], tour).toEqual({ grade: 'club', begun: 0, played: [], titles: 0 });
  expect(loaded.golf.grade, 'the old season is what it was').toBe('county');
  // the moon tab's Enter, pressed by a real pointer, takes the moon tour's first event, and its round is kept on that tour
  await page.locator('#tab-moon').click();
  await page.locator('#enterEvent').click();
  const state = await page.evaluate(() => window.game!.state());
  expect([state.course, state.hole, state.choosing]).toEqual(['Tranquility', 0, false]);
  expect((await page.evaluate(() => window.game!.season())).event).toEqual({ tour: 'moon', index: 0 });
  expect((await page.evaluate(() => window.game!.career())).round).toMatchObject({ tour: 'moon', hole: 0 });
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('a reload mid-event on a biome tour goes on from its tab: the Continue button, the fee not asked again, the board thru the holes kept', async ({
  page,
}) => {
  const problems = watch(page);
  const card = [4, 5, 4];
  await start(page, {
    seed: 1,
    paused: true,
    screen: true,
    save: {
      coins: 10,
      round: { tour: 'desert', course: 'The Mesa', hole: 3, card, retaken: false, pickedUp: false },
      season: { desert: { grade: 'county', begun: 1, played: [[4, 5, 3, 4, 4, 3, 5, 4, 4]], titles: 0 } },
    },
  });
  await landed(page);
  await page.locator('#tab-desert').click();
  await expect(page.locator('#courseName')).toHaveText('The Mesa');
  await expect(page.locator('#courseEvent')).toHaveText('County tour · Event 2 of 3');
  await expect(page.locator('#enterEvent')).toHaveText('Continue · hole 4');
  await page.locator('#enterEvent').click();
  const resumed = await page.evaluate(() => window.game!.state());
  expect([resumed.course, resumed.hole, resumed.coins, resumed.choosing]).toEqual(['The Mesa', 3, 10, false]);
  expect(resumed.card).toEqual(card);
  expect((await page.evaluate(() => window.game!.season())).event).toEqual({ tour: 'desert', index: 1 });
  expect((await page.evaluate(() => window.game!.season())).board?.head).toBe('Leaderboard · thru 3');
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('the previews are fetched only as a course is viewed: the nine of the course in view, and the next course’s as it is stepped to', async ({
  page,
}) => {
  const problems = watch(page);
  const fetched = new Set<string>();
  page.on('request', (r) => {
    const m = /\/previews\/([^/]+)\/\d+\.png/.exec(r.url());
    if (m) fetched.add(m[1]);
  });
  await start(page, { seed: 1, paused: true, screen: true, save: { mode: 'free' } });
  await landed(page);
  await expect(page.locator('#courseStrip img')).toHaveCount(9);
  await page.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => null))));
  expect([...fetched], 'only the course the start screen opens on').toEqual(['the-links']);
  await page.locator('#tab-future').click();
  await expect(page.locator('#courseName')).toHaveText('Neon Park');
  await page.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => null))));
  expect([...fetched].sort(), 'and the one more of the tab pressed').toEqual(['neon-park', 'the-links']);
  expect(problems).toEqual([]);
});

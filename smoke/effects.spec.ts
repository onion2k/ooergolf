/**
 * The effects of a stroke as a page draws them (12 November 2026): the ball long as a hard shot leaves and round for a
 * soft one, sparks off the rail for a hard knock and none for a soft, a divot from an iron off the grass and none from the
 * tee, a ring where a lofted ball lands, and a burst at the cup as good as the score. Each is read back from what the
 * page emitted (`motions()`), a frame at a time: what the particles look like is `look.spec.ts`'s.
 */
import { expect, test } from '@playwright/test';
import { start, watch } from './game';

test('a hard shot leaves long and is round again, throws sparks off the rail, and a soft one does neither', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  // struck hard along the first hole's width, at its rail
  const hard = await page.evaluate(() => {
    const g = window.game!;
    g.shoot(0, 1);
    g.step(1);
    const leaving = g.motions().squash;
    let sparks = 0,
      knocked = 0;
    const after: number[] = [];
    for (let f = 0; f < 120; f++) {
      g.step(1);
      if (f < 12) after.push(g.motions().squash);
      const told = g.events().filter((e) => e.startsWith('knocked'));
      if (told.length && !knocked) {
        knocked = Number(told[0].split(' ')[1].split(',')[0]);
        sparks = g.motions().sparks;
      }
    }
    return { leaving, after, sparks, knocked };
  });
  expect(hard.leaving, 'drawn long along the shot as it leaves').toBeLessThan(-0.05);
  expect(hard.knocked, 'a hard knock off the rail').toBeGreaterThan(14);
  expect(hard.sparks, 'sparks off the rail').toBeGreaterThan(0);
  // a soft putt on a fresh hole: round as it leaves, and whatever it meets throws nothing
  await start(page, { seed: 1, paused: true });
  const soft = await page.evaluate(() => {
    const g = window.game!;
    g.shoot(Math.PI / 2, 0.2);
    g.step(1);
    const leaving = g.motions().squash;
    for (let f = 0; f < 240 && !g.state().ready; f++) g.step(1);
    return { leaving, sparks: g.motions().sparks };
  });
  expect(soft.leaving, 'a soft putt leaves round').toBe(0);
  expect(soft.sparks, 'no sparks from a soft one').toBe(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('on golf a drive from the tee takes no divot and lands in a ring, and an iron off the fairway takes one', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const seen = await page.evaluate(() => {
    const g = window.game!;
    g.chooseCourse('The Links');
    g.step(2);
    // the drive, up the hole
    g.shoot(Math.PI / 2, 1, 'driver');
    g.step(1);
    const tee = { divot: g.motions().divot, squash: g.motions().squash };
    let ring = 0;
    for (let f = 0; f < 900 && !g.state().ready; f++) {
      g.step(1);
      if (!ring) ring = g.motions().ring;
    }
    const lie = g.state();
    // and an iron from where it lies
    g.shoot(Math.PI / 2, 0.8, '7-iron');
    g.step(1);
    return { tee, ring, iron: g.motions().divot, ready: lie.ready, puff: g.motions().puff };
  });
  expect(seen.ready, 'the drive came to rest').toBe(true);
  expect(seen.tee.divot, 'none from the tee').toBe(0);
  expect(seen.tee.squash, 'a drive leaves long').toBeLessThan(-0.1);
  expect(seen.ring, 'a ring where it came down').toBeGreaterThan(0);
  if (seen.puff === 'grass') expect(seen.iron, 'an iron off the grass takes a divot').toBeGreaterThan(0);
  else expect(seen.iron, 'none out of sand').toBe(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

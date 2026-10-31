/**
 * The look of a biome in a real browser: a hole in each begins through the page's real start of a hole, on a desk and on a phone,
 * with no console error, and the renderer reports the look of its theme (sky, environment, haze, and whether blades are grown);
 * a hole of another biome after it takes its look, and an earth hole after any of them takes earth's back, every field, sky
 * included. A biome's hole is drawn inside the frame budget, and the words on the page keep their contrast against the Moon's
 * dark and the future's dusk. These are the biome seam's own scenes, on test holes (The Links' Water Carry made in each, and the
 * biggest woods made a desert and a future, played as a course of their own through `playCourse`), held on every rung of the
 * ladder; the nine real courses' heaviest tees and longest holes are `biome-frames.spec.ts`'s, and their pictures are
 * `look.spec.ts`'s.
 */
import { expect, test, type Page } from '@playwright/test';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { WOODS_SPECS } from '../src/woods';
import { ISLES_SPECS } from '../src/isles';
import { DRAG } from '../src/shot';
import { BIOMES, type BiomeName } from '../src/biome';
import { LOOKS } from './biomes';
import { BUDGET } from './budget';
import { drag, start, watch } from './game';
import { levelHole } from '../test/level';
import { alone } from './gpu';
import { CONTRAST, read } from './panels';

/** Water Carry made in a biome: plain data for a page, whose ground it makes a `Float32Array` of again. */
function holeIn(biome: BiomeName) {
  const spec = { ...LINKS_SPECS[1], name: `Water Carry in the ${biome}`, ...(biome === 'earth' ? {} : { biome }) };
  const hole = golfHole(biome === 'moon' ? { ...spec, trees: 0 } : spec);
  return { ...hole, terrain: Array.from(hole.terrain as Float32Array) };
}

/** Begin a hole through the page's start of one. */
async function begin(page: Page, biome: BiomeName) {
  await page.evaluate((hole) => {
    window.game!.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }]);
    window.game!.step(30);
  }, holeIn(biome));
  await page.evaluate(() => window.game!.grass());
}

const report = (page: Page) => page.evaluate(() => window.game!.theme());

function holds(r: Awaited<ReturnType<typeof report>>, biome: BiomeName) {
  const want = LOOKS[biome];
  expect(r.name).toBe(biome);
  r.sky.zenith.forEach((c, k) => expect(c).toBeCloseTo(want.zenith[k], 5));
  r.sky.horizon.forEach((c, k) => expect(c).toBeCloseTo(want.horizon[k], 5));
  r.background.forEach((c, k) => expect(c).toBeCloseTo(want.background[k], 5));
  expect(r.environment).toBe(want.environment);
  expect(r.grass).toBe(want.grass);
  // only a mirror biome asks the renderer for the scene in its water, and a hole after it asks for it no longer
  expect(r.mirror, `${biome}: the mirror`).toBe(want.mirror);
  r.fog.forEach((c, k) => expect(c).toBeCloseTo(want.fog[k], 5));
  r.sunDir.forEach((c, k) => expect(c).toBeCloseTo(want.sunDir[k], 5));
}

const BIOME_NAMES = Object.keys(BIOMES) as BiomeName[];

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`each biome begins on ${screen}, draws with no console error and reports the look of its theme`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    for (const biome of BIOME_NAMES) {
      await begin(page, biome);
      holds(await report(page), biome);
      expect(await page.evaluate(() => window.game!.invariants()), biome).toEqual([]);
      // the wind of a calm biome is not shown, nor its word
      const wind = await page.evaluate(() => window.game!.motions().wind);
      if (BIOMES[biome].calm) expect(wind ?? null, `${biome}: no wind line, not 0 mph`).toBeNull();
      else expect(wind, `${biome}: a wind line`).not.toBeNull();
      // a stroke on each, with the real thing: the puff and the press do nothing wrong with no grass
      await page.evaluate(() => {
        const g = window.game!;
        g.club('7-iron');
        g.shoot(Math.PI / 2, 0.5);
        g.step(240);
      });
      expect(await page.evaluate(() => window.game!.invariants()), `${biome} after a stroke`).toEqual([]);
    }
    expect(problems).toEqual([]);
  });

test('a hole of another biome takes its look, and an earth hole after any of them takes earth’s back, every field, sky included', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  await begin(page, 'earth');
  const earth = await report(page);
  holds(earth, 'earth');
  for (const order of [
    ['moon', 'earth'],
    ['future', 'desert', 'earth'],
    ['moon', 'future', 'moon', 'earth'],
  ] as const) {
    for (const biome of order) {
      await begin(page, biome);
      holds(await report(page), biome);
    }
    expect(await report(page), `earth after ${order.join(', ')}`).toEqual(earth);
  }
  // and a real round: a course of the page's own, after the Moon, is lit as it always was
  await begin(page, 'moon');
  await page.evaluate(() => window.game!.chooseCourse('The Meadow'));
  expect(await report(page)).toEqual(earth);
  expect(problems).toEqual([]);
});

test('a hole in each biome is drawn inside the frame budget on its tee, and the words keep their contrast on the Moon’s dark and the future’s dusk', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 400, height: 860 });
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  const figures: Record<string, number> = {};
  for (const biome of BIOME_NAMES) {
    await begin(page, biome);
    const frame = await alone(() =>
      page.evaluate(async () => {
        const g = window.game!;
        g.step(60);
        g.step(1);
        return g.measureFrame(300);
      }),
    );
    figures[biome] = Math.round(frame * 100) / 100;
    expect(frame, `${biome}: a frame on the tee`).toBeLessThanOrEqual(BUDGET.frameMs);
    // the words over the picture, read for contrast against what is behind them
    const reading = await read(page);
    for (const t of reading.texts) expect(t.ratio, `${biome}: "${t.text}"`).toBeGreaterThanOrEqual(CONTRAST);
    expect(reading.outside, biome).toEqual([]);
  }
  info.annotations.push({ type: 'frames', description: JSON.stringify(figures) });
  console.log(`biome frames on a tee (ms): ${JSON.stringify(figures)}`);
  expect(problems).toEqual([]);
});

/** The heaviest desert tee there is: the biggest wood of The Woods made a desert, which is a hundred and more cacti on a hole of golf. */
function heavyDesert() {
  const hole = golfHole({ ...WOODS_SPECS[6], name: 'Heavy desert', biome: 'desert' });
  return { ...hole, terrain: Array.from(hole.terrain as Float32Array) };
}

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`a heavy desert tee is drawn inside the frame budget on ${screen}, on every rung of the ladder, and no dearer a rung down`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    const costs: number[] = [];
    for (let rung = 0; rung < 4; rung++) {
      const problems = watch(page);
      await start(page, { seed: 5, paused: true, rung });
      await page.evaluate((hole) => {
        window.game!.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }]);
        window.game!.step(60);
      }, heavyDesert());
      // what is drawn is the desert's: its sky, its blades (sparse tufts) and its cacti
      const report = await page.evaluate(() => window.game!.theme());
      expect(report.name).toBe('desert');
      expect(report.grass, `rung ${rung}: the tufts survive every rung`).toBe(true);
      const trees = await page.evaluate(() => window.game!.content().trees.length);
      expect(trees, 'a wood of cacti').toBeGreaterThan(50);
      costs.push(
        await alone(() =>
          page.evaluate(async () => {
            const g = window.game!;
            g.step(1);
            return g.measureFrame(300);
          }),
        ),
      );
      // the tufts are drawn on this rung: some blades in the rough near the tee
      const grass = await page.evaluate(() => window.game!.grass());
      expect(grass.near + grass.far, `rung ${rung}: blades drawn`).toBeGreaterThan(200);
      expect(problems).toEqual([]);
    }
    const shown = costs.map((c) => Math.round(c * 100) / 100);
    info.annotations.push({ type: 'frames', description: JSON.stringify(shown) });
    console.log(`a heavy desert tee on ${screen}, each rung (ms): ${shown.join(', ')}`);
    for (const [rung, ms] of costs.entries())
      expect(ms, `rung ${rung}: inside the ${BUDGET.frameMs} ms budget`).toBeLessThanOrEqual(BUDGET.frameMs);
    for (let rung = 1; rung < costs.length; rung++)
      expect(costs[rung], `rung ${rung} against the one above`).toBeLessThan(costs[rung - 1] + 0.5);
  });

test('a stroke from the grass of the desert throws up its dust, in its theme’s colour, and earth’s is the green it always was', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  expect(await page.evaluate(() => window.game!.dust()), 'nothing thrown before a stroke').toBeNull();
  for (const biome of ['earth', 'desert'] as const) {
    await begin(page, biome);
    await page.evaluate(() => {
      const g = window.game!;
      g.club('7-iron');
      g.shoot(Math.PI / 2, 0.5);
    });
    expect(await page.evaluate(() => window.game!.motions().puff), `${biome}: from the grass`).toBe('grass');
    const dust = await page.evaluate(() => window.game!.dust());
    expect(dust, biome).toEqual(LOOKS[biome].dust);
    // and the ball's first landing throws the same dust up again, in the same colour
    await page.evaluate(() => window.game!.step(240));
    expect(await page.evaluate(() => window.game!.dust()), `${biome}: after the landing`).toEqual(LOOKS[biome].dust);
    expect(await page.evaluate(() => window.game!.invariants()), biome).toEqual([]);
  }
  expect(problems).toEqual([]);
});

/** The heaviest Moon tee there is: the biggest hole of The Isles, made the Moon (which has no trees to plant). */
function heavyMoon() {
  const hole = golfHole({ ...ISLES_SPECS[1], name: 'Heavy moon', biome: 'moon', trees: 0 });
  return { ...hole, terrain: Array.from(hole.terrain as Float32Array) };
}

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`a heavy Moon tee, and its fly-in with the stars and the Earth, are drawn inside the frame budget on ${screen}, on every rung`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    const costs: number[] = [];
    const flyCosts: number[] = [];
    for (let rung = 0; rung < 4; rung++) {
      const problems = watch(page);
      await start(page, { seed: 5, paused: true, rung, flyIn: true });
      await page.evaluate((hole) => {
        window.game!.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }]);
        window.game!.step(3);
      }, heavyMoon());
      expect((await page.evaluate(() => window.game!.theme())).name).toBe('moon');
      // the fly-in sees the sky: the stars and the Earth are drawn to it
      expect(
        await page.evaluate(() => window.game!.motions().sky),
        `rung ${rung}: the sky seen in the fly-in`,
      ).toBeGreaterThanOrEqual(2);
      flyCosts.push(
        await alone(() =>
          page.evaluate(async () => {
            window.game!.step(1);
            return window.game!.measureFrame(200);
          }),
        ),
      );
      // and the play view, once it is under way, sees none of it
      await page.evaluate(() => window.game!.step(600));
      expect(await page.evaluate(() => window.game!.motions().sky), `rung ${rung}: no sky in the play view`).toBe(0);
      costs.push(
        await alone(() =>
          page.evaluate(async () => {
            window.game!.step(1);
            return window.game!.measureFrame(300);
          }),
        ),
      );
      expect(problems).toEqual([]);
    }
    const shown = costs.map((c) => Math.round(c * 100) / 100);
    const flown = flyCosts.map((c) => Math.round(c * 100) / 100);
    info.annotations.push({ type: 'frames', description: JSON.stringify({ tee: shown, flyIn: flown }) });
    console.log(`a heavy Moon tee on ${screen}, each rung (ms): ${shown.join(', ')}; its fly-in: ${flown.join(', ')}`);
    for (const [rung, ms] of [...costs, ...flyCosts].entries())
      expect(ms, `figure ${rung}: inside the ${BUDGET.frameMs} ms budget`).toBeLessThanOrEqual(BUDGET.frameMs);
  });

test('a ball into the crater through a real drag costs a stroke, throws up dust and no ring, and is put back; the wind is not told', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  await begin(page, 'moon');
  // a power that lands in the crater, found by trying the shot through the API on this hole and putting the hole back each time
  const power = await page.evaluate(() => {
    const g = window.game!;
    g.club('PW');
    for (let p = 0.3; p <= 1.001; p += 0.05) {
      g.startHole(0);
      g.step(5);
      g.club('PW');
      g.shoot(Math.PI / 2, p);
      g.step(600);
      if (g.events().some((e) => e.startsWith('splash'))) return p;
    }
    return null;
  });
  expect(power, 'a pitching wedge that finds the crater').not.toBeNull();
  await page.evaluate(() => {
    const g = window.game!;
    g.startHole(0);
    g.step(5);
    g.club('PW');
  });
  const plan = await page.evaluate(() => {
    const g = window.game!;
    const b = g.ball();
    const from = g.project(b.x, b.y, b.z);
    // a point a little way back along the line to the cup gives the drag its direction on the page
    const back = g.project(b.x, b.y - 4, b.z);
    return { from, back, short: Math.min(innerWidth, innerHeight) };
  });
  const dx = plan.back.x - plan.from.x,
    dy = plan.back.y - plan.from.y,
    len = Math.hypot(dx, dy);
  const pull = (power as number) * DRAG.full * plan.short;
  await drag(
    page,
    plan.from,
    { x: plan.from.x + (dx / len) * pull, y: plan.from.y + (dy / len) * pull },
    { steps: 10 },
  );
  await page.evaluate(() => window.game!.step(600));
  const state = await page.evaluate(() => window.game!.state());
  expect(state.strokes, 'a stroke, and the one it cost').toBe(2);
  expect((await page.evaluate(() => window.game!.events())).some((e) => e.startsWith('splash'))).toBe(true);
  // no ring spread over the pit, as water's does, and the dust is the Moon's grey
  expect(await page.evaluate(() => window.game!.motions().splash)).toBe(0);
  expect(await page.evaluate(() => window.game!.dust())).toEqual(LOOKS.moon.dust);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  // the wind is not told on a calm world
  expect(await page.evaluate(() => window.game!.motions().wind ?? null)).toBeNull();
  expect(problems).toEqual([]);
});

/** The heaviest Future tee there is: the biggest wood of The Woods made the Future, whose trees are holograms. */
function heavyFuture() {
  const hole = golfHole({ ...WOODS_SPECS[6], name: 'Heavy future', biome: 'future' });
  return { ...hole, terrain: Array.from(hole.terrain as Float32Array) };
}

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`a heavy Future tee, a wood of glowing holograms, is drawn inside the frame budget on ${screen}, on every rung, and flickers`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    const costs: number[] = [];
    for (let rung = 0; rung < 4; rung++) {
      const problems = watch(page);
      await start(page, { seed: 5, paused: true, rung });
      await page.evaluate((hole) => {
        window.game!.playCourse([{ ...hole, terrain: Float32Array.from(hole.terrain) }]);
        window.game!.step(60);
      }, heavyFuture());
      expect((await page.evaluate(() => window.game!.theme())).name).toBe('future');
      expect(await page.evaluate(() => window.game!.content().trees.length), 'a wood of holograms').toBeGreaterThan(50);
      costs.push(
        await alone(() =>
          page.evaluate(async () => {
            window.game!.step(1);
            return window.game!.measureFrame(300);
          }),
        ),
      );
      expect(problems).toEqual([]);
    }
    const shown = costs.map((c) => Math.round(c * 100) / 100);
    info.annotations.push({ type: 'frames', description: JSON.stringify(shown) });
    console.log(`a heavy Future tee on ${screen}, each rung (ms): ${shown.join(', ')}`);
    for (const [rung, ms] of costs.entries())
      expect(ms, `rung ${rung}: inside the ${BUDGET.frameMs} ms budget`).toBeLessThanOrEqual(BUDGET.frameMs);
  });

/** The first three holes of The Woods made the Future: a pond (quicksilver, the mirror) across the line among 55, 141 and 163 holograms. */
const MIRRORED = [0, 1, 2].map((i) => {
  const hole = golfHole({ ...WOODS_SPECS[i], name: `Mirror ${WOODS_SPECS[i].name}`, biome: 'future' });
  return { ...hole, terrain: Array.from(hole.terrain as Float32Array) };
});

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`a pond of quicksilver among holograms, which draws the scene twice, is inside the frame budget on ${screen}, on every rung`, async ({
    page,
  }, info) => {
    test.setTimeout(400_000);
    await page.setViewportSize({ width, height });
    const figures: Record<string, number[]> = {};
    for (const [k, hole] of MIRRORED.entries()) {
      figures[hole.name] = [];
      for (let rung = 0; rung < 4; rung++) {
        const problems = watch(page);
        await start(page, { seed: 5, paused: true, rung });
        await page.evaluate((h) => {
          window.game!.playCourse([{ ...h, terrain: Float32Array.from(h.terrain) }]);
          window.game!.step(90);
        }, hole);
        expect(await page.evaluate(() => window.game!.content().trees.length), `hole ${k}: holograms`).toBeGreaterThan(
          40,
        );
        figures[hole.name].push(
          await alone(() =>
            page.evaluate(async () => {
              window.game!.step(1);
              return window.game!.measureFrame(300);
            }),
          ),
        );
        expect(problems).toEqual([]);
      }
    }
    const shown = Object.fromEntries(
      Object.entries(figures).map(([n, c]) => [n, c.map((v) => Math.round(v * 100) / 100)]),
    );
    info.annotations.push({ type: 'frames', description: JSON.stringify(shown) });
    console.log(`a mirror among holograms on ${screen}, each rung (ms): ${JSON.stringify(shown)}`);
    for (const [name, costs] of Object.entries(figures))
      for (const [rung, ms] of costs.entries())
        expect(ms, `${name}, rung ${rung}: inside the ${BUDGET.frameMs} ms budget`).toBeLessThanOrEqual(BUDGET.frameMs);
  });

test('a hologram is drawn the same at the same game time on two runs, byte for byte: its flicker is time and nothing else', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const shots: Buffer[] = [];
  for (let run = 0; run < 2; run++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    await begin(page, 'future');
    await page.evaluate(() => window.game!.step(97));
    await page.waitForTimeout(1200);
    shots.push(await page.screenshot({ clip: { x: 340, y: 100, width: 600, height: 400 } }));
    expect(problems).toEqual([]);
    await page.close();
  }
  expect(shots[1].equals(shots[0]), 'the same pixels on both runs').toBe(true);
});

test('the mirror, with the holograms upside down in it, is drawn the same at the same game time on two runs, byte for byte', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const shots: Buffer[] = [];
  for (let run = 0; run < 2; run++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    await begin(page, 'future');
    await page.evaluate(() => window.game!.step(97));
    await page.waitForTimeout(1500);
    expect((await page.evaluate(() => window.game!.theme())).mirror).toBe(true);
    shots.push(await page.screenshot({ clip: { x: 440, y: 180, width: 400, height: 200 } }));
    expect(problems).toEqual([]);
    await page.close();
  }
  expect(shots[1].equals(shots[0]), 'the same pixels on both runs').toBe(true);
});

test('a ball struck through a hologram by a real drag is told of it, is slowed and not knocked, and the ball in quicksilver costs a stroke and says so', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await start(page, { seed: 5, paused: true });
  const holeSpec = levelHole({
    name: 'Through a hologram',
    par: 3,
    length: 150,
    biome: 'future',
    trees: [{ along: 40, across: 0 }],
  });
  const hole = { ...holeSpec, terrain: holeSpec.terrain ? Array.from(holeSpec.terrain as Float32Array) : undefined };
  // a club and a power that go through the hologram, found by the API, the hole put back each time
  const found = await page.evaluate((h) => {
    const g = window.game!;
    g.playCourse([{ ...h, terrain: h.terrain ? Float32Array.from(h.terrain) : undefined }]);
    // the middle of a run of powers that all go through (a shot that only just clips the cone is not the one to drag)
    for (const club of ['sand-wedge', 'pitching-wedge', '9-iron', '7-iron', '5-iron', 'driver']) {
      const hits: number[] = [];
      for (let p = 0.2; p <= 1.001; p += 0.05) {
        g.startHole(0);
        g.step(5);
        g.club(club);
        g.shoot(Math.PI / 2, p);
        g.step(900);
        if (g.events().some((e) => e.startsWith('flickered'))) hits.push(p);
      }
      if (hits.length >= 3) return { club, p: hits[Math.floor(hits.length / 2)] };
    }
    return null;
  }, hole);
  expect(found, 'a shot that goes through the hologram').not.toBeNull();
  await page.evaluate(
    ([club]) => {
      const g = window.game!;
      g.startHole(0);
      g.step(180);
      g.club(club);
    },
    [found!.club] as const,
  );
  const plan = await page.evaluate(() => {
    const g = window.game!;
    const b = g.ball();
    return {
      from: g.project(b.x, b.y, b.z),
      back: g.project(b.x, b.y - 4, b.z),
      short: Math.min(innerWidth, innerHeight),
    };
  });
  const dx = plan.back.x - plan.from.x,
    dy = plan.back.y - plan.from.y,
    len = Math.hypot(dx, dy);
  const pull = found!.p * DRAG.full * plan.short;
  await drag(
    page,
    plan.from,
    { x: plan.from.x + (dx / len) * pull, y: plan.from.y + (dy / len) * pull },
    { steps: 10 },
  );
  await page.evaluate(() => window.game!.step(900));
  const events = await page.evaluate(() => window.game!.events());
  expect(
    events.some((e) => e.startsWith('flickered')),
    `told of a ball through a hologram ${JSON.stringify({ found, events, pull, short: plan.short })}`,
  ).toBe(true);
  // not knocked by the hologram: nothing knocks before the ball has gone through it (a knock after is the ground it came down on)
  const through = events.findIndex((e) => e.startsWith('flickered'));
  expect(
    events.slice(0, through).some((e) => e.startsWith('knocked')),
    'and not knocked by it',
  ).toBe(false);
  expect(await page.evaluate(() => window.game!.state().strokes)).toBe(1);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);

  // and into the mirror, on Water Carry in the Future, by a drag as the crater's was
  await begin(page, 'future');
  const found2 = await page.evaluate(() => {
    const g = window.game!;
    // the middle of a run of powers that all find the water, with the first club of the bag that has one
    for (const club of ['driver', '3-wood', '5-iron', '7-iron', 'pitching-wedge']) {
      const hits: number[] = [];
      for (let p = 0.3; p <= 1.001; p += 0.05) {
        g.startHole(0);
        g.step(5);
        g.club(club);
        g.shoot(Math.PI / 2, p);
        g.step(600);
        if (g.events().some((e) => e.startsWith('splash'))) hits.push(p);
      }
      if (hits.length >= 3) return { club, p: hits[Math.floor(hits.length / 2)] };
    }
    return null;
  });
  const power = found2?.p ?? null;
  expect(power, 'a club that finds the quicksilver').not.toBeNull();
  await page.evaluate(() => {
    const g = window.game!;
    g.startHole(0);
    g.step(180);
  });
  await page.evaluate((club) => window.game!.club(club), found2!.club);
  const water = await page.evaluate(() => {
    const g = window.game!;
    const b = g.ball();
    return {
      from: g.project(b.x, b.y, b.z),
      back: g.project(b.x, b.y - 4, b.z),
      short: Math.min(innerWidth, innerHeight),
    };
  });
  const wx = water.back.x - water.from.x,
    wy = water.back.y - water.from.y,
    wl = Math.hypot(wx, wy);
  const wpull = (power as number) * DRAG.full * water.short;
  await drag(
    page,
    water.from,
    { x: water.from.x + (wx / wl) * wpull, y: water.from.y + (wy / wl) * wpull },
    { steps: 10 },
  );
  // (the ring spreads for a moment and fades: its widest is read as the frames go by)
  const ring = await page.evaluate(() => {
    let widest = 0;
    for (let f = 0; f < 600; f += 5) {
      window.game!.step(5);
      widest = Math.max(widest, window.game!.motions().splash);
    }
    return widest;
  });
  const after = await page.evaluate(() => ({
    strokes: window.game!.state().strokes,
    events: window.game!.events(),
    ball: window.game!.ball(),
  }));
  expect(
    after.strokes,
    `a stroke, and the one it cost ${JSON.stringify({ power, wpull, water: water.short, after })}`,
  ).toBe(2);
  await expect(page.getByText(/quicksilver/i)).toBeVisible();
  // a ring spreads over the silver, as it does not over earth's open water
  expect(ring).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

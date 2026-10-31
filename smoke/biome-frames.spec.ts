/**
 * What the nine biome courses cost to draw and to begin, on the real courses and not on test holes (`biome.spec.ts` holds
 * those): the heaviest tee of each biome, found from the layouts so that a heavier hole added later is the one held, drawn on
 * a desk and on a phone inside the frame budget under `alone()`, and the longest hole of any biome course begun inside the
 * begin budget in turn with its course's smallest.
 *
 * "Heaviest" is read, not guessed: the desert and the Future are heaviest where their cacti and holograms are most, the Moon
 * where its craters (water to the layout) cover the most ground, and the Future's mirror is the dearest where a lake of
 * quicksilver has the most holograms standing about it, so each biome is given its readings. `perf.spec.ts`'s
 * `biggestGolfHole` skips biome courses by design: its figures are the earth's, held to a baseline, and a biome course among
 * them would move the baseline whenever one was added; these scenes are held to the budget alone.
 */
import { expect, test } from '@playwright/test';
import { layoutOf } from '../src/arena';
import { COURSES } from '../src/course';
import type { BiomeName } from '../src/biome';
import { BUDGET } from './budget';
import { start, watch } from './game';
import { alone } from './gpu';

interface Row {
  biome: BiomeName;
  course: string;
  hole: number;
  name: string;
  trees: number;
  water: number;
  tiles: number;
  reach: number;
  small: number;
}

/** Each biome course's holes with what each costs to draw, read from the layout the game will make of it. */
function figures(): Row[] {
  const rows: Row[] = [];
  for (const c of COURSES) {
    if (!c.golf || !c.biome) continue;
    const sizes = c.holes.map((h) => h.map.length * Math.max(...h.map.map((r) => r.length)));
    c.holes.forEach((h, hole) => {
      const l = layoutOf(h.map, h.terrain, h.way, h.biome);
      let water = 0;
      for (const w of l.water) water += w;
      rows.push({
        biome: c.biome!,
        course: c.name,
        hole,
        name: h.name,
        trees: l.trees.length,
        water,
        tiles: l.cols * l.rows,
        reach: Math.hypot(l.tee.x - l.cup.x, l.tee.y - l.cup.y),
        small: sizes.indexOf(Math.min(...sizes)),
      });
    });
  }
  return rows;
}

const ROWS = figures();

interface Pick {
  row: Row;
  why: string;
}

/** The holes to draw: for each biome the most trees, the most water and the biggest map, and the Future's dearest mirror, none twice. */
function heaviest(): Pick[] {
  const picks: Pick[] = [];
  const add = (row: Row, why: string) => {
    if (!picks.some((p) => p.row === row)) picks.push({ row, why });
  };
  for (const biome of ['desert', 'moon', 'future'] as const) {
    const mine = ROWS.filter((r) => r.biome === biome);
    const by = (key: 'trees' | 'water' | 'tiles') => mine.slice().sort((a, b) => b[key] - a[key])[0];
    // the Moon has no trees at all, so its "most trees" is no reading
    if (by('trees').trees > 0) add(by('trees'), 'most cacti or holograms');
    // the desert's lakes are pans, ground to the layout and not water, so it has none to count
    if (by('water').water > 0) add(by('water'), 'most crater or quicksilver');
    add(by('tiles'), 'biggest map');
  }
  const future = ROWS.filter((r) => r.biome === 'future');
  add(future.slice().sort((a, b) => b.water * b.trees - a.water * a.trees)[0], 'mirror among holograms');
  return picks;
}

const PICKS = heaviest();

for (const [screen, width, height] of [
  ['a desk', 1280, 800],
  ['a phone', 400, 860],
] as const)
  test(`the heaviest tee of each biome course is drawn inside the frame budget on ${screen}`, async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height });
    const problems = watch(page);
    await start(page, { seed: 5, paused: true });
    const shown: Record<string, number> = {};
    for (const { row, why } of PICKS) {
      await page.evaluate(
        ([course, hole]) => {
          const g = window.game!;
          g.chooseCourse(course as string);
          g.startHole(hole as number);
          g.step(60);
        },
        [row.course, row.hole],
      );
      await page.evaluate(() => window.game!.grass());
      const report = await page.evaluate(() => window.game!.theme());
      expect(report.name, `${row.name}: the biome's own look`).toBe(row.biome);
      const frame = await alone(() =>
        page.evaluate(async () => {
          window.game!.step(1);
          return window.game!.measureFrame(300);
        }),
      );
      shown[`${row.course} / ${row.name} (${why})`] = Math.round(frame * 100) / 100;
      expect(frame, `${row.course} / ${row.name}: a frame of its tee`).toBeLessThanOrEqual(BUDGET.frameMs);
      expect(await page.evaluate(() => window.game!.invariants()), row.name).toEqual([]);
    }
    info.annotations.push({ type: 'frames', description: JSON.stringify(shown) });
    console.log(`biome course tees on ${screen} (ms): ${JSON.stringify(shown, null, 1)}`);
    expect(problems).toEqual([]);
  });

test('the longest hole of any biome course is begun inside the begin budget, in turn with its course’s smallest', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  const problems = watch(page);
  // the longest by the line from tee to cup, and the biggest map, which may be another hole: both are begun
  const longest = ROWS.slice().sort((a, b) => b.reach - a.reach)[0];
  const biggest = ROWS.slice().sort((a, b) => b.tiles - a.tiles)[0];
  console.log(
    `biome begin: the longest is ${longest.name} of ${longest.course}; the biggest map ${biggest.name} of ${biggest.course}`,
  );
  await start(page, { seed: 5, paused: true });
  const begun: Record<string, number> = {};
  for (const h of longest === biggest ? [longest] : [longest, biggest]) {
    const median = await alone(() =>
      page.evaluate(
        async ({ course, big, small }) => {
          const g = window.game!;
          g.chooseCourse(course);
          g.step(2);
          await g.grass();
          const begins: number[] = [];
          for (let k = 0; k < 11; k++) {
            const t = performance.now();
            g.startHole(k % 2 ? small : big);
            await g.grass();
            if (k % 2 === 0) begins.push(performance.now() - t);
          }
          begins.sort((a, b) => a - b);
          return begins[Math.floor(begins.length / 2)];
        },
        { course: h.course, big: h.hole, small: h.small },
      ),
    );
    begun[`${h.course} / ${h.name}`] = Math.round(median);
    expect(median, `${h.name} begun`).toBeLessThanOrEqual(BUDGET.beginMs);
  }
  info.annotations.push({ type: 'begin', description: JSON.stringify(begun) });
  console.log(`biome begins (ms): ${JSON.stringify(begun)}`);
  expect(problems).toEqual([]);
});

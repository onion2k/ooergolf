/**
 * The look, held as figures: the green's colour, the course against the
 * rough, the sun against the shade, and the shade's coolness, each held to a
 * floor. The pictures in `look.spec.ts` catch any change at all, and are
 * written again whenever a change is meant; a greyer, flatter look written
 * with them would be held to from then on. These floors are what `LOOK.md`
 * asks of the look, and they stay when the pictures are written again.
 *
 * Two views. One close to the first hole's right-hand rail from inside the
 * course, since from the tee the rail's face is a sliver: the green, the
 * rough past the rail, the rail's sunlit top, and its inner face, which is
 * turned from the sun. And The Volcano from its tee, for its flanks: the
 * points of its green that take the most sun and the least against flat
 * ground, found from the hole's own slopes. Each is a spread of points, each
 * point the mean of a few pixels round it, and each kind the middle of its
 * points, so a flower in the rough or the edge of a stripe moves nothing.
 *
 *   npm run look:metrics       the figures, against their floors
 */
import { expect, test, type Page } from '@playwright/test';
import { TILE, heightAt, layoutOf, slopeAt, tileAt } from '../src/arena';
import { VOLCANO } from '../test/hills';
import { SUN } from '../src/sun';
import { COURSES } from '../src/course';
import { LIE } from '../src/surfaces';
import { start, watch } from './game';
import { figuresOf, luminance, medianColour, type Figures, type Rgb, type Samples } from './metrics';

/**
 * What the look may not fall below: the clean toy of stages 3 and 4 of
 * `LOOK.md`, less a twentieth for another GPU's rounding. Stage 3 gave a
 * saturation of 0.699, a framing of 2.12, a contrast of 2.21 and a shade
 * cooler than the sun by 0.029, where stage 1 left 0.465, 1.76, 1.82 and
 * 0.006; stage 4's rail, its sides a darker coat of its cap's paint, took the
 * contrast to 3.08, and it is held at stage 3's. Each was seen to move as it
 * should before it was trusted: a haze five times as thick took the
 * saturation from 0.465 to 0.364 and the framing from 1.76 to 1.56, a greyed
 * green took the saturation to 0.171, and a rough as bright as the green took
 * the framing to 0.90. The contrast is the toon bands', the shade colour's
 * and the paint's: a sun half as bright did not move it. And the form light
 * took the Volcano's shape from 1.004, a hill drawn as bright as the flat,
 * to 1.458; its flanks are paired row by row, since points chosen from
 * anywhere fell on the lighter stripe more often on one flank and read the
 * flat hill as 1.26. The title's second pass (9 October 2026, the user's choice from five rounds of mocks) took the
 * framing to 1.42, since its rough is lighter and nearer the course's green as the title's lawn is, and the shade from
 * cooler than the sun by 0.029 to warmer by 0.081, since its sun is lower and the shade is the sea-green the title's
 * trees and slopes are; both floors are set again from those figures, less a twentieth, so a rough brighter still or a
 * shade warmer still is caught.
 */
export const FLOORS: Figures = { saturation: 0.66, framing: 1.35, contrast: 2.1, coolShade: -0.085, shape: 1.38 };

/** How many pixels either side of a point its colour is the mean of. */
const SPREAD = 2;

type Point = { x: number; y: number };

/**
 * The Volcano's flanks: on each row across its green, clear of the rail and
 * the cup, the point that takes the most of the sun and the point that takes
 * the least, against what flat ground takes; the dozen rows where the two
 * differ most. A pair shares its row, and so its mown stripe, so only the
 * light can tell them apart: points chosen from anywhere fell on the lighter
 * stripe more often on one flank, and read a hill drawn flat as 1.26.
 */
function flanks(): { sunward: { x: number; y: number; z: number }[]; away: { x: number; y: number; z: number }[] } {
  const l = layoutOf(VOLCANO.map, VOLCANO.terrain);
  const k = Math.hypot(...SUN),
    [sx0, sy0, sz0] = SUN.map((c) => c / k);
  type Took = { x: number; y: number; z: number; by: number };
  const rows: { most: Took; least: Took }[] = [];
  for (let y = l.originY + 1.5 * TILE; y < l.originY + (l.rows - 1.5) * TILE; y += 1) {
    let most: Took | null = null,
      least: Took | null = null;
    for (let x = l.originX + 1.5 * TILE; x < l.originX + (l.cols - 1.5) * TILE; x += 0.5) {
      const t = tileAt(l, x, y);
      if (t < 0 || l.solid[t] || l.water[t] || l.sand[t] || Math.hypot(x - l.cup.x, y - l.cup.y) < 4) continue;
      const [sx, sy] = slopeAt(l, x, y);
      const took = (-sx * sx0 - sy * sy0 + sz0) / Math.hypot(sx, sy, 1);
      const here = { x, y, z: heightAt(l, x, y), by: took - sz0 };
      if (!most || here.by > most.by) most = here;
      if (!least || here.by < least.by) least = here;
    }
    if (most && least) rows.push({ most, least });
  }
  rows.sort((a, b) => b.most.by - b.least.by - (a.most.by - a.least.by));
  const kept = rows.slice(0, 12);
  return { sunward: kept.map((r) => r.most), away: kept.map((r) => r.least) };
}

/** The colour of the page at each point, each the mean of the pixels round it, and only the points in view. */
async function colours<K extends string>(page: Page, points: Record<K, Point[]>): Promise<Record<K, Rgb[]>> {
  const picture = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ picture, points, spread }) => {
      const blob = await (await fetch(`data:image/png;base64,${picture}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const colourAt = ({ x, y }: { x: number; y: number }): [number, number, number] => {
        const d = ctx.getImageData(Math.round(x) - spread, Math.round(y) - spread, 2 * spread + 1, 2 * spread + 1).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
        const n = d.length / 4;
        return [sum[0] / n, sum[1] / n, sum[2] / n];
      };
      const inView = (p: { x: number; y: number }) =>
        p.x > spread && p.y > spread && p.x < bitmap.width - spread - 1 && p.y < bitmap.height - spread - 1;
      return Object.fromEntries(
        Object.entries(points as Record<string, { x: number; y: number }[]>).map(([k, list]) => [
          k,
          list.filter(inView).map(colourAt),
        ]),
      ) as Record<K, [number, number, number][]>;
    },
    { picture, points, spread: SPREAD },
  );
}

test('the look holds its colour, the course stands out, the sun is told from the shade, and a hill shows its shape', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  // where each sample is on the page, from where it is on the course
  const points = await page.evaluate(() => {
    const g = window.game!;
    g.step(60);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.panel, #boot, #stats')))
      el.style.visibility = 'hidden';
    const { floor } = g.content();
    const TILE = 3,
      RAIL = 1.6,
      ROUGH = -3;
    const midY = (floor.minY + floor.maxY) / 2;
    g.look(floor.maxX - 5, midY, 20);
    g.step(2);
    const at = (x: number, y: number, z: number) => g.project(x, y, z);
    const out: Record<'green' | 'rough' | 'railTop' | 'railShade', { x: number; y: number }[]> = {
      green: [],
      rough: [],
      railTop: [],
      railShade: [],
    };
    for (let k = 0; k < 7; k++) {
      const y = midY + k * 1.5;
      // the green clear of the rail's shade along its foot, over both stripes
      for (const dx of [2.5, 4, 5.5]) out.green.push(at(floor.maxX - dx, y, 0));
      // the rough past the rail and the flowers at its foot
      for (const dx of [4, 6, 8]) out.rough.push(at(floor.maxX + TILE + dx, y + 2, ROUGH));
      // the middle of the rail's top, and the middle of its inner face, which looks away from the sun
      out.railTop.push(at(floor.maxX + TILE / 2, y, RAIL));
      out.railShade.push(at(floor.maxX, y, RAIL * 0.4));
    }
    return out;
  });
  const rail = await colours(page, points);
  // The Volcano from its tee, and its flanks
  const flank = flanks();
  const onFlanks = await page.evaluate(
    ([flank, hole]) => {
      const g = window.game!;
      g.playCourse([hole]);
      g.step(75);
      const { floor } = g.content();
      g.look((floor.minX + floor.maxX) / 2, (floor.minY + floor.maxY) / 2 - 14, 70);
      g.step(2);
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.panel, #boot, #stats')))
        el.style.visibility = 'hidden';
      return {
        sunward: flank.sunward.map((p) => g.project(p.x, p.y, p.z)),
        away: flank.away.map((p) => g.project(p.x, p.y, p.z)),
      };
    },
    [flank, VOLCANO] as const,
  );
  const samples: Samples = { ...rail, ...(await colours(page, onFlanks)) };
  for (const [kind, list] of Object.entries(samples) as [keyof Samples, unknown[]][])
    expect(list.length, `${kind} in view`).toBeGreaterThanOrEqual(5);
  const figures = figuresOf(samples);
  console.log(
    `look: saturation ${figures.saturation.toFixed(3)}, framing ${figures.framing.toFixed(2)}, ` +
      `contrast ${figures.contrast.toFixed(2)}, cool shade ${figures.coolShade.toFixed(3)}, shape ${figures.shape.toFixed(3)}`,
  );
  for (const key of Object.keys(FLOORS) as (keyof Figures)[])
    expect(figures[key], `${key}, against its floor`).toBeGreaterThanOrEqual(FLOORS[key]);
  expect(problems).toEqual([]);
});

/**
 * The one figure of the look that means something on every biome: the fairway stands out from the rough. The Moon is the
 * reason (one hue, and the plan's risk was grey on grey), and the Desert's fairway is a lighter gold on a red ground, and the
 * Future's a lavender plate under holograms. How many times apart, in light, the middle fairway colour and the middle rough
 * colour are, from the hole's own tee, sampled at tiles of each well clear of trees, sand and water. A floor for each, from
 * what each was when its look was looked at (31 October 2026), less a twentieth: so a fairway lost into its rough, or a rough
 * lit up to the fairway, is caught.
 *
 * The others of this file's figures are not set for a biome, each for its reason. The green's saturation is earth's: the Moon
 * is grey by design and a floor of 0.66 would be a lie there. The rail's sunlit top against its shade is the minigolf rail's,
 * and a golf hole has none. The shade's coolness is the sun's colour against the sky's, which three skies each answer
 * differently by design (dusk's sun is pink, the Moon's has no sky to cool it). The shape of a hill by its flanks needs a hill
 * drawn flat to have been seen to fail it, and the Moon's and the Future's holes have none made for it; the form light that
 * reads it is one shader on every biome, held on earth by the Volcano.
 */
export const APART: Record<'desert' | 'moon' | 'future', { course: string; hole: number; floor: number }> = {
  desert: { course: 'The Badlands', hole: 4, floor: 1.34 },
  moon: { course: 'The Far Side', hole: 2, floor: 1.42 },
  future: { course: 'Chrome Heights', hole: 2, floor: 1.24 },
};

for (const [biome, want] of Object.entries(APART) as [keyof typeof APART, (typeof APART)[keyof typeof APART]][])
  test(`the fairway stands out from the rough in the ${biome}, from the tee of ${want.course} hole ${want.hole + 1}`, async ({
    page,
  }) => {
    const problems = watch(page);
    const def = COURSES.find((c) => c.name === want.course)!.holes[want.hole];
    const l = layoutOf(def.map, def.terrain, def.way, def.biome);
    // tiles of a lie, ahead of the tee, with the same lie on every side two tiles out and no tree within two
    const lieAt = (x: number, y: number) => {
      const t = tileAt(l, x, y);
      return t < 0 || l.solid[t] || l.water[t] || l.sand[t] ? -1 : l.lie[t];
    };
    const pick = (lie: number) => {
      const found: { x: number; y: number; z: number }[] = [];
      for (let y = l.originY + 2 * TILE; y < l.originY + (l.rows - 2) * TILE; y += TILE)
        for (let x = l.originX + 2 * TILE; x < l.originX + (l.cols - 2) * TILE; x += TILE) {
          const d = Math.hypot(x - l.tee.x, y - l.tee.y);
          if (d < 14 || d > 70) continue;
          let all = true;
          for (const [dx, dy] of [
            [0, 0],
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
          ])
            if (lieAt(x + dx * TILE, y + dy * TILE) !== lie) all = false;
          if (!all || l.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 2 * TILE)) continue;
          found.push({ x, y, z: heightAt(l, x, y) });
        }
      return found
        .sort((a, b) => Math.hypot(a.x - l.tee.x, a.y - l.tee.y) - Math.hypot(b.x - l.tee.x, b.y - l.tee.y))
        .slice(0, 14);
    };
    const fairway = pick(LIE.fairway),
      rough = pick(LIE.rough);
    expect(fairway.length, 'fairway tiles to sample').toBeGreaterThanOrEqual(5);
    expect(rough.length, 'rough tiles to sample').toBeGreaterThanOrEqual(5);
    await start(page, { seed: 11, paused: true });
    const points = await page.evaluate(
      ([course, hole, fairway, rough]) => {
        const g = window.game!;
        g.chooseCourse(course);
        g.startHole(hole);
        g.step(75);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.panel, #boot, #stats')))
          el.style.visibility = 'hidden';
        const to = (list: { x: number; y: number; z: number }[]) => list.map((p) => g.project(p.x, p.y, p.z));
        return { fairway: to(fairway), rough: to(rough) };
      },
      [want.course, want.hole, fairway, rough] as const,
    );
    await page.evaluate(() => window.game!.grass());
    const seen = await colours(page, points);
    expect(seen.fairway.length, 'fairway points in view').toBeGreaterThanOrEqual(5);
    expect(seen.rough.length, 'rough points in view').toBeGreaterThanOrEqual(5);
    const a = luminance(medianColour(seen.fairway)),
      b = luminance(medianColour(seen.rough));
    const apart = Math.max(a, b) / Math.min(a, b);
    console.log(
      `look, ${biome}: the fairway and the rough are ${apart.toFixed(3)} times apart in light (fairway ${a.toFixed(3)}, rough ${b.toFixed(3)})`,
    );
    expect(apart, `${biome}: fairway against rough`).toBeGreaterThanOrEqual(want.floor);
    expect(problems).toEqual([]);
  });

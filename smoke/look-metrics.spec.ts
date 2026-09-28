/**
 * The look, held as figures: the green's colour, the course against the
 * rough, the sun against the shade, and the shade's coolness, each held to a
 * floor. The pictures in `look.spec.ts` catch any change at all, and are
 * written again whenever a change is meant; a greyer, flatter look written
 * with them would be held to from then on. These floors are what `LOOK.md`
 * asks of the look, and they stay when the pictures are written again.
 *
 * One view, close to the first hole's right-hand rail from inside the course,
 * since from the tee the rail's face is a sliver: the green, the rough past
 * the rail, the rail's sunlit top, and its inner face, which is turned from
 * the sun. Each is a spread of points, each point the mean of a few pixels
 * round it, and each kind the middle of its points, so a flower in the rough
 * or the edge of a stripe moves nothing.
 *
 *   npm run look:metrics       the figures, against their floors
 */
import { expect, test } from '@playwright/test';
import { start, watch } from './game';
import { figuresOf, type Figures, type Samples } from './metrics';

/**
 * What the look may not fall below: the clean toy of stage 3 of `LOOK.md`,
 * less a twentieth for another GPU's rounding. It gave a saturation of 0.699,
 * a framing of 2.12, a contrast of 2.21 and a shade cooler than the sun by
 * 0.029, where stage 1 left 0.465, 1.76, 1.82 and 0.006; and edges with 0.86
 * blended pixels a row, where none were drawn before. Each was seen to move
 * as it should before it was trusted: a haze five times as thick took the
 * saturation from 0.465 to 0.364 and the framing from 1.76 to 1.56, a greyed
 * green took the saturation to 0.171, a rough as bright as the green took the
 * framing to 0.90, and the edges read 0 with no antialiasing, 0.86 at four
 * samples a pixel and 1 with the post pass. The contrast is the toon bands'
 * and the shade colour's: a sun half as bright did not move it.
 */
export const FLOORS: Figures = { saturation: 0.66, framing: 2, contrast: 2.1, coolShade: 0.02, edges: 0.5 };

/** How many pixels either side of a point its colour is the mean of. */
const SPREAD = 2;
/** How many pixels either side of the rail's edge a row across it reaches: short of the face's other edge. */
const EDGE_REACH = 6;

test('the look holds its colour, the course stands out, and the sun is told from the shade', async ({ page }) => {
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
    const out: Record<'green' | 'rough' | 'railTop' | 'railShade' | 'edges', { x: number; y: number }[]> = {
      green: [],
      rough: [],
      railTop: [],
      railShade: [],
      edges: [],
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
      // the edge between them, where the top turns down into the face
      out.edges.push(at(floor.maxX, y + 0.75, RAIL));
    }
    return out;
  });
  const picture = (await page.screenshot()).toString('base64');
  const samples = await page.evaluate(
    async ({ picture, points, spread, EDGE_REACH }) => {
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
      const read = (list: { x: number; y: number }[]) => list.filter(inView).map(colourAt);
      // a row of pixels across the edge, each as it is, from the face on its left to the top on its right
      const across = ({ x, y }: { x: number; y: number }): [number, number, number][] => {
        const d = ctx.getImageData(Math.round(x) - EDGE_REACH, Math.round(y), 2 * EDGE_REACH + 1, 1).data;
        const row: [number, number, number][] = [];
        for (let i = 0; i < d.length; i += 4) row.push([d[i], d[i + 1], d[i + 2]]);
        return row;
      };
      return {
        green: read(points.green),
        rough: read(points.rough),
        railTop: read(points.railTop),
        railShade: read(points.railShade),
        edges: points.edges.filter(inView).map(across),
      };
    },
    { picture, points, spread: SPREAD, EDGE_REACH },
  );
  for (const [kind, list] of Object.entries(samples) as [keyof Samples, unknown[]][])
    expect(list.length, `${kind} in view`).toBeGreaterThanOrEqual(5);
  const figures = figuresOf(samples);
  console.log(
    `look: saturation ${figures.saturation.toFixed(3)}, framing ${figures.framing.toFixed(2)}, ` +
      `contrast ${figures.contrast.toFixed(2)}, cool shade ${figures.coolShade.toFixed(3)}, ` +
      `edges ${figures.edges.toFixed(2)}`,
  );
  for (const key of Object.keys(FLOORS) as (keyof Figures)[])
    expect(figures[key], `${key}, against its floor`).toBeGreaterThanOrEqual(FLOORS[key]);
  expect(problems).toEqual([]);
});

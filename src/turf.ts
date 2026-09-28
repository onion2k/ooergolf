/**
 * A hole's grass, as the renderer grows it: a field over the course and the
 * rough round it, saying which kind grows in each quarter-unit cell and how
 * high the ground is there, and the wind that blows across it. The green
 * grows on the course's grass at each tile's height, mown in the stripes the
 * tiles are drawn in; the rough grows off the course, down where the rough
 * lies, and on to the horizon; and nothing grows on the rail, on water, on a
 * belt, or in the cup or on its rim. Content and the arithmetic of reading it: the
 * renderer grows and draws the blades, and the page hands it this.
 */
import type { GrassField, GrassKind, TrampleRect, Wind } from 'artshape-render/game/grass';
import { TILE, tileAt, type Layout } from './arena';
import { CUP } from './course';
import { CUP as CUP_LOOK } from './models/course';
import type { Obstacles } from './obstacles';
import { seeded } from './random';

/** How far below the green the rough lies: the scene's own, kept here too so the turf imports no drawing. */
const ROUGH_DEPTH = 3;

/**
 * The field's figures: its cells, a quarter of a unit, which cut the cup's
 * disc well enough at the camera's distance; how far round the course it
 * reaches before the rough carries on as the renderer's `outside`; the
 * trample's cells, as fine as the field's; and how dark a pressed blade
 * goes. Darker than the renderer's own 0.7, since the green's blades are
 * short and much of what shows between them is the ground, which a press
 * does not darken: at 0.7 the track is a faint dotted line.
 */
export const TURF = { cell: 0.25, reach: 34, trampleCell: 0.25, pressShade: 0.4 } as const;

/** The kinds, by index: the mown green and the rough. */
export const GREEN = 0,
  ROUGH = 1;

/**
 * The kinds, as the renderer's spec recommends them for this game: a short,
 * dense, mown green, stiff in the wind, in stripes two tile rows wide; and a
 * rough of long sparse blades that the wind moves. Colours deep for toon
 * light, as the rest of the course is, and the rough a good deal darker than
 * the green: as light as the spec has it, the two are one lawn and the course
 * is no longer framed by what lies round it.
 */
export const KINDS: readonly GrassKind[] = [
  {
    density: 150,
    height: 0.15,
    heightSpread: 0.3,
    width: 0.05,
    base: [0.07, 0.3, 0.05],
    tip: [0.2, 0.56, 0.14],
    variation: 0.15,
    roughness: 0.85,
    lean: 0.15,
    give: 0.15,
    stripes: { width: 2 * TILE, angle: 0, shade: 0.18 },
  },
  {
    density: 12,
    height: 0.8,
    heightSpread: 0.3,
    width: 0.09,
    base: [0.035, 0.14, 0.035],
    tip: [0.1, 0.32, 0.075],
    variation: 0.25,
    roughness: 0.9,
    lean: 0.3,
    give: 1,
  },
];

/** A seed from a name: FNV-1a, so the same hole grows the same grass and blows the same wind. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** The field of grass for a hole laid out as `layout`, with `obstacles` on it, called `name`. */
export function fieldOf(layout: Layout, obstacles: Obstacles, name: string): GrassField {
  const { cell, reach } = TURF;
  const origin: [number, number] = [layout.originX - reach, layout.originY - reach];
  const cols = Math.ceil((layout.cols * TILE + 2 * reach) / cell),
    rows = Math.ceil((layout.rows * TILE + 2 * reach) / cell);
  const mask = new Uint8Array(cols * rows),
    heights = new Float32Array(cols * rows);
  // the tiles a belt lies on: its frame and belt stand there, not grass
  const { belted } = obstacles;
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const x = origin[0] + (cx + 0.5) * cell,
        y = origin[1] + (cy + 0.5) * cell;
      const t = tileAt(layout, x, y);
      if (t < 0 || (layout.solid[t] && !layout.rail[t])) {
        mask[i] = ROUGH + 1;
        heights[i] = -ROUGH_DEPTH;
      } else if (!layout.solid[t] && !layout.water[t] && !belted.has(t)) {
        // not in the cup, nor through its gold rim, which is lower than the green's blades and would be lost in them
        if (Math.hypot(x - layout.cup.x, y - layout.cup.y) < CUP.radius + CUP_LOOK.rim) continue;
        mask[i] = GREEN + 1;
        heights[i] = layout.floor[t];
      }
    }
  const kinds = KINDS.map((k, n) =>
    n === GREEN && k.stripes ? { ...k, stripes: { ...k.stripes, offset: -layout.originY } } : k,
  );
  return {
    origin,
    cell,
    cols,
    rows,
    mask,
    heights,
    kinds,
    outside: { kind: ROUGH, height: -ROUGH_DEPTH },
    seed: seedOf(name),
  };
}

/** Where the ball may press the grass: the course, at the trample's cells, standing again in six seconds. */
export function trampleOf(layout: Layout): TrampleRect {
  const c = TURF.trampleCell;
  return {
    origin: [layout.originX, layout.originY],
    cell: c,
    cols: Math.ceil((layout.cols * TILE) / c),
    rows: Math.ceil((layout.rows * TILE) / c),
    recovery: 6,
  };
}

/** The wind on a hole called `name`: a way of its own, gentle, in gusts a couple of tiles across. */
export function windOf(name: string): Wind {
  const random = seeded(seedOf(`${name} wind`));
  const a = random() * Math.PI * 2;
  return { direction: [Math.cos(a), Math.sin(a)], strength: 0.3 + random() * 0.35, gustSize: 20, gustSpeed: 4 };
}

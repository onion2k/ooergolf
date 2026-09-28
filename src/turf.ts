/**
 * A hole's grass, as the renderer grows it: a field over the course and the
 * rough round it, saying which kind grows in each quarter-unit cell and how
 * high the ground is there, and the wind that blows across it. The rough
 * grows off the course, down where it lies, and on to the horizon, long and
 * moving in the wind, and frames the course; nothing grows on the course
 * itself, whose green is painted, smooth and clean, by the scene. Content and
 * the arithmetic of reading it: the renderer grows and draws the blades, and
 * the page hands it this.
 */
import type { GrassField, GrassKind, Wind } from 'artshape-render/game/grass';
import { TILE, tileAt, type Layout } from './arena';
import { seeded } from './random';

/** How far below the green the rough lies: the scene's own, kept here too so the turf imports no drawing. */
const ROUGH_DEPTH = 3;

/**
 * The field's figures: its cells, a quarter of a unit, fine enough for the
 * rough's edge along the course's; and how far round the course it reaches
 * before the rough carries on as the renderer's `outside`.
 */
export const TURF = { cell: 0.25, reach: 34 } as const;

/** The rough, the only kind: the green had blades of its own, and was painted clean for the look. */
export const ROUGH = 0;

/**
 * The rough, as the renderer's spec recommends it for this game: long sparse
 * blades that the wind moves, deep for toon light, and a good deal darker
 * than the painted green, so the course is framed by what lies round it.
 */
export const KINDS: readonly GrassKind[] = [
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

/** The field of grass for a hole laid out as `layout`, called `name`. */
export function fieldOf(layout: Layout, name: string): GrassField {
  const { cell, reach } = TURF;
  const origin: [number, number] = [layout.originX - reach, layout.originY - reach];
  const cols = Math.ceil((layout.cols * TILE + 2 * reach) / cell),
    rows = Math.ceil((layout.rows * TILE + 2 * reach) / cell);
  const mask = new Uint8Array(cols * rows),
    heights = new Float32Array(cols * rows);
  // the rough everywhere off the course; the course, rail and all, grows nothing
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const t = tileAt(layout, origin[0] + (cx + 0.5) * cell, origin[1] + (cy + 0.5) * cell);
      if (t < 0 || (layout.solid[t] && !layout.rail[t])) {
        mask[i] = ROUGH + 1;
        heights[i] = -ROUGH_DEPTH;
      }
    }
  return {
    origin,
    cell,
    cols,
    rows,
    mask,
    heights,
    kinds: [...KINDS],
    outside: { kind: ROUGH, height: -ROUGH_DEPTH },
    seed: seedOf(name),
  };
}

/** The wind on a hole called `name`: a way of its own, gentle, in gusts a couple of tiles across. */
export function windOf(name: string): Wind {
  const random = seeded(seedOf(`${name} wind`));
  const a = random() * Math.PI * 2;
  return { direction: [Math.cos(a), Math.sin(a)], strength: 0.3 + random() * 0.35, gustSize: 20, gustSpeed: 4 };
}

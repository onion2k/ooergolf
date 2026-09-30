/**
 * A hole's grass, as the renderer grows it: a field over the course and the
 * rough round it, saying which kind grows in each cell (a quarter of a unit,
 * and coarser only for a hole too big for a field of those) and how
 * high the ground is there, and the wind that blows across it. The rough
 * grows off the course, down where it lies, and on to the horizon, long,
 * dense and rippling in the wind like a meadow, and frames the course;
 * nothing grows on the course itself, whose green is painted, smooth and
 * clean, by the scene. Content and the arithmetic of reading it: the renderer
 * grows and draws the blades, and the page hands it this.
 */
import type { GrassField, GrassKind, GrassOptions, Wind } from 'artshape-render/game/grass';
import { TILE, tileAt, type Layout } from './arena';
import { seeded } from './random';

/** How far below the green the rough lies: the scene's own, kept here too so the turf imports no drawing. */
const ROUGH_DEPTH = 3;

/**
 * The field's figures: its finest cell, a quarter of a unit, fine enough for
 * the rough's edge round a rock; and how far round the course it reaches
 * before the rough carries on as the renderer's `outside`.
 */
export const TURF = { cell: 0.25, reach: 34 } as const;

/**
 * The cells a field may be made of, finest first. Each goes a whole number of
 * times into a tile, which is what the course's edge is made of, so the edge
 * falls between two cells and never in one, whichever is used. The finest is
 * every hole's until a hole is too big for it.
 */
export const CELLS = [0.25, 0.5, 0.75, 1, 1.5] as const;

/**
 * Cells a side a field may have: the renderer's `MAX_SIDE`, kept here too so the
 * turf imports no drawing, and held equal to it by a test.
 */
export const FIELD_SIDE = 1024;

/** How far the field reaches past the course at `cell`: `TURF.reach`, up to a whole number of cells, so its edge lies on a tile's. */
const marginAt = (cell: number) => Math.ceil(TURF.reach / cell) * cell;

/** How many cells a side a field of `tiles` tiles has at `cell`. */
const sideAt = (tiles: number, cell: number) => Math.ceil((tiles * TILE + 2 * marginAt(cell)) / cell);

/**
 * The finest cell whose field the renderer takes for a hole laid out as `layout`: a quarter of a unit for every
 * hole there is, and coarser for one bigger than sixty tiles a side. A hole no cell covers is refused, by its size.
 */
export function cellFor(layout: Layout): number {
  const tiles = Math.max(layout.cols, layout.rows);
  for (const cell of CELLS) if (sideAt(tiles, cell) <= FIELD_SIDE) return cell;
  const coarsest = CELLS[CELLS.length - 1];
  const most = Math.floor((FIELD_SIDE * coarsest - 2 * marginAt(coarsest)) / TILE);
  throw new RangeError(
    `a hole of ${layout.cols} by ${layout.rows} tiles is more than a field of grass covers: at most ${most} tiles a side`,
  );
}

/** The rough, the only kind: the green had blades of its own, and was painted clean for the look. */
export const ROUGH = 0;

/**
 * The rough: long, dense blades that the wind moves, deep for toon light, and
 * a good deal darker than the painted green, so the course is framed by what
 * lies round it. It stands from `ROUGH_DEPTH` below the green and the tallest
 * blade, 1.6 and a third, still ends under the level of the course, so the
 * grass is a meadow the course is set in and never a hedge across it.
 */
export const KINDS: readonly GrassKind[] = [
  {
    density: 40,
    height: 1.6,
    heightSpread: 0.35,
    width: 0.11,
    base: [0.025, 0.1, 0.04],
    tip: [0.06, 0.24, 0.09],
    variation: 0.25,
    roughness: 0.9,
    lean: 0.3,
    give: 1,
  },
];

/**
 * How many blades the renderer has room for in a frame. Past it a blade is not
 * drawn, and the rough furthest from the camera is left bare: this field at
 * forty a unit with the renderer's own rings did reach it, and 64 a unit
 * certainly did. The smoke test holds every hole at every zoom well short.
 */
export const BLADE_ROOM = 262_144;

/**
 * How the renderer thins the rough with distance. Left to itself it scales the
 * rings with the blade's height, and at this height keeps every blade out to
 * eighty units, which is more grass than a frame has the time for (3.8 ms at
 * the standard view, against 2.5 with these rings); here the rings are the
 * game's own. Every blade within `near` is grown, and past it
 * the share kept falls with the square of the distance, the kept blades drawn
 * wider so the colour of the field holds, so each ring out from the camera
 * costs about what the one before did. The camera stands 30 to 110 units back:
 * `near` reaches the ground under the closest, and the far rough is thin.
 */
export const GRASS: GrassOptions = { near: 45, mid: 110, far: 300, capacity: BLADE_ROOM };

/** A seed from a name: FNV-1a, so the same hole grows the same grass and blows the same wind. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** A disc of the rough where no blade grows: a rock stands there, and would be lost in the grass. */
export interface Clearing {
  x: number;
  y: number;
  r: number;
}

/**
 * The field of grass for a hole laid out as `layout`, called `name`, with none in the `bare` discs, made of cells
 * of `cell`: the finest one that fits, unless it is told. A coarser cell clears every cell a disc touches, and not
 * only those whose middles it holds, so a rock is never left with a blade standing in it.
 */
export function fieldOf(
  layout: Layout,
  name: string,
  bare: readonly Clearing[] = [],
  cell = cellFor(layout),
): GrassField {
  const reach = marginAt(cell);
  const origin: [number, number] = [layout.originX - reach, layout.originY - reach];
  const cols = sideAt(layout.cols, cell),
    rows = sideAt(layout.rows, cell);
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
  // a cell is cleared when its middle is in the disc; and, at a cell coarser than the finest, when any of it is: the
  // half of its diagonal more
  const grow = cell > TURF.cell ? cell * Math.SQRT1_2 : 0;
  for (const { x, y, r } of bare) {
    const x0 = Math.max(0, Math.floor((x - r - grow - origin[0]) / cell)),
      x1 = Math.min(cols - 1, Math.floor((x + r + grow - origin[0]) / cell)),
      y0 = Math.max(0, Math.floor((y - r - grow - origin[1]) / cell)),
      y1 = Math.min(rows - 1, Math.floor((y + r + grow - origin[1]) / cell));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        if (Math.hypot(origin[0] + (cx + 0.5) * cell - x, origin[1] + (cy + 0.5) * cell - y) <= r + grow)
          mask[cy * cols + cx] = 0;
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

/**
 * The wind on a hole called `name`: a way of its own, strong enough to bend
 * long grass a good way, in ripples a couple of tiles across that the renderer
 * carries downwind at five units a second, so a gust is seen to roll across the
 * rough as it does across a meadow. The flag and the trees follow the same
 * gusts.
 */
export function windOf(name: string): Wind {
  const random = seeded(seedOf(`${name} wind`));
  const a = random() * Math.PI * 2;
  return { direction: [Math.cos(a), Math.sin(a)], strength: 0.7 + random() * 0.3, gustSize: 8, gustSpeed: 5 };
}

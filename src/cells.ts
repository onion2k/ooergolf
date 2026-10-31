/**
 * The figures of a hole's field of grass that have nothing of the picture in them: the cell it is made of, how many cells a
 * side it may have, how many blades the renderer has room for and the two densities a golf hole's grass is grown at. Their own
 * module, with no theme and no renderer in its imports, so a test the smoke tests' loader runs may read them (`turf.ts`, which
 * is the picture's, re-exports them all).
 */
import { TILE, type Layout } from './arena';

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
export const marginAt = (cell: number) => Math.ceil(TURF.reach / cell) * cell;

/** How many cells a side a field of `tiles` tiles has at `cell`. */
export const sideAt = (tiles: number, cell: number) => Math.ceil((tiles * TILE + 2 * marginAt(cell)) / cell);

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

/** The rough's density on a golf hole and the fairway's: see `golfKinds` in `turf.ts`. */
export const GOLF_ROUGH_DENSITY = 80;
export const GOLF_FAIRWAY_DENSITY = 100;

/**
 * How many blades the renderer has room for in a frame. Past it a blade is not
 * drawn, and the rough furthest from the camera is left bare: this field at
 * forty a unit with the renderer's own rings did reach it, and 64 a unit
 * certainly did. The smoke test holds every hole at every zoom well short.
 */
export const BLADE_ROOM = 262_144;

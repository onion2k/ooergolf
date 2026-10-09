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
import type { GrassField, GrassKind, GrassOptions, TrampleRect, Wind } from 'artshape-render/game/grass';
import { TILE, heightAt, tileAt, type Layout } from './arena';
import { seeded } from './random';
import { nameSeed, windDirection } from './shaping';
import { BANK_TINT, kindOfLevel, levelOf, tintOf, tinted, valueOf } from './tint';
import { zonesOf, type Zone } from './zones';

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

/** The rough, the only kind on a hole of minigolf: the green had blades of its own, and was painted clean for the look. */
export const ROUGH = 0;
/** The fairway's, the second kind of a hole of golf: short, mown in the stripes it is painted in. */
export const FAIRWAY = 1;

/**
 * The rough, as turf and not a hayfield: eighty short blades to the square unit, 0.55 tall and a fifth more or less,
 * so a ball sits down in it and is never lost to it, in a light green, nearer the fairway's than the dark one it had,
 * as the title picture's lawn is. The tallest blade, 0.66, ends well under `ROUGH_DEPTH`, so the grass is a lawn the
 * course is set in and never a hedge across it. `variation` is how strongly the renderer's three-unit patchiness shows,
 * 0.12 since the second title pass (9 October 2026; 0.45 before it, and 0.25 before that), which keeps the lawn calm,
 * and `lean` how far a blade leans over from the upright, so the turf lies as though walked on. The blades were candidate B of
 * the sheet the figures were first chosen from, on 4 October 2026, 1.2 tall and darker; the colour is `ab` of the
 * second pass's mock (0.17, 0.35, 0.009 as the lawn shows), and a test holds them, so a retune is a decision.
 * `models/palette.ts` holds the ground between the blades to the same colour.
 */
export const KINDS: readonly GrassKind[] = [
  {
    density: 80,
    height: 0.55,
    heightSpread: 0.2,
    width: 0.11,
    base: [0.1394, 0.28, 0.011],
    tip: [0.187, 0.371, 0.012],
    variation: 0.12,
    roughness: 0.9,
    lean: 0.45,
    give: 1,
  },
];

/**
 * The rough and the fairway of a golf hole. The rough is minigolf's own turf, the same eighty to the square unit (it
 * was once denser on golf, and is now the one figure, `GOLF_ROUGH_DENSITY`, held equal to it by a test). The fairway is
 * a quarter of the rough's height, in the green the fairway is painted (`FAIRWAY_GREEN`), stiff in the wind, and mown in
 * the stripes it is painted in: two tiles a stripe, the lighter on the same rows, and the same strength. Its tallest
 * blade, 0.39, stands under the ball's middle, so a ball on the fairway sits on grass that comes up short of its equator,
 * and is seen. It is the denser, at a hundred, since a short blade covers little, and it leans a little, as mown turf
 * does, its clumps a touch stronger than they were. More was tried (a hundred and sixty a unit) and cost a frame of the
 * whole of a flat golf hole 2 ms for nothing to be seen, since the ground under it is painted its colour and the
 * renderer thins the blades with the square of the distance: the blades a frame draws, and so its cost, grow with both
 * densities.
 */
export const GOLF_ROUGH_DENSITY = 80;
export const GOLF_FAIRWAY_DENSITY = 100;
/**
 * The painted fairway's green, already linear: `models/palette.ts`'s own, kept here too so the turf imports no models,
 * and held equal to it by a test.
 */
const FAIRWAY_GREEN = [0.21, 0.41, 0.0072] as const;
/**
 * The fairway's blades, from a root darker than the green to a tip lighter. The renderer averages a blade to its root
 * and 1/1.7 of the way to its tip (`grassGround`), so the tip is where that average is the green exactly, and the
 * blades read as the same turf as the painted ground under them.
 */
const ROOT = 0.7,
  TIP = ROOT + 1.7 * (1 - ROOT);
const FAIRWAY_BASE = FAIRWAY_GREEN.map((c) => c * ROOT) as [number, number, number],
  FAIRWAY_TIP = FAIRWAY_GREEN.map((c) => c * TIP) as [number, number, number];

/**
 * The kinds of a golf hole. A chunk of the field holds at most 255 lattice points a side, so a
 * field of the coarsest cell takes 112 blades a square unit at the most: both densities are inside it, which a test holds
 * on a hole of that cell, and no hole has to be thinned for the cell it is grown in.
 */
function golfKinds(): GrassKind[] {
  const fairway: GrassKind = {
    density: GOLF_FAIRWAY_DENSITY,
    height: 0.3,
    heightSpread: 0.3,
    width: 0.07,
    base: FAIRWAY_BASE,
    tip: FAIRWAY_TIP,
    variation: 0.2,
    roughness: 0.9,
    lean: 0.35,
    give: 0.3,
    // not striped: the ground under it is mown in a checker (`mownAt` in ground.ts), which the renderer's stripes, bands
    // at one angle, cannot follow; plain blades in the middle green let the painted checker read between them
  };
  const rough: GrassKind = { ...KINDS[ROUGH], density: GOLF_ROUGH_DENSITY };
  // the rough again at each step of the banks' tint (`tint.ts`), in the kinds past the fairway's: the three darker and then the
  // three lighter, the eight kinds a field may have, which `kindOfLevel` says the place of
  const steps: GrassKind[] = [];
  for (let level = -BANK_TINT.levels; level <= BANK_TINT.levels; level++) {
    if (level === 0) continue;
    steps[kindOfLevel(level) - 2] = {
      ...rough,
      base: tinted(rough.base, valueOf(level)).slice(0, 3) as [number, number, number],
      tip: tinted(rough.tip, valueOf(level)).slice(0, 3) as [number, number, number],
    };
  }
  return [rough, fairway, ...steps];
}

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
 * `near` reaches the ground under the closest, and the far rough is thin. With the turf at eighty a unit `near` was 45, and
 * the worst view the camera can be orbited to (from behind at the lowest tilt) drew all 262,144 blades there is room
 * for, so the far rough was bare, and cost 7.2 ms; at 40 it drew 210,000 and cost 5.5, and at 36 it draws 160,000 and
 * costs 5.0 against the meadow's 3.8 for 129,000 (4 October 2026, read alone on the machine). The turf's extra density
 * is seen close to, where the eye is, and the standard view's blades are 80,000 where the meadow's were 64,000.
 */
export const GRASS: GrassOptions = { near: 36, mid: 110, far: 300, capacity: BLADE_ROOM };

/** A disc of the rough where no blade grows: a rock stands there, and would be lost in the grass. */
export interface Clearing {
  x: number;
  y: number;
  r: number;
}

/**
 * How a ball in the rough is seen: the grass is pressed flat in a disc of `radius` round it while it lies at rest, which
 * the blades, 1.2 and half again tall and the ball two across, would otherwise hide it in, and stands again `recovery`
 * seconds after the ball is struck from there.
 */
export const FLATTEN = { radius: 6, recovery: 6 } as const;

/**
 * The most texels a golf hole's trample has, the grid over the ground a ball can lie on that the grass is pressed
 * in: sixteen bytes each, so about five megabytes at most, which the biggest hole of The Links is well under.
 */
const TRAMPLE_TEXELS = 320_000;

/** The kind of blade a zone of a golf hole grows, or none: the rough's and the fairway's, and nothing on the green, tee, cut, sand or out of bounds. */
function kindOfZone(zone: Zone): number {
  return zone === 'rough' ? ROUGH : zone === 'fairway' ? FAIRWAY : -1;
}

/**
 * The grid the ball presses the grass in, on a golf hole: over the box round its ground, as fine as a quarter of
 * the disc it presses (the finest of the cells a hole of its size allows) and no bigger than `TRAMPLE_TEXELS`; none
 * for a hole of minigolf, whose ball leaves no track, or one too big to have it.
 */
export function trampleOf(layout: Layout): TrampleRect | undefined {
  if (!layout.golf) return undefined;
  const { minX, minY, maxX, maxY } = layout.bounds;
  for (const cell of [0.5, 0.75, 1, FLATTEN.radius / 3]) {
    const cols = Math.ceil((maxX - minX) / cell) + 1,
      rows = Math.ceil((maxY - minY) / cell) + 1;
    if (cols * rows <= TRAMPLE_TEXELS) return { origin: [minX, minY], cell, cols, rows, recovery: FLATTEN.recovery };
  }
  return undefined;
}

/** The options the renderer is given for a hole's grass: the game's own rings, and on a golf hole the grid to press it in. */
export function grassOptionsOf(layout: Layout): GrassOptions {
  const trample = trampleOf(layout);
  return trample ? { ...GRASS, trample } : GRASS;
}

/**
 * The disc of grass to press flat for a ball lying at (x, y): where it lies at rest on the rough of a golf hole, and
 * nowhere else (a ball in flight, or on a fairway, a green or sand, has no blades round it to be lost in). Written into
 * `out`, which is what a frame hands in so nothing is made, and returned; null for none.
 */
export function flattenFor(
  layout: Layout,
  x: number,
  y: number,
  ready: boolean,
  out: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: 0 },
): { x: number; y: number; radius: number } | null {
  if (!ready || !layout.golf) return null;
  const t = tileAt(layout, x, y);
  if (t < 0 || layout.water[t] || layout.solid[t] || zonesOf(layout).at(x, y) !== 'rough') return null;
  out.x = x;
  out.y = y;
  out.radius = FLATTEN.radius;
  return out;
}

/**
 * The field of grass for a golf hole: the rough a ball is played from and the fairway, each its own kind, inside the
 * stakes, standing on the ground they lie on, and nothing past them, where a ball is lost and nobody plays: not out of
 * bounds, nor the rock beyond it, nor on to the horizon. The first cut, the green, the tee, sand and water are painted,
 * as ever: the cut and the green are mown flat, and the putting surface and its fringe read as one.
 */
function golfFieldOf(layout: Layout, name: string, bare: readonly Clearing[], cell: number): GrassField {
  const reach = marginAt(cell);
  const origin: [number, number] = [layout.originX - reach, layout.originY - reach];
  const cols = sideAt(layout.cols, cell),
    rows = sideAt(layout.rows, cell);
  const mask = new Uint8Array(cols * rows),
    heights = new Float32Array(cols * rows);
  // a tile at a time, which a cell divides into whole (the field's edge is on a tile's, whatever the cell)
  const per = Math.round(TILE / cell);
  const zones = zonesOf(layout);
  const tint = tintOf(layout)!;
  for (let t = 0; t < layout.cols * layout.rows; t++) {
    // grass does not grow on rock or in water, and elsewhere by the zone the ground is drawn and played as
    if (layout.solid[t] || layout.water[t]) continue;
    const tx = t % layout.cols,
      ty = Math.floor(t / layout.cols);
    // a tile that is one zone from edge to edge is read once; one a curve crosses is read cell by cell
    const whole = zones.tileZone(tx, ty);
    const tileKind = whole === null ? -2 : kindOfZone(whole);
    if (tileKind === -1) continue;
    const x0 = Math.round((layout.originX + tx * TILE - origin[0]) / cell),
      y0 = Math.round((layout.originY + ty * TILE - origin[1]) / cell);
    for (let cy = y0; cy < y0 + per; cy++)
      for (let cx = x0; cx < x0 + per; cx++) {
        const i = cy * cols + cx;
        const kind =
          tileKind >= 0 ? tileKind : kindOfZone(zones.at(origin[0] + (cx + 0.5) * cell, origin[1] + (cy + 0.5) * cell));
        if (kind < 0) continue;
        const x = origin[0] + (cx + 0.5) * cell,
          y = origin[1] + (cy + 0.5) * cell;
        // the rough in the step of the banks' tint the painted ground has there, so the blades and the ground under them agree
        mask[i] = (kind === ROUGH ? kindOfLevel(levelOf(tint.at(x, y))) : kind) + 1;
        heights[i] = heightAt(layout, x, y);
      }
  }
  clearDiscs(mask, origin, cell, cols, rows, bare);
  return { origin, cell, cols, rows, mask, heights, kinds: golfKinds(), seed: nameSeed(name) };
}

/** `mask` cleared in each of the `bare` discs: a cell when its middle is in the disc, and at a cell coarser than the finest, when any of it is. */
function clearDiscs(
  mask: Uint8Array,
  origin: [number, number],
  cell: number,
  cols: number,
  rows: number,
  bare: readonly Clearing[],
) {
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
  if (layout.golf) return golfFieldOf(layout, name, bare, cell);
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
  clearDiscs(mask, origin, cell, cols, rows, bare);
  return {
    origin,
    cell,
    cols,
    rows,
    mask,
    heights,
    kinds: [...KINDS],
    outside: { kind: ROUGH, height: -ROUGH_DEPTH },
    seed: nameSeed(name),
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
  // the first draw is the way it blows, which is the ball's as much as the grass's and so is `windDirection`'s; the second is how hard
  const random = seeded(nameSeed(`${name} wind`));
  random();
  return { direction: windDirection(name), strength: 0.7 + random() * 0.3, gustSize: 8, gustSpeed: 5 };
}

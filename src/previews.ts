/**
 * The course card's strip on the start screen: each hole of a course painted from above, with its par under it, so a
 * player sees a course's character (its doglegs and water, its rails and kickers) before choosing it. A golf course takes
 * up to a second to make, so nothing here is worked out as a player steps through the courses: `scripts/make-previews.ts`
 * makes every course once and writes each hole's picture to `public/previews/<slug>/<n>.png` and the figures to
 * `src/previews.json`, both committed, and the start screen reads them. This file is the arithmetic and the painting both
 * share, so a test can hold the generated pictures to the courses as they are.
 *
 * A golf hole is painted by the hole map's own painter, so the strip and the map over the course are one picture. A hole
 * of minigolf is painted here a tile at a time, since the hole map is golf's (it paints minigolf as flat grass, with no
 * rail, cup or tee) and a hole of minigolf is a grid of tiles whose picture is crisp at a whole number of pixels a tile.
 */
import { TILE, type Layout } from './arena';
import { mownAt } from './ground';
import { paintMap, screen, type MapSize, type Rgb } from './holemap';
import { PALETTE } from './models/palette';

/** How big a hole's picture is: the hole fitted to a box this many pixels a side. */
export const PREVIEW = { box: 120 } as const;

/** A course's strip as the generated data has it. */
export interface CoursePreview {
  /** The folder of its pictures under `public/previews/`. */
  slug: string;
  /** Each hole's name, par, length in yards and picture's size, in the course's order; the names are what the save keeps a best score by. */
  holes: { name: string; par: number; yards: number; width: number; height: number }[];
  /** The course's length: its holes' lengths added. */
  yards: number;
}

/** A hole painted: its size and its pixels, four bytes each, red to alpha, nothing (alpha nought) off the course. */
export interface Painted {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** The colours a hole of minigolf is painted in, as bytes, from the scene's own palette through the hole map's conversion. */
export const MINI_COLOUR = {
  grass: screen(PALETTE.grass),
  mown: screen(PALETTE.grassMown),
  /** A raised step: the mown green lifted a quarter, so a step reads as higher ground. */
  raised: screen(PALETTE.grassMown.map((c) => c * 1.25)),
  rail: screen(PALETTE.rail),
  railCap: screen(PALETTE.railCap),
  water: screen(PALETTE.waterMid),
  sand: screen(PALETTE.sand),
  belt: screen(PALETTE.belt),
  post: screen(PALETTE.trunk),
  kicker: screen(PALETTE.plastic.orange),
  cup: screen(PALETTE.hole),
  cupRim: [255, 255, 255] as Rgb,
  tee: [255, 255, 255] as Rgb,
} as const;

/** A course's name as a folder name: lower case, the words joined by hyphens, nothing else. */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * How long a hole is, in yards: along its line of play where the generator gave it one (tee, corner, cup), which is what a
 * card says of a dogleg, and the straight line from tee to cup on a hole drawn by hand. A unit is a yard on golf; a hole of
 * minigolf is measured the same way, since its tiles are in the same units.
 */
export function holeLength(layout: Layout): number {
  const way = layout.way;
  if (way && way.length > 1) {
    let sum = 0;
    for (let k = 1; k < way.length; k++) sum += Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1]);
    return Math.round(sum);
  }
  return Math.round(Math.hypot(layout.cup.x - layout.tee.x, layout.cup.y - layout.tee.y));
}

/**
 * A hole's picture: a golf hole by the hole map's painter fitted to the box at its own shape, and a hole of minigolf by
 * its own, a whole number of pixels a tile. `streams` are the tiles a stream lies on, painted as water, and `belts` every
 * belt's tiles (a stream's among them), painted as a belt where they are not a stream; both are the obstacles' own sets.
 */
export function paintPreview(
  layout: Layout,
  streams: ReadonlySet<number> = new Set(),
  belts: ReadonlySet<number> = new Set(),
  box = PREVIEW.box,
): Painted {
  if (layout.golf) {
    const { minX, maxX, minY, maxY } = layout.bounds;
    const w = Math.max(1, maxX - minX),
      h = Math.max(1, maxY - minY);
    const scale = Math.min(box / w, box / h);
    const size: MapSize = {
      width: Math.max(1, Math.floor(w * scale)),
      height: Math.max(1, Math.floor(h * scale)),
      scale,
      west: minX,
      north: maxY,
    };
    const pixels = new Uint8ClampedArray(size.width * size.height * 4);
    paintMap(layout, size, pixels, streams);
    return { width: size.width, height: size.height, pixels };
  }
  return paintMinigolf(layout, streams, belts, box);
}

/** A hole of minigolf painted a tile at a time: the rail with its cap, the ground's kinds, then what stands on it. */
function paintMinigolf(layout: Layout, streams: ReadonlySet<number>, belts: ReadonlySet<number>, box: number): Painted {
  const { cols, rows } = layout;
  const k = Math.max(1, Math.floor(box / Math.max(cols, rows)));
  const width = cols * k,
    height = rows * k;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) pixels.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
  };
  const disc = (cx: number, cy: number, r: number, c: Rgb) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r)
          pixels.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
  };
  // the tiles, row by row from the north, which is the top of the picture as the map is drawn
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const t = ty * cols + tx;
      const x0 = tx * k,
        y0 = (rows - 1 - ty) * k;
      if (layout.rail[t]) {
        // a timber side and a cap inset on it, so a rail a tile thick reads as a rail and not a wall of colour
        const m = Math.max(1, Math.floor(k / 4));
        fill(x0, y0, x0 + k, y0 + k, MINI_COLOUR.rail);
        fill(x0 + m, y0 + m, x0 + k - m, y0 + k - m, MINI_COLOUR.railCap);
        continue;
      }
      if (layout.solid[t]) continue;
      const colour =
        layout.water[t] || streams.has(t)
          ? MINI_COLOUR.water
          : layout.sand[t]
            ? MINI_COLOUR.sand
            : belts.has(t)
              ? MINI_COLOUR.belt
              : layout.floor[t] > 0
                ? MINI_COLOUR.raised
                : mownAt(layout, tx, rows - 1 - ty)
                  ? MINI_COLOUR.mown
                  : MINI_COLOUR.grass;
      fill(x0, y0, x0 + k, y0 + k, colour);
    }
  // what stands on the ground, at its own place: posts, kickers, the cup in a white rim, and the tee's mark
  const at = (p: { x: number; y: number }): [number, number] => [
    ((p.x - layout.originX) / TILE) * k,
    ((layout.originY + rows * TILE - p.y) / TILE) * k,
  ];
  for (const post of layout.bumpers) disc(...at(post), k * 0.36, MINI_COLOUR.post);
  for (const kicker of layout.kickers) disc(...at(kicker), k * 0.4, MINI_COLOUR.kicker);
  const [cx, cy] = at(layout.cup);
  disc(cx, cy, k * 0.42, MINI_COLOUR.cupRim);
  disc(cx, cy, k * 0.3, MINI_COLOUR.cup);
  const [tx, ty] = at(layout.tee);
  fill(
    Math.max(0, Math.floor(tx - k * 0.25)),
    Math.max(0, Math.floor(ty - k * 0.1)),
    Math.min(width, Math.ceil(tx + k * 0.25)),
    Math.min(height, Math.ceil(ty + k * 0.1)),
    MINI_COLOUR.tee,
  );
  return { width, height, pixels };
}

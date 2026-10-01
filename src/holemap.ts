/**
 * The map of a hole: its ground seen from straight above, tee at the bottom and the cup at the top as the hole is drawn,
 * small enough to sit over the course. The camera shows a hundred yards of a hole that is four or five hundred long, so
 * without it a player sees neither the green they are playing to nor what lies between. It is a picture of the layout and
 * nothing else, painted once when a hole begins; where the ball is, the aim and the landing are drawn over it by the page
 * from `mapPoint`, which is why that is worked out here and not there.
 *
 * Pure arithmetic on a layout and a buffer, tested without a page; the colours are the scene's own palette, so the map
 * and the course are one green.
 */
import { tileAt, type Layout } from './arena';
import { PALETTE } from './models/palette';
import { LIE } from './surfaces';
import { TREE } from './trees';

/** What size a hole's map is, and where it lies on the ground. */
export interface MapSize {
  width: number;
  height: number;
  /** Pixels a yard: no more than one, since a hole map is a map and not a view. */
  scale: number;
  /** The west edge and the north edge of the map, in world units. */
  west: number;
  north: number;
}

/**
 * How much a colour of the palette is lifted, in linear light, for a picture that is not toon lit: the palette is the
 * colour of the ground in the scene's own light, which shows brighter than it is written, and flat on a map it would
 * be dull beside the course it is over.
 */
const LIFT = 1.5;
/** How much of a tree's canopy is drawn, as a share of its radius: a tree on a map is a dot, and not the whole of its shadow. */
const TREE_SHARE = 0.7;

type Rgb = readonly [number, number, number];

/** A palette colour as bytes: lifted, then the sRGB curve the screen shows it by. */
function byte(linear: number): number {
  const c = Math.min(1, Math.max(0, linear * LIFT));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}
const screen = (c: readonly number[]): Rgb => [byte(c[0]), byte(c[1]), byte(c[2])];

/** The ground's kinds, in the colours the map paints them, made once. */
const COLOUR = {
  tee: screen(PALETTE.teeBox),
  fairway: screen(PALETTE.grassMown),
  rough: screen(PALETTE.playRough),
  green: screen(PALETTE.puttingGreenMown),
  cut: screen(PALETTE.firstCut),
  sand: screen(PALETTE.sand),
  water: screen(PALETTE.waterMid),
  out: screen(PALETTE.oobGround),
  tree: [31, 107, 90] as Rgb,
  ground: screen(PALETTE.grass),
};

/**
 * The map's size in pixels for a box of `maxWidth` by `maxHeight`: the box round the hole's ground fitted to it, at its
 * own shape, whole pixels, and never more than a pixel a yard.
 */
export function mapSize(layout: Layout, maxWidth: number, maxHeight: number): MapSize {
  const { minX, maxX, minY, maxY } = layout.bounds;
  const w = Math.max(1, maxX - minX),
    h = Math.max(1, maxY - minY);
  const scale = Math.min(1, maxWidth / w, maxHeight / h);
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
    scale,
    west: minX,
    north: maxY,
  };
}

/** Where a point on the ground is on the map, in pixels from its top left corner, written into `out`. Nothing is made. */
export function mapInto(size: MapSize, x: number, y: number, out: number[] | Float64Array): void {
  out[0] = (x - size.west) * size.scale;
  out[1] = (size.north - y) * size.scale;
}

/** Where a point on the ground is on the map, in pixels from its top left corner. */
export function mapPoint(_layout: Layout, size: MapSize, x: number, y: number): [number, number] {
  const out: [number, number] = [0, 0];
  mapInto(size, x, y, out);
  return out;
}

/** The colour of the ground at a tile, or none for ground that is off the course. */
function kindOf(layout: Layout, t: number): Rgb | null {
  if (t < 0 || layout.solid[t]) return null;
  if (layout.water[t]) return COLOUR.water;
  if (layout.sand[t]) return COLOUR.sand;
  if (layout.oob[t]) return COLOUR.out;
  switch (layout.lie[t]) {
    case LIE.tee:
      return COLOUR.tee;
    case LIE.fairway:
      return COLOUR.fairway;
    case LIE.green:
      return COLOUR.green;
    case LIE.cut:
      return COLOUR.cut;
    case LIE.rough:
      return COLOUR.rough;
    default:
      return COLOUR.ground;
  }
}

/**
 * The hole painted into `out`, which has `size.width * size.height` pixels of four bytes, red to alpha: the ground in
 * its kinds, each tree as a dot over it, and nothing (alpha nought) where the hole has no ground.
 */
export function paintMap(layout: Layout, size: MapSize, out: Uint8ClampedArray): void {
  const { width, height, scale } = size;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const colour = kindOf(layout, tileAt(layout, size.west + (px + 0.5) / scale, size.north - (py + 0.5) / scale));
      const o = (py * width + px) * 4;
      if (colour) out.set([colour[0], colour[1], colour[2], 255], o);
      else out.set([0, 0, 0, 0], o);
    }
  }
  const radius = Math.max(1.5, TREE.radius * TREE_SHARE * scale);
  for (const tree of layout.trees) {
    const [cx, cy] = mapPoint(layout, size, tree.x, tree.y);
    for (let py = Math.max(0, Math.floor(cy - radius)); py <= Math.min(height - 1, Math.ceil(cy + radius)); py++)
      for (let px = Math.max(0, Math.floor(cx - radius)); px <= Math.min(width - 1, Math.ceil(cx + radius)); px++)
        if (Math.hypot(px + 0.5 - cx, py + 0.5 - cy) <= radius)
          out.set([COLOUR.tree[0], COLOUR.tree[1], COLOUR.tree[2], 255], (py * width + px) * 4);
  }
}

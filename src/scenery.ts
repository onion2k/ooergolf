/**
 * The scenery round a hole: trees, hedges, flowers and rocks on the rough, for
 * fun, which the physics never sees; and the hole's dressing, bunting strung
 * round three sides of it, beds of flowers at the foot of its rail, and
 * rocks in clusters. Where each stands comes from the hole's
 * name and never from the game's chance, so the same hole looks the same
 * every time, and a round played from a seed is not moved by the drawing.
 *
 * It is handed a hole's layout and says what stands where; the scene draws it.
 */
import { TILE, tileAt, type Layout } from './arena';
import { seeded } from './random';

export type SceneryKind = 'round tree' | 'pine' | 'hedge' | 'flowers' | 'rock';

export interface Piece {
  kind: SceneryKind;
  x: number;
  y: number;
  /** Which way it is turned, and how much bigger or smaller than its model. */
  yaw: number;
  scale: number;
  /** For flowers, which of their colours. */
  variant: number;
}

/**
 * How much scenery a hole has, how far it keeps from the grass and the rail,
 * how far apart, and how far out from the course it may stand: close enough
 * to be seen from the camera's usual place, far enough not to crowd it.
 */
export const SCENERY = { least: 12, most: 30, clear: 3, spacing: 4.5, reach: 16 } as const;

/**
 * What the scenery was placed for: the perimeter of the biggest hole there was when it was, fifteen tiles by seventeen,
 * in units, and the longest string of bunting one pair of posts held. Past them the scenery grows with the hole.
 */
export const REFERENCE = { perimeter: 2 * (15 + 17) * TILE, string: 60 } as const;

/**
 * How many times bigger a hole is than the biggest there was, by its perimeter, and one for every hole that size or
 * smaller: so a hole that was there is given exactly the scenery it always had, and a bigger one the more it needs to
 * be dressed as densely round its edge.
 */
export function bigness(layout: Layout): number {
  return Math.max(1, (2 * (layout.cols + layout.rows) * TILE) / REFERENCE.perimeter);
}

/** How much of its model's size a scattered piece is, at the least and how much more it may be. */
export const SCALE = { least: 0.8, spread: 0.45 } as const;

/** How wide a rock is, from its middle out, at the model's own size: the scene builds it to this. */
export const ROCK_SIZE = 1.4;
/** How far past its own edge the rough is cleared round a rock, so the blades stand back and the whole of it is seen. */
const CLEARING_MARGIN = 0.6;

/** How often each kind is chosen. */
const WEIGHTS: [SceneryKind, number][] = [
  ['round tree', 3],
  ['pine', 2],
  ['hedge', 1.5],
  ['flowers', 2.5],
  ['rock', 1],
];

/** A seed from a name: FNV-1a, so the same name always scatters alike. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/**
 * How the dressing stands: the rail's top above the rough (what the bunting
 * must clear to be seen over it), the bunting's height from the rough and how
 * far out from the rail it is strung, how far out from the rail a bed is, and
 * every how many tiles of rail there is one.
 */
export const DRESSING = { railTop: 4.6, buntingHeight: 7.5, buntingOut: 1.5, bedOut: 1.3, bedEvery: 3 } as const;

export interface Bunting {
  x: number;
  y: number;
  yaw: number;
  length: number;
  height: number;
}

export interface Dressing {
  bunting: Bunting[];
  beds: { x: number; y: number; yaw: number; variant: number }[];
  rocks: { x: number; y: number; yaw: number; scale: number }[];
}

/**
 * A hole's dressing: bunting on posts along its far side and its two long
 * ones, just outside the rail; a bed of flowers every few tiles along the
 * outside of the rail; and rocks in clusters on the rough. From the hole's
 * name, as the scatter is, with a chance of its own.
 */
export function dress(layout: Layout, name: string): Dressing {
  const random = seeded(seedOf(`${name} dressed`));
  const { bounds, cols, rows, rail, solid, originX, originY } = layout;
  const out = TILE + DRESSING.buntingOut;
  const [x0, x1, y0, y1] = [bounds.minX - out, bounds.maxX + out, bounds.minY - out, bounds.maxY + out];
  const string = (ax: number, ay: number, bx: number, by: number): Bunting => ({
    x: (ax + bx) / 2,
    y: (ay + by) / 2,
    yaw: Math.atan2(by - ay, bx - ax),
    length: Math.hypot(bx - ax, by - ay),
    height: DRESSING.buntingHeight,
  });
  // one string a side, and a side longer than a string can be strung, in as many equal strings as it takes, each between
  // posts of its own
  const along = (ax: number, ay: number, bx: number, by: number): Bunting[] => {
    const parts = Math.ceil(Math.hypot(bx - ax, by - ay) / REFERENCE.string);
    return Array.from({ length: parts }, (_, k) =>
      string(
        ax + ((bx - ax) * k) / parts,
        ay + ((by - ay) * k) / parts,
        ax + ((bx - ax) * (k + 1)) / parts,
        ay + ((by - ay) * (k + 1)) / parts,
      ),
    );
  };
  const bunting = [...along(x0, y1, x1, y1), ...along(x0, y0, x0, y1), ...along(x1, y0, x1, y1)];

  const beds: Dressing['beds'] = [];
  let seen = 0;
  for (let t = 0; t < cols * rows; t++) {
    if (!rail[t]) continue;
    const tx = t % cols,
      ty = Math.floor(t / cols);
    // the way out of the course from this rail tile: toward a neighbour off the course, or off the grid
    for (const [ox, oy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = tx + ox,
        ny = ty + oy;
      const off = nx < 0 || ny < 0 || nx >= cols || ny >= rows || (solid[ny * cols + nx] && !rail[ny * cols + nx]);
      if (!off) continue;
      if (seen++ % DRESSING.bedEvery !== 0) break;
      const cx = originX + (tx + 0.5) * TILE,
        cy = originY + (ty + 0.5) * TILE;
      const reach = TILE / 2 + DRESSING.bedOut;
      beds.push({
        x: cx + ox * reach,
        y: cy + oy * reach,
        yaw: random() * Math.PI * 2,
        variant: Math.floor(random() * 3),
      });
      break;
    }
  }

  const rocks: Dressing['rocks'] = [];
  const minX = originX - SCENERY.reach,
    minY = originY - SCENERY.reach,
    w = cols * TILE + SCENERY.reach * 2,
    h = rows * TILE + SCENERY.reach * 2;
  // three clusters, and more as the hole is bigger
  const big = bigness(layout);
  for (let clusters = 0, tries = 0; clusters < Math.ceil(3 * big) && tries < Math.ceil(200 * big); tries++) {
    const cx = minX + random() * w,
      cy = minY + random() * h;
    if (!onRough(layout, cx, cy) || underBunting(bunting, cx, cy)) continue;
    const n = 2 + Math.floor(random() * 3);
    const cluster: Dressing['rocks'] = [];
    for (let k = 0; k < n; k++) {
      const a = random() * Math.PI * 2,
        r = 0.6 + random() * 1.2;
      const x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r;
      if (onRough(layout, x, y)) cluster.push({ x, y, yaw: random() * Math.PI * 2, scale: 0.5 + random() * 0.7 });
    }
    if (cluster.length < 2) continue;
    rocks.push(...cluster);
    clusters++;
  }
  return { bunting, beds, rocks };
}

/** Whether a point is under one of the strings of bunting, or so near that a tree there would stand in it. */
function underBunting(bunting: Bunting[], x: number, y: number): boolean {
  return bunting.some((b) => {
    const c = Math.cos(b.yaw),
      s = Math.sin(b.yaw);
    const along = (x - b.x) * c + (y - b.y) * s,
      across = -(x - b.x) * s + (y - b.y) * c;
    return Math.abs(across) <= 2.5 && Math.abs(along) <= b.length / 2 + 1.5;
  });
}

/** Whether a point is on the rough, clear of every tile of the course and its rail by `SCENERY.clear`. */
function onRough(l: Layout, x: number, y: number): boolean {
  for (let a = 0; a < 8; a++) {
    const t = tileAt(
      l,
      x + Math.cos((a / 8) * Math.PI * 2) * SCENERY.clear,
      y + Math.sin((a / 8) * Math.PI * 2) * SCENERY.clear,
    );
    if (t >= 0 && (l.solid[t] === 0 || l.rail[t] === 1)) return false;
  }
  const t = tileAt(l, x, y);
  return t < 0 || (l.solid[t] === 1 && l.rail[t] === 0);
}

/** What stands round the hole laid out as `layout`, called `name`. */
export function scatter(layout: Layout, name: string): Piece[] {
  const random = seeded(seedOf(name));
  const dressed = dress(layout, name);
  const { originX, originY, cols, rows } = layout;
  const minX = originX - SCENERY.reach,
    minY = originY - SCENERY.reach,
    w = cols * TILE + SCENERY.reach * 2,
    h = rows * TILE + SCENERY.reach * 2;
  const total = WEIGHTS.reduce((a, [, n]) => a + n, 0);
  const out: Piece[] = [];
  // thirty pieces, and as many more as the hole is bigger, with the tries to place them
  const big = bigness(layout);
  const most = Math.ceil(SCENERY.most * big);
  for (let tries = 0; tries < Math.ceil(800 * big) && out.length < most; tries++) {
    const x = minX + random() * w,
      y = minY + random() * h;
    if (!onRough(layout, x, y)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < SCENERY.spacing)) continue;
    // clear of the dressing: the bunting's line, the beds and the rocks
    if (underBunting(dressed.bunting, x, y)) continue;
    if ([...dressed.beds, ...dressed.rocks].some((d) => Math.hypot(d.x - x, d.y - y) < SCENERY.spacing * 0.7)) continue;
    let pick = random() * total,
      kind: SceneryKind = 'rock';
    for (const [k, n] of WEIGHTS)
      if ((pick -= n) < 0) {
        kind = k;
        break;
      }
    out.push({
      kind,
      x,
      y,
      yaw: random() * Math.PI * 2,
      scale: SCALE.least + random() * SCALE.spread,
      variant: Math.floor(random() * 3),
    });
  }
  return out;
}

/**
 * Where the long grass must not grow on a hole: a disc round each rock, its
 * clusters and the ones scattered on the rough alike, so it stands on bare
 * ground and is seen, and not through the blades, which stand higher than a
 * rock does. The turf is handed these; it knows nothing of rocks.
 */
export function clearings(layout: Layout, name: string): { x: number; y: number; r: number }[] {
  const rocks = [...dress(layout, name).rocks, ...scatter(layout, name).filter((p) => p.kind === 'rock')];
  return rocks.map((r) => ({ x: r.x, y: r.y, r: ROCK_SIZE * r.scale + CLEARING_MARGIN }));
}

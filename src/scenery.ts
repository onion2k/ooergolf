/**
 * The scenery round a hole: trees, bushes, flowers and rocks on the rough, for
 * fun, which the physics never sees; and the hole's dressing, bunting strung
 * round three sides of it, beds of flowers at the foot of its rail, and
 * rocks in clusters; and round a hole of golf, woods and scrub on the plain
 * past its map, where nobody plays. Where each stands comes from the hole's
 * name and never from the game's chance, so the same hole looks the same
 * every time, and a round played from a seed is not moved by the drawing.
 *
 * It is handed a hole's layout and says what stands where; the scene draws it.
 */
import { TILE, tileAt, type Layout } from './arena';
import { seeded } from './random';

/**
 * What a piece is, named for what is drawn: low-poly since 8 October 2026, when a round tree became a broadleaf, a
 * pine a conifer and a hedge a bush (drawn as a fern for some variants). A fern of its own is only ever beyond a golf
 * hole, so the scatter of minigolf draws the chance it always drew.
 */
export type SceneryKind = 'broadleaf' | 'conifer' | 'bush' | 'fern' | 'flowers' | 'rock';

export interface Piece {
  kind: SceneryKind;
  x: number;
  y: number;
  /** Which way it is turned, and how much bigger or smaller than its model. */
  yaw: number;
  scale: number;
  /** For flowers, which of their colours; for a bush, whether it is drawn as a fern (`variant` of one). */
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
  ['broadleaf', 3],
  ['conifer', 2],
  ['bush', 1.5],
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
  // a golf hole is dressed with its bunting alone, which marks where it ends: no bed of flowers or cluster of rock stands
  // on the plain past the stakes, where nothing else does
  return layout.golf ? { bunting, beds: [], rocks: [] } : { bunting, beds, rocks };
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

/** What stands round the hole laid out as `layout`, called `name`: on a hole of minigolf, none on one of golf. */
export function scatter(layout: Layout, name: string): Piece[] {
  // nothing stands past the stakes of a golf hole, where the course ends and nobody plays: its dressing is at the edge of it
  if (layout.golf) return [];
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

/**
 * The scenery beyond a golf hole: how far past the map's edge it begins (`margin`), how far out it goes (`reach`), how
 * many clumps it has for each unit of the map's perimeter (`per`), how far a clump's pieces spread (`clump`), how many
 * pieces a clump has at the most, and the ceiling on all of them, which the triangle budget is reckoned against. Woods
 * and scrub in clumps, as the title has them, and not a sprinkle: a clump is a wood (conifers, broadleaves and a few bushes,
 * five to five to one) four times in five (`wood`) and scrub (bushes, ferns and rocks) the fifth. The clumps are dense by the
 * course's edge and thin out to `thin` of that at the reach, as the title's do.
 */
export const BEYOND = {
  margin: 6,
  reach: 150,
  per: 1 / 6,
  clump: 14,
  size: 10,
  most: 1700,
  thin: 0.12,
  wood: 0.8,
} as const;

/**
 * How the woods' broadleaves vary: from `least` to `most` of the size the model makes them, by a hash of the place
 * (a size is a place's, never a chance's, so the same hole has the same trees), and one in `bigOne` of those within
 * `near` yards of the map's edge `big` times bigger again, the few great trees the title picture has by its fairway.
 */
export const BROADLEAF = { least: 0.7, most: 1.4, near: 45, big: 1.9, bigShare: 0.2 } as const;

/** How much of its model's size a broadleaf at (x, y) is, `away` yards past the map's edge. */
function broadleafSize(x: number, y: number, away: number): number {
  const fraction = (v: number) => Math.abs(v) % 1;
  const size =
    BROADLEAF.least + (BROADLEAF.most - BROADLEAF.least) * fraction(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
  const big = away < BROADLEAF.near && fraction(Math.sin(x * 4.1 + y * 9.7) * 1013.3) < BROADLEAF.bigShare;
  return big ? size * BROADLEAF.big : size;
}

/** What a wood and what scrub are made of, and how often each. */
const WOOD: [SceneryKind, number][] = [
  ['conifer', 5],
  ['broadleaf', 5],
  ['bush', 1],
];
const SCRUB: [SceneryKind, number][] = [
  ['bush', 3],
  ['fern', 3],
  ['rock', 2],
];

/** A kind from `weights`, by a draw of `random`. */
function pick(weights: [SceneryKind, number][], random: () => number): SceneryKind {
  let left = random() * weights.reduce((a, [, n]) => a + n, 0);
  for (const [k, n] of weights) if ((left -= n) < 0) return k;
  return weights[weights.length - 1][0];
}

/**
 * The woods and scrub round a hole of golf, laid out as `layout` and called `name`: clumps on the ground no ball can
 * reach, which is the empty ground past its out of bounds (beyond the wall that stands there) and the plain past its
 * map, each piece `BEYOND.margin` clear of every tile a ball can be on and no further than its reach past the map. None
 * round a hole of minigolf, whose scatter is its own. From the hole's name, with a chance of its own, so a hole looks
 * the same every time and nothing of the game is moved by it.
 */
export function beyond(layout: Layout, name: string): Piece[] {
  if (!layout.golf) return [];
  const random = seeded(seedOf(`${name} beyond`));
  const x0 = layout.originX,
    y0 = layout.originY,
    x1 = layout.originX + layout.cols * TILE,
    y1 = layout.originY + layout.rows * TILE;
  const { margin, reach } = BEYOND;
  // whether a point is on ground no ball can be on: off the map, or on its empty ground (rock and no rail)
  const off = (x: number, y: number) => {
    const t = tileAt(layout, x, y);
    return t < 0 || (layout.solid[t] === 1 && layout.rail[t] === 0);
  };
  // and clear of the course by the margin all round, and within the reach of the map's edge
  const free = (x: number, y: number) => {
    if (Math.max(x0 - x, x - x1, y0 - y, y - y1) > reach) return false;
    for (let a = 0; a < 16; a++) {
      const c = Math.cos((a / 16) * Math.PI * 2),
        s = Math.sin((a / 16) * Math.PI * 2);
      for (const r of [0, margin / 2, margin]) if (!off(x + c * r, y + s * r)) return false;
    }
    return true;
  };
  const clumps = Math.ceil(2 * (x1 - x0 + y1 - y0) * BEYOND.per);
  const pieces: Piece[] = [];
  for (let c = 0; c < clumps && pieces.length < BEYOND.most; c++) {
    // a clump's middle anywhere free: drawn in the box round the map until it falls there
    let cx = 0,
      cy = 0;
    for (let tries = 0; tries < 30; tries++) {
      cx = x0 - reach + random() * (x1 - x0 + 2 * reach);
      cy = y0 - reach + random() * (y1 - y0 + 2 * reach);
      // dense by the course's edge and thinning out with the distance from it, to `BEYOND.thin` of that at the reach
      const away = Math.max(x0 - cx, cx - x1, y0 - cy, cy - y1);
      if (free(cx, cy) && random() < Math.max(BEYOND.thin, 1 - away / reach)) break;
    }
    if (!free(cx, cy)) continue;
    const wood = random() < BEYOND.wood;
    const count = 3 + Math.floor(random() * (BEYOND.size - 2));
    for (let k = 0; k < count && pieces.length < BEYOND.most; k++) {
      const a = random() * Math.PI * 2,
        r = Math.sqrt(random()) * BEYOND.clump * 0.75;
      const x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r;
      const kind = pick(wood ? WOOD : SCRUB, random);
      const yaw = random() * Math.PI * 2,
        scale = SCALE.least + random() * SCALE.spread,
        variant = Math.floor(random() * 3);
      if (free(x, y)) {
        const away = Math.max(x0 - x, x - x1, y0 - y, y - y1);
        pieces.push({
          kind,
          x,
          y,
          yaw,
          scale: kind === 'broadleaf' ? scale * broadleafSize(x, y, away) : scale,
          variant,
        });
      }
    }
  }
  return pieces;
}

/**
 * The far woods of a golf hole: thin clumps of the cheapest trees (`farTree`, about twenty triangles) from `from` yards
 * past the map's edge, where the near woods end, out to the backdrop's hills at `to`, thinning with the distance, at most
 * `most` trees; a clump spreads `clump` yards, has up to `size` more than two trees, and a tree is `scale` yards tall at
 * the least and `spread` more. Where each stands comes from the hole's name; the scene stands them on the ground.
 */
export const FAR = { from: 140, to: 440, most: 2400, clump: 22, size: 9, scale: 9, spread: 8, thin: 0.6 } as const;

export function farWoods(layout: Layout, name: string): Piece[] {
  if (!layout.golf) return [];
  const random = seeded(seedOf(`${name} far woods`));
  const x0 = layout.originX,
    y0 = layout.originY,
    x1 = x0 + layout.cols * TILE,
    y1 = y0 + layout.rows * TILE;
  const out: Piece[] = [];
  const clumps = Math.ceil(((x1 - x0 + y1 - y0) * 2 + 2 * Math.PI * 300) / 55);
  for (let c = 0; c < clumps && out.length < FAR.most; c++) {
    let cx = 0,
      cy = 0,
      ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      cx = x0 - FAR.to + random() * (x1 - x0 + 2 * FAR.to);
      cy = y0 - FAR.to + random() * (y1 - y0 + 2 * FAR.to);
      const d = Math.max(x0 - cx, cx - x1, y0 - cy, cy - y1);
      ok = d > FAR.from && d < FAR.to && random() < 1 - ((d - FAR.from) / (FAR.to - FAR.from)) * FAR.thin;
    }
    if (!ok) continue;
    const count = 3 + Math.floor(random() * FAR.size);
    for (let k = 0; k < count && out.length < FAR.most; k++) {
      const a = random() * Math.PI * 2,
        r = Math.sqrt(random()) * FAR.clump;
      out.push({
        kind: random() < 0.5 ? 'conifer' : 'broadleaf',
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        yaw: 0,
        scale: FAR.scale + random() * FAR.spread,
        variant: 0,
      });
    }
  }
  return out;
}

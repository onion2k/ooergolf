/**
 * The world past a hole, as the title picture has it: a ring of faceted green hills round the hole, blue mountains
 * behind them, a lake in a gap of the hills, forest on the hills and clouds over them that drift with the hole's wind.
 * Seen only from the fly-in (`FLY_IN` in `camera.ts`), since the view a shot is played from looks no higher than
 * thirteen degrees under the horizon. Without it a low view sees the ground run flat to a sky of one colour.
 *
 * It is worked out from the hole's map and its name, never the game's chance, so a hole looks the same every time and
 * nothing of play is moved by it; the scene draws it, and moves only the clouds, by game time. It stands clear of the hole
 * and of what is scattered round it, from `gap` past them out to the mountains.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { TILE, type Layout } from './arena';
import { tri } from './meshes';
import type { V3 } from './models/part';
import { seeded } from './random';
import { BEYOND } from './scenery';

/**
 * The world's figures: how far past the hole (and on golf, what stands round it) the hills begin, `gap`; how deep the
 * ring of hills is and the mountains behind it; its rings and how many points round each; the least and the most a hill
 * rises above the ground; a mountain's; how wide the lake's gap is, as an angle each side of its middle; how many trees
 * at the most, in how many clumps, and the triangles of the costlier far tree; how many clouds, how high and how big;
 * and how fast they drift, in units a second, along the hole's wind.
 */
export const BACKDROP = {
  gap: { golf: 60, minigolf: 200 },
  depth: 800,
  mountains: 1400,
  rings: 6,
  around: 72,
  peaks: 40,
  hill: [12, 95],
  mountain: [160, 260],
  lake: 0.55,
  forest: 1100,
  clumps: 70,
  treeTriangles: 16,
  clouds: 24,
  cloudHeight: [90, 250],
  cloudSize: [40, 90],
  drift: 2,
} as const;

/** A far tree on the hills: which kind, where, turned and scaled. */
export interface FarTree {
  kind: 'conifer' | 'broadleaf';
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

/** A cloud: where it is at nought seconds, turned and scaled, and the ring it drifts within. */
export interface Cloud {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  cx: number;
  cy: number;
  outer: number;
}

/**
 * How high the ground stands at a point. A ground that has a hollow carved for the lake (`groundZOf`) says the level of the
 * lake's water, which the lake lies at and the ground was carved under; any other, the lake is a little under the lowest
 * ground it touches.
 */
export type GroundBase = ((x: number, y: number) => number) & {
  lake?: { level: number; weight: (x: number, y: number) => number };
};

export interface Backdrop {
  hills: Mesh;
  mountains: Mesh;
  lake: Mesh;
  forest: FarTree[];
  clouds: Cloud[];
  /** The ring's middle, and how far out the sky over it goes, which the clouds drift within. */
  centre: [number, number];
  outer: number;
}

/** A seed from a name: FNV-1a, so the same name always makes the same world. */
function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** A smooth bumpy height round the ring, nought to one, from sines with seeded phases: the hills' shape. */
function ridge(seed: number): (a: number) => number {
  const r = seeded(seed);
  const waves = Array.from({ length: 6 }, (_, k) => ({
    f: 2 + k * 2 + Math.floor(r() * 3),
    p: r() * Math.PI * 2,
    w: 1 / (1 + k * 0.7),
  }));
  const total = waves.reduce((s, w) => s + w.w, 0);
  return (a) => 0.5 + (0.5 * waves.reduce((s, w) => s + w.w * Math.sin(w.f * a + w.p), 0)) / total;
}

/** Where the lake lies: the way it is from the hole's middle, the middle of its fan, and the shore's points (x then y) round it. */
export interface LakeShape {
  /** The hole's middle and the angle the lake lies at from it. */
  cx: number;
  cy: number;
  at: number;
  /** The fan's middle, from which each triangle of the water runs to two points of the shore. */
  middle: [number, number];
  /** The shore, from one end of the gap to the other: `LAKE_SHORE + 1` points, each an x and a y. */
  shore: Float64Array;
  /** Where the ring of hills begins and ends, from the hole's middle. */
  near: number;
  far: number;
}

/** How many pieces the lake's shore is cut in. */
export const LAKE_SHORE = 24;

/** Where the world's rings begin (`R0`) and end (`R1`) from a hole's middle: past the hole, and on golf what stands round it. */
const rings0 = (layout: Layout) => {
  const half = Math.hypot(layout.cols * TILE, layout.rows * TILE) / 2;
  const R0 = half + (layout.golf ? BEYOND.reach + BACKDROP.gap.golf : BACKDROP.gap.minigolf);
  return [R0, R0 + BACKDROP.depth] as const;
};

/**
 * The lake of the world round a hole called `name`, worked out from its map and its name alone: the gap of the hills it lies in
 * and the shore of its water. The ground is carved to it (`groundZOf`) and the backdrop draws it, so the two are one lake.
 */
export function lakeShapeOf(layout: Layout, name: string): LakeShape {
  const cx = layout.originX + (layout.cols * TILE) / 2,
    cy = layout.originY + (layout.rows * TILE) / 2;
  const [R0, R1] = rings0(layout);
  const at = seeded(seedOf(`${name} beyond the hills`))() * Math.PI * 2;
  const L = LAKE_SHORE;
  const lr = (j: number) => R0 + (R1 - R0) * (0.25 + 0.25 * Math.sin((j / L) * Math.PI));
  const m = R0 + (R1 - R0) * 0.2;
  const shore = new Float64Array((L + 1) * 2);
  for (let j = 0; j <= L; j++) {
    const a = at - BACKDROP.lake + (2 * BACKDROP.lake * j) / L;
    shore[2 * j] = cx + Math.cos(a) * lr(j);
    shore[2 * j + 1] = cy + Math.sin(a) * lr(j);
  }
  return { cx, cy, at, middle: [cx + Math.cos(at) * m, cy + Math.sin(at) * m], shore, near: R0, far: R1 };
}

/**
 * The world round a hole laid out as `layout` and called `name`, on ground `ground` high: a height for the rough round a
 * hole of minigolf, or a function for the rolling ground past a golf hole (`groundZOf`), which the hills, the mountains
 * and the forest stand on where they stand, so none of them floats over a dip or is buried in a rise. The lake is flat,
 * as water is, a little under the lowest ground it touches; where the ground there is higher than that the plane hides it,
 * and where it dips the water shows, so a lake is seen in a hollow of the hills and never as a pool over a slope.
 */
export function backdropOf(layout: Layout, name: string, ground: number | GroundBase): Backdrop {
  const baseAt: GroundBase = typeof ground === 'number' ? () => ground : ground;
  const seed = seedOf(`${name} beyond the hills`);
  const random = seeded(seed);
  const cx = layout.originX + (layout.cols * TILE) / 2,
    cy = layout.originY + (layout.rows * TILE) / 2;
  const half = Math.hypot(layout.cols * TILE, layout.rows * TILE) / 2;
  const R0 = half + (layout.golf ? BEYOND.reach + BACKDROP.gap.golf : BACKDROP.gap.minigolf);
  const R1 = R0 + BACKDROP.depth,
    R2 = R1 + BACKDROP.mountains;
  const { rings, around } = BACKDROP;
  const lakeAt = random() * Math.PI * 2;
  // how far into the lake's gap an angle is, from nought outside it to one at its middle
  const inLake = (a: number) => {
    const d = Math.abs(((((a - lakeAt) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return Math.max(0, 1 - d / BACKDROP.lake);
  };
  const shape = ridge(seed + 1),
    peaks = ridge(seed + 2);
  const radius = (k: number) => R0 + (R1 - R0) * (k / rings);
  // the lake's shore, worked out first: its water lies 2 under the lowest ground it touches
  const L = 24;
  const lr = (j: number) => R0 + (R1 - R0) * (0.25 + 0.25 * Math.sin((j / L) * Math.PI));
  const middle = R0 + (R1 - R0) * 0.2;
  let lakeBase = baseAt(cx + Math.cos(lakeAt) * middle, cy + Math.sin(lakeAt) * middle);
  for (let j = 0; j <= L; j++) {
    const a = lakeAt - BACKDROP.lake + (2 * BACKDROP.lake * j) / L;
    lakeBase = Math.min(lakeBase, baseAt(cx + Math.cos(a) * lr(j), cy + Math.sin(a) * lr(j)));
  }
  // a ground carved for the lake says where its water is: the carving is under it, and no ground it touches is lower
  if (baseAt.lake) lakeBase = baseAt.lake.level + 2;
  // a hill's height at angle `a` and ring `k` (from nought, the foot, to `rings`, the back): rising outward, and sunk
  // where the lake is, the nearer rings under its water
  const height = (a: number, k: number) => {
    const t = k / rings;
    const lake = inLake(a);
    const h =
      (BACKDROP.hill[0] + BACKDROP.hill[1] * shape(a + t * 0.6)) * Math.sin(t * Math.PI * 0.95) * (0.3 + 0.7 * t);
    // the ground the hill stands on, where it stands
    const r = radius(k);
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    const ground = baseAt(x, y);
    // over a hollow cut for the lake the hills stand on its bed and have no relief of their own where the water is, rising
    // as the shore is left; over any other ground the lake's gap is sunk where it lies, angle by angle
    if (baseAt.lake) return ground + h * (1 - baseAt.lake.weight(x, y));
    return ground + h * (1 - lake * (1 - t * 0.6)) - (t < 0.65 ? lake * 8 : 0);
  };
  const hills = new MeshBuilder();
  const hp = (i: number, k: number): V3 => {
    const a = (i / around) * Math.PI * 2 + (k % 2) * (Math.PI / around);
    const r = radius(k);
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    return [x, y, k === 0 ? baseAt(x, y) : height(a, k)];
  };
  for (let k = 0; k < rings; k++)
    for (let i = 0; i < around; i++) {
      tri(hills, hp(i, k), hp(i + 1, k), hp(i + (k % 2), k + 1));
      tri(hills, hp(i + 1, k), hp(i + 1 + (k % 2), k + 1), hp(i + (k % 2), k + 1));
    }
  // the mountains: one ring of faceted peaks behind the hills, from their back out to the far ring
  const mountains = new MeshBuilder();
  const M = BACKDROP.peaks;
  const mp = (i: number, k: 0 | 1 | 2): V3 => {
    const a = (i / M) * Math.PI * 2 + (k === 1 ? Math.PI / M : 0);
    const r = k === 0 ? R1 * 0.95 : k === 1 ? (R1 + R2) / 2 : R2;
    const h = k === 1 ? BACKDROP.mountain[0] + BACKDROP.mountain[1] * peaks(a) : k === 0 ? 0 : 60;
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    return [x, y, baseAt(x, y) + h];
  };
  for (let i = 0; i < M; i++) {
    tri(mountains, mp(i, 0), mp(i + 1, 0), mp(i, 1));
    tri(mountains, mp(i + 1, 0), mp(i + 1, 1), mp(i, 1));
    tri(mountains, mp(i, 1), mp(i + 1, 1), mp(i + 1, 2));
    tri(mountains, mp(i, 1), mp(i + 1, 2), mp(i, 2));
  }
  // the lake: a fan in the gap of the hills, a little under the ground, its far shore curving out between them
  const lake = new MeshBuilder();
  const lc: V3 = [cx + Math.cos(lakeAt) * middle, cy + Math.sin(lakeAt) * middle, lakeBase - 2];
  for (let j = 0; j < L; j++) {
    const a0 = lakeAt - BACKDROP.lake + (2 * BACKDROP.lake * j) / L,
      a1 = lakeAt - BACKDROP.lake + (2 * BACKDROP.lake * (j + 1)) / L;
    tri(
      lake,
      lc,
      [cx + Math.cos(a0) * lr(j), cy + Math.sin(a0) * lr(j), lakeBase - 2],
      [cx + Math.cos(a1) * lr(j + 1), cy + Math.sin(a1) * lr(j + 1), lakeBase - 2],
    );
  }
  // the forest in clumps on the hills, none in the lake, a clump's trees spread round its middle, bigger the further off
  const forest: FarTree[] = [];
  const clumps = Array.from({ length: BACKDROP.clumps }, () => [
    random() * Math.PI * 2,
    0.5 + random() * (rings - 1.8),
  ]);
  for (let n = 0; n < BACKDROP.forest; n++) {
    const [ca, ck] = clumps[n % clumps.length];
    const a = ca + (random() - 0.5) * 0.12;
    const k = Math.min(rings - 0.6, Math.max(0.3, ck + (random() - 0.5) * 0.9));
    const conifer = random() < 0.65;
    const yaw = random() * Math.PI * 2,
      grow = random();
    if (inLake(a) > 0.2 && k < rings * 0.7) continue;
    const r = radius(k);
    if (baseAt.lake && baseAt.lake.weight(cx + Math.cos(a) * r, cy + Math.sin(a) * r) > 0.02) continue;
    forest.push({
      kind: conifer ? 'conifer' : 'broadleaf',
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      z: height(a, k) - 1,
      yaw,
      scale: 1.6 + grow * 1.2 + (r - R0) / 400,
    });
  }
  // the clouds, high over the hills
  const clouds: Cloud[] = [];
  for (let n = 0; n < BACKDROP.clouds; n++) {
    const a = random() * Math.PI * 2;
    const r = R0 + 300 + random() * (R2 - R0 - 300);
    clouds.push({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      z: BACKDROP.cloudHeight[0] + random() * (BACKDROP.cloudHeight[1] - BACKDROP.cloudHeight[0]),
      yaw: a + Math.PI / 2,
      scale: BACKDROP.cloudSize[0] + random() * (BACKDROP.cloudSize[1] - BACKDROP.cloudSize[0]),
      cx,
      cy,
      outer: R2,
    });
  }
  return {
    hills: hills.build(),
    mountains: mountains.build(),
    lake: lake.build(),
    forest,
    clouds,
    centre: [cx, cy],
    outer: R2,
  };
}

/**
 * Where a cloud is at game time `t`, drifting `BACKDROP.drift` units a second along `wind` (a unit direction, the
 * hole's): along the chord of the ring it is on, and back in on the far side once it would leave the ring, so the sky
 * round a hole is never emptied however long a hole is played.
 */
export function cloudAt(c: Cloud, t: number, wind: readonly [number, number]): { x: number; y: number } {
  const [wx, wy] = wind;
  const px = c.x - c.cx,
    py = c.y - c.cy;
  // how far along the wind the cloud is from the middle, and how far across it, which never changes
  const across = -px * wy + py * wx;
  const chord = Math.sqrt(Math.max(0, c.outer * c.outer - across * across));
  let along = px * wx + py * wy + BACKDROP.drift * t;
  if (chord > 0) along = ((((along + chord) % (2 * chord)) + 2 * chord) % (2 * chord)) - chord;
  return { x: c.cx + along * wx - across * wy, y: c.cy + along * wy + across * wx };
}

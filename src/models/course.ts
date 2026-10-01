/**
 * What every hole has: the cup, the grass round it, the pin and its flag,
 * the markers either side of the tee, and the ball. Each is built to the
 * sizes the game plays with, so a cup of any radius the game tries is lined
 * and rimmed on its own circle, the pin stands from the bottom of the cup to
 * its height, and the ball is the physics' own size. The origin of each is
 * where the game puts it: the cup's middle at grass level, the tee's middle
 * between the markers, the ball's middle.
 *
 * These are on screen every moment, so they are the round, smooth toys the
 * look asks for: turned on a lathe and shaded smooth, where the rest of the
 * models are cut a face at a time. Without that the gold rim, the pin and the
 * ball would show their facets at every glance.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { PALETTE, ROUGH } from './palette';
import { PATTERN, matte, type Colour, type Model, type V3 } from './part';
import { at, ballProfile, built, lathe, lifted, type Turned } from './shapes';
import { face, tri } from '../meshes';

/**
 * The cup's figures: how deep it is drawn; how wide its gold rim is, a bead
 * on the grass round the hole, and how proud it stands; and how many sides
 * the cup has, and how many pieces the bead is turned in over its top. A
 * multiple of eight sides, so the grass round it can meet the square it sits
 * in at the corners.
 */
export const CUP = { depth: 2.4, rim: 0.34, rimHeight: 0.15, sides: 24, bead: 6 } as const;

/**
 * A cup of `radius`: its lining, a dark wall down from the grass and a
 * floor, and a gold rim round its lip, a rounded bead lying on the grass. The
 * lining's wall is on the cup's own circle, which is the physics' hole, and
 * the rim lies outside it, so it never narrows the hole a ball drops into. On
 * ground that slopes, given its `height` round the cup's middle, the rim
 * follows the ground and the lining runs down from it, as the physics' rim
 * does since v0.7.0; the floor stays at the cup's depth.
 */
export function cup(
  radius: number,
  { depth = CUP.depth, height }: { depth?: number; height?: (x: number, y: number) => number } = {},
): Model {
  const n = CUP.sides,
    r = radius,
    w = CUP.rim,
    h = CUP.rimHeight;
  const here = at(0, 0, 0);
  // the bead: half an ellipse from its outer edge on the grass, over its top and down to the lip, facing out of it
  const bead: Turned[] = [];
  for (let k = 0; k <= CUP.bead; k++) {
    const a = Math.PI * (1 - k / CUP.bead);
    const out = [-Math.cos(a) / (w / 2), Math.sin(a) / h];
    const l = Math.hypot(out[0], out[1]);
    bead.push([
      r + w / 2 - (w / 2) * Math.cos(a),
      k === 0 || k === CUP.bead ? 0 : h * Math.sin(a),
      out[0] / l,
      out[1] / l,
    ]);
  }
  return {
    name: 'cup',
    parts: [
      {
        name: 'liner',
        material: matte(PALETTE.hole, 0.8),
        // down the inside of the wall from the lip, and across the floor to the middle, a crease where they meet
        mesh: onGround(
          built((b) =>
            lathe(b, here, n, [
              [r, 0, -1, 0],
              [r, -depth, -1, 0],
              [r, -depth, 0, 1],
              [0, -depth, 0, 1],
            ]),
          ),
          height,
        ),
      },
      {
        name: 'rim',
        material: matte(PALETTE.gold, ROUGH.metal),
        mesh: onGround(
          built((b) => lathe(b, here, n, bead)),
          height,
        ),
      },
    ],
    moving: [],
  };
}

/**
 * The grass round a cup: a square `side` across with the cup's hole cut out
 * of its middle, for the game to lay where the grass would otherwise cover
 * the cup. Its hole is the lining's own polygon, so the two meet edge to
 * edge, and its edge is cut in `pieces` a side, the ground's own, so the
 * grass beside it meets it corner to corner and no crack opens between them
 * on a slope. The square must be wider than the hole; the rim is a raised
 * ring on the grass. Given the ground's `height`, it lies on it, and faces
 * as the ground does, so it is shaded as the grass round it is.
 */
export function collar(
  side: number,
  radius: number,
  { height, pieces = 3 }: { height?: (x: number, y: number) => number; pieces?: number } = {},
): Model {
  if (side / 2 <= radius) throw new Error(`a collar ${side} across cannot hold a cup of radius ${radius}`);
  const n = CUP.sides,
    half = side / 2;
  const turn = (p: V3) => {
    const a = Math.atan2(p[1], p[0]);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  const circle: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    circle.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  // the square's edge, a piece of the ground's at a time, all the way round, in order of the way it faces
  const square: V3[] = [];
  for (let k = 0; k < pieces; k++) {
    const s = -half + (side * k) / pieces;
    square.push([s, -half, 0], [half, s, 0], [-s, half, 0], [-half, -s, 0]);
  }
  square.sort((p, q) => turn(p) - turn(q));
  const mesh = built((b) => {
    // the two rings zipped together from the circle's first point and the square's first after it: each step on
    // whichever ring makes a triangle facing up, and of two that both do, the one across the shorter way, so no
    // triangle is a sliver folded over its neighbour where the square's points lag the circle's
    const m = square.length;
    const up = (p: V3, q: V3, s: V3) => (q[0] - p[0]) * (s[1] - p[1]) - (s[0] - p[0]) * (q[1] - p[1]) > 1e-12;
    const far = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      const [c, s, c1, s1] = [circle[i % n], square[j % m], circle[(i + 1) % n], square[(j + 1) % m]];
      const round = i < n && up(c, s, c1),
        along = j < m && up(c, s, s1);
      if (round && (!along || far(c1, s) <= far(c, s1))) {
        tri(b, c, s, c1);
        i++;
      } else {
        tri(b, c, s, s1);
        j++;
      }
    }
  });
  return {
    name: 'collar',
    parts: [{ name: 'collar', mesh: onGround(mesh, height), material: matte(PALETTE.grass, 0.85) }],
    moving: [],
  };
}

/**
 * The pin and its flag: a round pole, banded, from the bottom of the cup up
 * to `height` above the grass, a gold ball on its top, and a pennant of
 * `colour` flying from just under it toward +X in soft folds. The game turns
 * the whole of it about Z to set which way the flag flies.
 */
export function flag(colour: Colour, { height = 9, depth = CUP.depth, radius = 0.12 } = {}): Model {
  const knob = 0.28;
  const top = height - knob * 2 - 0.08;
  const [long, deep] = [3.4, 2.4];
  const sides = 10;
  const stands = height - knob;
  return {
    name: 'flag',
    parts: [
      {
        name: 'pole',
        material: matte(PALETTE.cream, ROUGH.plastic),
        // red bands up a white pole, about a hand and a half apart, from where it stands in the cup
        pattern: { kind: PATTERN.bands, scale: 0.64, seed: 0.1, second: PALETTE.plastic.red },
        // capped at both ends, its top inside the knob
        mesh: built((b) =>
          lathe(b, at(0, 0, 0), sides, [
            [0, -depth, 0, -1],
            [radius, -depth, 0, -1],
            [radius, -depth, 1, 0],
            [radius, stands, 1, 0],
            [radius, stands, 0, 1],
            [0, stands, 0, 1],
          ]),
        ),
      },
      {
        name: 'knob',
        material: matte(PALETTE.gold, ROUGH.metal),
        mesh: built((b) => lathe(b, at(0, 0, 0), sides, ballProfile(knob, 6, height - knob))),
      },
      { name: 'flag', material: matte(colour, 0.45), mesh: cloth(radius * 0.5, top, long, deep) },
    ],
    moving: [],
  };
}

/**
 * How the pennant folds: how far from flat its folds stand at the tip, how
 * many waves run along it, how thick the cloth is, and how many pieces it is
 * cut in along its length. The folds stand vertically, so a piece is a
 * straight strip top to bottom and the length is all that needs cutting.
 */
const CLOTH = { fold: 0.34, waves: 1.15, thick: 0.07, pieces: 10 } as const;

/**
 * The pennant: a triangle from the pole at `x0`, `deep` from its top at
 * `top` down, to its tip `long` out, a little below the middle of its edge,
 * folded softly along its length and held flat where it is sewn to the pole.
 * Two faces a cloth's thickness apart, and its hem round its edge, so it is a
 * closed solid lit on both sides.
 */
function cloth(x0: number, top: number, long: number, deep: number): Mesh {
  const { fold, waves, thick, pieces } = CLOTH;
  const tipZ = top - deep * 0.55;
  // how far the cloth stands off flat along its length, and how steeply, both nought at the pole
  const off = (u: number) => fold * u * Math.sin(Math.PI * 2 * waves * u);
  const lean = (u: number) =>
    (fold * (Math.sin(Math.PI * 2 * waves * u) + u * Math.PI * 2 * waves * Math.cos(Math.PI * 2 * waves * u))) / long;
  const b = new MeshBuilder();
  /** The point at `u` along and `v` up the cloth, on the face at `side`, -1 the near and 1 the far. */
  const point = (u: number, v: number, side: number): V3 => {
    const hi = top + (tipZ - top) * u,
      lo = top - deep + (tipZ - (top - deep)) * u;
    return [x0 + long * u, off(u) + (side * thick) / 2, lo + (hi - lo) * v];
  };
  const us = Array.from({ length: pieces + 1 }, (_, i) => i / pieces);
  // each face, its corners sharing the face's normal where the cloth turns, the tip a single point
  for (const side of [-1, 1]) {
    const column = us.map((u) => {
      const s = lean(u),
        l = Math.hypot(s, 1);
      const n: V3 = [(-side * s) / l, side / l, 0];
      return [0, 1].map((v) => {
        const p = point(u, v, side);
        return b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u, v);
      });
    });
    for (let i = 0; i < pieces; i++) {
      const [a, c] = column[i],
        [d, e] = column[i + 1];
      // the near face is wound to face -Y and the far +Y; the last piece comes to the tip, one triangle
      if (side < 0) {
        b.triangle(a, d, c);
        if (i < pieces - 1) b.triangle(c, d, e);
      } else {
        b.triangle(a, c, d);
        if (i < pieces - 1) b.triangle(c, e, d);
      }
    }
  }
  // the hem: along its top, its foot and the pole, across the cloth's thickness, shaded smooth along its length
  hem(
    b,
    us.map((u) => [point(u, 1, -1), point(u, 1, 1)]),
    [0, 0, 1],
  );
  hem(
    b,
    us.map((u) => [point(u, 0, -1), point(u, 0, 1)]),
    [0, 0, -1],
  );
  hem(
    b,
    [0, 1].map((v) => [point(0, v, -1), point(0, v, 1)]),
    [-1, 0, 0],
  );
  return b.build();
}

/**
 * A strip across a cloth's thickness along its edge: `pairs` the near and
 * far corner at each point along it, facing away from the cloth, toward
 * `out`, and shaded smooth from one point to the next.
 */
function hem(b: MeshBuilder, pairs: readonly (readonly [V3, V3])[], out: V3) {
  const ids = pairs.map(([near, far], k) => {
    const [p0, p1] = [pairs[Math.max(0, k - 1)][0], pairs[Math.min(pairs.length - 1, k + 1)][0]];
    const along: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const across: V3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    let n: V3 = [
      along[1] * across[2] - along[2] * across[1],
      along[2] * across[0] - along[0] * across[2],
      along[0] * across[1] - along[1] * across[0],
    ];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(n[0], n[1], n[2]);
    return [near, far].map((p) => b.vertex(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l, 0, 0));
  });
  for (let k = 0; k + 1 < pairs.length; k++) {
    const [a, c] = ids[k],
      [d, e] = ids[k + 1];
    // wound as the strip faces: toward `out`
    const [pa, pc, pd] = [pairs[k][0], pairs[k][1], pairs[k + 1][0]];
    const u = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]],
      v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (g[0] * out[0] + g[1] * out[1] + g[2] * out[2] > 0) {
      b.triangle(a, d, c);
      b.triangle(c, d, e);
    } else {
      b.triangle(a, c, d);
      b.triangle(c, e, d);
    }
  }
}

/**
 * The tee's two markers, `spacing` apart across X either side of it: chunky
 * rounded pucks of `radius`, as tall as they are wide at the foot is half,
 * their tops rounded over by half their radius, in glossy plastic.
 */
export function teeMarkers(spacing: number, { radius = 0.5, colour = PALETTE.plastic.blue } = {}): Model {
  const R = radius,
    q = radius / 2;
  const profile: Turned[] = [[R, 0, 1, 0]];
  for (let k = 0; k <= 3; k++) {
    const a = (k / 3) * (Math.PI / 2);
    profile.push([R - q + q * Math.cos(a), R - q + q * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }
  profile.push([0, R, 0, 1]);
  const mesh = built((b) => {
    for (const side of [-1, 1]) lathe(b, at((side * spacing) / 2, 0, 0), 16, profile);
  });
  return { name: 'tee markers', parts: [{ name: 'markers', mesh, material: matte(colour, 0.18) }], moving: [] };
}

/**
 * The ball, of `radius`, the physics' own: a sphere shaded round, fine
 * enough that its outline is round however near it is seen, in `colour`
 * with a `band` round its middle, which turns with it so its roll is seen.
 */
export function golfBall(
  radius: number,
  { colour = PALETTE.cream, band = PALETTE.plastic.red }: { colour?: Colour; band?: Colour } = {},
): Model {
  return {
    name: 'ball',
    parts: [
      {
        name: 'ball',
        mesh: built((b) => lathe(b, at(0, 0, 0), 32, ballProfile(radius, 16))),
        material: matte(colour, 0.25),
        // the bands pattern is a wave along the mesh's own Z, a quarter turn on so it peaks at nought, and at this
        // scale one band round the middle, positive only within a third of the radius of it
        pattern: { kind: PATTERN.bands, scale: 0.64 / radius, seed: 0.25, second: band },
      },
    ],
    moving: [],
  };
}

/** A mesh as built on level ground, or laid on the ground's `height` round the cup's middle where the ground slopes. */
function onGround(mesh: Mesh, height?: (x: number, y: number) => number): Mesh {
  return height ? lifted(mesh, height) : mesh;
}

/**
 * The arrow that shows which way a putting green leans: one flat arrow a unit long, lying on the grass with its tip at
 * +x and its tail at -x, a thin shaft and a head that is `headShare` of its length. The scene turns it to point downhill,
 * the way a ball is carried, and sizes it to how steep the ground is there; it is laid on the ground's own slope and so
 * has no thickness of its own to stand up off it. Without it a player sees a green's contour only from the way a putt
 * goes wrong. Flat-shaded, a face at a time, and nothing like a toy sign: a pencil's line, not a board.
 */
export function breakArrow({ headShare = 0.3, shaft = 0.06, head = 0.2, colour = PALETTE.breakArrow } = {}): Model {
  const neck = 0.5 - headShare;
  const mesh = built((b) => {
    // up, so the faces are wound counter-clockwise seen from above
    face(b, [-0.5, -shaft, 0], [neck, -shaft, 0], [neck, shaft, 0], [-0.5, shaft, 0]);
    tri(b, [neck, -head, 0], [0.5, 0, 0], [neck, head, 0]);
  });
  return { name: 'break arrow', parts: [{ name: 'arrow', mesh, material: matte(colour, ROUGH.paint) }], moving: [] };
}

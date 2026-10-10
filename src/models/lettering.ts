/**
 * The title's own lettering, built in 3D from the outlines `scripts/trace-title.mjs` read off the picture: each letter a
 * cream face with a rounded bevel standing proud of a tan underside, all of it on a dark green outline that is cut into
 * a piece for each letter, so that a letter can drop in with its own piece of the outline and the lot is the picture's
 * shape when they stand together. The ball sits in the O, the pole and its flag stand beside the f, and the sparkles
 * are thin shapes in the sky. Every piece is built about the place it turns on (its `pivot`), so the page can pose it
 * with one matrix and the title scene can squash a letter against the ground as it lands.
 *
 * Without this the title would be a picture again: the engine draws no text, and a letter of a font would not be the
 * picture's puffy hand-drawn ones. The colours are the picture's, shown through gains that undo the scene's own light,
 * since the renderer has no unlit material and a cream that is right in the picture is dim and grey once lit.
 */
import earcut from 'earcut';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { matte, type Model, type Part, type V3 } from './part';
import { shown } from './palette';

/** A shape from the trace: an outer loop and the loops of its counters, each a flat list of picture pixels `[x, y, x, y, ...]`, y down. */
export interface Shape {
  outer: number[];
  holes: number[][];
}
interface Body {
  /** Its box in the picture: left, top, right, bottom. */
  box: number[];
  face: Shape[];
  tan: Shape[];
  /** Its cream down its height in `BANDS` rows from the top, as the picture has it. */
  bands: number[][];
  tanRgb: number[];
}
/** What `scripts/trace-title.mjs` writes to `src/titletrace.json`. */
export interface TraceData {
  w: number;
  h: number;
  x0: number;
  y0: number;
  letters: (Body & { name: string })[];
  pole: Body & { knob: { x: number; y: number; r: number; rgb: number[] } };
  flag: {
    shapes: Shape[];
    bit: Shape[];
    bitRgb: number[];
    box: number[];
    fold: number[][];
    dark: number[];
    light: number[];
  };
  ball: { cx: number; cy: number; r: number; light: number[]; ramp: { from: number; rgb: number[] }[] };
  sparkles: { box: number[]; shapes: Shape[] }[];
  sparkRgb: number[];
  rim: {
    whole: Shape[];
    pieces: { name: string; slab: Shape[]; inner: Shape[] }[];
    rgb: number[];
    edgeRgb: number[];
    grow: number;
    edge: number;
  };
}

/** What kind of thing a piece is, which is what a pose may treat differently. */
export type PieceKind = 'face' | 'outline' | 'ball' | 'flag' | 'sparkle';
export interface TitlePiece {
  /** Unique: a letter's own name (`O`, `f`, `C`, `o`, `u`, `r`, `s`, `e`, `bar`, `dot`), `ball`, `pole`, `flag`, `spark0`..., and `rim-` and that for its outline. */
  name: string;
  kind: PieceKind;
  /** The thing it belongs to, which it drops in with: its own name for all but an outline, which has its owner's. */
  owner: string;
  /** Where in the order of the drop it comes, from nought; an outline has its owner's. */
  step: number;
  /** Where it stands in the title's own units from the title's middle, y up: the point to turn it about, and where to put it back. */
  pivot: [number, number];
  /** Its meshes, in a frame whose origin is the pivot. */
  parts: Part[];
}
export interface Title {
  pieces: TitlePiece[];
  /** The whole word's width and height, in the title's units. */
  width: number;
  height: number;
  /** The place in the picture, in pixels from the crop's corner, that is the title's middle. */
  centre: [number, number];
  /** How many steps of the drop there are. */
  steps: number;
}
export interface TitleOptions {
  /** How much a layer's depth scales it toward the screen's middle: see `LAYER_SCALE`. Nought leaves every area as the picture's. */
  depthScale?: number;
  /** The ball drawn as it is in the title: flattened and lit by its colours alone. Off it is a round dented ball with its own normals, which a test measures. */
  flattenBall?: boolean;
}

/** One picture pixel in the title's units, so that the word is about seven and a half units across. */
export const PIXEL = 0.01;

/**
 * Per-channel gain on the picture's colour in linear light, found by drawing the title in the game's scene and comparing it
 * with the picture, since the toon light is warm and its top band is not white: without it the cream reads as a dull grey
 * and the picture's brightness is lost. The faces stand square to the light and all take it alike.
 */
export const FACE_GAIN: readonly [number, number, number] = [1.6, 1.17, 1.22];
/**
 * The outline's gain. It takes a lift of ambient light from the sky and the grass that a face does not show, so it is
 * pulled down to the picture's dark green, and its red, which the sky's blue never feeds, to nothing.
 */
export const RIM_GAIN: readonly [number, number, number] = [0, 0.88, 0.4];
/**
 * The underside's gain: the picture's tan, which is a warm greyish cream, takes the face's gain and then a little more red and
 * a little less blue, since its wall faces the light at a slant and the scene's cool ambient light greys it, which the first
 * build showed as a tan darker and greyer than the picture's.
 */
export const TAN_GAIN: readonly [number, number, number] = [1.79, 1.14, 1.1];
/** The ball takes the faces' gain a little cooler in the warm channels: it is a different cream, and whiter than a face. */
export const BALL_GAIN: readonly [number, number, number] = [1, 0.97, 0.93];
/**
 * How much the ball's gain is cut on its darker tiers, by how far each is from white. The faces' gain is found where the colour
 * is nearly white, and the scene's tone map does not lift a grey as it lifts that: a shade the picture draws as (185, 189, 185)
 * came out as (207, 210, 206) through it, a ball shaded far too weakly at its lower left.
 */
export const BALL_SHADE_CUT = 0.85;
/** How much cooler the ball's darker tiers are drawn, in the same measure: the picture's shade is a neutral grey and the warm gain made it cream. */
export const BALL_SHADE_COOL = 0.12;

/** How much of the way to the screen's middle a layer a unit nearer the viewer is drawn, so that the front view of the layers lines up with the picture's. */
export const LAYER_SCALE = 0.17;
/** Where the screen's middle is below the title's, in its units: the layers shrink toward it. */
const SCREEN_Y = -0.1;
/** How far, in units, each outline piece's depth differs from the last, so overlapping pieces never fight for a pixel. */
const HAIR = 0.0005;
/** The depths of the layers, front to back: the face and its bevel, the tan beneath it, the outline's dark inside and its lighter slab under that. */
const Z = {
  outline: { front: -0.1, wall: 0.1, darkLift: 0.01 },
  tan: { z: -0.08, wall: 0.1 },
  face: { z: 0.02, wall: 0.07, bevel: 0.035 },
  flag: { z: 0, wall: 0.05, bevel: 0.02, bitZ: -0.04 },
  sparkle: { z: -0.02, wall: 0.04, bevel: 0.02 },
};
/** The ball, a little bigger than its disc in the picture so that it tucks under the O's inner edge, and flattened to a third of its depth. */
const BALL = {
  fit: 1.05,
  flatten: 0.3,
  detail: 4,
  dimpleDetail: 2,
  depth: 0.12,
  reach: 0.2,
  tiers: 24,
  soften: 1,
  keep: 5,
};
/** The place in the drop of each thing, from the left: the O and its ball, then the rest of the word, then the flag and the sparkles. */
const STEP: Record<string, number> = {
  O: 0,
  ball: 0,
  f: 1,
  C: 2,
  o: 3,
  u: 4,
  r: 5,
  s: 6,
  e: 7,
  bar: 8,
  dot: 9,
  pole: 10,
  flag: 11,
};

/** A colour of the picture, 0 to 255, as the scene shows it through a gain. */
export function shade(rgb: readonly number[], gain: readonly number[]): [number, number, number] {
  const lit = shown(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  return [0, 1, 2].map((i) => Math.min(4, lit[i] * gain[i])) as [number, number, number];
}
const paint = (rgb: readonly number[], gain: readonly number[]) => matte(shade(rgb, gain), 1);

type P2 = [number, number];
type Ring = P2[];
interface Solid {
  outer: Ring;
  holes: Ring[];
}

const signed = (l: Ring) => {
  let s = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i],
      b = l[(i + 1) % l.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
/** A traced shape in the title's units about a pivot in the picture, y up, its outer loop counter-clockwise and its counters clockwise. */
function solidOf(shape: Shape, pivot: P2): Solid {
  const ring = (flat: number[], ccw: boolean): Ring => {
    const r: Ring = [];
    for (let i = 0; i < flat.length; i += 2) r.push([(flat[i] - pivot[0]) * PIXEL, -(flat[i + 1] - pivot[1]) * PIXEL]);
    return signed(r) > 0 === ccw ? r : r.reverse();
  };
  return { outer: ring(shape.outer, true), holes: shape.holes.map((h) => ring(h, false)) };
}

/** The outward normal of each point of a ring, the mean of the two edges that meet at it. */
const normalsOf = (ring: Ring): P2[] =>
  ring.map((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length],
      b = ring[(i + 1) % ring.length];
    const n1: P2 = [p[1] - a[1], -(p[0] - a[0])],
      n2: P2 = [b[1] - p[1], -(b[0] - p[0])];
    const l1 = Math.hypot(...n1) || 1,
      l2 = Math.hypot(...n2) || 1;
    const x = n1[0] / l1 + n2[0] / l2,
      y = n1[1] / l1 + n2[1] / l2;
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  });

/**
 * Shapes stood up from depth `z` for `wall`, then rounded over by `bevel` into a flat top, smooth-shaded round the bevel and
 * plumb in the wall. A bevel of nought makes a slab with a flat front; a wall of nought makes only that front, for what is
 * never seen from the side. The back is never made: nothing sees it.
 */
function extrude(shapes: Solid[], z: number, wall: number, bevel: number, steps = 3): Mesh {
  const b = new MeshBuilder();
  for (const sh of shapes) {
    const rings = [sh.outer, ...sh.holes].map((r) => ({ r, n: normalsOf(r) }));
    // the profile in from the edge and up, with the normal at each step: the wall, then the quarter circle of the bevel
    const profile: [number, number, number, number][] = [];
    if (wall > 0) profile.push([0, z, 1, 0], [0, z + wall, 1, 0]);
    else profile.push([0, z, 1, 0]);
    for (let k = 1; k <= (bevel > 0 ? steps : 0); k++) {
      const a = ((k / steps) * Math.PI) / 2;
      profile.push([bevel * (1 - Math.cos(a)), z + wall + bevel * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    for (const { r, n } of rings) {
      const pts = profile.map(([t, h]) => r.map((p, i): V3 => [p[0] - n[i][0] * t, p[1] - n[i][1] * t, h]));
      const rows = profile.map(([, , nr, nz], k) =>
        r.map((_, i) => b.vertex(pts[k][i][0], pts[k][i][1], pts[k][i][2], n[i][0] * nr, n[i][1] * nr, nz, 0, 0)),
      );
      // A strip's triangle faces the way its normals say unless the ring, moved in along its normals, folds over itself at a sharp
      // inside corner: there it is a pixel or so of overlap, hidden by its neighbours, and drawn it would show as a dark speck.
      const strip = (k: number, [j0, k0]: [number, number], [j1, k1]: [number, number], [j2, k2]: [number, number]) => {
        const [p, q, o] = [pts[k + k0][j0], pts[k + k1][j1], pts[k + k2][j2]];
        const [u, v] = [
          [q[0] - p[0], q[1] - p[1], q[2] - p[2]],
          [o[0] - p[0], o[1] - p[1], o[2] - p[2]],
        ];
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const [[a0, a1, a2], [b0, b1, b2], [c0, c1, c2]] = [
          [j0, k0],
          [j1, k1],
          [j2, k2],
        ].map(([j, kk]) => [n[j][0] * profile[k + kk][2], n[j][1] * profile[k + kk][2], profile[k + kk][3]]);
        if (cross[0] * (a0 + b0 + c0) + cross[1] * (a1 + b1 + c1) + cross[2] * (a2 + b2 + c2) >= 0)
          b.triangle(rows[k + k0][j0], rows[k + k1][j1], rows[k + k2][j2]);
      };
      for (let k = 0; k + 1 < rows.length; k++)
        for (let j = 0; j < r.length; j++) {
          const j1 = (j + 1) % r.length;
          strip(k, [j, 0], [j1, 0], [j, 1]);
          strip(k, [j1, 0], [j1, 1], [j, 1]);
        }
    }
    // the flat top, inside the bevel, triangulated with its counters left open
    const top = profile[profile.length - 1];
    const coords: number[] = [],
      holeAt: number[] = [],
      ids: number[] = [];
    rings.forEach(({ r, n }, k) => {
      if (k > 0) holeAt.push(coords.length / 2);
      r.forEach((p, i) => {
        coords.push(p[0] - n[i][0] * top[0], p[1] - n[i][1] * top[0]);
        ids.push(b.vertex(coords[coords.length - 2], coords[coords.length - 1], top[1], 0, 0, 1, 0, 0));
      });
    });
    const tris = earcut(coords, holeAt, 2);
    for (let i = 0; i < tris.length; i += 3) {
      const [p, q, r] = [tris[i], tris[i + 1], tris[i + 2]];
      const turn =
        (coords[2 * q] - coords[2 * p]) * (coords[2 * r + 1] - coords[2 * p + 1]) -
        (coords[2 * q + 1] - coords[2 * p + 1]) * (coords[2 * r] - coords[2 * p]);
      if (turn > 0) b.triangle(ids[p], ids[q], ids[r]);
      else b.triangle(ids[p], ids[r], ids[q]);
    }
  }
  return b.build();
}

type Vertex = { p: number[]; n: number[] };
/**
 * A mesh cut into slices by a field over its points and normals: slice k holds what lies from `cuts[k - 1]` up to `cuts[k]`, the
 * first from nothing and the last to the end. A triangle across a cut is clipped crisply along it and its normals carried
 * across, so a smooth surface shows a step of colour at the cut and no facet; or, with `whole`, goes entire to the slice its
 * middle is in, which adds no triangles and leaves a cut that follows the mesh's own edges, as fine as the mesh is.
 */
function slices(
  mesh: Mesh,
  cuts: readonly number[],
  field: (p: number[], n: number[]) => number,
  whole = false,
): Mesh[] {
  const out = [...cuts, Infinity].map(() => new MeshBuilder());
  const edges = [-Infinity, ...cuts, Infinity];
  const which = (v: number) => {
    let k = 0;
    while (k < cuts.length && v >= cuts[k]) k++;
    return k;
  };
  const clip = (poly: Vertex[], keepAbove: boolean, at: number): Vertex[] => {
    const res: Vertex[] = [];
    const keep = (q: Vertex) => (keepAbove ? field(q.p, q.n) >= at : field(q.p, q.n) < at);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      if (keep(a)) res.push(a);
      if (keep(a) !== keep(b)) {
        const [fa, fb] = [field(a.p, a.n), field(b.p, b.n)];
        const t = (at - fa) / (fb - fa);
        res.push({ p: a.p.map((x, k) => x + (b.p[k] - x) * t), n: a.n.map((x, k) => x + (b.n[k] - x) * t) });
      }
    }
    return res;
  };
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const tri: Vertex[] = [0, 1, 2].map((k) => {
      const i = mesh.indices[t + k];
      return {
        p: [mesh.positions[3 * i], mesh.positions[3 * i + 1], mesh.positions[3 * i + 2]],
        n: [mesh.normals[3 * i], mesh.normals[3 * i + 1], mesh.normals[3 * i + 2]],
      };
    });
    const levels = tri.map((q) => which(field(q.p, q.n)));
    if (whole) {
      const middle = which(tri.reduce((sum, q) => sum + field(q.p, q.n), 0) / 3);
      const ids = tri.map((q) => out[middle].vertex(q.p[0], q.p[1], q.p[2], q.n[0], q.n[1], q.n[2], 0, 0));
      out[middle].triangle(ids[0], ids[1], ids[2]);
      continue;
    }
    for (let k = Math.min(...levels); k <= Math.max(...levels); k++) {
      let poly = tri;
      if (edges[k] > -Infinity) poly = clip(poly, true, edges[k]);
      if (poly.length >= 3 && edges[k + 1] < Infinity) poly = clip(poly, false, edges[k + 1]);
      if (poly.length < 3) continue;
      const ids = poly.map((q) => {
        const l = Math.hypot(...q.n) || 1;
        return out[k].vertex(q.p[0], q.p[1], q.p[2], q.n[0] / l, q.n[1] / l, q.n[2] / l, 0, 0);
      });
      for (let i = 1; i + 1 < ids.length; i++) out[k].triangle(ids[0], ids[i], ids[i + 1]);
    }
  }
  return out.map((b) => b.build());
}

// ---- the ball

/** The twenty triangles of an icosahedron cut into four again `detail` times, as points on the unit sphere and the faces between them. */
function icosphere(detail: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const unit = (a: number[]) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const v: number[][] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map(unit);
  let f: number[][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < detail; s++) {
    const next: number[][] = [];
    const mid = new Map<string, number>();
    const middle = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let at = mid.get(key);
      if (at === undefined) {
        v.push(unit([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        at = v.length - 1;
        mid.set(key, at);
      }
      return at;
    };
    for (const [a, b, c] of f) {
      const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = next;
  }
  return { v, f };
}

/**
 * The half of a golf ball that faces the viewer: a fine sphere smooth-shaded, dented at the points of a coarser one by soft pits,
 * each a cosine bowl, so the surface is round with no edge to a dimple and its light runs smoothly into and out of each pit.
 */
function ballMesh(radius: number, detail = BALL.detail, dimples = true): Mesh {
  const { v, f } = icosphere(detail);
  const centres = dimples ? icosphere(BALL.dimpleDetail).v : [];
  const pit = (u: number[]) => {
    let d = 0;
    for (const c of centres) {
      const angle = Math.acos(Math.min(1, u[0] * c[0] + u[1] * c[1] + u[2] * c[2]));
      if (angle < BALL.reach) d = Math.max(d, 0.5 * (1 + Math.cos((angle / BALL.reach) * Math.PI)));
    }
    return d;
  };
  const pos = v.map((u) => {
    const k = radius * (1 - BALL.depth * pit(u));
    return [u[0] * k, u[1] * k, u[2] * k];
  });
  const front = (face: number[]) => face.some((i) => v[i][2] >= -0.1);
  const shaded = v.map(() => [0, 0, 0]);
  for (const face of f) {
    if (!front(face)) continue;
    const [a, b, c] = face;
    const e1 = [0, 1, 2].map((k) => pos[b][k] - pos[a][k]),
      e2 = [0, 1, 2].map((k) => pos[c][k] - pos[a][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of face) for (let k = 0; k < 3; k++) shaded[i][k] += n[k];
  }
  // the normals are then eased toward their neighbours' a pass or two, so that a pit's light runs softly across it and does not step from one triangle to the next
  for (let pass = 0; pass < BALL.soften; pass++) {
    const next = shaded.map((n) => n.map((x) => (x / (Math.hypot(...n) || 1)) * BALL.keep));
    for (const face of f) {
      if (!front(face)) continue;
      for (const i of face)
        for (const j of face)
          if (i !== j) for (let k = 0; k < 3; k++) next[i][k] += shaded[j][k] / (Math.hypot(...shaded[j]) || 1) / 2;
    }
    shaded.forEach((n, i) => n.splice(0, 3, ...next[i]));
  }
  const b = new MeshBuilder();
  const ids = v.map((_, i) => {
    const l = Math.hypot(...shaded[i]) || 1;
    return b.vertex(pos[i][0], pos[i][1], pos[i][2], shaded[i][0] / l, shaded[i][1] / l, shaded[i][2] / l, 0, 0);
  });
  for (const face of f) if (front(face)) b.triangle(ids[face[0]], ids[face[1]], ids[face[2]]);
  return b.build();
}

/**
 * The ramp of the picture's ball cut into `BALL.tiers` steps, each a colour between the ramp's own, so that the step from one tier
 * to the next is a few levels and a pit's shading runs on and does not show the facets it is cut from.
 */
function tiersOf(ramp: TraceData['ball']['ramp']) {
  const n = BALL.tiers;
  const lo = ramp[0].from,
    step = ramp.length > 1 ? ramp[1].from - ramp[0].from : 1;
  const top = ramp[ramp.length - 1].from + step;
  return Array.from({ length: n }, (_, k) => {
    // each tier's own light, and the colour the ramp has there: between the middles of the two bins it falls between
    const from = lo + ((top - lo) * k) / n;
    const at = (from + (top - lo) / n / 2 - lo) / step - 0.5;
    const [a, b] = [
      Math.max(0, Math.min(ramp.length - 1, Math.floor(at))),
      Math.max(0, Math.min(ramp.length - 1, Math.floor(at) + 1)),
    ];
    const f = Math.max(0, Math.min(1, at - Math.floor(at)));
    return { from, rgb: ramp[a].rgb.map((x, c) => x + (ramp[b].rgb[c] - x) * f) };
  });
}

/** The ball in tiers of the picture's ramp of light, each tier one colour, with the normals turned to the viewer so that the scene's light adds nothing of its own. */
function ballParts(ball: TraceData['ball'], flatten: boolean): Part[] {
  const L = ball.light,
    ll = Math.hypot(L[0], L[1], L[2]);
  const lit = (_p: number[], n: number[]) => (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll;
  const mesh = ballMesh(ball.r * PIXEL * BALL.fit);
  const tiers = tiersOf(ball.ramp);
  return slices(
    mesh,
    tiers.slice(1).map((t) => t.from),
    lit,
    true,
  ).map((m, k) => {
    if (flatten) {
      for (let i = 0; i < m.normals.length; i += 3) [m.normals[i], m.normals[i + 1], m.normals[i + 2]] = [0, 0, 1];
      for (let i = 2; i < m.positions.length; i += 3) m.positions[i] *= BALL.flatten;
    }
    // darker tiers take less of the gain: see `BALL_SHADE_CUT`
    const white = shade(tiers[k].rgb, [1, 1, 1]);
    const lum = (white[0] + white[1] + white[2]) / 3;
    const dark = 1 - Math.min(1, lum);
    const cut = 1 - BALL_SHADE_CUT * dark;
    return {
      name: `ball${k}`,
      mesh: m,
      material: paint(
        tiers[k].rgb,
        [0, 1, 2].map((c) => FACE_GAIN[c] * BALL_GAIN[c] * cut * (c === 2 ? 1 + BALL_SHADE_COOL * dark : 1)),
      ),
    };
  });
}

// ---- the title

/** The whole title, built from the trace: see the header. */
export function titleLetters(data: TraceData, options: TitleOptions = {}): Title {
  const { depthScale = LAYER_SCALE, flattenBall = true } = options;
  const outer = data.rim.whole.flatMap((s) => s.outer);
  const xs = outer.filter((_, i) => i % 2 === 0),
    ys = outer.filter((_, i) => i % 2 === 1);
  const centre: P2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const toUnits = (x: number, y: number): P2 => [(x - centre[0]) * PIXEL, -(y - centre[1]) * PIXEL];
  const pieces: TitlePiece[] = [];
  const add = (piece: Omit<TitlePiece, 'pivot'> & { pivotAt: P2 }) => {
    const { pivotAt, ...rest } = piece;
    const place = toUnits(pivotAt[0], pivotAt[1]);
    // each layer is nearer the viewer by its depth and so drawn a little larger by the camera's perspective; scale it back so that the layers line up as the picture's do
    if (depthScale)
      for (const part of rest.parts) {
        const at = part.mesh.positions;
        for (let i = 0; i < at.length; i += 3) {
          const f = 1 - depthScale * at[i + 2];
          at[i] = (place[0] + at[i]) * f - place[0];
          at[i + 1] = (place[1] + at[i + 1] - SCREEN_Y) * f - place[1] + SCREEN_Y;
        }
      }
    pieces.push({ ...rest, pivot: place });
  };
  const pivots = new Map<string, P2>();
  const solids = (shapes: Shape[], pivot: P2) => shapes.map((s) => solidOf(s, pivot));

  /** A letter or the pole: a tan underside and a cream face in bands of the picture's colours, bottom band first. */
  const letter = (name: string, body: Body, extra: Part[] = []) => {
    const pivotAt: P2 = [(body.box[0] + body.box[2]) / 2, body.box[3]];
    pivots.set(name, pivotAt);
    const tan = extrude(solids(body.tan, pivotAt), Z.tan.z, Z.tan.wall, 0, 1);
    const face = extrude(solids(body.face, pivotAt), Z.face.z, Z.face.wall, Z.face.bevel, 2);
    const height = (body.box[3] - body.box[1]) * PIXEL;
    const n = body.bands.length;
    const cuts = Array.from({ length: n - 1 }, (_, k) => (k + 1) * (height / n));
    const parts: Part[] = [{ name: 'tan', mesh: tan, material: paint(body.tanRgb, TAN_GAIN) }];
    slices(face, cuts, (p) => p[1]).forEach((mesh, k) =>
      parts.push({ name: `face${k}`, mesh, material: paint(body.bands[n - 1 - k], FACE_GAIN) }),
    );
    add({ name, kind: 'face', owner: name, step: STEP[name], pivotAt, parts: [...parts, ...extra] });
  };
  for (const l of data.letters) letter(l.name, l);

  // the ball, in the O's counter
  {
    const pivotAt: P2 = [data.ball.cx, data.ball.cy];
    pivots.set('ball', pivotAt);
    add({
      name: 'ball',
      kind: 'ball',
      owner: 'ball',
      step: STEP.ball,
      pivotAt,
      parts: ballParts(data.ball, flattenBall),
    });
  }

  // the pole, with the knob that rounds its top
  {
    const k = data.pole.knob;
    const knob = ballMesh(k.r * PIXEL, 2, false);
    const pivotAt: P2 = [(data.pole.box[0] + data.pole.box[2]) / 2, data.pole.box[3]];
    const at = toUnits(k.x, k.y);
    const here = toUnits(pivotAt[0], pivotAt[1]);
    for (let i = 0; i < knob.positions.length; i += 3) {
      knob.positions[i] += at[0] - here[0];
      knob.positions[i + 1] += at[1] - here[1];
    }
    letter('pole', data.pole, [{ name: 'knob', mesh: knob, material: paint(k.rgb, FACE_GAIN) }]);
  }

  // the flag: the cloth cut along its fold into a dark red and a light, on its little tan piece
  {
    const f = data.flag;
    const pivotAt: P2 = [f.box[0], (f.box[1] + f.box[3]) / 2];
    pivots.set('flag', pivotAt);
    const cloth = extrude(solids(f.shapes, pivotAt), Z.flag.z, Z.flag.wall, Z.flag.bevel, 2);
    const [[ax, ay], [bx, by]] = f.fold;
    // the side of the fold a point of the title is on, by the picture's own arithmetic: positive is the light cloth
    const side = (p: number[]) =>
      (bx - ax) * (pivotAt[1] - p[1] / PIXEL - ay) - (by - ay) * (pivotAt[0] + p[0] / PIXEL - ax);
    const [dark, light] = slices(cloth, [0], side);
    add({
      name: 'flag',
      kind: 'flag',
      owner: 'flag',
      step: STEP.flag,
      pivotAt,
      parts: [
        {
          name: 'bit',
          mesh: extrude(solids(f.bit, pivotAt), Z.flag.bitZ, Z.flag.wall, 0, 1),
          material: paint(f.bitRgb, FACE_GAIN),
        },
        { name: 'cloth dark', mesh: dark, material: paint(f.dark, FACE_GAIN) },
        { name: 'cloth light', mesh: light, material: paint(f.light, FACE_GAIN) },
      ],
    });
  }

  // the sparkles
  data.sparkles.forEach((s, k) => {
    const pivotAt: P2 = [(s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2];
    const mesh = extrude(solids(s.shapes, pivotAt), Z.sparkle.z, Z.sparkle.wall, Z.sparkle.bevel, 2);
    add({
      name: `spark${k}`,
      kind: 'sparkle',
      owner: `spark${k}`,
      step: 12 + k,
      pivotAt,
      parts: [{ name: 'spark', mesh, material: paint(data.sparkRgb, FACE_GAIN) }],
    });
  });

  // the outline: a piece for each of them, a lighter slab the whole piece with a dark one a little in front that stops short of its edge
  data.rim.pieces.forEach((piece, k) => {
    const owner = pivots.get(piece.name);
    if (!owner) throw new Error(`the outline has a piece for ${piece.name}, which the title does not have`);
    const hair = k * HAIR;
    const edge = extrude(solids(piece.slab, owner), Z.outline.front - hair - Z.outline.wall, Z.outline.wall, 0, 1);
    const dark = extrude(solids(piece.inner, owner), Z.outline.front + Z.outline.darkLift - hair, 0, 0, 1);
    add({
      name: `rim-${piece.name}`,
      kind: 'outline',
      owner: piece.name,
      step: STEP[piece.name] ?? 0,
      pivotAt: owner,
      parts: [
        { name: 'edge', mesh: edge, material: paint(data.rim.edgeRgb, RIM_GAIN) },
        { name: 'dark', mesh: dark, material: paint(data.rim.rgb, RIM_GAIN) },
      ],
    });
  });

  return {
    pieces,
    width: (Math.max(...xs) - Math.min(...xs)) * PIXEL,
    height: (Math.max(...ys) - Math.min(...ys)) * PIXEL,
    centre,
    steps: Math.max(...pieces.map((p) => p.step)) + 1,
  };
}

/** The title as a model, every piece standing where it does at rest, which is what the showcase draws and the budget counts. */
export function titleModel(data: TraceData): Model {
  const title = titleLetters(data);
  const parts = title.pieces.flatMap((piece) =>
    piece.parts.map((part): Part => {
      const positions = Float32Array.from(part.mesh.positions);
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += piece.pivot[0];
        positions[i + 1] += piece.pivot[1];
      }
      return { ...part, mesh: { ...part.mesh, positions } };
    }),
  );
  return { name: 'title', parts, moving: [] };
}

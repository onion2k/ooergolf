/**
 * The scenery's baked light. A tree, a bush, a fern or a rock is cut into parts by how far each face looks toward a
 * fixed sun, a lit tier, a middle and a shade, and each part is the model's colour times its tier's factor, so the shade
 * side of a crown is a deep, cool green and the sunward side a bright lime, as the title picture's trees are, whatever
 * steps the renderer's toon bands make of the same faces. Without it the bands alone give a tree two or three greens
 * that are all the leaf's own, and the rocks read as grey lumps with no facets.
 *
 * A baked light is right only at one turn: the tiers are worked out in the model's own frame, so a model placed turned
 * would carry its bright side round with it. So a model is baked for each of `BUCKETS` turns, each lit as if it had been
 * turned there, and a piece is placed at the turn of its bucket and not at its own; the scene does that, and the piece's
 * own yaw (which is chosen by the hole's name and never moves) only says which bucket it falls in.
 */
import type { Mesh } from 'artshape-render/mesh/types';
import type { Model, Part, V3 } from './part';

/** One step of the light: the tier takes every face whose dot with the sun is at least `from` (the first that does, in order). */
export interface Tier {
  from: number;
  mul: readonly [number, number, number];
}
/** A part's tiers, brightest first, the last taking whatever is left. */
export type Tiers = readonly Tier[];
/** What a model does to one of its parts: its tiers, or none if the part is left as it is (a trunk). */
export type PartRule = (part: Part) => Tiers | null;

/**
 * How many turns a model is baked for, each a sixth of a turn from the last. A piece is turned at most half a bucket,
 * thirty degrees, from the yaw it was given, which is as far as a hand-placed clump of trees reads as turned alike: the
 * pieces already differ by size and by the lumps of their seeds. The baked light is exactly right at a bucket's own yaw.
 */
export const BUCKETS = 6;

/** The turn a bucket's models are placed at. */
export const bucketYaw = (k: number, n: number = BUCKETS) => (k / n) * Math.PI * 2;

/** The bucket nearest a yaw, whatever the yaw: a negative turn or more than a whole one included. */
export function bucketOf(yaw: number, n: number = BUCKETS): number {
  const turns = yaw / (Math.PI * 2);
  return ((Math.round(turns * n) % n) + n) % n;
}

/**
 * The light the scenery is baked to, toward the sun in the world: from the right and a little toward the viewer, high,
 * as the title's trees are lit. Not `SUN`, which the renderer lights and shadows by: the sun there is lower and from behind,
 * so the shadows run down and to the left, and a tree whose bright side faced it would be bright on the side the camera
 * seldom sees. The two were chosen together from the mock's pictures, and the tiers are right for these.
 */
export const TONE_SUN: V3 = [0.78, -0.25, 0.58];

/** The sun as a model turned `yaw` about Z sees it: the placement's turn undone, so that placed at `yaw` it is lit from the sun. */
export function turnedSun(sun: readonly [number, number, number], yaw: number): V3 {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [sun[0] * c + sun[1] * s, -sun[0] * s + sun[1] * c, sun[2]];
}

const tiers = (lit: V3, mid: V3, shade: V3): Tiers => [
  { from: 0.4, mul: lit },
  { from: -0.05, mul: mid },
  { from: -9, mul: shade },
];

/**
 * The tiers the scenery wears, chosen from five rounds of pictures: a leaf's lit side a warm bright lime, its shade a deep
 * saturated green (about a quarter, two fifths and three fifths of the leaf); a crown, which is lighter already, less so;
 * a pine deep and a little warm, its lit facet about the lawn's mid green and its shade near black; a fern's blades brighter
 * than the pine's; and a rock in four tiers, so its facets read, on a warm grey.
 */
export const TONES = {
  leaf: tiers([2.0, 1.3, 1.6], [1.1, 0.95, 1.1], [0.26, 0.42, 0.6]),
  crown: tiers([1.15, 1.2, 1.6], [0.85, 0.9, 1.0], [0.2, 0.34, 0.5]),
  pine: tiers([6.7, 1.9, 0.75], [2.7, 0.95, 0.5], [0.55, 0.3, 0.37]),
  fern: tiers([4.6, 2.1, 1.75], [3.0, 1.4, 1.2], [1.6, 0.8, 0.8]),
  rock: [
    { from: 0.5, mul: [1.15, 1.12, 1.08] },
    { from: 0.25, mul: [0.92, 0.88, 0.86] },
    { from: -0.15, mul: [0.62, 0.58, 0.62] },
    { from: -9, mul: [0.36, 0.33, 0.42] },
  ],
} as const satisfies Record<string, Tiers>;

/**
 * Which tiers each part of the scenery's models wears, by the model's name and the part's: leaves of a tree, bush and far
 * broadleaf the leaf's, a crown its own, a pine's needles (a conifer's, the golf tree's and the far one's) the pine's, a
 * fern its own, a rock its four. A part not named, a trunk, is left as it is.
 */
export function sceneryRule(model: Model): PartRule {
  const pine = new Set(['conifer', 'golf tree', 'far conifer']);
  return (part) => {
    if (part.name === 'crown') return TONES.crown;
    if (part.name === 'leaves') return pine.has(model.name) ? TONES.pine : TONES.leaf;
    if (part.name === 'bush') return TONES.leaf;
    if (part.name === 'fern') return TONES.fern;
    if (part.name === 'rock') return TONES.rock;
    return null;
  };
}

/** The faces `keep` of `mesh`, as a mesh of their own: each face has three vertices of its own, so none is shared. */
function sliced(mesh: Mesh, keep: number[]): Mesh {
  const map = new Map<number, number>();
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (const tri of keep)
    for (let c = 0; c < 3; c++) {
      const v = mesh.indices[tri * 3 + c];
      let n = map.get(v);
      if (n === undefined) {
        n = pos.length / 3;
        map.set(v, n);
        pos.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
        nor.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
        uv.push(mesh.uvs[v * 2] ?? 0, mesh.uvs[v * 2 + 1] ?? 0);
      }
      idx.push(n);
    }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
  };
}

/** A part split into one part a tier that has a face, each in the part's colour times the tier's factor. */
function split(part: Part, sun: readonly [number, number, number], tone: Tiers): Part[] {
  const { mesh } = part;
  const p = mesh.positions,
    n = mesh.normals;
  const kept: number[][] = tone.map(() => []);
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const [a, b, c] = [mesh.indices[t * 3] * 3, mesh.indices[t * 3 + 1] * 3, mesh.indices[t * 3 + 2] * 3];
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2],
      vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    // the mesh's own normal says which way the face looks, whichever way it is wound
    const s =
      nx * (n[a] + n[b] + n[c]) + ny * (n[a + 1] + n[b + 1] + n[c + 1]) + nz * (n[a + 2] + n[b + 2] + n[c + 2]) < 0
        ? -1
        : 1;
    nx = (s * nx) / l;
    ny = (s * ny) / l;
    nz = (s * nz) / l;
    const dot = nx * sun[0] + ny * sun[1] + nz * sun[2];
    const k = tone.findIndex((tier) => dot >= tier.from);
    kept[k < 0 ? tone.length - 1 : k].push(t);
  }
  const [r, g, bl, rough] = part.material;
  const out: Part[] = [];
  kept.forEach((keep, k) => {
    if (!keep.length) return;
    const m = tone[k].mul;
    out.push({
      ...part,
      name: `${part.name} ${k}`,
      mesh: sliced(mesh, keep),
      material: [Math.min(1, r * m[0]), Math.min(1, g * m[1]), Math.min(1, bl * m[2]), rough],
    });
  });
  return out;
}

/**
 * `model` with each of its still parts that `rule` gives tiers split into those tiers by how far its faces look toward
 * `sun`, which is in the model's own frame. A part with no tiers is as it was, and the triangles of the whole are the same
 * as before: faces are sorted and never made or lost.
 */
export function toned(model: Model, sun: readonly [number, number, number], rule: PartRule): Model {
  return {
    ...model,
    parts: model.parts.flatMap((part) => {
      const tiers = rule(part);
      return tiers ? split(part, sun, tiers) : [part];
    }),
  };
}

/**
 * One toned model for each bucket of yaw: the one at `k` is lit so that, placed turned `bucketYaw(k)`, its bright side
 * faces `sun` in the world. `make` is called once for each, so no mesh is shared between buckets.
 */
export function bucketed(
  make: () => Model,
  sun: readonly [number, number, number],
  rule: (model: Model) => PartRule,
  n: number = BUCKETS,
): Model[] {
  return Array.from({ length: n }, (_, k) => {
    const model = make();
    return toned(model, turnedSun(sun, bucketYaw(k, n)), rule(model));
  });
}

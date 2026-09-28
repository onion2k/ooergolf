/**
 * The smooth solids the round things are made of: a ball, a shape turned on
 * a lathe, a box rounded at every edge and corner, and a tube along a line.
 * Each shares a vertex between the triangles round it, and gives that vertex
 * the surface's own normal there, so toon light falls across a canopy or a
 * pebble in clean curved bands and not facet by facet. `shapes.ts` has the
 * flat-shaded solids, whose faces share nothing, for what is cut and not
 * moulded. Without these, every round thing would be a faceted lump and read
 * as a prototype's.
 *
 * A solid is smooth all over: two made to meet leave a crease where they
 * do, which is how a canopy's puffs are told apart.
 */
import type { MeshBuilder } from 'artshape-render/mesh/types';
import type { V3 } from './part';
import type { Place } from './shapes';

type Tri = [number, number, number];

/**
 * Points and the triangles between them written into a builder, each point
 * once, with the normals given or else each point's as the faces round it
 * face.
 */
function emit(b: MeshBuilder, points: V3[], tris: Tri[], normals?: V3[]) {
  const n = normals ?? smoothNormals(points, tris);
  const base = b.vertexCount;
  for (let i = 0; i < points.length; i++) {
    const [x, y, z] = points[i];
    b.vertex(x, y, z, n[i][0], n[i][1], n[i][2], 0, 0);
  }
  for (const [p, q, r] of tris) b.triangle(base + p, base + q, base + r);
}

/**
 * Each point's normal: the faces' round it, each counted by the angle it
 * makes there. By area, a quad cut into two triangles counts twice at the
 * corners its cut runs from and once at the others, and the open end of a
 * tube or a trunk came out twisted.
 */
function smoothNormals(points: V3[], tris: Tri[]): V3[] {
  const n: V3[] = points.map(() => [0, 0, 0]);
  for (const t of tris) {
    const [a, b, c] = t.map((i) => points[i]);
    const face = unit(cross(sub(b, a), sub(c, a)));
    for (let k = 0; k < 3; k++) {
      const here = points[t[k]];
      const angle = Math.acos(
        Math.max(
          -1,
          Math.min(1, dot(unit(sub(points[t[(k + 1) % 3]], here)), unit(sub(points[t[(k + 2) % 3]], here)))),
        ),
      );
      for (let d = 0; d < 3; d++) n[t[k]][d] += face[d] * angle;
    }
  }
  return n.map(unit);
}

/**
 * A ball of `rings` from pole to pole and `segments` round, its axes
 * stretched to `rx`, `ry` and `rz` about its middle. `push`, if given, says
 * how far out each point is against the ball's own radius there, from the
 * way it points: a pebble is a ball pushed gently in and out.
 */
export function ball(
  b: MeshBuilder,
  place: Place,
  [rx, ry, rz]: V3,
  rings: number,
  segments: number,
  push: (x: number, y: number, z: number) => number = () => 1,
) {
  const point = (phi: number, th: number): V3 => {
    const x = Math.sin(phi) * Math.cos(th),
      y = Math.sin(phi) * Math.sin(th),
      z = Math.cos(phi);
    const k = push(x, y, z);
    return place([x * rx * k, y * ry * k, z * rz * k]);
  };
  // the top pole, a ring at a time down to the bottom pole
  const points: V3[] = [point(0, 0)];
  for (let i = 1; i < rings; i++)
    for (let j = 0; j < segments; j++) points.push(point((i / rings) * Math.PI, (j / segments) * Math.PI * 2));
  points.push(point(Math.PI, 0));
  const bottom = points.length - 1;
  const at = (i: number, j: number) => 1 + (i - 1) * segments + (j % segments);
  const tris: Tri[] = [];
  for (let j = 0; j < segments; j++) {
    tris.push([0, at(1, j), at(1, j + 1)]);
    for (let i = 1; i < rings - 1; i++)
      tris.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    tris.push([bottom, at(rings - 1, j + 1), at(rings - 1, j)]);
  }
  emit(b, points, tris);
}

/**
 * A shape turned about Z: `profile` is its outline as (radius, height) from
 * the bottom up, along its outside, and it is turned `segments` times round.
 * A point on the axis is a pole, and closes the shape there; an end off the
 * axis is left open, for a trunk that stands on the ground or goes up inside
 * a canopy.
 */
export function lathe(b: MeshBuilder, place: Place, profile: readonly [number, number][], segments: number, phase = 0) {
  const points: V3[] = [];
  const ring: number[] = [];
  for (const [r, z] of profile) {
    ring.push(points.length);
    if (r <= 1e-9) points.push(place([0, 0, z]));
    else
      for (let j = 0; j < segments; j++) {
        const a = phase + (j / segments) * Math.PI * 2;
        points.push(place([Math.cos(a) * r, Math.sin(a) * r, z]));
      }
  }
  const pole = (i: number) => profile[i][0] <= 1e-9;
  const at = (i: number, j: number) => ring[i] + (pole(i) ? 0 : j % segments);
  const tris: Tri[] = [];
  for (let i = 0; i < profile.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      // up the outside, each quad wound to face out; a pole's half of it has no area, and is left out
      if (!pole(i)) tris.push([at(i, j), at(i, j + 1), at(i + 1, j + 1)]);
      if (!pole(i + 1)) tris.push([at(i, j), at(i + 1, j + 1), at(i + 1, j)]);
    }
  emit(b, points, tris);
}

/** Points along a circle of radius `r` about (cr, cz), from angle `a0` to `a1`, `steps` of them after the first: a profile's rounding. */
export function arc(cr: number, cz: number, r: number, a0: number, a1: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push([cr + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/**
 * A box of half extents `hx`, `hy` and `hz` about its middle, every edge
 * rounded to radius `r` and every corner to a ball's eighth, in `steps` a
 * quarter turn of the rounding. Never bigger than its box, flat on each face
 * between the roundings, and made as a cube is, a face at a time: the points
 * where two faces meet are the same points with the same normals, so it has
 * no crease.
 */
export function roundedBlock(b: MeshBuilder, place: Place, hx: number, hy: number, hz: number, r: number, steps = 4) {
  const h = [hx, hy, hz];
  const rr = Math.min(r, hx, hy, hz);
  // along each axis, where a face's points are on the box before it is rounded: across each rounding in even turns
  const half = Math.max(1, Math.round(steps / 2));
  const samples = h.map((e) => {
    const flat = e - rr;
    const out: number[] = [];
    for (let k = half; k >= 1; k--) out.push(-flat - rr * Math.tan((Math.PI / 4) * (k / half)));
    out.push(-flat);
    if (flat > 1e-9) out.push(flat);
    for (let k = 1; k <= half; k++) out.push(flat + rr * Math.tan((Math.PI / 4) * (k / half)));
    return out;
  });
  for (let axis = 0; axis < 3; axis++)
    for (const s of [-1, 1]) {
      const [u, w] = [(axis + 1) % 3, (axis + 2) % 3];
      const su = samples[u],
        sw = samples[w];
      const points: V3[] = [],
        normals: V3[] = [];
      for (const qu of su)
        for (const qw of sw) {
          const q = [0, 0, 0];
          q[axis] = s * h[axis];
          q[u] = qu;
          q[w] = qw;
          // the nearest point of the box shrunk by the rounding, and out from it by the rounding the way it points
          const inner = q.map((c, a) => Math.max(-(h[a] - rr), Math.min(h[a] - rr, c)));
          const d = q.map((c, a) => c - inner[a]);
          const l = Math.hypot(d[0], d[1], d[2]);
          const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
          const p = place([inner[0] + n[0] * rr, inner[1] + n[1] * rr, inner[2] + n[2] * rr]);
          points.push(p);
          const tip = place([inner[0] + n[0], inner[1] + n[1], inner[2] + n[2]]);
          const base = place(inner as V3);
          normals.push(unit(sub(tip, base)));
        }
      const at = (k: number, l: number) => k * sw.length + l;
      const tris: Tri[] = [];
      for (let k = 0; k < su.length - 1; k++)
        for (let l = 0; l < sw.length - 1; l++) {
          const quad = [at(k, l), at(k + 1, l), at(k + 1, l + 1), at(k, l + 1)];
          // turning from u to w faces along the axis; on the far side, the other way round
          const [p, q, m, o] = s > 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
          tris.push([p, q, m], [p, m, o]);
        }
      emit(b, points, tris, normals);
    }
}

/**
 * A tube of radius `r` and `sides` round through `line`, turning smoothly at
 * each point of it: for a string that sags, or a stem or a rail. Open at its
 * ends, which butt into a post or are too thin to see.
 */
export function tube(b: MeshBuilder, line: readonly V3[], r: number, sides: number) {
  const points: V3[] = [];
  for (let i = 0; i < line.length; i++) {
    // along the line here: from the point before to the point after, so a ring is square to the bend
    const t = unit(sub(line[Math.min(line.length - 1, i + 1)], line[Math.max(0, i - 1)]));
    let u = cross(t, [0, 0, 1]);
    if (Math.hypot(...u) < 1e-6) u = [1, 0, 0];
    u = unit(u);
    const v = cross(u, t);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a) * r,
        s = Math.sin(a) * r;
      points.push([
        line[i][0] + u[0] * c + v[0] * s,
        line[i][1] + u[1] * c + v[1] * s,
        line[i][2] + u[2] * c + v[2] * s,
      ]);
    }
  }
  const at = (i: number, k: number) => i * sides + (k % sides);
  const tris: Tri[] = [];
  for (let i = 0; i < line.length - 1; i++)
    for (let k = 0; k < sides; k++)
      tris.push([at(i, k), at(i + 1, k), at(i + 1, k + 1)], [at(i, k), at(i + 1, k + 1), at(i, k + 1)]);
  emit(b, points, tris);
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

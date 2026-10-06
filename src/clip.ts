/**
 * Flat polygons, for cutting a hole in ground that is drawn a piece at a time: what is left of a convex piece of ground
 * when a convex hole is cut out of it. A ring is the corners of a polygon in order, counter-clockwise, and every ring here
 * is convex; a point is `[x, y]`. Arithmetic and nothing else, so the ground and the models cut with the one rule, and
 * the edge of the cut is the same polygon to either of them.
 */

export type Point = readonly [x: number, y: number];
export type Ring = readonly Point[];

/** How much area is none: a piece the cut leaves thinner than this is a line, and is not drawn. */
const TINY = 1e-12;
/** How far from a line a point may be and be on it. */
const ON = 1e-9;
/** How near two corners are one: a corner of the hole that falls on the edge of a piece is made twice by the cut, a hair apart. */
const JOIN = 1e-12;

/** Which side of the line from `a` to `b` the point `p` is on: positive to its left, nought on it. */
const side = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** The area of a ring, positive for one that runs counter-clockwise. */
export function area(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum / 2;
}

/** `ring` cut by the line from `a` to `b`: what lies on its left, or on its right. A convex ring cut is a convex ring, and may be nothing. */
export function cut(ring: Ring, a: Point, b: Point, keep: 'left' | 'right'): Point[] {
  const sign = keep === 'left' ? 1 : -1;
  const out: Point[] = [];
  const same = (p: Point, q: Point) => Math.abs(p[0] - q[0]) <= JOIN && Math.abs(p[1] - q[1]) <= JOIN;
  const add = (p: Point) => {
    if (out.length === 0 || !same(out[out.length - 1], p)) out.push(p);
  };
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    const sp = sign * side(a, b, p),
      sq = sign * side(a, b, q);
    if (sp >= 0) add(p);
    // the edge crosses the line, one end well over and the other well under it
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      add([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  if (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** Whether `a` lies wholly on the outer side of one of its own edges' lines from `b`: a line between them. */
const apart = (a: Ring, b: Ring) => a.some((p, i) => b.every((r) => side(p, a[(i + 1) % a.length], r) <= ON));

/** Whether two convex rings have ground in common: more than a corner or an edge. */
export function overlaps(a: Ring, b: Ring): boolean {
  return !apart(a, b) && !apart(b, a);
}

/**
 * The pieces of convex `ring` that lie outside convex `hole`: convex rings, no two of them over the same ground, and
 * together all of `ring` the hole leaves. A ring the hole does not reach is its own one piece, uncut, and one the hole
 * covers is none. Each piece is what lies outside one edge of the hole and inside the edges before it, so every corner a
 * piece has is a corner of `ring`, a corner of `hole`, or where an edge of the hole's line meets another line.
 */
export function outside(ring: Ring, hole: Ring): Point[][] {
  if (!overlaps(ring, hole)) return [ring.slice()];
  const pieces: Point[][] = [];
  let within: Point[] = ring.slice();
  for (let k = 0; k < hole.length && within.length >= 3; k++) {
    const a = hole[k],
      b = hole[(k + 1) % hole.length];
    const beyond = cut(within, a, b, 'right');
    if (area(beyond) > TINY) pieces.push(beyond);
    within = cut(within, a, b, 'left');
  }
  return pieces;
}

/** A convex ring as triangles from its first corner: the indices of three corners each, counter-clockwise, none of no area. */
export function fan(ring: Ring): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 1; i + 1 < ring.length; i++) if (area([ring[0], ring[i], ring[i + 1]]) > TINY) out.push([0, i, i + 1]);
  return out;
}

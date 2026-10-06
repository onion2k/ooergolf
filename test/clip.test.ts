/**
 * Cutting a hole in ground: what is left of a convex piece when a convex hole is taken out of it. Held to exact figures
 * (areas, which the pieces must add up to), and to every point of a grid of ground being in the pieces once or in the hole.
 */
import { describe, expect, it } from 'vitest';
import { area, cut, fan, outside, overlaps, type Point, type Ring } from '../src/clip';
import { seeded } from '../src/random';

/** The unit square from `(x, y)` side `s` across, counter-clockwise. */
const square = (x: number, y: number, s = 1): Ring => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

/** A rectangle from its south-west corner to its north-east, counter-clockwise. */
const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A polygon of `n` sides on a circle of `radius`, counter-clockwise from the east: the shape of a cup's mouth. */
const ring = (radius: number, n = 24): Point[] =>
  Array.from({ length: n }, (_, i): Point => [
    Math.cos((i / n) * Math.PI * 2) * radius,
    Math.sin((i / n) * Math.PI * 2) * radius,
  ]);

/** Whether a point is in a convex ring, counter-clockwise: on the left of every edge. */
function within(r: Ring, [x, y]: Point): boolean {
  return r.every((p, i) => {
    const q = r[(i + 1) % r.length];
    return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) > 0;
  });
}

describe('the area of a ring', () => {
  it('is its size when it runs counter-clockwise, and minus it when it does not', () => {
    expect(area(square(0, 0))).toBe(1);
    expect(area(square(3, -2, 2))).toBe(4);
    expect(area([...square(0, 0)].reverse())).toBe(-1);
    expect(area(ring(1.9))).toBeCloseTo((24 / 2) * 1.9 * 1.9 * Math.sin((Math.PI * 2) / 24), 12);
  });
});

describe('a ring cut by a line', () => {
  const a: Point = [0.25, -1],
    b: Point = [0.25, 2];
  it('keeps what is on its left, or on its right, and the two make the whole', () => {
    const left = cut(square(0, 0), a, b, 'left'),
      right = cut(square(0, 0), a, b, 'right');
    // the line runs north, so the west of it is the left
    expect(area(left)).toBeCloseTo(0.25, 12);
    expect(area(right)).toBeCloseTo(0.75, 12);
    expect(Math.min(...left.map((p) => p[0]))).toBe(0);
    expect(Math.max(...left.map((p) => p[0]))).toBeCloseTo(0.25, 12);
    expect(Math.min(...right.map((p) => p[0]))).toBeCloseTo(0.25, 12);
  });

  it('keeps the whole of a ring wholly on one side, and none of one wholly on the other', () => {
    expect(cut(square(1, 0), a, b, 'left')).toEqual([]);
    expect(cut(square(1, 0), a, b, 'right')).toEqual(square(1, 0));
    expect(cut(square(-1, 0), a, b, 'left')).toEqual(square(-1, 0));
  });

  it('puts no corner twice when a corner is on the line', () => {
    const through = cut(square(0, 0), [0, 0], [1, 1], 'left');
    // the diagonal: a triangle, its three corners each once
    expect(through).toHaveLength(3);
    expect(area(through)).toBeCloseTo(0.5, 12);
  });
});

describe('two rings that overlap', () => {
  it('are two that have ground in common, and not two that touch along an edge or at a corner', () => {
    expect(overlaps(square(0, 0), square(0.5, 0.5))).toBe(true);
    expect(overlaps(square(0, 0), square(1, 0))).toBe(false);
    expect(overlaps(square(0, 0), square(1, 1))).toBe(false);
    expect(overlaps(square(0, 0), square(3, 0))).toBe(false);
    // one inside the other, and a cross of two long ones whose corners are in neither
    expect(overlaps(square(0, 0, 4), square(1, 1))).toBe(true);
    expect(overlaps(square(1, 1), square(0, 0, 4))).toBe(true);
    expect(overlaps(rect(-3, -0.5, 3, 0.5), rect(-0.5, -3, 0.5, 3))).toBe(true);
  });
});

describe('the pieces of a ring outside a hole', () => {
  const mouth = ring(1.9);

  it('are the ring itself, uncut, where the hole is nowhere near it', () => {
    const cell = square(5, 5);
    expect(outside(cell, mouth)).toEqual([cell]);
    // and where it only touches: the cell [1.9, 2.9] by [0, 1] begins at the mouth's own corner
    const touching = square(1.9, -0.5);
    expect(outside(touching, mouth)).toHaveLength(1);
    expect(outside(touching, mouth)[0]).toEqual(touching);
  });

  it('are none where the hole covers the ring', () => {
    expect(outside(square(-0.5, -0.5), mouth)).toEqual([]);
    expect(outside(square(-1, -1, 2), mouth)).toEqual([]);
    expect(outside(square(-2, -2, 4), mouth)).not.toEqual([]);
    expect(outside(square(-1.2, -1.2, 2.4), ring(5))).toEqual([]);
  });

  it('add up, over a grid of ground, to the grid less the hole, to the last digits', () => {
    // 7 by 7 cells of a yard, the hole in the middle of the middle one, nowhere near the edge
    let total = 0;
    for (let j = -4; j < 3; j++)
      for (let i = -4; i < 3; i++) for (const piece of outside(square(i + 0.5, j + 0.5), mouth)) total += area(piece);
    expect(total).toBeCloseTo(49 - area(mouth), 9);
  });

  it('add up the same for a hole of any size, and where the cell is cut at a slant', () => {
    for (const radius of [0.3, 1.45, 1.5, 1.9, 2.4, 3.2]) {
      const hole = ring(radius);
      let total = 0;
      for (let j = -5; j < 5; j++)
        for (let i = -5; i < 5; i++) for (const p of outside(square(i, j), hole)) total += area(p);
      expect(total, `radius ${radius}`).toBeCloseTo(100 - area(hole), 9);
    }
    // a hole that is not a circle, a long thin one at a slant: still convex, still cut out
    const slant: Ring = [
      [-2.5, -1.2],
      [2.1, -0.4],
      [2.5, 0.3],
      [-2.0, 1.1],
    ];
    let total = 0;
    for (let j = -4; j < 4; j++)
      for (let i = -4; i < 4; i++) for (const p of outside(square(i, j), slant)) total += area(p);
    expect(total).toBeCloseTo(64 - area(slant), 9);
  });

  it('are convex, counter-clockwise, none of them is nothing, and none makes a corner twice', () => {
    // the cells include ones whose edge the mouth's own corner at the south falls on, which the cut would make twice
    for (let j = -3; j < 3; j++)
      for (let i = -3; i < 3; i++)
        for (const piece of outside(square(i, j), mouth)) {
          expect(area(piece)).toBeGreaterThan(1e-12);
          for (let k = 0; k < piece.length; k++) {
            const [p, q, r] = [piece[k], piece[(k + 1) % piece.length], piece[(k + 2) % piece.length]];
            expect(Math.hypot(q[0] - p[0], q[1] - p[1]), `a corner twice in ${JSON.stringify(piece)}`).toBeGreaterThan(
              1e-12,
            );
            expect((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])).toBeGreaterThanOrEqual(-1e-9);
          }
        }
  });

  it('cover every point outside the hole once, and none inside it', () => {
    const random = seeded(7);
    const cells = [];
    for (let j = -3; j < 3; j++) for (let i = -3; i < 3; i++) cells.push(outside(square(i, j), mouth));
    for (let n = 0; n < 4000; n++) {
      const p: Point = [random() * 6 - 3, random() * 6 - 3];
      const inHole = within(mouth, p);
      const covered = cells.flat().filter((piece) => within(piece, p)).length;
      expect(covered, `at ${p[0].toFixed(3)},${p[1].toFixed(3)}`).toBe(inHole ? 0 : 1);
    }
  });

  it('have every corner of the hole that lies in the cell for a corner, so the edge of the cut is the hole’s own', () => {
    // a cell the mouth cuts at the corner: the square from half a yard to a yard and a half, whose far corner is 2.12 out and the mouth 1.9
    const pieces = outside(square(0.5, 0.5), mouth);
    expect(pieces.length).toBeGreaterThan(0);
    const corners = mouth.filter(([x, y]) => x > 0.5 && x < 1.5 && y > 0.5 && y < 1.5);
    expect(corners.length).toBeGreaterThan(0);
    for (const c of corners)
      expect(pieces.some((piece) => piece.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-12))).toBe(true);
  });
});

describe('a ring as triangles', () => {
  it('covers it, each triangle counter-clockwise, from its first corner', () => {
    for (const r of [square(0, 0), ring(1.9), outside(square(0.5, 0.5), ring(1.9))[0]]) {
      const triangles = fan(r);
      let total = 0;
      for (const [a, b, c] of triangles) {
        const t = [r[a], r[b], r[c]];
        expect(area(t)).toBeGreaterThan(0);
        total += area(t);
      }
      expect(total).toBeCloseTo(area(r), 12);
      expect(triangles.every(([a]) => a === 0)).toBe(true);
    }
  });

  it('leaves out a triangle that has no area, and covers all the same', () => {
    // a corner part way along a side: three in a line, which are no triangle
    const flat: Ring = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const triangles = fan(flat);
    expect(triangles).toHaveLength(2);
    expect(triangles.reduce((s, [a, b, c]) => s + area([flat[a], flat[b], flat[c]]), 0)).toBeCloseTo(1, 12);
  });
});

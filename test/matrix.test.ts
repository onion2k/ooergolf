/** Placements: a flat mark put on the ground lies on it, which a hill is not level enough to allow for by lifting it. */
import { describe, expect, it } from 'vitest';
import { place, placeOnSlope } from '../src/matrix';

const column = (m: Float32Array, c: number) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

describe('a placement on a slope', () => {
  it('is the ordinary placement where the ground is level', () => {
    const a = new Float32Array(16),
      b = new Float32Array(16);
    place(a, 0, 3, 4, 5, 0.7, 2, 3, 1);
    placeOnSlope(b, 0, 3, 4, 5, 0, 0, 0.7, 2, 3);
    for (let k = 0; k < 16; k++) expect(b[k]).toBeCloseTo(a[k], 6);
  });

  it('puts the mark flat on the ground: its two axes along the slope, its third across it, each the size it was sent', () => {
    const m = new Float32Array(16);
    const [sx, sy] = [0.3, -0.15];
    placeOnSlope(m, 0, 1, 2, 3, sx, sy, 0, 4, 6);
    const normal = [-sx, -sy, 1].map((v) => v / Math.hypot(sx, sy, 1));
    const ex = column(m, 0),
      ey = column(m, 1),
      ez = column(m, 2);
    expect(dot(ex, normal), 'the first axis lies in the ground').toBeCloseTo(0, 6);
    expect(dot(ey, normal), 'and the second').toBeCloseTo(0, 6);
    expect(dot(ex, ey), 'at right angles').toBeCloseTo(0, 6);
    expect(length(ex)).toBeCloseTo(4, 6);
    expect(length(ey)).toBeCloseTo(6, 6);
    // the third axis is the ground's own upright
    expect(dot(ez, normal) / length(ez)).toBeCloseTo(1, 6);
    expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
  });

  it("is turned about the ground's upright by its yaw: the first axis a quarter turn round is where the second was", () => {
    const a = new Float32Array(16),
      b = new Float32Array(16);
    placeOnSlope(a, 0, 0, 0, 0, 0.2, 0.1, 0, 1, 1);
    placeOnSlope(b, 0, 0, 0, 0, 0.2, 0.1, Math.PI / 2, 1, 1);
    const ey = column(a, 1),
      ex = column(b, 0);
    for (let k = 0; k < 3; k++) expect(ex[k]).toBeCloseTo(ey[k], 6);
  });

  it('is lifted off the ground along its upright, by the amount sent, so it is over the ground and not in it', () => {
    const m = new Float32Array(16);
    placeOnSlope(m, 0, 10, 20, 30, 0.5, 0, 0, 1, 1, 0.4);
    const normal = [-0.5, 0, 1].map((v) => v / Math.hypot(0.5, 0, 1));
    expect(m[12]).toBeCloseTo(10 + normal[0] * 0.4, 6);
    expect(m[13]).toBeCloseTo(20, 6);
    expect(m[14]).toBeCloseTo(30 + normal[2] * 0.4, 6);
  });
});

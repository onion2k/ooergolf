/**
 * How far a flat ring must be lifted off ground that is not flat to be seen whole: a ring laid along the slope at its
 * middle still sinks into a hollow, which rises round it, and a hollow is where a ball comes down.
 */
import { describe, expect, it } from 'vitest';
import { heightAt, layoutOf, slopeAt } from '../src/arena';
import { RING_LIFT, ringLift } from '../src/scene';
import { field } from './helpers';

const rows = 60,
  cols = 61;

/** Ground in the shape of a bowl, `depth` lower in the middle, or a dome if `depth` is under nought. */
function bowl(depth: number) {
  return Float32Array.from({ length: rows * cols }, (_, k) => {
    const r = Math.floor(k / cols) - rows / 2,
      c = (k % cols) - cols / 2;
    const d = Math.hypot(r, c) / 14;
    return Math.max(0, depth * Math.min(1, d) ** 2 + 2);
  });
}

const edge = (cx: number, cy: number, rx: number, ry: number, yaw: number, a: number): [number, number] => [
  cx + rx * Math.cos(a) * Math.cos(yaw) - ry * Math.sin(a) * Math.sin(yaw),
  cy + rx * Math.cos(a) * Math.sin(yaw) + ry * Math.sin(a) * Math.cos(yaw),
];

describe('the lift of a ring over ground', () => {
  it('is the least there is on level ground: a hair, so it is not fighting the turf', () => {
    const l = layoutOf(field('f', rows, cols).map);
    expect(ringLift(l, 0, 0, 0, 0, 6, 6, 0)).toBeCloseTo(RING_LIFT, 9);
  });

  it('is enough, over a hollow, that every point of the ring is above the ground and not in it', () => {
    const t = bowl(10);
    const l = layoutOf(field('f', rows, cols, t).map, t);
    // in the middle of the bowl, where the ground rises all round; a ring wide enough to reach its sides
    for (const [rx, ry, yaw] of [
      [9, 9, 0],
      [14, 5, 0.7],
      [4, 16, 2.1],
    ]) {
      const [sx, sy] = slopeAt(l, 0, 0);
      const z0 = heightAt(l, 0, 0);
      const lift = ringLift(l, 0, 0, sx, sy, rx, ry, yaw);
      expect(lift, 'lifted off the bottom of a bowl').toBeGreaterThan(RING_LIFT + 0.3);
      for (let k = 0; k < 64; k++) {
        const [ex, ey] = edge(0, 0, rx, ry, yaw, (k / 64) * Math.PI * 2);
        // the ring's own height there: the plane through its middle, lifted
        const ring = z0 + sx * ex + sy * ey + lift;
        // to within a couple of hundredths, which is what the samples between the ones it was worked out at may miss by
        expect(ring, `at ${k} of 64 round, ${rx} by ${ry}`).toBeGreaterThanOrEqual(heightAt(l, ex, ey) - 0.02);
      }
    }
  });

  it('is no more than the ground needs on a dome, where the ground falls away and the ring is over it already', () => {
    const t = bowl(-3);
    const l = layoutOf(field('f', rows, cols, t).map, t);
    const [sx, sy] = slopeAt(l, 0, 0);
    expect(ringLift(l, 0, 0, sx, sy, 9, 9, 0)).toBeLessThan(RING_LIFT + 0.6);
  });
});

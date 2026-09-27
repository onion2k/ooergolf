/** A ball seen to roll: turned about the line across its travel, as far as it went over its radius. */
import { describe, expect, it } from 'vitest';
import { placeRolling, roll } from '../src/roll';

/** Where the point of the ball `p` is taken by the turn `q`. */
function turn(q: Float32Array, p: [number, number, number]): [number, number, number] {
  const m = new Float32Array(16);
  placeRolling(m, 0, q, 0, 0, 0);
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
  ];
}

describe('a ball rolling', () => {
  it('turns its top the way it goes', () => {
    const q = new Float32Array([0, 0, 0, 1]);
    roll(q, 10, 0, 1, 0.05);
    const top = turn(q, [0, 0, 1]);
    expect(top[0]).toBeGreaterThan(0.3);
    expect(Math.abs(top[1])).toBeLessThan(1e-6);
    const q2 = new Float32Array([0, 0, 0, 1]);
    roll(q2, 0, -10, 1, 0.05);
    expect(turn(q2, [0, 0, 1])[1]).toBeLessThan(-0.3);
  });

  it('comes round to where it began after rolling once its own round', () => {
    const q = new Float32Array([0, 0, 0, 1]);
    const r = 1.2;
    const steps = 200;
    for (let k = 0; k < steps; k++) roll(q, 7, 3, r, (2 * Math.PI * r) / Math.hypot(7, 3) / steps);
    const p = turn(q, [0.3, -0.5, 0.8]);
    expect(p[0]).toBeCloseTo(0.3, 3);
    expect(p[1]).toBeCloseTo(-0.5, 3);
    expect(p[2]).toBeCloseTo(0.8, 3);
  });

  it('turns its top to the bottom after rolling half its own round', () => {
    const q = new Float32Array([0, 0, 0, 1]);
    for (let k = 0; k < 100; k++) roll(q, 5, 0, 1, Math.PI / 5 / 100);
    const top = turn(q, [0, 0, 1]);
    expect(top[2]).toBeCloseTo(-1, 3);
  });

  it('stays a turn over a long game of rolling, and does not move at rest', () => {
    const q = new Float32Array([0, 0, 0, 1]);
    // an hour of rolling, a frame at a time: the small errors of each step must not grow
    for (let k = 0; k < 216_000; k++) roll(q, Math.sin(k) * 20, Math.cos(k * 1.3) * 20, 1, 1 / 60);
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 5);
    const still = new Float32Array(q);
    roll(q, 0, 0, 1, 1 / 60);
    expect([...q]).toEqual([...still]);
  });
});

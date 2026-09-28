/** The ball squashed at a knock: flattened along it at once, sprung back within a tenth of a second, and round again. */
import { describe, expect, it } from 'vitest';
import { KNOCK } from '../src/arena';
import { placeRolling } from '../src/roll';
import { SQUASH, Squash, squash, squashInto, squashOf } from '../src/squash';

/** Where the point `p` of the ball, from its middle, is put by placement 0 of `m`. */
function at(m: Float32Array, p: [number, number, number]): [number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** A ball of radius `r` at (x, y, z), turned by `q`. */
function ballAt(x: number, y: number, z: number, q = [0, 0, 0, 1]) {
  const m = new Float32Array(16);
  placeRolling(m, 0, new Float32Array(q), x, y, z);
  return m;
}

const near = (a: number[], b: number[], digits = 5) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], digits));

describe('the squash', () => {
  it('is deepest at the knock, and deeper the harder the knock, to a most', () => {
    expect(squash(0, 20)).toBeGreaterThan(0.05);
    expect(squash(0, 30)).toBeGreaterThan(squash(0, 20));
    expect(squash(0, 1000)).toBeCloseTo(SQUASH.most, 9);
    expect(SQUASH.most, 'small: a toy ball, not a water balloon').toBeLessThanOrEqual(0.35);
    // the softest knock there is is barely seen, and a nudge not at all
    expect(squash(0, KNOCK.least)).toBe(0);
    expect(squash(0, 1)).toBe(0);
    for (let t = 0; t < SQUASH.lasts; t += 1 / 600) expect(squash(t, 40)).toBeLessThanOrEqual(squash(0, 40));
  });

  it('springs back within a tenth of a second, a little long on the way, and is round again exactly', () => {
    expect(SQUASH.lasts).toBeLessThanOrEqual(0.1);
    const xs = Array.from({ length: 600 }, (_, k) => squash((k / 600) * SQUASH.lasts, 40));
    const least = Math.min(...xs);
    expect(least, 'stretched a little as it springs back').toBeLessThan(0);
    expect(least, 'but only a little').toBeGreaterThan(-SQUASH.most / 4);
    // round again at its end and after, exactly, and nothing before the knock
    for (const t of [SQUASH.lasts, SQUASH.lasts + 1e-9, 0.2, 5, Infinity, -1e-9, -3, NaN])
      expect(squash(t, 40)).toBe(0);
    // coming to rest, not stopping short: gentle into its end
    expect(Math.abs(squash(SQUASH.lasts - 1 / 600, 40))).toBeLessThan(0.002);
  });

  it('flattens the ball against what it met: that side stays, the far side comes in, and it is wider across', () => {
    // a ball of radius 1 knocked back off a rail to the north of it: pushed south
    const m = ballAt(5, 6, 1);
    squashInto(m, 0, 0.2, 0, -1, 0, 1);
    near(at(m, [0, 1, 0]), [5, 7, 1]);
    near(at(m, [0, -1, 0]), [5, 5.4, 1]);
    const across = at(m, [1, 0, 0]);
    expect(across[0] - 5, 'wider across').toBeCloseTo(1.1, 5);
    expect(across[2] - at(m, [0, 0, 0])[2]).toBeCloseTo(0, 5);
    // about as big as it was: a toy ball squashed, not a ball shrunk
    const volume = 0.8 * 1.1 * 1.1;
    expect(volume).toBeGreaterThan(0.95);
    expect(volume).toBeLessThan(1.05);
  });

  it('squashes a ball landing from a step down onto the ground under it, not into the air', () => {
    const m = ballAt(0, 0, 1);
    squashInto(m, 0, 0.25, 0, 0, 1, 1);
    near(at(m, [0, 0, -1]), [0, 0, 0]);
    near(at(m, [0, 0, 1]), [0, 0, 1.5]);
  });

  it('squashes along the knock, whatever way the ball has rolled round', () => {
    const q = [0.3, -0.5, 0.2, 0.787];
    const l = Math.hypot(...q);
    const m = ballAt(
      2,
      3,
      1,
      q.map((v) => v / l),
    );
    squashInto(m, 0, 0.2, Math.SQRT1_2, Math.SQRT1_2, 0, 1);
    // the side it met is still where it was, and the far side has come in by twice the squash, whatever the turn
    const h = Math.SQRT1_2;
    const inv = (p: [number, number, number]): [number, number, number] => {
      // the point of the ball that the turn has brought to world direction p, found by the turn's transpose
      const r = ballAt(
        0,
        0,
        0,
        q.map((v) => v / l),
      );
      return [
        r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
        r[4] * p[0] + r[5] * p[1] + r[6] * p[2],
        r[8] * p[0] + r[9] * p[1] + r[10] * p[2],
      ];
    };
    near(at(m, inv([-h, -h, 0])), [2 - h, 3 - h, 1], 4);
    near(at(m, inv([h, h, 0])), [2 + h - 0.4 * h, 3 + h - 0.4 * h, 1], 4);
  });

  it('can be read back from the ball as it was placed, whatever its turn, and is nought for a round one', () => {
    const q = [0.3, -0.5, 0.2, 0.787];
    const l = Math.hypot(...q);
    const m = ballAt(
      2,
      3,
      1,
      q.map((v) => v / l),
    );
    expect(squashOf(m, 0, 0, -1, 0), 'round').toBe(0);
    squashInto(m, 0, 0.22, 0.6, 0, -0.8, 1);
    expect(squashOf(m, 0, 0.6, 0, -0.8)).toBeCloseTo(0.22, 5);
    const stretched = ballAt(0, 0, 1);
    squashInto(stretched, 0, -0.05, 1, 0, 0, 1);
    expect(squashOf(stretched, 0, 1, 0, 0)).toBeCloseTo(-0.05, 5);
  });

  it('leaves the ball exactly as it was placed when there is no squash', () => {
    const m = ballAt(1, 2, 3, [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)]);
    const was = [...m];
    squashInto(m, 0, 0, 0, -1, 0, 1);
    expect([...m]).toEqual(was);
  });

  it('keeps one knock at a time, the next in place of the last, and none once a hole begins', () => {
    const s = new Squash();
    expect(s.amount(0), 'none before any knock').toBe(0);
    s.knock(1, 30, 0, -1, 0);
    expect(s.amount(1)).toBeCloseTo(squash(0, 30), 12);
    expect([...s.along]).toEqual([0, -1, 0]);
    s.knock(1.05, 20, 1, 0, 0);
    expect(s.amount(1.05), 'the new knock, from its own moment').toBeCloseTo(squash(0, 20), 12);
    expect([...s.along]).toEqual([1, 0, 0]);
    expect(s.amount(1.05 + SQUASH.lasts), 'over').toBe(0);
    s.knock(2, 30, 0, 0, 1);
    s.clear();
    expect(s.amount(2), 'forgotten').toBe(0);
  });
});

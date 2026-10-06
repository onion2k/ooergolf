/** A number from keys and nothing else: the coin the camera tosses without spending the game's chance. */
import { describe, expect, it } from 'vitest';
import { hashed, seeded } from '../src/random';

describe('hashed', () => {
  it('is the same number for the same keys, every time, and not for other keys', () => {
    expect(hashed(1, 2, 3)).toBe(hashed(1, 2, 3));
    expect(hashed(1, 2, 3)).not.toBe(hashed(1, 2, 4));
    expect(hashed(1, 2, 3)).not.toBe(hashed(3, 2, 1));
    expect(hashed(1, 2)).not.toBe(hashed(1, 2, 0));
    expect(hashed()).toBe(hashed());
  });

  it('is in [0, 1) for any keys, however odd: negative, huge, fractional, not a number', () => {
    for (const key of [0, -1, 1e15, -1e15, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, 2 ** 32 + 1]) {
      const h = hashed(key, 7);
      expect(h, `${key}`).toBeGreaterThanOrEqual(0);
      expect(h, `${key}`).toBeLessThan(1);
    }
  });

  it('is an even coin: a mean between 0.48 and 0.52 over ten thousand keys, and as many below a half as above', () => {
    let sum = 0,
      below = 0;
    for (let k = 0; k < 10000; k++) {
      const h = hashed(11, 3, k);
      sum += h;
      if (h < 0.5) below++;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
    expect(below / 10000).toBeGreaterThan(0.48);
    expect(below / 10000).toBeLessThan(0.52);
  });

  it('is even across the second word and the last as well, which a weak mix leaves in step', () => {
    for (const make of [
      (k: number) => hashed(k, 1, 1),
      (k: number) => hashed(1, k, 1),
      (k: number) => hashed(1, 1, k),
    ]) {
      let below = 0;
      for (let k = 0; k < 5000; k++) if (make(k) < 0.5) below++;
      expect(below / 5000).toBeGreaterThan(0.46);
      expect(below / 5000).toBeLessThan(0.54);
    }
  });

  it('takes no chance from anything: a seeded source asked around it is where it was', () => {
    const a = seeded(5),
      b = seeded(5);
    a();
    hashed(1, 2, 3);
    hashed(4, 5);
    a();
    b();
    b();
    expect(a()).toBe(b());
  });
});

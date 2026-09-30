/**
 * The mark where a lofted ball first came down: a ring that opens at the spot, holds while the player looks at how far
 * the shot went, and closes away. From game time alone, so a picture is the same every run.
 */
import { describe, expect, it } from 'vitest';
import { MARK, markSize } from '../src/marker';

describe('the landing mark', () => {
  it('is nothing before the ball came down, and nothing once it has closed', () => {
    expect(markSize(-1)).toBe(0);
    expect(markSize(-0.001)).toBe(0);
    expect(markSize(MARK.lasts)).toBe(0);
    expect(markSize(MARK.lasts + 10)).toBe(0);
    expect(markSize(NaN)).toBe(0);
  });

  it('opens quickly to its full size, holds it, and closes over the last moments', () => {
    expect(markSize(0)).toBeGreaterThan(0);
    expect(markSize(0)).toBeLessThan(0.5);
    expect(markSize(MARK.opens)).toBeCloseTo(1, 9);
    expect(markSize((MARK.opens + MARK.lasts - MARK.closes) / 2)).toBe(1);
    expect(markSize(MARK.lasts - MARK.closes)).toBeCloseTo(1, 9);
    expect(markSize(MARK.lasts - MARK.closes / 2)).toBeGreaterThan(0);
    expect(markSize(MARK.lasts - MARK.closes / 2)).toBeLessThan(1);
    expect(markSize(MARK.lasts - 1e-6)).toBeLessThan(0.01);
  });

  it('never goes down while it opens or up while it closes, and is never over one', () => {
    let last = 0;
    for (let t = 0; t <= MARK.opens; t += 0.01) {
      const s = markSize(t);
      expect(s).toBeGreaterThanOrEqual(last - 1e-12);
      expect(s).toBeLessThanOrEqual(1 + 1e-12);
      last = s;
    }
    last = 1;
    for (let t = MARK.lasts - MARK.closes; t < MARK.lasts; t += 0.01) {
      const s = markSize(t);
      expect(s).toBeLessThanOrEqual(last + 1e-12);
      last = s;
    }
  });
});

/**
 * The lens: where the screen's edges are blurred, and when. The rule it is there to keep is that nothing a player aims
 * by is ever under it, so that is what is held: the safe box, the cup and the landing, wherever they are on the screen.
 */
import { describe, expect, it } from 'vitest';
import { SAFE, safeBox } from '../src/aimview';
import { LENS, RIM, lensMask, lensShade, lensShown, lensTop } from '../src/lens';

/** A height in the device's own coordinates as a share of the screen from its top. */
const down = (ny: number) => (1 - ny) / 2;

describe('the lens', () => {
  it('leaves the whole of the safe box sharp, on a desk and a wide screen', () => {
    for (const aspect of [1.6, 16 / 9, 21 / 9, 1.3]) {
      const box = safeBox(aspect);
      const top = lensTop(box.top, null, null);
      expect(top, `a band at ${aspect}`).toBeGreaterThan(0);
      for (let i = 0; i <= 20; i++)
        for (let j = 0; j <= 20; j++) {
          const nx = -box.x + (2 * box.x * i) / 20;
          const ny = box.bottom + ((box.top - box.bottom) * j) / 20;
          expect(lensShade((nx + 1) / 2, down(ny), top), `${nx},${ny} at ${aspect}`).toBeLessThan(1e-9);
        }
    }
  });

  it('keeps the band above the cup and above the landing, by the margin, wherever they are', () => {
    const box = safeBox(1.6);
    for (const high of [0.75, 0.8, 0.86]) {
      for (const [cup, reach] of [
        [high, null],
        [null, high],
        [high, 0.2],
        [0.2, high],
      ] as const) {
        const top = lensTop(box.top, cup, reach);
        expect(lensShade(0.5, down(high), top), `${cup},${reach}`).toBe(0);
        if (top > 0) expect(top).toBeLessThanOrEqual(down(high) - LENS.margin + 1e-9);
      }
    }
  });

  it('has no band where the cup or the landing is too near the top for one, and pays no mind to one off the screen', () => {
    const box = safeBox(1.6);
    expect(lensTop(box.top, 0.95, null)).toBe(0);
    expect(lensTop(box.top, null, 0.93)).toBe(0);
    // a cup far up the hole, past the top of the screen, is not on the picture to be blurred
    expect(lensTop(box.top, 3, null)).toBe(lensTop(box.top, null, null));
  });

  it('is at its strongest at the very top and in the rim, and nothing in the middle', () => {
    const top = lensTop(safeBox(1.6).top, null, null);
    expect(lensShade(0.5, 0, top)).toBe(1);
    expect(lensShade(0, 0.5, top)).toBe(1);
    expect(lensShade(0.5, 1, top)).toBe(1);
    expect(lensShade(0.5, 0.5, top)).toBe(0);
    expect(RIM).toBeCloseTo((1 - SAFE.x) / 2);
  });

  it('wears a mask made of the same fades: the rim always, and the band when there is one', () => {
    expect(lensMask(0).match(/linear-gradient/g)).toHaveLength(3);
    const mask = lensMask(0.12);
    expect(mask.match(/linear-gradient/g)).toHaveLength(4);
    expect(mask).toContain('to bottom, #000, transparent 12%');
    expect(mask).toContain(`transparent ${(RIM * 100).toFixed(0)}%`);
  });

  it('is up on the top rung of a wide screen in the play view, and nowhere else', () => {
    expect(lensShown(0, false, 1280, false)).toBe(true);
    expect(lensShown(1, false, 1280, false), 'a rung down').toBe(false);
    expect(lensShown(0, true, 1280, false), 'from above').toBe(false);
    expect(lensShown(0, false, 1280, true), 'under the title').toBe(false);
    expect(lensShown(0, false, 400, false), 'a phone').toBe(false);
    expect(lensShown(0, false, LENS.minWidth, false)).toBe(true);
  });
});

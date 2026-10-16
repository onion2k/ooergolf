/**
 * The frame's dither, which takes the bands out of a gentle gradient. A player's screenshot of The Straight Mile from its tee
 * on a phone (16 October 2026) showed bands across the fairway's stripes: the light along a long fairway changes by a level or
 * two of the screen's eight bits over a hundred pixels and more, and the renderer rounded it to them with nothing between, so
 * it was drawn as flat runs a step apart. Held here with the renderer's own sum (`ditherValue`, the composite's WGSL from the
 * same constants) over such a gradient, rounded as the screen rounds it; the GPU's own pixels are held in artshape-render's
 * `post.gpu.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { ditherValue } from 'artshape-render/game/dither';
import { POST } from '../src/look';

/** A column of a frame a gradient runs down: two levels of the screen over `rows` pixels, from 200.2, as it is shown with a dither of `amount`, each pixel's mean over a strip `width` wide. */
function shown(amount: number, rows = 200, width = 16): number[] {
  const out: number[] = [];
  for (let y = 0; y < rows; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const value = (200.2 + (2 * y) / rows) / 255;
      sum += Math.round(Math.min(1, Math.max(0, value + ditherValue(x, y, amount))) * 255);
    }
    out.push(sum / width);
  }
  return out;
}

/** The longest run of rows a column holds one value for, and the biggest step between two rows. */
function bands(column: number[]): { run: number; step: number } {
  let run = 1,
    longest = 1,
    step = 0;
  for (let y = 1; y < column.length; y++) {
    step = Math.max(step, Math.abs(column[y] - column[y - 1]));
    run = column[y] === column[y - 1] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { run: longest, step };
}

describe('the dither on the frame', () => {
  it('is asked for: a step of the screen, no grain', () => {
    expect(POST.dither).toBe(1);
    expect(POST.grain).toBe(0);
  });

  it('draws two levels over two hundred rows as bands without it: runs of tens of rows and a whole step between them', () => {
    const { run, step } = bands(shown(0));
    expect(run).toBeGreaterThan(50);
    expect(step).toBe(1);
  });

  it('draws it as a gradient with it: the mean over a strip follows the light to a third of a step, and no run is long', () => {
    const column = shown(POST.dither);
    // a strip of sixteen pixels is a few millimetres of a phone's screen: what the eye averages over at arm's length
    const smooth = column.map((_, y) => {
      const from = Math.max(0, y - 8),
        to = Math.min(column.length, y + 8);
      return column.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);
    });
    smooth.forEach((v, y) => expect(Math.abs(v - (200.2 + (2 * y) / 200)), `row ${y}`).toBeLessThan(0.34));
    expect(bands(column).run).toBeLessThan(10);
  });
});

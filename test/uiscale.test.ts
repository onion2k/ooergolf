/**
 * The scale the words over the course are shrunk by on a screen too small for them. A desk and every phone the panels were
 * laid out for must come out at exactly one, or every picture and every measured rect would move; a phone with its display
 * size turned up must come out below it, by whichever side is short.
 */
import { describe, expect, it } from 'vitest';
import { uiScale } from '../src/uiscale';

describe('the scale of the words over the course', () => {
  it('is exactly one on a desk and on every phone the layout was made for', () => {
    for (const [w, h] of [
      [1280, 800],
      [400, 860],
      [360, 640],
      [375, 667],
      [390, 844],
      [430, 932],
      [640, 360],
      [740, 360],
      [812, 375],
      [932, 430],
    ])
      expect(uiScale(w, h), `${w} by ${h}`).toBe(1);
  });

  it('shrinks upright by the narrower of the width and the height against 360 by 600', () => {
    expect(uiScale(300, 640)).toBeCloseTo(300 / 360, 12);
    expect(uiScale(280, 560)).toBeCloseTo(280 / 360, 12);
    expect(uiScale(360, 480)).toBeCloseTo(0.8, 12);
  });

  it('shrinks on its side by the smaller of the width and the height against 640 by 360', () => {
    expect(uiScale(640, 300)).toBeCloseTo(300 / 360, 12);
    expect(uiScale(560, 280)).toBeCloseTo(280 / 360, 12);
    expect(uiScale(568, 320)).toBeCloseTo(568 / 640, 12);
  });

  it('is one for a screen that is not a size yet, so a page not yet laid out is not shrunk to nothing', () => {
    expect(uiScale(0, 0)).toBe(1);
    expect(uiScale(NaN, 600)).toBe(1);
  });
});

/**
 * The sun the look lights by, and the form light that gives a hill its shape. The second title pass lowered the sun to
 * about 46 degrees (from 63) and turned it to the side of the camera the title picture's light comes from, so every
 * shadow is longer and every slope has a bright flank and a dark one; the form light was doubled with it. Without a test
 * a retune of either is a drift, and the look metrics' floors are the only thing to say so.
 */
import { describe, expect, it } from 'vitest';
import { TOY } from '../src/look';
import { SUN } from '../src/sun';

describe('the sun', () => {
  it('is the lower sun of the second title pass: 0.50, 0.482, 0.719 toward it, 46 degrees up', () => {
    expect(SUN).toEqual([0.5, 0.482, 0.719]);
    expect((Math.asin(SUN[2] / Math.hypot(...SUN)) * 180) / Math.PI).toBeCloseTo(46, 0);
  });

  it('is a direction: a unit vector, to a thousandth', () => {
    expect(Math.hypot(...SUN)).toBeCloseTo(1, 3);
  });
});

describe('the look’s form light', () => {
  it('is 5, from 2.5, so a slope turned from the sun is darker than the flat and one facing it brighter', () => {
    expect(TOY.form).toBe(5);
  });
});

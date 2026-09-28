/** The look's figures from sampled colours: the arithmetic the look-metrics gate reads a picture by. */
import { describe, expect, it } from 'vitest';
import { blended, blueShare, figuresOf, luminance, medianColour, saturation, type Rgb } from '../smoke/metrics';

describe('the look’s arithmetic', () => {
  it('weighs a colour’s brightness as the eye does, in linear light', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 0])).toBe(0);
    // sRGB's middle grey is a fifth as bright, not half
    expect(luminance([128, 128, 128])).toBeCloseTo(0.2159, 3);
    // green counts for most of it, blue for least
    expect(luminance([0, 255, 0])).toBeGreaterThan(luminance([255, 0, 0]));
    expect(luminance([255, 0, 0])).toBeGreaterThan(luminance([0, 0, 255]));
  });

  it('says how much colour there is in a colour: none in a grey, all of it in a pure one', () => {
    expect(saturation([120, 120, 120])).toBe(0);
    expect(saturation([0, 0, 0])).toBe(0);
    expect(saturation([255, 0, 0])).toBe(1);
    expect(saturation([100, 200, 50])).toBeCloseTo(0.75, 6);
  });

  it('says how much of a colour is blue, which rises as a shade is cooled', () => {
    expect(blueShare([100, 100, 100])).toBeCloseTo(1 / 3, 6);
    expect(blueShare([90, 90, 140])).toBeGreaterThan(blueShare([100, 100, 100]));
    expect(blueShare([0, 0, 0])).toBe(0);
  });

  it('takes each channel’s middle value, so a flower under a sample of the rough does not move it', () => {
    const rough: Rgb[] = [
      [40, 90, 40],
      [42, 92, 38],
      [200, 60, 220],
      [38, 88, 41],
      [41, 91, 39],
    ];
    expect(medianColour(rough)).toEqual([41, 90, 40]);
    expect(
      medianColour([
        [10, 20, 30],
        [30, 40, 50],
      ]),
    ).toEqual([20, 30, 40]);
  });

  it('reads the figures from the samples: the green’s colour, the course against the rough, the light, the shade', () => {
    const f = figuresOf({
      green: [[100, 200, 50]],
      rough: [[50, 100, 25]],
      railTop: [[220, 160, 120]],
      railShade: [[110, 80, 60]],
      edges: [],
    });
    expect(f.saturation).toBeCloseTo(0.75, 6);
    // twice as bright in sRGB is more than four times as bright in light
    expect(f.framing).toBeGreaterThan(4);
    expect(f.contrast).toBeGreaterThan(4);
    // the shade exactly half the top is the same hue, and no cooler
    expect(f.coolShade).toBeCloseTo(0, 6);
    const cooled = figuresOf({
      green: [[100, 200, 50]],
      rough: [[50, 100, 25]],
      railTop: [[220, 160, 120]],
      railShade: [[90, 80, 100]],
      edges: [],
    });
    expect(cooled.coolShade).toBeGreaterThan(0.1);
  });

  it('counts the pixels across an edge that are neither side, as four samples a pixel leave and a hard edge does not', () => {
    const top: Rgb = [220, 160, 120],
      face: Rgb = [90, 80, 110];
    const hard: Rgb[] = [top, top, top, face, face, face];
    expect(blended(hard, top, face)).toBe(0);
    const soft: Rgb[] = [top, top, [155, 120, 115], face, face];
    expect(blended(soft, top, face)).toBe(1);
    // a pixel a hair off either side is that side, not the edge
    expect(blended([[216, 158, 119], face], top, face)).toBe(0);
    // and the figure is the mean over the rows
    const f = figuresOf({ green: [top], rough: [face], railTop: [top], railShade: [face], edges: [hard, soft, soft] });
    expect(f.edges).toBeCloseTo(2 / 3, 6);
  });
});

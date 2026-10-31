/**
 * Neon Park, the easy course of the Future: nine holes, wide fairways, gentle ground, light winds, holograms in groves and a
 * mirror across the line. What is held here is every count the course was asked for, exactly, on the holes as they are made,
 * since a seed chosen by playing is where a count slips: a grove that did not grow, a pond refused for a seed and put on another
 * hole, a bend that was dropped. Without these a hole could lose its water to a respec and still be a pleasant hole, and nothing
 * would say that the course had stopped being the one that was asked for. How it plays is `test/future-pace.test.ts`'s, and
 * what every Future course shares is `test/future-course.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { golfHole } from '../src/golf';
import { CHROME_SPECS } from '../src/chrome';
import { NEON_PARK_SPECS, NEON_PARK_SUMMARY, neonPark } from '../src/neonpark';
import { SINGULARITY_SPECS } from '../src/singularity';
import { mirror, sharedChecks } from './future-course';

const holes = neonPark();
const layouts = holes.map((h) => layoutOf(h.map, h.terrain, undefined, 'future'));

describe('Neon Park', () => {
  sharedChecks({
    title: 'Neon Park',
    specs: NEON_PARK_SPECS,
    others: [...CHROME_SPECS, ...SINGULARITY_SPECS],
    holes: neonPark,
  });

  it('is nine holes, a par three, four or five each, that add to thirty-four: 3, 4, 4, 5, 3, 4, 3, 4, 4', () => {
    expect(NEON_PARK_SPECS.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([3, 4, 4, 5, 3, 4, 3, 4, 4]);
    expect(holes.map((h) => h.par)).toEqual(NEON_PARK_SPECS.map((s) => s.par));
    expect(NEON_PARK_SUMMARY).toEqual({ holes: 9, par: 34 });
  });

  it('is the lengths the pars call for: a three of 150 to 220 yards, a four of 360 to 440 and a five of 500 to 580', () => {
    const band = { 3: [150, 220], 4: [360, 440], 5: [500, 580] } as const;
    for (const s of NEON_PARK_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has wide fairways, thirteen to eighteen tiles, and the ground level or gentle: no hole stands more than fourteen yards high', () => {
    expect(NEON_PARK_SPECS.map((s) => s.width)).toEqual([16, 18, 15, 17, 14, 14, 13, 15, 14]);
    for (const [i, s] of NEON_PARK_SPECS.entries()) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(13);
      expect(s.width, s.name).toBeLessThanOrEqual(18);
      expect(s.heighten ?? 1, s.name).toBe(1);
      expect(s.steepness, s.name).toBeLessThanOrEqual(0.6);
      expect(Math.max(...layouts[i].terrain), s.name).toBeLessThanOrEqual(14);
    }
  });

  it('has three doglegs, none past thirty degrees, two to the right and one to the left, and no lane cut through a grove', () => {
    expect(NEON_PARK_SPECS.map((s) => s.bend)).toEqual([0, 0, 25, 0, 0, -30, 0, 0, 30]);
    for (const s of NEON_PARK_SPECS) {
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(30);
      expect(s.gap, s.name).toBeUndefined();
    }
  });

  it('has holograms in groves, scattered and not a wood: forty to ninety a hole, as many as asked, and no wood along the hole', () => {
    expect(NEON_PARK_SPECS.map((s) => s.trees)).toEqual([60, 70, 40, 80, 50, 40, 40, 80, 40]);
    expect(layouts.map((l) => l.trees.length)).toEqual(NEON_PARK_SPECS.map((s) => s.trees));
    for (const s of NEON_PARK_SPECS) {
      expect(s.woods, s.name).toBeUndefined();
      expect(s.trees, s.name).toBeGreaterThanOrEqual(40);
      expect(s.trees, s.name).toBeLessThanOrEqual(90);
    }
  });

  it('has a mirror across the line of every hole, two on the long five: ten ponds, no lake, none of them a lake’s size', () => {
    expect(NEON_PARK_SPECS.map((s) => s.ponds.length)).toEqual([1, 1, 1, 2, 1, 1, 1, 1, 1]);
    expect(NEON_PARK_SPECS.reduce((a, s) => a + s.ponds.length, 0)).toBe(10);
    for (const s of NEON_PARK_SPECS) {
      expect(s.lakes, s.name).toBeUndefined();
      for (const p of s.ponds) expect(p.side, s.name).toBe(0);
    }
    // the tiles of quicksilver on each hole, as the generator laid them
    expect(layouts.map(mirror)).toEqual([101, 87, 111, 158, 97, 85, 53, 109, 90]);
    // and two ponds on one hole are the one with two, so each pond is under a lake's hundred and twenty
    for (const [i, l] of layouts.entries())
      expect(mirror(l) / NEON_PARK_SPECS[i].ponds.length, holes[i].name).toBeLessThan(120);
  });

  it('has light winds of six to ten miles an hour, and the quick, gently turned greens of a course that is not hard', () => {
    expect(holes.map((h) => h.wind)).toEqual(NEON_PARK_SPECS.map((s) => s.wind));
    for (const s of NEON_PARK_SPECS) {
      expect(s.wind, s.name).toBeGreaterThanOrEqual(6);
      expect(s.wind, s.name).toBeLessThanOrEqual(10);
      expect(s.contour, s.name).toBeGreaterThanOrEqual(0.5);
      expect(s.contour, s.name).toBeLessThanOrEqual(0.8);
      expect(s.greens, s.name).toBe(12);
    }
    expect(holes.map((h) => h.greens)).toEqual(NEON_PARK_SPECS.map((s) => s.greens));
  });

  it('has the bunkers it was given, two to five a hole, by the green and along the fairway', () => {
    for (const s of NEON_PARK_SPECS) {
      const n = s.bunkers.fairway + s.bunkers.green;
      expect(n, s.name).toBeGreaterThanOrEqual(3);
      expect(n, s.name).toBeLessThanOrEqual(5);
    }
  });

  it('makes the same hole twice from the same spec', () => {
    for (const [i, s] of NEON_PARK_SPECS.entries()) expect(golfHole(s).map, s.name).toEqual(holes[i].map);
  });
});

/**
 * Chrome Heights, the middle course of the Future: nine holes on raised ground (`heighten` past two with shelves for a landing
 * to rest on), two woods of holograms and groves on the rest, and a mirror at the foot of each run-out. What is held here is every
 * count the course was asked for, exactly, on the holes as they are made, since a seed chosen by playing is where a count slips:
 * a wood that did not grow, a shelf that was refused and left off, a pond put on another hole. Without these a hole could lose
 * its hill to a respec and still be a pleasant hole, and nothing would say that the course had stopped being the one that was
 * asked for. How it plays is `test/future-pace.test.ts`'s, and what every Future course shares is `test/future-course.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { CHROME_SPECS, CHROME_SUMMARY, chromeHeights } from '../src/chrome';
import { golfHole } from '../src/golf';
import { NEON_PARK_SPECS } from '../src/neonpark';
import { SINGULARITY_SPECS } from '../src/singularity';
import { runningShare } from '../src/slopes';
import { LIE } from '../src/surfaces';
import { mirror, sharedChecks } from './future-course';

const holes = chromeHeights();
const layouts = holes.map((h) => layoutOf(h.map, h.terrain, undefined, 'future'));

describe('Chrome Heights', () => {
  sharedChecks({
    title: 'Chrome Heights',
    specs: CHROME_SPECS,
    others: [...NEON_PARK_SPECS, ...SINGULARITY_SPECS],
    holes: chromeHeights,
  });

  it('is nine holes, a par three, four or five each, that add to thirty-six: 4, 3, 4, 5, 4, 3, 4, 5, 4', () => {
    expect(CHROME_SPECS.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([4, 3, 4, 5, 4, 3, 4, 5, 4]);
    expect(holes.map((h) => h.par)).toEqual(CHROME_SPECS.map((s) => s.par));
    expect(CHROME_SUMMARY).toEqual({ holes: 9, par: 36 });
  });

  it('is the lengths the pars call for: a three of 150 to 220 yards, a four of 360 to 440 and a five of 500 to 580', () => {
    const band = { 3: [150, 220], 4: [360, 440], 5: [500, 580] } as const;
    for (const s of CHROME_SPECS) {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
  });

  it('has fairways of ten to thirteen tiles', () => {
    expect(CHROME_SPECS.map((s) => s.width)).toEqual([11, 10, 11, 12, 11, 10, 10, 12, 11]);
    for (const s of CHROME_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(10);
      expect(s.width, s.name).toBeLessThanOrEqual(13);
    }
  });

  it('stands high: heighten of two to two and a half on every hole, sixteen to thirty yards of relief, far above The Links’ four to nine', () => {
    expect(CHROME_SPECS.map((s) => s.heighten)).toEqual([2.3, 2, 2.3, 2.3, 2.3, 2, 2.3, 2.3, 2.3]);
    for (const [i, s] of CHROME_SPECS.entries()) {
      expect(s.heighten!, s.name).toBeGreaterThanOrEqual(2);
      expect(s.heighten!, s.name).toBeLessThanOrEqual(2.5);
      const relief = Math.max(...layouts[i].terrain);
      expect(relief, s.name).toBeGreaterThan(16);
      expect(relief, s.name).toBeLessThan(31);
    }
  });

  it('has hills a lively ball runs down: some of every hole’s fairway that the plates do not hold a ball on, and a tenth of the course’s', () => {
    // 4 to 24 per cent a hole and about a tenth of the course's fairway, a good deal less than The Fells' twelve to forty:
    // the future's fairway rolls as earth's does, so what runs is the steepness and `heighten`, and the plates' bounce
    // carries a ball further once it is moving
    let fairway = 0,
      running = 0;
    for (const [i, l] of layouts.entries()) {
      const share = runningShare(l, holes[i].greens);
      expect(share, holes[i].name).toBeGreaterThan(0.03);
      expect(share, holes[i].name).toBeLessThan(0.3);
      let n = 0;
      for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && !l.oob[t] && l.lie[t] === LIE.fairway) n++;
      fairway += n;
      running += share * n;
    }
    expect(running / fairway, 'the share of the course’s fairway that runs').toBeGreaterThan(0.07);
  });

  it('has a shelf for a landing to rest on at every run: two or three on the fours and fives, none on the threes', () => {
    expect(CHROME_SPECS.map((s) => (s.shelves ?? []).length)).toEqual([2, 0, 2, 3, 2, 0, 2, 3, 2]);
    for (const s of CHROME_SPECS) for (const y of s.shelves ?? []) expect(y, s.name).toBeLessThan(s.length - 40);
  });

  it('has two woods of holograms, a hundred and twenty and more along the whole hole, and groves on the other seven', () => {
    expect(CHROME_SPECS.filter((s) => s.woods).map((s) => s.name)).toEqual(['Server Rack', 'Silicon Spur']);
    expect(layouts.map((l) => l.trees.length)).toEqual([90, 50, 129, 90, 90, 50, 120, 100, 90]);
    for (const [i, s] of CHROME_SPECS.entries()) {
      if (s.woods) {
        expect(s.trees, s.name).toBe(0);
        expect(layouts[i].trees.length, s.name).toBeGreaterThanOrEqual(120);
      } else {
        expect(s.trees, s.name).toBeGreaterThanOrEqual(50);
        expect(layouts[i].trees.length, s.name).toBe(s.trees);
      }
    }
  });

  it('has a mirror at the foot of the run-out on every hole: one pond across the line, between eight and nine tenths of the way', () => {
    expect(CHROME_SPECS.map((s) => s.ponds.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    for (const s of CHROME_SPECS) {
      expect(s.lakes, s.name).toBeUndefined();
      expect(s.ponds[0].side, s.name).toBe(0);
      expect(s.ponds[0].at, s.name).toBeGreaterThanOrEqual(0.85);
      expect(s.ponds[0].at, s.name).toBeLessThanOrEqual(0.9);
    }
    expect(layouts.map(mirror)).toEqual([72, 59, 60, 74, 70, 60, 80, 74, 70]);
  });

  it('has two doglegs of thirty degrees, one each way, and straight holes besides', () => {
    expect(CHROME_SPECS.map((s) => s.bend)).toEqual([0, 0, 0, 0, 30, 0, 0, 0, -30]);
    for (const s of CHROME_SPECS) expect(s.gap, s.name).toBeUndefined();
  });

  it('has a wind of ten miles an hour, and quick turned greens: twelve to twelve and a half, a contour of 0.5 to 0.8', () => {
    for (const s of CHROME_SPECS) {
      expect(s.wind, s.name).toBe(10);
      expect(s.greens!, s.name).toBeGreaterThanOrEqual(12);
      expect(s.greens!, s.name).toBeLessThanOrEqual(12.5);
      expect(s.contour!, s.name).toBeGreaterThanOrEqual(0.5);
      expect(s.contour!, s.name).toBeLessThanOrEqual(0.8);
    }
    expect(holes.map((h) => h.wind)).toEqual(CHROME_SPECS.map((s) => s.wind));
    expect(holes.map((h) => h.greens)).toEqual(CHROME_SPECS.map((s) => s.greens));
  });

  it('makes the same hole twice from the same spec', () => {
    for (const [i, s] of CHROME_SPECS.entries()) expect(golfHole(s).map, s.name).toEqual(holes[i].map);
  });
});

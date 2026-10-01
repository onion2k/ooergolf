/**
 * The range, the first course of golf: three holes with nothing on them but their ground, so that every club of the
 * bag can be tried from every lie before the holes that ask more of it are drawn. A unit is a yard, so a hole is as long
 * as it is called; a tee's box, a fairway, rough either side and a round green, in a rail well off the line of any drive.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt } from '../src/arena';
import { COURSES } from '../src/course';
import { RANGE, rangeHole, type RangeSpec } from '../src/range';
import { LIE } from '../src/surfaces';

const range = () => COURSES.find((c) => c.name === 'The Range')!;
const dist = (l: ReturnType<typeof layoutOf>) => Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);

describe('the range', () => {
  it('is a course of golf on the start screen, with three holes of par 3, 3 and 4, and says so without making them', () => {
    const c = range();
    expect(c.golf).toBe(true);
    expect(c.holes).toBe(RANGE);
    expect(c.summary).toEqual({ holes: 3, par: 10 });
    expect(RANGE.map((h) => h.name)).toEqual(['Pitch and Putt', 'Iron Alley', 'The Long Way']);
  });

  it('draws a spec the old way where it names no width, and a wider fairway where it does, refusing what it cannot make', () => {
    const spec: RangeSpec = { name: 'Test', par: 4, length: 175 };
    const plain = rangeHole(spec);
    expect(rangeHole({ ...spec, width: 13 }).map, 'thirteen is what it was').toEqual(plain.map);
    const wide = rangeHole({ ...spec, width: 17 });
    expect(wide.map[0].length - plain.map[0].length, 'four tiles wider').toBe(4);
    expect(() => rangeHole({ ...spec, width: 12 })).toThrow(/odd number/);
    expect(() => rangeHole({ ...spec, bend: 0.5, corner: 4 })).toThrow(/not made yet/);
  });

  it('is golf all through and no other course is: a course’s flag is what its holes’ layouts say', () => {
    for (const c of COURSES)
      for (const h of c.holes) expect(layoutOf(h.map, h.terrain).golf, `${c.name}: ${h.name}`).toBe(c.golf === true);
  });

  it('is as long as each hole is called, tee to cup, in yards, within a tile', () => {
    for (const [hole, length] of [
      [RANGE[0], 105],
      [RANGE[1], 175],
      [RANGE[2], 330],
    ] as const)
      expect(Math.abs(dist(layoutOf(hole.map)) - length), hole.name).toBeLessThanOrEqual(TILE);
  });

  it('is teed on a tee and holed on a green, with a fairway between them, rough either side, and nothing else in the way', () => {
    for (const hole of RANGE) {
      const l = layoutOf(hole.map);
      expect(lieAt(l, l.tee.x, l.tee.y), hole.name).toBe(LIE.tee);
      expect(lieAt(l, l.cup.x, l.cup.y)).toBe(LIE.green);
      // straight down the middle, a tile at a time from past the tee’s box to the green: fairway
      for (let y = l.tee.y + 3 * TILE; y < l.cup.y - 6 * TILE; y += TILE)
        expect(lieAt(l, l.tee.x, y), `${hole.name} at ${y}`).toBe(LIE.fairway);
      // and rough a long way to either side of it, before the rail
      expect(lieAt(l, l.tee.x + 10 * TILE, l.tee.y + 20 * TILE)).toBe(LIE.rough);
      expect(lieAt(l, l.tee.x - 10 * TILE, l.tee.y + 20 * TILE)).toBe(LIE.rough);
      expect(l.bumpers.length).toBe(0);
      expect(l.water.every((w) => w === 0)).toBe(true);
    }
  });

  it('has a bunker short of the green where it says so, and none where it does not', () => {
    const sand = (i: number) => layoutOf(RANGE[i].map).sand.reduce((a, b) => a + b, 0);
    expect(sand(0)).toBe(0);
    expect(sand(1)).toBeGreaterThan(6);
    expect(sand(2)).toBeGreaterThan(6);
  });

  it('keeps its rail far enough from the fairway that a drive scattered as far as a club may is not out of play', () => {
    const l = layoutOf(RANGE[2].map);
    // from the middle of the fairway to the nearest rail, in yards: past the driver’s widest miss at full carry
    const wall = (Math.min(l.tee.x - l.bounds.minX, l.bounds.maxX - l.tee.x) / 1) | 0;
    expect(wall).toBeGreaterThanOrEqual(45);
    expect(dist(l) * Math.tan((5 * Math.PI) / 180)).toBeLessThan(wall);
  });

  it('is made by rangeHole from a spec, a bunker or not, and is the same every time', () => {
    const a = rangeHole({ name: 'x', par: 3, length: 140, bunker: true }),
      b = rangeHole({ name: 'x', par: 3, length: 140, bunker: true });
    expect(a).toEqual(b);
    expect(layoutOf(a.map).golf).toBe(true);
    expect(rangeHole({ name: 'x', par: 3, length: 140 }).map).not.toEqual(a.map);
  });
});

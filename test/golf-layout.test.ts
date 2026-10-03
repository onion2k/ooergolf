/**
 * A golf hole's map: the tiles that say what the ground is (`f` fairway, `r` rough, `c` first cut, `g` green, `t` the tee's box)
 * beside sand and water, read into a layout which knows the surface under any point. Minigolf's maps are read as they
 * were: no golf tile in them, no surface named.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, tileAt } from '../src/arena';
import { COURSE } from '../src/course';
import { HILLS } from './hills';
import { LIE, SURFACES } from '../src/surfaces';

const at = (l: ReturnType<typeof layoutOf>, col: number, rowFromTop: number) => ({
  x: l.originX + (col + 0.5) * TILE,
  y: l.originY + (l.rows - 1 - rowFromTop + 0.5) * TILE,
});

describe('a golf hole’s map', () => {
  const map = ['#######', '#ggCgg#', '#gggfg#', '#ffffs#', '#rrrrr#', '#rttTr#', '#rrrrr#', '#######'];
  const l = layoutOf(map);

  it('is golf where a tile is golf’s, and reads each tile’s surface', () => {
    expect(l.golf).toBe(true);
    const lie = (col: number, row: number) => {
      const p = at(l, col, row);
      return lieAt(l, p.x, p.y);
    };
    expect(lie(1, 1)).toBe(LIE.green);
    expect(lie(4, 2)).toBe(LIE.fairway);
    expect(lie(1, 4)).toBe(LIE.rough);
    expect(lie(2, 5)).toBe(LIE.tee);
    // the sand is the sand of any hole, and reads as a surface here
    expect(lie(5, 3)).toBe(LIE.sand);
  });

  it('reads `c` as the first cut: golf’s, so a hole drawn with it is golf, and mixed with minigolf’s grass it is refused', () => {
    const cut = layoutOf(['#######', '#ggCgg#', '#cccgg#', '#ffffs#', '#rrrrr#', '#rttTr#', '#rrrrr#', '#######']);
    expect(cut.golf).toBe(true);
    const p = at(cut, 1, 2);
    expect(lieAt(cut, p.x, p.y)).toBe(LIE.cut);
    expect(cut.lie.filter((v) => v === LIE.cut).length).toBe(3);
    // and it is not sand, not water and not out of bounds, but ground to roll on
    const t = tileAt(cut, p.x, p.y);
    expect(cut.sand[t] + cut.water[t] + cut.oob[t] + cut.solid[t]).toBe(0);
    expect(() => layoutOf(['#####', '#.c.#', '#.C.#', '#.T.#', '#####'])).toThrow(/mixes/);
  });

  it('puts the tee on a tee and the cup on a green, however they are drawn', () => {
    const teeLie = lieAt(l, l.tee.x, l.tee.y),
      cupLie = lieAt(l, l.cup.x, l.cup.y);
    expect(teeLie).toBe(LIE.tee);
    expect(cupLie).toBe(LIE.green);
  });

  it('has no surface off the course, and none from a point off the grid', () => {
    expect(lieAt(l, l.originX - 50, 0)).toBe(LIE.none);
    expect(lieAt(l, 0, l.originY - 50)).toBe(LIE.none);
    expect(tileAt(l, l.originX - 50, 0)).toBe(-1);
  });

  it('has a surface with a name and a roll, a keep, a bounce and a lie’s cost, for every kind there is', () => {
    for (const kind of Object.values(LIE)) {
      const s = SURFACES[kind];
      expect(s, `lie ${kind}`).toBeDefined();
      expect(s.roll).toBeGreaterThan(0);
      expect(s.keep).toBeGreaterThanOrEqual(0);
      expect(s.keep).toBeLessThan(1);
      expect(s.bounce).toBeGreaterThanOrEqual(0);
      expect(s.bounce).toBeLessThan(1);
      expect(s.power).toBeGreaterThan(0);
      expect(s.power).toBeLessThanOrEqual(1);
      expect(s.wild).toBeGreaterThanOrEqual(1);
    }
  });

  it('is refused if it mixes the minigolf’s grass or its raised steps with golf’s, by name', () => {
    expect(() => layoutOf(['####', '#gC#', '#..#', '#T.#', '####'])).toThrow(/mixes/);
    expect(() => layoutOf(['####', '#gC#', '#1g#', '#Tg#', '####'])).toThrow(/mixes/);
  });

  it('still takes a post, which stands in the rough, and water', () => {
    const w = layoutOf(['#####', '#gCg#', '#g~g#', '#goT#', '#####']);
    expect(w.golf).toBe(true);
    expect(w.bumpers.length).toBe(1);
    expect(w.water.some((v) => v === 1)).toBe(true);
    const post = w.bumpers[0];
    expect(lieAt(w, post.x, post.y)).toBe(LIE.rough);
  });

  it('is still refused grass on the edge, and more or fewer than one tee or cup', () => {
    expect(() => layoutOf(['gggg', 'gCTg', 'gggg'])).toThrow();
    expect(() => layoutOf(['####', '#gC#', '#gg#', '####'])).toThrow(/0 tees/);
  });
});

describe('a minigolf hole’s map', () => {
  it('is not golf, and names no surface anywhere on it', () => {
    for (const hole of [...COURSE, ...HILLS]) {
      const l = layoutOf(hole.map, hole.terrain);
      expect(l.golf, hole.name).toBe(false);
      expect(
        l.lie.every((v) => v === LIE.none),
        hole.name,
      ).toBe(true);
    }
  });

  it('reads sand as sand, and the rest as no surface', () => {
    const l = layoutOf(['#####', '#.Cs#', '#.T.#', '#####']);
    const s = at(l, 3, 1);
    expect(lieAt(l, s.x, s.y)).toBe(LIE.sand);
    const g = at(l, 1, 1);
    expect(lieAt(l, g.x, g.y)).toBe(LIE.none);
    expect(l.golf).toBe(false);
  });
});

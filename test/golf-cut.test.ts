/**
 * The first cut: the mown ground one tile wide round every putting green and along both edges of a fairway, which a golf
 * hole made from a spec has and the golf held by hand does not. What is held is where it is (a continuous
 * fringe, gaps only where something else is), that it takes nothing from a hazard, the way of play or a tree (it is made
 * after them all, from the grass alone, and spends no chance), that a ball rolls on it and is struck from it as the
 * surfaces table says, and that a hole drawn with it is a hole the layout reads.
 */
import { describe, expect, it } from 'vitest';
import { layoutOf, tileLieAt } from '../src/arena';
import { golfHole, type GolfSpec } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { LIE, SURFACES } from '../src/surfaces';
import { FLAT_HOLES } from './helpers';

const SPEC: GolfSpec = {
  name: 'Cut Test',
  par: 4,
  length: 380,
  bend: 25,
  width: 13,
  seed: 5,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 2, green: 2 },
  ponds: [{ at: 0.62, side: -1, size: [3, 4] }],
  trees: 24,
};

/** The map as a grid of letters, row 0 the south as a layout has it, and the tiles round one (eight of them). */
function grid(map: readonly string[]) {
  const rows = map.length;
  const at = (c: number, r: number) => map[rows - 1 - r]?.[c] ?? ' ';
  const around = (c: number, r: number) => {
    const out: string[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dc || dr) out.push(at(c + dc, r + dr));
    return out;
  };
  return { rows, cols: map[0].length, at, around };
}

const specs: GolfSpec[] = [SPEC, ...LINKS_SPECS.slice(0, 4)];

describe('the first cut of a golf hole made from a spec', () => {
  it('has some, and in the map as the letter c, which the layout reads as the cut', () => {
    for (const spec of specs) {
      const h = golfHole(spec);
      const cut = h.map.join('').split('c').length - 1;
      expect(cut, spec.name).toBeGreaterThan(50);
      const l = layoutOf(h.map, h.terrain);
      let seen = 0;
      for (let t = 0; t < l.cols * l.rows; t++) if (l.lie[t] === LIE.cut) seen++;
      expect(seen, spec.name).toBe(cut);
    }
  });

  it('is a fringe round the green with no gap: no tile of rough or fairway lies within a tile of the green', () => {
    for (const spec of specs) {
      const g = grid(golfHole(spec).map);
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++) {
          const here = g.at(c, r);
          if (here !== 'r' && here !== 'f') continue;
          const near = g.around(c, r);
          expect(near.includes('g') || near.includes('C'), `${spec.name} ${c},${r} is ${here} beside the green`).toBe(
            false,
          );
        }
    }
  });

  it('is a first cut along both edges of the fairway: no tile of rough lies within a tile of the fairway', () => {
    for (const spec of specs) {
      const g = grid(golfHole(spec).map);
      let beside = 0;
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++) {
          const here = g.at(c, r);
          if (here === 'f') beside += g.around(c, r).filter((ch) => ch === 'c').length;
          if (here === 'r') expect(g.around(c, r).includes('f'), `${spec.name} ${c},${r}`).toBe(false);
        }
      expect(beside, `${spec.name}: cut along the fairway`).toBeGreaterThan(100);
    }
  });

  it('is only where it should be: every tile of it is within two tiles of the green or the fairway, so it is a tile or two deep and no more', () => {
    for (const spec of specs) {
      const g = grid(golfHole(spec).map);
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++) {
          if (g.at(c, r) !== 'c') continue;
          let near = false;
          for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++) if ('gCf'.includes(g.at(c + dc, r + dr))) near = true;
          expect(near, `${spec.name} ${c},${r}: a cut tile with no green or fairway near it`).toBe(true);
        }
    }
  });

  it('takes nothing from sand, water, out of bounds, a tree, the rail, the tee or the cup, and none is made of them', () => {
    for (const spec of specs) {
      const h = golfHole(spec);
      const count = (ch: string) => h.map.join('').split(ch).length - 1;
      expect(count('T'), spec.name).toBe(1);
      expect(count('C'), spec.name).toBe(1);
      expect(count('^'), 'the trees asked for').toBe(spec.trees);
      expect(count('s'), spec.name).toBeGreaterThan(0);
      // a cut tile is never beside nothing: the ring a hole is drawn in is out of bounds and rock, never cut
      const g = grid(h.map);
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++)
          if (g.at(c, r) === 'c') expect(g.around(c, r).every((ch) => ch !== ' ' && ch !== 'x')).toBe(true);
    }
  });

  it('leaves the way of play open: a ball can be played from the tee to the cup over rough, fairway, cut, green and sand alone', () => {
    for (const spec of specs) {
      const h = golfHole(spec);
      const g = grid(h.map);
      const open = (c: number, r: number) => 'frcgtTCs'.includes(g.at(c, r));
      const wide = (c: number, r: number) => {
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!open(c + dc, r + dr)) return false;
        return true;
      };
      const l = layoutOf(h.map, h.terrain);
      const tc = Math.floor((l.tee.x - l.originX) / 3),
        tr = Math.floor((l.tee.y - l.originY) / 3),
        cc = Math.floor((l.cup.x - l.originX) / 3),
        cr = Math.floor((l.cup.y - l.originY) / 3);
      const seen = new Set<number>([tr * g.cols + tc]);
      const todo = [[tc, tr]];
      let reached = false;
      for (let head = 0; head < todo.length && !reached; head++) {
        const [c, r] = todo[head];
        if (c === cc && r === cr) reached = true;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const k = (r + dr) * g.cols + c + dc;
          if (!seen.has(k) && open(c + dc, r + dr) && wide(c + dc, r + dr)) {
            seen.add(k);
            todo.push([c + dc, r + dr]);
          }
        }
      }
      expect(reached, spec.name).toBe(true);
    }
  });

  it('spends no chance of its own: the same spec is the same hole, and a hole of another seed is another', () => {
    expect(golfHole(SPEC)).toEqual(golfHole(SPEC));
    expect(golfHole({ ...SPEC, seed: 6 }).map).not.toEqual(golfHole(SPEC).map);
  });

  it('is read as the cut by its tile, and sand lying on a tile that was to be cut stays sand', () => {
    const h = golfHole(SPEC);
    const l = layoutOf(h.map, h.terrain);
    let cut = 0;
    for (let t = 0; t < l.cols * l.rows; t++) {
      if (l.lie[t] !== LIE.cut) continue;
      cut++;
      const x = l.originX + ((t % l.cols) + 0.5) * 3,
        y = l.originY + (Math.floor(t / l.cols) + 0.5) * 3;
      // the tile the map draws as cut: the cut that is drawn and played is the band round the curves (`zones.test.ts`)
      expect(tileLieAt(l, x, y)).toBe(LIE.cut);
      expect(l.sand[t]).toBe(0);
      expect(l.oob[t]).toBe(0);
    }
    expect(cut).toBeGreaterThan(0);
  });
});

describe('what the cut is made of', () => {
  it('is mown, but longer than the green and the fairway, and not the rough: slower than both, and not as slow as the rough', () => {
    const cut = SURFACES[LIE.cut];
    expect(cut.roll).toBeGreaterThan(SURFACES[LIE.fairway].roll);
    expect(cut.roll).toBeGreaterThan(SURFACES[LIE.green].roll);
    expect(cut.roll).toBeLessThan(SURFACES[LIE.rough].roll);
    // a club loses a little from it, and is a little wilder, and neither as much as from the rough
    expect(cut.power).toBeLessThan(SURFACES[LIE.fairway].power);
    expect(cut.power).toBeGreaterThan(SURFACES[LIE.rough].power);
    expect(cut.wild).toBeGreaterThan(1);
    expect(cut.wild).toBeLessThan(SURFACES[LIE.rough].wild);
    // and it holds less of a landing than the fairway, more than the rough
    expect(cut.keep).toBeLessThan(SURFACES[LIE.fairway].keep);
    expect(cut.keep).toBeGreaterThan(SURFACES[LIE.rough].keep);
  });
});

describe('the holes that are not made from a spec', () => {
  it('have no first cut: a hole drawn by hand is as it was, and has none of the letter', () => {
    for (const hole of FLAT_HOLES) expect(hole.map.join('').includes('c'), hole.name).toBe(false);
  });
});

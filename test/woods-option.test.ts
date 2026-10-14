/**
 * A wood along a hole's whole length (`GolfSpec.woods`): the rough on both sides planted from a margin off the fairway out to
 * the stakes, so that a drive that strays is under a canopy and the hole is a corridor. What is held here is that the wood
 * stands on both sides all the way along, that it keeps off the fairway by the margin asked and clear of the tee and the
 * green, that a gap's lane is as clear with a wood as without and the gap's own corner is planted as it was, that a hole
 * without the option is the hole it was to the byte, that a margin outside its range is refused by name, and what a wood
 * costs to make and to draw. Without these the option could plant the fairway, close the lane, or move every hole of every
 * course that never asked for it.
 */
import { describe, expect, it } from 'vitest';
import { WOOD, WOODS, golfHole, laneOf, type GolfSpec } from '../src/golf';
import { BUDGET } from '../src/models';
import { layoutOf } from '../src/arena';
import { hashHole } from './helpers';

/** A straight par five of 500 yards on gentle hills, the hole the wood is tried on. */
const SPEC: GolfSpec = {
  name: 'The Corridor',
  par: 5,
  length: 500,
  bend: 0,
  width: 12,
  seed: 5,
  feel: 'hills',
  steepness: 0.75,
  bunkers: { fairway: 1, green: 2 },
  ponds: [],
  trees: 0,
  wind: 0,
  contour: 0.5,
  greens: 13,
};
/** The Pinewood of the gap test, with a wood on the rest of the hole too. */
const BENT: GolfSpec = {
  name: 'The Pinewood Walk',
  par: 4,
  length: 420,
  bend: 50,
  corner: 0.5,
  width: 12,
  seed: 7,
  feel: 'hills',
  steepness: 0.6,
  bunkers: { fairway: 1, green: 2 },
  ponds: [],
  trees: 0,
  wind: 0,
  contour: 0.6,
  greens: 13,
  heighten: 1.5,
  gap: { to: 255 },
};

/** Where the trunks, the tee and the cup are on a hole's map, in tiles. */
function tiles(map: readonly string[]) {
  const trunks: [number, number][] = [];
  let tee: [number, number] = [0, 0],
    cup: [number, number] = [0, 0];
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '^') trunks.push([c, r]);
      if (row[c] === 'T') tee = [c, r];
      if (row[c] === 'C') cup = [c, r];
    }
  });
  return { trunks, tee, cup };
}

describe('a wood along the whole hole', () => {
  const hole = golfHole({ ...SPEC, woods: true });
  const { trunks, tee, cup } = tiles(hole.map);

  it('stands on both sides of the fairway, all the way from the tee to the green', () => {
    // the hole runs straight along the rows, so a trunk's side is which side of the tee's column it is on; the way is cut
    // into ten stretches, and each has trunks on each side
    const [c0, r0] = tee,
      r1 = cup[1];
    const stretches = Array.from({ length: 10 }, () => ({ left: 0, right: 0 }));
    for (const [c, r] of trunks) {
      const k = Math.floor(((r - r0) / (r1 - r0)) * 10);
      if (k < 0 || k >= 10) continue;
      if (c < c0) stretches[k].left++;
      else stretches[k].right++;
    }
    // the last stretch is cut by the green's clearing (nine tiles round the cup), so three is what it has room for
    for (const [k, s] of stretches.entries()) {
      expect(s.left, `trunks left of stretch ${k}`).toBeGreaterThanOrEqual(3);
      expect(s.right, `trunks right of stretch ${k}`).toBeGreaterThanOrEqual(3);
    }
    // about 130 on 500 yards: a trunk for every nine tiles of a band three and a half tiles wide each side
    expect(trunks.length).toBeGreaterThan(100);
  });

  it('keeps off the fairway by the margin, so there is open rough to play from beside it, and off the tee and the green', () => {
    const map = hole.map;
    for (const [c, r] of trunks) {
      for (let dc = -1; dc <= 1; dc++)
        for (let dr = -1; dr <= 1; dr++) {
          const row = map[r + dr] as string | undefined;
          const kind = row?.[c + dc] ?? ' ';
          expect('ftTgC'.includes(kind), `a trunk at ${c},${r} beside a ${kind}`).toBe(false);
        }
      expect(Math.hypot(c - tee[0], r - tee[1]), 'from the tee').toBeGreaterThanOrEqual(6);
      expect(Math.hypot(c - cup[0], r - cup[1]), 'from the cup').toBeGreaterThanOrEqual(9);
    }
  });

  it('plants nothing with a wider margin that a narrower did not, and the wider margin keeps its distance from the fairway', () => {
    const wide = tiles(golfHole({ ...SPEC, woods: { from: 4 } }).map).trunks;
    const near = new Set(trunks.map(([c, r]) => `${c},${r}`));
    expect(wide.length).toBeLessThan(trunks.length);
    for (const [c, r] of wide) expect(near.has(`${c},${r}`), `${c},${r}`).toBe(true);
    const map = hole.map;
    for (const [c, r] of wide)
      for (let dc = -3; dc <= 3; dc++)
        for (let dr = -3; dr <= 3; dr++) expect(map[r + dr]?.[c + dc] ?? ' ').not.toBe('f');
  });

  it('leaves a gap’s lane as clear as the gap alone did, and plants the corner exactly as the gap did', () => {
    const alone = golfHole(BENT);
    const both = golfHole({ ...BENT, woods: true });
    const lane = laneOf(both)!;
    expect(lane).toEqual(laneOf(alone));
    const layout = layoutOf(both.map, both.terrain);
    const lx = lane.to.x - lane.from.x,
      ly = lane.to.y - lane.from.y;
    for (const t of layout.trees) {
      const u = Math.max(0, Math.min(1, ((t.x - lane.from.x) * lx + (t.y - lane.from.y) * ly) / (lx * lx + ly * ly)));
      const d = Math.hypot(t.x - lane.from.x - lx * u, t.y - lane.from.y - ly * u);
      expect(d, `a trunk at ${t.x},${t.y} is ${d} from the lane`).toBeGreaterThanOrEqual(lane.keep - 1e-6);
    }
    const corner = tiles(alone.map).trunks;
    const all = new Set(tiles(both.map).trunks.map(([c, r]) => `${c},${r}`));
    for (const [c, r] of corner) expect(all.has(`${c},${r}`), `the gap's trunk at ${c},${r}`).toBe(true);
    expect(all.size).toBeGreaterThan(corner.length);
  });

  it('is off by default: a spec without it, or with it false, is the hole it was to the byte, and the scattered trees too', () => {
    const was = hashHole(golfHole({ ...SPEC, trees: 40 }));
    expect(hashHole(golfHole({ ...SPEC, trees: 40, woods: false }))).toBe(was);
    expect(hashHole(golfHole({ ...SPEC, trees: 40, woods: undefined }))).toBe(was);
    expect(hashHole(golfHole({ ...SPEC, trees: 40, woods: true }))).not.toBe(was);
  });

  it('refuses a margin outside its range by name', () => {
    const [least, most] = WOODS.range;
    expect(() => golfHole({ ...SPEC, woods: { from: least - 1 } })).toThrow(/The Corridor: a wood stands/);
    expect(() => golfHole({ ...SPEC, woods: { from: most + 1 } })).toThrow(/a wood stands/);
    expect(() => golfHole({ ...SPEC, woods: { from: Number.NaN } })).toThrow(/a wood stands/);
    expect(WOODS.from).toBeGreaterThanOrEqual(least);
    expect(WOODS.from).toBeLessThanOrEqual(most);
    expect(WOOD.apart).toBe(3);
  });

  it('costs little to make, and its trees fit the budget a wooded hole is given to draw them', () => {
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) golfHole(SPEC);
    const plain = (performance.now() - t0) / 3;
    const t1 = performance.now();
    for (let k = 0; k < 3; k++) golfHole({ ...SPEC, woods: true });
    const wooded = (performance.now() - t1) / 3;
    expect(wooded - plain, `${wooded.toFixed(1)} ms against ${plain.toFixed(1)}`).toBeLessThan(100);
    expect(trunks.length * BUDGET.golfTree, `${trunks.length} trees`).toBeLessThanOrEqual(BUDGET['wooded hole']);
  });
});

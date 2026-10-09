/**
 * Ground that is cut to a limit: `heighten` raises a ground's relief and then lowers every tile to the exact lower
 * envelope under the physics' step, so steep hills are made of steps the physics allows and not of a scale that would
 * have to be gentled. Without it, a ground is what it always was, which the hashes below hold (written from the code at
 * d3e50ec, before `heighten` existed). Without these tests a ground could be steeper than the physics takes, or a
 * default could quietly change every Links hole.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, type Layout } from '../src/arena';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { lowerToLimit, noiseGround, type Flat } from '../src/noise';
import { terrainRefusal } from '../src/physics';
import { runningShare } from '../src/slopes';
import { CUP } from '../src/course';

const fnv = (b: Uint8Array) => {
  let h = 0x811c9dc5;
  for (const x of b) {
    h ^= x;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};
const hashOf = (g: Float32Array) => fnv(new Uint8Array(g.buffer, g.byteOffset, g.byteLength));

/** A Links hole's flat map, and the tile of its tee and cup, as the generator lays out a ground. */
function groundInputs(name: string) {
  const spec = LINKS_SPECS.find((s) => s.name === name)!;
  const hole = golfHole(spec);
  const layout = layoutOf(hole.map);
  const tile = (p: { x: number; y: number }) => ({
    x: Math.round((p.x - layout.originX) / TILE - 0.5),
    y: Math.round((p.y - layout.originY) / TILE - 0.5),
  });
  const cup = tile(layout.cup),
    tee = tile(layout.tee);
  const flats: Flat[] = [
    { x: cup.x, y: cup.y, r: 4, blend: 3 },
    { x: tee.x, y: tee.y, r: 2, blend: 3 },
    { x: (cup.x + tee.x) >> 1, y: (cup.y + tee.y) >> 1, r: 3, floor: true },
  ];
  // what the generator lays on a hole with no pond: the green's disc and the tee's, as `golfHole` does
  return { spec, hole, layout, flats, dry: flats.slice(0, 2) };
}

/** The steepest step between side-by-side tiles, and the highest ground, of a terrain. */
function figures(layout: Layout, h: Float32Array) {
  let steepest = 0,
    top = 0;
  for (let y = 0; y < layout.rows; y++)
    for (let x = 0; x < layout.cols; x++) {
      const v = h[y * layout.cols + x];
      top = Math.max(top, v);
      if (x + 1 < layout.cols) steepest = Math.max(steepest, Math.abs(h[y * layout.cols + x + 1] - v));
      if (y + 1 < layout.rows) steepest = Math.max(steepest, Math.abs(h[(y + 1) * layout.cols + x] - v));
    }
  return { steepest, top };
}

// Written from d3e50ec's `golfHole` and `noiseGround`, before `heighten` was added. OLD_HOLES were written again on 9 October 2026
// for the rolling land (the long swell and the banks, which the hole's terrain has and a ground made directly does not): with
// `rolling: false` on The Links' specs (a scratch edit, reverted) the nine old hashes return to the digit.
const OLD_HOLES: Record<string, string> = {
  'The Opener': 'abb6a430',
  'Water Carry': 'd7de94a8',
  'Long Bend': '9384fff3',
  'Tight Left': '6007868d',
  'Island Green': 'e48418a',
  'Rushing Brook': '438a91c3',
  'The Big Dogleg': '57203ee3',
  'The Straight Mile': 'df73e666',
  'Home Stretch': 'de362ad7',
};
const OLD_DIRECT: Record<string, string> = {
  'The Opener': 'af014d17',
  'Water Carry': 'c25ee26a',
  'Long Bend': '255f9fba',
  'Tight Left': '65a00c5d',
  'Island Green': '2b9f232d',
  'Rushing Brook': '453cc560',
  'The Big Dogleg': 'c49c87f4',
  'The Straight Mile': 'f15da50c',
  'Home Stretch': '21965b6c',
};

describe('heighten 1 is the ground as it was', () => {
  for (const spec of LINKS_SPECS) {
    it(`${spec.name}: the hole's terrain, and a ground made directly, are byte for byte`, () => {
      const { hole, layout, flats } = groundInputs(spec.name);
      expect(hashOf(hole.terrain as Float32Array)).toBe(OLD_HOLES[spec.name]);
      const base = { seed: spec.seed, feel: 'hills', steepness: 0.75, flats } as const;
      expect(hashOf(noiseGround(layout, base))).toBe(OLD_DIRECT[spec.name]);
      expect(hashOf(noiseGround(layout, { ...base, heighten: 1 }))).toBe(OLD_DIRECT[spec.name]);
    });
  }
});

describe('heighten is refused by name', () => {
  const layout = layoutOf(['#####', '#T.C#', '#####']);
  for (const bad of [0.99, 0, -1, NaN, Infinity, -Infinity])
    it(`${bad}`, () => {
      expect(() => noiseGround(layout, { seed: 1, feel: 'hills', steepness: 0.5, heighten: bad })).toThrow(/heighten/);
    });
});

describe('heighten 1.6 at steepness 0.9', () => {
  const { spec, hole, layout, flats, dry } = groundInputs('Tight Left');
  const cap = (0.9 * TILE) / 2;
  const base = { seed: spec.seed, feel: 'hills', steepness: 0.9, flats } as const;
  const plain = noiseGround(layout, base);
  const high = noiseGround(layout, { ...base, heighten: 1.6 });

  it('has no step past the cap, and the physics refuses nothing', () => {
    expect(figures(layout, high).steepest).toBeLessThanOrEqual(cap + 1e-5);
    expect(terrainRefusal({ ...layout, terrain: high }, CUP)).toBeNull();
  });
  it('is at least 1.4 times as high as heighten 1', () => {
    expect(figures(layout, high).top).toBeGreaterThanOrEqual(1.4 * figures(layout, plain).top);
  });
  it('is never below nought, and the lowest is nought', () => {
    expect(Math.min(...high)).toBe(0);
  });
  it('keeps the tee and the cup on level ground', () => {
    for (const at of [layout.tee, layout.cup]) {
      const cx = Math.round((at.x - layout.originX) / TILE - 0.5),
        cy = Math.round((at.y - layout.originY) / TILE - 0.5);
      const level = high[cy * layout.cols + cx];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) expect(high[(cy + dy) * layout.cols + cx + dx]).toBe(level);
    }
  });
  it('keeps a pond floor at nought and its disc level', () => {
    const { x, y, r } = flats[2];
    for (let ty = 0; ty < layout.rows; ty++)
      for (let tx = 0; tx < layout.cols; tx++)
        if (Math.hypot(tx - x, ty - y) <= r + 0.5) expect(high[ty * layout.cols + tx]).toBe(0);
  });
  it("keeps the green's disc level, wherever it stands", () => {
    const { x, y, r } = flats[0];
    const level = high[y * layout.cols + x];
    for (let ty = 0; ty < layout.rows; ty++)
      for (let tx = 0; tx < layout.cols; tx++)
        if (Math.hypot(tx - x, ty - y) <= r + 0.5) expect(high[ty * layout.cols + tx]).toBe(level);
  });
  it('is the same every time', () => {
    expect(hashOf(noiseGround(layout, { ...base, heighten: 1.6 }))).toBe(hashOf(high));
  });
  it('leaves a share of the fairway that does not hold a ball, where The Links have none', () => {
    // Tight Left has no pond, so the ground is cut with the green's disc and the tee's alone
    const on = layoutOf(hole.map, noiseGround(layout, { ...base, flats: dry, heighten: 1.6 }));
    expect(runningShare(on, spec.greens)).toBeGreaterThanOrEqual(0.1);
    expect(runningShare(layoutOf(hole.map, hole.terrain as Float32Array), spec.greens)).toBe(0);
  });
  it('takes under 30 ms for about 24,000 tiles', () => {
    const big = layoutOf(
      Array.from({ length: 120 }, (_, r) => (r === 0 || r === 119 ? '#'.repeat(200) : '#' + '.'.repeat(198) + '#')).map(
        (row, r) =>
          r === 5 ? row.slice(0, 1) + 'T' + row.slice(2) : r === 100 ? row.slice(0, 150) + 'C' + row.slice(151) : row,
      ),
    );
    expect(big.cols * big.rows).toBeGreaterThanOrEqual(24000);
    const args = { seed: 3, feel: 'hills', steepness: 0.9, heighten: 1.6 } as const;
    noiseGround(big, args);
    const best = Math.min(
      ...Array.from({ length: 5 }, () => {
        const t0 = performance.now();
        noiseGround(big, args);
        return performance.now() - t0;
      }),
    );
    console.log(`heighten 1.6, ${big.cols * big.rows} tiles: ${best.toFixed(1)} ms`);
    expect(best).toBeLessThan(30);
  });
});

describe('lowerToLimit', () => {
  it('lowers a spike to the cap above its neighbours, and bounds its rounds', () => {
    const h = new Float64Array(25);
    h[12] = 10;
    const rounds = lowerToLimit(h, 5, 5, 1, []);
    expect(h[12]).toBe(1);
    expect(rounds).toBeLessThanOrEqual(3);
  });
  it('is the exact lower envelope of a ramp, and leaves a legal ground alone', () => {
    const h = Float64Array.from({ length: 16 }, (_, i) => (i % 4) * 5);
    lowerToLimit(h, 4, 4, 1, []);
    expect([...h]).toEqual(Array.from({ length: 16 }, (_, i) => Math.min(i % 4, 3)));
    const same = Float64Array.from(h);
    lowerToLimit(same, 4, 4, 1, []);
    expect([...same]).toEqual([...h]);
  });
  it('holds a group level, at its lowest, and keeps the cap', () => {
    // high ground everywhere but the corner, so the cap pulls the group down unevenly, the near end first
    const h = new Float64Array(25).fill(100);
    h[0] = 0;
    h[11] = h[12] = h[13] = 10;
    lowerToLimit(h, 5, 5, 1, [[11, 12, 13]]);
    expect(h[11]).toBe(h[12]);
    expect(h[12]).toBe(h[13]);
    expect(h[12]).toBe(3);
    for (let i = 0; i < 25; i++)
      for (const j of [i + 1, i + 5])
        if (j < 25 && (j !== i + 1 || j % 5)) expect(Math.abs(h[i] - h[j])).toBeLessThanOrEqual(1);
  });
});

describe('runningShare', () => {
  // a golf hole of one fairway tile row, so the ground under it is all that differs
  const map = ['########', '#rtTffC#', '########'];
  const lay = (terrain?: Float32Array) => layoutOf(map, terrain);
  const ground = (rise: number) => Float32Array.from({ length: 24 }, (_, t) => (t % 8) * rise);
  it('is nought on level ground', () => {
    expect(runningShare(lay())).toBe(0);
    expect(runningShare(lay(ground(0)))).toBe(0);
  });
  it('is one where every fairway tile is steeper than the fairway holds, and nought for none', () => {
    expect(runningShare(lay(ground(0.45 * TILE)))).toBe(1);
    expect(runningShare(layoutOf(['#####', '#T.C#', '#####']))).toBe(0);
  });
  it("counts the fairway tiles only, by the lie's own roll", () => {
    // a gentle rise that the fairway holds is no share, and one past it is all of it, the same for every tile's roll
    expect(runningShare(lay(ground(0.2 * TILE)))).toBe(0);
    expect(runningShare(lay(ground(0.3 * TILE)))).toBeGreaterThan(0);
  });
});

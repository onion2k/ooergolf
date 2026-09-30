/**
 * Ground made from noise: smooth, rolling, seeded, and legal to the physics.
 * The generator is arithmetic, so it is held on figures: the noise itself on
 * what makes it Perlin's, the ground on what makes it a hole a ball can be
 * played on and not only looked at.
 */
import { describe, expect, it } from 'vitest';
import { ROLL, TERRAIN, TILE, layoutOf, slopeAt } from '../src/arena';
import { CUP } from '../src/course';
import { FEELS, gradientNoise, noiseGround, type Feel } from '../src/noise';
import { PHYSICS, terrainRefusal } from '../src/physics';
import { groundFigures } from './ground-metrics';

/** A green thirteen tiles across and seventeen long, rail round it, the tee at the south end and the cup at the north. */
const MAP = [
  '#############',
  '#.....C.....#',
  ...Array.from({ length: 13 }, () => '#...........#'),
  '#.....T.....#',
  '#############',
];
const flat = layoutOf(MAP);
const FEEL_NAMES = Object.keys(FEELS) as Feel[];
const holds = ROLL.roll / PHYSICS.gravity;

describe('gradient noise', () => {
  const n = gradientNoise(7);

  it('is nought at every lattice point and never leaves its range: Perlin’s own, gradients and no values', () => {
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) expect(Math.abs(n(i, j))).toBeLessThan(1e-9);
    for (let k = 0; k < 2000; k++) expect(Math.abs(n(k * 0.37 - 300, k * 0.61 + 12))).toBeLessThanOrEqual(1);
  });

  it('is smooth: a step of a hundredth moves it by less than a twentieth, everywhere', () => {
    let worst = 0;
    for (let k = 0; k < 4000; k++) {
      const x = (k % 80) * 0.131,
        y = Math.floor(k / 80) * 0.173;
      worst = Math.max(worst, Math.abs(n(x + 0.01, y) - n(x, y)), Math.abs(n(x, y + 0.01) - n(x, y)));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('is the same for a seed every time, and another field for another seed', () => {
    const a = gradientNoise(7),
      b = gradientNoise(8);
    let same = 0;
    for (let k = 0; k < 200; k++) {
      const x = k * 0.53 + 0.2,
        y = k * 0.29 + 0.4;
      expect(a(x, y)).toBe(n(x, y));
      if (Math.abs(a(x, y) - b(x, y)) < 1e-9) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it('has no lean: its mean over a wide stretch is about nought, and it swings both ways', () => {
    let sum = 0,
      up = 0,
      down = 0,
      k = 0;
    for (let x = 0.1; x < 60; x += 0.37)
      for (let y = 0.1; y < 60; y += 0.41) {
        const v = n(x, y);
        sum += v;
        k++;
        if (v > 0.15) up++;
        if (v < -0.15) down++;
      }
    expect(Math.abs(sum / k)).toBeLessThan(0.05);
    expect(up).toBeGreaterThan(k / 10);
    expect(down).toBeGreaterThan(k / 10);
  });
});

describe('the ground made from it', () => {
  it('has a height for every tile, none below nought, the lowest exactly nought, and all of them numbers', () => {
    for (const feel of FEEL_NAMES) {
      const g = noiseGround(flat, { seed: 3, feel, steepness: 0.5 });
      expect(g.length).toBe(flat.cols * flat.rows);
      expect(
        g.every((h) => Number.isFinite(h) && h >= 0),
        feel,
      ).toBe(true);
      expect(Math.min(...g), feel).toBe(0);
    }
  });

  it('is the same for a seed every time, and another ground for another seed', () => {
    const a = noiseGround(flat, { seed: 3, feel: 'rolling', steepness: 0.5 });
    expect(noiseGround(flat, { seed: 3, feel: 'rolling', steepness: 0.5 })).toEqual(a);
    expect(noiseGround(flat, { seed: 4, feel: 'rolling', steepness: 0.5 })).not.toEqual(a);
    expect(noiseGround(flat, { seed: 3, feel: 'choppy', steepness: 0.5 })).not.toEqual(a);
  });

  it('is real-valued, and not on the half-unit digits a map’s terrain is drawn in, which would roughen the slope by a third', () => {
    for (const feel of FEEL_NAMES) {
      const g = noiseGround(flat, { seed: 5, feel, steepness: 0.6 });
      let on = 0;
      for (const h of g) if (Math.abs(h / TERRAIN.step - Math.round(h / TERRAIN.step)) < 0.02) on++;
      expect(on / g.length, feel).toBeLessThan(0.2);
    }
  });

  it('rises between neighbouring tiles by the share of the physics’ limit it was asked for, and by no more', () => {
    for (const steepness of [0.3, 0.6, 0.9])
      for (const feel of FEEL_NAMES) {
        const g = noiseGround(flat, { seed: 9, feel, steepness });
        let most = 0;
        for (let ty = 0; ty < flat.rows; ty++)
          for (let tx = 0; tx < flat.cols; tx++) {
            if (tx + 1 < flat.cols)
              most = Math.max(most, Math.abs(g[ty * flat.cols + tx + 1] - g[ty * flat.cols + tx]));
            if (ty + 1 < flat.rows)
              most = Math.max(most, Math.abs(g[(ty + 1) * flat.cols + tx] - g[ty * flat.cols + tx]));
          }
        expect(most / (TILE / 2), `${feel} at ${steepness}`).toBeCloseTo(steepness, 2);
      }
  });

  it('is a terrain the physics accepts, of every feel, on twenty seeds, up to the steepest it may be asked for', () => {
    for (const feel of FEEL_NAMES)
      for (let seed = 1; seed <= 20; seed++) {
        const g = noiseGround(flat, { seed, feel, steepness: 0.9 });
        expect(terrainRefusal(layoutOf(MAP, g), CUP), `${feel} seed ${seed}`).toBeNull();
      }
  });

  it('leaves the tee and the cup on ground a ball rests on, out to two balls past the cup’s rim, at the steepest', () => {
    for (const feel of FEEL_NAMES)
      for (let seed = 1; seed <= 20; seed++) {
        const l = layoutOf(MAP, noiseGround(flat, { seed, feel, steepness: 0.9 }));
        const rests = (x: number, y: number) => {
          const [sx, sy] = slopeAt(l, x, y);
          const s = Math.hypot(sx, sy);
          return s / Math.sqrt(1 + s * s);
        };
        expect(rests(l.tee.x, l.tee.y), `${feel} ${seed}: the tee`).toBeLessThanOrEqual(holds);
        for (let a = 0; a < 24; a++)
          for (const r of [0, 0.5, 1.5, CUP.radius + 1, CUP.radius + 2])
            expect(
              rests(l.cup.x + Math.cos((a / 24) * Math.PI * 2) * r, l.cup.y + Math.sin((a / 24) * Math.PI * 2) * r),
              `${feel} ${seed}: ${r} from the cup`,
            ).toBeLessThanOrEqual(holds);
      }
  });

  it('rises and falls: a rolling ground has a couple of units of relief, and more of it the steeper it is asked to be', () => {
    let low = 0,
      high = 0;
    for (let seed = 1; seed <= 10; seed++) {
      low += groundFigures(layoutOf(MAP, noiseGround(flat, { seed, feel: 'rolling', steepness: 0.3 }))).relief;
      high += groundFigures(layoutOf(MAP, noiseGround(flat, { seed, feel: 'rolling', steepness: 0.7 }))).relief;
    }
    expect(low / 10).toBeGreaterThan(0.9);
    expect(high / 10).toBeGreaterThan(1.8);
    expect(high / low).toBeGreaterThan(2);
  });

  it('is told apart by feel: gentle is shallow, choppy is bumpier than rolling, and rolling and choppy is both', () => {
    const mean = (feel: Feel, steepness: number, pick: (f: ReturnType<typeof groundFigures>) => number) => {
      let sum = 0;
      for (let seed = 1; seed <= 12; seed++)
        sum += pick(groundFigures(layoutOf(MAP, noiseGround(flat, { seed, feel, steepness }))));
      return sum / 12;
    };
    // gentle at its own steepness is shallower than rolling at its: the ball rests everywhere
    expect(mean('gentle', 0.3, (f) => f.steepest)).toBeLessThan(0.17);
    expect(mean('gentle', 0.3, (f) => f.rests)).toBeGreaterThan(0.99);
    expect(mean('rolling', 0.6, (f) => f.steepest)).toBeGreaterThan(0.22);
    // at the same steepness choppy turns the slope oftener than rolling does, and has more detail on it
    expect(mean('choppy', 0.6, (f) => f.bumpiness)).toBeGreaterThan(1.3 * mean('rolling', 0.6, (f) => f.bumpiness));
    expect(mean('choppy', 0.6, (f) => f.detail)).toBeGreaterThan(1.5 * mean('rolling', 0.6, (f) => f.detail));
    // rolling and choppy keeps the rolling swell's relief and the choppy's detail
    expect(mean('rolling and choppy', 0.6, (f) => f.relief)).toBeGreaterThan(
      0.75 * mean('rolling', 0.6, (f) => f.relief),
    );
    expect(mean('rolling and choppy', 0.6, (f) => f.detail)).toBeGreaterThan(
      1.2 * mean('rolling', 0.6, (f) => f.detail),
    );
    expect(mean('rolling and choppy', 0.6, (f) => f.bumpiness)).toBeGreaterThan(
      1.2 * mean('rolling', 0.6, (f) => f.bumpiness),
    );
  });
});

describe('the ground of a big hole', () => {
  /** An open green `cols` tiles across and `rows` long inside a rail, the tee at the south end and the cup at the north. */
  const open = (cols: number, rows: number) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return '#';
        if (r === rows - 3 && c === Math.floor(cols / 4)) return 'T';
        if (r === 2 && c === Math.floor((cols * 3) / 4)) return 'C';
        return '.';
      }).join(''),
    );

  it('is made however many tiles it has, the lowest exactly nought and the steepest step as steep as was asked', () => {
    // four hundred tiles a side, twelve hundred units: past what a spread of the heights into one call will take
    const layout = layoutOf(open(400, 400));
    const ground = noiseGround(layout, { seed: 8, feel: 'rolling', steepness: 0.4 });
    expect(ground.length).toBe(400 * 400);
    let lowest = Infinity,
      steepest = 0;
    for (let ty = 0; ty < 400; ty++)
      for (let tx = 0; tx < 400; tx++) {
        const h = ground[ty * 400 + tx];
        expect(Number.isFinite(h)).toBe(true);
        lowest = Math.min(lowest, h);
        if (tx + 1 < 400) steepest = Math.max(steepest, Math.abs(ground[ty * 400 + tx + 1] - h));
        if (ty + 1 < 400) steepest = Math.max(steepest, Math.abs(ground[(ty + 1) * 400 + tx] - h));
      }
    expect(lowest).toBe(0);
    expect(steepest).toBeCloseTo(0.4 * (TILE / 2), 4);
  });
});

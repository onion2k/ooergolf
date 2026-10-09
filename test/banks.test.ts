/**
 * The rolling land of The Links and The Isles: the rough rises in banks beside each fairway and round each green, and a
 * long swell runs under the hills, so the ground a hole is played over rolls as the title picture's does. Held here, on
 * every hole of both courses, to what must still be true of a hole that rolls: the fairway, the tee and the green hold a
 * ball where the course's rule asks it, no step is more than the physics takes, the green's contour is the spec's, and the
 * hazards (water, sand, trees, out of bounds, the tee and the cup) stand on the very tiles they stood on before the land
 * rolled, so a hole keeps its layout, its seed and its par. The Fells are not here: they keep the land they have, and the
 * hash test holds them.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, slopeAt, terrainAt, type Layout } from '../src/arena';
import { CUP } from '../src/course';
import { BANKS, golfHole, type GolfSpec } from '../src/golf';
import { GREEN as GREEN_RULES } from '../src/green';
import { ISLES_SPECS } from '../src/isles';
import { LINKS_SPECS } from '../src/links';
import { terrainRefusal } from '../src/physics';
import { drainFault, holdsBall } from '../src/slopes';
import { LIE } from '../src/surfaces';
import { DT, golfGame } from './helpers';

const SPECS: readonly [string, GolfSpec][] = [
  ...LINKS_SPECS.map((s) => ['The Links', s] as [string, GolfSpec]),
  ...ISLES_SPECS.map((s) => ['The Isles', s] as [string, GolfSpec]),
];

/** The hole as it was before the land rolled: the same spec without asking for it. */
const was = (spec: GolfSpec) => golfHole({ ...spec, rolling: false });

/** FNV-1a over text. */
function fnv(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
  return x;
}

/** Everything of a hole's map that is not the ground a ball is played from (fairway, rough, green, first cut): water, sand, trees, out of bounds, rock and rail, the tee and the cup. */
const hazards = (map: readonly string[]) => fnv(map.join('\n').replace(/[frgc]/g, '.'));

/**
 * Written from the code at 1a3e872 (main, before the land rolled) by running `hazards` over each hole in a copy of that
 * commit, so a hole that keeps its hazards keeps its layout.
 */
const HAZARDS: Record<string, number> = {
  'The Links/The Opener': 94800897,
  'The Links/Water Carry': 2099014158,
  'The Links/Long Bend': 617542884,
  'The Links/Tight Left': 3454384494,
  'The Links/Island Green': 1837342466,
  'The Links/Rushing Brook': 3923685454,
  'The Links/The Big Dogleg': 1762342224,
  'The Links/The Straight Mile': 129154473,
  'The Links/Home Stretch': 1673950552,
  'The Isles/Landfall': 897317319,
  'The Isles/The Green Isle': 613557592,
  'The Isles/Long Water': 601886456,
  'The Isles/The Archipelago': 2663650019,
  'The Isles/Causeway': 1345589976,
  'The Isles/The Long Swim': 2284031616,
  'The Isles/Two Lakes': 1694709334,
  'The Isles/The Peninsula': 3437257301,
  'The Isles/Home Waters': 2281177161,
};

/** How high a bank stands, and the relief a hole of rolling land has, in yards: what the user chose on 9 October 2026. */
const BANK = BANKS.height;
const RELIEF = 8;

/** Every hole of both courses, made once and with the hole as it was beside it. */
const HOLES = SPECS.map(([course, spec]) => {
  const hole = golfHole(spec);
  return { key: `${course}/${spec.name}`, spec, hole, layout: layoutOf(hole.map, hole.terrain) };
});

const centre = (l: Layout, t: number): [number, number] => [
  l.originX + ((t % l.cols) + 0.5) * TILE,
  l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
];

/** The tiles a player may be on: not rock, rail or out of bounds. */
const playable = (l: Layout, t: number) => !l.solid[t] && !l.oob[t];

/** Whether water lies within `BANKS.dry` tiles of tile (c, r), where no bank rises, so as not to leave a lake's wall in the banks' own. */
function nearWater(l: Layout, c: number, r: number): boolean {
  for (let dr = -BANKS.dry; dr <= BANKS.dry; dr++)
    for (let dc = -BANKS.dry; dc <= BANKS.dry; dc++) {
      const cc = c + dc,
        rr = r + dr;
      if (
        cc >= 0 &&
        rr >= 0 &&
        cc < l.cols &&
        rr < l.rows &&
        l.water[rr * l.cols + cc] &&
        dc * dc + dr * dr <= BANKS.dry ** 2
      )
        return true;
    }
  return false;
}

describe('rolling land: the banks', () => {
  it('stands the rough within 25 yards of the fairway (but for the ground by water, where no bank rises) at least half a bank above the fairway it lies beside, and the land has the relief', () => {
    for (const { key, layout: l } of HOLES) {
      const reach = Math.ceil(25 / TILE);
      let sum = 0,
        n = 0,
        lo = Infinity,
        hi = -Infinity;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (playable(l, t)) {
          lo = Math.min(lo, l.terrain[t]);
          hi = Math.max(hi, l.terrain[t]);
        }
        if (l.solid[t] || l.oob[t] || l.water[t] || l.sand[t] || l.lie[t] !== LIE.rough) continue;
        const c = t % l.cols,
          r = Math.floor(t / l.cols);
        let near = -1,
          best = (25 / TILE) ** 2;
        for (let dr = -reach; dr <= reach; dr++)
          for (let dc = -reach; dc <= reach; dc++) {
            const cc = c + dc,
              rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= l.cols || rr >= l.rows) continue;
            const u = rr * l.cols + cc;
            if (l.lie[u] !== LIE.fairway || l.solid[u] || l.oob[u] || dc * dc + dr * dr > best) continue;
            best = dc * dc + dr * dr;
            near = u;
          }
        if (near < 0 || nearWater(l, c, r)) continue;
        sum += l.terrain[t] - l.terrain[near];
        n++;
      }
      expect(n, `${key}: rough beside the fairway`).toBeGreaterThan(100);
      expect(sum / n, `${key}: the rough's mean rise over the fairway`).toBeGreaterThanOrEqual(BANK / 2);
      expect(hi - lo, `${key}: relief`).toBeGreaterThanOrEqual(RELIEF);
    }
  });

  it('keeps every step within what the physics takes, every green’s contour as the spec says, and the ground one the physics accepts', () => {
    for (const { key, spec, hole, layout: l } of HOLES) {
      let steepest = 0;
      for (let r = 0; r < l.rows; r++)
        for (let c = 0; c < l.cols; c++) {
          const t = r * l.cols + c;
          if (c + 1 < l.cols) steepest = Math.max(steepest, Math.abs(l.terrain[t + 1] - l.terrain[t]));
          if (r + 1 < l.rows) steepest = Math.max(steepest, Math.abs(l.terrain[t + l.cols] - l.terrain[t]));
        }
      expect(steepest, `${key}: steepest step`).toBeLessThanOrEqual(TILE / 2);
      expect(terrainRefusal(l, CUP), key).toBeNull();
      // the green's steepest slope is the contour's share of the most a green may lean
      let lean = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.solid[t] || l.sand[t] || l.lie[t] !== LIE.green) continue;
        const [x, y] = centre(l, t);
        lean = Math.max(lean, Math.hypot(...slopeAt(l, x, y)));
      }
      const want = (spec.contour ?? 0) * GREEN_RULES.steepest;
      expect(lean, `${key}: the green's lean`).toBeGreaterThan(want * 0.99);
      expect(lean, `${key}: the green's lean`).toBeLessThan(want * 1.01 + 1e-9);
      void hole;
    }
  });

  it('still holds a ball on every tee, fairway and green tile where the course asks it, and drains where it does not', () => {
    let counted = 0;
    for (const { key, spec, hole, layout: l } of HOLES) {
      const heighten = spec.heighten ?? 1;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.solid[t] || l.oob[t]) continue;
        const lie = l.lie[t];
        const rested = lie === LIE.tee || lie === LIE.green || (heighten === 1 && lie === LIE.fairway);
        if (!rested) continue;
        counted++;
        expect(holdsBall(l, t, hole.greens), `${key}: tile ${t % l.cols},${Math.floor(t / l.cols)}`).toBe(true);
      }
      if (heighten > 1) expect(drainFault(l, hole.greens), `${key}: drains`).toBe(-1);
    }
    // a check that found nothing to check passes in silence
    expect(counted).toBeGreaterThan(10_000);
  });

  it('leaves every hazard, the tee and the cup on the tile they were, hole for hole, as on main', () => {
    expect(Object.keys(HAZARDS)).toHaveLength(HOLES.length);
    for (const { key, hole } of HOLES) expect(hazards(hole.map), key).toBe(HAZARDS[key]);
  });

  it('is the same map, tile for tile, as the hole made without the rolling land, and the same hole every time', () => {
    for (const { key, spec, hole } of HOLES) {
      const old = was(spec);
      expect(hole.map, key).toEqual(old.map);
      expect(hole.wind).toBe(old.wind);
      expect(hole.greens).toBe(old.greens);
      expect(Array.from(golfHole(spec).terrain as Float32Array), `${key} twice`).toEqual(
        Array.from(hole.terrain as Float32Array),
      );
      expect(Array.from(hole.terrain as Float32Array), `${key} rolls`).not.toEqual(
        Array.from(old.terrain as Float32Array),
      );
    }
  });

  /** Whether a ball at rest on tile `t` would, run down the ground by its steepest descent, end out of bounds (or in the rock beyond it). */
  const runsOut = (l: Layout, start: number): boolean => {
    const high = (t: number) => l.floor[t] + terrainAt(l, ...centre(l, t));
    let at = start;
    for (let step = 0; step < 400; step++) {
      let next = -1,
        low = high(at);
      const c = at % l.cols,
        r = Math.floor(at / l.cols);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc,
            rr = r + dr;
          if ((!dc && !dr) || cc < 0 || rr < 0 || cc >= l.cols || rr >= l.rows) continue;
          const k = rr * l.cols + cc;
          if (high(k) < low) {
            low = high(k);
            next = k;
          }
        }
      if (next < 0) return false;
      at = next;
      if (l.solid[at] || l.oob[at]) return true;
    }
    return false;
  };

  it('carries the rough toward the fairway: the share of it whose steepest way down ends out of bounds is smaller than it was, on every hole', () => {
    let counted = 0;
    for (const { key, spec, layout: l } of HOLES) {
      const old = was(spec);
      const before = layoutOf(old.map, old.terrain);
      let nowOut = 0,
        wasOut = 0,
        n = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.solid[t] || l.oob[t] || l.water[t] || l.sand[t]) continue;
        if (l.lie[t] !== LIE.rough && l.lie[t] !== LIE.cut) continue;
        n++;
        if (runsOut(l, t)) nowOut++;
        if (runsOut(before, t)) wasOut++;
      }
      counted += n;
      expect(nowOut / n, `${key}: ${nowOut} of ${n} now, ${wasOut} before`).toBeLessThan(wasOut / n);
    }
    expect(counted).toBeGreaterThan(40_000);
  });

  /**
   * Whether a ball put down on tile `t` and rolled off at six yards a second the way `k` of four says is lost to water or
   * out of bounds, in a game of the hole: what happens to a ball in the rough that is nudged, in the game's own physics.
   */
  const nudged = (hole: ReturnType<typeof golfHole>, tiles: number[]): (boolean | null)[] => {
    const l = layoutOf(hole.map, hole.terrain);
    const { game, told } = golfGame(hole);
    const out: (boolean | null)[] = [];
    for (const t of tiles)
      for (let k = 0; k < 4; k++) {
        // a ball cannot be put down on a tree's trunk or too near the cup: those tiles are left out, as the game leaves them
        try {
          game.place(l.originX + ((t % l.cols) + 0.5) * TILE, l.originY + (Math.floor(t / l.cols) + 0.5) * TILE);
        } catch {
          out.push(null);
          continue;
        }
        const from = told.length;
        const a = (k * Math.PI) / 2 + 0.3;
        game.world.hit(game.ball, Math.cos(a) * 6, Math.sin(a) * 6, 0);
        for (let f = 0; f < 400; f++) game.step(DT);
        out.push(told.slice(from).some((e) => /^(splash|outOfBounds)/.test(e)));
      }
    return out;
  };

  it('never loses a nudged ball from the rough of a bank, in the game’s own physics, that was not lost from the same tile before', () => {
    let rolled = 0,
      lost = 0;
    for (const key of [
      'The Links/The Opener',
      'The Links/Water Carry',
      'The Links/Home Stretch',
      'The Isles/The Green Isle',
      'The Isles/Two Lakes',
    ]) {
      const { spec, layout: l, hole } = HOLES.find((h) => h.key === key)!;
      const tiles: number[] = [];
      for (let t = 0; t < l.cols * l.rows; t += 23)
        if (!l.solid[t] && !l.oob[t] && !l.water[t] && !l.sand[t] && (l.lie[t] === LIE.rough || l.lie[t] === LIE.cut))
          tiles.push(t);
      const now = nudged(hole, tiles),
        before = nudged(was(spec), tiles);
      now.forEach((out, i) => {
        if (out === null || before[i] === null) return;
        rolled++;
        if (out) lost++;
        if (out)
          expect(before[i], `${key}: a ball nudged from tile ${tiles[Math.floor(i / 4)]} (way ${i % 4})`).toBe(true);
      });
    }
    expect(rolled).toBeGreaterThan(1000);
    void lost;
  }, 180_000);
});

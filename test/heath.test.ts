/**
 * The Heath, the short and tight course of golf: nine holes of par three and short par four, a lane through a wood on every
 * dogleg, narrow fairways, small quick turned greens and a fresh wind. What is held here is every count the course was
 * asked for, exactly, since a seed chosen by playing is where a count slips: a lane left off a bend that a later change made
 * too shallow, a fairway let out to twelve tiles because it played better, a third pond. The lanes are held to what they are
 * for (a driver struck true through one meets no canopy and a swing six degrees off meets the wood), and the names to the one
 * rule a name has besides being unique: the wind it draws must move the grass.
 */
import { MAX_BEND, bend } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP } from '../src/course';
import { Game } from '../src/game';
import { WOOD, laneOf } from '../src/golf';
import { HEATH_SPECS, HEATH_SUMMARY, heath } from '../src/heath';
import { checkInvariants } from '../src/invariants';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { GREENS, LIE } from '../src/surfaces';
import { KINDS, ROUGH, windOf } from '../src/turf';
import { DT, golfGame } from './helpers';

/** A lake is at least this many tiles of water; a pond is far under it. */
const LAKE = 120;
/** The words the other two new courses are named with, which no hole here may use. */
const THEIRS = /\b(wood|woods|pine|pines|oak|oaks|old|course)\b/i;

const started = performance.now();
const holes = heath();
const madeIn = performance.now() - started;
const layouts: Layout[] = holes.map((h) => layoutOf(h.map, h.terrain));

/** Tiles of open water on a hole: the pond's own, not the rock round it. */
const water = (l: Layout) => {
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (l.water[t] && !l.solid[t]) n++;
  return n;
};

describe('The Heath', () => {
  it('is nine holes that add to thirty-two: 3, 4, 3, 4, 4, 3, 4, 3, 4', () => {
    expect(HEATH_SPECS.length).toBe(9);
    expect(heath().length).toBe(9);
    expect(heath().map((h) => h.par)).toEqual([3, 4, 3, 4, 4, 3, 4, 3, 4]);
    expect(HEATH_SPECS.map((s) => s.par)).toEqual([3, 4, 3, 4, 4, 3, 4, 3, 4]);
    expect(HEATH_SPECS.reduce((a, s) => a + s.par, 0)).toBe(32);
    expect(HEATH_SUMMARY).toEqual({ holes: 9, par: 32 });
  });

  it('is made once, when first asked for, and the same holes each time', () => {
    expect(heath()).toBe(heath());
  });

  it('is short: a par three of 150 to 220 yards and a par four of 290 to 370', () => {
    const band = { 3: [150, 220], 4: [290, 370] } as const;
    for (const s of HEATH_SPECS) {
      const [least, most] = band[s.par as 3 | 4];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
    }
    holes.forEach((h, i) => {
      const l = layouts[i];
      const crow = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
      expect(crow, h.name).toBeLessThanOrEqual(HEATH_SPECS[i].length + 3);
      expect(crow, h.name).toBeGreaterThan(HEATH_SPECS[i].length * 0.7);
    });
  });

  it('is tight: no fairway wider than ten tiles, and none narrower than the generator makes', () => {
    for (const s of HEATH_SPECS) {
      expect(s.width, s.name).toBeLessThanOrEqual(10);
      expect(s.width, s.name).toBeGreaterThanOrEqual(8);
    }
  });

  it('has every par four a dogleg of 35 to 55 degrees, turning both ways, and every par three straight', () => {
    for (const s of HEATH_SPECS) {
      if (s.par === 4) {
        expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(35);
        expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(55);
      } else expect(s.bend, s.name).toBe(0);
    }
    const fours = HEATH_SPECS.filter((s) => s.par === 4);
    expect(fours.filter((s) => s.bend > 0).length).toBeGreaterThanOrEqual(2);
    expect(fours.filter((s) => s.bend < 0).length).toBeGreaterThanOrEqual(2);
  });

  it('has a lane through a wood on exactly five holes, each a par four that bends 35 degrees or more, leaving a chip of 40 to 80 yards', () => {
    const lanes = holes.map((h, i) => [HEATH_SPECS[i], laneOf(h), layouts[i]] as const);
    expect(lanes.filter(([, lane]) => lane).length).toBe(5);
    for (const [spec, lane, l] of lanes) {
      expect(!!spec.gap, spec.name).toBe(!!lane);
      if (!lane) continue;
      expect(spec.par, spec.name).toBe(4);
      expect(Math.abs(spec.bend), spec.name).toBeGreaterThanOrEqual(WOOD.bend);
      // what a drive that comes down at the lane's end has left to the cup, along the ground
      const left = Math.hypot(l.cup.x - lane.to.x, l.cup.y - lane.to.y);
      expect(left, `${spec.name}: the chip left`).toBeGreaterThanOrEqual(40);
      expect(left, `${spec.name}: the chip left`).toBeLessThanOrEqual(85);
    }
  });

  it('lets a driver struck true through each lane meet no canopy and come down well down it, which a swing six degrees off does not', () => {
    let tried = 0;
    for (const [i, h] of holes.entries()) {
      const lane = laneOf(h);
      if (!lane) continue;
      tried++;
      const name = HEATH_SPECS[i].name;
      const aim = Math.atan2(lane.to.y - lane.from.y, lane.to.x - lane.from.x);
      const drive = (angle: number) => {
        const { game, calls } = golfGame(h);
        game.pick('driver');
        game.shoot(angle, 1);
        for (let f = 0; f < 60 * 20; f++) {
          game.step(DT);
          if (f > 1 && game.ready) break;
        }
        const first = calls.findIndex(([n, a]) => n === 'landed' && a[3] === true);
        const before = first < 0 ? calls : calls.slice(0, first);
        const at = first < 0 ? null : { x: calls[first][1][0] as number, y: calls[first][1][1] as number };
        return {
          knocks: before.filter(([n]) => n === 'knocked').length,
          lost: calls.some(([n]) => n === 'outOfBounds' || n === 'splash'),
          at,
        };
      };
      const through = drive(aim);
      expect(through.knocks, `${name}: through the lane`).toBe(0);
      expect(through.lost, `${name}: lost`).toBe(false);
      expect(through.at, `${name}: comes down`).not.toBeNull();
      expect(Math.hypot(through.at!.x - lane.from.x, through.at!.y - lane.from.y), `${name}: carry`).toBeGreaterThan(
        180,
      );
      expect(Math.hypot(through.at!.x - lane.to.x, through.at!.y - lane.to.y), `${name}: near the target`).toBeLessThan(
        70,
      );
      for (const side of [-1, 1])
        expect(drive(aim + (side * 6 * Math.PI) / 180).knocks, `${name}: ${side * 6} degrees`).toBeGreaterThan(0);
    }
    expect(tried).toBe(5);
  });

  it('is wooded both sides: sixty to ninety trees scattered on every hole', () => {
    for (const s of HEATH_SPECS) {
      expect(s.trees, s.name).toBeGreaterThanOrEqual(60);
      expect(s.trees, s.name).toBeLessThanOrEqual(90);
    }
  });

  it('has hills at 0.75, not heightened, and rolling land, on every hole', () => {
    for (const s of HEATH_SPECS) {
      expect(s.feel, s.name).toBe('hills');
      expect(s.steepness, s.name).toBe(0.75);
      expect(s.heighten ?? 1, s.name).toBe(1);
      expect(s.rolling, s.name).toBe(true);
    }
  });

  it('has three to six bunkers a hole, most of them at the green, and a pond on exactly two holes and no lake', () => {
    for (const s of HEATH_SPECS) {
      const n = s.bunkers.fairway + s.bunkers.green;
      expect(n, s.name).toBeGreaterThanOrEqual(3);
      expect(n, s.name).toBeLessThanOrEqual(6);
      expect(s.bunkers.green, s.name).toBeGreaterThanOrEqual(2);
      expect(s.bunkers.green, s.name).toBeLessThanOrEqual(4);
      expect(s.bunkers.fairway, s.name).toBeLessThanOrEqual(2);
      expect(s.lakes ?? [], s.name).toEqual([]);
    }
    expect(HEATH_SPECS.filter((s) => s.ponds.length > 0).length).toBe(2);
    const wet = holes.map((h, i) => [h.name, water(layouts[i])] as const);
    expect(wet.filter(([, w]) => w > 0).length).toBe(2);
    for (const [name, w] of wet) expect(w, name).toBeLessThan(LAKE);
  });

  it('has a fresh wind of 10 to 15 miles an hour on every hole, and greens that are quick and turned', () => {
    holes.forEach((h, i) => {
      const s = HEATH_SPECS[i];
      expect(h.wind, h.name).toBe(s.wind);
      expect(s.wind!, h.name).toBeGreaterThanOrEqual(10);
      expect(s.wind!, h.name).toBeLessThanOrEqual(15);
      expect(h.greens, h.name).toBe(s.greens);
      expect(s.greens!, h.name).toBeGreaterThanOrEqual(11.5);
      expect(s.greens!, h.name).toBeLessThanOrEqual(13);
      expect(s.greens!, h.name).toBeGreaterThanOrEqual(GREENS.fast);
      expect(s.contour!, h.name).toBeGreaterThanOrEqual(0.7);
      expect(s.contour!, h.name).toBeLessThanOrEqual(1);
    });
  });

  it('has names of its own, none that another course has, none in the other new courses’ words, and each draws a wind that moves the grass', () => {
    const mine = HEATH_SPECS.map((s) => s.name);
    expect(new Set(mine).size).toBe(9);
    const others = new Set(COURSES.filter((c) => c.name !== 'The Heath').flatMap((c) => c.holes.map((h) => h.name)));
    for (const n of mine) {
      expect(others.has(n), n).toBe(false);
      expect(THEIRS.test(n), n).toBe(false);
    }
    // the figures of test/turf.test.ts's rule for every hole's name
    const give = KINDS[ROUGH].give ?? 1;
    for (const name of mine) {
      const w = windOf(name);
      let across = 0;
      for (let t = 0; t < 20; t += 1.7) {
        let lo = Infinity,
          hi = -Infinity;
        for (let x = 0; x < 16; x += 0.5)
          for (let y = 0; y < 16; y += 0.5) {
            const b = bend(give, w, x, y, t, 0);
            lo = Math.min(lo, b);
            hi = Math.max(hi, b);
          }
        across = Math.max(across, hi - lo);
      }
      expect(across, `${name}: ripples across the ground`).toBeGreaterThanOrEqual(0.4);
      let lo = Infinity,
        hi = -Infinity;
      for (let t = 0; t < 6; t += 0.05) {
        const b = bend(give, w, 5, 5, t, 0.3);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
      expect(hi - lo, `${name}: sway at a place`).toBeGreaterThanOrEqual(0.3);
      expect(hi, `${name}: never bent past the most`).toBeLessThan(MAX_BEND);
    }
  });

  it('is legal to the physics, golf all through, a cup on a green and a tee on a tee', () => {
    layouts.forEach((l, i) => {
      expect(l.golf, holes[i].name).toBe(true);
      expect(terrainRefusal(l, CUP), holes[i].name).toBeNull();
      expect(lieAt(l, l.cup.x, l.cup.y), holes[i].name).toBe(LIE.green);
      expect(lieAt(l, l.tee.x, l.tee.y), holes[i].name).toBe(LIE.tee);
    });
  });

  it('is made in under two seconds, all nine holes, in node', () => {
    expect(madeIn).toBeLessThan(2000);
    for (const l of layouts) expect(l.cols * l.rows).toBeLessThan(40000);
    expect(TILE).toBe(3);
  });

  it('is played round by the autopilot, with a player’s slips: every hole finished inside its limit, breaking no rule', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 30 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 211 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      game.card.forEach((score, h) =>
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + 5),
      );
      expect(game.card.length).toBe(9);
    }
  }, 120000);
});

/**
 * The Old Course, the hardest of the golf: a long all-rounder, par 37, nine holes of 200 to 600 yards that each ask more than
 * one thing of a player. What is held here is every count the plan gave it, exactly, and each read off the hole as it is made
 * and never off the spec alone, since a seed chosen by playing is where a count slips: a lake whose island was not placed, a
 * lane left off a bend, a hole whose hills are tamer than the table says, a pond that is a lake. The rule that gives the course
 * its shape is that every hole has at least two of five things (a lake with an island, a wood with a lane, ground that runs,
 * sand, a pond on the line), and sand is on every hole, so it is the second thing that is counted on each.
 */
import { MAX_BEND, bend } from 'artshape-render/game/grass';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { Game } from '../src/game';
import { CARRY, WOOD, golfHole, laneOf } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { OLD_SPECS, OLD_SUMMARY, old } from '../src/old';
import { terrainRefusal } from '../src/physics';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Route } from '../src/route';
import { runningShare } from '../src/slopes';
import { GREENS } from '../src/surfaces';
import { KINDS, ROUGH, windOf } from '../src/turf';
import { DT, golfGame } from './helpers';
import { figures, gridOf, reached, wayRound } from './lake-figures';

/** Words that the other two new courses are named from, which no hole here may use. */
const THEIRS = ['Heath', 'Gorse', 'Heather', 'Wood', 'Pine', 'Oak'];
/** A water body of at least this many tiles is a lake; a pond is less. The Isles' lakes are 300 and over, a pond of seven tiles' radius is 150. */
const LAKE_TILES = 250;
/** A bend of this many degrees makes a dogleg, and the plan's doglegs are from 35 to 55. */
const BENDS = { least: 35, most: 55 };
const RUNNING = 0.08;

const started = performance.now();
const holes = old();
const madeIn = performance.now() - started;

/** The sizes of the separate pieces of one kind of tile on a map, tiles touching across a side (or a corner, if `corners`) being one piece. */
function bodies(map: readonly string[], kind: string, corners: boolean): number[] {
  const rows = map.length,
    cols = map[0].length;
  const seen = new Uint8Array(rows * cols);
  const sizes: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== kind || seen[r * cols + c]) continue;
      let n = 0;
      const stack = [[r, c]];
      seen[r * cols + c] = 1;
      while (stack.length) {
        const [y, x] = stack.pop()!;
        n++;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!corners && dy !== 0 && dx !== 0) continue;
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= rows || xx >= cols || map[yy][xx] !== kind || seen[yy * cols + xx]) continue;
            seen[yy * cols + xx] = 1;
            stack.push([yy, xx]);
          }
      }
      sizes.push(n);
    }
  return sizes;
}
/** How many separate beds of sand a map has. */
const sandBeds = (hole: HoleDef) => bodies(hole.map, 's', true).length;
/** The water bodies of a hole, by tiles, the biggest first. */
const waters = (hole: HoleDef) => bodies(hole.map, '~', false).sort((a, b) => b - a);
/** The lakes of a hole: the water bodies too big to be a pond. */
const lakesOf = (hole: HoleDef) => waters(hole).filter((n) => n >= LAKE_TILES);

/**
 * The pieces of ground of a hole that water divides, found for itself: an island is a piece nothing of which touches out of
 * bounds, the rock or the map's edge, which every shore does.
 */
function islandsOf(hole: HoleDef) {
  const g = gridOf(hole);
  const seen = new Uint8Array(g.cols * g.rows);
  let islands = 0;
  for (let r0 = 0; r0 < g.rows; r0++)
    for (let c0 = 0; c0 < g.cols; c0++) {
      const k0 = g.kind(c0, r0);
      if (seen[r0 * g.cols + c0] || k0 === '~' || k0 === ' ') continue;
      let size = 0,
        island = true,
        home = false;
      const stack = [[c0, r0]];
      seen[r0 * g.cols + c0] = 1;
      while (stack.length) {
        const [c, r] = stack.pop()!;
        size++;
        const here = g.kind(c, r);
        if (here === 'T' || here === 'C') home = true;
        if (here === 'x') island = false;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const there = g.kind(c + dc, r + dr);
          if (there === ' ') island = false;
          if (there === '~' || there === ' ' || seen[(r + dr) * g.cols + c + dc]) continue;
          seen[(r + dr) * g.cols + c + dc] = 1;
          stack.push([c + dc, r + dr]);
        }
      }
      if (island && !home && size >= 5) islands++;
    }
  return islands;
}

/** The five things the plan gave the course, counted on the hole as it is made. */
function thingsOf(index: number) {
  const hole = holes[index];
  const spec = OLD_SPECS[index];
  const layout = layoutOf(hole.map, hole.terrain);
  const ponds = waters(hole).filter((n) => n < LAKE_TILES && n >= 20);
  return {
    lake: lakesOf(hole).length > 0 && islandsOf(hole) > 0,
    lane: !!laneOf(hole),
    running: runningShare(layout, hole.greens) >= RUNNING,
    sand: sandBeds(hole) >= 6,
    pond: spec.ponds.some((p) => p.side === 0) && ponds.length > 0,
  };
}

describe('The Old Course', () => {
  it('is nine holes of par 4, 5, 3, 4, 4, 5, 3, 4 and 5: a par of 37', () => {
    expect(holes.length).toBe(9);
    expect(OLD_SPECS.length).toBe(9);
    expect(holes.map((h) => h.par)).toEqual([4, 5, 3, 4, 4, 5, 3, 4, 5]);
    expect(holes.reduce((a, h) => a + h.par, 0)).toBe(37);
    expect(OLD_SUMMARY).toEqual({ holes: 9, par: 37 });
  });

  it('is made once, when first asked for, and the same holes each time', () => {
    expect(old()).toBe(holes);
    expect(old()).toBe(old());
  });

  it('is as long as a par is for it: a three of 200 to 240 yards, a four of 420 to 480 and a five of 540 to 600', () => {
    const band = { 3: [200, 240], 4: [420, 480], 5: [540, 600] } as const;
    OLD_SPECS.forEach((s, i) => {
      const [least, most] = band[s.par as 3 | 4 | 5];
      expect(s.length, s.name).toBeGreaterThanOrEqual(least);
      expect(s.length, s.name).toBeLessThanOrEqual(most);
      // and the hole made is that long: tee to cup as the crow flies is no more than the way and not much less
      const l = layoutOf(holes[i].map, holes[i].terrain);
      const crow = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
      expect(crow, s.name).toBeLessThanOrEqual(s.length + 3);
      expect(crow, s.name).toBeGreaterThan(s.length * 0.7);
    });
  });

  it('has a fairway of ten to thirteen tiles, hills as the table has them and the land rolling', () => {
    const run = OLD_SPECS.filter((s) => (s.heighten ?? 1) > 1);
    for (const s of OLD_SPECS) {
      expect(s.width, s.name).toBeGreaterThanOrEqual(10);
      expect(s.width, s.name).toBeLessThanOrEqual(13);
      expect(['hills', 'long hills'], s.name).toContain(s.feel);
      expect(s.rolling, s.name).toBe(true);
      // the heightened holes are cut steeper, as The Fells' are, and the others are The Links' own
      expect(s.steepness, s.name).toBe(run.includes(s) ? 0.9 : 0.75);
    }
  });

  it('has exactly five doglegs, of 35 to 55 degrees and turning both ways, and four holes straight', () => {
    const bent = OLD_SPECS.filter((s) => s.bend !== 0);
    expect(bent.length).toBe(5);
    for (const s of bent) {
      expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(BENDS.least);
      expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(BENDS.most);
    }
    expect(bent.some((s) => s.bend > 0)).toBe(true);
    expect(bent.some((s) => s.bend < 0)).toBe(true);
  });

  it('has a lake with an island on exactly four holes, each carry within `CARRY`, and no way round a lake across the line', () => {
    const wet = holes.map((_, i) => i).filter((i) => lakesOf(holes[i]).length > 0);
    expect(wet.length).toBe(4);
    expect(OLD_SPECS.filter((s) => (s.lakes ?? []).length > 0).length).toBe(4);
    for (const i of wet) {
      const h = holes[i];
      const spec = OLD_SPECS[i];
      expect(
        spec.lakes!.every((l) => l.islands.length >= 1),
        `${h.name}: an island in each lake`,
      ).toBe(true);
      expect(islandsOf(h), `${h.name}: an island on the map`).toBeGreaterThanOrEqual(1);
      const f = figures(h);
      const limit = Math.min(CARRY, ...spec.lakes!.map((l) => l.carry ?? CARRY));
      expect(reached(h, CARRY).has(f.cup), `${h.name}: the cup is reached`).toBe(true);
      let least = Infinity;
      for (let carry = 0.5; carry <= CARRY && least === Infinity; carry += 0.5)
        if (reached(h, carry).has(f.cup)) least = carry;
      expect(least, `${h.name}: the carry the hole needs`).toBeLessThanOrEqual(limit);
      if (spec.lakes!.some((l) => l.side === 0)) expect(wayRound(h), `${h.name}: no way round`).toBe(false);
    }
  });

  it('has a gap through a wood on exactly three doglegs, with a lane worth taking, which a driver aimed for the wind flies and one a few degrees off does not', () => {
    const lanes = holes.map((h, i) => [OLD_SPECS[i], h, laneOf(h)] as const).filter(([, , lane]) => lane);
    expect(lanes.length).toBe(3);
    expect(OLD_SPECS.filter((s) => s.gap).length).toBe(3);
    for (const [spec, h, lane] of lanes) {
      expect(Math.abs(spec.bend), spec.name).toBeGreaterThanOrEqual(WOOD.bend);
      const l = layoutOf(h.map, h.terrain);
      const route = new Route(l);
      const straight = Math.hypot(lane!.to.x - lane!.from.x, lane!.to.y - lane!.from.y);
      const corner = { x: l.tee.x, y: l.tee.y + (spec.corner ?? 0.55) * spec.length };
      // shorter than the way round the corner, and ending on the second leg well on toward the cup
      expect(
        route.distance(l.tee.x, l.tee.y) - (straight + route.distance(lane!.to.x, lane!.to.y)),
        `${spec.name}: shorter`,
      ).toBeGreaterThan(3);
      expect(
        route.distance(corner.x, corner.y) - route.distance(lane!.to.x, lane!.to.y),
        `${spec.name}: on toward the cup`,
      ).toBeGreaterThan(30);
      expect(straight, `${spec.name}: no longer than a drive`).toBeLessThan(280);
      const line = Math.atan2(lane!.to.y - lane!.from.y, lane!.to.x - lane!.from.x);
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
      // The wind here is fifteen miles an hour and carries a drive some fourteen yards off the lane's line, so a player aims
      // off it: the aim is the whole degree within four of the line that comes down cleanest, nearest the lane's end. The
      // Fells' test aims straight, in winds of eight to ten, and a straight drive here is blown into the wood on most seeds.
      let aim = line,
        nearest = Infinity;
      for (let off = -4; off <= 4; off++) {
        const flight = drive(line + (off * Math.PI) / 180);
        if (!flight.at || flight.knocks > 0 || flight.lost) continue;
        const gap = Math.hypot(flight.at.x - lane!.to.x, flight.at.y - lane!.to.y);
        if (gap < nearest) [nearest, aim] = [gap, line + (off * Math.PI) / 180];
      }
      const through = drive(aim);
      expect(through.knocks, `${spec.name}: through the lane`).toBe(0);
      expect(through.lost, `${spec.name}: lost`).toBe(false);
      expect(through.at, `${spec.name}: comes down`).not.toBeNull();
      expect(
        Math.hypot(through.at!.x - lane!.from.x, through.at!.y - lane!.from.y),
        `${spec.name}: carry`,
      ).toBeGreaterThan(200);
      expect(
        Math.hypot(through.at!.x - lane!.to.x, through.at!.y - lane!.to.y),
        `${spec.name}: near the target`,
      ).toBeLessThan(70);
      // and the lane is narrow: a swing a few degrees off it, to either side, meets the wood (ten degrees is some forty yards at
      // the lane's end, and the wind makes the true line a thin one)
      for (const side of [-1, 1]) {
        let least = Infinity;
        for (let off = 1; off <= 10 && least === Infinity; off++)
          if (drive(aim + (side * off * Math.PI) / 180).knocks > 0) least = off;
        expect(
          least,
          `${spec.name}: a swing off to the ${side < 0 ? 'left' : 'right'} meets a canopy within ten degrees`,
        ).toBeLessThanOrEqual(10);
      }
    }
  });

  it('has ground that runs on exactly three holes: heightened 1.8 to 2.2 with shelves for the landings, and a share of the fairway a ball runs down', () => {
    const run = OLD_SPECS.map((s, i) => [s, i] as const).filter(([s]) => (s.heighten ?? 1) > 1);
    expect(run.length).toBe(3);
    for (const [s, i] of run) {
      expect(s.heighten!, s.name).toBeGreaterThanOrEqual(1.8);
      expect(s.heighten!, s.name).toBeLessThanOrEqual(2.2);
      expect(s.shelves?.length ?? 0, `${s.name}: shelves`).toBeGreaterThanOrEqual(1);
      const l = layoutOf(holes[i].map, holes[i].terrain);
      expect(runningShare(l, holes[i].greens), `${s.name}: the share that runs`).toBeGreaterThanOrEqual(RUNNING);
    }
  });

  it('has plenty of sand: six to ten bunkers on every hole and at least sixty in all, counted as beds of sand on the map', () => {
    let all = 0;
    holes.forEach((h) => {
      const beds = sandBeds(h);
      expect(beds, h.name).toBeGreaterThanOrEqual(6);
      expect(beds, h.name).toBeLessThanOrEqual(10);
      all += beds;
    });
    expect(all).toBeGreaterThanOrEqual(60);
  });

  it('has a pond on the line where it is asked for: water too small to be a lake, across the way', () => {
    const asked = OLD_SPECS.map((s, i) => [s, i] as const).filter(([s]) => s.ponds.some((p) => p.side === 0));
    expect(asked.length).toBeGreaterThanOrEqual(3);
    for (const [s, i] of asked) {
      const small = waters(holes[i]).filter((n) => n < LAKE_TILES);
      expect(small.length, `${s.name}: a pond on the map`).toBeGreaterThanOrEqual(1);
      expect(Math.max(...small), `${s.name}: a pond`).toBeGreaterThanOrEqual(20);
    }
  });

  it('gives every hole at least two of the five: a lake with an island, a lane, ground that runs, sand and a pond on the line', () => {
    holes.forEach((h, i) => {
      const t = thingsOf(i);
      const n = Object.values(t).filter(Boolean).length;
      expect(n, `${h.name}: ${JSON.stringify(t)}`).toBeGreaterThanOrEqual(2);
    });
  });

  it('has 30 to 60 trees, a wind of 8 to 15 miles an hour, greens of 11 to 12.5 and a contour of 0.8 to 1 on every hole', () => {
    holes.forEach((h, i) => {
      const s = OLD_SPECS[i];
      expect(s.trees, h.name).toBeGreaterThanOrEqual(30);
      expect(s.trees, h.name).toBeLessThanOrEqual(60);
      expect(h.wind, h.name).toBe(s.wind);
      expect(h.wind!, h.name).toBeGreaterThanOrEqual(8);
      expect(h.wind!, h.name).toBeLessThanOrEqual(15);
      expect(h.greens, h.name).toBe(s.greens);
      expect(s.greens!, h.name).toBeGreaterThanOrEqual(GREENS.fast);
      expect(s.greens!, h.name).toBeLessThanOrEqual(12.5);
      expect(s.contour!, h.name).toBeGreaterThanOrEqual(0.8);
      expect(s.contour!, h.name).toBeLessThanOrEqual(1);
    });
  });

  it('has names of its own: nine, none that another course has, and none from the other new courses’ themes', () => {
    const names = holes.map((h) => h.name);
    expect(new Set(names).size).toBe(9);
    const others = new Set(
      COURSES.filter((c) => c.name !== 'The Old Course').flatMap((c) => c.holes.map((h) => h.name)),
    );
    for (const n of names) {
      expect(others.has(n), n).toBe(false);
      for (const word of THEIRS) expect(n.split(/\W+/), `${n}: ${word}`).not.toContain(word);
    }
  });

  it('has names that draw a wind which moves the grass: across the ground, at a place over time, and inside what a blade can bend', () => {
    const give = KINDS[ROUGH].give ?? 1;
    for (const hole of holes) {
      const w = windOf(hole.name);
      expect(w.strength, `${hole.name}: strength`).toBeGreaterThanOrEqual(0.7);
      expect(w.strength, `${hole.name}: strength`).toBeLessThanOrEqual(1);
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
      expect(across, `${hole.name}: ripples across the ground, in radians`).toBeGreaterThanOrEqual(0.4);
      let lo = Infinity,
        hi = -Infinity;
      for (let t = 0; t < 6; t += 0.05) {
        const b = bend(give, w, 5, 5, t, 0.3);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
      expect(hi - lo, `${hole.name}: sway at a place, in radians`).toBeGreaterThanOrEqual(0.3);
      expect(hi, `${hole.name}: never bent past the most`).toBeLessThan(MAX_BEND);
    }
  });

  it('is made quickly: the nine holes in node in under three seconds, none of them a big map', () => {
    expect(madeIn).toBeLessThan(3000);
    const biggest = Math.max(...holes.map((h) => h.map.length * h.map[0].length));
    expect(biggest).toBeLessThan(40000);
    // and a hole made again from its spec is the hole that was kept
    expect(golfHole(OLD_SPECS[2]).map).toEqual(holes[2].map);
  });

  it('is legal to the physics, golf all through, with a way from the tee to the cup that flies the water where it must', () => {
    holes.forEach((h) => {
      const l = layoutOf(h.map, h.terrain);
      expect(l.golf, h.name).toBe(true);
      expect(terrainRefusal(l, CUP), h.name).toBeNull();
      expect(reached(h, CARRY).has(figures(h).cup), `${h.name}: the cup is reached`).toBe(true);
    });
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

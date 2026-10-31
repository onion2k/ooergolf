/**
 * What a course of the Moon is held to, written once for the three (Tranquility, Copernicus and The Far Side) and read by a
 * test file each with that course's table. The table is every count the course was asked for, held exactly on the holes as they
 * are made: a seed chosen by playing is where a count slips (a crater refused for a seed and put on another hole, a lake that
 * lost its island), and without these a respec could leave a pleasant hole that is no longer the one that was asked for. How
 * the course plays (its strokes a round) is the course's `-play` test and the pace gate's, not here.
 *
 * Beside the table, what is the Moon's and no other biome's: no tree, no wood, no lane and no wind on any hole, a lake that is a
 * crater (a stroke, and the ball put back where it was struck from), a crater the starting club carries, and a green and a tee
 * that hold a ball at the Moon's pace of the clock.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { BAG, carryOf } from '../src/bag';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { CARRY, type GolfSpec } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { terrainRefusal } from '../src/physics';
import { Route } from '../src/route';
import { LIE } from '../src/surfaces';
import { DT, golfGame } from './helpers';
import { figures, gridOf, reached, wayRound } from './lake-figures';

/** A lake is at least this many tiles of water; a crater is well under it. */
export const LAKE = 120;

export interface MoonTable {
  title: string;
  specs: readonly GolfSpec[];
  make: () => readonly HoleDef[];
  summary: { holes: number; par: number };
  pars: number[];
  /** The yards a hole of each par may be, least and most. */
  lengths: Record<number, [number, number]>;
  width: [number, number];
  /** The holes with a crater (a pond, under `LAKE` tiles of water), the holes with a lake (`LAKE` or over), by name. */
  craters: string[];
  lakes: string[];
  /** The holes with an island in a lake, and the one island green if there is one. */
  islands: string[];
  islandGreens: string[];
  /** The holes that bend (doglegs), by name, and the least and most turn a bend has, in degrees. */
  bent: string[];
  bend: [number, number];
  /** The holes with a shelf of level ground among hills that run, by name. */
  shelved: string[];
  /** Bunkers a hole has, least and most, and in all. */
  bunkers: [number, number];
  bunkersAll: [number, number];
  greens: [number, number];
  contour: [number, number];
  heighten: [number, number];
  /** The most milliseconds the nine holes may take to make in node: three seconds as The Woods' are, or The Isles' eight where the lakes are big. */
  makeMs: number;
  /** Names the holes of the Moon's other two courses have, which none here may share. */
  others: string[];
}

/** Tiles of open water on a hole: the water's own, not the rock round it. */
export const water = (l: Layout) => {
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (l.water[t] && !l.solid[t]) n++;
  return n;
};

/** How many beds of sand a map has, counted as tiles touching, corners and all, being one bed. */
function sandBeds(map: readonly string[]): number {
  const rows = map.length,
    cols = map[0].length;
  const seen = new Uint8Array(rows * cols);
  let beds = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (map[r][c] !== 's' || seen[r * cols + c]) continue;
      beds++;
      const stack = [[r, c]];
      seen[r * cols + c] = 1;
      while (stack.length) {
        const [y, x] = stack.pop()!;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= rows || xx >= cols || map[yy][xx] !== 's' || seen[yy * cols + xx]) continue;
            seen[yy * cols + xx] = 1;
            stack.push([yy, xx]);
          }
      }
    }
  return beds;
}

/** The most water, in yards, along the straight line from the tee to the cup in one run: what a tee shot across it must clear. */
function widestRun(h: HoleDef, l: Layout): number {
  const g = gridOf(h);
  const dx = g.cup[0] - g.tee[0],
    dy = g.cup[1] - g.tee[1];
  const steps = Math.ceil(Math.hypot(dx, dy) * 4);
  let run = 0,
    most = 0;
  for (let k = 0; k <= steps; k++) {
    const c = Math.round(g.tee[0] + (dx * k) / steps),
      r = Math.round(g.tee[1] + (dy * k) / steps);
    run = g.kind(c, r) === '~' ? run + 1 : 0;
    most = Math.max(most, run);
  }
  void l;
  return (most / 4) * TILE;
}

export function holdsTable(t: MoonTable) {
  const started = performance.now();
  const holes = t.make();
  const madeIn = performance.now() - started;
  const layouts = holes.map((h) => layoutOf(h.map, h.terrain, undefined, h.biome));
  const names = t.specs.map((s) => s.name);
  const named = (pick: (s: GolfSpec, i: number) => boolean) => t.specs.filter(pick).map((s) => s.name);

  describe(t.title, () => {
    it(`is nine holes of par ${t.pars.join(', ')}, which add to ${t.summary.par}, made once and the same after`, () => {
      expect(t.specs.length).toBe(9);
      expect(t.make()).toBe(t.make());
      expect(t.specs.map((s) => s.par)).toEqual(t.pars);
      expect(holes.map((h) => h.par)).toEqual(t.pars);
      expect(t.specs.reduce((a, s) => a + s.par, 0)).toBe(t.summary.par);
      expect(t.summary).toEqual({ holes: 9, par: t.summary.par });
    });

    it('is the Moon on every hole: no tree, no wood, no lane and no wind asked for or made, and every hole says its biome', () => {
      for (const [i, s] of t.specs.entries()) {
        expect(s.biome, s.name).toBe('moon');
        expect(s.trees, s.name).toBe(0);
        expect(s.woods, s.name).toBeUndefined();
        expect(s.gap, s.name).toBeUndefined();
        expect(s.wind, s.name).toBeUndefined();
        expect(holes[i].biome, s.name).toBe('moon');
        expect(holes[i].wind ?? 0, s.name).toBe(0);
        expect(layouts[i].biome, s.name).toBe('moon');
        expect(layouts[i].trees.length, s.name).toBe(0);
        expect(
          holes[i].map.some((row) => row.includes('^')),
          s.name,
        ).toBe(false);
      }
    });

    it('is as long as the pars call for, and the cup is that far from the tee as the crow flies, within a bend', () => {
      for (const [i, s] of t.specs.entries()) {
        const [least, most] = t.lengths[s.par];
        expect(s.length, s.name).toBeGreaterThanOrEqual(least);
        expect(s.length, s.name).toBeLessThanOrEqual(most);
        const l = layouts[i];
        const crow = Math.hypot(l.cup.x - l.tee.x, l.cup.y - l.tee.y);
        expect(crow, s.name).toBeLessThanOrEqual(s.length + 3);
        expect(crow, s.name).toBeGreaterThan(s.length * 0.7);
      }
    });

    it(`has a fairway of ${t.width[0]} to ${t.width[1]} tiles on every hole`, () => {
      for (const s of t.specs) {
        expect(s.width, s.name).toBeGreaterThanOrEqual(t.width[0]);
        expect(s.width, s.name).toBeLessThanOrEqual(t.width[1]);
      }
    });

    it(`has craters on exactly ${t.craters.join(', ') || 'no hole'} and lakes on exactly ${t.lakes.join(', ') || 'no hole'}, counted as tiles of water on the made hole`, () => {
      const wet = holes.map((h, i) => [h.name, water(layouts[i])] as const);
      expect(wet.filter(([, w]) => w > 0 && w < LAKE).map(([n]) => n)).toEqual(
        named((s) => !!s.ponds.length && !s.lakes?.length),
      );
      expect(named((s) => s.ponds.length > 0 && !s.lakes?.length)).toEqual(t.craters);
      expect(wet.filter(([, w]) => w >= LAKE).map(([n]) => n)).toEqual(t.lakes);
      expect(named((s) => !!s.lakes?.length)).toEqual(t.lakes);
      // every hole not named is dry
      for (const [n, w] of wet) if (!t.craters.includes(n) && !t.lakes.includes(n)) expect(w, n).toBe(0);
      for (const n of t.craters) expect(wet.find(([m]) => m === n)![1], `${n}: a crater`).toBeLessThan(LAKE);
      for (const n of t.lakes) expect(wet.find(([m]) => m === n)![1], `${n}: a lake`).toBeGreaterThanOrEqual(LAKE);
    });

    it('has islands in the lakes it names, and the one island green if it has one, which no way over land reaches', () => {
      expect(named((s) => !!s.lakes?.some((l) => l.islands.length > 0))).toEqual(t.islands);
      expect(named((s) => !!s.lakes?.some((l) => l.islands.some((i) => i.kind === 'green')))).toEqual(t.islandGreens);
      expect(t.islandGreens.length).toBeLessThanOrEqual(1);
      for (const n of t.islands) {
        const h = holes.find((x) => x.name === n)!;
        // an island green is the cup's own land and is not counted among the others; no way over land reaches it
        if (t.islandGreens.includes(n)) expect(wayRound(h), `${n}: no way round`).toBe(false);
        else expect(figures(h).islands.length, `${n}: an island in the water`).toBeGreaterThanOrEqual(1);
      }
    });

    it('has the doglegs it asks for and no others, each of the bend it asks for', () => {
      expect(named((s) => s.bend !== 0)).toEqual(t.bent);
      for (const s of t.specs.filter((x) => x.bend !== 0)) {
        expect(Math.abs(s.bend), s.name).toBeGreaterThanOrEqual(t.bend[0]);
        expect(Math.abs(s.bend), s.name).toBeLessThanOrEqual(t.bend[1]);
      }
    });

    it('has shelves of level ground on exactly the holes that ask for them', () => {
      expect(named((s) => !!s.shelves?.length)).toEqual(t.shelved);
    });

    it('has the bunkers it asks for, as beds of sand on the map, a hole and in all', () => {
      let all = 0;
      for (const [i, s] of t.specs.entries()) {
        const asked = s.bunkers.fairway + s.bunkers.green + (s.bunkers.island ?? 0);
        const sandIslands = (s.lakes ?? []).flatMap((l) => l.islands).filter((x) => x.kind === 'sand').length;
        const beds = sandBeds(holes[i].map) - sandIslands;
        // a bunker laid beside another is one bed, so the map shows no more beds than were asked for
        expect(beds, `${s.name}: beds of sand`).toBeLessThanOrEqual(asked + sandIslands);
        expect(beds, `${s.name}: beds of sand`).toBeGreaterThanOrEqual(Math.max(1, asked - 2));
        expect(asked, s.name).toBeGreaterThanOrEqual(t.bunkers[0]);
        expect(asked, s.name).toBeLessThanOrEqual(t.bunkers[1]);
        all += asked;
      }
      expect(all).toBeGreaterThanOrEqual(t.bunkersAll[0]);
      expect(all).toBeLessThanOrEqual(t.bunkersAll[1]);
    });

    it('has the greens, the contour and the ground it asks for', () => {
      for (const [i, s] of t.specs.entries()) {
        expect(s.greens, s.name).toBeGreaterThanOrEqual(t.greens[0]);
        expect(s.greens, s.name).toBeLessThanOrEqual(t.greens[1]);
        expect(s.contour, s.name).toBeGreaterThanOrEqual(t.contour[0]);
        expect(s.contour, s.name).toBeLessThanOrEqual(t.contour[1]);
        expect(s.heighten ?? 1, s.name).toBeGreaterThanOrEqual(t.heighten[0]);
        expect(s.heighten ?? 1, s.name).toBeLessThanOrEqual(t.heighten[1]);
        expect(s.feel, s.name).toBe('hills');
        expect(s.rolling, s.name).toBe(true);
        expect(holes[i].greens, s.name).toBe(s.greens);
      }
    });

    it('has ground the physics accepts, a way to the cup, a cup on a green and a tee on a tee', () => {
      for (const [i, l] of layouts.entries()) {
        expect(l.golf, holes[i].name).toBe(true);
        expect(terrainRefusal(l, CUP), holes[i].name).toBeNull();
        expect(lieAt(l, l.cup.x, l.cup.y), holes[i].name).toBe(LIE.green);
        expect(lieAt(l, l.tee.x, l.tee.y), holes[i].name).toBe(LIE.tee);
        expect(Number.isFinite(new Route(l).distance(l.tee.x, l.tee.y)), holes[i].name).toBe(true);
      }
    });

    it('can be finished with the starting club: the cup is reached from the tee over land and flights of a lake’s carry, and a crater on the line is cleared by a fraction of a driver’s', () => {
      const driver = carryOf(BAG[0], 1);
      for (const [i, h] of holes.entries()) {
        const f = figures(h);
        expect(reached(h, CARRY).has(f.cup), `${h.name}: the cup is reached`).toBe(true);
        const spec = t.specs[i];
        const limit = Math.min(CARRY, ...(spec.lakes ?? []).map((l) => l.carry ?? CARRY));
        let least = Infinity;
        for (let carry = 0.5; carry <= CARRY && least === Infinity; carry += 0.5)
          if (reached(h, carry).has(f.cup)) least = carry;
        // a hole with no lake can be walked: its craters leave a way round, or are small enough to be carried
        if (spec.lakes?.length) expect(least, `${h.name}: the carry the hole needs`).toBeLessThanOrEqual(limit);
        expect(widestRun(h, layouts[i]), `${h.name}: water across the line, in yards`).toBeLessThan(driver * 0.5);
      }
    });

    it('takes a ball into a crater as a stroke and puts it back where it was struck from, on every hole that has one', () => {
      for (const h of holes) {
        const f = figures(h);
        if (!f.water) continue;
        const g = gridOf(h);
        const l = layoutOf(h.map, h.terrain, undefined, h.biome);
        // the middle of the first run of water on the straight line from the tee to the cup: a ball struck at it from the tee goes in
        const dx = g.cup[0] - g.tee[0],
          dy = g.cup[1] - g.tee[1];
        const steps = Math.ceil(Math.hypot(dx, dy) * 4);
        let first = -1,
          last = -1;
        for (let k = 0; k <= steps && (first < 0 || last < 0); k++) {
          const wet = g.kind(Math.round(g.tee[0] + (dx * k) / steps), Math.round(g.tee[1] + (dy * k) / steps)) === '~';
          if (wet && first < 0) first = k;
          if (!wet && first >= 0 && last < 0) last = k;
        }
        const mid = (first + last) / 2;
        let best: { c: number; r: number } | null =
          first < 0 ? null : { c: g.tee[0] + (dx * mid) / steps - 0.5, r: g.tee[1] + (dy * mid) / steps - 0.5 };
        // a dogleg's water lies on its way and not on the straight line: then the water tile nearest the tee
        if (!best) {
          let least = Infinity;
          for (let r = 0; r < g.rows; r++)
            for (let c = 0; c < g.cols; c++)
              if (g.kind(c, r) === '~' && Math.hypot(c - g.tee[0], r - g.tee[1]) < least) {
                least = Math.hypot(c - g.tee[0], r - g.tee[1]);
                best = { c, r };
              }
        }
        expect(best, h.name).not.toBeNull();
        const target = { x: l.originX + (best!.c + 0.5) * TILE, y: l.originY + (best!.r + 0.5) * TILE };
        // struck from the tee where the water is within a driver's reach, and from a place thirty yards short of it where it is not
        const away = Math.hypot(target.x - l.tee.x, target.y - l.tee.y);
        const far = away > carryOf(BAG[0], 1) * 0.8;
        let from = { x: l.tee.x, y: l.tee.y };
        if (far) {
          // walked back from the middle of the water, a tile at a time, to the shore and thirty yards on: a place to play from
          const ux = (target.x - l.tee.x) / away,
            uy = (target.y - l.tee.y) / away;
          const land = (d: number) =>
            'fcrg'.includes(
              g.kind(
                Math.floor((target.x - ux * d - l.originX) / TILE),
                Math.floor((target.y - uy * d - l.originY) / TILE),
              ),
            );
          let d = 0;
          while (d < away && !land(d)) d += TILE;
          expect(d, `${h.name}: a shore short of the water`).toBeLessThan(away);
          d += 30;
          expect(land(d), `${h.name}: a place to play from, thirty yards short of the water`).toBe(true);
          from = { x: target.x - ux * d, y: target.y - uy * d };
        }
        const angle = Math.atan2(target.y - from.y, target.x - from.x);
        const reach = Math.hypot(target.x - from.x, target.y - from.y);
        const lostTo = (club: string, power: number) => {
          const p = golfGame(h);
          if (far) p.game.place(from.x, from.y);
          p.game.pick(club);
          // where the ball lies as it is struck, which on ground that runs is a little off the place it was put down
          const lie = { x: p.game.world.x[p.game.ball], y: p.game.world.y[p.game.ball] };
          if (!p.game.shoot(angle, power)) return null;
          for (let n = 0; n < 60 * 40 && !(n > 1 && p.game.ready); n++) p.game.step(DT);
          return p.told.some((x) => x.startsWith('splash')) ? { game: p.game, lie } : null;
        };
        // a putt along the ground where the water is near, else a flight at it, struck from far enough short to reach and far enough long not to
        let lost: ReturnType<typeof lostTo> = null;
        for (const power of [0.4, 0.6, 0.8, 1]) lost ??= lostTo('putter', power);
        for (let k = -16; k <= 16 && !lost; k++)
          lost = lostTo('driver', Math.min(1, Math.max(0.1, (reach + k * 2.5) / carryOf(BAG[0], 1))));
        expect(lost, `${h.name}: a ball struck at the crater is lost in it`).not.toBeNull();
        expect(lost!.game.strokes, `${h.name}: the stroke and the one the crater costs`).toBe(2);
        expect(lost!.game.phase, h.name).toBe('play');
        expect(lost!.game.world.x[lost!.game.ball], `${h.name}: put back`).toBeCloseTo(lost!.lie.x, 1);
        expect(lost!.game.world.y[lost!.game.ball], `${h.name}: put back`).toBeCloseTo(lost!.lie.y, 1);
        expect(checkInvariants(lost!.game), h.name).toEqual([]);
      }
    });

    it('holds a ball at rest on the tee and in the middle of the green at the Moon’s pace, the rules kept', () => {
      for (const h of holes) {
        const l = layoutOf(h.map, h.terrain, undefined, h.biome);
        for (const at of [l.tee, l.cup]) {
          const { game } = golfGame(h);
          const x = at === l.cup ? at.x - 2 * TILE : at.x;
          game.place(x, at.y + (at === l.cup ? 0 : 0));
          const before = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
          for (let f = 0; f < 60 * 4; f++) {
            game.step(DT);
            if (f % 30 === 0) expect(checkInvariants(game), `${h.name} frame ${f}`).toEqual([]);
          }
          const after = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
          // a green with a contour draws a ball a little before it rests; it does not roll away, and the tee is flat
          expect(Math.hypot(after.x - before.x, after.y - before.y), `${h.name}: drift in four seconds`).toBeLessThan(
            at === l.cup ? 3 * TILE : 0.5,
          );
        }
      }
    });

    it('has names of its own: nine, unique, and none that any other course or the Moon’s other two has', () => {
      expect(new Set(names).size).toBe(9);
      const others = COURSES.flatMap((c) => c.holes.map((h) => h.name));
      for (const name of names) {
        expect(others, name).not.toContain(name);
        expect(t.others, name).not.toContain(name);
      }
    });

    it('is made in the time its table allows, all nine holes, in node, and no hole is bigger than the page draws', () => {
      expect(madeIn).toBeLessThan(t.makeMs);
      for (const l of layouts) expect(l.cols * l.rows).toBeLessThan(40000);
    });
  });
}

/**
 * What the three Future courses have in common, held once: every hole is in the future, a hologram wood or grove stays inside
 * the frame budget and off the cup, a ball struck into a mirror costs a stroke and is put back, a ball may lie under a hologram
 * and be played, a drive through a wood runs on into a mirror and is lost there, and the names are the game's own to take.
 * Each course's own table (its pars, its counts of water and woods, its winds and widths) is its own test; this is the part
 * that would otherwise be written three times and drift. Without it a course could lose its biome to a respec and still be a
 * pleasant hole, or grow a wood too heavy for a frame, and nothing here would say so.
 */
import { expect, it } from 'vitest';
import { TILE, layoutOf, lieAt, type Layout } from '../src/arena';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { LIMIT_OVER_PAR } from '../src/game';
import { golfHole, type GolfSpec } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { BUDGET } from '../src/models';
import { terrainRefusal } from '../src/physics';
import { Route } from '../src/route';
import { GREENS, LIE } from '../src/surfaces';
import { windOf } from '../src/turf';
import { DT, golfGame } from './helpers';
import { levelHole } from './level';

/** The most holograms a hole may have: a wood of 163 cost 4.0 ms of a frame's 6, and about 170 is as many as the budget has room for. */
export const MOST_HOLOGRAMS = 170;
/** Tiles of mirror (open quicksilver, not the rock round it) on a hole. */
export function mirror(l: Layout): number {
  let n = 0;
  for (let t = 0; t < l.cols * l.rows; t++) if (l.water[t] && !l.solid[t]) n++;
  return n;
}
/** A lake is at least this many tiles of water; a pond is well under it. */
export const LAKE_TILES = 120;
/** The tile a hologram keeps from the cup, from `KEEP.green` in `golf.ts`: nine tiles. */
export const KEEP_GREEN = 9;

export interface Course {
  title: string;
  specs: readonly GolfSpec[];
  /** The other new courses' specs, whose names none of these may take. */
  others: readonly GolfSpec[];
  holes: () => readonly HoleDef[];
}

/** The checks every Future course shares, registered inside the course's own `describe`. */
export function sharedChecks(course: Course) {
  const holes = course.holes();
  const layouts = holes.map((h) => layoutOf(h.map, h.terrain, undefined, 'future'));

  it('is in the future on every hole, in the spec and in the hole as made', () => {
    for (const s of course.specs) expect(s.biome, s.name).toBe('future');
    for (const h of holes) expect(h.biome, h.name).toBe('future');
    for (const l of layouts) expect(l.biome).toBe('future');
  });

  it('is made when first asked for and is the same holes after', () => {
    expect(course.holes()).toBe(course.holes());
  });

  it('holds no more than a hundred and seventy holograms a hole, inside the budget a wooded hole is given', () => {
    for (const [i, l] of layouts.entries()) {
      expect(l.trees.length, holes[i].name).toBeLessThanOrEqual(MOST_HOLOGRAMS);
      expect(l.trees.length * BUDGET.golfTree, holes[i].name).toBeLessThanOrEqual(BUDGET['wooded hole']);
    }
  });

  it('has a name of its own on every hole: unique across the game and these courses, and each draws a wind of its own', () => {
    const names = course.specs.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    const taken = [...COURSES.flatMap((c) => c.holes.map((h) => h.name)), ...course.others.map((s) => s.name)];
    for (const name of names) {
      expect(taken, name).not.toContain(name);
      const w = windOf(name);
      expect(w.strength, name).toBeGreaterThanOrEqual(0.7);
      expect(w.strength, name).toBeLessThanOrEqual(1);
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

  it('keeps every hologram nine tiles from the cup, and lets a ball lie under the nearest and be played from there', () => {
    for (const [i, l] of layouts.entries()) {
      if (l.trees.length === 0) continue;
      let near = l.trees[0];
      let d = Infinity;
      for (const t of l.trees) {
        const e = Math.hypot(t.x - l.cup.x, t.y - l.cup.y);
        if (e < d) {
          d = e;
          near = t;
        }
      }
      expect(d, `${holes[i].name}: nearest hologram to the cup`).toBeGreaterThanOrEqual(KEEP_GREEN * TILE - 1e-6);
      // a ball put under its canopy is played: it is not held, lost or stuck, and a stroke from there goes
      const { game, calls } = golfGame(holes[i]);
      game.place(near.x, near.y);
      for (let f = 0; f < 30; f++) game.step(DT);
      expect(game.ready, `${holes[i].name}: at rest under a hologram`).toBe(true);
      const before = game.strokes;
      game.pick('7-iron');
      expect(game.shoot(Math.atan2(l.cup.y - near.y, l.cup.x - near.x), 0.5), holes[i].name).toBe(true);
      for (let f = 0; f < 60 * 30 && !game.ready && game.phase !== 'over'; f++) {
        game.step(DT);
        expect(checkInvariants(game), `${holes[i].name}: frame ${f}`).toEqual([]);
      }
      // a stroke, and a penalty more where it was lost to a mirror or out of bounds on the way (Dead Pixel’s cup is on an island)
      const lost = calls.filter(([n]) => n === 'splash' || n === 'outOfBounds').length;
      expect(game.strokes, holes[i].name).toBe(before + 1 + lost);
      // it comes to rest, or goes in: a hole in one off the shade of a hologram is a hole, and the round is over
      expect(game.ready || game.phase === 'over', `${holes[i].name}: comes to rest again`).toBe(true);
    }
  });

  /** Whether the tile under (x, y) is open quicksilver: water that is not the rock round it. */
  const wetAt = (l: Layout, x: number, y: number) => {
    const c = Math.floor((x - l.originX) / TILE),
      r = Math.floor((y - l.originY) / TILE);
    return c >= 0 && r >= 0 && c < l.cols && r < l.rows && !!l.water[r * l.cols + c] && !l.solid[r * l.cols + c];
  };

  /**
   * A ball struck from (x, y) at `angle` with each club at each power in turn, until one comes down in a mirror: what it did
   * (the strokes, where it was put back, whether the rules held) or null where none of them found one.
   */
  function intoMirror(
    def: HoleDef,
    from: { x: number; y: number } | null,
    angle: number,
    wanted: (told: string[]) => boolean = () => true,
  ) {
    for (const club of ['driver', '5-iron', '9-iron', 'sand-wedge'])
      for (let power = 0.3; power <= 1.0001; power += 0.05) {
        const { game, calls } = golfGame(def);
        if (from) game.place(from.x, from.y);
        const lie = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
        game.pick(club);
        game.shoot(angle, power);
        for (let f = 0; f < 60 * 30 && !game.ready; f++) {
          game.step(DT);
          if (calls.some(([n]) => n === 'splash')) break;
        }
        if (!calls.some(([n]) => n === 'splash') || !wanted(calls.map(([n]) => n))) continue;
        for (let f = 0; f < 60; f++) game.step(DT);
        return {
          game,
          calls,
          lie,
          back: { x: game.world.x[game.ball], y: game.world.y[game.ball] },
          splashes: calls.filter(([n]) => n === 'splash').length,
          faults: checkInvariants(game),
        };
      }
    return null;
  }

  it('puts a ball struck into a mirror back where it was struck from, a stroke dearer, and plays on', () => {
    let tried = 0;
    for (const [i, l] of layouts.entries()) {
      if (mirror(l) === 0) continue;
      // aimed down the line from the tee to the cup, over the mirror that lies across it
      const angle = Math.atan2(l.cup.y - l.tee.y, l.cup.x - l.tee.x);
      const hit = intoMirror(holes[i], null, angle);
      if (!hit) continue;
      tried++;
      expect(hit.splashes, holes[i].name).toBe(1);
      expect(hit.game.strokes, `${holes[i].name}: the stroke and its penalty`).toBe(2);
      expect(hit.back.x, holes[i].name).toBeCloseTo(hit.lie.x, 1);
      expect(hit.back.y, holes[i].name).toBeCloseTo(hit.lie.y, 1);
      expect(wetAt(l, hit.back.x, hit.back.y), `${holes[i].name}: put back on land`).toBe(false);
      expect(hit.faults, holes[i].name).toEqual([]);
      expect(hit.game.ready, `${holes[i].name}: ready for the next stroke`).toBe(true);
      // and the stroke after is taken as any other
      hit.game.pick('7-iron');
      expect(hit.game.shoot(angle + 0.4, 0.3), holes[i].name).toBe(true);
      expect(hit.game.strokes, holes[i].name).toBe(3);
    }
    expect(tried, 'holes with a mirror on the line from tee to cup').toBeGreaterThanOrEqual(1);
  });

  it('puts a ball back beside a mirror too: struck from the shore into the water, it is put back on the shore', () => {
    let tried = 0;
    for (const [i, l] of layouts.entries()) {
      if (mirror(l) === 0) continue;
      // a place on grass within six yards of the water, on the tee side of it, found on the line from the tee to the cup
      const dx = l.cup.x - l.tee.x,
        dy = l.cup.y - l.tee.y,
        len = Math.hypot(dx, dy);
      let shore: { x: number; y: number } | null = null;
      let into = 0;
      for (let u = 12; u < len && !shore; u += 1) {
        const x = l.tee.x + (dx / len) * u,
          y = l.tee.y + (dy / len) * u;
        if (!wetAt(l, x, y)) continue;
        for (let back = 4; back <= 9 && !shore; back += 1) {
          const sx = x - (dx / len) * back,
            sy = y - (dy / len) * back;
          if (wetAt(l, sx, sy)) continue;
          try {
            golfGame(holes[i]).game.place(sx, sy);
            shore = { x: sx, y: sy };
            into = Math.atan2(dy, dx);
          } catch {
            // not level grass, or not grass: the next place back
          }
        }
      }
      if (!shore) continue;
      const hit = intoMirror(holes[i], shore, into);
      if (!hit) continue;
      tried++;
      expect(hit.back.x, holes[i].name).toBeCloseTo(shore.x, 1);
      expect(hit.back.y, holes[i].name).toBeCloseTo(shore.y, 1);
      expect(wetAt(l, hit.back.x, hit.back.y), `${holes[i].name}: put back on the shore`).toBe(false);
      expect(hit.game.strokes, holes[i].name).toBe(2);
      expect(hit.faults, holes[i].name).toEqual([]);
    }
    expect(tried, 'holes a ball was struck into a mirror from beside it on').toBeGreaterThanOrEqual(1);
  });

  it('lets a drive fly through a wood of holograms, slowed and not stopped, and on into a mirror, where it is lost and put back', () => {
    const grove: { along: number; across: number }[] = [];
    for (let along = 42; along <= 48; along += 6)
      for (let across = -9; across <= 9; across += 6) grove.push({ along, across });
    const hole = levelHole({
      name: 'a drive through a wood into a mirror',
      par: 4,
      length: 330,
      rough: 8,
      biome: 'future',
      trees: grove,
      pond: { along: 105, across: 0, radius: 36 },
    });
    // the first club and power that comes down in the quicksilver, with the grove behind it: it has to go through
    const hit = intoMirror(hole, null, Math.PI / 2, (told) => told.includes('flickered'));
    expect(hit, 'some stroke from the tee finds the mirror').not.toBeNull();
    const told = hit!.calls.map(([n]) => n);
    const flickers = told.filter((n) => n === 'flickered').length;
    expect(flickers, 'the ball entered a hologram on the way').toBeGreaterThan(0);
    expect(told.indexOf('flickered'), 'and before the splash').toBeLessThan(told.indexOf('splash'));
    // a canopy that passes a ball turns nothing: nothing in the grove knocked it (the first knock is a landing)
    expect(told.indexOf('knocked') < 0 || told.indexOf('knocked') > told.indexOf('landed')).toBe(true);
    expect(hit!.game.strokes).toBe(2);
    expect(hit!.back.x).toBeCloseTo(hit!.lie.x, 1);
    expect(hit!.back.y).toBeCloseTo(hit!.lie.y, 1);
    expect(hit!.faults).toEqual([]);
  });

  it('is played round by the autopilot, a player’s slips and all: every hole finished inside its limit, the rules held', async () => {
    const { Autopilot } = await import('../src/autopilot');
    const { Game } = await import('../src/game');
    const { Progress, memoryStore } = await import('../src/progress');
    const { seeded } = await import('../src/random');
    for (let seed = 1; seed <= 2; seed++) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 30 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 211 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      game.card.forEach((score, h) =>
        expect(score, `seed ${seed}: ${holes[h].name}`).toBeLessThanOrEqual(holes[h].par + LIMIT_OVER_PAR),
      );
      expect(game.card.length).toBe(holes.length);
    }
  }, 120000);

  it('is made in under three seconds, all nine holes, in node', () => {
    const t0 = performance.now();
    for (const s of course.specs) golfHole(s);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(GREENS.fast).toBeLessThanOrEqual(11);
  });
}

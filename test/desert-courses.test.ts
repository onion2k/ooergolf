/**
 * What the desert's three courses are to one another, and the edge cases of play they reach that a hole of earth does not: a
 * pan under a tee shot and beside a green, a run-out off a pan out of bounds, cacti near the cup. A pan is ground with no penalty,
 * so with no water the hazards are the cactus, the wind, the stakes, the sand and the run of the ground; each is tried here on the
 * holes as made, and on a hole made by hand where the case needs a place no seed can be asked for. Every count of each course is its
 * own test file's (`saltpan`, `mesa` and `badlands`), and every pace is `desert-pace.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { TILE, lieAt } from '../src/arena';
import type { HoleDef } from '../src/course';
import { LIE } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';
import { DESERT, madeOf, takenNames, tiles, type DesertName } from './desert';

const courses = (Object.keys(DESERT) as DesertName[]).map((name) => ({ name, ...madeOf(DESERT[name]) }));
const all = courses.flatMap((c) =>
  c.holes.map((hole, i) => ({ course: c.name, hole, layout: c.layouts[i], spec: DESERT[c.name][i] })),
);

/** Plays one shot with `club` at `angle` and full power until the ball is ready again, returning what the game told. */
function play(hole: HoleDef, club: string, angle: number, onStep?: (x: number, y: number) => void) {
  const { game, calls } = golfGame(hole);
  game.pick(club);
  game.shoot(angle, 1);
  for (let f = 0; f < 60 * 30; f++) {
    game.step(DT);
    if (onStep) onStep(game.world.x[game.ball], game.world.y[game.ball]);
    if (f > 1 && game.ready) break;
  }
  return { game, calls };
}

describe('the desert courses together', () => {
  it('are twenty-seven holes with a name of their own: none of them is the name of a hole of any other course', () => {
    const names = all.map((h) => h.hole.name);
    expect(names.length).toBe(27);
    expect(new Set(names).size).toBe(27);
    for (const c of courses) {
      const taken = takenNames(c.name);
      for (const h of c.holes) expect(taken, h.name).not.toContain(h.name);
    }
  });

  it('have a pan under the tee shot on every hole that has one: a driver struck at the cup crosses it, is never lost to it and comes to rest', () => {
    let crossed = 0,
      holes = 0;
    for (const { hole, layout, spec } of all) {
      if (!spec.ponds.length || tiles(hole.map, 'd') === 0) continue;
      holes++;
      const aim = Math.atan2(layout.cup.y - layout.tee.y, layout.cup.x - layout.tee.x);
      const seen = { pan: false };
      const { game, calls } = play({ ...hole, wind: 0 }, 'driver', aim, (x, y) => {
        if (lieAt(layout, x, y) === LIE.pan) seen.pan = true;
      });
      expect(calls.filter(([n]) => n === 'splash').length, `${hole.name}: lost to a pan`).toBe(0);
      expect(game.ready, `${hole.name}: comes to rest`).toBe(true);
      if (seen.pan) crossed++;
    }
    // a check that never reached a pan passes in silence: a pan lies on the line of most of them, so most drives touch one
    expect(holes).toBe(18);
    expect(crossed, 'drives that came down on a pan or ran over one').toBeGreaterThanOrEqual(6);
  });

  it('skitter a ball over a pan before a green and on to it: struck from the fairway with a wedge, it is played from where it stops', () => {
    // a hole of hand: a fairway, a band of pan fifteen tiles wide just short of a green round the cup, in the desert
    const base = field('f', 130, 41, undefined, 1, 'desert');
    const map = base.map.map((row, r) => {
      if (r >= 1 && r <= 12) return row.replace(/f/g, 'g');
      if (r >= 13 && r <= 24) return row.replace(/f/g, 'd');
      return row;
    });
    const hole: HoleDef = { ...base, map };
    const { game, calls } = play(hole, 'sand-wedge', Math.PI / 2 + 0.1);
    expect(game.layout.biome).toBe('desert');
    expect(calls.filter(([n]) => n === 'splash' || n === 'outOfBounds').length).toBe(0);
    expect(game.ready).toBe(true);
    expect(game.strokes, 'one stroke, no penalty').toBe(1);
  });

  it('put a ball back when it runs off a pan out of bounds: a stroke for it, the ball where it was struck from, and nothing told of water', () => {
    // a fairway, a long pan and then the stakes, which a driver's run takes it across
    const base = field('f', 130, 41, undefined, 1, 'desert');
    const map = base.map.map((row, r) => {
      if (r >= 2 && r <= 8) return '#' + 'x'.repeat(39) + '#';
      if (r >= 9 && r <= 40) return '#' + 'd'.repeat(39) + '#';
      if (r === 1) return row.replace('C', 'f');
      return row;
    });
    map[100] = map[100].slice(0, 2) + 'C' + map[100].slice(3);
    const hole: HoleDef = { ...base, map };
    const { game, calls } = play({ ...hole, wind: 0 }, 'driver', Math.PI / 2);
    expect(calls.filter(([n]) => n === 'landed').length, 'hopped on the pan').toBeGreaterThan(1);
    expect(calls.filter(([n]) => n === 'outOfBounds').length, 'lost over the stakes').toBe(1);
    expect(calls.filter(([n]) => n === 'splash').length, 'told of water').toBe(0);
    expect(game.strokes, 'the stroke and its penalty').toBe(2);
    expect(game.ready, 'put back and ready').toBe(true);
    const tee = game.layout.tee;
    expect(
      Math.hypot(game.world.x[game.ball] - tee.x, game.world.y[game.ball] - tee.y),
      'where it was struck from',
    ).toBeLessThan(8);
  });

  it('keep the cacti from the cup: none within nine tiles of it where they are scattered, none within three where they are a wood', () => {
    for (const { hole, layout, spec } of all) {
      const near = Math.min(...layout.trees.map((t) => Math.hypot(t.x - layout.cup.x, t.y - layout.cup.y)));
      const least = (spec.woods ? 3 : 9) * TILE;
      expect(near, `${hole.name}: nearest cactus to the cup, in yards`).toBeGreaterThanOrEqual(least - 1e-6);
    }
  });
});

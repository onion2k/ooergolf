/**
 * The game on a golf hole: the club in hand, what a shot costs and pays, what the ball meets in the air and on the
 * way down (the rail, water, the cup), and the rules that must hold of it. The flight and the landing themselves are
 * tried in `landing.test.ts`; this is the round of golf they are played in.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT } from '../src/arena';
import { BAG, PUTTER, bagClub, carryOf } from '../src/bag';
import type { HoleDef } from '../src/course';
import { paid } from '../src/items';
import { checkInvariants, landingProblems } from '../src/invariants';
import { seeded } from '../src/random';
import { LANDING } from '../src/surfaces';
import { DT, field, golfGame, newGame } from './helpers';

const NORTH = Math.PI / 2;

/** Play until the ball is ready again or the hole is done, the rules checked every frame. */
function untilStill(game: ReturnType<typeof golfGame>['game'], seconds = 30) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    if (game.phase !== 'play' || (f > 1 && game.ready)) return;
  }
  throw new Error('the ball never came to rest');
}

describe('the club in hand', () => {
  it('is the driver on a tee, and can be changed to any club in the bag', () => {
    const { game } = golfGame(field('f'));
    expect(game.inHand).toBe(bagClub('driver'));
    for (const club of BAG) {
      expect(game.pick(club.id)).toBe(true);
      expect(game.inHand).toBe(club);
    }
  });

  it('is refused for a club that is not in the bag, and on a hole of minigolf, where there is only the putter', () => {
    const { game } = golfGame(field('f'));
    expect(game.pick('mashie')).toBe(false);
    expect(game.inHand).toBe(bagClub('driver'));
    const mini = newGame(1).game;
    expect(mini.pick('driver')).toBe(false);
    expect(mini.inHand).toBe(PUTTER);
  });

  it('sets how hard the shot may be, so the aim and the invariants have the club’s own top speed', () => {
    const { game } = golfGame(field('f'));
    for (const club of BAG) {
      game.pick(club.id);
      expect(game.hardest).toBe(club.hardest);
    }
    // a hole of minigolf has the course's putter, as it always had
    expect(newGame(1).game.hardest).toBe(HARDEST_SHOT);
  });

  it('is kept from one shot to the next on a hole, and the driver again at the next tee', () => {
    const two: HoleDef[] = [field('f'), { ...field('r'), name: 'Second field' }];
    const { game } = golfGame(two[0]);
    game.playCourse(two);
    game.pick('9-iron');
    game.startAt(1);
    expect(game.inHand).toBe(bagClub('driver'));
  });

  it('may be changed while the ball is in the air: what is struck is struck', () => {
    const { game } = golfGame(field('f'));
    game.pick('driver');
    game.shoot(NORTH, 1);
    game.step(DT * 20);
    expect(game.pick('putter')).toBe(true);
    untilStill(game);
    // it flew as a driver's, since that is what struck it
    expect(game.world.y[game.ball] - game.layout.tee.y).toBeGreaterThan(200);
  });
});

describe('a shot at golf', () => {
  it('is one stroke, however far or high, refused while the ball is in the air or rolling, and never in the rock', () => {
    const { game } = golfGame(field('f'));
    game.pick('driver');
    expect(game.shoot(NORTH, 1)).toBe(true);
    expect(game.strokes).toBe(1);
    game.step(DT * 30);
    expect(game.ready).toBe(false);
    expect(game.shoot(NORTH, 1), 'refused in the air').toBe(false);
    expect(game.strokes).toBe(1);
    untilStill(game);
    expect(game.shoot(NORTH, 0), 'and a shot of no power is none').toBe(false);
    expect(game.shoot(NORTH, 0.1)).toBe(true);
    expect(game.strokes).toBe(2);
  });

  it('tells of the first landing, where it carried to, and only that landing as the first', () => {
    const { game, told, calls } = golfGame(field('f'));
    game.pick('7-iron');
    game.shoot(NORTH, 1);
    untilStill(game);
    // the first is the first, and no other is: the page marks where a ball first came down and no further
    const flags = calls.filter(([name]) => name === 'landed').map(([, args]) => args[3]);
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags[0]).toBe(true);
    expect(flags.slice(1).every((f) => f === false)).toBe(true);
    // and the next stroke's first landing is a first again
    game.shoot(NORTH, 1);
    untilStill(game);
    const again = calls.filter(([name]) => name === 'landed').map(([, args]) => args[3]);
    expect(again.filter((f) => f === true).length, 'a first for each stroke').toBe(2);
    const landings = told.filter((t) => t.startsWith('landed '));
    expect(landings.length).toBeGreaterThanOrEqual(2);
    // (x, y, speed): the numbers told, and whether it was the first is the last, which a test's note leaves out
    const first = landings[0].split(' ').map(Number);
    expect(first[2] - game.layout.tee.y).toBeGreaterThan(carryOf(bagClub('7-iron'), 1) * 0.92);
    for (const l of landings) expect(Number(l.split(' ')[3])).toBeGreaterThanOrEqual(LANDING.least);
  });

  it('is played as a putt with the putter, along the ground, and tells of no landing', () => {
    const { game, told } = golfGame(field('g'));
    game.pick('putter');
    game.shoot(NORTH, 0.7);
    untilStill(game);
    expect(told.filter((t) => t.startsWith('landed ')).length).toBe(0);
    expect(game.world.z[game.ball]).toBeCloseTo(1, 1);
  });

  it('is scored, and pays into the shop as a hole of minigolf does: a hole in one pays its coins and its gem', () => {
    const hole = field('g');
    const { game, told } = golfGame(hole);
    game.pick('putter');
    // a putt from six units to the cup, arriving slow enough to drop
    game.place(game.layout.cup.x + 6, game.layout.cup.y);
    game.shoot(Math.PI, 0.14);
    untilStill(game);
    expect(game.phase).toBe('done');
    expect(told.filter((t) => t.startsWith('holed ')).length).toBe(1);
    expect(game.card).toEqual([1]);
    const due = paid(1, hole.par, false);
    expect(game.progress.save.coins).toBe(due.coins);
    expect(game.progress.save.gems).toBe(due.gems);
    expect(due.gems).toBe(1);
    expect(told.find((t) => t.startsWith('paid '))).toBe(`paid ${due.coins} ${due.gems}`);
    // the best of a hole is still kept, by its name
    expect(game.progress.save.best[hole.name].strokes).toBe(1);
  });

  it('holes a ball chipped straight at the cup, once, and one that misses it by a little either drops or lips out, and never twice', () => {
    const chip = (dist: number, off: number) => {
      const { game, told } = golfGame(field('g'));
      game.pick('pitching-wedge');
      const cup = game.layout.cup;
      game.place(cup.x, cup.y - dist);
      game.shoot(NORTH + Math.atan2(-off, dist), dist / carryOf(bagClub('pitching-wedge'), 1));
      for (let f = 0; f < 60 * 30 && game.phase === 'play' && !(f > 1 && game.ready); f++) {
        game.step(DT);
        expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      }
      return { game, holed: told.filter((t) => t.startsWith('holed ')).length };
    };
    for (const dist of [20, 30, 45]) {
      const dead = chip(dist, 0);
      expect(dead.holed, `${dist} units, dead on`).toBe(1);
      expect(dead.game.card).toEqual([1]);
      for (const off of [0.7, 1.2, 2.5]) {
        const near = chip(dist, off);
        expect(near.holed, `${dist} units, ${off} off`).toBeLessThanOrEqual(1);
        // holed and done, or at rest and ready, and nothing in between
        if (near.holed) expect(near.game.card).toEqual([1]);
        else {
          expect(near.game.ready).toBe(true);
          expect(near.game.card).toEqual([]);
        }
      }
    }
  });
});

describe('what a lofted ball meets', () => {
  it('is turned back by the rail, which a lofted ball does not pass over: the rail is a wall', () => {
    const { game } = golfGame(field('f'));
    game.pick('driver');
    const bounds = game.layout.bounds;
    // straight along the field’s width at the driver’s full speed, into the rail 60 units off
    let most = -Infinity;
    game.shoot(0, 1);
    for (let f = 0; f < 60 * 30; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      most = Math.max(most, game.world.x[game.ball]);
      if (f > 1 && game.ready) break;
    }
    expect(most, 'never past the rail').toBeLessThan(bounds.maxX);
    expect(game.ready).toBe(true);
  });

  it('is lost in water, which costs a stroke, and the ball is put back where it was struck from', () => {
    const base = field('f');
    // the band the driver comes down in, 60 to 110 tiles up the field, is a lake wall to wall
    const map = base.map.map((row, r) => (r >= 20 && r <= 46 ? `#${'~'.repeat(row.length - 2)}#` : row));
    const { game, told } = golfGame({ ...base, map });
    game.pick('driver');
    const from = { x: game.world.x[game.ball], y: game.world.y[game.ball] };
    game.shoot(NORTH, 1);
    untilStill(game);
    expect(told.filter((t) => t.startsWith('splash ')).length).toBe(1);
    expect(game.strokes, 'the stroke and the stroke it cost').toBe(2);
    expect(game.world.x[game.ball]).toBeCloseTo(from.x, 1);
    expect(game.world.y[game.ball]).toBeCloseTo(from.y, 1);
  });

  it('does not come to rest in the air or in the ground on any club, across a run of seeds', () => {
    for (let seed = 1; seed <= 6; seed++)
      for (const club of BAG) {
        const { game } = golfGame(field('r'), seeded(seed));
        game.pick(club.id);
        game.shoot(NORTH + (seed - 3.5) * 0.1, 0.4 + 0.1 * seed);
        untilStill(game);
        expect(game.ready).toBe(true);
      }
  });
});

describe('a rehearsal', () => {
  it('is a game of the same hole that no one plays, with chance held in the middle so a shot in it is struck true', () => {
    const { game } = golfGame(field('f'), seeded(9));
    const r = game.rehearsal();
    expect(r).not.toBe(game);
    expect(r.def).toBe(game.def);
    expect(r.layout.golf).toBe(true);
    // the same shot from the same lie as the real game would make with a true swing
    const { game: twin } = golfGame(field('f'));
    r.pick('7-iron');
    twin.pick('7-iron');
    r.shoot(NORTH, 0.8);
    twin.shoot(NORTH, 0.8);
    for (let f = 0; f < 60 * 20; f++) {
      r.step(DT);
      twin.step(DT);
    }
    expect(r.world.y[r.ball]).toBe(twin.world.y[twin.ball]);
    expect(r.world.x[r.ball]).toBe(twin.world.x[twin.ball]);
  });

  it('is tried in with `trial`, which puts the ball down where it lies, with no stroke, however the last trial ended', () => {
    const { game } = golfGame(field('g'));
    const r = game.rehearsal();
    const cup = game.layout.cup;
    // holed: a putt from six units that drops
    r.trial(cup.x + 6, cup.y);
    r.pick('putter');
    r.shoot(Math.PI, 0.14);
    for (let f = 0; f < 60 * 10 && r.phase === 'play' && !r.ready; f++) r.step(DT);
    expect(r.phase).toBe('done');
    r.trial(cup.x + 20, cup.y - 10);
    expect(r.phase).toBe('play');
    expect(r.strokes).toBe(0);
    expect(r.card).toEqual([]);
    expect(r.world.alive[r.ball]).toBe(1);
    expect(r.world.x[r.ball]).toBeCloseTo(cup.x + 20, 6);
    expect(r.ready).toBe(true);
    // and a hundred holed trials keep nothing: the card is emptied and the bodies are one
    for (let k = 0; k < 100; k++) {
      r.trial(cup.x + 6, cup.y);
      r.shoot(Math.PI, 0.14);
      for (let f = 0; f < 60 * 10 && r.phase === 'play' && !r.ready; f++) r.step(DT);
    }
    r.trial(cup.x + 20, cup.y - 10);
    expect(r.card.length).toBe(0);
    expect(r.world.live).toBe(1);
    expect(r.world.count).toBeLessThanOrEqual(2);
  });

  it('may be tried in from where a real ball lies too near the cup for a ball to be put down: it is not put down, it lies there', () => {
    const { game } = golfGame(field('g'));
    const r = game.rehearsal();
    const cup = game.layout.cup;
    expect(() => game.place(cup.x + 2.5, cup.y)).toThrow(/too near the cup/);
    expect(() => r.trial(cup.x + 2.5, cup.y)).not.toThrow();
    expect(r.phase).toBe('play');
    expect(r.world.alive[r.ball]).toBe(1);
    expect(r.world.x[r.ball]).toBeCloseTo(cup.x + 2.5, 3);
  });

  it('is refused to the game that is played: a trial there would wreck a round, so only a rehearsal is tried in', () => {
    const { game } = golfGame(field('f'));
    expect(() => game.trial(0, 0)).toThrow(/rehearsal/);
  });

  it('leaves the game it was made from as it was: no stroke, no time, no chance spent, nothing told', () => {
    const rehearsed = golfGame(field('f'), seeded(3)),
      untouched = golfGame(field('f'), seeded(3));
    const r = rehearsed.game.rehearsal();
    r.trial(0, 0);
    r.pick('driver');
    r.shoot(NORTH, 1);
    for (let f = 0; f < 600; f++) r.step(DT);
    const state = (g: typeof rehearsed) => ({
      strokes: g.game.strokes,
      t: g.game.t,
      x: g.game.world.x[g.game.ball],
      y: g.game.world.y[g.game.ball],
      told: g.told.length,
      next: g.game.random(),
    });
    expect(state(rehearsed)).toEqual(state(untouched));
  });
});

describe('what must always hold on a golf hole', () => {
  it('holds of a shot from every club, on every surface, the whole way to rest', () => {
    for (const surface of ['f', 'r', 'g', 's'] as const)
      for (const club of BAG) {
        const { game } = golfGame(field(surface));
        game.pick(club.id);
        game.shoot(NORTH, 1);
        untilStill(game);
      }
  });

  it('reports a club in hand that is not in the bag', () => {
    const { game } = golfGame(field('f'));
    game.inHand = { ...BAG[2] };
    expect(checkInvariants(game).join('\n')).toMatch(/club in hand.*not in the bag/);
  });

  it('reports a ball going faster in the air than any club could have sent it, and a fall could make it', () => {
    const { game } = golfGame(field('f'));
    game.world.vz[game.ball] = 900;
    expect(checkInvariants(game).join('\n')).toMatch(/going .* in all/);
  });

  it('checks each landing told: of the ball, where it is, hard enough, and a number', () => {
    const { game } = golfGame(field('f'));
    const { world, ball } = game;
    expect(landingProblems(game, 12, world.x[ball], world.y[ball])).toEqual([]);
    expect(landingProblems(game, 1, world.x[ball], world.y[ball]).join('\n')).toMatch(/softer than a landing/);
    expect(landingProblems(game, NaN, world.x[ball], world.y[ball]).join('\n')).toMatch(/softer than a landing/);
    expect(landingProblems(game, 12, world.x[ball] + 5, world.y[ball]).join('\n')).toMatch(/not where the ball is/);
    world.alive[ball] = 0;
    expect(landingProblems(game, 12, 0, 0).join('\n')).toMatch(/no ball/);
  });

  it('does not stop a hole of minigolf from being checked as it was', () => {
    const { game } = newGame(1);
    game.shoot(1, 0.7);
    for (let f = 0; f < 120; f++) game.step(DT);
    expect(checkInvariants(game)).toEqual([]);
  });
});

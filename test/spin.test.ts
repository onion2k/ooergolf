/**
 * A spin: backspin or topspin, chosen for a lofted shot, which changes only the share of its speed along the ground that the
 * ball keeps when it first comes down. Topspin runs it on and backspin checks it, at the fullest so hard that it comes back
 * a little; it is for the first landing only and never for the flight; and a ball that is sent back along the ground still
 * comes to rest, with every rule that must always hold kept.
 */
import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/arena';
import { BAG } from '../src/bag';
import { checkInvariants } from '../src/invariants';
import { DT, field, golfGame } from './helpers';
import { NORTH } from './wind-helpers';

/** The shot of `club` at `power` struck with `spin` on `surface`: how far it carried, how far it ran out after, and what it did. */
function spun(surface: 'f' | 'g' | 'r' | 's', club: string, spin: number, power = 1) {
  const { game, calls } = golfGame(field(surface, 200, 81));
  game.pick(club);
  game.setSpin(spin);
  const y0 = game.world.y[game.ball];
  game.shoot(NORTH, power);
  for (let f = 0; f < 60 * 60 && !(f > 1 && game.ready); f++) game.step(DT);
  const landings = calls.filter(([n]) => n === 'landed');
  const first = landings.find(([, a]) => a[3] === true)![1] as number[];
  return {
    carry: first[1] - y0,
    run: game.world.y[game.ball] - first[1],
    into: first[2],
    landings: landings.length,
    game,
  };
}

describe('topspin and backspin', () => {
  it('run a driver on at least one and four tenths times the plain run on the fairway at the fullest topspin, and take it to at most four tenths with the fullest backspin', () => {
    const plain = spun('f', 'driver', 0).run;
    expect(plain).toBeGreaterThan(10);
    expect(spun('f', 'driver', 1).run, 'topspin').toBeGreaterThanOrEqual(1.4 * plain);
    expect(spun('f', 'driver', -1).run, 'backspin').toBeLessThanOrEqual(0.4 * plain);
  });

  it('bring a sand wedge to rest within four yards of its landing on a putting green with the fullest backspin, and run it on at least one and eight tenths times with topspin', () => {
    const plain = spun('g', 'sand-wedge', 0).run;
    expect(Math.abs(spun('g', 'sand-wedge', -1).run), 'backspin').toBeLessThan(4);
    expect(spun('g', 'sand-wedge', 1).run, 'topspin').toBeGreaterThanOrEqual(1.8 * plain);
  });

  it('run a ball on more the more topspin there is, from the fullest backspin to the fullest topspin, for every lofted club', () => {
    for (const club of BAG.filter((c) => c.loft > 0)) {
      const runs = [-1, -0.5, 0, 0.5, 1].map((s) => spun('f', club.id, s).run);
      for (let k = 1; k < runs.length; k++)
        expect(runs[k], `${club.id}: ${runs.map((r) => r.toFixed(1)).join(' ')}`).toBeGreaterThan(runs[k - 1]);
    }
  });

  it('come back along the ground at the fullest backspin: the ball is checked so hard that it rests short of where it came down', () => {
    expect(spun('f', 'driver', -1).run).toBeLessThan(0);
    expect(spun('g', 'pitching-wedge', -1).run).toBeLessThan(0);
  });

  it('do nothing in the air: the flight, and the landing it comes to, are the very same with any spin', () => {
    for (const club of ['driver', '7-iron', 'sand-wedge']) {
      const flat = spun('f', club, 0);
      for (const spin of [-1, -0.3, 0.6, 1]) {
        const s = spun('f', club, spin);
        expect(s.carry, `${club} ${spin}`).toBe(flat.carry);
        expect(s.into, `${club} ${spin}`).toBe(flat.into);
      }
    }
  });

  it('tell at the first landing and no other: a ball sent back along the ground is not sent forward again by the next', () => {
    const { game, calls } = golfGame(field('f', 200, 81));
    game.pick('driver');
    game.setSpin(-1);
    game.shoot(NORTH, 1);
    // the speed north along the ground just before each landing, and just after it
    const turns: { before: number; after: number }[] = [];
    for (let f = 0; f < 60 * 30 && !(f > 1 && game.ready); f++) {
      const told = calls.length;
      const before = game.world.vy[game.ball];
      game.step(PHYSICS.step);
      if (calls.length > told && calls.slice(told).some(([n]) => n === 'landed'))
        turns.push({ before, after: game.world.vy[game.ball] });
    }
    expect(turns.length, 'it lands more than once, or this proves nothing').toBeGreaterThan(1);
    // the first landing turns it back: it went north and comes away going south
    expect(turns[0].before).toBeGreaterThan(0);
    expect(turns[0].after).toBeLessThan(0);
    // and the second finds it going south and leaves it going south, as a ball on the surface alone would
    expect(turns[1].before).toBeLessThan(0);
    expect(turns[1].after).toBeLessThan(0);
  });

  it('are used up by the shot they were chosen for, and put back to flat', () => {
    const { game } = golfGame(field('f', 200, 81));
    game.pick('7-iron');
    game.setSpin(1);
    game.shoot(NORTH, 1);
    expect(game.spin).toBe(0);
    game.setSpin(-1);
    for (let f = 0; f < 60 * 30 && !(f > 1 && game.ready); f++) game.step(DT);
    // a spin chosen while the last ball flew is for the next, and is there when it is ready
    expect(game.spin).toBe(-1);
  });

  it('are nothing to the putter, which has no loft and no landing', () => {
    const play = (spin: number) => {
      const { game } = golfGame(field('g', 200, 81));
      game.pick('putter');
      game.setSpin(spin);
      game.shoot(NORTH, 0.5);
      for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) game.step(DT);
      return [game.world.x[game.ball], game.world.y[game.ball], game.spin];
    };
    expect(play(-1)).toEqual(play(0));
    expect(play(1)).toEqual(play(0));
  });

  it('keep every rule that must always hold, and bring the ball to rest, from every club on every surface, with the fullest backspin and the fullest topspin', () => {
    for (const surface of ['f', 'g', 'r', 's'] as const)
      for (const club of BAG.filter((c) => c.loft > 0))
        for (const spin of [-1, 1]) {
          const { game } = golfGame(field(surface, 200, 81));
          game.pick(club.id);
          game.setSpin(spin);
          game.shoot(NORTH, 1);
          for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) {
            game.step(DT);
            expect(checkInvariants(game), `${club.id} on ${surface}, spin ${spin}, frame ${f}`).toEqual([]);
            const { world, ball } = game;
            expect(
              Number.isFinite(world.x[ball] + world.y[ball] + world.z[ball] + world.vx[ball] + world.vy[ball]),
              'finite',
            ).toBe(true);
          }
          expect(game.ready, `${club.id} on ${surface}, spin ${spin}: it came to rest`).toBe(true);
        }
  });
});

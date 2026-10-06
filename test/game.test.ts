import { describe, expect, it } from 'vitest';
import { BALL, HARDEST_SHOT, KIND_RADIUS, ROLL, powerFor, rollsFor, strikeSpeed } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { DT, onGreen as newGame, settle } from './helpers';

/** Play until the ball is ready to be struck again, or `seconds` pass; the time it took, or Infinity. */
function untilReady(game: ReturnType<typeof newGame>['game'], seconds = 20): number {
  const start = game.t;
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    if (game.ready) return game.t - start;
  }
  return Infinity;
}

describe('the game', () => {
  it('starts with one ball at rest on the tee, ready, and no strokes taken', () => {
    const { game, told } = newGame();
    const { world, ball } = game;
    const tee = game.layout.tee;
    expect(world.live).toBe(1);
    expect(world.alive[ball]).toBe(1);
    expect(world.kind[ball]).toBe(BALL);
    expect(world.x[ball]).toBeCloseTo(tee.x, 1);
    expect(world.y[ball]).toBeCloseTo(tee.y, 1);
    expect(world.z[ball]).toBeCloseTo(KIND_RADIUS[BALL], 1);
    expect(game.ready).toBe(true);
    expect(game.strokes).toBe(0);
    expect(told).toEqual(['started 0 3']);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('strikes the ball the way it is aimed, hard enough to roll its share of the hardest shot, and counts the stroke', () => {
    const { game, told } = newGame();
    const tee = game.layout.tee;
    // a quarter of the drag rolls a quarter as far, and under a steady slowing that is half the speed
    expect(game.shoot(Math.PI / 2, 0.25)).toBe(true);
    const { world, ball } = game;
    expect(world.vx[ball]).toBeCloseTo(0, 6);
    expect(world.vy[ball]).toBeCloseTo(HARDEST_SHOT * 0.5, 4);
    expect(world.vz[ball]).toBe(0);
    expect(game.strokes).toBe(1);
    expect(game.ready).toBe(false);
    expect(told).toEqual(['started 0 3', `struck 0.25 ${tee.x} ${tee.y}`]);
    expect(strikeSpeed(0.25, 40)).toBeCloseTo(20, 9);
    expect(powerFor(strikeSpeed(0.3, 44), 44)).toBeCloseTo(0.3, 9);
  });

  it('holds power to between none and the hardest shot', () => {
    const { game } = newGame();
    game.shoot(0, 7);
    expect(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball])).toBeCloseTo(HARDEST_SHOT, 6);
    const other = newGame().game;
    expect(other.shoot(0, -1), 'a shot of no power is no shot').toBe(false);
    expect(other.strokes).toBe(0);
    expect(other.ready).toBe(true);
  });

  it('refuses a shot while the ball moves, and does not count it', () => {
    const { game } = newGame();
    game.shoot(Math.PI / 2, 0.6);
    for (let f = 0; f < 30; f++) game.step(DT);
    const vy = game.world.vy[game.ball];
    expect(game.shoot(0, 1)).toBe(false);
    expect(game.strokes).toBe(1);
    expect(game.world.vy[game.ball]).toBe(vy);
  });

  it('comes to rest within eight seconds of the hardest shot, says where, and is ready again', () => {
    for (const angle of [Math.PI / 2, Math.PI / 4, 0, -Math.PI / 2 + 0.3]) {
      const { game, told } = newGame(3);
      game.shoot(angle, 1);
      const took = untilReady(game);
      expect(took, `at ${angle.toFixed(2)}`).toBeLessThanOrEqual(8);
      expect(told[told.length - 1]).toMatch(/^stopped -?\d/);
      expect(game.shoot(angle + Math.PI, 0.3)).toBe(true);
      expect(game.strokes).toBe(2);
      expect(checkInvariants(game)).toEqual([]);
    }
  });

  it('rolls as far as the drag says, and dies as a putt does: the hardest shot about fifty units in under three seconds', () => {
    const roll = (power: number) => {
      const { game } = newGame();
      game.shoot(Math.PI / 2, power);
      const took = untilReady(game);
      return { d: game.world.y[game.ball] - game.layout.tee.y, took };
    };
    const full = roll(1);
    expect(full.d).toBeGreaterThan(47);
    expect(full.d).toBeLessThan(53);
    expect(Math.abs(full.d - rollsFor(HARDEST_SHOT)), 'as the figures say').toBeLessThan(2);
    // come to rest, and put to sleep, in under three seconds: a steady slowing, not a long tail of drag
    expect(full.took).toBeLessThan(3.5);
    for (const share of [0.5, 0.25]) {
      const { d } = roll(share);
      expect(d / full.d, `${share} of the drag`).toBeGreaterThan(share - 0.05);
      expect(d / full.d, `${share} of the drag`).toBeLessThan(share + 0.05);
    }
    expect(ROLL.roll).toBe(16);
  });

  it('is never put to sleep in the air: tossed so it is off the grass as the physics judges it at rest, it lands first', () => {
    const { game } = newGame();
    const { world, ball } = game;
    // woken, which opens the physics' window of forty steps over which it judges a ball at rest; tossed four steps
    // before the window closes, so it is a hair up and slow at the top of its hop, and back near where it was
    world.wake(ball);
    for (let s = 0; s < 36; s++) game.step(1 / 120);
    world.vz[ball] = 3.5;
    for (let s = 0; s < 60; s++) {
      game.step(1 / 120);
      expect(checkInvariants(game), `step ${s} of the hop`).toEqual([]);
    }
    expect(world.asleep[ball], 'at rest where it landed').toBe(1);
  });

  it('rolls further the harder it is struck', () => {
    const dist = (power: number) => {
      const { game } = newGame();
      game.shoot(Math.PI / 2, power);
      untilReady(game);
      return game.world.y[game.ball] - game.layout.tee.y;
    };
    const short = dist(0.2),
      mid = dist(0.5);
    expect(short).toBeGreaterThan(2);
    expect(mid).toBeGreaterThan(short * 2);
  });

  it('stays out of the rock after the hardest shot into a wall and into a corner', () => {
    const { bounds } = newGame().game.layout;
    for (const [x, y, angle] of [
      [0, 0, 0],
      [0, 0, Math.PI],
      [bounds.maxX - 6, bounds.maxY - 12, Math.PI / 4],
      [bounds.minX + 12, bounds.minY + 6, (-3 * Math.PI) / 4],
    ]) {
      const { game } = newGame();
      game.place(x, y);
      game.shoot(angle, 1);
      for (let f = 0; f < 8 * 60; f++) {
        game.step(DT);
        expect(checkInvariants(game), `from ${x},${y} at frame ${f}`).toEqual([]);
      }
      expect(game.ready).toBe(true);
    }
  });

  it('keeps time a step at a time', () => {
    const { game } = newGame();
    for (let f = 0; f < 60; f++) game.step(DT);
    expect(game.t).toBeCloseTo(1, 9);
  });

  it('writes the save when asked, and not before', () => {
    const { game, store } = newGame(3);
    settle(game);
    game.shoot(1, 1);
    settle(game);
    expect(store.json).toBe(null);
    game.persist();
    expect(store.json).toBe(JSON.stringify(game.progress.save));
    expect(JSON.parse(store.json!)).toEqual({ coins: 0, gems: 0, owned: [], item: '', best: {} });
  });
});

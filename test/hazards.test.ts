/** The hazards in play: water that costs a stroke, a barrier and a windmill in the way, a belt that carries, and grass up a ramp. */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, STEP, TILE, layoutOf } from '../src/arena';
import type { HoleDef } from '../src/course';
import { KEPT_MOVING, LIMIT_OVER_PAR, type Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { windmill } from '../src/models';
import { WINDMILL } from '../src/obstacles';
import { DT, newGame } from './helpers';

/** Play `seconds`, checking the rules every frame. */
function play(game: Game, seconds: number) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    const broken = checkInvariants(game);
    if (broken.length) throw new Error(`at ${game.t.toFixed(2)}: ${broken.join('; ')}`);
  }
}
const ball = (game: Game) => ({ x: game.world.x[game.ball], y: game.world.y[game.ball], z: game.world.z[game.ball] });

const POND: HoleDef = {
  name: 'test pond',
  par: 3,
  map: ['#######', '#..C..#', '#.....#', '#~~~~~#', '#~~~~~#', '#.....#', '#..T..#', '#.....#', '#######'],
};

describe('water', () => {
  it('takes a ball rolled into it, costs a stroke, and puts the ball back where it was struck from', () => {
    const { game, told } = newGame(1, null, [POND]);
    const { tee } = game.layout;
    game.shoot(Math.PI / 2, 0.4);
    play(game, 3);
    expect(told.some((t) => t.startsWith('splash'))).toBe(true);
    expect(game.strokes, 'the stroke and a stroke more').toBe(2);
    expect(game.phase).toBe('play');
    expect(game.ready).toBe(true);
    expect(ball(game).x).toBeCloseTo(tee.x, 1);
    expect(ball(game).y).toBeCloseTo(tee.y, 1);
  });

  it('puts the ball back where it was struck from, not on the tee', () => {
    const { game } = newGame(1, null, [POND]);
    const l = game.layout;
    const lie = { x: l.originX + 1.5 * TILE, y: l.originY + 3.5 * TILE };
    game.place(lie.x, lie.y);
    game.shoot(Math.PI / 2, 0.3);
    play(game, 3);
    expect(game.strokes).toBe(2);
    expect(ball(game).x).toBeCloseTo(lie.x, 1);
    expect(ball(game).y).toBeCloseTo(lie.y, 1);
  });

  it('picks the ball up if the water takes it to the limit', () => {
    const { game, told } = newGame(1, null, [POND]);
    const limit = POND.par + LIMIT_OVER_PAR;
    for (let s = 0; s < limit && game.phase === 'play'; s += 2) {
      expect(game.shoot(Math.PI / 2, 0.4)).toBe(true);
      play(game, 3);
    }
    expect(game.phase, 'the hole done, or on a course of one hole, the round').not.toBe('play');
    expect(told).toContain(`pickedUp ${limit} ${POND.par}`);
    expect(game.card).toEqual([limit]);
  });

  it('picks the ball up at the limit, never over it, when the last stroke allowed goes into it', () => {
    const { game, told } = newGame(1, null, [POND]);
    const limit = POND.par + LIMIT_OVER_PAR;
    // one short of the limit, and then the last stroke into the water
    game.strokes = limit - 1;
    expect(game.shoot(Math.PI / 2, 0.4)).toBe(true);
    expect(game.strokes).toBe(limit);
    for (let f = 0; f < 3 * 60 && game.phase === 'play'; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(
      told.some((t) => t.startsWith('splash')),
      'into the water',
    ).toBe(true);
    expect(game.strokes, 'the water costs no stroke past the limit').toBe(limit);
    expect(told).toContain(`pickedUp ${limit} ${POND.par}`);
    expect(game.card).toEqual([limit]);
  });

  it('is not grass to put a ball down on', () => {
    const { game } = newGame(1, null, [POND]);
    const l = game.layout;
    expect(() => game.place(l.originX + 3.5 * TILE, l.originY + 5.5 * TILE)).toThrow(/grass/);
  });
});

describe('grass up a ramp', () => {
  const RAMP: HoleDef = {
    name: 'test ramp',
    par: 3,
    map: [
      '#######',
      '#..C..#',
      '#.....#',
      '#44444#',
      '#44444#',
      '#33333#',
      '#22222#',
      '#11111#',
      '#.....#',
      '#..T..#',
      '#######',
    ],
  };

  it('is climbed a step at a time, and dropped off at its far edge', () => {
    const { game } = newGame(1, null, [RAMP]);
    game.shoot(Math.PI / 2, 0.75);
    let highest = 0;
    for (let f = 0; f < 60 * 6 && game.phase === 'play'; f++) {
      game.step(DT);
      highest = Math.max(highest, ball(game).z);
      expect(checkInvariants(game)).toEqual([]);
    }
    expect(highest, 'up on the top of it').toBeGreaterThan(4 * STEP + KIND_RADIUS[BALL] - 0.05);
    const at = ball(game);
    expect(at.y, 'over the top and down the far side').toBeGreaterThan(game.layout.originY + 8 * TILE);
  });

  it('puts a ball down on raised grass resting on it', () => {
    const { game } = newGame(1, null, [RAMP]);
    const l = game.layout;
    game.place(l.tee.x, l.originY + 6.5 * TILE);
    expect(ball(game).z).toBeCloseTo(4 * STEP + KIND_RADIUS[BALL], 1);
  });
});

describe('a sliding barrier', () => {
  const LANE: HoleDef = {
    name: 'test barrier',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'barrier', at: [3, 4], length: 1, travel: 2.5, period: 4 }],
  };

  it('stops a ball that meets it in the middle of the lane, and moves with game time alone', () => {
    const { game } = newGame(1, null, [LANE]);
    // the barrier is in its middle at the start and every half period: the ball gets there as it is
    game.shoot(Math.PI / 2, 0.55);
    play(game, 1.2);
    const barrierY = game.obstacles.pushers[0].y;
    expect(ball(game).y, 'held on the near side of it').toBeLessThan(barrierY);
    play(game, 6);
    expect(checkInvariants(game)).toEqual([]);
    const one = newGame(1, null, [LANE]).game;
    const two = newGame(2, null, [LANE]).game;
    play(one, 1.7);
    play(two, 1.7);
    expect(one.obstacles.pushers[0].x, 'the same at the same time, whatever the seed').toBe(two.obstacles.pushers[0].x);
  });
});

describe('a windmill', () => {
  const MILL: HoleDef = {
    name: 'test windmill',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '###.###', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'windmill', at: [3, 3], period: 8 }],
  };

  it('is drawn to the figures its blades collide with', () => {
    const model = windmill({
      gap: WINDMILL.gap,
      bladeLength: WINDMILL.bladeLength,
      bladeWidth: WINDMILL.bladeWidth,
      bladeThickness: WINDMILL.bladeThickness,
    });
    for (let a = 0; a < 3; a++) expect(model.hub[a]).toBeCloseTo(WINDMILL.hub[a], 6);
  });

  it('lets a ball through its door when the blades are clear, and stops it when one is down', () => {
    // a quarter blade turn is two seconds: struck at the start a ball meets a blade coming down; struck
    // with the blades clear it goes through
    const through = (wait: number) => {
      const { game } = newGame(1, null, [MILL]);
      play(game, wait);
      game.shoot(Math.PI / 2, 0.62);
      play(game, 5);
      return ball(game).y > layoutOf(MILL.map).originY + 5 * TILE;
    };
    const results = [0, 0.5, 1, 1.5].map(through);
    expect(results, 'through at some moments, and stopped at others').toContain(true);
    expect(results).toContain(false);
  });
});

describe('a conveyor', () => {
  const BELT: HoleDef = {
    name: 'test conveyor',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'conveyor', from: [1, 6], to: [1, 2], speed: 6 }],
  };

  it('carries a ball resting on it the way it runs', () => {
    const { game } = newGame(1, null, [BELT]);
    const l = game.layout;
    const start = { x: l.originX + 1.5 * TILE, y: l.originY + 2.5 * TILE };
    game.place(start.x, start.y);
    expect(ball(game).y, 'put down where it was put, not carried off while it settled').toBeCloseTo(start.y, 1);
    play(game, 1);
    expect(ball(game).y - start.y).toBeGreaterThan(3);
    // at the belt's own speed, once it has it: a belt is not the green, and does not slow what it carries
    const y = ball(game).y;
    play(game, 0.5);
    expect((ball(game).y - y) / 0.5, 'at about the belt speed of 6').toBeGreaterThan(5);
    expect(game.world.asleep[game.ball], 'and never asleep while it is carried').toBe(0);
  });
});

describe('a ball the course keeps moving', () => {
  it('may be struck where it lies once it has been kept moving long enough, and counts as come to rest', () => {
    const LANE: HoleDef = {
      name: 'test carried',
      par: 3,
      map: ['#######', '#..C..#', ...Array.from({ length: 10 }, () => '#.....#'), '#..T..#', '#######'],
      // long enough that it carries the ball the whole of the time
      obstacles: [{ kind: 'conveyor', from: [1, 11], to: [1, 1], speed: 2 }],
    };
    const { game, told } = newGame(1, null, [LANE]);
    const l = game.layout;
    // struck gently along a belt running the length of the hole: it is carried the whole time
    game.place(l.originX + 1.5 * TILE, l.originY + 2.5 * TILE);
    game.shoot(Math.PI / 2, 0.02);
    play(game, KEPT_MOVING - 0.5);
    expect(game.ready, 'still carried, and not yet long enough').toBe(false);
    play(game, 1);
    expect(game.ready).toBe(true);
    expect(told.filter((t) => t.startsWith('stopped')).length, 'told as come to rest').toBe(1);
    // struck the hardest it can be the way the belt runs: at the shot's speed, not the shot's and the belt's
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    expect(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball])).toBeCloseTo(game.hardest, 3);
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('putting a ball down', () => {
  it('refuses a spot against a raised step, where the ball would be pushed off it, perhaps into water', () => {
    const MAP: HoleDef = {
      name: 'test step',
      par: 3,
      map: ['#######', '#..C..#', '#.....#', '#~444~#', '#.....#', '#..T..#', '#######'],
    };
    const { game } = newGame(1, null, [MAP]);
    const l = game.layout;
    const edge = l.originY + 4 * TILE;
    expect(() => game.place(l.tee.x, edge + 0.6)).toThrow(/level grass/);
    expect(() => game.place(l.tee.x, edge - 0.6)).toThrow(/level grass/);
    // level grass clear of the step, and of the cup
    expect(() => game.place(l.originX + 1.5 * TILE, edge + 1.5)).not.toThrow();
  });
});

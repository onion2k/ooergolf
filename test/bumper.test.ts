/**
 * A barrier that throws like a post: a moving bumper. Without this held to a figure, a field added to the barrier's
 * definition could move every hole that has one, and the pace figures with it.
 */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';
import { PLAYER } from '../scripts/pace';
import { Autopilot } from '../src/autopilot';
import { BUMPER } from '../src/arena';
import { COURSES, type HoleDef } from '../src/course';
import { Game, fastest } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';

const meadow = COURSES.find((c) => c.name === 'The Meadow')!;
const barriers = meadow.holes.find((h) => h.name === 'Barriers')!;

function gameOn(hole: HoleDef, seed: number) {
  return new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: [hole] });
}

/** Every position the ball has over a round of the autopilot's, hashed to the bit. */
function traceHash(hole: HoleDef, seed: number, frames: number): string {
  const game = gameOn(hole, seed);
  const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
  let h = 0x811c9dc5;
  const bits = new DataView(new ArrayBuffer(8));
  const eat = (n: number) => {
    bits.setFloat64(0, n);
    for (let b = 0; b < 8; b++) {
      h ^= bits.getUint8(b);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (let f = 0; f < frames; f++) {
    pilot.step(DT);
    const { world, ball } = game;
    eat(world.x[ball]);
    eat(world.y[ball]);
    eat(world.z[ball]);
  }
  eat(game.total);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Shots struck straight at the barriers at several moments and powers, which the autopilot's care never does: every position, hashed. */
function strikeHash(hole: HoleDef): string {
  let h = 0x811c9dc5;
  const bits = new DataView(new ArrayBuffer(8));
  const eat = (n: number) => {
    bits.setFloat64(0, n);
    for (let b = 0; b < 8; b++) {
      h ^= bits.getUint8(b);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const [wait, power, bend] of [
    [0, 0.5, 0],
    [40, 0.8, 0.1],
    [90, 1, -0.1],
    [20, 0.3, 0.2],
    [130, 0.65, 0],
  ]) {
    const game = gameOn(hole, 1);
    for (let f = 0; f < wait; f++) game.step(DT);
    game.shoot(Math.PI / 2 + bend, power);
    for (let f = 0; f < 360; f++) {
      game.step(DT);
      eat(game.world.x[game.ball]);
      eat(game.world.y[game.ball]);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('a barrier without a bounce', () => {
  it('plays exactly as it did before the field was there: The Barriers hole, seeded, hashed over a round', () => {
    // recorded from the code before the field existed, on three seeds of 1800 frames of the autopilot with a player's slips
    expect([1, 2, 3].map((s) => traceHash(barriers, s, 1800))).toEqual(['613055a6', 'd4329e02', '14220e2e']);
    expect(strikeHash(barriers), 'and the ball struck straight into them').toBe('b76cbc51');
  });
});

/** A hall: one barrier across the way, and the ball struck straight at it from the tee. */
function wall(bounce: number | undefined, travel = 0): HoleDef {
  return {
    name: 'Bumper wall',
    par: 3,
    map: [
      '###########',
      '#....C....#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#....T....#',
      '###########',
    ],
    obstacles: [
      { kind: 'barrier', at: [5, 4], length: 1, travel, period: 3, ...(bounce === undefined ? {} : { bounce }) },
    ],
  };
}

/** The speed the ball leaves a wall at, the most it goes along the way back down the hole, struck straight up it at `power`. */
function leaving(hole: HoleDef, power: number, wait = 0): number {
  const game = gameOn(hole, 1);
  for (let f = 0; f < wait; f++) game.step(DT);
  const { world, ball } = game;
  expect(game.shoot(Math.PI / 2, power)).toBe(true);
  let back = 0;
  for (let f = 0; f < 400; f++) {
    game.step(DT);
    if (world.vy[ball] < 0) back = Math.max(back, -world.vy[ball]);
  }
  return back;
}

describe('a barrier with a bounce', () => {
  it('throws a ball back faster than a plain one, by about the ratio of the bounces', () => {
    const plain = leaving(wall(undefined), 0.5);
    const thrown = leaving(wall(BUMPER.restitution), 0.5);
    expect(plain, 'a plain barrier gives some back').toBeGreaterThan(1);
    // the ball is slowed by the green on the way, so the ratio is measured and not just 1.2 over 0.5
    const ratio = thrown / plain;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(2.8);
  });

  it('is refused a bounce no bumper may have, by name', () => {
    for (const bad of [-1, Number.NaN, 5])
      expect(() => gameOn(wall(bad), 1)).toThrow(/barrier at column 5, row 4 has a bounce/);
  });

  it('holds the speed cap against the hardest shot into a bumper at every moment of its slide', () => {
    for (const bounce of [BUMPER.restitution, BUMPER.restitution * 2]) {
      const hole = wall(bounce, 3.5);
      for (let wait = 0; wait < 180; wait += 15) {
        const game = gameOn(hole, 1);
        for (let f = 0; f < wait; f++) game.step(DT);
        const { world, ball } = game;
        game.shoot(Math.PI / 2 + (wait % 30 ? 0.05 : -0.05), 1);
        let fastestSeen = 0;
        for (let f = 0; f < 500; f++) {
          game.step(DT);
          const speed = Math.hypot(world.vx[ball], world.vy[ball]);
          fastestSeen = Math.max(fastestSeen, speed);
          expect(checkInvariants(game), `bounce ${bounce}, struck at frame ${wait}, frame ${f}`).toEqual([]);
        }
        expect(fastestSeen, 'the ball was thrown').toBeGreaterThan(game.hardest * 0.6);
        expect(fastestSeen).toBeLessThanOrEqual(fastest(game, world.x[ball], world.y[ball]) * 1.001);
      }
    }
  });
});

/**
 * Dodgems, the first draft: a wide green, the tee at the bottom and the cup at the top, and across the line three moving
 * bumpers a tile apart, out of phase, each three tiles long and sliding nine units either way of the middle, on a period of three seconds (the first draft, at two tiles and a five-second period, was holed in one by the autopilot, which times a gap well). For The Fair, once it has a course.
 */
export const DODGEMS: HoleDef = {
  name: 'Dodgems',
  par: 3,
  map: [
    '#################',
    '#...............#',
    '#.......C.......#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#...............#',
    '#.......T.......#',
    '#...............#',
    '#################',
  ],
  obstacles: [
    { kind: 'barrier', at: [8, 5], length: 3, travel: 9, period: 3, phase: 0, bounce: BUMPER.restitution },
    { kind: 'barrier', at: [8, 6], length: 3, travel: 9, period: 3, phase: 1 / 3, bounce: BUMPER.restitution },
    { kind: 'barrier', at: [8, 7], length: 3, travel: 9, period: 3, phase: 2 / 3, bounce: BUMPER.restitution },
  ],
};

describe('Dodgems', () => {
  it('is holed by the autopilot within its limit, on a few seeds, with the invariants holding throughout', () => {
    const strokes: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const game = gameOn(DODGEMS, seed);
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 120 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 5 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed} finished`).toBe('over');
      expect(game.total, `seed ${seed} within the limit`).toBeLessThan(game.limit);
      strokes.push(game.total);
    }
    strokes.sort((a, b) => a - b);
  });
});

describe('the fuzzer on a moving bumper', () => {
  it('strikes the ball into one, on a few seeds, and breaks no rule', () => {
    let struck = 0;
    for (const seed of [1, 2, 3, 4]) {
      const run = fuzz(seed, 6000, [DODGEMS]);
      expect(run.failure, JSON.stringify(run.failure)).toBe(null);
      struck += run.done['strike a moving bumper'] ?? 0;
    }
    expect(struck, 'the action was done').toBeGreaterThan(10);
  });

  it('does nothing on a hole without one', () => {
    const run = fuzz(1, 3000, [barriers]);
    expect(run.failure).toBe(null);
    expect(run.done['strike a moving bumper']).toBeUndefined();
  });
});

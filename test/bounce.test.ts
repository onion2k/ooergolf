/** What a ball does when it meets the rail or something on the course: comes off it, by the figure each has, and not along it. */
import { describe, expect, it } from 'vitest';
import { BOUNCE, BUMPER, FASTEST, HARDEST_SHOT, ROLL, TILE, powerFor } from '../src/arena';
import { COURSE, type HoleDef } from '../src/course';
import type { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { DT, newGame, onGreen } from './helpers';

/** The speed to strike a ball so it is going `arrive` after rolling `distance` on the green. */
const arriving = (arrive: number, distance: number) => Math.sqrt(arrive * arrive + 2 * ROLL.roll * distance);

/** Step until the ball's speed along `y` turns back on itself; its speed just before, and its heading and speed a moment after. */
function meet(game: Game) {
  const { world, ball } = game;
  let before = 0;
  for (let f = 0; f < 240 && world.vy[ball] >= 0; f++) {
    before = Math.hypot(world.vx[ball], world.vy[ball]);
    game.step(DT);
  }
  game.step(DT);
  return {
    before,
    after: Math.hypot(world.vx[ball], world.vy[ball]),
    // how far off the wall it comes away, in degrees
    angle: (Math.atan2(-world.vy[ball], Math.abs(world.vx[ball])) * 180) / Math.PI,
  };
}

describe('the rail', () => {
  it('banks a ball off it at an angle, keeping most of its speed, as a timber rail does', () => {
    const { game } = onGreen();
    const l = game.layout;
    const face = l.originY + (l.rows - 1) * TILE;
    const x = l.originX + 6 * TILE;
    game.place(x, face - 8);
    // thirty degrees onto the rail, arriving at 20 a second after the fourteen units to it
    const angle = Math.PI / 6;
    game.shoot(angle, powerFor(arriving(20, 7 / Math.sin(angle)), HARDEST_SHOT));
    const { before, after, angle: off } = meet(game);
    expect(before, 'met at about 20').toBeGreaterThan(17);
    expect(before).toBeLessThan(23);
    expect(off, 'comes away at an angle, not along the rail').toBeGreaterThan(15);
    expect(off, 'and not straight back, the rail keeping some of it').toBeLessThan(28);
    expect(after / before, 'most of its speed kept').toBeGreaterThan(0.8);
    expect(BOUNCE.rail).toBe(0.65);
  });
});

describe('a barrier', () => {
  const LANE: HoleDef = {
    name: 'test still barrier',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    // so slow it stands still for as long as the test looks
    obstacles: [{ kind: 'barrier', at: [3, 4], length: 1, travel: 0.5, period: 1000 }],
  };

  it('throws a ball struck at it back off it, as plastic does, and does not hold it', () => {
    const { game } = newGame(1, null, [LANE]);
    const { tee } = game.layout;
    const barrier = game.obstacles.pushers[0];
    const gap = barrier.y - barrier.hy - tee.y - 1;
    game.shoot(Math.PI / 2, powerFor(arriving(15, gap), HARDEST_SHOT));
    const { before, after } = meet(game);
    expect(before, 'met at about 15').toBeGreaterThan(12);
    expect(game.world.vy[game.ball], 'coming back off it').toBeLessThan(0);
    expect(after / before, 'by about the figure of the barrier').toBeGreaterThan(BOUNCE.box * 0.6);
    expect(after / before).toBeLessThan(BOUNCE.box * 1.4);
  });
});

describe('a bumper', () => {
  /** A lane with a post in its middle, and room behind the ball so it can come back off it. */
  const POST: HoleDef = {
    name: 'test post',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#..o..#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
  };

  it('throws a ball struck at it back faster than it came, as a pinball post does', () => {
    const { game } = newGame(1, null, [POST]);
    const post = game.layout.bumpers[0];
    const { tee } = game.layout;
    const gap = post.y - BUMPER.radius - tee.y - 1;
    game.shoot(Math.PI / 2, powerFor(arriving(15, gap), HARDEST_SHOT));
    const { before, after } = meet(game);
    expect(before, 'met at about 15').toBeGreaterThan(12);
    expect(game.world.vy[game.ball], 'coming back off it').toBeLessThan(0);
    expect(after / before, 'faster than it came, by about the post').toBeGreaterThan(1.05);
    expect(after / before).toBeLessThan(BUMPER.restitution + 0.1);
    expect(BUMPER.restitution).toBe(1.2);
  });

  it('never throws a ball faster than half as fast again as the club struck it, even shuttled between two posts', () => {
    // two posts facing each other, the ball exactly on the line between them: each post throws it back faster than it
    // came, and without the ceiling it runs away to thousands a second
    const PAIR: HoleDef = {
      name: 'test pair',
      par: 3,
      map: ['#######', '#C....#', '#..o..#', '#.....#', '#.....#', '#..o..#', '#.....#', '#..T..#', '#######'],
    };
    const { game } = newGame(1, null, [PAIR]);
    const [a, b] = game.layout.bumpers;
    game.place(a.x, (a.y + b.y) / 2);
    game.shoot(Math.PI / 2, 1);
    let most = 0;
    for (let f = 0; f < 10 * 60; f++) {
      game.step(DT);
      most = Math.max(most, Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]));
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(most, 'thrown faster than it was struck').toBeGreaterThan(HARDEST_SHOT * 1.1);
    expect(most, 'but never past the ceiling').toBeLessThanOrEqual(HARDEST_SHOT * FASTEST + 1e-3);
    expect(FASTEST).toBe(1.5);
  });

  it('is not somewhere a ball can be put down', () => {
    const { game } = newGame(1, null, [POST]);
    const post = game.layout.bumpers[0];
    expect(() => game.place(post.x + BUMPER.radius + 0.5, post.y)).toThrow(/on a post/);
    expect(() => game.place(post.x + BUMPER.radius + 1.3, post.y)).not.toThrow();
  });

  it('is on the course, on a hole of its own', () => {
    const hole = COURSE.find((h) => h.name === 'Bumpers')!;
    expect(COURSE.indexOf(hole), 'the sixth hole').toBe(5);
    expect(hole.map.join('').split('o').length - 1, 'five posts').toBe(5);
  });
});

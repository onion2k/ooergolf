/** What a ball does when it meets the rail or something on the course: comes off it, by the figure each has, and not along it. */
import { describe, expect, it } from 'vitest';
import { BOUNCE, HARDEST_SHOT, ROLL, TILE, powerFor } from '../src/arena';
import type { HoleDef } from '../src/course';
import type { Game } from '../src/game';
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

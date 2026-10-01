/**
 * A shape: a draw or a fade, chosen for a lofted shot, which turns the ball's heading as it flies and does nothing else. A
 * fade goes right of its line, seen from behind the ball, and a draw left; it takes nothing off the ball's speed and adds
 * nothing; it works only in the air, only for the shot it was chosen for, and never for a putt or on a hole of minigolf.
 */
import { describe, expect, it } from 'vitest';
import { BAG } from '../src/bag';
import { checkInvariants } from '../src/invariants';
import { DT, GREEN, field, golfGame, newGame } from './helpers';
import { NORTH } from './wind-helpers';

const LEVEL = field('f', 200, 81);

/** A shot struck from the tee of `hole`, its first landing and where it rests, across the aim (left is positive) and along it. */
function strike(club: string, shape: number, power = 1, hole = LEVEL) {
  const { game, calls } = golfGame(hole);
  game.pick(club);
  game.setShape(shape);
  const x0 = game.world.x[game.ball],
    y0 = game.world.y[game.ball];
  game.shoot(NORTH, power);
  for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) game.step(DT);
  const land = (calls.find(([n, a]) => n === 'landed' && a[3] === true)?.[1] as number[] | undefined) ?? [x0, y0];
  const frame = (x: number, y: number) => ({ across: -(x - x0), along: y - y0 });
  return { landing: frame(land[0], land[1]), rest: frame(game.world.x[game.ball], game.world.y[game.ball]), game };
}

describe('a fade and a draw', () => {
  it('turn a full driver eighteen to thirty yards off its line at the landing, a 7-iron ten to eighteen, a sand wedge two to six', () => {
    for (const [club, least, most] of [
      ['driver', 18, 30],
      ['7-iron', 10, 18],
      ['sand-wedge', 2, 6],
    ] as const) {
      const fade = strike(club, 1).landing;
      const draw = strike(club, -1).landing;
      // a fade goes to the right, which is the negative side; a draw to the left
      expect(-fade.across, `${club}: a fade`).toBeGreaterThan(least);
      expect(-fade.across, `${club}: a fade`).toBeLessThan(most);
      expect(draw.across, `${club}: a draw`).toBeGreaterThan(least);
      expect(draw.across, `${club}: a draw`).toBeLessThan(most);
      // alike either way
      expect(draw.across).toBeCloseTo(-fade.across, 3);
      expect(draw.along).toBeCloseTo(fade.along, 3);
    }
  });

  it('shorten the carry only as geometry says: a ball that turns goes less far along its first line, by the cosine of the turn', () => {
    for (const club of ['driver', '7-iron', 'sand-wedge']) {
      const straight = strike(club, 0).landing;
      const fade = strike(club, 1).landing;
      const lost = straight.along - fade.along;
      expect(lost, club).toBeGreaterThan(0);
      // the carry is the same length of path, turned by half the turn at most, so the loss is a small share of it
      const turn = Math.atan2(-fade.across, fade.along);
      expect(Math.hypot(fade.across, fade.along), `${club}: the path's own length`).toBeCloseTo(
        Math.hypot(straight.across, straight.along),
        0,
      );
      expect(lost, club).toBeLessThan(straight.along * (1 - Math.cos(turn)) * 1.2 + 0.5);
    }
  });

  it('are half as much for half a shape, near enough: it is a rate, not a switch', () => {
    const half = -strike('driver', 0.5).landing.across;
    const full = -strike('driver', 1).landing.across;
    expect(half).toBeGreaterThan(0.45 * full);
    expect(half).toBeLessThan(0.55 * full);
  });

  it('turn the heading clockwise from above for a fade, which is toward the right of the line of flight seen from behind the ball', () => {
    for (const [shape, sign] of [
      [1, -1],
      [-1, 1],
    ] as const) {
      const { game } = golfGame(LEVEL);
      game.pick('7-iron');
      game.setShape(shape);
      game.shoot(NORTH, 1);
      const headings: number[] = [];
      for (let f = 0; f < 90 && !(f > 1 && game.ready); f++) {
        game.step(DT);
        const { ball, world } = game;
        if (world.z[ball] > 3) headings.push(Math.atan2(world.vy[ball], world.vx[ball]));
      }
      expect(headings.length).toBeGreaterThan(20);
      for (let k = 1; k < headings.length; k++)
        expect(Math.sign(headings[k] - headings[k - 1]), `frame ${k}`).toBe(sign);
    }
  });

  it('take no speed from the ball and add none: across the ground it flies as fast as it would straight', () => {
    const speeds = (shape: number) => {
      const { game } = golfGame(LEVEL);
      game.pick('driver');
      game.setShape(shape);
      game.shoot(NORTH, 1);
      const out: number[] = [];
      for (let f = 0; f < 60; f++) {
        game.step(DT);
        out.push(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]));
      }
      return out;
    };
    const straight = speeds(0),
      fade = speeds(1),
      draw = speeds(-1);
    // not the very digit: the first step off the ground goes by the lie and not the air; but through the flight, to a part in a thousand
    for (let k = 2; k < straight.length; k++) {
      expect(Math.abs(fade[k] - straight[k]) / straight[k], `fade, frame ${k}`).toBeLessThan(1e-3);
      expect(Math.abs(draw[k] - straight[k]) / straight[k], `draw, frame ${k}`).toBeLessThan(1e-3);
    }
  });

  it('work only until the ball first comes down: what it does on the ground it does straight, a roll along the heading it landed on', () => {
    const { game, calls } = golfGame(LEVEL);
    game.pick('driver');
    game.setShape(1);
    game.shoot(NORTH, 1);
    let heading = NaN;
    let at: [number, number] = [0, 0];
    for (let f = 0; f < 60 * 40 && !(f > 1 && game.ready); f++) {
      game.step(DT);
      if (Number.isNaN(heading) && calls.some(([n]) => n === 'landed')) {
        // the step it landed in has turned it up and scrubbed it, but not along the ground
        heading = Math.atan2(game.world.vy[game.ball], game.world.vx[game.ball]);
        at = [game.world.x[game.ball], game.world.y[game.ball]];
      }
    }
    const roll = Math.atan2(game.world.y[game.ball] - at[1], game.world.x[game.ball] - at[0]);
    expect(Math.abs(roll - heading), 'the roll is along the heading at the landing').toBeLessThan(0.08);
  });

  it('are used by the shot they were chosen for and by no other, and are chosen again for the next', () => {
    const { game } = golfGame(LEVEL);
    game.pick('driver');
    game.setShape(1);
    expect(game.shape).toBe(1);
    game.shoot(NORTH, 1);
    expect(game.shape, 'put back to straight when the shot is struck').toBe(0);
    // a shape chosen while the ball flies is for the next shot and not this one
    const before = strike('driver', 1).landing;
    const latched = golfGame(LEVEL);
    latched.game.pick('driver');
    latched.game.setShape(1);
    latched.game.shoot(NORTH, 1);
    latched.game.setShape(-1);
    for (let f = 0; f < 60 * 40 && !(f > 1 && latched.game.ready); f++) latched.game.step(DT);
    const land = latched.calls.find(([n, a]) => n === 'landed' && a[3] === true)![1] as number[];
    expect(-(land[0] - latched.game.lie.x), 'the fade it was struck with').toBeCloseTo(before.across, 3);
    expect(latched.game.shape).toBe(-1);
  });

  it('are not used up by a shot that is refused: a ball moving cannot be struck, and the choice stays', () => {
    const { game } = golfGame(LEVEL);
    game.pick('driver');
    game.shoot(NORTH, 1);
    game.setShape(0.7);
    expect(game.shoot(NORTH, 1)).toBe(false);
    expect(game.shape).toBe(0.7);
    expect(game.shoot(NORTH, 0)).toBe(false);
  });

  it('are put back to straight at each hole, and by a trial in a rehearsal', () => {
    const { game } = golfGame(LEVEL);
    game.playCourse([LEVEL, LEVEL]);
    game.setShape(1);
    game.setSpin(-1);
    game.begin(1);
    expect([game.shape, game.spin]).toEqual([0, 0]);
    const rehearsal = game.rehearsal();
    rehearsal.setShape(-1);
    rehearsal.setSpin(1);
    rehearsal.trial(game.world.x[game.ball], game.world.y[game.ball]);
    expect([rehearsal.shape, rehearsal.spin]).toEqual([0, 0]);
  });

  it('are held to their limits, and a number that is not one leaves the choice as it was', () => {
    const { game } = golfGame(LEVEL);
    game.setShape(3);
    expect(game.shape).toBe(1);
    game.setShape(-3);
    expect(game.shape).toBe(-1);
    game.setShape(0.25);
    for (const bad of [NaN, Infinity, -Infinity]) {
      game.setShape(bad);
      expect(game.shape, String(bad)).toBe(0.25);
    }
    game.setSpin(0.4);
    game.setSpin(NaN);
    expect(game.spin).toBe(0.4);
    game.setSpin(-9);
    expect(game.spin).toBe(-1);
  });

  it('do nothing for the putter, which goes along the ground, and the choice is used up all the same', () => {
    const plain = strike('putter', 0, 0.6);
    const shaped = strike('putter', 1, 0.6);
    expect(shaped.rest).toEqual(plain.rest);
    expect(shaped.game.shape).toBe(0);
  });

  it('do nothing on a hole of minigolf, and the choice is used up there too', () => {
    const play = (shape: number) => {
      const { game } = newGame(5, null, [GREEN]);
      game.setShape(shape);
      game.shoot(NORTH + 0.3, 0.8);
      for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) game.step(DT);
      return { at: [game.world.x[game.ball], game.world.y[game.ball]], shape: game.shape };
    };
    expect(play(1).at).toEqual(play(0).at);
    expect(play(-1).at).toEqual(play(0).at);
    expect(play(1).shape).toBe(0);
  });

  it('keep every rule that must always hold, for every club that has a loft, at full power and at a half', () => {
    for (const club of BAG.filter((c) => c.loft > 0))
      for (const shape of [-1, 1])
        for (const power of [1, 0.5]) {
          const { game } = golfGame(LEVEL);
          game.pick(club.id);
          game.setShape(shape);
          game.shoot(NORTH, power);
          for (let f = 0; f < 60 * 20 && !(f > 1 && game.ready); f++) {
            game.step(DT);
            expect(checkInvariants(game), `${club.id}, shape ${shape}, frame ${f}`).toEqual([]);
          }
          expect(game.ready).toBe(true);
        }
  });
});

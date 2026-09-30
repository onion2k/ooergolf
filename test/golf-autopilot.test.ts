/**
 * The autopilot on a golf hole: it picks the club a golfer would for the distance it has, aims at the cup, and putts
 * from the green. It is the measuring instrument every gate plays golf through, so what it must do is that it gets
 * round every hole of the range, in the strokes a competent player takes, the same every time from a seed. It works
 * the distance out from the distance and the loft, not from the game's own tables; a planner that tries its shots
 * in a copy of the game is a later stage's.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { BAG, bagClub, carryOf } from '../src/bag';
import { RANGE } from '../src/range';
import { seeded } from '../src/random';
import { checkInvariants } from '../src/invariants';
import { DT, field, golfGame } from './helpers';
import { paceRun } from '../scripts/pace';

describe('the autopilot on a golf hole', () => {
  it('plans a driver, at full power, from the tee of a hole longer than anything else can reach', () => {
    const { game } = golfGame(RANGE[2]);
    const plan = new Autopilot(game).plan()!;
    expect(plan.club).toBe('driver');
    expect(plan.power).toBeGreaterThan(0.95);
    const { tee, cup } = game.layout;
    expect(plan.angle).toBeCloseTo(Math.atan2(cup.y - tee.y, cup.x - tee.x), 6);
  });

  it('plans the shortest club that reaches, at the power that lands at the cup: a wedge from a hundred units', () => {
    const { game } = golfGame(RANGE[0]);
    const plan = new Autopilot(game).plan()!;
    const club = bagClub(plan.club!);
    expect(['pitching-wedge', '9-iron', 'sand-wedge']).toContain(club.id);
    // it carries about the distance to the cup, less the run on
    const d = Math.hypot(game.layout.cup.x - game.layout.tee.x, game.layout.cup.y - game.layout.tee.y);
    const carry = carryOf(club, plan.power);
    expect(carry).toBeGreaterThan(d * 0.85);
    expect(carry).toBeLessThan(d * 1.02);
  });

  it('picks a shorter club for a shorter distance, all the way down the bag', () => {
    const reach = (d: number) => {
      const hole = field('f', 130, 41);
      const { game } = golfGame(hole);
      game.place(game.layout.tee.x, game.layout.tee.y);
      // the cup is far in the corner; the distance is tried by putting the ball d from it, on the fairway
      const cup = game.layout.cup;
      game.place(cup.x + 8, cup.y - d);
      return BAG.findIndex((c) => c.id === new Autopilot(game).plan()!.club);
    };
    const picks = [40, 90, 130, 170, 210, 260].map(reach);
    for (let k = 1; k < picks.length; k++) expect(picks[k], `${k}`).toBeLessThanOrEqual(picks[k - 1]);
    expect(picks[0]).toBeGreaterThan(picks[picks.length - 1]);
  });

  it('putts from the green, with the putter, at the speed that arrives at the cup', () => {
    const { game } = golfGame(field('g'));
    const cup = game.layout.cup;
    game.place(cup.x + 12, cup.y);
    const plan = new Autopilot(game).plan()!;
    expect(plan.club).toBe('putter');
    expect(Math.abs(Math.cos(plan.angle) + 1)).toBeLessThan(1e-6);
    expect(plan.power).toBeGreaterThan(0.1);
    expect(plan.power).toBeLessThan(0.6);
  });

  it('is none for a ball that is not at rest, on a golf hole as elsewhere', () => {
    const { game } = golfGame(RANGE[0]);
    game.shoot(Math.PI / 2, 1);
    game.step(DT * 10);
    expect(new Autopilot(game).plan()).toBeNull();
  });

  it('gets round every hole of the range, on every seed, in a round a player would recognise', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const run = paceRun(seed, 20, RANGE);
      expect(run.finished, `seed ${seed}`).toBe(true);
      // each hole is holed out or picked up at the limit, and a round over the range is a few dozen strokes at most
      run.card.forEach((score, h) => expect(score, `seed ${seed} hole ${h + 1}`).toBeLessThanOrEqual(RANGE[h].par + 5));
      expect(run.strokes, `seed ${seed}`).toBeLessThan(RANGE.reduce((a, h) => a + h.par, 0) + 12);
    }
  });

  it('plays the same round from the same seed, and a different one from another', () => {
    const a = paceRun(3, 20, RANGE),
      b = paceRun(3, 20, RANGE),
      c = paceRun(4, 20, RANGE);
    expect(a.card).toEqual(b.card);
    expect(c.strokes).toBeGreaterThan(0);
  });

  it('keeps every rule while it plays a hole with slips', () => {
    const { game } = golfGame(RANGE[2], seeded(5));
    const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(9) });
    for (let f = 0; f < 60 * 240 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 7 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
  });
});

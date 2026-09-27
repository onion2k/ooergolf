/** The autopilot as a measuring instrument: it knows how far a shot rolls, sees round corners, holes out, and gets stuck nowhere. */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, layoutOf, onFloor } from '../src/arena';
import { Autopilot, speedFor } from '../src/autopilot';
import { COURSE } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { seeded } from '../src/random';
import { DT, newGame, onGreen } from './helpers';

describe('the autopilot', () => {
  it('knows how far a shot rolls: struck to stop at a distance, it stops near it', () => {
    for (const d of [5, 10, 20, 30, 40]) {
      const { game } = onGreen();
      const { tee } = game.layout;
      game.shoot(Math.PI / 2, speedFor(d, 0) / HARDEST_SHOT);
      for (let f = 0; f < 600 && !game.ready; f++) game.step(DT);
      const went = game.world.y[game.ball] - tee.y;
      expect(Math.abs(went - d), `asked for ${d}, went ${went.toFixed(1)}`).toBeLessThan(Math.max(1.5, d * 0.12));
    }
  });

  it('sees round a corner: every shot it plans has clear grass the whole way', () => {
    const { game } = newGame();
    game.begin(1);
    const pilot = new Autopilot(game);
    const shot = pilot.plan()!;
    const { layout } = game;
    const x0 = game.world.x[game.ball],
      y0 = game.world.y[game.ball];
    const cupAngle = Math.atan2(layout.cup.y - y0, layout.cup.x - x0);
    expect(Math.abs(shot.angle - cupAngle), 'not straight at a cup behind the rail').toBeGreaterThan(0.1);
    // the first twelve units along the shot are clear of the rail for the ball's width
    for (let s = 0; s < 12; s += 0.5)
      expect(onFloor(layout, x0 + Math.cos(shot.angle) * s, y0 + Math.sin(shot.angle) * s)).toBe(true);
  });

  it('holes out every hole of the course without a slip, within par, breaking no rule', () => {
    const { game } = newGame(1);
    const pilot = new Autopilot(game);
    const card: number[] = [];
    for (let f = 0; f < 60 * 60 * 3 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game)).toEqual([]);
      card.splice(0, card.length, ...game.card);
    }
    expect(game.phase).toBe('over');
    card.forEach((score, h) => expect(score, COURSE[h].name).toBeLessThanOrEqual(COURSE[h].par));
  });

  it('plays as a player does with a skill: slips of aim and power from its own chance, the same from the same seed', () => {
    const round = (seed: number) => {
      const { game } = newGame(seed);
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 5 && game.phase !== 'over'; f++) pilot.step(DT);
      return [...game.card];
    };
    expect(round(3)).toEqual(round(3));
    const cards = [1, 2, 3, 4, 5, 6].map(round);
    for (const card of cards) expect(card.length, 'every round finished').toBe(COURSE.length);
    expect(new Set(cards.map((c) => c.join())).size, 'the slips make rounds differ').toBeGreaterThan(1);
  });

  it('plans no shot when none can be taken', () => {
    const { game } = newGame();
    game.shoot(0, 0.5);
    expect(new Autopilot(game).plan()).toBe(null);
  });

  it('finds its way on any map the course could have', () => {
    const map = ['#########', '#......C#', '#.#######', '#.#      ', '#.#      ', '#T#      ', '###      '];
    const l = layoutOf(map);
    expect(onFloor(l, l.cup.x, l.cup.y)).toBe(true);
  });
});

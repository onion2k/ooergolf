/**
 * How the desert's three courses play, by the pace gate's player over the gate's sixteen seeds as a whole round (a hole's chance is
 * the next hole's, so a hole is never held alone): each course is held to the target it was asked for, in strokes over par a hole, to a
 * round in which every hole is finished with the starting club and ball, and to no hole picked up in more than one round of sixteen.
 * The figures a course had when its seeds were chosen are in its module's header; the band here is what it was asked for, wider than
 * the wobble of the mean (a fifth of a stroke a hole is more than a seed's worth), so a respec that moves a course out of its class is
 * seen, and one that moves it within is not. Not the pace gate itself: that holds a baseline, both ways, and these courses join it when
 * they join the game.
 */
import { describe, expect, it } from 'vitest';
import { CHECK, PLAYER, mean, paceRun } from '../scripts/pace';
import { Autopilot } from '../src/autopilot';
import { BADLANDS_SPECS } from '../src/badlands';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { MESA_SPECS } from '../src/mesa';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { SALTPAN_SPECS } from '../src/saltpan';
import { DT } from './helpers';
import { madeOf } from './desert';

/** Each course: its specs, and the strokes over par a hole it was asked to take (easy: a quarter under; middle: about par; hard: half to nine tenths over). */
const TARGETS = [
  { name: 'The Saltpan', specs: SALTPAN_SPECS, least: -0.4, most: -0.2 },
  { name: 'The Mesa', specs: MESA_SPECS, least: -0.1, most: 0.2 },
  { name: 'The Badlands', specs: BADLANDS_SPECS, least: 0.5, most: 0.9 },
] as const;

describe('the desert courses as the pace gate’s player plays them', () => {
  for (const { name, specs, least, most } of TARGETS) {
    it(`plays ${name} in its class: ${least} to ${most} strokes a hole over par, every round finished, no hole picked up twice`, () => {
      const { holes } = madeOf(specs);
      const par = holes.reduce((a, h) => a + h.par, 0);
      const runs = CHECK.seeds.map((seed) => paceRun(seed, CHECK.capMinutes, holes));
      // a check that did not start passes in silence: sixteen rounds, of nine holes each
      expect(runs.length).toBe(16);
      for (const r of runs) {
        expect(r.finished, `seed ${r.seed}: finished with the starting club`).toBe(true);
        expect(r.card.length, `seed ${r.seed}`).toBe(9);
      }
      const over = (mean(runs.map((r) => r.strokes)) - par) / holes.length;
      expect(over, `${name}: strokes a hole over par`).toBeGreaterThanOrEqual(least);
      expect(over, `${name}: strokes a hole over par`).toBeLessThanOrEqual(most);
      for (const [i, h] of holes.entries()) {
        const picked = runs.filter((r) => r.card[i] >= h.par + LIMIT_OVER_PAR).length;
        expect(picked, `${h.name}: rounds of sixteen it was picked up in`).toBeLessThanOrEqual(1);
      }
    }, 300_000);

    it(`breaks no rule in a round of ${name}, the invariants read as it goes`, () => {
      const { holes } = madeOf(specs);
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(3), course: holes });
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(3 * 31 + 7) });
      let checked = 0;
      for (let f = 0; f < 60 * 60 * 20 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 31 === 0) {
          checked++;
          expect(checkInvariants(game), `frame ${f}, hole ${game.hole}`).toEqual([]);
        }
      }
      expect(game.phase).toBe('over');
      expect(checked).toBeGreaterThan(100);
    }, 300_000);
  }
});

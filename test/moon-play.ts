/**
 * How a course of the Moon plays, written once for the three and read by a test file each: a round of it played by the pace
 * gate's player (`paceRun`, a good golfer's slips) on each of the gate's sixteen seeds, held in the strokes a hole over par the
 * course was asked for, with no hole picked up in more than one round of sixteen, and one round watched for the rules as it goes.
 * The Moon's clock is slower (a ball hangs 1.53 times as long) so a round takes more frames than on earth, and the cap given
 * `paceRun` is thirty game minutes and not twenty. The seeds were chosen by this measure (see each course's header): a hole's
 * chance is the next hole's, so a seed that plays well alone is not the one that plays well in a round, and a count here is the
 * gate's own sixteen, not seeds the choice could not have seen.
 *
 * Each seed is a test of its own so that no one test holds the event loop long enough for the worker to be thought lost.
 */
import { describe, expect, it } from 'vitest';
import { CHECK, mean, paceRun, PLAYER, type PaceRun } from '../scripts/pace';
import { Autopilot } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DT } from './helpers';

/** The game minutes a round of the Moon is given before it counts as stuck: the pace gate's twenty, and half as much again for the slower clock. */
export const MOON_CAP = 30;

export interface MoonPlay {
  title: string;
  make: () => readonly HoleDef[];
  /** Strokes a hole over par, the mean over the gate's sixteen seeds: least and most. */
  target: [number, number];
}

export function holdsPlay(p: MoonPlay) {
  describe(`${p.title}, played`, () => {
    const holes = p.make();
    const par = holes.reduce((a, h) => a + h.par, 0);
    const runs: PaceRun[] = [];

    for (const seed of CHECK.seeds)
      it(`is played round on seed ${seed}, every hole finished inside its limit`, () => {
        const r = paceRun(seed, MOON_CAP, holes);
        runs.push(r);
        expect(r.finished, 'the round was finished inside the cap').toBe(true);
        expect(r.card.length).toBe(holes.length);
        r.card.forEach((score, h) => expect(score, holes[h].name).toBeLessThanOrEqual(holes[h].par + LIMIT_OVER_PAR));
      }, 60_000);

    it(`takes ${p.target[0]} to ${p.target[1]} strokes a hole over par over the gate’s sixteen seeds`, () => {
      expect(runs.length).toBe(CHECK.seeds.length);
      const over = (mean(runs.map((r) => r.strokes)) - par) / holes.length;
      expect(over, `${mean(runs.map((r) => r.strokes)).toFixed(2)} strokes for a par of ${par}`).toBeGreaterThanOrEqual(
        p.target[0],
      );
      expect(over, `${mean(runs.map((r) => r.strokes)).toFixed(2)} strokes for a par of ${par}`).toBeLessThanOrEqual(
        p.target[1],
      );
    });

    it('picks no hole up in more than one round of the sixteen', () => {
      holes.forEach((h, k) => {
        const picked = runs.filter((r) => r.card[k] >= h.par + LIMIT_OVER_PAR).length;
        expect(picked, `${h.name}: rounds picked up in`).toBeLessThanOrEqual(1);
      });
    });

    it('breaks no rule in a round, checked every few frames of it', () => {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(1), course: holes });
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(1 * 31 + 7) });
      let checked = 0;
      for (let f = 0; f < MOON_CAP * 3600 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 211 === 0) {
          checked++;
          expect(checkInvariants(game), `frame ${f}, hole ${game.hole}`).toEqual([]);
        }
      }
      expect(checked).toBeGreaterThan(20);
      expect(game.phase).toBe('over');
    }, 120_000);
  });
}

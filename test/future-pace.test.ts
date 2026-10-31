/**
 * How the three Future courses play, by the pace gate's player over the gate's sixteen seeds: each a whole round of nine, held to
 * the band it was asked for (Neon Park a fifth to two fifths of a stroke a hole under par, Chrome Heights about par, The Singularity
 * half a stroke to nine tenths over), with no hole picked up in more than one round of sixteen, and the rules held as a round
 * goes. A seed was chosen by its mean over a dozen rounds of the hole alone and then held to the whole course here, since a hole
 * in a round of nine draws on the same chance as the holes before it and does not come out as it did alone. Without this a
 * respec could turn an easy course into a hard one and every count in the course's own table would still hold. The figures
 * are not in `pace-baseline.json` (that is Part 12's, when the courses are in the game); the band is what the course was asked for.
 * Slow, so it is in the full check and not the hook.
 */
import { describe, expect, it } from 'vitest';
import { CHECK, mean, paceRun, PLAYER } from '../scripts/pace';
import { Autopilot } from '../src/autopilot';
import { CHROME_SPECS, chromeHeights } from '../src/chrome';
import type { HoleDef } from '../src/course';
import { Game, LIMIT_OVER_PAR } from '../src/game';
import type { GolfSpec } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { NEON_PARK_SPECS, neonPark } from '../src/neonpark';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { SINGULARITY_SPECS, singularity } from '../src/singularity';
import { DT } from './helpers';

interface Target {
  title: string;
  specs: readonly GolfSpec[];
  holes: readonly HoleDef[];
  /** Strokes a hole over par, least to most, as the course was asked for. */
  over: [least: number, most: number];
  /** What the pace player took over the gate's sixteen when this was written, for the reader. */
  took: number;
}

const COURSES: Target[] = [
  { title: 'Neon Park', specs: NEON_PARK_SPECS, holes: neonPark(), over: [-0.4, -0.2], took: 31.63 },
  { title: 'Chrome Heights', specs: CHROME_SPECS, holes: chromeHeights(), over: [-0.1, 0.2], took: 36.81 },
  { title: 'The Singularity', specs: SINGULARITY_SPECS, holes: singularity(), over: [0.5, 0.9], took: 42.88 },
];

describe('how the Future courses play', () => {
  for (const c of COURSES) {
    it(`${c.title}: a round over the gate's sixteen seeds is in its band, every round finished, no hole picked up in more than one`, () => {
      const runs = CHECK.seeds.map((seed) => paceRun(seed, CHECK.capMinutes, c.holes));
      expect(
        runs.every((r) => r.finished),
        'every round finished',
      ).toBe(true);
      expect(runs.every((r) => r.card.length === c.holes.length)).toBe(true);
      const par = c.holes.reduce((a, h) => a + h.par, 0);
      const strokes = mean(runs.map((r) => r.strokes));
      const perHole = (strokes - par) / c.holes.length;
      expect(
        perHole,
        `${c.title}: ${strokes.toFixed(2)} for a par of ${par} (it took ${c.took} when written)`,
      ).toBeGreaterThanOrEqual(c.over[0]);
      expect(perHole, `${c.title}: ${strokes.toFixed(2)} for a par of ${par}`).toBeLessThanOrEqual(c.over[1]);
      // a hole is picked up when the limit over par is reached; once in sixteen rounds is chance, twice is a hole that is too much
      c.holes.forEach((h, i) => {
        const picked = runs.filter((r) => r.card[i] >= h.par + LIMIT_OVER_PAR).length;
        expect(picked, `${h.name}: rounds of sixteen it was picked up in`).toBeLessThanOrEqual(1);
      });
    }, 240000);

    it(`${c.title}: a round with a player's slips breaks no rule at any stroke`, () => {
      const seed = 3;
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: c.holes });
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      let checked = 0;
      for (let f = 0; f < CHECK.capMinutes * 3600 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) {
          checked++;
          expect(checkInvariants(game), `frame ${f}, hole ${game.hole}`).toEqual([]);
        }
      }
      expect(game.phase).toBe('over');
      expect(checked, 'the rules were read through the round').toBeGreaterThan(100);
      expect(game.card.length).toBe(c.holes.length);
    }, 240000);
  }
});

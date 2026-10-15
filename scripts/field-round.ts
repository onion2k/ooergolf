/**
 * One rival's round, as the field table counts it: the autopilot at a skill, on a seed, played exactly as the pace gate plays
 * one (`paceRun`). It is in one place for `npm run field`, which counts thousands of them, and for `test/field.test.ts`,
 * which plays The Meadow's again to show the table was made by the autopilot and the skills as they are now; without that
 * a change to either would leave the rivals scoring what an older autopilot scored, and only the hole hashes were checked.
 */
import { Autopilot, type Skill } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** The game minutes a round is given before it counts as stuck, as the pace gate gives one. */
export const CAP_MINUTES = 20;

/** The card of a round of these holes at this skill on this seed, or null if it did not finish within `CAP_MINUTES`. */
export function fieldRound(holes: readonly HoleDef[], skill: Skill, seed: number): number[] | null {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: holes });
  const pilot = new Autopilot(game, { skill, random: seeded(seed * 31 + 7) });
  for (let f = 0; f < CAP_MINUTES * 3600 && game.phase !== 'over'; f++) pilot.step(DT);
  return game.phase === 'over' ? [...game.card] : null;
}

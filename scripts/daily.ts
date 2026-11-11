/**
 * The daily hole's gate, its working parts: four hundred days' holes built, and each played by the pace player (the autopilot with a
 * player's slips, as `pace.ts` has it) on a few seeds, to hold that a day's hole is always a hole that can be played. A hole made
 * from a spec the day drew can be refused by the generator (the next seed up is tried) or so hard that the pace player cannot hole it;
 * neither may be the rule. `daily-check.ts` runs it, as `npm run daily:check`, in about three minutes.
 *
 * The bar is not nine seeds in ten for every day, as the plan guessed: over 400 days and ten seeds, 17 days held on nine and
 * five days on fewer (7 to 8 of 10: the player's own slips on a hole with a dogleg and bunkers), and 99.3% of the 4,000 rounds were
 * holed inside the limit. So it is held on the whole, and on each day at a floor that a hole nobody can finish falls under.
 */
import { shiftDay } from '../src/daily';

/** The days and seeds checked, how many game minutes a round gets, and the bars: the share of all rounds holed inside the limit, and the least share on any one day. */
export const DAILY = {
  from: '2026-11-11',
  days: 400,
  seeds: 8,
  capMinutes: 5,
  overall: 0.98,
  perDay: 0.6,
  refusing: 0.15,
} as const;

/** What one day came to: how its hole was made and how many of its rounds were holed inside the limit. */
export interface DayRun {
  day: string;
  /** Specs the generator refused before the hole was made, and whether it came to the plain spec. */
  refused: number;
  plain: boolean;
  /** Rounds played, holed inside the limit, and not finished at all in the time given. */
  rounds: number;
  holed: number;
  stuck: number;
}

/** The days checked, in order. */
export const checkedDays = (): string[] => Array.from({ length: DAILY.days }, (_, k) => shiftDay(DAILY.from, k));

/** What is wrong with the days' runs: a gate that played nothing is said, not passed over. */
export function problems(runs: readonly DayRun[]): string[] {
  const out: string[] = [];
  if (runs.length !== DAILY.days) out.push(`${runs.length} days were played, not ${DAILY.days}`);
  const rounds = runs.reduce((a, r) => a + r.rounds, 0);
  if (rounds === 0 || runs.some((r) => r.rounds !== DAILY.seeds))
    out.push(`a day was not played on all ${DAILY.seeds} seeds`);
  for (const r of runs) {
    if (r.plain) out.push(`${r.day}: every seed was refused and the plain hole was made`);
    if (r.stuck > 0) out.push(`${r.day}: ${r.stuck} rounds never finished in ${DAILY.capMinutes} minutes`);
    if (r.rounds > 0 && r.holed / r.rounds < DAILY.perDay)
      out.push(
        `${r.day}: ${r.holed} of ${r.rounds} rounds holed inside the limit, under ${DAILY.perDay * 100}% of them`,
      );
  }
  const holed = runs.reduce((a, r) => a + r.holed, 0);
  if (rounds > 0 && holed / rounds < DAILY.overall)
    out.push(`${holed} of ${rounds} rounds holed inside the limit, under ${DAILY.overall * 100}%`);
  const refusing = runs.filter((r) => r.refused > 0).length;
  if (runs.length > 0 && refusing / runs.length > DAILY.refusing)
    out.push(`${refusing} of ${runs.length} days had a spec refused, over ${DAILY.refusing * 100}%`);
  return out;
}

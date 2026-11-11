/**
 * The daily gate: see `daily.ts`.
 *
 *   npm run daily:check     400 days built and each played by the pace player on eight seeds, held to the bars in `daily.ts`
 */
import { dailyBuild } from '../src/daily';
import { DAILY, checkedDays, problems, type DayRun } from './daily';
import { paceRun } from './pace';

function main() {
  const started = performance.now();
  const runs: DayRun[] = [];
  for (const day of checkedDays()) {
    const { hole, refused, plain } = dailyBuild(day);
    let holed = 0,
      stuck = 0;
    for (let seed = 1; seed <= DAILY.seeds; seed++) {
      const run = paceRun(seed, DAILY.capMinutes, [hole]);
      if (!run.finished) stuck++;
      else if (run.card[0] < hole.par + 5) holed++;
    }
    runs.push({ day, refused, plain, rounds: DAILY.seeds, holed, stuck });
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  const total = runs.reduce((a, r) => a + r.rounds, 0),
    holed = runs.reduce((a, r) => a + r.holed, 0);
  const refused = runs.reduce((a, r) => a + r.refused, 0);
  console.log(
    `daily: ${runs.length} days from ${DAILY.from}, ${holed} of ${total} rounds holed inside the limit (${((holed / total) * 100).toFixed(1)}%); ` +
      `${refused} specs refused on ${runs.filter((r) => r.refused > 0).length} days, ${runs.filter((r) => r.plain).length} plain; ` +
      `lowest day ${Math.min(...runs.map((r) => r.holed))} of ${DAILY.seeds} (${seconds} s)`,
  );
  const bad = problems(runs);
  for (const p of bad) console.error(`daily: ${p}`);
  if (bad.length) process.exitCode = 1;
}

main();

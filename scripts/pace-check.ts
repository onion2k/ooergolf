/**
 * The pace gate: see `pace.ts`.
 *
 *   npm run pace                       each course's figures, seed by seed, and each hole's median against its par
 *   npm run pace:check                 held to scripts/pace-baseline.json
 *   npm run pace:check -- --update     the baseline written again, after a change meant to move it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COURSES } from '../src/course';
import { CHECK, mean, median, moved, paceRun, round } from './pace';

const BASELINE = 'scripts/pace-baseline.json';

/** The strokes a round of each course takes, by its name. */
type Baseline = Record<string, number>;

function main() {
  const args = process.argv.slice(2);
  const figures: Baseline = {};
  let stuckAny = false;
  for (const course of COURSES) {
    const started = performance.now();
    const runs = CHECK.seeds.map((seed) => paceRun(seed, undefined, course.holes));
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const figure = round(mean(runs.map((r) => r.strokes)));
    figures[course.name] = figure;
    const stuck = runs.filter((r) => !r.finished);
    console.log(`${course.name}:`);
    for (const r of runs)
      console.log(
        `  seed ${r.seed}: ${r.finished ? `${r.strokes} strokes (${r.card.join(' ')})` : `stuck after ${CHECK.capMinutes} min`}`,
      );
    // what each hole takes, against its par: the autopilot's figure beside each hole's intended one
    const holes = course.holes.map((h, i) => `${h.name} ${median(runs.map((r) => r.card[i] ?? NaN))}/${h.par}`);
    console.log(`  mean ${figure} strokes; by hole, median/par: ${holes.join(', ')} (${seconds} s)`);
    for (const r of stuck) console.error(`  seed ${r.seed} did not finish ${course.name} in ${CHECK.capMinutes} min`);
    if (stuck.length) stuckAny = true;
  }
  if (stuckAny) process.exitCode = 1;
  if (!args.includes('--check')) return;

  if (args.includes('--update')) {
    if (stuckAny) {
      console.error('not written: fix these first');
      return;
    }
    writeFileSync(BASELINE, `${JSON.stringify(figures, null, 2)}\n`);
    console.log('pace baseline written');
    return;
  }
  // as written, which may be of an older shape, or want a course added since
  let baseline: Partial<Baseline>;
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<Baseline>;
  } catch {
    console.error('no baseline: run npm run pace:check -- --update first');
    process.exitCode = 1;
    return;
  }
  let movedAny = false;
  for (const [name, figure] of Object.entries(figures)) {
    const was = baseline[name];
    if (was === undefined) {
      console.error(`pace: ${name} has no baseline: run npm run pace:check -- --update, and say why`);
      movedAny = true;
      continue;
    }
    const out = moved(was, figure);
    console.log(`pace: ${name} ${was} -> ${figure} strokes (${out ? 'MOVED' : 'within tolerance'})`);
    if (out) movedAny = true;
  }
  if (movedAny) {
    console.error(
      `\nthe pacing moved beyond tolerance: if that was meant, npm run pace:check -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

main();

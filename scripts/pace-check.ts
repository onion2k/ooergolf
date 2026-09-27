/**
 * The pace gate: see `pace.ts`.
 *
 *   npm run pace                       the figures, seed by seed, and each hole's median against its par
 *   npm run pace:check                 held to scripts/pace-baseline.json
 *   npm run pace:check -- --update     the baseline written again, after a change meant to move it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { COURSE } from '../src/course';
import { CHECK, mean, median, moved, paceRun, round } from './pace';

const BASELINE = 'scripts/pace-baseline.json';

function main() {
  const args = process.argv.slice(2);
  const started = performance.now();
  const runs = CHECK.seeds.map((seed) => paceRun(seed));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const figure = round(mean(runs.map((r) => r.strokes)));
  const stuck = runs.filter((r) => !r.finished);
  for (const r of runs)
    console.log(
      `seed ${r.seed}: ${r.finished ? `${r.strokes} strokes (${r.card.join(' ')})` : `stuck after ${CHECK.capMinutes} min`}`,
    );
  // what each hole takes, against its par: par is set from this
  const holes = COURSE.map((h, i) => `${h.name} ${median(runs.map((r) => r.card[i] ?? NaN))}/${h.par}`);
  console.log(`mean ${figure} strokes; by hole, median/par: ${holes.join(', ')} (${seconds} s)`);
  for (const r of stuck) console.error(`  seed ${r.seed} did not finish the round in ${CHECK.capMinutes} min`);
  if (stuck.length) process.exitCode = 1;
  if (!args.includes('--check')) return;

  if (args.includes('--update')) {
    if (stuck.length) {
      console.error('not written: fix these first');
      return;
    }
    writeFileSync(BASELINE, `${JSON.stringify({ strokes: figure }, null, 2)}\n`);
    console.log('pace baseline written');
    return;
  }
  let baseline: { strokes: number };
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { strokes: number };
  } catch {
    console.error('no baseline: run npm run pace:check -- --update first');
    process.exitCode = 1;
    return;
  }
  const out = moved(baseline.strokes, figure);
  console.log(`pace: ${baseline.strokes} -> ${figure} strokes (${out ? 'MOVED' : 'within tolerance'})`);
  if (out) {
    console.error(
      `\nthe pacing moved beyond tolerance: if that was meant, npm run pace:check -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

main();

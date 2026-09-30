/**
 * The monkey, over many seeds side by side: see `fuzzer.ts`.
 *
 *   npm run fuzz                         seeds 1-12, 4000 frames each, on the courses and again on The Range
 *   npm run fuzz -- --seeds 1-50 --frames 10000
 *   npm run fuzz -- --seed 17            one seed again, with what was done before it went wrong
 *   npm run fuzz -- --seed 17 --range    the seed's run on The Range again, if that is where it went wrong
 *
 * Every seed is played twice: once as a player who chooses among the courses, and once on The Range alone, where the
 * clubs are, since a monkey that chooses among five courses is on golf too seldom to hold it to anything.
 * Fails, and says how to play the failure again, if any seed breaks a rule
 * or throws. Says how much of each thing was done and happened, so a monkey
 * that stopped getting about is noticed.
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { RANGE } from '../src/range';
import { fuzz, type FuzzResult } from './fuzzer';

if (!isMainThread) {
  const { seed, frames, range } = workerData as { seed: number; frames: number; range: boolean };
  parentPort!.postMessage(fuzz(seed, frames, range ? RANGE : undefined));
} else {
  await main();
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const one = value('seed');
  const range = (value('seeds') ?? '1-12').split('-').map(Number);
  const seeds = one !== undefined ? [+one] : Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k);
  const frames = +(value('frames') ?? 4000);
  const started = performance.now();
  // each seed as a player choosing among the courses, and on The Range alone; or only the range, to play a failure again
  const rangeOnly = args.includes('--range');
  const queue = seeds.flatMap((seed) =>
    rangeOnly
      ? [{ seed, range: true }]
      : one !== undefined
        ? [{ seed, range: false }]
        : [
            { seed, range: false },
            { seed, range: true },
          ],
  );
  const results: (FuzzResult & { range: boolean })[] = [];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(seeds.length, availableParallelism() - 1)) }, async () => {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        const { seed, range } = job;
        const result = await new Promise<FuzzResult>((resolve, reject) => {
          const worker = new Worker(new URL(`file://${process.argv[1]}`), { workerData: { seed, frames, range } });
          worker.once('message', resolve);
          worker.once('error', reject);
        });
        results.push({ ...result, range });
      }
    }),
  );
  results.sort((a, b) => a.seed - b.seed || +a.range - +b.range);
  const sum = (key: 'done' | 'happened', only: (r: { range: boolean }) => boolean = () => true) => {
    const out: Record<string, number> = {};
    for (const r of results.filter(only)) for (const [k, n] of Object.entries(r[key])) out[k] = (out[k] ?? 0) + n;
    return Object.entries(out)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  };
  const failed = results.filter((r) => r.failure);
  console.log(
    `${seeds.length} seed${seeds.length === 1 ? '' : 's'}, ${frames} frames each (${((performance.now() - started) / 1000).toFixed(1)} s)`,
  );
  console.log(`  done: ${sum('done')}`);
  console.log(`  happened: ${sum('happened')}`);
  // what the range's runs alone did, which is where the clubs are
  if (results.some((r) => r.range)) {
    console.log(`  on The Range, done: ${sum('done', (r) => r.range)}`);
    console.log(`  on The Range, happened: ${sum('happened', (r) => r.range)}`);
  }
  for (const r of failed) {
    const f = r.failure!;
    console.error(`\nseed ${f.seed}${r.range ? ' on The Range' : ''} failed at frame ${f.frame}:`);
    for (const p of f.problems) console.error(`  ${p}`);
    console.error('  after:');
    for (const l of f.log) console.error(`    ${l}`);
    console.error(`  again: npm run fuzz -- --seed ${f.seed} --frames ${frames}${r.range ? ' --range' : ''}`);
  }
  if (failed.length) process.exitCode = 1;
  else console.log('  no rule broken');
}

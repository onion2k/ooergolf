/**
 * The monkey, over many seeds side by side: see `fuzzer.ts`.
 *
 *   npm run fuzz                         seeds 1-12, 4000 frames each, on the courses, on each course alone, on The Links and on contoured greens
 *   npm run fuzz -- --seeds 1-50 --frames 10000
 *   npm run fuzz -- --seed 17            one seed again, with what was done before it went wrong
 *   npm run fuzz -- --seed 17 --on links the seed's run on The Links again, if that is where it went wrong (or `contoured`, The Links' holes with the steepest greens at
 *                                        every speed, `shed`, The Pinball Shed's holes, `fair`, The Fair's, or `waterworks`, The
 *                                        Waterworks', each minigolf course played once more as its own run)
 *
 * Every seed is played several times: once as a player who chooses among the courses, and once on The Links and once on The
 * Links with the steepest greens at every speed (`contoured`) alone, where the clubs, the trees, the water, the out
 * of bounds and the wind are, since a monkey that chooses among five courses is on golf too seldom to hold it to anything.
 * The wind is the nine holes' own, 4 to 12 miles an hour.
 * Fails, and says how to play the failure again, if any seed breaks a rule
 * or throws. Says how much of each thing was done and happened, so a monkey
 * that stopped getting about is noticed.
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { COURSES } from '../src/course';
import { KICKER_HOLES, contoured, fuzz, type FuzzResult } from './fuzzer';
import { STREAM_HOLE } from '../test/stream-hole';

/** The courses of golf a run may be played on alone, by the short name a replay asks for and the name a course has. */
const GOLF = {
  links: 'The Links',
  contoured: 'The Links, contoured',
  kickers: 'the holes with kickers',
  stream: 'a hole with a stream',
  // not golf, but courses of minigolf with something on every hole, each played alone as the golf courses are
  shed: 'The Pinball Shed',
  fair: 'The Fair',
  waterworks: 'The Waterworks',
} as const;
type Golf = keyof typeof GOLF;

/** The holes a run alone on a course of golf plays: a course's own, or the contoured Links, which is no course of the game's. */
const holesOf = (on: Golf) =>
  on === 'contoured'
    ? contoured()
    : on === 'kickers'
      ? KICKER_HOLES
      : on === 'stream'
        ? [STREAM_HOLE]
        : COURSES.find((c) => c.name === GOLF[on])!.holes;

if (!isMainThread) {
  const { seed, frames, on } = workerData as { seed: number; frames: number; on: Golf | undefined };
  parentPort!.postMessage(fuzz(seed, frames, on ? holesOf(on) : undefined));
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
  // each seed as a player choosing among the courses, and on each course of golf alone; or only the one asked for, to play a failure again
  const on = value('on') as Golf | undefined;
  if (on !== undefined && !(on in GOLF))
    throw new Error(`--on is links, contoured, kickers, stream, shed, fair or waterworks, not ${on}`);
  const queue: { seed: number; on: Golf | undefined }[] = seeds.flatMap<{ seed: number; on: Golf | undefined }>(
    (seed) =>
      on
        ? [{ seed, on }]
        : one !== undefined
          ? [{ seed, on: undefined }]
          : [
              { seed, on: undefined },
              { seed, on: 'links' as const },
              { seed, on: 'contoured' as const },
              { seed, on: 'shed' as const },
              { seed, on: 'fair' as const },
              { seed, on: 'waterworks' as const },
            ],
  );
  const results: (FuzzResult & { on: Golf | undefined })[] = [];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(seeds.length, availableParallelism() - 1)) }, async () => {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        const { seed, on } = job;
        const result = await new Promise<FuzzResult>((resolve, reject) => {
          const worker = new Worker(new URL(`file://${process.argv[1]}`), { workerData: { seed, frames, on } });
          worker.once('message', resolve);
          worker.once('error', reject);
        });
        results.push({ ...result, on });
      }
    }),
  );
  results.sort((a, b) => a.seed - b.seed || String(a.on).localeCompare(String(b.on)));
  const sum = (key: 'done' | 'happened', only: (r: { on: Golf | undefined }) => boolean = () => true) => {
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
  // what the runs on each course of golf alone did, which is where the clubs, the trees and the water are
  for (const g of Object.keys(GOLF) as Golf[])
    if (results.some((r) => r.on === g)) {
      console.log(`  on ${GOLF[g]}, done: ${sum('done', (r) => r.on === g)}`);
      console.log(`  on ${GOLF[g]}, happened: ${sum('happened', (r) => r.on === g)}`);
    }
  for (const r of failed) {
    const f = r.failure!;
    console.error(`\nseed ${f.seed}${r.on ? ` on ${GOLF[r.on]}` : ''} failed at frame ${f.frame}:`);
    for (const p of f.problems) console.error(`  ${p}`);
    console.error('  after:');
    for (const l of f.log) console.error(`    ${l}`);
    console.error(`  again: npm run fuzz -- --seed ${f.seed} --frames ${frames}${r.on ? ` --on ${r.on}` : ''}`);
  }
  if (failed.length) process.exitCode = 1;
  else console.log('  no rule broken');
}

/**
 * How long a frame of the game takes, held to what it took before.
 *
 *   npm run bench              measure, and fail if any scenario has got slower by more than the tolerance
 *   npm run bench -- --update  write what it takes now as the new baseline
 *
 * Two scenarios: the floor at rest, which is what most frames are; and the
 * autopilot pushing balls in, which is what a busy frame is. A game adds a
 * scenario for each way its frames get costly.
 *
 * A time on one machine is not a time on another, or on the same one with
 * something else running. So each scenario is run several times, fresh, in a
 * worker of its own, and the fastest run is the one that counts: noise only
 * ever makes a run slower. And it is held to the baseline as a multiple of a
 * fixed piece of arithmetic timed alongside it, which goes faster and slower
 * with the machine much as the game does, so a baseline written on one
 * machine means something on another. The milliseconds are reported too.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const BASELINE = 'scripts/bench-baseline.json';
/**
 * How much slower than the baseline before it fails: a share of it, and at
 * least an absolute amount, so a scenario that costs next to nothing is not
 * failed for a hundredth of a millisecond of noise.
 */
const TOLERANCE = 0.2,
  SLACK_MS = 0.05;
const RUNS = 4;
const DT = 1 / 60;

interface Result {
  /** Milliseconds a frame, the fastest run. */
  ms: number;
  /** That against the reference arithmetic. */
  relative: number;
  /** Milliseconds the reference took, the fastest time. */
  ref: number;
  /** How many bodies were awake at the end, to show the scenario did what it says. */
  awake: number;
  live: number;
}

interface Scenario {
  name: string;
  frames: number;
  /** The game as the timing starts, and what one timed frame of it is. */
  setup: () => { game: Game; frame: () => void };
}

/** A game from a seed, settled. */
function settled(seed: number): Game {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed) });
  for (let f = 0; f < 180; f++) game.step(DT, { throttle: 0, steer: 0 });
  return game;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'the floor at rest',
    frames: 600,
    setup: () => {
      const game = settled(1);
      return { game, frame: () => game.step(DT, { throttle: 0, steer: 0 }) };
    },
  },
  {
    name: 'the autopilot pushing balls in',
    frames: 600,
    setup: () => {
      const game = settled(1);
      const pilot = new Autopilot(game);
      return { game, frame: () => pilot.step(DT) };
    },
  },
];

/**
 * The reference: typed-array arithmetic of the physics' own kind, a pass of
 * springs over a grid of points, the same work every time.
 */
function reference(): number {
  const n = 200_000;
  const x = new Float32Array(n),
    v = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.37) * 3;
  const t = performance.now();
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 1; i < n - 1; i++) {
      const f = x[i - 1] + x[i + 1] - 2 * x[i];
      v[i] = v[i] * 0.99 + f * 0.1;
    }
    for (let i = 0; i < n; i++) x[i] += Math.sqrt(v[i] * v[i] + 1e-6) * Math.sign(v[i]) * 0.01;
  }
  return performance.now() - t;
}

function measure(s: Scenario): Result {
  let best = Infinity,
    ref = Infinity,
    awake = 0,
    live = 0;
  for (let k = 0; k < 3; k++) reference();
  for (let k = 0; k < RUNS * 3; k++) ref = Math.min(ref, reference());
  for (let run = 0; run < RUNS; run++) {
    const { game, frame } = s.setup();
    const t = performance.now();
    for (let f = 0; f < s.frames; f++) frame();
    best = Math.min(best, (performance.now() - t) / s.frames);
    const { world } = game;
    awake = 0;
    for (let i = 0; i < world.count; i++) if (world.alive[i] && !world.asleep[i]) awake++;
    live = world.live;
  }
  return { ms: best, relative: best / ref, ref, awake, live };
}

if (!isMainThread) {
  const { index } = workerData as { index: number };
  parentPort!.postMessage(measure(SCENARIOS[index]));
} else {
  await main();
}

async function main() {
  const update = process.argv.includes('--update');
  const results: Result[] = [];
  // one at a time, so no scenario is timed while another runs beside it
  for (let index = 0; index < SCENARIOS.length; index++) {
    results.push(
      await new Promise<Result>((resolve, reject) => {
        const worker = new Worker(new URL(`file://${process.argv[1]}`), { workerData: { index } });
        worker.once('message', resolve);
        worker.once('error', reject);
      }),
    );
  }

  if (update) {
    const out = Object.fromEntries(
      SCENARIOS.map((s, k) => [
        s.name,
        { relative: results[k].relative, ms: round(results[k].ms), ref: round(results[k].ref) },
      ]),
    );
    writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
    SCENARIOS.forEach((s, k) => console.log(`${s.name}: ${line(results[k])}`));
    console.log('baseline written');
    return;
  }

  let baseline: Partial<Record<string, { relative: number; ms: number }>>;
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as typeof baseline;
  } catch {
    console.error('no baseline: run npm run bench -- --update first');
    process.exitCode = 1;
    return;
  }
  let slower = 0;
  SCENARIOS.forEach((s, k) => {
    const now = results[k],
      was = baseline[s.name];
    if (!was) {
      console.log(`${s.name}: ${line(now)}, not in the baseline`);
      slower++;
      return;
    }
    const change = now.relative / was.relative - 1;
    // what the baseline's time comes to on this machine as it is now, for the absolute allowance
    const expected = was.relative * now.ref;
    const verdict =
      change > TOLERANCE && now.ms - expected > SLACK_MS
        ? 'SLOWER'
        : change < -TOLERANCE && expected - now.ms > SLACK_MS
          ? 'faster'
          : 'within tolerance';
    if (verdict === 'SLOWER') slower++;
    console.log(
      `${s.name}: ${line(now)}, ${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% on the baseline (${verdict})`,
    );
  });
  if (slower) {
    console.error(
      `\n${slower} scenario${slower === 1 ? '' : 's'} slower than the baseline by more than ${TOLERANCE * 100}% and ${SLACK_MS} ms`,
    );
    process.exitCode = 1;
  }
}

function line(r: Result): string {
  return `${r.ms.toFixed(3)} ms a frame (${r.relative.toPrecision(3)} of the reference), ${r.awake} of ${r.live} awake`;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

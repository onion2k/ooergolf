/**
 * What each shop item is worth in strokes: the pace player (the autopilot with a player's slips) plays a round of each
 * course with no item and then with each item alone in its slot, on the same seeds for every kit, and the strokes a
 * round saved against no item are reported for the minigolf courses and the golf courses separately, as strokes a round
 * of nine holes. It is the measure the shop's prices are made from, and without it a price is a guess.
 *
 * It measures only what the autopilot can feel. It plays straight and flat, aims by arithmetic and rehearsal, never
 * chooses a shape, a spin or a bend, never takes a retake, and does not feel a touch, so those items read as nothing
 * here and their prices are judgement. A piggy bank is held, not bought again each hole: it pays coins, not strokes, so
 * it reads as nothing too. A saving smaller than the wobble of the no-item figure (`--wobble`) is nothing.
 *
 *   npm run value                          every kit on every course, sixteen seeds
 *   npm run value -- --seeds 8 --items mallet,clay --courses "The Meadow,The Links" --json out.json
 *   npm run value -- --wobble              the no-item figure over three sets of seeds
 *   npm run value -- --jobs 8              how many processes share the work (default: cores less two)
 */
import { spawn } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { Autopilot } from '../src/autopilot';
import { COURSES } from '../src/course';
import { Game } from '../src/game';
import { ITEMS, itemById } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { CHECK, PLAYER, mean, round } from './pace';

const DT = 1 / 60;

/** One round's result: strokes, whether it was finished, and the holes picked up (a hole that reached the stroke limit). */
interface Unit {
  kit: string;
  course: string;
  seed: number;
  strokes: number;
  finished: boolean;
  pickedUp: number;
}

/** A round of a course with a kit worn, played through the game's own save path in a memory store. */
export function play(kit: string, courseName: string, seed: number): Unit {
  const course = COURSES.find((c) => c.name === courseName);
  if (!course) throw new Error(`no course called ${courseName}`);
  const progress = new Progress(memoryStore());
  if (kit) {
    const item = itemById(kit);
    if (!item) throw new Error(`no item called ${kit}`);
    // the save the player would have after buying and wearing it, so the game is made with the kit and the first hole is begun
    // once, as the pace player's is: a second `begin` would draw the hole's chance twice and the kits would be paired with a
    // round that is not the no-item round
    progress.save.owned.push(kit);
    progress.save.kit[item.aisle] = kit;
  }
  let pickedUp = 0;
  const game = new Game(progress, { pickedUp: () => pickedUp++ }, { random: seeded(seed), course: course.holes });
  const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
  const frames = CHECK.capMinutes * 3600;
  for (let f = 0; f < frames && game.phase !== 'over'; f++) pilot.step(DT);
  return { kit, course: courseName, seed, strokes: game.total, finished: game.phase === 'over', pickedUp };
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const seedsFrom = (first: number, n: number) => Array.from({ length: n }, (_, k) => first + k);

function main() {
  const args = process.argv.slice(2);
  const nSeeds = Number(flag(args, '--seeds') ?? 16);
  const first = Number(flag(args, '--first') ?? 1);
  const courseNames = (flag(args, '--courses')?.split(',') ?? COURSES.map((c) => c.name)).map((s) => s.trim());
  const wobble = args.includes('--wobble');
  const kits = wobble
    ? ['']
    : [
        '',
        ...(flag(args, '--items')
          ?.split(',')
          .map((s) => s.trim()) ?? ITEMS.map((i) => i.id)),
      ].filter((k, i, a) => a.indexOf(k) === i);
  const sets = wobble ? [1, 101, 201] : [first];
  const units: [string, string, number][] = [];
  for (const start of sets)
    for (const seed of seedsFrom(start, nSeeds))
      for (const kit of kits) for (const course of courseNames) units.push([kit, course, seed]);

  const worker = flag(args, '--worker');
  if (worker) {
    // a shard of the units, written as JSON lines to the file the parent named, one a unit as it lands
    const [k, n] = worker.split('/').map(Number);
    const out: Unit[] = [];
    units.forEach((u, i) => {
      if (i % n === k) out.push(play(...u));
    });
    writeFileSync(flag(args, '--out')!, JSON.stringify(out));
    return;
  }

  const jobs = Number(flag(args, '--jobs') ?? Math.max(1, cpus().length - 2));
  const dir = mkdtempSync(join(tmpdir(), 'value-'));
  const started = performance.now();
  console.log(
    `${units.length} rounds on ${jobs} processes (${kits.length} kits, ${courseNames.length} courses, ${nSeeds} seeds)`,
  );
  const self = process.argv[1];
  const procs = Array.from({ length: jobs }, (_, k) => {
    const out = join(dir, `${k}.json`);
    const child = spawn(process.execPath, [self, ...args, '--worker', `${k}/${jobs}`, '--out', out], {
      stdio: 'inherit',
    });
    return new Promise<Unit[]>((resolve, reject) => {
      child.on('exit', (code) =>
        code === 0
          ? resolve(JSON.parse(readFileSync(out, 'utf8')) as Unit[])
          : reject(new Error(`worker ${k} exited ${code}`)),
      );
    });
  });
  void Promise.all(procs).then((shards) => {
    const runs = shards.flat();
    const seconds = (performance.now() - started) / 1000;
    report(runs, kits, courseNames, wobble, sets, nSeeds, seconds, flag(args, '--json'));
  });
}

const golfOf = (name: string) => COURSES.find((c) => c.name === name)?.golf === true;
/** Strokes of a round counted as a round of nine holes, so a course of another length reads alike. */
const perNine = (name: string, strokes: number) =>
  (strokes * 9) / (COURSES.find((c) => c.name === name)?.summary.holes ?? 9);

function report(
  runs: Unit[],
  kits: string[],
  courseNames: string[],
  wobble: boolean,
  sets: number[],
  nSeeds: number,
  seconds: number,
  json?: string,
) {
  console.log(`played in ${seconds.toFixed(0)} s`);
  const stuck = runs.filter((r) => !r.finished);
  if (stuck.length) console.error(`${stuck.length} rounds did not finish in ${CHECK.capMinutes} min`);
  if (wobble) {
    const table: Record<string, { minigolf: number[]; golf: number[] }> = {};
    for (const set of sets) {
      const rows = runs.filter((r) => r.seed >= set && r.seed < set + nSeeds);
      const kind = (golf: boolean) => {
        const cs = courseNames.filter((c) => golfOf(c) === golf);
        return cs.length
          ? round(mean(cs.map((c) => mean(rows.filter((r) => r.course === c).map((r) => perNine(c, r.strokes))))))
          : NaN;
      };
      table[`seeds ${set}-${set + nSeeds - 1}`] = { minigolf: [kind(false)], golf: [kind(true)] };
    }
    console.log('no item, mean strokes a round (mean of courses) by set of seeds:');
    for (const [k, v] of Object.entries(table)) console.log(`  ${k}: minigolf ${v.minigolf[0]}, golf ${v.golf[0]}`);
    for (const g of [false, true]) {
      const xs = Object.values(table).map((v) => (g ? v.golf[0] : v.minigolf[0]));
      console.log(
        `  ${g ? 'golf' : 'minigolf'} wobble: range ${round(Math.max(...xs) - Math.min(...xs))} strokes a round`,
      );
    }
    if (json) writeFileSync(json, JSON.stringify({ wobble: table, runs }, null, 1));
    return;
  }
  const strokesOf = (kit: string, course: string) =>
    runs.filter((r) => r.kit === kit && r.course === course).sort((a, b) => a.seed - b.seed);
  const base = (course: string) => strokesOf('', course);
  /** Mean over the kind's courses of the mean per-seed saving (paired by seed), as strokes a nine-hole round. */
  const saved = (kit: string, golf: boolean) => {
    const cs = courseNames.filter((c) => golfOf(c) === golf);
    if (!cs.length) return NaN;
    return mean(
      cs.map((c) => {
        const a = base(c),
          b = strokesOf(kit, c);
        return mean(a.map((r, i) => perNine(c, r.strokes - (b[i]?.strokes ?? r.strokes))));
      }),
    );
  };
  const picked = (kit: string, golf: boolean) =>
    runs.filter((r) => r.kit === kit && golfOf(r.course) === golf).reduce((a, r) => a + r.pickedUp, 0);
  const rows = kits.map((kit) => {
    const byCourse = Object.fromEntries(
      courseNames.map((c) => [c, round(mean(strokesOf(kit, c).map((r) => r.strokes)))]),
    );
    const item = itemById(kit);
    return {
      id: kit || '(none)',
      aisle: item?.aisle ?? '',
      byCourse,
      savedMinigolf: round(saved(kit, false)),
      savedGolf: round(saved(kit, true)),
      pickedUpMinigolf: picked(kit, false),
      pickedUpGolf: picked(kit, true),
    };
  });
  console.log('strokes a round of nine, saved against no item (positive is better):');
  console.log(
    '  id'.padEnd(14) + 'aisle'.padEnd(11) + 'minigolf'.padStart(9) + 'golf'.padStart(8) + '  picked up (m/g)',
  );
  for (const r of rows)
    console.log(
      `  ${r.id.padEnd(12)}${r.aisle.padEnd(11)}${String(r.savedMinigolf).padStart(9)}${String(r.savedGolf).padStart(8)}  ${r.pickedUpMinigolf}/${r.pickedUpGolf}`,
    );
  console.log(
    'mean strokes a round by course, no item: ' + courseNames.map((c) => `${c} ${rows[0].byCourse[c]}`).join(', '),
  );
  console.log(
    'not felt by the pace player: touch, bend, putt spin, shape, spin, scope, chalk, watch (never taken), piggy (pays coins), cosmetics',
  );
  if (json)
    writeFileSync(json, JSON.stringify({ seeds: nSeeds, first: sets[0], courses: courseNames, rows, runs }, null, 1));
}

// run as the tool, and not when a test reads `play`
if (!process.env.VITEST) main();

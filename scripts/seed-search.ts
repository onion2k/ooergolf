/**
 * A seed search for one hole of The Links: which seed of its ground plays as the hole is meant to. The Links' holes are
 * chosen by their seed (it draws the hills, the bunkers, the trees and the ponds), so a change to a spec is not finished
 * until the seeds are played again. Each seed is made into a hole of its own and played as single-hole games with the
 * pace gate's player (`PLAYER`, the same slips from the same two chances as `paceRun`), and the figures a hole is held to
 * are kept: the mean and spread of the strokes, the balls lost out of bounds and in water a round, the pick-ups, and
 * where the first pond lay along the way (a pond's `at` is honoured only to about a seventh of the way).
 *
 *   npm run seed-search -- "The Opener" --seeds 1-40 --rounds 24 --set '{"length":400}'
 *   --from N plays the rounds from chance N on, so a seed chosen on the first forty is checked on rounds it was not chosen by
 *   npm run seed-search -- "Long Bend" --seeds 15 --rounds 48        (the figures of one seed, as it stands)
 *
 *   npm run seed-search -- --course fells "Tight Left" --seeds 1-20 --rounds 16
 *   --course links (the default), fells or isles chooses the list the hole is named from. The Fells' and The Isles' lists are
 *   loaded only when asked for, since they are other parts' modules; asked for before they exist, the script says which is
 *   missing and stops. A hole of either also prints the share of its fairway that runs a ball down (`running`, from
 *   `runningShare`, "n/a" until that helper exists), and the lake carries are `water`, the balls lost to a lake a round.
 *
 * `--set` is merged over the hole's spec in `src/links.ts`, so a candidate is tried without editing it. A throwaway made
 * permanent only so the choice can be made again: nothing reads it, and it writes nothing.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- the string assertions on the dynamic imports keep the checker from needing modules that may not be there yet */
import { TILE, layoutOf } from '../src/arena';
import { Game, type GameEvents } from '../src/game';
import { golfHole, type GolfSpec } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Autopilot } from '../src/autopilot';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PLAYER, mean, round } from './pace';

const DT = 1 / 60;

export type CourseName = 'links' | 'fells' | 'isles';
export const COURSE_NAMES: readonly CourseName[] = ['links', 'fells', 'isles'];

/** The options a command line gives: the hole's name, the course and the numbers, with the defaults the script always had. */
export interface Options {
  name: string | undefined;
  course: CourseName;
  set: string;
  seeds: string | undefined;
  rounds: number;
  from: number;
}

const VALUED = ['--set', '--seeds', '--rounds', '--from', '--course'];

/** Reads the command line, refusing a course that is not one of the three by name. The hole's name is the first word that is not a flag or a flag's value. */
export function parseArgs(args: string[]): Options {
  const flag = (f: string, d: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
  const name = args.find((a, k) => !a.startsWith('--') && !VALUED.includes(args[k - 1] ?? ''));
  const course = flag('--course', 'links');
  if (!(COURSE_NAMES as readonly string[]).includes(course))
    throw new Error(`no course is called ${course}; the choices are ${COURSE_NAMES.join(', ')}`);
  return {
    name,
    course: course as CourseName,
    set: flag('--set', '{}'),
    seeds: args.includes('--seeds') ? flag('--seeds', '') : undefined,
    rounds: Number(flag('--rounds', '24')),
    from: Number(flag('--from', '1')),
  };
}

const TITLES: Record<CourseName, string> = { links: 'The Links', fells: 'The Fells', isles: 'The Isles' };

/** A course's spec list. The Fells and The Isles are loaded on request, so this script runs before they are built. */
export async function specsOf(course: CourseName): Promise<readonly GolfSpec[]> {
  if (course === 'links') return LINKS_SPECS;
  const module = course === 'fells' ? 'src/fells.ts' : 'src/isles.ts';
  const key = course === 'fells' ? 'FELLS_SPECS' : 'ISLES_SPECS';
  let loaded: Record<string, unknown>;
  try {
    // The specifier is asserted a plain string so the type checker does not need a module that may not exist yet.
    loaded =
      course === 'fells'
        ? await (import('../src/fells' as string) as Promise<Record<string, unknown>>)
        : await (import('../src/isles' as string) as Promise<Record<string, unknown>>);
  } catch (e) {
    throw new Error(`${TITLES[course]} cannot be searched yet: ${module} is not there (${(e as Error).message})`);
  }
  const specs = loaded[key];
  if (!Array.isArray(specs)) throw new Error(`${module} does not export ${key}`);
  return specs as GolfSpec[];
}

/** The share of fairway that runs a ball down, from part 2's `runningShare` when it is there, and null until it is. */
export async function runningShareOf(layout: ReturnType<typeof layoutOf>, greens?: number): Promise<number | null> {
  for (const load of [() => import('../src/surfaces'), loadSlopes]) {
    try {
      const fn = ((await load()) as Record<string, unknown>).runningShare;
      if (typeof fn === 'function') return (fn as (l: unknown, g?: number) => number)(layout, greens);
    } catch {
      // not built yet; try the next place the plan allows it to be
    }
  }
  return null;
}

async function loadSlopes(): Promise<unknown> {
  // The try is what lets the bundler leave a module that is not there yet as a warning, not a failed build.
  try {
    return await (import('../src/slopes' as string) as Promise<unknown>);
  } catch {
    return {};
  }
}

function range(text: string): number[] {
  const [from, to = from] = text.split('-').map(Number);
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

export interface Figures {
  seed: number;
  mean: number;
  sd: number;
  oob: number;
  water: number;
  pickups: number;
  pondAt: number[];
  /** The highest ground of the hole, which a test holds to between four and sixteen yards. */
  relief: number;
  /** The club each round's first shot was struck with, by how many rounds. */
  tee: Record<string, number>;
}

/** A spec played `rounds` times, one hole a game, and what it came to. */
export function play(spec: GolfSpec, rounds: number, from = 1): Figures | string {
  let hole;
  try {
    hole = golfHole(spec);
  } catch (e) {
    return (e as Error).message;
  }
  const layout = layoutOf(hole.map, hole.terrain);
  const scores: number[] = [];
  let oob = 0,
    water = 0,
    pickups = 0;
  const tee: Record<string, number> = {};
  for (let seed = from; seed < from + rounds; seed++) {
    let shots = 0;
    const events: GameEvents = {
      struck: () => {
        if (shots++ === 0) tee[game.inHand.id] = (tee[game.inHand.id] ?? 0) + 1;
      },
      outOfBounds: () => oob++,
      splash: () => water++,
      pickedUp: () => pickups++,
    };
    const game: Game = new Game(new Progress(memoryStore()), events, { random: seeded(seed), course: [hole] });
    const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
    for (let f = 0; f < 20 * 3600 && game.phase !== 'over'; f++) pilot.step(DT);
    scores.push(game.total);
  }
  const m = mean(scores);
  const sd = Math.sqrt(mean(scores.map((s) => (s - m) ** 2)));
  // where the ponds lie along the tee-to-cup line, as a share of it
  const dx = layout.cup.x - layout.tee.x,
    dy = layout.cup.y - layout.tee.y;
  const pondAt: number[] = [];
  const seen = new Set<number>();
  for (let t = 0; t < layout.cols * layout.rows; t++) {
    if (layout.water[t] !== 1) continue;
    const x = layout.originX + ((t % layout.cols) + 0.5) * TILE,
      y = layout.originY + (Math.floor(t / layout.cols) + 0.5) * TILE;
    seen.add(Math.round((((x - layout.tee.x) * dx + (y - layout.tee.y) * dy) / (dx * dx + dy * dy)) * 20));
  }
  for (const k of [...seen].sort((a, b) => a - b)) pondAt.push(k / 20);
  return {
    seed: spec.seed,
    mean: round(m),
    sd: round(sd),
    oob: round(oob / rounds),
    water: round(water / rounds),
    pickups,
    pondAt,
    relief: round(Math.max(...layout.terrain)),
    tee,
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const specs = await specsOf(o.course);
  if (!o.name) throw new Error(`name a hole of ${TITLES[o.course]}`);
  const base = specs.find((s) => s.name === o.name);
  if (!base) throw new Error(`no hole of ${TITLES[o.course]} is called ${o.name}`);
  const set = JSON.parse(o.set) as Partial<GolfSpec>;
  const seeds = (o.seeds ?? String(base.seed)).split(',').flatMap(range);
  for (const seed of seeds) {
    const spec = { ...base, ...set, seed };
    const f = play(spec, o.rounds, o.from);
    if (typeof f === 'string') {
      console.log(`seed ${seed}: refused, ${f}`);
      continue;
    }
    if (o.course === 'links') {
      console.log(JSON.stringify(f));
      continue;
    }
    // The Links' lines are as they always were; the newer courses add what they are held to.
    const hole = golfHole(spec);
    const running = await runningShareOf(layoutOf(hole.map, hole.terrain), hole.greens);
    console.log(JSON.stringify({ ...f, running: running === null ? 'n/a' : round(running) }));
  }
}

if (process.argv[1]?.endsWith('seed-search.mjs'))
  main().catch((e) => ((process.exitCode = 1), console.error((e as Error).message)));

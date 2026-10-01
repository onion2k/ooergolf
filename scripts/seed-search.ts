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
 * `--set` is merged over the hole's spec in `src/links.ts`, so a candidate is tried without editing it. A throwaway made
 * permanent only so the choice can be made again: nothing reads it, and it writes nothing.
 */
import { TILE, layoutOf } from '../src/arena';
import { Game, type GameEvents } from '../src/game';
import { golfHole, type GolfSpec } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Autopilot } from '../src/autopilot';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PLAYER, mean, round } from './pace';

const DT = 1 / 60;

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

function main() {
  const args = process.argv.slice(2);
  const name = args[0];
  const flag = (f: string, d: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
  const base = LINKS_SPECS.find((s) => s.name === name);
  if (!base) throw new Error(`no hole of The Links is called ${name}`);
  const set = JSON.parse(flag('--set', '{}')) as Partial<GolfSpec>;
  const seeds = flag('--seeds', String(base.seed)).split(',').flatMap(range);
  const rounds = Number(flag('--rounds', '24'));
  const from = Number(flag('--from', '1'));
  for (const seed of seeds) {
    const f = play({ ...base, ...set, seed }, rounds, from);
    console.log(typeof f === 'string' ? `seed ${seed}: refused, ${f}` : JSON.stringify(f));
  }
}

if (process.argv[1]?.endsWith('seed-search.mjs')) main();

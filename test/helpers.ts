/** What the tests share: a new game in memory, from a seed, with a note of every event it tells, and a green to practise on. */
import { COURSES, type HoleDef } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Game, type GameEvents } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

export const DT = 1 / 60;

/**
 * The holes the slow tests that try every tile of every hole are run on: every hole of the courses drawn by hand or
 * made small, and of The Moors the smallest, the middle and the biggest. Its nine holes are one open green with other
 * things on it, and each has tiles to the thousand, so what their size costs is tried on three, and what is on them is
 * held by the tests of the generator and the course, which do try all nine. So of The Links, whose holes are
 * twenty thousand tiles of map and eight thousand of ground each: three, the shortest, a par four and the longest, made
 * singly so that importing this does not make all nine.
 */
export const SAMPLE_HOLES: HoleDef[] = COURSES.flatMap((c) =>
  c.name === 'The Moors'
    ? [c.holes[0], c.holes[4], c.holes[8]]
    : c.name === 'The Links'
      ? [1, 3, 6].map((i) => golfHole(LINKS_SPECS[i]))
      : c.holes,
);

/**
 * A wide square green with the tee near the south rail and the cup tucked
 * into the north-west corner, out of the way: for tests of the ball and the
 * shot, where a ball rolling up the middle must not drop into a cup.
 */
export const GREEN: HoleDef = {
  name: 'Practice green',
  par: 3,
  map: [
    '######################',
    '#.C..................#',
    ...Array.from({ length: 18 }, () => '#....................#'),
    '#..........T.........#',
    '#....................#',
    '######################',
  ],
};

export function newGame(seed = 1, json: string | null = null, course?: readonly HoleDef[]) {
  const store = memoryStore(json);
  const told: string[] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) =>
          told.push(`${name} ${args.filter((a) => typeof a === 'number').join(' ')}`.trim()),
    },
  );
  const game = new Game(new Progress(store), events, { random: seeded(seed), course });
  return { game, store, told };
}

/** A new game on the practice green alone. */
export function onGreen(seed = 1) {
  return newGame(seed, null, [GREEN]);
}

/**
 * A golf hole that is one surface from end to end, for tests of what a ball does on it: `surface` is a golf tile's
 * character (`f` fairway, `r` rough, `g` green, `s` sand), the tee is at the south end in the middle of the width and
 * the cup out of the way in the far corner, and the rail is a long way off either side. Flat unless given `terrain`.
 */
export function field(surface: 'f' | 'r' | 'g' | 's', rows = 130, cols = 41, terrain?: Float32Array): HoleDef {
  const middle = Math.floor(cols / 2);
  const map = [
    '#'.repeat(cols),
    ...Array.from({ length: rows - 2 }, (_, r) => {
      const row: string[] = Array.from({ length: cols }, (_, c) => (c === 0 || c === cols - 1 ? '#' : surface));
      if (r === 1) row[2] = 'C';
      // the tee in a box of its own, which is also what makes a field of sand or rough a golf hole
      if (r === rows - 4) row.splice(middle - 1, 3, 't', 'T', 't');
      return row.join('');
    }),
    '#'.repeat(cols),
  ];
  return { name: `Field of ${surface}`, par: 4, map, ...(terrain ? { terrain } : {}) };
}

/**
 * A game on a golf hole, with a chance that always says the middle so a club strikes true: what a test of the flight
 * and the landing measures, without the scatter which is tried on its own. Returns each event as its numbers.
 */
export function golfGame(hole: HoleDef, random: () => number = () => 0.5) {
  const told: string[] = [];
  /** Every event with all its arguments, the booleans among them, which `told` leaves out. */
  const calls: [string, unknown[]][] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, args]);
          return told.push(`${name} ${args.filter((a) => typeof a === 'number').join(' ')}`.trim());
        },
    },
  );
  const game = new Game(new Progress(memoryStore(null)), events, { random, course: [hole] });
  return { game, told, calls };
}

/** Play `frames` frames. */
export function settle(game: Game, frames = 120) {
  for (let f = 0; f < frames; f++) game.step(DT);
}

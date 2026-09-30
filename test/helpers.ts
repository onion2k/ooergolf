/** What the tests share: a new game in memory, from a seed, with a note of every event it tells, and a green to practise on. */
import { COURSES, type HoleDef } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

export const DT = 1 / 60;

/**
 * The holes the slow tests that try every tile of every hole are run on: every hole of the courses drawn by hand or
 * made small, and of The Moors the smallest, the middle and the biggest. Its nine holes are one open green with other
 * things on it, and each has tiles to the thousand, so what their size costs is tried on three, and what is on them is
 * held by the tests of the generator and the course, which do try all nine.
 */
export const SAMPLE_HOLES: HoleDef[] = COURSES.flatMap((c) =>
  c.name === 'The Moors' ? [c.holes[0], c.holes[4], c.holes[8]] : c.holes,
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

/** Play `frames` frames. */
export function settle(game: Game, frames = 120) {
  for (let f = 0; f < frames; f++) game.step(DT);
}

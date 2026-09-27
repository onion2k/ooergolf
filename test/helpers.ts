/** What the tests share: a new game in memory, from a seed, with a note of every event it tells, and a green to practise on. */
import type { HoleDef } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

export const DT = 1 / 60;

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

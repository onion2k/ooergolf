/**
 * The game played by a monkey: the real game, without the picture, made to
 * do at random everything a player can make happen, and checked after every
 * few frames for anything that must always hold and does not
 * (`invariants.ts`), and for anything thrown. A player can strike the ball
 * any way at any power, strike it well at the cup, try to strike it while it
 * rolls or between holes, wait, reload, and ask for another round when one
 * is over. Random shots reach each hole's limit, and good ones hole out, so
 * the monkey gets round the whole course.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Autopilot } from '../src/autopilot';
import { Game, type GameEvents } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DT = 1 / 60;
/** How many frames between checks, when nothing has just been done. */
const CHECK_EVERY = 10;
/** How many of the last things done a failure reports. */
const LOG_TAIL = 25;

export interface FuzzFailure {
  seed: number;
  frame: number;
  problems: string[];
  /** The last things done before it, oldest first. */
  log: string[];
}

export interface FuzzResult {
  seed: number;
  frames: number;
  failure: FuzzFailure | null;
  /** How often each thing was done, and each event happened: to see that the monkey got about. */
  done: Record<string, number>;
  happened: Record<string, number>;
}

/** Play `frames` frames of the game at random from `seed`. */
export function fuzz(seed: number, frames: number): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const random = seeded(seed * 7 + 1);
  const happened: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  const events: GameEvents = new Proxy(
    {},
    {
      get: (_, name: string) => () => count(happened, name),
    },
  );
  const log: string[] = [];
  let frame = 0;
  const fail = (problems: string[]): FuzzResult => ({
    seed,
    frames: frame,
    failure: { seed, frame, problems, log: log.slice(-LOG_TAIL) },
    done,
    happened,
  });

  try {
    let store = memoryStore();
    let game = new Game(new Progress(store), events, { random: seeded(seed) });
    let busy = 0;
    const between = (a: number, b: number) => a + random() * (b - a);
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what}`);
    };
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: [number, () => void][] = [
      [
        6,
        () => {
          // any way at all, at any power, as a drag can: the least shots too, and the hardest
          const power = random() < 0.15 ? 1 : random();
          if (game.shoot(between(-Math.PI, Math.PI), power)) did('shoot');
          busy = Math.floor(between(10, 90));
        },
      ],
      [
        4,
        () => {
          // a player who can play: the autopilot's shot at the cup, slipped a little
          const shot = new Autopilot(game).plan();
          if (!shot) return;
          if (game.shoot(shot.angle + between(-0.08, 0.08), shot.power * between(0.85, 1.15))) did('shoot well');
          busy = Math.floor(between(10, 90));
        },
      ],
      [
        2,
        () => {
          // a player can let go of a drag while the ball rolls, or between holes: it must be refused, and not counted
          if (game.ready) return;
          const { world, ball } = game;
          const strokes = game.strokes,
            vx = world.vx[ball],
            vy = world.vy[ball];
          if (game.shoot(between(-Math.PI, Math.PI), 1))
            throw new Error(
              `a shot was taken with the ball moving at ${Math.hypot(vx, vy).toFixed(2)}, in ${game.phase}`,
            );
          if (game.strokes !== strokes || world.vx[ball] !== vx || world.vy[ball] !== vy)
            throw new Error('a refused shot changed the ball or the strokes');
          did('shoot while rolling');
        },
      ],
      [
        2,
        () => {
          // the card's button, when the round is over
          if (game.phase !== 'over') return;
          game.newRound();
          did('play again');
        },
      ],
      [
        3,
        () => {
          busy = Math.floor(between(10, 120));
          did('wait');
        },
      ],
      [
        1,
        () => {
          // saved, and loaded again into a new game as a reload would: what was kept must come back as it went
          game.persist();
          const kept = JSON.stringify(game.progress.save);
          store = memoryStore(store.json);
          game = new Game(new Progress(store), events, { random: seeded(seed + frame) });
          const loaded = JSON.stringify(game.progress.save);
          if (loaded !== kept) throw new Error(`the save was ${kept} and loaded as ${loaded}`);
          did('reload');
        },
      ],
    ];
    const total = actions.reduce((n, [w]) => n + w, 0);
    const act = () => {
      let pick = random() * total;
      for (const [w, go] of actions) {
        if ((pick -= w) < 0) return go();
      }
    };

    for (frame = 1; frame <= frames; frame++) {
      if (busy > 0) busy--;
      else act();
      game.step(DT);
      if (frame % CHECK_EVERY === 0) {
        const problems = checkInvariants(game);
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}

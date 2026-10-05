/**
 * A long game played through, watching the things that must not keep
 * growing: the bodies on the course and the slots they sit in, the save,
 * and the heap.
 *
 * A map that is added to and never emptied does not throw, break a rule, or
 * move any gate's figure. It shows up an hour into a game as a machine that
 * has slowed to a crawl, on somebody else's computer. Nothing else here would
 * ever see it: the fuzzer plays 4,000 frames and the pace gate stops at a few
 * minutes.
 *
 * Every size is held two ways: under a ceiling that says what it could ever
 * reasonably be, and, where marked `steady`, not still climbing by the end —
 * the last third of the run against the middle third, so a size that fills
 * up early and settles is left alone, and one that creeps all the way
 * through is not. A new list, map or cache in the game gets a line in
 * `WATCH` and a reading in `sizes`.
 */
import { BODY_CAPACITY } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSE, COURSES } from '../src/course';
import { Game } from '../src/game';
import { Previewer } from '../src/preview';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PLAYER } from './pace';

const DT = 1 / 60;

/**
 * What is watched, and how. Every size has a ceiling: what it could ever
 * reasonably be, not a guess at what the game does now, so tuning does not
 * move it and a leak cannot hide under it.
 */
export const WATCH: Partial<Record<string, { ceiling: number; steady?: boolean }>> = {
  bodies: { ceiling: BODY_CAPACITY },
  slots: { ceiling: BODY_CAPACITY },
  // a best is kept for each hole by its name and is written and never read, so the save only grows, a hole at a time, to
  // every hole of every course done with every club owned: about 42 bytes a hole, 1,915 for the forty-three there were
  // and about 2,380 for six courses of nine and four of them of the minigolf; 3,000 leaves room for a few holes beyond
  'save bytes': { ceiling: 3_000 },
  // emptied at every new round: never more than a score a hole
  'card scores': { ceiling: COURSE.length },
  // the bodies in the rehearsal a golf hole's shots are previewed in: the ball, however many shots are tried, and the
  // rehearsal of a hole let go of when the next begins
  'preview bodies': { ceiling: 1 },
  // the catch-all for what is leaking and has no name here; noisy, so it is given a lot of room
  'heap MB': { ceiling: 300, steady: true },
};

/** Every size worth watching, read off a game as it stands. */
export function sizes(game: Game): Record<string, number> {
  const { world, progress } = game;
  return {
    bodies: world.live,
    slots: world.count,
    'save bytes': JSON.stringify(progress.save).length,
    'card scores': game.card.length,
    'heap MB': Math.round(process.memoryUsage().heapUsed / 1e5) / 10,
  };
}

/**
 * Whether a size is still climbing at the end: the last third of the run
 * against the middle third. `share` and `slack` are what it may drift by
 * without counting, as a share and as a number, so a small size wobbling by
 * one or two is not a leak.
 */
export function grew(series: number[], share = 0.15, slack = 3): boolean {
  if (series.length < 6) return false;
  const third = Math.floor(series.length / 3);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const middle = mean(series.slice(third, third * 2));
  const last = mean(series.slice(-third));
  return last > middle * (1 + share) + slack;
}

/** What is wrong with a run's sizes: over a ceiling, or still growing at the end. */
export function trouble(samples: Record<string, number[]>): string[] {
  const out: string[] = [];
  for (const [key, series] of Object.entries(samples)) {
    const watch = WATCH[key];
    const most = Math.max(...series);
    if (watch && most > watch.ceiling) out.push(`${key} went to ${most}, over its ceiling of ${watch.ceiling}`);
    else if (watch?.steady && grew(series, key === 'heap MB' ? 0.5 : 0.15, key === 'heap MB' ? 20 : 3)) {
      const third = Math.floor(series.length / 3);
      const at = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
      out.push(
        `${key} grew all the way through: ${at(series.slice(0, third))} at the start, ${at(series.slice(third, third * 2))} in the middle, ${at(series.slice(-third))} by the end`,
      );
    }
  }
  return out;
}

/** The courses of golf a leak run may be played on, each by the name its course has. */
export const GOLF_COURSES = { links: 'The Links', fells: 'The Fells', isles: 'The Isles' } as const;
export type GolfCourseKey = keyof typeof GOLF_COURSES;

export interface LeakOptions {
  seed: number;
  /** Game minutes to play. */
  minutes: number;
  /** Play a course of golf, The Links, The Fells or The Isles, instead of The Meadow. */
  golf?: GolfCourseKey;
}

export interface LeakRun {
  seed: number;
  minutes: number;
  /** Which course of golf it was played on, if not The Meadow. */
  golf?: GolfCourseKey;
  /** Every size, sampled once a game minute. */
  samples: Record<string, number[]>;
  problems: string[];
  /** Real seconds it took. */
  seconds: number;
}

/** Play a long game, sampling the sizes once a game minute, and say what would not stay bounded. */
export function leakRun({ seed, minutes, golf }: LeakOptions): LeakRun {
  const started = performance.now();
  const samples: Record<string, number[]> = {};
  try {
    const game = new Game(
      new Progress(memoryStore()),
      {},
      {
        random: seeded(seed),
        course: golf ? COURSES.find((c) => c.name === GOLF_COURSES[golf])!.holes : undefined,
      },
    );
    // round after round, as a player who never stops would
    const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 17 + 3), replay: true });
    // the preview of a golf hole's shots, which the page makes with the hole and let go of with it: made here as it is there,
    // and a shot tried from where the ball lies now and then, as a held drag does
    let previewer: Previewer | null = null;
    let previewed: object | null = null;
    for (let minute = 0; minute < minutes; minute++) {
      for (let f = 0; f < 3600; f++) {
        pilot.step(DT);
        if (!game.layout.golf) continue;
        if (previewed !== game.def) {
          previewer = new Previewer(game);
          previewed = game.def;
        }
        if (game.ready && f % 20 === 0)
          previewer!.run(
            { x: game.world.x[game.ball], y: game.world.y[game.ball] },
            game.inHand,
            f / 100,
            0.3 + (f % 7) / 10,
          );
      }
      for (const [key, n] of Object.entries(sizes(game))) (samples[key] ??= []).push(n);
      if (previewer) (samples['preview bodies'] ??= []).push(previewer.bodies);
    }
    return {
      seed,
      minutes,
      golf,
      samples,
      problems: trouble(samples),
      seconds: (performance.now() - started) / 1000,
    };
  } catch (err) {
    return {
      seed,
      minutes,
      golf,
      samples,
      problems: [`seed ${seed}: threw ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`],
      seconds: (performance.now() - started) / 1000,
    };
  }
}

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
 * reasonably be, and, where given a `climb`, not still climbing by the end —
 * the last third of the run against the middle third, so a size that fills
 * up early and settles is left alone, and one that creeps all the way
 * through is not. A new list, map or cache in the game gets a line in
 * `WATCH` and a reading in `sizes`.
 *
 * Not watched here, because they cannot grow: the picture's per-biome caches (the scene's palettes and ring of stones, the turf's
 * kinds of grass, the hole map's colours, the baked environments), each made once for a biome and kept, so at most four of each
 * (and two environments). `test/theme.test.ts` holds each made once, the same object on every ask, which is what bounds it.
 */
import { BODY_CAPACITY } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSE, COURSES } from '../src/course';
import { Game } from '../src/game';
import { Previewer } from '../src/preview';
import { TRAIL, Trail } from '../src/trail';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { PLAYER } from './pace';

const DT = 1 / 60;

/**
 * What is watched, and how. Every size has a ceiling: what it could ever
 * reasonably be, not a guess at what the game does now, so tuning does not
 * move it and a leak cannot hide under it.
 */
/**
 * How far a size's last third may rise over its middle third, in its own units, before it is still climbing: a share of
 * the middle and a slack, both. A share alone lets a steady leak through, whose last third is under 1.8 times its middle
 * whatever its rate, so a size that wobbles little is given a slack alone.
 */
export interface Climb {
  share: number;
  slack: number;
}

export const WATCH: Partial<Record<string, { ceiling: number; climb?: Climb }>> = {
  bodies: { ceiling: BODY_CAPACITY },
  slots: { ceiling: BODY_CAPACITY },
  // a best is kept for each hole by its name and is written and never read, so the save only grows, a hole at a time, to
  // every hole of every course done with every item owned: about 42 bytes a hole, 1,915 for the forty-three there were
  // and about 2,380 for six courses of nine and four of them of the minigolf; 3,000 leaves room for a few holes beyond
  // (8 October 2026: a best now carries a kit of three ids, about 104 bytes a hole. Measured with all forty-five items
  // owned and worn, and a best of ten strokes on each of the fifty-four holes of the six courses, each best with a kit of
  // the three longest ids (streamers, fireworks, horseshoe): 5,830 bytes, which `test/leaks.test.ts` holds to the byte.
  // 6,500 was that and about six holes more. 14 October 2026: nine courses of nine, The Heath, The Woods and The Old Course
  // joining, measured the same way at 8,508 bytes, held to the byte; 9,200 is that and about six holes more, so a tenth
  // course fails the test before it fails the gate. 15 October 2026: the career's record of each of the nine courses and
  // a round kept at its last hole, measured the same way at 9,800 bytes, held to the byte; 10,500 is that and about six
  // holes more. Later that day the season of each tour, at the longest grade with a full season less one event played in
  // two-figure scores, and the event round kept with its tour: 10,164 bytes, held to the byte; the ceiling raised to 10,800 on
  // 16 October 2026 at the user's word, which is that and about six holes more again. The caddie's two counts, held to its
  // limit of three, add 30: 10,194, held to the byte, under the same ceiling; and its count of spin 9 more, 10,203, on 17 October 2026)
  'save bytes': { ceiling: 10_800 },
  // emptied at every new round: never more than a score a hole
  'card scores': { ceiling: COURSE.length },
  // the bodies in the rehearsal a golf hole's shots are previewed in: the ball, however many shots are tried, and the
  // rehearsal of a hole let go of when the next begins
  'preview bodies': { ceiling: 1 },
  // the glow ball's trail: a ring of 48 places made once for the page, never grown, so its places are never more than that and
  // the bytes its arrays hold (a float each for x, y and z, and a double for the time) are as they were made
  'trail places': { ceiling: TRAIL.most },
  'trail ring bytes': { ceiling: TRAIL.most * (3 * 4 + 8) },
  // the buffers the ghost shot's path is written into, in each of the two previews a golf hole's previewer holds (the flight's
  // and the putt's roll), made once with the previewer and let go of with the hole: about 8 kB each, a little over 16 in all
  'preview rest bytes': { ceiling: 20_000 },
  // the catch-all for what is leaking and has no name here: what is kept alive, read after a collection (`sizes`). Measured
  // on 18 October 2026 over three seeds of every kind for ten minutes, sampled every ten seconds: 7 to 10 MB, the last
  // third at most 0.21 MB over the middle. A slack of 1 MB, five times that, catches a leak of 0.6 MB a minute in a
  // ten-minute run (a third of a run is 20 samples, so the last third's middle is 3.3 minutes past the middle's) and about
  // 0.05 MB a minute in an hour; and the ceiling is ten times what it holds
  'heap MB': { ceiling: 100, climb: { share: 0, slack: 1 } },
  // the bytes typed arrays hold, outside the heap: the hole in play's grids and meshes, 0.1 to 0.3 MB on The Meadow and 4 to
  // 58 MB on golf, swinging with the hole, the last third at most 5.4 MB over the middle in the same runs; a slack of 15 MB,
  // about three times that, catches 4.5 MB a minute in ten minutes and 0.75 MB a minute in an hour, and the ceiling is
  // twice the most the longest hole held
  'buffers MB': { ceiling: 120, climb: { share: 0, slack: 15 } },
};

/** Every size worth watching, read off a game as it stands. */
export function sizes(game: Game): Record<string, number> {
  const { world, progress } = game;
  // what is kept alive, and not what is not yet collected: read at any moment, the heap counts the garbage a golf hole's
  // previews make, and wobbled by 12 MB (the arrays' bytes by 22) between the middle and the last third of runs that kept
  // nothing (18 October 2026), as wide as the leak to be caught. The leak check runs with --expose-gc; a test has none
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) gc();
  return {
    bodies: world.live,
    slots: world.count,
    'save bytes': JSON.stringify(progress.save).length,
    'card scores': game.card.length,
    'heap MB': Math.round(process.memoryUsage().heapUsed / 1e5) / 10,
    // the bytes typed arrays hold, which live outside the heap and which `heapUsed` leaves out
    'buffers MB': Math.round(process.memoryUsage().arrayBuffers / 1e5) / 10,
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
    else if (watch?.climb && grew(series, watch.climb.share, watch.climb.slack)) {
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
export const GOLF_COURSES = {
  links: 'The Links',
  heath: 'The Heath',
  fells: 'The Fells',
  woods: 'The Woods',
  isles: 'The Isles',
  old: 'The Old Course',
} as const;
export type GolfCourseKey = keyof typeof GOLF_COURSES;

export interface LeakOptions {
  seed: number;
  /** Game minutes to play. */
  minutes: number;
  /** Play a course of golf, one of `GOLF_COURSES`, instead of The Meadow. */
  golf?: GolfCourseKey;
}

export interface LeakRun {
  seed: number;
  minutes: number;
  /** Which course of golf it was played on, if not The Meadow. */
  golf?: GolfCourseKey;
  /** Every size, sampled every ten seconds of play. */
  samples: Record<string, number[]>;
  problems: string[];
  /** Real seconds it took. */
  seconds: number;
}

/** Play a long game, sampling the sizes every ten seconds of play, and say what would not stay bounded. */
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
    // the glow ball's trail, written as the page writes it, for every ball that moves: the most places it held in the minute
    const trail = new Trail();
    let held = 0;
    // a sample every ten seconds of play, six a minute: a third of a ten-minute run is then twenty samples, enough for its
    // floor to be the least a hole holds, where at one a minute (one a golf hole or so) it was whichever hole was in play
    for (let sample = 0; sample < minutes * 6; sample++) {
      for (let f = 0; f < 600; f++) {
        pilot.step(DT);
        const { world, ball } = game;
        if (world.alive[ball] && Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]) > TRAIL.moving)
          trail.record(game.t, world.x[ball], world.y[ball], world.z[ball]);
        held = Math.max(held, trail.count);
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
      if (previewer) {
        (samples['preview bodies'] ??= []).push(previewer.bodies);
        // the ghost shot's buffers, in both of the previewer's previews, as made
        const bytes = [previewer.result, previewer.rolled].reduce(
          (n, p) => n + p.rest.points.byteLength + p.rest.length.byteLength,
          0,
        );
        (samples['preview rest bytes'] ??= []).push(bytes);
      }
      (samples['trail places'] ??= []).push(held);
      (samples['trail ring bytes'] ??= []).push(
        trail.x.byteLength + trail.y.byteLength + trail.z.byteLength + trail.at.byteLength,
      );
      held = 0;
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

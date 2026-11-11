/**
 * How far the pace player holes a putt, holes a chip and drives, which is what the moments' thresholds in `src/game.ts`
 * (`MOMENTS`) are set from: each is put where about one hole in ten earns it, and this prints the spread they are read from.
 * A measuring tool and not a gate: it holds nothing, and is not in `check`. They are the autopilot's figures, with a
 * player's slips, and not a person's; a person drives and putts about as far, but rarely as truly.
 *
 *   npm run moments            every course, 8 seeds each
 *   npm run moments -- --seeds 16
 *
 * It counts the strokes from the game's own events and state, never from the moments it measures, so it can be run
 * before they exist and says the same after.
 */
import { Autopilot } from '../src/autopilot';
import { lieAt } from '../src/arena';
import { COURSES } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { LIE } from '../src/surfaces';
import { PLAYER } from './pace';

const DT = 1 / 60;
const CAP_MINUTES = 20;

interface Samples {
  /** Holed strokes that were putts, by minigolf and by golf, from past the hole's first stroke: yards from where struck to the cup. */
  puttsMini: number[];
  puttsGolf: number[];
  /** Holed strokes that were not putts, on golf, past the first stroke. */
  chips: number[];
  /** Carries of a driver's first landing from the tee, and those that came down on the fairway. */
  drives: number[];
  fairwayDrives: number[];
  /** Holes played, by minigolf and golf, and holes holed in one. */
  holesMini: number;
  holesGolf: number;
  aces: number;
}

function play(seed: number, holes: readonly (typeof COURSES)[number]['holes'][number][], into: Samples) {
  let putt = false;
  let driver = false;
  let opening = false;
  const events: GameEvents = {
    struck: () => {
      const golf = game.layout.golf;
      putt = !golf || game.inHand.loft === 0;
      opening = game.strokes === 1;
      driver = golf && opening && game.inHand.id === 'driver';
    },
    landed: (x, y, _speed, first) => {
      if (!first || !driver) return;
      driver = false;
      const carry = Math.hypot(x - game.lie.x, y - game.lie.y);
      into.drives.push(carry);
      if (lieAt(game.layout, x, y) === LIE.fairway) into.fairwayDrives.push(carry);
    },
    holed: () => {
      if (game.layout.golf) into.holesGolf++;
      else into.holesMini++;
      if (opening) {
        into.aces++;
        return;
      }
      const yards = Math.hypot(game.layout.cup.x - game.lie.x, game.layout.cup.y - game.lie.y);
      if (!game.layout.golf) into.puttsMini.push(yards);
      else (putt ? into.puttsGolf : into.chips).push(yards);
    },
  };
  const game = new Game(new Progress(memoryStore()), events, { random: seeded(seed), course: holes });
  const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
  for (let f = 0; f < CAP_MINUTES * 3600 && game.phase !== 'over'; f++) pilot.step(DT);
}

const at = (s: number[], q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];

function spread(name: string, xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return console.log(`${name.padEnd(34)} none`);
  const f = (n: number) => n.toFixed(1).padStart(6);
  console.log(
    `${name.padEnd(34)} n=${String(s.length).padStart(5)}  median${f(at(s, 0.5))}  p75${f(at(s, 0.75))}  p90${f(at(s, 0.9))}  p95${f(at(s, 0.95))}  most${f(s[s.length - 1])}`,
  );
}

/** What share of `of` holes would earn a moment at `yards` or more of `xs`. */
const share = (xs: number[], yards: number, of: number) =>
  `${yards}: ${((xs.filter((v) => v >= yards).length / of) * 100).toFixed(1)}%`;

function main() {
  const args = process.argv.slice(2);
  const k = args.indexOf('--seeds');
  const seeds = Array.from({ length: k >= 0 ? Number(args[k + 1]) : 8 }, (_, i) => i + 1);
  const all: Samples = {
    puttsMini: [],
    puttsGolf: [],
    chips: [],
    drives: [],
    fairwayDrives: [],
    holesMini: 0,
    holesGolf: 0,
    aces: 0,
  };
  const started = performance.now();
  for (const course of COURSES) for (const seed of seeds) play(seed, course.holes, all);
  console.log(
    `${COURSES.length} courses, ${seeds.length} seeds each, ${((performance.now() - started) / 1000).toFixed(0)} s; ` +
      `holes holed: ${all.holesMini} minigolf, ${all.holesGolf} golf; aces: ${all.aces}`,
  );
  spread('holed putts, minigolf', all.puttsMini);
  spread('holed putts, golf', all.puttsGolf);
  spread('holed non-putts, golf', all.chips);
  spread('drives from the tee (carry)', all.drives);
  spread('drives onto the fairway (carry)', all.fairwayDrives);
  const mini = all.holesMini,
    golf = all.holesGolf;
  const range = (a: number, b: number, step: number) =>
    Array.from({ length: (b - a) / step + 1 }, (_, i) => a + i * step);
  console.log('\nshare of holes earning it at each threshold (yards):');
  console.log(
    'long putt, minigolf: ' +
      range(10, 40, 5)
        .map((y) => share(all.puttsMini, y, mini))
        .join('  '),
  );
  console.log(
    'long putt, golf:     ' +
      range(10, 40, 5)
        .map((y) => share(all.puttsGolf, y, golf))
        .join('  '),
  );
  console.log(
    'chip-in, golf:       ' +
      range(10, 60, 10)
        .map((y) => share(all.chips, y, golf))
        .join('  '),
  );
  console.log(
    'long drive, golf:    ' +
      range(200, 280, 10)
        .map((y) => share(all.fairwayDrives, y, golf))
        .join('  '),
  );
}

main();

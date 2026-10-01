/**
 * The game played by a monkey: the real game, without the picture, made to
 * do at random everything a player can make happen, and checked after every
 * few frames for anything that must always hold and does not
 * (`invariants.ts`), and for anything thrown. A player can strike the ball
 * any way at any power, strike it well at the cup, try to strike it while it
 * rolls or between holes, wait, reload, ask for another round when one is
 * over, and buy and use clubs in the shop, which it can afford now and then
 * with what its holes pay. Random shots reach each hole's limit, and good ones hole out, so
 * the monkey gets round the whole course. On a golf hole it chooses a shape (straight, a draw or a fade) and a spin (flat,
 * back or top) before its shots, as a player's buttons do, and the game must put them back to nought when the stroke is
 * taken. Each knock the game tells of is
 * checked as it is told, since what is wrong with one is gone by the next.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { aimView } from '../src/aimview';
import { heightAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { CameraRig, facing } from '../src/camera';
import { CLUBS } from '../src/clubs';
import { COURSES, type HoleDef } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { Input } from '../src/input';
import {
  arrowProblems,
  breakProblems,
  checkInvariants,
  knockProblems,
  landingProblems,
  planProblems,
  previewProblems,
  viewProblems,
  TURN_TIME,
} from '../src/invariants';
import { breakOf, greenArrows, leansOnMinigolf } from '../src/green';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { Previewer } from '../src/preview';
import { RANGE } from '../src/range';
import { BAG } from '../src/bag';
import { carryFrom } from '../src/flight';
import { lieAt } from '../src/arena';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { groundAt } from '../src/shot';
import { GREENS, LIE } from '../src/surfaces';

/**
 * How far off the cup a straight putt's line must pass for the break to say it misses: the cup takes a ball within about
 * 1.45 yards of its line, and one that curves takes it from a little further (a putt that breaks 1.5 or 1.6 across, struck
 * straight, still drops in the game's own rehearsal), so only a break clearly past that holds the autopilot to aiming off.
 */
const MISSES = 2;

const DT = 1 / 60;

/** The winds, in miles an hour, that the holes of The Range are given in turn, over again past the last. */
export const WINDS = [12, 18, 6] as const;

/**
 * The holes of The Range with a wind on them, of 12, 18 and 6 miles an hour in turn and over again for a course of more
 * than three (a hole past the list would otherwise be given none, and be calm without a word), under names of their own
 * (the save keeps a best score by name): where the monkey plays golf in wind, since The Range itself is calm and stays so.
 */
export const WINDY: readonly HoleDef[] = RANGE.map((hole, k) => ({
  ...hole,
  name: `${hole.name} windy`,
  wind: WINDS[k % WINDS.length],
}));

/**
 * How fast the greens of each of the contoured holes run, in turn: the fastest, the slowest, and a fifth and an eighth of the
 * way from the fastest toward the slowest, so a monkey putts on every speed a hole may have, and on the two ends of it.
 */
const CONTOURED_GREENS = [
  GREENS.fast,
  GREENS.slow,
  GREENS.fast + 0.08 * (GREENS.slow - GREENS.fast),
  GREENS.fast + 0.2 * (GREENS.slow - GREENS.fast),
];

let contouredHoles: readonly HoleDef[] | undefined;

/**
 * The nine holes of The Links made again with the steepest contour a green may have, at greens that run at each of
 * `CONTOURED_GREENS` in turn, under names of their own: where the monkey putts on ground that breaks and on every speed of
 * green. Made the first time they are asked for and no oftener, as The Links are: some hundreds of milliseconds, which a run
 * on other holes should not pay.
 */
export function contoured(): readonly HoleDef[] {
  return (contouredHoles ??= LINKS_SPECS.map((spec, k) => ({
    ...golfHole({ ...spec, contour: 1, greens: CONTOURED_GREENS[k % CONTOURED_GREENS.length] }),
    name: `${spec.name} contoured`,
  })));
}

/** What a player's buttons give a shape and a spin: straight or flat, and one way or the other, straight the likeliest for a shape. */
const SHAPES = [0, 0, -1, 1];
const SPINS = [0, -1, 1];
/** What a knock is told with, and a landing. */
type Knock = Parameters<NonNullable<GameEvents['knocked']>>;
type Landing = Parameters<NonNullable<GameEvents['landed']>>;
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
  /** How many times each hole was begun, by name: which holes the monkey played. */
  visited: Record<string, number>;
}

/**
 * Play `frames` frames of the game at random from `seed`. Left to itself it starts on the first course and comes to
 * the others by choosing them, as a player does; given `course` it plays that one throughout, at the start, after a
 * reload and whenever it chooses, so a course of its own gets the whole of a run and not a share of it.
 */
export function fuzz(seed: number, frames: number, course?: readonly HoleDef[]): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const random = seeded(seed * 7 + 1);
  const happened: Record<string, number> = {};
  const visited: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  /** The game being played, once there is one, and what was wrong with a knock as it was told, for the next check. */
  let playing: Game | null = null;
  const told: string[] = [];
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: number[]) => {
          count(happened, name);
          if (name === 'started' && playing) count(visited, playing.def.name);
          if (name === 'knocked' && playing) told.push(...knockProblems(playing, ...(args as Knock)));
          if (name === 'landed' && playing) {
            const [x, y, speed, first] = args as unknown as Landing;
            told.push(...landingProblems(playing, speed, x, y));
            // a shot taken as it was aimed comes down within the spread the preview showed, and never past its ring
            if (first && aimed) {
              const a = aimed;
              const u = (x - a.x) * Math.cos(a.heading) + (y - a.y) * Math.sin(a.heading);
              const v = -(x - a.x) * Math.sin(a.heading) + (y - a.y) * Math.cos(a.heading);
              const slack = 2 + 0.03 * a.carry;
              // inside the box of what a swing can do: no further across than its scatter, and no further along than the
              // ring and the worst mishit of speed (the two together, in a corner, which the spread's ellipse leaves out)
              if (Math.abs(u) > a.along + slack || Math.abs(v) > a.across + slack)
                told.push(
                  `a shot aimed to come down within ${a.along.toFixed(1)} along and ${a.across.toFixed(1)} across of ${a.x.toFixed(1)},${a.y.toFixed(1)} came down at ${x.toFixed(1)},${y.toFixed(1)}, ${u.toFixed(1)} along and ${v.toFixed(1)} across (${a.what})`,
                );
            }
          }
          if (['landed', 'stopped', 'splash', 'outOfBounds', 'holed', 'started'].includes(name)) aimed = null;
        },
    },
  );
  // the game's chance, counted, so that what is only looked at can be shown to have drawn none of it
  let draws = 0;
  const chance = (s: number) => {
    const next = seeded(s);
    return () => (draws++, next());
  };
  /** The shot aimed and then taken, where the preview said it comes down, for the landing to be held to when it is told. */
  let aimed: {
    heading: number;
    x: number;
    y: number;
    across: number;
    along: number;
    carry: number;
    what: string;
  } | null = null;
  const log: string[] = [];
  let frame = 0;
  const fail = (problems: string[]): FuzzResult => ({
    seed,
    frames: frame,
    failure: { seed, frame, problems, log: log.slice(-LOG_TAIL) },
    done,
    happened,
    visited,
  });

  try {
    // a new player, or, on odd seeds, one come back with coins and gems enough for the shop
    let store = memoryStore(seed % 2 ? JSON.stringify({ coins: 700, gems: 6 }) : null);
    let game = new Game(new Progress(store), events, { random: chance(seed), course });
    playing = game;
    // a player part way round, on a hole of the seed's: every hole is played, where a monkey starting from the first
    // and reloading now and then would seldom get to the last
    game.startAt(seed % game.course.length);
    let busy = 0;
    /** The previewer of the hole being played, made again when the game or the hole changes. */
    let previewer: Previewer | null = null;
    let previewerOf: { game: Game | null; hole: number; course: readonly HoleDef[] | null } = {
      game: null,
      hole: -1,
      course: null,
    };
    const between = (a: number, b: number) => a + random() * (b - a);
    /** The chance of reading a green, apart from the monkey's own. */
    const looking = seeded(seed * 13 + 5);
    const glance = (a: number, b: number) => a + looking() * (b - a);
    /** A shape and a spin chosen for the next shot, on a golf hole, as a player's buttons do; the game keeps them within -1 to 1. */
    const choose = () => {
      if (!game.layout.golf) return;
      game.setShape(SHAPES[Math.floor(random() * SHAPES.length)]);
      game.setSpin(SPINS[Math.floor(random() * SPINS.length)]);
    };
    /** After a stroke the choices are spent: the next shot is straight and flat unless chosen again. */
    const spent = () => {
      if (game.shape !== 0 || game.spin !== 0)
        throw new Error(`a stroke was taken and left a shape of ${game.shape} and a spin of ${game.spin} chosen`);
    };
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what}`);
    };
    /**
     * A player reading a green: done on a chance of its own, so that it adds to a run and takes nothing from the monkey's own
     * stream, and every run of every other course plays as it did.
     */
    const read = () => {
      // a player reading a green before a putt: the break from where the ball lies and the arrows over the green, which
      // are looked at and change nothing, draw none of the game's chance and are finite whatever the ball's lie
      // on golf, and on a hole of minigolf whose ground leans, which shows its break the same way
      if (!(game.layout.golf || leansOnMinigolf(game.layout)) || !game.ready) return;
      const { world, ball, layout } = game;
      const digest = JSON.stringify([
        game.t,
        game.strokes,
        world.x[ball],
        world.y[ball],
        world.z[ball],
        game.shape,
        game.spin,
      ]);
      const drawn = draws;
      const arrows = greenArrows(layout);
      const bad = [...breakProblems(game), ...arrowProblems(layout, arrows)];
      // and the break from anywhere on the hole a player could drop a ball, not only where it lies
      for (let k = 0; k < 3; k++) {
        const x = glance(layout.bounds.minX, layout.bounds.maxX),
          y = glance(layout.bounds.minY, layout.bounds.maxY);
        const there = breakOf(layout, x, y, game.def.greens);
        if (!Number.isFinite(there.across) || !Number.isFinite(there.rise))
          bad.push(`the break from ${x.toFixed(1)},${y.toFixed(1)} is ${there.across} across and ${there.rise} up`);
      }
      if (bad.length) throw new Error(`reading the green: ${bad.join('; ')}`);
      if (
        digest !==
        JSON.stringify([game.t, game.strokes, world.x[ball], world.y[ball], world.z[ball], game.shape, game.spin])
      )
        throw new Error('reading the green changed the game');
      if (draws !== drawn) throw new Error(`reading the green drew ${draws - drawn} numbers of the game's chance`);
      did('read the break');
    };
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: [number, () => void][] = [
      [
        6,
        () => {
          // any way at all, at any power, as a drag can: the least shots too, and the hardest; and on a golf hole any club
          // of the bag, which a player picks before the drag
          if (game.layout.golf && random() < 0.8) game.pick(BAG[Math.floor(random() * BAG.length)].id);
          const power = random() < 0.15 ? 1 : random();
          choose();
          if (game.shoot(between(-Math.PI, Math.PI), power)) {
            spent();
            did('shoot');
          }
          busy = Math.floor(between(10, 90));
        },
      ],
      [
        4,
        () => {
          // a player who can play: the autopilot's shot at the cup, slipped a little
          const shot = new Autopilot(game).plan();
          if (!shot) return;
          // what it plans is a shot, from wherever the ball lies
          const bad = planProblems(game, shot);
          if (bad.length) throw new Error(`the autopilot planned no shot: ${bad.join('; ')}`);
          // a putt on a green is held to the break the player is shown: aimed the way it says, never wildly off it. `off` is
          // counter-clockwise from the line to the cup, which is to the left, and `across` is positive to the right, so a
          // putt aimed as the break says has them cancel
          if (game.layout.golf && shot.club === 'putter') {
            const { world, ball, layout } = game;
            const from = { x: world.x[ball], y: world.y[ball] };
            if (lieAt(layout, from.x, from.y) === LIE.green) {
              const far = Math.hypot(layout.cup.x - from.x, layout.cup.y - from.y);
              const off =
                Math.atan2(
                  Math.sin(shot.angle - Math.atan2(layout.cup.y - from.y, layout.cup.x - from.x)),
                  Math.cos(shot.angle - Math.atan2(layout.cup.y - from.y, layout.cup.x - from.x)),
                ) * far;
              const { across } = breakOf(layout, from.x, from.y, game.def.greens);
              told.push(...breakProblems(game));
              if (Math.abs(off + across) > 1 + 0.1 * far || (Math.abs(across) > MISSES && off * across >= 0))
                told.push(
                  `a putt of ${far.toFixed(1)} was aimed ${off.toFixed(2)} off the cup, where the break says ${across.toFixed(2)}, on greens that run at ${game.def.greens ?? GREENS.normal}`,
                );
              did('putt by the break');
            }
          }
          if (shot.club) game.pick(shot.club);
          // mostly as planned, which is straight and flat, and now and then with whatever else a player may choose
          if (!game.layout.golf) {
            // nothing to choose on a hole of minigolf
          } else if (random() < 0.3) choose();
          else {
            game.setShape(0);
            game.setSpin(0);
          }
          if (game.shoot(shot.angle + between(-0.08, 0.08), shot.power * between(0.85, 1.15))) {
            spent();
            did('shoot well');
          }
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
          // a club chosen from the bag, on a golf hole, at any time: it is in hand, whatever the ball is doing; a club that is
          // not in the bag is refused and changes nothing
          if (!game.layout.golf) return;
          const club = BAG[Math.floor(random() * BAG.length)];
          if (!game.pick(club.id) || game.inHand !== club) throw new Error(`the ${club.id} was not put in hand`);
          const before = game.inHand;
          if (game.pick('mashie') || game.inHand !== before) throw new Error('a club that is not in the bag was taken');
          did('choose a club');
        },
      ],
      [
        2.5,
        () => {
          // a player aiming on a golf hole: a club picked, and a drag held at any angle and power, which shows the flight it
          // would make. Looking costs the game nothing: no chance drawn, no stroke, nothing of the ball or the clock moved
          if (!game.layout.golf || !game.ready) return;
          if (random() < 0.85) game.pick(BAG[Math.floor(random() * BAG.length)].id);
          const club = game.inHand;
          const { world, ball, layout } = game;
          const at = { x: world.x[ball], y: world.y[ball] };
          const toCup = Math.atan2(layout.cup.y - at.y, layout.cup.x - at.x);
          const angle = random() < 0.5 ? toCup + between(-0.3, 0.3) : between(-Math.PI, Math.PI);
          const power = random() < 0.2 ? 1 : random() < 0.1 ? between(0.001, 0.05) : random();
          if (
            !previewer ||
            previewerOf.game !== game ||
            previewerOf.hole !== game.hole ||
            previewerOf.course !== game.course
          ) {
            previewer = new Previewer(game);
            previewerOf = { game, hole: game.hole, course: game.course };
          }
          const digest = () =>
            JSON.stringify([
              game.t,
              game.strokes,
              game.card,
              game.phase,
              game.hole,
              game.inHand.id,
              game.shape,
              game.spin,
              world.x[ball],
              world.y[ball],
              world.z[ball],
            ]);
          // the shape and the spin a player has chosen are the player's until the stroke, and not the preview's to change
          if (random() < 0.5) choose();
          const before = digest(),
            drawn = draws;
          const p = previewer.run(at, club, angle, power, game.shape, game.spin);
          const bad = previewProblems(game, at, club, p);
          if (bad.length)
            throw new Error(
              `a preview of the ${club.id} at ${power.toFixed(3)} with shape ${game.shape} and spin ${game.spin}, in a wind of ${game.wind.speed}: ${bad.join('; ')}`,
            );
          if (digest() !== before) throw new Error('aiming a shot changed the game');
          if (draws !== drawn) throw new Error(`aiming a shot drew ${draws - drawn} numbers of the game's chance`);
          did('aim a shot');
          // taken as aimed, where nothing in the air turns the flight (a swing that is not true may meet a tree or the rail
          // where the true swing does not, or the other way): it comes down within the spread that was shown
          if (
            random() < 0.7 &&
            p.n > 1 &&
            p.end === 'landed' &&
            !p.hit &&
            !layout.trees.length &&
            power > 0.05 &&
            game.shape === 0
          ) {
            aimed = {
              heading: p.heading,
              x: at.x,
              y: at.y,
              across: p.footprint.across,
              along: p.footprint.along,
              carry: p.carry,
              what: `${club.id} at ${power.toFixed(3)} from ${at.x.toFixed(1)},${at.y.toFixed(1)} on lie ${lieAt(layout, at.x, at.y)}, ring ${p.x.toFixed(1)},${p.y.toFixed(1)}, carry ${p.carry.toFixed(1)}, angle ${angle.toFixed(3)}`,
            };
            // the ring is the far end of the spread, and the spread's middle is a half length short of it
            aimed.x = p.x - Math.cos(p.heading) * p.footprint.along;
            aimed.y = p.y - Math.sin(p.heading) * p.footprint.along;
            if (game.shoot(angle, power)) {
              spent();
              did('shoot as aimed');
            }
            busy = Math.floor(between(10, 90));
          }
        },
      ],
      [
        1,
        () => {
          // the shop, open whenever: any club, whether it can be paid for or not
          const club = CLUBS[Math.floor(random() * CLUBS.length)];
          const { coins, gems } = game.progress.save;
          const can = coins >= club.coins && gems >= club.gems && !game.progress.save.owned.includes(club.id);
          if (game.buy(club.id) !== can)
            throw new Error(`buying ${club.id} with ${coins} coins went against the price`);
          did(can ? 'buy' : 'buy, refused');
        },
      ],
      [
        1,
        () => {
          const club = CLUBS[Math.floor(random() * CLUBS.length)];
          game.equip(club.id);
          did('equip');
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
          // a course chosen as a player chooses one: on the start screen, before a round's first stroke, or from the
          // card's button when a round is over
          const atStart = game.hole === 0 && game.strokes === 0 && game.card.length === 0;
          if (game.phase !== 'over' && !atStart) return;
          const chosen = COURSES[Math.floor(random() * COURSES.length)].holes;
          game.playCourse(course ?? chosen);
          did('choose a course');
        },
      ],
      [
        0.5,
        () => {
          // saved, and loaded again into a new game as a reload would: what was kept must come back as it went
          game.persist();
          const kept = JSON.stringify(game.progress.save);
          store = memoryStore(store.json);
          game = new Game(new Progress(store), events, { random: chance(seed + frame), course });
          playing = game;
          const loaded = JSON.stringify(game.progress.save);
          if (loaded !== kept) throw new Error(`the save was ${kept} and loaded as ${loaded}`);
          did('reload');
        },
      ],
    ];
    // a player's hand on the screen, as the page's is: the same pointers, mode and camera, on a desktop-sized window
    const SCREEN = { w: 1280, h: 800 };
    const rig = new CameraRig();
    const cam = new Camera();
    cam.aspect = SCREEN.w / SCREEN.h;
    cam.fov = rig.fov;
    const input = new Input({
      shortSide: () => SCREEN.h,
      ground(x, y) {
        rig.place(cam);
        cam.update();
        const z = heightAt(game.layout, game.world.x[game.ball], game.world.y[game.ball]);
        return groundAt(cam, (x / SCREEN.w) * 2 - 1, 1 - (y / SCREEN.h) * 2, z);
      },
      shoot: (angle, power) => void game.shoot(angle, power),
      zoom: (by) => rig.zoom(by),
      orbit: (turn, tilt) => rig.orbit(turn, tilt),
      blocked: () => false,
    });
    actions.push([
      2,
      () => {
        // a player looking round: the switch to Look, then fingers and the mouse dragged and pinched anywhere on the
        // screen, and the switch back. Nothing may be struck, and the view keeps to its limits
        const strokes = game.strokes;
        did('look round');
        // the camera set for the hole as a page sets it, and on a golf hole sometimes sent to look at a shot's landing
        rig.setGolf(game.layout.golf);
        if (game.layout.golf && random() < 0.5) {
          const lie = lieAt(game.layout, game.world.x[game.ball], game.world.y[game.ball]);
          rig.aimAt(aimView(carryFrom(game.inHand, 1, lie) * 1.045, cam.aspect), random() < 0.3);
          rig.settle(between(0, 2));
          for (const problem of viewProblems(rig)) told.push(problem);
        }
        input.setMode('look');
        const at = () => [between(0, SCREEN.w), between(0, SCREEN.h)] as const;
        for (let k = 0, fingers = 1 + Math.floor(random() * 3); k < fingers; k++) {
          const id = k + 1;
          let [x, y] = at();
          input.down(id, x, y);
          // sometimes a second finger lands: a pinch, which turns nothing and may go on after the first has lifted
          const second = random() < 0.3 ? id + 100 : 0;
          if (second) input.down(second, ...at());
          for (let m = Math.floor(between(1, 9)); m > 0; m--) {
            [x, y] = [
              Math.max(0, Math.min(SCREEN.w, x + between(-500, 500))),
              Math.max(0, Math.min(SCREEN.h, y + between(-500, 500))),
            ];
            input.move(random() < 0.2 && second ? second : id, x, y);
          }
          input.up(id, x, y);
          if (second) input.up(second, ...at());
        }
        input.setMode('aim');
        if (game.strokes !== strokes) told.push(`looking round took a stroke: ${strokes} to ${game.strokes}`);
        for (const problem of viewProblems(rig)) told.push(problem);
      },
    ]);
    /**
     * A player pressing the flag button: the camera turned to face the cup from the ball, in either mode, while the ball
     * rolls or between holes, from any lie. Done on a chance of its own, as reading a green is, so the monkey's own stream
     * is as it was and every other run plays as before. The page refuses it while a drag is under way, and so does this.
     */
    const facer = seeded(seed * 17 + 3);
    const face = () => {
      if (input.aim !== null || !game.ready) return;
      const { world, ball, layout } = game;
      const ballAt = { x: world.x[ball], y: world.y[ball] };
      const heading = facing(ballAt, layout.cup);
      // a ball that is in the cup has nowhere to face: the page's button does nothing then, and so must the rig
      if (heading === null) {
        const before = rig.azimuth;
        rig.turnTo(Number.NaN);
        if (rig.turning || rig.azimuth !== before) told.push('turning to face nowhere moved the camera');
        return;
      }
      const digest = JSON.stringify([game.t, game.strokes, ballAt.x, ballAt.y, world.z[ball], game.shape, game.spin]);
      const drawn = draws;
      rig.setGolf(layout.golf);
      input.setMode(facer() < 0.5 ? 'look' : 'aim');
      rig.turnTo(heading);
      let seconds = 0;
      // one more second than the rules allow, so a camera left turning is told of by them and not only by this loop
      for (let k = 0; k < (TURN_TIME + 1) / DT; k++) {
        for (const problem of viewProblems(rig, seconds)) told.push(problem);
        if (!rig.turning) break;
        rig.settle(DT);
        seconds += DT;
      }
      for (const problem of viewProblems(rig, seconds)) told.push(problem);
      if (rig.turning) told.push(`the camera was still turning to face the flag after ${seconds.toFixed(2)} seconds`);
      const off = Math.abs(rig.azimuth - heading);
      if (!(Math.min(off, 2 * Math.PI - off) <= 1e-6))
        told.push(`the camera faces ${rig.azimuth}, and the flag is at ${heading} from the ball`);
      // pressed again it changes nothing
      const at = [rig.azimuth, rig.tilt, rig.distance, rig.lead];
      rig.turnTo(heading);
      rig.settle(DT);
      if (rig.turning || JSON.stringify([rig.azimuth, rig.tilt, rig.distance, rig.lead]) !== JSON.stringify(at))
        told.push('pressing the flag button again moved the camera');
      input.setMode('aim');
      if (
        digest !==
        JSON.stringify([game.t, game.strokes, world.x[ball], world.y[ball], world.z[ball], game.shape, game.spin])
      )
        told.push('facing the flag changed the game');
      if (draws !== drawn) told.push(`facing the flag drew ${draws - drawn} numbers of the game's chance`);
      did('face the flag');
    };
    const total = actions.reduce((n, [w]) => n + w, 0);
    const act = () => {
      let pick = random() * total;
      for (const [w, go] of actions) {
        if ((pick -= w) < 0) return go();
      }
    };

    for (frame = 1; frame <= frames; frame++) {
      if (busy > 0) busy--;
      else {
        if (game.layout.golf && looking() < 0.04) read();
        act();
      }
      // the button is there whatever the ball is doing, so it is pressed while it rolls and between holes too
      if (facer() < 0.008) face();
      game.step(DT);
      // a knock told wrongly is told once, and waits for no check
      if (told.length) return fail(told.splice(0));
      if (frame % CHECK_EVERY === 0) {
        const problems = checkInvariants(game);
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened, visited };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}

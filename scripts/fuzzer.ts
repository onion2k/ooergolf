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
import { aimView, reachOf, reachOnMinigolf, safeBox } from '../src/aimview';
import { AIM_TURN, Director, NEAR_FLAG } from '../src/director';
import { ROLL, heightAt, powerFor, rollsFor, strikeSpeed } from '../src/arena';
import { Autopilot, timeAlong } from '../src/autopilot';
import { CameraRig, facing, overheadFit, wrap } from '../src/camera';
import { CLUBS } from '../src/clubs';
import { COURSES, type HoleDef } from '../src/course';
import { Game, type GameEvents } from '../src/game';
import { Input } from '../src/input';
import {
  arrowProblems,
  breakProblems,
  checkInvariants,
  framingProblems,
  kickerProblems,
  knockProblems,
  landingProblems,
  lostOnStreamProblems,
  planProblems,
  previewProblems,
  viewProblems,
  TURN_TIME,
} from '../src/invariants';
import { breakOf, greenArrows, leansOnMinigolf } from '../src/green';
import { golfHole, laneOf } from '../src/golf';
import { centre, figures } from '../test/lake-figures';
import { LINKS_SPECS } from '../src/links';
import { flipperYaw } from '../src/obstacles';
import { Previewer } from '../src/preview';
import { BAG, type BagClub } from '../src/bag';
import { carryFrom } from '../src/flight';
import { lieAt } from '../src/arena';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { DRAG, HeldView, type Shot } from '../src/shot';
import { GREENS, LIE } from '../src/surfaces';

/**
 * How far off the cup a straight putt's line must pass for the break to say it misses: the cup takes a ball within about
 * 1.45 yards of its line, and one that curves takes it from a little further (a putt that breaks 1.5 or 1.6 across, struck
 * straight, still drops in the game's own rehearsal), so only a break clearly past that holds the autopilot to aiming off.
 */
const MISSES = 2;

const DT = 1 / 60;

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

const ISLANDS = new WeakMap<HoleDef, { x: number; y: number }[]>();
/**
 * The middles of the pieces of land of a golf hole that lie wholly in water (neither the tee's nor the cup's), found from its
 * map alone by the lake tests' own reading and kept, since a hole's map does not change.
 */
function islandsOf(hole: HoleDef): { x: number; y: number }[] {
  let found = ISLANDS.get(hole);
  if (!found) {
    found = hole.map.some((row) => row.includes('~'))
      ? figures(hole).islands.map((i) => centre(hole, i.centre[0], i.centre[1]))
      : [];
    ISLANDS.set(hole, found);
  }
  return found;
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
  /** How many numbers the monkey drew from its main stream: held by a test, since every other action keeps to a stream of its own and must never add to it. */
  drawn: number;
  /** How many times the framing rule was asked of the camera, which a test holds above nothing: a check that never ran passes in silence. */
  framed: number;
}

/**
 * Play `frames` frames of the game at random from `seed`. Left to itself it starts on the first course and comes to
 * the others by choosing them, as a player does; given `course` it plays that one throughout, at the start, after a
 * reload and whenever it chooses, so a course of its own gets the whole of a run and not a share of it.
 */
export function fuzz(seed: number, frames: number, course?: readonly HoleDef[]): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const monkey = seeded(seed * 7 + 1);
  /** How many numbers the monkey has drawn from its own stream, which a test holds to a figure so a stray draw is seen. */
  let monkeyDraws = 0;
  const random = () => (monkeyDraws++, monkey());
  const happened: Record<string, number> = {};
  const visited: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  /** The game being played, once there is one, and what was wrong with a knock as it was told, for the next check. */
  let playing: Game | null = null;
  const told: string[] = [];
  /** How often the framing rule was asked, and the page's own camera director (made once the game's screen is known), which is told of each hole begun. */
  let framed = 0;
  let directing: Director | null = null;
  const events: GameEvents = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: number[]) => {
          count(happened, name);
          if (name === 'started' && playing) count(visited, playing.def.name);
          if (name === 'started' && playing && directing) directing.started();
          // a stroke struck: the camera is told, which has it follow the ball for one in five and hold still for the rest
          if (name === 'struck' && playing && directing) directing.struck();
          if (name === 'knocked' && playing) told.push(...knockProblems(playing, ...(args as Knock)));
          // a stream is a belt: the ball is carried on it, and never lost
          if ((name === 'splash' || name === 'outOfBounds') && playing)
            told.push(...lostOnStreamProblems(playing, name, args[0], args[1]));
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
    drawn: monkeyDraws,
    framed,
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
          director.use(game);
          director.started();
          const loaded = JSON.stringify(game.progress.save);
          if (loaded !== kept) throw new Error(`the save was ${kept} and loaded as ${loaded}`);
          did('reload');
        },
      ],
    ];
    // a player's hand on the screen, as the page's is: the same pointers, mode and camera, on a desktop-sized window
    // (a desk's, on even seeds, and a phone's held upright on odd ones, which the framing is held on in each)
    const SCREEN = seed % 2 ? { w: 400, h: 860 } : { w: 1280, h: 800 };
    const rig = new CameraRig();
    /** When the camera's time last ran ahead of the game's, in game time, by an action of the monkey's. */
    let skewedAt = -Infinity;
    // the page's own camera director, which the flag button is pressed through here as there, and which sends the camera
    // where the aim view says in every frame of the game
    const director = new Director(rig);
    directing = director;
    // the camera's own tosses (which side of the flag it looks to), from a number of the seed's own and no chance of the game's
    director.setSeed(seed * 41 + 9);
    director.use(game);
    director.setScreen(SCREEN.w / SCREEN.h, SCREEN.h);
    director.started();
    const cam = new Camera();
    cam.aspect = SCREEN.w / SCREEN.h;
    cam.fov = rig.fov;
    // the view held for a drag, as the page holds it
    const held = new HeldView();
    const input = new Input({
      shortSide: () => SCREEN.h,
      hold() {
        rig.place(cam);
        cam.update();
        held.hold(cam);
      },
      ground(x, y) {
        const z = heightAt(game.layout, game.world.x[game.ball], game.world.y[game.ball]);
        return held.ground((x / SCREEN.w) * 2 - 1, 1 - (y / SCREEN.h) * 2, z);
      },
      shoot: (angle, power) => void game.shoot(angle, power),
      zoom: (by) => rig.zoom(by),
      pan: (dx, dy) => rig.pan(dx, dy, SCREEN.h),
      blocked: () => false,
    });
    actions.push([
      2,
      () => {
        // a player looking from overhead: the button pressed, then fingers and the mouse dragged and pinched anywhere on the
        // screen, and the button pressed back. Nothing may be struck, the view keeps to its limits, and once it is left the
        // view is as it was to the digit (the pans and the pinches moved the overhead view's own and nothing of the other's)
        const strokes = game.strokes;
        did('look from overhead');
        // the camera is set for the hole by the director as a hole begins; on a golf hole it is sometimes sent to look at a shot's landing
        if (game.layout.golf && random() < 0.5) {
          const lie = lieAt(game.layout, game.world.x[game.ball], game.world.y[game.ball]);
          rig.aimAt(aimView(reachOf(game.inHand, lie, 0), cam.aspect), random() < 0.3);
          rig.settle(between(0, 2));
          for (const problem of viewProblems(rig)) told.push(problem);
        }
        // the view as it is when it has come to rest, which is what leaving the overhead view must give back
        const rest = () => {
          for (let k = 0; k < 600; k++) rig.settle(DT);
          return JSON.stringify([rig.azimuth, rig.tilt, rig.distance, rig.lead, rig.far]);
        };
        const before = rest();
        // the camera's own clock ran ten seconds on without the game's: with a ball on its way it is not where the page's would be,
        // and the ball is not asked to be on the screen for a few seconds, as the game catches the camera's time up
        if (!game.ready) skewedAt = game.t;
        const bounds = game.layout.bounds;
        rig.setOverhead(true, { bounds, distance: overheadFit(bounds, rig.azimuth, cam.aspect) });
        input.setMode('overhead');
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
        for (const problem of viewProblems(rig)) told.push(problem);
        rig.setOverhead(false);
        input.setMode('aim');
        if (game.strokes !== strokes) told.push(`looking from overhead took a stroke: ${strokes} to ${game.strokes}`);
        const after = rest();
        if (after !== before) told.push(`the view was ${before} and after the overhead view it was ${after}`);
        if (rig.blend !== 0) told.push(`the overhead view was left and still blended ${rig.blend}`);
        for (const problem of viewProblems(rig)) told.push(problem);
        // the camera was sent to a view of this action's own (the aim view of a shot in no wind, on no phone's page), which the
        // director did not know of: it is told the screen again, which has it work out where the camera should be and send it
        director.setScreen(SCREEN.w / SCREEN.h, SCREEN.h);
      },
    ]);
    // a course with a flipper on it gets one more thing the monkey does, and a course without leaves the monkey exactly as it
    // was, since the action is not in the list and the weights are the same
    if (game.course.some((h) => h.obstacles?.some((o) => o.kind === 'flipper'))) {
      /** The monkey's chance for the flipper, apart from its own, and the next phase of the swing to strike it at. */
      const striker = seeded(seed * 19 + 7);
      let wanted = striker();
      actions.push([
        3,
        () => {
          // a player timing a shot at the arm: strikes at a point along it at the moment it will be at the next phase of its
          // swing, round the whole of the swing in turn (the golden ratio's steps never repeat), with the power that takes
          // about as long as that to get there. The ball may well not get there then, and it is struck all the same
          const flipper = game.obstacles.flippers.at(Math.floor(striker() * game.obstacles.flippers.length));
          if (!flipper || !game.ready) return;
          wanted = (wanted + 0.618034) % 1;
          const { def } = flipper;
          const { world, ball, layout } = game;
          const along = 0.15 + 0.8 * striker();
          // the next moment the swing is at the phase wanted, at least a third of a second on
          const phase = (game.t / def.period + (def.phase ?? 0)) % 1;
          const arrive = game.t + 0.3 + ((((wanted - phase) % 1) + 1) % 1) * def.period;
          const aim = (t: number) => ({
            x: flipper.x + Math.cos(flipperYaw(def, t)) * along * flipper.length,
            y: flipper.y + Math.sin(flipperYaw(def, t)) * along * flipper.length,
          });
          const target = aim(arrive);
          let best = { power: 1, off: Infinity };
          for (let power = 0.05; power <= 1.0001; power += 0.05) {
            const time = timeAlong(
              layout,
              world.x[ball],
              world.y[ball],
              target.x,
              target.y,
              strikeSpeed(power, game.hardest),
            );
            if (Math.abs(time - (arrive - game.t)) < best.off)
              best = { power, off: Math.abs(time - (arrive - game.t)) };
          }
          const angle = Math.atan2(target.y - world.y[ball], target.x - world.x[ball]);
          if (game.shoot(angle, best.power)) {
            did('strike at the flipper');
          }
          busy = Math.floor(between(10, 90));
        },
      ]);
    }
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
      if (facer() < 0.5) {
        // from above there is no way to face the cup: the button does nothing, and the camera stays as it was
        const bounds = layout.bounds;
        rig.setOverhead(true, { bounds, distance: overheadFit(bounds, rig.azimuth, cam.aspect) });
        input.setMode('overhead');
        const was = JSON.stringify([rig.azimuth, rig.turning]);
        if (director.faceFlag(false) || JSON.stringify([rig.azimuth, rig.turning]) !== was)
          told.push('the flag button turned the camera from overhead');
        rig.setOverhead(false);
        input.setMode('aim');
      }
      const expected = director.nearFlag();
      if (expected === null || !director.faceFlag(false)) told.push('the flag button did nothing with the cup to face');
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
      // it looks near the flag and not at it: off the cup's heading by `NEAR_FLAG.least` to `most`, and at the heading the
      // director says (which the camera was sent to, to the last bit but the ease's own)
      const off = Math.abs(wrap(rig.azimuth - heading));
      if (!(off >= NEAR_FLAG.least - 1e-6 && off <= NEAR_FLAG.most + 1e-6))
        told.push(
          `the camera faces ${rig.azimuth}, which is ${off} off the flag's heading ${heading}, outside ${NEAR_FLAG.least} to ${NEAR_FLAG.most}`,
        );
      if (!(Math.abs(wrap(rig.azimuth - expected!)) <= 1e-6))
        told.push(`the camera faces ${rig.azimuth}, and the director said ${expected}`);
      // pressed again it changes nothing (the camera at rest first: it may be easing to an aim view as well, which goes on, and
      // the director is given its frame, which sends the camera to the view of a club chosen in this very frame)
      director.frame(DT, true);
      for (let k = 0; k < 600; k++) rig.settle(DT);
      // the view the camera has come to keeps the cup on the screen where it is in reach, and the ball and the reach
      for (const problem of framing()) told.push(problem);
      const reachToCup = layout.golf
        ? reachOf(game.inHand, lieAt(layout, ballAt.x, ballAt.y), game.wind.speed)
        : reachOnMinigolf(layout, ballAt.x, ballAt.y, Math.PI / 2 - rig.azimuth, rollsFor(game.hardest));
      if (
        Math.hypot(layout.cup.x - ballAt.x, layout.cup.y - ballAt.y) <= reachToCup &&
        !rig.atLimit &&
        !rig.easing(game.t) &&
        Math.hypot(rig.target[0] - ballAt.x, rig.target[1] - ballAt.y) <= 0.05
      ) {
        rig.place(cam, game.t);
        cam.update();
        const m = cam.viewProjection;
        const [cx, cy, cz] = [layout.cup.x, layout.cup.y, heightAt(layout, layout.cup.x, layout.cup.y)];
        const w = m[3] * cx + m[7] * cy + m[11] * cz + m[15];
        const nx = (m[0] * cx + m[4] * cy + m[8] * cz + m[12]) / w,
          ny = (m[1] * cx + m[5] * cy + m[9] * cz + m[13]) / w;
        const box = safeBox(cam.aspect, SCREEN.h);
        if (!(Math.abs(nx) <= box.x + 0.02 && ny <= box.top + 0.02 && ny >= box.bottom - 0.02))
          told.push(
            `the cup is in reach and the camera that looks near it has it at ${nx.toFixed(3)},${ny.toFixed(3)}, outside the safe box`,
          );
      }
      const at = [rig.azimuth, rig.tilt, rig.distance, rig.lead];
      if (director.faceFlag(false) !== true) told.push('the flag button did nothing the second time');
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
    /**
     * A player pulling the ball back and thinking better of it: a drag held at any angle and power, which turns the camera
     * to look the way it aims, and then taken back (let go inside the dead zone, a second finger, or the browser taking the
     * pointer). Never a stroke. Done on a chance of its own, as the flag button is, so the monkey's stream is as it was and
     * every other run plays as before. The aim is held bit for bit while the camera turns, the camera arrives within
     * `TURN_TIME` where the aim is strong enough and stays where a drag left it once it is taken back, and the game and its
     * chance are not touched.
     */
    const aimer = seeded(seed * 37 + 5);
    const aimAndTakeBack = () => {
      if (input.aim !== null || !game.ready || game.phase !== 'play') return;
      const at = (a: number, b: number) => a + aimer() * (b - a);
      const { world, ball } = game;
      const strokes = game.strokes;
      const digest = () => JSON.stringify([game.t, game.strokes, world.x[ball], world.y[ball], world.z[ball]]);
      const was = digest();
      const drawn = draws;
      // the camera at rest, as a player's is when the drag begins
      for (let k = 0; k < 600; k++) rig.settle(DT);
      const home = rig.azimuth;
      const press = [at(0.1 * SCREEN.w, 0.9 * SCREEN.w), at(0.1 * SCREEN.h, 0.9 * SCREEN.h)] as const;
      // a pull of from nothing to a good deal more than the hardest, in any direction, kept on the screen
      const length = at(0, DRAG.full * SCREEN.h * 1.4);
      const turn = at(0, 2 * Math.PI);
      const now = [
        Math.max(0, Math.min(SCREEN.w, press[0] + Math.cos(turn) * length)),
        Math.max(0, Math.min(SCREEN.h, press[1] + Math.sin(turn) * length)),
      ] as const;
      input.down(1, ...press);
      input.move(1, ...now);
      const held = input.aim as Shot | null;
      const aim = held ? { angle: held.angle, power: held.power } : null;
      const strong = aim !== null && aim.power >= AIM_TURN.least;
      const heading = aim ? wrap(Math.PI / 2 - aim.angle) : home;
      let seconds = 0;
      for (let k = 0; k < (TURN_TIME + 1) / DT; k++) {
        director.aiming(input.aim);
        director.frame(DT, true);
        // the pointer told again where it is, as a still finger is: the aim is the one it was, to the last bit
        input.move(1, ...now);
        if (JSON.stringify(input.aim) !== JSON.stringify(aim))
          told.push(
            `the aim was ${JSON.stringify(aim)} and the camera turning moved it to ${JSON.stringify(input.aim)}`,
          );
        for (const problem of viewProblems(rig, seconds)) told.push(problem);
        if (!rig.turning) break;
        seconds += DT;
      }
      if (rig.turning) told.push(`the camera was still turning to the aim after ${seconds.toFixed(2)} seconds`);
      if (strong && Math.abs(wrap(rig.azimuth - heading)) > 1e-3)
        told.push(`the camera faces ${rig.azimuth} and a drag aimed ${aim.angle} should have it at ${heading}`);
      if (!strong && rig.azimuth !== home)
        told.push(`a drag too weak to turn it turned the camera from ${home} to ${rig.azimuth}`);
      // taken back, one way or another: the camera is left looking where the drag had it
      const how = Math.floor(aimer() * 3);
      if (how === 0) {
        input.move(1, ...press);
        input.up(1, ...press);
      } else if (how === 1) {
        input.down(2, at(0, SCREEN.w), at(0, SCREEN.h));
        input.up(2, ...press);
        input.up(1, ...press);
      } else input.cancel(1);
      if ((input.aim as Shot | null) !== null) told.push('a drag taken back left an aim');
      const left = rig.azimuth;
      for (let k = 0; k < 60; k++) {
        director.aiming(input.aim);
        director.frame(DT, true);
        for (const problem of viewProblems(rig)) told.push(problem);
      }
      if (rig.azimuth !== left)
        told.push(`the camera was at ${left} when a drag was taken back and at ${rig.azimuth} after`);
      if (game.strokes !== strokes) told.push('a drag taken back took a stroke');
      if (digest() !== was) told.push('aiming and taking back changed the game');
      if (draws !== drawn) told.push(`aiming and taking back drew ${draws - drawn} numbers of the game's chance`);
      did('aim and take back');
    };
    /**
     * A player sending the ball into a moving bumper: struck at the place a barrier that throws is at this moment, a little
     * off its middle either way, at any power, the hardest often. Done only on a hole that has one, and on a chance of its
     * own, as the flag button is, so the monkey's stream is as it was and no other hole plays differently. The ceiling on
     * what the bumper throws is the invariants' to hold, as every ten frames.
     */
    const bumped = seeded(seed * 19 + 11);
    const bump = () => {
      if (!game.ready) return;
      const { obstacles, world, ball } = game;
      const bumpers = obstacles.barriers.filter((b) => b.def.bounce !== undefined);
      if (!bumpers.length) return;
      const pick = bumpers[Math.floor(bumped() * bumpers.length)];
      const { pusher } = pick;
      const aim = Math.atan2(pusher.y - world.y[ball], pusher.x + (bumped() - 0.5) * pick.hx - world.x[ball]);
      const power = bumped() < 0.4 ? 1 : 0.2 + 0.8 * bumped();
      if (game.shoot(aim, power)) {
        spent();
        did('strike a moving bumper');
        busy = Math.floor(10 + bumped() * 80);
      }
    };
    /**
     * A player putting the ball straight into a kicker: aimed at its middle or a little off it, soft or as hard as it goes,
     * from wherever the ball lies. Done on a chance of its own, as the flag button is, and only on a hole that has a kicker, so
     * the monkey's own stream, and every run on holes without one, play as they did. What it throws the ball at is held to
     * the ceiling every frame (`kickerProblems`), where it is met.
     */
    const striker = seeded(seed * 23 + 7);
    const strike = () => {
      const { world, ball, layout } = game;
      if (!game.ready || !layout.kickers.length) return;
      const k = layout.kickers[Math.floor(striker() * layout.kickers.length)];
      const angle = Math.atan2(k.y - world.y[ball], k.x - world.x[ball]) + (striker() - 0.5) * 0.6;
      const power = striker() < 0.3 ? 1 : 0.15 + 0.85 * striker();
      if (game.shoot(angle, power)) {
        did('strike a kicker');
        busy = Math.floor(between(10, 40));
      }
    };
    /**
     * A player striking the ball at a stream: aimed at a point of its belt from where the ball lies, at the power that rolls
     * it there on the level, between any slip a player has. Done on a chance of its own, as reading a green is, and only on
     * a hole that has a stream, so every other run plays as it did. Whatever comes of it, the game's rules hold: the ball is
     * carried, and is never told lost on the stream.
     */
    const streamer = seeded(seed * 19 + 7);
    const strikeOntoStream = () => {
      if (!game.ready || input.aim !== null || game.phase !== 'play') return;
      const streams = game.obstacles.conveyors.filter((c) => c.look === 'water');
      if (!streams.length) return;
      const c = streams[Math.floor(streamer() * streams.length)];
      const along = (streamer() - 0.5) * c.length,
        across = (streamer() - 0.5) * 2;
      const px = c.x + Math.cos(c.angle) * along - Math.sin(c.angle) * across,
        py = c.y + Math.sin(c.angle) * along + Math.cos(c.angle) * across;
      const { world, ball } = game;
      const dx = px - world.x[ball],
        dy = py - world.y[ball];
      const power = Math.min(
        1,
        powerFor(Math.sqrt(2 * ROLL.roll * Math.hypot(dx, dy)), game.hardest) * (0.8 + 0.4 * streamer()),
      );
      if (game.shoot(Math.atan2(dy, dx) + (streamer() - 0.5) * 0.1, power)) {
        spent();
        did('strike onto the stream');
      }
      busy = Math.floor(between(10, 90));
    };
    /**
     * A player driving through a wood's gap: from the tee of a hole that has a lane, the driver along the lane's bearing at
     * full power, with the slips a player has (a few degrees of aim, a tenth of the power). Done on a chance of its own, as the
     * flag button is, and only on a hole with a lane and with the ball at its tee, so the monkey's stream and every run on
     * holes without one play as they did. The canopies are the game's to hold, as every ten frames.
     */
    const driver = seeded(seed * 29 + 3);
    const driveTheLane = () => {
      const lane = laneOf(game.def);
      if (!lane || !game.ready || input.aim !== null || game.phase !== 'play' || !game.layout.golf) return;
      const { world, ball } = game;
      if (Math.hypot(world.x[ball] - lane.from.x, world.y[ball] - lane.from.y) > 6) return;
      const bearing = Math.atan2(lane.to.y - lane.from.y, lane.to.x - lane.from.x);
      game.pick(BAG[0].id);
      game.setShape(0);
      game.setSpin(0);
      if (game.shoot(bearing + (driver() - 0.5) * 0.1, 1 - driver() * 0.1)) {
        spent();
        did('drive the lane');
        busy = Math.floor(between(10, 90));
      }
    };
    /**
     * A player flying the ball to an island: the shortest club that carries to the middle of a piece of land wholly in
     * water, at the power that carries just so far on the level, from wherever the ball lies and a little off its line.
     * Done on a chance of its own and only on a hole with an island and with one within a driver's carry, so no other hole
     * plays differently. Whatever comes of it (water, the island, a tree) the game's rules hold.
     */
    const islander = seeded(seed * 31 + 5);
    const flyToIsland = () => {
      if (!game.ready || input.aim !== null || game.phase !== 'play' || !game.layout.golf) return;
      const islands = islandsOf(game.def);
      if (!islands.length) return;
      const { world, ball, layout } = game;
      const lie = lieAt(layout, world.x[ball], world.y[ball]);
      const island = islands[Math.floor(islander() * islands.length)];
      const dx = island.x - world.x[ball],
        dy = island.y - world.y[ball],
        far = Math.hypot(dx, dy);
      if (far < 20) return;
      const lofted = BAG.filter((c) => c.loft > 0).sort((a, b) => carryFrom(a, 1, lie) - carryFrom(b, 1, lie));
      const club: BagClub | undefined = lofted.find((c) => carryFrom(c, 1, lie) >= far * 1.05);
      if (!club) return;
      let low = 0,
        high = 1;
      for (let k = 0; k < 20; k++) {
        const mid = (low + high) / 2;
        if (carryFrom(club, mid, lie) < far) low = mid;
        else high = mid;
      }
      game.pick(club.id);
      game.setShape(0);
      game.setSpin(0);
      if (game.shoot(Math.atan2(dy, dx) + (islander() - 0.5) * 0.1, Math.min(1, high * (0.95 + 0.1 * islander())))) {
        spent();
        did('fly to an island');
        busy = Math.floor(between(10, 90));
      }
    };
    /**
     * The framing rule, asked of the camera as the page's director leaves it: once the ball is ready, the view has settled
     * (not easing, turning, gliding or blended to the view from above, the camera caught up with the ball) and no drag is
     * held, the ball and the furthest a shot reaches are inside the safe box for the screen. No chance is drawn, and nothing of
     * the game is touched.
     */
    const reach = { x: 0, y: 0, z: 0 };
    const framing = (): string[] => {
      const { world, ball } = game;
      if (game.t - skewedAt < TURN_TIME + 1) return [];
      if (input.aim !== null || !world.alive[ball] || game.phase !== 'play') return [];
      if (rig.blend > 0 || rig.easing(game.t)) return [];
      const where = (p: string) =>
        `${p} (${game.layout.golf ? 'golf' : 'minigolf'}, ${SCREEN.w} by ${SCREEN.h}, ${game.def.name}${director.following ? ', following' : ''})`;
      const there = { x: world.x[ball], y: world.y[ball], z: world.z[ball] };
      const box = safeBox(cam.aspect, SCREEN.h);
      // a ball on its way, held still for or followed, is on the screen whatever the camera is doing but blending
      if (!game.ready) {
        rig.place(cam, game.t);
        cam.update();
        framed++;
        return framingProblems(rig, cam, there, null, box).map(where);
      }
      if (rig.aiming || rig.turning) return [];
      if (Math.hypot(rig.target[0] - world.x[ball], rig.target[1] - world.y[ball]) > 0.05) return [];
      rig.place(cam, game.t);
      cam.update();
      framed++;
      return framingProblems(rig, cam, there, director.reachPoint(reach) ? reach : null, box).map(where);
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
      if (aimer() < 0.01) aimAndTakeBack();
      if (bumped() < 0.03) bump();
      if (game.layout.kickers.length && striker() < 0.03) strike();
      if (game.obstacles.streamed.size && streamer() < 0.03) strikeOntoStream();
      if (laneOf(game.def) && driver() < 0.03) driveTheLane();
      if (game.layout.golf && islandsOf(game.def).length && islander() < 0.03) flyToIsland();
      game.step(DT);
      director.frame(DT, false);
      // a kicker throws the hardest of anything on a course, so what it does to the ball is checked in every frame
      if (game.layout.kickers.length) {
        const bad = kickerProblems(game);
        if (bad.length) return fail(bad);
      }
      // a knock told wrongly is told once, and waits for no check
      if (told.length) return fail(told.splice(0));
      if (frame % CHECK_EVERY === 0) {
        const bad = framing();
        if (bad.length) return fail(bad);
        const problems = checkInvariants(game);
        if (problems.length) return fail(problems);
      }
    }
    return { seed, frames, failure: null, done, happened, visited, drawn: monkeyDraws, framed };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}

/**
 * Holes with kickers on them, which no course has yet: where the monkey strikes into a kicker, with one in the way of the
 * cup, a pair facing each other (the ceiling's hardest case) and four in a ring round a gap. Under names of their own,
 * since the save keeps a best score by name.
 */
export const KICKER_HOLES: readonly HoleDef[] = [
  {
    name: 'Fuzz kickers',
    par: 3,
    map: [
      '#########',
      '#...C...#',
      '#.......#',
      '#...k...#',
      '#..k.k..#',
      '#.......#',
      '#.......#',
      '#...T...#',
      '#########',
    ],
  },
  {
    name: 'Fuzz kicker pair',
    par: 3,
    map: ['#######', '#C....#', '#..k..#', '#.....#', '#.....#', '#..k..#', '#.....#', '#..T..#', '#######'],
  },
  {
    name: 'Fuzz kicker ring',
    par: 4,
    map: [
      '#########',
      '#C......#',
      '#.k...k.#',
      '#.......#',
      '#...k...#',
      '#.......#',
      '#.k...k.#',
      '#...T...#',
      '#########',
    ],
  },
];

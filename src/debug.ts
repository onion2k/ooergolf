/**
 * `window.game`: the game, for tests and for poking at from the console.
 * Everything a test needs to set a scene, play it exactly and read back
 * what happened, so no test waits on a clock or reaches into the game's
 * insides.
 *
 * Time is the test's to keep: `pause` stops the game where it is, and
 * `step` plays it on a frame at a time, exactly, drawing the last. `seed`
 * makes chance repeat. Anything that changes the game goes through here,
 * and `state`, `bodies`, `events` and `invariants` read it back.
 *
 * The types are shared with the smoke tests, so a test that calls something
 * that is not here does not compile.
 */
import type { Antialias } from 'artshape-render/game/renderer';
import { KIND_NAME, TILE, type Layout } from './arena';
import { Autopilot, type Plan } from './autopilot';
import { BAG, carryOf } from './bag';
import type { HoleDef } from './course';
import { greenArrows, speedName } from './green';
import type { Game } from './game';
import { checkInvariants } from './invariants';
import { seeded } from './random';

declare global {
  interface Window {
    game?: GameApi;
  }
}

export interface GameState {
  /** Game time, in seconds. */
  t: number;
  frame: number;
  paused: boolean;
  /** How many bodies are on the course. */
  live: number;
  /** Strokes taken on this hole. */
  strokes: number;
  /** Whether a shot can be taken: the ball at rest. */
  ready: boolean;
  /** Which hole, from nought, and its par. */
  hole: number;
  par: number;
  /** A hole in play, a hole done and the next about to begin, or the round over. */
  phase: 'play' | 'done' | 'over';
  /** Each hole finished this round, what it was scored. */
  card: number[];
  coins: number;
  gems: number;
  /** The item equipped ('' for none), and the items owned. */
  item: string;
  owned: string[];
  /** Whether the waders have saved a stroke on this hole, and whether this round's mulligan has been taken. */
  wadersUsed: boolean;
  mulliganUsed: boolean;
  /** The hardest the club in hand strikes. */
  hardest: number;
  /** The course being played, and whether the start screen is up to choose one. */
  course: string;
  choosing: boolean;
  /** Whether the hole is golf, played with the bag: and the club of it in hand. */
  golf: boolean;
  inHand: string;
  /** The shape chosen for the next lofted shot, from minus one (a draw) to one (a fade), and its spin, from minus one (backspin) to one (topspin). */
  shape: number;
  spin: number;
  /** The hole's wind: the way it blows across the ground as a unit vector, and how hard in miles an hour (nought for calm). */
  wind: { x: number; y: number; speed: number };
  /** How fast the hole's greens run, the steady slowing of a rolling ball in yards a second a second (less is faster), and its name; null for a hole that has not set it. */
  greens: number | null;
  greenSpeed: 'fast' | 'medium' | 'slow' | null;
}

/** The ball, where it is and how fast it is going. */
export interface BallState {
  x: number;
  y: number;
  z: number;
  speed: number;
  ready: boolean;
}

/** A body on the course. */
export interface Body {
  slot: number;
  kind: string;
  x: number;
  y: number;
  z: number;
  asleep: boolean;
}

/** Where things are, for setting a scene without importing the game's source. */
/** The hole being played, for setting a scene without importing the game's source. */
export interface Content {
  /** The box round the grass. */
  floor: { minX: number; minY: number; maxX: number; maxY: number };
  tee: { x: number; y: number };
  cup: { x: number; y: number; radius: number };
  /** The hardest shot, in units a second. */
  hardest: number;
  /** Every hole of the course: its name and par. */
  holes: { name: string; par: number }[];
  /** The middle of every tile of sand on this hole. */
  sand: { x: number; y: number }[];
  /** Where each post on this hole stands. */
  posts: { x: number; y: number }[];
  /** Where each kicker on this hole stands: a post that throws the ball harder. */
  kickers: { x: number; y: number }[];
  /** Where each stone at the water's edge stands, how wide it is and how high its top: a body the ball meets. */
  stones: { x: number; y: number; r: number; top: number }[];
  /** Where each tree of a golf hole stands: its trunk, with its canopy over it. */
  trees: { x: number; y: number }[];
  /** How many arrows stand over the hole's putting green to show which way it leans: none on a green that is level. */
  arrows: number;
}

export interface GameApi {
  readonly version: 1;
  /** Booted, and the frame loop running. */
  readonly ready: boolean;
  /** How long the boot took, from the page's start to ready, in milliseconds; 0 until it has. */
  readonly bootMs: number;

  pause(): void;
  resume(): void;
  /** Play `frames` frames of 1/60 s exactly, and draw the last. */
  step(frames?: number): void;
  /** Chance from a seed from now on, and the camera's tosses (which side of the flag it looks to) from the same seed, so a view is the same every run. */
  seed(n: number): void;

  state(): GameState;
  ball(): BallState;
  bodies(kind?: string): Body[];
  content(): Content;
  /** What has happened since this was last asked, a line each. */
  events(): string[];
  /** The rules that must always hold, broken; empty when all is well. */
  invariants(): string[];

  /** A body moved to a point, still, and woken. */
  place(slot: number, x: number, y: number, z?: number): void;
  /**
   * The ball put down at (x, y) as a player's ball lies there, at rest on the ground of any height, and never in the
   * rock, a post, a tree's trunk, the cup or out of bounds: the game's own `place`, which refuses what a ball cannot lie
   * on by throwing. `place` above is the raw one, for a flat hole.
   */
  lay(x: number, y: number): void;
  /**
   * The ball struck as a let-go drag strikes it: toward `angle`, at `power` of the club's hardest, and on a golf hole
   * with `club` of the bag put in hand first, if one is named, and with `shape` and `spin` chosen first, if they are
   * given (as a press on each button chooses them). Whether it was taken.
   */
  shoot(angle: number, power: number, club?: string, shape?: number, spin?: number): boolean;
  /** A club of the bag put in hand, as a press on its button does, on a golf hole; whether it was. */
  club(id: string): boolean;
  /** The clubs of the bag: each one's id, name, loft, hardest launch speed and how far it carries at full power. */
  bag(): { id: string; name: string; loft: number; hardest: number; carry: number }[];
  /** The shot the drag under way would make if let go now, or null for none. */
  aiming(): { angle: number; power: number } | null;
  /**
   * The hole's map over the course, on a golf hole: its size in pixels, where the ball, the cup and the landing of the shot
   * being aimed are on it (none when no shot is), as last drawn. Null for a hole that has no map.
   */
  map(): {
    width: number;
    height: number;
    ball: [number, number];
    cup: [number, number];
    aim: [number, number] | null;
  } | null;
  /** The shot the autopilot would take from where the ball lies, and on a golf hole with which club, or null when none can be taken. */
  suggest(): Plan | null;
  /** Hole `index` begun, from its tee, with the card as if the holes before it had not been played. */
  startHole(index: number): void;
  /** A round of holes of the test's own, not the course's: for a hole that is not on it. */
  playCourse(holes: HoleDef[]): void;
  /** A course chosen by its name, as a click on its card on the start screen chooses it. */
  chooseCourse(name: string): void;
  /** A new round, as the card's button asks for. */
  newRound(): void;
  /** An item bought, as the shop's button does; whether it was. */
  buy(id: string): boolean;
  /** An item owned put on, or none with the empty id; whether it was. */
  equip(id: string): boolean;
  /** The mulligan: the last stroke undone and the ball back where it was struck from; whether it did anything. */
  mulligan(): boolean;
  /** The save written now, and what it is. */
  save(): string;

  /**
   * How far back the camera stands, which rung of the quality ladder the
   * picture is on and whether it was asked for, how its edges are drawn, and
   * whether the grass bends in the wind.
   */
  view(): {
    /**
     * Where the ball and the furthest a shot can reach (null when the ball is not ready) are on the screen, from minus one to
     * one each way, the safe box they are held inside, whether the view has settled so that the rule is asked of it, and what is
     * wrong with it when it has: nothing, always.
     */
    framing: {
      ball: [number, number];
      reach: [number, number] | null;
      box: { x: number; top: number; bottom: number };
      settled: boolean;
      problems: string[];
    };
    distance: number;
    /** How far ahead of the ball it looks, and whether it is still easing to the view that shows a golf shot's landing. */
    lead: number;
    aiming: boolean;
    /** Whether it is turning to face the cup, which the flag button sends it to do. */
    turning: boolean;
    rung: number;
    held: boolean;
    antialias: Antialias;
    swaying: boolean;
    mode: 'aim' | 'overhead';
    /** How far the view is blended up to the overhead view: nought is the normal view, one the view from above. */
    blend: number;
    /** The renderer's far plane, which is raised while the view is from above and while a hole is flown in to. */
    farPlane: number;
    /** Whether the camera is flying in to the hole: low behind the tee looking to the horizon, easing to the play view. */
    flying: boolean;
    azimuth: number;
    /** The azimuth the camera is turning to: its own azimuth when it is turning to none. */
    heading: number;
    /** Where the flag button would turn the camera to from where the ball lies now (near the cup, never at it); null with the ball at the cup. */
    flag: number | null;
    /** Whether the camera is following the ball for the stroke being played: one stroke in five by the view seed, or from the moment a ball held still would leave the screen. */
    following: boolean;
    tilt: number;
    /** The words of the putt's break under the pin, as drawn (`Putt: aim 1.6 yd right, uphill 0.4 yd`); null when none is up. */
    putt: string | null;
    /** The words for how fast the greens run, as drawn (`Fast greens`); null on a hole that has not set it. */
    greens: string | null;
  };
  /** The camera turned by `turn` radians and tilted by `tilt` (a bigger tilt is a lower view), as a test's own setter: a player cannot turn the view by hand, it turns to the aim. */
  orbit(turn: number, tilt: number): void;
  /**
   * The overhead view switched on or off as the button does (the other way to now, when not told): whether it is on after.
   * Refused, and off, under the start screen.
   */
  overhead(on?: boolean): boolean;
  /**
   * The camera sent to face the cup from the ball, as the flag button does: false, and nothing done, under the start screen,
   * while a drag is held on the course, or with the ball at the cup.
   */
  faceFlag(): boolean;
  /**
   * Which strokes the camera follows the ball for: `drawn` (the default) is one in five by the view seed, the others held still and
   * taken up from the moment the ball would leave the screen; `always` every one, as the camera did before; `never` none but those.
   */
  followShots(mode: 'drawn' | 'always' | 'never'): void;
  /** The camera parked looking at a point, `distance` back, at once, and not following the ball until `follow`. */
  look(x: number, y: number, distance?: number): void;
  /** The camera following the ball again. */
  follow(): void;
  /** Where a point on the course is on the page, in CSS pixels: where to put a pointer to press on it. */
  project(x: number, y: number, z: number): { x: number; y: number };
  /** What drawing a frame of the scene as it stands costs, in milliseconds, after `warmup` frames drawn untimed. */
  measureFrame(warmup?: number): Promise<number>;
  /**
   * `frames` frames given to the quality governor as the frame loop gives them, each `gapMs` after the last and
   * costing `workMs` to draw and have the GPU finish; the rung it is on after. The picture is drawn again on the
   * next `step`, so what a rung takes away is seen then.
   */
  judge(frames: number, gapMs: number, workMs: number): number;
  /** The small motions the page draws at this moment, answering what has happened: each nought at rest. */
  motions(): Motions;
  /**
   * The grass the last frame drew, once the hole's is grown: how many blades
   * of the rough near and far, read back from the GPU, and the wind it bent in.
   */
  grass(): Promise<GrassDrawn>;
  /** How many blades of grass the last frame drew with their roots within `radius` of (x, y), on the ground plan: read back from the GPU. */
  bladesAround(x: number, y: number, radius: number): Promise<number>;
}

/**
 * The small motions the page draws at a moment, all from game time: each
 * nought at rest. The squash, the pulse and the glints are read back from
 * what the last frame drew.
 */
export interface Motions {
  /** How far the ball was drawn squashed along its last knock, a share of its size; under nought, stretched. */
  squash: number;
  /** How far the flag is swung either way of where the wind flies it as a ball drops, in radians. */
  waggle: number;
  /** How brightly all the cup's gold flashes as a ball drops, from 0 to 1. */
  flash: number;
  /** How many glints of the gold the last frame lit: all of them in a flash, one in a twinkle, or none. */
  glints: number;
  /** How far the camera has still to glide to a new hole's tee, in world units. */
  glide: number;
  /** How much bigger than its size the aim's nearest dot was drawn, as a share; nought with no drag held. */
  pulse: number;
  /** How many sparkles of sun on the water the last frame lit. */
  sparkles: number;
  /** Where on the page each of them was drawn, in CSS pixels, read back from what the frame placed. */
  sparklesAt: { x: number; y: number }[];
  /** How wide the ring is, in world units, where a ball went into the water: nought when there is none. */
  splash: number;
  /** What the last stroke threw up from under the ball, sand or grass, or null before any stroke. */
  puff: 'sand' | 'grass' | null;
  /** The ring marking where a lofted ball first came down: where, and how wide in world units; null when there is none to see. */
  landing: { x: number; y: number; radius: number } | null;
  /** The grass pressed flat round the ball this frame, where and how wide in world units, which it is while the ball lies at rest in the rough, and whether the renderer took it; null otherwise. */
  press: { x: number; y: number; radius: number; took: boolean } | null;
  /**
   * The preview of the shot being aimed, as the last frame placed it: how many dots of arc, where the ring is (and its
   * colour, which is another for water and out of bounds) and how big, the spread of a swing that is not true as the
   * half of its length along the shot and of its width across it, and where a tree knocks the ball; and what the flight
   * comes to, how far it carries and what ground it comes down on. Null when none is drawn.
   */
  shot: {
    arc: number;
    ring: { x: number; y: number; radius: number; colour: [number, number, number] } | null;
    spread: { x: number; y: number; across: number; along: number; heading: number } | null;
    knock: { x: number; y: number } | null;
    /** The ghost shot's continuation as drawn: how many dots, and the ring where the ball rests; null with none. */
    rest: { dots: number; ring: { x: number; y: number; radius: number } } | null;
    end: 'landed' | 'holed' | 'water' | 'out';
    carry: number;
    lie: number;
    /** Which way the ball went, as an angle from +x toward +y: the aim turned by the shape and the wind. */
    heading: number;
  } | null;
  /**
   * The wind line of a golf hole as drawn: how far its arrow is turned clockwise from pointing up, in degrees, as it was
   * last written (it follows the camera's turn, glide included), and the words beside it, `N mph` or `calm`. Null on a hole
   * of minigolf, where there is none.
   */
  wind: { degrees: number; text: string } | null;
  /**
   * The shape and spin buttons as drawn: whether they are up (a lofted club in hand on a golf hole), each one's value
   * (0 straight or flat, minus one a draw or backspin, one a fade or topspin) and the words on it.
   */
  controls: { shown: boolean; shape: number; spin: number; shapeText: string; spinText: string };
  /**
   * The arrows over the putting green as the last frame wrote them: whether they are shown (the ball at rest on the green
   * or the first cut) and how many are drawn; nought on a hole whose green is level.
   */
  arrows: { shown: boolean; count: number; reader?: number };
  /** How many kickers the last frame lit with a flash, as a ball hit them; absent while none is lit, so the rest reads as it did. */
  kicks?: number;
  /** The glow ball's trail: how many sprites the last frame drew; nought without the item, at rest and on the lowest rung. */
  trail: number;
  /** The particles the last holing threw up from the cup: nought before one, kept as it was at a new hole until the next holing, and more with the confetti cup. */
  confetti: number;
  /** How many strips the flag's cloth is drawn in on this hole: one, or six on a hole begun with the rainbow flag. */
  strips: number;
  /** The Retake button as drawn: whether it is up on the course, and whether it can be pressed. */
  retake: { shown: boolean; enabled: boolean };
}

/** The grass a frame drew, and the wind it bent in. */
export interface GrassDrawn {
  near: number;
  far: number;
  wind: { direction: [number, number]; strength: number };
}

/** What the page gives the API that is not the game's: time, the camera and the renderer. */
export interface DebugHost {
  game: Game;
  ready(): boolean;
  bootMs(): number;
  paused(): boolean;
  setPaused(paused: boolean): void;
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  draw(dt: number): void;
  frame(): number;
  /** The seed the camera's tosses are made from, as `seed` gives it. */
  setViewSeed(n: number): void;
  /** Which strokes the camera follows the ball for. */
  followShots(mode: 'drawn' | 'always' | 'never'): void;
  look(x: number, y: number, distance?: number): void;
  follow(): void;
  project(x: number, y: number, z: number): { x: number; y: number };
  aiming(): { angle: number; power: number } | null;
  /**
   * The hole's map over the course, on a golf hole: its size in pixels, where the ball, the cup and the landing of the shot
   * being aimed are on it (none when no shot is), as last drawn. Null for a hole that has no map.
   */
  map(): {
    width: number;
    height: number;
    ball: [number, number];
    cup: [number, number];
    aim: [number, number] | null;
  } | null;
  view(): ReturnType<GameApi['view']>;
  orbit(turn: number, tilt: number): void;
  overhead(on?: boolean): boolean;
  faceFlag(): boolean;
  measureFrame(warmup?: number): Promise<number>;
  judge(gap: number, work: number): number;
  motions(): Motions;
  grass(): Promise<GrassDrawn>;
  bladesAround(x: number, y: number, radius: number): Promise<number>;
  /** The course being played, and whether the start screen is up; and a course chosen, as the screen does it. */
  course(): string;
  choosing(): boolean;
  chooseCourse(name: string): void;
  events: string[];
}

export function createApi(host: DebugHost): GameApi {
  const { game } = host;
  // the world is the hole's, made again for each: read it through the game every time, never kept
  const { progress } = game;
  return {
    version: 1,
    get ready() {
      return host.ready();
    },
    get bootMs() {
      return host.bootMs();
    },
    pause: () => host.setPaused(true),
    resume: () => host.setPaused(false),
    step(frames = 1) {
      for (let f = 0; f < frames; f++) host.simulate(1 / 60);
      host.draw(1 / 60);
    },
    seed(n) {
      game.random = seeded(n);
      host.setViewSeed(n);
    },

    state() {
      return {
        t: game.t,
        frame: host.frame(),
        paused: host.paused(),
        live: game.world.live,
        strokes: game.strokes,
        ready: game.ready,
        hole: game.hole,
        par: game.def.par,
        phase: game.phase,
        card: [...game.card],
        coins: game.progress.save.coins,
        gems: game.progress.save.gems,
        item: game.progress.save.item,
        owned: [...game.progress.save.owned],
        wadersUsed: game.wadersUsed,
        mulliganUsed: game.mulliganUsed,
        hardest: game.hardest,
        course: host.course(),
        choosing: host.choosing(),
        golf: game.layout.golf,
        inHand: game.inHand.id,
        shape: game.shape,
        spin: game.spin,
        wind: game.wind,
        greens: game.def.greens ?? null,
        greenSpeed: game.def.greens === undefined ? null : speedName(game.def.greens),
      };
    },
    ball() {
      const i = game.ball;
      return {
        x: game.world.x[i],
        y: game.world.y[i],
        z: game.world.z[i],
        speed: Math.hypot(game.world.vx[i], game.world.vy[i], game.world.vz[i]),
        ready: game.ready,
      };
    },
    bodies(kind) {
      const out: Body[] = [];
      for (let i = 0; i < game.world.count; i++) {
        if (!game.world.alive[i]) continue;
        const name = KIND_NAME[game.world.kind[i]];
        if (kind !== undefined && name !== kind) continue;
        out.push({
          slot: i,
          kind: name,
          x: game.world.x[i],
          y: game.world.y[i],
          z: game.world.z[i],
          asleep: !!game.world.asleep[i],
        });
      }
      return out;
    },
    content: () => ({
      floor: { ...game.layout.bounds },
      tee: { ...game.layout.tee },
      cup: { ...game.layout.cup, radius: game.cup.radius },
      hardest: game.hardest,
      holes: game.course.map((h) => ({ name: h.name, par: h.par })),
      sand: sandTiles(game.layout),
      posts: game.layout.bumpers.map((p) => ({ ...p })),
      kickers: game.layout.kickers.map((p) => ({ ...p })),
      stones: game.layout.stones.map((st) => ({ ...st })),
      trees: game.layout.trees.map((t) => ({ ...t })),
      arrows: greenArrows(game.layout).length,
    }),
    events() {
      return host.events.splice(0);
    },
    invariants: () => checkInvariants(game),

    place(slot, x, y, z) {
      if (!game.world.alive[slot]) return;
      game.world.x[slot] = x;
      game.world.y[slot] = y;
      if (z !== undefined) game.world.z[slot] = z;
      game.world.vx[slot] = game.world.vy[slot] = game.world.vz[slot] = 0;
      game.world.wake(slot);
    },
    lay: (x, y) => game.place(x, y),
    shoot(angle, power, club, shape, spin) {
      if (club !== undefined && !game.pick(club)) return false;
      if (shape !== undefined) game.setShape(shape);
      if (spin !== undefined) game.setSpin(spin);
      return game.shoot(angle, power);
    },
    club: (id) => game.pick(id),
    bag: () =>
      BAG.map((c) => {
        const held = game.club(c);
        return { id: c.id, name: c.name, loft: c.loft, hardest: held.hardest, carry: carryOf(held, 1) };
      }),
    suggest: () => (game.ready ? new Autopilot(game).plan() : null),
    startHole: (index) => game.startAt(index),
    playCourse: (holes) => game.playCourse(holes),
    chooseCourse: (name) => host.chooseCourse(name),
    newRound: () => game.newRound(),
    buy: (id) => game.buy(id),
    equip: (id) => game.equip(id),
    mulligan: () => game.mulligan(),
    aiming: () => host.aiming(),
    map: () => host.map(),
    view: () => host.view(),
    orbit: (turn, tilt) => host.orbit(turn, tilt),
    overhead: (on) => host.overhead(on),
    faceFlag: () => host.faceFlag(),
    followShots: (mode) => host.followShots(mode),
    save() {
      game.persist();
      return JSON.stringify(progress.save);
    },

    look: (x, y, distance) => host.look(x, y, distance),
    follow: () => host.follow(),
    project: (x, y, z) => host.project(x, y, z),
    measureFrame: (warmup) => host.measureFrame(warmup),
    judge(frames, gapMs, workMs) {
      let rung = host.view().rung;
      for (let f = 0; f < frames; f++) rung = host.judge(gapMs, workMs);
      return rung;
    },
    motions: () => host.motions(),
    grass: () => host.grass(),
    bladesAround: (x, y, radius) => host.bladesAround(x, y, radius),
  };
}

/** The middle of every tile of sand on a hole. */
function sandTiles(l: Layout): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let t = 0; t < l.cols * l.rows; t++)
    if (l.sand[t])
      out.push({ x: l.originX + ((t % l.cols) + 0.5) * TILE, y: l.originY + (Math.floor(t / l.cols) + 0.5) * TILE });
  return out;
}

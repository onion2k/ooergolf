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
import { KIND_NAME } from './arena';
import { Autopilot } from './autopilot';
import { CUP } from './course';
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
  /** The club in hand, and those owned. */
  club: string;
  owned: string[];
  /** The hardest the club in hand strikes. */
  hardest: number;
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
  /** Chance from a seed from now on. */
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
  /** The ball struck as a let-go drag strikes it: toward `angle`, at `power` of the hardest shot. Whether it was taken. */
  shoot(angle: number, power: number): boolean;
  /** The shot the drag under way would make if let go now, or null for none. */
  aiming(): { angle: number; power: number } | null;
  /** The shot the autopilot would take from where the ball lies, or null when none can be taken. */
  suggest(): { angle: number; power: number } | null;
  /** Hole `index` begun, from its tee, with the card as if the holes before it had not been played. */
  startHole(index: number): void;
  /** A new round, as the card's button asks for. */
  newRound(): void;
  /** A club bought, as the shop's button does; whether it was. */
  buy(id: string): boolean;
  /** A club owned put in hand; whether it was. */
  equip(id: string): boolean;
  /** The save written now, and what it is. */
  save(): string;

  /** How far back the camera stands, and which rung of the quality ladder the picture is on, and whether it was asked for. */
  view(): { distance: number; rung: number; held: boolean };
  /** The camera parked looking at a point, `distance` back, at once, and not following the ball until `follow`. */
  look(x: number, y: number, distance?: number): void;
  /** The camera following the ball again. */
  follow(): void;
  /** Where a point on the course is on the page, in CSS pixels: where to put a pointer to press on it. */
  project(x: number, y: number, z: number): { x: number; y: number };
  /** What drawing a frame of the scene as it stands costs, in milliseconds, after `warmup` frames drawn untimed. */
  measureFrame(warmup?: number): Promise<number>;
  /**
   * The grass the last frame drew, once the hole's is grown: how many blades
   * near and far, read back from the GPU; the wind it bent in; and how many
   * times on this hole the ball has pressed it, and how many of those the
   * renderer took, which is all of them while the ball is on the course.
   */
  grass(): Promise<GrassDrawn>;
}

/** The grass a frame drew, and the wind it bent in. */
export interface GrassDrawn {
  near: number;
  far: number;
  wind: { direction: [number, number]; strength: number };
  presses: { asked: number; taken: number };
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
  look(x: number, y: number, distance?: number): void;
  follow(): void;
  project(x: number, y: number, z: number): { x: number; y: number };
  aiming(): { angle: number; power: number } | null;
  view(): { distance: number; rung: number; held: boolean };
  measureFrame(warmup?: number): Promise<number>;
  grass(): Promise<GrassDrawn>;
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
        club: game.progress.save.club,
        owned: [...game.progress.save.owned],
        hardest: game.hardest,
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
      cup: { ...game.layout.cup, radius: CUP.radius },
      hardest: game.hardest,
      holes: game.course.map((h) => ({ name: h.name, par: h.par })),
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
    shoot: (angle, power) => game.shoot(angle, power),
    suggest: () => (game.ready ? new Autopilot(game).plan() : null),
    startHole: (index) => game.startAt(index),
    newRound: () => game.newRound(),
    buy: (id) => game.buy(id),
    equip: (id) => game.equip(id),
    aiming: () => host.aiming(),
    view: () => host.view(),
    save() {
      game.persist();
      return JSON.stringify(progress.save);
    },

    look: (x, y, distance) => host.look(x, y, distance),
    follow: () => host.follow(),
    project: (x, y, z) => host.project(x, y, z),
    measureFrame: (warmup) => host.measureFrame(warmup),
    grass: () => host.grass(),
  };
}

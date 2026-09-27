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
import { FLOOR, HARDEST_SHOT, KIND_NAME, TEE } from './arena';
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
export interface Content {
  floor: { minX: number; minY: number; maxX: number; maxY: number };
  tee: { x: number; y: number };
  /** The hardest shot, in units a second. */
  hardest: number;
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
  /** The save written now, and what it is. */
  save(): string;

  /** The camera parked looking at a point, `distance` back, at once, and not following the ball until `follow`. */
  look(x: number, y: number, distance?: number): void;
  /** The camera following the ball again. */
  follow(): void;
  /** Where a point on the course is on the page, in CSS pixels: where to put a pointer to press on it. */
  project(x: number, y: number, z: number): { x: number; y: number };
  /** What drawing a frame of the scene as it stands costs, in milliseconds. */
  measureFrame(): Promise<number>;
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
  measureFrame(): Promise<number>;
  events: string[];
}

export function createApi(host: DebugHost): GameApi {
  const { game } = host;
  const { world, progress } = game;
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
        live: world.live,
        strokes: game.strokes,
        ready: game.ready,
      };
    },
    ball() {
      const i = game.ball;
      return {
        x: world.x[i],
        y: world.y[i],
        z: world.z[i],
        speed: Math.hypot(world.vx[i], world.vy[i], world.vz[i]),
        ready: game.ready,
      };
    },
    bodies(kind) {
      const out: Body[] = [];
      for (let i = 0; i < world.count; i++) {
        if (!world.alive[i]) continue;
        const name = KIND_NAME[world.kind[i]];
        if (kind !== undefined && name !== kind) continue;
        out.push({ slot: i, kind: name, x: world.x[i], y: world.y[i], z: world.z[i], asleep: !!world.asleep[i] });
      }
      return out;
    },
    content: () => ({ floor: { ...FLOOR }, tee: { ...TEE }, hardest: HARDEST_SHOT }),
    events() {
      return host.events.splice(0);
    },
    invariants: () => checkInvariants(game),

    place(slot, x, y, z) {
      if (!world.alive[slot]) return;
      world.x[slot] = x;
      world.y[slot] = y;
      if (z !== undefined) world.z[slot] = z;
      world.vx[slot] = world.vy[slot] = world.vz[slot] = 0;
      world.wake(slot);
    },
    shoot: (angle, power) => game.shoot(angle, power),
    aiming: () => host.aiming(),
    save() {
      game.persist();
      return JSON.stringify(progress.save);
    },

    look: (x, y, distance) => host.look(x, y, distance),
    follow: () => host.follow(),
    project: (x, y, z) => host.project(x, y, z),
    measureFrame: () => host.measureFrame(),
  };
}

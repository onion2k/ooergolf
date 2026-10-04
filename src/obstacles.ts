/**
 * The things on a hole that move: a barrier sliding to and fro across the
 * way up it, a windmill whose blades sweep across its door, and a conveyor
 * that carries the ball along. Content says where each is and how it moves;
 * this says where each is at any moment of game time, as the boxes and
 * belts the physics shoves the ball with.
 *
 * Where a thing is comes from the time alone, never from where it was, so
 * the same seed and the same strokes give the same round, and a test can ask
 * where the barrier is at any moment without playing up to it. How fast it
 * goes is the same sum a frame earlier, taken away: the physics needs it, to
 * shove a ball with it rather than through it.
 *
 * The physics' boxes turn about the vertical only. A windmill's blades turn
 * in an upright plane, so what the physics is given is the gate they make:
 * the slice of whichever blade is down through the door, at the height of the
 * ball, and nothing when none is.
 */
import { BALL, BOUNCE, BUMPER, KIND_RADIUS, PHYSICS, TILE, slopeAt, tileAt, type Layout } from './arena';
import type { Pusher, Belt } from './physics';

/** A tile of a hole's map, as the map is drawn: its column, and its row from the top. */
export type MapTile = readonly [number, number];

export type ObstacleDef =
  | {
      kind: 'barrier';
      /** The tile it slides through the middle of. */
      at: MapTile;
      /** How long it is, in tiles, across the hole. */
      length: number;
      /** How far it goes either way of its middle, in units. */
      travel: number;
      /** How long it takes to go and come back, in seconds, and how far through that it starts, from 0 to 1. */
      period: number;
      phase?: number;
      /** How much of its speed a ball keeps off it: a post's `BUMPER.restitution` makes it a moving bumper. Plastic's `BOUNCE.box` without it. */
      bounce?: number;
    }
  | {
      kind: 'windmill';
      /** The tile of the door the ball goes through, in a row of rail. */
      at: MapTile;
      /** How long a blade takes to go round, in seconds, and how far round it starts, from 0 to 1. */
      period: number;
      phase?: number;
    }
  | {
      kind: 'conveyor';
      /** The first tile of the belt and the last: it carries from the one toward the other. */
      from: MapTile;
      to: MapTile;
      /** How fast it carries, in units a second. */
      speed: number;
      /**
       * How it is drawn: `water` is a stream, running water in a channel level with the grass. Only the picture and
       * the map change: to the physics and the game it is a belt, which carries a ball and never loses one.
       */
      look?: 'water';
    }
  | {
      kind: 'flipper';
      /** The tile of the end it turns on. */
      at: MapTile;
      /** How long the arm is, in tiles, from that end. */
      length: number;
      /** How far it swings up from lying at rest, in radians. */
      swing: number;
      /** How long it takes to go and come back, in seconds, which is the first half of it: it lies at rest for the rest. */
      period: number;
      /** How far through the period it starts, from 0 to 1. */
      phase?: number;
      /** Which end is fixed, as seen from the tee: the arm lies at rest along the way across, away from it, and rises up the hole. */
      pivot: 'left' | 'right';
    };

/** A barrier's size other than its length: how deep along the hole, and how tall, as halves. */
export const BARRIER = { hy: 0.6, hz: 0.8 } as const;

/**
 * A windmill's figures, the same the model is drawn to: its door the width
 * of a tile, its blades' length, width and thickness, and where they turn,
 * from the middle of the door: in front of the tower, toward the tee, and
 * high enough that a blade pointing down just clears the grass.
 */
export const WINDMILL = {
  gap: TILE,
  bladeLength: 5.5,
  bladeWidth: 1.4,
  bladeThickness: 0.6,
  hub: [0, -2.65, 5.85] as const,
} as const;

/** The height of the top of the ball: a blade below it is in the ball's way. */
const BALL_TOP = KIND_RADIUS[BALL] * 2;
/** Where a gate with no blade in the door is put: far above, out of everything's way. */
const PARKED = 100;

/** Where a barrier is along its travel at time `t`, from its middle. */
function slide(def: Extract<ObstacleDef, { kind: 'barrier' }>, t: number): number {
  return def.travel * Math.sin(Math.PI * 2 * (t / def.period + (def.phase ?? 0)));
}

/** How far a windmill's blades have turned at time `t`: nought with a blade straight down. */
function turnAt(def: Extract<ObstacleDef, { kind: 'windmill' }>, t: number): number {
  return Math.PI * 2 * (t / def.period + (def.phase ?? 0));
}

/**
 * The gate a windmill's blades make in its door at a turn: the box, across
 * the door, that the blade most down fills at the height of the ball, as
 * its middle along X from the door's, its half width, and its bottom and
 * top; or null when no blade is in the door.
 */
function gate(turn: number): { x: number; hx: number; z0: number; z1: number } | null {
  const { bladeLength: L, bladeWidth: w, hub, gap } = WINDMILL;
  let best: { x: number; hx: number; z0: number; z1: number } | null = null;
  for (let k = 0; k < 4; k++) {
    const phi = turn + (k * Math.PI) / 2;
    const down = Math.cos(phi),
      out = Math.sin(phi);
    if (down <= 0) continue;
    // how far out along the blade it comes down to the top of the ball: beyond its tip, it never does
    const s1 = (hub[2] - BALL_TOP) / down;
    if (s1 >= L) continue;
    const across = (w / 2) * down;
    let x0 = hub[0] + Math.min(s1 * out, L * out) - across,
      x1 = hub[0] + Math.max(s1 * out, L * out) + across;
    // only what is in the door: either side of it is the tower
    x0 = Math.max(x0, -gap / 2);
    x1 = Math.min(x1, gap / 2);
    if (x1 <= x0) continue;
    const z0 = Math.max(0, hub[2] - L * down - (w / 2) * Math.abs(out));
    if (z0 >= BALL_TOP) continue;
    if (!best || z0 < best.z0) best = { x: (x0 + x1) / 2, hx: (x1 - x0) / 2, z0, z1: BALL_TOP };
  }
  return best;
}

export class Obstacles {
  /** The boxes the physics shoves with: a barrier's own, and each windmill's gate. */
  readonly pushers: Pusher[] = [];
  readonly belts: Belt[] = [];
  /**
   * Where each barrier's middle is, for drawing, and the box the physics has of it. Each thing keeps its own box, since
   * the boxes are listed in the order the things were given, whatever their kinds: a barrier's was once taken to be the
   * box of its own number, and a windmill listed before it moved the wrong one.
   */
  readonly barriers: {
    x: number;
    y: number;
    hx: number;
    pusher: Pusher;
    def: Extract<ObstacleDef, { kind: 'barrier' }>;
  }[] = [];
  /** Where each windmill's door is, how far its blades have turned, for drawing, and the gate the physics has of it. */
  readonly windmills: {
    x: number;
    y: number;
    turn: number;
    pusher: Pusher;
    def: Extract<ObstacleDef, { kind: 'windmill' }>;
  }[] = [];
  /** Where each conveyor lies, which way it carries, how long it is, and how far it has carried, for drawing. */
  readonly conveyors: {
    x: number;
    y: number;
    angle: number;
    length: number;
    travel: number;
    speed: number;
    look?: 'water';
  }[] = [];
  /** The tiles a belt lies on: not grass, so nothing grows there, and nothing slows a ball the belt carries. */
  readonly belted = new Set<number>();
  /** Where each flipper turns, how long its arm is, and the box the physics has of it, for drawing. */
  readonly flippers: {
    x: number;
    y: number;
    length: number;
    yaw: number;
    pusher: Pusher;
    def: Extract<ObstacleDef, { kind: 'flipper' }>;
  }[] = [];
  /** The game time everything was last put where it is for, so that a rule can ask where a flipper ought to be. */
  time = 0;
  /** The tiles a stream lies on, which are belted too: the hole map paints them as water. */
  readonly streamed = new Set<number>();

  constructor(defs: readonly ObstacleDef[], layout: Layout) {
    const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
    const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;
    const box = (): Pusher => ({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      hx: 0,
      hy: 0,
      hz: 0,
      vx: 0,
      vy: 0,
      spin: 0,
      px: 0,
      py: 0,
      owner: 0,
      // plastic: a ball bounces off a barrier or a blade, and is not carried along its face
      restitution: BOUNCE.box,
    });
    for (const def of defs) {
      if (def.kind === 'barrier') {
        const x = tileX(def.at[0]),
          y = tileY(def.at[1]);
        const pusher = { ...box(), x, y, z: BARRIER.hz, hx: (def.length * TILE) / 2, hy: BARRIER.hy, hz: BARRIER.hz };
        if (def.bounce !== undefined) {
          if (!Number.isFinite(def.bounce) || def.bounce < 0 || def.bounce > BUMPER.restitution * 2)
            throw new Error(
              `a barrier at column ${def.at[0]}, row ${def.at[1]} has a bounce of ${def.bounce}: it must be from nought to ${BUMPER.restitution * 2}`,
            );
          pusher.restitution = def.bounce;
        }
        this.pushers.push(pusher);
        this.barriers.push({ x, y, hx: pusher.hx, pusher, def });
      } else if (def.kind === 'windmill') {
        const x = tileX(def.at[0]),
          y = tileY(def.at[1]);
        const pusher = { ...box(), x, y: y + WINDMILL.hub[1], hy: WINDMILL.bladeThickness / 2, z: PARKED };
        this.pushers.push(pusher);
        this.windmills.push({ x, y, turn: 0, pusher, def });
      } else if (def.kind === 'flipper') {
        // made after the rest, below
        continue;
      } else {
        const x0 = tileX(def.from[0]),
          y0 = tileY(def.from[1]),
          x1 = tileX(def.to[0]),
          y1 = tileY(def.to[1]);
        const d = Math.hypot(x1 - x0, y1 - y0) || 1;
        const length = d + TILE;
        this.belts.push({
          cx: (x0 + x1) / 2,
          cy: (y0 + y1) / 2,
          half: length / 2,
          // the whole of the tile across: the physics takes this as the belt's full width
          width: TILE,
          dx: (x1 - x0) / d,
          dy: (y1 - y0) / d,
          speed: def.speed,
        });
        this.conveyors.push({
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          angle: Math.atan2(y1 - y0, x1 - x0),
          length,
          travel: 0,
          speed: def.speed,
          ...(def.look ? { look: def.look } : {}),
        });
        for (let k = 0; k * TILE < length; k++) {
          const t = tileAt(layout, x0 + ((x1 - x0) / d) * k * TILE, y0 + ((y1 - y0) / d) * k * TILE);
          this.belted.add(t);
          if (def.look === 'water') this.streamed.add(t);
        }
      }
    }
    // the flippers' boxes come last among the pushers, whatever order they were given in, so the barriers' and the windmills'
    // places in the list are what they were without them
    for (const def of defs) {
      if (def.kind !== 'flipper') continue;
      const x = tileX(def.at[0]),
        y = tileY(def.at[1]);
      const what = `a flipper at column ${def.at[0]}, row ${def.at[1]}`;
      if (!(def.length > 0)) throw new Error(`${what} has a length of ${def.length}: it must be more than nought`);
      if (!(def.period > 0)) throw new Error(`${what} has a period of ${def.period}: it must be more than nought`);
      if (!(def.swing > 0 && def.swing < Math.PI))
        throw new Error(`${what} has a swing of ${def.swing}: it must be more than nought and less than half a turn`);
      const hx = (def.length * TILE) / 2;
      // a box must move less in a step than its half thickness and the ball's radius, or the ball could be passed by it
      const fastest = ((def.swing * Math.PI * 2) / def.period) * def.length * TILE * PHYSICS.step;
      if (fastest >= FLIPPER.hy + KIND_RADIUS[BALL])
        throw new Error(
          `${what} swings too fast: its end moves ${fastest.toFixed(2)} a step, and a ball would be passed by it`,
        );
      const pusher = { ...box(), x, y, z: FLIPPER.hz, hx, hy: FLIPPER.hy, hz: FLIPPER.hz, px: x, py: y };
      this.pushers.push(pusher);
      this.flippers.push({ x, y, length: hx * 2, yaw: 0, pusher, def });
      sweepIsLevel(
        layout,
        x,
        y,
        def.length * TILE + FLIPPER.hy + KIND_RADIUS[BALL],
        def.pivot === 'left' ? 1 : -1,
        what,
      );
    }
    // what moves stands on level ground: on a slope a ball is rolled back against a box for good, as the physics'
    // fuzzer found under a windmill's sweep
    const r = KIND_RADIUS[BALL];
    for (const b of this.barriers)
      level(
        layout,
        b.x,
        b.y,
        b.hx + b.def.travel + r,
        BARRIER.hy + r,
        `a barrier at column ${b.def.at[0]}, row ${b.def.at[1]}`,
      );
    for (const w of this.windmills)
      level(layout, w.x, w.y, WINDMILL.gap / 2 + TILE, TILE, `a windmill at column ${w.def.at[0]}, row ${w.def.at[1]}`);
  }

  /** Everything where it is at game time `t`, and going as fast as it went over the `dt` before it. */
  update(t: number, dt: number) {
    for (const b of this.barriers) {
      const { pusher } = b;
      const now = slide(b.def, t);
      pusher.x = b.x + now;
      pusher.px = pusher.x;
      pusher.vx = dt > 0 ? (now - slide(b.def, t - dt)) / dt : 0;
    }
    for (const w of this.windmills) {
      const { pusher } = w;
      w.turn = turnAt(w.def, t);
      const g = gate(w.turn);
      if (!g) {
        pusher.z = PARKED;
        pusher.hx = pusher.hz = 0.5;
        pusher.x = pusher.px = w.x;
        pusher.vx = 0;
        continue;
      }
      pusher.x = pusher.px = w.x + g.x;
      pusher.hx = g.hx;
      pusher.z = (g.z0 + g.z1) / 2;
      pusher.hz = (g.z1 - g.z0) / 2;
      const was = dt > 0 ? gate(turnAt(w.def, t - dt)) : null;
      pusher.vx = was ? (g.x - was.x) / dt : 0;
    }
    for (const c of this.conveyors) c.travel = c.speed * t;
    // each flipper turned to where it is at `t` about its root, which stands still, and turning as fast as it did over the `dt` before
    for (const f of this.flippers) {
      const yaw = flipperYaw(f.def, t);
      const { pusher } = f;
      pusher.yaw = f.yaw = yaw;
      pusher.x = f.x + Math.cos(yaw) * pusher.hx;
      pusher.y = f.y + Math.sin(yaw) * pusher.hx;
      pusher.vx = pusher.vy = 0;
      pusher.spin = dt > 0 ? (yaw - flipperYaw(f.def, t - dt)) / dt : 0;
    }
    this.time = t;
  }
}

/** Refused, naming `what`, if the ground slopes anywhere within `hx` across and `hy` along of (x, y). */
function level(l: Layout, x: number, y: number, hx: number, hy: number, what: string) {
  for (let dx = -hx; dx <= hx + 1e-9; dx += 0.5)
    for (let dy = -hy; dy <= hy + 1e-9; dy += 0.5) {
      const [sx, sy] = slopeAt(l, x + dx, y + dy);
      if (Math.abs(sx) + Math.abs(sy) > 1e-9) throw new Error(`${what} stands on ground that slopes: it must be level`);
    }
}

/** A flipper's size other than its length: how deep along the arm's width, and how tall, as halves. */
export const FLIPPER = { hy: 0.6, hz: 0.8 } as const;

/**
 * How far a flipper is up from lying at rest at time `t`, in radians: the sine of its time, as a barrier's slide is, for the
 * half of its period it is going up and coming back, and none for the other half, so it lies at rest long enough to be
 * rolled under. From the time alone, never from where it was.
 */
export function flipperAngle(def: Extract<ObstacleDef, { kind: 'flipper' }>, t: number): number {
  return def.swing * Math.max(0, Math.sin(Math.PI * 2 * (t / def.period + (def.phase ?? 0))));
}

/** The way the arm points from its root at time `t`, as the physics' box is turned: toward the right at rest from a left root, and the left from a right one, rising up the hole. */
export function flipperYaw(def: Extract<ObstacleDef, { kind: 'flipper' }>, t: number): number {
  const up = flipperAngle(def, t);
  return def.pivot === 'left' ? up : Math.PI - up;
}

/**
 * Refused, naming `what`, if the ground slopes anywhere an arm sweeps: the ground within `reach` of its root on its side of
 * it (`side` 1 to the right, -1 to the left) and up the hole, which is every place it can be, and a ball's width the other way.
 */
function sweepIsLevel(l: Layout, x: number, y: number, reach: number, side: number, what: string) {
  const back = FLIPPER.hy + KIND_RADIUS[BALL];
  for (let dx = -back; dx <= reach + 1e-9; dx += 0.5)
    for (let dy = -reach; dy <= reach + 1e-9; dy += 0.5) {
      if (dx * dx + dy * dy > (reach + 0.5) ** 2 || (dy < -back && dx > 0)) continue;
      const [sx, sy] = slopeAt(l, x + side * dx, y + dy);
      if (Math.abs(sx) + Math.abs(sy) > 1e-9) throw new Error(`${what} stands on ground that slopes: it must be level`);
    }
}

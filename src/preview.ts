/**
 * The preview of a golf shot: the flight a drag would make if the swing were true, worked out before the shot is taken
 * so the player sees where it would come down. It is a trial in a rehearsal, the game's own physics with chance held
 * in the middle, and so it is exact where a formula is not (the arithmetic carry is four in a hundred short, and worse
 * on a slope): the ring it says is the very place the game puts the ball, a tree in the way included.
 *
 * It is handed a game to rehearse and changes nothing of it. What it gives back is written into buffers made once, so
 * a preview worked out on every frame of a drag makes nothing, and the page turns it into an arc and a ring and never
 * works a flight out itself.
 */
import { lieAt, slopeAt, type Layout } from './arena';
import type { BagClub } from './bag';
import { DISPERSION, maxScatter } from './flight';
import type { Game, GameEvents } from './game';
import type { Lie } from './surfaces';

/** The frame a trial is stepped by, and the longest a flight is followed, in frames: far more than any flight takes. */
const FRAME = 1 / 60;
const FRAMES = 720;

/**
 * What the flight came to: the ball came down, dropped in the cup, went into the water, or came down out of bounds (where
 * the game loses it the step it is on the ground, before it would be told of as a landing).
 */
export type Ending = 'landed' | 'holed' | 'water' | 'out';

/** A flight, from the ball to where it first comes down. */
export class Preview {
  /** How many points of `points` are the flight: none for a shot that is not lofted. */
  n = 0;
  /** The flight as x, y, z for each of its points, one a frame, and how far along it each lies, in yards. */
  readonly points = new Float32Array((FRAMES + 2) * 3);
  readonly length = new Float32Array(FRAMES + 2);
  end: Ending = 'landed';
  /** Where it came down, went in or dropped: the ring's middle, and how high the ball was there. */
  x = 0;
  y = 0;
  z = 0;
  /** What the ground is there, by `LIE`, and how it slopes. */
  lie: Lie = 0;
  readonly slope = { x: 0, y: 0 };
  /** How far along the ground from the ball to there, in yards. */
  carry = 0;
  /**
   * Which way the ball went, from the ball to where it came down, as an angle from +x toward +y: the aim for a straight
   * shot in no wind, and the aim turned by a shape and the wind otherwise. What the spread is laid along.
   */
  heading = 0;
  /**
   * The spread of a swing that is not true, in yards, as an ellipse along the line of the shot: the half of its width
   * across it, and the half of its length along it. Its far end is the ring (a swing never adds speed, so nothing goes
   * past the true landing) and its near end the landing of the worst mishit of speed.
   */
  readonly footprint = { across: 0, along: 0 };
  /** Where a tree or the rail knocked it in the air, if it did. */
  private readonly knock = { x: 0, y: 0, z: 0 };
  private knocked = false;

  get hit(): { x: number; y: number; z: number } | null {
    return this.knocked ? this.knock : null;
  }

  /** The point `s` yards along the flight, written into `out` as x, y, z: the start before it, the end after it. */
  along(s: number, out: number[] | Float32Array): void {
    const last = this.n - 1;
    if (last < 0) return;
    const k = Math.max(0, Math.min(last, Preview.after(this.length, this.n, s)));
    const a = Math.max(0, k - 1);
    const span = this.length[k] - this.length[a];
    const u = span > 0 ? Math.max(0, Math.min(1, (s - this.length[a]) / span)) : 1;
    for (let c = 0; c < 3; c++) out[c] = this.points[a * 3 + c] + (this.points[k * 3 + c] - this.points[a * 3 + c]) * u;
  }

  /** The first of the `n` lengths that is at least `s`, the last if none is. */
  private static after(length: Float32Array, n: number, s: number): number {
    let lo = 0,
      hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (length[mid] >= s) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Emptied for the next shot. */
  clear() {
    this.n = 0;
    this.knocked = false;
    this.end = 'landed';
    this.carry = 0;
    this.heading = 0;
    this.footprint.across = this.footprint.along = 0;
  }

  /** Where it was knocked, at (x, y, z): the first time only. */
  knockedAt(x: number, y: number, z: number) {
    if (this.knocked) return;
    this.knocked = true;
    this.knock.x = x;
    this.knock.y = y;
    this.knock.z = z;
  }
}

/** Makes previews of the hole a game is playing, in a rehearsal of its own that it keeps: one a hole, let go with it. */
export class Previewer {
  /** The preview of the last shot tried: the same one every time, written over. */
  readonly result = new Preview();
  private readonly rehearsal: Game;
  /** What the rehearsal told of the shot in hand. */
  private readonly told = { landed: false, splash: false, out: false, x: 0, y: 0, z: 0 };

  /** How many bodies its rehearsal has in its world: the one ball, and never more, however many shots are tried. */
  get bodies(): number {
    return this.rehearsal.world.live;
  }

  /** `game` is the game played, of which a rehearsal is made and kept: it is never changed. */
  constructor(game: Game) {
    const events: GameEvents = {
      landed: (x, y, _speed, first) => {
        if (!first || this.told.landed) return;
        this.told.landed = true;
        this.told.x = x;
        this.told.y = y;
        this.told.z = this.rehearsal.world.z[this.rehearsal.ball];
      },
      splash: (x, y) => {
        this.told.splash = true;
        this.told.x = x;
        this.told.y = y;
        this.told.z = this.rehearsal.world.z[this.rehearsal.ball];
      },
      outOfBounds: (x, y) => {
        this.told.out = true;
        this.told.x = x;
        this.told.y = y;
        this.told.z = this.rehearsal.world.z[this.rehearsal.ball];
      },
      knocked: (_hard, x, y) => {
        // only what happens in the air is the flight's: nothing is knocked on the ground before the first landing
        if (!this.told.landed) this.result.knockedAt(x, y, this.rehearsal.world.z[this.rehearsal.ball]);
      },
    };
    this.rehearsal = game.rehearsal(events);
  }

  /**
   * The flight of `club`, struck true from where a ball lies at `from`, toward `angle`, at `power`: written into
   * `result`, which is returned. Nothing for a club that has no loft (a putt goes along the ground and is aimed as it
   * always was) or a shot with no power.
   */
  run(from: { x: number; y: number }, club: BagClub, angle: number, power: number, shape = 0, spin = 0): Preview {
    const p = this.result;
    const g = this.rehearsal;
    const told = this.told;
    p.clear();
    told.landed = told.splash = told.out = false;
    if (!(club.loft > 0) || !(power > 0)) return p;
    g.trial(from.x, from.y);
    g.pick(club.id);
    g.setShape(shape);
    g.setSpin(spin);
    if (!g.shoot(angle, power)) return p;
    const { layout, world, ball } = g;
    const push = (x: number, y: number, z: number) => {
      const k = p.n++;
      p.points[k * 3] = x;
      p.points[k * 3 + 1] = y;
      p.points[k * 3 + 2] = z;
      p.length[k] = k
        ? p.length[k - 1] + Math.hypot(x - p.points[k * 3 - 3], y - p.points[k * 3 - 2], z - p.points[k * 3 - 1])
        : 0;
    };
    // whether the rehearsal has told of the flight's end: read here, since the events that set it are told from inside its steps
    const over = () => told.landed || told.splash || told.out;
    push(world.x[ball], world.y[ball], world.z[ball]);
    for (let f = 0; f < FRAMES; f++) {
      g.step(FRAME);
      if (over() || g.phase !== 'play' || g.ready) break;
      push(world.x[ball], world.y[ball], world.z[ball]);
    }
    this.finish(layout, from, club, angle, power);
    return p;
  }

  /** What the flight came to, and the ring's ground, from what the rehearsal told. */
  private finish(layout: Layout, from: { x: number; y: number }, club: BagClub, angle: number, power: number) {
    const p = this.result;
    const { world, ball, phase } = this.rehearsal;
    const told = this.told;
    if (phase !== 'play') {
      // dropped into the cup: the flight ends there
      p.end = 'holed';
      p.x = layout.cup.x;
      p.y = layout.cup.y;
      p.z = world.z[ball];
    } else if (told.splash || told.out) {
      p.end = told.splash ? 'water' : 'out';
      [p.x, p.y, p.z] = [told.x, told.y, told.z];
    } else if (told.landed) {
      p.end = 'landed';
      [p.x, p.y, p.z] = [told.x, told.y, told.z];
    } else {
      // never came down within the time: where it lies, which a lofted ball does not do
      p.end = 'landed';
      [p.x, p.y, p.z] = [world.x[ball], world.y[ball], world.z[ball]];
    }
    // the last point of the path is the landing itself, which the frame it was told in went a little past
    const last = p.n - 1;
    const end = Math.hypot(p.x - p.points[last * 3], p.y - p.points[last * 3 + 1], p.z - p.points[last * 3 + 2]);
    if (last >= 0 && end > 1e-6 && p.n < p.points.length / 3) {
      const k = p.n++;
      p.points[k * 3] = p.x;
      p.points[k * 3 + 1] = p.y;
      p.points[k * 3 + 2] = p.z;
      p.length[k] = p.length[k - 1] + end;
    }
    p.lie = lieAt(layout, p.x, p.y);
    const [sx, sy] = slopeAt(layout, p.x, p.y);
    p.slope.x = sx;
    p.slope.y = sy;
    p.carry = Math.hypot(p.x - from.x, p.y - from.y);
    // which way it went, from the ball to the ring: the aim turned by a shape and the wind; a ball that came down where it
    // was struck has gone no way, and is said to have gone the way it was aimed
    p.heading = p.carry > 1e-6 ? Math.atan2(p.y - from.y, p.x - from.x) : angle;
    // the swing's spread: a sideways miss of the whole scatter, and the speed lost at the worst, which the carry goes as
    // the square of
    const spread = maxScatter(club, lieAt(layout, from.x, from.y), power);
    const shortest = p.carry * (1 - DISPERSION.loss * Math.min(1, power)) ** 2;
    p.footprint.across = p.carry * Math.sin(spread);
    p.footprint.along = (p.carry - shortest) / 2;
  }
}

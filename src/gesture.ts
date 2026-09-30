/**
 * What the pointers on the course mean. One pointer, a finger or the mouse,
 * pressed, pulled back and let go is a shot, in aim mode, or in look mode
 * turns and tilts the camera as it is dragged and never strikes anything; two
 * fingers are a pinch in either, and bring the camera nearer as they spread
 * and take it further as they close.
 * A second finger landing mid-drag drops the drag for good: a pinch never
 * ends in a shot, whichever finger lifts first, and the finger left behind
 * starts nothing, since a drag only begins with a finger on an empty
 * screen.
 *
 * The page hands in its pointers and where each is on the ground, and gets
 * back what they mean. Nothing here touches the page, so it is tested
 * without one.
 */
import { shotFromDrag, type Shot } from './shot';

/** How far the camera moves for a pinch across the whole of the screen's shorter side, in world units. */
export const PINCH_REACH = 80;

/**
 * How far a drag in look mode turns the camera, and how far it tilts it, for a drag across the whole of the screen's
 * shorter side, in radians: half a turn across, and a little over a radian of tilt up or down, which is more than the
 * camera's whole range of tilt, so a hand's width of drag takes it from one end to the other. The world turns with the
 * finger, as a turntable does, so a drag to the right turns the view to the left, and a drag down brings the camera
 * higher, more from above.
 */
export const ORBIT = { turn: Math.PI, tilt: 1.2 };

/** What a drag on the course does: in aim mode it is a shot, and in look mode it turns the camera. */
export type Mode = 'aim' | 'look';

export type Gesturing =
  | { kind: 'none' }
  | { kind: 'shoot'; shot: Shot }
  | { kind: 'zoom'; by: number }
  | { kind: 'orbit'; turn: number; tilt: number };

export interface GestureOptions {
  /** The screen's shorter side, in the pointers' pixels: what a drag's power is a share of. */
  shortSide(): number;
  /** The point on the ground under a spot on the screen, or null for sky. */
  ground(x: number, y: number): [number, number] | null;
}

const NONE: Gesturing = { kind: 'none' };

export class Gesture {
  /** Where each pointer down is now. */
  private readonly down_ = new Map<number, [number, number]>();
  /** The drag under way, if one is: which pointer, and where it began on the screen and the ground. */
  private drag: { id: number; px: [number, number]; ground: [number, number] | null } | null = null;
  /** The turn under way in look mode: which pointer, and where it was at the last move. */
  private turning: { id: number; at: [number, number] } | null = null;
  private mode_: Mode = 'aim';
  /** The shot the drag would make if let go now. */
  aim: Shot | null = null;

  constructor(private readonly options: GestureOptions) {}

  /** Which of the two a drag is: aim until it is told. */
  get mode(): Mode {
    return this.mode_;
  }

  /** A drag now is a shot or a turn of the camera, and any under way is dropped, so it never ends as the other. */
  setMode(mode: Mode) {
    if (mode === this.mode_) return;
    this.mode_ = mode;
    this.drag = null;
    this.turning = null;
    this.aim = null;
  }

  down(id: number, x: number, y: number): Gesturing {
    this.down_.set(id, [x, y]);
    if (this.down_.size === 1) {
      if (this.mode_ === 'look') this.turning = { id, at: [x, y] };
      else this.drag = { id, px: [x, y], ground: this.options.ground(x, y) };
    } else {
      this.drag = null;
      this.turning = null;
      this.aim = null;
    }
    return NONE;
  }

  move(id: number, x: number, y: number): Gesturing {
    const was = this.down_.get(id);
    if (!was) return NONE;
    if (this.drag?.id === id) {
      this.down_.set(id, [x, y]);
      this.aim = this.shotTo(x, y);
      return NONE;
    }
    if (this.turning?.id === id) {
      const [px, py] = this.turning.at;
      this.turning.at = [x, y];
      this.down_.set(id, [x, y]);
      const short = this.options.shortSide();
      const turn = -((x - px) / short) * ORBIT.turn,
        tilt = -((y - py) / short) * ORBIT.tilt;
      return turn || tilt ? { kind: 'orbit', turn: turn || 0, tilt: tilt || 0 } : NONE;
    }
    if (this.down_.size !== 2) {
      this.down_.set(id, [x, y]);
      return NONE;
    }
    const before = this.spread();
    this.down_.set(id, [x, y]);
    const by = -((this.spread() - before) / this.options.shortSide()) * PINCH_REACH;
    return by ? { kind: 'zoom', by } : NONE;
  }

  up(id: number, x: number, y: number): Gesturing {
    if (!this.down_.delete(id)) return NONE;
    let out = NONE;
    if (this.turning?.id === id) this.turning = null;
    if (this.drag?.id === id) {
      const shot = this.shotTo(x, y);
      if (shot) out = { kind: 'shoot', shot };
      this.drag = null;
      this.aim = null;
    }
    return out;
  }

  /** A pointer the browser has taken away: whatever it was doing is dropped. */
  cancel(id: number) {
    this.down_.delete(id);
    if (this.turning?.id === id) this.turning = null;
    if (this.drag?.id === id) {
      this.drag = null;
      this.aim = null;
    }
  }

  private shotTo(x: number, y: number): Shot | null {
    const d = this.drag;
    if (!d) return null;
    return shotFromDrag(d.px, [x, y], d.ground, this.options.ground(x, y), this.options.shortSide());
  }

  /** How far apart the two pointers down are. */
  private spread(): number {
    const [a, b] = [...this.down_.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
}

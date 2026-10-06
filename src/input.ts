/**
 * What the pointers on the course do to the game and the camera. The gesture says what they mean (a shot, a pinch, a
 * turn of the view); this is the one place that turns that into the ball struck or the camera moved, handed the ways to do each, so
 * the page, the tests and the fuzzer all press on the course alike and nothing about it is worked out twice.
 *
 * Nothing here touches the page or the game: it is given what to call, and tested and fuzzed without either.
 */
import { Gesture, type Gesturing, type Mode } from './gesture';
import type { Shot } from './shot';

/** What the input is given: how big the screen is, where a spot on it is on the ground, and what to do with a gesture. */
export interface InputPorts {
  /** The screen's shorter side, in the pointers' pixels: what a drag's power is a share of. */
  shortSide(): number;
  /** The point on the ground under a spot on the screen, or null for sky. */
  ground(x: number, y: number): [number, number] | null;
  /** The ball struck toward `angle` at `power` of the club's hardest. */
  shoot(angle: number, power: number): void;
  /** The camera nearer for less than nought, further for more. */
  zoom(by: number): void;
  /** The overhead view dragged by `dx` pixels across and `dy` down: the ground going with the finger. */
  pan(dx: number, dy: number): void;
  /**
   * Called as the first pointer of an aim drag lands, before the ground under it is read: the view the drag is to be read
   * through is held as it is, so that a camera that turns during the drag (to face the aim) does not turn the aim.
   */
  hold(): void;
  /** Whether a screen is up over the course, which the pointers pass through: nothing is struck or moved. */
  blocked(): boolean;
}

export class Input {
  private readonly gesture: Gesture;

  constructor(private readonly ports: InputPorts) {
    this.gesture = new Gesture({ shortSide: () => ports.shortSide(), ground: (x, y) => ports.ground(x, y) });
  }

  /** The shot a drag under way would make if let go now, or null. */
  get aim(): Shot | null {
    return this.gesture.aim;
  }

  /** Whether a drag is a shot, or pans the view from above. */
  get mode(): Mode {
    return this.gesture.mode;
  }

  setMode(mode: Mode) {
    this.gesture.setMode(mode);
  }

  down(id: number, x: number, y: number) {
    if (this.gesture.idle && this.gesture.mode === 'aim') this.ports.hold();
    this.act(this.gesture.down(id, x, y));
  }

  move(id: number, x: number, y: number) {
    this.act(this.gesture.move(id, x, y));
  }

  up(id: number, x: number, y: number) {
    this.act(this.gesture.up(id, x, y));
  }

  /** A pointer the browser has taken away: whatever it was doing is dropped. */
  cancel(id: number) {
    this.gesture.cancel(id);
  }

  private act(g: Gesturing) {
    // nothing is struck through the start screen
    if (this.ports.blocked()) return;
    if (g.kind === 'shoot') this.ports.shoot(g.shot.angle, g.shot.power);
    else if (g.kind === 'zoom') this.ports.zoom(g.by);
    else if (g.kind === 'pan') this.ports.pan(g.dx, g.dy);
  }
}

/** What the pointers on the course mean: one finger or the mouse drags a shot, two fingers pinch the camera nearer or further. */
import { describe, expect, it } from 'vitest';
import { DRAG } from '../src/shot';
import { Gesture, ORBIT, PINCH_REACH } from '../src/gesture';

const SHORT = 800;
/** A gesture whose ground is the screen itself, a pixel a unit, with y turned to point up the course. */
const make = () => new Gesture({ shortSide: () => SHORT, ground: (x, y) => [x, -y] });
const full = DRAG.full * SHORT;

describe('a gesture', () => {
  it('turns one pointer pulled back and let go into a shot, and shows the aim on the way', () => {
    const g = make();
    expect(g.down(1, 400, 300)).toEqual({ kind: 'none' });
    expect(g.aim).toBe(null);
    g.move(1, 400, 300 + full / 2);
    expect(g.aim?.power).toBeCloseTo(0.5, 6);
    const done = g.up(1, 400, 300 + full / 2);
    expect(done.kind).toBe('shoot');
    if (done.kind === 'shoot') expect(done.shot.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(g.aim).toBe(null);
  });

  it('takes back a drag let go where it began', () => {
    const g = make();
    g.down(1, 400, 300);
    g.move(1, 400, 500);
    expect(g.up(1, 401, 302)).toEqual({ kind: 'none' });
  });

  it('turns a second finger into a pinch: the drag is dropped, and never fires, whichever finger lifts first', () => {
    for (const first of [1, 2]) {
      const g = make();
      g.down(1, 400, 300);
      g.move(1, 400, 500);
      expect(g.aim).not.toBe(null);
      g.down(2, 500, 300);
      expect(g.aim, 'no aim while pinching').toBe(null);
      expect(g.up(first, 400, 500)).toEqual({ kind: 'none' });
      const other = first === 1 ? 2 : 1;
      g.move(other, 450, 600);
      expect(g.aim, 'the finger left behind does not start a drag').toBe(null);
      expect(g.up(other, 450, 600)).toEqual({ kind: 'none' });
      // and the next touch is a drag again
      g.down(3, 400, 300);
      g.move(3, 400, 300 + full);
      expect(g.up(3, 400, 300 + full).kind).toBe('shoot');
    }
  });

  it('zooms nearer as the fingers spread, further as they close, by the share of the screen they moved', () => {
    const g = make();
    g.down(1, 300, 400);
    g.down(2, 500, 400);
    const out = g.move(2, 500 + SHORT * 0.1, 400);
    expect(out.kind).toBe('zoom');
    if (out.kind === 'zoom') expect(out.by).toBeCloseTo(-PINCH_REACH * 0.1, 6);
    const back = g.move(2, 500, 400);
    if (back.kind === 'zoom') expect(back.by).toBeCloseTo(PINCH_REACH * 0.1, 6);
    else throw new Error('closing the fingers did not zoom');
  });

  it('drops a drag the browser takes away, and pays no mind to a pointer it never saw go down', () => {
    const g = make();
    g.down(1, 400, 300);
    g.move(1, 400, 500);
    g.cancel(1);
    expect(g.aim).toBe(null);
    // the pointer taken away is forgotten, with no lift to come: the next touch is a drag, not a pinch's second finger
    g.down(2, 400, 300);
    g.move(2, 400, 300 + full);
    expect(g.up(2, 400, 300 + full).kind).toBe('shoot');
    expect(g.up(1, 400, 500)).toEqual({ kind: 'none' });
    expect(g.move(9, 1, 1)).toEqual({ kind: 'none' });
    expect(g.up(9, 1, 1)).toEqual({ kind: 'none' });
  });
});

describe('a gesture in look mode', () => {
  const look = () => {
    const g = make();
    g.setMode('look');
    return g;
  };

  it('is in aim mode until it is told, and says which it is in', () => {
    const g = make();
    expect(g.mode).toBe('aim');
    g.setMode('look');
    expect(g.mode).toBe('look');
    g.setMode('aim');
    expect(g.mode).toBe('aim');
    // and a drag in aim mode never turns the view
    g.down(1, 400, 300);
    expect(g.move(1, 700, 500).kind).toBe('none');
  });

  it('turns one pointer’s drag into an orbit, in proportion to how far it goes and not how far it has gone', () => {
    const g = look();
    expect(g.down(1, 400, 300)).toEqual({ kind: 'none' });
    // across half the screen's shorter side: the ground near the ball follows the finger, so the camera swings the other
    // way round it, toward the side the finger came from
    const across = g.move(1, 400 + SHORT / 2, 300);
    expect(across).toEqual({ kind: 'orbit', turn: ORBIT.turn / 2, tilt: 0 });
    // down a quarter of it, no further across: what is new since the last move, and nothing of what came before
    const down = g.move(1, 400 + SHORT / 2, 300 + SHORT / 4);
    expect(down.kind).toBe('orbit');
    if (down.kind === 'orbit') {
      expect(down.turn).toBeCloseTo(0, 9);
      // dragging down brings the camera lower, more toward the horizon: a bigger angle from the vertical
      expect(down.tilt).toBeCloseTo(ORBIT.tilt / 4, 9);
    }
    // back the other way it turns and tilts the other
    const back = g.move(1, 400, 300);
    expect(back.kind === 'orbit' && back.turn < 0 && back.tilt < 0).toBe(true);
  });

  it('never strikes the ball, shows no aim, and lets go without a shot however hard the drag was', () => {
    const g = look();
    g.down(1, 400, 300);
    g.move(1, 400, 300 + full);
    expect(g.aim, 'no aim to show').toBe(null);
    expect(g.up(1, 400, 300 + full)).toEqual({ kind: 'none' });
    expect(g.aim).toBe(null);
  });

  it('still pinches the camera nearer or further with two fingers, and a second finger drops the orbit as it drops a drag', () => {
    const g = look();
    g.down(1, 400, 300);
    expect(g.move(1, 500, 300).kind).toBe('orbit');
    g.down(2, 600, 300);
    // the first finger no longer turns the view
    expect(g.move(1, 550, 300).kind).not.toBe('orbit');
    const pinch = g.move(2, 700, 300);
    expect(pinch.kind).toBe('zoom');
    g.up(2, 700, 300);
    expect(g.move(1, 500, 350).kind, 'the finger left behind starts nothing').toBe('none');
    g.up(1, 500, 350);
    g.down(3, 400, 300);
    expect(g.move(3, 450, 300).kind, 'and the next touch orbits again').toBe('orbit');
  });

  it('drops a drag under way when the mode changes, so a drag that began as one thing does not end as the other', () => {
    const g = make();
    g.down(1, 400, 300);
    g.move(1, 400, 300 + full);
    expect(g.aim).not.toBe(null);
    g.setMode('look');
    expect(g.aim, 'the aim is put away').toBe(null);
    expect(g.up(1, 400, 300 + full), 'and nothing is struck by it').toEqual({ kind: 'none' });
    // the other way: an orbit under way is dropped, and lets go into nothing
    g.down(2, 400, 300);
    expect(g.move(2, 500, 300).kind).toBe('orbit');
    g.setMode('aim');
    expect(g.move(2, 600, 300).kind).toBe('none');
    expect(g.up(2, 600, 300)).toEqual({ kind: 'none' });
  });
});

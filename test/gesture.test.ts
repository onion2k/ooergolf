/** What the pointers on the course mean: one finger or the mouse drags a shot, two fingers pinch the camera nearer or further. */
import { describe, expect, it } from 'vitest';
import { DRAG } from '../src/shot';
import { Gesture, PINCH_REACH } from '../src/gesture';

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

describe('a gesture in overhead mode', () => {
  const over = () => {
    const g = make();
    g.setMode('overhead');
    return g;
  };

  it('is in aim mode until it is told, and says which it is in', () => {
    const g = make();
    expect(g.mode).toBe('aim');
    g.setMode('overhead');
    expect(g.mode).toBe('overhead');
    g.setMode('aim');
    expect(g.mode).toBe('aim');
    // and a drag in aim mode never pans the view
    g.down(1, 400, 300);
    expect(g.move(1, 700, 500).kind).toBe('none');
  });

  it('turns one pointer’s drag into a pan by the pixels it moved since the last move, and not how far it has gone', () => {
    const g = over();
    expect(g.down(1, 400, 300)).toEqual({ kind: 'none' });
    expect(g.move(1, 450, 300)).toEqual({ kind: 'pan', dx: 50, dy: 0 });
    expect(g.move(1, 450, 340)).toEqual({ kind: 'pan', dx: 0, dy: 40 });
    expect(g.move(1, 400, 300)).toEqual({ kind: 'pan', dx: -50, dy: -40 });
    expect(g.move(1, 400, 300), 'a pointer that did not move is nothing').toEqual({ kind: 'none' });
  });

  it('never strikes the ball, shows no aim, and lets go without a shot however hard the drag was', () => {
    const g = over();
    g.down(1, 400, 300);
    g.move(1, 400, 300 + full);
    expect(g.aim, 'no aim to show').toBe(null);
    expect(g.up(1, 400, 300 + full)).toEqual({ kind: 'none' });
    expect(g.aim).toBe(null);
  });

  it('still pinches with two fingers, and a second finger drops the pan as it drops a drag', () => {
    const g = over();
    g.down(1, 400, 300);
    expect(g.move(1, 500, 300).kind).toBe('pan');
    g.down(2, 600, 300);
    expect(g.move(1, 550, 300).kind, 'the first finger no longer pans').not.toBe('pan');
    expect(g.move(2, 700, 300).kind).toBe('zoom');
    g.up(2, 700, 300);
    expect(g.move(1, 500, 350).kind, 'the finger left behind starts nothing').toBe('none');
    g.up(1, 500, 350);
    g.down(3, 400, 300);
    expect(g.move(3, 450, 300).kind, 'and the next touch pans again').toBe('pan');
  });

  it('drops a drag under way when the mode changes, so a drag that began as one thing does not end as the other', () => {
    const g = make();
    g.down(1, 400, 300);
    g.move(1, 400, 300 + full);
    expect(g.aim).not.toBe(null);
    g.setMode('overhead');
    expect(g.aim, 'the aim is put away').toBe(null);
    expect(g.up(1, 400, 300 + full), 'and nothing is struck by it').toEqual({ kind: 'none' });
    g.down(2, 400, 300);
    expect(g.move(2, 500, 300).kind).toBe('pan');
    g.setMode('aim');
    expect(g.move(2, 600, 300).kind).toBe('none');
    expect(g.up(2, 600, 300)).toEqual({ kind: 'none' });
  });
});

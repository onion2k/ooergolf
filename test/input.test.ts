/**
 * What the pointers do: one place turns what a gesture means into a shot struck, the camera zoomed or nothing, so the
 * page, the tests and the fuzzer all press on the course the same way.
 */
import { describe, expect, it } from 'vitest';
import { DRAG } from '../src/shot';
import { PINCH_REACH } from '../src/gesture';
import { Input } from '../src/input';

const SHORT = 800;
const full = DRAG.full * SHORT;

/** An input whose ground is the screen itself, a pixel a unit with y up the course, writing down what it was made to do. */
function make(blocked = () => false) {
  const done: string[] = [];
  const input = new Input({
    shortSide: () => SHORT,
    ground: (x, y) => [x, -y],
    shoot: (angle, power) => done.push(`shoot ${angle.toFixed(3)} ${power.toFixed(3)}`),
    zoom: (by) => done.push(`zoom ${by.toFixed(3)}`),
    blocked,
  });
  return { input, done };
}

describe('the input', () => {
  it('strikes the ball when a drag pulled back is let go, and shows the aim on the way', () => {
    const { input, done } = make();
    input.down(1, 400, 300);
    expect(input.aim).toBe(null);
    input.move(1, 400, 300 + full / 2);
    expect(input.aim?.power).toBeCloseTo(0.5, 6);
    input.up(1, 400, 300 + full / 2);
    expect(done).toEqual([`shoot ${(Math.PI / 2).toFixed(3)} 0.500`]);
    expect(input.aim).toBe(null);
  });

  it('brings the camera nearer as two fingers spread, and strikes nothing', () => {
    const { input, done } = make();
    input.down(1, 300, 400);
    input.down(2, 500, 400);
    input.move(2, 600, 400);
    expect(done).toEqual([`zoom ${(-(100 / SHORT) * PINCH_REACH).toFixed(3)}`]);
    input.up(2, 600, 400);
    input.up(1, 300, 400);
    expect(done.filter((d) => d.startsWith('shoot'))).toEqual([]);
  });

  it('does nothing while it is blocked, as under the start screen, and takes up again when it is not', () => {
    let blocked = true;
    const { input, done } = make(() => blocked);
    input.down(1, 400, 300);
    input.move(1, 400, 300 + full);
    input.up(1, 400, 300 + full);
    expect(done, 'no shot through a screen').toEqual([]);
    blocked = false;
    input.down(2, 400, 300);
    input.move(2, 400, 300 + full);
    input.up(2, 400, 300 + full);
    expect(done.length).toBe(1);
  });

  it('drops a drag a browser took away, and takes a shot back that is let go where it began', () => {
    const { input, done } = make();
    input.down(1, 400, 300);
    input.move(1, 400, 500);
    input.cancel(1);
    expect(input.aim).toBe(null);
    input.up(1, 400, 500);
    input.down(2, 400, 300);
    input.move(2, 400, 500);
    input.up(2, 401, 302);
    expect(done).toEqual([]);
  });
});

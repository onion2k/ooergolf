/**
 * What the pointers do: one place turns what a gesture means into a shot struck, the camera zoomed or nothing, so the
 * page, the tests and the fuzzer all press on the course the same way.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/camera';
import { DRAG } from '../src/shot';
import { ORBIT, PINCH_REACH } from '../src/gesture';
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
    orbit: (turn, tilt) => done.push(`orbit ${turn.toFixed(3)} ${tilt.toFixed(3)}`),
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

  it('turns the view in look mode and strikes nothing, and takes up shooting again in aim mode', () => {
    const { input, done } = make();
    expect(input.mode).toBe('aim');
    input.setMode('look');
    expect(input.mode).toBe('look');
    input.down(1, 400, 300);
    input.move(1, 400 + SHORT / 4, 300 + SHORT / 4);
    input.up(1, 400 + SHORT / 4, 300 + SHORT / 4);
    expect(done).toEqual([`orbit ${(ORBIT.turn / 4).toFixed(3)} ${(ORBIT.tilt / 4).toFixed(3)}`]);
    expect(input.aim).toBe(null);
    input.setMode('aim');
    input.down(2, 400, 300);
    input.move(2, 400, 300 + full);
    input.up(2, 400, 300 + full);
    expect(done.length).toBe(2);
    expect(done[1].startsWith('shoot')).toBe(true);
  });

  it('turns nothing under a screen in look mode either', () => {
    const { input, done } = make(() => true);
    input.setMode('look');
    input.down(1, 400, 300);
    input.move(1, 700, 500);
    input.up(1, 700, 500);
    expect(done).toEqual([]);
  });
});

/**
 * What a drag in Look does to what is seen, through a real camera and not a sign: a camera on a ball at the middle of a
 * hole, and a hand in Look on a desktop's screen.
 */
describe('the input turning a camera', () => {
  const W = 1280,
    H = 800;
  function looking() {
    const rig = new CameraRig();
    rig.jump(0, 0, 0);
    const cam = new Camera();
    cam.aspect = W / H;
    cam.fov = rig.fov;
    const input = new Input({
      shortSide: () => H,
      ground: () => null,
      shoot: () => {},
      zoom: (by) => rig.zoom(by),
      orbit: (turn, tilt) => rig.orbit(turn, tilt),
      blocked: () => false,
    });
    input.setMode('look');
    /** Where a point on the ground is across the screen, from minus one at the left to one at the right. */
    const across = (x: number, y: number) => {
      rig.place(cam);
      cam.update();
      const m = cam.viewProjection;
      return (m[0] * x + m[4] * y + m[12]) / (m[3] * x + m[7] * y + m[15]);
    };
    const height = () => {
      rig.place(cam);
      return cam.position[2];
    };
    /** A drag by a hand, in the steps a mouse moves in. */
    const drag = (from: [number, number], to: [number, number]) => {
      input.down(1, ...from);
      for (let k = 1; k <= 6; k++)
        input.move(1, from[0] + ((to[0] - from[0]) * k) / 6, from[1] + ((to[1] - from[1]) * k) / 6);
      input.up(1, ...to);
    };
    return { rig, across, height, drag };
  }

  it('brings the ground near the ball across with a finger dragged across, and the far end the other way', () => {
    for (const [from, to, sign] of [
      [[500, 600], [700, 600], 1],
      [[700, 600], [500, 600], -1],
      // the same wherever on the screen the finger is: the turn is the drag's, not the place it began
      [[200, 100], [400, 100], 1],
    ] as const) {
      const { across, drag } = looking();
      const near = across(0, -8),
        far = across(0, 8);
      const what = `${from.join(',')} to ${to.join(',')}`;
      drag([...from], [...to]);
      expect(Math.sign(across(0, -8) - near), `near, ${what}`).toBe(sign);
      expect(Math.abs(across(0, -8) - near), 'by a good way').toBeGreaterThan(0.1);
      expect(Math.sign(across(0, 8) - far), `far, ${what}`).toBe(-sign);
    }
  });

  it('brings the camera lower for a drag down the screen, and higher for one up it', () => {
    const { height, drag } = looking();
    const home = height();
    drag([640, 300], [640, 400]);
    expect(height(), 'down: lower').toBeLessThan(home - 1);
    const lower = height();
    drag([640, 500], [640, 200]);
    expect(height(), 'up: higher than it was').toBeGreaterThan(lower + 1);
  });
});

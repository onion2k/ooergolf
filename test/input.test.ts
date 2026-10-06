/**
 * What the pointers do: one place turns what a gesture means into a shot struck, the camera zoomed or nothing, so the
 * page, the tests and the fuzzer all press on the course the same way.
 */
import { describe, expect, it } from 'vitest';
import { DRAG } from '../src/shot';
import { PINCH_REACH } from '../src/gesture';
import { Input } from '../src/input';
import { Camera } from 'artshape-render/gpu/camera';
import { CameraRig } from '../src/camera';
import { HeldView, groundAt } from '../src/shot';

const SHORT = 800;
const full = DRAG.full * SHORT;

/** An input whose ground is the screen itself, a pixel a unit with y up the course, writing down what it was made to do. */
function make(blocked = () => false) {
  const done: string[] = [];
  const holds = { count: 0 };
  const input = new Input({
    shortSide: () => SHORT,
    ground: (x, y) => [x, -y],
    shoot: (angle, power) => done.push(`shoot ${angle.toFixed(3)} ${power.toFixed(3)}`),
    zoom: (by) => done.push(`zoom ${by.toFixed(3)}`),
    pan: (dx, dy) => done.push(`pan ${dx.toFixed(1)} ${dy.toFixed(1)}`),
    hold: () => void holds.count++,
    blocked,
  });
  return { input, done, holds };
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

  it('pans the view in overhead mode and strikes nothing, and takes up shooting again in aim mode', () => {
    const { input, done } = make();
    expect(input.mode).toBe('aim');
    input.setMode('overhead');
    expect(input.mode).toBe('overhead');
    input.down(1, 400, 300);
    input.move(1, 400 + 100, 300 + 50);
    input.up(1, 500, 350);
    expect(done).toEqual(['pan 100.0 50.0']);
    expect(input.aim).toBe(null);
    input.setMode('aim');
    input.down(2, 400, 300);
    input.move(2, 400, 300 + full);
    input.up(2, 400, 300 + full);
    expect(done.length).toBe(2);
    expect(done[1].startsWith('shoot')).toBe(true);
  });

  it('pans nothing under a screen in overhead mode either', () => {
    const { input, done } = make(() => true);
    input.setMode('overhead');
    input.down(1, 400, 300);
    input.move(1, 700, 500);
    input.up(1, 700, 500);
    expect(done).toEqual([]);
  });
});

describe('the view held for a drag', () => {
  it('is held once, at the first pointer of an aim drag and before the ground is read', () => {
    const order: string[] = [];
    const input = new Input({
      shortSide: () => SHORT,
      ground: (x, y) => (order.push('ground'), [x, -y]),
      shoot: () => {},
      zoom: () => {},
      pan: () => {},
      hold: () => order.push('hold'),
      blocked: () => false,
    });
    input.down(1, 400, 300);
    expect(order).toEqual(['hold', 'ground']);
    input.move(1, 400, 400);
    input.up(1, 400, 400);
    expect(order.filter((o) => o === 'hold')).toHaveLength(1);
    // the next drag holds again
    input.down(1, 400, 300);
    expect(order.filter((o) => o === 'hold')).toHaveLength(2);
  });

  it('is not held again for a second finger', () => {
    const { input, holds } = make();
    input.down(1, 300, 400);
    input.down(2, 500, 400);
    expect(holds.count).toBe(1);
  });

  it('is not held in overhead, where nothing is aimed', () => {
    const { input, holds } = make();
    input.setMode('overhead');
    input.down(1, 300, 400);
    input.move(1, 320, 420);
    expect(holds.count).toBe(0);
  });

  it('keeps the aim where it was though the camera is turned under a still pointer and settled', () => {
    const rig = new CameraRig();
    rig.jump(0, 0, 0);
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = 1.6;
    const held = new HeldView();
    const input = new Input({
      shortSide: () => 800,
      hold() {
        rig.place(cam);
        cam.update();
        held.hold(cam);
      },
      ground: (x, y) => held.ground((x / 1280) * 2 - 1, 1 - (y / 800) * 2, 0),
      shoot: () => {},
      zoom: () => {},
      pan: () => {},
      blocked: () => false,
    });
    input.down(1, 640, 300);
    input.move(1, 700, 520);
    const aim = input.aim!;
    expect(aim).not.toBe(null);
    const mine = [aim.angle, aim.power];
    rig.turnTo(1);
    for (let k = 0; k < 600; k++) rig.settle(1 / 60);
    expect(Math.abs(rig.azimuth - 1)).toBeLessThan(1e-3);
    // the pointer still, and told again where it is
    input.move(1, 700, 520);
    expect([input.aim!.angle, input.aim!.power]).toEqual(mine);
    // read live, the same drag is another shot
    rig.place(cam);
    cam.update();
    const live = groundAt(cam, (700 / 1280) * 2 - 1, 1 - (520 / 800) * 2, 0)!;
    expect(live).not.toEqual(held.ground((700 / 1280) * 2 - 1, 1 - (520 / 800) * 2, 0));
  });
});

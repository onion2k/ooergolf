/** The camera that follows the ball: the ball is always in view, on a phone as on a desktop. */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { CameraRig } from '../src/camera';
import { groundAt } from '../src/shot';
import { GREEN } from './helpers';

const { bounds: FLOOR, tee: TEE } = layoutOf(GREEN.map);

function ndc(c: Camera, x: number, y: number, z: number): [number, number] {
  const m = c.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
}

describe('the camera', () => {
  for (const aspect of [1.6, 400 / 860]) {
    it(`keeps the ball well inside the view wherever it is on the course, at aspect ${aspect.toFixed(2)}`, () => {
      const rig = new CameraRig();
      const cam = new Camera();
      cam.fov = rig.fov;
      cam.aspect = aspect;
      for (const [x, y] of [
        [TEE.x, TEE.y],
        [0, 0],
        [FLOOR.minX + 1, FLOOR.minY + 1],
        [FLOOR.maxX - 1, FLOOR.maxY - 1],
        [FLOOR.minX + 1, FLOOR.maxY - 1],
        [FLOOR.maxX - 1, FLOOR.minY + 1],
      ]) {
        rig.jump(x, y);
        rig.place(cam);
        cam.update();
        const [nx, ny] = ndc(cam, x, y, 1);
        expect(Math.abs(nx), `across, ball at ${x},${y}`).toBeLessThan(0.8);
        expect(Math.abs(ny), `up, ball at ${x},${y}`).toBeLessThan(0.8);
      }
    });
  }

  it('shows at least half the width of the course across the ball, on a phone held upright as on a desktop', () => {
    for (const [aspect, least] of [
      [1.6, 55],
      [400 / 860, 28],
    ]) {
      const rig = new CameraRig();
      const cam = new Camera();
      cam.aspect = aspect;
      rig.jump(TEE.x, TEE.y);
      rig.place(cam);
      cam.update();
      const [, ny] = ndc(cam, TEE.x, TEE.y, 1);
      const left = groundAt(cam, -1, ny, 1)!,
        right = groundAt(cam, 1, ny, 1)!;
      expect(right[0] - left[0], `across at aspect ${aspect.toFixed(2)}`).toBeGreaterThan(least);
    }
  });

  it('looks up the course from the tee end, from above', () => {
    const rig = new CameraRig();
    const cam = new Camera();
    rig.jump(0, 0);
    rig.place(cam);
    expect(cam.position[1]).toBeLessThan(cam.target[1]);
    expect(cam.position[2]).toBeGreaterThan(20);
  });

  it('eases after the ball rather than jumping, and gets there', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    rig.follow(20, 20, 1 / 60);
    expect(rig.target[0]).toBeGreaterThan(0);
    expect(rig.target[0]).toBeLessThan(10);
    for (let f = 0; f < 300; f++) rig.follow(20, 20, 1 / 60);
    expect(rig.target[0]).toBeCloseTo(20, 1);
  });

  it('zooms within its limits', () => {
    const rig = new CameraRig();
    const was = rig.distance;
    rig.zoom(10);
    expect(rig.distance).toBeGreaterThan(was);
    rig.zoom(1e6);
    const most = rig.distance;
    rig.zoom(1e6);
    expect(rig.distance).toBe(most);
    rig.zoom(-1e6);
    expect(rig.distance).toBeLessThan(was);
  });
});

/** The camera that follows the ball: the ball is always in view, on a phone as on a desktop. */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { CameraRig, GLIDE } from '../src/camera';
import { groundAt } from '../src/shot';
import { GREEN } from './helpers';

const { bounds: FLOOR, tee: TEE } = layoutOf(GREEN.map);

const near = (a: number[], b: number[]) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 6));

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

  it('rises and falls with the ground under the ball, easing as it does across the course, and stands as far above it', () => {
    const rig = new CameraRig();
    const cam = new Camera();
    rig.jump(0, 0);
    rig.place(cam);
    const above = cam.position[2] - cam.target[2];
    rig.jump(0, 0, 2);
    rig.place(cam);
    expect(cam.target[2], 'looking at the ground, two up').toBeCloseTo(2, 9);
    expect(cam.position[2] - cam.target[2], 'as far above it').toBeCloseTo(above, 9);
    rig.follow(0, 0, 1 / 60, 5);
    expect(rig.target[2]).toBeGreaterThan(2);
    expect(rig.target[2]).toBeLessThan(3.5);
    for (let f = 0; f < 300; f++) rig.follow(0, 0, 1 / 60, 5);
    expect(rig.target[2]).toBeCloseTo(5, 1);
  });

  describe('at the start of a hole', () => {
    /** Where the camera stands at game time `t`. */
    const where = (rig: CameraRig, cam: Camera, t: number): [number, number, number] => {
      rig.place(cam, t);
      return [cam.position[0], cam.position[1], cam.position[2]];
    };
    const apart = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    it('glides to the tee from where it was looking, never jumping, and is there within its glide', () => {
      const rig = new CameraRig();
      const cam = new Camera();
      cam.aspect = 1.6;
      rig.jump(10, 20, 0);
      const was = where(rig, cam, 5);
      rig.glide(-3, -18, 1.2, 5);
      expect(where(rig, cam, 5), 'where it was, the moment the hole begins').toEqual(was);
      // where it will stand, at the tee
      const there = (() => {
        const other = new CameraRig();
        other.jump(-3, -18, 1.2);
        return where(other, cam, 0);
      })();
      const whole = apart(was, there);
      const even = whole / (GLIDE * 60);
      let prev = was,
        most = 0;
      const moves: number[] = [];
      for (let f = 1; f <= Math.ceil(GLIDE * 60) + 30; f++) {
        const now = where(rig, cam, 5 + f / 60);
        moves.push(apart(now, prev));
        most = Math.max(most, apart(now, prev));
        prev = now;
      }
      expect(most, 'no frame moves it more than half as far again as an even glide would').toBeLessThan(even * 1.6);
      expect(moves[0], 'easing away from where it was').toBeLessThan(even / 4);
      expect(moves[Math.ceil(GLIDE * 60) - 1], 'and easing into the tee').toBeLessThan(even / 4);
      near(where(rig, cam, 5 + GLIDE), there);
      expect(where(rig, cam, 5 + GLIDE + 3), 'and stays there').toEqual(where(rig, cam, 5 + GLIDE));
      expect(GLIDE, 'there before a player would strike').toBeLessThanOrEqual(1);
    });

    it('glides on from where it is when a hole is begun again part way through a glide', () => {
      const rig = new CameraRig();
      const cam = new Camera();
      rig.jump(0, 30, 0);
      rig.glide(0, -30, 0, 1);
      const mid = where(rig, cam, 1 + GLIDE / 2);
      rig.glide(20, 0, 0, 1 + GLIDE / 2);
      expect(apart(where(rig, cam, 1 + GLIDE / 2), mid), 'from where it had got to').toBeLessThan(1e-9);
      expect(apart(where(rig, cam, 1 + GLIDE / 2 + 1 / 60), mid), 'and on without a jump').toBeLessThan(1);
    });

    it('follows the ball while it glides, as it always does', () => {
      const rig = new CameraRig();
      const cam = new Camera();
      rig.jump(0, 30, 0);
      rig.glide(0, -30, 0, 1);
      rig.follow(0, -20, 0.5, 0);
      const followed = new CameraRig();
      followed.jump(0, -30, 0);
      followed.follow(0, -20, 0.5, 0);
      near(where(rig, cam, 1 + GLIDE), where(followed, new Camera(), 0));
    });

    it('is put somewhere at once by a jump, which ends a glide', () => {
      const rig = new CameraRig();
      const cam = new Camera();
      rig.jump(0, 30, 0);
      rig.glide(0, -30, 0, 1);
      rig.jump(5, 5, 0);
      const parked = new CameraRig();
      parked.jump(5, 5, 0);
      near(where(rig, cam, 1.01), where(parked, new Camera(), 0));
      expect(rig.gliding(1.01)).toBe(0);
    });

    it('says how far it has still to glide, which is nothing once it is there', () => {
      const rig = new CameraRig();
      rig.jump(0, 30, 0);
      rig.glide(0, -10, 0, 2);
      expect(rig.gliding(2)).toBeCloseTo(40, 9);
      expect(rig.gliding(2 + GLIDE / 2)).toBeCloseTo(20, 9);
      expect(rig.gliding(2 + GLIDE)).toBe(0);
    });
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

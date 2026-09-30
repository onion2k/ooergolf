/** The camera that follows the ball: the ball is always in view, on a phone as on a desktop. */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import { CameraRig, GLIDE, LEAD, TILT } from '../src/camera';
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

describe('orbiting the camera', () => {
  const placed = (rig: CameraRig, aspect = 1.6, t = Infinity) => {
    const cam = new Camera();
    cam.aspect = aspect;
    rig.place(cam, t);
    cam.update();
    return cam;
  };

  it('stands where it always did until it is orbited: south of what it looks at, at 45 degrees, its target a lead up the course', () => {
    expect(TILT).toEqual({ least: 0.3, home: 0.78, most: 1 });
    const rig = new CameraRig();
    expect(rig.azimuth).toBe(0);
    expect(rig.tilt).toBe(TILT.home);
    rig.jump(4, -7, 1);
    const cam = placed(rig);
    const r = rig.distance;
    near(cam.target, [4, -7 + LEAD, 1]);
    near(cam.position, [4, -7 + LEAD - Math.sin(0.78) * r, 1 + Math.cos(0.78) * r]);
  });

  it('turns all the way round without limit, and comes back to where it was after a whole turn or ten', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    const was = [...placed(rig).position];
    for (let k = 0; k < 40; k++) rig.orbit(Math.PI / 20, 0);
    near(placed(rig).position, was);
    rig.orbit(10 * 2 * Math.PI, 0);
    near(placed(rig).position, was);
    // whichever way it is turned, the azimuth is kept to one turn, so it never grows past what a float holds
    for (let k = 0; k < 500; k++) rig.orbit(1.3, 0);
    expect(Math.abs(rig.azimuth)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it('tilts between the steepest and the lowest it is allowed, and no further however far it is asked', () => {
    const rig = new CameraRig();
    rig.orbit(0, 100);
    expect(rig.tilt).toBe(TILT.most);
    rig.orbit(0, -100);
    expect(rig.tilt).toBe(TILT.least);
    rig.orbit(0, 0.1);
    expect(rig.tilt).toBeCloseTo(TILT.least + 0.1, 9);
    // no float can get it out: not asked for nothing, nor for a number that is not one
    rig.orbit(Number.NaN, Number.NaN);
    expect(rig.tilt).toBeGreaterThanOrEqual(TILT.least);
    expect(Number.isFinite(rig.azimuth) && Number.isFinite(rig.tilt)).toBe(true);
  });

  it('keeps the same distance from what it looks at, whichever way it is turned and tilted', () => {
    const rig = new CameraRig();
    rig.jump(3, 3, 0.5);
    for (const az of [0, 1, 2.5, -2, Math.PI])
      for (const tilt of [TILT.least, TILT.home, TILT.most]) {
        rig.azimuth = az;
        rig.tilt = tilt;
        const cam = placed(rig);
        const d = Math.hypot(...[0, 1, 2].map((k) => cam.position[k] - cam.target[k]));
        expect(d, `az ${az} tilt ${tilt}`).toBeCloseTo(rig.distance, 6);
      }
  });

  for (const aspect of [1.6, 400 / 860]) {
    it(`keeps the ball where it was on the screen, however it is turned and tilted, at aspect ${aspect.toFixed(2)}`, () => {
      // it looks a lead ahead of the ball along the way it faces, so the ball stays low on the screen from every side
      const rig = new CameraRig();
      rig.jump(TEE.x, TEE.y);
      const [nx0, ny0] = ndc(placed(rig, aspect), TEE.x, TEE.y, 1);
      for (const az of [0.4, Math.PI / 2, Math.PI, -2.2]) {
        rig.azimuth = az;
        rig.tilt = TILT.home;
        const [nx, ny] = ndc(placed(rig, aspect), TEE.x, TEE.y, 1);
        expect(nx, `across at ${az}`).toBeCloseTo(nx0, 6);
        expect(ny, `down at ${az}`).toBeCloseTo(ny0, 6);
      }
    });

    it(`keeps the ball well inside the view at every azimuth and every tilt, wherever it is, at aspect ${aspect.toFixed(2)}`, () => {
      const rig = new CameraRig();
      for (const [x, y] of [
        [TEE.x, TEE.y],
        [FLOOR.minX + 1, FLOOR.minY + 1],
        [FLOOR.maxX - 1, FLOOR.maxY - 1],
      ])
        for (const az of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
          for (const tilt of [TILT.least, TILT.home, TILT.most]) {
            rig.jump(x, y);
            rig.azimuth = az;
            rig.tilt = tilt;
            const [nx, ny] = ndc(placed(rig, aspect), x, y, 1);
            expect(Math.abs(nx), `across at ${az}, ${tilt}`).toBeLessThan(0.8);
            expect(Math.abs(ny), `up at ${az}, ${tilt}`).toBeLessThan(0.85);
          }
    });
  }

  it('turns the lead with it: what it looks at is always a lead ahead of the ball, the way it faces', () => {
    const rig = new CameraRig();
    rig.jump(2, 5);
    for (const az of [0, 1.1, Math.PI, -2.4]) {
      rig.azimuth = az;
      const cam = placed(rig);
      near(cam.target, [2 + Math.sin(az) * LEAD, 5 + Math.cos(az) * LEAD, 0]);
    }
  });

  it('eases home at a new hole, turned and tilted back over the glide, and never jumps', () => {
    const rig = new CameraRig();
    const cam = new Camera();
    cam.aspect = 1.6;
    rig.jump(0, 0);
    rig.orbit(2.4, 0.2);
    const at = (t: number) => {
      rig.place(cam, t);
      return { position: [...cam.position], view: rig.view(t) };
    };
    const was = at(5);
    rig.glide(0, 0, 0, 5);
    // the moment the hole begins it is where it was, turned and tilted as it was
    near(at(5).position, was.position);
    expect(at(5).view.azimuth).toBeCloseTo(was.view.azimuth, 9);
    expect(at(5).view.tilt).toBeCloseTo(was.view.tilt, 9);
    // and it comes home: turned and tilted as it is at every tee, exactly at the glide's end
    expect(at(5 + GLIDE).view.azimuth).toBeCloseTo(0, 9);
    expect(at(5 + GLIDE).view.tilt).toBeCloseTo(TILT.home, 9);
    // by the shortest way, easing, a step at a time
    let last = Math.abs(was.view.azimuth),
      most = 0;
    for (let f = 1; f <= Math.ceil(GLIDE * 60); f++) {
      const v = at(5 + f / 60).view;
      expect(Math.abs(v.azimuth)).toBeLessThanOrEqual(last + 1e-9);
      most = Math.max(most, last - Math.abs(v.azimuth));
      last = Math.abs(v.azimuth);
    }
    expect(most, 'no frame turns it more than half as far again as an even glide').toBeLessThan(
      (2.4 / (GLIDE * 60)) * 1.6,
    );
    expect(rig.azimuth, 'the rig is home, the glide only easing what is drawn').toBe(0);
    expect(rig.tilt).toBe(TILT.home);
  });

  it('takes the shortest way home: from three quarters of a turn, a quarter the other way', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    rig.orbit(1.5 * Math.PI, 0);
    rig.glide(0, 0, 0, 1);
    // three quarters round is a quarter the other way: it turns through less than a half turn
    expect(Math.abs(rig.view(1).azimuth)).toBeLessThan(Math.PI / 2 + 1e-9);
  });

  it('takes the shortest way home from a view turned past a whole turn by a glide and a player together', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    rig.orbit(3, 0);
    rig.glide(0, 0, 0, 1);
    // three still to ease away, and a player turns it three more the same way: the drawn view is six radians round
    rig.orbit(3, 0);
    expect(rig.view(1).azimuth).toBeCloseTo(6, 9);
    rig.glide(0, 0, 0, 1);
    // which is a little short of a whole turn, and it goes home the short way, never further than half a turn
    expect(rig.view(1).azimuth).toBeCloseTo(6 - 2 * Math.PI, 9);
    for (let f = 0; f <= Math.ceil(GLIDE * 60); f++)
      expect(Math.abs(rig.view(1 + f / 60).azimuth)).toBeLessThanOrEqual(Math.PI);
  });

  it('lets a player orbit again while it is easing home, from where it is', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    rig.orbit(1.2, 0);
    rig.glide(0, 0, 0, 0);
    const mid = rig.view(GLIDE / 2).azimuth;
    rig.orbit(0.5, 0);
    expect(rig.view(GLIDE / 2).azimuth).toBeCloseTo(mid + 0.5, 6);
  });
});

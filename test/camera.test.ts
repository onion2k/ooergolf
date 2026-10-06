/** The camera that follows the ball: the ball is always in view, on a phone as on a desktop. */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { layoutOf } from '../src/arena';
import {
  CameraRig,
  GLIDE,
  LEAD,
  OVERHEAD,
  TILT,
  VIEW,
  catchUp,
  facing,
  overheadFit,
  standOf,
  tallOf,
} from '../src/camera';
import { seeded } from '../src/random';
import { SAMPLE_HOLES } from './helpers';
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

  it('catches up with a ball in flight faster the faster it goes, and at its own pace for one at rest', () => {
    const rig = new CameraRig();
    const slow = new CameraRig(),
      fast = new CameraRig();
    rig.jump(0, 0);
    slow.jump(0, 0);
    fast.jump(0, 0);
    // at rest it is the pace it always was: an unasked follow and one at the pace for no speed are the same
    rig.follow(20, 20, 1 / 60);
    slow.follow(20, 20, 1 / 60, 0, catchUp(0));
    expect(slow.target).toEqual(rig.target);
    // a drive's speed takes it further in the same time, and never past the ball
    fast.follow(20, 20, 1 / 60, 0, catchUp(216));
    expect(fast.target[0]).toBeGreaterThan(slow.target[0] * 2);
    expect(fast.target[0]).toBeLessThan(20);
    expect(catchUp(100)).toBeGreaterThan(catchUp(50));
    // it keeps a ball at the driver's speed within a fifth of the screen's depth of where it looks, a dozen or so units
    expect(216 / catchUp(216)).toBeLessThan(16);
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

describe('turning to face a place', () => {
  const TAU = Math.PI * 2;
  /** The way a placed camera looks along the ground, as an azimuth: from where it stands to where it looks. */
  const faces = (rig: CameraRig, t = Infinity) => {
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = 1.6;
    rig.place(cam, t);
    return Math.atan2(cam.target[0] - cam.position[0], cam.target[1] - cam.position[1]);
  };
  /** The shortest way round from `a` to `b`, in radians. */
  const between = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  /** A rig that has finished easing, with every frame a sixtieth of a second. */
  const settled = (rig: CameraRig, frames = 600) => {
    for (let f = 0; f < frames; f++) rig.settle(1 / 60);
    return rig;
  };

  describe('which way that is', () => {
    it('is nought for a place straight up the course, a quarter turn for one due east, and a half for one behind', () => {
      expect(facing({ x: 0, y: 0 }, { x: 0, y: 50 })).toBeCloseTo(0, 12);
      expect(facing({ x: 0, y: 0 }, { x: 50, y: 0 })).toBeCloseTo(Math.PI / 2, 12);
      expect(facing({ x: 0, y: 0 }, { x: -50, y: 0 })).toBeCloseTo(-Math.PI / 2, 12);
      expect(Math.abs(facing({ x: 0, y: 0 }, { x: 0, y: -50 })!)).toBeCloseTo(Math.PI, 12);
      expect(facing({ x: 10, y: 20 }, { x: 40, y: 60 })).toBeCloseTo(Math.atan2(30, 40), 12);
    });

    it('is nothing for a place that is where it is, or is not a place: there is no way to face', () => {
      expect(facing({ x: 3, y: 4 }, { x: 3, y: 4 })).toBeNull();
      expect(facing({ x: 3, y: 4 }, { x: 3.0001, y: 4 })).toBeNull();
      expect(facing({ x: NaN, y: 4 }, { x: 3, y: 4 })).toBeNull();
      expect(facing({ x: 3, y: 4 }, { x: Infinity, y: 4 })).toBeNull();
    });
  });

  it('turns to face it, and the camera then looks along the line from the ball to it, which is what the flag being straight ahead is', () => {
    for (const [dx, dy] of [
      [40, 80],
      [-60, 10],
      [5, -90],
      [100, 0],
    ]) {
      const rig = new CameraRig();
      rig.jump(12, -7);
      rig.turnTo(facing({ x: 12, y: -7 }, { x: 12 + dx, y: -7 + dy })!);
      settled(rig);
      expect(between(faces(rig), Math.atan2(dx, dy)), `toward ${dx},${dy}`).toBeLessThan(1e-6);
      expect(rig.turning).toBe(false);
    }
  });

  it('puts the flag in the middle of the screen across, however far to one side of the course it is', () => {
    const rig = new CameraRig();
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = 1.6;
    rig.jump(0, 0);
    rig.turnTo(facing({ x: 0, y: 0 }, { x: 70, y: 40 })!);
    settled(rig);
    rig.place(cam);
    cam.update();
    const [nx] = ndc(cam, 70, 40, 0);
    expect(Math.abs(nx), 'in the middle across').toBeLessThan(1e-6);
    // and the ball is in the middle too, below it, since the flag is straight ahead of it
    expect(Math.abs(ndc(cam, 0, 0, 1)[0])).toBeLessThan(1e-6);
  });

  it('eases round and does not jump: it is where it was at once, and a little nearer a moment on, and there in a second or two', () => {
    const rig = new CameraRig();
    rig.jump(0, 0);
    rig.turnTo(1.2);
    expect(rig.turning).toBe(true);
    expect(rig.azimuth, 'not at once').toBe(0);
    rig.settle(1 / 60);
    expect(rig.azimuth).toBeGreaterThan(0.01);
    expect(rig.azimuth).toBeLessThan(0.5);
    let last = rig.azimuth;
    for (let f = 0; f < 60; f++) {
      rig.settle(1 / 60);
      expect(rig.azimuth, 'never backward').toBeGreaterThanOrEqual(last);
      last = rig.azimuth;
    }
    expect(Math.abs(1.2 - rig.azimuth), 'most of the way in a second').toBeLessThan(0.2);
    settled(rig);
    expect(rig.azimuth).toBe(1.2);
    expect(rig.turning, 'and done').toBe(false);
  });

  it('goes as far in a slow frame as in the frames it was', () => {
    const a = new CameraRig(),
      b = new CameraRig();
    a.turnTo(2);
    b.turnTo(2);
    for (let f = 0; f < 30; f++) a.settle(1 / 60);
    for (let f = 0; f < 3; f++) b.settle(1 / 6);
    expect(Math.abs(a.azimuth - b.azimuth)).toBeLessThan(0.02);
  });

  it('takes the shortest way round: from just east of south it goes through south, not the long way through north', () => {
    const rig = new CameraRig();
    rig.orbit(3, 0);
    rig.turnTo(-3);
    let most = Infinity;
    for (let f = 0; f < 600; f++) {
      rig.settle(1 / 60);
      most = Math.min(most, Math.abs(rig.azimuth));
    }
    expect(most, 'it never came near north').toBeGreaterThan(2.5);
    expect(rig.azimuth).toBeCloseTo(-3, 6);
    // and the same from a view that has been turned past a whole turn and wrapped
    const other = new CameraRig();
    other.orbit(TAU * 3 + 0.5, 0);
    other.turnTo(0);
    let went = 0;
    for (let f = 0; f < 600; f++) {
      const before = other.azimuth;
      other.settle(1 / 60);
      went += Math.abs(other.azimuth - before);
    }
    expect(went, 'half a radian, not a turn').toBeLessThan(0.7);
  });

  it('is turned within a turn either way, whatever it is asked to face', () => {
    const rig = new CameraRig();
    for (const to of [0, 7, -7, 100, TAU * 5, -TAU * 2.4]) {
      rig.turnTo(to);
      settled(rig);
      expect(Math.abs(rig.azimuth)).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(between(rig.azimuth, to)).toBeLessThan(1e-6);
    }
  });

  it('is taken back by the player: a turn or a tilt of their own ends it where it is, and a zoom does not', () => {
    const rig = new CameraRig();
    rig.turnTo(2);
    for (let f = 0; f < 10; f++) rig.settle(1 / 60);
    const part = rig.azimuth;
    rig.zoom(5);
    expect(rig.turning, 'a zoom is not a turn').toBe(true);
    rig.orbit(0.1, 0);
    expect(rig.turning, 'their own turn ends it').toBe(false);
    settled(rig, 60);
    expect(rig.azimuth).toBeCloseTo(part + 0.1, 6);
    // a tilt of their own is theirs too, and ends it: the view is the player's from the moment they take it
    const tilted = new CameraRig();
    tilted.turnTo(2);
    tilted.orbit(0, 0.1);
    expect(tilted.turning).toBe(false);
  });

  it('leaves the distance, the tilt, the lead and a view it is easing to alone', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.aimAt({ distance: 150, tilt: 0.5, lead: 30 });
    const was = { distance: rig.distance, tilt: rig.tilt, lead: rig.lead };
    rig.turnTo(1);
    expect(rig.aiming, 'the aim view is still being eased to').toBe(true);
    expect({ distance: rig.distance, tilt: rig.tilt, lead: rig.lead }).toEqual(was);
    settled(rig);
    expect(rig.distance).toBe(150);
    expect(rig.tilt).toBe(0.5);
    expect(rig.lead).toBe(30);
    expect(rig.azimuth).toBe(1);
  });

  it('is put away by a new hole, which eases home from where it is, by the shortest way, and never jumps', () => {
    const rig = new CameraRig();
    rig.turnTo(2);
    for (let f = 0; f < 20; f++) rig.settle(1 / 60);
    const at = faces(rig);
    rig.glide(0, 0, 0, 5);
    expect(rig.turning).toBe(false);
    expect(between(faces(rig, 5), at), 'it begins where it was').toBeLessThan(1e-6);
    settled(rig);
    expect(between(faces(rig, 5 + GLIDE + 1), 0), 'and ends facing up the course').toBeLessThan(1e-6);
  });

  it('ignores a number that is not one, and faces nowhere it is not told', () => {
    const rig = new CameraRig();
    rig.orbit(0.4, 0);
    rig.turnTo(NaN);
    rig.turnTo(Infinity);
    expect(rig.turning).toBe(false);
    settled(rig, 10);
    expect(rig.azimuth).toBeCloseTo(0.4, 12);
  });

  it('can be told again while it is turning, and goes to the last place told', () => {
    const rig = new CameraRig();
    rig.turnTo(2);
    for (let f = 0; f < 15; f++) rig.settle(1 / 60);
    rig.turnTo(-1);
    settled(rig);
    expect(rig.azimuth).toBeCloseTo(-1, 6);
  });
});

describe('the overhead view', () => {
  const ASPECTS = [1.6, 1.0, 400 / 860];
  const bounds = { minX: -60, minY: -150, maxX: 60, maxY: 150 };

  /** The rig fitted to `bounds` for a screen of `aspect`, switched on and blended all the way in. */
  function above(aspect: number, box = bounds, azimuth = 0) {
    const rig = new CameraRig();
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = aspect;
    rig.setScreen(aspect);
    rig.jump(box.minX + 5, box.minY + 5);
    rig.orbit(azimuth, 0);
    rig.setOverhead(true, { bounds: box, distance: overheadFit(box, rig.azimuth, aspect) });
    for (let f = 0; f < 240; f++) rig.settle(1 / 60);
    rig.place(cam);
    cam.update();
    return { rig, cam };
  }

  /** What the camera did before there was an overhead view, worked out from the rig's own fields. */
  function today(rig: CameraRig, aspect: number): { position: number[]; target: number[] } {
    const r = Math.min(rig.distance * tallOf(aspect), rig.golf ? standOf(aspect) : Infinity);
    const { azimuth, tilt } = rig.view(Infinity);
    const [fx, fy] = [Math.sin(azimuth), Math.cos(azimuth)];
    const x = rig.target[0] + fx * rig.lead,
      y = rig.target[1] + fy * rig.lead,
      z = rig.target[2];
    return {
      target: [x, y, z],
      position: [x - fx * Math.sin(tilt) * r, y - fy * Math.sin(tilt) * r, z + Math.cos(tilt) * r],
    };
  }

  it('leaves the placing of the camera bit for bit as it was while it is off, for fifty views', () => {
    const random = seeded(7);
    for (let k = 0; k < 50; k++) {
      const rig = new CameraRig();
      const aspect = 0.4 + random() * 1.4;
      rig.setGolf(random() < 0.5);
      rig.setScreen(aspect);
      rig.jump((random() - 0.5) * 300, (random() - 0.5) * 300, random() * 5);
      rig.orbit((random() - 0.5) * 20, (random() - 0.5) * 2);
      rig.zoom((random() - 0.5) * 400);
      rig.aimAt({ distance: 40 + random() * 100, tilt: random(), lead: random() * 30 }, true);
      // it has been switched on and off again, and settled, which must leave nothing behind
      if (k % 2) {
        rig.setOverhead(true, { bounds, distance: 300 });
        rig.setOverhead(false);
        for (let f = 0; f < 240; f++) rig.settle(1 / 60);
      }
      const cam = new Camera();
      cam.aspect = aspect;
      rig.place(cam);
      const want = today(rig, aspect);
      expect([...cam.position], `position ${k}`).toEqual(want.position);
      expect([...cam.target], `target ${k}`).toEqual(want.target);
    }
  });

  for (const aspect of ASPECTS) {
    it(`shows every corner of the hole with room to spare, at aspect ${aspect.toFixed(2)}, on each hole there is`, () => {
      let capped = 0;
      for (const hole of SAMPLE_HOLES) {
        const box = layoutOf(hole.map).bounds;
        for (const azimuth of [0, 0.7, -2.4]) {
          const { rig, cam } = above(aspect, box, azimuth);
          // a hole too big for the furthest the view stands is the cap's to hold: it shows what it can, and says it is at the cap
          if (rig.top.distance >= OVERHEAD.far) {
            capped++;
            continue;
          }
          for (const x of [box.minX, box.maxX])
            for (const y of [box.minY, box.maxY]) {
              const [nx, ny] = ndc(cam, x, y, 0);
              expect(Math.abs(nx), `${hole.name} across at ${x},${y} turned ${azimuth}`).toBeLessThan(1);
              expect(Math.abs(ny), `${hole.name} up at ${x},${y} turned ${azimuth}`).toBeLessThan(1);
            }
        }
      }
      // the cap is the exception and not the rule: it holds only a few of the views, the biggest holes turned across a narrow screen
      expect(capped).toBeLessThan(SAMPLE_HOLES.length);
    });
  }

  it('fits no more of the screen than it must: the biggest dimension is within a tenth of the edge of it', () => {
    const { cam } = above(1.6);
    const [, top] = ndc(cam, 0, bounds.maxY, 0);
    expect(top).toBeGreaterThan(0.85);
  });

  it('looks within three degrees of straight down', () => {
    const { cam } = above(1.0);
    const [fx, fy, fz] = [0, 1, 2].map((a) => cam.target[a] - cam.position[a]);
    const off = Math.acos(-fz / Math.hypot(fx, fy, fz));
    expect(off).toBeLessThan((3 * Math.PI) / 180);
    expect(off).toBeGreaterThan(0);
  });

  it('keeps the ground under a pixel when it is panned by that much, within a hundredth of the screen', () => {
    const aspect = 1.6,
      heightPx = 800;
    for (const azimuth of [0, 1.1, -2.2]) {
      const { rig, cam } = above(aspect, { minX: -400, minY: -400, maxX: 400, maxY: 400 }, azimuth);
      rig.zoom(-400);
      rig.place(cam);
      cam.update();
      for (const [px, py, dx, dy] of [
        [0.2, 0.1, 80, -40],
        [-0.5, 0.4, -120, 60],
        [0.0, 0.0, 30, 200],
      ]) {
        const from = groundAt(cam, px, py, 0)!.slice();
        rig.pan(dx, dy, heightPx);
        rig.place(cam);
        cam.update();
        // the finger moved dx right and dy down, which is 2dx/width across and -2dy/height up on the screen
        const to = groundAt(cam, px + (2 * dx) / (heightPx * aspect), py - (2 * dy) / heightPx, 0)!;
        const per = (2 * rig.top.distance * Math.tan((VIEW.fov * Math.PI) / 360)) / heightPx;
        expect(Math.hypot(to[0] - from[0], to[1] - from[1]) / (per * heightPx), `turned ${azimuth}`).toBeLessThan(0.01);
      }
    }
  });

  it('is held to the hole when panned, and does nothing when it is off or told nonsense', () => {
    const { rig } = above(1.6);
    rig.pan(-1e6, 1e6, 800);
    const { x, y } = rig.top;
    expect(x).toBeGreaterThanOrEqual(bounds.minX);
    expect(x).toBeLessThanOrEqual(bounds.maxX);
    expect(y).toBeGreaterThanOrEqual(bounds.minY);
    expect(y).toBeLessThanOrEqual(bounds.maxY);
    rig.pan(Number.NaN, 5, 800);
    rig.pan(5, 5, 0);
    expect([rig.top.x, rig.top.y]).toEqual([x, y]);
    rig.setOverhead(false);
    rig.pan(10, 10, 800);
    expect([rig.top.x, rig.top.y]).toEqual([x, y]);
  });

  it('zooms between the nearest it goes and the distance that fits the hole, and leaves the ordinary zoom alone', () => {
    const { rig } = above(1.6);
    const fit = rig.top.distance;
    const was = rig.distance;
    rig.zoom(1e6);
    expect(rig.top.distance).toBe(fit);
    rig.zoom(-1e6);
    expect(rig.top.distance).toBe(OVERHEAD.near);
    rig.zoom(Number.NaN);
    expect(rig.top.distance).toBe(OVERHEAD.near);
    expect(rig.distance).toBe(was);
  });

  it('gives back the view it left exactly, turned and tilted and zoomed and led as it was, and an aim view still on its way', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.setScreen(1.6);
    rig.jump(3, 4, 0);
    rig.orbit(0.9, 0.1);
    rig.zoom(-7);
    rig.aimAt({ distance: 90, tilt: 0.9, lead: 20 });
    rig.settle(0.1);
    const was = [rig.azimuth, rig.tilt, rig.distance, rig.lead, rig.aiming];
    const cam = new Camera();
    cam.aspect = 1.6;
    rig.place(cam);
    const before = [...cam.position, ...cam.target];
    rig.setOverhead(true, { bounds, distance: 400 });
    rig.pan(50, 50, 800);
    rig.zoom(-100);
    expect([rig.azimuth, rig.tilt, rig.distance, rig.lead, rig.aiming]).toEqual(was);
    rig.setOverhead(false);
    expect(rig.overhead).toBe(false);
    for (let f = 0; f < 240; f++) rig.settle(0);
    rig.place(cam);
    expect([...cam.position, ...cam.target]).toEqual(before);
    expect([rig.azimuth, rig.tilt, rig.distance, rig.lead, rig.aiming]).toEqual(was);
  });

  it('keeps the turn it had while it is on, and a turn begun is carried on underneath', () => {
    const { rig } = above(1.6, bounds, 0.5);
    expect(rig.azimuth).toBe(0.5);
    rig.turnTo(1.5);
    for (let f = 0; f < 240; f++) rig.settle(1 / 60);
    expect(rig.azimuth).toBe(1.5);
  });

  it('blends in and out within two seconds, and by the same road at thirty frames a second as at a hundred and forty', () => {
    const run = (dt: number, on: boolean, from: number) => {
      const rig = new CameraRig();
      rig.setOverhead(true, { bounds, distance: 300 });
      if (from) for (let f = 0; f < 600; f++) rig.settle(1 / 60);
      rig.setOverhead(on);
      const at: number[] = [];
      for (let t = 0; t < 2; t += dt) {
        rig.settle(dt);
        if (Math.abs(t - 0.5) < dt / 2) at.push(rig.blend);
      }
      return { k: rig.blend, at };
    };
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      expect(run(dt, true, 0).k, `in at ${dt}`).toBe(1);
      expect(run(dt, false, 1).k, `out at ${dt}`).toBe(0);
    }
    const slow = run(1 / 30, true, 0).at[0],
      fast = run(1 / 144, true, 0).at[0];
    expect(Math.abs(slow - fast)).toBeLessThan(0.05);
    expect(slow).toBeGreaterThan(0.5);
    expect(slow).toBeLessThan(1);
  });

  it('is not switched on without a hole to fit to, or to a fit that is not one', () => {
    const rig = new CameraRig();
    expect(rig.setOverhead(true)).toBe(false);
    expect(rig.setOverhead(true, { bounds: { minX: 0, minY: 0, maxX: Number.NaN, maxY: 1 }, distance: 100 })).toBe(
      false,
    );
    expect(rig.setOverhead(true, { bounds, distance: Number.POSITIVE_INFINITY })).toBe(false);
    expect(rig.overhead).toBe(false);
    expect(rig.setOverhead(true, { bounds, distance: 100 })).toBe(true);
    // switched on again without a fit, it keeps the one it had
    rig.setOverhead(false);
    expect(rig.setOverhead(true)).toBe(true);
  });

  it('fits a bigger hole further back and a narrower screen further back for a wide hole, and no further than it goes', () => {
    expect(overheadFit(bounds, 0, 1.6)).toBeLessThan(overheadFit({ ...bounds, maxY: 450 }, 0, 1.6));
    const wide = { minX: -300, minY: -50, maxX: 300, maxY: 50 };
    expect(overheadFit(wide, 0, 0.465)).toBeGreaterThan(overheadFit(wide, 0, 1.6));
    expect(overheadFit({ minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 }, 0, 1.6)).toBe(OVERHEAD.far);
  });
});

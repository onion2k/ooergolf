/**
 * The view a golf shot is aimed from: stood back and tipped lower as far as the club needs, so the place it lands is on
 * the screen. A player who cannot see where a shot would come down cannot play it.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { AIM, aimView, markScale } from '../src/aimview';
import { BAG } from '../src/bag';
import { CameraRig, LEAD, TILT, VIEW } from '../src/camera';
import { carryFrom } from '../src/flight';
import { LIE } from '../src/surfaces';

function ndc(c: Camera, x: number, y: number, z: number): [number, number] {
  const m = c.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
}

const LOFTED = BAG.filter((c) => c.loft > 0);
const ASPECTS = [1.6, 1.0, 400 / 860];

/** The rig put where aim view says, the ball on the ground at the origin, the way up the course being +y. */
function seen(reach: number, aspect: number) {
  const rig = new CameraRig();
  rig.setGolf(true);
  const goal = aimView(reach, aspect);
  rig.distance = goal.distance;
  rig.tilt = goal.tilt;
  rig.lead = goal.lead;
  const cam = new Camera();
  cam.fov = rig.fov;
  cam.aspect = aspect;
  rig.jump(0, 0, 0);
  rig.place(cam);
  cam.update();
  return { rig, cam, goal };
}

describe('the aim view', () => {
  for (const aspect of ASPECTS) {
    for (const club of LOFTED) {
      it(`shows where a ${club.id} comes down at full power, on screen and well up it, at aspect ${aspect.toFixed(2)}`, () => {
        const landing = carryFrom(club, 1, LIE.fairway) * 1.04;
        const { cam } = seen(landing, aspect);
        const [, top] = ndc(cam, 0, landing, 0);
        expect(top, 'the landing is on the screen').toBeLessThan(0.92);
        expect(top, 'and is not a speck down the middle of it').toBeGreaterThan(0.45);
        // the ball is on the screen too, low down, with room to be dragged from
        const [bx, by] = ndc(cam, 0, 0, 1);
        expect(Math.abs(bx)).toBeLessThan(0.3);
        expect(by).toBeGreaterThan(-0.9);
        expect(by).toBeLessThan(0);
      });
    }

    it(`never stands the camera further than the limit, nor tips it past its lowest, at aspect ${aspect.toFixed(2)}`, () => {
      for (const reach of [0, 40, 80, 150, 250, 400, 900]) {
        const g = aimView(reach, aspect);
        const tall = Math.sqrt(Math.max(1, 1.25 / aspect));
        expect(g.distance * tall, `${reach}`).toBeLessThanOrEqual(AIM.far + 1e-9);
        expect(g.distance).toBeGreaterThanOrEqual(VIEW.home - 1e-9);
        expect(g.tilt).toBeGreaterThanOrEqual(TILT.home - 1e-9);
        expect(g.tilt).toBeLessThanOrEqual(TILT.most + 1e-9);
      }
    });
  }

  it('puts the landing lower down a screen that is tall, where the words across the top take the width, and at the top of a wide one', () => {
    // a five iron, which the 200 back the camera may stand leaves room for: a driver on a phone is at that limit, and no lower
    const landing = carryFrom(LOFTED[2], 1, LIE.fairway) * 1.04;
    const wide = ndc(seen(landing, 1.6).cam, 0, landing, 0)[1];
    const tall = ndc(seen(landing, 400 / 860).cam, 0, landing, 0)[1];
    expect(wide, 'the top of a wide screen').toBeGreaterThan(0.8);
    expect(tall, 'a tall screen, where the coins and the shop are across the top').toBeLessThan(0.78);
    expect(tall).toBeGreaterThan(0.6);
    const driver = carryFrom(LOFTED[0], 1, LIE.fairway) * 1.04;
    expect(ndc(seen(driver, 400 / 860).cam, 0, driver, 0)[1], 'the most a phone can do for a drive').toBeLessThan(0.9);
  });

  it('stands back a little more for each club that goes further, and never nearer', () => {
    for (const aspect of ASPECTS) {
      let last = 0;
      for (const reach of [20, 60, 100, 150, 200, 250, 300]) {
        const g = aimView(reach, aspect);
        const tall = Math.sqrt(Math.max(1, 1.25 / aspect));
        const r = g.distance * tall;
        expect(r, `${reach} at ${aspect}`).toBeGreaterThanOrEqual(last - 1e-9);
        last = r;
      }
    }
  });

  it('is the home view for a shot short enough to be seen from it, as every hole has always begun', () => {
    const g = aimView(20, 1.6);
    expect(g.distance).toBeCloseTo(VIEW.home, 9);
    expect(g.tilt).toBeCloseTo(TILT.home, 9);
  });

  it("puts a driver's landing in view within the 200 the camera may stand back, which the plan's 110 could not", () => {
    const landing = carryFrom(LOFTED[0], 1, LIE.fairway) * 1.04;
    const { rig, goal } = seen(landing, 1.6);
    expect(rig.distance).toBeGreaterThan(VIEW.far);
    expect(goal.distance).toBeLessThanOrEqual(AIM.far);
  });

  it("has the marks of the preview grow as the camera stands back, from their own size at home, so they read from a drive's view", () => {
    expect(markScale(VIEW.home)).toBe(1);
    expect(markScale(10)).toBe(1);
    let last = 1;
    for (const r of [80, 120, 160, 200]) {
      expect(markScale(r)).toBeGreaterThan(last);
      last = markScale(r);
    }
    // a dot stays readable at 200 back without being a beach ball: two or three times as big
    expect(markScale(200)).toBeGreaterThan(2);
    expect(markScale(200)).toBeLessThan(3);
  });

  it('is worked out from the reach and the screen alone: the same every time', () => {
    expect(aimView(180, 1.6)).toEqual(aimView(180, 1.6));
  });

  it('keeps the lead the camera looks ahead of the ball by, which the view above is worked with', () => {
    expect(LEAD).toBe(10);
  });
});

describe('the camera on a golf hole', () => {
  it('may be zoomed back to 200, where minigolf stops at 110, and is never further from what it looks at than that', () => {
    const mini = new CameraRig();
    mini.zoom(1e6);
    expect(mini.distance).toBe(VIEW.far);
    const golf = new CameraRig();
    golf.setGolf(true);
    golf.zoom(1e6);
    expect(golf.distance).toBe(200);
    // a tall screen stands it further back than its distance, and the limit holds there too
    for (const aspect of ASPECTS) {
      const cam = new Camera();
      cam.fov = golf.fov;
      cam.aspect = aspect;
      golf.jump(0, 0, 0);
      golf.place(cam);
      const d = Math.hypot(
        cam.position[0] - cam.target[0],
        cam.position[1] - cam.target[1],
        cam.position[2] - cam.target[2],
      );
      expect(d, `${aspect}`).toBeLessThanOrEqual(200 + 1e-6);
    }
  });

  it('puts the limits back for a hole of minigolf, and brings a view zoomed past them back within', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.zoom(1e6);
    rig.setGolf(false);
    expect(rig.distance).toBe(VIEW.far);
  });

  it('eases to a view it is sent to, without limit of turn and without overshoot, and is there in a couple of seconds', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.aimAt({ distance: 150, tilt: 0.95 });
    let last = rig.distance;
    for (let f = 0; f < 120; f++) {
      rig.settle(1 / 60);
      expect(rig.distance).toBeGreaterThanOrEqual(last - 1e-9);
      expect(rig.distance).toBeLessThanOrEqual(150 + 1e-9);
      last = rig.distance;
    }
    expect(rig.distance).toBeCloseTo(150, 0);
    expect(rig.tilt).toBeCloseTo(0.95, 1);
    expect(rig.aiming).toBe(false);
  });

  it('is the same on a slow frame as on a fast one: eased by the time that has passed and not by the frames', () => {
    const a = new CameraRig(),
      b = new CameraRig();
    for (const r of [a, b]) {
      r.setGolf(true);
      r.aimAt({ distance: 150, tilt: 0.95 });
    }
    for (let f = 0; f < 30; f++) a.settle(1 / 60);
    for (let f = 0; f < 15; f++) b.settle(1 / 30);
    expect(a.distance).toBeCloseTo(b.distance, 6);
    expect(a.tilt).toBeCloseTo(b.tilt, 6);
  });

  it('hands the camera back to the player the moment they zoom or turn it, and eases no more', () => {
    for (const touch of [(r: CameraRig) => r.zoom(5), (r: CameraRig) => r.orbit(0, 0.1)]) {
      const rig = new CameraRig();
      rig.setGolf(true);
      rig.aimAt({ distance: 150, tilt: 0.95 });
      rig.settle(0.1);
      touch(rig);
      const d = rig.distance,
        t = rig.tilt;
      expect(rig.aiming).toBe(false);
      rig.settle(1);
      expect([rig.distance, rig.tilt]).toEqual([d, t]);
    }
  });

  it("leaves the turn alone: it eases the distance and the tilt, and the way the camera faces is the player's", () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.orbit(1.1, 0);
    rig.aimAt({ distance: 150, tilt: 0.95 });
    for (let f = 0; f < 60; f++) rig.settle(1 / 60);
    expect(rig.azimuth).toBeCloseTo(1.1, 9);
  });

  it('refuses a goal that is not a number, or that is past its limits, by holding it within them', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.aimAt({ distance: 5000, tilt: 9 });
    for (let f = 0; f < 600; f++) rig.settle(1 / 60);
    expect(rig.distance).toBeLessThanOrEqual(200);
    expect(rig.tilt).toBeLessThanOrEqual(TILT.most);
    const before = [rig.distance, rig.tilt];
    rig.aimAt({ distance: NaN, tilt: NaN });
    rig.settle(1);
    expect([rig.distance, rig.tilt]).toEqual(before);
  });
});

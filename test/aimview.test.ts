/**
 * The view a golf shot is aimed from: stood back and tipped lower as far as the club needs, so the place it lands is on
 * the screen. A player who cannot see where a shot would come down cannot play it.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { AIM, CHROME, aimView, markScale } from '../src/aimview';
import { BAG } from '../src/bag';
import { CameraRig, LEAD, TILT, VIEW, phoneOf, standOf, tallOf } from '../src/camera';
import { MARK } from '../src/marker';
import { ARC } from '../src/scene';
import { carryFrom } from '../src/flight';
import { WIND, windReach } from '../src/shaping';
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

    for (const club of LOFTED) {
      for (const extra of [10, 25]) {
        it(`still shows where a ${club.id} comes down with a tailwind that carries it ${extra} yards further, at aspect ${aspect.toFixed(2)}`, () => {
          // the page adds how much further a tailwind carries a shot to the reach it aims the camera for
          const landing = carryFrom(club, 1, LIE.fairway) * 1.04 + extra;
          const { cam } = seen(landing, aspect);
          const [, top] = ndc(cam, 0, landing, 0);
          expect(top, 'the landing is on the screen').toBeLessThan(0.92);
          expect(top, 'and is not a speck down the middle of it').toBeGreaterThan(0.45);
          const [bx, by] = ndc(cam, 0, 0, 1);
          expect(Math.abs(bx)).toBeLessThan(0.3);
          expect(by).toBeGreaterThan(-0.9);
        });
      }

      it(`stands the camera back for the strongest tailwind there is, and never nearer, for the ${club.id}, at aspect ${aspect.toFixed(2)}`, () => {
        const reach = carryFrom(club, 1, LIE.fairway) * 1.04;
        const wind = windReach(club, 1, WIND.most);
        expect(wind, 'a tailwind never shortens the reach').toBeGreaterThanOrEqual(0);
        const calm = aimView(reach, aspect),
          blown = aimView(reach + wind, aspect);
        expect(blown.distance * tallOf(aspect)).toBeGreaterThanOrEqual(calm.distance * tallOf(aspect) - 1e-9);
        const { cam } = seen(reach + wind, aspect);
        expect(ndc(cam, 0, reach + wind, 0)[1], 'its landing is on the screen').toBeLessThan(0.92);
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

/** The phones the page is looked at on, upright: width and height in pixels. */
const PHONES: [number, number][] = [
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
];

/** The rig put where the aim view says for a screen `w` by `h`, as the page does, and where the ring's far edge and the ball are, in pixels down the page. */
function onPhone(reach: number, w: number, h: number, phone = true) {
  const aspect = w / h;
  const goal = phone ? aimView(reach, aspect, h) : aimView(reach, aspect);
  const rig = new CameraRig();
  rig.setGolf(true);
  rig.setScreen(aspect);
  rig.aimAt(goal, true);
  const cam = new Camera();
  cam.fov = rig.fov;
  cam.aspect = aspect;
  rig.jump(0, 0, 0);
  rig.place(cam);
  cam.update();
  const r = Math.hypot(
    cam.position[0] - cam.target[0],
    cam.position[1] - cam.target[1],
    cam.position[2] - cam.target[2],
  );
  const px = (y: number) => ((1 - y) / 2) * h;
  const edge = reach + AIM.ring * markScale(r);
  return { goal, r, ring: px(ndc(cam, 0, edge, 0)[1]), ball: px(ndc(cam, 0, 0, 0)[1]) };
}

describe('the aim view on a phone held upright', () => {
  it('draws the ring at the size the scene draws it, which the view allows for', () => {
    expect(AIM.ring).toBeCloseTo(MARK.radius * ARC.ring, 1);
  });

  for (const [w, h] of PHONES) {
    for (const club of LOFTED.slice(0, 3)) {
      it(`puts the far edge of the ${club.id}'s ring below the words across the top, on ${w} by ${h}, with the ball above the bag`, () => {
        const reach = carryFrom(club, 1, LIE.fairway) * 1.045;
        const { ring, ball } = onPhone(reach, w, h);
        expect(ring, 'the ring is below the coins, the shop and the switch').toBeGreaterThanOrEqual(CHROME.top - 2);
        // as clear of the bag as the page leaves it: no lower than where the old view put it, or than the bag's margin
        const before = onPhone(reach, w, h, false).ball;
        expect(ball, 'the ball is no lower than the bag allows or than it was').toBeLessThanOrEqual(
          Math.max(h - CHROME.bottom, before) + 1,
        );
      });
    }

    it(`puts every club's ring below the words, on ${w} by ${h}, for a tailwind that carries it 20 yards further too`, () => {
      for (const club of LOFTED) {
        const { ring } = onPhone(carryFrom(club, 1, LIE.fairway) * 1.045 + 20, w, h);
        expect(ring, club.id).toBeGreaterThanOrEqual(CHROME.top - 2);
      }
    });
  }

  it('stands no further back than the phone limit, and a desk and a tablet no further than the old 200', () => {
    for (const [w, h] of PHONES)
      for (const reach of [0, 100, 250, 600]) expect(onPhone(reach, w, h).r).toBeLessThanOrEqual(VIEW.phoneFar + 1e-6);
    for (const aspect of [1.6, 1.25, 1, 768 / 1024]) expect(standOf(aspect)).toBe(VIEW.golfFar);
    expect(standOf(360 / 640)).toBe(VIEW.phoneFar);
    expect(phoneOf(1.6)).toBe(0);
    expect(phoneOf(0.4)).toBe(1);
  });

  it('lets the zoom reach as far as the camera may stand once a phone has pushed it back, and a desk no further than it did', () => {
    const phone = new CameraRig();
    phone.setGolf(true);
    phone.setScreen(360 / 640);
    expect(phone.far * tallOf(360 / 640)).toBeCloseTo(VIEW.phoneFar, 6);
    phone.zoom(1e6);
    expect(phone.distance).toBe(phone.far);
    for (const aspect of [1.6, 1, 768 / 1024]) {
      const desk = new CameraRig();
      desk.setGolf(true);
      desk.setScreen(aspect);
      expect(desk.far, `${aspect}`).toBe(VIEW.golfFar);
    }
    const mini = new CameraRig();
    mini.setScreen(360 / 640);
    expect(mini.far).toBe(VIEW.far);
  });

  it('is the old view to the digit when the screen is not a phone, whatever its height', () => {
    for (const aspect of [1.6, 1.0, 768 / 1024])
      for (const reach of [20, 100, 175, 251, 400]) expect(aimView(reach, aspect, 900)).toEqual(aimView(reach, aspect));
  });

  it('stands back a little more for each club that goes further, and never nearer, on a phone', () => {
    for (const [w, h] of PHONES) {
      let last = 0;
      for (const reach of [20, 60, 100, 150, 200, 250, 300]) {
        const { r } = onPhone(reach, w, h);
        expect(r, `${reach} on ${w} by ${h}`).toBeGreaterThanOrEqual(last - 1e-6);
        last = r;
      }
    }
  });

  it('is worked out from the reach and the screen alone: the same every time', () => {
    expect(aimView(250, 390 / 844, 844)).toEqual(aimView(250, 390 / 844, 844));
  });

  it('gives a goal the camera takes whole: the ball low, never above where it was', () => {
    for (const [w, h] of PHONES) {
      const g = aimView(250, w / h, h);
      expect(g.lead).toBeGreaterThanOrEqual(LEAD);
      expect(Number.isFinite(g.distance + g.tilt + g.lead)).toBe(true);
    }
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
      expect(d, `${aspect}`).toBeLessThanOrEqual(standOf(aspect) + 1e-6);
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

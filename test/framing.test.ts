/**
 * The framing: whatever else the camera is doing, the ball and the furthest place a shot can reach are on the screen, in a
 * safe box that keeps clear of the edges and of the words across a phone's top. The box, the minigolf reach the golf's
 * carry has a twin of, the floor the zoom may not pass, and the director that sends the camera to show them.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { layoutOf, rollsFor } from '../src/arena';
import { AIM, CHROME, aimView, reachOnMinigolf, safeBox } from '../src/aimview';
import { BAG } from '../src/bag';
import { CameraRig, LEAD, TILT, VIEW, tallOf } from '../src/camera';
import type { HoleDef } from '../src/course';
import { Director } from '../src/director';
import { framingProblems } from '../src/invariants';
import { field, golfGame, newGame, DT } from './helpers';

/** The screens the framing is held on: width over height and the page's height, a desk, a square, a phone and a short phone. */
const SCREENS: [number, number][] = [
  [1.6, 800],
  [1.0, 800],
  [400 / 860, 860],
  [400 / 860, 640],
];

/** Where a point is drawn, from minus one to one each way. */
function ndc(c: Camera, x: number, y: number, z: number): [number, number] {
  const m = c.viewProjection;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
}

describe('the safe box', () => {
  it('has the top the aim view has always put the landing under, to the digit', () => {
    // a wide screen's, a phone's with its height unknown, and a phone's with the words across its top
    expect(safeBox(1.6, 800).top).toBe(AIM.top.wide);
    expect(safeBox(1.6, 0).top).toBe(AIM.top.wide);
    expect(safeBox(400 / 860, 0).top).toBeCloseTo(AIM.top.tall + (AIM.top.wide - AIM.top.tall) * 0, 1);
    const phone = safeBox(400 / 860, 860);
    expect(phone.top).toBeCloseTo(1 - (2 * CHROME.top) / 860, 9);
    expect(phone.top).toBeLessThan(AIM.top.tall + 0.05);
  });

  it('is nine tenths across, and a tenth up from the foot', () => {
    for (const [aspect, height] of SCREENS) {
      const box = safeBox(aspect, height);
      expect(box.x).toBe(0.9);
      expect(box.bottom).toBe(-0.9);
      expect(box.top).toBeGreaterThan(0.4);
      expect(box.top).toBeLessThan(1);
    }
  });

  it('is what the aim view is worked from: its landing comes out at the box top or below it', () => {
    for (const [aspect, height] of SCREENS) {
      const box = safeBox(aspect, height);
      for (const reach of [80, 150, 250]) {
        const view = aimView(reach, aspect, height);
        const rig = new CameraRig();
        rig.setGolf(true);
        rig.setScreen(aspect);
        rig.aimAt(view, true);
        const cam = new Camera();
        cam.fov = rig.fov;
        cam.aspect = aspect;
        rig.jump(0, 0, 0);
        rig.place(cam);
        cam.update();
        // a reach too far for the furthest the camera may stand gets that view, which is the best there is
        if (!rig.atLimit)
          expect(ndc(cam, 0, reach, 0)[1], `${reach} at ${aspect}, ${height}`).toBeLessThanOrEqual(box.top + 1e-6);
      }
    }
  });
});

describe('the aim view with a limit of its own', () => {
  it('is what it was without one, and stands no further back than the limit with one, tall screen and all', () => {
    // the limit is of the camera itself, tall screen and all, which is how far the zoom lets it go on that screen
    for (const [aspect, height] of SCREENS) {
      for (const reach of [20, 120, 400]) {
        expect(aimView(reach, aspect, height, {})).toEqual(aimView(reach, aspect, height));
        const near = aimView(reach, aspect, height, { far: VIEW.far * tallOf(aspect) });
        expect(near.distance * tallOf(aspect), `${reach} at ${aspect}`).toBeLessThanOrEqual(
          VIEW.far * tallOf(aspect) + 1e-9,
        );
      }
    }
  });
});

/** A hole of minigolf drawn as a map, centred on the origin. */
const BOX: HoleDef = {
  name: 'Framing box',
  par: 2,
  map: ['#########', '#...C...#', '#.......#', '#.......#', '#...T...#', '#########'],
};
/** An open hole of minigolf, forty tiles across and sixty-two long, with the tee at the south and the cup a long way north. */
const OPEN: HoleDef = {
  name: 'Framing open',
  par: 3,
  map: Array.from({ length: 64 }, (_, r) =>
    r === 0 || r === 63
      ? '#'.repeat(41)
      : r === 1
        ? '#' + '.'.repeat(15) + 'C' + '.'.repeat(24) + '#'
        : r === 60
          ? '#' + '.'.repeat(19) + 'T' + '.'.repeat(20) + '#'
          : '#' + '.'.repeat(39) + '#',
  ),
};

describe('the reach of a putt', () => {
  it('stops at the first rail along the aim, on a boxed hole, at sixteen headings', () => {
    const layout = layoutOf(BOX.map);
    const { x, y } = layout.tee;
    for (let k = 0; k < 16; k++) {
      const angle = (k * Math.PI) / 8;
      const reach = reachOnMinigolf(layout, x, y, angle, 500);
      const wall = Math.min(
        Math.cos(angle) > 1e-9
          ? (layout.bounds.maxX - x) / Math.cos(angle)
          : Math.cos(angle) < -1e-9
            ? (layout.bounds.minX - x) / Math.cos(angle)
            : Infinity,
        Math.sin(angle) > 1e-9
          ? (layout.bounds.maxY - y) / Math.sin(angle)
          : Math.sin(angle) < -1e-9
            ? (layout.bounds.minY - y) / Math.sin(angle)
            : Infinity,
      );
      expect(reach, `${k}`).toBeLessThanOrEqual(wall + 0.3);
      expect(reach, `${k}`).toBeGreaterThan(wall - 1.8);
    }
  });

  it('is the whole of the roll on an open hole, and never more', () => {
    const layout = layoutOf(OPEN.map);
    const { x, y } = layout.tee;
    for (const roll of [20, 50, 72]) expect(reachOnMinigolf(layout, x, y, Math.PI / 2, roll)).toBe(roll);
    expect(reachOnMinigolf(layout, x, y, 0.3, 0)).toBe(0);
  });

  it('is nought for a place that is not on the hole, and never not a number', () => {
    const layout = layoutOf(BOX.map);
    expect(reachOnMinigolf(layout, 1e6, 1e6, 0, 50)).toBe(0);
    expect(reachOnMinigolf(layout, 0, 0, Number.NaN, 50)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(reachOnMinigolf(layout, 0, 0, Number.NaN, 50))).toBe(true);
  });
});

describe('the furthest the camera may stand', () => {
  it('is known to the rig, which says when it is there and so cannot do better', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.setScreen(1.0);
    rig.aimAt(aimView(100, 1.0, 800), true);
    expect(rig.atLimit).toBe(false);
    rig.aimAt(aimView(400, 1.0, 800), true);
    expect(rig.atLimit).toBe(true);
    rig.setScreen(1.6);
    rig.aimAt({ distance: 120, tilt: 0.9 }, true);
    expect(rig.atLimit).toBe(false);
  });
});

describe('the zoom floor', () => {
  it('is the distance of the aim view the rig was sent to: zoomed out as far as is wanted, and in no nearer', () => {
    const rig = new CameraRig();
    rig.setGolf(true);
    rig.aimAt({ distance: 120, tilt: 0.9, lead: 20 }, true);
    rig.zoom(-100);
    expect(rig.distance).toBe(120);
    rig.zoom(30);
    expect(rig.distance).toBe(150);
    rig.zoom(-10);
    expect(rig.distance).toBe(140);
    rig.zoom(1e6);
    expect(rig.distance).toBe(rig.far);
  });

  it('may be set lower than the view it is sent to, and is let go of by a new hole', () => {
    const rig = new CameraRig();
    rig.aimAt({ distance: 90, tilt: 0.9, lead: 20, floor: 50 }, true);
    rig.zoom(-100);
    expect(rig.distance).toBe(50);
    rig.setGolf(true);
    rig.zoom(-100);
    expect(rig.distance).toBe(VIEW.near);
  });

  it('is nought for a camera that was never sent anywhere, and for one a test parks', () => {
    const rig = new CameraRig();
    rig.zoom(-1000);
    expect(rig.distance).toBe(VIEW.near);
    expect(rig.floor).toBe(0);
  });
});

/** The camera as the page places it for `rig`, on a screen of `aspect`. */
function placed(rig: CameraRig, aspect: number) {
  const cam = new Camera();
  cam.fov = rig.fov;
  cam.aspect = aspect;
  rig.place(cam);
  cam.update();
  return cam;
}

/** The director's frames run until the rig is still, as far as two minutes. */
function rest(director: Director, rig: CameraRig, seconds = 8) {
  for (let f = 0; f < seconds * 60 && (f < 2 || rig.aiming || rig.turning); f++) director.frame(DT, false);
}

describe('the ball and the furthest reach are on the screen', () => {
  for (const [aspect, height] of SCREENS) {
    const box = safeBox(aspect, height);
    it(`for every club of the bag, at sixteen headings, on a screen of ${aspect.toFixed(2)} by ${height}`, () => {
      for (const club of BAG) {
        const { game } = golfGame({ ...field('f'), wind: 12 });
        const rig = new CameraRig();
        const director = new Director(rig);
        director.use(game);
        director.setScreen(aspect, height);
        director.started();
        game.pick(club.id);
        for (let k = 0; k < 16; k++) {
          const angle = (k * Math.PI) / 8;
          director.aiming({ angle, power: 1 });
          rest(director, rig);
          const cam = placed(rig, aspect);
          const { world, ball } = game;
          const reach = { x: 0, y: 0, z: 0 };
          expect(director.reachPoint(reach), club.id).toBe(true);
          const [bx, by] = ndc(cam, world.x[ball], world.y[ball], 1);
          const [rx, ry] = ndc(cam, reach.x, reach.y, reach.z);
          const why = `${club.id} at ${k}, ${aspect.toFixed(2)} by ${height}: ball ${bx.toFixed(2)},${by.toFixed(2)} reach ${rx.toFixed(2)},${ry.toFixed(2)}`;
          expect(Math.abs(bx), why).toBeLessThanOrEqual(box.x + 0.02);
          expect(by, why).toBeGreaterThanOrEqual(box.bottom - 0.02);
          expect(by, why).toBeLessThanOrEqual(box.top + 0.02);
          expect(Math.abs(rx), why).toBeLessThanOrEqual(box.x + 0.02);
          expect(ry, why).toBeGreaterThanOrEqual(box.bottom - 0.02);
          if (!rig.atLimit) expect(ry, why).toBeLessThanOrEqual(box.top + 0.02);
          expect(framingProblems(rig, cam, { x: world.x[ball], y: world.y[ball], z: 1 }, reach, box), why).toEqual([]);
        }
      }
    });
  }

  it('keeps the reach on the screen when a zoom is tried that would push it out, which the floor refuses', () => {
    const { game } = golfGame(field('f'));
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(1.6, 800);
    director.started();
    rest(director, rig);
    rig.zoom(-1000);
    const cam = placed(rig, 1.6);
    const reach = { x: 0, y: 0, z: 0 };
    director.reachPoint(reach);
    const { world, ball } = game;
    expect(framingProblems(rig, cam, { x: world.x[ball], y: world.y[ball], z: 1 }, reach, safeBox(1.6, 800))).toEqual(
      [],
    );
  });
});

describe('the minigolf aim view', () => {
  /** A director on a hole of minigolf, with the putter of the save in hand. */
  function onMinigolf(hole: HoleDef, aspect = 1.6, height = 800, club = 'putter', owns: string[] = []) {
    const save =
      club === 'putter' && !owns.length ? null : JSON.stringify({ coins: 0, gems: 0, owned: [club, ...owns], club });
    const { game } = newGame(1, save, [hole]);
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(aspect, height);
    director.started();
    return { game, rig, director };
  }

  it('leaves the camera at home exactly, with the lead it has always had, when the reach fits there', () => {
    const { rig, director } = onMinigolf(BOX);
    rest(director, rig);
    expect([rig.distance, rig.tilt, rig.lead]).toEqual([VIEW.home, TILT.home, LEAD]);
    expect(rig.aiming).toBe(false);
    // and turned to any heading it stays there: the reach is short in a box
    for (const angle of [0, 1, 2, 3, 4, 5]) {
      director.aiming({ angle, power: 1 });
      rest(director, rig);
      expect([rig.distance, rig.tilt, rig.lead]).toEqual([VIEW.home, TILT.home, LEAD]);
    }
  });

  it('stands back no further than 110 for the longest putt there is on an open hole, and shows where it stops', () => {
    for (const [aspect, height] of SCREENS) {
      const { game, rig, director } = onMinigolf(OPEN, aspect, height, 'gold');
      director.aiming({ angle: Math.PI / 2, power: 1 });
      rest(director, rig);
      expect(rig.distance, `${aspect}`).toBeLessThanOrEqual(VIEW.far + 1e-6);
      const cam = placed(rig, aspect);
      const reach = { x: 0, y: 0, z: 0 };
      expect(director.reachPoint(reach)).toBe(true);
      expect(Math.hypot(reach.x - game.world.x[game.ball], reach.y - game.world.y[game.ball])).toBeCloseTo(
        rollsFor(game.hardest),
        6,
      );
      const box = safeBox(aspect, height);
      const [, ry] = ndc(cam, reach.x, reach.y, reach.z);
      expect(ry, `${aspect} by ${height}`).toBeLessThanOrEqual(box.top + 0.02);
    }
  });

  it('is worked out again when a harder putter is put in hand, since the reach is its roll and the ball and the heading have not moved', () => {
    for (const [aspect, height] of SCREENS) {
      const { game, rig, director } = onMinigolf(OPEN, aspect, height, 'putter', ['gold']);
      director.aiming({ angle: Math.PI / 2, power: 1 });
      rest(director, rig);
      const before = rig.distance;
      expect(game.equip('gold')).toBe(true);
      // the page tells the director nothing of an equip: the next frame has to see the reach is longer
      rest(director, rig);
      const cam = placed(rig, aspect);
      const reach = { x: 0, y: 0, z: 0 };
      expect(director.reachPoint(reach)).toBe(true);
      const [, ry] = ndc(cam, reach.x, reach.y, reach.z);
      expect(ry, `${aspect} by ${height}: the longer reach is on the screen`).toBeLessThanOrEqual(
        safeBox(aspect, height).top + 0.02,
      );
      expect(rig.distance, `${aspect} by ${height}: stood further back for it`).toBeGreaterThan(before);
    }
  });

  it('leaves a camera a test has parked where it was put, on a hole of minigolf, and does not zoom it out to frame the reach', () => {
    const { rig, director } = onMinigolf(OPEN, 1.6, 800, 'gold');
    // parked as the test API's `look` parks it: close to, with no floor of its own
    rig.aimAt({ distance: 30, tilt: TILT.home, lead: LEAD, floor: 0 }, true);
    for (let f = 0; f < 120; f++) director.frame(DT, true);
    expect(rig.distance).toBe(30);
    expect(rig.aiming).toBe(false);
  });

  it('does not move the camera on a hole of minigolf while the ball rolls: it follows as it always did', () => {
    const { game, rig, director } = onMinigolf(OPEN, 1.6, 800, 'gold');
    rest(director, rig);
    game.shoot(Math.PI / 2, 1);
    const [d, t, l] = [rig.distance, rig.tilt, rig.lead];
    for (let f = 0; f < 60; f++) {
      game.step(DT);
      director.frame(DT, false);
    }
    expect([rig.distance, rig.tilt, rig.lead]).toEqual([d, t, l]);
  });
});

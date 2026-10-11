/**
 * The fly-in: each hole begun with the camera low behind the tee, looking down the hole to the horizon as the title
 * picture does, held there a moment and eased up to the view a shot is played from. It is the only view that sees the
 * world beyond a hole, so it is held to showing the horizon at its start and to the play view exactly at its end; a
 * player who drags, presses the flag or the Overhead button, or strikes, cuts it short with no jump. Each rule has its
 * test, and each test has been seen to fail with the rule put back.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { aimView, reachOf } from '../src/aimview';
import { BAG } from '../src/bag';
import { CLIP, CameraRig, FLY_IN, SKY_TILT, TILT, VIEW, seesSky } from '../src/camera';
import { Director } from '../src/director';
import { flyInProblems } from '../src/invariants';
import { LIE } from '../src/surfaces';
import { DT, golfGame, newGame, FLAT } from './helpers';

const ASPECT = 1.6;

/** A camera placed by `rig` at game time `t`. */
function placed(rig: CameraRig, t: number): Camera {
  const cam = new Camera();
  cam.fov = rig.fov;
  cam.aspect = ASPECT;
  cam.far = rig.farPlaneAt(t);
  rig.place(cam, t);
  cam.update();
  return cam;
}

/** How high the top of the screen looks, as the sine of its elevation: above nought, the horizon is on the screen. */
function topLooks(cam: Camera): number {
  const f = cam.target.map((v, k) => v - cam.position[k]);
  const l = Math.hypot(f[0], f[1], f[2]);
  const pitch = Math.asin(f[2] / l);
  return Math.sin(pitch + (cam.fov * Math.PI) / 360);
}

const AHEAD: [number, number, number] = [0, 40, 0];

describe('the fly-in on the rig', () => {
  it('begins low behind the tee with the horizon on the screen, and is held there a moment', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 10, AHEAD);
    for (const t of [10, 10 + FLY_IN.hold * 0.9]) {
      const cam = placed(rig, t);
      expect(topLooks(cam), `at ${t}`).toBeGreaterThan(0.1);
      expect(rig.view(t).tilt).toBeCloseTo(FLY_IN.tilt, 6);
      expect(rig.flying(t)).toBe(true);
    }
  });

  it('is never tilted past its own tilt by an aim view that is sent while it flies (a club changed in the first frame)', () => {
    // found 9 October 2026 by the fuzzer on The Links, seed 30: the fly-in eased from its tilt less the play view's tilt as it
    // was at the start, and the aim view then moved the play view's tilt, so the fly-in began that much past its own
    const rig = new CameraRig();
    rig.aimAt({ distance: 80, tilt: 0.7 }, true);
    rig.flyIn(0, 0, 0, 10, AHEAD);
    rig.aimAt({ distance: 120, tilt: 0.9 });
    for (let f = 0; f < 90; f++) {
      const t = 10 + f * DT;
      rig.settle(DT);
      expect(rig.view(t).tilt, `at frame ${f}`).toBeLessThanOrEqual(FLY_IN.tilt + 1e-9);
      expect(flyInProblems(rig, t, 10), `at frame ${f}`).toEqual([]);
    }
    // and it is where it was sent when it is over
    const end = 10 + FLY_IN.hold + FLY_IN.time;
    for (let f = 0; f < 600; f++) rig.settle(DT);
    expect(rig.view(end).tilt).toBeCloseTo(0.9, 6);
  });

  it('ends exactly at the view a hole begun with no fly-in has, and is over by its hold and its time', () => {
    const a = new CameraRig(),
      b = new CameraRig();
    a.flyIn(3, 4, 0, 10, AHEAD);
    b.jump(3, 4, 0);
    const end = 10 + FLY_IN.hold + FLY_IN.time;
    const ca = placed(a, end),
      cb = placed(b, end);
    for (let k = 0; k < 3; k++) {
      expect(ca.position[k]).toBeCloseTo(cb.position[k], 6);
      expect(ca.target[k]).toBeCloseTo(cb.target[k], 6);
    }
    expect(a.flying(end)).toBe(false);
    expect(a.flying(end - 0.05)).toBe(true);
  });

  it('eases with no jump: the camera moves a little each frame all the way', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    let last = placed(rig, 0).position;
    for (let t = DT; t < FLY_IN.hold + FLY_IN.time + 0.2; t += DT) {
      const now = placed(rig, t).position;
      expect(Math.hypot(...now.map((v, k) => v - last[k])), `at ${t.toFixed(2)}`).toBeLessThan(3);
      last = now;
    }
  });

  it('cut short, eases the rest away quickly and with no jump', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    const at = FLY_IN.hold + 0.3;
    const before = placed(rig, at).position;
    rig.cutShort(at);
    const after = placed(rig, at).position;
    expect(Math.hypot(...after.map((v, k) => v - before[k]))).toBeLessThan(1e-6);
    expect(rig.flying(at + FLY_IN.cut + 0.01)).toBe(false);
    const done = placed(rig, at + FLY_IN.cut + 0.01);
    const plain = new CameraRig();
    plain.jump(0, 0, 0);
    const p = placed(plain, at + FLY_IN.cut + 0.01);
    for (let k = 0; k < 3; k++) expect(done.position[k]).toBeCloseTo(p.position[k], 6);
  });

  it('cut short again every frame, as a drag held tells it, is still over in its cut time', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    const from = FLY_IN.hold + 0.3;
    for (let t = from; t < from + FLY_IN.cut + 0.05; t += DT) rig.cutShort(t);
    expect(rig.flying(from + FLY_IN.cut + 0.01)).toBe(false);
  });

  it('draws as far as the horizon while it flies, and no further than it did once it is over', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    expect(rig.farPlaneAt(0)).toBeGreaterThanOrEqual(CLIP.horizon);
    expect(rig.farPlaneAt(FLY_IN.hold + FLY_IN.time + 0.01)).toBe(CLIP.far);
  });
});

describe('the fly-in by the director', () => {
  /** A director with the fly-in on, on a hole of `game`, begun. */
  function begun(game: Parameters<Director['use']>[0]) {
    const rig = new CameraRig();
    const director = new Director(rig, { flyIn: true });
    director.use(game);
    director.setScreen(ASPECT, 800);
    director.started();
    return { rig, director };
  }

  it('flies in to every hole, golf and minigolf, the first included, looking down the hole toward the cup', () => {
    for (const game of [newGame(1).game, golfGame(FLAT.long).game]) {
      const { rig } = begun(game);
      expect(rig.flying(game.t), game.layout.golf ? 'golf' : 'minigolf').toBe(true);
      const cam = placed(rig, game.t);
      expect(topLooks(cam)).toBeGreaterThan(0.05);
      // it looks from the tee's side of the hole toward the cup's
      const { tee, cup } = game.layout;
      const look = [cam.target[0] - cam.position[0], cam.target[1] - cam.position[1]];
      expect(look[0] * (cup.x - tee.x) + look[1] * (cup.y - tee.y)).toBeGreaterThan(0);
    }
  });

  it('does not fly in where it is not asked, so a director made as before is as it was', () => {
    const game = newGame(1).game;
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.started();
    expect(rig.flying(game.t)).toBe(false);
  });

  it('is cut short by a drag, the flag button and a stroke', () => {
    for (const act of ['drag', 'flag', 'stroke'] as const) {
      const { game } = newGame(1);
      const { rig, director } = begun(game);
      director.frame(DT, false);
      expect(rig.flying(game.t), `${act}: flying before it`).toBe(true);
      if (act === 'drag') director.aiming({ angle: Math.PI / 2, power: 0.6 });
      if (act === 'flag') director.faceFlag(false);
      if (act === 'stroke') {
        game.shoot(Math.PI / 2, 0.4);
        director.struck();
      }
      expect(rig.flying(game.t + FLY_IN.cut + 0.01), act).toBe(false);
    }
  });

  it('is cut short by the overhead view', () => {
    const { game } = newGame(1);
    const { rig } = begun(game);
    expect(rig.flying(game.t)).toBe(true);
    rig.setOverhead(true, undefined, game.t);
    expect(rig.flying(game.t + FLY_IN.cut + 0.01)).toBe(false);
  });
});

describe('the fly-in by the rules', () => {
  it('holds: tilted within its own limit, and over within its hold and its time', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    for (let t = 0; t < FLY_IN.hold + FLY_IN.time + 0.5; t += 0.1) expect(flyInProblems(rig, t, 0)).toEqual([]);
  });

  it('breaks where a fly-in runs on past its hold and its time from when the hole began', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    // still flying a second in, for a hole said to have begun ten seconds before
    expect(flyInProblems(rig, 1, -10).length).toBeGreaterThan(0);
    // and it goes lower than the play view ever may, which is why it has a rule of its own
    expect(TILT.most).toBeLessThan(FLY_IN.tilt);
  });
});

describe('the sky', () => {
  /** A camera tilted `tilt` from the vertical, looking at the ground ahead of where it stands. */
  function tilted(tilt: number): Camera {
    const cam = new Camera();
    cam.fov = VIEW.fov;
    cam.aspect = ASPECT;
    cam.target = [0, 0, 0];
    cam.position = [0, -Math.sin(tilt) * 50, Math.cos(tilt) * 50];
    cam.update();
    return cam;
  }

  it('is seen by a view exactly when the top of its screen looks above the horizon, at every tilt', () => {
    let above = 0,
      below = 0;
    for (let tilt = 0.05; tilt < 1.55; tilt += 0.01) {
      const sees = topLooks(tilted(tilt)) > 0;
      expect(seesSky(tilt), `tilt ${tilt.toFixed(2)}`).toBe(sees);
      if (sees) above++;
      else below++;
    }
    // a check that met only one side passes in silence
    expect(above).toBeGreaterThan(10);
    expect(below).toBeGreaterThan(100);
  });

  it('is seen by the fly-in and by no view a shot is played from, the tilt limits and every club’s aim view on every screen included', () => {
    expect(FLY_IN.tilt).toBeGreaterThan(SKY_TILT);
    expect(TILT.most).toBeLessThan(SKY_TILT);
    for (const [aspect, height] of [
      [1.6, 800],
      [1.0, 800],
      [400 / 860, 860],
    ] as const)
      for (const club of BAG) {
        const rig = new CameraRig();
        rig.setScreen(aspect);
        rig.setGolf(true);
        rig.aimAt(aimView(reachOf(club, LIE.fairway, 0), aspect, height), true);
        expect(rig.seesSky(0), `${club.id} at ${aspect}`).toBe(false);
        for (const tilt of [TILT.least, TILT.home, TILT.most]) {
          rig.aimAt({ distance: rig.distance, tilt }, true);
          expect(rig.seesSky(0), `${club.id} at tilt ${tilt}`).toBe(false);
        }
      }
  });

  it('is seen as the fly-in begins and while it holds, and not from the moment the top of the screen is under the horizon', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    for (const t of [0, FLY_IN.hold * 0.9]) expect(rig.seesSky(t), `at ${t}`).toBe(true);
    let sawLast = -1,
      lostAt = -1;
    for (let t = 0; t < FLY_IN.hold + FLY_IN.time + 0.5; t += DT) {
      const sees = rig.seesSky(t);
      // the rig and the camera it places agree, at every moment of the flight
      expect(sees, `at ${t.toFixed(2)}`).toBe(topLooks(placed(rig, t)) > 0);
      if (sees) sawLast = t;
      else if (lostAt < 0) lostAt = t;
    }
    // seen up to a time and not after it, which is inside the flight and not at its end
    expect(lostAt).toBeGreaterThan(sawLast);
    expect(lostAt).toBeLessThan(FLY_IN.hold + FLY_IN.time);
    expect(rig.seesSky(FLY_IN.hold + FLY_IN.time + 0.1)).toBe(false);
  });

  it('is not seen from overhead, nor while the view is blending to it', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    expect(rig.seesSky(0)).toBe(true);
    rig.setOverhead(true, { bounds: { minX: -20, minY: -20, maxX: 20, maxY: 20 }, distance: 300 }, 0);
    for (let f = 0; f < 120; f++) rig.settle(DT);
    expect(rig.blend).toBe(1);
    expect(rig.seesSky(5)).toBe(false);
    // and half way to it a view as tilted as the fly-in has come down past the horizon
    expect(seesSky(FLY_IN.tilt, 0.5)).toBe(false);
    expect(seesSky(FLY_IN.tilt, 0)).toBe(true);
  });

  it('is held to by the rules: a view that sees it with no fly-in under way is a problem, and the fly-in itself is not', () => {
    const rig = new CameraRig();
    rig.flyIn(0, 0, 0, 0, AHEAD);
    for (let t = 0; t < FLY_IN.hold + FLY_IN.time + 0.5; t += 0.1)
      expect(flyInProblems(rig, t, 0), `at ${t}`).toEqual([]);
    // a play view tilted up to the horizon, which no limit of the camera allows and the rule is for
    const wrong = new CameraRig();
    wrong.tilt = FLY_IN.tilt;
    expect(wrong.seesSky(0)).toBe(true);
    const bad = flyInProblems(wrong, 0, 0);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.join(' ')).toMatch(/sky/);
  });
});

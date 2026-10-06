/**
 * The director: what the page and the fuzzer both do to the camera as a game goes on, in one place and headless. It
 * sends the camera to the aim view of the club in hand when the ball is ready, faces it to the flag, and follows the
 * ball, all by game time, so a test can step it and see what a player sees.
 */
import { describe, expect, it } from 'vitest';
import { LANDS_PAST, aimView, reachOf } from '../src/aimview';
import { bagClub } from '../src/bag';
import { CameraRig, catchUp, facing, wrap } from '../src/camera';
import { AIM_TURN, Director, FOLLOW, NEAR_FLAG } from '../src/director';
import { Camera } from 'artshape-render/gpu/camera';
import { safeBox } from '../src/aimview';
import { heightAt } from '../src/arena';
import { KICKER_HOLES } from '../scripts/fuzzer';
import { Progress, memoryStore } from '../src/progress';
import { Game } from '../src/game';
import { seeded } from '../src/random';
import { carryFrom } from '../src/flight';
import { windReach } from '../src/shaping';
import { LIE } from '../src/surfaces';
import { DT, field, golfGame, newGame, settle } from './helpers';

const ASPECT = 1.6;
const HEIGHT = 800;

/** A director for `game` on a rig of its own, the screen a desk's. */
function directed(game: ReturnType<typeof golfGame>['game']) {
  const rig = new CameraRig();
  const director = new Director(rig);
  director.use(game);
  director.setScreen(ASPECT, HEIGHT);
  return { rig, director };
}

/** Frames of the director alone, the game left as it is. */
function run(director: Director, seconds: number) {
  for (let f = 0; f < seconds * 60; f++) director.frame(DT, false);
}

describe('reachOf', () => {
  it('is the carry at full power a little further, and as much further as a tailwind carries a lofted club', () => {
    for (const id of ['driver', '7-iron', 'sand wedge']) {
      const club = bagClub(id);
      for (const speed of [0, 10]) {
        expect(reachOf(club, LIE.fairway, speed)).toBe(
          carryFrom(club, 1, LIE.fairway) * LANDS_PAST + windReach(club, 1, speed),
        );
      }
    }
  });

  it('takes no wind for the putter', () => {
    const putter = bagClub('putter');
    expect(reachOf(putter, LIE.green, 20)).toBe(carryFrom(putter, 1, LIE.green) * LANDS_PAST);
  });
});

describe('a hole begun', () => {
  it('puts the camera at once at the aim view of the driver for the first hole of a golf course', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    const want = aimView(reachOf(game.inHand, LIE.tee, game.wind.speed), ASPECT, HEIGHT);
    expect(rig.aiming).toBe(false);
    expect([rig.distance, rig.tilt, rig.lead]).toEqual([want.distance, want.tilt, want.lead]);
    expect(rig.golf).toBe(true);
    expect(rig.target[0]).toBe(game.layout.tee.x);
    expect(rig.target[1]).toBe(game.layout.tee.y);
  });

  it('eases to the aim view from the second hole on, and glides to the tee', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    director.started();
    expect(rig.aiming).toBe(true);
    expect(rig.gliding(game.t)).toBe(0);
  });

  it('leaves a hole of minigolf at its home view, following the ball', () => {
    const { game } = newGame(1);
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(ASPECT, HEIGHT);
    director.started();
    expect(rig.golf).toBe(false);
    expect(rig.aiming).toBe(false);
  });
});

describe('the aim view', () => {
  it('is sent when the club in hand changes, and not again while nothing has', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    run(director, 1);
    expect(rig.aiming).toBe(false);
    game.pick('9-iron');
    director.frame(DT, false);
    expect(rig.aiming).toBe(true);
    run(director, 5);
    expect(rig.aiming).toBe(false);
    const want = aimView(reachOf(bagClub('9-iron'), LIE.tee, game.wind.speed), ASPECT, HEIGHT);
    expect([rig.distance, rig.tilt, rig.lead]).toEqual([want.distance, want.tilt, want.lead]);
  });

  it('is sent again when the ball is ready again, though the club and the lie are as they were', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(game.shoot(Math.PI / 2, 0.05)).toBe(true);
    director.frame(DT, false);
    // a player may have zoomed or looked round while it rolled; the view is put right when the ball is ready
    rig.zoom(10);
    for (let f = 0; f < 600 && !game.ready; f++) {
      game.step(DT);
      director.frame(DT, false);
    }
    expect(game.ready).toBe(true);
    director.frame(DT, false);
    expect(rig.aiming).toBe(true);
  });

  it('is sent again when the screen changes shape', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    director.setScreen(400 / 860, 860);
    director.frame(DT, false);
    expect(rig.aiming).toBe(true);
    run(director, 5);
    const want = aimView(reachOf(game.inHand, LIE.tee, game.wind.speed), 400 / 860, 860);
    expect(rig.distance).toBe(want.distance);
  });
});

/** How far round, the short way, from the cup's own heading from the ball the camera is looking, with its sign (positive is clockwise from above). */
function offFlag(game: ReturnType<typeof golfGame>['game'], rig: CameraRig): number {
  const to = facing({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, game.layout.cup) as number;
  return wrap(rig.azimuth - to);
}

describe('the flag', () => {
  it('turns the camera to look near the cup from the ball, eased, and not at it', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(director.faceFlag(false)).toBe(true);
    expect(rig.turning).toBe(true);
    run(director, 3);
    expect(rig.turning).toBe(false);
    const off = Math.abs(offFlag(game, rig));
    expect(off).toBeGreaterThanOrEqual(NEAR_FLAG.least - 1e-9);
    expect(off).toBeLessThanOrEqual(NEAR_FLAG.most + 1e-9);
    expect(rig.azimuth).toBe(director.nearFlag());
  });

  it('is a figure the tests can hold: the offset runs from 0.10 to 0.26 of a radian', () => {
    expect(NEAR_FLAG).toEqual({ least: 0.1, most: 0.26 });
  });

  it('is never exactly at the cup, whatever the seed, the hole or the stroke, and never more than most', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    const offs: number[] = [];
    for (let k = 0; k < 500; k++) {
      director.setSeed(k * 7919 + 3);
      // another lie each time: the ball put down somewhere along the hole
      game.world.x[game.ball] = game.layout.tee.x + ((k * 37) % 41) - 20;
      game.world.y[game.ball] = game.layout.tee.y + ((k * 53) % 90);
      expect(director.faceFlag(false)).toBe(true);
      run(director, 3);
      offs.push(offFlag(game, rig));
    }
    // the figures as they are written, not as the code has them: a flag looked at squarely is the one thing it must never do
    for (const off of offs) {
      expect(Math.abs(off)).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(Math.abs(off)).toBeLessThanOrEqual(0.26 + 1e-9);
    }
    // a spread, not one size: over the range, and on both sides, each a fair share
    expect(Math.max(...offs.map(Math.abs)) - Math.min(...offs.map(Math.abs))).toBeGreaterThan(0.1);
    const right = offs.filter((o) => o > 0).length / offs.length;
    expect(right).toBeGreaterThan(0.4);
    expect(right).toBeLessThan(0.6);
  });

  it('is the same when pressed again on the same lie, and for the same seed, hole and stroke in another director', () => {
    const { game } = golfGame(field('f'));
    const one = directed(game);
    one.director.started();
    one.director.setSeed(11);
    one.director.faceFlag(false);
    run(one.director, 3);
    const first = one.rig.azimuth;
    one.director.faceFlag(false);
    run(one.director, 3);
    expect(one.rig.azimuth).toBe(first);
    // pressed from somewhere else it still goes to the one heading
    one.rig.orbit(1.3, 0);
    one.director.faceFlag(false);
    run(one.director, 3);
    expect(one.rig.azimuth).toBe(first);
    const other = directed(game);
    other.director.started();
    other.director.setSeed(11);
    other.director.faceFlag(false);
    run(other.director, 3);
    expect(other.rig.azimuth).toBe(first);
    other.director.setSeed(12);
    expect(other.director.nearFlag()).not.toBe(first);
  });

  it('changes with the stroke, since a new lie is a new coin', () => {
    const { game } = golfGame(field('f'));
    const { director } = directed(game);
    director.started();
    director.setSeed(5);
    const seen = new Set<number>();
    for (let strokes = 0; strokes < 12; strokes++) {
      game.strokes = strokes;
      seen.add(Math.round((director.nearFlag() as number) * 1e6));
    }
    expect(seen.size).toBeGreaterThan(6);
    game.strokes = 0;
  });

  it('spends none of the game’s chance', () => {
    let drawn = 0;
    const { game } = golfGame(field('f'), () => (drawn++, 0.5));
    const { director } = directed(game);
    director.started();
    drawn = 0;
    for (let k = 0; k < 20; k++) {
      director.setSeed(k);
      director.faceFlag(false);
      director.nearFlag();
    }
    expect(drawn).toBe(0);
  });

  for (const [aspect, height] of [
    [1.6, 800],
    [1.0, 800],
    [400 / 860, 860],
  ] as const) {
    it(`leaves the cup on the screen, inside the safe box, when it is in reach, on a screen of ${aspect.toFixed(2)}`, () => {
      // holes short enough to be in reach from the tee, with the cup well to one side so the offset has to be fitted: the
      // second is so near that a phone's narrow view has the cup off its side at the largest offset
      for (const rows of [60, 24, 90])
        for (let k = 0; k < 40; k++) {
          const hole = { ...field('f', rows, 41) };
          const { game } = golfGame(hole);
          const rig = new CameraRig();
          const director = new Director(rig);
          director.use(game);
          director.setScreen(aspect, height);
          director.started();
          director.setSeed(k * 13 + 1);
          run(director, 3);
          expect(director.faceFlag(false)).toBe(true);
          run(director, 4);
          const cam = new Camera();
          cam.fov = rig.fov;
          cam.aspect = aspect;
          rig.place(cam);
          cam.update();
          const m = cam.viewProjection;
          const { x, y } = game.layout.cup;
          const z = heightAt(game.layout, x, y);
          const w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
          const box = safeBox(aspect, height);
          const why = `seed ${k}: the cup at ${nx.toFixed(2)},${ny.toFixed(2)}`;
          // to a thousandth, since a cup just in reach on a phone's narrow view is where the offset has to be fitted
          expect(Math.abs(nx), why).toBeLessThanOrEqual(box.x + 0.001);
          // (a cup further than the furthest view the camera may stand shows is the limit's, as the framing rule has it)
          if (!rig.atLimit) expect(ny, why).toBeLessThanOrEqual(box.top + 0.02);
          expect(ny, why).toBeGreaterThanOrEqual(box.bottom - 0.02);
          // and it is still near the cup and not at it
          expect(Math.abs(offFlag(game, rig))).toBeGreaterThanOrEqual(NEAR_FLAG.least - 1e-9);
        }
    });
  }

  it('is refused while a drag is held, and does nothing', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(director.faceFlag(true)).toBe(false);
    expect(rig.turning).toBe(false);
    expect(rig.azimuth).toBe(0);
  });

  it('is refused from overhead, where there is no way to face the cup, and allowed again once it is left', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    const bounds = game.layout.bounds;
    rig.setOverhead(true, { bounds, distance: 400 });
    expect(director.faceFlag(false)).toBe(false);
    expect(rig.turning).toBe(false);
    rig.setOverhead(false);
    expect(director.faceFlag(false)).toBe(true);
  });

  it('is refused with the ball at the cup, where there is no way to face', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    // the game will not put a ball down on the cup, and one that is in it is written there
    game.world.x[game.ball] = game.layout.cup.x;
    game.world.y[game.ball] = game.layout.cup.y;
    expect(director.faceFlag(false)).toBe(false);
    expect(rig.turning).toBe(false);
  });
});

describe('the follow', () => {
  it('goes after the ball at the pace catchUp says for how fast it flies, on a golf hole', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.followShots('always');
    director.started();
    const twin = new CameraRig();
    twin.setGolf(true);
    twin.jump(game.layout.tee.x, game.layout.tee.y, rig.target[2]);
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    director.struck();
    for (let f = 0; f < 120; f++) {
      game.step(DT);
      director.frame(DT, false);
      const { world, ball } = game;
      const speed = Math.hypot(world.vx[ball], world.vy[ball], world.vz[ball]);
      const ground = 0;
      const up = Math.max(0, world.z[ball] - ground - 1);
      twin.follow(world.x[ball], world.y[ball], DT, ground + up, catchUp(speed));
      if (!world.alive[ball]) break;
    }
    // the ball's radius is not a unit, so only the pace is held: the target went the same way as the twin's, by the same arithmetic
    expect(rig.target[1]).toBeGreaterThan(game.layout.tee.y + 5);
    expect(Math.abs(rig.target[1] - twin.target[1])).toBeLessThan(3);
  });

  it('is not done while the camera is parked, as a test parks it', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    const before = [...rig.target];
    for (let f = 0; f < 30; f++) {
      game.step(DT);
      director.frame(DT, true);
    }
    expect([...rig.target]).toEqual(before);
  });

  it('follows a ball on minigolf at the pace it always did', () => {
    const { game } = newGame(1);
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(ASPECT, HEIGHT);
    director.followShots('always');
    director.started();
    const twin = new CameraRig();
    twin.jump(game.layout.tee.x, game.layout.tee.y, 0);
    settle(game, 1);
    for (let f = 0; f < 30; f++) {
      director.frame(DT, false);
      twin.follow(game.world.x[game.ball], game.world.y[game.ball], DT, 0);
      twin.settle(DT);
    }
    expect(rig.target).toEqual(twin.target);
  });
});

describe('the turn to the aim', () => {
  const heading = (angle: number) => wrap(Math.PI / 2 - angle);

  it('settles the azimuth on the way the aim looks, within a thousandth in two seconds, falling all the way, at 60 and 30 frames a second', () => {
    for (const dt of [1 / 60, 1 / 30]) {
      for (const angle of [0, 1, 2.5, -2, Math.PI]) {
        const { game } = golfGame(field('f'));
        const { rig, director } = directed(game);
        director.started();
        const want = heading(angle);
        let last = Math.abs(wrap(rig.azimuth - want));
        for (let f = 0; f < 2 / dt; f++) {
          director.aiming({ angle, power: 0.6 });
          director.frame(dt, false);
          const off = Math.abs(wrap(rig.azimuth - want));
          expect(off, `angle ${angle} at ${dt}`).toBeLessThanOrEqual(last + 1e-12);
          last = off;
        }
        expect(last, `angle ${angle} at ${dt}`).toBeLessThan(1e-3);
      }
    }
  });

  it('leaves the distance, the tilt and the lead of the aim view as they are', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    run(director, 3);
    const before = [rig.distance, rig.tilt, rig.lead];
    for (let f = 0; f < 180; f++) {
      director.aiming({ angle: 0.3, power: 1 });
      director.frame(DT, false);
    }
    expect([rig.distance, rig.tilt, rig.lead]).toEqual(before);
  });

  it('does not turn for an aim weaker than AIM_TURN.least, and does at it', () => {
    expect(AIM_TURN.least).toBe(0.15);
    const weak = golfGame(field('f'));
    const a = directed(weak.game);
    a.director.started();
    for (let f = 0; f < 180; f++) {
      a.director.aiming({ angle: 0, power: AIM_TURN.least * 0.99 });
      a.director.frame(DT, false);
    }
    expect(a.rig.azimuth).toBe(0);
    expect(a.rig.turning).toBe(false);
    const strong = golfGame(field('f'));
    const b = directed(strong.game);
    b.director.started();
    b.director.aiming({ angle: 0, power: AIM_TURN.least });
    expect(b.rig.turning).toBe(true);
  });

  it('does not turn with no aim, or while the ball is not ready', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    director.aiming(null);
    expect(rig.turning).toBe(false);
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    expect(game.ready).toBe(false);
    director.aiming({ angle: 0, power: 1 });
    expect(rig.turning).toBe(false);
  });

  it('does not turn from overhead', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    rig.setOverhead(true, { bounds: game.layout.bounds, distance: 400 });
    director.aiming({ angle: 0, power: 1 });
    expect(rig.turning).toBe(false);
  });

  it('leaves the camera where it had got to when the drag is taken back, and there five seconds on', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    for (let f = 0; f < 20; f++) {
      director.aiming({ angle: 0, power: 0.8 });
      director.frame(DT, false);
    }
    // a weak aim, then none: neither changes where it is going
    director.aiming({ angle: 2, power: 0.05 });
    director.aiming(null);
    for (let f = 0; f < 300; f++) director.frame(DT, false);
    expect(rig.azimuth).toBeCloseTo(heading(0), 6);
    const at = rig.azimuth;
    for (let f = 0; f < 300; f++) director.frame(DT, false);
    expect(rig.azimuth).toBe(at);
  });

  it('keeps the way a shot faced when it is let go', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    for (let f = 0; f < 120; f++) {
      director.aiming({ angle: 1, power: 0.5 });
      director.frame(DT, false);
    }
    expect(game.shoot(1, 0.5)).toBe(true);
    director.aiming(null);
    for (let f = 0; f < 120; f++) {
      game.step(DT);
      director.frame(DT, false);
    }
    expect(rig.azimuth).toBeCloseTo(heading(1), 6);
  });
});

describe('following the ball one shot in five', () => {
  /** A drive struck full at the cup's end of the field, the director told as the page tells it, and every frame's ball seen as the camera draws it. */
  function drive(aspect: number, height: number, mode: 'always' | 'never' | 'drawn', club = 'driver', power = 1) {
    const { game } = golfGame(field('f'));
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(aspect, height);
    director.followShots(mode);
    director.started();
    game.pick(club);
    for (let f = 0; f < 600; f++) director.frame(DT, false);
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = aspect;
    const seen: { nx: number; ny: number; t: number; latched: boolean; target: number; ready: boolean }[] = [];
    const t0 = game.t;
    expect(game.shoot(Math.PI / 2, power)).toBe(true);
    director.struck();
    for (let f = 0; f < 60 * 14; f++) {
      game.step(DT);
      director.frame(DT, false);
      rig.place(cam, game.t);
      cam.update();
      const { world, ball } = game;
      const m = cam.viewProjection;
      const [x, y, z] = [world.x[ball], world.y[ball], world.z[ball]];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      seen.push({
        nx: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        ny: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        t: game.t - t0,
        latched: director.following,
        target: rig.target[1],
        ready: game.ready,
      });
      if (game.ready) break;
    }
    return { game, rig, director, seen, box: safeBox(aspect, height) };
  }

  it('is a share of a fifth of the strokes, the same for the same key', () => {
    expect(FOLLOW.share).toBe(0.2);
    const { game } = golfGame(field('f'));
    const { director } = directed(game);
    director.started();
    let followed = 0;
    for (let k = 0; k < 5000; k++) {
      director.setSeed(k);
      game.strokes = k % 7;
      director.struck();
      const first = director.following;
      director.struck();
      expect(director.following, `key ${k}`).toBe(first);
      if (first) followed++;
    }
    expect(followed / 5000).toBeGreaterThan(0.18);
    expect(followed / 5000).toBeLessThan(0.22);
  });

  it('is overridden by followShots: always follows, never holds, and drawn is the share', () => {
    const { game } = golfGame(field('f'));
    const { director } = directed(game);
    director.started();
    director.followShots('always');
    for (let k = 0; k < 50; k++) {
      director.setSeed(k);
      director.struck();
      expect(director.following).toBe(true);
    }
    director.followShots('never');
    for (let k = 0; k < 50; k++) {
      director.setSeed(k);
      director.struck();
      expect(director.following).toBe(false);
    }
    director.followShots('drawn');
    let any = 0;
    for (let k = 0; k < 50; k++) {
      director.setSeed(k);
      director.struck();
      if (director.following) any++;
    }
    expect(any).toBeGreaterThan(2);
    expect(any).toBeLessThan(25);
  });

  it('spends none of the game’s chance to decide', () => {
    let drawn = 0;
    const { game } = golfGame(field('f'), () => (drawn++, 0.5));
    const { director } = directed(game);
    director.started();
    drawn = 0;
    for (let k = 0; k < 100; k++) {
      director.setSeed(k);
      director.struck();
    }
    expect(drawn).toBe(0);
  });

  for (const [aspect, height] of [
    [1.6, 800],
    [400 / 860, 860],
  ] as const) {
    it(`holds the camera still while the ball flies inside the aim view, and the fastest drive never leaves the screen, on ${aspect.toFixed(2)}`, () => {
      const { seen, box, rig, director } = drive(aspect, height, 'never');
      for (const s of seen) {
        expect(Math.abs(s.nx), `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(1);
        expect(Math.abs(s.ny), `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(1);
      }
      // held still for as long as the ball is in the box, which it is for the first frames of a drive; the camera takes it up the
      // moment it would leave, and the ball is inside the box (a thousandth of the screen over) from then to the end
      const first = seen.findIndex((s) => s.latched);
      expect(first, 'the camera took the ball up, which a drive that runs past the reach makes it').toBeGreaterThan(5);
      for (let k = 1; k < first; k++) expect(seen[k].target, `frame ${k}`).toBe(seen[0].target);
      expect(seen[first].target, 'and moved from then').not.toBe(seen[0].target);
      for (const s of seen) {
        expect(Math.abs(s.nx), `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(box.x + 1e-3);
        expect(s.ny, `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(box.top + 1e-3);
        expect(s.ny, `at ${s.t.toFixed(2)}`).toBeGreaterThanOrEqual(box.bottom - 1e-3);
      }
      void rig;
      void director;
    });

    it(`follows a drive as it always did when told always, and the ball is on the screen the whole way, on ${aspect.toFixed(2)}`, () => {
      const { seen, box } = drive(aspect, height, 'always');
      for (const s of seen.filter((s) => !s.ready)) {
        expect(Math.abs(s.nx), `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(box.x + 0.02);
        expect(s.ny, `at ${s.t.toFixed(2)}`).toBeLessThanOrEqual(box.top + 0.02);
        expect(s.ny, `at ${s.t.toFixed(2)}`).toBeGreaterThanOrEqual(box.bottom - 0.02);
      }
    });
  }

  it('holds the target at the strike point for a putt that stays inside the box, and eases to the ball when it is ready', () => {
    const { seen, game, rig, director } = drive(1.6, 800, 'never', 'putter', 0.1);
    const held = seen.filter((s) => !s.ready);
    expect(held.length).toBeGreaterThan(10);
    for (const s of held) expect(s.target).toBe(held[0].target);
    expect(held.at(-1)!.latched, 'it never left the box').toBe(false);
    // ready: the target is eased to the ball as ever, and is there a few seconds on
    expect(game.ready).toBe(true);
    const before = rig.target[1];
    for (let f = 0; f < 240; f++) director.frame(DT, false);
    expect(Math.abs(rig.target[1] - game.world.y[game.ball])).toBeLessThan(0.05);
    expect(Math.abs(before - game.world.y[game.ball])).toBeGreaterThan(0.05);
  });

  it('clears the latch at a new hole', () => {
    const { director } = drive(1.6, 800, 'never');
    expect(director.following).toBe(true);
    director.started();
    expect(director.following).toBe(false);
  });

  it('follows at the pace catchUp says once it has latched, as it does when it follows from the start', () => {
    const held = drive(1.6, 800, 'never');
    const chased = drive(1.6, 800, 'always');
    // the same ball, so the camera in the end stands where the one that followed all the way stands, to a few yards
    expect(Math.abs(held.rig.target[1] - chased.rig.target[1])).toBeLessThan(3);
  });

  it('keeps a ball a kicker throws on the screen all the way, on a hole of minigolf held still, and takes it up where it leaves the box', () => {
    for (const hole of KICKER_HOLES) {
      for (const angle of [Math.PI / 2, Math.PI / 2 + 0.15, Math.PI / 2 - 0.15, Math.PI / 4, (3 * Math.PI) / 4]) {
        const game = new Game(new Progress(memoryStore(null)), {}, { random: seeded(3), course: [hole] });
        const rig = new CameraRig();
        const director = new Director(rig);
        director.use(game);
        director.setScreen(1.6, 800);
        director.followShots('never');
        director.started();
        for (let f = 0; f < 300; f++) director.frame(DT, false);
        const cam = new Camera();
        cam.fov = rig.fov;
        cam.aspect = 1.6;
        const box = safeBox(1.6, 800);
        expect(game.shoot(angle, 1)).toBe(true);
        director.struck();
        for (let f = 0; f < 60 * 8 && !game.ready; f++) {
          game.step(DT);
          director.frame(DT, false);
          rig.place(cam, game.t);
          cam.update();
          const m = cam.viewProjection;
          const [x, y, z] = [game.world.x[game.ball], game.world.y[game.ball], game.world.z[game.ball]];
          const w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
          const why = `${hole.name} at ${angle.toFixed(2)}, frame ${f}`;
          expect(Math.abs(nx), why).toBeLessThanOrEqual(box.x + 1e-3);
          expect(ny, why).toBeLessThanOrEqual(box.top + 1e-3);
          expect(ny, why).toBeGreaterThanOrEqual(box.bottom - 1e-3);
        }
      }
    }
  });

  it('has the ball back inside the box when it is lost in water and put back, as the camera that held still never moved', () => {
    const base = field('f');
    const map = base.map.map((row, r) => (r >= 20 && r <= 46 ? `#${'~'.repeat(row.length - 2)}#` : row));
    const { game, told } = golfGame({ ...base, map });
    const rig = new CameraRig();
    const director = new Director(rig);
    director.use(game);
    director.setScreen(1.6, 800);
    director.followShots('never');
    director.started();
    for (let f = 0; f < 300; f++) director.frame(DT, false);
    const cam = new Camera();
    cam.fov = rig.fov;
    cam.aspect = 1.6;
    const held = rig.target[1];
    game.pick('driver');
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    director.struck();
    for (let f = 0; f < 60 * 12 && !game.ready; f++) {
      game.step(DT);
      director.frame(DT, false);
    }
    expect(told.filter((t) => t.startsWith('splash ')).length, 'it went in the water').toBe(1);
    expect(director.following, 'and the camera never took it up').toBe(false);
    expect(rig.target[1]).toBe(held);
    rig.place(cam, game.t);
    cam.update();
    const m = cam.viewProjection;
    const [x, y, z] = [game.world.x[game.ball], game.world.y[game.ball], game.world.z[game.ball]];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    const box = safeBox(1.6, 800);
    expect(ny).toBeGreaterThanOrEqual(box.bottom);
    expect(ny).toBeLessThanOrEqual(box.top);
  });

  for (const [aspect, height] of [
    [1.6, 800],
    [400 / 860, 860],
  ] as const)
    for (const angle of [-Math.PI / 2, Math.PI, 0, -Math.PI / 4]) {
      it(`keeps a drive struck away from where the camera looks on the screen all the way when it follows the ball, at ${angle.toFixed(2)} on ${aspect.toFixed(2)}`, () => {
        const { game } = golfGame(field('f'));
        // the ball mid-field with room to fly each way
        game.place(0, -100);
        const rig = new CameraRig();
        const director = new Director(rig);
        director.use(game);
        director.setScreen(aspect, height);
        director.followShots('always');
        director.started();
        game.pick('driver');
        rig.jump(game.world.x[game.ball], game.world.y[game.ball], 0);
        for (let f = 0; f < 600; f++) director.frame(DT, false);
        // the camera not yet caught up with the ball: left forty yards behind the way it is about to go, as it is when a ball is struck
        // soon after the last came to rest
        rig.jump(game.world.x[game.ball] - 40 * Math.cos(angle), game.world.y[game.ball] - 40 * Math.sin(angle), 0);
        const cam = new Camera();
        cam.fov = rig.fov;
        cam.aspect = aspect;
        const box = safeBox(aspect, height);
        expect(game.shoot(angle, 1)).toBe(true);
        director.struck();
        let frames = 0;
        for (let f = 0; f < 60 * 12 && !game.ready; f++, frames++) {
          game.step(DT);
          director.frame(DT, false);
          rig.place(cam, game.t);
          cam.update();
          const m = cam.viewProjection;
          const [x, y, z] = [game.world.x[game.ball], game.world.y[game.ball], game.world.z[game.ball]];
          const w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
          const why = `frame ${f}: ${nx.toFixed(2)},${ny.toFixed(2)}`;
          expect(Math.abs(nx), why).toBeLessThanOrEqual(box.x + 1e-3);
          expect(ny, why).toBeLessThanOrEqual(box.top + 1e-3);
          expect(ny, why).toBeGreaterThanOrEqual(box.bottom - 1e-3);
        }
        expect(frames, 'the ball flew').toBeGreaterThan(60);
      });
    }
});

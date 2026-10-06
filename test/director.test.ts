/**
 * The director: what the page and the fuzzer both do to the camera as a game goes on, in one place and headless. It
 * sends the camera to the aim view of the club in hand when the ball is ready, faces it to the flag, and follows the
 * ball, all by game time, so a test can step it and see what a player sees.
 */
import { describe, expect, it } from 'vitest';
import { LANDS_PAST, aimView, reachOf } from '../src/aimview';
import { bagClub } from '../src/bag';
import { CameraRig, catchUp, facing } from '../src/camera';
import { Director } from '../src/director';
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

describe('the flag', () => {
  it('turns the camera to face the cup from the ball exactly, eased', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(director.faceFlag(false)).toBe(true);
    expect(rig.turning).toBe(true);
    run(director, 3);
    const want = facing({ x: game.world.x[game.ball], y: game.world.y[game.ball] }, game.layout.cup) as number;
    expect(rig.turning).toBe(false);
    expect(rig.azimuth).toBe(want);
  });

  it('is refused while a drag is held, and does nothing', () => {
    const { game } = golfGame(field('f'));
    const { rig, director } = directed(game);
    director.started();
    expect(director.faceFlag(true)).toBe(false);
    expect(rig.turning).toBe(false);
    expect(rig.azimuth).toBe(0);
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
    director.started();
    const twin = new CameraRig();
    twin.setGolf(true);
    twin.jump(game.layout.tee.x, game.layout.tee.y, rig.target[2]);
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
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

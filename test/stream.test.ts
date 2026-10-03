/**
 * The stream: a conveyor drawn as running water. It is a belt to the physics and the game, so it carries a ball as a
 * belt does and never loses one; what is its own is the picture's arithmetic and the map's colour.
 */
import { describe, expect, it } from 'vitest';
import { TILE, layoutOf, tileAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { checkInvariants, streamProblems } from '../src/invariants';
import { paintMap, mapSize } from '../src/holemap';
import { Obstacles } from '../src/obstacles';
import { STREAM_RIPPLES, streamRipples } from '../src/sway';
import { fuzz } from '../scripts/fuzzer';
import { DT, newGame, settle } from './helpers';
import { BELT_HOLE, STREAM_HOLE } from './stream-hole';

/** The ball's place every frame for `seconds`, after one shot from the tee straight up the hole at `power`. */
function trace(hole: typeof BELT_HOLE, seed: number, power: number, seconds: number) {
  const { game, told } = newGame(seed, null, [hole]);
  game.shoot(Math.PI / 2, power);
  const path: number[] = [];
  for (let f = 0; f < seconds / DT; f++) {
    game.step(DT);
    path.push(game.world.x[game.ball], game.world.y[game.ball]);
  }
  return { game, told, path };
}

describe('a stream carries a ball as a belt does', () => {
  it('the same seeded shot onto each gives the same trace, to the digit, and the belt did carry it', () => {
    const belt = trace(BELT_HOLE, 3, 0.3, 4);
    const stream = trace(STREAM_HOLE, 3, 0.3, 4);
    expect(stream.path).toEqual(belt.path);
    const { game } = stream;
    const l = game.layout;
    // carried east: it ended well east of the tee's column
    expect(game.world.x[game.ball] - l.tee.x, 'carried along the way the belt runs').toBeGreaterThan(3);
  });
});

describe('a ball on a stream is not lost', () => {
  it('is never told into the water or out of bounds, comes to rest off it, and costs no stroke but its own', () => {
    const { game, told } = newGame(5, null, [STREAM_HOLE]);
    const l = game.layout;
    const belted = game.obstacles.belted;
    game.shoot(Math.PI / 2, 0.3);
    let onIt = 0;
    for (let f = 0; f < 600; f++) {
      game.step(DT);
      if (belted.has(tileAt(l, game.world.x[game.ball], game.world.y[game.ball]))) onIt++;
    }
    expect(onIt, 'it was on the stream for a while').toBeGreaterThan(10);
    expect(told.filter((t) => /^(splash|outOfBounds)/.test(t))).toEqual([]);
    expect(game.ready).toBe(true);
    expect(belted.has(tileAt(l, game.world.x[game.ball], game.world.y[game.ball])), 'at rest off the stream').toBe(
      false,
    );
    expect(game.strokes).toBe(1);
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('the hole map', () => {
  it('paints a stream in the water colour, which the same tile of a plain belt is not', () => {
    const l = layoutOf(STREAM_HOLE.map);
    const stream = new Obstacles(STREAM_HOLE.obstacles!, l);
    const size = mapSize(l, 100, 230);
    const plain = new Uint8ClampedArray(size.width * size.height * 4),
      wet = new Uint8ClampedArray(size.width * size.height * 4);
    const pond = layoutOf(['#####', '#.C.#', '#~~~#', '#.T.#', '#####']);
    const pondSize = mapSize(pond, 100, 230);
    const pondPixels = new Uint8ClampedArray(pondSize.width * pondSize.height * 4);
    paintMap(pond, pondSize, pondPixels);
    paintMap(l, size, plain);
    paintMap(l, size, wet, stream.streamed);
    const x = l.originX + 2.5 * TILE,
      y = l.originY + (l.rows - 1 - 5 + 0.5) * TILE;
    const px = Math.floor((x - size.west) * size.scale),
      py = Math.floor((size.north - y) * size.scale);
    const at = (img: Uint8ClampedArray) =>
      Array.from(img.slice((py * size.width + px) * 4, (py * size.width + px) * 4 + 4));
    const centre = Math.floor(pondSize.width / 2),
      row = Math.floor(pondSize.height / 2);
    const water = Array.from(
      pondPixels.slice((row * pondSize.width + centre) * 4, (row * pondSize.width + centre) * 4 + 4),
    );
    expect(at(wet)).toEqual(water);
    expect(at(plain)).not.toEqual(water);
    expect(stream.streamed.size, 'four tiles').toBe(4);
  });
});

describe('the ripples of a stream', () => {
  const length = 4 * TILE;
  const seed = 7;
  it('are carried along the belt at its speed, from game time, and loop', () => {
    for (let k = 0; k < STREAM_RIPPLES.each(length); k++)
      for (const t of [0, 0.37, 5.2]) {
        const a = streamRipples(t, seed, k, length, 3);
        const before = a.v;
        const b = streamRipples(t + 1, seed, k, length, 3);
        // half-lengths, from -1 to 1: it moved by the speed over the length, twice since the room is two long
        const moved = ((((b.v - before) * (length / 2)) % length) + length) % length;
        expect(moved).toBeCloseTo(3, 6);
        expect(Math.abs(a.u)).toBeLessThanOrEqual(1);
        expect(a.v).toBeGreaterThanOrEqual(-1);
        expect(a.v).toBeLessThanOrEqual(1);
        // the same moment gives the same place
        expect(streamRipples(t, seed, k, length, 3).v).toBe(a.v);
      }
  });
  it('fade in and out at the ends, so a ripple is never seen to jump back', () => {
    for (let t = 0; t < 12; t += 0.01)
      for (let k = 0; k < 4; k++) {
        const r = streamRipples(t, seed, k, length, 3);
        if (Math.abs(r.v) > 0.97) expect(r.fade).toBeLessThan(0.1);
      }
  });
});

describe('a round on a stream', () => {
  it('is holed by the autopilot with every invariant holding', () => {
    for (const seed of [1, 2, 3]) {
      const { game } = newGame(seed, null, [STREAM_HOLE]);
      const pilot = new Autopilot(game);
      const playing = () => game.phase === 'play';
      for (let stroke = 0; stroke < 12 && playing(); stroke++) {
        if (game.ready) {
          const shot = pilot.plan();
          if (shot) game.shoot(shot.angle, shot.power);
        }
        for (let f = 0; f < 900 && playing() && !game.ready; f++) {
          game.step(DT);
          if (f % 10 === 0) expect(checkInvariants(game)).toEqual([]);
        }
      }
      expect(playing(), `seed ${seed} holed`).toBe(false);
      expect(streamProblems(game)).toEqual([]);
    }
  });
});

describe('the fuzzer on a stream', () => {
  it('strikes the ball onto it, and finds nothing wrong, over a few seeds', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = fuzz(seed, 3000, [STREAM_HOLE]);
      expect(r.failure, `seed ${seed}`).toBeNull();
      expect(r.done['strike onto the stream'] ?? 0, `seed ${seed} struck onto it`).toBeGreaterThan(0);
    }
  });
});

void settle;

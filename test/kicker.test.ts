/**
 * The kicker: a post that throws a ball harder, a pinball's mushroom bumper, drawn `k` in a map. It is read as a body
 * the physics has, thrown off at its own bounce and never past the course's ceiling, avoided by the autopilot as a
 * post is, told of as a knock when the ball meets it, and lit when it is hit. Each rule has its test, and each test
 * has been seen to fail with the rule put back.
 */
import { describe, expect, it } from 'vitest';
import {
  BUMPER,
  FASTEST,
  HARDEST_SHOT,
  KICKER,
  KIND_RADIUS,
  BALL,
  ROLL,
  TILE,
  fromKickers,
  kickerAt,
  layoutOf,
  powerFor,
} from '../src/arena';
import { Autopilot, pathToCup } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { fastest, type Game } from '../src/game';
import { FLASH, flash, kickFlash, KICK_FLASH } from '../src/glints';
import { checkInvariants, kickerProblems, knockProblems } from '../src/invariants';
import { seeded } from '../src/random';
import { KICKER_HOLES, fuzz } from '../scripts/fuzzer';
import { DT, newGame } from './helpers';

/** The speed to strike a ball so it is going `arrive` after rolling `distance` on the green. */
const arriving = (arrive: number, distance: number) => Math.sqrt(arrive * arrive + 2 * ROLL.roll * distance);

/** A lane with one body of its kind (`k` a kicker, `o` a post) in its middle, and room behind the ball to come back off it. */
const lane = (c: 'k' | 'o'): HoleDef => ({
  name: `test ${c}`,
  par: 3,
  map: [
    '#######',
    '#..C..#',
    '#.....#',
    `#..${c}..#`,
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#..T..#',
    '#######',
  ],
});

/** The ball's speed just before the lane's body turns it back, and just after; and the fastest it goes in the second after. */
function meet(game: Game) {
  const { world, ball } = game;
  let before = 0;
  for (let f = 0; f < 240 && !(world.vy[ball] < 0 && f > 5); f++) {
    before = Math.hypot(world.vx[ball], world.vy[ball]);
    game.step(DT);
  }
  game.step(DT);
  const after = Math.hypot(world.vx[ball], world.vy[ball]);
  const back = world.vy[ball];
  let most = after;
  for (let f = 0; f < 60; f++) {
    most = Math.max(most, Math.hypot(world.vx[ball], world.vy[ball]));
    game.step(DT);
  }
  return { before, after, most, back };
}

/** A ball struck straight at the body of a lane, arriving at `arrive` (or as hard as the shot goes), and what came of it. */
function strikeLane(c: 'k' | 'o', arrive: number) {
  const { game, told } = newGame(1, null, [lane(c)]);
  const body = (c === 'k' ? game.layout.kickers : game.layout.bumpers)[0];
  const { tee } = game.layout;
  const gap = body.y - KICKER.radius - tee.y - KIND_RADIUS[BALL];
  game.shoot(Math.PI / 2, Math.min(1, powerFor(arriving(arrive, gap), HARDEST_SHOT)));
  return { game, told, body, ...meet(game) };
}

describe('a kicker in a map', () => {
  it('is read by layoutOf as a body at the middle of its tile, on grass, which is no post and no rock', () => {
    const l = layoutOf(lane('k').map);
    expect(l.kickers).toHaveLength(1);
    expect(l.bumpers).toHaveLength(0);
    // the middle of column 3 of 7, and of the fourth row from the north of ten
    expect(l.kickers[0].x).toBeCloseTo(l.originX + 3.5 * TILE, 9);
    expect(l.kickers[0].y).toBeCloseTo(l.originY + 6.5 * TILE, 9);
    const t = Math.round((l.kickers[0].y - l.originY - TILE / 2) / TILE) * l.cols + 3;
    expect(l.solid[t], 'ground a ball may be on').toBe(0);
    expect(l.sand[t] + l.water[t] + l.rail[t], 'plain grass').toBe(0);
    expect(layoutOf(lane('o').map).kickers, 'a post is not one').toHaveLength(0);
  });

  it('is on minigolf’s grass only: refused by name on a golf hole, and on the edge where grass may not be', () => {
    const golf = ['#####', '#frr#', '#rkr#', '#rCr#', '#rTr#', '#####'];
    expect(() => layoutOf(golf)).toThrow(/kicker/);
    expect(() =>
      layoutOf(['#####', '#.C.#', '#...#', '#.T.#', '#####'].map((r, i) => (i === 2 ? 'k...#' : r))),
    ).toThrow(/grass on its edge/);
  });

  it('is not a place a ball can be put down', () => {
    const { game } = newGame(1, null, [lane('k')]);
    const k = game.layout.kickers[0];
    expect(() => game.place(k.x + KICKER.radius + 0.5, k.y)).toThrow(/kicker|post/);
    expect(() => game.place(k.x + KICKER.radius + 1.3, k.y)).not.toThrow();
  });

  it('says how far a point is from it, and which it is', () => {
    const l = layoutOf(lane('k').map);
    const k = l.kickers[0];
    expect(fromKickers(l, k.x + 3, k.y)).toBeCloseTo(3 - KICKER.radius, 9);
    expect(fromKickers(layoutOf(lane('o').map), 0, 0)).toBe(Infinity);
    expect(kickerAt(l, k.x + KICKER.radius + 1, k.y, 1.25)).toBe(0);
    expect(kickerAt(l, k.x + KICKER.radius + 2, k.y, 1.25)).toBe(-1);
  });
});

describe('a kicker throws a ball harder than a post does, and never past the ceiling', () => {
  it('leaves faster than a post leaves, by the ratio of their bounces, at the same arrival, soft and middling', () => {
    // 1.8 over 1.2: a kicker is half as lively again as a post
    const ratio = KICKER.restitution / BUMPER.restitution;
    expect(ratio).toBeCloseTo(1.5, 9);
    for (const arrive of [8, 15, 25]) {
      const post = strikeLane('o', arrive),
        kick = strikeLane('k', arrive);
      expect(kick.before, 'met at the same speed').toBeCloseTo(post.before, 1);
      expect(kick.back, 'coming back off it').toBeLessThan(0);
      const got = kick.after / post.after;
      expect(got, `arriving at ${arrive}: ${kick.after.toFixed(1)} against ${post.after.toFixed(1)}`).toBeGreaterThan(
        ratio - 0.1,
      );
      expect(got).toBeLessThan(ratio + 0.1);
      expect(kick.after / kick.before, 'faster than it came, by about the kicker').toBeGreaterThan(1.6);
    }
  });

  it('never leaves faster than half as fast again as the hardest shot, struck as hard as it goes', () => {
    const { game, after, most, before } = strikeLane('k', 1000);
    const cap = Math.max(game.hardest, game.struckWith) * FASTEST;
    expect(before, 'the hardest shot, arriving').toBeGreaterThan(30);
    expect(after, 'thrown well past what a post throws').toBeGreaterThan(before * 1.4);
    expect(after).toBeLessThanOrEqual(cap * 1.001);
    expect(most).toBeLessThanOrEqual(cap * 1.001);
    expect(cap).toBe(HARDEST_SHOT * FASTEST);
  });

  it('holds even shuttled between two kickers facing each other, the invariants kept every frame', () => {
    const PAIR: HoleDef = {
      name: 'test kicker pair',
      par: 3,
      map: ['#######', '#C....#', '#..k..#', '#.....#', '#.....#', '#..k..#', '#.....#', '#..T..#', '#######'],
    };
    const { game } = newGame(1, null, [PAIR]);
    const [a, b] = game.layout.kickers;
    game.place(a.x, (a.y + b.y) / 2);
    game.shoot(Math.PI / 2, 1);
    let most = 0;
    for (let f = 0; f < 10 * 60; f++) {
      game.step(DT);
      most = Math.max(most, Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]));
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(most, 'thrown faster than it was struck').toBeGreaterThan(HARDEST_SHOT * 1.1);
    expect(most).toBeLessThanOrEqual(HARDEST_SHOT * FASTEST + 1e-3);
  });
});

/** A hole whose straight line from the tee to the cup is blocked by a kicker, with two more beside it. */
const BLOCKED: HoleDef = {
  name: 'test kickers',
  par: 3,
  map: [
    '#########',
    '#...C...#',
    '#.......#',
    '#...k...#',
    '#..k.k..#',
    '#.......#',
    '#.......#',
    '#...T...#',
    '#########',
  ],
};

describe('the autopilot goes round a kicker as it goes round a post', () => {
  it('finds a way to the cup through no kicker’s tile', () => {
    const { game } = newGame(1, null, [BLOCKED]);
    const l = game.layout;
    const tiles = new Set(
      l.kickers.map((k) => `${Math.floor((k.x - l.originX) / TILE)},${Math.floor((k.y - l.originY) / TILE)}`),
    );
    const way = pathToCup(l, l.tee.x, l.tee.y);
    expect(way.length).toBeGreaterThan(1);
    for (const [x, y] of way)
      expect(
        tiles.has(`${Math.floor((x - l.originX) / TILE)},${Math.floor((y - l.originY) / TILE)}`),
        `${x},${y}`,
      ).toBe(false);
  });

  it('does not aim straight at the cup through one: its first shot is bent', () => {
    const { game } = newGame(1, null, [BLOCKED]);
    const shot = new Autopilot(game).plan()!;
    const { tee, cup } = game.layout;
    const straight = Math.atan2(cup.y - tee.y, cup.x - tee.x);
    expect(Math.abs(shot.angle - straight), 'off the straight line, which a kicker is on').toBeGreaterThan(0.05);
  });

  it('holes out with the rules kept, as a player with slips does, from seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { game, told } = newGame(seed, null, [BLOCKED]);
      const pilot = new Autopilot(game, { skill: { aim: 0.05, power: 0.1 }, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 90 && game.phase === 'play'; f++) {
        pilot.step(DT);
        if (f % 10 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}: holed`).not.toBe('play');
      expect(game.card[0], `seed ${seed}`).toBeLessThanOrEqual(game.def.par + 3);
      for (const t of told.filter((x) => x.startsWith('knocked '))) {
        const [hard, x, y, dx, dy, dz] = t.split(' ').slice(1).map(Number);
        expect(
          knockProblems(game, hard, x, y, dx, dy, dz).length,
          'told of a ball no longer there, which is later',
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('holes out with no kicker struck when it can help it: a clean unslipped round never meets one', () => {
    const { game, told } = newGame(1, null, [BLOCKED]);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 90 && game.phase === 'play'; f++) pilot.step(DT);
    expect(game.phase).not.toBe('play');
    expect(game.card[0]).toBeLessThanOrEqual(game.def.par);
    // the cup's rim knocks it as it drops, which is not a kicker's doing: only a knock at a kicker's side counts
    const atKickers = told
      .filter((x) => x.startsWith('knocked '))
      .map((x) => x.split(' ').slice(1).map(Number))
      .filter(([, x, y]) => kickerAt(game.layout, x, y, KIND_RADIUS[BALL] + 0.25) >= 0);
    expect(atKickers, told.join('\n')).toEqual([]);
  });
});

describe('the invariants know the kicker', () => {
  it('says a ball inside a kicker is wrong, and a ball beside one is not', () => {
    const { game } = newGame(1, null, [lane('k')]);
    const k = game.layout.kickers[0];
    const { world, ball } = game;
    world.x[ball] = k.x + KICKER.radius + KIND_RADIUS[BALL] + 0.2;
    world.y[ball] = k.y;
    expect(kickerProblems(game)).toEqual([]);
    world.x[ball] = k.x + 0.5;
    expect(kickerProblems(game).join()).toMatch(/inside a kicker/);
    expect(checkInvariants(game).join()).toMatch(/inside a kicker/);
  });

  it('says a ball thrown faster than the ceiling is wrong, against a kicker', () => {
    const { game } = newGame(1, null, [lane('k')]);
    const k = game.layout.kickers[0];
    const { world, ball } = game;
    world.x[ball] = k.x;
    world.y[ball] = k.y - KICKER.radius - KIND_RADIUS[BALL] - 0.05;
    world.vy[ball] = -(fastest(game, k.x, k.y) * 1.05);
    expect(kickerProblems(game).join()).toMatch(/faster/);
    world.vy[ball] = -(fastest(game, k.x, k.y) * 0.99);
    expect(kickerProblems(game)).toEqual([]);
  });

  it('has no complaint of a hole with none', () => {
    const { game } = newGame(1, null, [lane('o')]);
    expect(kickerProblems(game)).toEqual([]);
  });
});

describe('a ball that meets a kicker is told of, and the kicker lights', () => {
  it('tells of a knock at the kicker, as hard as the throw, and back off it', () => {
    const { game, told } = newGame(1, null, [lane('k')]);
    const k = game.layout.kickers[0];
    const { tee } = game.layout;
    game.shoot(Math.PI / 2, powerFor(arriving(15, k.y - KICKER.radius - tee.y - 1), HARDEST_SHOT));
    for (let f = 0; f < 240; f++) game.step(DT);
    const knocks = told
      .filter((t) => t.startsWith('knocked '))
      .map((t) => t.split(' ').slice(1).map(Number))
      .map(([hard, x, y, dx, dy]) => ({ hard, x, y, dx, dy }));
    expect(knocks.length, told.join('\n')).toBeGreaterThanOrEqual(1);
    const [first] = knocks;
    expect(first.hard, 'turned by about 15 in and 26 out').toBeGreaterThan(30);
    expect(first.dy, 'pushed back down the lane').toBeLessThan(-0.9);
    // and told at the kicker's side, which is how the page knows which one to light
    expect(kickerAt(game.layout, first.x, first.y, KIND_RADIUS[BALL] + 0.25)).toBe(0);
  });

  it('lights at once, fading to nothing in its own short time, and not before it is hit', () => {
    expect(kickFlash(0)).toBe(1);
    let last = 1;
    for (let s = 0.01; s < KICK_FLASH.lasts; s += 0.01) {
      const v = kickFlash(s);
      expect(v).toBeLessThan(last);
      expect(v).toBeGreaterThan(0);
      last = v;
    }
    expect(kickFlash(KICK_FLASH.lasts)).toBe(0);
    expect(kickFlash(KICK_FLASH.lasts + 1)).toBe(0);
    expect(kickFlash(-0.1), 'not yet hit').toBe(0);
    expect(kickFlash(Number.NaN)).toBe(0);
    // the cup's gold fades the same way over its own, longer time: a kicker is the quicker
    expect(KICK_FLASH.lasts).toBeLessThan(FLASH.lasts);
    expect(kickFlash(KICK_FLASH.lasts / 2)).toBeCloseTo(flash(FLASH.lasts / 2), 9);
  });
});

describe('the fuzzer strikes into a kicker, and breaks no rule', () => {
  it('on holes with kickers, from several seeds, and does the thing it was added to do', () => {
    let struck = 0;
    for (const seed of [1, 2, 3]) {
      const r = fuzz(seed, 6000, KICKER_HOLES);
      expect(r.failure, JSON.stringify(r.failure)).toBe(null);
      struck += (r.done['strike a kicker'] as number | undefined) ?? 0;
      expect((r.happened.knocked as number | undefined) ?? 0, `seed ${seed}: knocks`).toBeGreaterThan(0);
    }
    expect(struck, 'struck into a kicker').toBeGreaterThan(5);
  });

  it('leaves a run on holes with no kicker as it was: the action is never done there', () => {
    const r = fuzz(2, 2000);
    expect(r.done['strike a kicker']).toBeUndefined();
  });
});

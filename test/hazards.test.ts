/** The hazards in play: water that costs a stroke, a barrier and a windmill in the way, a belt that carries, and grass up a ramp. */
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { BALL, KIND_RADIUS, STEP, TILE, layoutOf, lieAt, tileLieAt } from '../src/arena';
import { BIOMES } from '../src/biome';
import { troubleWords, runsOff } from '../src/caddie';
import { splashWords } from '../src/eventwords';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { seeded } from '../src/random';
import { landingText } from '../src/readout';
import { Route } from '../src/route';
import { holdsBall, drainFault } from '../src/slopes';
import { LIE, SURFACES } from '../src/surfaces';
import { zonesOf } from '../src/zones';
import type { HoleDef } from '../src/course';
import { KEPT_MOVING, LIMIT_OVER_PAR, type Game } from '../src/game';
import { checkInvariants, lieProblems, panProblems } from '../src/invariants';
import { windmill } from '../src/models';
import { WINDMILL } from '../src/obstacles';
import { DT, field, golfGame, levelHole, newGame } from './helpers';

/** Play `seconds`, checking the rules every frame. */
function play(game: Game, seconds: number) {
  for (let f = 0; f < seconds * 60; f++) {
    game.step(DT);
    const broken = checkInvariants(game);
    if (broken.length) throw new Error(`at ${game.t.toFixed(2)}: ${broken.join('; ')}`);
  }
}
const ball = (game: Game) => ({ x: game.world.x[game.ball], y: game.world.y[game.ball], z: game.world.z[game.ball] });

const POND: HoleDef = {
  name: 'test pond',
  par: 3,
  map: ['#######', '#..C..#', '#.....#', '#~~~~~#', '#~~~~~#', '#.....#', '#..T..#', '#.....#', '#######'],
};

describe('water', () => {
  it('takes a ball rolled into it, costs a stroke, and puts the ball back where it was struck from', () => {
    const { game, told } = newGame(1, null, [POND]);
    const { tee } = game.layout;
    game.shoot(Math.PI / 2, 0.4);
    play(game, 3);
    expect(told.some((t) => t.startsWith('splash'))).toBe(true);
    expect(game.strokes, 'the stroke and a stroke more').toBe(2);
    expect(game.phase).toBe('play');
    expect(game.ready).toBe(true);
    expect(ball(game).x).toBeCloseTo(tee.x, 1);
    expect(ball(game).y).toBeCloseTo(tee.y, 1);
  });

  it('puts the ball back where it was struck from, not on the tee', () => {
    const { game } = newGame(1, null, [POND]);
    const l = game.layout;
    const lie = { x: l.originX + 1.5 * TILE, y: l.originY + 3.5 * TILE };
    game.place(lie.x, lie.y);
    game.shoot(Math.PI / 2, 0.3);
    play(game, 3);
    expect(game.strokes).toBe(2);
    expect(ball(game).x).toBeCloseTo(lie.x, 1);
    expect(ball(game).y).toBeCloseTo(lie.y, 1);
  });

  it('picks the ball up if the water takes it to the limit', () => {
    const { game, told } = newGame(1, null, [POND]);
    const limit = POND.par + LIMIT_OVER_PAR;
    for (let s = 0; s < limit && game.phase === 'play'; s += 2) {
      expect(game.shoot(Math.PI / 2, 0.4)).toBe(true);
      play(game, 3);
    }
    expect(game.phase, 'the hole done, or on a course of one hole, the round').not.toBe('play');
    expect(told).toContain(`pickedUp ${limit} ${POND.par}`);
    expect(game.card).toEqual([limit]);
  });

  it('picks the ball up at the limit, never over it, when the last stroke allowed goes into it', () => {
    const { game, told } = newGame(1, null, [POND]);
    const limit = POND.par + LIMIT_OVER_PAR;
    // one short of the limit, and then the last stroke into the water
    game.strokes = limit - 1;
    expect(game.shoot(Math.PI / 2, 0.4)).toBe(true);
    expect(game.strokes).toBe(limit);
    for (let f = 0; f < 3 * 60 && game.phase === 'play'; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(
      told.some((t) => t.startsWith('splash')),
      'into the water',
    ).toBe(true);
    expect(game.strokes, 'the water costs no stroke past the limit').toBe(limit);
    expect(told).toContain(`pickedUp ${limit} ${POND.par}`);
    expect(game.card).toEqual([limit]);
  });

  it('is not grass to put a ball down on', () => {
    const { game } = newGame(1, null, [POND]);
    const l = game.layout;
    expect(() => game.place(l.originX + 3.5 * TILE, l.originY + 5.5 * TILE)).toThrow(/grass/);
  });
});

describe('grass up a ramp', () => {
  const RAMP: HoleDef = {
    name: 'test ramp',
    par: 3,
    map: [
      '#######',
      '#..C..#',
      '#.....#',
      '#44444#',
      '#44444#',
      '#33333#',
      '#22222#',
      '#11111#',
      '#.....#',
      '#..T..#',
      '#######',
    ],
  };

  it('is climbed a step at a time, and dropped off at its far edge', () => {
    const { game } = newGame(1, null, [RAMP]);
    game.shoot(Math.PI / 2, 0.75);
    let highest = 0;
    for (let f = 0; f < 60 * 6 && game.phase === 'play'; f++) {
      game.step(DT);
      highest = Math.max(highest, ball(game).z);
      expect(checkInvariants(game)).toEqual([]);
    }
    expect(highest, 'up on the top of it').toBeGreaterThan(4 * STEP + KIND_RADIUS[BALL] - 0.05);
    const at = ball(game);
    expect(at.y, 'over the top and down the far side').toBeGreaterThan(game.layout.originY + 8 * TILE);
  });

  it('puts a ball down on raised grass resting on it', () => {
    const { game } = newGame(1, null, [RAMP]);
    const l = game.layout;
    game.place(l.tee.x, l.originY + 6.5 * TILE);
    expect(ball(game).z).toBeCloseTo(4 * STEP + KIND_RADIUS[BALL], 1);
  });
});

describe('a sliding barrier', () => {
  const LANE: HoleDef = {
    name: 'test barrier',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'barrier', at: [3, 4], length: 1, travel: 2.5, period: 4 }],
  };

  it('stops a ball that meets it in the middle of the lane, and moves with game time alone', () => {
    const { game } = newGame(1, null, [LANE]);
    // the barrier is in its middle at the start and every half period: the ball gets there as it is
    game.shoot(Math.PI / 2, 0.55);
    play(game, 1.2);
    const barrierY = game.obstacles.pushers[0].y;
    expect(ball(game).y, 'held on the near side of it').toBeLessThan(barrierY);
    play(game, 6);
    expect(checkInvariants(game)).toEqual([]);
    const one = newGame(1, null, [LANE]).game;
    const two = newGame(2, null, [LANE]).game;
    play(one, 1.7);
    play(two, 1.7);
    expect(one.obstacles.pushers[0].x, 'the same at the same time, whatever the seed').toBe(two.obstacles.pushers[0].x);
  });
});

describe('a windmill', () => {
  const MILL: HoleDef = {
    name: 'test windmill',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '###.###', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'windmill', at: [3, 3], period: 8 }],
  };

  it('is drawn to the figures its blades collide with', () => {
    const model = windmill({
      gap: WINDMILL.gap,
      bladeLength: WINDMILL.bladeLength,
      bladeWidth: WINDMILL.bladeWidth,
      bladeThickness: WINDMILL.bladeThickness,
    });
    for (let a = 0; a < 3; a++) expect(model.hub[a]).toBeCloseTo(WINDMILL.hub[a], 6);
  });

  it('lets a ball through its door when the blades are clear, and stops it when one is down', () => {
    // a quarter blade turn is two seconds: struck at the start a ball meets a blade coming down; struck
    // with the blades clear it goes through
    const through = (wait: number) => {
      const { game } = newGame(1, null, [MILL]);
      play(game, wait);
      game.shoot(Math.PI / 2, 0.62);
      play(game, 5);
      return ball(game).y > layoutOf(MILL.map).originY + 5 * TILE;
    };
    const results = [0, 0.5, 1, 1.5].map(through);
    expect(results, 'through at some moments, and stopped at others').toContain(true);
    expect(results).toContain(false);
  });
});

describe('a conveyor', () => {
  const BELT: HoleDef = {
    name: 'test conveyor',
    par: 3,
    map: ['#######', '#..C..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#..T..#', '#######'],
    obstacles: [{ kind: 'conveyor', from: [1, 6], to: [1, 2], speed: 6 }],
  };

  it('carries a ball resting on it the way it runs', () => {
    const { game } = newGame(1, null, [BELT]);
    const l = game.layout;
    const start = { x: l.originX + 1.5 * TILE, y: l.originY + 2.5 * TILE };
    game.place(start.x, start.y);
    expect(ball(game).y, 'put down where it was put, not carried off while it settled').toBeCloseTo(start.y, 1);
    play(game, 1);
    expect(ball(game).y - start.y).toBeGreaterThan(3);
    // at the belt's own speed, once it has it: a belt is not the green, and does not slow what it carries
    const y = ball(game).y;
    play(game, 0.5);
    expect((ball(game).y - y) / 0.5, 'at about the belt speed of 6').toBeGreaterThan(5);
    expect(game.world.asleep[game.ball], 'and never asleep while it is carried').toBe(0);
  });
});

describe('a ball the course keeps moving', () => {
  it('may be struck where it lies once it has been kept moving long enough, and counts as come to rest', () => {
    const LANE: HoleDef = {
      name: 'test carried',
      par: 3,
      map: ['#######', '#..C..#', ...Array.from({ length: 10 }, () => '#.....#'), '#..T..#', '#######'],
      // long enough that it carries the ball the whole of the time
      obstacles: [{ kind: 'conveyor', from: [1, 11], to: [1, 1], speed: 2 }],
    };
    const { game, told } = newGame(1, null, [LANE]);
    const l = game.layout;
    // struck gently along a belt running the length of the hole: it is carried the whole time
    game.place(l.originX + 1.5 * TILE, l.originY + 2.5 * TILE);
    game.shoot(Math.PI / 2, 0.02);
    play(game, KEPT_MOVING - 0.5);
    expect(game.ready, 'still carried, and not yet long enough').toBe(false);
    play(game, 1);
    expect(game.ready).toBe(true);
    expect(told.filter((t) => t.startsWith('stopped')).length, 'told as come to rest').toBe(1);
    // struck the hardest it can be the way the belt runs: at the shot's speed, not the shot's and the belt's
    expect(game.shoot(Math.PI / 2, 1)).toBe(true);
    expect(Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball])).toBeCloseTo(game.hardest, 3);
    expect(checkInvariants(game)).toEqual([]);
  });
});

describe('putting a ball down', () => {
  it('refuses a spot against a raised step, where the ball would be pushed off it, perhaps into water', () => {
    const MAP: HoleDef = {
      name: 'test step',
      par: 3,
      map: ['#######', '#..C..#', '#.....#', '#~444~#', '#.....#', '#..T..#', '#######'],
    };
    const { game } = newGame(1, null, [MAP]);
    const l = game.layout;
    const edge = l.originY + 4 * TILE;
    expect(() => game.place(l.tee.x, edge + 0.6)).toThrow(/level grass/);
    expect(() => game.place(l.tee.x, edge - 0.6)).toThrow(/level grass/);
    // level grass clear of the step, and of the cup
    expect(() => game.place(l.originX + 1.5 * TILE, edge + 1.5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// the pan: a desert's lake, ground that is in play, and the other biomes' lakes, which are water told in their own words
// ---------------------------------------------------------------------------------------------------------------------

const NORTH = Math.PI / 2;

/** A ball struck north and followed until it is ready: what it did on the way down and where it came to rest. */
function flown(def: HoleDef, club: string, power: number, from?: { x: number; y: number }) {
  const { game, calls } = golfGame(def);
  if (from) game.place(from.x, from.y);
  const y0 = game.world.y[game.ball];
  game.pick(club);
  expect(game.shoot(NORTH, power)).toBe(true);
  let peak = 0,
    second = false;
  for (let f = 0; f < 60 * 40 && !game.ready; f++) {
    game.step(DT);
    const n = calls.filter(([c]) => c === 'landed').length;
    if (n >= 2) second = true;
    // how high it hops after the first landing, until the second
    if (n >= 1 && !second) peak = Math.max(peak, game.world.z[game.ball]);
    expect(checkInvariants(game), `frame ${f}`).toEqual([]);
  }
  expect(game.ready).toBe(true);
  const land = calls.find(([c]) => c === 'landed');
  return {
    game,
    calls,
    peak,
    carry: land ? (land[1][1] as number) - y0 : NaN,
    rest: game.world.y[game.ball] - y0,
  };
}

describe('a pan', () => {
  it('is a lie of its own, appended after the others, with a row in the table', () => {
    expect(LIE.pan).toBe(7);
    expect(SURFACES[LIE.pan].name).toBe('hardpan');
    expect(SURFACES.length).toBe(8);
    for (const [name, lie] of Object.entries({ none: 0, tee: 1, fairway: 2, rough: 3, green: 4, sand: 5, cut: 6 }))
      expect(LIE[name as keyof typeof LIE]).toBe(lie);
  });

  it('is read the same by the zones, the lie and the physics: ground a ball rolls on at the pan’s own roll', () => {
    const { game } = golfGame(field('d', 130, 41, undefined, 4, 'desert'));
    const l = game.layout;
    const at = { x: l.tee.x, y: l.tee.y + 8 * TILE };
    expect(zonesOf(l).at(at.x, at.y)).toBe('pan');
    expect(lieAt(l, at.x, at.y)).toBe(LIE.pan);
    expect(tileLieAt(l, at.x, at.y)).toBe(LIE.pan);
    expect(l.water.some((w) => w === 1)).toBe(false);
    expect(game.rollAt(at.x, at.y)).toBe(BIOMES.desert.surfaces[LIE.pan].roll);
    expect(lieProblems(game, at.x, at.y)).toEqual([]);
  });

  it('takes a ball that lands and runs further than on the fairway, hopping higher, and does not lose it', () => {
    const pan = flown(field('d', 200, 41, undefined, 4, 'desert'), '7-iron', 1);
    const fairway = flown(field('f', 200, 41, undefined, 4, 'desert'), '7-iron', 1);
    expect(pan.carry).toBeGreaterThan(50);
    expect(Math.abs(pan.carry - fairway.carry), 'the same flight').toBeLessThan(3);
    expect(pan.rest - pan.carry, 'runs on').toBeGreaterThan(fairway.rest - fairway.carry + 3);
    expect(pan.peak, 'and hops').toBeGreaterThan(fairway.peak + 0.3);
    expect(pan.calls.some(([c]) => c === 'splash' || c === 'outOfBounds')).toBe(false);
    expect(pan.game.strokes).toBe(1);
    expect(pan.game.phase).toBe('play');
  });

  it('is struck from at full power: no stroke added and no loss, and the swing loses less than the fairway’s', () => {
    const base = field('d', 200, 41, undefined, 6, 'desert');
    const { game } = golfGame(base);
    const from = { x: game.layout.tee.x, y: game.layout.tee.y + 3 * TILE };
    const struck = flown(base, 'driver', 1, from);
    expect(lieAt(struck.game.layout, from.x, from.y)).toBe(LIE.pan);
    const fairway = flown(field('f', 200, 41, undefined, 6, 'desert'), 'driver', 1, from);
    // the pan takes none of the swing's speed (power 1), and the fairway two in a hundred
    expect(struck.carry).toBeGreaterThan(fairway.carry);
    expect(struck.game.strokes).toBe(1);
    expect(struck.calls.some(([c]) => c === 'splash')).toBe(false);
  });

  it('is never lost in: a ball put down on it stays, ready, at no stroke', () => {
    const { game, calls } = golfGame(field('d', 130, 41, undefined, 4, 'desert'));
    const at = { x: game.layout.tee.x, y: game.layout.tee.y + 10 * TILE };
    game.place(at.x, at.y);
    for (let f = 0; f < 120; f++) {
      game.step(DT);
      expect(checkInvariants(game)).toEqual([]);
    }
    expect(game.ready).toBe(true);
    expect(game.strokes).toBe(0);
    expect(calls.some(([c]) => c === 'splash')).toBe(false);
  });

  it('loses a ball that runs off it out of bounds, as ever', () => {
    // a lane of pan running north into out of bounds
    const map = [
      '###########',
      '#xxxxxxxxx#',
      '#xxxxxxxxx#',
      '#xxxxdxxxx#',
      ...Array.from({ length: 14 }, () => '#rrrrdrrrr#'),
      '#rrrCdrrrr#',
      '#rrrrdrrrr#',
      '#rrrrdrrrr#',
      '#rrrttTtrr#',
      '#rrrrrrrrr#',
      '###########',
    ];
    const def: HoleDef = { name: 'Pan lane', par: 3, biome: 'desert', map };
    const { game, calls } = golfGame(def);
    game.place(game.layout.originX + 5.5 * TILE, game.layout.originY + 4.5 * TILE);
    game.pick('putter');
    expect(game.shoot(NORTH, 1)).toBe(true);
    for (let f = 0; f < 60 * 20; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
      if (calls.some(([c]) => c === 'outOfBounds')) break;
    }
    expect(
      calls.some(([c]) => c === 'outOfBounds'),
      'lost out of bounds, not left on the pan',
    ).toBe(true);
    expect(game.strokes).toBe(2);
  });

  it('is refused by name on a hole that is not a desert’s', () => {
    const map = levelHole({ name: 'x', par: 3, length: 150, pan: { along: 100, across: 0, radius: 12 } }).map;
    expect(map.some((row) => row.includes('d'))).toBe(true);
    for (const biome of [undefined, 'earth', 'moon', 'future'] as const)
      expect(() => layoutOf(map, undefined, undefined, biome), String(biome)).toThrow(/pan/);
    expect(() => layoutOf(map, undefined, undefined, 'desert')).not.toThrow();
  });

  it('has panProblems: no pan tile is water, and only a desert has one', () => {
    const desert = golfGame(
      levelHole({ name: 'p', par: 3, length: 150, biome: 'desert', pan: { along: 100, across: 0, radius: 12 } }),
    ).game;
    expect(panProblems(desert.layout)).toEqual([]);
    expect(checkInvariants(desert)).toEqual([]);
    const pan = desert.layout.lie.findIndex((k) => k === LIE.pan);
    expect(pan).toBeGreaterThan(-1);
    desert.layout.water[pan] = 1;
    expect(panProblems(desert.layout).join()).toMatch(/water/);
    expect(checkInvariants(desert).join()).toMatch(/pan/);
    desert.layout.water[pan] = 0;
    const earth = golfGame(levelHole({ name: 'e', par: 3, length: 150 })).game;
    earth.layout.lie[earth.layout.lie.findIndex((k) => k === LIE.rough)] = LIE.pan;
    expect(panProblems(earth.layout).join()).toMatch(/earth/);
    expect(checkInvariants(earth).join()).toMatch(/pan/);
  });

  it('holds a ball at rest on a slope by the pan’s roll, which is less than a fairway’s', () => {
    const rows = 40,
      cols = 21;
    const tilted = (slope: number, ch: 'd' | 'f') => {
      const terrain = new Float32Array(rows * cols);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) terrain[r * cols + c] = slope * r * TILE;
      return layoutOf(field(ch, rows, cols, terrain, 3, 'desert').map, terrain, undefined, 'desert');
    };
    const middle = (l: ReturnType<typeof layoutOf>) => 20 * l.cols + 10;
    // a slope of 0.1 is held by the pan (roll 10 holds up to about 0.145) and 0.2 is not, though the fairway (18 in the desert) holds 0.27
    const [d1, d2, f2] = [tilted(0.1, 'd'), tilted(0.2, 'd'), tilted(0.2, 'f')];
    expect(holdsBall(d1, middle(d1))).toBe(true);
    expect(holdsBall(d2, middle(d2))).toBe(false);
    expect(holdsBall(f2, middle(f2))).toBe(true);
    // and a pan that runs must drain, as fairway does: this one runs down to the rail, which is no end
    expect(drainFault(d2)).toBeGreaterThan(-1);
    expect(drainFault(d1)).toBe(-1);
  });
});

describe('a desert’s lake', () => {
  const spec = { ...LINKS_SPECS[1], biome: 'desert' as const };

  it('is drawn d where earth’s is ~, the same shapes, and there is no water', () => {
    const earth = golfHole(LINKS_SPECS[1]);
    const desert = golfHole(spec);
    expect(desert.biome).toBe('desert');
    expect(desert.map.some((row) => row.includes('~'))).toBe(false);
    expect(desert.map.some((row) => row.includes('d'))).toBe(true);
    expect(desert.map.map((row) => row.replaceAll('d', '~'))).toEqual(earth.map);
    const l = layoutOf(desert.map, desert.terrain, desert.way, 'desert');
    expect(l.water.every((w) => w === 0)).toBe(true);
    expect(panProblems(l)).toEqual([]);
  });

  it('is played to the end by the autopilot, across the pan, with no ball lost to water', () => {
    const def = golfHole(spec);
    const { game, calls } = golfGame(def, seeded(5));
    const pilot = new Autopilot(game, { random: seeded(7) });
    for (let f = 0; f < 60 * 60 * 6 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 15 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(calls.some(([c]) => c === 'splash')).toBe(false);
  });

  it('has a route across the pan to the cup', () => {
    const desert = golfHole(spec);
    const l = layoutOf(desert.map, desert.terrain, desert.way, 'desert');
    expect(Number.isFinite(new Route(l).distance(l.tee.x, l.tee.y))).toBe(true);
  });
});

describe('a crater and a mirror', () => {
  for (const [biome, word] of [
    ['moon', 'crater'],
    ['future', 'quicksilver'],
  ] as const) {
    it(`cost a stroke and put the ball back as water does, and are told as the ${word}`, () => {
      expect(BIOMES[biome].hazard).toBe(biome === 'moon' ? 'crater' : 'mirror');
      expect(BIOMES[biome].words.lake).toBe(word);
      const def = levelHole({
        name: `lake ${biome}`,
        par: 3,
        length: 150,
        biome,
        pond: { along: 104, across: 0, radius: 15 },
      });
      // a drive of the power that finds the pond, as the waders' test finds it
      let found: ReturnType<typeof golfGame> | null = null;
      for (let p = 0.3; p <= 0.8 && !found; p += 0.02) {
        const tried = golfGame(def);
        tried.game.shoot(NORTH, p);
        for (let f = 0; f < 60 * 20 && !tried.game.ready; f++) tried.game.step(DT);
        if (tried.calls.some(([c]) => c === 'splash')) found = tried;
      }
      expect(found, 'a drive that finds it').not.toBeNull();
      const { game, calls } = found!;
      const { tee } = game.layout;
      expect(
        calls.some(([c]) => c === 'splash'),
        'lost in it',
      ).toBe(true);
      expect(game.strokes, 'the stroke and a stroke more').toBe(2);
      expect(game.world.x[game.ball]).toBeCloseTo(tee.x, 1);
      expect(game.world.y[game.ball]).toBeCloseTo(tee.y, 1);
      expect(splashWords(false, BIOMES[biome].words.lake)).toBe(`In the ${word}! +1`);
      expect(splashWords(true, BIOMES[biome].words.lake)).toBe(`In the ${word}! Waders: free`);
    });
  }

  it('leave earth’s words as they were', () => {
    expect(BIOMES.earth.hazard).toBe('water');
    expect(BIOMES.desert.hazard).toBe('pan');
    expect(splashWords(false)).toBe('In the water! +1');
    expect(splashWords(true)).toBe('In the water! Waders: free');
    expect(landingText({ carry: 100, end: 'water', lie: LIE.rough, hit: false })).toBe('lands 100 yd · in the water');
    expect(landingText({ carry: 100, end: 'water', lie: LIE.rough, hit: false }, 'crater')).toBe(
      'lands 100 yd · in the crater',
    );
    expect(troubleWords('water', 240)).toBe('finds the water at 240 yd');
    expect(troubleWords('water', 240, 'crater')).toBe('finds the crater at 240 yd');
    expect(runsOff('water', LIE.rough, 'quicksilver')).toBe('runs into the quicksilver');
    expect(runsOff('water', LIE.rough)).toBe('runs into the water');
  });
});

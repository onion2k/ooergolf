/**
 * The minigolf strike (Part 3): what a club does to a putt that never leaves the ground. Putt power, touch, putt scatter,
 * the bend, putt spin and the chip, each off by default and each tested against the putt it leaves alone.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, RAIL_HEIGHT, lieAt, strikeSpeed } from '../src/arena';
import { LIE } from '../src/surfaces';
import { puttAngle, puttMiss, chipLoft } from '../src/flight';
import type { HoleDef } from '../src/course';
import { Game } from '../src/game';
import { checkInvariants, chipProblems } from '../src/invariants';
import { NO_KIT } from '../src/items';
import { Progress, memoryStore } from '../src/progress';
import { PUTT_SHAPE, bendRate, puttSpinFactor } from '../src/shaping';
import { Gesture } from '../src/gesture';
import { DRAG, shotFromDrag } from '../src/shot';
import { DT, GREEN } from './helpers';
import { counted, wearing } from './kits';

const speedOf = (g: Game) => Math.hypot(g.world.vx[g.ball], g.world.vy[g.ball]);
const headingOf = (g: Game) => Math.atan2(g.world.vy[g.ball], g.world.vx[g.ball]);
const run = (g: Game, frames: number) => {
  for (let f = 0; f < frames; f++) g.step(DT);
};

/** A hole with a patch of sand in the middle of its floor, for a putt from the sand. */
const SANDY: HoleDef = {
  name: 'Sandy green',
  par: 3,
  map: [
    '######################',
    '#.C..................#',
    ...Array.from({ length: 8 }, () => '#....................#'),
    ...Array.from({ length: 4 }, () => '#.........ssss.......#'),
    ...Array.from({ length: 6 }, () => '#....................#'),
    '#..........T.........#',
    '#....................#',
    '######################',
  ],
};
const SAND_AT = { x: 4.5, y: -4 };

/** A game on `hole` with `kit` given outright, as a rehearsal is, for a figure no item has. */
function withKit(kit: Partial<typeof NO_KIT>, hole: HoleDef = GREEN) {
  return new Game(
    new Progress(memoryStore()),
    {},
    { random: () => 0.5, course: [hole], kit: () => ({ ...NO_KIT, ...kit }) },
  );
}

describe('every strike figure off is the putt that was', () => {
  it('strikes at the hardest shot’s speed along the aim, draws no chance, and goes straight, with a shape and a spin chosen', () => {
    const rolls = counted(5);
    const { game } = wearing([], [GREEN], rolls.random);
    game.setShape(1);
    game.setSpin(1);
    const before = rolls.drawn();
    game.shoot(0.7, 0.5);
    expect(rolls.drawn() - before).toBe(0);
    expect(speedOf(game)).toBeCloseTo(strikeSpeed(0.5, HARDEST_SHOT), 4);
    expect(headingOf(game)).toBeCloseTo(0.7, 6);
    expect(game.chipFlying).toBe(false);
    expect(game.world.vz[game.ball]).toBe(0);
    // chosen with no club that bends or spins, the shape and the spin change no putt: bit for bit the unchosen one
    const plain = wearing([], [GREEN]).game;
    plain.shoot(0.7, 0.5);
    run(game, 200);
    run(plain, 200);
    for (const a of ['x', 'y', 'z'] as const) expect(game.world[a][game.ball]).toBe(plain.world[a][plain.ball]);
    expect(game.strokes).toBe(plain.strokes);
  });

  it('has a neutral figure for each helper: no miss, no turn, no spin, no chip', () => {
    expect(puttMiss(1, NO_KIT)).toBe(0);
    expect(puttAngle(0.3, 1, () => 0.9, NO_KIT)).toBe(0.3);
    expect(bendRate(1, NO_KIT)).toBe(0);
    expect(puttSpinFactor(1, NO_KIT)).toBe(1);
    expect(chipLoft(true, NO_KIT)).toBe(0);
    expect(chipLoft(false, NO_KIT)).toBe(0);
  });
});

describe('putt power', () => {
  it('strikes as much harder as the club says, the mallet’s 15% for a putt of the same power', () => {
    const { game } = wearing(['mallet'], [GREEN]);
    expect(game.hardest).toBeCloseTo(HARDEST_SHOT * 1.15, 12);
    game.shoot(0.4, 0.5);
    expect(speedOf(game)).toBeCloseTo(strikeSpeed(0.5, HARDEST_SHOT * 1.15), 4);
  });

  it('is held to 1.2 of the hardest whatever is worn with it', () => {
    const { game } = wearing(['mallet', 'shoes'], [GREEN]);
    expect(game.hardest).toBeCloseTo(HARDEST_SHOT * 1.2, 12);
  });
});

describe('touch', () => {
  it('maps a drag as its share of the full length to the touch, and a short drag stays short', () => {
    const SHORT = 800;
    const half = DRAG.full * SHORT * 0.5;
    const shot = (touch: number, length = half) => shotFromDrag([0, 0], [0, length], [0, 0], [0, -1], SHORT, touch)!;
    expect(shot(1).power).toBeCloseTo(0.5, 12);
    expect(shot(1.5).power).toBeCloseTo(0.5 ** 1.5, 12);
    expect(shot(0.85).power).toBeCloseTo(0.5 ** 0.85, 12);
    // the full drag is the full power at any touch, and a drag under the dead zone is no shot
    expect(shot(1.8, DRAG.full * SHORT).power).toBe(1);
    expect(shotFromDrag([0, 0], [0, DRAG.dead * SHORT * 0.9], [0, 0], [0, -1], SHORT, 1.8)).toBeNull();
    // a touch of one is the drag as it always was, to the digit
    expect(shot(1).power).toBe(Math.min(1, half / (DRAG.full * SHORT)));
  });

  it('is carried by the gesture to the shot, as the page gives it', () => {
    const SHORT = 800;
    let touch = 1.5;
    const g = new Gesture({ shortSide: () => SHORT, ground: (x, y) => [x, -y], touch: () => touch });
    const pull = DRAG.full * SHORT * 0.5;
    g.down(1, 400, 300);
    g.move(1, 400, 300 + pull);
    expect(g.aim?.power).toBeCloseTo(0.5 ** 1.5, 12);
    touch = 1;
    g.move(1, 400, 300 + pull + 1);
    expect(g.aim!.power).toBeCloseTo(0.5, 2);
  });

  it('is the club’s on either kind of course for the putter, and never for a lofted club', () => {
    const mini = wearing(['mallet'], [GREEN]).game;
    expect(mini.touch).toBe(1.5);
    expect(wearing([], [GREEN]).game.touch).toBe(1);
    const golf = wearing(['mallet'], [onGolf()]).game;
    expect(golf.inHand.loft).toBeGreaterThan(0);
    expect(golf.touch, 'a driver in hand').toBe(1);
    golf.pick('putter');
    expect(golf.touch, 'the putter in hand').toBe(1.5);
  });

  it('does not touch a shot set by power: the test API’s and the fuzzer’s are the power they say', () => {
    const { game } = wearing(['mallet', 'gloves'], [GREEN]);
    game.shoot(0, 0.3);
    expect(speedOf(game)).toBeCloseTo(strikeSpeed(0.3, game.hardest), 4);
  });
});

function onGolf(): HoleDef {
  return FIELD();
}
import { field } from './helpers';
function FIELD(): HoleDef {
  return field('f');
}

describe('putt scatter', () => {
  /** How far a putt struck at `power` toward 0.5 radians was turned from it, over `n` games on one stream of chance. */
  function misses(ids: string[], power: number, n = 120) {
    const rolls = counted(9);
    const out: number[] = [];
    let draws = 0;
    for (let k = 0; k < n; k++) {
      const { game } = wearing(ids, [GREEN], rolls.random);
      const before = rolls.drawn();
      game.shoot(0.5, power);
      draws = rolls.drawn() - before;
      out.push(Math.abs(headingOf(game) - 0.5));
    }
    return { widest: Math.max(...out), draws };
  }
  const deg = (d: number) => (d * Math.PI) / 180;

  it('is bounded by the club’s degrees at full power and drawn from the game’s chance, two draws a putt', () => {
    const { widest, draws } = misses(['long'], 1);
    expect(draws).toBe(2);
    expect(widest).toBeLessThanOrEqual(deg(2) + 1e-12);
    // and it does miss: by more than half a degree somewhere in a hundred and twenty
    expect(widest).toBeGreaterThan(deg(0.5));
  });

  it('grows with the power: a half-power putt misses by at most half as much', () => {
    const { widest } = misses(['long'], 0.5);
    expect(widest).toBeLessThanOrEqual(deg(1) + 1e-12);
    expect(widest).toBeGreaterThan(deg(0.1));
  });

  it('is drawn only with a club that has it: a mallet, a ball and gloves alone draw no chance', () => {
    for (const ids of [[], ['mallet'], ['clay'], ['gloves'], ['cavity', 'gloves'], ['blades', 'feather', 'tee']]) {
      const { widest, draws } = misses(ids, 1, 5);
      expect(draws, ids.join()).toBe(0);
      expect(widest, ids.join()).toBeLessThan(1e-6);
    }
  });

  it('is halved by the gloves, which have nothing to halve alone', () => {
    const { widest, draws } = misses(['long', 'gloves'], 1);
    expect(draws).toBe(2);
    expect(widest).toBeLessThanOrEqual(deg(1) + 1e-12);
    expect(widest).toBeGreaterThan(0);
  });
});

describe('the bend', () => {
  it('turns the heading by the club’s rate a second for its first second, clockwise for a fade, and adds no speed', () => {
    const { game } = wearing(['bender'], [GREEN]);
    const flat = wearing([], [GREEN]).game;
    game.setShape(1);
    game.shoot(Math.PI / 2, 0.5);
    flat.shoot(Math.PI / 2, 0.5);
    run(game, 30);
    run(flat, 30);
    // half a second on: the heading has turned by about 0.35 * 0.5, to the right (clockwise, so smaller)
    expect(Math.PI / 2 - headingOf(game)).toBeCloseTo(0.35 * 0.5, 1);
    // a pure rotation: the speed is the unbent putt’s, to the digit
    expect(speedOf(game)).toBeCloseTo(speedOf(flat), 3);
    expect(headingOf(flat)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('turns the other way for a draw, by a fraction of the rate for a partial shape, and not at all for none', () => {
    const turned = (shape: number, ids = ['bender']) => {
      const { game } = wearing(ids, [GREEN]);
      game.setShape(shape);
      game.shoot(Math.PI / 2, 0.5);
      run(game, 30);
      return headingOf(game) - Math.PI / 2;
    };
    expect(turned(-1)).toBeCloseTo(0.35 * 0.5, 1);
    expect(turned(0.5)).toBeCloseTo(-0.35 * 0.25, 1);
    expect(turned(0)).toBeCloseTo(0, 9);
    expect(turned(1, [])).toBeCloseTo(0, 9);
    expect(turned(1, ['hickory'])).toBeCloseTo(-0.5 * 0.5, 1);
  });

  it('stops after its first second: the heading is the same at two seconds as at one and a half', () => {
    const { game } = wearing(['bender'], [GREEN]);
    game.setShape(1);
    game.shoot(Math.PI / 2, 0.5);
    run(game, 64);
    const one = headingOf(game);
    expect(Math.PI / 2 - one).toBeCloseTo(0.35 * PUTT_SHAPE.seconds, 1);
    expect(speedOf(game)).toBeGreaterThan(0);
    // the putt dies at about 1.7 seconds: stop short of it
    const at = (frames: number) => {
      const g = wearing(['bender'], [GREEN]).game;
      g.setShape(1);
      g.shoot(Math.PI / 2, 0.5);
      run(g, frames);
      return headingOf(g);
    };
    expect(speedOf(game)).toBeGreaterThan(0);
    expect(at(80)).toBeCloseTo(at(70), 5);
    expect(at(80)).toBeCloseTo(one, 5);
  });

  it('stops at its first knock, so a ball cannot be steered along a rail', () => {
    const knocks: number[] = [];
    const seen: { game?: Game } = {};
    const { game } = wearing(['bender'], [GREEN], () => 0.5, { knocked: () => knocks.push(seen.game!.t) });
    seen.game = game;
    game.place(24, 0);
    game.setShape(-1);
    game.shoot(0.3, 0.5);
    let knockedAt = -1;
    for (let f = 0; f < 120 && knockedAt < 0; f++) {
      game.step(DT);
      if (knocks.length) knockedAt = f;
    }
    expect(knockedAt, 'the putt meets the east rail inside its first second').toBeGreaterThan(0);
    expect(knockedAt).toBeLessThan(55);
    // after the knock the heading holds: the second left of its bend is not spent turning along the rail
    const after = headingOf(game);
    run(game, 10);
    expect(headingOf(game)).toBeCloseTo(after, 5);
    run(game, 10);
    expect(headingOf(game)).toBeCloseTo(after, 5);
  });

  it('is latched at the strike: choosing the next shape while the putt rolls changes nothing of it', () => {
    const a = wearing(['bender'], [GREEN]).game,
      b = wearing(['bender'], [GREEN]).game;
    for (const g of [a, b]) {
      g.setShape(1);
      g.shoot(Math.PI / 2, 0.5);
    }
    run(a, 20);
    run(b, 20);
    b.setShape(-1);
    run(a, 20);
    run(b, 20);
    expect(headingOf(a)).toBe(headingOf(b));
    expect(a.shape).toBe(0);
  });

  it('breaks no rule while it turns', () => {
    const { game } = wearing(['bender'], [GREEN]);
    game.setShape(1);
    game.shoot(Math.PI / 2, 1);
    for (let f = 0; f < 200; f++) {
      game.step(DT);
      expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
  });
});

describe('putt spin', () => {
  /** Every knock of a putt from (-10, 10) at 0.5 radians, power one, as the speed it leaves each with over the speed it came to it. */
  function ratios(ids: string[], spin: number): number[] {
    const out: number[] = [];
    let before = 0;
    const knock = { flagged: false };
    const { game } = wearing(ids, [GREEN], () => 0.5, { knocked: () => (knock.flagged = true) });
    game.place(-10, 10);
    game.setSpin(spin);
    game.shoot(0.5, 1);
    for (let f = 0; f < 300 && !game.ready; f++) {
      before = speedOf(game);
      knock.flagged = false;
      game.step(DT);
      if (knock.flagged as boolean) out.push(speedOf(game) / before);
    }
    return out;
  }

  it('changes only the first knock: top keeps 1.3 of it, back 0.6, and the second knock is the rail’s own', () => {
    const flat = ratios(['spinner'], 0);
    const top = ratios(['spinner'], 1);
    const back = ratios(['spinner'], -1);
    expect(flat.length).toBeGreaterThanOrEqual(2);
    expect(top[0] / flat[0]).toBeCloseTo(1 + PUTT_SHAPE.top, 1);
    expect(back[0] / flat[0]).toBeCloseTo(1 - PUTT_SHAPE.back, 1);
    expect(top.length).toBeGreaterThanOrEqual(2);
    expect(top[1] / flat[1]).toBeCloseTo(1, 1);
    expect(back[1] / flat[1]).toBeCloseTo(1, 1);
  });

  it('is a fraction of the figure at a fraction of the spin, and the club’s strength scales it', () => {
    expect(puttSpinFactor(0.5, { ...NO_KIT, puttSpin: 1 })).toBeCloseTo(1.15, 12);
    expect(puttSpinFactor(-0.5, { ...NO_KIT, puttSpin: 1 })).toBeCloseTo(0.8, 12);
    expect(puttSpinFactor(1, { ...NO_KIT, puttSpin: 0.7 })).toBeCloseTo(1.21, 12);
    expect(puttSpinFactor(1, { ...NO_KIT, puttSpin: 1 })).toBeCloseTo(1.3, 12);
    expect(puttSpinFactor(-1, { ...NO_KIT, puttSpin: 1 })).toBeCloseTo(0.6, 12);
    expect(puttSpinFactor(0, { ...NO_KIT, puttSpin: 1 })).toBe(1);
    expect(puttSpinFactor(1, NO_KIT)).toBe(1);
  });

  it('leaves a putt that meets no rail as it was', () => {
    const a = wearing(['spinner'], [GREEN]).game,
      b = wearing([], [GREEN]).game;
    a.setSpin(1);
    for (const g of [a, b]) g.shoot(Math.PI / 2, 0.2);
    run(a, 100);
    run(b, 100);
    expect(a.world.y[a.ball]).toBe(b.world.y[b.ball]);
  });
});

describe('the chip', () => {
  /** The most a chipped ball rises above where it left from, and the invariants checked every frame of the flight. */
  function flight(game: Game, power: number) {
    const { world, ball } = game;
    const z0 = world.z[ball];
    game.shoot(0.5, power);
    expect(game.chipFlying, 'struck as a chip').toBe(true);
    let rise = 0;
    for (let f = 0; f < 300 && !game.ready; f++) {
      game.step(DT);
      rise = Math.max(rise, world.z[ball] - z0);
      expect(chipProblems(game), `frame ${f}`).toEqual([]);
    }
    return rise;
  }

  it('never rises above the rail at the hardest power, however steep the loft is asked to be', () => {
    for (const chipAll of [5, 12, 45, 80]) {
      const game = withKit({ chipAll, putterPower: 1.2 });
      game.place(-5, 0);
      const rise = flight(game, 1);
      expect(rise, `${chipAll} degrees`).toBeLessThanOrEqual(RAIL_HEIGHT + 0.05);
      if (chipAll >= 45) expect(rise, `${chipAll} degrees reached the cap`).toBeGreaterThan(RAIL_HEIGHT - 0.2);
    }
  });

  it('is shallow for the lob wedges’ 5 degrees, well under the rail, and lands back on the floor', () => {
    const { game } = wearing(['lob', 'shoes'], [GREEN]);
    game.place(-5, 0);
    const rise = flight(game, 1);
    expect(rise).toBeGreaterThan(0.05);
    expect(rise).toBeLessThan(RAIL_HEIGHT / 2);
    expect(game.chipFlying).toBe(false);
  });

  it('is struck from sand at 12 degrees by the bunker blaster, and from the grass not at all', () => {
    const { game } = wearing(['bunker'], [SANDY]);
    game.place(SAND_AT.x, SAND_AT.y);
    game.shoot(0.5, 0.5);
    expect(game.chipFlying).toBe(true);
    const vz = game.world.vz[game.ball];
    const along = Math.hypot(game.world.vx[game.ball], game.world.vy[game.ball]);
    expect(Math.atan2(vz, along)).toBeCloseTo((12 * Math.PI) / 180, 6);
    const grass = wearing(['bunker'], [SANDY]).game;
    grass.place(-6, 8);
    grass.shoot(0.5, 0.5);
    expect(grass.chipFlying).toBe(false);
    expect(grass.world.vz[grass.ball]).toBe(0);
  });

  it('is struck from every tile by the lob wedges, the larger of the two when both ask', () => {
    const { game } = wearing(['lob'], [GREEN]);
    game.shoot(0.5, 0.5);
    expect(game.chipFlying).toBe(true);
    expect(chipLoft(false, { ...NO_KIT, chipAll: 5, chipSand: 12 })).toBe(5);
    expect(chipLoft(true, { ...NO_KIT, chipAll: 5, chipSand: 12 })).toBe(12);
    expect(chipLoft(true, { ...NO_KIT, chipAll: 20, chipSand: 12 })).toBe(20);
  });

  it('ends when the ball comes to rest, so the next stroke is not a chip’s flight', () => {
    const { game } = wearing(['lob'], [GREEN]);
    game.shoot(0.5, 0.3);
    run(game, 400);
    expect(game.ready).toBe(true);
    expect(game.chipFlying).toBe(false);
  });
});

describe('the sand putt', () => {
  it('multiplies the speed of a putt struck from sand by the club’s figure, and of no other', () => {
    const rescue = wearing(['rescue'], [SANDY]).game,
      plain = wearing([], [SANDY]).game;
    for (const g of [rescue, plain]) {
      g.place(SAND_AT.x, SAND_AT.y);
      g.shoot(0.5, 0.5);
    }
    expect(speedOf(rescue)).toBeCloseTo(speedOf(plain) * 1.3, 4);
    const grass = wearing(['rescue'], [SANDY]).game;
    grass.place(-6, 8);
    grass.shoot(0.5, 0.5);
    expect(speedOf(grass)).toBeCloseTo(strikeSpeed(0.5, HARDEST_SHOT), 4);
  });

  it('multiplies a golf putter’s launch from a bunker too', () => {
    const hole = field('s');
    const a = wearing(['rescue'], [hole]).game,
      b = wearing([], [hole]).game;
    for (const g of [a, b]) {
      g.pick('putter');
      g.place(0, 0);
      expect(lieAt(g.layout, 0, 0), 'in the bunker').toBe(LIE.sand);
      g.shoot(0, 0.5);
    }
    expect(speedOf(a) / speedOf(b)).toBeCloseTo(1.3, 5);
  });
});

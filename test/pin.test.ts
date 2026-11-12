/**
 * The flag's pin, which a ball in the air strikes and a ball on the ground never does. It is a round pole at the cup's middle
 * (`PIN`, the figures the picture draws it with), and a ball that meets it in flight loses half its speed along the ground and the
 * game tells `pinned`, once a stroke. Putting is as it was: the cup test's balls are rolled again here and tell nothing of it.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, KIND_RADIUS, BALL, powerFor } from '../src/arena';
import { PIN, pinTarget } from '../src/course';
import { pinnedProblems } from '../src/invariants';
import { FLAG_COLOURS } from '../src/models';
import { flag } from '../src/models/course';
import { DT, field, golfGame } from './helpers';
import { OPEN, shootAtCup } from './open-green';

const NORTH = Math.PI / 2;
/** The pin's target: how far from its axis the middle of the ball must come. */
const REACH = pinTarget(KIND_RADIUS[BALL]);

/**
 * A stroke with `club` at `power`, struck due north from `back` yards south of the cup and `aside` east of its line, as the game's
 * next stroke and not the hole's first (an ace is none of this test's business), played until the ball is still. Reads the
 * ground speed at the start and the end of the step the pin was told on, the height the ball crossed the cup's line at, and
 * whether any step of the flight ended within the pin's reach (a ball that is only looked for at the end of its steps).
 */
function flown(
  club: string,
  back: number,
  aside: number,
  power = 1,
  biome?: 'moon',
  mode: 'career' | 'free' = 'career',
) {
  const { game, calls } = golfGame(field('g', 130, 41, undefined, 20, biome));
  game.progress.save.mode = mode;
  const { cup } = game.layout;
  game.place(cup.x + aside, cup.y - back);
  game.pick(club);
  game.strokes = 1;
  game.shoot(NORTH, power);
  const { world, ball } = game;
  const out = { game, calls, before: 0, after: 0, across: NaN, endedNear: false, ratio: NaN, problems: [] as string[] };
  let seen = 0;
  for (let f = 0; f < 1500 && game.phase === 'play' && !(f > 5 && game.ready); f++) {
    const [y0, z0] = [world.y[ball], world.z[ball]];
    const before = Math.hypot(world.vx[ball], world.vy[ball]);
    game.step(DT);
    const now = calls.filter(([n]) => n === 'pinned').length;
    if (now > seen) {
      seen = now;
      out.before = before;
      out.after = Math.hypot(world.vx[ball], world.vy[ball]);
      out.ratio = out.after / out.before;
      // held to its rule as it is told, with the ball where the game has it then and not at rest
      const [x, y] = calls.filter(([n]) => n === 'pinned').at(-1)![1] as number[];
      out.problems.push(...pinnedProblems(game, x, y, now));
    }
    if (y0 < cup.y && world.y[ball] >= cup.y && Number.isNaN(out.across))
      out.across = z0 + ((world.z[ball] - z0) * (cup.y - y0)) / (world.y[ball] - y0);
    if (Math.hypot(world.x[ball] - cup.x, world.y[ball] - cup.y) < REACH) out.endedNear = true;
  }
  return out;
}

const told = (f: { calls: [string, unknown[]][] }) => f.calls.filter(([n]) => n === 'pinned');

describe('the pin', () => {
  it('is drawn with the figures it is struck with', () => {
    const model = flag(FLAG_COLOURS.red);
    const pole = model.parts.find((p) => p.name === 'pole')!.mesh.positions;
    let radius = 0;
    for (let i = 0; i < pole.length; i += 3) radius = Math.max(radius, Math.hypot(pole[i], pole[i + 1]));
    expect(radius).toBeCloseTo(PIN.radius, 5);
    // the knob on its top ends at the height: the pin stands as high as the game says
    const knob = model.parts.find((p) => p.name === 'knob')!.mesh.positions;
    let tip = -Infinity;
    for (let i = 0; i < knob.length; i += 3) tip = Math.max(tip, knob[i + 2]);
    expect(tip).toBeCloseTo(PIN.height, 5);
  });

  it('is struck by a lofted ball flown through its line, which tells pinned once and halves its speed along the ground', () => {
    // a sand wedge from 75 yards, coming down through the pin's height
    const f = flown('sand-wedge', 75, 0);
    expect(f.across).toBeGreaterThan(PIN.clear);
    expect(f.across).toBeLessThan(PIN.height);
    expect(told(f)).toHaveLength(1);
    const [x, y] = told(f)[0][1] as number[];
    const { cup } = f.game.layout;
    expect(Math.hypot(x - cup.x, y - cup.y)).toBeLessThanOrEqual(REACH + 1e-6);
    // what it had either side of the step it was told on: half, give or take the air's and gravity's share of one step
    expect(f.ratio).toBeGreaterThan(0.47);
    expect(f.ratio).toBeLessThan(0.53);
    expect(f.problems).toEqual([]);
  });

  it('is not struck by the same shot aimed wide of it, and that ball is not slowed', () => {
    // a yard and a quarter aside is far more than the target is across from the pin's middle
    const f = flown('sand-wedge', 75, REACH + 0.9);
    expect(told(f)).toHaveLength(0);
    const g = flown('sand-wedge', 75, 0);
    // the ground speed where it crossed the cup's line is what it was a step before it: nothing took half of it
    expect(f.ratio).toBeNaN();
    expect(g.ratio).toBeLessThan(0.53);
  });

  it('is met only by the ball’s middle: a ball drawn over the pole’s edge, its middle outside the target, is not slowed', () => {
    // the ball is a yard in radius and the pole a tenth, so a ball whose middle is half a yard outside the target still overlaps
    // the pole in the picture
    const outside = REACH + 0.2;
    expect(outside - KIND_RADIUS[BALL], 'the ball overlaps the pole').toBeLessThan(PIN.radius);
    const f = flown('sand-wedge', 75, outside);
    expect(f.across).toBeGreaterThan(PIN.clear);
    expect(f.across).toBeLessThan(PIN.height);
    expect(told(f)).toHaveLength(0);
    // and just inside the target it is told
    const g = flown('sand-wedge', 75, REACH - 0.05);
    expect(told(g)).toHaveLength(1);
  });

  it('has a target of the pole’s radius and a share of the ball’s, which is less than the pole and the whole ball', () => {
    expect(pinTarget(1)).toBeCloseTo(PIN.radius + PIN.reach, 9);
    expect(pinTarget(2)).toBeCloseTo(PIN.radius + 2 * PIN.reach, 9);
    expect(PIN.reach).toBeGreaterThan(0);
    expect(PIN.reach).toBeLessThan(1);
  });

  it('is flown over by a ball above its top, which is told nothing', () => {
    const f = flown('sand-wedge', 72, 0);
    expect(f.across, 'a ball over the pole’s top').toBeGreaterThan(PIN.height);
    expect(told(f)).toHaveLength(0);
  });

  it('is not struck by a ball rolled into the cup, nor across its mouth fast enough to lip out', () => {
    for (const [speed, aside] of [
      [5, 0],
      [12, 0.6 * 1.45],
      [18, 0],
      [30, 0],
    ] as const) {
      const { game, calls } = golfGame(OPEN);
      shootAtCup(game, speed, aside);
      for (let f = 0; f < 600 && game.phase === 'play' && !(f > 5 && game.ready); f++) game.step(DT);
      expect(
        calls.map(([n]) => n),
        `a putt at ${speed}, ${aside} aside`,
      ).not.toContain('pinned');
    }
  });

  it('is not struck by a putt on a golf green rolled through it, at any speed', () => {
    for (const hard of [0.2, 0.5, 1]) {
      const { game, calls } = golfGame(field('g', 130, 41, undefined, 20));
      const { cup } = game.layout;
      game.place(cup.x, cup.y - 12);
      game.pick('putter');
      game.strokes = 1;
      game.shoot(NORTH, powerFor(hard * HARDEST_SHOT, HARDEST_SHOT));
      for (let f = 0; f < 900 && game.phase === 'play' && !(f > 5 && game.ready); f++) game.step(DT);
      expect(calls.map(([n]) => n)).not.toContain('pinned');
    }
  });

  it('catches the fastest shot there is, rising through it, from every start and every line through the pole', () => {
    // a driver at full power, close enough to be climbing as it reaches the pole, moves 1.75 yards in a physics step: more than the
    // target is across, so only a test of the whole step finds it. Every one that passes inside the target (the asides are
    // two thirds of it at most) is told, once, and some had no step that ended in reach
    let skipped = 0;
    let shots = 0;
    for (let back = 18; back <= 26; back += 0.25) {
      for (const aside of [0, 0.1, 0.25, -0.2, -0.3]) {
        const f = flown('driver', back, aside);
        shots++;
        expect(f.across, `a driver from ${back}, ${aside} aside`).toBeGreaterThan(PIN.clear);
        expect(f.across).toBeLessThan(PIN.height);
        expect(told(f), `a driver from ${back}, ${aside} aside`).toHaveLength(1);
        expect(f.ratio).toBeGreaterThan(0.45);
        expect(f.ratio).toBeLessThan(0.55);
        if (!f.endedNear) skipped++;
      }
    }
    expect(shots).toBe(165);
    expect(skipped, 'shots whose steps never ended within the pole’s reach').toBeGreaterThan(0);
  });

  it('is told at most once a stroke, though the ball comes back through it, and again for the next stroke', () => {
    const f = flown('sand-wedge', 75, 0);
    const { game } = f;
    expect(told(f)).toHaveLength(1);
    const { world, ball, layout } = game;
    const { cup } = layout;
    // the stroke is over, the ball at rest; the next, flown through the pole in the same way, is told again, and the ball sent
    // back through the pole once more in the same flight, as if it had rebounded, is not told a second time
    game.place(cup.x, cup.y - 75);
    game.pick('sand-wedge');
    game.shoot(NORTH, 1);
    let sent = false;
    for (let k = 0; k < 900 && game.phase === 'play' && !(k > 5 && game.ready); k++) {
      game.step(DT);
      if (!sent && told(f).length === 2) {
        sent = true;
        world.x[ball] = cup.x;
        world.y[ball] = cup.y - 4;
        world.z[ball] = 5;
        world.vx[ball] = 0;
        world.vy[ball] = 20;
        world.vz[ball] = 0;
      }
    }
    expect(sent).toBe(true);
    expect(told(f), 'once for the first stroke, once for the second, and not again').toHaveLength(2);
  });

  it('is told the same on the Moon', () => {
    let hit = 0;
    for (let back = 20; back <= 140; back += 4) {
      const f = flown('driver', back, 0, 1, 'moon');
      expect(told(f).length).toBeLessThanOrEqual(1);
      if (told(f).length) {
        hit++;
        expect(f.ratio).toBeGreaterThan(0.45);
        expect(f.ratio).toBeLessThan(0.55);
      }
    }
    expect(hit).toBeGreaterThan(0);
  });
});

describe('the pin counted', () => {
  it('is counted in the life for a hole that pays, once a stroke, and not in free play', () => {
    const f = flown('sand-wedge', 75, 0);
    expect(told(f)).toHaveLength(1);
    expect(f.game.progress.save.life.pinned).toBe(1);
    const free = flown('sand-wedge', 75, 0, 1, undefined, 'free');
    expect(told(free), 'told all the same').toHaveLength(1);
    expect(free.game.progress.save.life.pinned).toBe(0);
    const wide = flown('sand-wedge', 75, REACH + 0.9);
    expect(wide.game.progress.save.life.pinned).toBe(0);
  });

  it('is not counted for a hole begun again from the menu, which pays nothing', () => {
    const { game, calls } = golfGame(field('g', 130, 41, undefined, 20));
    const { cup } = game.layout;
    game.restartHole();
    game.place(cup.x, cup.y - 75);
    game.pick('sand-wedge');
    game.strokes = 1;
    game.shoot(NORTH, 1);
    for (let k = 0; k < 900 && game.phase === 'play' && !(k > 5 && game.ready); k++) game.step(DT);
    expect(calls.filter(([n]) => n === 'pinned')).toHaveLength(1);
    expect(game.progress.save.life.pinned).toBe(0);
  });
});

describe('the pin’s rule', () => {
  it('is checked: more than once a stroke, far from the pole, and a ball on the ground are each a fault', () => {
    const f = flown('sand-wedge', 75, 0);
    const { cup } = f.game.layout;
    expect(pinnedProblems(f.game, cup.x, cup.y, 2).join()).toContain('more than once');
    expect(pinnedProblems(f.game, cup.x + 20, cup.y, 1).join()).toContain('from the pin');
    // the ball has come to rest on the ground by now
    expect(pinnedProblems(f.game, cup.x, cup.y, 1).join()).toContain('on the ground');
  });
});

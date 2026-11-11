/**
 * What the game tells of the moments beyond the cup: a ball that lips out, a long putt holed, a chip holed from afar, and
 * a long drive. Each is told by the game and not found by the page, once, at the moment it happens, and never changes how
 * the ball plays: determinism and the golf hash hold that. The thresholds (`MOMENTS`) are measured by `npm run moments`.
 */
import { describe, expect, it } from 'vitest';
import { bagClub } from '../src/bag';
import { carryFrom } from '../src/flight';
import { CUP } from '../src/course';
import { MOMENTS, Game } from '../src/game';
import { lippedProblems, momentProblems } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { LIE } from '../src/surfaces';
import { DT, FLAT, field, golfGame, newGame } from './helpers';
import { OPEN, openGreen, shootAtCup } from './open-green';

const NORTH = Math.PI / 2;

/** The events of a game on minigolf `hole`, with every argument. */
function recorded(hole = OPEN, seed = 1) {
  const calls: [string, unknown[]][] = [];
  const events = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) =>
          calls.push([name, args]),
    },
  );
  const game = new Game(new Progress(memoryStore(null)), events, { random: seeded(seed), course: [hole] });
  return { game, calls, names: () => calls.map(([n]) => n), of: (n: string) => calls.filter(([c]) => c === n) };
}

/** Play until the ball is ready again or the hole is done. */
function untilStill(game: Game, frames = 3000) {
  for (let f = 0; f < frames; f++) {
    game.step(DT);
    if (game.phase !== 'play' || (f > 1 && game.ready)) return;
  }
  throw new Error('the ball never came to rest');
}

/** A stroke that is not the hole's first, as a test sets a lie: the putt that follows is struck from somewhere, not the tee. */
function notTheFirst(game: Game) {
  game.strokes = 1;
}

describe('a lip-out', () => {
  it('is told once, and not holed, for a putt the rim turns away', () => {
    const { game, of, names } = recorded();
    shootAtCup(game, 12, CUP.radius * 0.6);
    untilStill(game);
    expect(of('lipped')).toHaveLength(1);
    expect(names()).not.toContain('holed');
    const [x, y] = of('lipped')[0][1] as number[];
    const { cup } = game.layout;
    // told as it leaves: at the rim, not somewhere else
    expect(Math.hypot(x - cup.x, y - cup.y) - game.cup.radius).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(x - cup.x, y - cup.y) - game.cup.radius).toBeLessThan(2);
  });

  it('is never told for a slow putt through the middle, which drops', () => {
    const { game, names } = recorded();
    shootAtCup(game, 5);
    untilStill(game);
    expect(names()).toContain('holed');
    expect(names()).not.toContain('lipped');
  });

  it('is told for neither a putt that misses the cup wide', () => {
    const { game, names } = recorded();
    shootAtCup(game, 5, CUP.radius + 2.5);
    untilStill(game);
    expect(names()).not.toContain('lipped');
    expect(names()).not.toContain('holed');
  });

  it('is not told for a ball asleep on the lip, woken and dropped: that is holed', () => {
    const { game, names } = recorded();
    const { world, ball, layout } = game;
    // as the cup test finds it: running round inside the rim, it drops
    world.x[ball] = layout.cup.x + 0.125;
    world.y[ball] = layout.cup.y + 0.547;
    world.z[ball] = 0.458;
    world.vx[ball] = -10.7;
    world.vy[ball] = 1.14;
    world.vz[ball] = -1.61;
    world.wake(ball);
    for (let f = 0; f < 120 && game.phase === 'play'; f++) game.step(DT);
    expect(names()).toContain('holed');
    expect(names()).not.toContain('lipped');
  });

  it('is not told for a lofted ball flying over the cup, though its middle passes over the cup’s mouth', () => {
    const { game, calls } = golfGame(field('g', 130, 41, undefined, 20));
    const { cup } = game.layout;
    // a sand wedge from 40 yards short, struck hard enough to fly well past the cup
    game.place(cup.x, cup.y - 40);
    game.pick('sand-wedge');
    notTheFirst(game);
    game.shoot(NORTH, 1);
    let overCup = 0;
    let highest = 0;
    const { world, ball } = game;
    for (let f = 0; f < 600 && game.phase === 'play' && !(f > 5 && game.ready); f++) {
      game.step(DT);
      if (Math.hypot(world.x[ball] - cup.x, world.y[ball] - cup.y) < game.cup.radius) {
        overCup++;
        highest = Math.max(highest, world.z[ball]);
      }
    }
    expect(overCup, 'the ball passed over the cup’s mouth').toBeGreaterThan(0);
    expect(highest, 'and it was well above the ground').toBeGreaterThan(5);
    expect(calls.map(([n]) => n)).not.toContain('lipped');
  });
});

describe('a long putt', () => {
  /** Minigolf, a putt struck `back` yards short of the clear distance from the cup, arriving at 5 a second: its events. */
  function mini(back: number, first = false) {
    const r = recorded(openGreen(10));
    if (!first) notTheFirst(r.game);
    shootAtCup(r.game, 5, 0, back);
    untilStill(r.game);
    return r;
  }

  it('is told, with the yards from where it was struck, immediately before holed, from past the threshold', () => {
    const back = MOMENTS.longPuttMinigolf + 1;
    const { game, names, of } = mini(back);
    const { cup } = game.layout;
    expect(of('longPutt')).toHaveLength(1);
    const yards = of('longPutt')[0][1][0] as number;
    expect(yards).toBeCloseTo(Math.hypot(cup.x - game.lie.x, cup.y - game.lie.y), 9);
    expect(yards).toBeGreaterThanOrEqual(MOMENTS.longPuttMinigolf);
    const n = names();
    expect(n[n.indexOf('longPutt') + 1]).toBe('holed');
  });

  it('is not told from inside the threshold', () => {
    const { names } = mini(MOMENTS.longPuttMinigolf - 8);
    expect(names()).toContain('holed');
    expect(names()).not.toContain('longPutt');
  });

  it('is not told for a hole in one, which is its own moment', () => {
    const { names } = mini(MOMENTS.longPuttMinigolf + 1, true);
    expect(names()).toContain('holed');
    expect(names()).not.toContain('longPutt');
  });

  it('is told on golf from the green, from its own threshold', () => {
    const { cup } = golfGame(field('g', 130, 41, undefined, 20)).game.layout;
    const yards = MOMENTS.longPuttGolf + 2;
    // the power that holes it, found: a putt of a speed that drops, struck from `yards` away
    let holed = false;
    for (let p = 0.3; p <= 1 && !holed; p += 0.01) {
      const g = golfGame(field('g', 130, 41, undefined, 20));
      g.game.place(cup.x, cup.y - yards);
      g.game.pick('putter');
      notTheFirst(g.game);
      g.game.shoot(NORTH, p);
      untilStill(g.game);
      if (g.game.phase === 'done') {
        holed = true;
        const names = g.calls.map(([n]) => n);
        expect(names).toContain('longPutt');
        expect(names[names.indexOf('longPutt') + 1]).toBe('holed');
        expect(g.calls.find(([n]) => n === 'longPutt')![1][0] as number).toBeCloseTo(yards, 6);
      }
    }
    expect(holed, 'some putt of the green drops from there').toBe(true);
  });

  it('is still a putt when the club is changed while it rolls', () => {
    const { cup } = golfGame(field('g', 130, 41, undefined, 20)).game.layout;
    const yards = MOMENTS.longPuttGolf + 2;
    let found = false;
    for (let p = 0.3; p <= 1 && !found; p += 0.01) {
      const g = golfGame(field('g', 130, 41, undefined, 20));
      g.game.place(cup.x, cup.y - yards);
      g.game.pick('putter');
      notTheFirst(g.game);
      g.game.shoot(NORTH, p);
      // the player puts the wedge in hand as it rolls; what was struck was struck with the putter
      g.game.pick('sand-wedge');
      untilStill(g.game);
      if (g.game.phase === 'done') {
        found = true;
        const names = g.calls.map(([n]) => n);
        expect(names).toContain('longPutt');
        expect(names).not.toContain('chippedIn');
      }
    }
    expect(found).toBe(true);
  });
});

describe('a chip-in', () => {
  /** The chip the lip test finds dropping: a sand wedge from 28.5 yards, drawn, with topspin. */
  function chip(back: number, first = false) {
    const calls: [string, unknown[]][] = [];
    const events = new Proxy(
      {},
      {
        get:
          (_, name: string) =>
          (...args: unknown[]) =>
            calls.push([name, args]),
      },
    );
    const g = new Game(new Progress(memoryStore()), events, { random: seeded(403), course: [FLAT.pitch] });
    const { cup } = g.layout;
    g.place(cup.x, cup.y - back);
    g.pick('sand-wedge');
    g.setShape(-1);
    g.setSpin(1);
    if (!first) notTheFirst(g);
    g.shoot(NORTH, back / (carryFrom(bagClub('sand-wedge'), 1, LIE.fairway) * 1.03));
    for (let f = 0; f < 2400 && g.phase === 'play' && !g.ready; f++) g.step(DT);
    return { game: g, names: calls.map(([n]) => n), calls };
  }

  it('is told, just before holed, for a chip holed from past the threshold', () => {
    const { game, names, calls } = chip(28.5);
    expect(game.phase).toBe('done');
    expect(names).toContain('chippedIn');
    expect(names).not.toContain('longPutt');
    expect(names[names.indexOf('chippedIn') + 1]).toBe('holed');
    const yards = calls.find(([n]) => n === 'chippedIn')![1][0] as number;
    expect(yards).toBeCloseTo(Math.hypot(game.layout.cup.x - game.lie.x, game.layout.cup.y - game.lie.y), 9);
    expect(yards).toBeGreaterThanOrEqual(MOMENTS.chipIn);
  });

  it('is not told for an ace from the tee’s first stroke, which is neither a chip-in nor a long putt', () => {
    const { game, names } = chip(28.5, true);
    expect(game.phase).toBe('done');
    expect(names).toContain('holed');
    expect(names).not.toContain('chippedIn');
    expect(names).not.toContain('longPutt');
  });
});

describe('a long drive', () => {
  /** A driver from the tee on a hole of `surface`, struck `boost` times as fast as it was (a following wind, or a hill down), its events. */
  function drive(surface: 'f' | 'r', boost: number, club = 'driver', strokes = 0) {
    const { game, calls } = golfGame(field(surface));
    game.pick(club);
    game.strokes = strokes;
    game.shoot(NORTH, 1);
    const { world, ball } = game;
    world.vx[ball] *= boost;
    world.vy[ball] *= boost;
    world.vz[ball] *= boost;
    for (let f = 0; f < 900 && !calls.some(([n]) => n === 'landed'); f++) game.step(DT);
    return { game, calls, names: calls.map(([n]) => n) };
  }

  it('is told, with the carry, at the first landing of a driver from the tee onto the fairway', () => {
    const { game, calls, names } = drive('f', 1.1);
    const landed = calls.find(([n]) => n === 'landed')![1] as number[];
    const told = calls.find(([n]) => n === 'longDrive');
    expect(told, 'told').toBeDefined();
    const carry = told![1][0] as number;
    expect(carry).toBeCloseTo(Math.hypot(landed[0] - game.lie.x, landed[1] - game.lie.y), 9);
    expect(carry).toBeGreaterThanOrEqual(MOMENTS.longDrive);
    expect(names.filter((n) => n === 'longDrive')).toHaveLength(1);
  });

  it('is not told for a drive that carries less than the threshold', () => {
    expect(drive('f', 1).names).not.toContain('longDrive');
  });

  it('is not told for a drive that comes down in the rough', () => {
    expect(drive('r', 1.1).names).not.toContain('longDrive');
  });

  it('is not told for a second shot with the driver, nor for a 3-wood from the tee', () => {
    expect(drive('f', 1.1, 'driver', 1).names).not.toContain('longDrive');
    expect(drive('f', 1.3, '3-wood').names).not.toContain('longDrive');
  });
});

describe('the rules the moments are held to', () => {
  it('refuses a moment of a distance short of its threshold, not a number, or further than the hole is long', () => {
    const { game } = golfGame(field('f'));
    expect(momentProblems(game, 'longDrive', MOMENTS.longDrive + 1)).toEqual([]);
    expect(momentProblems(game, 'longDrive', MOMENTS.longDrive - 1).join()).toMatch(/short of/);
    expect(momentProblems(game, 'longDrive', NaN).join()).toMatch(/not a distance/);
    expect(momentProblems(game, 'longDrive', 1e6).join()).toMatch(/longer than the hole/);
  });

  it('refuses one told when the hole is not in play', () => {
    const { game } = newGame(1, null, [OPEN]);
    game.phase = 'done';
    expect(momentProblems(game, 'longPutt', MOMENTS.longPuttMinigolf + 1).join()).toMatch(/not in play/);
  });

  it('holds a lip-out to the rim, once a stroke, and while the hole is in play', () => {
    const { game } = recorded();
    shootAtCup(game, 12, CUP.radius * 0.6);
    const { cup } = game.layout;
    const rim = game.cup.radius;
    expect(lippedProblems(game, cup.x, cup.y - rim - 0.5, 1)).toEqual([]);
    expect(lippedProblems(game, cup.x, cup.y - rim - 0.5, 2).join()).toMatch(/more than once a stroke/);
    expect(lippedProblems(game, cup.x, cup.y - 20, 1).join()).toMatch(/not at the cup/);
    expect(lippedProblems(game, cup.x, cup.y, 1).join()).toMatch(/not at the cup/);
    game.phase = 'done';
    expect(lippedProblems(game, cup.x, cup.y - rim - 0.5, 1).join()).toMatch(/not in play/);
  });
});

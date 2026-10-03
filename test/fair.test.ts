/**
 * The Fair's first four holes, each one's idea held as a test: that Turnstile's two doors take turns, that Traffic's two
 * barriers are both clear of the line once in their beat, that The Lift's belt takes the speed off any ball it carries,
 * and that Whack-a-mole's three barriers are a third of a beat apart. And the question The Lift was drawn level for:
 * whether the physics lets a conveyor stand on a slope.
 */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, STEP, TILE, layoutOf, stepAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { FAIR } from '../src/fair';
import { checkInvariants } from '../src/invariants';
import { Obstacles, WINDMILL, type ObstacleDef } from '../src/obstacles';
import { terrainRefusal } from '../src/physics';
import { fuzz } from '../scripts/fuzzer';
import { PLAYER } from '../scripts/pace';
import { BUMPER } from '../src/arena';
import { seeded } from '../src/random';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { DT, newGame, settle } from './helpers';

const hole = (name: string): HoleDef => FAIR.find((h) => h.name === name)!;
const defs = <K extends ObstacleDef['kind']>(h: HoleDef, kind: K) =>
  (h.obstacles ?? []).filter((o): o is Extract<ObstacleDef, { kind: K }> => o.kind === kind);
/** The tile of the map that holds `letter`: its column, and its row from the top. */
const tileOf = (h: HoleDef, letter: string): [number, number] => {
  const row = h.map.findIndex((r) => r.includes(letter));
  return [h.map[row].indexOf(letter), row];
};

describe('the course', () => {
  it('is The Fair, among the minigolf courses after The Meadow, with its nine holes', () => {
    const names = COURSES.map((c) => c.name);
    expect(names.indexOf('The Fair')).toBeGreaterThan(names.indexOf('The Meadow'));
    expect(names.indexOf('The Fair')).toBeLessThan(names.indexOf('The Range'));
    const course = COURSES.find((c) => c.name === 'The Fair')!;
    expect(course.holes).toBe(FAIR);
    expect(course.golf).toBeUndefined();
    expect(FAIR.map((h) => h.name)).toEqual([
      'Turnstile',
      'Traffic',
      'The Lift',
      'Whack-a-mole',
      'Dodgems',
      'Carousel',
      'Ferris',
      'Shooting Gallery',
      'The Big Wheel',
    ]);
    expect(FAIR.map((h) => h.par)).toEqual([2, 3, 3, 3, 3, 3, 3, 4, 4]);
    expect(course.summary).toEqual({ holes: 9, par: 28 });
  });

  it('puts something that moves on every hole', () => {
    for (const h of FAIR) expect(h.obstacles?.length, h.name).toBeGreaterThan(0);
  });

  it('is played round by the autopilot, every hole within its limit and no rule broken, and the card', () => {
    const { game } = newGame(1, null, FAIR);
    const pilot = new Autopilot(game);
    for (let f = 0; f < 60 * 60 * 4 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game), `frame ${f}`).toEqual([]);
    }
    expect(game.phase).toBe('over');
    expect(game.card.length).toBe(FAIR.length);
    game.card.forEach((score, i) => {
      expect(score, FAIR[i].name).toBeGreaterThanOrEqual(1);
      expect(score, FAIR[i].name).toBeLessThanOrEqual(FAIR[i].par + 5);
    });
  });
});

describe('Turnstile', () => {
  const h = hole('Turnstile');
  const layout = layoutOf(h.map);
  const mills = defs(h, 'windmill');

  it('has two windmills in two doors of one wall of rail, far enough apart that their blades do not cross', () => {
    expect(mills.length).toBe(2);
    expect(mills[0].at[1], 'one wall').toBe(mills[1].at[1]);
    const wall = h.map[mills[0].at[1]];
    for (const m of mills) expect(wall[m.at[0]], 'a door in the rail').toBe('.');
    expect(wall.split('').filter((c) => c === '.').length, 'and no other').toBe(2);
    expect(Math.abs(mills[0].at[0] - mills[1].at[0]) * TILE).toBeGreaterThanOrEqual(2 * WINDMILL.bladeLength);
  });

  it('turns them half a blade apart, since four blades put a half turn between them at the same place as none', () => {
    const apart = (((mills[1].phase ?? 0) - (mills[0].phase ?? 0)) * 4 + 8) % 1;
    expect(mills[0].period).toBe(mills[1].period);
    expect(apart).toBeCloseTo(0.5, 9);
  });

  it('is always swept at one door and open at the other, the doors taking turns', () => {
    const o = new Obstacles(h.obstacles!, layout);
    // a gate is where a blade is in the door; parked far above, the door is clear
    const swept = (k: number) => o.pushers[k].z < 50;
    let aOnly = 0,
      bOnly = 0,
      neither = 0,
      both = 0;
    for (let t = 0; t < mills[0].period; t += 0.01) {
      o.update(t, 0.01);
      const a = swept(0),
        b = swept(1);
      if (a && b) both++;
      else if (a) aOnly++;
      else if (b) bOnly++;
      else neither++;
    }
    expect(aOnly, 'the blade is across the first door as the second is open').toBeGreaterThan(50);
    expect(bOnly, 'and across the second as the first is open').toBeGreaterThan(50);
    expect(aOnly).toBeCloseTo(bOnly, -1);
    expect(neither, 'there is never a moment both are open: a player chooses a door and its moment').toBe(0);
    expect(both).toBeGreaterThan(0);
  });

  it('puts the cup straight behind the first door, as far past the wall as the tower lets it be seen', () => {
    const [cupCol, cupRow] = tileOf(h, 'C');
    expect(cupCol).toBe(mills[0].at[0]);
    expect((mills[0].at[1] - cupRow) * TILE).toBeGreaterThanOrEqual(16);
  });
});

describe('Traffic', () => {
  const h = hole('Traffic');
  const layout = layoutOf(h.map);
  const [first, second] = defs(h, 'barrier');
  const beat = first.period;

  /** Whether each barrier is clear of the line the ball takes up the middle, at time t, by the ball's own width. */
  const clearAt = (o: Obstacles, t: number) => {
    o.update(t, 0.01);
    return o.pushers.map((p) => Math.abs(p.x - layout.tee.x) > p.hx + KIND_RADIUS[BALL]);
  };

  it('has two barriers sliding opposite ways across the line, a tile of grass between them, on one beat', () => {
    expect(defs(h, 'barrier').length).toBe(2);
    expect(second.period).toBe(beat);
    expect((((second.phase ?? 0) - (first.phase ?? 0)) % 1) + 1).toBeCloseTo(1.5, 9);
    expect(Math.abs(first.at[1] - second.at[1]) * TILE, 'a ball fits between them').toBeGreaterThanOrEqual(2 * TILE);
  });

  it('is long enough that no one stroke reaches the cup, so the first is struck through both', () => {
    const [, cupRow] = tileOf(h, 'C');
    const [, teeRow] = tileOf(h, 'T');
    const rolls = 42 ** 2 / (2 * 16);
    expect((teeRow - cupRow) * TILE).toBeGreaterThan(rolls);
    expect(Math.min(first.at[1], second.at[1])).toBeGreaterThan(cupRow);
    expect(Math.max(first.at[1], second.at[1])).toBeLessThan(teeRow);
  });

  it('has the moment both are clear of the line, and it comes once, in a single window, in each beat', () => {
    const o = new Obstacles(h.obstacles!, layout);
    const step = 0.005;
    const n = Math.round(beat / step);
    const both = Array.from({ length: n }, (_, k) => clearAt(o, k * step).every(Boolean));
    expect(both.some(Boolean), 'there is a moment').toBe(true);
    let windows = 0;
    for (let k = 0; k < n; k++) if (both[k] && !both[(k + n - 1) % n]) windows++;
    expect(windows, 'and one window a beat').toBe(1);
    // long enough to cross the two tiles between the barriers at a gentle roll, and not so long that it is no timing
    const length = both.filter(Boolean).length * step;
    expect(length).toBeGreaterThan(0.5);
    expect(length).toBeLessThan(beat / 3);
    // and the same a beat later
    for (const k of [0, 77, 311, 500]) expect(clearAt(o, k * step + beat)).toEqual(clearAt(o, k * step));
  });

  it('leaves the ball a way past either barrier at the end of its travel, which no line can shut', () => {
    const o = new Obstacles(h.obstacles!, layout);
    for (let t = 0; t < beat; t += 0.01) {
      o.update(t, 0.01);
      for (const p of o.pushers) {
        const gap = Math.min(p.x - p.hx - layout.bounds.minX, layout.bounds.maxX - (p.x + p.hx));
        expect(gap).toBeGreaterThan(KIND_RADIUS[BALL] * 2 + 0.2);
      }
    }
  });
});

describe('a conveyor on a slope', () => {
  // The Lift was to be a belt up a ramp, and was drawn level; this is what settled that the physics did not make it so
  const map = ['#######', '#..C..#', ...Array.from({ length: 8 }, () => '#.....#'), '#..T..#', '#######'];
  const terrain = [
    '3333333',
    '3333333',
    '3333333',
    '3333333',
    '3333333',
    '2222222',
    '1111111',
    '0000000',
    '0000000',
    '0000000',
    '0000000',
    '0000000',
  ];
  const ramp: HoleDef = {
    name: 'A belt up a ramp',
    par: 3,
    map,
    terrain,
    obstacles: [{ kind: 'conveyor', from: [3, 9], to: [3, 4], speed: 5 }],
  };

  it('is not refused, by the physics or by the obstacles, which refuse only a barrier and a windmill', () => {
    const layout = layoutOf(map, terrain);
    expect(terrainRefusal(layout, CUP)).toBeNull();
    expect(() => new Obstacles(ramp.obstacles!, layout)).not.toThrow();
    const barrier: ObstacleDef = { kind: 'barrier', at: [3, 6], length: 1, travel: 2, period: 4 };
    expect(() => new Obstacles([barrier], layout), 'where a barrier on the same ground is').toThrow(/slopes/);
  });

  it('carries a ball up it, to the top, at the belt’s own speed', () => {
    const { game } = newGame(1, null, [ramp]);
    game.place(0, -9);
    const y0 = game.world.y[game.ball];
    const z0 = game.world.z[game.ball];
    settle(game, 60 * 2);
    // two seconds at five a second, less the first moments' gathering
    expect(game.world.y[game.ball] - y0).toBeGreaterThan(8);
    expect(game.world.z[game.ball] - z0, 'and it has risen').toBeGreaterThan(0.5);
    settle(game, 60 * 3);
    expect(game.world.y[game.ball], 'past the belt, on the top').toBeGreaterThan(5);
  });
});

describe('The Lift', () => {
  const h = hole('The Lift');
  const layout = layoutOf(h.map);
  const [belt] = defs(h, 'conveyor');
  const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
  const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;

  /** The ball struck from the tee at `power` toward the point (x, y), played for `seconds`. */
  const struck = (power: number, toward = { x: tileX(belt.from[0]), y: tileY(belt.from[1]) }, seconds = 14) => {
    const { game, told } = newGame(1, null, [h]);
    game.shoot(Math.atan2(toward.y - layout.tee.y, toward.x - layout.tee.x), power);
    settle(game, 60 * seconds);
    return { game, told, x: game.world.x[game.ball], y: game.world.y[game.ball] };
  };

  it('has a belt up a causeway between ponds, onto a raised step, and the cup on the grass beyond', () => {
    expect(belt.from[0]).toBe(belt.to[0]);
    expect(belt.from[1]).toBeGreaterThan(belt.to[1]);
    const [cupCol, cupRow] = tileOf(h, 'C');
    expect(cupRow).toBeLessThan(belt.to[1] - 1);
    for (let row = belt.to[1]; row <= belt.from[1]; row++) {
      expect(h.map[row][belt.from[0] - 1], `pond to the west at row ${row}`).toBe('~');
      expect(h.map[row][belt.from[0] + 1], `pond to the east at row ${row}`).toBe('~');
    }
    const shelf = belt.to[1] - 1;
    expect(stepAt(layout, tileX(belt.to[0]), tileY(shelf))).toBeCloseTo(STEP, 6);
    expect(stepAt(layout, tileX(cupCol), tileY(cupRow)), 'the cup is on level grass').toBe(0);
  });

  it('puts a ball struck too softly to reach the belt down short of it', () => {
    const r = struck(0.04);
    expect(r.y).toBeLessThan(tileY(belt.from[1]) - TILE / 2);
    expect(r.game.strokes).toBe(1);
    expect(r.told.some((t) => t.startsWith('splash'))).toBe(false);
  });

  it('carries a ball slow at the foot up onto the step, and takes the speed off a fast one, so both come to rest in one place', () => {
    const slow = struck(0.2);
    const fast = struck(1);
    for (const r of [slow, fast]) {
      expect(r.game.world.asleep[r.game.ball], 'at rest').toBe(1);
      expect(stepAt(layout, r.x, r.y), 'on the step the belt lifted it onto').toBeCloseTo(STEP, 6);
      expect(r.y).toBeGreaterThan(tileY(belt.to[1]));
    }
    expect(
      Math.hypot(slow.x - fast.x, slow.y - fast.y),
      'a ball struck hard is not carried further than one struck soft',
    ).toBeLessThan(1);
  });

  it('puts a ball struck wide of the causeway into the pond, a stroke more, and back where it was struck from', () => {
    const wide = struck(0.4, { x: tileX(belt.from[0] - 2), y: tileY(belt.from[1] - 1) }, 4);
    expect(wide.told.filter((t) => t.startsWith('splash')).length).toBe(1);
    expect(wide.game.strokes).toBe(2);
    expect(Math.hypot(wide.x - layout.tee.x, wide.y - layout.tee.y), 'put back on the tee').toBeLessThan(0.5);
  });
});

describe('Whack-a-mole', () => {
  const h = hole('Whack-a-mole');
  const layout = layoutOf(h.map);
  const bars = defs(h, 'barrier');

  it('is a chain of three barriers in one lane, on one beat, a third of a beat apart, a tile of grass between each', () => {
    expect(bars.length).toBe(3);
    for (const b of bars) {
      expect(b.at[0], 'one lane').toBe(bars[0].at[0]);
      expect(b.period, 'one beat').toBe(bars[0].period);
    }
    const phases = bars.map((b) => b.phase ?? 0);
    expect(phases[1] - phases[0]).toBeCloseTo(1 / 3, 9);
    expect(phases[2] - phases[1]).toBeCloseTo(1 / 3, 9);
    const rows = bars.map((b) => b.at[1]);
    expect(rows[1] - rows[0]).toBeGreaterThanOrEqual(2);
    expect(rows[2] - rows[1]).toBeGreaterThanOrEqual(2);
  });

  it('clears the line to the cup one barrier after the next, in turn, so a ball timed between them can follow the clearing up the lane', () => {
    const o = new Obstacles(h.obstacles!, layout);
    const beat = bars[0].period;
    const clear = (t: number, k: number) => {
      o.update(t, 0.01);
      return Math.abs(o.pushers[k].x - layout.tee.x) > o.pushers[k].hx + KIND_RADIUS[BALL];
    };
    // the middle of each barrier's clear stretch, from the tee's side: where it is furthest from the line
    const middles = bars.map((_, k) => {
      let best = 0,
        far = -1;
      for (let t = 0; t < beat; t += 0.005) {
        o.update(t, 0.01);
        const d = o.pushers[k].x - layout.tee.x;
        if (d > far) {
          far = d;
          best = t;
        }
      }
      return best;
    });
    for (let k = 1; k < 3; k++) {
      const gap = (((middles[k] - middles[k - 1]) % beat) + beat) % beat;
      expect(gap / beat, `barrier ${k} comes ${gap.toFixed(2)} s after ${k - 1}`).toBeCloseTo(-1 / 3 + 1, 1);
    }
    for (let k = 0; k < 3; k++) {
      expect(clear(middles[k], k), `barrier ${k} is clear at its furthest`).toBe(true);
      let some = false;
      for (let t = 0; t < beat; t += 0.01) if (!clear(t, k)) some = true;
      expect(some, `and is in the way some of the time`).toBe(true);
    }
  });
});

/** A game on one hole of The Fair, from a seed, played by the autopilot with a player's slips. */
function pilotOn(h: HoleDef, seed: number) {
  const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: [h] });
  return { game, pilot: new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) }) };
}

/** The strokes the autopilot takes to hole `h` on each of `seeds`, with the invariants held every thirty frames, and every one holed before the limit. */
function holed(h: HoleDef, seeds: number[]): number[] {
  return seeds.map((seed) => {
    const { game, pilot } = pilotOn(h, seed);
    for (let f = 0; f < 60 * 60 * 3 && game.phase !== 'over'; f++) {
      pilot.step(DT);
      if (f % 30 === 0) expect(checkInvariants(game), `${h.name}, seed ${seed}, frame ${f}`).toEqual([]);
    }
    expect(game.phase, `${h.name}, seed ${seed}, finished`).toBe('over');
    expect(game.total, `${h.name}, seed ${seed}, within the limit`).toBeLessThan(game.limit);
    return game.total;
  });
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The share of a barrier's beat that its whole body is clear of a ball's line up the middle by the autopilot's own margin, the ball's radius and 0.6. */
function clearShare(h: HoleDef, k: number): number {
  const layout = layoutOf(h.map, h.terrain);
  const o = new Obstacles(h.obstacles!, layout);
  const def = defs(h, 'barrier')[k];
  const index = (h.obstacles ?? []).filter((d) => d.kind === 'barrier').indexOf(def);
  const n = 400;
  let clear = 0;
  for (let i = 0; i < n; i++) {
    o.update((i / n) * def.period, 0.01);
    const p = o.pushers[index];
    if (Math.abs(p.x - layout.tee.x) > p.hx + KIND_RADIUS[BALL] + 0.6) clear++;
  }
  return clear / n;
}

describe('the whole course, from a player’s seed', () => {
  it('is holed round by the autopilot with a player’s slips, on a few seeds, every hole within its limit and no rule broken', () => {
    for (const seed of [3, 9]) {
      const game = new Game(new Progress(memoryStore()), {}, { random: seeded(seed), course: FAIR });
      const pilot = new Autopilot(game, { skill: PLAYER, random: seeded(seed * 31 + 7) });
      for (let f = 0; f < 60 * 60 * 20 && game.phase !== 'over'; f++) {
        pilot.step(DT);
        if (f % 30 === 0) expect(checkInvariants(game), `seed ${seed}, frame ${f}`).toEqual([]);
      }
      expect(game.phase, `seed ${seed}`).toBe('over');
      expect(game.card.length).toBe(9);
      game.card.forEach((score, i) => expect(score, `${FAIR[i].name}, seed ${seed}`).toBeLessThan(game.limit));
    }
  });

  it('is played by the fuzzer, on a few seeds, with the bumpers and the kickers struck, and no rule broken', () => {
    let bumpers = 0,
      kickers = 0;
    // the whole course, which the monkey's wandering does not often get past the fifth hole of, and the last four holes alone, which hold the kickers and a bumper again
    for (const [seed, holes] of [
      [1, FAIR],
      [3, FAIR],
      [1, FAIR.slice(5)],
      [2, FAIR.slice(5)],
      [3, FAIR.slice(5)],
      [4, FAIR.slice(5)],
    ] as const) {
      const run = fuzz(seed, 24000, holes);
      expect(run.failure, JSON.stringify(run.failure)).toBe(null);
      bumpers += run.done['strike a moving bumper'] ?? 0;
      kickers += run.done['strike a kicker'] ?? 0;
    }
    expect(bumpers, 'a moving bumper was struck').toBeGreaterThan(0);
    expect(kickers, 'a kicker was struck').toBeGreaterThan(0);
  });
});

describe('Dodgems', () => {
  const h = hole('Dodgems');
  const layout = layoutOf(h.map);
  const bumpers = defs(h, 'barrier');
  const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;

  it('is three bumpers, each a barrier with a post’s bounce, a tile apart, out of step by a half and a quarter of a beat', () => {
    expect(bumpers.length).toBe(3);
    for (const b of bumpers) expect(b.bounce, 'throws like a post').toBe(BUMPER.restitution);
    const rows = bumpers.map((b) => b.at[1]);
    expect(rows[1] - rows[0]).toBe(1);
    expect(rows[2] - rows[1]).toBe(1);
    expect(new Set(bumpers.map((b) => b.period)).size, 'one beat').toBe(1);
    const phases = bumpers.map((b) => b.phase ?? 0);
    expect(phases).toEqual([0, 0.5, 0.25]);
  });

  it('is longer than one stroke goes, so the first is struck short of the bumpers and the second goes between them', () => {
    const [, cupRow] = tileOf(h, 'C');
    const [, teeRow] = tileOf(h, 'T');
    expect((teeRow - cupRow) * TILE).toBeGreaterThan(40 ** 2 / (2 * 16));
    expect(bumpers[0].at[1]).toBeGreaterThan(cupRow);
  });

  it('gives the autopilot a window: from a ball short of the bumpers it strikes within a few seconds, whenever it begins to look, not after the ten it waits at most', () => {
    for (let begin = 0; begin < 4; begin += 0.5) {
      const { game } = newGame(1, null, [h]);
      const pilot = new Autopilot(game);
      game.place(layout.tee.x, tileY(bumpers[2].at[1]) - 4 * TILE);
      settle(game, Math.round(begin * 60));
      const t0 = game.t;
      let waited = Infinity;
      for (let f = 0; f < 60 * 12; f++) {
        pilot.step(DT);
        if (game.strokes > 0) {
          waited = game.t - t0;
          break;
        }
      }
      expect(waited, `looking from ${begin} s`).toBeLessThan(5);
    }
  });

  it('leaves each a moment clear of the line at the autopilot’s own margin, and is in the way some of the time', () => {
    for (let k = 0; k < 3; k++) {
      const share = clearShare(h, k);
      expect(share, `bumper ${k} lets a ball by`).toBeGreaterThan(0.1);
      expect(share, `and is in the way`).toBeLessThan(0.9);
    }
  });

  it('throws a ball it meets back faster than a plain barrier would, not stops it', () => {
    const struck = (bounce: number | undefined) => {
      const bare: HoleDef = {
        ...h,
        obstacles: [{ ...bumpers[0], travel: 0, ...(bounce === undefined ? { bounce: undefined } : { bounce }) }],
      };
      const { game } = newGame(1, null, [bare]);
      game.shoot(Math.PI / 2, 1);
      let back = 0;
      for (let f = 0; f < 400; f++) {
        game.step(DT);
        back = Math.max(back, -game.world.vy[game.ball]);
      }
      return back;
    };
    expect(struck(BUMPER.restitution)).toBeGreaterThan(struck(undefined) * 2);
  });

  it('is holed by the autopilot within its limit, not in one on the median', () => {
    const strokes = holed(h, SEEDS);
    expect(middle(strokes)).toBeGreaterThanOrEqual(2);
    expect(middle(strokes)).toBeLessThanOrEqual(h.par);
  });
});

describe('Carousel', () => {
  const h = hole('Carousel');
  const layout = layoutOf(h.map);
  const belts = defs(h, 'conveyor');
  const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
  const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;
  const [cupCol, cupRow] = tileOf(h, 'C');
  const mound = h.map.findIndex((r) => r.includes('3'));

  it('has a mound of raised grass between the tee and the cup that is a wall to the ball, belts along its foot, its flank and its back, and no belt on it', () => {
    expect(belts.length).toBe(3);
    for (let row = mound; row < h.map.length && h.map[row].includes('3'); row++) {
      for (const c of h.map[row].split('')) expect('#3.'.includes(c)).toBe(true);
      expect(stepAt(layout, tileX(5), tileY(row)), `row ${row}`).toBeCloseTo(3 * STEP, 6);
    }
    expect(tileY(mound), 'the cup is behind it').toBeLessThan(tileY(cupRow) - 1);
    for (const b of belts)
      for (const [col, row] of [b.from, b.to]) expect(h.map[row][col], 'a belt on grass').toBe('.');
  });

  it('carries a slow ball put on the belt at its foot out to the flank, up it and along the back, and sets it down short of the cup, at rest, not holed', () => {
    const { game, told } = newGame(1, null, [h]);
    const foot = belts[0];
    game.place(tileX(foot.from[0] - 3), tileY(foot.from[1]));
    const [x0, y0] = [game.world.x[game.ball], game.world.y[game.ball]];
    const path: [number, number][] = [];
    for (let f = 0; f < 60 * 14; f++) {
      game.step(DT);
      if (f % 30 === 0) path.push([game.world.x[game.ball], game.world.y[game.ball]]);
    }
    const [x, y] = [game.world.x[game.ball], game.world.y[game.ball]];
    expect(Math.min(...path.map((p) => p[0])), 'out to the flank').toBeLessThan(tileX(2));
    expect(game.world.asleep[game.ball], 'at rest').toBe(1);
    expect(y, 'behind the mound').toBeGreaterThan(tileY(mound) + TILE / 2 + KIND_RADIUS[BALL]);
    expect(y).toBeGreaterThan(y0 + 10);
    expect(x, 'short of the cup').toBeLessThan(tileX(cupCol) - TILE);
    expect(told.some((t) => t.startsWith('holed'))).toBe(false);
    expect(game.strokes).toBe(0);
    expect(x0).toBeGreaterThan(x - 20);
  });

  it('lets no ball over the foot, however hard it is struck: even the hardest shot is stopped by the belt and is carried round to the back', () => {
    for (const power of [0.3, 0.6, 1]) {
      const { game } = newGame(1, null, [h]);
      const { tee, cup } = game.layout;
      game.shoot(Math.atan2(cup.y - 8 - tee.y, 0 - tee.x), power);
      settle(game, 60 * 16);
      const [x, y] = [game.world.x[game.ball], game.world.y[game.ball]];
      expect(game.world.asleep[game.ball], `power ${power}: at rest`).toBe(1);
      expect(stepAt(game.layout, x, y), `power ${power}: not up on the mound`).toBe(0);
      expect(y, `power ${power}: carried to the back`).toBeGreaterThan(tileY(mound) + TILE / 2 + KIND_RADIUS[BALL]);
    }
  });

  it('is not holed in one stroke, being behind a wall, and is holed by the autopilot within its limit in two or three', () => {
    const strokes = holed(h, SEEDS);
    expect(Math.min(...strokes)).toBeGreaterThanOrEqual(2);
    expect(middle(strokes)).toBeLessThanOrEqual(h.par);
  });
});

describe('Ferris', () => {
  const h = hole('Ferris');
  const layout = layoutOf(h.map);
  const [mill] = defs(h, 'windmill');
  const tileX = (col: number) => layout.originX + (col + 0.5) * TILE;
  const tileY = (row: number) => layout.originY + (layout.rows - 1 - row + 0.5) * TILE;

  it('has a wall of raised grass across the whole hole, closed but for the one door, which is the windmill’s', () => {
    expect(defs(h, 'windmill').length).toBe(1);
    const row = h.map[mill.at[1]];
    expect(row[mill.at[0]], 'the door').toBe('.');
    row.split('').forEach((c, col) => {
      if (col !== mill.at[0]) expect('#3'.includes(c), `column ${col} of the wall`).toBe(true);
    });
    expect(row.split('').filter((c) => c === '3').length).toBeGreaterThan(6);
    // and a ball cannot go over it anywhere but the door
    for (let col = 1; col < row.length - 1; col++)
      if (col !== mill.at[0])
        expect(stepAt(layout, tileX(col), tileY(mill.at[1])), `column ${col}`).toBeGreaterThanOrEqual(3 * STEP - 1e-6);
    expect(stepAt(layout, tileX(mill.at[0]), tileY(mill.at[1]))).toBe(0);
  });

  it('stands a kicker square behind the door, with the cup to one side, so no line through the door reaches the cup', () => {
    expect(layout.kickers.length).toBe(1);
    expect(layout.kickers[0].x).toBeCloseTo(tileX(mill.at[0]), 6);
    expect(layout.kickers[0].y).toBeGreaterThan(tileY(mill.at[1]) + 3 * TILE);
    // a line from the cup to the nearest edge of the door, and how far from the axis it leaves the door
    const reach = Math.abs(layout.cup.x - tileX(mill.at[0])) / (layout.cup.y - tileY(mill.at[1]));
    expect(reach, 'a ball would need to go through the door at more than a quarter turn').toBeGreaterThan(0.4);
  });

  it('throws a ball struck hard at the kicker back down the room, and not one struck soft, which dies short of it', () => {
    const run = (power: number) => {
      const { game } = newGame(1, null, [h]);
      game.place(tileX(mill.at[0]), tileY(mill.at[1]) + 2 * TILE);
      game.shoot(Math.PI / 2, power);
      let back = 0,
        far = 0;
      for (let f = 0; f < 60 * 6; f++) {
        game.step(DT);
        far = Math.max(far, game.world.y[game.ball]);
        back = Math.max(back, -game.world.vy[game.ball]);
      }
      return { back, far, kicker: game.layout.kickers[0].y };
    };
    const hard = run(0.9);
    expect(hard.far, 'reached the kicker').toBeGreaterThan(hard.kicker - 2.5);
    expect(hard.back, 'and was thrown back faster than a plain post gives').toBeGreaterThan(20);
    const soft = run(0.12);
    expect(soft.far, 'dies short of it').toBeLessThan(soft.kicker - 1.6);
    expect(soft.back, 'and does not come back').toBeLessThan(1);
  });

  it('puts a ball struck hard through the door into the kicker and back toward the blades, at some moment of the windmill’s turn', () => {
    let through = false;
    for (let wait = 0; wait < 6 && !through; wait += 0.25) {
      const { game } = newGame(1, null, [h]);
      settle(game, Math.round(wait * 60));
      game.shoot(Math.PI / 2, 1);
      let past = false;
      for (let f = 0; f < 60 * 5; f++) {
        game.step(DT);
        if (game.world.y[game.ball] > tileY(mill.at[1]) + 2.5) past = true;
        if (past && game.world.vy[game.ball] < -10) through = true;
      }
    }
    expect(through).toBe(true);
  });

  it('is holed by the autopilot within its limit, in two or three', () => {
    const strokes = holed(h, SEEDS);
    expect(Math.min(...strokes)).toBeGreaterThanOrEqual(2);
    expect(middle(strokes)).toBeLessThanOrEqual(h.par);
  });
});

describe('Shooting Gallery', () => {
  const h = hole('Shooting Gallery');
  const layout = layoutOf(h.map);
  const [barrier] = defs(h, 'barrier');
  const [, cupRow] = tileOf(h, 'C');
  const [, teeRow] = tileOf(h, 'T');

  it('has three kickers standing in the field before the cup, off the line from the tee, and a barrier across the mouth of the bay the cup is in', () => {
    expect(defs(h, 'barrier').length).toBe(1);
    expect(layout.kickers.length).toBe(3);
    expect(barrier.at[1], 'between the cup and the field').toBeGreaterThan(cupRow);
    for (const k of layout.kickers) {
      expect(k.y, 'in the field, short of the bay').toBeLessThan(
        layout.originY + (layout.rows - 1 - barrier.at[1]) * TILE - 6,
      );
      expect(Math.abs(k.x - layout.tee.x), 'off the line').toBeGreaterThan(KIND_RADIUS[BALL] + 2);
    }
    // the bay is a room of its own: rail beside the barrier’s row either side of its mouth
    const row = h.map[barrier.at[1]];
    expect(row.startsWith('###') && row.endsWith('###')).toBe(true);
  });

  it('is longer than any one stroke goes, and its barrier leaves a moment clear of the line at the autopilot’s margin', () => {
    expect((teeRow - cupRow) * TILE).toBeGreaterThan(40 ** 2 / (2 * 16));
    const share = clearShare(h, 0);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.9);
  });

  it('is holed by the autopilot within its limit, not in one', () => {
    const strokes = holed(h, SEEDS);
    expect(Math.min(...strokes)).toBeGreaterThanOrEqual(2);
    expect(middle(strokes)).toBeLessThanOrEqual(h.par);
  });
});

describe('The Big Wheel', () => {
  const h = hole('The Big Wheel');
  const barriers = defs(h, 'barrier');
  const plain = barriers.filter((b) => b.bounce === undefined);
  const bumpers = barriers.filter((b) => b.bounce !== undefined);
  const [belt] = defs(h, 'conveyor');
  const [, cupRow] = tileOf(h, 'C');

  it('has a windmill’s door, two crossing barriers, a moving bumper and a belt, as The Mill Race has three', () => {
    expect(defs(h, 'windmill').length).toBe(1);
    expect(plain.length).toBe(2);
    expect(bumpers.length).toBe(1);
    expect(bumpers[0].bounce).toBe(BUMPER.restitution);
    expect(defs(h, 'conveyor').length).toBe(1);
    // crossing: side by side along the hole, going opposite ways
    expect(Math.abs(plain[0].at[1] - plain[1].at[1])).toBe(1);
    expect((((plain[1].phase ?? 0) - (plain[0].phase ?? 0)) % 1) + 1).toBeCloseTo(1.5, 9);
  });

  it('puts the belt’s end at the cup, and the movers in order up the hole: the windmill nearest the tee, then the barriers, then the bumper, then the belt', () => {
    expect(belt.to[1]).toBe(cupRow + 1);
    expect(belt.to[0]).toBe(tileOf(h, 'C')[0]);
    const mill = defs(h, 'windmill')[0];
    expect(mill.at[1], 'the windmill, nearest the tee').toBeGreaterThan(Math.max(...plain.map((b) => b.at[1])));
    expect(Math.min(...plain.map((b) => b.at[1]))).toBeGreaterThan(bumpers[0].at[1]);
    expect(bumpers[0].at[1]).toBeGreaterThan(belt.from[1]);
    // and the windmill is the first thing the ball meets: close enough to the tee that a slip of aim does not miss its door
    expect((tileOf(h, 'T')[1] - mill.at[1]) * TILE).toBeLessThanOrEqual(15);
  });

  it('leaves every barrier and the bumper a moment clear of the line at the autopilot’s margin', () => {
    for (let k = 0; k < 3; k++) {
      const share = clearShare(h, k);
      expect(share, `barrier ${k}`).toBeGreaterThan(0.1);
      expect(share, `barrier ${k} is in the way`).toBeLessThan(0.9);
    }
  });

  it('is longer than any one stroke goes, and is holed by the autopilot within its limit', () => {
    const [, teeRow] = tileOf(h, 'T');
    expect((teeRow - cupRow) * TILE).toBeGreaterThan(40 ** 2 / (2 * 16));
    const strokes = holed(h, SEEDS);
    expect(Math.min(...strokes)).toBeGreaterThanOrEqual(2);
    expect(middle(strokes)).toBeLessThanOrEqual(h.par);
  });
});

/**
 * The timed and thrown holes that came from The Fair when it went on 8 October 2026, each one's idea held as a test:
 * Dodgems and Shooting Gallery, now The Pinball Shed's, and Traffic, Ferris and The Big Wheel, now The Waterworks'. That
 * Traffic's two barriers are both clear of the line once in their beat, that Dodgems' bumpers throw and leave a window,
 * that Ferris's kicker throws a hard ball back into the blades, and that each is holed by the autopilot within its limit.
 * Their courses' own files hold each course whole.
 */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, STEP, TILE, layoutOf, stepAt } from '../src/arena';
import { Autopilot } from '../src/autopilot';
import { type HoleDef } from '../src/course';
import { SHED } from '../src/shed';
import { WATERWORKS } from '../src/waterworks';
import { checkInvariants } from '../src/invariants';
import { Obstacles, type ObstacleDef } from '../src/obstacles';
import { PLAYER } from '../scripts/pace';
import { BUMPER } from '../src/arena';
import { seeded } from '../src/random';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { DT, newGame, settle } from './helpers';

const hole = (name: string): HoleDef => [...SHED, ...WATERWORKS].find((h) => h.name === name)!;
const defs = <K extends ObstacleDef['kind']>(h: HoleDef, kind: K) =>
  (h.obstacles ?? []).filter((o): o is Extract<ObstacleDef, { kind: K }> => o.kind === kind);
/** The tile of the map that holds `letter`: its column, and its row from the top. */
const tileOf = (h: HoleDef, letter: string): [number, number] => {
  const row = h.map.findIndex((r) => r.includes(letter));
  return [h.map[row].indexOf(letter), row];
};

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

/** A game on one hole, from a seed, played by the autopilot with a player's slips. */
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

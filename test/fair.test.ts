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
  it('is The Fair, among the minigolf courses after The Meadow, with the four holes that need nothing the engine lacks', () => {
    const names = COURSES.map((c) => c.name);
    expect(names.indexOf('The Fair')).toBeGreaterThan(names.indexOf('The Meadow'));
    expect(names.indexOf('The Fair')).toBeLessThan(names.indexOf('The Range'));
    const course = COURSES.find((c) => c.name === 'The Fair')!;
    expect(course.holes).toBe(FAIR);
    expect(course.golf).toBeUndefined();
    expect(FAIR.map((h) => h.name)).toEqual(['Turnstile', 'Traffic', 'The Lift', 'Whack-a-mole']);
    expect(FAIR.map((h) => h.par)).toEqual([2, 3, 3, 3]);
    expect(course.summary).toEqual({ holes: 4, par: 11 });
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

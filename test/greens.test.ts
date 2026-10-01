/**
 * The speed of the greens: how steadily a putting green slows a rolling ball, from the fast greens of a good club (12 yards
 * a second a second) to the slow ones of a bad (22), as one figure a hole has (`HoleDef.greens`), read in one place
 * (`rollOf`, and `Game.rollAt` for the ground at a point) and handed to the physics. Held here: that the figure says what
 * a ball does (it rolls v squared over twice the roll, on the physics' own arithmetic), that the first cut is slower
 * than the green by the same ratio at every speed, that a hole without the figure plays as every green always has, and that
 * minigolf, whose green is its own and whose figure is the table's, is as it was.
 */
import { describe, expect, it } from 'vitest';
import { ROLL, TILE, lieAt } from '../src/arena';
import { COURSES, type HoleDef } from '../src/course';
import { golfHole } from '../src/golf';
import { LINKS_SPECS } from '../src/links';
import { GREENS, LIE, SURFACES, rollOf } from '../src/surfaces';
import { DT, field, golfGame, newGame } from './helpers';

/** A field of one kind of ground (`g` green, `c` first cut, and the rest), whose greens run at `greens`. */
function fieldOf(ch: string, greens?: number): HoleDef {
  const base = field('g');
  return { ...base, map: base.map.map((row) => row.replace(/g/g, ch)), ...(greens ? { greens } : {}) };
}

/** A ball put down on the ground of `hole` north of its tee, given `speed` due north, rolled to rest: how far it went, and where it ended. */
function rolled(hole: HoleDef, speed: number) {
  const { game } = golfGame(hole);
  const t = game.layout.tee;
  game.place(t.x, t.y + 2 * TILE);
  const { world, ball } = game;
  const [x0, y0] = [world.x[ball], world.y[ball]];
  world.hit(ball, 0, speed, 0);
  for (let f = 0; f < 60 * 120 && world.asleep[ball] !== 1; f++) game.step(DT);
  return {
    dist: Math.hypot(world.x[ball] - x0, world.y[ball] - y0),
    x: world.x[ball],
    y: world.y[ball],
    lie: lieAt(game.layout, x0, y0),
  };
}

/** The distance a ball rolled to rest from `v` goes at a steady slowing of `roll`, and the half step the first step's rolling adds. */
const reach = (v: number, roll: number) => (v * v) / (2 * roll);

describe('what a green’s speed is', () => {
  it('is fast, normal or slow, and the normal is the table’s own green', () => {
    expect(GREENS.fast).toBeLessThan(GREENS.normal);
    expect(GREENS.normal).toBeLessThan(GREENS.slow);
    expect(GREENS.normal).toBe(SURFACES[LIE.green].roll);
    expect(GREENS.normal).toBe(ROLL.roll);
  });

  it('is the green’s roll on a green, and the first cut’s as much slower as it always was, at every speed', () => {
    for (const greens of [GREENS.fast, 13.5, GREENS.normal, 19, GREENS.slow]) {
      expect(rollOf(LIE.green, greens)).toBe(greens);
      expect(rollOf(LIE.cut, greens) / rollOf(LIE.green, greens)).toBeCloseTo(
        SURFACES[LIE.cut].roll / SURFACES[LIE.green].roll,
        12,
      );
    }
  });

  it('is the table’s, for a hole that has none, on the green and the cut, and is never the speed of any other ground', () => {
    expect(rollOf(LIE.green)).toBe(SURFACES[LIE.green].roll);
    expect(rollOf(LIE.cut)).toBe(SURFACES[LIE.cut].roll);
    for (const greens of [GREENS.fast, GREENS.slow])
      for (const lie of [LIE.none, LIE.tee, LIE.fairway, LIE.rough, LIE.sand])
        expect(rollOf(lie, greens), `lie ${lie}`).toBe(SURFACES[lie].roll);
  });
});

describe('Game.rollAt', () => {
  it('says what the ground at a point slows a ball by, from the hole’s greens: on every tile of a golf hole, by its letter', () => {
    for (const greens of [12, 16, 22]) {
      const hole = golfHole({ ...LINKS_SPECS[1], greens });
      const { game } = golfGame(hole);
      const l = game.layout;
      const byLetter: Record<string, number> = {
        g: greens,
        C: greens,
        c: (greens * 26) / 16,
        f: 20,
        r: 60,
        t: 20,
        T: 20,
        s: 60,
      };
      const seen = new Set<string>();
      for (let r = 0; r < l.rows; r++)
        for (let c = 0; c < l.cols; c++) {
          const ch = hole.map[l.rows - 1 - r][c];
          if (!(ch in byLetter)) continue;
          seen.add(ch);
          const got = game.rollAt(l.originX + (c + 0.5) * TILE, l.originY + (r + 0.5) * TILE);
          expect(got, `"${ch}" at ${c},${r}, greens ${greens}`).toBeCloseTo(byLetter[ch], 9);
        }
      for (const ch of Object.keys(byLetter)) expect(seen.has(ch), `a "${ch}" on the hole`).toBe(true);
    }
  });

  it('is the table’s green for a hole of golf without greens, and the minigolf green’s on every hole of minigolf', () => {
    const { game } = golfGame(field('g'));
    const t = game.layout.tee;
    expect(game.rollAt(t.x, t.y + 3 * TILE)).toBe(SURFACES[LIE.green].roll);
    const mini = newGame(1).game;
    for (const h of mini.course) expect(h.greens, 'minigolf has no greens of its own').toBeUndefined();
    expect(mini.rollAt(mini.layout.cup.x, mini.layout.cup.y)).toBe(ROLL.roll);
    expect(mini.rollAt(1e6, -1e6)).toBe(ROLL.roll);
  });
});

describe('the physics’ greens', () => {
  it('slow a ball as the figure says: it rolls v squared over twice the roll, within a tenth of a yard, at fast, normal and slow', () => {
    const v = 20;
    for (const greens of [12, 16, 22]) {
      const r = rolled(fieldOf('g', greens), v);
      expect(r.lie).toBe(LIE.green);
      // the first step rolls before it is slowed, which is half a step's travel more
      expect(
        Math.abs(r.dist - reach(v, greens)),
        `greens ${greens}: ${r.dist} against ${reach(v, greens)}`,
      ).toBeLessThan(0.15);
    }
  });

  it('are faster the lower the figure: a fast green runs a ball further than a normal, and a normal further than a slow', () => {
    const [fast, normal, slow] = [12, 16, 22].map((g) => rolled(fieldOf('g', g), 20).dist);
    expect(fast).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(slow);
    expect(fast / slow).toBeCloseTo(22 / 12, 1);
  });

  it('slow the first cut as much more than the green at every speed: a ball of the same speed dies at 16 over 26 of the distance', () => {
    const v = 20;
    for (const greens of [12, 16, 22]) {
      const green = rolled(fieldOf('g', greens), v),
        cut = rolled(fieldOf('c', greens), v);
      expect(cut.lie).toBe(LIE.cut);
      expect(green.dist / cut.dist, `greens ${greens}`).toBeGreaterThan(26 / 16 - 0.03);
      expect(green.dist / cut.dist, `greens ${greens}`).toBeLessThan(26 / 16 + 0.03);
      expect(Math.abs(cut.dist - reach(v, rollOf(LIE.cut, greens))), `greens ${greens}`).toBeLessThan(0.2);
    }
  });

  it('are as every green was for a hole that has none: the same ball, to the last digit, as a hole that says 16', () => {
    for (const ch of ['g', 'c']) {
      const none = rolled(fieldOf(ch), 33),
        normal = rolled(fieldOf(ch, GREENS.normal), 33);
      expect(none.x).toBe(normal.x);
      expect(none.y).toBe(normal.y);
    }
    // and it rolls what the table says, on a field of green whose figure is never given
    expect(Math.abs(rolled(fieldOf('g'), 20).dist - reach(20, SURFACES[LIE.green].roll))).toBeLessThan(0.15);
  });

  it('leave the other ground as it was: a fairway, a rough and a tee roll the same at every speed of green', () => {
    for (const ch of ['f', 'r']) {
      const base = field(ch as 'f' | 'r');
      const a = rolled(base, 30),
        b = rolled({ ...base, greens: 12 }, 30),
        c = rolled({ ...base, greens: 22 }, 30);
      expect(b.dist, ch).toBe(a.dist);
      expect(c.dist, ch).toBe(a.dist);
    }
  });

  it('are left alone by minigolf: a hole of it with a figure of its own rolls as it did, and as the table says', () => {
    const mini = COURSES[0].holes[0];
    const rollOn = (h: HoleDef) => {
      const g = newGame(1, null, [h]).game;
      const { world, ball } = g;
      const [x0, y0] = [world.x[ball], world.y[ball]];
      world.hit(ball, 0, 20, 0);
      for (let f = 0; f < 60 * 60 && world.asleep[ball] !== 1; f++) g.step(DT);
      return Math.hypot(world.x[ball] - x0, world.y[ball] - y0);
    };
    expect(rollOn({ ...mini, greens: 12 })).toBe(rollOn(mini));
  });
});

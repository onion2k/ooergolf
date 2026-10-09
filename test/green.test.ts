/**
 * The break of a putt, and the arrows that mark which way a green leans. The break is worked out by arithmetic (a point
 * mass over the same smoothed ground the game has) and shown by the page, so what is held here is that it is the game's:
 * a putt struck in a rehearsal of the hole, aimed as the break says and as hard as it says, comes to rest where it was meant
 * to or drops, at every speed of green, and the same putt aimed straight at the cup misses by about the break. Held beside
 * that: the convention (positive is to the right of the cup, so a putt that breaks left has a positive across), that it is
 * finite wherever it is asked and cheap, and what it says of a green that is level or hills that are not a green's.
 */
import { describe, expect, it } from 'vitest';
import { HARDEST_SHOT, TILE, heightAt, layoutOf, lieAt, tileLieAt, slopeAt, type Layout } from '../src/arena';
import { golfHole, type GolfSpec } from '../src/golf';
import { GREEN, PUTT, breakOf, greenArrows, puttFrom, speedName } from '../src/green';
import { LINKS_SPECS } from '../src/links';
import { GREENS, LIE, SURFACES } from '../src/surfaces';
import { DT, field, golfGame } from './helpers';

const hole = (over: Partial<GolfSpec> = {}) => golfHole({ ...LINKS_SPECS[8], ...over });
const layoutFor = (h: ReturnType<typeof hole>) => layoutOf(h.map, h.terrain);

/**
 * A field of green, tilted by `slope` (rise over run): up to the east for a slope above nought, so that a ball putted on it
 * is carried west, and up to the west for one below.
 */
function tilted(slope: number) {
  const rows = 130,
    cols = 41;
  const heights = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) heights[r * cols + c] = (slope > 0 ? c : cols - 1 - c) * Math.abs(slope) * TILE;
  const h = field('g', rows, cols, heights);
  return { h, l: layoutOf(h.map, h.terrain) };
}

/** Where a putt of `length` yards to the cup begins, at `bearing` radians round it. */
const startFor = (l: Layout, length: number, bearing: number) => ({
  x: l.cup.x + Math.cos(bearing) * length,
  y: l.cup.y + Math.sin(bearing) * length,
});

describe('the break', () => {
  it('is nought on a green that is level, at every distance and bearing, and says how far the cup is above or below the ball', () => {
    const l = layoutFor(hole());
    for (const length of [2, 6, 12, 20]) {
      for (let a = 0; a < 8; a++) {
        const p = startFor(l, length, (a / 8) * Math.PI * 2);
        const b = breakOf(l, p.x, p.y);
        expect(Number.isFinite(b.across)).toBe(true);
        expect(b.rise).toBeCloseTo(heightAt(l, l.cup.x, l.cup.y) - heightAt(l, p.x, p.y), 9);
      }
    }
    const flat = layoutOf(field('g').map);
    for (const length of [3, 9, 24]) {
      const p = startFor(flat, length, 1.1);
      expect(Math.abs(breakOf(flat, p.x, p.y).across), `${length} yards on the level`).toBeLessThan(1e-6);
      expect(breakOf(flat, p.x, p.y).rise).toBe(0);
    }
  });

  it('is positive to the right of the cup, looking from the ball to it: a putt that breaks left is aimed right', () => {
    const { l } = tilted(0.03);
    // putting north, the ground leans east and so carries the ball west, which is left: aim right
    const from = { x: l.cup.x, y: l.cup.y - 15 };
    expect(breakOf(l, from.x, from.y).across).toBeGreaterThan(0.8);
    // from the north, putting south, west is on the right: the ball breaks right, and is aimed left
    const north = { x: l.cup.x, y: l.cup.y + 15 };
    expect(breakOf(l, north.x, north.y).across).toBeLessThan(-0.8);
    // the two are each other's mirror image, to the arithmetic's own error
    expect(Math.abs(breakOf(l, from.x, from.y).across + breakOf(l, north.x, north.y).across)).toBeLessThan(0.15);
  });

  it('is about what the slope says: a three per cent fall across a fifteen yard putt is aimed nine tenths of a yard off, and a straight putt misses by half as much again', () => {
    const { l } = tilted(0.03);
    const p = puttFrom(l, l.cup.x, l.cup.y - 15);
    // the ball is carried a lateral acceleration (gravity times the slope, 2.1) for the time it rolls, about 1.1 seconds, which is
    // 1.3 yards sideways; aimed off by a yard it starts with the speed across that takes that back, and is carried the rest
    expect(p.across).toBeGreaterThan(0.7);
    expect(p.across).toBeLessThan(1.2);
    // a putt along the fall, up it or down, breaks not at all
    for (const dx of [15, 24]) expect(Math.abs(breakOf(l, l.cup.x + dx, l.cup.y).across)).toBeLessThan(0.05);
  });

  it('grows with the slope and with the length of the putt, and is more on a fast green, which lets the ball roll longer', () => {
    const at = (slope: number, length: number, greens: number = GREENS.normal) => {
      const { l } = tilted(slope);
      return breakOf(l, l.cup.x, l.cup.y - length, greens).across;
    };
    expect(at(0.04, 12)).toBeGreaterThan(at(0.02, 12) * 1.8);
    expect(at(0.03, 18)).toBeGreaterThan(at(0.03, 8));
    // a fast green lets the ball roll on, so it is struck softer, takes longer and is carried further sideways: the greens that
    // break most are the fast ones, as every golfer knows
    expect(at(0.03, 12, GREENS.fast)).toBeGreaterThan(at(0.03, 12, GREENS.normal));
    expect(at(0.03, 12, GREENS.normal)).toBeGreaterThan(at(0.03, 12, GREENS.slow));
  });

  it('says how far the cup is above the ball: positive uphill', () => {
    const { l } = tilted(0.03);
    // the ground leans up to the east: a ball twelve yards east of the cup is above it, and one west of it below
    expect(breakOf(l, l.cup.x + 12, l.cup.y).rise).toBeCloseTo(-0.36, 1);
    const { l: other } = tilted(-0.03);
    expect(breakOf(other, other.cup.x + 12, other.cup.y).rise).toBeCloseTo(0.36, 1);
  });

  it('is always a number: on the cup, beside it, far off, off the hole and with nonsense for a place', () => {
    const l = layoutFor(hole({ contour: 1 }));
    const places: [number, number][] = [
      [l.cup.x, l.cup.y],
      [l.cup.x + 0.01, l.cup.y],
      [l.cup.x + 0.4, l.cup.y - 0.3],
      [l.tee.x, l.tee.y],
      [l.originX - 500, l.originY - 500],
      [1e6, -1e6],
      [l.cup.x + 70, l.cup.y],
      [l.cup.x, l.cup.y - 300],
    ];
    for (const [x, y] of places)
      for (const greens of [GREENS.fast, GREENS.normal, GREENS.slow]) {
        const b = breakOf(l, x, y, greens);
        expect(Number.isFinite(b.across), `from ${x},${y}`).toBe(true);
        expect(Number.isFinite(b.rise), `from ${x},${y}`).toBe(true);
      }
    for (const bad of [NaN, Infinity]) expect(Number.isFinite(breakOf(l, bad, 0).across)).toBe(true);
    // and a hole of minigolf, and a green that is not a golf hole's, are the same arithmetic
    const mini = layoutOf(['#####', '#...#', '#.C.#', '#...#', '#.T.#', '#####']);
    expect(Number.isFinite(breakOf(mini, mini.tee.x, mini.tee.y).across)).toBe(true);
  });

  it('is the one the game’s default speed of green gives when it is not told, and breakOf is puttFrom’s own', () => {
    const { l } = tilted(0.03);
    const from = { x: l.cup.x, y: l.cup.y - 14 };
    const a = breakOf(l, from.x, from.y),
      b = breakOf(l, from.x, from.y, GREENS.normal),
      c = puttFrom(l, from.x, from.y, GREENS.normal);
    expect(a).toEqual(b);
    expect(a.across).toBe(c.across);
    expect(a.rise).toBe(c.rise);
  });

  it('costs a few hundred slopes read, counted, and no more, from the furthest of a putt’s distances', () => {
    const l = layoutFor(hole({ contour: 1 }));
    let most = 0;
    for (const length of [3, 8, 15, 25, 40, 60, 90, 120]) {
      for (let a = 0; a < 6; a++) {
        const p = startFor(l, length, (a / 6) * Math.PI * 2 + 0.2);
        most = Math.max(most, puttFrom(l, p.x, p.y).work);
      }
    }
    expect(most).toBeGreaterThan(10);
    expect(most).toBeLessThanOrEqual(PUTT.most);
    // a putt that is not a putt is not worked at: the cup under the ball costs nothing
    expect(puttFrom(l, l.cup.x, l.cup.y).work).toBe(0);
  });

  it('past the putter’s reach is the line of a putt that would arrive and cannot be struck, and says so', () => {
    const l = layoutOf(field('g').map);
    const long = puttFrom(l, l.cup.x, l.cup.y - 90);
    expect(Number.isFinite(long.across)).toBe(true);
    expect(long.speed).toBeGreaterThan(HARDEST_SHOT);
    expect(puttFrom(l, l.cup.x, l.cup.y - 20).speed).toBeLessThan(HARDEST_SHOT);
    // the putt that dies half a yard past the cup, on the level, has the arrival speed the root of the roll
    const flat = puttFrom(l, l.cup.x, l.cup.y - 10);
    expect(flat.speed).toBeCloseTo(Math.sqrt(2 * GREENS.normal * (10 + PUTT.dead)), 1);
  });
});

describe('the break, against the game’s own putt', () => {
  /**
   * A putt of the putter from (x, y) at `aim` radians and a strike of `speed` along the ground, in a rehearsal: where it rests,
   * or that it dropped; null where the ball cannot lie (a hill steeper than the ground holds a ball on moves it) or the
   * putt is more than the putter strikes.
   */
  function putt(
    game: ReturnType<typeof golfGame>['game'],
    from: { x: number; y: number },
    aim: number,
    speed: number,
    mark?: { x: number; y: number },
  ) {
    const g = game.rehearsal();
    g.trial(from.x, from.y);
    g.pick('putter');
    if (Math.hypot(g.world.x[g.ball] - from.x, g.world.y[g.ball] - from.y) > 0.02) return null;
    const power = (speed / (HARDEST_SHOT * SURFACES[lieAt(g.layout, from.x, from.y)].power)) ** 2;
    if (power > 1) return null;
    expect(g.shoot(aim, power)).toBe(true);
    let closest = Infinity;
    for (let f = 0; f < 60 * 40 && g.phase === 'play' && !(f > 1 && g.ready); f++) {
      g.step(DT);
      if (mark) closest = Math.min(closest, Math.hypot(g.world.x[g.ball] - mark.x, g.world.y[g.ball] - mark.y));
    }
    return { holed: g.phase === 'done', x: g.world.x[g.ball], y: g.world.y[g.ball], closest };
  }

  /**
   * Whether the way from `from` to `to`, a yard at a time, is ground a putt is made on: green, first cut or fairway, no
   * water, and no steeper than a ball is struck up without being scrubbed as a landing (a putter strikes along the ground
   * and a hill steeper than a ninth takes the speed off it as a ball coming down would: not a green's), and clear of `avoid`.
   */
  function onTheGreen(
    l: Layout,
    from: { x: number; y: number },
    to: { x: number; y: number },
    avoid?: { x: number; y: number },
  ) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.ceil(length * 4);
    const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
    // a quarter of a yard at a time, and a ball's width either side, so a corner of sand or a post is not missed
    for (let k = 0; k <= n; k++)
      for (const side of [-1.4, 0, 1.4]) {
        const x = from.x + ((to.x - from.x) * k) / n - uy * side,
          y = from.y + ((to.y - from.y) * k) / n + ux * side;
        // the physics rolls a ball by its tile's surface, and the break is held to the game's own putt, so the line is read by the tile
        const lie = tileLieAt(l, x, y);
        if (lie !== LIE.green && lie !== LIE.cut && lie !== LIE.fairway) return false;
        if (Math.hypot(...slopeAt(l, x, y)) > 0.11) return false;
        if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 3.5) return false;
      }
    return true;
  }

  /** The point `extra` yards past `to`, on the line from `from`: where a ball that dies past its mark may come to rest. */
  const beyond = (from: { x: number; y: number }, to: { x: number; y: number }, extra: number) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return { x: to.x + ((to.x - from.x) / length) * extra, y: to.y + ((to.y - from.y) / length) * extra };
  };

  for (const greens of [GREENS.fast, GREENS.normal, GREENS.slow]) {
    it(`is the putt the game plays, at greens of ${greens}: struck as it says, the ball goes by the target within half a yard (the ninetieth of them within four tenths)`, () => {
      const offs: number[] = [];
      let ratios = 0,
        steady = 0;
      for (const spec of [LINKS_SPECS[8], LINKS_SPECS[1], LINKS_SPECS[5]]) {
        const { game } = golfGame(golfHole({ ...spec, contour: 1, greens }));
        const l = game.layout;
        // a target that is not the cup, on the green, so the ball is not drawn into it, and putts of five to twenty-five yards to it
        for (let ta = 0; ta < 6; ta++)
          for (const away of [3, 6, 10, 14]) {
            const target = { x: l.cup.x + Math.cos(ta + away) * away, y: l.cup.y + Math.sin(ta + away) * away };
            if (tileLieAt(l, target.x, target.y) !== LIE.green) continue;
            for (const length of [5, 8, 12, 16, 20, 25])
              for (let a = 0; a < 5; a++) {
                const bearing = (a / 5) * Math.PI * 2 + length * 0.37 + ta;
                const from = { x: target.x + Math.cos(bearing) * length, y: target.y + Math.sin(bearing) * length };
                if (!onTheGreen(l, from, beyond(from, target, 2), l.cup)) continue;
                const p = puttFrom({ ...l, cup: target }, from.x, from.y, greens);
                const out = putt(game, from, p.aim, p.speed, target);
                if (!out) continue;
                expect(out.holed, 'the cup is elsewhere').toBe(false);
                // how near the ball comes to the target, as it goes by: on a slope of a tenth the ball dies a good deal further
                // past it than half a yard (it is let run on by the slope as it goes down), so where it rests is the speed's to
                // say and the break is the aim's: what is held is that the aim brings the ball to the target
                offs.push(out.closest);
                // aimed straight at the target at the same speed, it is turned by the ground by about the break
                if (Math.abs(p.across) >= 0.5) {
                  const straight = putt(game, from, Math.atan2(target.y - from.y, target.x - from.x), p.speed, target);
                  if (straight) {
                    ratios++;
                    const miss = straight.closest;
                    if (miss > 0.6 * Math.abs(p.across) && miss < 2.2 * Math.abs(p.across)) steady++;
                  }
                }
              }
          }
      }
      offs.sort((a, b) => a - b);
      expect(offs.length, 'putts struck').toBeGreaterThan(300);
      expect(offs[Math.floor(offs.length * 0.9)], `the ninetieth of ${offs.length} putts, in yards`).toBeLessThan(0.4);
      expect(offs[offs.length - 1], 'the worst of them').toBeLessThan(1);
      expect(ratios, 'putts that broke half a yard or more').toBeGreaterThan(10);
      expect(steady / ratios, 'of them, missing by about the break when aimed straight').toBeGreaterThan(0.9);
    });

    it(`drops at the cup at greens of ${greens} on a hill of five per cent that would turn it two yards, aimed as the break says, and misses when aimed straight`, () => {
      const rows = 130,
        cols = 41;
      const heights = new Float32Array(rows * cols);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = c * 0.05 * TILE;
      const { game } = golfGame({ ...field('g', rows, cols, heights), greens });
      const l = game.layout;
      let tried = 0,
        dropped = 0,
        missed = 0,
        broke = 0;
      for (const length of [5, 8, 12, 16, 20, 25])
        for (const degrees of [-90, -75, -60, -45]) {
          const from = {
            x: l.cup.x + Math.cos((degrees * Math.PI) / 180) * length,
            y: l.cup.y + Math.sin((degrees * Math.PI) / 180) * length,
          };
          if (!onTheGreen(l, from, beyond(from, l.cup, 2))) continue;
          const p = puttFrom(l, from.x, from.y, greens);
          const out = putt(game, from, p.aim, p.speed);
          if (!out) continue;
          tried++;
          const spot = { x: l.cup.x + Math.cos(p.arrival) * PUTT.dead, y: l.cup.y + Math.sin(p.arrival) * PUTT.dead };
          if (out.holed || Math.hypot(out.x - spot.x, out.y - spot.y) < 0.5) dropped++;
          if (Math.abs(p.across) > 1.2) {
            broke++;
            const straight = putt(game, from, Math.atan2(l.cup.y - from.y, l.cup.x - from.x), p.speed);
            if (straight && !straight.holed) missed++;
          }
        }
      expect(tried, 'putts struck').toBeGreaterThan(15);
      expect(dropped, 'dropped or rested on the spot').toBe(tried);
      expect(broke, 'putts that broke more than a yard and a fifth').toBeGreaterThan(3);
      expect(missed, 'of them, missed when aimed straight at the cup').toBe(broke);
    });
  }
});

describe('the arrows over a green', () => {
  it('are none on a green that is level, and none on a hole of minigolf', () => {
    expect(greenArrows(layoutOf(field('g').map))).toEqual([]);
    expect(greenArrows(layoutOf(['#####', '#...#', '#.C.#', '#...#', '#.T.#', '#####']))).toEqual([]);
  });

  it('are there on a contoured green, one a tile of green that leans, each on a tile of putting green with the slope the game reads there', () => {
    const l = layoutFor(hole({ contour: 0.8 }));
    const arrows = greenArrows(l);
    expect(arrows.length).toBeGreaterThan(20);
    let greenTiles = 0;
    for (let t = 0; t < l.cols * l.rows; t++) if (!l.solid[t] && l.lie[t] === LIE.green && !l.sand[t]) greenTiles++;
    expect(arrows.length).toBeLessThanOrEqual(greenTiles);
    for (const a of arrows) {
      expect(tileLieAt(l, a.x, a.y)).toBe(LIE.green);
      const [sx, sy] = slopeAt(l, a.x, a.y);
      expect(a.slopeX).toBe(sx);
      expect(a.slopeY).toBe(sy);
      expect(Math.hypot(sx, sy)).toBeGreaterThan(0.002);
      expect(Math.hypot(sx, sy)).toBeLessThanOrEqual(GREEN.steepest * 1.1);
    }
  });
});

describe('what a green’s speed is called', () => {
  it('is fast, medium or slow, from how fast the greens run', () => {
    expect(speedName(GREENS.fast)).toBe('fast');
    expect(speedName(GREENS.normal)).toBe('medium');
    expect(speedName(GREENS.slow)).toBe('slow');
  });
});

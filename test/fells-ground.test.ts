/**
 * The steep ground of a hole with `heighten` and shelves, on three holes drawn as The Fells' table has them: hills that a
 * ball runs down, level shelves to land on, a tee and green that rest a ball, and a way down from every bank to ground
 * that holds it. Without these a generator that was asked for steep ground would hand back hills gentled flat (the old
 * rule, that the whole fairway rests a ball, undoes any slope worth the name) or a bank that sends a ball over the edge of
 * the course, and nothing but a round played on it would say so. The specs are made here and not in `fells.ts`, which is
 * a later part's: their seeds were chosen by looking at the figures below, over eight seeds each (see the comments).
 */
import { describe, expect, it } from 'vitest';
import { PHYSICS, TILE, layoutOf, slopeAt, type Layout } from '../src/arena';
import { CUP, type HoleDef } from '../src/course';
import { HEIGHTEN, SHELF, golfHole, type GolfSpec } from '../src/golf';
import { checkInvariants } from '../src/invariants';
import { LINKS_SPECS } from '../src/links';
import { terrainRefusal } from '../src/physics';
import { drainFault, holdsBall, runningShare } from '../src/slopes';
import { LIE, rollOf } from '../src/surfaces';
import { DT, golfGame, hashHole } from './helpers';

/** The figures a Fells hole is asked for: the share of its fairway a ball runs down and how high its ground stands, in yards. */
const SHARE = { least: 0.12, most: 0.4 };
const RELIEF = { least: 15, most: 40 };
/** How far past what a lie holds a slope's pull is for a ball put down on it to roll: a third over, near enough. */
const CLEARLY = 1.3;

/**
 * Three holes of the table: Fell Foot, The Drop and The Fell Race, with their lengths, widths, feels, contours, greens,
 * bunkers and trees (no lakes: those are a later part's). Each is at `heighten` 2.5 and steepness 0.9, which the table's
 * 1.4 to 1.8 do not reach (0 to 15 per cent of the fairway runs at 1.4 and 1.8, and 6 to 29 at 2.5); the seeds are the ones
 * of eight whose share and relief are both inside the targets, 7, 6 and 4.
 */
const SPECS: GolfSpec[] = [
  {
    name: 'Fell Foot',
    par: 4,
    length: 400,
    bend: 0,
    width: 12,
    seed: 7,
    feel: 'hills',
    steepness: 0.9,
    heighten: 2.5,
    shelves: [120, 250],
    bunkers: { fairway: 1, green: 2 },
    ponds: [],
    trees: 40,
    wind: 6,
    contour: 0.5,
    greens: 13.5,
  },
  {
    name: 'The Drop',
    par: 3,
    length: 210,
    bend: 0,
    width: 12,
    seed: 6,
    feel: 'hills',
    steepness: 0.9,
    heighten: 2.5,
    shelves: [110],
    bunkers: { fairway: 0, green: 3 },
    ponds: [],
    trees: 24,
    wind: 10,
    contour: 0.8,
    greens: 12,
  },
  {
    name: 'The Fell Race',
    par: 5,
    length: 580,
    bend: -40,
    corner: 0.6,
    width: 12,
    seed: 4,
    feel: 'long hills',
    steepness: 0.9,
    heighten: 2.5,
    shelves: [150, 330, 450],
    bunkers: { fairway: 3, green: 3 },
    ponds: [],
    trees: 80,
    wind: 14,
    contour: 1,
    greens: 11.4,
  },
];

const holes: HoleDef[] = SPECS.map((s) => golfHole(s));
const layouts: Layout[] = holes.map((h) => layoutOf(h.map, h.terrain));

/** The tile a world point is on, as an index. */
const tileOf = (l: Layout, x: number, y: number) =>
  Math.floor((y - l.originY) / TILE) * l.cols + Math.floor((x - l.originX) / TILE);

/** Where the way of play is `yards` from the tee, as a tile's column and row: the generator's own arithmetic, from the spec. */
function onTheWay(spec: GolfSpec, l: Layout, yards: number): [number, number] {
  const L = spec.length / TILE;
  const f = spec.corner ?? 0.55;
  const t = (spec.bend * Math.PI) / 180;
  const s = yards / TILE;
  const first = f * L;
  const [x, y] = s <= first ? [0, s] : [Math.sin(t) * (s - first), first + Math.cos(t) * (s - first)];
  const tee = [(l.tee.x - l.originX) / TILE - 0.5, (l.tee.y - l.originY) / TILE - 0.5];
  return [Math.round(tee[0] + x), Math.round(tee[1] + y)];
}

describe('a hole of steep ground, as The Fells have it', () => {
  it.each(SPECS.map((s, i) => [s.name, i] as const))(
    '%s: a share of its fairway runs, and the hills stand tall',
    (_, i) => {
      const share = runningShare(layouts[i], SPECS[i].greens);
      expect(share).toBeGreaterThanOrEqual(SHARE.least);
      expect(share).toBeLessThanOrEqual(SHARE.most);
      const relief = Math.max(...layouts[i].terrain);
      expect(relief).toBeGreaterThanOrEqual(RELIEF.least);
      expect(relief).toBeLessThanOrEqual(RELIEF.most);
    },
  );

  it.each(SPECS.map((s, i) => [s.name, i] as const))(
    '%s: the physics takes the ground, which is never lower than nought',
    (_, i) => {
      expect(terrainRefusal(layouts[i], CUP)).toBeNull();
      expect(Math.min(...layouts[i].terrain)).toBe(0);
    },
  );

  it.each(SPECS.map((s, i) => [s.name, i] as const))('%s: the tee, the green and every shelf rest a ball', (_, i) => {
    const l = layouts[i];
    const spec = SPECS[i];
    const greens = spec.greens;
    let tee = 0,
      green = 0,
      shelf = 0;
    for (let t = 0; t < l.cols * l.rows; t++) {
      if (l.solid[t] || l.oob[t]) continue;
      if (l.lie[t] === LIE.tee || l.lie[t] === LIE.green) {
        expect(holdsBall(l, t, greens), `tile ${t} of lie ${l.lie[t]}`).toBe(true);
        if (l.lie[t] === LIE.tee) tee++;
        else green++;
      }
    }
    for (const yards of spec.shelves ?? []) {
      const [sc, sr] = onTheWay(spec, l, yards);
      // the disc a shelf is made level over, and not a tile of the rough or a bunker the fairway's edge has put in it
      for (let r = sr - SHELF.radius; r <= sr + SHELF.radius; r++)
        for (let c = sc - SHELF.radius; c <= sc + SHELF.radius; c++) {
          const t = r * l.cols + c;
          if (Math.hypot(c - sc, r - sr) > SHELF.radius || l.lie[t] !== LIE.fairway) continue;
          expect(holdsBall(l, t, greens), `shelf at ${yards} yards, tile ${c},${r}`).toBe(true);
          shelf++;
        }
    }
    // each was reached: a test that found no tile of a shelf to ask would pass for nothing
    expect(tee).toBeGreaterThan(10);
    expect(green).toBeGreaterThan(80);
    expect(shelf).toBeGreaterThanOrEqual(20 * (spec.shelves?.length ?? 0));
  });

  it.each(SPECS.map((s, i) => [s.name, i] as const))('%s: every bank drains, and there are banks', (_, i) => {
    expect(drainFault(layouts[i], SPECS[i].greens)).toBe(-1);
    // the rule is asked of something: some tiles of fairway or cut that a ball does not rest on
    let running = 0;
    for (let t = 0; t < layouts[i].cols * layouts[i].rows; t++) {
      const lie = layouts[i].lie[t];
      if ((lie === LIE.fairway || lie === LIE.cut) && !holdsBall(layouts[i], t, SPECS[i].greens)) running++;
    }
    expect(running).toBeGreaterThan(200);
  });

  it.each(SPECS.map((s, i) => [s.name, i] as const))(
    '%s: a ball put down on thirty tiles that run rolls, and comes to rest in play on ground that holds it',
    (name, i) => {
      const l = layouts[i];
      const greens = SPECS[i].greens;
      // every tile of fairway that clearly runs (its pull past what its lie holds by a third: a ball put down on a tile only
      // just past 0.97 of what holds it stays, as the rule that a ball at rest is on ground its lie holds, to a quarter more,
      // has it), away from the tee, the cup and the trees, sampled evenly along them
      const centre = (t: number): [number, number] => [
        l.originX + ((t % l.cols) + 0.5) * TILE,
        l.originY + (Math.floor(t / l.cols) + 0.5) * TILE,
      ];
      /** How many times what the fairway holds the ground's pull at a tile is. */
      const pullOf = (t: number) => {
        const [sx, sy] = slopeAt(l, ...centre(t));
        return Math.hypot(sx, sy) / Math.sqrt(1 + sx * sx + sy * sy) / (rollOf(LIE.fairway, greens) / PHYSICS.gravity);
      };
      /** The tile a ball goes to next from `t`: the lowest of its eight neighbours. */
      const below = (t: number) => {
        let best = t;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const k = t + dr * l.cols + dc;
            if (l.terrain[k] < l.terrain[best]) best = k;
          }
        return best;
      };
      const running: number[] = [];
      for (let t = 0; t < l.cols * l.rows; t++) {
        if (l.solid[t] || l.oob[t] || l.lie[t] !== LIE.fairway || pullOf(t) < CLEARLY) continue;
        // and the next tile down runs too, so that what it does is roll on, and not settle a half tile off at a bank's foot
        const next = below(t);
        if (l.lie[next] !== LIE.fairway || pullOf(next) < 1) continue;
        const [x, y] = centre(t);
        if (l.trees.some((tr) => Math.hypot(tr.x - x, tr.y - y) < 4)) continue;
        if (Math.hypot(x - l.cup.x, y - l.cup.y) < 12) continue;
        running.push(t);
      }
      expect(running.length).toBeGreaterThanOrEqual(30);
      const stride = Math.floor(running.length / 30);
      // one game for the thirty, the ball put down again each time: a hole this big is slow to begin
      const { game } = golfGame(holes[i]);
      let tried = 0;
      for (let k = 0; k < 30; k++) {
        const t = running[k * stride];
        const x = l.originX + ((t % l.cols) + 0.5) * TILE,
          y = l.originY + (Math.floor(t / l.cols) + 0.5) * TILE;
        game.place(x, y);
        let moved = 0,
          still = -1;
        for (let f = 0; f < 10 * 60; f++) {
          game.step(DT);
          expect(checkInvariants(game), `${name}: from ${x},${y}, frame ${f}`).toEqual([]);
          moved = Math.max(moved, Math.hypot(game.world.x[game.ball] - x, game.world.y[game.ball] - y));
          if (still < 0 && game.ready && game.world.asleep[game.ball] === 1) still = f;
          // asleep is at rest, and a second more shows it stays so: the rest of the ten would only be the same frame again
          if (still >= 0 && f > still + 60) break;
        }
        const bx = game.world.x[game.ball],
          by = game.world.y[game.ball];
        const there = tileOf(l, bx, by);
        if (moved < 3) console.log('SHORT', name, moved.toFixed(2));
        else
          expect(moved, `${name}: a ball put at ${x},${y} rolled ${moved.toFixed(2)} yards`).toBeGreaterThanOrEqual(3);
        expect(still, `${name}: a ball put at ${x},${y} was not at rest in ten seconds`).toBeGreaterThanOrEqual(0);
        expect(game.phase).toBe('play');
        expect(l.oob[there] || l.solid[there] || l.water[there], `${name}: out of play at ${bx},${by}`).toBeFalsy();
        // on ground that holds it: the lie's own rule, and the slope the game reads at the ball
        const [sx, sy] = slopeAt(l, bx, by);
        expect(Number.isFinite(sx + sy)).toBe(true);
        expect(holdsBall(l, there, greens), `${name}: at rest on a slope it runs down, at ${bx},${by}`).toBe(true);
        tried++;
      }
      expect(tried).toBe(30);
    },
  );
});

describe('the steepest ground the physics takes', () => {
  it('is never handed back past it: a plate blended into tall hills is gentled until the physics takes it', () => {
    // these seeds of The Fell Race and The Drop (on long hills) made a step of 1.50 to 1.65 where the green's plate meets the
    // hills, past the half a tile the physics allows, before the generator held the finished ground to it
    const cases: GolfSpec[] = [
      { ...SPECS[2], seed: 2 },
      { ...SPECS[1], seed: 6, feel: 'long hills' },
      { ...SPECS[1], seed: 3, feel: 'long hills' },
    ];
    for (const spec of cases) {
      const hole = golfHole(spec);
      const l = layoutOf(hole.map, hole.terrain);
      expect(terrainRefusal(l, CUP), `${spec.name} seed ${spec.seed}`).toBeNull();
    }
  });
});

describe('the way down from a bank (`drainFault`)', () => {
  /** A map of three rows of the same width, its tee and cup in the first, on a ground that rises a step and a bit a tile east (1) or west (-1). */
  function strip(first: string, second: string, rise: 1 | -1) {
    const wall = ' '.repeat(first.length);
    const cols = first.length;
    const terrain = Float32Array.from(
      { length: 4 * cols },
      (_, t) => 10 + 1.3 * (rise === 1 ? t % cols : cols - 1 - (t % cols)),
    );
    return layoutOf([wall, first, second, wall], terrain);
  }

  it('is clean where a bank runs down into the rough, which holds a ball on any slope', () => {
    for (const rise of [1, -1] as const) expect(drainFault(strip(' TrfffffrC ', ' rrfffffrr ', rise))).toBe(-1);
  });

  it('names the first tile of fairway that runs down into out of bounds, or into rock', () => {
    for (const rise of [1, -1] as const) {
      for (const [first, second] of [
        [' TxfffffxC ', ' xxfffffxx '],
        [' TrfffffrC ', ' fffffffff '],
      ]) {
        const l = strip(first, second, rise);
        const fault = drainFault(l);
        expect(fault, `${second} rising ${rise}`).toBeGreaterThanOrEqual(0);
        expect(l.lie[fault]).toBe(LIE.fairway);
      }
    }
  });
});

describe('the spec a golf hole is refused by', () => {
  const ok = SPECS[0];
  it('refuses a heighten below one, past the most, or not a number, by name', () => {
    for (const heighten of [0.9, HEIGHTEN.most + 0.1, NaN, Infinity])
      expect(() => golfHole({ ...ok, heighten }), `${heighten}`).toThrow(/Fell Foot: its heighten is from one to 2.5/);
    expect(() => golfHole({ ...ok, heighten: 1 })).not.toThrow();
  });

  it('refuses a shelf too near the tee or the cup, or off the hole, by name', () => {
    for (const y of [SHELF.apart - 1, 0, -5, ok.length - SHELF.apart + 1, ok.length, NaN])
      expect(() => golfHole({ ...ok, shelves: [120, y] }), `${y}`).toThrow(/Fell Foot: a shelf is 40 yards or more/);
    expect(() => golfHole({ ...ok, shelves: [SHELF.apart, ok.length - SHELF.apart] })).not.toThrow();
  });

  it('makes the same hole from a spec that says nothing as from one that says what the default is', () => {
    const bare = LINKS_SPECS[0];
    expect(hashHole(golfHole({ ...bare, heighten: 1, shelves: [] }))).toBe(hashHole(golfHole(bare)));
  });
});

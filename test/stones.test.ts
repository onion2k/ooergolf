/**
 * The stones along the water's edge, as the title picture has them: worked out from a hole's map and never from chance,
 * standing in the water where it meets ground a ball can be on, with gaps a ball can roll through, each a body the
 * physics has, so a ball rolled at one comes back off it and one that comes to rest on one over the water is lost, as
 * in the water. Each rule has its test, and each test has been seen to fail with the rule taken out.
 */
import { describe, expect, it } from 'vitest';
import { BALL, KIND_RADIUS, STONE, TILE, WATER_LEVEL, fromStones, layoutOf, tileAt, type Layout } from '../src/arena';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { LIE } from '../src/surfaces';
import { checkInvariants } from '../src/invariants';
import { makeWorld } from '../src/physics';
import { seeded } from '../src/random';
import { DT, FLAT, newGame } from './helpers';

/** A pond across a lane, ground all round it, with room to roll at it from the tee and a way round it on the right. */
const POND: HoleDef = {
  name: 'test pond',
  par: 3,
  map: [
    '#########',
    '#..C....#',
    '#.......#',
    '#~~~~~..#',
    '#~~~~~..#',
    '#.......#',
    '#.......#',
    '#..T....#',
    '#########',
  ],
};

/** Whether a tile is ground a ball can be on, beside which a stone may stand. */
const land = (l: Layout, t: number) => t >= 0 && !l.water[t] && !l.rail[t] && l.solid[t] === 0;

describe('where the stones stand', () => {
  it('in the water, where it meets ground a ball can be on, never against a rail', () => {
    for (const course of COURSES.filter((c) => !c.golf))
      for (const hole of course.holes) {
        const l = layoutOf(hole.map, hole.terrain);
        for (const s of l.stones) {
          const t = tileAt(l, s.x, s.y);
          expect(l.water[t], `${hole.name}: a stone not in the water`).toBe(1);
          // the ground it is beside, a stone's radius and a little past its middle toward the nearer edge
          const beside = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => land(l, tileAt(l, s.x + dx * TILE * 0.5, s.y + dy * TILE * 0.5)));
          expect(beside, `${hole.name}: a stone beside no ground at ${s.x},${s.y}`).toBe(true);
        }
      }
  });

  it("along about two sides in five of the water's edge off the line of play, so a pond has stones and is not fenced in", () => {
    let sides = 0,
      stones = 0;
    for (const course of COURSES.filter((c) => !c.golf))
      for (const hole of course.holes) {
        const l = layoutOf(hole.map, hole.terrain);
        const way = [...wayToCup(l)];
        const offLine = (u: number) =>
          !way.some(
            (w) =>
              Math.max(
                Math.abs((w % l.cols) - (u % l.cols)),
                Math.abs(Math.floor(w / l.cols) - Math.floor(u / l.cols)),
              ) <= 1,
          );
        for (let t = 0; t < l.cols * l.rows; t++) {
          if (!l.water[t]) continue;
          const c = t % l.cols,
            r = Math.floor(t / l.cols);
          for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const u = (r + dr) * l.cols + c + dc;
            if (c + dc >= 0 && c + dc < l.cols && r + dr >= 0 && r + dr < l.rows && land(l, u) && offLine(u)) sides++;
          }
        }
        stones += l.stones.length;
      }
    expect(sides).toBeGreaterThan(20);
    expect(stones / sides).toBeGreaterThan(0.25);
    expect(stones / sides).toBeLessThan(0.55);
  });

  it('is the same for a map every time, and none where there is no water', () => {
    expect(layoutOf(POND.map).stones).toEqual(layoutOf(POND.map).stones);
    expect(layoutOf(POND.map).stones.length).toBeGreaterThan(0);
    expect(layoutOf(COURSES[0].holes[0].map).stones).toEqual([]);
  });

  it('stands a little proud of the ground beside it, its top a floor, and as wide as the figures say', () => {
    for (const s of layoutOf(POND.map).stones) {
      expect(s.top).toBeCloseTo(STONE.proud, 5);
      expect(s.r).toBeGreaterThanOrEqual(STONE.radius * 0.85 - 1e-9);
      expect(s.r).toBeLessThanOrEqual(STONE.radius * 1.15 + 1e-9);
      // standing over a resting ball's middle, so it meets a rolled ball by its side; and drawn down into the water
      expect(s.top).toBeGreaterThan(KIND_RADIUS[BALL]);
      expect(s.top - 2 * s.r).toBeLessThan(WATER_LEVEL);
    }
    // a golf hole's are bigger, as its ball is struck further (Water Carry's, since the level pond lies across its fairway)
    const carry = COURSES.find((c) => c.name === 'The Links')!.holes[1];
    const golf = layoutOf(carry.map, carry.terrain);
    expect(golf.stones.length).toBeGreaterThan(0);
    for (const s of golf.stones) expect(s.r).toBeGreaterThan(STONE.radius);
  });

  it('is in the physics as a body of its own, at its place, its radius and its top', () => {
    const l = layoutOf(POND.map);
    const world = makeWorld(l, CUP, seeded(1));
    for (const s of l.stones)
      expect(
        world.bumpers.some((b) => b.x === s.x && b.y === s.y && b.radius === s.r && Math.abs(b.top - s.top) < 1e-9),
        `${s.x},${s.y}`,
      ).toBe(true);
    expect(fromStones(l, l.stones[0].x, l.stones[0].y)).toBeCloseTo(-l.stones[0].r, 5);
  });
});

/** The tiles of the shortest way over ground a ball can be on from the tee to the cup, found here and not by the code under test. */
function wayToCup(l: Layout): Set<number> {
  const tile = (x: number, y: number) => tileAt(l, x, y);
  const from = tile(l.tee.x, l.tee.y),
    to = tile(l.cup.x, l.cup.y);
  const back = new Map<number, number>([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const t = queue.shift()!;
    if (t === to) break;
    const c = t % l.cols;
    for (const u of [c > 0 ? t - 1 : -1, c < l.cols - 1 ? t + 1 : -1, t - l.cols, t + l.cols])
      if (u >= 0 && u < l.cols * l.rows && land(l, u) && !back.has(u)) {
        back.set(u, t);
        queue.push(u);
      }
  }
  const way = new Set<number>();
  for (let t = to; t >= 0 && back.has(t); t = back.get(t)!) way.add(t);
  return way;
}

/** The tile beside a stone: the ground at the edge of its water tile nearest its middle. */
function besideOf(l: Layout, s: { x: number; y: number }): number {
  const t = tileAt(l, s.x, s.y);
  const c = t % l.cols,
    r = Math.floor(t / l.cols);
  const cx = l.originX + (c + 0.5) * TILE,
    cy = l.originY + (r + 0.5) * TILE;
  let best = -1,
    nearest = Infinity;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const u = (r + dr) * l.cols + c + dc;
    if (c + dc < 0 || c + dc >= l.cols || r + dr < 0 || r + dr >= l.rows || !land(l, u)) continue;
    // how far the stone's middle is from that side's edge
    const d = dc !== 0 ? Math.abs(cx + (dc * TILE) / 2 - s.x) : Math.abs(cy + (dr * TILE) / 2 - s.y);
    if (d < nearest) {
      nearest = d;
      best = u;
    }
  }
  return best;
}

describe('the stones keep off the line of play', () => {
  it('stand nowhere within a tile of the shortest way from the tee to the cup, on every hole of minigolf', () => {
    for (const course of COURSES.filter((c) => !c.golf))
      for (const hole of course.holes) {
        const l = layoutOf(hole.map, hole.terrain);
        const way = wayToCup(l);
        for (const s of l.stones) {
          const t = besideOf(l, s);
          const c = t % l.cols,
            r = Math.floor(t / l.cols);
          for (const w of way) {
            const near = Math.max(Math.abs((w % l.cols) - c), Math.abs(Math.floor(w / l.cols) - r)) <= 1;
            expect(near, `${hole.name}: a stone at ${s.x.toFixed(1)},${s.y.toFixed(1)} beside the line of play`).toBe(
              false,
            );
          }
        }
      }
  });

  it("leave The Causeway's strip open, so a putt a few degrees off is lost in the pond, and still line its pond elsewhere", () => {
    const causeway = COURSES.flatMap((c) => c.holes).find((h) => h.name === 'The Causeway')!;
    const l = layoutOf(causeway.map);
    expect(l.stones.length).toBeGreaterThan(0);
    // the strip: the rows where the ground is two tiles across
    const strip = (r: number) =>
      Array.from({ length: l.cols }, (_, c) => land(l, r * l.cols + c)).filter(Boolean).length === 2;
    for (const s of l.stones)
      expect(
        strip(Math.floor(besideOf(l, s) / l.cols)),
        `a stone beside the strip at ${s.x.toFixed(1)},${s.y.toFixed(1)}`,
      ).toBe(false);
  });

  it('stand on a golf hole only beside its rough, never its fairway, green, first cut or tee', () => {
    for (const hole of [FLAT.pond, ...COURSES.find((c) => c.name === 'The Links')!.holes.slice(0, 3)]) {
      const l = layoutOf(hole.map, hole.terrain);
      for (const s of l.stones) {
        const t = besideOf(l, s);
        const c = t % l.cols,
          r = Math.floor(t / l.cols);
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const u = (r + dr) * l.cols + c + dc;
            if (u < 0 || u >= l.cols * l.rows || l.water[u] || !land(l, u)) continue;
            expect(
              l.lie[u] === LIE.rough || l.lie[u] === LIE.sand || l.oob[u] === 1,
              `${hole.name}: a stone beside play`,
            ).toBe(true);
          }
      }
    }
  });
});

describe('a ball and a stone', () => {
  it('rolled at a stone, comes back off it and is not lost', () => {
    const { game, told } = newGame(1, null, [POND]);
    const l = game.layout;
    // the stone nearest the tee on the near shore, and the ball put down two tiles short of it
    const near = l.stones.filter((s) => s.y < l.tee.y + 6 * TILE).sort((a, b) => a.y - b.y)[0] ?? l.stones[0];
    const at = { x: near.x, y: near.y - near.r - KIND_RADIUS[BALL] - 2 * TILE };
    game.place(at.x, at.y);
    const angle = Math.atan2(near.y - at.y, near.x - at.x);
    game.shoot(angle, 0.25);
    let back = false;
    for (let f = 0; f < 600 && !game.ready; f++) {
      game.step(DT);
      const { world, ball } = game;
      if (world.vx[ball] * Math.cos(angle) + world.vy[ball] * Math.sin(angle) < -0.5) back = true;
    }
    expect(back, 'the ball came back off the stone').toBe(true);
    expect(told.filter((e) => e.startsWith('splash'))).toEqual([]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('come to rest on a stone over the water, is lost as in the water: a stroke more and put back', () => {
    const { game, told } = newGame(1, null, [POND]);
    const l = game.layout;
    const s = l.stones.find((q) => tileAt(l, q.x, q.y) >= 0)!;
    const { world, ball } = game;
    // dropped from just above the stone's middle, so it lands on its top and stays there
    world.x[ball] = s.x;
    world.y[ball] = s.y;
    world.z[ball] = s.top + KIND_RADIUS[BALL] + 0.5;
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    world.asleep[ball] = 0;
    const strokes = game.strokes;
    for (let f = 0; f < 600 && !told.some((e) => e.startsWith('splash')); f++) game.step(DT);
    expect(
      told.some((e) => e.startsWith('splash')),
      'told of as a splash',
    ).toBe(true);
    expect(game.strokes).toBe(strokes + 1);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('cannot be put down on the bank where a stone stands in its way', () => {
    const { game } = newGame(1, null, [POND]);
    const l = game.layout;
    const s = l.stones[0];
    // the way to the ground it stands beside, and a ball put down on the bank just clear of the water there
    const [dx, dy] = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    ).find(([ax, ay]) => land(l, tileAt(l, s.x + ax * TILE * 0.5, s.y + ay * TILE * 0.5)))!;
    const out = s.r * STONE.inset + KIND_RADIUS[BALL] + 0.05;
    expect(() => game.place(s.x + dx * out, s.y + dy * out)).toThrow(/on a stone/);
  });

  it('is never inside a stone by the rules, and one put inside one breaks them', () => {
    const { game } = newGame(1, null, [POND]);
    const s = game.layout.stones[0];
    const { world, ball } = game;
    world.x[ball] = s.x;
    world.y[ball] = s.y;
    world.z[ball] = s.top - 0.5;
    expect(checkInvariants(game).some((p) => p.includes('inside a stone'))).toBe(true);
  });
});

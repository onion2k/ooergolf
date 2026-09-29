/**
 * Ground that slopes: a height for every tile, smoothed between their
 * middles as artshape-physics' terrain is, added to the step each tile
 * stands on; and the two rules the physics holds a world to, held here when
 * a hole is read, so a map that breaks one fails at load and not in play.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL,
  FASTEST,
  HARDEST_SHOT,
  KIND_RADIUS,
  ROLL,
  SAND,
  TERRAIN,
  TILE,
  heightAt,
  layoutOf,
  restingAbove,
  slopeAt,
  stepAt,
} from '../src/arena';
import { Autopilot, restsOn, speedAcross, timeAlong, timeTo } from '../src/autopilot';
import type { HoleDef } from '../src/course';
import { checkInvariants } from '../src/invariants';
import { Obstacles } from '../src/obstacles';
import { AIM_DOTS, Scene } from '../src/scene';
import { CUP } from '../src/course';
import { PHYSICS, makeWorld, physicsTerrain, terrainRefusal } from '../src/physics';
import { seeded } from '../src/random';
import { DT, newGame } from './helpers';

/** A green nine tiles across and fifteen long, rail round it, the cup near the far end and the tee near the near. */
const MAP = [
  '#########',
  '#.......#',
  '#...C...#',
  ...Array.from({ length: 10 }, () => '#.......#'),
  '#...T...#',
  '#########',
];
/** Every tile nought but those given, as `[column, row from the top, digit]`. */
function terrain(raised: [number, number, string][] = []): string[] {
  const rows = MAP.map((r) => '0'.repeat(r.length).split(''));
  for (const [c, r, d] of raised) rows[r][c] = d;
  return rows.map((r) => r.join(''));
}
/** What the physics refuses in a terrain for the map, or null: its own rules, asked through the game's side of it. */
const refused = (grid: string[]) => terrainRefusal(layoutOf(MAP, grid), CUP);

/** The middle of the tile at `column` and `row` counted from the top of the map. */
const middle = (l: ReturnType<typeof layoutOf>, column: number, row: number) => ({
  x: l.originX + (column + 0.5) * TILE,
  y: l.originY + (l.rows - 1 - row + 0.5) * TILE,
});

describe('a hole that slopes', () => {
  it('reads a height for every tile from a grid the shape of its map, a digit a half unit', () => {
    expect(TERRAIN.step).toBe(0.5);
    const l = layoutOf(MAP, terrain([[4, 10, '2']]));
    const t = (l.rows - 1 - 10) * l.cols + 4;
    expect(l.terrain[t]).toBeCloseTo(1, 9);
    expect(l.terrain.filter((h) => h !== 0).length).toBe(1);
    expect(() => layoutOf(MAP, terrain().slice(1)), 'a row short').toThrow(/terrain/);
    expect(() => layoutOf(MAP, terrain([[4, 10, 'x']])), 'not a digit').toThrow(/terrain/);
    // a hole with no terrain is as flat as it always was
    const flat = layoutOf(MAP);
    expect(flat.terrain.every((h) => h === 0)).toBe(true);
  });

  it('takes real heights as well as digits: one for every tile, row by row from the south, copied and never shared', () => {
    const cols = MAP[0].length,
      rows = MAP.length;
    const heights = new Float32Array(cols * rows);
    heights[3 * cols + 4] = 1.234;
    const l = layoutOf(MAP, heights);
    expect(l.terrain[3 * cols + 4]).toBeCloseTo(1.234, 6);
    expect(l.terrain.filter((h) => h !== 0).length).toBe(1);
    // the hole's own, and not the content's: what the content holds is never written to by a game
    heights.fill(0);
    expect(l.terrain[3 * cols + 4]).toBeCloseTo(1.234, 6);
    expect(() => layoutOf(MAP, new Float32Array(cols * rows - 1)), 'a tile short').toThrow(/terrain/);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.5]) {
      const h = new Float32Array(cols * rows);
      h[7] = bad;
      expect(() => layoutOf(MAP, h), `${bad}`).toThrow(/terrain/);
    }
    // heights that are digits' heights are read as the digits are: the same ground, to the last place
    const drawn = layoutOf(
      MAP,
      terrain([
        [4, 10, '2'],
        [5, 10, '1'],
      ]),
    );
    const given = layoutOf(MAP, Float32Array.from(drawn.terrain));
    expect(given.terrain).toEqual(drawn.terrain);
    for (const [x, y] of [
      [0.3, 1.1],
      [-2.4, -6.5],
      [4.4, 3.3],
    ])
      expect(heightAt(given, x, y)).toBe(heightAt(drawn, x, y));
  });

  it('smooths the heights between the tiles as the physics does: a lone raised tile a mound four ninths as high', () => {
    const l = layoutOf(MAP, terrain([[4, 10, '2']]));
    const top = middle(l, 4, 10),
      beside = middle(l, 5, 10);
    expect(heightAt(l, top.x, top.y), 'at its middle').toBeCloseTo(4 / 9, 6);
    expect(heightAt(l, beside.x, beside.y), 'at the next tile’s middle').toBeCloseTo(1 / 9, 6);
    // on the edge between the two, level with their middles: 0.47917 of the way across, times four sixths
    expect(heightAt(l, (top.x + beside.x) / 2, top.y)).toBeCloseTo((23 / 48) * (4 / 6), 5);
    expect(heightAt(l, top.x + 2 * TILE + 0.01, top.y), 'two tiles off, none').toBeCloseTo(0, 9);
    // level at its top, and rising toward it from either side
    const [sx, sy] = slopeAt(l, top.x, top.y);
    expect(Math.abs(sx) + Math.abs(sy)).toBeLessThan(1e-9);
    expect(slopeAt(l, top.x - 1, top.y)[0], 'rising from the west').toBeGreaterThan(0);
    expect(slopeAt(l, top.x + 1, top.y)[0], 'falling to the east').toBeLessThan(0);
  });

  it('is smooth: no jump in height or in slope across the edge of a tile', () => {
    const l = layoutOf(
      MAP,
      terrain([
        [4, 10, '2'],
        [5, 9, '1'],
      ]),
    );
    const edge = l.originX + 5 * TILE;
    for (const y of [middle(l, 4, 10).y, middle(l, 4, 10).y + 0.7]) {
      expect(heightAt(l, edge - 1e-6, y)).toBeCloseTo(heightAt(l, edge + 1e-6, y), 5);
      expect(slopeAt(l, edge - 1e-6, y)[0]).toBeCloseTo(slopeAt(l, edge + 1e-6, y)[0], 4);
    }
    // the slope is the height's own: a small step across it rises by the slope times the step
    const p = { x: middle(l, 4, 10).x - 1.3, y: middle(l, 4, 10).y + 0.4 };
    const [sx, sy] = slopeAt(l, p.x, p.y);
    const e = 1e-4;
    expect((heightAt(l, p.x + e, p.y) - heightAt(l, p.x - e, p.y)) / (2 * e)).toBeCloseTo(sx, 5);
    expect((heightAt(l, p.x, p.y + e) - heightAt(l, p.x, p.y - e)) / (2 * e)).toBeCloseTo(sy, 5);
  });

  it('is exactly flat over a run of equal heights, and adds to the step a tile stands on', () => {
    const rows = terrain().map((r) => r.replace(/0/g, '3'));
    const l = layoutOf(MAP, rows);
    const p = middle(l, 3, 8);
    expect(heightAt(l, p.x + 0.4, p.y - 1.1)).toBeCloseTo(1.5, 9);
    const stepped = layoutOf(
      MAP.map((r, i) => (i === 8 ? '#..1....#' : r)),
      rows,
    );
    const q = middle(stepped, 3, 8);
    expect(stepAt(stepped, q.x, q.y)).toBeCloseTo(0.4, 6);
    expect(heightAt(stepped, q.x, q.y), 'the step and the slope together').toBeCloseTo(1.9, 6);
  });

  it('refuses tiles side by side more than half a tile apart in height, rock and all', () => {
    expect(refused(terrain([[4, 10, '3']])), 'a tile and a half, allowed').toBeNull();
    expect(refused(terrain([[4, 10, '4']]))).toMatch(/half a tile/);
    // the rail's height shapes the ground beside it, so it is held to the rule too
    expect(refused(terrain([[0, 10, '4']]))).toMatch(/half a tile/);
  });

  it('allows a whole tile between tiles corner to corner, as the physics does: half a tile along each way', () => {
    // a raised tile with the tiles beside it half way down, and the ones at its corners at the foot: 35 degrees
    // along the diagonal, the steepest ground the physics allows, and tests
    const peak: [number, number, string][] = [
      [4, 10, '4'],
      [3, 10, '2'],
      [5, 10, '2'],
      [4, 9, '2'],
      [4, 11, '2'],
    ];
    expect(refused(terrain(peak))).toBeNull();
    // but not more than half a tile side by side
    expect(refused(terrain([...peak, [3, 10, '0']]))).toMatch(/half a tile/);
  });

  it('rests a ball higher on a slope than its radius, by the slope', () => {
    const l = layoutOf(MAP, terrain([[4, 10, '3']]));
    const p = middle(l, 4, 10);
    const [sx, sy] = slopeAt(l, p.x - 1.5, p.y);
    expect(restingAbove(l, p.x - 1.5, p.y, 1)).toBeCloseTo(Math.sqrt(1 + sx * sx + sy * sy), 9);
    expect(restingAbove(l, p.x - 1.5, p.y, 1), 'more than the radius').toBeGreaterThan(1.01);
    expect(restingAbove(l, p.x, p.y, 1), 'level on the top').toBeCloseTo(1, 9);
  });

  it('allows a slope right up to the cup, the rim following the ground, as the physics has since v0.7.0', () => {
    // the cup is at column 4, row 2: a slope beside it, and one through it, where it once had to stand on the level
    expect(refused(terrain([[5, 2, '1']])), 'beside the cup').toBeNull();
    expect(refused(terrain([[4, 2, '2']])), 'under it').toBeNull();
    // and a cup on a flat hilltop, as before
    const hill = terrain().map((r, i) => (i <= 6 ? r.replace(/0/g, '2') : i === 7 ? r.replace(/0/g, '1') : r));
    expect(refused(hill)).toBeNull();
  });
});

/** A hole with a hollow across its middle: a valley two tiles wide, a unit and a half below the green either side. */
const VALLEY: HoleDef = {
  name: 'test valley',
  par: 3,
  map: MAP,
  terrain: MAP.map((r, i) =>
    i === 8 || i === 9 ? '0'.repeat(r.length) : i === 7 || i === 10 ? '1'.repeat(r.length) : '3'.repeat(r.length),
  ),
};

describe('a game on ground that slopes', () => {
  it('refuses a barrier or a windmill on ground that slopes, where the slope would roll a ball back against it for good', () => {
    // across the side of the hollow, and then down in its level bottom
    const on = (row: number): HoleDef => ({
      ...VALLEY,
      obstacles: [{ kind: 'barrier', at: [4, row], length: 1, travel: 3, period: 4 }],
    });
    expect(() => new Obstacles(on(7).obstacles!, layoutOf(VALLEY.map, VALLEY.terrain))).toThrow(/slopes/);
    expect(() => new Obstacles(on(13).obstacles!, layoutOf(VALLEY.map, VALLEY.terrain)), 'on the level').not.toThrow();
    const mill: HoleDef = { ...VALLEY, obstacles: [{ kind: 'windmill', at: [4, 7], period: 8 }] };
    expect(() => new Obstacles(mill.obstacles!, layoutOf(VALLEY.map, VALLEY.terrain))).toThrow(/slopes/);
  });

  it('plays a course of a test’s own, from its first hole, for a hole not on the course', () => {
    const { game, told } = newGame();
    game.playCourse([VALLEY]);
    expect(game.course).toEqual([VALLEY]);
    expect(game.hole).toBe(0);
    expect(game.card).toEqual([]);
    expect(game.layout.terrain.some((h) => h > 0)).toBe(true);
    expect(told[told.length - 1]).toBe(`started 0 ${VALLEY.par}`);
    // the physics has the slopes: the ball rests on the ground the game has, and every rule holds
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reads a hole’s terrain into its layout', () => {
    const { game } = newGame(1, null, [VALLEY]);
    expect(Math.max(...game.layout.terrain)).toBeCloseTo(1.5, 6);
    expect(Math.min(...game.layout.terrain)).toBeCloseTo(0, 6);
  });

  it('takes a ball at rest on a slope to lie on it: its middle further up than its radius, by the slope', () => {
    const { game } = newGame(1, null, [VALLEY]);
    const { world, ball, layout } = game;
    const p = middle(layout, 4, 7);
    const [sx, sy] = slopeAt(layout, p.x, p.y + 1);
    expect(Math.hypot(sx, sy), 'on a slope').toBeGreaterThan(0.05);
    world.x[ball] = p.x;
    world.y[ball] = p.y + 1;
    world.z[ball] = heightAt(layout, p.x, p.y + 1) + restingAbove(layout, p.x, p.y + 1, KIND_RADIUS[BALL]);
    world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
    world.asleep[ball] = 1;
    expect(checkInvariants(game)).toEqual([]);
    world.z[ball] += 0.2;
    expect(checkInvariants(game).join('\n')).toMatch(/at rest in the air/);
  });

  it('lets a ball in a hollow go as fast as its fall into it would make it, and no faster', () => {
    const { game } = newGame(1, null, [VALLEY]);
    const { world, ball, layout } = game;
    game.shoot(Math.PI / 2, 1);
    const p = middle(layout, 4, 8);
    const low = heightAt(layout, p.x, p.y + 1.5);
    world.x[ball] = p.x;
    world.y[ball] = p.y + 1.5;
    world.z[ball] = low + KIND_RADIUS[BALL];
    const most = Math.sqrt((HARDEST_SHOT * FASTEST) ** 2 + 2 * PHYSICS.gravity * (1.5 - low));
    world.vx[ball] = most * 0.999;
    world.vy[ball] = 0;
    expect(checkInvariants(game), 'down from the highest ground there is').toEqual([]);
    world.vx[ball] = most * 1.01;
    expect(checkInvariants(game).join('\n')).toMatch(/faster than/);
    // and the game holds it to the same: a ball going that fast in the hollow is not cut back to the ceiling on the flat
    world.vx[ball] = most * 0.99;
    world.wake(ball);
    game.step(DT);
    expect(Math.hypot(world.vx[ball], world.vy[ball]), 'not cut back to the flat ceiling').toBeGreaterThan(
      HARDEST_SHOT * FASTEST + 0.5,
    );
  });
});

describe('the autopilot on ground that slopes', () => {
  it('strikes harder up a slope and softer down one, by what the rise takes or the fall gives', () => {
    const l = layoutOf(VALLEY.map, VALLEY.terrain);
    // row 12's neighbours are as high as it, so it stands at the full height, as row 5 does
    const top = middle(l, 4, 12),
      low = middle(l, 4, 8),
      far = middle(l, 4, 5);
    const g = PHYSICS.gravity;
    const flatSum = (a: number, d: number) => a * a + 2 * ROLL.roll * d;
    // down into the hollow: the fall pays for some of the roll
    const down = speedAcross(l, top.x, top.y, low.x, low.y, 4) ** 2;
    const fall = heightAt(l, top.x, top.y) - heightAt(l, low.x, low.y);
    expect(fall).toBeGreaterThan(0.5);
    expect(down).toBeCloseTo(flatSum(4, low.y - top.y) - 2 * g * fall, 4);
    // across it and up the far side to the same height: as on the flat
    expect(speedAcross(l, top.x, top.y, far.x, far.y, 4) ** 2).toBeCloseTo(flatSum(4, far.y - top.y), 4);
    // and when it gets there: sooner down a slope than along the flat, and as on the flat where there is none
    const flat = layoutOf(VALLEY.map);
    expect(timeAlong(flat, top.x, top.y, low.x, low.y, 30)).toBeCloseTo(timeTo(low.y - top.y, 30), 2);
    expect(timeAlong(l, top.x, top.y, low.x, low.y, 30)).toBeLessThan(timeTo(low.y - top.y, 30) - 0.02);
  });

  it('knows where a ball rests: on the green no steeper than its slowing over gravity, and on sand anywhere', () => {
    const l = layoutOf(VALLEY.map, VALLEY.terrain);
    const side = middle(l, 4, 7),
      level = middle(l, 4, 12);
    const [sx, sy] = slopeAt(l, side.x, side.y);
    const sin = Math.hypot(sx, sy) / Math.sqrt(1 + sx * sx + sy * sy);
    expect(sin, 'the side of the hollow is steeper than the green holds').toBeGreaterThan(ROLL.roll / PHYSICS.gravity);
    expect(restsOn(l, side.x, side.y)).toBe(false);
    expect(restsOn(l, level.x, level.y)).toBe(true);
    expect(SAND.roll / PHYSICS.gravity, 'sand holds on anything the physics allows').toBeGreaterThan(
      0.5 / Math.sqrt(1.25),
    );
  });

  it('never aims to stop where the ball would not rest', () => {
    // the cup hidden round a wall, so it plays to a point on the way; the ground before the gap slopes steeply
    // the only way is a gap in a wall, and a bank too steep to rest on lies where it would first stop on the way
    const TURN: HoleDef = {
      name: 'test turn',
      par: 3,
      map: [
        '#########',
        '#...C...#',
        ...Array.from({ length: 5 }, () => '#.......#'),
        '######.##',
        ...Array.from({ length: 3 }, () => '#.......#'),
        '#.T.....#',
        '#########',
      ],
      terrain: [
        '000000000',
        '000000000',
        '000000000',
        '000000000',
        '000000000',
        '000000000',
        '000000000',
        '000000000',
        '000000122',
        '000000244',
        '000000244',
        '000000244',
        '000000122',
      ],
    };
    const { game } = newGame(1, null, [TURN]);
    const plan = new Autopilot(game).plan()!;
    expect(plan.to, 'a point on the way, not the cup').toBeDefined();
    expect(restsOn(game.layout, plan.to!.x, plan.to!.y), `aimed at ${plan.to!.x},${plan.to!.y}`).toBe(true);
  });
});

describe('what is drawn on ground that slopes', () => {
  it('lays the aim’s dots on the ground under each, over the hollow as on the flat', () => {
    const l = layoutOf(VALLEY.map, VALLEY.terrain);
    const scene = new Scene();
    scene.static(l, VALLEY.name);
    const from = middle(l, 4, 12);
    const n = scene.writeAim(from.x, from.y, { angle: Math.PI / 2, power: 1 });
    expect(n).toBe(AIM_DOTS);
    for (let k = 0; k < n; k++) {
      const x = scene.aim[k * 16 + 12],
        y = scene.aim[k * 16 + 13],
        z = scene.aim[k * 16 + 14];
      expect(z - heightAt(l, x, y), `dot ${k}`).toBeGreaterThan(0.3);
      expect(z - heightAt(l, x, y), `dot ${k}`).toBeLessThan(0.5);
    }
  });
});

describe('the physics on ground that slopes', () => {
  it('is given a hole’s slopes: the floor of its world is the game’s ground everywhere on the course', () => {
    const l = layoutOf(VALLEY.map, VALLEY.terrain);
    const world = makeWorld(l, CUP, seeded(1));
    let most = 0;
    for (let x = l.bounds.minX + 0.1; x < l.bounds.maxX; x += 0.37)
      for (let y = l.bounds.minY + 0.1; y < l.bounds.maxY; y += 0.41)
        most = Math.max(most, Math.abs(world.floorAt(x, y) - heightAt(l, x, y)));
    expect(most).toBeLessThan(1e-5);
    // and a flat hole's world is given none, so it is stepped exactly as it always was
    expect(makeWorld(layoutOf(MAP), CUP, seeded(1)).floorAt(0, 0)).toBe(0);
  });

  it('smooths as the physics’ own terrain does, height and slope, on ground rising and falling at random', () => {
    const random = seeded(7);
    const rows = MAP.map((r) => r.split('').map(() => '0'));
    // a random walk kept within half a tile of its neighbours, and level round the cup
    for (let r = 7; r < rows.length; r++)
      for (let c = 0; c < rows[r].length; c++) {
        const above = +rows[r - 1][c],
          left = c > 0 ? +rows[r][c - 1] : above;
        const lo = Math.max(0, above - 3, left - 3),
          hi = Math.min(9, above + 3, left + 3);
        rows[r][c] = String(Math.floor(lo + random() * (hi - lo + 1)));
      }
    const l = layoutOf(
      MAP,
      rows.map((r) => r.join('')),
    );
    expect(terrainRefusal(l, CUP)).toBeNull();
    for (let k = 0; k < 400; k++) {
      const x = l.originX - 3 + random() * (l.cols * TILE + 6),
        y = l.originY - 3 + random() * (l.rows * TILE + 6);
      const theirs = physicsTerrain(l, x, y);
      expect(heightAt(l, x, y) - stepAt(l, x, y)).toBeCloseTo(theirs.height, 5);
      const [sx, sy] = slopeAt(l, x, y);
      expect(sx).toBeCloseTo(theirs.slope[0], 5);
      expect(sy).toBeCloseTo(theirs.slope[1], 5);
    }
  });

  it('rests a ball where the autopilot says it rests, and rolls it away where it says not: the instrument against the thing', () => {
    const l = layoutOf(VALLEY.map, VALLEY.terrain);
    const limit = ROLL.roll / PHYSICS.gravity;
    let rests = 0,
      rolls = 0;
    for (let row = 6; row <= 11; row++)
      for (const dy of [-1, -0.5, 0, 0.5, 1]) {
        const p = middle(l, 4, row);
        const y = p.y + dy;
        const [sx, sy] = slopeAt(l, p.x, y);
        const s = Math.hypot(sx, sy);
        const sin = s / Math.sqrt(1 + s * s);
        // clear of the limit either way, where a hair of arithmetic cannot decide it
        if (Math.abs(sin - limit) < 0.1 * limit) continue;
        const { game } = newGame(1, null, [VALLEY]);
        const { world, ball } = game;
        world.x[ball] = p.x;
        world.y[ball] = y;
        world.z[ball] = heightAt(l, p.x, y) + restingAbove(l, p.x, y, KIND_RADIUS[BALL]);
        world.vx[ball] = world.vy[ball] = world.vz[ball] = 0;
        world.wake(ball);
        for (let f = 0; f < 120; f++) game.step(DT);
        const moved = Math.abs(world.y[ball] - y);
        if (restsOn(l, p.x, y)) {
          expect(moved, `said to rest at row ${row}, ${dy} along`).toBeLessThan(0.3);
          rests++;
        } else {
          expect(moved, `said to roll at row ${row}, ${dy} along`).toBeGreaterThan(0.5);
          rolls++;
        }
      }
    expect(rests, 'some that rest').toBeGreaterThan(3);
    expect(rolls, 'some that roll').toBeGreaterThan(3);
  });

  it('rolls a ball the autopilot strikes down into the hollow to stop about where it meant, and plays the hole out', () => {
    const { game } = newGame(1, null, [VALLEY]);
    const l = game.layout;
    const from = middle(l, 4, 12),
      to = middle(l, 4, 8);
    game.place(from.x, from.y);
    const speed = speedAcross(l, from.x, from.y, to.x, to.y, 0);
    game.shoot((Math.PI / 2) * Math.sign(to.y - from.y), (speed / game.hardest) ** 2);
    for (let f = 0; f < 600 && !(f > 1 && game.ready); f++) game.step(DT);
    expect(Math.abs(game.world.y[game.ball] - to.y), `stopped at ${game.world.y[game.ball].toFixed(2)}`).toBeLessThan(
      1.5,
    );
    // and the whole hole, by the autopilot, breaking no rule
    const round = newGame(1, null, [VALLEY]).game;
    const pilot = new Autopilot(round);
    for (let f = 0; f < 60 * 60 && round.phase === 'play'; f++) {
      pilot.step(DT);
      if (f % 15 === 0) expect(checkInvariants(round), `frame ${f}`).toEqual([]);
    }
    expect(round.phase, 'holed out').not.toBe('play');
  });
});

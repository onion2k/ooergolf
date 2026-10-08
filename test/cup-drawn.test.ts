/**
 * The cup as it is drawn, whichever cup the game made: the course's own, and the magnet's, which is wider than the tile it
 * stands in. The game could make a cup the scene would not draw, and did: the page threw as a hole began, in the middle of a
 * round and again as it loaded with the item worn. So each is held to the other here. A hole begun with any item worn is drawn
 * as the page draws it; and what is drawn is a mouth where the cup is, open to its very edge and grass right up to it, on
 * level ground and on a slope, with a step or sand or a wall beside the cup.
 */
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import { TILE, layoutOf, slopeAt, terrainAt, tileAt, type Layout } from '../src/arena';
import { area as ringArea } from '../src/clip';
import { COURSES, CUP, type HoleDef } from '../src/course';
import { Game } from '../src/game';
import { GROUND, cupGround, groundOf } from '../src/ground';
import { NO_KIT } from '../src/items';
import { cupRing, wideCollar, type V3 } from '../src/models';
import { PALETTE } from '../src/models/palette';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Scene } from '../src/scene';
import { windOf } from '../src/turf';
import { SAMPLE_HOLES } from './helpers';
import { HILLS } from './hills';

/** The width of a cup that is wider than its tile: what the kit's `cupRadius` can make a mouth. */
const WIDE = 1.9;

/** A game on `holes` with a kit that widens the cup to `WIDE` if `wide` is asked for (and the plain kit if not), as the kit hands it to the game. */
function wearing(wide: string, holes: readonly HoleDef[]) {
  const kit = { ...NO_KIT, cupRadius: wide ? WIDE : null };
  return new Game(new Progress(memoryStore()), {}, { random: seeded(1), course: holes, kit: () => kit });
}

/** A hole drawn as the page draws it as it begins: the scene's still part for the layout, the obstacles and the cup the game made, and its moving part. */
function drawn(game: Game, name = game.def.name) {
  const scene = new Scene();
  const still = scene.static(game.layout, name, game.obstacles, game.cup.radius);
  const moving = scene.dynamic(game.obstacles, game.layout, name, windOf(name), {
    ghost: game.kit.rest,
    reader: game.kit.chalk,
    rainbow: game.kit.pennant,
  });
  return { scene, still, moving };
}

const course = (name: string) => COURSES.find((c) => c.name === name)!.holes;

describe('a hole begun with a kit that widens the cup', () => {
  it('is a cup wider than a tile, which is what the scene was never asked to draw', () => {
    const game = wearing('magnet', course('The Meadow'));
    expect(game.cup.radius).toBe(WIDE);
    expect(game.cup.radius).toBeGreaterThan(TILE / 2);
    expect(CUP.radius).toBeLessThan(TILE / 2);
  });

  for (const name of ['The Meadow', 'The Links']) {
    it(`is drawn on the first hole of ${name}, as the page draws it, and not refused for its width`, () => {
      const holes = course(name);
      const game = wearing('magnet', holes);
      expect(() => drawn(game, holes[0].name)).not.toThrow();
    });
  }

  it('is drawn on every kind of hole there is: each hole of the minigolf courses and a few of golf', () => {
    for (const hole of SAMPLE_HOLES) expect(() => drawn(wearing('magnet', [hole])), hole.name).not.toThrow();
  });
});

describe('the grass round a cup whose mouth is wider than its tile', () => {
  /** A hole with the cup in open grass, flat; one a step up beside the cup; one with sand beside it; and the wall of Three Cushion. */
  const FLAT_MAP = ['#########', '#.......#', '#...C...#', '#.......#', '#.......#', '#...T...#', '#########'];
  const STEPPED = ['#########', '#.......#', '#...C...#', '#...22..#', '#.......#', '#...T...#', '#########'];
  const BESIDE = ['#########', '#.......#', '#..sC...#', '#.......#', '#.......#', '#...T...#', '#########'];
  const wall = course('The Pinball Shed').find((h) => h.name === 'Three Cushion')!;
  const holes: [string, Layout][] = [
    ['a flat hole', layoutOf(FLAT_MAP)],
    ['one with a step up beside the cup', layoutOf(STEPPED)],
    ['one with sand beside the cup', layoutOf(BESIDE)],
    ['Three Cushion, whose cup stands against a wall', layoutOf(wall.map, wall.terrain)],
    ...HILLS.map((h): [string, Layout] => [`${h.name}, which slopes`, layoutOf(h.map, h.terrain)]),
  ];

  /** Every triangle of a mesh at (dx, dy) from where it is, near the cup, as the six numbers of its corners seen from above. */
  function flatten(mesh: Mesh, [dx, dy]: [number, number], near: Layout['cup']): number[][] {
    const out: number[][] = [];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const c = [0, 1, 2].flatMap((k) => [
        mesh.positions[mesh.indices[t + k] * 3] + dx,
        mesh.positions[mesh.indices[t + k] * 3 + 1] + dy,
      ]);
      if (Math.min(c[0], c[2], c[4]) < near.x + 6 && Math.max(c[0], c[2], c[4]) > near.x - 6)
        if (Math.min(c[1], c[3], c[5]) < near.y + 6 && Math.max(c[1], c[3], c[5]) > near.y - 6) out.push(c);
    }
    return out;
  }

  /** How many of these triangles, seen from above, a point is under. */
  const over = (flat: number[][], x: number, y: number) =>
    flat.filter(([ax, ay, bx, by, cx, cy]) => {
      const d1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax),
        d2 = (cx - bx) * (y - by) - (cy - by) * (x - bx),
        d3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      return (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0);
    }).length;

  /** The ground of a hole cut to a mouth of `radius`, and the collar of the cup's own tile, as the scene lays them. */
  function made(l: Layout, radius: number) {
    const { z, height } = cupGround(l);
    const ground = groundOf(l, cupRing(radius));
    const grass = [ground.green, ground.mown, ...Object.values(ground.golf ?? {})];
    const collarMesh = wideCollar(TILE, radius, { height, pieces: GROUND.pieces }).parts[0].mesh;
    const flat = [
      ...grass.flatMap((m) => flatten(m, [0, 0], l.cup)),
      ...flatten(collarMesh, [l.cup.x, l.cup.y], l.cup),
    ];
    return { z, ground, grass, collarMesh, flat };
  }

  /** Whether a point is in the mouth, which is a polygon. */
  const inMouth = (l: Layout, radius: number, x: number, y: number) => {
    const m = cupRing(radius);
    return m.every(([ax, ay], i) => {
      const [bx, by] = m[(i + 1) % m.length];
      return (bx - ax) * (y - l.cup.y - ay) - (by - ay) * (x - l.cup.x - ax) > 0;
    });
  };

  /** Every point of a grid round the cup that is on grass the ground draws, as a tile of the hole, with whether the mouth is open there. */
  function* grid(l: Layout, radius: number): Generator<{ x: number; y: number; open: boolean }> {
    const cupTile = tileAt(l, l.cup.x, l.cup.y);
    for (let i = 0; i < 60; i++)
      for (let j = 0; j < 60; j++) {
        const x = l.cup.x + ((i + 0.37) / 60) * 8 - 4,
          y = l.cup.y + ((j + 0.61) / 60) * 8 - 4;
        const u = tileAt(l, x, y);
        // sand, water and rock have no grass of the ground's to cover them
        if (u < 0 || l.solid[u] || l.water[u] || l.sand[u]) continue;
        // the mouth is open only where the grass is level with the cup's: a step up beside it is drawn whole, and the mouth stops at it
        yield { x, y, open: (u === cupTile || l.floor[u] === l.floor[cupTile]) && inMouth(l, radius, x, y) };
      }
  }

  it('is cut to nothing where the tile holds the mouth: the ground is the very ground it was', () => {
    for (const [name, l] of holes)
      for (const radius of [CUP.radius, 1.49]) {
        const plain = groundOf(l),
          mouthed = groundOf(l, cupRing(radius));
        for (const k of ['green', 'mown', 'banks'] as const) {
          expect(Array.from(mouthed[k].positions), `${name} ${k} at ${radius}`).toEqual(Array.from(plain[k].positions));
          expect(Array.from(mouthed[k].indices)).toEqual(Array.from(plain[k].indices));
        }
      }
  });

  it('leaves the mouth open, and every other point of the grass covered once, on a flat hole, a slope, a step, sand and a wall', () => {
    for (const [name, l] of holes) {
      const radius = WIDE;
      const { flat } = made(l, radius);
      let inside = 0,
        beyond = 0;
      for (const { x, y, open } of grid(l, radius)) {
        const where = `${name}: ${open ? 'the mouth' : 'the grass'} at ${(x - l.cup.x).toFixed(2)},${(y - l.cup.y).toFixed(2)}`;
        expect(over(flat, x, y), where).toBe(open ? 0 : 1);
        if (open) inside++;
        else beyond++;
      }
      // the points tried were in the mouth and out of it, so neither check passed for want of anything to check
      expect(inside, name).toBeGreaterThan(100);
      expect(beyond, name).toBeGreaterThan(1000);
    }
  });

  it('is the ground, whole, less the mouth, where the grass round the cup is level: nothing lost and nothing twice', () => {
    const l = layoutOf(FLAT_MAP);
    const radius = WIDE;
    const { grass, collarMesh } = made(l, radius);
    const area = (meshes: Mesh[]) => meshes.reduce((a, m) => a + areaOf(m), 0);
    const plain = groundOf(l);
    expect(area(grass) + area([collarMesh])).toBeCloseTo(
      area([plain.green, plain.mown]) + TILE * TILE - ringArea(cupRing(radius)),
      // a mesh is kept in single precision, which is a few millionths on a hole this size
      5,
    );
  });

  it('lies on the ground at every corner it makes, level or on a slope, and facing as the slope does', () => {
    for (const [name, l] of holes) {
      const { z, grass, collarMesh } = made(l, WIDE);
      const cupTile = tileAt(l, l.cup.x, l.cup.y);
      /** Every corner of a mesh laid at (dx, dy, dz): the ground's height at a tile's edge is its own tile's, so the tile is the triangle's. */
      const check = (mesh: Mesh, label: string, [dx, dy, dz]: V3, tileOf?: number) => {
        for (let t = 0; t < mesh.indices.length; t += 3) {
          const v = [0, 1, 2].map((k) => mesh.indices[t + k]);
          const mx = v.reduce((s, i) => s + mesh.positions[i * 3], 0) / 3 + dx,
            my = v.reduce((s, i) => s + mesh.positions[i * 3 + 1], 0) / 3 + dy;
          const u = tileOf ?? tileAt(l, mx, my);
          for (const i of v) {
            const [x, y] = [mesh.positions[i * 3] + dx, mesh.positions[i * 3 + 1] + dy];
            const at = `${name}: ${label} at ${(x - l.cup.x).toFixed(3)},${(y - l.cup.y).toFixed(3)}`;
            expect(mesh.positions[i * 3 + 2] + dz, at).toBeCloseTo(l.floor[u] + terrainAt(l, x, y), 4);
            // facing out of the slope, as the ground's own normal does there
            const [sx, sy] = slopeAt(l, x, y);
            const k = 1 / Math.hypot(sx, sy, 1);
            const dot = -mesh.normals[i * 3] * sx * k - mesh.normals[i * 3 + 1] * sy * k + mesh.normals[i * 3 + 2] * k;
            expect(dot, `${at}, its normal`).toBeGreaterThan(1 - 1e-5);
          }
        }
      };
      for (const mesh of grass) check(mesh, 'the ground', [0, 0, 0]);
      check(collarMesh, 'the collar', [l.cup.x, l.cup.y, z], cupTile);
    }
  });

  it('has every corner of the mouth for a corner of the grass, at the height the lining begins at', () => {
    for (const [name, l] of holes) {
      const radius = WIDE;
      const { z, grass, collarMesh } = made(l, radius);
      const corners: V3[] = [];
      for (const [mesh, [dx, dy, dz]] of [
        ...grass.map((m): [Mesh, V3] => [m, [0, 0, 0]]),
        [collarMesh, [l.cup.x, l.cup.y, z]] as [Mesh, V3],
      ])
        for (let i = 0; i < mesh.positions.length; i += 3)
          corners.push([mesh.positions[i] + dx, mesh.positions[i + 1] + dy, mesh.positions[i + 2] + dz]);
      const cupTile = tileAt(l, l.cup.x, l.cup.y);
      for (const [dx, dy] of cupRing(radius)) {
        const [x, y] = [l.cup.x + dx, l.cup.y + dy];
        const u = tileAt(l, x, y);
        // a corner in a tile that is not level grass with the cup's is under that tile's grass, or in sand, and is not the grass's to have
        if (u < 0 || l.solid[u] || l.water[u] || l.sand[u] || (u !== cupTile && l.floor[u] !== l.floor[cupTile]))
          continue;
        const height = l.floor[cupTile] + terrainAt(l, x, y);
        expect(
          corners.some((c) => Math.hypot(c[0] - x, c[1] - y) < 1e-6 && Math.abs(c[2] - height) < 1e-4),
          `${name}: the mouth's corner at ${dx.toFixed(2)},${dy.toFixed(2)}`,
        ).toBe(true);
      }
    }
  });

  it('is what the scene lays: the grass it hands the renderer is open in the magnet’s mouth, and the plain cup’s is as it was', () => {
    const def: HoleDef = { name: 'mouth', par: 2, map: FLAT_MAP };
    const l = layoutOf(FLAT_MAP);
    const grassOf = (item: string) => {
      const game = wearing(item, [def]);
      // the grass is the mown stripes, and the collar in the stripe of its tile
      const groups = drawn(game).still.filter((g) =>
        [PALETTE.grass, PALETTE.grassMown].some((c) => c.every((v, k) => v === g.albedo![k])),
      );
      const flat = groups.flatMap((g) => flatten(g.mesh, [g.matrices[12], g.matrices[13]], l.cup));
      return { game, flat, area: groups.reduce((a, g) => a + areaOf(g.mesh), 0) };
    };
    const plain = grassOf(''),
      wide = grassOf('magnet');
    expect(plain.game.cup.radius).toBe(CUP.radius);
    expect(wide.game.cup.radius).toBe(WIDE);
    // the wider mouth leaves that much more ground uncovered, to the last digits
    expect(plain.area - wide.area).toBeCloseTo(
      ringArea(cupRing(wide.game.cup.radius)) - ringArea(cupRing(CUP.radius)),
      5,
    );
    const at = (flat: number[][], radius: number) =>
      Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2 + 0.1;
        return over(flat, l.cup.x + Math.cos(a) * radius, l.cup.y + Math.sin(a) * radius);
      });
    // open from the middle of the cup to its edge, and grass, once, from there out, whichever way is looked along
    for (const radius of [0, 0.7, 1.4, 1.85])
      expect(at(wide.flat, radius), `the magnet's mouth, ${radius} out`).toEqual(Array(16).fill(0));
    for (const radius of [1.95, 2.2, 2.6])
      expect(at(wide.flat, radius), `its grass, ${radius} out`).toEqual(Array(16).fill(1));
    // the plain cup's is as wide as it was: open to its own edge, and covered where the magnet's is open
    for (const radius of [0, 0.7, 1.4])
      expect(at(plain.flat, radius), `the plain mouth, ${radius} out`).toEqual(Array(16).fill(0));
    for (const radius of [1.52, 1.7, 1.85, 2.2])
      expect(at(plain.flat, radius), `its grass, ${radius} out`).toEqual(Array(16).fill(1));
  });
});

/** The area of a mesh's triangles seen from above. */
function areaOf(mesh: Mesh): number {
  let sum = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t + k] * 3);
    const p = mesh.positions;
    sum += Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2;
  }
  return sum;
}

/**
 * The models, held to what the game and its physics will take them to be.
 * Every model is built headless, with no renderer, and read back as numbers:
 * that every face is wound the way its normals say, flat-shaded where it is
 * cut and smooth with no crease where it is round, the furniture never
 * faceted, that the obstacles and the ball are drawn to exactly the size the
 * physics gives them, that a
 * parameter changes what it names, and that each stays inside its triangle
 * budget. Without these, a bumper a hair wider than its circle, or a blade a
 * hair thinner than its box, would show the ball bouncing off thin air.
 */
import { describe, expect, it } from 'vitest';
import { PATTERN_STRIDE } from 'artshape-render/game/renderer';
import type { Mesh } from 'artshape-render/mesh/types';
import {
  BUDGET,
  BUNKER,
  CUP,
  FLAG_COLOURS,
  RAINBOW,
  FLOWER_COLOURS,
  PALETTE,
  PATTERN,
  WATER,
  WINDMILL,
  barrier,
  boulder,
  bounds,
  broadleaf,
  bush,
  cloud,
  conifer,
  fern,
  bankStone,
  breakArrow,
  bumper,
  bunker,
  bunting,
  sandBed,
  collar,
  conveyor,
  cup,
  cupRing,
  fence,
  flag,
  flowers,
  golfBall,
  golfTree,
  group,
  placeBlades,
  stake,
  teeMarkers,
  triangles,
  water,
  wideCollar,
  windmill,
  type Model,
  type Part,
} from '../src/models';
import { flipper, titleModel } from '../src/models';
import titleTrace from '../src/titletrace.json';
import { BALL, KIND_RADIUS, WATER_LEVEL } from '../src/arena';
import { TREE, insideCanopy, treeCone } from '../src/trees';
import { SCALE } from '../src/scenery';
import { KINDS, ROUGH } from '../src/turf';

/** How near a figure must be to be the figure: a float's worth, and then some. */
const NEAR = 1e-4;

/** Each of `got` within `digits` decimal places of the same of `want`. */
function near(got: ArrayLike<number>, want: readonly number[], digits: number) {
  expect(got.length).toBe(want.length);
  want.forEach((w, i) => expect(got[i], `[${i}]`).toBeCloseTo(w, digits));
}

/** A convex polygon cut to what lies to the left of the line from `p` to `q`: the same cut the models use, written out so that a test does not lean on it. */
function clipLeft(
  poly: [number, number][],
  p: readonly [number, number],
  q: readonly [number, number],
): [number, number][] {
  const side = (r: readonly [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const out: [number, number][] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const [sa, sb] = [side(a), side(b)];
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0))
      out.push([a[0] + ((b[0] - a[0]) * sa) / (sa - sb), a[1] + ((b[1] - a[1]) * sa) / (sa - sb)]);
  });
  return out;
}

/** The area of a polygon, counter-clockwise or not. */
function polygonArea(poly: readonly (readonly [number, number])[]): number {
  return (
    Math.abs(
      poly.reduce((s, a, i) => s + a[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * a[1], 0),
    ) / 2
  );
}

/** Every model the game can have, at the ends of the sizes it will try and between. */
function catalogue(): [string, Model][] {
  return [
    ['cup 1.6', cup(1.6)],
    ['cup 3', cup(3)],
    ['collar', collar(9, 3)],
    ['wide collar', wideCollar(3, 1.9)],
    ['flag', flag(FLAG_COLOURS.red)],
    ['tall flag', flag(FLAG_COLOURS.yellow, { height: 12 })],
    ['rainbow flag', flag(FLAG_COLOURS.red, { rainbow: true })],
    ['tee markers', teeMarkers(4)],
    ['ball', golfBall(1)],
    ['bumper', bumper(1.2)],
    ['wide bumper', bumper(2.5, { height: 2 })],
    ['barrier', barrier(3, 0.6, 0.8)],
    ['thin barrier', barrier(1, 0.2, 0.5)],
    ['windmill', windmill()],
    ['wide windmill', windmill({ gap: 5, bladeLength: 7, bladeThickness: 0.4 })],
    ['water', water(6, 9)],
    ['small water', water(3, 3, { seed: 4 })],
    ['bunker', bunker(9, 6)],
    ['sand bed', sandBed(BUNKER_TILES, 3)],
    ['conveyor', conveyor(6, 12)],
    ['golf tree', golfTree(TREE, { seed: 2 })],
    ['stake', stake()],
    ['break arrow', breakArrow()],
    ['long headed break arrow', breakArrow({ headShare: 0.5 })],
    ['flowers', flowers(FLOWER_COLOURS[0])],
    ['bunting', bunting(12)],
    ['fence', fence(6)],
    ['broadleaf', broadleaf()],
    ['tall broadleaf', broadleaf({ height: 12, seed: 4 })],
    ['conifer', conifer()],
    ['two-tier conifer', conifer({ height: 5, tiers: 2, seed: 3 })],
    ['boulder', boulder(1.4)],
    ['bush', bush(1.8)],
    ['fern', fern(2.2)],
    ['cloud', cloud()],
    ['bank stone', bankStone(1)],
  ];
}

/** The Bunker's own sand, as tiles from its south-west corner: five across, and three under their middle. */
const BUNKER_TILES: [number, number][] = [
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [1, 0],
  [2, 0],
  [3, 0],
];

describe('a bed of sand', () => {
  it('covers its tiles flush with the grass, and has a lip only where it meets the grass, never between two tiles', () => {
    const m = sandBed(BUNKER_TILES, 3);
    const b = bounds(m.parts);
    expect([b.min[0], b.max[0], b.min[1], b.max[1]].map((v) => +v.toFixed(5))).toEqual([0, 15, 0, 6]);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeCloseTo(BUNKER.lip, 5);
    const raised = [...points(partNamed(m, 'lip').mesh), ...points(partNamed(m, 'lipInner').mesh)].filter(
      (p) => p[2] > 1e-6,
    );
    for (const [x, y] of raised) {
      expect(Math.abs(x - 3) < 0.3 && y > 3.6 && y < 5.4, `a lip between two tiles of the long row, at ${x},${y}`).toBe(
        false,
      );
      expect(y > 2.7 && y < 3.3 && x > 3.6 && x < 11.4, `a lip between the rows, at ${x},${y}`).toBe(false);
    }
    expect(
      raised.some(([x, y]) => x < 0.5 && y > 3 && y < 6),
      'the long row ends in a lip',
    ).toBe(true);
    expect(
      raised.some(([x, y]) => y < 0.5 && x > 3.5 && x < 11.5),
      'the short row has a lip at its foot',
    ).toBe(true);
    expect(
      raised.some(([x, y]) => y > 2.9 && y < 3.6 && x < 2.5),
      'and the long row under its ends',
    ).toBe(true);
    expect(partNamed(m, 'sand').pattern?.kind).toBe(PATTERN.speckle);
  });

  it('lies on ground that slopes: every point of the sand on it, and the lip its own height above it', () => {
    const height = (x: number, y: number) => 0.1 * x + 0.05 * y * y;
    const m = sandBed(BUNKER_TILES, 3, { height, pieces: 3 });
    for (const [x, y, z] of points(partNamed(m, 'sand').mesh)) expect(z).toBeCloseTo(height(x, y), 5);
    for (const lip of ['lip', 'lipInner'])
      for (const [x, y, z] of points(partNamed(m, lip).mesh)) {
        const above = z - height(x, y);
        expect(above, `${lip} at ${x},${y}`).toBeGreaterThan(-1e-5);
        expect(above).toBeLessThan(BUNKER.lip + 1e-5);
      }
    // cut finer across each stripe, three pieces for every one flat
    const pieces = (bed: Model) =>
      partNamed(bed, 'sand').mesh.indices.length + partNamed(bed, 'raked').mesh.indices.length;
    expect(pieces(m)).toBe(pieces(sandBed(BUNKER_TILES, 3)) * 3);
  });

  it('is raked: stripes 0.75 wide in two tones, alternating, laid by where they are so they run on across tiles', () => {
    expect(BUNKER.stripe).toBe(0.75);
    for (const opts of [{}, { height: (x: number, y: number) => 0.1 * x + 0.05 * y * y, pieces: 3 }]) {
      const m = sandBed(BUNKER_TILES, 3, opts);
      const centres = (part: Part) => {
        const p = part.mesh.positions,
          ix = part.mesh.indices,
          ys: number[] = [];
        for (let i = 0; i < ix.length; i += 3)
          ys.push((p[ix[i] * 3 + 1] + p[ix[i + 1] * 3 + 1] + p[ix[i + 2] * 3 + 1]) / 3);
        return ys;
      };
      const plain = centres(partNamed(m, 'sand')),
        raked = centres(partNamed(m, 'raked'));
      expect(plain.length).toBeGreaterThan(0);
      expect(raked.length).toBeGreaterThan(0);
      // the stripe a triangle is in is the same whichever tile it is of: even ones plain, odd ones raked
      for (const y of plain) expect(Math.floor(y / BUNKER.stripe) % 2, `plain at ${y}`).toBe(0);
      for (const y of raked) expect(Math.floor(y / BUNKER.stripe) % 2, `raked at ${y}`).toBe(1);
      expect(raked.length / plain.length, 'about half each').toBeGreaterThan(0.6);
      expect(raked.length / plain.length).toBeLessThan(1.6);
      // and two tones: the raked a little darker than the plain
      expect(luminance(partNamed(m, 'raked').material)).toBeLessThan(luminance(partNamed(m, 'sand').material));
      expect(luminance(partNamed(m, 'raked').material)).toBeGreaterThan(
        0.75 * luminance(partNamed(m, 'sand').material),
      );
    }
  });

  it('has a lip lit on its outside and shaded on its inside, its crest lighter than the sand, and a calm grain', () => {
    const m = sandBed(BUNKER_TILES, 3);
    const l = (name: string) => luminance(partNamed(m, name).material);
    expect(l('lip'), 'the outer face, to the sun').toBeGreaterThan(l('lipInner'));
    expect(l('lip'), 'lighter than the sand it rims').toBeGreaterThan(l('sand'));
    const sand = partNamed(m, 'sand');
    const grain = luminance(sand.pattern!.second);
    // a grain a little darker than the sand, within a fifth of its brightness, and not a rash of dark specks
    expect(grain).toBeLessThan(l('sand'));
    expect(grain).toBeGreaterThan(0.8 * l('sand'));
    expect(partNamed(m, 'raked').pattern?.kind).toBe(PATTERN.speckle);
    expect(partNamed(m, 'lip').pattern?.kind).toBe(PATTERN.speckle);
  });

  it("stays within its budget for the course's bunker", () => {
    expect(triangles(sandBed(BUNKER_TILES, 3))).toBeLessThanOrEqual(BUDGET['sand bed']);
  });
});

/** Every part a model has, the ones the game moves as well as the ones it does not. */
const everyPart = (m: Model): Part[] => [...m.parts, ...m.moving];

/**
 * Which parts are not closed solids, and so have no inside to be wound
 * round: flat things lying on the ground, and the cup's lining and the
 * windmill's way through, which are the insides of holes.
 */
const OPEN = new Set([
  'liner',
  'door',
  'collar',
  'surface',
  'foam',
  'shallows',
  'mid',
  'ring',
  'sand',
  'raked',
  'lip',
  'lipInner',
  'belt',
  'frame',
  'chevrons',
  'arrow',
]);

/** The signed volume a mesh encloses about the origin: positive when every face is wound to face out. */
function volume(mesh: Mesh): number {
  const p = mesh.positions,
    ix = mesh.indices;
  let v = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3,
      b = ix[t + 1] * 3,
      c = ix[t + 2] * 3;
    v +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** How bright a colour is: the weights the eye gives red, green and blue. */
function luminance(c: readonly number[]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** How much area a mesh's triangles cover, seen from above: flat parts, so the sum of their footprints. */
function areaOf(mesh: Mesh): number {
  const p = mesh.positions,
    ix = mesh.indices;
  let area = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const [a, b, c] = [ix[i] * 3, ix[i + 1] * 3, ix[i + 2] * 3];
    area += Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2;
  }
  return area;
}

function partNamed(m: Model, name: string): Part {
  const p = everyPart(m).find((q) => q.name === name);
  if (!p) throw new Error(`${m.name} has no part called ${name}`);
  return p;
}

/** Every vertex of a mesh, as points. */
function points(mesh: Mesh): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3)
    out.push([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
  return out;
}

/**
 * The parts shaded smooth, since they are round: the course's furniture, the
 * things on screen every moment, whose faces share their normals where the
 * surface turns and meet at a crease only at a bevel's edge. Every other part
 * is flat-shaded, a face at a time.
 */
const SMOOTH = new Set([
  'ball',
  'liner',
  'rim',
  'pole',
  'knob',
  'flag',
  ...[0, 1, 2, 3, 4, 5].map((k) => `flag${k}`),
  'markers',
]);

/**
 * The parts that are round, by model, and so smooth-shaded: a vertex shared
 * by its neighbours, with the surface's own normal, so toon light falls
 * across it in clean curved bands. Every other part is flat-shaded, a face at
 * a time, as a pennant, a picket and everything the ball meets are.
 */
const ROUND: Partial<Record<string, readonly string[]>> = {
  stake: ['post', 'cap'],
  flowers: ['leaves', 'petals', 'hearts'],
  bunting: ['posts', 'string'],
  fence: ['posts', 'rails'],
};

/** Whether a model's part is one of the round ones. */
const isRound = (m: Model, part: Part) => ROUND[m.name]?.includes(part.name) ?? false;

describe('every model is finite, and wound the way its normals face', () => {
  for (const [label, model] of catalogue()) {
    it(label, () => {
      expect(everyPart(model).length).toBeGreaterThan(0);
      for (const part of everyPart(model)) {
        // a flat face's corners face exactly as it does; a round part's lean off it by up to the curve between them,
        // which for a string of four sides is forty-five degrees and more where it bends, and for a flat petal as much
        const facing = isRound(model, part) ? 0.5 : SMOOTH.has(part.name) ? 0.7 : 0.999;
        const { positions: p, normals: n, indices: ix } = part.mesh;
        expect(ix.length % 3, `${part.name}: whole triangles`).toBe(0);
        expect(ix.length, `${part.name}: something to draw`).toBeGreaterThan(0);
        for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i]) && Number.isFinite(n[i])).toBe(true);
        for (let i = 0; i < n.length; i += 3)
          expect(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1), `${part.name}: unit normal`).toBeLessThan(1e-5);
        for (let t = 0; t < ix.length; t += 3) {
          const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
          const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
          const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
          const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const area = Math.hypot(g[0], g[1], g[2]);
          expect(area, `${part.name}: triangle ${t / 3} has an area`).toBeGreaterThan(1e-7);
          // flat: a vertex shared with a face of another slope would carry the wrong normal for one of them; smooth: a
          // vertex's normal is the surface's there, which leans off each face it is a corner of, but never far
          for (const k of [a, b, c]) {
            const along = (g[0] * n[k] + g[1] * n[k + 1] + g[2] * n[k + 2]) / area;
            expect(along, `${part.name}: triangle ${t / 3} wound as its normal faces`).toBeGreaterThan(facing);
          }
        }
        if (!OPEN.has(part.name)) expect(volume(part.mesh), `${part.name}: closed and facing out`).toBeGreaterThan(0);
      }
    });
  }
});

/**
 * Where a mesh's faces meet softly, but not smoothly: an edge two faces
 * share, less than forty-five degrees apart, whose ends do not have one
 * normal. Faceting, which a round thing must not show; a bevel's edge, a
 * crease of forty-five degrees or more, is left sharp on purpose.
 */
function facets(mesh: Mesh): string[] {
  const p = mesh.positions,
    n = mesh.normals,
    ix = mesh.indices;
  const key = (i: number) => [p[i], p[i + 1], p[i + 2]].map((v) => Math.round(v * 1e4) + 0).join(',');
  const edges = new Map<string, { g: number[]; at: Map<string, number> }[]>();
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(g[0], g[1], g[2]);
    const face = { g: g.map((x) => x / l), at: new Map([a, b, c].map((i) => [key(i), i])) };
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const e = [key(i), key(j)].sort().join('|');
      edges.set(e, [...(edges.get(e) ?? []), face]);
    }
  }
  const soft: string[] = [];
  const dot3 = (i: number, j: number) => n[i] * n[j] + n[i + 1] * n[j + 1] + n[i + 2] * n[j + 2];
  for (const [e, pair] of edges) {
    if (pair.length !== 2) continue;
    const [f, h] = pair;
    if (f.g[0] * h.g[0] + f.g[1] * h.g[1] + f.g[2] * h.g[2] < Math.cos(Math.PI / 4)) continue;
    for (const end of e.split('|')) if (dot3(f.at.get(end)!, h.at.get(end)!) < 0.9999) soft.push(`${e} at ${end}`);
  }
  return soft;
}

describe('the furniture is round and smooth, and sharp only at a bevel’s edge', () => {
  for (const [label, model] of catalogue())
    for (const part of everyPart(model).filter((q) => SMOOTH.has(q.name)))
      it(`${label}: its ${part.name}`, () => {
        expect(facets(part.mesh), 'faceted where it is round').toEqual([]);
        // and shaded smooth somewhere: some corner's normal leans off its face's, as a round thing's does
        const { positions: p, normals: n, indices: ix } = part.mesh;
        let leans = false;
        for (let t = 0; t < ix.length && !leans; t += 3) {
          const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
          const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
          const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
          const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const l = Math.hypot(g[0], g[1], g[2]);
          leans = [a, b, c].some((k) => (g[0] * n[k] + g[1] * n[k + 1] + g[2] * n[k + 2]) / l < 0.9999);
        }
        expect(leans, 'shaded smooth, not a face at a time').toBe(true);
      });

  it('the ball: as big as the physics’ ball, round at every size it is seen, and banded so its roll shows', () => {
    const R = KIND_RADIUS[BALL];
    const m = golfBall(R, { colour: [0.9, 0.9, 0.9], band: [0.8, 0.1, 0.1] });
    const mesh = partNamed(m, 'ball').mesh;
    near(bounds(m.parts).min, [-R, -R, -R], 5);
    near(bounds(m.parts).max, [R, R, R], 5);
    // every corner on the sphere, facing straight out of it
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      expect(Math.hypot(x, y, z)).toBeCloseTo(R, 6);
      near([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]], [x / R, y / R, z / R], 5);
    }
    // its outline strays from the sphere by under a hundredth of its radius: the middle of every edge is that close
    const ix = mesh.indices,
      p = mesh.positions;
    for (let t = 0; t < ix.length; t += 3)
      for (const [a, b] of [
        [ix[t], ix[t + 1]],
        [ix[t + 1], ix[t + 2]],
        [ix[t + 2], ix[t]],
      ]) {
        const mid = [0, 1, 2].map((k) => (p[a * 3 + k] + p[b * 3 + k]) / 2);
        expect(Math.hypot(mid[0], mid[1], mid[2])).toBeGreaterThan(R * 0.99);
      }
    const band = partNamed(m, 'ball').pattern!;
    expect(band.kind).toBe(PATTERN.bands);
    expect([...band.second]).toEqual([0.8, 0.1, 0.1]);
    expect(partNamed(m, 'ball').material.slice(0, 3)).toEqual([0.9, 0.9, 0.9]);
  });

  it('the cup’s rim: a rounded gold bead on the grass, highest at its middle, never over the hole', () => {
    for (const r of [1.45, 3]) {
      const rim = partNamed(cup(r), 'rim').mesh;
      const { rim: w, rimHeight: h } = CUP;
      const mid = r + w / 2;
      for (let i = 0; i < rim.positions.length; i += 3) {
        const [x, y, z] = [rim.positions[i], rim.positions[i + 1], rim.positions[i + 2]];
        const across = Math.hypot(x, y);
        // on the bead's own curve, an ellipse w across and h high, and facing straight out of it
        expect(((across - mid) / (w / 2)) ** 2 + (z / h) ** 2).toBeCloseTo(1, 5);
        const [nx, ny, nz] = [rim.normals[i], rim.normals[i + 1], rim.normals[i + 2]];
        const out = [
          ((across - mid) / (w / 2) ** 2) * (x / across),
          ((across - mid) / (w / 2) ** 2) * (y / across),
          z / h ** 2,
        ];
        const k = Math.hypot(out[0], out[1], out[2]);
        expect(nx * (out[0] / k) + ny * (out[1] / k) + nz * (out[2] / k)).toBeGreaterThan(0.99999);
      }
      // thicker than the flat ring it was, and chunky: taller than a tenth, and at least a third as tall as it is wide
      expect(h).toBeGreaterThanOrEqual(0.12);
      expect(h / w).toBeGreaterThanOrEqual(1 / 3);
    }
  });

  it('the pin: a round pole, and a ball on its top', () => {
    const m = flag(FLAG_COLOURS.red, { height: 9, radius: 0.12 });
    const pole = partNamed(m, 'pole').mesh;
    for (let i = 0; i < pole.positions.length; i += 3) {
      const [x, y] = [pole.positions[i], pole.positions[i + 1]];
      const [nx, ny, nz] = [pole.normals[i], pole.normals[i + 1], pole.normals[i + 2]];
      // its side, facing straight out from its middle; its ends, facing along it
      if (Math.abs(nz) < 1e-6) {
        expect(Math.hypot(x, y)).toBeCloseTo(0.12, 6);
        near([nx, ny], [x / 0.12, y / 0.12], 5);
      } else expect(Math.abs(nz)).toBeCloseTo(1, 6);
    }
    const knob = partNamed(m, 'knob').mesh;
    const kb = bounds([partNamed(m, 'knob')]);
    const radius = (kb.max[2] - kb.min[2]) / 2;
    const centre = [0, 0, 9 - radius];
    expect(kb.max[2]).toBeCloseTo(9, 5);
    expect(radius).toBeGreaterThan(0.12 * 1.5);
    for (let i = 0; i < knob.positions.length; i += 3) {
      const d = [0, 1, 2].map((k) => knob.positions[i + k] - centre[k]);
      expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(radius, 5);
      near(
        [knob.normals[i], knob.normals[i + 1], knob.normals[i + 2]],
        d.map((v) => v / radius),
        5,
      );
    }
  });

  it('the flag: cloth in soft folds, held along the pole and flying out from it', () => {
    const m = flag(FLAG_COLOURS.red, { radius: 0.12 });
    const cloth = partNamed(m, 'flag').mesh;
    const ys: number[] = [];
    for (let i = 0; i < cloth.positions.length; i += 3) {
      const [x, y] = [cloth.positions[i], cloth.positions[i + 1]];
      ys.push(y);
      // along the pole it is held flat, where it is sewn to it, and it never comes back through the pole
      if (x < 0.12) expect(Math.abs(y)).toBeLessThan(0.1);
      expect(x).toBeGreaterThan(0);
    }
    // folded: its folds stand out from flat by a good deal more than it is thick, and softly, not in a wad
    const spread = Math.max(...ys) - Math.min(...ys);
    expect(spread).toBeGreaterThan(0.3);
    expect(spread).toBeLessThan(1.2);
  });

  it('the tee’s markers: chunky and rounded, as wide as they are tall at their foot, and round over their top', () => {
    const R = 0.5;
    const m = teeMarkers(4, { radius: R });
    const mesh = m.parts[0].mesh;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      const across = Math.hypot(Math.abs(x) - 2, y);
      // plumb and full width at the foot, and never wider
      expect(across).toBeLessThan(R + NEAR);
      if (z < NEAR) expect(across).toBeCloseTo(R, 5);
    }
    // round over the top: the normal turns from out to up without a crease
    const ups = [];
    for (let i = 0; i < mesh.normals.length; i += 3) ups.push(mesh.normals[i + 2]);
    expect(
      ups.some((u) => u > 0.3 && u < 0.95),
      'somewhere on its round',
    ).toBe(true);
    expect(Math.max(...ups)).toBeCloseTo(1, 6);
    expect(Math.min(...ups)).toBeCloseTo(0, 6);
  });
});

describe('the round things are smooth-shaded, with no crease', () => {
  for (const [label, model] of catalogue()) {
    const names = ROUND[model.name];
    if (!names) continue;
    const round = everyPart(model).filter((p) => isRound(model, p));
    it(label, () => {
      expect(round.length, 'every round part it should have').toBe(names.length);
      for (const part of round) {
        const { positions: p, normals: n, indices: ix } = part.mesh;
        // no crease: every vertex at one point carries the one normal, where a flat-shaded solid's corner has one a face
        const at = new Map<string, number>();
        for (let i = 0; i < p.length; i += 3) {
          const key = [p[i], p[i + 1], p[i + 2]].map((v) => Math.round(v * 1e4)).join(',');
          const first = at.get(key);
          if (first === undefined) at.set(key, i);
          else
            expect(
              n[first] * n[i] + n[first + 1] * n[i + 1] + n[first + 2] * n[i + 2],
              `${part.name}: a crease at ${key}`,
            ).toBeGreaterThan(0.999);
        }
        // and curved: most triangles' corners face different ways, where a flat one's all face as it does
        const dot = (a: number, b: number) => n[a] * n[b] + n[a + 1] * n[b + 1] + n[a + 2] * n[b + 2];
        let curved = 0;
        for (let t = 0; t < ix.length; t += 3) {
          const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
          if (Math.min(dot(a, b), dot(b, c), dot(a, c)) < 0.9999) curved++;
        }
        expect(curved / (ix.length / 3), `${part.name}: curved`).toBeGreaterThan(0.5);
      }
    });
  }
});

describe('every colour is a colour', () => {
  it('is in range, with a roughness', () => {
    for (const [, model] of catalogue())
      for (const part of everyPart(model)) {
        expect(part.material).toHaveLength(4);
        for (const c of part.material) expect(c >= 0 && c <= 1, `${model.name} ${part.name}`).toBe(true);
        if (part.pattern) for (const c of part.pattern.second) expect(c >= 0 && c <= 1).toBe(true);
      }
  });

  it('has bright plastic at about four fifths of full saturation as the screen shows it, since toon light shows a colour at full strength', () => {
    // the renderer's linear light, through the screen's curve
    const screen = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
    for (const [name, colour] of Object.entries(PALETTE.plastic)) {
      const [r, g, b] = colour.map(screen);
      const hi = Math.max(r, g, b),
        lo = Math.min(r, g, b);
      expect((hi - lo) / hi, name).toBeGreaterThan(0.7);
      expect((hi - lo) / hi, name).toBeLessThan(0.9);
    }
  });

  it('gives the cup its rim in the measured gold', () => {
    expect(partNamed(cup(2), 'rim').material.slice(0, 3)).toEqual([1.0, 0.766, 0.336]);
  });
});

describe('the cup and the flag', () => {
  for (const r of [1.6, 2.2, 3]) {
    it(`lines a cup of radius ${r} exactly, and rims it`, () => {
      const m = cup(r);
      const liner = partNamed(m, 'liner');
      // the lining's wall stands on the cup's own circle, all the way down
      const wall = points(liner.mesh).filter(([, , z]) => z > -CUP.depth + NEAR);
      expect(wall.length).toBeGreaterThan(0);
      for (const [x, y] of wall) expect(Math.abs(Math.hypot(x, y) - r)).toBeLessThan(NEAR);
      const lb = bounds([liner]);
      expect(lb.min[2]).toBeCloseTo(-CUP.depth, 5);
      expect(lb.max[2]).toBeCloseTo(0, 5);
      const rim = partNamed(m, 'rim');
      for (const [x, y] of points(rim.mesh)) {
        expect(Math.hypot(x, y)).toBeGreaterThan(r - NEAR);
        expect(Math.hypot(x, y)).toBeLessThan(r + CUP.rim + NEAR);
      }
      const rb = bounds([rim]);
      expect(rb.max[0]).toBeCloseTo(r + CUP.rim, 5);
      expect(rb.max[2]).toBeCloseTo(CUP.rimHeight, 5);
    });
  }

  it('leaves a hole in its collar of grass exactly where the cup is', () => {
    const m = collar(9, 2.5);
    const b = bounds(m.parts);
    expect(b.min).toEqual([-4.5, -4.5, 0]);
    expect(b.max).toEqual([4.5, 4.5, 0]);
    const inner = Math.min(...points(m.parts[0].mesh).map(([x, y]) => Math.hypot(x, y)));
    expect(inner).toBeCloseTo(2.5, 5);
    expect(() => collar(3, 2)).toThrow();
    // one tile of grass holds a cup narrower than the tile: the game's own
    expect(() => collar(3, 1.45)).not.toThrow();
  });

  it('turns the cup’s lining on the very polygon the grass is cut to, from the east, counter-clockwise', () => {
    for (const radius of [1.45, 1.9, 3]) {
      const ring = cupRing(radius);
      expect(ring).toHaveLength(CUP.sides);
      ring.forEach(([x, y], i) => {
        expect(Math.hypot(x, y), `corner ${i} of ${radius}`).toBeCloseTo(radius, 12);
        expect(Math.atan2(y, x) + (y < 0 ? Math.PI * 2 : 0), `its angle`).toBeCloseTo(
          (i / CUP.sides) * Math.PI * 2,
          12,
        );
      });
      // the lining's top, where it meets the grass: a corner of the lining at every corner of the ring, and none besides
      const top = points(partNamed(cup(radius), 'liner').mesh).filter(([, , z]) => Math.abs(z) < 1e-9);
      for (const [x, y] of ring)
        expect(
          top.some((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-5),
          `${x},${y}`,
        ).toBe(true);
      for (const [x, y] of top)
        expect(
          ring.some(([a, b]) => Math.hypot(a - x, b - y) < 1e-5),
          `${x},${y}`,
        ).toBe(true);
    }
  });

  it('is cut by `wideCollar` where a cup is wider than its tile, to the same ring, and `collar` refuses what it cannot hold', () => {
    expect(() => collar(3, 1.9)).toThrow(/cannot hold a cup/);
    const m = wideCollar(3, 1.9);
    const b = bounds(m.parts);
    expect(b.min.slice(0, 2)).toEqual([-1.5, -1.5]);
    expect(b.max.slice(0, 2)).toEqual([1.5, 1.5]);
    expect(b.min[2]).toBe(0);
    // what the square leaves of the mouth: the square's grass by the sum of its triangles, each facing up, and never over the mouth
    const mesh = partNamed(m, 'collar').mesh;
    const ring = cupRing(1.9);
    let covered = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, c, d] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
      const p = mesh.positions;
      const z = (p[c] - p[a]) * (p[d + 1] - p[a + 1]) - (p[d] - p[a]) * (p[c + 1] - p[a + 1]);
      expect(z, `triangle ${t / 3} faces up`).toBeGreaterThan(0);
      covered += z / 2;
      // no corner of it is inside the mouth: one at least as far from the middle as the polygon's own sides
      for (const k of [a, c, d])
        expect(Math.hypot(p[k], p[k + 1])).toBeGreaterThan(1.9 * Math.cos(Math.PI / CUP.sides) - 1e-6);
    }
    // the square less the part of the mouth inside it, which is the mouth less four caps over its edge
    let inside: [number, number][] = [
      [-1.5, -1.5],
      [1.5, -1.5],
      [1.5, 1.5],
      [-1.5, 1.5],
    ];
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      inside = clipLeft(inside, p, q);
    });
    expect(covered).toBeCloseTo(9 - polygonArea(inside), 5);
  });

  it('is the zipped collar’s own grass where the square holds the mouth, a few more triangles for the same ground', () => {
    for (const [side, radius] of [
      [3, 1.45],
      [3, 1.2],
      [9, 3],
    ]) {
      const zipped = partNamed(collar(side, radius), 'collar').mesh;
      const cut = partNamed(wideCollar(side, radius, { pieces: 3 }), 'collar').mesh;
      expect(areaOf(cut), `${side} across, ${radius}`).toBeCloseTo(areaOf(zipped), 4);
    }
  });

  it('lies on the ground that slopes as `collar` does, every point at the ground’s height, facing as it does', () => {
    const height = (x: number, y: number) => 0.15 * x + 0.05 * y;
    const mesh = partNamed(wideCollar(3, 1.9, { height }), 'collar').mesh;
    for (const [x, y, z] of points(mesh)) expect(z, `at ${x},${y}`).toBeCloseTo(height(x, y), 5);
    const k = 1 / Math.hypot(0.15, 0.05, 1);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(mesh.normals[i], 'across').toBeCloseTo(-0.15 * k, 4);
      expect(mesh.normals[i + 1], 'along').toBeCloseTo(-0.05 * k, 4);
      expect(mesh.normals[i + 2], 'up').toBeCloseTo(k, 4);
    }
    // and on level ground it is the level one
    expect(points(partNamed(wideCollar(3, 1.9, { height: () => 0 }), 'collar').mesh)).toEqual(
      points(partNamed(wideCollar(3, 1.9), 'collar').mesh),
    );
  });

  it('leaves no grass where the mouth covers the whole of the square', () => {
    expect(triangles(wideCollar(3, 2.2))).toBe(0);
    expect(triangles(wideCollar(3, 1.9))).toBeGreaterThan(0);
  });

  it('stands the pin to its height from the bottom of the cup, and flies the flag near its top in its colour', () => {
    const m = flag(FLAG_COLOURS.blue, { height: 9 });
    const b = bounds(everyPart(m));
    expect(b.max[2]).toBeCloseTo(9, 5);
    expect(b.min[2]).toBeCloseTo(-CUP.depth, 5);
    const cloth = partNamed(m, 'flag');
    expect(cloth.material.slice(0, 3)).toEqual([...FLAG_COLOURS.blue]);
    expect(bounds([cloth]).min[2]).toBeGreaterThan(9 * 0.6);
    expect(bounds([partNamed(flag(FLAG_COLOURS.red), 'flag')]).max[0]).toBeGreaterThan(2);
    // the pole is banded, so it reads as a pin and not a stick
    expect(partNamed(m, 'pole').pattern?.kind).toBe(PATTERN.bands);
    const tall = flag(FLAG_COLOURS.blue, { height: 12 });
    expect(bounds(everyPart(tall)).max[2]).toBeCloseTo(12, 5);
    expect(partNamed(flag(FLAG_COLOURS.red), 'flag').material).not.toEqual(cloth.material);
  });

  it('flies the rainbow flag in six strips, top to bottom, each its own colour, over the very cloth the plain flag has', () => {
    const plain = flag(FLAG_COLOURS.red),
      rainbow = flag(FLAG_COLOURS.red, { rainbow: true });
    // the plain flag is as it was: three parts, its cloth one, named as the scene finds it
    expect(plain.parts.map((p) => p.name)).toEqual(['pole', 'knob', 'flag']);
    expect(plain.parts.map((p) => p.mesh.indices.length / 3)).toEqual([40, 100, 80]);
    expect(flag(FLAG_COLOURS.red, { rainbow: false }).parts.map((p) => p.mesh.indices.length)).toEqual(
      plain.parts.map((p) => p.mesh.indices.length),
    );
    expect(rainbow.parts.map((p) => p.name)).toEqual(['pole', 'knob', ...RAINBOW.map((_, k) => `flag${k}`)]);
    expect(RAINBOW).toHaveLength(6);
    expect(new Set(RAINBOW.map((c) => c.join())).size, 'six colours').toBe(6);
    // the pole and its knob are the same
    for (const name of ['pole', 'knob']) expect(partNamed(rainbow, name).mesh).toEqual(partNamed(plain, name).mesh);
    const strips = RAINBOW.map((c, k) => {
      const part = partNamed(rainbow, `flag${k}`);
      expect(part.material.slice(0, 3), `strip ${k}`).toEqual([...c]);
      expect(part.pattern, 'matte, no pattern').toBeUndefined();
      return bounds([part]);
    });
    // each below the last, meeting it and not overlapping it, and together the cloth's whole height and length
    // (at the pole, where they are full height: out at the tip the cloth narrows to a point they all share)
    const topAtPole = RAINBOW.map((_, k) =>
      Math.max(
        ...points(partNamed(rainbow, `flag${k}`).mesh)
          .filter(([x]) => x < 0.2)
          .map((p) => p[2]),
      ),
    );
    for (let k = 1; k < 6; k++) {
      expect(topAtPole[k], `strip ${k} under strip ${k - 1}`).toBeLessThan(topAtPole[k - 1]);
    }
    const whole = bounds([partNamed(plain, 'flag')]);
    expect(Math.max(...strips.map((b) => b.max[2]))).toBeCloseTo(whole.max[2], 5);
    expect(Math.min(...strips.map((b) => b.min[2]))).toBeCloseTo(whole.min[2], 5);
    expect(Math.max(...strips.map((b) => b.max[0]))).toBeCloseTo(whole.max[0], 5);
    expect(Math.min(...strips.map((b) => b.min[1]))).toBeCloseTo(whole.min[1], 5);
    expect(Math.max(...strips.map((b) => b.max[1]))).toBeCloseTo(whole.max[1], 5);
    expect(triangles(rainbow)).toBeLessThanOrEqual(BUDGET['rainbow flag']);
  });

  it('sets the tee markers either side of the tee, as far apart as asked', () => {
    for (const spacing of [3, 5]) {
      const m = teeMarkers(spacing, { radius: 0.5 });
      const b = bounds(m.parts);
      expect(b.max[0]).toBeCloseTo(spacing / 2 + 0.5, 5);
      expect(b.min[0]).toBeCloseTo(-spacing / 2 - 0.5, 5);
      expect(b.min[2]).toBeCloseTo(0, 5);
      expect(b.max[2]).toBeCloseTo(0.5, 5);
      // one either side, none in the middle where the ball is
      expect(points(m.parts[0].mesh).every(([x]) => Math.abs(x) > spacing / 2 - 0.5 - NEAR)).toBe(true);
    }
  });
});

describe('a cup on ground that slopes', () => {
  // a green tilting up to the east and a little to the north, as the cup's middle sees it
  const height = (x: number, y: number) => 0.15 * x + 0.05 * y;

  it('lies its collar on the ground, every point of it at the ground’s height, facing up', () => {
    const m = collar(3, 1.45, { height });
    const mesh = partNamed(m, 'collar').mesh;
    for (const [x, y, z] of points(mesh)) expect(z, `at ${x},${y}`).toBeCloseTo(height(x, y), 5);
    // facing straight out of the slope, as the ground's own normal does, so it is lit as the grass round it is
    const k = 1 / Math.hypot(0.15, 0.05, 1);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(mesh.normals[i], 'across').toBeCloseTo(-0.15 * k, 4);
      expect(mesh.normals[i + 1], 'along').toBeCloseTo(-0.05 * k, 4);
      expect(mesh.normals[i + 2], 'up').toBeCloseTo(k, 4);
    }
  });

  it('rims its cup on the ground all round, its lining from there down to its depth, and its floor level', () => {
    const m = cup(1.45, { height });
    for (const [x, y, z] of points(partNamed(m, 'rim').mesh)) {
      const above = z - height(x, y);
      expect(above, `the rim at ${x.toFixed(2)},${y.toFixed(2)}`).toBeGreaterThan(-1e-5);
      expect(above).toBeLessThan(CUP.rimHeight + 1e-5);
    }
    const liner = points(partNamed(m, 'liner').mesh);
    const tops = liner.filter(([, , z]) => z > -CUP.depth + 1e-3);
    for (const [x, y, z] of tops) expect(z, 'its top on the ground').toBeCloseTo(height(x, y), 5);
    const floor = liner.filter(([, , z]) => z <= -CUP.depth + 1e-3);
    expect(floor.length, 'a floor').toBeGreaterThan(0);
    for (const [, , z] of floor) expect(z).toBeCloseTo(-CUP.depth, 6);
  });

  it('lies its rim on the ground shaded as the slope has it, smooth round the bead', () => {
    const m = cup(1.45, { height });
    expect(facets(partNamed(m, 'rim').mesh), 'faceted on the slope').toEqual([]);
    // the top of the bead faces straight out of the slope, as the grass beside it does
    const rim = partNamed(m, 'rim').mesh;
    const k = 1 / Math.hypot(0.15, 0.05, 1);
    let tops = 0;
    for (let i = 0; i < rim.positions.length; i += 3) {
      const [x, y, z] = [rim.positions[i], rim.positions[i + 1], rim.positions[i + 2]];
      if (z - height(x, y) < CUP.rimHeight - 1e-6) continue;
      tops++;
      near([rim.normals[i], rim.normals[i + 1], rim.normals[i + 2]], [-0.15 * k, -0.05 * k, k], 4);
    }
    expect(tops).toBeGreaterThan(0);
  });

  it('cuts its grass to meet the ground’s own corners, a piece of the ground’s a side, so the two meet without a seam', () => {
    for (const pieces of [1, 3]) {
      const mesh = partNamed(collar(3, 1.45, { pieces }), 'collar').mesh;
      const edge = points(mesh).filter(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) > 1.5 - NEAR);
      const want = new Set<string>();
      for (let k = 0; k <= pieces; k++) {
        const s = -1.5 + (3 * k) / pieces;
        for (const [x, y] of [
          [s, -1.5],
          [s, 1.5],
          [-1.5, s],
          [1.5, s],
        ])
          want.add(`${x.toFixed(4)},${y.toFixed(4)}`);
      }
      expect(new Set(edge.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`))).toEqual(want);
    }
    // however it is cut, every piece of it faces up, and together they cover the square but the hole once over
    for (const [side, radius, pieces] of [
      [3, 1.45, 3],
      [3, 1.45, 1],
      [9, 3, 3],
      [6, 1.6, 2],
      [12, 3, 5],
    ]) {
      const mesh = partNamed(collar(side, radius, { pieces }), 'collar').mesh;
      const p = mesh.positions,
        ix = mesh.indices;
      let area = 0;
      for (let t = 0; t < ix.length; t += 3) {
        const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
        const z = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1]);
        expect(z, `${side} across, ${pieces} a side: triangle ${t / 3} faces up`).toBeGreaterThan(0);
        area += z / 2;
      }
      const hole = (CUP.sides / 2) * radius * radius * Math.sin((Math.PI * 2) / CUP.sides);
      expect(area).toBeCloseTo(side * side - hole, 4);
    }
  });

  it('is the flat cup it always was on level ground', () => {
    expect(points(partNamed(cup(1.45, { height: () => 0 }), 'rim').mesh)).toEqual(
      points(partNamed(cup(1.45), 'rim').mesh),
    );
    expect(points(partNamed(collar(3, 1.45, { height: () => 0 }), 'collar').mesh)).toEqual(
      points(partNamed(collar(3, 1.45), 'collar').mesh),
    );
  });
});

describe('the obstacles are drawn to exactly the size the physics gives them', () => {
  for (const [r, h] of [
    [0.8, 1.6],
    [1.5, 1.6],
    [2.5, 2],
  ]) {
    it(`a bumper of radius ${r} and height ${h}`, () => {
      const m = bumper(r, { height: h });
      const b = bounds(m.parts);
      expect(b.min[0]).toBeCloseTo(-r, 5);
      expect(b.max[0]).toBeCloseTo(r, 5);
      expect(b.min[1]).toBeCloseTo(-r, 5);
      expect(b.max[1]).toBeCloseTo(r, 5);
      expect(b.min[2]).toBeCloseTo(0, 5);
      expect(b.max[2]).toBeCloseTo(h, 5);
      // nothing outside the circle, and the sides no further inside it than a few hundredths of the radius
      for (const part of m.parts)
        for (const [x, y] of points(part.mesh)) expect(Math.hypot(x, y)).toBeLessThan(r + NEAR);
      const side = points(partNamed(m, 'band').mesh).map(([x, y]) => Math.hypot(x, y));
      expect(Math.min(...side)).toBeGreaterThan(r - NEAR);
      expect(partNamed(m, 'band').material).not.toEqual(partNamed(m, 'post').material);
    });
  }

  for (const [hx, hy, hz] of [
    [3, 0.6, 0.8],
    [1, 0.2, 0.5],
    [4.5, 1, 1],
  ]) {
    it(`a sliding barrier of half extents ${hx}, ${hy}, ${hz}, centred as its body is`, () => {
      const b = bounds(barrier(hx, hy, hz).parts);
      near(b.min, [-hx, -hy, -hz], 5);
      near(b.max, [hx, hy, hz], 5);
    });
  }

  it('a windmill: blades as long and as thick as asked, turning in front of the door', () => {
    for (const opts of [{}, { gap: 5, bladeLength: 7, bladeThickness: 0.4, bladeWidth: 2 }]) {
      const m = windmill(opts);
      const { gap, bladeLength: L, bladeThickness: t, bladeWidth: w } = m;
      const blades = bounds(m.moving);
      near(blades.min, [-L, -t / 2, -L], 5);
      near(blades.max, [L, t / 2, L], 5);
      // each blade is a box w across and exactly t thick: nothing of the blades is further than w/2 off both of its lines
      for (const part of m.moving) {
        for (const [x, , z] of points(part.mesh)) expect(Math.min(Math.abs(x), Math.abs(z))).toBeLessThan(w / 2 + NEAR);
        const own = bounds([part]);
        expect(own.min[1], part.name).toBeCloseTo(-t / 2, 5);
        expect(own.max[1], part.name).toBeCloseTo(t / 2, 5);
      }
      // the tip of a blade pointing down comes to just above the grass, so it blocks the ball and does not dig
      const tip = m.hub[2] - L;
      expect(tip).toBeGreaterThan(0);
      expect(tip).toBeCloseTo(WINDMILL.tipClearance, 5);
      // the blades turn in front of the tower, clear of its front face and of the door
      const tower = bounds(m.parts.filter((p) => p.name !== 'hub'));
      expect(m.hub[1] + t / 2).toBeLessThan(tower.min[1]);
      // the way through is clear, gap wide, up to the arch's springing; and walled at exactly the gap
      const through = m.parts.filter((p) => p.name !== 'hub' && p.name !== 'roof').flatMap((p) => points(p.mesh));
      for (const [x, , z] of through) if (Math.abs(x) < gap / 2 - NEAR) expect(z).toBeGreaterThan(m.spring - NEAR);
      expect(through.some(([x, , z]) => Math.abs(x - gap / 2) < NEAR && z < NEAR)).toBe(true);
      expect(through.some(([x, , z]) => Math.abs(x + gap / 2) < NEAR && z < NEAR)).toBe(true);
      expect(m.spring).toBeGreaterThan(2);
      // the sides the physics walls in are the tower's own footprint either side of the gap
      expect(m.sides).toHaveLength(2);
      for (const s of m.sides) {
        expect(Math.abs(s.x) - s.hx).toBeCloseTo(gap / 2, 5);
        expect(Math.abs(s.x) + s.hx).toBeCloseTo(tower.max[0], 5);
        expect(s.hy).toBeCloseTo(tower.max[1], 5);
      }
    }
  });

  it('a windmill turns its blades about the axle, which points along the way through, turned with the tower', () => {
    const m = windmill();
    const out = new Float32Array(16);
    const apply = (x: number, y: number, z: number) => [
      out[0] * x + out[4] * y + out[8] * z + out[12],
      out[1] * x + out[5] * y + out[9] * z + out[13],
      out[2] * x + out[6] * y + out[10] * z + out[14],
    ];
    placeBlades(out, 0, 10, 20, 0, 0, m.hub);
    near(apply(0, 0, 0), [10 + m.hub[0], 20 + m.hub[1], m.hub[2]], 5);
    // a quarter turn takes a blade pointing along X to pointing up, anticlockwise as seen from the tee, never out of its plane
    placeBlades(out, 0, 0, 0, 0, Math.PI / 2, m.hub);
    const [x, y, z] = apply(1, 0, 0);
    expect(x - m.hub[0]).toBeCloseTo(0, 5);
    expect(y - m.hub[1]).toBeCloseTo(0, 5);
    expect(z - m.hub[2]).toBeCloseTo(1, 5);
    // the tower turned a quarter about Z turns the axle with it: the blades' own Y now lies along -X
    placeBlades(out, 0, 0, 0, Math.PI / 2, 0, m.hub);
    const [ax, ay, az] = [out[4], out[5], out[6]];
    near([ax, ay, az], [-1, 0, 0], 5);
    near(apply(0, 0, 0), [-m.hub[1], m.hub[0], m.hub[2]], 5);
  });

  for (const [w, h] of [
    [6, 9],
    [3, 3],
    [12, 6],
  ]) {
    it(`water of ${w} by ${h}, well below the grass, in bands from foam to deep, veined`, () => {
      const m = water(w, h);
      expect(m.parts.map((p) => p.name)).toEqual(['foam', 'shallows', 'mid', 'surface']);
      const b = bounds(m.parts);
      // exactly the pond's tiles, and no further: what is seen is what the ball falls into
      expect(b.min[0]).toBeCloseTo(-w / 2, 5);
      expect(b.max[0]).toBeCloseTo(w / 2, 5);
      expect(b.min[1]).toBeCloseTo(-h / 2, 5);
      expect(b.max[1]).toBeCloseTo(h / 2, 5);
      expect(WATER.drop).toBeCloseTo(-WATER_LEVEL, 9);
      expect(b.max[2]).toBeCloseTo(WATER_LEVEL, 5);
      expect(b.min[2]).toBeCloseTo(WATER_LEVEL, 5);
      // each band a step darker than the one outside it
      const l = (name: string) => luminance(partNamed(m, name).material);
      expect(l('foam')).toBeGreaterThan(l('shallows'));
      expect(l('shallows')).toBeGreaterThan(l('mid'));
      expect(l('mid')).toBeGreaterThan(l('surface'));
      // the bands fit together, with no gap and no overlap: their areas are the pond's
      let area = 0;
      for (const part of m.parts) area += areaOf(part.mesh);
      expect(area).toBeCloseTo(w * h, 4);
      // the foam is a thin edge, and the deep water is most of a pond that is big enough for it to be
      const foam = areaOf(partNamed(m, 'foam').mesh);
      expect(foam).toBeCloseTo(w * h - (w - 2 * WATER.foam) * (h - 2 * WATER.foam), 4);
      // rippling, the crests in a lighter blue, and glossy
      const deep = partNamed(m, 'surface');
      expect(deep.pattern?.kind).toBe(PATTERN.ripple);
      expect(luminance(deep.pattern!.second)).toBeGreaterThan(luminance(deep.material));
      expect(deep.material[3]).toBeLessThan(0.2);
    });

    it(`the ripples of water of ${w} by ${h}: one fat ring of unit size, and room for it inside the deeper water`, () => {
      const m = water(w, h);
      expect(m.moving.map((p) => p.name)).toEqual(['ring']);
      const radii = points(m.moving[0].mesh).map(([x, y]) => Math.hypot(x, y));
      // a ring, and not an outline: its inner edge is at about half its outer, so it is a wide band
      expect(Math.max(...radii)).toBeCloseTo(1, 5);
      expect(Math.min(...radii)).toBeGreaterThan(0.45);
      expect(Math.min(...radii)).toBeLessThan(0.7);
      for (const [, , z] of points(m.moving[0].mesh)) expect(z).toBeCloseTo(0, 9);
      // where a ring, or a sparkle, may lie: in from the foam and the shallows, and the biggest a ring may be
      expect(m.free.hx).toBeGreaterThan(0.5);
      expect(m.free.hx).toBeLessThan(w / 2 - WATER.foam);
      expect(m.free.hy).toBeLessThan(h / 2 - WATER.foam);
      expect(m.reach).toBeGreaterThan(0.3);
      expect(m.reach).toBeLessThanOrEqual(Math.min(m.free.hx, m.free.hy) + 1e-9);
      expect(m.reach).toBeLessThanOrEqual(1.1);
    });

    it(`a bunker of ${w} by ${h}, flush with the grass, with a slight lip, speckled`, () => {
      const m = bunker(w, h);
      const b = bounds(m.parts);
      expect(b.min[0]).toBeCloseTo(-w / 2, 5);
      expect(b.max[0]).toBeCloseTo(w / 2, 5);
      expect(b.min[1]).toBeCloseTo(-h / 2, 5);
      expect(b.max[1]).toBeCloseTo(h / 2, 5);
      expect(b.min[2]).toBeCloseTo(0, 5);
      expect(b.max[2]).toBeCloseTo(BUNKER.lip, 5);
      expect(BUNKER.lip).toBeLessThan(0.2);
      expect(partNamed(m, 'sand').pattern?.kind).toBe(PATTERN.speckle);
      expect(partNamed(m, 'sand').material[3]).toBeGreaterThan(0.8);
    });

    it(`a conveyor of ${w} by ${h}, its chevrons pointing up the belt and on it however far they are moved`, () => {
      const m = conveyor(w, h);
      const b = bounds(m.parts);
      expect(b.min[0]).toBeCloseTo(-w / 2, 5);
      expect(b.max[0]).toBeCloseTo(w / 2, 5);
      expect(b.min[1]).toBeCloseTo(-h / 2, 5);
      expect(b.max[1]).toBeCloseTo(h / 2, 5);
      const c = bounds(m.moving);
      expect(c.min[0]).toBeGreaterThan(-w / 2);
      expect(c.max[0]).toBeLessThan(w / 2);
      expect(c.min[1]).toBeGreaterThan(-h / 2);
      // moved on by up to a whole spacing, as the game will to run them, they are still on the belt
      expect(c.max[1] + m.spacing).toBeLessThan(h / 2 + NEAR);
      // a chevron's point is ahead of its wings: the belt's middle is further up it than its edges
      const pts = points(m.moving[0].mesh);
      const first = pts.filter(([, y]) => y < c.min[1] + m.spacing * 0.9);
      const middle = Math.max(...first.filter(([x]) => Math.abs(x) < NEAR).map(([, y]) => y));
      const wing = Math.max(...first.filter(([x]) => Math.abs(x) > c.max[0] - NEAR).map(([, y]) => y));
      expect(middle).toBeGreaterThan(wing);
    });
  }
});

describe('the decoration', () => {
  it('flowers bloom in the colour asked', () => {
    for (const c of FLOWER_COLOURS) expect(partNamed(flowers(c), 'petals').material.slice(0, 3)).toEqual([...c]);
    const b = bounds(flowers(FLOWER_COLOURS[1]).parts);
    expect(b.min[2]).toBeGreaterThanOrEqual(-NEAR);
    // the blooms stand on stems, high above the leaves' mound, as the grass they stand in is long
    expect(b.max[2]).toBeLessThan(3.2);
  });

  it('flowers hold every bloom above the blades of the rough they stand in, as many as are asked for, however small they are placed', () => {
    // three blades in four are shorter than this: the canopy the blooms must clear
    const canopy = KINDS[ROUGH].height * (1 + (KINDS[ROUGH].heightSpread ?? 0.3) / 2);
    for (const count of [3, 5])
      for (const seed of [1, 2, 11, 12, 13]) {
        const petals = partNamed(flowers(FLOWER_COLOURS[0], { seed, count }), 'petals').mesh;
        // each bloom's top: the one point of it that faces straight up
        const tops: number[] = [];
        for (let i = 0; i < petals.normals.length; i += 3)
          if (petals.normals[i + 2] > 0.999) tops.push(petals.positions[i + 2]);
        expect(tops.length, 'a top to every bloom').toBe(count);
        // placed at the smallest scale a scattered clump is: 0.8 of its size
        for (const z of tops) expect(z * SCALE.least, 'a bloom lost in the grass').toBeGreaterThan(canopy);
      }
  });

  it('bunting hangs between two posts as far apart as asked, the longer the more pennants', () => {
    for (const length of [6, 12, 20]) {
      const m = bunting(length);
      const posts = partNamed(m, 'posts');
      const pb = bounds([posts]);
      expect((pb.min[0] + pb.max[0]) / 2).toBeCloseTo(0, 5);
      const r = (pb.max[1] - pb.min[1]) / 2;
      expect(pb.max[0]).toBeCloseTo(length / 2 + r, 5);
      const pennants = m.parts.filter((p) => p.name.startsWith('pennants'));
      expect(pennants.length).toBeGreaterThan(1);
      for (const p of pennants) {
        const b = bounds([p]);
        expect(b.min[0]).toBeGreaterThan(-length / 2);
        expect(b.max[0]).toBeLessThan(length / 2);
      }
    }
    const pennants = (m: Model) =>
      m.parts.filter((p) => p.name.startsWith('pennants')).reduce((n, p) => n + p.mesh.indices.length, 0);
    expect(pennants(bunting(20))).toBeGreaterThan(pennants(bunting(12)));
    expect(pennants(bunting(12))).toBeGreaterThan(pennants(bunting(6)));
  });

  it('a fence section is as long as asked', () => {
    for (const length of [3, 6, 9]) {
      const b = bounds(fence(length).parts);
      expect(b.min[0]).toBeCloseTo(-length / 2, 5);
      expect(b.max[0]).toBeCloseTo(length / 2, 5);
      expect(b.min[2]).toBeCloseTo(0, 5);
      expect(b.max[2]).toBeCloseTo(1.4, 5);
    }
    expect(triangles(fence(9))).toBeGreaterThan(triangles(fence(3)));
  });
});

describe('the golf tree and the stake', () => {
  it('a golf tree stands on the ground to the tip the physics gives it, with its canopy off the ground at the base it gives', () => {
    for (const seed of [1, 2, 3, 4]) {
      const m = golfTree(TREE, { seed });
      const all = bounds(m.parts);
      const leaves = bounds([partNamed(m, 'leaves')]);
      expect(all.min[2]).toBeCloseTo(0, 5);
      expect(all.max[2]).toBeCloseTo(TREE.apex, 5);
      expect(leaves.min[2], 'the canopy’s underside is at the base').toBeCloseTo(TREE.base, 5);
      // as wide at its base as the tree says, to a twentieth, at its corners (it is faceted, so across its flats it is
      // narrower), and centred on its trunk
      const wide = Math.max(...points(partNamed(m, 'leaves').mesh).map((q) => Math.hypot(q[0], q[1])));
      expect(wide).toBeGreaterThan(TREE.radius * 0.9);
      expect(wide).toBeLessThan(TREE.radius * 1.02);
      for (const a of [0, 1]) expect(Math.abs(leaves.max[a] + leaves.min[a]) / 2).toBeLessThan(0.05 * TREE.radius);
      // the trunk is as wide as the physics' post and goes up into the canopy
      const trunk = bounds([partNamed(m, 'trunk')]);
      expect((trunk.max[0] - trunk.min[0]) / 2).toBeGreaterThan(TREE.trunk * 0.9);
      expect((trunk.max[0] - trunk.min[0]) / 2).toBeLessThan(TREE.trunk * 1.5);
      expect(trunk.max[2]).toBeGreaterThan(TREE.base);
      expect(trunk.max[2]).toBeLessThan(TREE.apex - 4);
    }
  });

  it('a golf tree’s leaves are all inside the cone the game tests a ball against, which is a ball’s radius bigger: no ball is seen in a branch', () => {
    const cone = treeCone(0, 0, 0);
    const m = golfTree(TREE);
    for (const [x, y, z] of points(partNamed(m, 'leaves').mesh))
      expect(
        insideCanopy(cone, [x, y, z], KIND_RADIUS[BALL]),
        `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`,
      ).toBeGreaterThan(0);
    // and it is not a much bigger cone than the tree: some of the leaves' corners reach close to the physics' own cone,
    // which a ball's surface meets (a faceted cone with its corners on that cone is exactly a ball's radius inside the
    // bigger one, so it is the physics' own that the corners are held to)
    let nearest = Infinity;
    for (const [x, y, z] of points(partNamed(m, 'leaves').mesh)) {
      const d = insideCanopy(cone, [x, y, z], 0);
      if (d > 0) nearest = Math.min(nearest, d);
    }
    expect(nearest).toBeLessThan(0.5);
  });

  it('is a different tree for each seed and the same for the same', () => {
    const a = golfTree(TREE, { seed: 1 }),
      b = golfTree(TREE, { seed: 2 });
    expect(Array.from(partNamed(a, 'leaves').mesh.positions)).not.toEqual(
      Array.from(partNamed(b, 'leaves').mesh.positions),
    );
    expect(Array.from(partNamed(golfTree(TREE, { seed: 1 }), 'leaves').mesh.positions)).toEqual(
      Array.from(partNamed(a, 'leaves').mesh.positions),
    );
  });

  it('a stake is as tall as it is asked, standing on the ground, white with a red cap at the top', () => {
    for (const height of [1.2, 1.8, 2.6]) {
      const m = stake({ height });
      const b = bounds(m.parts);
      expect(b.min[2]).toBeCloseTo(0, 5);
      expect(b.max[2]).toBeGreaterThan(height * 0.9);
      expect(b.max[2]).toBeLessThan(height * 1.15);
      const post = partNamed(m, 'post'),
        cap = partNamed(m, 'cap');
      const light = (p: Part) => p.material[0] + p.material[1] + p.material[2];
      expect(light(post)).toBeGreaterThan(light(cap));
      // the cap sits on the top of the post and stands over it
      expect(bounds([cap]).max[2]).toBeGreaterThan(bounds([post]).max[2]);
      expect(bounds([cap]).min[2]).toBeGreaterThan(bounds([post]).max[2] * 0.6);
      // slim: a stake, and not a post
      expect(b.max[0] - b.min[0], 'slim: less than a ball’s width').toBeLessThan(2 * KIND_RADIUS[BALL] * 0.4);
    }
  });
});

describe('the arrow that shows which way a green leans', () => {
  it('lies flat on the green, a unit long and pointing along +x, so the scene turns and scales it to the slope', () => {
    const m = breakArrow();
    const b = bounds(m.parts);
    expect(b.min[0]).toBeCloseTo(-0.5, 5);
    expect(b.max[0]).toBeCloseTo(0.5, 5);
    // symmetric about its line, and flat: no thickness to stand up off the grass
    expect(b.min[1]).toBeCloseTo(-b.max[1], 5);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeCloseTo(0, 5);
    // every face looks straight up, so the toon light falls on it as it falls on the green
    const n = partNamed(m, 'arrow').mesh.normals;
    for (let i = 0; i < n.length; i += 3) near([n[i], n[i + 1], n[i + 2]], [0, 0, 1], 5);
  });

  it('is thin, with a head wider than its shaft and a point at the front: an arrow, and not a sign', () => {
    const m = breakArrow();
    const pts = points(partNamed(m, 'arrow').mesh);
    const widthAt = (x: number) =>
      Math.max(0, ...pts.filter((p) => Math.abs(p[0] - x) < 1e-6).map((p) => Math.abs(p[1])));
    // the shaft's half width at its middle, the head's at its base, and nothing at the tip
    const shaft = widthAt(-0.5),
      tip = widthAt(0.5);
    const head = Math.max(...pts.map((p) => Math.abs(p[1])));
    expect(tip).toBeLessThan(1e-6);
    expect(head).toBeGreaterThan(shaft * 2);
    // a full arrow, a yard and a half long, is under a ball's width across the shaft, and under a yard across the head
    expect(2 * shaft * 1.5).toBeLessThan(2 * KIND_RADIUS[BALL] * 0.5);
    expect(2 * head * 1.5).toBeLessThan(1);
  });

  it('is one part in one colour that is neither the green’s nor the ball’s, and a head share changes the head', () => {
    const m = breakArrow();
    expect(m.parts.length).toBe(1);
    expect(m.moving.length).toBe(0);
    const [r, g, bl] = partNamed(m, 'arrow').material;
    // not the cream of the ball and the aim's dots, which the eye would take it for
    expect(r + g + bl).toBeLessThan(PALETTE.cream[0] + PALETTE.cream[1] + PALETTE.cream[2]);
    // the head's base is a `headShare` of the length back from the tip
    const base = (share: number) => {
      const pts = points(partNamed(breakArrow({ headShare: share }), 'arrow').mesh);
      const wideY = Math.max(...pts.map((p) => Math.abs(p[1])));
      return Math.min(...pts.filter((p) => Math.abs(Math.abs(p[1]) - wideY) < 1e-6).map((p) => p[0]));
    };
    expect(base(0.5)).toBeCloseTo(0, 5);
    expect(base(0.2)).toBeCloseTo(0.3, 5);
    expect(triangles(m)).toBeGreaterThan(0);
  });
});

describe('every model keeps to its triangle budget', () => {
  it('each at the largest the game will ask for', () => {
    const at: [keyof typeof BUDGET, Model][] = [
      ['cup', cup(3)],
      ['collar', collar(12, 3)],
      ['wide collar', wideCollar(3, 1.5)],
      ['flag', flag(FLAG_COLOURS.red, { height: 12 })],
      ['rainbow flag', flag(FLAG_COLOURS.red, { height: 12, rainbow: true })],
      ['teeMarkers', teeMarkers(6)],
      ['ball', golfBall(KIND_RADIUS[BALL])],
      ['bumper', bumper(3, { height: 2 })],
      ['barrier', barrier(6, 1, 1)],
      ['windmill', windmill({ gap: 6, bladeLength: 8 })],
      ['water', water(15, 15)],
      ['bunker', bunker(15, 15)],
      ['conveyor', conveyor(6, 24)],
      // a bed at the foot of the rail, which has the most blooms the game asks for
      ['flowers', flowers(FLOWER_COLOURS[2], { seed: 9, count: 5 })],
      ['bunting', bunting(24)],
      ['fence', fence(12)],
      ['golfTree', golfTree(TREE, { seed: 9 })],
      ['stake', stake({ height: 2.4, radius: 0.3 })],
      ['breakArrow', breakArrow()],
      ['broadleaf', broadleaf({ height: 12, seed: 9 })],
      ['conifer', conifer({ height: 14, seed: 9 })],
      ['boulder', boulder(3, { seed: 9 })],
      ['bush', bush(3, { seed: 9 })],
      ['fern', fern(3, { seed: 9 })],
      ['cloud', cloud({ seed: 9 })],
      ['bank stone', bankStone(2)],
      ['title', titleModel(titleTrace)],
    ];
    for (const [name, m] of at) expect(triangles(m), name).toBeLessThanOrEqual(BUDGET[name]);
  });

  it('a green’s arrows, a hundred and fifty of them, are a few hundred triangles', () => {
    expect(triangles(breakArrow()) * 150).toBeLessThan(BUDGET.golfHole / 50);
  });

  it('a golf hole, a hundred trees and two hundred stakes and all, is under 60,000', () => {
    expect(triangles(golfTree(TREE)) * 100 + triangles(stake()) * 200).toBeLessThan(BUDGET.golfHole);
  });

  it('a whole hole, forty decorations and everything on it, is under 20,000', () => {
    const decor: Model[] = [];
    for (let k = 0; k < 40; k++) {
      const pick = k % 8;
      if (pick === 0) decor.push(broadleaf({ seed: k, height: 8 }));
      else if (pick === 1) decor.push(conifer({ seed: k, height: 10 }));
      else if (pick === 2) decor.push(bush(1.8, { seed: k }));
      else if (pick === 3) decor.push(flowers(FLOWER_COLOURS[k % FLOWER_COLOURS.length], { seed: k }));
      else if (pick === 4) decor.push(boulder(1.5, { seed: k }));
      else if (pick === 5) decor.push(bunting(12, { seed: k }));
      else if (pick === 6) decor.push(fence(6));
      else decor.push(flowers(FLOWER_COLOURS[(k + 1) % FLOWER_COLOURS.length], { seed: k }));
    }
    const course = [
      cup(3),
      collar(9, 3),
      flag(FLAG_COLOURS.red),
      teeMarkers(4),
      golfBall(KIND_RADIUS[BALL]),
      bumper(1.2),
      barrier(3, 0.6, 0.8),
      windmill(),
      water(6, 9),
      bunker(9, 6),
      conveyor(6, 12),
    ];
    const total = [...decor, ...course].reduce((n, m) => n + triangles(m), 0);
    expect(total).toBeLessThan(BUDGET.hole);
    expect(BUDGET.hole).toBeLessThanOrEqual(20000);
  });
});

describe('the low-poly scenery', () => {
  const MODELS: [string, (seed: number) => Model][] = [
    ['broadleaf', (seed) => broadleaf({ height: 7, seed })],
    ['conifer', (seed) => conifer({ height: 8, seed })],
    ['boulder', (seed) => boulder(1.4, { seed })],
    ['bush', (seed) => bush(1.8, { seed })],
    ['fern', (seed) => fern(2.2, { seed })],
    ['cloud', (seed) => cloud({ seed })],
  ];

  it('is cut with flat faces: every corner of every triangle faces exactly as its triangle does', () => {
    for (const [name, make] of MODELS)
      for (const part of make(3).parts) {
        const { normals: n, indices: ix } = part.mesh;
        for (let t = 0; t < ix.length; t += 3) {
          const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
          for (const [i, j] of [
            [a, b],
            [b, c],
          ])
            expect(n[i] * n[j] + n[i + 1] * n[j + 1] + n[i + 2] * n[j + 2], `${name} ${part.name}`).toBeGreaterThan(
              0.9999,
            );
        }
      }
  });

  it('is the same for a seed and another for another seed, within its budget for every seed', () => {
    for (const [name, make] of MODELS) {
      const flat = (m: Model) => m.parts.flatMap((q) => Array.from(q.mesh.positions));
      expect(flat(make(5)), name).toEqual(flat(make(5)));
      expect(flat(make(5)), name).not.toEqual(flat(make(6)));
      for (let seed = 0; seed < 20; seed++)
        expect(triangles(make(seed)), name).toBeLessThanOrEqual(BUDGET[name as keyof typeof BUDGET]);
    }
  });

  it('a broadleaf is as tall as asked, its canopy clear of the ground on a trunk that goes up into it, lighter at its crown', () => {
    for (const height of [5, 7, 12]) {
      const m = broadleaf({ height, seed: height });
      const all = bounds(m.parts);
      expect(all.max[2]).toBeCloseTo(height, 5);
      expect(all.min[2]).toBeCloseTo(0, 5);
      const canopy = bounds([partNamed(m, 'leaves'), partNamed(m, 'crown')]);
      expect(canopy.min[2]).toBeGreaterThan(0.3 * height);
      expect(bounds([partNamed(m, 'trunk')]).max[2]).toBeGreaterThan(canopy.min[2]);
      const sum = (c: readonly number[]) => c[0] + c[1] + c[2];
      expect(sum(partNamed(m, 'crown').material)).toBeGreaterThan(sum(partNamed(m, 'leaves').material));
    }
  });

  it('a conifer is as tall as asked, its tiers narrowing as they rise, standing on its trunk', () => {
    const m = conifer({ height: 10, seed: 2 });
    const all = bounds(m.parts);
    expect(all.max[2]).toBeCloseTo(10, 5);
    expect(all.min[2]).toBeCloseTo(0, 5);
    const leaves = points(partNamed(m, 'leaves').mesh);
    const wide = (lo: number, hi: number) =>
      Math.max(...leaves.filter((q) => q[2] >= lo && q[2] < hi).map((q) => Math.hypot(q[0], q[1])));
    expect(wide(1.5, 3)).toBeGreaterThan(wide(6, 9));
  });

  it('a boulder sits in the ground, no wider than asked, and lower than it is wide', () => {
    for (const size of [0.6, 1.4, 3]) {
      const b = bounds(boulder(size, { seed: 7 }).parts);
      expect(b.min[2]).toBeLessThan(0);
      expect(b.min[2]).toBeGreaterThan(-0.3 * size);
      expect(Math.max(-b.min[0], b.max[0], -b.min[1], b.max[1])).toBeLessThanOrEqual(size * 1.0001);
      expect(b.max[2]).toBeLessThan(size);
    }
  });

  it('a fern and a bush stand on the ground, and a cloud is a unit across, flat underneath', () => {
    for (const m of [fern(2.2), bush(1.8)]) expect(bounds(m.parts).min[2]).toBeGreaterThan(-0.5);
    expect(bounds(fern(2.2).parts).max[2]).toBeLessThanOrEqual(2.2);
    const c = bounds(cloud().parts);
    expect(c.max[0] - c.min[0]).toBeGreaterThan(1.4);
    expect(c.max[0] - c.min[0]).toBeLessThan(2.6);
    expect(c.max[2]).toBeGreaterThan(-c.min[2]);
  });

  it('a golf tree is cut so too, a faceted cone and not a lathe', () => {
    const m = golfTree(TREE);
    expect(m.name).toBe('golf tree');
    const { normals: n, indices: ix } = partNamed(m, 'leaves').mesh;
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b] = [ix[t] * 3, ix[t + 1] * 3];
      expect(n[a] * n[b] + n[a + 1] * n[b + 1] + n[a + 2] * n[b + 2]).toBeGreaterThan(0.9999);
    }
  });
});

describe('a part becomes a group the renderer draws', () => {
  it('takes its colour and roughness for the whole group, with no pattern', () => {
    const post = partNamed(bumper(1), 'post');
    const matrices = new Float32Array(3 * 16);
    const g = group(post, matrices);
    expect(g.mesh).toBe(post.mesh);
    expect(g.matrices).toBe(matrices);
    expect(g.albedo).toEqual(post.material.slice(0, 3));
    expect(g.roughness).toBe(post.material[3]);
    expect(g.patterns).toBeUndefined();
  });

  it('writes its pattern for every placement, each with a seed of its own', () => {
    const sand = partNamed(bunker(6, 6), 'sand');
    const g = group(sand, new Float32Array(4 * 16), 2);
    expect(g.count).toBe(2);
    const p = g.patterns!;
    expect(p.length).toBe(4 * PATTERN_STRIDE);
    for (let k = 0; k < 4; k++) {
      const at = k * PATTERN_STRIDE;
      expect(p[at]).toBe(PATTERN.speckle);
      expect(p[at + 1]).toBeCloseTo(sand.pattern!.scale, 6);
      near(Array.from(p.subarray(at + 4, at + 7)), sand.pattern!.second, 6);
    }
    expect(p[2]).not.toBe(p[PATTERN_STRIDE + 2]);
  });
});

import { KICKER } from '../src/arena';
import { kicker } from '../src/models';

describe('the kicker is drawn to exactly the footprint the physics gives it', () => {
  const m = kicker(KICKER.radius, { height: KICKER.height });

  it('is as wide as the kicker’s circle and as tall as it stands, and never wider', () => {
    const b = bounds(m.parts);
    near(b.min, [-KICKER.radius, -KICKER.radius, 0], 5);
    near(b.max, [KICKER.radius, KICKER.radius, KICKER.height], 5);
    for (const part of m.parts)
      for (const [x, y] of points(part.mesh)) expect(Math.hypot(x, y)).toBeLessThan(KICKER.radius + NEAR);
  });

  it('meets the circle at the height of the ball’s middle, where the ball meets it', () => {
    // the ball's middle is a ball's radius above the grass, and the widest of the cap is there or near it
    const widest = points(partNamed(m, 'cap').mesh).filter(([x, y]) => Math.hypot(x, y) > KICKER.radius - 0.02);
    expect(widest.length).toBeGreaterThan(0);
    for (const [, , z] of widest) expect(Math.abs(z - KIND_RADIUS[BALL])).toBeLessThan(0.1);
  });

  it('has unit normals, faces wound the way they face, and a closed cap', () => {
    for (const part of m.parts) {
      const { positions: p, normals: n, indices: ix } = part.mesh;
      for (let i = 0; i < n.length; i += 3)
        expect(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1), `${part.name}: unit normal`).toBeLessThan(1e-5);
      for (let t = 0; t < ix.length; t += 3) {
        const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const area = Math.hypot(g[0], g[1], g[2]);
        expect(area, `${part.name}: triangle ${t / 3} has an area`).toBeGreaterThan(1e-9);
        for (const k of [a, b, c])
          expect(
            (g[0] * n[k] + g[1] * n[k + 1] + g[2] * n[k + 2]) / area,
            `${part.name}: wound as it faces`,
          ).toBeGreaterThan(0.4);
      }
    }
    expect(volume(partNamed(m, 'cap').mesh), 'closed and facing out').toBeGreaterThan(0);
  });

  it('is its own shape, three parts in three colours, not a post with another name', () => {
    expect(m.parts.map((p) => p.name)).toEqual(['foot', 'stem', 'cap']);
    const colours = new Set(m.parts.map((p) => p.material.join()));
    expect(colours.size).toBe(3);
    expect(partNamed(m, 'cap').material).not.toEqual(partNamed(bumper(1), 'post').material);
  });

  it('stays within its triangle budget, and at any size it is asked for', () => {
    expect(triangles(m)).toBeLessThanOrEqual(BUDGET.kicker);
    expect(triangles(kicker(2.5, { height: 2 }))).toBeLessThanOrEqual(BUDGET.kicker);
    expect(BUDGET.kicker).toBeLessThanOrEqual(420);
  });
});

describe('a flipper', () => {
  for (const [length, hy, hz] of [
    [6, 0.6, 0.8],
    [3, 0.6, 0.8],
    [9, 0.6, 0.8],
  ]) {
    it(`an arm ${length} long of half extents ${hy} and ${hz}, from the end it turns on, no wider than the physics' box`, () => {
      const m = flipper(length, hy, hz);
      const arm = bounds([partNamed(m, 'arm')]);
      near(arm.min, [0, -hy, -hz], 5);
      near(arm.max, [length, hy, hz], 5);
      // the hub is inside the arm's width and along it, and stands a hair over its top
      const hub = bounds([partNamed(m, 'hub')]);
      expect(hub.min[0]).toBeGreaterThanOrEqual(0);
      expect(hub.max[0]).toBeLessThanOrEqual(length);
      expect(Math.max(-hub.min[1], hub.max[1])).toBeLessThanOrEqual(hy + 1e-6);
      expect(hub.max[2]).toBeGreaterThan(hz);
      expect(hub.max[2]).toBeLessThan(hz + 0.3);
    });
  }

  it('is in two parts in two colours, inside its triangle budget, and its faces are whole', () => {
    const m = flipper(6, 0.6, 0.8);
    expect(m.parts.map((p) => p.name)).toEqual(['arm', 'hub']);
    expect(partNamed(m, 'arm').material).not.toEqual(partNamed(m, 'hub').material);
    expect(triangles(m)).toBeGreaterThan(0);
    expect(triangles(m)).toBeLessThanOrEqual(BUDGET.flipper);
    expect(triangles(flipper(9, 1, 1))).toBeLessThanOrEqual(BUDGET.flipper);
  });
});

import { waterBed, water as pondOf, WATER as WATER_BANDS } from '../src/models/obstacles';
import { Scene } from '../src/scene';
import { layoutOf as layoutFrom } from '../src/arena';
import { PALETTE as WATER_PALETTE } from '../src/models/palette';

describe('a water bed is one sheet over tiles of any shape, banded only where it meets the grass', () => {
  // an L of five tiles: three across the south and one more above the west end, plus one above that
  const L: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
  ];
  const tile = 3;

  it('fills exactly its tiles at the water’s level, in the pond’s four bands', () => {
    const m = waterBed(L, tile);
    expect(m.parts.map((p) => p.name)).toEqual(['foam', 'shallows', 'mid', 'surface']);
    const b = bounds(m.parts);
    near(b.min, [0, 0, WATER_LEVEL], 5);
    near(b.max, [3 * tile, 3 * tile, WATER_LEVEL], 5);
    let area = 0;
    for (const part of m.parts) area += areaOf(part.mesh);
    expect(area).toBeCloseTo(L.length * tile * tile, 4);
    for (const part of m.parts)
      for (let i = 0; i < part.mesh.normals.length; i += 3) expect(part.mesh.normals[i + 2]).toBeCloseTo(1, 6);
  });

  it('has foam along its outside edges only, turned round the corners, and none across a join', () => {
    const m = waterBed(L, tile);
    const foam = partNamed(m, 'foam').mesh;
    // one quad a tile side that meets grass: the L, three tiles each way, has twelve such sides
    expect(foam.indices.length / 6).toBe(12);
    // the band is a frame of its width along the whole outside, mitred at its five convex corners, where the two sides'
    // bands share a square, and square at the concave one, where they only meet
    const f = WATER_BANDS.foam;
    expect(areaOf(foam)).toBeCloseTo(f * 12 * tile - 5 * f * f, 4);
    // the deep water is one piece that reaches into every tile: at least one of its corners lies in each
    const deep = points(partNamed(m, 'surface').mesh);
    for (const [c, r] of L)
      expect(
        deep.some(
          ([x, y]) =>
            x >= c * tile - 1e-9 && x <= (c + 1) * tile + 1e-9 && y >= r * tile - 1e-9 && y <= (r + 1) * tile + 1e-9,
        ),
        `tile ${c},${r} has deep water`,
      ).toBe(true);
  });

  it('is the pond model, band for band, on one tile, so a lone tile looks as it did', () => {
    const bed = waterBed([[0, 0]], tile);
    const pond = pondOf(tile, tile);
    for (const name of ['foam', 'shallows', 'mid', 'surface'])
      expect(areaOf(partNamed(bed, name).mesh), name).toBeCloseTo(areaOf(partNamed(pond, name).mesh), 5);
  });

  it('stays within its triangle budget', () => {
    expect(triangles(waterBed(L, tile))).toBeLessThanOrEqual(BUDGET['water bed']);
  });

  it('is what the scene draws for a hole’s water: one set of bands, however many rectangles the water is', () => {
    const map = ['#######', '#.....#', '#.~~~.#', '#.~...#', '#.~.C.#', '#..T..#', '#######'];
    const groups = new Scene().static(layoutFrom(map), 'bed test');
    const withAlbedo = (c: readonly number[]) =>
      groups.filter((g) => {
        const a = (g as { albedo?: number[] }).albedo;
        return a && Math.abs(a[0] - c[0]) < 1e-6 && Math.abs(a[1] - c[1]) < 1e-6 && Math.abs(a[2] - c[2]) < 1e-6;
      });
    // open water is the pond's smooth shape (`waterdraw.ts`), in its own foam
    expect(withAlbedo(BAND_COLOURS[0]).length).toBe(1);
    // and the rippling look, behind `OCEAN_ON`, is the bed of tiles it was, in the palette's foam
    OCEAN_ON.minigolf = false;
    try {
      const rippling = new Scene().static(layoutFrom(map), 'bed test');
      const [fr, fg, fb] = WATER_PALETTE.waterFoam;
      expect(
        rippling.filter((g) => {
          const a = (g as { albedo?: number[] }).albedo;
          return a && Math.abs(a[0] - fr) < 1e-6 && Math.abs(a[1] - fg) < 1e-6 && Math.abs(a[2] - fb) < 1e-6;
        }).length,
      ).toBe(1);
    } finally {
      OCEAN_ON.minigolf = true;
    }
  });
});

import { OCEAN_ON, STREAM, streamBed, stream as streamOf } from '../src/models/obstacles';
import { BAND_COLOURS } from '../src/waterdraw';
import { Obstacles } from '../src/obstacles';

describe('a stream bed is one channel over the tiles of every belt drawn as water, banded only where it meets the grass', () => {
  // two belts side by side, three tiles long
  const pair: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
  ];
  const tile = 3;

  it('fills exactly its tiles a hair above the grass, in the stream’s four bands', () => {
    const m = streamBed(pair, tile);
    expect(m.parts.map((p) => p.name)).toEqual(['bank', 'foam', 'shallows', 'surface']);
    const b = bounds(m.parts);
    near(b.min, [0, 0, STREAM.lift], 5);
    near(b.max, [2 * tile, 3 * tile, STREAM.lift], 5);
    let area = 0;
    for (const part of m.parts) area += areaOf(part.mesh);
    expect(area).toBeCloseTo(pair.length * tile * tile, 4);
  });

  it('has its bank along the outside only: one quad a side that meets grass, and none down the join between the belts', () => {
    const m = streamBed(pair, tile);
    expect(partNamed(m, 'bank').mesh.indices.length / 6).toBe(10);
  });

  it('is the stream model, band for band, on one belt, so a lone stream looks as it did', () => {
    const bed = streamBed(
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      tile,
    );
    const one = streamOf(tile, 4 * tile);
    for (const name of ['bank', 'foam', 'shallows', 'surface'])
      expect(areaOf(partNamed(bed, name).mesh), name).toBeCloseTo(areaOf(partNamed(one, name).mesh), 5);
  });

  it('stays within its triangle budget', () => {
    expect(triangles(streamBed(pair, tile))).toBeLessThanOrEqual(BUDGET['stream bed']);
  });

  it('is what the scene draws for a hole’s streams: one bed for belts that touch', () => {
    const map = ['#######', '#.....#', '#.....#', '#.....#', '#.C...#', '#..T..#', '#######'];
    const obstacles = [
      {
        kind: 'conveyor' as const,
        from: [3, 4] as [number, number],
        to: [3, 1] as [number, number],
        speed: 5,
        look: 'water' as const,
      },
      {
        kind: 'conveyor' as const,
        from: [4, 4] as [number, number],
        to: [4, 1] as [number, number],
        speed: 5,
        look: 'water' as const,
      },
    ];
    const layout = layoutFrom(map);
    const groups = new Scene().static(layout, 'stream bed test', new Obstacles(obstacles, layout));
    const [fr, fg, fb] = WATER_PALETTE.waterFoam;
    const foams = groups.filter((g) => {
      const a = (g as { albedo?: number[] }).albedo;
      return a && Math.abs(a[0] - fr) < 1e-6 && Math.abs(a[1] - fg) < 1e-6 && Math.abs(a[2] - fb) < 1e-6;
    });
    expect(foams.length).toBe(1);
  });
});

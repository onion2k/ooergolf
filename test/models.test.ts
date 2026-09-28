/**
 * The models, held to what the game and its physics will take them to be.
 * Every model is built headless, with no renderer, and read back as numbers:
 * that every face is flat-shaded and wound the way its normal says, that the
 * obstacles are drawn to exactly the size the physics gives them, that a
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
  FLOWER_COLOURS,
  PALETTE,
  PATTERN,
  WATER,
  WINDMILL,
  barrier,
  bounds,
  bumper,
  bunker,
  bunting,
  sandBed,
  collar,
  conveyor,
  cup,
  fence,
  flag,
  flowers,
  group,
  hedge,
  placeBlades,
  rock,
  teeMarkers,
  tree,
  triangles,
  water,
  windmill,
  type Model,
  type Part,
} from '../src/models';

/** How near a figure must be to be the figure: a float's worth, and then some. */
const NEAR = 1e-4;

/** Each of `got` within `digits` decimal places of the same of `want`. */
function near(got: ArrayLike<number>, want: readonly number[], digits: number) {
  expect(got.length).toBe(want.length);
  want.forEach((w, i) => expect(got[i], `[${i}]`).toBeCloseTo(w, digits));
}

/** Every model the game can have, at the ends of the sizes it will try and between. */
function catalogue(): [string, Model][] {
  return [
    ['cup 1.6', cup(1.6)],
    ['cup 3', cup(3)],
    ['collar', collar(9, 3)],
    ['flag', flag(FLAG_COLOURS.red)],
    ['tall flag', flag(FLAG_COLOURS.yellow, { height: 12 })],
    ['tee markers', teeMarkers(4)],
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
    ['round tree', tree('round')],
    ['pine', tree('pine', { height: 10, seed: 3 })],
    ['hedge', hedge(6, 1.5, 1.8)],
    ['flowers', flowers(FLOWER_COLOURS[0])],
    ['rock', rock(1.5)],
    ['bunting', bunting(12)],
    ['fence', fence(6)],
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
    const raised = points(partNamed(m, 'lip').mesh).filter((p) => p[2] > 1e-6);
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
    for (const [x, y, z] of points(partNamed(m, 'lip').mesh)) {
      const above = z - height(x, y);
      expect(above, `at ${x},${y}`).toBeGreaterThan(-1e-5);
      expect(above).toBeLessThan(BUNKER.lip + 1e-5);
    }
    // cut finer, a sand triangle nine times over for every one flat
    expect(partNamed(m, 'sand').mesh.indices.length).toBe(
      partNamed(sandBed(BUNKER_TILES, 3), 'sand').mesh.indices.length * 9,
    );
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
  'shallows',
  'ripples',
  'sand',
  'lip',
  'belt',
  'frame',
  'chevrons',
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

describe('every model is flat-shaded, finite and wound the way its normals face', () => {
  for (const [label, model] of catalogue()) {
    it(label, () => {
      expect(everyPart(model).length).toBeGreaterThan(0);
      for (const part of everyPart(model)) {
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
          // a vertex shared with a face of another slope would carry the wrong normal for one of them
          for (const k of [a, b, c]) {
            const along = (g[0] * n[k] + g[1] * n[k + 1] + g[2] * n[k + 2]) / area;
            expect(along, `${part.name}: triangle ${t / 3} wound as its normal faces`).toBeGreaterThan(0.999);
          }
        }
        if (!OPEN.has(part.name)) expect(volume(part.mesh), `${part.name}: closed and facing out`).toBeGreaterThan(0);
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
    it(`water of ${w} by ${h}, a hair below the grass, its ripples on it`, () => {
      const m = water(w, h);
      const b = bounds(m.parts);
      expect(b.min[0]).toBeCloseTo(-w / 2, 5);
      expect(b.max[0]).toBeCloseTo(w / 2, 5);
      expect(b.min[1]).toBeCloseTo(-h / 2, 5);
      expect(b.max[1]).toBeCloseTo(h / 2, 5);
      expect(b.max[2]).toBeCloseTo(-WATER.drop, 5);
      expect(b.max[2]).toBeLessThan(0);
      const rip = bounds(m.moving);
      expect(rip.min[0]).toBeGreaterThan(-w / 2);
      expect(rip.max[0]).toBeLessThan(w / 2);
      expect(rip.min[1]).toBeGreaterThan(-h / 2);
      expect(rip.max[1]).toBeLessThan(h / 2);
      expect(rip.max[2]).toBeLessThan(0);
      expect(rip.min[2]).toBeGreaterThan(b.max[2]);
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
  for (const kind of ['round', 'pine'] as const) {
    it(`a ${kind} tree stands on the ground to its height, differently for each seed`, () => {
      for (const height of [5, 8, 12]) {
        const m = tree(kind, { height, seed: 1 });
        const b = bounds(m.parts);
        expect(b.min[2]).toBeCloseTo(0, 5);
        expect(b.max[2]).toBeCloseTo(height, 5);
        expect(partNamed(m, 'trunk').material).not.toEqual(partNamed(m, 'leaves').material);
      }
      const a = tree(kind, { seed: 1 }),
        b = tree(kind, { seed: 2 });
      expect(Array.from(partNamed(a, 'leaves').mesh.positions)).not.toEqual(
        Array.from(partNamed(b, 'leaves').mesh.positions),
      );
      expect(Array.from(partNamed(tree(kind, { seed: 1 }), 'leaves').mesh.positions)).toEqual(
        Array.from(partNamed(a, 'leaves').mesh.positions),
      );
    });
  }

  it('a hedge is as long, deep and high as asked, and leafy', () => {
    const b = bounds(hedge(6, 1.5, 1.8).parts);
    near(b.min, [-3, -0.75, 0], 5);
    near(b.max, [3, 0.75, 1.8], 5);
    expect(hedge(6, 1.5, 1.8).parts[0].pattern?.kind).toBe(PATTERN.speckle);
  });

  it('flowers bloom in the colour asked', () => {
    for (const c of FLOWER_COLOURS) expect(partNamed(flowers(c), 'petals').material.slice(0, 3)).toEqual([...c]);
    const b = bounds(flowers(FLOWER_COLOURS[1]).parts);
    expect(b.min[2]).toBeGreaterThanOrEqual(-NEAR);
    expect(b.max[2]).toBeLessThan(2);
  });

  it('a rock sits in the ground, about its size, and is its own shape for its seed', () => {
    const b = bounds(rock(1.5).parts);
    expect(b.max[0] - b.min[0]).toBeGreaterThan(1.5 * 1.4);
    expect(b.max[0] - b.min[0]).toBeLessThan(1.5 * 2.6);
    expect(b.min[2]).toBeLessThan(0);
    expect(b.max[2]).toBeGreaterThan(0.4);
    expect(Array.from(rock(1.5, { seed: 2 }).parts[0].mesh.positions)).not.toEqual(
      Array.from(rock(1.5, { seed: 3 }).parts[0].mesh.positions),
    );
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

describe('every model keeps to its triangle budget', () => {
  it('a tree is under 200, whatever its kind, size and seed', () => {
    expect(BUDGET.tree).toBeLessThanOrEqual(200);
    for (const kind of ['round', 'pine'] as const)
      for (let seed = 0; seed < 20; seed++)
        expect(triangles(tree(kind, { seed, height: 4 + seed / 2 }))).toBeLessThan(BUDGET.tree);
  });

  it('each at the largest the game will ask for', () => {
    const at: [keyof typeof BUDGET, Model][] = [
      ['cup', cup(3)],
      ['collar', collar(12, 3)],
      ['flag', flag(FLAG_COLOURS.red, { height: 12 })],
      ['teeMarkers', teeMarkers(6)],
      ['bumper', bumper(3, { height: 2 })],
      ['barrier', barrier(6, 1, 1)],
      ['windmill', windmill({ gap: 6, bladeLength: 8 })],
      ['water', water(15, 15)],
      ['bunker', bunker(15, 15)],
      ['conveyor', conveyor(6, 24)],
      ['hedge', hedge(9, 1.5, 2)],
      ['flowers', flowers(FLOWER_COLOURS[2], { seed: 9 })],
      ['rock', rock(3)],
      ['bunting', bunting(24)],
      ['fence', fence(12)],
    ];
    for (const [name, m] of at) expect(triangles(m), name).toBeLessThanOrEqual(BUDGET[name]);
  });

  it('a whole hole, forty decorations and everything on it, is under 8,000', () => {
    const decor: Model[] = [];
    for (let k = 0; k < 40; k++) {
      const pick = k % 8;
      if (pick === 0) decor.push(tree('round', { seed: k, height: 8 }));
      else if (pick === 1) decor.push(tree('pine', { seed: k, height: 10 }));
      else if (pick === 2) decor.push(hedge(6, 1.5, 1.8, { seed: k }));
      else if (pick === 3) decor.push(flowers(FLOWER_COLOURS[k % FLOWER_COLOURS.length], { seed: k }));
      else if (pick === 4) decor.push(rock(1.5, { seed: k }));
      else if (pick === 5) decor.push(bunting(12, { seed: k }));
      else if (pick === 6) decor.push(fence(6));
      else decor.push(flowers(FLOWER_COLOURS[(k + 1) % FLOWER_COLOURS.length], { seed: k }));
    }
    const course = [
      cup(3),
      collar(9, 3),
      flag(FLAG_COLOURS.red),
      teeMarkers(4),
      bumper(1.2),
      barrier(3, 0.6, 0.8),
      windmill(),
      water(6, 9),
      bunker(9, 6),
      conveyor(6, 12),
    ];
    const total = [...decor, ...course].reduce((n, m) => n + triangles(m), 0);
    expect(total).toBeLessThan(BUDGET.hole);
    expect(BUDGET.hole).toBeLessThanOrEqual(8000);
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

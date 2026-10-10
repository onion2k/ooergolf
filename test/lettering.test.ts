/**
 * The title's lettering, built from the picture's traced outlines and held to what the game will draw: every face a
 * closed shape with its counters kept (the o, the O and the e are not filled, and the dot of the ! stands apart from its
 * bar), every normal out, the whole of it inside its triangle budget, each letter's own piece of the outline together the
 * outline's whole shape, no gap between those pieces at rest or when each is moved by a squash as it lands, and every
 * colour the one it is named to be. Built headless and read back as numbers: a face wound inside out, a counter filled in
 * or a hairline between two pieces of outline is plain in a picture and easy to lose in a refactor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'artshape-render/mesh/types';
import data from '../src/titletrace.json';
import {
  FACE_GAIN,
  RIM_GAIN,
  TAN_GAIN,
  PIXEL,
  shade,
  titleLetters,
  titleModel,
  type Title,
  type TitlePiece,
  type TraceData,
} from '../src/models/lettering';
import { BUDGET, triangles } from '../src/models';
import type { Part } from '../src/models/part';
import { traceTitle, GROW, EDGE, BANDS } from '../scripts/trace-title.mjs';

const trace: TraceData = data;
/** The title as the page draws it, and with the depth scale off, so that its areas are the picture's and not a layer's. */
const flatTitle = titleLetters(trace, { depthScale: 0 });
const drawn = titleLetters(trace);

type P2 = [number, number];
const pairs = (flat: readonly number[]): P2[] =>
  Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);
const area = (flat: readonly number[]) => {
  const p = pairs(flat);
  return Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;
};
const shapeArea = (s: { outer: number[]; holes: number[][] }) =>
  area(s.outer) - s.holes.reduce((n, h) => n + area(h), 0);
const inside = (p: P2, poly: readonly P2[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (
      poly[i][1] > p[1] !== poly[j][1] > p[1] &&
      p[0] < ((poly[j][0] - poly[i][0]) * (p[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]
    )
      c = !c;
  return c;
};
/** Some point well inside a polygon: the first on a grid over its box that is in it. */
function interior(poly: readonly P2[]): P2 {
  const [xs, ys] = [poly.map((p) => p[0]), poly.map((p) => p[1])];
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let n = 2; n < 40; n++)
    for (let i = 1; i < n; i++)
      for (let j = 1; j < n; j++) {
        const p: P2 = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
        if (inside(p, poly)) return p;
      }
  throw new Error('no point inside the polygon');
}

/** Every triangle of a mesh as three corners and the vertex normals' sum. */
function* triangleList(m: Mesh) {
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const p = ids.map((i) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]]);
    const n = [0, 1, 2].map((a) => ids.reduce((s, i) => s + m.normals[3 * i + a], 0));
    yield { p, n };
  }
}
const cross = (p: number[][]) => {
  const [a, b, c] = p;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
const piece = (t: Title, name: string): TitlePiece => {
  const p = t.pieces.find((x) => x.name === name);
  if (!p) throw new Error(`no piece called ${name}: there are ${t.pieces.map((x) => x.name).join(', ')}`);
  return p;
};
const partOf = (p: TitlePiece, name: string): Part => {
  const part = p.parts.find((x) => x.name === name);
  if (!part) throw new Error(`no part called ${name} in ${p.name}: there are ${p.parts.map((x) => x.name).join(', ')}`);
  return part;
};
/** The area of a piece's parts that face the front, seen from the front: what it covers on the screen, counted once. */
const frontArea = (parts: Part[]) => {
  let s = 0;
  for (const part of parts) for (const { p } of triangleList(part.mesh)) s += Math.max(0, cross(p)[2]) / 2;
  return s;
};

const COUNTERS: Record<string, number> = { O: 1, o: 1, e: 1, C: 0, f: 0, u: 0, r: 0, s: 0, bar: 0, dot: 0 };
const LETTERS = Object.keys(COUNTERS);

describe('the faces are closed shapes with their counters kept', () => {
  it('the traced shapes: each letter is one piece, and has the counters of its glyph', () => {
    expect(trace.letters.map((l) => l.name).sort()).toEqual([...LETTERS].sort());
    for (const l of trace.letters) {
      expect(l.face.length, `${l.name} is one shape`).toBe(1);
      expect(l.face[0].holes.length, `${l.name}'s counters`).toBe(COUNTERS[l.name]);
      for (const ring of [l.face[0].outer, ...l.face[0].holes]) {
        expect(ring.length / 2, `${l.name} is a closed loop of points`).toBeGreaterThan(8);
        expect(ring.every(Number.isFinite)).toBe(true);
      }
      for (const hole of l.face[0].holes)
        expect(inside(interior(pairs(hole)), pairs(l.face[0].outer)), `${l.name}'s counter is inside it`).toBe(true);
    }
  });

  it('the dot of the ! stands apart from its bar, and clear of it', () => {
    const [dot, bar] = ['dot', 'bar'].map((n) => trace.letters.find((l) => l.name === n)!);
    expect(dot.box[1]).toBeGreaterThan(bar.box[3]);
    expect(piece(drawn, 'dot').parts.length).toBeGreaterThan(0);
    expect(piece(drawn, 'bar').parts.length).toBeGreaterThan(0);
  });

  it('what each face covers from the front is its shape less its counters, so no counter is filled', () => {
    for (const l of trace.letters) {
      const front = frontArea(
        flatTitle.pieces.find((p) => p.name === l.name)!.parts.filter((p) => p.name.startsWith('face')),
      );
      const want = l.face.reduce((n, s) => n + shapeArea(s), 0) * PIXEL ** 2;
      // the bevel's inner ring is offset along the points' normals, which at a sharp corner overlaps a little: a few percent over on a thin tip like the bar's, never a counter under
      expect(front / want, l.name).toBeGreaterThan(0.995);
      expect(front / want, l.name).toBeLessThan(1.03);
    }
  });

  it('a point in the middle of each counter has nothing of the letter in front of it', () => {
    for (const l of trace.letters.filter((x) => COUNTERS[x.name] > 0)) {
      const p = flatTitle.pieces.find((x) => x.name === l.name)!;
      const hole = pairs(l.face[0].holes[0]);
      const at = interior(hole);
      const pivot = [(l.box[0] + l.box[2]) / 2, l.box[3]];
      const q: P2 = [(at[0] - pivot[0]) * PIXEL, -(at[1] - pivot[1]) * PIXEL];
      for (const part of p.parts)
        for (const t of triangleList(part.mesh)) {
          const [a, b, c] = t.p;
          const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
          if (Math.abs(d) < 1e-12) continue;
          const u = ((b[1] - c[1]) * (q[0] - c[0]) + (c[0] - b[0]) * (q[1] - c[1])) / d;
          const v = ((c[1] - a[1]) * (q[0] - c[0]) + (a[0] - c[0]) * (q[1] - c[1])) / d;
          expect(u >= 0 && v >= 0 && u + v <= 1, `${l.name}: ${part.name} covers its counter`).toBe(false);
        }
    }
  });
});

describe('every normal is out', () => {
  const solid = (t: Title) =>
    t.pieces.flatMap((p) => p.parts.map((part) => ({ p, part }))).filter(({ p }) => p.kind !== 'ball');

  it('each triangle is wound the way its vertex normals face', () => {
    for (const { p, part } of solid(drawn))
      for (const t of triangleList(part.mesh)) {
        const g = cross(t.p);
        const along = g[0] * t.n[0] + g[1] * t.n[1] + g[2] * t.n[2];
        // a sliver has no face to speak of, and a flat cap and a wall are both clean
        if (Math.hypot(...g) > 1e-9) expect(along, `${p.name}/${part.name}`).toBeGreaterThan(0);
      }
  });

  it('the walls of each letter face out of it, and the top of it toward the viewer', () => {
    for (const l of trace.letters) {
      const p = flatTitle.pieces.find((x) => x.name === l.name)!;
      const rings = [l.tan[0].outer, ...l.tan[0].holes].map((r) =>
        pairs(r).map(([x, y]): P2 => [(x - (l.box[0] + l.box[2]) / 2) * PIXEL, -(y - l.box[3]) * PIXEL]),
      );
      // in the letter is in its outer loop and in none of its counters
      const within = (q: P2) => inside(q, rings[0]) && !rings.slice(1).some((h) => inside(q, h));
      const tan = partOf(p, 'tan').mesh;
      let walls = 0,
        out = 0;
      for (let i = 0; i < tan.normals.length; i += 3) {
        const [nx, ny, nz] = [tan.normals[i], tan.normals[i + 1], tan.normals[i + 2]];
        if (Math.abs(nz) > 0.01) continue;
        walls++;
        const at = [tan.positions[i], tan.positions[i + 1]];
        if (!within([at[0] + nx * 0.004, at[1] + ny * 0.004]) && within([at[0] - nx * 0.004, at[1] - ny * 0.004]))
          out++;
      }
      expect(walls, `${l.name} has walls`).toBeGreaterThan(20);
      expect(out / walls, `${l.name}'s walls face out`).toBeGreaterThan(0.95);
      for (const part of p.parts.filter((x) => x.name.startsWith('face')))
        for (const t of triangleList(part.mesh))
          expect(t.n[2], `${l.name}'s face never faces away`).toBeGreaterThanOrEqual(0);
    }
  });

  it('the ball is drawn with every triangle toward the viewer, since the light is read into its colours', () => {
    for (const part of piece(drawn, 'ball').parts) {
      expect(part.mesh.indices.length).toBeGreaterThan(0);
      // across the middle of the disc, where it faces the viewer: a pit's steep wall near the rim is turned away, and lies behind the rest
      const reach = 0.7 * trace.ball.r * PIXEL;
      for (const t of triangleList(part.mesh))
        if (Math.hypot(t.p.reduce((s, q) => s + q[0], 0) / 3, t.p.reduce((s, q) => s + q[1], 0) / 3) < reach)
          expect(cross(t.p)[2]).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('the whole title stays inside its triangle budget', () => {
  it('under 30,000 triangles, in BUDGET', () => {
    expect(BUDGET.title).toBeLessThanOrEqual(30000);
    expect(triangles(titleModel(trace))).toBeLessThanOrEqual(BUDGET.title);
    expect(triangles(titleModel(trace))).toBeGreaterThan(5000);
  });

  it('is made of the pieces it says, each with a place to turn about', () => {
    const names = drawn.pieces.map((p) => p.name);
    expect(new Set(names).size, 'no two pieces share a name').toBe(names.length);
    for (const l of LETTERS) expect(names, l).toContain(l);
    for (const n of ['ball', 'pole', 'flag']) expect(names, n).toContain(n);
    expect(names.filter((n) => n.startsWith('spark')).length).toBe(trace.sparkles.length);
    for (const p of drawn.pieces) {
      expect(p.parts.length, p.name).toBeGreaterThan(0);
      expect(p.pivot.every(Number.isFinite), p.name).toBe(true);
      expect(Number.isInteger(p.step), p.name).toBe(true);
    }
    // an outline piece turns about the very place its owner does, so the two are one thing when moved
    for (const p of drawn.pieces.filter((x) => x.kind === 'outline')) {
      const owner = drawn.pieces.find((x) => x.name === p.owner)!;
      expect(owner, `${p.name}'s owner`).toBeTruthy();
      expect(p.pivot).toEqual(owner.pivot);
      expect(p.step).toBe(owner.step);
    }
  });
});

/** A grid over the title that each outline piece's front is painted onto, counting how many pieces cover each cell. */
function coverage(
  t: Title,
  pose: (p: TitlePiece) => [number, number] = () => [1, 1],
  take: (p: TitlePiece) => boolean = () => true,
  cellsPerPixel = 2,
) {
  const [w, h] = [Math.ceil(trace.w * cellsPerPixel), Math.ceil(trace.h * cellsPerPixel)];
  const grid = new Uint8Array(w * h);
  /** A point of the title, in its units from its middle, as a cell of the grid. */
  const toCell = (x: number, y: number): P2 => [
    (t.centre[0] + x / PIXEL) * cellsPerPixel,
    (t.centre[1] - y / PIXEL) * cellsPerPixel,
  ];
  for (const p of t.pieces.filter((x) => x.kind === 'outline' && take(x))) {
    const [sx, sy] = pose(p);
    for (const { p: tri } of triangleList(partOf(p, 'edge').mesh)) {
      if (cross(tri)[2] <= 0) continue;
      // each piece is turned about its own pivot: the title's units from the pivot, scaled, and put back
      const c = tri.map((v) => toCell(p.pivot[0] + v[0] * sx, p.pivot[1] + v[1] * sy));
      const [x0, x1] = [
        Math.max(0, Math.floor(Math.min(...c.map((q) => q[0])))),
        Math.min(w - 1, Math.ceil(Math.max(...c.map((q) => q[0])))),
      ];
      const [y0, y1] = [
        Math.max(0, Math.floor(Math.min(...c.map((q) => q[1])))),
        Math.min(h - 1, Math.ceil(Math.max(...c.map((q) => q[1])))),
      ];
      const d = (c[1][1] - c[2][1]) * (c[0][0] - c[2][0]) + (c[2][0] - c[1][0]) * (c[0][1] - c[2][1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const [qx, qy] = [x + 0.5, y + 0.5];
          const u = ((c[1][1] - c[2][1]) * (qx - c[2][0]) + (c[2][0] - c[1][0]) * (qy - c[2][1])) / d;
          const v = ((c[2][1] - c[0][1]) * (qx - c[2][0]) + (c[0][0] - c[2][0]) * (qy - c[2][1])) / d;
          if (u >= 0 && v >= 0 && u + v <= 1) grid[y * w + x] = Math.min(255, grid[y * w + x] + 1);
        }
    }
  }
  return { grid, w, h, cellsPerPixel };
}

describe('the outline is in a piece for each letter, and the pieces make the whole of it', () => {
  it('every piece of outline belongs to a thing of the title, and each thing has one', () => {
    const owners = flatTitle.pieces.filter((p) => p.kind === 'outline').map((p) => p.owner);
    expect(new Set(owners).size).toBe(owners.length);
    for (const o of [...LETTERS, 'ball', 'pole', 'flag']) expect(owners, o).toContain(o);
  });

  it('together they cover the outline’s whole area within 1%, and no more', () => {
    const { grid, cellsPerPixel } = coverage(flatTitle);
    const covered = grid.reduce((n, v) => n + (v > 0 ? 1 : 0), 0) / cellsPerPixel ** 2;
    const whole = trace.rim.whole.reduce((n, s) => n + shapeArea(s), 0);
    expect(Math.abs(covered / whole - 1)).toBeLessThan(0.01);
  });

  it('neighbours overlap under one another, and nowhere is more than a few pieces deep', () => {
    expect(trace.rim.grow).toBe(GROW);
    const { grid, cellsPerPixel } = coverage(flatTitle);
    const lapped = grid.reduce((n, v) => n + (v > 1 ? 1 : 0), 0) / cellsPerPixel ** 2;
    expect(lapped, 'there is overlap to cover a seam').toBeGreaterThan(200);
    let deepest = 0;
    for (const v of grid) deepest = Math.max(deepest, v);
    expect(deepest, 'but never a pile of it').toBeLessThanOrEqual(4);
  });

  it('there is no gap between neighbouring pieces at rest: every cell of the outline has a piece over it', () => {
    const { grid, w, h, cellsPerPixel } = coverage(flatTitle);
    let bare = 0,
      inner = 0;
    // a cell well inside the outline's whole shape, four pixels in from its edge: the pieces are blurred apart from the whole and their edges differ from its by about that at a notch
    const rings = trace.rim.whole.map((s) => ({ outer: pairs(s.outer), holes: s.holes.map(pairs) }));
    for (let y = 0; y < h; y += 2)
      for (let x = 0; x < w; x += 2) {
        const at: P2 = [(x + 0.5) / cellsPerPixel, (y + 0.5) / cellsPerPixel];
        if (!rings.some((r) => inside(at, r.outer) && !r.holes.some((hole) => inside(at, hole)))) continue;
        const near = [
          [4, 0],
          [-4, 0],
          [0, 4],
          [0, -4],
        ].every(([dx, dy]) =>
          rings.some(
            (r) =>
              inside([at[0] + dx, at[1] + dy], r.outer) &&
              !r.holes.some((hole) => inside([at[0] + dx, at[1] + dy], hole)),
          ),
        );
        if (!near) continue;
        inner++;
        if (grid[y * w + x] === 0) bare++;
      }
    expect(inner).toBeGreaterThan(10000);
    expect(bare).toBe(0);
  });

  it('nor along the borders of neighbours in a row when each is squashed by 15% as it lands', () => {
    // flattened by a seventh about the foot each turns on and widened by 70% of that, as the drop does
    const squash = (): [number, number] => [1 + 0.15 * 0.7, 1 - 0.15];
    const outlines = flatTitle.pieces.filter((p) => p.kind === 'outline');
    // each piece alone, so that what covers a cell is one of the pair and not a third
    const alone = outlines.map((p) => ({
      p,
      at: coverage(
        flatTitle,
        () => [1, 1],
        (x) => x === p,
      ),
      moved: coverage(flatTitle, squash, (x) => x === p),
    }));
    const { w, cellsPerPixel } = alone[0].at;
    // a letter's top retreats toward its foot by 15% of its height, and where a border meets the next row or the open air that is the word shrinking, not a seam
    const retreat = Math.ceil(0.15 * 170 * cellsPerPixel);
    let checked = 0,
      pairs = 0;
    for (let i = 0; i < alone.length; i++)
      for (let j = i + 1; j < alone.length; j++) {
        // neighbours in a row, which stand on feet within a letter's height of one another
        if (Math.abs(alone[i].p.pivot[1] - alone[j].p.pivot[1]) > 0.6) continue;
        const lap: number[] = [];
        for (let k = 0; k < alone[i].at.grid.length; k++) if (alone[i].at.grid[k] && alone[j].at.grid[k]) lap.push(k);
        if (lap.length === 0) continue;
        pairs++;
        const rows = lap.map((k) => Math.floor(k / w));
        const [top, bottom] = [Math.min(...rows), Math.max(...rows)];
        for (const k of lap) {
          const y = Math.floor(k / w);
          if (y < top + retreat || y > bottom - retreat) continue;
          checked++;
          expect(
            alone[i].moved.grid[k] + alone[j].moved.grid[k],
            `${alone[i].p.owner} and ${alone[j].p.owner} at cell ${k % w}, ${y}`,
          ).toBeGreaterThan(0);
        }
      }
    expect(pairs, 'neighbours in a row were found').toBeGreaterThanOrEqual(7);
    expect(checked, 'and their borders were walked').toBeGreaterThan(500);
  });
});

describe('the outline has a lighter edge', () => {
  it('each piece is a dark slab in front of a lighter one that is the whole piece, so only an edge of the lighter shows', () => {
    for (const p of drawn.pieces.filter((x) => x.kind === 'outline')) {
      const [dark, edge] = [partOf(p, 'dark'), partOf(p, 'edge')];
      expect(frontArea([dark])).toBeLessThan(frontArea([edge]));
      expect(edge.material[1]).toBeGreaterThan(dark.material[1]);
      expect(edge.material[2]).toBeGreaterThan(dark.material[2]);
    }
  });

  it('is cut an even edge in from the outline’s own, and the edge colour is the picture’s', () => {
    expect(trace.rim.edge).toBe(EDGE);
    const whole = trace.rim.whole.reduce((n, s) => n + shapeArea(s), 0) * PIXEL ** 2;
    const dark = flatTitle.pieces
      .filter((x) => x.kind === 'outline')
      .reduce((n, p) => n + frontArea([partOf(p, 'dark')]), 0);
    // a ring EDGE pixels wide round a boundary of a few thousand pixels is a few percent of the whole, not a tenth and not nothing
    expect(dark / whole).toBeLessThan(0.99);
    expect(dark / whole).toBeGreaterThan(0.85);
    const edge = partOf(piece(flatTitle, 'rim-C'), 'edge').material;
    expect(edge.slice(0, 3)).toEqual(shade(trace.rim.edgeRgb, RIM_GAIN));
  });
});

describe('colours are as named', () => {
  it('the cream faces are the picture’s colours by the one gain, found against the scene’s light', () => {
    expect(FACE_GAIN).toEqual([1.6, 1.17, 1.22]);
    for (const l of trace.letters) {
      const p = piece(drawn, l.name);
      const faces = p.parts.filter((x) => x.name.startsWith('face'));
      expect(faces.length, `${l.name} in 12 bands`).toBe(BANDS);
      // the bands are named from the bottom up, as the model cuts them
      faces.forEach((part, k) =>
        expect(Array.from(part.material.slice(0, 3)), `${l.name} band ${k}`).toEqual(
          shade(l.bands[BANDS - 1 - k], FACE_GAIN),
        ),
      );
    }
  });

  it('the underside is a warm tan, warmer than the picture’s through the same gain', () => {
    expect(TAN_GAIN[0] / TAN_GAIN[2]).toBeGreaterThan(1);
    for (const l of trace.letters) {
      expect(Array.from(partOf(piece(drawn, l.name), 'tan').material.slice(0, 3))).toEqual(shade(l.tanRgb, TAN_GAIN));
      const plain = shade(l.tanRgb, [1, 1, 1]);
      const tan = shade(l.tanRgb, TAN_GAIN);
      expect(tan[0] / tan[2], l.name).toBeGreaterThan(plain[0] / plain[2]);
    }
  });

  it('the outline is the picture’s dark green, held down by the gain it needs against the scene’s ambient light', () => {
    expect(RIM_GAIN).toEqual([0, 0.88, 0.4]);
    expect(Array.from(partOf(piece(drawn, 'rim-C'), 'dark').material.slice(0, 3))).toEqual(
      shade(trace.rim.rgb, RIM_GAIN),
    );
  });

  it('the flag is two reds either side of its fold, and the sparkles the picture’s yellow', () => {
    const f = piece(drawn, 'flag');
    expect(Array.from(partOf(f, 'cloth dark').material.slice(0, 3))).toEqual(shade(trace.flag.dark, FACE_GAIN));
    expect(Array.from(partOf(f, 'cloth light').material.slice(0, 3))).toEqual(shade(trace.flag.light, FACE_GAIN));
    for (const s of drawn.pieces.filter((x) => x.kind === 'sparkle'))
      expect(Array.from(s.parts[0].material.slice(0, 3))).toEqual(shade(trace.sparkRgb, FACE_GAIN));
  });
});

describe('the ball is dimpled with soft pits, and shaded as the picture’s is', () => {
  const ball = piece(drawn, 'ball');
  const tiers = ball.parts.filter((p) => p.name.startsWith('ball'));
  const where = (part: Part) => {
    let x = 0,
      y = 0,
      n = 0;
    for (let i = 0; i < part.mesh.positions.length; i += 3) {
      x += part.mesh.positions[i];
      y += part.mesh.positions[i + 1];
      n++;
    }
    return [x / n, y / n];
  };
  const sum = (part: Part) => part.material[0] + part.material[1] + part.material[2];

  it('is cut into a tier for each step of the picture’s ramp of light, so no pit is a quilted facet', () => {
    expect(tiers.length).toBeGreaterThanOrEqual(10);
    expect(trace.ball.ramp.length).toBeGreaterThanOrEqual(10);
  });

  it('is darkest at its lower left and lightest at its upper right, the way the picture’s light falls', () => {
    const [dark, light] = [
      tiers.reduce((a, b) => (sum(a) < sum(b) ? a : b)),
      tiers.reduce((a, b) => (sum(a) > sum(b) ? a : b)),
    ];
    const [dx, dy] = where(dark),
      [lx, ly] = where(light);
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
    expect(lx).toBeGreaterThan(dx);
    expect(ly).toBeGreaterThan(dy);
    // the picture's own shade is cool and grey, more blue than red, and darker than the old quilted tiers' (194, 189, 182)
    const [r, g, b] = trace.ball.ramp[0].rgb;
    expect(b).toBeGreaterThanOrEqual(r);
    expect(r + g + b).toBeLessThan(194 + 189 + 182 - 40);
  });

  it('its surface is dented: it stands in and out of a sphere by the depth of a pit, and no further', () => {
    const r = trace.ball.r * PIXEL;
    const flat = titleLetters(trace, { depthScale: 0, flattenBall: false }).pieces.find((p) => p.name === 'ball')!;
    let least = Infinity,
      most = 0;
    for (const part of flat.parts.filter((p) => p.name.startsWith('ball')))
      for (let i = 0; i < part.mesh.positions.length; i += 3) {
        const d = Math.hypot(part.mesh.positions[i], part.mesh.positions[i + 1], part.mesh.positions[i + 2]);
        least = Math.min(least, d);
        most = Math.max(most, d);
      }
    expect(most / r).toBeLessThan(1.06);
    expect(least / r).toBeLessThan(0.95);
    expect(least / r).toBeGreaterThan(0.8);
  });
});

describe('the trace tool', () => {
  const root = path.resolve(__dirname, '..');

  it('its output, made again from the picture, is the data that is committed', () => {
    const made = traceTitle(fs.readFileSync(path.join(root, 'src', 'title_sq.png')));
    expect(JSON.parse(JSON.stringify(made))).toEqual(data);
  });

  it('the data is a few kilobytes and the picture is not needed at runtime', () => {
    const bytes = fs.statSync(path.join(root, 'src', 'titletrace.json')).size;
    expect(bytes).toBeLessThan(120_000);
    const source = fs.readFileSync(path.join(root, 'src', 'models', 'lettering.ts'), 'utf8');
    expect(source).not.toMatch(/title_sq|\.png|pngjs/);
  });
});

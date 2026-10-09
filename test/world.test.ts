/**
 * The world past a golf hole: the ground that rolls away from the map's edge, the plane under the hole that follows it, and
 * everything that stands there (the bunting, the near woods and the far woods) standing on that ground and not over it or
 * under it. Without the hills the woods stood on one flat plain at a constant depth, and the plane's straight edge threw the
 * stepped shadow of the out of bounds on to it. Held on every golf hole there is, since a hole's edge is its own.
 */
import { Camera } from 'artshape-render/gpu/camera';
import { describe, expect, it } from 'vitest';
import { TILE, heightAt, layoutOf, type Layout } from '../src/arena';
import { CLIP, CameraRig } from '../src/camera';
import { COURSES } from '../src/course';
import { Director } from '../src/director';
import { HILLS, PLANE_DROP, PLANE_LINES, groundZOf, planeOf } from '../src/hills';
import { links } from '../src/links';
import { BUDGET } from '../src/models';
import { SCENERY_MODELS, BEYOND_MODELS, FAR_WOODS, Scene, boxOf } from '../src/scene';
import { BEYOND, FAR, beyond, dress, farWoods } from '../src/scenery';
import { golfGame } from './helpers';

const golfHoles = COURSES.filter((c) => c.golf).flatMap((c) => c.holes.map((h) => ({ course: c.name, hole: h })));
const sample = [
  links()[0],
  links()[2],
  COURSES.find((c) => c.name === 'The Isles')!.holes[1],
  COURSES.find((c) => c.name === 'The Fells')!.holes[4],
];

describe('the ground past a golf hole', () => {
  it('is the same for a hole every time, and another for another name', () => {
    const l = layoutOf(links()[0].map, links()[0].terrain);
    const a = groundZOf(l, 'The Opener'),
      b = groundZOf(l, 'The Opener'),
      c = groundZOf(l, 'Another');
    const at = [l.bounds.maxX + 90, l.bounds.minY - 120];
    expect(a(at[0], at[1])).toBe(b(at[0], at[1]));
    expect(c(at[0], at[1])).not.toBe(a(at[0], at[1]));
  });

  it('meets the hole’s edge without a step, along the whole of it, and is nothing but the hole’s own height there', () => {
    let counted = 0,
      worst = 0;
    for (const { hole } of golfHoles) {
      const l = layoutOf(hole.map, hole.terrain);
      const z = groundZOf(l, hole.name);
      const x0 = l.originX,
        y0 = l.originY,
        x1 = x0 + l.cols * TILE,
        y1 = y0 + l.rows * TILE;
      const e = 0.02;
      const across = (x: number, y: number, nx: number, ny: number) => {
        const out = z(x + nx * e, y + ny * e),
          inside = z(x - nx * e, y - ny * e);
        worst = Math.max(worst, Math.abs(out - inside));
        counted++;
        expect(Math.abs(out - inside), `${hole.name}: a step at ${x.toFixed(1)}, ${y.toFixed(1)}`).toBeLessThan(0.02);
      };
      for (let x = x0 + 0.5; x < x1; x += 1.5) {
        across(x, y0 + 0.011, 0, -1);
        across(x, y1 - 0.011, 0, 1);
      }
      for (let y = y0 + 0.5; y < y1; y += 1.5) {
        across(x0 + 0.011, y, -1, 0);
        across(x1 - 0.011, y, 1, 0);
      }
      // and the hole’s own height is what stands at its edge, inside
      expect(z(x0 + 40, y0 + 40)).toBe(Math.max(0, heightAt(l, x0 + 40, y0 + 40)));
    }
    expect(counted).toBeGreaterThan(20000);
    expect(worst).toBeLessThan(0.02);
  });

  it('rises from nothing at the edge to tens of yards far out, rolls without a cliff, and is nothing at the world’s end', () => {
    for (const hole of sample) {
      const l = layoutOf(hole.map, hole.terrain);
      const z = groundZOf(l, hole.name);
      const x1 = l.originX + l.cols * TILE,
        yMid = l.originY + (l.rows * TILE) / 2;
      // out from the east edge, past where the edge's own height has tapered away
      const hill = (out: number) => z(x1 + out, yMid) - z(x1 + HILLS.taper + 1, yMid) * 0;
      let nearMost = 0,
        farMost = 0,
        steepest = 0;
      for (let out = 40; out < HILLS.reach + 20; out += 0.5) {
        const here = hill(out);
        steepest = Math.max(steepest, Math.abs(here - hill(out + 0.5)) / 0.5);
        if (out < 80) nearMost = Math.max(nearMost, here);
        if (out > 200 && out < 330) farMost = Math.max(farMost, here);
      }
      expect(nearMost, `${hole.name}: near the edge`).toBeLessThan(8);
      expect(farMost, `${hole.name}: far out`).toBeGreaterThan(8);
      expect(farMost, `${hole.name}: far out`).toBeLessThan(HILLS.far + 1);
      expect(steepest, `${hole.name}: a cliff`).toBeLessThan(1);
      expect(z(x1 + HILLS.reach, yMid)).toBe(0);
      expect(z(x1 + HILLS.reach + 500, yMid + 300)).toBe(0);
    }
  });
});

describe('the plane under a golf hole', () => {
  for (const hole of sample) {
    it(`follows the ground a little under it, with its slope’s normals, and leaves a hole for water, on ${hole.name}`, () => {
      const l = layoutOf(hole.map, hole.terrain);
      const z = groundZOf(l, hole.name);
      const mesh = planeOf(l, z, 1100);
      // the vertices the triangles use: the grid's are the ground lowered, the flat quads' are at the drop, and every normal is a unit that looks up
      const used = new Set(mesh.indices);
      let grid = 0;
      for (const v of used) {
        const x = mesh.positions[v * 3],
          y = mesh.positions[v * 3 + 1],
          h = mesh.positions[v * 3 + 2];
        const n = [mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]];
        expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 4);
        expect(n[2]).toBeGreaterThan(0.5);
        if (Math.abs(h + PLANE_DROP - z(x, y)) < 1e-3) grid++;
        else expect(h, 'a flat piece, level with the ground’s end').toBeCloseTo(-PLANE_DROP, 5);
      }
      expect(grid).toBeGreaterThan(5000);
      // a tile of water is not covered by it; the rock and what is by rock or water is, and the ground that is drawn over it, in
      // the middle of the course, is not (the plane is under it and could not be seen)
      const covered = new Set<number>();
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const mx = (mesh.positions[mesh.indices[t] * 3] + mesh.positions[mesh.indices[t + 2] * 3]) / 2,
          my = (mesh.positions[mesh.indices[t] * 3 + 1] + mesh.positions[mesh.indices[t + 2] * 3 + 1]) / 2;
        const tx = Math.floor((mx - l.originX) / TILE),
          ty = Math.floor((my - l.originY) / TILE);
        if (tx >= 0 && ty >= 0 && tx < l.cols && ty < l.rows) covered.add(ty * l.cols + tx);
      }
      let water = 0,
        hidden = 0;
      for (let t = 0; t < l.cols * l.rows; t++) {
        const tx = t % l.cols,
          ty = Math.floor(t / l.cols);
        let bare = false;
        for (let v = -1; v <= 1; v++)
          for (let u = -1; u <= 1; u++) {
            const x = tx + u,
              y = ty + v;
            if (x < 0 || y < 0 || x >= l.cols || y >= l.rows || l.solid[y * l.cols + x] || l.water[y * l.cols + x])
              bare = true;
          }
        if (l.water[t]) {
          water++;
          expect(covered.has(t), `${hole.name}: water under the plane at tile ${t}`).toBe(false);
        } else if (bare) expect(covered.has(t), `${hole.name}: a gap at tile ${t}`).toBe(true);
        else if (!covered.has(t)) hidden++;
      }
      expect(hidden, `${hole.name}: ground drawn over the plane is left without it`).toBeGreaterThan(100);
      if (hole.name === 'The Green Isle') expect(water).toBeGreaterThan(100);
    });

    it(`has no cliff at the map’s edge, a line a tile apart there and none wider than the shadow’s stairs need, on ${hole.name}`, () => {
      const l = layoutOf(hole.map, hole.terrain);
      const z = groundZOf(l, hole.name);
      const mesh = planeOf(l, z, 1100);
      // every triangle of the grid is as steep as the ground is, at most: nothing in it is a wall
      let steepest = 0;
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const p = [0, 1, 2].map((k) => mesh.indices[t + k] * 3);
        for (const [a, b] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          const dx = mesh.positions[p[a]] - mesh.positions[p[b]],
            dy = mesh.positions[p[a] + 1] - mesh.positions[p[b] + 1],
            dz = mesh.positions[p[a] + 2] - mesh.positions[p[b] + 2];
          const run = Math.hypot(dx, dy);
          if (run > 1e-6 && run < 100) steepest = Math.max(steepest, Math.abs(dz) / run);
        }
      }
      expect(steepest).toBeLessThan(2);
      // lines a tile apart for a few tiles past the edge, a tile and then 12 apart out to 96, and nowhere further apart than 48
      expect(PLANE_LINES.slice(0, 4)).toEqual([TILE, 2 * TILE, 3 * TILE, 4 * TILE]);
      for (let k = 1; k < PLANE_LINES.length; k++)
        expect(PLANE_LINES[k] - PLANE_LINES[k - 1]).toBeLessThanOrEqual(PLANE_LINES[k - 1] < 96 ? 12 : 48);
      expect(PLANE_LINES[PLANE_LINES.length - 1]).toBeGreaterThanOrEqual(HILLS.reach);
    });
  }
});

describe('what stands past a golf hole', () => {
  /** Every placement the scene wrote, by where it stands (a cell four yards across, and the near cells are searched by `at`), and its matrix. */
  function placements(l: Layout, name: string) {
    const groups = new Scene().static(l, name);
    const at = new Map<string, Float32Array[]>();
    for (const g of groups) {
      const m = g.matrices as Float32Array | undefined;
      if (!m) continue;
      for (let k = 0; k + 16 <= m.length; k += 16) {
        const key = `${Math.round(m[k + 12] / 4)},${Math.round(m[k + 13] / 4)}`;
        (at.get(key) ?? at.set(key, []).get(key)!).push(m.subarray(k, k + 16));
      }
    }
    return at;
  }

  for (const hole of sample) {
    it(`stands every wood, far wood and post of bunting on the ground where it is, within a tenth, on ${hole.name}`, () => {
      const l = layoutOf(hole.map, hole.terrain);
      const z = groundZOf(l, hole.name);
      const at = placements(l, hole.name);
      const near = beyond(l, hole.name),
        far = farWoods(l, hole.name),
        d = dress(l, hole.name);
      expect(near.length).toBeGreaterThan(300);
      expect(far.length).toBeGreaterThan(300);
      expect(d.bunting.length).toBeGreaterThan(0);
      let high = 0;
      const near_ = (x: number, y: number) =>
        [-1, 0, 1]
          .flatMap((i) => [-1, 0, 1].flatMap((j) => at.get(`${Math.round(x / 4) + i},${Math.round(y / 4) + j}`) ?? []))
          .filter((m) => Math.abs(m[12] - x) < 0.01 && Math.abs(m[13] - y) < 0.01);
      const stands = (x: number, y: number, what: string) => {
        const found = near_(x, y).filter((m) => Math.abs(m[14] - z(x, y)) <= 0.1);
        expect(
          found.length,
          `${hole.name}: ${what} at ${x.toFixed(1)},${y.toFixed(1)} is not on the ground`,
        ).toBeGreaterThan(0);
        high = Math.max(high, z(x, y));
      };
      for (const p of near) stands(p.x, p.y, `a ${p.kind}`);
      // a far wood that would stand in the lake the ground is carved for is not planted: none stands in its water
      for (const p of far)
        if (z.lake!.weight(p.x, p.y) === 0) stands(p.x, p.y, `a far ${p.kind}`);
        else expect(near_(p.x, p.y), `${hole.name}: a far tree in the lake`).toHaveLength(0);
      // a post of the bunting stands at each end of its string, which is tipped to join them
      for (const b of d.bunting) {
        const m = near_(b.x, b.y)[0];
        expect(m, `${hole.name}: bunting at ${b.x},${b.y}`).toBeDefined();
        for (const end of [-1, 1]) {
          const ex = m[12] + (end * b.length * m[0]) / 2,
            ey = m[13] + (end * b.length * m[1]) / 2,
            ez = m[14] + (end * b.length * m[2]) / 2;
          expect(Math.abs(ez - z(ex, ey)), `${hole.name}: a post of the bunting`).toBeLessThanOrEqual(0.1);
        }
      }
      // a check that found only level ground passes in silence: some of it stands on a hill
      expect(high, hole.name).toBeGreaterThan(2);
    });
  }

  it('keeps the near woods and the far woods to their counts and their triangle budgets on every golf hole, and finds the worst', () => {
    const tris = (model: { parts: { mesh: { indices: ArrayLike<number> } }[] }) =>
      model.parts.reduce((a, p) => a + p.mesh.indices.length / 3, 0);
    // the most any model of a kind draws, over its yaw buckets and its parts
    const near = (p: { kind: string; variant: number }) => {
      const kind = (p.kind === 'bush' && p.variant === 1 ? 'fern' : p.kind) as keyof typeof BEYOND_MODELS;
      return Math.max(...BEYOND_MODELS[kind].map(tris));
    };
    let worstNear = 0,
      worstFar = 0,
      counted = 0;
    for (const { course, hole } of golfHoles) {
      const l = layoutOf(hole.map, hole.terrain);
      const n = beyond(l, hole.name),
        f = farWoods(l, hole.name);
      const nearTris = n.reduce((a, p) => a + near(p), 0),
        farTris = f.reduce((a, p) => a + Math.max(...FAR_WOODS[p.kind as 'conifer'].map(tris)), 0);
      worstNear = Math.max(worstNear, nearTris);
      worstFar = Math.max(worstFar, farTris);
      counted++;
      expect(n.length, `${course}: ${hole.name}`).toBeLessThanOrEqual(BEYOND.most);
      expect(f.length, `${course}: ${hole.name}`).toBeLessThanOrEqual(FAR.most);
      expect(nearTris, `${course}: ${hole.name}: near woods`).toBeLessThanOrEqual(BUDGET['near woods']);
      expect(farTris, `${course}: ${hole.name}: far woods`).toBeLessThanOrEqual(BUDGET['far woods']);
    }
    expect(counted).toBe(27);
    // a ceiling that nothing comes near is not held: the worst hole uses most of its budget
    expect(worstNear).toBeGreaterThan(BUDGET['near woods'] * 0.5);
    // the far woods are thin, a few hundred trees of a few dozen triangles: nowhere near their ceiling, which is a cap and not a target
    expect(worstFar).toBeGreaterThan(5000);
    console.info(`world: worst near woods ${worstNear} triangles, far woods ${worstFar}`);
  });

  it('draws the far trees at about twenty triangles each, and the far woods thin out with the distance', () => {
    for (const kind of ['conifer', 'broadleaf'] as const)
      for (const m of FAR_WOODS[kind]) {
        const t = m.parts.reduce((a, p) => a + p.mesh.indices.length / 3, 0);
        expect(t).toBeGreaterThan(BUDGET.farTree - 8);
        expect(t).toBeLessThanOrEqual(BUDGET.farTree + 8);
      }
    const l = layoutOf(links()[4].map, links()[4].terrain);
    const far = farWoods(l, links()[4].name);
    const away = (p: { x: number; y: number }) =>
      Math.max(l.originX - p.x, p.x - (l.originX + l.cols * TILE), l.originY - p.y, p.y - (l.originY + l.rows * TILE));
    // by the yard of ground: a band further out is longer round, so the count alone would hide the thinning
    const mid = (FAR.from + FAR.to) / 2,
      round = 2 * (l.cols * TILE + l.rows * TILE);
    const band = (from: number, to: number) => (round + 2 * Math.PI * ((from + to) / 2)) * (to - from);
    const inner = far.filter((p) => away(p) < mid).length / band(FAR.from, mid),
      outer = far.filter((p) => away(p) >= mid).length / band(mid, FAR.to);
    expect(inner).toBeGreaterThan(outer * 1.1);
    for (const p of far) {
      expect(away(p)).toBeGreaterThan(FAR.from - FAR.clump);
      expect(away(p)).toBeLessThan(FAR.to + FAR.clump);
    }
  });

  it('is none on a hole of minigolf, whose rough and scenery are as they were', () => {
    const l = layoutOf(COURSES[0].holes[0].map);
    expect(farWoods(l, 'x')).toEqual([]);
    expect(beyond(l, 'x')).toEqual([]);
    expect(SCENERY_MODELS.broadleaf.length).toBeGreaterThan(0);
  });

  it('is reached by the far plane in the fly-in, from the tee’s side of every hole, out to the last far wood', () => {
    for (const hole of [links()[0], links()[4], ...sample]) {
      const { game } = golfGame(hole);
      const rig = new CameraRig();
      const director = new Director(rig, { flyIn: true });
      director.use(game);
      director.setScreen(1.6, 800);
      director.started();
      const cam = new Camera();
      cam.fov = rig.fov;
      cam.aspect = 1.6;
      cam.far = rig.farPlaneAt(game.t);
      rig.place(cam, game.t);
      cam.update();
      expect(cam.far).toBeGreaterThanOrEqual(CLIP.horizon);
      let farthest = 0;
      for (const p of farWoods(game.layout, hole.name))
        farthest = Math.max(farthest, Math.hypot(p.x - cam.position[0], p.y - cam.position[1], 25 - cam.position[2]));
      expect(farthest, hole.name).toBeGreaterThan(300);
      expect(farthest, `${hole.name}: a far wood past the far plane`).toBeLessThan(cam.far);
      // and the sun’s shadow box holds the tallest the hills lift a wood to
      expect(boxOf(game.layout).max[2]).toBeGreaterThan(38 + HILLS.near);
    }
  });
});

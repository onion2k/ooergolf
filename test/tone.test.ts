/**
 * The scenery's baked light: every face of a tree, a bush, a fern or a rock is put in a part by how far it faces a fixed
 * sun, and the part is its colour times that tier's factor, so the shade side of a crown is deep and the lit side bright
 * whatever the renderer's toon bands do. A baked light is right only at one yaw, so a model is baked for a few yaw
 * buckets and a piece is placed at its bucket's. Without these tests a tier could take a face from the wrong side of the
 * light, a bucket could be baked for the wrong turn so a tree's bright side faced away from the sun, or toning could add
 * or lose a triangle and the budget would hold a different model than the one drawn.
 */
import { describe, expect, it } from 'vitest';
import { BUDGET, boulder, broadleaf, bush, conifer, fern, farTree, golfTree, triangles } from '../src/models';
import type { Model, Part } from '../src/models';
import { place } from '../src/matrix';
import {
  BUCKETS,
  TONE_SUN,
  TONES,
  bucketOf,
  bucketYaw,
  bucketed,
  sceneryRule,
  toned,
  turnedSun,
  type Tiers,
} from '../src/models/tone';
import { BEYOND_MODELS, FAR_WOODS, GOLF_TREES, SCENERY_MODELS } from '../src/scene';
import { TREE } from '../src/trees';

/** A face's unit normal from its corners, as the mesh's own normals say it looks. */
function normals(part: Part): [number, number, number][] {
  const { positions: p, indices: ix, normals: n } = part.mesh;
  const out: [number, number, number][] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    let x = u[1] * v[2] - u[2] * v[1],
      y = u[2] * v[0] - u[0] * v[2],
      z = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(x, y, z) || 1;
    const s = x * n[a] + y * n[a + 1] + z * n[a + 2] < 0 ? -1 : 1;
    x = (s * x) / l;
    y = (s * y) / l;
    z = (s * z) / l;
    out.push([x, y, z]);
  }
  return out;
}

/** The kinds the scene tones, each as the plain model it is made from, with the name the scene gives its set. */
const PLAIN: [string, () => Model, keyof typeof BUDGET][] = [
  ['broadleaf', () => broadleaf({ height: 12, seed: 9 }), 'broadleaf'],
  ['conifer', () => conifer({ height: 14, seed: 9 }), 'conifer'],
  ['bush', () => bush(3, { seed: 9 }), 'bush'],
  ['fern', () => fern(3, { seed: 9 }), 'fern'],
  ['boulder', () => boulder(3, { seed: 9 }), 'boulder'],
  ['golf tree', () => golfTree(TREE, { seed: 9 }), 'golfTree'],
  ['far conifer', () => farTree('conifer'), 'farTree'],
  ['far broadleaf', () => farTree('broadleaf'), 'farTree'],
];

describe('the buckets of yaw', () => {
  it('are six, evenly round the turn, the first at nought', () => {
    expect(BUCKETS).toBe(6);
    expect(bucketYaw(0)).toBe(0);
    for (let k = 0; k < BUCKETS; k++) expect(bucketYaw(k)).toBeCloseTo((k / BUCKETS) * Math.PI * 2, 12);
  });

  it('take any yaw, whole turns and negatives included, to the nearest, never further than half a bucket away', () => {
    const half = Math.PI / BUCKETS;
    for (let i = -400; i <= 400; i++) {
      const yaw = i * 0.0377;
      const k = bucketOf(yaw);
      expect(Number.isInteger(k) && k >= 0 && k < BUCKETS, `bucket ${k} of ${yaw}`).toBe(true);
      const off = Math.atan2(Math.sin(yaw - bucketYaw(k)), Math.cos(yaw - bucketYaw(k)));
      expect(Math.abs(off), `yaw ${yaw}`).toBeLessThanOrEqual(half + 1e-9);
    }
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(Math.PI * 2)).toBe(0);
    expect(bucketOf(-0.01)).toBe(0);
    expect(bucketOf(Math.PI)).toBe(BUCKETS / 2);
  });

  it('turn the sun the other way from the model, so a model placed at its bucket’s yaw is lit from the sun', () => {
    for (let k = 0; k < BUCKETS; k++) {
      const s = turnedSun(TONE_SUN, bucketYaw(k));
      // put the sun back through the placement's own turn
      const m = new Float32Array(16);
      place(m, 0, 0, 0, 0, bucketYaw(k));
      const back = [m[0] * s[0] + m[4] * s[1], m[1] * s[0] + m[5] * s[1], s[2]];
      expect(back[0]).toBeCloseTo(TONE_SUN[0], 6);
      expect(back[1]).toBeCloseTo(TONE_SUN[1], 6);
      expect(back[2]).toBeCloseTo(TONE_SUN[2], 6);
    }
  });
});

describe('toning a model', () => {
  const tiers: Tiers = [
    { from: 0.4, mul: [2, 2, 2] },
    { from: -0.05, mul: [1, 1, 1] },
    { from: -9, mul: [0.25, 0.25, 0.25] },
  ];

  it('puts every face in the first tier whose light it reaches, and every part of the tier is a tone of the part’s colour', () => {
    for (const [name, make] of PLAIN) {
      const plain = make();
      const model = toned(plain, TONE_SUN, () => tiers);
      for (const part of model.parts) {
        const k = Number(part.name.slice(part.name.lastIndexOf(' ') + 1));
        expect(Number.isInteger(k), `${name} ${part.name}`).toBe(true);
        for (const [x, y, z] of normals(part)) {
          const dot = x * TONE_SUN[0] + y * TONE_SUN[1] + z * TONE_SUN[2];
          expect(dot, `${name} ${part.name}: a face reached the tier`).toBeGreaterThanOrEqual(tiers[k].from - 1e-6);
          if (k > 0)
            expect(dot, `${name} ${part.name}: a face the tier above would take`).toBeLessThan(
              tiers[k - 1].from + 1e-6,
            );
        }
      }
    }
  });

  it('keeps every triangle: a toned model has as many as the one it was made from, and leaves a part with no tone alone', () => {
    for (const [name, make] of PLAIN) {
      const plain = make();
      expect(triangles(toned(plain, TONE_SUN, () => tiers)), name).toBe(triangles(plain));
      const none = toned(plain, TONE_SUN, () => null);
      expect(
        none.parts.map((p) => p.name),
        name,
      ).toEqual(plain.parts.map((p) => p.name));
    }
  });

  it('colours a tier as its part’s colour times its factor, and no channel past one', () => {
    const plain = bush(1.8);
    const colour = plain.parts[0].material;
    const model = toned(plain, TONE_SUN, () => tiers);
    for (const part of model.parts) {
      const k = Number(part.name.slice(part.name.lastIndexOf(' ') + 1));
      for (let c = 0; c < 3; c++) expect(part.material[c]).toBeCloseTo(Math.min(1, colour[c] * tiers[k].mul[c]), 9);
      expect(part.material[3]).toBe(colour[3]);
    }
  });

  it('leaves the trunk as it was, whole, in the colour of wood', () => {
    for (const name of ['broadleaf', 'conifer', 'golf tree']) {
      const make = PLAIN.find((p) => p[0] === name)![1];
      const plain = make();
      const model = toned(plain, TONE_SUN, sceneryRule(plain));
      const trunk = model.parts.filter((p) => p.name === 'trunk');
      expect(trunk, name).toHaveLength(1);
      expect(Array.from(trunk[0].mesh.positions), name).toEqual(Array.from(plain.parts[0].mesh.positions));
    }
  });
});

describe('the scenery’s tones', () => {
  it('are the figures chosen from the mock: a lit leaf about twice itself and a shaded one about a third, a rock in four', () => {
    expect(TONES.leaf.map((t) => t.mul)).toEqual([
      [2.0, 1.3, 1.6],
      [1.1, 0.95, 1.1],
      [0.26, 0.42, 0.6],
    ]);
    expect(TONES.pine.map((t) => t.mul)[2]).toEqual([0.55, 0.3, 0.37]);
    expect(TONES.rock).toHaveLength(4);
    // a darker tier is never a brighter one, in any colour, so the shade side is the dark side
    for (const [name, tiers] of Object.entries(TONES))
      for (let k = 1; k < tiers.length; k++)
        expect(tiers[k].mul[0] + tiers[k].mul[1] + tiers[k].mul[2], `${name} tier ${k}`).toBeLessThan(
          tiers[k - 1].mul[0] + tiers[k - 1].mul[1] + tiers[k - 1].mul[2],
        );
  });
});

/** Every set of toned models the scene builds, by the name it is drawn under, a model for each bucket. */
const SETS: [string, Model[], keyof typeof BUDGET][] = [
  ...Object.entries(SCENERY_MODELS).map(
    ([k, m]) => [`scenery ${k}`, m, k === 'rock' ? 'boulder' : k] as [string, Model[], keyof typeof BUDGET],
  ),
  ...Object.entries(BEYOND_MODELS).map(
    ([k, m]) => [`beyond ${k}`, m, k === 'rock' ? 'boulder' : k] as [string, Model[], keyof typeof BUDGET],
  ),
  ['far conifer', FAR_WOODS.conifer, 'farTree'],
  ['far broadleaf', FAR_WOODS.broadleaf, 'farTree'],
  ['golf tree', GOLF_TREES, 'golfTree'],
];

/**
 * A rock is five facets round, so which of them the lit tier takes (one or two of seventy-two degrees) is as coarse as the
 * rock is, and its lit side is no nearer the sun than a facet: the quarter turn is the most the worst of the scene's
 * rocks was found off, at 35 degrees, in bucket five of the scatter's.
 */
const ROCK_FACET = Math.PI / 4;

describe('the scene’s toned models', () => {
  it('are one for each bucket, each within its model’s budget at the size the scene builds it', () => {
    for (const [name, models, budget] of SETS) {
      expect(models, name).toHaveLength(name === 'golf tree' ? 1 : BUCKETS);
      for (const m of models) expect(triangles(m), `${name}: ${m.name}`).toBeLessThanOrEqual(BUDGET[budget]);
    }
  });

  it('hold as many triangles in every bucket as in the first', () => {
    for (const [name, models] of SETS) for (const m of models) expect(triangles(m), name).toBe(triangles(models[0]));
  });

  it('light the sunward side: at every bucket the lit tier, turned by the placement, faces the sun to within half a bucket', () => {
    const sunAzimuth = Math.atan2(TONE_SUN[1], TONE_SUN[0]);
    let checked = 0;
    for (const [name, models] of SETS) {
      if (name === 'golf tree') continue;
      models.forEach((model, k) => {
        const yaw = bucketYaw(k);
        const lit = model.parts.filter((p) => p.name.endsWith(' 0'));
        expect(lit.length, `${name} bucket ${k}`).toBeGreaterThan(0);
        // the sideways lean of the lit faces once the model is turned to its bucket, as the placement turns it
        let sx = 0,
          sy = 0;
        for (const part of lit)
          for (const [x, y] of normals(part)) {
            sx += x * Math.cos(yaw) - y * Math.sin(yaw);
            sy += x * Math.sin(yaw) + y * Math.cos(yaw);
          }
        const off = Math.atan2(Math.sin(Math.atan2(sy, sx) - sunAzimuth), Math.cos(Math.atan2(sy, sx) - sunAzimuth));
        expect(
          Math.abs(off),
          `${name} bucket ${k}: the lit side faces ${((off * 180) / Math.PI).toFixed(1)} degrees off the sun`,
        ).toBeLessThanOrEqual(name.endsWith('rock') ? ROCK_FACET : Math.PI / BUCKETS);
        checked++;
      });
    }
    // a check that found nothing to check passes in silence
    expect(checked).toBeGreaterThanOrEqual(10 * BUCKETS);
  });

  it('are made again the same, bucket for bucket', () => {
    const a = bucketed(() => bush(1.8), TONE_SUN, sceneryRule);
    const b = bucketed(() => bush(1.8), TONE_SUN, sceneryRule);
    expect(a.map((m) => m.parts.map((p) => Array.from(p.mesh.positions)))).toEqual(
      b.map((m) => m.parts.map((p) => Array.from(p.mesh.positions))),
    );
    expect(a).toHaveLength(BUCKETS);
  });
});

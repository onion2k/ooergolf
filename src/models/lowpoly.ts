/**
 * The scenery as the title picture has it: low-poly, cut with flat faces, so every facet catches the sun on its own and
 * a tree reads as a toy's. A broadleaf of faceted lumps with a lighter crown, a conifer of stacked faceted cones, a
 * boulder, a bush, a spiky fern, a cloud, and the golf tree to the physics' figures. What the ball meets stays the smooth
 * toy of `LOOK.md`; only what stands round the course is cut so (the user's choice of 8 October 2026, chunky over fine,
 * from a sheet of both). Without it the scenery is the puffballs of `decor.ts`, which the title does not have.
 *
 * Each stands on the ground at its origin, and what varies from one to the next comes from `seed`, so a hole is
 * dressed the same every time. Each is cheap: a broadleaf is about a hundred triangles, and the renderer draws every
 * placement three times a frame (the scene, the sun's map and the occlusion's depth), with no culling.
 */
import type { MeshBuilder } from 'artshape-render/mesh/types';
import { seeded } from '../random';
import { PALETTE, ROUGH } from './palette';
import { matte, type Model, type V3 } from './part';
import { at, built, faceOut, frustum, lump } from './shapes';

/**
 * How finely the faceted shapes are cut: the rings and segments of a lump, the sides of a cone and a trunk. Chunky, as
 * chosen: a lump of three rings and six segments is twenty-four facets.
 */
export const FACETS = { rings: 3, segments: 6, cone: 6, golfCone: 7, trunk: 6, rockRings: 3, rockSegments: 5 } as const;

/** A trunk of `sides` flat faces from radius `r` at the ground, tapering to seven tenths of it at `top`: open, since it stands in its canopy. */
function trunk(b: MeshBuilder, r: number, top: number, sides: number = FACETS.trunk) {
  frustum(b, at(0, 0, 0), sides, r * 1.25, r * 0.7, 0, top, { top: false });
}

/**
 * A broadleaf `height` tall: a trunk up into three faceted lumps round its middle and a lighter one on top, as a canopy
 * is lit from above. The crown's top is the tree's height.
 */
export function broadleaf({ height = 7, seed = 1 } = {}): Model {
  const random = seeded(seed * 9973 + 11);
  const { rings, segments } = FACETS;
  const R = 0.34 * height;
  const crownR = 0.68 * R;
  const crownZ = height - 0.6 * R;
  const turn = random() * Math.PI * 2;
  const leaves = built((b) => {
    for (let k = 0; k < 3; k++) {
      const a = turn + (k / 3) * Math.PI * 2;
      const r = R * (0.62 + random() * 0.1);
      lump(
        b,
        at(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, crownZ - 0.5 * R, a),
        random,
        rings,
        segments,
        [r, r, r * 0.9],
        {
          give: 0.12,
        },
      );
    }
  });
  // the crown's top stays where it is, `crownR * 0.88` above its middle, and that is the tree's height
  const crown = built((b) =>
    lump(
      b,
      at(0, 0, height - crownR * 0.88, random() * Math.PI * 2),
      random,
      rings,
      segments,
      [crownR, crownR, crownR * 0.88],
      {
        give: 0.12,
      },
    ),
  );
  return {
    name: 'broadleaf',
    parts: [
      {
        name: 'trunk',
        mesh: built((b) => trunk(b, 0.3 * (height / 7), 0.62 * height)),
        material: matte(PALETTE.trunk, ROUGH.wood),
      },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.leaves, ROUGH.leaves) },
      { name: 'crown', mesh: crown, material: matte(PALETTE.leavesLight, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/** A conifer `height` tall: `tiers` faceted cones stacked on a short trunk, each narrower than the one below. */
export function conifer({ height = 8, seed = 1, tiers = 4 } = {}): Model {
  const random = seeded(seed * 6151 + 5);
  const leaves = built((b) => {
    for (let k = 0; k < tiers; k++) {
      const z0 = height * (0.16 + (0.62 / tiers) * k);
      const z1 = k === tiers - 1 ? height : z0 + height * 0.36;
      const r = height * (0.3 - (0.17 / tiers) * k) * (0.92 + random() * 0.14);
      frustum(b, at(0, 0, 0), FACETS.cone, r, 0, z0, z1, { bottom: true, phase: random() * Math.PI });
    }
  });
  return {
    name: 'conifer',
    parts: [
      {
        name: 'trunk',
        mesh: built((b) => trunk(b, 0.22 * (height / 8), 0.3 * height, 5)),
        material: matte(PALETTE.trunk, ROUGH.wood),
      },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.pine, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/**
 * A boulder about `size` across each way from its middle: a faceted lump pushed in further than a canopy is, sunk a
 * little and flat underneath, so it sits on the ground and does not perch on it.
 */
export function boulder(size: number, { seed = 1, colour = PALETTE.rock } = {}): Model {
  const random = seeded(seed * 7727 + 1);
  const mesh = built((b) =>
    lump(
      b,
      at(0, 0, -size * 0.15, random() * Math.PI * 2),
      random,
      FACETS.rockRings,
      FACETS.rockSegments,
      [size, size * 0.82, size * 0.72],
      { give: 0.3, floor: -size * 0.1 },
    ),
  );
  return { name: 'boulder', parts: [{ name: 'rock', mesh, material: matte(colour, ROUGH.rock) }], moving: [] };
}

/** A round bush about `size` across from its middle: three faceted lumps, flattened where they meet the ground. */
export function bush(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 4441 + 9);
  const { rings, segments } = FACETS;
  const mesh = built((b) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + random();
      const r = size * (0.55 + random() * 0.2);
      lump(
        b,
        at(Math.cos(a) * size * 0.45, Math.sin(a) * size * 0.45, r * 0.4),
        random,
        rings,
        segments,
        [r, r, r * 0.85],
        {
          give: 0.15,
          floor: -r * 0.4,
        },
      );
    }
  });
  return { name: 'bush', parts: [{ name: 'bush', mesh, material: matte(PALETTE.hedge, ROUGH.leaves) }], moving: [] };
}

/** A spiky plant about `size` tall: `blades` thin three-sided spikes leaning out from its root, as the title's foreground has. */
export function fern(size: number, { seed = 1, blades = 9 } = {}): Model {
  const random = seeded(seed * 3301 + 2);
  const mesh = built((b) => {
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * Math.PI * 2 + random() * 0.5;
      const lean = 0.35 + random() * 0.5;
      const len = size * (0.7 + random() * 0.3);
      const tip: V3 = [Math.cos(a) * Math.sin(lean) * len, Math.sin(a) * Math.sin(lean) * len, Math.cos(lean) * len];
      const w = size * 0.16;
      const base = [0, 1, 2].map((i): V3 => [
        Math.cos(a + (i / 3) * Math.PI * 2) * w + Math.cos(a) * w,
        Math.sin(a + (i / 3) * Math.PI * 2) * w + Math.sin(a) * w,
        0,
      ]);
      const middle: V3 = [
        (base[0][0] + base[1][0] + base[2][0] + tip[0]) / 4,
        (base[0][1] + base[1][1] + base[2][1] + tip[1]) / 4,
        tip[2] / 4,
      ];
      for (let i = 0; i < 3; i++) faceOut(b, [base[i], base[(i + 1) % 3], tip], middle);
    }
  });
  return { name: 'fern', parts: [{ name: 'fern', mesh, material: matte(PALETTE.fern, ROUGH.leaves) }], moving: [] };
}

/** A cloud a unit across, to be scaled: a row of four white faceted lumps, the middle two the bigger, flattened underneath. */
export function cloud({ seed = 1 } = {}): Model {
  const random = seeded(seed * 2203 + 4);
  const { rings, segments } = FACETS;
  const mesh = built((b) => {
    for (let k = 0; k < 4; k++) {
      const x = (k / 3 - 0.5) * 1.6;
      const r = (k === 1 || k === 2 ? 0.6 : 0.4) * (0.85 + random() * 0.3);
      lump(b, at(x, (random() - 0.5) * 0.3, 0), random, rings, segments, [r, r * 0.8, r * 0.75], {
        give: 0.12,
        floor: -r * 0.25,
      });
    }
  });
  return { name: 'cloud', parts: [{ name: 'cloud', mesh, material: matte(PALETTE.cloud, 0.9) }], moving: [] };
}

/** The figures of a golf tree that the game tests a ball against: its trunk, and its canopy's base, width and tip. */
export interface GolfTreeFigures {
  trunk: number;
  base: number;
  radius: number;
  apex: number;
}

/**
 * A tree of golf as a faceted conifer, to the figures the game gives its physics: a trunk as wide as the physics' post,
 * and a canopy of three cones whose corners lie on circles no wider than the physics' cone at their height, so the flat
 * faces between them are inside it, and the cone is a ball's radius bigger again by the time a ball meets it: no ball is
 * seen inside a branch.
 */
export function golfTree({ trunk: post, base, radius, apex }: GolfTreeFigures, { seed = 1 } = {}): Model {
  const random = seeded(seed * 7919 + 3);
  const h = apex - base;
  // the physics' cone's radius at a height: from `radius` at its base straight to nothing at its apex
  const coneAt = (z: number) => radius * Math.max(0, (apex - z) / h);
  const leaves = built((b) => {
    for (let k = 0; k < 3; k++) {
      const z0 = base + (k / 3) * 0.7 * h;
      const z1 = k === 2 ? apex : z0 + 0.5 * h;
      const r = coneAt(z0) * (0.93 + random() * 0.04);
      frustum(b, at(0, 0, 0), FACETS.golfCone, r, 0, z0, z1, { bottom: true, phase: random() * Math.PI });
    }
  });
  return {
    name: 'golf tree',
    parts: [
      {
        name: 'trunk',
        mesh: built((b) => trunk(b, post * 0.8, base + 0.3 * h)),
        material: matte(PALETTE.trunk, ROUGH.wood),
      },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.pine, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/**
 * A stone at the water's edge, a unit in radius and two tall, its middle at its origin, to be scaled to the physics'
 * own: a squared slab of seven faces whose corners lie on the circle the ball meets, so what is drawn is what is met up
 * to its top, which is bevelled in a little, as the stones lining the title's river are.
 */
export function stone({ seed = 1 } = {}): Model {
  const random = seeded(seed * 5113 + 7);
  const phase = random() * Math.PI;
  const mesh = built((b) => {
    frustum(b, at(0, 0, 0), 7, 1, 0.96, -1, 0.82, { top: false, bottom: true, phase });
    frustum(b, at(0, 0, 0), 7, 0.96, 0.7, 0.82, 1, { phase });
  });
  return { name: 'stone', parts: [{ name: 'rock', mesh, material: matte(PALETTE.rock, ROUGH.rock) }], moving: [] };
}

/**
 * A tree on the far hills, a unit tall to be scaled: as few faces as still read as a conifer (two five-sided cones) or a
 * broadleaf (one lump of ten), since a hole has a thousand of them and the renderer draws every one three times a frame.
 */
export function farTree(kind: 'conifer' | 'broadleaf'): Model {
  const mesh = built((b) => {
    if (kind === 'conifer') {
      frustum(b, at(0, 0, 0), 5, 0.32, 0, 0.05, 0.62, { bottom: true });
      frustum(b, at(0, 0, 0), 5, 0.24, 0, 0.42, 1, { bottom: true, phase: 0.6 });
    } else lump(b, at(0, 0, 0.55), seeded(3), 2, 5, [0.38, 0.38, 0.45], { give: 0.1 });
  });
  const colour = kind === 'conifer' ? PALETTE.pine : PALETTE.leaves;
  return { name: `far ${kind}`, parts: [{ name: 'leaves', mesh, material: matte(colour, ROUGH.leaves) }], moving: [] };
}

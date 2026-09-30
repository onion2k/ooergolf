/**
 * The decoration: trees, hedges, flowers, rocks, bunting and fences, for fun
 * and for a hole to be somewhere. The physics never sees any of it, so its
 * sizes are for the eye, but each stands on the grass at its origin, and
 * each is cheap: a hole is dressed with forty or so, and the budget is what
 * keeps that from costing a frame. What varies from one to the next comes
 * from `seed`, so the same hole is dressed the same every time.
 *
 * Everything round is moulded smooth, as a toy is, from `smooth.ts`: a
 * canopy of puffs, a pine of rounded tiers, a pebble, a hedge rounded at
 * every edge, flowers of fat petals. Only what is flat, a pennant or a
 * picket, is cut with hard edges.
 */
import type { MeshBuilder } from 'artshape-render/mesh/types';
import { PALETTE, PENNANT_COLOURS, ROUGH } from './palette';
import { matte, type Colour, type Model, type Part, type V3 } from './part';
import { at, built, slab } from './shapes';
import { arc, ball, lathe, roundedBlock, tube } from './smooth';
import { seeded } from '../random';

/** How finely a round thing is cut: enough round its edge that it reads round at the size it is seen. */
const ROUND = {
  canopy: [8, 14],
  puff: [6, 10],
  trunk: 8,
  tier: 14,
  mound: 12,
  stem: 4,
  bloom: [3, 20],
  heart: [3, 6],
  knob: [4, 12],
  pebble: [7, 12],
} as const;

/**
 * A tree `height` tall, standing on the grass at its origin, on a trunk that
 * flares at its foot. A round one is a canopy of puffs: a ring of them
 * below, and a lighter crown on top, as a canopy is lit from above. A pine
 * is three rounded cones stacked.
 */
export function tree(kind: 'round' | 'pine', { height = 7, seed = 1 } = {}): Model {
  const random = seeded(seed * 104729 + 7);
  const s = height / 7;
  if (kind === 'round') {
    const R = 0.34 * height;
    const crownR = 0.6 * R;
    // the crown's top is the tree's height; the ring of puffs sits a little below its middle
    const crownZ = height - crownR;
    const ringZ = crownZ - 0.55 * R;
    const turn = random() * Math.PI * 2;
    const puffs = 4 + (random() < 0.5 ? 1 : 0);
    const leaves = built((b) => {
      for (let k = 0; k < puffs; k++) {
        const a = turn + (k / puffs) * Math.PI * 2 + (random() - 0.5) * 0.4;
        const r = R * (0.52 + random() * 0.08);
        const out = R * (0.48 + random() * 0.06);
        const z = ringZ + (random() - 0.5) * 0.16 * R;
        ball(b, at(Math.cos(a) * out, Math.sin(a) * out, z, a), [r, r, r * 0.92], ...ROUND.puff);
      }
    });
    const aside = turn + Math.PI * (0.8 + random() * 0.4);
    const crown = built((b) => {
      ball(b, at(0, 0, crownZ, turn), [crownR, crownR, crownR], ...ROUND.canopy);
      // a smaller puff to one side, so no two crowns are round alike
      const r = crownR * (0.62 + random() * 0.1);
      const out = R * 0.42;
      ball(b, at(Math.cos(aside) * out, Math.sin(aside) * out, crownZ - 0.25 * R, aside), [r, r, r], ...ROUND.puff);
    });
    return {
      name: 'round tree',
      parts: [
        { name: 'trunk', material: matte(PALETTE.trunk, ROUGH.wood), mesh: trunk(0.42 * s, 0.26 * s, 0.55 * height) },
        { name: 'leaves', mesh: leaves, material: matte(PALETTE.leaves, ROUGH.leaves) },
        { name: 'crown', mesh: crown, material: matte(PALETTE.leavesLight, ROUGH.leaves) },
      ],
      moving: [],
    };
  }
  const leaves = built((b) => {
    for (let k = 0; k < 3; k++) {
      const z0 = height * (0.18 + 0.2 * k);
      const z1 = k === 2 ? height : z0 + height * 0.42;
      const r = height * (0.3 - 0.06 * k) * (0.92 + random() * 0.16);
      lathe(b, at(0, 0, 0), tier(r, z0, z1, k === 2), ROUND.tier, random() * Math.PI);
    }
  });
  return {
    name: 'pine',
    parts: [
      { name: 'trunk', material: matte(PALETTE.trunk, ROUGH.wood), mesh: trunk(0.3 * s, 0.2 * s, 0.35 * height) },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.pine, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/** How many sides a golf tree's tier has: a hole may have a hundred of them, so fewer than the decoration's, which are few. */
const GOLF_TIER = 10;

/** The figures of a golf tree that the game tests a ball against: its trunk, and its canopy's base, width and tip. */
export interface GolfTreeFigures {
  trunk: number;
  base: number;
  radius: number;
  apex: number;
}

/**
 * A tree of golf: a trunk standing up into a canopy of two rounded tiers, a wide low one and a narrower one above it, to
 * the figures the game gives its physics (the canopy's base, its width there, and its tip, over a post for the trunk),
 * so what is seen is what the ball meets. The tiers lie a whisker inside the physics' cone, which is a ball's radius
 * bigger than they are all round by the time it is met, so a ball is never seen inside a branch.
 */
export function golfTree({ trunk: post, base, radius, apex }: GolfTreeFigures, { seed = 1 } = {}): Model {
  const random = seeded(seed * 7919 + 3);
  const h = apex - base;
  const leaves = built((b) => {
    lathe(
      b,
      at(0, 0, 0),
      tier(radius * (0.95 + random() * 0.03), base, base + 0.62 * h, false),
      GOLF_TIER,
      random() * Math.PI,
    );
    lathe(
      b,
      at(0, 0, 0),
      tier(radius * (0.66 + random() * 0.03), base + 0.4 * h, apex, true),
      GOLF_TIER,
      random() * Math.PI,
    );
  });
  return {
    name: 'golf tree',
    parts: [
      { name: 'trunk', material: matte(PALETTE.trunk, ROUGH.wood), mesh: trunk(post, post * 0.8, base + 0.3 * h) },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.pine, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/**
 * A stake that marks out of bounds: a slim white post with a red cap, standing on the ground at its origin, a yard or
 * two tall, which is drawn along the line where the course ends. The physics never sees it.
 */
export function stake({ height = 1.8, radius = 0.2 } = {}): Model {
  const post = built((b) =>
    lathe(
      b,
      at(0, 0, 0),
      [
        [radius * 1.15, 0],
        [radius, height * 0.12],
        [radius, height * 0.82],
      ],
      ROUND.stem + 4,
    ),
  );
  const cap = built((b) =>
    ball(b, at(0, 0, height * 0.88), [radius * 1.25, radius * 1.25, radius * 1.5], ...ROUND.knob),
  );
  return {
    name: 'stake',
    parts: [
      { name: 'post', material: matte(PALETTE.cream, ROUGH.wood), mesh: post },
      { name: 'cap', material: matte(PALETTE.plastic.red, ROUGH.wood), mesh: cap },
    ],
    moving: [],
  };
}

/** A trunk from `r0` at the grass to `r1` at `top`, flaring at its foot, open at both ends: its top is in the leaves. */
function trunk(r0: number, r1: number, top: number) {
  return built((b) =>
    lathe(
      b,
      at(0, 0, 0),
      [
        [r0 * 1.35, 0],
        [r0 * 1.02, top * 0.12],
        [r0 * 0.9, top * 0.3],
        [r1, top],
      ],
      ROUND.trunk,
    ),
  );
}

/**
 * One tier of a pine, as its outline from the axis under it round to its
 * tip: a flat underside, a rim rounded as a cushion's, a straight side, and
 * a tip rounded off, the side meeting each rounding square so it has no
 * crease. The top tier's tip is rounder, since it is seen.
 */
function tier(r: number, z0: number, z1: number, top: boolean): [number, number][] {
  const rim = r * 0.22,
    tip = top ? r * 0.16 : r * 0.1;
  // the rim's and the tip's circles, and the side the tangent to both on the outside
  const [c1r, c1z] = [r - rim, z0 + rim],
    [c2r, c2z] = [0, z1 - tip];
  const dr = c2r - c1r,
    dz = c2z - c1z;
  const side = Math.atan2(dz, dr) - Math.acos((rim - tip) / Math.hypot(dr, dz));
  return [[0, z0], ...arc(c1r, c1z, rim, -Math.PI / 2, side, 3), ...arc(c2r, c2z, tip, side, Math.PI / 2, top ? 3 : 1)];
}

/** A clipped hedge `w` along X, `d` deep and `h` high, standing on the grass at its origin, rounded at every edge. */
export function hedge(w: number, d: number, h: number): Model {
  const r = Math.min(0.4 * d, 0.4 * h, w / 2);
  return {
    name: 'hedge',
    parts: [
      {
        name: 'hedge',
        material: matte(PALETTE.hedge, ROUGH.leaves),
        mesh: built((b) => roundedBlock(b, at(0, 0, h / 2), w / 2, d / 2, h / 2, r, 4)),
      },
    ],
    moving: [],
  };
}

/** How high a flower's blooms stand at the model's own size: the shortest, how much taller they may be, and the crown's. */
export const BLOOM_TOPS = { least: 2.4, spread: 0.3, crown: 2.8 } as const;

/**
 * A clump of flowers in `colour`, standing on the grass at its origin: a
 * low round mound of leaves, and `count` blooms on stems that carry them
 * up out of the long grass, each five fat petals round a heart, big enough to
 * read as a flower from the tee. The rough's blades grow to a unit and
 * three-fifths and a third as much again, and a clump is placed as small as
 * four fifths of this, so the blooms stand at two and a half or so: any lower
 * and they are lost in the blades, which is what `BLOOM_TOPS` says.
 */
export function flowers(colour: Colour, { seed = 1, count = 3 } = {}): Model {
  const random = seeded(seed * 15485863 + 3);
  const heart: Colour = colour[1] > 0.6 && colour[2] < 0.1 ? PALETTE.plastic.orange : PALETTE.plastic.yellow;
  // a round bush a unit high, the stems' foot
  const mound: [number, number][] = [
    [1.05, 0],
    [1.02, 0.3],
    [0.85, 0.66],
    [0.5, 0.92],
    [0, 1],
  ];
  /** How high the mound stands `d` out from its middle. */
  const moundAt = (d: number) => Math.sqrt(Math.max(0, 1 - (d / 1.05) ** 2));
  // a few round the mound's crown, evenly, and past three one on top, tallest; each on a stem that leans a little out
  const ring = count > 3 ? count - 1 : count;
  const blooms: V3[] = [];
  const stems: [V3, V3][] = [];
  const turn = random() * Math.PI * 2;
  for (let k = 0; k < count; k++) {
    const onTop = k === ring;
    const a = turn + (k / ring) * Math.PI * 2 + (random() - 0.5) * 0.4;
    const d = onTop ? 0.05 : 0.45 + random() * 0.1;
    const top = onTop ? BLOOM_TOPS.crown : BLOOM_TOPS.least + random() * BLOOM_TOPS.spread;
    blooms.push([Math.cos(a) * d, Math.sin(a) * d, top]);
    stems.push([
      [Math.cos(a) * d * 0.3, Math.sin(a) * d * 0.3, moundAt(d * 0.3) * 0.9],
      [Math.cos(a) * d, Math.sin(a) * d, top - 0.05],
    ]);
  }
  // each bloom one flat ball pushed out into five fat petals: seen from the tee a bloom is a few pixels, and five
  // balls of petals there cost a frame far more than they showed
  const petals = built((b) => {
    for (const [x, y, z] of blooms)
      ball(b, at(x, y, z, random() * Math.PI), [0.36, 0.36, 0.1], ...ROUND.bloom, (px, py) => {
        // broad round lobes with a notch between them, and none of it at the poles, which stay where they are
        const lobe = 0.72 + 0.34 * Math.sqrt((1 + Math.cos(5 * Math.atan2(py, px))) / 2);
        return 1 + (lobe - 1) * Math.hypot(px, py);
      });
  });
  const hearts = built((b) => {
    for (const [x, y, z] of blooms) ball(b, at(x, y, z + 0.06), [0.15, 0.15, 0.1], ...ROUND.heart);
  });
  return {
    name: 'flowers',
    parts: [
      {
        name: 'leaves',
        mesh: built((b) => {
          lathe(b, at(0, 0, 0), mound, ROUND.mound);
          for (const stem of stems) tube(b, stem, 0.07, ROUND.stem);
        }),
        material: matte(PALETTE.stem, ROUGH.leaves),
      },
      { name: 'petals', mesh: petals, material: matte(colour, 0.5) },
      { name: 'hearts', mesh: hearts, material: matte(heart, 0.5) },
    ],
    moving: [],
  };
}

/** A pebble about `size` across each way from its middle, sunk a little into the grass at its origin, its own shape for its seed. */
export function rock(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 7727 + 1);
  const [p, q, w] = [random(), random(), random()].map((v) => v * Math.PI * 2);
  // pushed gently in and out, never so far it has a dent: a pebble the sea has worn, not a lump
  const push = (x: number, y: number, z: number) =>
    1 - 0.07 * (1 + Math.sin(2.2 * x + p) * Math.cos(1.9 * y + q)) - 0.05 * (1 + Math.sin(2.6 * z + w));
  const mesh = built((b) =>
    ball(b, at(0, 0, -size * 0.12, random() * Math.PI * 2), [size, size * 0.85, size * 0.7], ...ROUND.pebble, push),
  );
  return { name: 'rock', parts: [{ name: 'rock', mesh, material: matte(PALETTE.rock, ROUGH.rock) }], moving: [] };
}

/** A post of radius `r` up to `height`, with a ball on top as wide as `knob`: smooth, as the bunting's and the fence's are. */
function post(b: MeshBuilder, x: number, r: number, knob: number, height: number) {
  lathe(
    b,
    at(x, 0, 0),
    [
      [r, 0],
      [r, height - knob],
    ],
    ROUND.trunk,
  );
  ball(b, at(x, 0, height - knob), [knob, knob, knob], ...ROUND.knob);
}

/**
 * Bunting: two white posts `length` apart across X, the origin between
 * their feet, each with a ball on top, a string sagging between them, and
 * pennants hanging from it in turn of colour. The pennants face ±Y.
 */
export function bunting(length: number, { height = 3.2, seed = 1 } = {}): Model {
  const knob = 0.24,
    tie = height - 0.2;
  const sag = Math.min(0.8, length * 0.06);
  /** How high the string is at `x`: a parabola through both ties, `sag` down in the middle. */
  const string = (x: number) => tie - sag * (1 - ((2 * x) / length) ** 2);
  const posts = built((b) => {
    for (const side of [-1, 1]) post(b, (side * length) / 2, 0.13, knob, height);
  });
  const segments = Math.max(4, Math.round(length / 1.2));
  const line: V3[] = [];
  for (let k = 0; k <= segments; k++) {
    const x = -length / 2 + (k / segments) * length;
    line.push([x, 0, string(x)]);
  }
  const cord = built((b) => tube(b, line, 0.04, 4));
  const [pw, ph] = [0.7, 0.85];
  const count = Math.max(2, Math.floor((length - 1) / 0.95));
  const byColour = PENNANT_COLOURS.map(() => [] as number[]);
  const first = Math.floor(seeded(seed * 31 + 5)() * PENNANT_COLOURS.length);
  for (let k = 0; k < count; k++) {
    const x = -length / 2 + ((k + 1) / (count + 1)) * length;
    byColour[(first + k) % PENNANT_COLOURS.length].push(x);
  }
  const pennants: Part[] = byColour
    .map((xs, c) => ({
      name: `pennants-${c}`,
      material: matte(PENNANT_COLOURS[c], 0.5),
      mesh: built((b) => {
        for (const x of xs)
          slab(
            b,
            at(x, 0, string(x) - 0.02),
            [
              [-pw / 2, 0],
              [0, -ph],
              [pw / 2, 0],
            ],
            0.05,
          );
      }),
    }))
    .filter((p) => p.mesh.indices.length > 0);
  return {
    name: 'bunting',
    parts: [
      { name: 'posts', mesh: posts, material: matte(PALETTE.paint, ROUGH.paint) },
      { name: 'string', mesh: cord, material: matte(PALETTE.string, ROUGH.paint) },
      ...pennants,
    ],
    moving: [],
  };
}

/**
 * A white picket fence `length` along X and `height` high, the origin the
 * middle of its foot: a round post with a ball on top at each end and every
 * three units between, two round rails through them, and pickets with round
 * tops nailed across the front, facing -Y.
 */
export function fence(length: number, { height = 1.4 } = {}): Model {
  const p = 0.11,
    knob = 0.15;
  const spans = Math.max(1, Math.ceil((length - 2 * knob) / 3));
  const posts = built((b) => {
    for (let k = 0; k <= spans; k++) post(b, -length / 2 + knob + (k / spans) * (length - 2 * knob), p, knob, height);
  });
  const rails = built((b) => {
    for (const z of [0.3 * height, 0.7 * height])
      tube(
        b,
        [
          [-length / 2 + knob, 0, z],
          [length / 2 - knob, 0, z],
        ],
        0.07,
        6,
      );
  });
  const inner = length - 4 * knob;
  const count = Math.max(1, Math.floor(inner / 0.5));
  const pw = 0.13,
    top = height - 0.15;
  // a picket's outline, its top a half circle
  const outline: [number, number][] = [[-pw, 0.08], [pw, 0.08], ...arc(0, top - pw, pw, 0, Math.PI, 4)];
  const pickets = built((b) => {
    for (let k = 0; k < count; k++) slab(b, at(-inner / 2 + ((k + 0.5) / count) * inner, -p - 0.05, 0), outline, 0.06);
  });
  const paint = matte(PALETTE.paint, ROUGH.paint);
  return {
    name: 'fence',
    parts: [
      { name: 'posts', mesh: posts, material: paint },
      { name: 'rails', mesh: rails, material: paint },
      { name: 'pickets', mesh: pickets, material: paint },
    ],
    moving: [],
  };
}

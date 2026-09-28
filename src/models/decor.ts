/**
 * The decoration: trees, hedges, flowers, rocks, bunting and fences, for fun
 * and for a hole to be somewhere. The physics never sees any of it, so its
 * sizes are for the eye, but each stands on the grass at its origin, and
 * each is cheap: a hole is dressed with forty or so, and the budget is what
 * keeps that from costing a frame. What varies from one to the next comes
 * from `seed`, so the same hole is dressed the same every time.
 */
import { PALETTE, PENNANT_COLOURS, ROUGH } from './palette';
import { PATTERN, matte, type Colour, type Model, type Part } from './part';
import { at, built, frustum, lump, prism, rod, roundedBox, slab } from './shapes';
import { seeded } from '../random';

/**
 * A tree `height` tall, standing on the grass at its origin: a trunk and a
 * faceted canopy. A round one is a big lump and two small ones; a pine is
 * three cones stacked.
 */
export function tree(kind: 'round' | 'pine', { height = 7, seed = 1 } = {}): Model {
  const random = seeded(seed * 104729 + 7);
  const s = height / 7;
  const here = at(0, 0, 0);
  if (kind === 'round') {
    const R = 0.34 * height;
    const zc = height - R;
    const turn = random() * Math.PI * 2;
    const leaves = built((b) => {
      lump(b, at(0, 0, zc, turn), random, 4, 8, [R * 1.05, R * 1.05, R]);
      for (const side of [-1, 1]) {
        const a = turn + side * (1.2 + random() * 0.6);
        const r = R * (0.55 + random() * 0.12);
        lump(b, at(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, zc - R * 0.3, a), random, 3, 6, [r, r, r * 0.9]);
      }
    });
    return {
      name: 'round tree',
      parts: [
        {
          name: 'trunk',
          material: matte(PALETTE.trunk, ROUGH.wood),
          mesh: built((b) => frustum(b, here, 6, 0.42 * s, 0.28 * s, 0, 0.55 * height, { top: false })),
        },
        { name: 'leaves', mesh: leaves, material: matte(PALETTE.leaves, ROUGH.leaves) },
      ],
      moving: [],
    };
  }
  const leaves = built((b) => {
    for (let k = 0; k < 3; k++) {
      const z0 = height * (0.18 + 0.2 * k);
      const z1 = k === 2 ? height : z0 + height * 0.42;
      const r = height * (0.3 - 0.06 * k) * (0.92 + random() * 0.16);
      frustum(b, here, 8, r, 0, z0, z1, { bottom: true, phase: random() * Math.PI });
    }
  });
  return {
    name: 'pine',
    parts: [
      {
        name: 'trunk',
        material: matte(PALETTE.trunk, ROUGH.wood),
        mesh: built((b) => frustum(b, here, 6, 0.3 * s, 0.2 * s, 0, 0.35 * height, { top: false })),
      },
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.pine, ROUGH.leaves) },
    ],
    moving: [],
  };
}

/** A clipped hedge `w` along X, `d` deep and `h` high, standing on the grass at its origin, speckled with lighter leaves. */
export function hedge(w: number, d: number, h: number, { seed = 1 } = {}): Model {
  const e = Math.min(0.3, d / 4, h / 4);
  return {
    name: 'hedge',
    parts: [
      {
        name: 'hedge',
        material: matte(PALETTE.hedge, ROUGH.leaves),
        pattern: { kind: PATTERN.speckle, scale: 0.55, seed: (seed * 0.31) % 1, second: PALETTE.hedgeLight },
        mesh: built((b) => roundedBox(b, at(0, 0, h / 2), w / 2, d / 2, h / 2, e)),
      },
    ],
    moving: [],
  };
}

/**
 * A clump of flowers in `colour`, standing on the grass at its origin: a low
 * mound of leaves, and `count` blooms on stems above it, each a cup of five
 * petals with a yellow middle.
 */
export function flowers(colour: Colour, { seed = 1, count = 5 } = {}): Model {
  const random = seeded(seed * 15485863 + 3);
  const heart: Colour = colour[1] > 0.6 && colour[2] < 0.1 ? PALETTE.plastic.orange : PALETTE.plastic.yellow;
  const blooms: [number, number, number][] = [];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + random() * 0.8;
    const d = k === 0 ? 0 : 0.55 + random() * 0.4;
    blooms.push([Math.cos(a) * d, Math.sin(a) * d, 0.8 + random() * 0.6]);
  }
  const leaves = built((b) => {
    lump(b, at(0, 0, 0, random() * 3), random, 3, 6, [1.1, 1.1, 0.55], { floor: 0 });
    for (const [x, y, z] of blooms) rod(b, [x * 0.5, y * 0.5, 0.15], [x, y, z], 0.07, 3);
  });
  const petals = built((b) => {
    for (const [x, y, z] of blooms) frustum(b, at(x, y, z, random()), 5, 0.15, 0.45, 0, 0.22, { bottom: true });
  });
  const hearts = built((b) => {
    for (const [x, y, z] of blooms) frustum(b, at(x, y, z + 0.22), 5, 0.18, 0, 0, 0.13, { bottom: true });
  });
  return {
    name: 'flowers',
    parts: [
      { name: 'leaves', mesh: leaves, material: matte(PALETTE.stem, ROUGH.leaves) },
      { name: 'petals', mesh: petals, material: matte(colour, 0.5) },
      { name: 'hearts', mesh: hearts, material: matte(heart, 0.5) },
    ],
    moving: [],
  };
}

/** A rock about `size` across each way from its middle, sunk a little into the grass at its origin, its own shape for its seed. */
export function rock(size: number, { seed = 1 } = {}): Model {
  const random = seeded(seed * 7727 + 1);
  const mesh = built((b) =>
    lump(b, at(0, 0, -size * 0.12, random() * Math.PI * 2), random, 4, 7, [size, size * 0.85, size * 0.62], {
      give: 0.25,
    }),
  );
  return {
    name: 'rock',
    parts: [
      {
        name: 'rock',
        mesh,
        material: matte(PALETTE.rock, ROUGH.rock),
        pattern: { kind: PATTERN.speckle, scale: 0.5, seed: (seed * 0.29) % 1, second: PALETTE.rockGrain },
      },
    ],
    moving: [],
  };
}

/**
 * Bunting: two white posts `length` apart across X, the origin between
 * their feet, a string sagging between their tops, and pennants hanging from
 * it in turn of colour. The pennants face ±Y.
 */
export function bunting(length: number, { height = 3.2, seed = 1 } = {}): Model {
  const post = 0.14,
    tie = height - 0.2;
  const sag = Math.min(0.8, length * 0.06);
  /** How high the string is at `x`: a parabola through both ties, `sag` down in the middle. */
  const string = (x: number) => tie - sag * (1 - ((2 * x) / length) ** 2);
  const posts = built((b) => {
    for (const side of [-1, 1]) frustum(b, at((side * length) / 2, 0, 0), 8, post, post, 0, height);
  });
  const segments = Math.max(4, Math.round(length / 1.2));
  const cord = built((b) => {
    for (let k = 0; k < segments; k++) {
      const xa = -length / 2 + (k / segments) * length,
        xb = -length / 2 + ((k + 1) / segments) * length;
      rod(b, [xa, 0, string(xa)], [xb, 0, string(xb)], 0.035, 3);
    }
  });
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
 * middle of its foot: a post at each end and every three units between, two
 * rails through them, and pointed pickets nailed across the front, facing -Y.
 */
export function fence(length: number, { height = 1.4 } = {}): Model {
  const p = 0.12;
  const spans = Math.max(1, Math.ceil((length - 2 * p) / 3));
  const mesh = built((b) => {
    for (let k = 0; k <= spans; k++) {
      const x = -length / 2 + p + (k / spans) * (length - 2 * p);
      prism(
        b,
        at(x, 0, 0),
        [
          [-p, -p],
          [p, -p],
          [p, p],
          [-p, p],
        ],
        0,
        height - p,
        { top: false },
      );
      frustum(b, at(x, 0, 0), 4, p * Math.SQRT2, 0, height - p, height, { phase: Math.PI / 4 });
    }
    for (const z of [0.3 * height, 0.7 * height])
      prism(
        b,
        at(0, 0, 0),
        [
          [-length / 2 + p, -0.04],
          [length / 2 - p, -0.04],
          [length / 2 - p, 0.04],
          [-length / 2 + p, 0.04],
        ],
        z - 0.07,
        z + 0.07,
        { bottom: true },
      );
    const inner = length - 4 * p;
    const pickets = Math.max(1, Math.floor(inner / 0.5));
    const pw = 0.13,
      top = height - 0.15;
    for (let k = 0; k < pickets; k++) {
      const x = -inner / 2 + ((k + 0.5) / pickets) * inner;
      slab(
        b,
        at(x, -p - 0.03, 0),
        [
          [-pw, 0.08],
          [pw, 0.08],
          [pw, top - pw],
          [0, top],
          [-pw, top - pw],
        ],
        0.06,
      );
    }
  });
  return { name: 'fence', parts: [{ name: 'fence', mesh, material: matte(PALETTE.paint, ROUGH.paint) }], moving: [] };
}

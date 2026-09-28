/**
 * The obstacles, each drawn to exactly the size the physics gives it, since
 * the ball bouncing off a bumper a hair outside its drawn edge, or rolling
 * through the tip of a blade, is the first thing a player would notice. Each
 * takes the sizes that matter to play as arguments, and says in its comment
 * where its origin is and which way it faces. What turns or runs is a part
 * of its own, in `moving`, for the game to place each frame.
 */
import { MeshBuilder } from 'artshape-render/mesh/types';
import { face } from '../meshes';
import { PALETTE, ROUGH } from './palette';
import { PATTERN, matte, type Colour, type Model, type V3 } from './part';
import { annulus, at, block, built, faceOut, facingSouth, frustum, roundedBox } from './shapes';
import { seeded } from '../random';

/**
 * A bumper: a round post of `radius` standing `height` on the grass, its
 * origin the middle of its foot. Its sides are a polygon with its points on
 * the circle, so it is never wider than the physics' circle and a sixteenth
 * of a turn inside it at most; a white band round its middle, flush with
 * the post, and a bevelled top.
 */
export function bumper(
  radius: number,
  {
    height = 1.6,
    colour = PALETTE.plastic.red,
    band = PALETTE.cream,
  }: { height?: number; colour?: Colour; band?: Colour } = {},
): Model {
  const n = 16,
    r = radius,
    h = height;
  const bevel = Math.min(0.18, 0.12 * h, 0.3 * r);
  const [b0, b1] = [0.38 * h, 0.64 * h];
  const here = at(0, 0, 0);
  return {
    name: 'bumper',
    parts: [
      {
        name: 'post',
        material: matte(colour, ROUGH.plastic),
        mesh: built((b) => {
          frustum(b, here, n, r, r, 0, b0, { top: false });
          frustum(b, here, n, r, r, b1, h - bevel, { top: false });
          frustum(b, here, n, r, r - bevel, h - bevel, h);
        }),
      },
      {
        name: 'band',
        material: matte(band, ROUGH.plastic),
        mesh: built((b) => frustum(b, here, n, r, r, b0, b1, { top: false })),
      },
    ],
    moving: [],
  };
}

/**
 * A sliding barrier: a block of half extents `hx`, `hy` and `hz` with every
 * edge rounded off inside them, its origin its middle, as the physics' box
 * is. The game puts it where the body is, the middle `hz` above the grass
 * for one that slides along it.
 */
export function barrier(hx: number, hy: number, hz: number, { colour = PALETTE.plastic.yellow } = {}): Model {
  const e = Math.min(0.22, 0.35 * Math.min(hx, hy, hz));
  return {
    name: 'barrier',
    parts: [
      {
        name: 'block',
        material: matte(colour, ROUGH.plastic),
        mesh: built((b) => roundedBox(b, at(0, 0, 0), hx, hy, hz, e)),
      },
    ],
    moving: [],
  };
}

/** The windmill's figures that are not the game's to choose. */
export const WINDMILL = {
  /** How far above the grass a blade pointing straight down comes: under the ball's middle, so it always stops it. */
  tipClearance: 0.35,
  /** How thick the tower's wall is either side of the way through, and how deep the tower is along it. */
  wall: 1.5,
  depth: 4.2,
  /** How high the way through goes straight up before its arch begins: higher than the ball. */
  spring: 2.2,
  /** How far in front of the tower the blades turn. */
  clearance: 0.25,
} as const;

/** A box of the tower the physics walls in: a middle and half extents across and along, in the tower's frame. */
export interface Footprint {
  x: number;
  y: number;
  hx: number;
  hy: number;
}

/** A windmill, with what the game needs to place and collide it. */
export interface Windmill extends Model {
  /** Where the blades turn, in the tower's frame: they turn about the Y axis through it. */
  hub: V3;
  /** The tower either side of the way through, as the physics' boxes. */
  sides: Footprint[];
  /** How high the way through is straight-sided before its arch. */
  spring: number;
  gap: number;
  bladeLength: number;
  bladeThickness: number;
  bladeWidth: number;
}

/**
 * A windmill: a tower with a way through it along Y, `gap` wide, under an
 * arch, and four blades turning in front of it across the way in, each a box
 * `bladeLength` from the hub, `bladeWidth` across and `bladeThickness` along
 * the axle: exactly the four boxes the physics collides. The tower's origin
 * is the middle of its foot; the way in faces -Y, toward the tee, and the
 * blades turn in front of it about an axle along Y at `hub`, low enough that
 * a blade pointing down all but touches the grass. The blades are in
 * `moving`, drawn at the hub's origin: `placeBlades` puts them there.
 */
export function windmill({
  gap = 3.4,
  bladeLength = 5.5,
  bladeThickness = 0.6,
  bladeWidth = 1.4,
}: { gap?: number; bladeLength?: number; bladeThickness?: number; bladeWidth?: number } = {}): Windmill {
  const { wall, depth, spring, clearance } = WINDMILL;
  const [g, L, t, w] = [gap, bladeLength, bladeThickness, bladeWidth];
  const W = g + 2 * wall,
    D = depth;
  const archTop = spring + g / 2;
  const base = archTop + 1.0;
  const hubZ = L + WINDMILL.tipClearance;
  const hubY = -D / 2 - clearance - t / 2;
  // the tower above the base: an octagon a flat face to the front, narrowing to its roof
  const ring = 8,
    phase = Math.PI / ring;
  const apothem0 = (Math.min(W, D) / 2) * 0.92,
    apothem1 = apothem0 * 0.68;
  const r0 = apothem0 / Math.cos(phase),
    r1 = apothem1 / Math.cos(phase);
  const top = Math.max(hubZ + 1.8, base + 3.5);
  const roofR = r1 + 0.5,
    roofH = 2.6;
  const archSteps = 8;
  /** The arch's points, from the left springing over to the right, in (x, z). */
  const arch: [number, number][] = [];
  for (let k = 0; k <= archSteps; k++) {
    const a = Math.PI - (k / archSteps) * Math.PI;
    arch.push([(Math.cos(a) * g) / 2, spring + (Math.sin(a) * g) / 2]);
  }
  const here = at(0, 0, 0);
  const middle: V3 = [0, 0, base / 2];

  const walls = built((b) => {
    // the front and the back, each with the arch cut from it
    for (const y of [-D / 2, D / 2]) {
      const p = (x: number, z: number): V3 => [x, y, z];
      faceOut(b, [p(-W / 2, 0), p(-g / 2, 0), p(-g / 2, base), p(-W / 2, base)], middle);
      faceOut(b, [p(g / 2, 0), p(W / 2, 0), p(W / 2, base), p(g / 2, base)], middle);
      for (let k = 0; k < archSteps; k++) {
        const [[x0, z0], [x1, z1]] = [arch[k], arch[k + 1]];
        faceOut(b, [p(x0, z0), p(x1, z1), p(x1, base), p(x0, base)], middle);
      }
    }
    // the ends and the top of the base
    faceOut(
      b,
      [
        [-W / 2, -D / 2, 0],
        [-W / 2, D / 2, 0],
        [-W / 2, D / 2, base],
        [-W / 2, -D / 2, base],
      ],
      middle,
    );
    faceOut(
      b,
      [
        [W / 2, -D / 2, 0],
        [W / 2, D / 2, 0],
        [W / 2, D / 2, base],
        [W / 2, -D / 2, base],
      ],
      middle,
    );
    faceOut(
      b,
      [
        [-W / 2, -D / 2, base],
        [W / 2, -D / 2, base],
        [W / 2, D / 2, base],
        [-W / 2, D / 2, base],
      ],
      middle,
    );
    // the tower, open at the top where the roof sits on it
    frustum(b, here, ring, r0, r1, base, top, { top: false, phase });
  });

  const door = built((b) => {
    // the way through: its straight sides, facing in, and the underside of its arch
    faceOut(
      b,
      [
        [-g / 2, -D / 2, 0],
        [-g / 2, D / 2, 0],
        [-g / 2, D / 2, spring],
        [-g / 2, -D / 2, spring],
      ],
      [-W / 2, 0, 1],
    );
    faceOut(
      b,
      [
        [g / 2, -D / 2, 0],
        [g / 2, D / 2, 0],
        [g / 2, D / 2, spring],
        [g / 2, -D / 2, spring],
      ],
      [W / 2, 0, 1],
    );
    for (let k = 0; k < archSteps; k++) {
      const [[x0, z0], [x1, z1]] = [arch[k], arch[k + 1]];
      // a point outside the arch's circle, which is where the solid is
      const out: V3 = [x0 + x1, 0, z0 + z1 - spring];
      faceOut(
        b,
        [
          [x0, -D / 2, z0],
          [x1, -D / 2, z1],
          [x1, D / 2, z1],
          [x0, D / 2, z0],
        ],
        out,
      );
    }
  });

  const roof = built((b) => frustum(b, here, ring, roofR, 0, top - 0.05, top + roofH, { bottom: true, phase }));

  // the axle from the tower's face out to the blades, and a cap on the hub in front of them; neither turns
  const face0 = apothem0 + ((apothem1 - apothem0) * (hubZ - base)) / (top - base);
  const hub = built((b) => {
    const back = hubY + t / 2;
    frustum(b, facingSouth(0, -face0 + 0.1, hubZ), ring, 0.32, 0.32, 0, 0.1 - face0 - back, { top: false, phase });
    frustum(b, facingSouth(0, hubY - t / 2 - 0.02, hubZ), ring, 0.7, 0.45, 0, 0.45, { phase });
  });

  // the blades, drawn about the hub: one pair a single bar across X, the other pair either side of it along Z
  const sailsA = built((b) => block(b, here, -L, L, -t / 2, t / 2, -w / 2, w / 2, true));
  const sailsB = built((b) => {
    block(b, here, -w / 2, w / 2, -t / 2, t / 2, w / 2, L, true);
    block(b, here, -w / 2, w / 2, -t / 2, t / 2, -L, -w / 2, true);
  });

  return {
    name: 'windmill',
    parts: [
      { name: 'walls', mesh: walls, material: matte(PALETTE.windmillWall, ROUGH.paint) },
      { name: 'door', mesh: door, material: matte(PALETTE.windmillDoor, ROUGH.wood) },
      { name: 'roof', mesh: roof, material: matte(PALETTE.roof, ROUGH.plastic) },
      { name: 'hub', mesh: hub, material: matte(PALETTE.gold, ROUGH.metal) },
    ],
    moving: [
      { name: 'sailsA', mesh: sailsA, material: matte(PALETTE.plastic.red, ROUGH.plastic) },
      { name: 'sailsB', mesh: sailsB, material: matte(PALETTE.cream, ROUGH.plastic) },
    ],
    hub: [0, hubY, hubZ],
    sides: [-1, 1].map((s) => ({ x: s * (g / 2 + wall / 2), y: 0, hx: wall / 2, hy: D / 2 })),
    spring,
    gap: g,
    bladeLength: L,
    bladeThickness: t,
    bladeWidth: w,
  };
}

/**
 * Where a windmill's blades are, written as placement `i` of `out`: the
 * tower at (x, y) turned `yaw` about Z, and the blades turned `turn` about
 * the axle, anticlockwise as seen from in front. Every part of the blades
 * takes the same placement.
 */
export function placeBlades(out: Float32Array, i: number, x: number, y: number, yaw: number, turn: number, hub: V3) {
  const o = i * 16;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const c = Math.cos(turn),
    s = Math.sin(turn);
  // the blades' own X and Z turned about the axle, then everything about Z by the tower's yaw
  out.set(
    [
      cy * c,
      sy * c,
      s,
      0,
      -sy,
      cy,
      0,
      0,
      -cy * s,
      -sy * s,
      c,
      0,
      x + cy * hub[0] - sy * hub[1],
      y + sy * hub[0] + cy * hub[1],
      hub[2],
      1,
    ],
    o,
  );
}

/** How far below the grass water lies, and how wide its pale shallows are round the edge. */
export const WATER = { drop: 0.04, shallows: 0.4 } as const;

/**
 * A pond of `w` across X by `h` along Y, a hair below the grass, its origin
 * the middle of it at grass level: deep blue glossy water, pale shallows
 * round its edge, and a few ripple rings on it in `moving`, which the game
 * may pulse or leave be. The game leaves the grass out where the pond is.
 */
export function water(w: number, h: number, { seed = 1 } = {}): Model {
  const z = -WATER.drop;
  const sw = Math.min(WATER.shallows, w / 6, h / 6);
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const surface = built((b) =>
    face(b, [x0 + sw, y0 + sw, z], [x1 - sw, y0 + sw, z], [x1 - sw, y1 - sw, z], [x0 + sw, y1 - sw, z]),
  );
  const shallows = built((b) => frame(b, w, h, sw, z));
  const random = seeded(seed * 7919 + 13);
  const rings = Math.max(2, Math.min(6, Math.round((w * h) / 16)));
  const ripples = built((b) => {
    for (let k = 0; k < rings; k++) {
      const most = Math.min(1.1, w / 2 - sw - 0.15, h / 2 - sw - 0.15);
      const r = Math.max(0.25, most * (0.45 + random() * 0.55));
      const cx = (random() * 2 - 1) * (w / 2 - sw - r - 0.1),
        cy = (random() * 2 - 1) * (h / 2 - sw - r - 0.1);
      annulus(b, at(cx, cy, 0), 12, r - Math.min(0.1, r * 0.3), r, z + 0.012);
    }
  });
  return {
    name: 'water',
    parts: [
      { name: 'surface', mesh: surface, material: matte(PALETTE.water, ROUGH.water) },
      { name: 'shallows', mesh: shallows, material: matte(PALETTE.waterShallow, ROUGH.water) },
    ],
    moving: [{ name: 'ripples', mesh: ripples, material: matte(PALETTE.ripple, ROUGH.water) }],
  };
}

/** A flat frame facing up at height `z`, `width` wide inside a rectangle of `w` by `h` about the origin. */
function frame(b: MeshBuilder, w: number, h: number, width: number, z: number) {
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const [i0, j0, i1, j1] = [x0 + width, y0 + width, x1 - width, y1 - width];
  face(b, [x0, y0, z], [x1, y0, z], [i1, j0, z], [i0, j0, z]);
  face(b, [x1, y0, z], [x1, y1, z], [i1, j1, z], [i1, j0, z]);
  face(b, [x1, y1, z], [x0, y1, z], [i0, j1, z], [i1, j1, z]);
  face(b, [x0, y1, z], [x0, y0, z], [i0, j0, z], [i0, j1, z]);
}

/** The bunker's lip: how high it rises above the grass, and how wide it is. */
export const BUNKER = { lip: 0.1, lipWidth: 0.5 } as const;

/**
 * A bunker of `w` across X by `h` along Y, its origin the middle of it at
 * grass level: pale matte sand, speckled, flush with the grass, and a low
 * rounded lip round its edge that rises from the grass and falls to the
 * sand. The game leaves the grass out where the bunker is.
 */
export function bunker(w: number, h: number, { seed = 1 } = {}): Model {
  const lw = Math.min(BUNKER.lipWidth, w / 6, h / 6);
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const sand = built((b) =>
    face(b, [x0 + lw, y0 + lw, 0], [x1 - lw, y0 + lw, 0], [x1 - lw, y1 - lw, 0], [x0 + lw, y1 - lw, 0]),
  );
  const lip = built((b) => {
    const below: V3 = [0, 0, -100];
    // the rectangle `inset` in from the edge, at height `z`, a corner at a time
    const loop = (inset: number, z: number): V3[] => [
      [x0 + inset, y0 + inset, z],
      [x1 - inset, y0 + inset, z],
      [x1 - inset, y1 - inset, z],
      [x0 + inset, y1 - inset, z],
    ];
    const edge = loop(0, 0),
      crest = loop(lw / 2, BUNKER.lip),
      foot = loop(lw, 0);
    for (let k = 0; k < 4; k++) {
      const m = (k + 1) % 4;
      faceOut(b, [edge[k], edge[m], crest[m], crest[k]], below);
      faceOut(b, [crest[k], crest[m], foot[m], foot[k]], below);
    }
  });
  const grain = (s: number) => ({ kind: PATTERN.speckle, scale: 0.75, seed: s, second: PALETTE.sandGrain });
  return {
    name: 'bunker',
    parts: [
      { name: 'sand', mesh: sand, material: matte(PALETTE.sand, ROUGH.sand), pattern: grain((seed * 0.37) % 1) },
      { name: 'lip', mesh: lip, material: matte(PALETTE.sandLip, ROUGH.sand), pattern: grain((seed * 0.53) % 1) },
    ],
    moving: [],
  };
}

/**
 * A bed of sand over the tiles `cells`, each `tile` across, given as its
 * column and row from the bed's origin, which is the south-west corner of
 * tile (0, 0) at grass level. The sand lies flush with the grass over every
 * tile, and the bunker's lip rims only the edges where a tile meets one
 * that is not sand: a bunker of any shape is one bed, and not rectangles
 * pushed together with a lip across each join. Where a lip runs into sand
 * round an inside corner, its end is closed.
 */
export function sandBed(cells: readonly (readonly [number, number])[], tile: number, { seed = 1 } = {}): Model {
  const lw = Math.min(BUNKER.lipWidth, tile / 6);
  const has = new Set(cells.map(([c, r]) => `${c},${r}`));
  const sandAt = (c: number, r: number) => has.has(`${c},${r}`);
  const below: V3 = [0, 0, -100];
  const sandMesh = new MeshBuilder(),
    lipMesh = new MeshBuilder();
  for (const [c, r] of cells) {
    const x0 = c * tile,
      y0 = r * tile,
      x1 = x0 + tile,
      y1 = y0 + tile;
    // which sides meet grass, going round from the south as the corners do
    const lipped = [!sandAt(c, r - 1), !sandAt(c + 1, r), !sandAt(c, r + 1), !sandAt(c - 1, r)];
    const [inS, inE, inN, inW] = lipped.map((l) => (l ? lw : 0));
    // the tile's corners `f` of the way in from each side that has a lip, at height `z`
    const loop = (f: number, z: number): V3[] => [
      [x0 + f * inW, y0 + f * inS, z],
      [x1 - f * inE, y0 + f * inS, z],
      [x1 - f * inE, y1 - f * inN, z],
      [x0 + f * inW, y1 - f * inN, z],
    ];
    const [p0, p1, p2, p3] = loop(1, 0);
    face(sandMesh, p0, p1, p2, p3);
    const edge = loop(0, 0),
      crest = loop(0.5, BUNKER.lip),
      foot = loop(1, 0);
    // each side's neighbour along it, either way, in tile steps: the side before and the side after
    const along: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const out: [number, number][] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (let k = 0; k < 4; k++) {
      if (!lipped[k]) continue;
      const m = (k + 1) % 4;
      faceOut(lipMesh, [edge[k], edge[m], crest[m], crest[k]], below);
      faceOut(lipMesh, [crest[k], crest[m], foot[m], foot[k]], below);
      // at each end, open to more sand along it whose own side here has no lip: the lip stops, and its end is shown
      for (const [end, dir] of [
        [k, -1],
        [m, 1],
      ] as const) {
        const [ax, ay] = along[k];
        const nc = c + ax * dir,
          nr = r + ay * dir;
        const [ox, oy] = out[k];
        if (!sandAt(nc, nr) || !sandAt(nc + ox, nr + oy)) continue;
        const inside: V3 = [edge[end][0] - ax * dir, edge[end][1] - ay * dir, 0];
        faceOut(lipMesh, [edge[end], crest[end], foot[end]], inside);
      }
    }
  }
  const grain = (s: number) => ({ kind: PATTERN.speckle, scale: 0.75, seed: s, second: PALETTE.sandGrain });
  return {
    name: 'bunker',
    parts: [
      {
        name: 'sand',
        mesh: sandMesh.build(),
        material: matte(PALETTE.sand, ROUGH.sand),
        pattern: grain((seed * 0.37) % 1),
      },
      {
        name: 'lip',
        mesh: lipMesh.build(),
        material: matte(PALETTE.sandLip, ROUGH.sand),
        pattern: grain((seed * 0.53) % 1),
      },
    ],
    moving: [],
  };
}

/** A conveyor, with how far apart its chevrons are. */
export interface Conveyor extends Model {
  /** The chevrons repeat this far apart along Y: move them on by up to this much, and back, to run them. */
  spacing: number;
}

/**
 * A conveyor belt of `w` across X by `h` along Y, carrying toward +Y, its
 * origin the middle of it at grass level: a steel frame round a dark belt,
 * flush with the grass, and yellow chevrons on it pointing the way it
 * carries. The chevrons are in `moving`: to run them, the game moves them
 * along +Y by the belt's travel modulo `spacing`, and they stay on the belt.
 */
export function conveyor(w: number, h: number, { spacing = 2 } = {}): Conveyor {
  const fw = Math.min(0.3, w / 8, h / 8);
  const [x0, y0, x1, y1] = [-w / 2 + fw, -h / 2 + fw, w / 2 - fw, h / 2 - fw];
  const belt = built((b) => face(b, [x0, y0, 0.02], [x1, y0, 0.02], [x1, y1, 0.02], [x0, y1, 0.02]));
  const steel = built((b) => frame(b, w, h, fw, 0.03));
  // a belt too short for two chevrons at the spacing asked has them closer, so it always shows which way it runs
  spacing = Math.min(spacing, (y1 - y0 - 0.3) / 2);
  const cw = (x1 - x0) * 0.66,
    arm = Math.min(0.35, spacing * 0.2),
    point = Math.min(cw * 0.35, spacing * 0.4);
  const margin = 0.15;
  const chevrons = built((b) => {
    const z = 0.035;
    for (let y = y0 + margin; y + point + arm + spacing <= y1 - margin + 1e-9; y += spacing) {
      face(b, [-cw / 2, y, z], [0, y + point, z], [0, y + point + arm, z], [-cw / 2, y + arm, z]);
      face(b, [0, y + point, z], [cw / 2, y, z], [cw / 2, y + arm, z], [0, y + point + arm, z]);
    }
  });
  return {
    name: 'conveyor',
    parts: [
      { name: 'belt', mesh: belt, material: matte(PALETTE.belt, ROUGH.rubber) },
      { name: 'frame', mesh: steel, material: matte(PALETTE.steel, ROUGH.metal) },
    ],
    moving: [{ name: 'chevrons', mesh: chevrons, material: matte(PALETTE.plastic.yellow, ROUGH.plastic) }],
    spacing,
  };
}

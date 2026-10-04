/**
 * The obstacles, each drawn to exactly the size the physics gives it, since
 * the ball bouncing off a bumper a hair outside its drawn edge, or rolling
 * through the tip of a blade, is the first thing a player would notice. Each
 * takes the sizes that matter to play as arguments, and says in its comment
 * where its origin is and which way it faces. What turns or runs is a part
 * of its own, in `moving`, for the game to place each frame.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { WATER_LEVEL } from '../arena';
import { face } from '../meshes';
import { PALETTE, ROUGH } from './palette';
import { PATTERN, matte, type Colour, type Material, type Model, type Part, type V3 } from './part';
import { annulus, at, block, built, faceOut, facingSouth, frustum, roundedBox } from './shapes';

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

/**
 * How far below the grass water lies (the game's `WATER_LEVEL`, which its earth comes down to), and how wide the
 * foam at a pond's edge is and each of its two bands of shallows, at most.
 */
export const WATER = { drop: -WATER_LEVEL, foam: 0.16, band: 0.5 } as const;

/**
 * How a pond's surface ripples, on the renderer's own ripple pattern: `scale` is how many of the pattern's cells fit in a
 * unit (a tile is three units, so a cell is two), and `speed` how far the pattern travels east in a unit of game time, a
 * stroll across the pond. A stream is not given it: the pattern travels along the mesh's own +x, which is east, and a
 * stream may run any way, so a channel running north would ripple sideways. Its streaks already move along it.
 */
export const RIPPLE = { scale: 0.5, speed: 1.5 } as const;

/** A pond: a model, with the room on its water a ripple or a sparkle has, and how wide a ring may spread. */
export interface Pond extends Model {
  /** The half sizes, across X and along Y, of the water a ring or a sparkle may be on: in from the foam and the shallows. */
  free: { hx: number; hy: number };
  /** The widest a ring may spread, which fits in `free` and is never more than a unit and a tenth. */
  reach: number;
}

/**
 * A pond of `w` across X by `h` along Y, its origin the middle of it at grass level, its surface `WATER.drop` below
 * it, filling its tiles exactly: a rim of foam, two bands of shallows a step darker each, and the deep water veined
 * in a lighter blue and glossy. The ripples are in `moving`, one fat ring of unit size that the game places, as many
 * times as it likes, wherever and however wide and in whatever colour it likes on the water.
 */
export function water(w: number, h: number, _options: { seed?: number } = {}): Pond {
  const z = WATER_LEVEL;
  const { foam } = WATER;
  const band = Math.min(WATER.band, (w - 2 * foam) / 8, (h - 2 * foam) / 8);
  const sw = foam + 2 * band;
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  // a frame `width` wide, `from` in from the edge of the pond: the bands fit together with no gap and no overlap
  const framed = (from: number, width: number) => built((b) => frame(b, w - 2 * from, h - 2 * from, width, z));
  const surface = built((b) =>
    face(b, [x0 + sw, y0 + sw, z], [x1 - sw, y0 + sw, z], [x1 - sw, y1 - sw, z], [x0 + sw, y1 - sw, z]),
  );
  // a ring as wide as half its size: a band, not an outline
  const ring = built((b) => annulus(b, at(0, 0, 0), 24, 0.55, 1, 0));
  const free = { hx: w / 2 - foam - band, hy: h / 2 - foam - band };
  return {
    name: 'water',
    parts: [
      { name: 'foam', mesh: framed(0, foam), material: matte(PALETTE.waterFoam, ROUGH.water) },
      { name: 'shallows', mesh: framed(foam, band), material: matte(PALETTE.waterShallow, ROUGH.water) },
      { name: 'mid', mesh: framed(foam + band, band), material: matte(PALETTE.waterMid, ROUGH.water) },
      {
        name: 'surface',
        mesh: surface,
        material: matte(PALETTE.water, ROUGH.water),
        pattern: { kind: PATTERN.ripple, scale: RIPPLE.scale, seed: 0, speed: RIPPLE.speed, second: PALETTE.waterVein },
      },
    ],
    moving: [{ name: 'ring', mesh: ring, material: matte(PALETTE.ripple, ROUGH.water) }],
    free,
    reach: Math.min(1.1, free.hx, free.hy),
  };
}

/**
 * A bed over the tiles `cells`, each `tile` across, given as its column and row from the bed's origin, which is the
 * south-west corner of tile (0, 0): one flat sheet at height `z`, however the tiles are shaped, rimmed in `bands`
 * from the outside in, each a part of its own name and width, only along the sides where a tile meets a tile that is
 * not in the bed, mitred round the corners as a pond's frames are; and the last part filling everything inside the
 * rim. A lone tile is the rectangle model, band for band. What the pond and the stream share, and not rectangles
 * pushed together each with a rim of its own.
 */
function bed(
  cells: readonly (readonly [number, number])[],
  tile: number,
  z: number,
  bands: readonly { name: string; width: number; material: Material; pattern?: Part['pattern'] }[],
  inside: { name: string; material: Material; pattern?: Part['pattern'] },
): Model {
  const depth = bands.reduce((d, b) => d + b.width, 0);
  const has = new Set(cells.map(([c, r]) => `${c},${r}`));
  const inBed = (c: number, r: number) => has.has(`${c},${r}`);
  const meshes = bands.map(() => new MeshBuilder());
  const surface = new MeshBuilder();
  // each band's reach in from the edge, as a share of the whole rim's depth
  const reaches = [0];
  for (const b of bands) reaches.push(reaches[reaches.length - 1] + b.width / depth);
  for (const [c, r] of cells) {
    const x0 = c * tile,
      y0 = r * tile,
      x1 = x0 + tile,
      y1 = y0 + tile;
    // which sides meet what is not in the bed, going round from the south as the corners do
    const rimmed = [!inBed(c, r - 1), !inBed(c + 1, r), !inBed(c, r + 1), !inBed(c - 1, r)];
    const [inS, inE, inN, inW] = rimmed.map((e) => (e ? depth : 0));
    // the tile's corners `f` of the rim's depth in from each side that has a rim: a corner between two rimmed sides
    // moves in on both, so the bands are mitred there as a pond's frames are
    const loop = (f: number): V3[] => [
      [x0 + f * inW, y0 + f * inS, z],
      [x1 - f * inE, y0 + f * inS, z],
      [x1 - f * inE, y1 - f * inN, z],
      [x0 + f * inW, y1 - f * inN, z],
    ];
    for (let k = 0; k < 4; k++) {
      if (!rimmed[k]) continue;
      const m = (k + 1) % 4;
      for (let j = 0; j < bands.length; j++) {
        const outer = loop(reaches[j]),
          inner = loop(reaches[j + 1]);
        face(meshes[j], outer[k], outer[m], inner[m], inner[k]);
      }
    }
    const [a, b2, c2, d] = loop(1);
    face(surface, a, b2, c2, d);
  }
  return {
    name: inside.name,
    parts: [
      ...bands.map((b, j) => ({ name: b.name, mesh: meshes[j].build(), material: b.material, pattern: b.pattern })),
      { name: 'surface', mesh: surface.build(), material: inside.material, pattern: inside.pattern },
    ],
    moving: [],
  };
}

/**
 * A bed of water over the tiles `cells`, each `tile` across: the pond's bands, the foam, the shallows and the mid water,
 * only along the sides where a tile meets what is not water, and the deep veined water filling everything inside them,
 * so a channel between two ponds is one water and a pond of any shape has one edge. The surface lies at the game's
 * `WATER_LEVEL`, as a pond's does, and ripples (`RIPPLE`). The seed is still taken, since the scene hands one, but a
 * ripple has no seed to shift, as the marbling had.
 */
export function waterBed(
  cells: readonly (readonly [number, number])[],
  tile: number,
  _options: { seed?: number } = {},
): Model {
  const { foam } = WATER;
  const band = Math.min(WATER.band, (tile - 2 * foam) / 8);
  const water = (c: Colour) => matte(c, ROUGH.water);
  return {
    ...bed(
      cells,
      tile,
      WATER_LEVEL,
      [
        { name: 'foam', width: foam, material: water(PALETTE.waterFoam) },
        { name: 'shallows', width: band, material: water(PALETTE.waterShallow) },
        { name: 'mid', width: band, material: water(PALETTE.waterMid) },
      ],
      {
        name: 'water bed',
        material: water(PALETTE.water),
        pattern: { kind: PATTERN.ripple, scale: RIPPLE.scale, seed: 0, speed: RIPPLE.speed, second: PALETTE.waterVein },
      },
    ),
  };
}

/**
 * A bed of running water over the tiles `cells` of every belt drawn as water, each `tile` across: the stream's bank,
 * foam and shallows only along the sides where a tile meets what is not a stream, so belts that touch are one channel
 * and not a channel each with a gap of bank between. A hair above the grass, as a stream lies.
 */
export function streamBed(cells: readonly (readonly [number, number])[], tile: number, { seed = 1 } = {}): Model {
  const bank = Math.min(STREAM.bank, tile / 12);
  const foam = Math.min(STREAM.foam, tile / 10);
  const band = Math.min(STREAM.band, tile / 6);
  const water = (c: Colour) => matte(c, ROUGH.water);
  return bed(
    cells,
    tile,
    STREAM.lift,
    [
      { name: 'bank', width: bank, material: matte(STREAM_BANK, ROUGH.rubber) },
      { name: 'foam', width: foam, material: water(PALETTE.waterFoam) },
      { name: 'shallows', width: band, material: water(PALETTE.waterShallow) },
    ],
    {
      name: 'stream bed',
      material: water(PALETTE.water),
      pattern: { kind: PATTERN.marbling, scale: 0.5, seed: (seed * 0.29) % 1, second: PALETTE.waterVein },
    },
  );
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
export const BUNKER = { lip: 0.1, lipWidth: 0.5, stripe: 0.75 } as const;

/**
 * A bunker of `w` across X by `h` along Y, its origin the middle of it at grass level: a bed of tiles three across,
 * as the game's is, so it has the raked stripes, the speckled sand and the lip that the game's has. It is the
 * showcase's, and sizes that are not whole tiles are rounded to them.
 */
export function bunker(w: number, h: number, { seed = 1 } = {}): Model {
  const tile = 3;
  const [cols, rows] = [Math.max(1, Math.round(w / tile)), Math.max(1, Math.round(h / tile))];
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  const bed = sandBed(cells, tile, { seed });
  // the bed's origin is a corner of it: moved to its middle
  const shift = (mesh: Mesh): Mesh => {
    const positions = mesh.positions.slice();
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= (cols * tile) / 2;
      positions[i + 1] -= (rows * tile) / 2;
    }
    return { ...mesh, positions };
  };
  return { ...bed, parts: bed.parts.map((part) => ({ ...part, mesh: shift(part.mesh) })) };
}

/**
 * A bed of sand over the tiles `cells`, each `tile` across, given as its
 * column and row from the bed's origin, which is the south-west corner of
 * tile (0, 0) at grass level. The sand lies flush with the grass over every
 * tile, and the bunker's lip rims only the edges where a tile meets one
 * that is not sand: a bunker of any shape is one bed, and not rectangles
 * pushed together with a lip across each join. Where a lip runs into sand
 * round an inside corner, its end is closed. On ground that slopes, given
 * its `height` at each point of the bed's own, the sand lies on it and the
 * lip rides it, cut into `pieces` a side so it follows the curve.
 */
export function sandBed(
  cells: readonly (readonly [number, number])[],
  tile: number,
  {
    seed = 1,
    height = () => 0,
    pieces = 1,
  }: { seed?: number; height?: (x: number, y: number) => number; pieces?: number } = {},
): Model {
  const lw = Math.min(BUNKER.lipWidth, tile / 6);
  const has = new Set(cells.map(([c, r]) => `${c},${r}`));
  const sandAt = (c: number, r: number) => has.has(`${c},${r}`);
  const below: V3 = [0, 0, -100];
  // the sand in its two tones of stripe, and the lip in its two faces: the outside to the sun and the inside in its shade
  const sandMesh = new MeshBuilder(),
    rakedMesh = new MeshBuilder(),
    lipMesh = new MeshBuilder(),
    innerMesh = new MeshBuilder();
  // stripes are laid across the whole of the bed by where they are, a stripe wide each way from its origin, so they run
  // straight on from one tile to the next and are never the same tone as the one beside them
  const stripes = Math.max(1, Math.round(tile / BUNKER.stripe)),
    stripe = tile / stripes;
  // a point of the bed raised onto the ground under it, its own height above the ground kept
  const lift = (p: V3): V3 => [p[0], p[1], height(p[0], p[1]) + p[2]];
  // the point `s` of the way from one to another, across the ground
  const between = (a: V3, b: V3, s: number): V3 => [
    a[0] + (b[0] - a[0]) * s,
    a[1] + (b[1] - a[1]) * s,
    a[2] + (b[2] - a[2]) * s,
  ];
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
    const [p0, p1, , p3] = loop(1, 0);
    // each stripe of the tile, as far as the sand goes: in from the lip on the sides that have one, so the first and last
    // of a lipped tile are narrower than the rest, and run on under the lip as a raked bunker's do
    for (let j = 0; j < stripes; j++) {
      const yLo = Math.max(p0[1], y0 + j * stripe),
        yHi = Math.min(p3[1], y0 + (j + 1) * stripe);
      if (yHi - yLo < 1e-9) continue;
      const mesh = (r * stripes + j) % 2 ? rakedMesh : sandMesh;
      for (let i = 0; i < pieces; i++) {
        const [u0, u1] = [i / pieces, (i + 1) / pieces];
        const [xa, xb] = [p0[0] + (p1[0] - p0[0]) * u0, p0[0] + (p1[0] - p0[0]) * u1];
        face(mesh, lift([xa, yLo, 0]), lift([xb, yLo, 0]), lift([xb, yHi, 0]), lift([xa, yHi, 0]));
      }
    }
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
      for (let q = 0; q < pieces; q++) {
        const [s0, s1] = [q / pieces, (q + 1) / pieces];
        const [e0, e1] = [lift(between(edge[k], edge[m], s0)), lift(between(edge[k], edge[m], s1))];
        const [c0, c1] = [lift(between(crest[k], crest[m], s0)), lift(between(crest[k], crest[m], s1))];
        const [f0, f1] = [lift(between(foot[k], foot[m], s0)), lift(between(foot[k], foot[m], s1))];
        faceOut(lipMesh, [e0, e1, c1, c0], below);
        faceOut(innerMesh, [c0, c1, f1, f0], below);
      }
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
        const inside = lift([edge[end][0] - ax * dir, edge[end][1] - ay * dir, 0]);
        faceOut(lipMesh, [lift(edge[end]), lift(crest[end]), lift(foot[end])], inside);
      }
    }
  }
  // a fine grain, a shade darker than the sand, and not the rash of dark specks it was
  const grain = (s: number) => ({ kind: PATTERN.speckle, scale: 1.1, seed: s, second: PALETTE.sandGrain });
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
        name: 'raked',
        mesh: rakedMesh.build(),
        material: matte(PALETTE.sandRaked, ROUGH.sand),
        pattern: grain((seed * 0.41) % 1),
      },
      {
        name: 'lip',
        mesh: lipMesh.build(),
        material: matte(PALETTE.sandLip, ROUGH.sand),
        pattern: grain((seed * 0.53) % 1),
      },
      {
        name: 'lipInner',
        mesh: innerMesh.build(),
        material: matte(PALETTE.sandLipInner, ROUGH.sand),
        pattern: grain((seed * 0.59) % 1),
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

/**
 * A flipper: an arm of half extents `hy` and `hz` across and up and `length` long, rounded at every edge as the barrier is,
 * in the arcade's blue plastic, with a cream hub on top at the end it turns on. Its origin is the middle of that end, the
 * arm lies along +X from it, and it is centred up and down as the barrier is; the game turns it about that end by the
 * arm's yaw. The hub stands inside the arm's width and a hair over its top, so it is never wider than the box the physics
 * has, and seen from above it says where the arm turns.
 */
export function flipper(
  length: number,
  hy: number,
  hz: number,
  { colour = PALETTE.plastic.blue, hub = PALETTE.cream } = {},
): Model {
  const e = Math.min(0.22, 0.35 * Math.min(length / 2, hy, hz));
  const lift = 0.12;
  return {
    name: 'flipper',
    parts: [
      {
        name: 'arm',
        material: matte(colour, ROUGH.plastic),
        mesh: built((b) => roundedBox(b, at(length / 2, 0, 0), length / 2, hy, hz, e)),
      },
      {
        name: 'hub',
        material: matte(hub, ROUGH.plastic),
        mesh: built((b) => frustum(b, at(hy * 1.2, 0, 0), 12, hy * 0.7, hy * 0.6, hz - 0.02, hz + lift)),
      },
    ],
    moving: [],
  };
}

/** How a stream lies: a hair above the grass, level with it, the width of the foam at its edge and of its one band of shallows. */
export const STREAM = { lift: 0.03, bank: 0.1, foam: 0.1, band: 0.35 } as const;

/** The earth along a stream's edge: the colour the scene gives the sides of raised grass, which is what a bank is. */
const STREAM_BANK: Colour = [0.2, 0.3, 0.08];

/**
 * A stream of `w` across X by `h` along Y, its origin the middle of it at grass level: the pond's water in a channel the
 * belt's tiles make, level with the grass and not sunk into it (the ball is carried over the grass's own height, and a
 * channel with banks would need the ground to come down to it, which only water tiles have), with the pond's rim of
 * foam where it meets the grass, a band of shallows inside that, and deep water veined in a lighter blue along it. The
 * ripples are in `moving`, one long diamond of streak that the game carries down the stream.
 */
export function stream(w: number, h: number, { seed = 1 } = {}): Model {
  const z = STREAM.lift;
  const bank = Math.min(STREAM.bank, w / 12, h / 12);
  const foam = Math.min(STREAM.foam, w / 10, h / 10);
  const band = Math.min(STREAM.band, w / 6, h / 6);
  const sw = bank + foam + band;
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const framed = (from: number, width: number) => built((b) => frame(b, w - 2 * from, h - 2 * from, width, z));
  const surface = built((b) =>
    face(b, [x0 + sw, y0 + sw, z], [x1 - sw, y0 + sw, z], [x1 - sw, y1 - sw, z], [x0 + sw, y1 - sw, z]),
  );
  // a streak of light on the water: a long diamond, pointed along the stream, which is what a ripple is when it is carried
  const streak = built((b) => face(b, [0, -1, z], [0.25, 0, z], [0, 1, z], [-0.25, 0, z]));
  return {
    name: 'stream',
    parts: [
      { name: 'bank', mesh: framed(0, bank), material: matte(STREAM_BANK, ROUGH.rubber) },
      { name: 'foam', mesh: framed(bank, foam), material: matte(PALETTE.waterFoam, ROUGH.water) },
      { name: 'shallows', mesh: framed(bank + foam, band), material: matte(PALETTE.waterShallow, ROUGH.water) },
      {
        name: 'surface',
        mesh: surface,
        material: matte(PALETTE.water, ROUGH.water),
        pattern: { kind: PATTERN.marbling, scale: 0.5, seed: (seed * 0.29) % 1, second: PALETTE.waterVein },
      },
    ],
    moving: [{ name: 'streak', mesh: streak, material: matte(PALETTE.ripple, ROUGH.water) }],
  };
}

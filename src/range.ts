/**
 * The range: golf holes with nothing on them but the ground, as flat as a table and as plain as a driving range, in
 * the first course of golf. What they are for is the shot: every club of the bag is meant to be tried from a tee, a
 * fairway, the rough and a bunker, and to be seen to fly and land and roll out, before the holes that ask more of it
 * (hills, water, trees, out of bounds) are drawn. A unit is a yard, so a hole's length is what a golfer would call it.
 *
 * A hole is a tee's box at the south end, a fairway up the middle with rough either side of it, and a round green
 * round the cup at the far end, all inside a rail far enough off that a scattered drive does not reach it: the rail
 * is a wall to a ball in the air as well as on the ground, which is out of bounds until the holes have their own.
 *
 * Nine holes are here: the three that teach the clubs, as they always were, and six that each add one thing to be
 * played round (a bunker, a narrow fairway, a pond to carry, a wind, a dogleg and a hole too long for two shots).
 * They are the same flat, plain ground and the same box of rail as the three, from the same spec with a hazard or two
 * set on it by yards from the tee, so the three that were there are character for character what they were (their
 * maps are held to a hash) and the new ones are never drawn by hand.
 */
import type { HoleDef } from './course';
import { TILE } from './arena';
import { WIND } from './shaping';
import { GREENS } from './surfaces';

/**
 * A thing set on a hole of the range, by yards from the tee: a bunker or a pond, a disc of `radius` at `along` the way of
 * play and `across` it (positive to the right, as seen from the tee), or a tree, a tile of it, at `x` yards east of the
 * tee and `y` north (not along the way, since a tree is placed by where the map is and not by where the play goes).
 */
export type Hazard =
  { kind: 'sand' | 'water'; along: number; across: number; radius: number } | { kind: 'tree'; x: number; y: number };

/** A range hole: what it is called, its par and how far it is from the tee to the cup, in units. */
export interface RangeSpec {
  name: string;
  par: number;
  /** Along the way of play, which is the crow's flight for a straight hole and a little more for a bent one. */
  length: number;
  /** A bunker short of the green on the left, which the sand wedge is for. */
  bunker?: boolean;
  /** The fairway's width in tiles, an odd number so it lies about the middle; 13 where it is not said. */
  width?: number;
  /**
   * A way of play bent once, for the holes of the range that are not straight: how far the fairway turns at its corner, in
   * degrees (positive to the right, no more than `BEND.most` either way), and where the corner is, as a share of the way
   * from the tee (`CORNER.default` where it is not said, within `CORNER.least` to `CORNER.most`). None is straight.
   */
  bend?: number;
  corner?: number;
  /** Bunkers, ponds and trees, in the order they are drawn, a later one over an earlier. */
  hazards?: readonly Hazard[];
  /** The wind, in miles an hour, from nought to `WIND.most`: the hole's `wind`. Calm where it is not said. */
  wind?: number;
  /** How fast the greens run, from `GREENS.fast` to `GREENS.slow`: the hole's `greens`. Normal where it is not said. */
  greens?: number;
}

/** The most a way of play may bend, in degrees, and where its corner may be, as a share of the way. */
export const BEND = { most: 75 } as const;
export const CORNER = { least: 0.2, most: 0.8, default: 0.55 } as const;

/** The width of the fairway and of the rough beside it, in tiles, and the green's radius round the cup. */
const FAIRWAY_WIDTH = 13,
  ROUGH = 9,
  GREEN = 5.5;
/** How many rows of rough lie behind the tee and past the green. */
const BEHIND = 3,
  BEYOND = 9;

/** A hole drawn but not yet made: its map from the south up, and where its tee and cup are on it, in tiles. */
interface Drawing {
  grid: string[][];
  tee: [number, number];
  cup: [number, number];
  /** How far a tile is along the way from the tee, and across it to the right, in yards, for a hazard's disc. */
  frame: (c: number, r: number) => { along: number; across: number };
}

/** The old hole: a box of rail with the fairway and the green drawn in it, and the way of play straight up the middle. */
function straight(spec: RangeSpec, FAIRWAY: number): Drawing {
  const cols = 2 + 2 * ROUGH + FAIRWAY,
    middle = Math.floor(cols / 2);
  const teeRow = BEHIND,
    cupRow = teeRow + Math.round(spec.length / TILE),
    rows = cupRow + BEYOND + 1;
  // rows from the south, so the tee's is small, and turned over when the map is written
  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ? '#' : 'r')),
  );
  for (let r = teeRow + 2; r <= cupRow; r++)
    for (let c = middle - (FAIRWAY - 1) / 2; c <= middle + (FAIRWAY - 1) / 2; c++) grid[r][c] = 'f';
  for (let r = 1; r < rows - 1; r++)
    for (let c = 1; c < cols - 1; c++) if (Math.hypot(c - middle, r - cupRow) < GREEN) grid[r][c] = 'g';
  if (spec.bunker)
    for (let r = cupRow - 4; r <= cupRow - 2; r++) for (let c = middle - 8; c <= middle - 5; c++) grid[r][c] = 's';
  return {
    grid,
    tee: [middle, teeRow],
    cup: [middle, cupRow],
    frame: (c, r) => ({ along: (r - teeRow) * TILE, across: (c - middle) * TILE }),
  };
}

/**
 * A bent hole: two straight legs, the first up the map from the tee to the corner and the second turned right by `bend`
 * degrees to the cup, ringed with rail by the tile, with the fairway along both and the rough `ROUGH` tiles either side.
 * A tile is the way of play's nearest leg's: how far along it and how far to one side, which is where a hazard is told.
 */
function bent(spec: RangeSpec, FAIRWAY: number, bend: number, corner: number): Drawing {
  const L = Math.round(spec.length / TILE),
    turn = (bend * Math.PI) / 180;
  const pts: [number, number][] = [
    [0, 0],
    [0, corner * L],
    [Math.sin(turn) * (1 - corner) * L, corner * L + Math.cos(turn) * (1 - corner) * L],
  ];
  const legs = [0, 1].map((k) => {
    const [ax, ay] = pts[k],
      [bx, by] = pts[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    return { ax, ay, ux: (bx - ax) / len, uy: (by - ay) / len, len };
  });
  const total = legs[0].len + legs[1].len;
  const half = (FAIRWAY - 1) / 2,
    edge = half + ROUGH;
  // where a place is: along the way (negative behind the tee) and across it (positive to the right) of the nearest leg
  // whose length it falls within, or of the corner's own wedge on the outside of the bend, round it
  const frame = (x: number, y: number) => {
    let best = { s: 0, o: 0, d: Infinity };
    let run = 0;
    legs.forEach((leg, k) => {
      const dx = x - leg.ax,
        dy = y - leg.ay;
      const u = dx * leg.ux + dy * leg.uy,
        o = dx * leg.uy - dy * leg.ux;
      const lo = k === 0 ? -(BEHIND - 1) : 0,
        hi = leg.len + (k === 1 ? BEYOND - 1 : 0);
      if (u >= lo && u <= hi && Math.abs(o) < best.d) best = { s: run + u, o, d: Math.abs(o) };
      run += leg.len;
    });
    if (best.d === Infinity) {
      const dx = x - pts[1][0],
        dy = y - pts[1][1];
      best = { s: legs[0].len, o: dx * legs[1].uy - dy * legs[1].ux, d: Math.hypot(dx, dy) };
    }
    return best;
  };
  const room = Math.ceil(edge) + 3;
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const minX = Math.floor(Math.min(...xs)) - room,
    minY = Math.floor(Math.min(...ys)) - room - BEHIND;
  const cols = Math.ceil(Math.max(...xs)) - minX + room + 1,
    rows = Math.ceil(Math.max(...ys)) - minY + room + BEYOND + 1;
  const where = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => frame(c + minX, r + minY)),
  );
  const inside = (c: number, r: number) => r >= 0 && c >= 0 && r < rows && c < cols && where[r][c].d <= edge;
  const grid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (inside(c, r)) return where[r][c].d <= half && where[r][c].s >= 2 && where[r][c].s <= total ? 'f' : 'r';
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inside(c + dc, r + dr)) return '#';
      return ' ';
    }),
  );
  const tee: [number, number] = [Math.round(-minX), Math.round(-minY)],
    cup: [number, number] = [Math.round(pts[2][0] - minX), Math.round(pts[2][1] - minY)];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (inside(c, r) && Math.hypot(c - cup[0], r - cup[1]) < GREEN) grid[r][c] = 'g';
  return { grid, tee, cup, frame: (c, r) => ({ along: where[r][c].s * TILE, across: where[r][c].o * TILE }) };
}

/** Sets a hazard on a drawing, refusing by the hole's name one that cannot stand where it is put. */
function set(name: string, d: Drawing, hazard: Hazard) {
  const { grid, tee, cup } = d;
  const free = (c: number, r: number) =>
    r >= 0 && r < grid.length && c >= 0 && c < grid[r].length && grid[r][c] !== '#' && grid[r][c] !== ' ';
  const inTeeBox = (c: number, r: number) => Math.abs(c - tee[0]) <= 1 && Math.abs(r - tee[1]) <= 1;
  if (hazard.kind === 'tree') {
    if (!Number.isFinite(hazard.x) || !Number.isFinite(hazard.y))
      throw new Error(`${name}: a tree is placed by two numbers, not ${hazard.x} and ${hazard.y}`);
    const c = tee[0] + Math.round(hazard.x / TILE),
      r = tee[1] + Math.round(hazard.y / TILE);
    if (!free(c, r)) throw new Error(`${name}: the tree at (${hazard.x}, ${hazard.y}) is not on the course`);
    if (inTeeBox(c, r)) throw new Error(`${name}: the tree at (${hazard.x}, ${hazard.y}) is in the tee's box`);
    if (grid[r][c] !== 'f' && grid[r][c] !== 'r')
      throw new Error(`${name}: the tree at (${hazard.x}, ${hazard.y}) is not on fairway or rough, but ${grid[r][c]}`);
    grid[r][c] = '^';
    return;
  }
  const { along, across, radius } = hazard;
  if (![along, across, radius].every(Number.isFinite) || radius <= 0)
    throw new Error(
      `${name}: a ${hazard.kind} has a place and a radius above nought, not ${along}, ${across}, ${radius}`,
    );
  const tiles: [number, number][] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) {
      const f = d.frame(c, r);
      if (free(c, r) && Math.hypot(f.along - along, f.across - across) <= radius) tiles.push([c, r]);
    }
  if (tiles.length === 0)
    throw new Error(`${name}: the ${hazard.kind} at ${along} along and ${across} across is not on the course`);
  for (const [c, r] of tiles) {
    if (inTeeBox(c, r)) throw new Error(`${name}: the ${hazard.kind} at ${along} along would cover the tee's box`);
    if (c === cup[0] && r === cup[1])
      throw new Error(`${name}: the ${hazard.kind} at ${along} along would cover the cup`);
  }
  for (const [c, r] of tiles) grid[r][c] = hazard.kind === 'sand' ? 's' : '~';
}

/** A hole of the range from its spec: its map, from the far end down, with nothing on it but its ground and what it is given. */
export function rangeHole(spec: RangeSpec): HoleDef {
  const FAIRWAY = spec.width ?? FAIRWAY_WIDTH;
  if (!Number.isInteger(FAIRWAY) || FAIRWAY < 3 || FAIRWAY % 2 === 0)
    throw new Error(`${spec.name}: a fairway is an odd number of tiles across, three or more, not ${FAIRWAY}`);
  const bend = spec.bend ?? 0,
    corner = spec.corner ?? CORNER.default;
  if (!Number.isFinite(bend) || Math.abs(bend) > BEND.most)
    throw new Error(`${spec.name}: a bend is within ${BEND.most} degrees either way, not ${bend}`);
  if (!Number.isFinite(corner) || corner < CORNER.least || corner > CORNER.most)
    throw new Error(`${spec.name}: a corner is ${CORNER.least} to ${CORNER.most} of the way, not ${corner}`);
  if (spec.wind !== undefined && !(Number.isFinite(spec.wind) && spec.wind >= 0 && spec.wind <= WIND.most))
    throw new Error(`${spec.name}: a wind is from nought to ${WIND.most} miles an hour, not ${spec.wind}`);
  if (
    spec.greens !== undefined &&
    !(Number.isFinite(spec.greens) && spec.greens >= GREENS.fast && spec.greens <= GREENS.slow)
  )
    throw new Error(`${spec.name}: the greens run from ${GREENS.fast} to ${GREENS.slow}, not ${spec.greens}`);
  if (bend !== 0 && spec.bunker) throw new Error(`${spec.name}: the bunker short of the green is for a straight hole`);
  const d = bend === 0 ? straight(spec, FAIRWAY) : bent(spec, FAIRWAY, bend, corner);
  for (const hazard of spec.hazards ?? []) set(spec.name, d, hazard);
  const { grid, tee, cup } = d;
  for (let r = tee[1] - 1; r <= tee[1] + 1; r++) for (let c = tee[0] - 1; c <= tee[0] + 1; c++) grid[r][c] = 't';
  grid[tee[1]][tee[0]] = 'T';
  grid[cup[1]][cup[0]] = 'C';
  // a bent hole is drawn in a box of its own that is mostly rock: only what has ground or rail on it is kept
  let first = grid.length,
    last = -1,
    left = grid[0].length,
    right = -1;
  grid.forEach((row, r) =>
    row.forEach((ch, c) => {
      if (ch === ' ') return;
      first = Math.min(first, r);
      last = Math.max(last, r);
      left = Math.min(left, c);
      right = Math.max(right, c);
    }),
  );
  const map = grid
    .slice(first, last + 1)
    .map((row) => row.slice(left, right + 1).join(''))
    .reverse();
  return {
    name: spec.name,
    par: spec.par,
    map,
    ...(spec.wind !== undefined ? { wind: spec.wind } : {}),
    ...(spec.greens !== undefined ? { greens: spec.greens } : {}),
  };
}

/**
 * The holes of the range: a pitch a wedge reaches, a long iron's par three, and a par four that wants a drive, and then
 * the six that each ask for one thing more, by yards from the tee. They go after the three and never among them, since a
 * hole's place in the course and its name are what a save and a seed know it by.
 */
export const SPECS: readonly RangeSpec[] = [
  { name: 'Pitch and Putt', par: 3, length: 105 },
  { name: 'Iron Alley', par: 3, length: 175, bunker: true },
  { name: 'The Long Way', par: 4, length: 330, bunker: true },
  // the bunker: three of them round the green, the one a ball is played out of
  {
    name: 'Sand Trap',
    par: 3,
    length: 135,
    hazards: [
      { kind: 'sand', along: 114, across: -9, radius: 7 },
      { kind: 'sand', along: 142, across: 15, radius: 7 },
      { kind: 'sand', along: 135, across: -19, radius: 6 },
    ],
  },
  // the rough: a fairway seven tiles across with a bunker either side of where a drive comes down
  {
    name: 'Narrow Straits',
    par: 4,
    length: 315,
    width: 7,
    hazards: [
      { kind: 'sand', along: 238, across: -13, radius: 7 },
      { kind: 'sand', along: 252, across: 13, radius: 7 },
    ],
  },
  // the carry: a pond across the line that a club must clear
  { name: 'Over the Pond', par: 3, length: 150, hazards: [{ kind: 'water', along: 104, across: -3, radius: 15 }] },
  // the wind: eight miles an hour, from the hole's name, with a pond and a bunker to be blown into
  {
    name: 'Gusty',
    par: 3,
    length: 165,
    wind: 8,
    hazards: [
      { kind: 'water', along: 160, across: 24, radius: 9 },
      { kind: 'sand', along: 146, across: -16, radius: 6 },
    ],
  },
  // the dogleg: lay up short of the corner, or cut it over six trees
  {
    name: 'The Corner',
    par: 4,
    length: 345,
    bend: 35,
    corner: 0.55,
    hazards: [
      { kind: 'tree', x: 12, y: 170 },
      { kind: 'tree', x: 18, y: 180 },
      { kind: 'tree', x: 24, y: 190 },
      { kind: 'tree', x: 30, y: 200 },
      { kind: 'tree', x: 14, y: 195 },
      { kind: 'tree', x: 22, y: 210 },
    ],
  },
  // three shots: a par five on quick greens, with a bunker either side of the second and a pond and a bunker at the green
  {
    name: 'The Long Road',
    par: 5,
    length: 600,
    greens: 12.5,
    hazards: [
      { kind: 'sand', along: 270, across: -13, radius: 7 },
      { kind: 'sand', along: 300, across: 14, radius: 7 },
      { kind: 'water', along: 572, across: 14, radius: 9 },
      { kind: 'sand', along: 580, across: -17, radius: 6 },
    ],
  },
];

export const RANGE: readonly HoleDef[] = SPECS.map(rangeHole);
